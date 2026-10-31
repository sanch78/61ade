<?php
declare(strict_types=1);
namespace Blade\Feature;

/**
 * One view of an application (docs/toolkit.md#views), added with `Registry::addView`; the built-in builders
 * `Registry::view/fileManager/diagram/calendar` (and `SqlResource::register`) create Views of the built-in kinds.
 *
 * $id: unique per application, `[a-z][a-z0-9_.-]*`; the built-in builders default it to the resource.
 * $kind: `list`, `files`, `diagram`, `calendar`, or a project kind containing a dot (`demo.playlist-preview`), which
 *   a project module registers in the browser (`app.kinds`).
 * $resource: ACL resource whose $actions the view uses; null for a view without actions.
 * $record: resource of the record a record view opens for; the client resolves the row through its `get` action (ACL,
 *   field ACL, tenant). Offered only with that `get` offered to the actor; only project kinds accept it (P2).
 * $actions: action names of $resource; their existence is checked when the view is added to a Registry.
 * $options: the kind's declaration. Built-in kind providers read their own keys (which may be server-side objects
 *   such as ViewLayout or Field) and emit browser metadata only; the generic provider of a project kind sends the
 *   options verbatim after a JSON-safety and size check, so they must never hold backend-only data.
 * $open: `page` (workspace, menu entry, address) or `window` (a framework document window, no history entry).
 * $guide: what the user sees and can do in the view (plain text, localized; blank lines separate paragraphs, at most
 *   4000 characters). Opening the view as a page shows it in a closable window until the user closes it once.
 */
final readonly class View
{
    public const ID = '/^[a-z][a-z0-9_.-]*$/D';
    public const BUILTIN_KINDS = ['list', 'files', 'diagram', 'calendar'];

    /** @param list<string> $actions */
    public function __construct(
        public string $id,
        public string $kind,
        public string $title,
        public ?string $resource = null,
        public ?string $record = null,
        public array $actions = [],
        public array $options = [],
        public ?string $group = null,
        public ?string $icon = null,
        public bool $desktopOnly = false,
        public string $open = 'page',
        public ?string $guide = null,
    ) {
        if (!preg_match(self::ID, $id)) throw new \InvalidArgumentException('Invalid view id.');
        if (!preg_match(self::ID, $kind) || (!in_array($kind, self::BUILTIN_KINDS, true) && !str_contains($kind, '.'))) throw new \InvalidArgumentException('Invalid view kind: '.$id);
        if (trim($title) === '' || ($group !== null && trim($group) === '')) throw new \InvalidArgumentException('Invalid view title: '.$id);
        foreach ([$resource, $record] as $name) if ($name !== null && !preg_match(self::ID, $name)) throw new \InvalidArgumentException('Invalid view resource: '.$id);
        if (!array_is_list($actions) || count(array_unique($actions)) !== count($actions) || ($actions && $resource === null)) throw new \InvalidArgumentException('Invalid view actions: '.$id);
        foreach ($actions as $action) if (!is_string($action) || !preg_match(self::ID, $action)) throw new \InvalidArgumentException('Invalid view actions: '.$id);
        if ($icon !== null && !preg_match('/^[a-zA-Z0-9_-]+(?: [a-zA-Z0-9_-]+)*$/D', $icon)) throw new \InvalidArgumentException('Invalid view icon: '.$id);
        if (!in_array($open, ['page', 'window'], true)) throw new \InvalidArgumentException('Invalid view open mode: '.$id);
        if ($guide !== null && (trim($guide) === '' || mb_strlen($guide) > 4000 || str_contains($guide, "\0") || preg_match('//u', $guide) !== 1)) throw new \InvalidArgumentException('Invalid view guide: '.$id);
    }

    /**
     * The list view of $resource (kind `list`, id $id, default the resource) as Registry::view() declares it; see there
     * for the options. Not registered: for Registry::addView() or Registry::updateView().
     */
    public static function list(string $resource, string $title, array $columns, array $actions, bool $singleton = false, ?string $group = null, ?ViewLayout $layout = null, bool $rowNumbers = true, bool $selection = false, ?string $icon = null, bool $desktopOnly = false, bool $rowSelection = false, ?int $rowHeight = null, ?int $tileMinWidth = null, bool $tiles = false, string|array|null $activate = null, ?string $id = null, array $commands = [], ?string $guide = null, ?array $drop = null): self
    {
        $options = ['columns' => $columns, 'singleton' => $singleton, 'layout' => $layout ?? new ViewLayout(), 'rowNumbers' => $rowNumbers, 'selection' => $selection, 'rowSelection' => $rowSelection,
            ...array_filter(['rowHeight' => $rowHeight, 'tileMinWidth' => $tileMinWidth, 'tiles' => $tiles ?: null, 'activate' => $activate, 'commands' => $commands ?: null, 'drop' => $drop], static fn($v) => $v !== null)];
        return new self($id ?? $resource, 'list', $title, $resource, actions: $actions, options: $options, group: $group, icon: $icon, desktopOnly: $desktopOnly, guide: $guide);
    }

    /** A copy with the given constructor arguments replaced, e.g. `$view->with(icon: 'dxi dxi-key')`. */
    public function with(mixed ...$changes): self
    {
        return new self(...[...get_object_vars($this), ...$changes]);
    }
}
