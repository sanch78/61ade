<?php

declare(strict_types=1);

namespace Blade\Configuration;

use Closure;
use InvalidArgumentException;
use PDO;
use Blade\Feature\{Action, Field, Lookup, Registry, SqlResource, ViewLayout, Workspace};

/** Compiles trusted declarations to the existing 61de runtime; no consumer imports. */
final class WorkspaceConfiguration
{
    private array $resources = [];
    private array $lookups = [];

    private function __construct(private Registry $registry, private Bindings $bindings)
    {
    }

    public static function build(PDO $db, array $files, Closure $callbacks): Workspace
    {
        $registry = new Registry();
        $workspace = new Workspace($registry, $db);
        $compiler = new self($registry, new Bindings($callbacks($workspace, $registry)));
        $modules = array_map(JsonConfiguration::read(...), $files);
        // Tables of resources deleting with policy `archive`: lookups over them hide archived rows (compile-time).
        $archived = [];
        foreach ($modules as $module) {
            foreach (is_array($module['resources'] ?? null) ? $module['resources'] : [] as $definition) {
                if (($definition['operations']['delete_policy'] ?? null) === 'archive' && is_string($definition['storage']['table'] ?? null)) $archived[$definition['storage']['table']] = true;
            }
        }

        foreach ($modules as $module) {
            Shape::check($module, [], [
                'section_descriptions' => 'array',
                'lookups' => 'array',
                'resources' => 'array',
                'actions' => 'array',
            ], '$.workspace.module');
            foreach ($module['lookups'] ?? [] as $name => $definition) {
                Shape::check($definition, [
                    'resource' => 'string', 'table' => 'string', 'key' => 'string', 'label' => 'string',
                ], [
                    'owner' => 'string', 'where' => 'string', 'extra' => 'array',
                ], '$.lookups.'.$name);
                if (isset($compiler->lookups[$name])) {
                    throw new InvalidArgumentException('Duplicate lookup: '.$name);
                }
                $compiler->lookups[$name] = new Lookup(
                    resource: $definition['resource'],
                    table: $definition['table'],
                    key: $definition['key'],
                    label: $definition['label'],
                    owner: $definition['owner'] ?? null,
                    where: '('.($definition['where'] ?? '1=1').')'.(isset($archived[$definition['table']]) ? ' AND archived_at IS NULL' : ''),
                    extra: $definition['extra'] ?? [],
                );
            }
        }
        foreach ($modules as $module) {
            foreach ($module['resources'] ?? [] as $name => $definition) {
                $compiler->resource($name, $definition);
            }
        }
        foreach ($modules as $module) {
            foreach ($module['actions'] ?? [] as $definition) {
                $compiler->action($definition);
            }
        }
        foreach ($modules as $module) {
            foreach ($module['resources'] ?? [] as $name => $definition) {
                $compiler->view($name, $definition);
            }
        }
        return $workspace;
    }

    private function fields(array $definitions): array
    {
        $fields = [];
        $names = [];
        foreach ($definitions as $definition) {
            Shape::check($definition, ['name' => 'string', 'label' => 'string'], [
                'type' => 'string', 'required' => 'boolean', 'max' => 'integer',
                'options' => 'array', 'secret' => 'boolean',
                'options_lookup' => 'string', 'options_binding' => 'string',
                'validation' => 'array', 'column' => 'array', 'default' => 'string', 'bulk' => 'boolean', 'file' => 'array',
            ], '$.fields');
            if (isset($definition['file'])) {
                Shape::check($definition['file'], ['resource' => 'string', 'mount' => 'string', 'accept' => 'array'], ['folder' => 'string'], '$.fields.'.$definition['name'].'.file');
            }
            if (isset($names[$definition['name']])) {
                throw new InvalidArgumentException('Duplicate field: '.$definition['name']);
            }
            $names[$definition['name']] = true;
            if (count(array_intersect(['options', 'options_lookup', 'options_binding'], array_keys($definition))) > 1) {
                throw new InvalidArgumentException('Field must have only one options source: '.$definition['name']);
            }
            $options = $definition['options'] ?? [];
            if (isset($definition['options_lookup'])) {
                $name = $definition['options_lookup'];
                $lookup = $this->lookups[$name] ?? throw new InvalidArgumentException('Unknown lookup: '.$name);
                $options = $lookup->options(...);
            } elseif (isset($definition['options_binding'])) {
                $options = $this->bindings->get($definition['options_binding']);
            }
            $fields[] = new Field(
                name: $definition['name'],
                label: $definition['label'],
                type: $definition['type'] ?? 'text',
                required: $definition['required'] ?? false,
                max: $definition['max'] ?? 255,
                options: $options,
                secret: $definition['secret'] ?? false,
                validation: $definition['validation'] ?? [],
                column: $definition['column'] ?? [],
                defaultValue: $definition['default'] ?? null,
                bulk: $definition['bulk'] ?? false,
                file: $definition['file'] ?? null,
            );
        }
        return $fields;
    }

    private function resource(string $name, array $definition): void
    {
        Shape::check($definition, ['storage' => 'array', 'fields' => 'array', 'view' => 'array'], [
            'hooks' => 'array', 'operations' => 'array',
        ], '$.resources.'.$name);
        if (isset($this->resources[$name])) {
            throw new InvalidArgumentException('Duplicate resource: '.$name);
        }
        $storage = $definition['storage'];
        $hooks = $definition['hooks'] ?? [];
        $operations = $definition['operations'] ?? [];
        $view = $definition['view'];
        Shape::check($storage, ['table' => 'string', 'key' => 'string'], [
            'owner_column' => 'string', 'defaults' => 'array', 'where' => 'string', 'self_only' => 'boolean', 'related' => 'array', 'unique' => 'array', 'computed' => 'array',
        ], '$.resources.'.$name.'.storage');
        Shape::check($hooks, [], [
            'guard' => 'string', 'normalize' => 'string', 'after_save' => 'string', 'delete_guard' => 'string', 'after_delete' => 'string',
        ], '$.resources.'.$name.'.hooks');
        Shape::check($operations, [], [
            'create' => 'boolean', 'update' => 'boolean', 'delete' => 'boolean', 'delete_policy' => 'string',
        ], '$.resources.'.$name.'.operations');
        if (isset($operations['delete_policy']) && !($operations['delete'] ?? false)) {
            throw new InvalidArgumentException('A delete policy needs operations.delete: '.$name);
        }
        Shape::check($view, ['title' => 'string'], [
            'group' => 'string', 'singleton' => 'boolean', 'actions' => 'array',
            'columns' => 'array', 'layout' => 'array', 'row_numbers' => 'boolean', 'selection' => 'boolean', 'row_selection' => 'boolean', 'icon' => 'string', 'desktop_only' => 'boolean',
            'row_height' => 'integer', 'tile_min_width' => 'integer', 'tiles' => 'boolean', 'search' => 'array',
        ], '$.resources.'.$name.'.view');
        $related = [];
        foreach ($storage['related'] ?? [] as $relation) {
            Shape::check($relation, ['table'=>'string','key'=>'string','fields'=>'array'], ['defaults'=>'array'], '$.storage.related');
            $related[] = new \Blade\Feature\RelatedStorage($relation['table'],$relation['key'],$relation['fields'],$relation['defaults']??[]);
        }
        $resource = new SqlResource(
            resource: $name,
            table: $storage['table'],
            key: $storage['key'],
            fields: $this->fields($definition['fields']),
            ownerColumn: $storage['owner_column'] ?? null,
            defaults: $storage['defaults'] ?? [],
            guard: $this->bindings->get($hooks['guard'] ?? null),
            normalize: $this->bindings->get($hooks['normalize'] ?? null),
            where: $storage['where'] ?? '1=1',
            selfOnly: $storage['self_only'] ?? false,
            afterSave: $this->bindings->get($hooks['after_save'] ?? null),
            deleteGuard: $this->bindings->get($hooks['delete_guard'] ?? null),
            related: $related,
            unique: $storage['unique'] ?? [],
            search: $view['search'] ?? [],
            afterDelete: $this->bindings->get($hooks['after_delete'] ?? null),
            computed: $storage['computed'] ?? [],
        );
        $resource->register(
            registry: $this->registry,
            title: $view['title'],
            create: $operations['create'] ?? true,
            update: $operations['update'] ?? true,
            group: $view['group'] ?? null,
            layout: $this->layout($view),
        );
        if ($operations['delete'] ?? false) {
            $resource->registerDelete($this->registry, $operations['delete_policy'] ?? 'delete');
        }
        $this->resources[$name] = $resource;
    }

    private function action(array $definition): void
    {
        Shape::check($definition, [
            'resource' => 'string', 'name' => 'string', 'label' => 'string', 'handler' => 'string',
        ], [
            'icon' => 'string', 'bulk' => 'boolean', 'confirm' => 'array', 'target_resource' => 'string', 'fields' => 'array', 'write' => 'boolean', 'channels' => 'array', 'form_values' => 'string',
        ], '$.actions');
        if (!isset($this->resources[$definition['resource']])) {
            throw new InvalidArgumentException('Unknown action resource: '.$definition['resource']);
        }
        foreach ($definition['channels'] ?? ['ui', 'api'] as $channel) {
            if (!in_array($channel, ['ui', 'api'], true)) {
                throw new InvalidArgumentException('Invalid action channel.');
            }
        }
        $resource = $definition['resource'];
        $resolve = null;
        if (isset($definition['target_resource'])) {
            $name = $definition['target_resource'];
            $target = $this->resources[$name] ?? throw new InvalidArgumentException('Unknown target resource: '.$name);
            $resolve = $target->target(...);
        }
        $handler = $this->bindings->get($definition['handler']);
        if ($handler === null) {
            throw new InvalidArgumentException('Action handler is required.');
        }
        $this->registry->add(new Action(
            resource: $resource,
            name: $definition['name'],
            label: $definition['label'],
            fields: $this->fields($definition['fields'] ?? []),
            handler: $handler,
            resolve: $resolve,
            write: $definition['write'] ?? false,
            channels: $definition['channels'] ?? ['ui', 'api'],
            formValues: $this->bindings->get($definition['form_values'] ?? null),
            icon: $definition['icon'] ?? null,
            bulk: $definition['bulk'] ?? false,
            confirm: $definition['confirm'] ?? null,
        ));
    }

    private function layout(array $view): ViewLayout
    {
        $layout = $view['layout'] ?? [];
        Shape::check($layout, [], ['form_mode' => 'string', 'tree' => 'array'], '$.view.layout');
        return new ViewLayout($layout['form_mode'] ?? 'overlay', $layout['tree'] ?? null);
    }

    private function view(string $name, array $definition): void
    {
        $view = $definition['view'];
        $current = null;
        foreach ($this->registry->views() as $candidate) {
            if ($candidate['resource'] === $name) {
                $current = $candidate;
                break;
            }
        }
        $this->registry->view(
            resource: $name,
            title: $view['title'],
            columns: $view['columns'] ?? $current['columns'],
            actions: $view['actions'] ?? $current['actions'],
            singleton: $view['singleton'] ?? false,
            group: $view['group'] ?? null,
            layout: $this->layout($view),
            rowNumbers: $view['row_numbers'] ?? true,
            selection: $view['selection'] ?? false,
            icon: $view['icon'] ?? null,
            desktopOnly: $view['desktop_only'] ?? false,
            rowSelection: $view['row_selection'] ?? false,
            rowHeight: $view['row_height'] ?? null,
            tileMinWidth: $view['tile_min_width'] ?? null,
            tiles: $view['tiles'] ?? false,
        );
    }
}
