<?php
declare(strict_types=1);
namespace Blade\Feature;
final class Registry
{
    private array $actions = [];
    private array $views = [];
    private array $fields = [];
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
    public function view(string $resource, string $title, array $columns, array $actions, bool $singleton = false, ?string $group = null, ?ViewLayout $layout = null, bool $rowNumbers = true, bool $selection = false, ?string $icon = null, bool $desktopOnly = false, bool $rowSelection = false): void
    {
        if($icon!==null&&!preg_match('/^[a-zA-Z0-9_-]+(?: [a-zA-Z0-9_-]+)*$/D',$icon))throw new \InvalidArgumentException('Invalid view icon.');
        foreach ($actions as $action) $this->get($resource,$action);
        $layout??=new ViewLayout();
        $this->views[$resource]=compact('resource','title','columns','actions','singleton','group','layout','rowNumbers','selection','icon','desktopOnly','rowSelection');
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
