<?php
declare(strict_types=1);
namespace Blade\Feature;

/**
 * References of other records to objects of one resource (Registry::usage). Delete actions of that resource
 * report the counts in a preview (`preview: '1'`) and, when applied, call clear() inside the deleting transaction,
 * under both delete policies, so archived objects behave as deleted everywhere.
 */
interface UsageProvider
{
    /**
     * Reference counts of the given ids that are referenced; unreferenced ids may be absent. A label is a Hungarian
     * message key naming the referencing kind (e.g. `Műsorterv-események`), never a name of another record.
     * @param list<string> $ids
     * @return array<string,list<array{label:string,count:int}>>
     */
    public function usages(Context $ctx, array $ids): array;

    /**
     * Removes or blanks the references to $ids (the provider's own decision) within the caller's transaction.
     * @param list<string> $ids
     * @param 'delete'|'archive' $policy the delete policy of the deleting resource
     */
    public function clear(Context $ctx, array $ids, string $policy): void;
}
