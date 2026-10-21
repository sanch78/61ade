<?php

declare(strict_types=1);

namespace Vapa\Admin;

use Vapa\Feature\Registry;
use Vapa\I18n\Translator;

/**
 * Read-only resource/action catalogue derived from registered definitions.
 * It lists what may be granted; it never grants anything by itself.
 */
final readonly class Catalogue
{
    public function __construct(private Registry $registry)
    {
    }

    public function entries(): array
    {
        $titles = array_column($this->registry->views(), 'title', 'resource');
        $out = [];
        foreach ($this->registry->all() as $action) {
            $out[] = [
                'resource' => $action->resource,
                'resource_label' => $titles[$action->resource] ?? $action->resource,
                'action' => $action->name,
                'label' => $action->label,
                'channels' => $action->channels,
                'write' => $action->write,
                'fields' => array_map(static fn($field) => $field->name, $action->fields),
            ];
        }
        return $out;
    }

    /** Resource id => translated title, for selection lists. */
    public function resources(): array
    {
        $out = [];
        foreach ($this->entries() as $entry) $out[$entry['resource']] ??= Translator::text($entry['resource_label']).' ('.$entry['resource'].')';
        return $out;
    }

    /** Action name => translated label; the same name may exist on several resources. */
    public function actions(): array
    {
        $out = [];
        foreach ($this->entries() as $entry) $out[$entry['action']] ??= Translator::text($entry['label']).' ('.$entry['action'].')';
        return $out;
    }

    public function allows(string $resource, string $action, string $channel): bool
    {
        foreach ($this->entries() as $entry) {
            if ($entry['resource'] === $resource && $entry['action'] === $action) return in_array($channel, $entry['channels'], true);
        }
        return false;
    }

    /** Field names that a field-level rule may name for the resource. */
    public function fields(string $resource): array
    {
        $names = array_keys($this->registry->fields($resource));
        foreach ($this->entries() as $entry) if ($entry['resource'] === $resource) $names = [...$names, ...$entry['fields']];
        return array_values(array_unique(array_diff($names, ['revision'])));
    }
}
