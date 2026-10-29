<?php
declare(strict_types=1);
namespace Blade\Feature;

/**
 * Server side of a view kind (toolkit contract, docs/toolkit.md#views; planned `Registry::kind`, lane K-S1).
 * Not used by the runtime yet. P2 replaces the `kind` branches of `Workspace::views()` with one provider per
 * built-in kind; project kinds use the framework's generic provider unless the project registers its own.
 */
interface ViewKindProvider
{
    /**
     * Definition-time check of $view (options, referenced fields, activation targets), called by
     * `Registry::addView`. Throws \InvalidArgumentException, so a bad declaration fails at startup, never per request.
     */
    public function validate(Registry $registry, View $view): void;

    /**
     * Browser metadata of $view for the actor of $context: the kind's `options` payload (untranslated source text;
     * `Workspace::views()` applies `Translator::presentation`), or null when the view is not offered to the actor
     * (no offered action, no readable mount, …). Called on every bootstrap; it reads ACL, never writes.
     */
    public function metadata(Context $context, View $view): ?array;
}
