<?php
declare(strict_types=1);
namespace Blade\Feature;

/**
 * The row source of a list action (`Action::$listSource`): the SQL ListSource or a ProviderList over a consumer's
 * ListProvider (docs/workspaces.md#provider-lists). Both share ListRules: one validation of a list read, one filter,
 * sort and search metadata, one cursor format, so the list view and its live observation cannot tell them apart.
 */
interface ListReader
{
    /** Manual order `{field, scope}`; null for a list sorted by the actor. */
    public ?array $order { get; }
    /** `{total, matched, items, previous, next}` of a list read (`list` action input, or `mode: watch`). */
    public function read(Context $ctx, array $input): array;
    public function filterDefinitions(Context $ctx): array;
    public function sortableFields(Context $ctx): array;
    public function searchMetadata(Context $ctx): ?array;
    /** Listable records per $field value (a parent's sub-view count); null when this source cannot count them. */
    public function countBy(Context $ctx, string $field, array $values): ?array;
    /** Listable records per matching value (count fields); null when this source cannot count them. */
    public function countMatching(Context $ctx, array $match, array $values, array $filters): ?array;
}
