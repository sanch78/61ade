<?php
declare(strict_types=1);
namespace Blade\Feature;
final class Registry
{
    private array $actions = [];
    /** @var array<string, View> by view id, in declaration order */
    private array $views = [];
    /** @var array<string, string> embedded child view id => parent view id (no menu entry of its own) */
    private array $embedded = [];
    /** @var array<string, ViewKindProvider> */
    private array $kinds;
    private ViewKindProvider $generic;
    private array $fields = [];
    private array $media = [];
    private array $usages = [];
    private array $tenantScoped = [];
    public function __construct()
    {
        $meta=new ViewMetadata($this);
        $this->kinds=['list'=>new ListViewKind($this,$meta),'files'=>new FileViewKind($this,$meta),'diagram'=>new DiagramViewKind($this,$meta),'calendar'=>new CalendarViewKind($this,$meta)];
        $this->generic=new GenericViewKind($meta);
    }
    public function registerFields(string $resource, array $fields): void { $this->fields[$resource] = array_column($fields, null, 'name'); }
    public function fields(string $resource): array { return $this->fields[$resource] ?? []; }
    public function add(Action $action): void
    {
        $key=$action->resource.'.'.$action->name;
        if(isset($this->actions[$key])) throw new \InvalidArgumentException('Duplicate action');
        $this->actions[$key]=$action;
    }
    public function get(string $resource, string $action): Action { return $this->actions[$resource.'.'.$action] ?? throw new Failure('Ismeretlen művelet.',404); }
    public function all(): array { return array_values($this->actions); }
    /**
     * Marks $resource as tenant-scoped. Only adapters that apply the tenant to every read and write call this
     * (SqlResource with a tenant column); the executor and views then refuse the resource without an active tenant.
     */
    public function scopeToTenant(string $resource): void { $this->tenantScoped[$resource] = true; }
    public function tenantScoped(string $resource): bool { return isset($this->tenantScoped[$resource]); }
    /** Media lookup for `column.media` fields naming $resource; one source per resource. */
    public function media(string $resource, MediaSource $source): void
    {
        if(!preg_match('/^[a-z][a-z0-9_.-]*$/D',$resource)||isset($this->media[$resource]))throw new \InvalidArgumentException('Invalid or duplicate media source.');
        $this->media[$resource]=$source;
    }
    public function mediaSource(string $resource): ?MediaSource { return $this->media[$resource] ?? null; }
    /** References to objects of $resource (several providers per resource); its delete actions preview and clear them. */
    public function usage(string $resource, UsageProvider $provider): void
    {
        if(!preg_match('/^[a-z][a-z0-9_.-]*$/D',$resource)||in_array($provider,$this->usages[$resource]??[],true))throw new \InvalidArgumentException('Invalid or duplicate usage provider.');
        $this->usages[$resource][]=$provider;
    }
    /** @return list<UsageProvider> */
    public function usageProviders(string $resource): array { return $this->usages[$resource] ?? []; }
    /**
     * Adds $view (docs/toolkit.md#views). Checks the actions of its resource, the record resource's `get` (record views:
     * project kinds only) and the kind provider's validation. A second declaration of the same id throws: give the
     * other view its own `id`, or change the declared one with updateView().
     */
    public function addView(View $view): View
    {
        $this->check($view);
        if(isset($this->views[$view->id]))throw new \InvalidArgumentException('Duplicate view id: '.$view->id);
        $this->views[$view->id]=$view;
        return $view;
    }
    /**
     * Changes the declared view of the same id to $view, for example `updateView($registry->viewById('x')->with(icon:
     * 'dxi dxi-key'))` after SqlResource::register(). The id must exist, kind and resource stay, and the result is
     * validated like a declaration. The menu position, the sub-view attached with subview(), the tree attached with
     * tree() and the embedded state stay (`subview` and `tree` options of $view are ignored).
     */
    public function updateView(View $view): View
    {
        $current=$this->views[$view->id]??throw new \InvalidArgumentException('Unknown view: '.$view->id);
        if($view->kind!==$current->kind||$view->resource!==$current->resource)throw new \InvalidArgumentException('A view update keeps the kind and resource: '.$view->id);
        $options=$view->options;unset($options['subview'],$options['tree']);
        $this->check($view=$view->with(options:$options));
        if(isset($current->options['tree']))$view=$view->with(options:[...$view->options,'tree'=>$current->options['tree']]);
        $subview=$current->options['subview']??null;
        if($subview!==null){
            if($options['singleton']??false)throw new \InvalidArgumentException('Sub-views need two list views.');
            $view=$view->with(options:[...$view->options,'subview'=>$subview]);
            $this->pageActivation($view,$subview['child']===$view->id||isset($this->embedded[$subview['child']]));
        }
        return $this->views[$view->id]=$view;
    }
    private function check(View $view): void
    {
        $provider=$this->provider($view->kind);
        foreach($view->actions as $action)$this->get((string)$view->resource,$action);
        if($view->record!==null&&(in_array($view->kind,View::BUILTIN_KINDS,true)||!isset($this->actions[$view->record.'.get'])))throw new \InvalidArgumentException('A record view needs a project kind and the get action of its record resource: '.$view->id);
        $provider->validate($this,$view);
    }
    /** `activate: 'page'` needs a child view with its own page: another resource's view kept in the menu. */
    private function pageActivation(View $parent,bool $withoutPage): void
    {
        if($withoutPage&&in_array('page',ListViewKind::targets($parent->options['activate']??null),true))throw new \InvalidArgumentException('A page activation needs a sub-view with embed: false.');
    }
    /** Server side of the project kind $kind (dotted); a kind without one uses GenericViewKind. Register it before its views. */
    public function kind(string $kind, ViewKindProvider $provider): void
    {
        if(!preg_match(View::ID,$kind)||!str_contains($kind,'.')||isset($this->kinds[$kind]))throw new \InvalidArgumentException('Invalid or duplicate view kind: '.$kind);
        foreach($this->views as $view)if($view->kind===$kind)throw new \InvalidArgumentException('Register the view kind before its views: '.$kind);
        $this->kinds[$kind]=$provider;
    }
    public function provider(string $kind): ViewKindProvider
    {
        return $this->kinds[$kind] ?? (str_contains($kind,'.')&&preg_match(View::ID,$kind)?$this->generic:throw new \InvalidArgumentException('Unknown view kind: '.$kind));
    }
    /** @return list<View> in menu order */
    public function views(): array { return array_values($this->views); }
    public function viewById(string $id): ?View { return $this->views[$id] ?? null; }
    /** $id is another view's embedded sub-view: no menu entry and no top-level bootstrap entry of its own. */
    public function embedded(string $id): bool { return isset($this->embedded[$id]); }
    /**
     * Checks references between views once all are declared (JsonApplication, ApplicationDefinition and every
     * `Workspace::views()` call it): each `view:<id>` activation target names a record view of the list's resource.
     */
    public function checkViews(): void
    {
        foreach($this->views as $view){
            if($view->kind!=='list')continue;
            foreach(ListViewKind::targets($view->options['activate']??null) as $target){
                if(!str_starts_with($target,'view:'))continue;
                $record=$this->views[substr($target,5)]??null;
                if(!$record||$record->record!==$view->resource)throw new \InvalidArgumentException('Unknown record view target '.$target.' of '.$view->id);
            }
        }
    }
    /** Appends registered actions to the existing view $view (id), keeping every other view option and its sub-view. */
    public function appendViewActions(string $view, array $actions): void
    {
        $current=$this->views[$view]??throw new \InvalidArgumentException('Unknown view.');
        foreach($actions as $action)$this->get((string)$current->resource,$action);
        $this->views[$view]=$current->with(actions:array_values(array_unique([...$current->actions,...$actions])));
    }
    /**
     * Adds the list view of $resource (kind `list`, id $id, default the resource; built by View::list()) and returns it.
     * $rowHeight (32–160 px, default 40), $tileMinWidth (120–480 px) and $tiles are list presentation only; absent keys keep the client defaults.
     * $activate: what double-click and Enter on a record run, as the toolbar command of that name does: `details`,
     * `subview` (the full child list of that record, also at a count of 0), `page` (the child view's own page, kept by
     * `subview(…, embed: false)`, with its sub-view field filtered to the record; a window where the page is not
     * available), `view:<id>` (a record view whose `record` is $resource) or a record action of $actions (not
     * `create`, `get`, an upload or a collection action); or a per-row map `['field' => f, 'map' => [value => target,
     * '*' => default target]]` keyed by the string value of the non-secret field f. Absent: the update form, otherwise
     * the details. An activation the record or actor is not offered (ACL, `_actions`, no resolved sub-view, record view
     * not offered) opens the details.
     * $commands: project client commands (`app.commands` names, dotted, at most 20) on the list toolbar.
     * $guide: the view's guide text (View).
     */
    public function view(string $resource, string $title, array $columns, array $actions, bool $singleton = false, ?string $group = null, ?ViewLayout $layout = null, bool $rowNumbers = true, bool $selection = false, ?string $icon = null, bool $desktopOnly = false, bool $rowSelection = false, ?int $rowHeight = null, ?int $tileMinWidth = null, bool $tiles = false, string|array|null $activate = null, ?string $id = null, array $commands = [], ?string $guide = null, ?array $drop = null): View
    {
        return $this->addView(View::list($resource,$title,$columns,$actions,$singleton,$group,$layout,$rowNumbers,$selection,$icon,$desktopOnly,$rowSelection,$rowHeight,$tileMinWidth,$tiles,$activate,$id,$commands,$guide,$drop));
    }
    /**
     * Sub-view: every record of the $view list expands (grid sub-row or card) to the $child list filtered to
     * the records whose $field holds its id, as a compact preview (the full $child view opens in a window). $view and
     * $child are view ids (default: the resource). A $child of another resource is embedded by default (no menu entry
     * of its own; $embed false keeps it); a $child of the same resource is a hierarchy of $view itself (the child view's
     * own options are not used): its list shows the records without a parent ($field
     * empty, so $field is a select whose options include ''), each expands to its children, and the parent's toolbar
     * acts on a selected child. Reads and writes are ordinary, ACL-checked calls of $child; the filter is a scope of
     * the view, not an authorization. A preview fits its records up to 5–10 rows (by the viewport height), then
     * scrolls. $select false: the child's rows (preview and full window) never become the cursor record: no highlight
     * or keyboard cursor, no toolbar delegation, double-click and Enter open nothing and record actions leave the
     * child's toolbar; declared editable switch cells still save (for a list where only a flag is set, such as tenant
     * access). Declare both views first.
     */
    public function subview(string $view, string $child, string $field, bool $embed = true, bool $select = true): void
    {
        $parent=$this->views[$view]??null;$sub=$this->views[$child]??null;
        if(!$parent||!$sub||$parent->kind!=='list'||$sub->kind!=='list'||($parent->options['singleton']??false)||($sub->options['singleton']??false))throw new \InvalidArgumentException('Sub-views need two list views.');
        $same=$sub->resource===$parent->resource;
        $known=$this->fields((string)$sub->resource)[$field]??null;
        if(!$known||!in_array($known->type,['select','number','text'],true)||$known->secret||($same&&$known->type!=='select'))throw new \InvalidArgumentException('Invalid sub-view.');
        $this->pageActivation($parent,$same||$embed);
        $this->views[$view]=$parent->with(options:[...$parent->options,'subview'=>['child'=>$same?$view:$child,'field'=>$field,...($select?[]:['select'=>false])]]);
        if(!$same&&$embed)$this->embedded[$child]=$view;
    }
    /**
     * Tree navigation: the $view list gets a tree of the $tree list's records beside it, and shows only the records
     * whose $field holds the selected node's id (a scope of the view, not an authorization; a new record gets that
     * node). $tree is a list view of another resource with a hierarchy sub-view on itself (`subview($tree, $tree,
     * parent)`): its roots are the records with an empty parent field and a node's children load when it is expanded,
     * by the ordinary, ACL-checked `list` of that resource. $label (a readable text or select field of $tree) names a
     * node. The tree panel's toolbar runs the $tree view's actions on the selected node (a new one under it). $tree is
     * embedded: it has no menu entry of its own. Declare both views and the hierarchy first.
     */
    public function tree(string $view, string $tree, string $field, string $label): void
    {
        $list=$this->views[$view]??null;$nodes=$this->views[$tree]??null;
        $invalid=new \InvalidArgumentException('Invalid tree navigation.');
        if(!$list||!$nodes||$list->kind!=='list'||$nodes->kind!=='list'||($list->options['singleton']??false)||$list->resource===$nodes->resource||isset($list->options['tree']))throw $invalid;
        $hierarchy=$nodes->options['subview']??null;
        if(!$hierarchy||$hierarchy['child']!==$tree)throw $invalid;
        $known=$this->fields((string)$list->resource)[$field]??null;$name=$this->fields((string)$nodes->resource)[$label]??null;
        if(!$known||!in_array($known->type,['select','number','text'],true)||$known->secret||!$name||!in_array($name->type,['text','select'],true)||$name->secret)throw $invalid;
        $this->views[$view]=$list->with(options:[...$list->options,'tree'=>['view'=>$tree,'field'=>$field,'label'=>$label]]);
        $this->embedded[$tree]=$view;
    }
    /** File manager view (kind `files`): `$files` is browser configuration only (mounts, limits); handlers stay server-side. */
    public function fileManager(string $resource, string $title, array $actions, array $files, ?string $group = null, ?string $icon = null, bool $desktopOnly = false, ?string $id = null, ?string $guide = null): View
    {
        return $this->addView(new View($id??$resource,'files',$title,$resource,actions:$actions,options:$files,group:$group,icon:$icon,desktopOnly:$desktopOnly,guide:$guide));
    }
    /** Diagram view (kind `diagram`): `$diagram` is browser configuration only (palette, link types, limits). */
    public function diagram(string $resource, string $title, array $actions, array $diagram, ?string $group = null, ?string $icon = null, bool $desktopOnly = false, ?string $id = null, ?string $guide = null): View
    {
        return $this->addView(new View($id??$resource,'diagram',$title,$resource,actions:$actions,options:$diagram,group:$group,icon:$icon,desktopOnly:$desktopOnly,guide:$guide));
    }
    /** Calendar view (kind `calendar`): `$fields` are the extra event fields, `$calendar` browser configuration only (views, hours, limits). */
    public function calendar(string $resource, string $title, array $actions, array $fields, array $calendar, ?string $group = null, ?string $icon = null, bool $desktopOnly = false, ?string $id = null, ?string $guide = null): View
    {
        return $this->addView(new View($id??$resource,'calendar',$title,$resource,actions:$actions,options:[...$calendar,'fields'=>$fields],group:$group,icon:$icon,desktopOnly:$desktopOnly,guide:$guide));
    }
    /** The registered sub-view of the view $view (`child` resource, `field`, optional `select`) or null. */
    public function subviewOf(string $view): ?array
    {
        $subview=$this->views[$view]->options['subview'] ?? null;
        return $subview?[...$subview,'child'=>(string)$this->views[$subview['child']]->resource]:null;
    }
}
