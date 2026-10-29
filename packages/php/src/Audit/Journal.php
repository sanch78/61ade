<?php
declare(strict_types=1);
namespace Blade\Audit;

final class Journal
{
    private string $requestId;
    public function __construct(private \PDO $db) { $this->requestId = bin2hex(random_bytes(16)); }
    /**
     * $detail carries related object IDs only (e.g. source/target), never values or contents. $tenant is the active
     * tenant of the request; it is written only when set, so applications without tenancy keep their column list.
     */
    public function record(string $actor, string $channel, string $resource, string $action, string $object, string $outcome, array $fields = [], array $detail = [], ?string $tenant = null): void
    {
        // Without detail the pre-upgrade column list is used, so earlier schemas keep auditing.
        $values = [gmdate('Y-m-d\TH:i:s\Z'), $this->requestId, $actor, $channel, $resource, $action, $object, $outcome, json_encode(array_values($fields), JSON_THROW_ON_ERROR)];
        if ($detail) $values[] = json_encode($detail, JSON_THROW_ON_ERROR);
        $tenant = $tenant === null || $tenant === '' ? null : substr($tenant, 0, 100);
        if ($tenant !== null) $values[] = $tenant;
        $q = $this->db->prepare('INSERT INTO blade_audit (occurred_at,request_id,actor_id,channel,resource,action,object_id,outcome,field_names'.($detail ? ',detail' : '').($tenant !== null ? ',tenant_id' : '').') VALUES ('.implode(',', array_fill(0, count($values), '?')).')');
        $q->execute($values);
    }
}
