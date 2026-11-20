<?php
declare(strict_types=1);
namespace Blade\Feature;

/**
 * A consumer's windowed row source of a ProviderResource (docs/workspaces.md#provider-lists): rows that are not an SQL
 * table (an API, files, a report computed from several sources). 61ade validates the read and passes a ListQuery; the
 * provider answers one window. A small row set that fits in memory needs no provider class: ProviderResource takes a
 * closure returning every row, and 61ade filters, sorts, windows and counts it.
 *
 * The provider scopes its rows to the actor and tenant of the Context itself (its business rule); 61ade checks the
 * `list` and `get` actions and the field ACL of every value it returns, and refuses a windowed read unless the actor's
 * list permission is unrestricted (an `all` allow and no object deny), because it cannot filter a foreign window.
 */
interface ListProvider
{
    /**
     * One window of the rows matching $query (its `conditions`, `search` and `sort`, `offset`, at most `limit` rows), in
     * that order: `{rows: list<array>, total: int, matched: int, notice?: array}`. `total` counts every row the actor
     * may list, `matched` those of the query. Each row holds the key field and the declared fields' values.
     */
    public function rows(Context $ctx, ListQuery $query): array;
    /** The row with key $key, or null when there is none (or the actor may not see it). */
    public function row(Context $ctx, string $key): ?array;
}
