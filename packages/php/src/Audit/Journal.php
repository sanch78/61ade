<?php
declare(strict_types=1);
namespace Vapa\Audit;

final class Journal
{
    private string $requestId;
    public function __construct(private \PDO $db) { $this->requestId = bin2hex(random_bytes(16)); }
    public function record(string $actor, string $channel, string $resource, string $action, string $object, string $outcome, array $fields = []): void
    {
        $q = $this->db->prepare('INSERT INTO vapa_audit (occurred_at,request_id,actor_id,channel,resource,action,object_id,outcome,field_names) VALUES (?,?,?,?,?,?,?,?,?)');
        $q->execute([gmdate('Y-m-d\TH:i:s\Z'), $this->requestId, $actor, $channel, $resource, $action, $object, $outcome, json_encode(array_values($fields), JSON_THROW_ON_ERROR)]);
    }
}
