<?php
declare(strict_types=1);
namespace Blade\Feature;

/**
 * Server side of a view kind (docs/toolkit.md#views). The built-in kinds `list`, `files`, `diagram` and `calendar`
 * have their own providers; a project kind uses the generic provider (GenericViewKind) unless the project registers
 * its own with `Registry::kind()`.
 */
interface ViewKindProvider
{
    /**
     * Definition-time check of $view (options, referenced fields, activation targets), called by
     * `Registry::addView`. Throws \InvalidArgumentException, so a bad declaration fails at startup, never per request.
     */
    public function validate(Registry $registry, View $view): void;

    /**
     * Browser metadata of $view for the actor of $context: `['actions' => offered action metadata, 'options' => the
     * kind's options payload]` (untranslated source text; `Workspace::views()` applies `Translator::presentation`), or
     * null when the view is not offered to the actor (no offered action, no readable mount, …). Called on every
     * bootstrap; it reads ACL, never writes. `ViewMetadata` builds the shared action and field metadata.
     */
    public function metadata(Context $context, View $view): ?array;
}
