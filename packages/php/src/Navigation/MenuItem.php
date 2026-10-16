<?php
declare(strict_types=1);
namespace Vapa\Navigation;

use Vapa\Shell\Identity;

/** A backend definition; visibility rules are never serialized. */
final readonly class MenuItem
{
    /** @param list<MenuItem> $items */
    public function __construct(
        public string $id,
        public string $label,
        public array $items = [],
        public ?\Closure $visible = null,
        public bool $enabled = false,
    ) {
        if (!preg_match('/^[a-z][a-z0-9_-]*$/D', $id) || $label === '') {
            throw new \InvalidArgumentException('A menu item requires a stable ID and label.');
        }
        foreach ($items as $item) {
            if (!$item instanceof self) throw new \InvalidArgumentException('Invalid menu child.');
        }
        // This first milestone only exposes declared, disabled business modules.
        if ($enabled && !$items) throw new \InvalidArgumentException('Module actions are not implemented yet.');
    }

    public function project(Identity $actor): ?array
    {
        if ($this->visible && !($this->visible)($actor)) return null;
        $children = [];
        foreach ($this->items as $item) {
            if ($projection = $item->project($actor)) $children[] = $projection;
        }
        if ($this->items && !$children) return null;
        return $children
            ? ['id' => $this->id, 'label' => $this->label, 'items' => $children]
            : ['id' => $this->id, 'label' => $this->label, 'disabled' => true];
    }
}
