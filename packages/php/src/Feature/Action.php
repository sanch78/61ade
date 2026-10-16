<?php
declare(strict_types=1);
namespace Vapa\Feature;
final readonly class Action
{
    /** Resolver returns backend target ['id','owner',...] before permission evaluation. */
    public function __construct(public string $resource, public string $name, public string $label, public array $fields, public \Closure $handler, public ?\Closure $resolve = null, public bool $write = false, public bool $collection = false, public array $channels = ['ui','api'])
    {
        foreach ([$resource,$name] as $id) if (!preg_match('/^[a-z][a-z0-9_.-]*$/D',$id)) throw new \InvalidArgumentException('Invalid action');
        foreach ($fields as $field) if (!$field instanceof Field) throw new \InvalidArgumentException('Invalid field');
    }
}
