<?php
declare(strict_types=1);
namespace Vapa\Feature;
final class Registry
{
    private array $actions = [];
    private array $views = [];
    public function add(Action $action): void
    {
        $key=$action->resource.'.'.$action->name;
        if(isset($this->actions[$key])) throw new \InvalidArgumentException('Duplicate action');
        $this->actions[$key]=$action;
    }
    public function get(string $resource, string $action): Action { return $this->actions[$resource.'.'.$action] ?? throw new Failure('Ismeretlen művelet.',404); }
    public function all(): array { return array_values($this->actions); }
    public function view(string $resource, string $title, array $columns, array $actions, bool $singleton = false, ?string $group = null): void
    {
        foreach ($actions as $action) $this->get($resource,$action);
        $this->views[$resource]=compact('resource','title','columns','actions','singleton','group');
    }
    public function views(): array { return array_values($this->views); }
}
