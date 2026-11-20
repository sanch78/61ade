<?php
declare(strict_types=1);
namespace Blade\Feature;

/**
 * A read-only list resource over a consumer's rows instead of an SQL table (docs/workspaces.md#provider-lists): live
 * reports, manifests, inventories joined from several sources, an API. $rows is a ListProvider (one window per read)
 * or a closure `fn(Context): list<array>` (or `{rows, notice?}`) giving every row, which 61ade filters, sorts, windows
 * and counts. $key names the row field that identifies a row (its `id`: 1–100 letters, digits, `_ . : -`).
 *
 * register() declares `list` and `get` (registered actions, checked on the server like every other) and the list view
 * with the same options as SqlResource::register. The declared fields carry the normal metadata (types, `select`
 * options, `column.tones`, `column.details`, sections, `column.placement`), so the standard list, its filters, sort,
 * search, counts, cards, record details and record views work unchanged. Writes are the consumer's own declared actions
 * on the resource (target() resolves a row for them). Not supported: count fields, a count as a parent's sub-view
 * child, editable columns, secret, password and file fields, manual order and tenant columns.
 */
final class ProviderResource
{
    private ?Registry $registry = null;
    private ?ProviderList $source = null;

    public function __construct(private string $resource, private string $key, private array $fields, private ListProvider|\Closure $rows, private array $search = [])
    {
        if (!preg_match('/^[a-zA-Z_][a-zA-Z0-9_]*$/D', $key)) throw new \InvalidArgumentException('Invalid provider key field.');
        foreach ($fields as $field) {
            // `id` (unless it is the key), `revision` and `_…` are the projection's own keys.
            if ($field instanceof Field && (($field->name === 'id' && $key !== 'id') || $field->name === 'revision' || str_starts_with($field->name, '_'))) throw new \InvalidArgumentException('Reserved provider field name: '.$field->name);
            if (!$field instanceof Field || $field->secret || $field->type === 'password' || $field->file !== null || $field->stored() || ($field->column['editable'] ?? false)) throw new \InvalidArgumentException('Invalid provider field: '.($field instanceof Field ? $field->name : '?'));
        }
        if (count(array_unique(array_map(static fn($field) => $field->name, $fields))) !== count($fields)) throw new \InvalidArgumentException('Duplicate provider field.');
    }

    /** Declares the fields, `list`, `get` and the list view (Registry::view options as in SqlResource::register). */
    public function register(Registry $registry, string $title, ?string $group = null, ?ViewLayout $layout = null, bool $selection = false, bool $rowSelection = false, ?int $rowHeight = null, ?int $tileMinWidth = null, bool $tiles = false, string|array|null $activate = null, ?string $id = null, array $commands = [], ?string $guide = null, bool $menu = true, ?array $sort = null, ?array $attention = null, ?array $modes = null, ?int $cardColumns = null, ?\Closure $available = null, ?array $emphasis = null, ?string $icon = null): View
    {
        $this->registry = $registry;
        $registry->registerFields($this->resource, $this->fields);
        $source = $this->source = new ProviderList($this->resource, $this->key, $this->fields, $this->rows, fn(Context $c, array $row) => $this->project($c, $row, 'list'), $this->search, $registry);
        $registry->add(new Action($this->resource, 'list', 'Lista', [], fn(Context $c, $t, $values) => ($t['id'] ?? '') === '' ? $source->read($c, $values) : throw new Failure('Hibás lapozás.'), collection: true, listSource: $source));
        $registry->add(new Action($this->resource, 'get', 'Megnyitás', [], fn(Context $c, $t) => $source->media($c, [$this->project($c, $t['row'], 'get')])[0], resolve: fn($c, $id) => $this->target($c, $id)));
        $columns = array_values(array_map(static fn($f) => ['id' => $f->name, 'header' => $f->label], array_filter($this->fields, static fn($f) => !$f->scopeOnly)));
        return $registry->view($this->resource, $title, $columns, ['get'], group: $group, layout: $layout, selection: $selection, rowSelection: $rowSelection, rowHeight: $rowHeight, tileMinWidth: $tileMinWidth, tiles: $tiles, activate: $activate, id: $id, commands: $commands, guide: $guide, menu: $menu, sort: $sort, attention: $attention, modes: $modes, cardColumns: $cardColumns, icon: $icon, available: $available, emphasis: $emphasis);
    }
    /** The executor target of the row with key $id (`{id, owner: null, row}`), for `get` and the consumer's own actions; 404 without one. */
    public function target(Context $ctx, ?string $id): array
    {
        if ($id === null || !preg_match('/^[a-zA-Z0-9_.:-]{1,100}$/D', $id)) throw new Failure('Hiányzó objektum.', 404);
        $row = ($this->source ?? throw new \LogicException('Register the provider resource first.'))->find($ctx, $id) ?? throw new Failure('Nem található objektum.', 404);
        return ['id' => $id, 'owner' => null, 'row' => $row];
    }
    /**
     * A row as the browser gets it: `id`, `revision` (a hash of the values it shows), the declared fields the field ACL of
     * $action lets through, and `_actions` (the resource's actions the actor may run on it). Values are scalars or null;
     * a boolean becomes '1' or '0'.
     */
    public function project(Context $ctx, array $row, string $action): array
    {
        $id = ListQuery::text($row[$this->key] ?? null);
        $values = [];
        foreach ($this->fields as $field) {
            $value = $row[$field->name] ?? null;
            if ($value !== null && !is_scalar($value)) throw new \LogicException("The value of {$this->resource}.{$field->name} is a scalar or null.");
            $values[$field->name] = is_bool($value) ? ListQuery::text($value) : $value;
        }
        $visible = [];
        foreach ($this->fields as $field) if ($ctx->acl->fieldAllowed($ctx->actor->id, $this->resource, $action, $ctx->channel, $id, null, $field->name)) $visible[$field->name] = $values[$field->name];
        // The revision hashes only what the actor may read, so it reveals no hidden value.
        $out = ['id' => $id, 'revision' => hash('sha256', json_encode([$id, $visible], JSON_THROW_ON_ERROR)), ...$visible];
        $out['_actions'] = [];
        $readable = $ctx->channel !== 'api' || in_array($this->resource.'.get', $ctx->scopes, true);
        foreach ($this->registry?->all() ?? [] as $candidate) if ($candidate->resource === $this->resource && in_array($ctx->channel, $candidate->channels, true) && $ctx->acl->allows($ctx->actor->id, $this->resource, $candidate->name, $ctx->channel, $id, null, '', null, false, $readable)) $out['_actions'][] = $candidate->name;
        $out['_editable'] = [];
        return $out;
    }
}
