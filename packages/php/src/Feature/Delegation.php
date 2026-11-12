<?php
declare(strict_types=1);
namespace Blade\Feature;

/**
 * Opt-in delegated access of a SqlResource (FB-0180, docs/access-and-actions.md#delegated-access): ACL rules with
 * scope `delegated` match the rows that the actor reaches through consumer-owned relationship tables. $read links
 * serve the non-write actions (list, get, lookups, counts, observations), $write links the write actions. The links
 * of one set are OR-combined; an empty set grants nothing. A delegated write allow on an existing row also needs
 * the effective `get` of that row; create and changed destinations are checked against the final values.
 */
final readonly class Delegation
{
    /** @param list<DelegationLink> $read @param list<DelegationLink> $write */
    public function __construct(public array $read = [], public array $write = [])
    {
        foreach ([$read, $write] as $links) {
            if (!array_is_list($links) || count($links) > 10 || array_filter($links, static fn($link) => !$link instanceof DelegationLink)) throw new \InvalidArgumentException('Invalid delegation links.');
        }
    }
    /**
     * SQL identifiers of a delegation: plain names. $tables (and every name with $table true) may not start with
     * `blade_` in any case: those are the framework's tables and the correlation aliases of the delegated SQL.
     */
    public static function identifiers(array $names, bool $plain, array $tables = []): void
    {
        foreach ($names as $name) if (!is_string($name) || !preg_match('/^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/D', $name)) throw new \InvalidArgumentException('Invalid delegation identifier.');
        foreach ($tables as $table) if (str_starts_with(strtolower($table), 'blade_')) throw new \InvalidArgumentException('A delegation table may not be a blade_ table.');
    }
}
