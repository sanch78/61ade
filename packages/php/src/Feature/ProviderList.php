<?php
declare(strict_types=1);
namespace Blade\Feature;

/**
 * The list source of a ProviderResource (docs/workspaces.md#provider-lists): a ListReader over a consumer's rows that
 * reads, filters, sorts, numbers and pages like an SQL ListSource (the same ListRules validation and cursor format).
 *
 * A closure `fn(Context): list<array>` (or `{rows, notice?}`) gives every row: 61ade keeps those the actor may list
 * (the object ACL of each row: an `all` or `id` scope, any deny), filters, sorts and windows them by key and sort value
 * like a keyset cursor, and counts them. A ListProvider answers one window by offset; it scopes its rows itself, and
 * an actor whose list permission is limited to some records is refused (403). Neither counts records for another list
 * (count fields, a parent's sub-view count): countBy and countMatching answer null.
 */
final readonly class ProviderList implements ListReader
{
    use ListRules;
    public ?array $order;
    /** Count fields: none (ListRules::counted). */
    private array $counts;
    private array $fields;

    public function __construct(private string $resource, private string $key, array $fields, private ListProvider|\Closure $rows, private \Closure $project, private array $search = [], private ?Registry $registry = null)
    {
        $this->fields = array_values($fields);
        $this->order = null;
        $this->counts = [];
        $known = array_column($this->fields, null, 'name');
        if (!array_is_list($search) || count($search) > 20 || count(array_unique($search)) !== count($search)) throw new \InvalidArgumentException('Invalid list search declaration.');
        foreach ($search as $name) { $field = is_string($name) ? ($known[$name] ?? null) : null; if (!$field || $field->secret || $field->scopeOnly || !in_array($field->type, ['text', 'textarea'], true) || $field->media() !== null) throw new \InvalidArgumentException('Invalid list search declaration.'); }
    }

    public function read(Context $ctx, array $input): array
    {
        $q = $this->normalise($ctx, $input);
        $limit = $q['limit']; $position = $q['position']; $previous = $q['direction'] === 'previous';
        $notice = null;
        $rules = array_filter($ctx->acl->rules($ctx->actor->id, $this->resource, 'list', $ctx->channel), static fn($r) => $r['field_name'] === '');
        // Without a list allow nothing is listed, as an SQL list's scope lists nothing.
        if (!array_filter($rules, static fn($r) => $r['effect'] === 'allow')) return ['total' => 0, 'matched' => 0, 'items' => [], 'previous' => null, 'next' => null];
        if ($this->rows instanceof ListProvider) {
            if (array_filter($rules, static fn($r) => $r['effect'] !== 'allow') || !array_filter($rules, static fn($r) => $r['scope'] === 'all')) throw new Failure('Nincs hozzáférés.', 403);
            $at = $position === null ? 0 : $position['offset'] ?? null;
            // A windowed watch window needs its anchor cursor (the offset); `first` alone, as an `id` sort allows, is not enough.
            if (!is_int($at) || $at < 0 || $at > 1_000_000_000) throw new Failure('Hibás kurzor.');
            // A cursor's record lies outside the next window; a watch window starts at its record.
            if ($previous) { $start = max(0, $at - $limit); $size = $at - $start; }
            else { $start = $position === null || $q['inclusive'] ? $at : $at + 1; $size = $limit; }
            $page = $this->rows->rows($ctx, $this->query($q, $start, $size));
            if (!is_array($page) || !is_array($page['rows'] ?? null) || !array_is_list($page['rows']) || count($page['rows']) > $size || !is_int($page['total'] ?? null) || !is_int($page['matched'] ?? null) || $page['total'] < 0 || $page['matched'] < 0)
                throw new \LogicException("The list provider of {$this->resource} answers {rows, total, matched} within the window.");
            $window = $this->checked($page['rows']); $total = $page['total']; $matched = $page['matched'];
            $notice = $this->notice($page['notice'] ?? null);
        } else {
            [$all, $notice] = $this->all($ctx);
            $all = array_values(array_filter($all, fn($row) => $ctx->acl->allows($ctx->actor->id, $this->resource, 'list', $ctx->channel, ListQuery::text($row[$this->key]), null)));
            $query = $this->query($q, 0, $limit);
            $rows = $query->apply($all);
            $total = count($all); $matched = count($rows);
            // The rows before the boundary (a keyset cursor: the boundary record itself may be gone).
            $before = $position === null ? 0 : count(array_filter($rows, fn($row) => ($order = $query->order($query->edge($row), $position)) < 0 || ($order === 0 && !$q['inclusive'] && !$previous)));
            if ($previous) { $start = max(0, $before - $limit); $size = $before - $start; }
            else { $start = $before; $size = $limit; }
            $window = array_slice($rows, $start, $size);
        }
        $query ??= $this->query($q, $start, $size);
        $items = $this->counted($ctx, $this->subviews($ctx, $this->media($ctx, array_map(fn($row) => ($this->project)($ctx, $row), $window))));
        $positions = array_map(fn($row, $index) => [...$query->edge($row), 'sort' => $q['sort'], ...($this->rows instanceof ListProvider ? ['offset' => $start + $index] : [])], $window, array_keys($window));
        $out = ['total' => $total, 'matched' => $matched,
            'items' => array_map(static fn($item, $position, $index) => [...$item, '_position' => $position, ...($q['numbered'] ? ['_number' => $start + $index + 1] : [])], $items, $positions, array_keys($items)),
            'previous' => $window && $start > 0 ? $this->cursor($positions[0], 'previous') : null,
            'next' => $window && $start + count($window) < $matched ? $this->cursor($positions[count($positions) - 1], 'next') : null];
        return $notice ? [...$out, 'notice' => $notice] : $out;
    }
    /** The row with key $key as the source gives it (no ACL decision: the `get` action makes that), or null. */
    public function find(Context $ctx, string $key): ?array
    {
        if ($this->rows instanceof ListProvider) {
            $row = $this->rows->row($ctx, $key);
            return $row !== null && ListQuery::text($this->checked([$row])[0][$this->key]) === $key ? $row : null;
        }
        foreach ($this->all($ctx)[0] as $row) if (ListQuery::text($row[$this->key]) === $key) return $row;
        return null;
    }
    /** [rows, notice] of the closure form: a list of rows, or `{rows, notice?}`. */
    private function all(Context $ctx): array
    {
        $all = ($this->rows)($ctx); $notice = null;
        if (is_array($all) && !array_is_list($all)) { $notice = $this->notice($all['notice'] ?? null); $all = $all['rows'] ?? null; }
        if (!is_array($all) || !array_is_list($all)) throw new \LogicException("The rows of {$this->resource} are a list of rows.");
        return [$this->checked($all), $notice];
    }
    /** A provider list counts no records for another list. */
    public function countBy(Context $ctx, string $field, array $values): ?array { return null; }
    public function countMatching(Context $ctx, array $match, array $values, array $filters): ?array { return null; }
    /** The rows of $rows with a valid, unique key (a developer error otherwise). */
    public function checked(array $rows): array
    {
        $seen = [];
        foreach ($rows as $row) {
            $key = is_array($row) ? ($row[$this->key] ?? null) : null;
            $key = is_int($key) || is_string($key) ? (string) $key : null;
            if ($key === null || !preg_match('/^[a-zA-Z0-9_.:-]{1,100}$/D', $key) || isset($seen[$key])) throw new \LogicException("Every row of {$this->resource} has a unique key `{$this->key}` of 1–100 letters, digits, _ . : or -.");
            $seen[$key] = true;
        }
        return $rows;
    }
    /**
     * A view-level notice of the rows (docs/workspaces.md#provider-lists): `{text, tone}`, plain text of at most 300
     * characters, tone `info` (default), `warning` or `danger`; null for none.
     */
    private function notice(mixed $notice): ?array
    {
        if ($notice === null) return null;
        $text = is_array($notice) ? ($notice['text'] ?? null) : null; $tone = is_array($notice) ? ($notice['tone'] ?? 'info') : null;
        if (!is_string($text) || trim($text) === '' || mb_strlen($text) > 300 || preg_match('//u', $text) !== 1 || preg_match('/[\x00-\x1f\x7f]/', $text) || !in_array($tone, ['info', 'warning', 'danger'], true) || array_diff(array_keys($notice), ['text', 'tone']))
            throw new \LogicException("The notice of {$this->resource} is {text, tone}: plain text of at most 300 characters, tone info, warning or danger.");
        return ['text' => $text, 'tone' => $tone];
    }
    private function query(array $q, int $offset, int $limit): ListQuery
    {
        return new ListQuery($q['conditions'], $q['search'], $q['searchFields'], $q['sort'], $offset, $limit, $this->key,
            array_values(array_map(static fn($field) => $field->name, array_filter($this->fields, static fn($field) => $field->type === 'number'))));
    }
}
