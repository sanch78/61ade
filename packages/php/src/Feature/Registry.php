<?php
declare(strict_types=1);
namespace Blade\Feature;
final class Registry
{
    private array $actions = [];
    private array $views = [];
    private array $fields = [];
    private array $media = [];
    private array $usages = [];
    private array $tenantScoped = [];
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
    /** Appends registered actions to an existing view of $resource, keeping every other view option. */
    public function appendViewActions(string $resource, array $actions): void
    {
        if(!isset($this->views[$resource]))throw new \InvalidArgumentException('Unknown view.');
        foreach($actions as $action)$this->get($resource,$action);
        $this->views[$resource]['actions']=array_values(array_unique([...$this->views[$resource]['actions'],...$actions]));
    }
    /**
     * Derived media columns: a column without a field may declare `media_of` (a media field of the resource) and
     * `part` (type, resolution or duration); the client renders it from the row's `_media`; never sorted or filtered.
     */
    private function checkColumns(string $resource, array $columns): void
    {
        $fields=$this->fields[$resource]??[];
        foreach($columns as $column){
            if(!is_array($column)||!is_string($column['id']??null))throw new \InvalidArgumentException('Invalid view column.');
            if(!isset($column['media_of'])&&!isset($column['part']))continue;
            $source=is_string($column['media_of']??null)?($fields[$column['media_of']]??null):null;
            if(isset($fields[$column['id']])||!$source||$source->media()===null||!in_array($column['part']??null,['type','resolution','duration'],true))throw new \InvalidArgumentException('Invalid derived media column.');
        }
    }
    /**
     * $rowHeight (32–160 px, default 40), $tileMinWidth (120–480 px) and $tiles are list presentation only; absent keys keep the client defaults.
     * $activate: what double-click and Enter on a record run, as the toolbar command of that name does: `details`,
     * `subview` (the full child list of that record, also at a count of 0), `page` (the child view's own page, kept by
     * `subview(…, embed: false)`, with its sub-view field filtered to the record; a window where the page is not
     * available) or a record action of $actions (not
     * `create`, `get`, an upload or a collection action). Absent: the update form, otherwise the details. An activation
     * the record or actor is not offered (ACL, `_actions`, no resolved sub-view) opens the details.
     */
    public function view(string $resource, string $title, array $columns, array $actions, bool $singleton = false, ?string $group = null, ?ViewLayout $layout = null, bool $rowNumbers = true, bool $selection = false, ?string $icon = null, bool $desktopOnly = false, bool $rowSelection = false, ?int $rowHeight = null, ?int $tileMinWidth = null, bool $tiles = false, ?string $activate = null): void
    {
        if($icon!==null&&!preg_match('/^[a-zA-Z0-9_-]+(?: [a-zA-Z0-9_-]+)*$/D',$icon))throw new \InvalidArgumentException('Invalid view icon.');
        if(($rowHeight!==null&&($rowHeight<32||$rowHeight>160))||($tileMinWidth!==null&&($tileMinWidth<120||$tileMinWidth>480)))throw new \InvalidArgumentException('Invalid view presentation.');
        foreach ($actions as $action) $this->get($resource,$action);
        if($activate!==null&&($singleton||!in_array($activate,['details','subview','page',...$actions],true)||(!in_array($activate,['details','subview','page'],true)&&(in_array($activate,['create','get'],true)||($known=$this->get($resource,$activate))->collection||$known->upload!==null))))throw new \InvalidArgumentException('Invalid view activation.');
        $this->checkColumns($resource,$columns);
        $layout??=new ViewLayout();
        $this->views[$resource]=[...compact('resource','title','columns','actions','singleton','group','layout','rowNumbers','selection','icon','desktopOnly','rowSelection'),...array_filter(['rowHeight'=>$rowHeight,'tileMinWidth'=>$tileMinWidth,'tiles'=>$tiles?:null,'activate'=>$activate],static fn($v)=>$v!==null)];
    }
    /**
     * Sub-view: every record of the $resource list expands (grid sub-row or card) to the $child list filtered to
     * the records whose $field holds its id, as a compact preview (the full $child view opens in a window). A
     * different $child is embedded by default (no menu entry of its own; $embed false keeps it); the same resource
     * is a hierarchy: its list shows the records without a parent ($field empty, so $field is a select whose
     * options include ''), each expands to its children, and the parent's toolbar acts on a selected child. Reads
     * and writes are ordinary, ACL-checked calls of $child; the filter is a scope of the view, not an authorization.
     * A preview fits its records up to 5–10 rows (by the viewport height), then scrolls. $select false: the child's
     * rows (preview and full window) never become the cursor record: no highlight or keyboard cursor, no toolbar
     * delegation, double-click and Enter open nothing and record actions leave the child's toolbar; declared editable
     * switch cells still save (for a list where only a flag is set, such as tenant access).
     */
    public function subview(string $resource, string $child, string $field, bool $embed = true, bool $select = true): void
    {
        $parent=$this->views[$resource]??null;$view=$this->views[$child]??null;
        if(!$parent||!$view||isset($parent['kind'])||isset($view['kind'])||$parent['singleton']||$view['singleton'])throw new \InvalidArgumentException('Sub-views need two list views.');
        $known=$this->fields($child)[$field]??null;
        if(!$known||!in_array($known->type,['select','number','text'],true)||$known->secret||($child===$resource&&$known->type!=='select'))throw new \InvalidArgumentException('Invalid sub-view.');
        // `activate: 'page'` needs a child view with its own page: a different resource kept in the menu.
        if(($parent['activate']??null)==='page'&&($child===$resource||$embed))throw new \InvalidArgumentException('A page activation needs a sub-view with embed: false.');
        $this->views[$resource]['subview']=['child'=>$child,'field'=>$field,...($select?[]:['select'=>false])];
        if($child!==$resource&&$embed)$this->views[$child]['embedded']=true;
    }
    /** Non-list view kind: `$files` is browser configuration only (mounts, limits); handlers stay server-side. */
    public function fileManager(string $resource, string $title, array $actions, array $files, ?string $group = null, ?string $icon = null, bool $desktopOnly = false): void
    {
        if($icon!==null&&!preg_match('/^[a-zA-Z0-9_-]+(?: [a-zA-Z0-9_-]+)*$/D',$icon))throw new \InvalidArgumentException('Invalid view icon.');
        foreach ($actions as $action) $this->get($resource,$action);
        $this->views[$resource]=['kind'=>'files','resource'=>$resource,'title'=>$title,'columns'=>[],'actions'=>$actions,'singleton'=>false,'group'=>$group,'layout'=>new ViewLayout(),'rowNumbers'=>false,'selection'=>true,'icon'=>$icon,'files'=>$files,'desktopOnly'=>$desktopOnly];
    }
    /** Non-list view kind: `$diagram` is browser configuration only (palette, link types, limits). */
    public function diagram(string $resource, string $title, array $actions, array $diagram, ?string $group = null, ?string $icon = null, bool $desktopOnly = false): void
    {
        if($icon!==null&&!preg_match('/^[a-zA-Z0-9_-]+(?: [a-zA-Z0-9_-]+)*$/D',$icon))throw new \InvalidArgumentException('Invalid view icon.');
        foreach ($actions as $action) $this->get($resource,$action);
        $this->views[$resource]=['kind'=>'diagram','resource'=>$resource,'title'=>$title,'columns'=>[],'actions'=>$actions,'singleton'=>false,'group'=>$group,'layout'=>new ViewLayout(),'rowNumbers'=>false,'selection'=>false,'icon'=>$icon,'diagram'=>$diagram,'desktopOnly'=>$desktopOnly];
    }
    /** Non-list view kind: `$fields` are the extra event fields, `$calendar` browser configuration only (views, hours, limits). */
    public function calendar(string $resource, string $title, array $actions, array $fields, array $calendar, ?string $group = null, ?string $icon = null, bool $desktopOnly = false): void
    {
        if($icon!==null&&!preg_match('/^[a-zA-Z0-9_-]+(?: [a-zA-Z0-9_-]+)*$/D',$icon))throw new \InvalidArgumentException('Invalid view icon.');
        foreach ($actions as $action) $this->get($resource,$action);
        $this->views[$resource]=['kind'=>'calendar','resource'=>$resource,'title'=>$title,'columns'=>[],'actions'=>$actions,'singleton'=>false,'group'=>$group,'layout'=>new ViewLayout(),'rowNumbers'=>false,'selection'=>false,'icon'=>$icon,'fields'=>$fields,'calendar'=>$calendar,'desktopOnly'=>$desktopOnly];
    }
    public function views(): array { return array_values($this->views); }
    /** The registered sub-view of $resource (`child`, `field`) or null. */
    public function subviewOf(string $resource): ?array { return $this->views[$resource]['subview'] ?? null; }
}
