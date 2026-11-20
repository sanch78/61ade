<?php
declare(strict_types=1);
namespace Blade\Feature;

/**
 * A validated list read for a ListProvider: the same rules as an SQL list (ListRules::normalise). `conditions` are the
 * filters and the scope, `{field, value, match}`: match `exact` (a select, checkbox or number filter, or a scope) or
 * `contains` (a case-insensitive substring of a text filter); a null value matches none, as in SQL. `search` (trimmed, '' for none) matches when one of
 * `searchFields` contains it. `sort` is `{field, direction}`; field `id` is the key. The window is `offset` and `limit`.
 * matches(), compare() and apply() implement these rules over plain rows, as 61ade does for a closure's rows.
 */
final readonly class ListQuery
{
    /** $key: the key field; $numeric: the number fields (compared and sorted as numbers). */
    public function __construct(public array $conditions, public string $search, public array $searchFields, public array $sort, public int $offset, public int $limit, private string $key, private array $numeric = []) {}

    /** A row value as the filters see it: null as '', a boolean as '1' or '0'. */
    public static function text(mixed $value): string
    {
        return is_bool($value) ? ($value ? '1' : '0') : (is_scalar($value) ? (string) $value : '');
    }
    public function matches(array $row): bool
    {
        foreach ($this->conditions as $condition) {
            // As in SQL, an empty (null) value matches no condition, not even an empty one.
            if (($row[$condition['field']] ?? null) === null) return false;
            $value = self::text($row[$condition['field']]);
            $ok = $condition['match'] === 'contains' ? mb_stripos($value, $condition['value']) !== false
                : (in_array($condition['field'], $this->numeric, true) && is_numeric($value) ? (float) $value === (float) $condition['value'] : $value === $condition['value']);
            if (!$ok) return false;
        }
        if ($this->search === '') return true;
        foreach ($this->searchFields as $field) if (($row[$field] ?? null) !== null && mb_stripos(self::text($row[$field]), $this->search) !== false) return true;
        return false;
    }
    /**
     * The sort order of two rows, as an SQL list orders them: by the sort field (numbers as numbers, text without case),
     * empty (null) values last in both directions, then by the key in the same direction.
     */
    public function compare(array $a, array $b): int
    {
        return $this->order($this->edge($a), $this->edge($b));
    }
    /** The rows that match, sorted. */
    public function apply(array $rows): array
    {
        $rows = array_values(array_filter($rows, $this->matches(...)));
        usort($rows, $this->compare(...));
        return $rows;
    }
    /** `{edge, value}` of a row: its key and its sort value (the key when sorted by `id`). */
    public function edge(array $row): array
    {
        $key = self::text($row[$this->key] ?? null);
        $value = $this->sort['field'] === 'id' ? $key : ($row[$this->sort['field']] ?? null);
        return ['edge' => $key, 'value' => is_bool($value) ? self::text($value) : $value];
    }
    /** The order of two `{edge, value}` positions (rows or cursor boundaries). */
    public function order(array $a, array $b): int
    {
        $direction = $this->sort['direction'] === 'asc' ? 1 : -1;
        if ($this->sort['field'] !== 'id') {
            $an = ($a['value'] ?? null) === null; $bn = ($b['value'] ?? null) === null;
            if ($an !== $bn) return $an ? 1 : -1;
            if (!$an) {
                $numeric = in_array($this->sort['field'], $this->numeric, true);
                $result = $numeric ? ((float) $a['value'] <=> (float) $b['value']) : strcmp(mb_strtolower(self::text($a['value'])), mb_strtolower(self::text($b['value'])));
                if ($result !== 0) return $result * $direction;
            }
        }
        // A total order: digit-only keys first, numerically (by length, then digits), then the other keys as strings.
        $x = (string) $a['edge']; $y = (string) $b['edge']; $dx = ctype_digit($x); $dy = ctype_digit($y);
        $result = $dx !== $dy ? ($dx ? -1 : 1) : ($dx ? (strlen($x) <=> strlen($y) ?: strcmp($x, $y)) : strcmp($x, $y));
        return ($result <=> 0) * $direction;
    }
}
