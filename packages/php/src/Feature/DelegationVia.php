<?php
declare(strict_types=1);
namespace Blade\Feature;

/**
 * The one intermediate table of a DelegationLink (FB-0180): a parent resource row is reached through ownership of a
 * child. The link holds the child (`link.objectColumn = via.key`), the child names the parent (`via.parentColumn =
 * resource.resourceColumn`).
 */
final readonly class DelegationVia
{
    public function __construct(public string $table, public string $key, public string $parentColumn)
    {
        Delegation::identifiers([$table, $key, $parentColumn], true, [$table]);
    }
}
