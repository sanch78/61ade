<?php
declare(strict_types=1);
namespace Blade\Navigation;

use Blade\Feature\Field;
use Blade\I18n\Translator;
use Blade\Shell\Identity;

/**
 * An application command of the menu row (docs/shell.md#menu-commands): shown on every view after the navigation, it
 * runs the project's client command `$id` (registered with `placement: "menu"`) instead of opening a view. `visible`
 * is evaluated on the server and never serialized; `attention` names a view whose live attention count it shows.
 */
final readonly class MenuCommand
{
    public function __construct(
        /** The client command's registry name, with a project prefix (`demo.notes`). */
        public string $id,
        public string $label,
        public ?string $icon = null,
        /** Plain text shown on hover; default none (the label names the entry). */
        public ?string $tooltip = null,
        /** The emphasized primary tone; false: an entry like the views'. */
        public bool $emphasized = true,
        public ?\Closure $visible = null,
        /** A view declaring `attention` whose count the entry also shows. */
        public ?string $attention = null,
    ) {
        if (!Field::projectName($id) || strlen($id) > 100) throw new \InvalidArgumentException('A menu command needs a client command name with a project prefix: '.$id);
        if (trim($label) === '' || strlen($label) > 80) throw new \InvalidArgumentException('Invalid menu command label: '.$id);
        if ($tooltip !== null && (trim($tooltip) === '' || strlen($tooltip) > 200)) throw new \InvalidArgumentException('Invalid menu command tooltip: '.$id);
        if ($icon !== null && !preg_match('/^[a-zA-Z0-9_-]+(?: [a-zA-Z0-9_-]+)*$/D', $icon)) throw new \InvalidArgumentException('Invalid menu command icon: '.$id);
        if ($attention !== null && !preg_match(\Blade\Feature\View::ID, $attention)) throw new \InvalidArgumentException('Invalid menu command attention view: '.$id);
    }

    /** The browser part for $actor, or null when it is not offered; `attention` only for a view in $views (offered). */
    public function project(Identity $actor, array $views): ?array
    {
        if ($this->visible && !($this->visible)($actor)) return null;
        return [
            'id' => $this->id,
            'label' => Translator::text($this->label),
            ...($this->icon !== null ? ['icon' => $this->icon] : []),
            ...($this->tooltip !== null ? ['tooltip' => Translator::text($this->tooltip)] : []),
            'emphasized' => $this->emphasized,
            ...($this->attention !== null && in_array($this->attention, $views, true) ? ['attention' => $this->attention] : []),
        ];
    }
}
