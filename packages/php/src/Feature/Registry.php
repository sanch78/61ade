<?php
declare(strict_types=1);
namespace Vapa\Feature;
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
    public function view(string $resource, string $title, array $columns, array $actions, bool $singleton = false, ?string $group = null, ?ViewLayout $layout = null, bool $rowNumbers = true, bool $selection = false, ?string $icon = null): void
    {
        if($icon!==null&&!preg_match('/^[a-zA-Z0-9_-]+(?: [a-zA-Z0-9_-]+)*$/D',$icon))throw new \InvalidArgumentException('Invalid view icon.');
        foreach ($actions as $action) $this->get($resource,$action);
        $layout??=new ViewLayout();
        $this->views[$resource]=compact('resource','title','columns','actions','singleton','group','layout','rowNumbers','selection','icon');
    }
    public function views(): array { return array_values($this->views); }
}
