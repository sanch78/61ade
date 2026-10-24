<?php
declare(strict_types=1);
namespace Blade\Feature;
final class Registry
{
    private array $actions = [];
    private array $views = [];
    private array $fields = [];
    private array $media = [];
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
    /** Media lookup for `column.media` fields naming $resource; one source per resource. */
    public function media(string $resource, MediaSource $source): void
    {
        if(!preg_match('/^[a-z][a-z0-9_.-]*$/D',$resource)||isset($this->media[$resource]))throw new \InvalidArgumentException('Invalid or duplicate media source.');
        $this->media[$resource]=$source;
    }
    public function mediaSource(string $resource): ?MediaSource { return $this->media[$resource] ?? null; }
    /** $rowHeight (32–160 px, default 40), $tileMinWidth (120–480 px) and $tiles are list presentation only; absent keys keep the client defaults. */
    public function view(string $resource, string $title, array $columns, array $actions, bool $singleton = false, ?string $group = null, ?ViewLayout $layout = null, bool $rowNumbers = true, bool $selection = false, ?string $icon = null, bool $desktopOnly = false, bool $rowSelection = false, ?int $rowHeight = null, ?int $tileMinWidth = null, bool $tiles = false): void
    {
        if($icon!==null&&!preg_match('/^[a-zA-Z0-9_-]+(?: [a-zA-Z0-9_-]+)*$/D',$icon))throw new \InvalidArgumentException('Invalid view icon.');
        if(($rowHeight!==null&&($rowHeight<32||$rowHeight>160))||($tileMinWidth!==null&&($tileMinWidth<120||$tileMinWidth>480)))throw new \InvalidArgumentException('Invalid view presentation.');
        foreach ($actions as $action) $this->get($resource,$action);
        $layout??=new ViewLayout();
        $this->views[$resource]=[...compact('resource','title','columns','actions','singleton','group','layout','rowNumbers','selection','icon','desktopOnly','rowSelection'),...array_filter(['rowHeight'=>$rowHeight,'tileMinWidth'=>$tileMinWidth,'tiles'=>$tiles?:null],static fn($v)=>$v!==null)];
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
}
