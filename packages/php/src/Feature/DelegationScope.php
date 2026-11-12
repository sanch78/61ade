<?php
declare(strict_types=1);
namespace Blade\Feature;

/**
 * A resource's Delegation bound to its storage (SqlResource::register, FB-0180); Acl evaluates `delegated` rules with
 * it. Every SQL identifier comes from the validated declaration; the actor, ids and destination values are bound.
 * The link subqueries use their own `blade_dl*`/`blade_dv*` aliases and compare with the explicitly qualified outer
 * row, so a link table with the same column names never shadows the resource row.
 */
final class DelegationScope
{
    private static int $sequence = 0;
    /**
     * $rowFilter: the resource's own row condition (`where`, archive policy) over its unaliased columns.
     * $resolve: the resource's authoritative resolver (Context, id) => target (tenant realm, `where`, archive), 404 otherwise.
     * $deferred: actions whose handler checks the final values itself (SqlResource `create`).
     */
    public function __construct(public readonly Delegation $delegation, private readonly string $resource, private readonly string $table, private readonly string $key, private readonly \Closure $rowFilter, private readonly \Closure $resolve, private readonly Registry $registry, private readonly array $deferred = [])
    {
    }
    /** `write` for a registered write action of the resource, `read` for its other actions; an unknown action fails closed. */
    public function set(string $action): string
    {
        try { $known = $this->registry->get($this->resource, $action); } catch (Failure) { throw new \LogicException("Delegated rule for the unknown action {$this->resource}.$action."); }
        return $known->write ? 'write' : 'read';
    }
    public function defers(string $action): bool { return in_array($action, $this->deferred, true); }
    /**
     * OR of the $set links as SQL: correlated with the row alias $outer, or with the bound $destination values (the
     * final row of a create or update). A link whose resource column has no destination value matches nothing.
     */
    public function sql(string $set, string $actor, array &$params, ?string $outer = null, ?array $destination = null): string
    {
        // The outer row is this resource's table or its row-source alias, never another table's rows (a Lookup or
        // list source over a different table fails closed).
        if ($outer !== null && $outer !== 'blade_source' && strcasecmp($outer, $this->table) !== 0) throw new \LogicException("Delegated scope of {$this->resource} over the rows of $outer.");
        $parts = [];
        foreach ($set === 'write' ? $this->delegation->write : $this->delegation->read as $link) {
            // The outer row is named by its alias or bare table; no link or intermediate table may carry that name.
            if ($outer !== null && (strcasecmp($outer, $link->table) === 0 || ($link->via !== null && strcasecmp($outer, $link->via->table) === 0))) throw new \LogicException("A delegation table of {$this->resource} has the name of the outer row.");
            $n = self::$sequence++;
            if ($outer !== null) $value = "$outer.{$link->resourceColumn}";
            else {
                $raw = $destination[$link->resourceColumn] ?? null;
                if ($raw === null || !is_scalar($raw) || (string) $raw === '') { $parts[] = '1=0'; continue; }
                $value = ":blade_dv$n"; $params["blade_dv$n"] = (string) $raw;
            }
            $params["blade_da$n"] = $actor;
            $parts[] = $link->via === null
                ? "EXISTS (SELECT 1 FROM {$link->table} blade_dl$n WHERE blade_dl$n.{$link->actorColumn} = :blade_da$n AND blade_dl$n.{$link->objectColumn} = $value)"
                : "EXISTS (SELECT 1 FROM {$link->table} blade_dl$n JOIN {$link->via->table} blade_dc$n ON blade_dc$n.{$link->via->key} = blade_dl$n.{$link->objectColumn} WHERE blade_dl$n.{$link->actorColumn} = :blade_da$n AND blade_dc$n.{$link->via->parentColumn} = $value)";
        }
        return $parts ? '('.implode(' OR ', $parts).')' : '1=0';
    }
    /** Whether the stored row $id (read from the resource table, not from a caller's row) is linked to $actor in $set. */
    public function linkedRow(\PDO $db, string $set, string $actor, string $id): bool
    {
        $params = ['blade_did' => $id];
        // The bare table qualifies the correlation (no link table may carry its name), so a `where` naming the table works.
        $q = $db->prepare("SELECT 1 FROM {$this->table} WHERE {$this->table}.{$this->key} = :blade_did AND (".($this->rowFilter)().') AND '.$this->sql($set, $actor, $params, $this->table).' LIMIT 1');
        $q->execute($params);
        return $q->fetchColumn() !== false;
    }
    /** Whether the final row values $destination are linked to $actor in $set. */
    public function linkedValues(\PDO $db, string $set, string $actor, array $destination): bool
    {
        $params = [];
        $sql = $this->sql($set, $actor, $params, null, $destination);
        if ($sql === '1=0') return false;
        $q = $db->prepare("SELECT CASE WHEN $sql THEN 1 ELSE 0 END");
        $q->execute($params);
        return (int) $q->fetchColumn() === 1;
    }
    /** Whether $actor holds any link of $set at all (an upload staged for a deferred create needs one). */
    public function anyLink(\PDO $db, string $set, string $actor): bool
    {
        foreach ($set === 'write' ? $this->delegation->write : $this->delegation->read as $link) {
            $q = $db->prepare("SELECT 1 FROM {$link->table} WHERE {$link->actorColumn} = ? LIMIT 1");
            $q->execute([$actor]);
            if ($q->fetchColumn() !== false) return true;
        }
        return false;
    }
    /**
     * The authoritative target of $id for $ctx (tenant realm, `where`, archive policy; Failure 404 when not visible).
     * A resolver's own `row` must be this stored row: every stored column present with the same value, otherwise
     * the row context is not verified and the action fails closed (403).
     */
    public function verify(Context $ctx, string $id, ?array $claimed = null): array
    {
        $target = ($this->resolve)($ctx, $id);
        if (is_array($claimed['row'] ?? null)) {
            foreach ($target['row'] as $column => $value) {
                if (!array_key_exists($column, $claimed['row'])) throw new Failure('Nincs hozzáférés.', 403);
                $other = $claimed['row'][$column];
                if (($value === null) !== ($other === null) || ($value !== null && (!is_scalar($other) || (string) $value !== (string) $other))) throw new Failure('Nincs hozzáférés.', 403);
            }
        }
        return $target;
    }
}
