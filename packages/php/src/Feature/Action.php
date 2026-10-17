<?php
declare(strict_types=1);
namespace Vapa\Feature;
final readonly class Action
{
    /** Resolver returns backend target ['id','owner',...] before permission evaluation. */
    public function __construct(public string $resource, public string $name, public string $label, public array $fields, public \Closure $handler, public ?\Closure $resolve = null, public bool $write = false, public bool $collection = false, public array $channels = ['ui','api'], public ?ListSource $listSource = null, public ?\Closure $formValues = null, public ?\Closure $editHandler = null, public ?string $icon = null, public bool $bulk = false)
    {
        if ($icon !== null && !preg_match('/^[a-zA-Z0-9_ -]{1,150}$/D', $icon)) throw new \InvalidArgumentException('Invalid action icon classes.');
        if ($bulk && ($name === 'create' || !$resolve || $collection || array_filter($fields, static fn($field) => $field->secret || $field->type === 'password'))) throw new \InvalidArgumentException('Bulk actions must target individual objects without secret inputs.');
        foreach ([$resource,$name] as $id) if (!preg_match('/^[a-z][a-z0-9_.-]*$/D',$id)) throw new \InvalidArgumentException('Invalid action');
        foreach ($fields as $field) if (!$field instanceof Field) throw new \InvalidArgumentException('Invalid field');
    }
}
