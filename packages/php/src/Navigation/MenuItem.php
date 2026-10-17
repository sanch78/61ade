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
        public ?string $icon = null,
    ) {
        if (!preg_match('/^[a-z][a-z0-9_-]*$/D', $id) || $label === '') {
            throw new \InvalidArgumentException('A menu item requires a stable ID and label.');
        }
        if($icon!==null&&!preg_match('/^[a-zA-Z0-9_-]+(?: [a-zA-Z0-9_-]+)*$/D',$icon))throw new \InvalidArgumentException('Invalid menu icon.');
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
            ? [...($this->icon?['icon'=>$this->icon]:[]),'id' => $this->id, 'label' => \Vapa\I18n\Translator::text($this->label), 'items' => $children]
            : [...($this->icon?['icon'=>$this->icon]:[]),'id' => $this->id, 'label' => \Vapa\I18n\Translator::text($this->label), 'disabled' => true];
    }
}
