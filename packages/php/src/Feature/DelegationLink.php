<?php
declare(strict_types=1);
namespace Blade\Feature;

/**
 * One consumer-owned relationship table of a Delegation (FB-0180). A row of $table grants the authenticated actor
 * (`$actorColumn`) the resource rows whose $resourceColumn equals its $objectColumn, or, with $via, the rows that a
 * child in `$via->table` names. $resourceColumn is a stored column of the resource (its key, a stored field such as
 * a parent foreign key, or a default column), never a computed, related or count value.
 */
final readonly class DelegationLink
{
    public function __construct(public string $table, public string $objectColumn, public string $actorColumn, public string $resourceColumn, public ?DelegationVia $via = null)
    {
        Delegation::identifiers([$table, $objectColumn, $actorColumn, $resourceColumn], true, [$table]);
    }
}
