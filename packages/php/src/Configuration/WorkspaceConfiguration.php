<?php

declare(strict_types=1);

namespace Blade\Configuration;

use Closure;
use InvalidArgumentException;
use PDO;
use Blade\Feature\{Action, Field, Lookup, Registry, SqlResource, View, ViewLayout, Workspace};

/** Compiles trusted declarations to the existing 61ade runtime; no consumer imports. */
final class WorkspaceConfiguration
{
    private array $resources = [];
    private array $lookups = [];
    /** View ids declared in JSON (resource views and `views` entries); a repeated id is a duplicate definition. */
    private array $viewIds = [];

    private function __construct(private Registry $registry, private Bindings $bindings)
    {
    }

    /** $tenancy: the application's `tenancy` section is present (multi-tenancy on). */
    public static function build(PDO $db, array $files, Closure $callbacks, bool $tenancy = false): Workspace
    {
        $registry = new Registry();
        $workspace = new Workspace($registry, $db, $tenancy);
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
                'views' => 'array',
            ], '$.workspace.module');
            foreach ($module['lookups'] ?? [] as $name => $definition) {
                Shape::check($definition, [
                    'resource' => 'string', 'table' => 'string', 'key' => 'string', 'label' => 'string',
                ], [
                    'owner' => 'string', 'where' => 'string', 'extra' => 'array', 'tenant_column' => 'string',
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
                    tenantColumn: $definition['tenant_column'] ?? null,
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
        foreach ($modules as $module) {
            foreach ($module['views'] ?? [] as $id => $definition) {
                $compiler->extraView((string) $id, $definition);
            }
        }
        // Sub-views last: both views exist by then, wherever the child is declared. `subview.resource` names the
        // child view id (its resource unless the child declares another `view.id`).
        foreach ($modules as $module) {
            foreach ($module['resources'] ?? [] as $name => $definition) {
                $sub = $definition['view']['subview'] ?? null;
                if ($sub) $workspace->registry->subview($definition['view']['id'] ?? $name, $sub['resource'], $sub['field'], $sub['embed'] ?? true, $sub['select'] ?? true);
            }
        }
        // `view:<id>` activation targets exist once every view is declared.
        $workspace->registry->checkViews();
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
                'validation' => 'array', 'column' => 'array', 'default' => 'string', 'bulk' => 'boolean', 'file' => 'array', 'editor' => 'string',
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
                editor: $definition['editor'] ?? null,
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
            'owner_column' => 'string', 'defaults' => 'array', 'where' => 'string', 'self_only' => 'boolean', 'related' => 'array', 'unique' => 'array', 'computed' => 'array', 'tenant_column' => 'string',
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
            'row_height' => 'integer', 'tile_min_width' => 'integer', 'tiles' => 'boolean', 'search' => 'array', 'subview' => 'array', 'activate' => 'any', 'id' => 'string', 'commands' => 'array',
        ], '$.resources.'.$name.'.view');
        // A string target or an `{field, map}` activation map; Registry::view() validates the targets.
        if (isset($view['activate']) && !is_string($view['activate']) && !is_array($view['activate'])) {
            throw new InvalidArgumentException('Invalid configuration type: $.resources.'.$name.'.view.activate');
        }
        if (isset($view['activate']) && is_array($view['activate'])) {
            Shape::check($view['activate'], ['field' => 'string', 'map' => 'array'], [], '$.resources.'.$name.'.view.activate');
        }
        Shape::check($view['subview'] ?? ['resource' => '', 'field' => ''], ['resource' => 'string', 'field' => 'string'], ['embed' => 'boolean', 'select' => 'boolean'], '$.resources.'.$name.'.view.subview');
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
            tenantColumn: $storage['tenant_column'] ?? null,
        );
        $resource->register(
            registry: $this->registry,
            title: $view['title'],
            create: $operations['create'] ?? true,
            update: $operations['update'] ?? true,
            group: $view['group'] ?? null,
            layout: $this->layout($view),
            id: $view['id'] ?? null,
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
        $id = $view['id'] ?? $name;
        $this->claim($id);
        // The resource declared its default view (SqlResource::register); the `view` section is its final form.
        $current = $this->registry->viewById($id);
        $this->registry->updateView(View::list(
            resource: $name,
            title: $view['title'],
            columns: $view['columns'] ?? $current->options['columns'],
            actions: $view['actions'] ?? $current->actions,
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
            activate: is_array($view['activate'] ?? null) ? ['field' => $view['activate']['field'], 'map' => $view['activate']['map']] : ($view['activate'] ?? null),
            id: $id,
            commands: $view['commands'] ?? [],
        ));
    }

    private function claim(string $id): void
    {
        if (isset($this->viewIds[$id])) {
            throw new InvalidArgumentException('Duplicate view: '.$id);
        }
        $this->viewIds[$id] = true;
    }

    /**
     * Module-level `views.<id>`: a view of a project kind (dotted `kind`; built-in kinds are declared through
     * `resources.<name>.view`). `options` reach the browser verbatim (JSON-safe, at most 64 KiB encoded).
     */
    private function extraView(string $id, mixed $definition): void
    {
        if (!is_array($definition)) {
            throw new InvalidArgumentException('Invalid configuration type: $.views.'.$id);
        }
        Shape::check($definition, ['kind' => 'string', 'title' => 'string'], [
            'resource' => 'string', 'record' => 'string', 'actions' => 'array', 'options' => 'array', 'open' => 'string',
            'group' => 'string', 'icon' => 'string', 'desktop_only' => 'boolean',
        ], '$.views.'.$id);
        if (in_array($definition['kind'], View::BUILTIN_KINDS, true)) {
            throw new InvalidArgumentException('Built-in view kinds are declared in resources.<name>.view: $.views.'.$id);
        }
        $this->claim($id);
        $this->registry->addView(new View(
            id: $id,
            kind: $definition['kind'],
            title: $definition['title'],
            resource: $definition['resource'] ?? null,
            record: $definition['record'] ?? null,
            actions: $definition['actions'] ?? [],
            options: $definition['options'] ?? [],
            group: $definition['group'] ?? null,
            icon: $definition['icon'] ?? null,
            desktopOnly: $definition['desktop_only'] ?? false,
            open: $definition['open'] ?? 'page',
        ));
    }
}
