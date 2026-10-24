<?php
declare(strict_types=1);
namespace Blade\Feature;

/**
 * Media lookup behind a `column.media` field (the value is a file id). Registered with
 * Registry::media(); list projections call describe() once per window and media source.
 */
interface MediaSource
{
    /**
     * Descriptors of the given ids that the actor may see on $ctx->channel; every other id
     * (unknown, invalid, not a file, denied) is absent, so no name or type leaks.
     * @param list<string> $ids
     * @return array<string,array{id:string,name:string,mime_type:string,revision:string,duration_ms:?int,width:?int,height:?int,thumbnail:'ready'|'pending'|'failed'|'none'}>
     */
    public function describe(Context $ctx, array $ids): array;

    /** @return array<string,string> MIME class => Hungarian label (translated for the browser), e.g. image => Kép */
    public function classes(): array;

    /**
     * SQL predicate, true when $column holds the id of a file of $class in this source's space that
     * the actor may see (the same rule as describe()), so the filter reveals no type of a hidden file.
     * Parameters are named (`:name`, lowercase); ListSource prefixes them to keep them unique.
     * @return array{0:string,1:array<string,scalar>}
     */
    public function classPredicate(Context $ctx, string $column, string $class): array;
}
