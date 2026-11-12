<?php
declare(strict_types=1);
namespace Blade\Access;

final class Acl
{
    private array $cache=[];
    /**
     * $delegations: resource => its DelegationScope or null (Registry::delegation(), FB-0180). Rules with scope
     * `delegated` need one; without it they are a configuration error and the operation fails (LogicException).
     */
    public function __construct(private \PDO $db, private ?\Closure $delegations = null) {}
    public function invalidate():void{$this->cache=[];}

    public function rules(string $actor, string $resource, string $action, string $channel): array
    {
        $key=json_encode([$actor,$resource,$action,$channel],JSON_THROW_ON_ERROR);
        if(isset($this->cache[$key]))return $this->cache[$key];
        // Role ids are bound as strings rather than compared through CAST(role_id AS CHAR): on MySQL that expression
        // takes the connection collation and fails against a differently collated subject_id column (FB-0179).
        $roles = $this->db->prepare('SELECT role_id FROM blade_memberships WHERE actor_id = ?');
        $roles->execute([$actor]);
        $roles = array_map('strval', $roles->fetchAll(\PDO::FETCH_COLUMN));
        $byRole = $roles ? " OR (subject_type = 'role' AND subject_id IN (".implode(',', array_fill(0, count($roles), '?')).'))' : '';
        $q = $this->db->prepare("SELECT * FROM blade_rules WHERE resource = ? AND action = ? AND channel = ? AND ((subject_type = 'user' AND subject_id = ?)$byRole)");
        $q->execute([$resource, $action, $channel, $actor, ...$roles]);
        return $this->cache[$key]=$q->fetchAll(\PDO::FETCH_ASSOC);
    }

    /** Whether $actor holds a role with one of the $roles keys (`blade_roles.role_key`), read fresh per action like the rules. */
    public function holds(string $actor, array $roles): bool
    {
        if(!$roles)return false;
        $key=json_encode(['holds',$actor,...$roles],JSON_THROW_ON_ERROR);
        if(isset($this->cache[$key]))return $this->cache[$key];
        $q=$this->db->prepare('SELECT COUNT(*) FROM blade_memberships m JOIN blade_roles r ON r.id = m.role_id WHERE m.actor_id = ? AND r.role_key IN ('.implode(',',array_fill(0,count($roles),'?')).')');
        $q->execute([$actor,...array_values($roles)]);
        return $this->cache[$key]=(int)$q->fetchColumn()>0;
    }

    /**
     * Object (or, with $field, field) decision: deny wins over allow. A `delegated` rule (FB-0180) matches when the
     * actor reaches the row through the resource's Delegation links: the read links for a non-write action, the
     * write links for a write action. Its subject is $destination (the final values of a create or update) when
     * given, otherwise the stored row $id. Without either a delegated allow grants nothing and a delegated deny
     * denies (no verified context), unless $deferred (a create whose handler checks the final values itself): then
     * the allow counts and the deny waits for that check. A delegated write allow on a stored row also needs the
     * effective `get` of that row on the same channel, and $readable false (an API token without the `get` scope)
     * makes it grant nothing; a delegated deny uses the raw link set. A deny with an unknown scope fails closed.
     */
    public function allows(string $actor, string $resource, string $action, string $channel, ?string $id = null, ?string $owner = null, string $field = '', ?array $destination = null, bool $deferred = false, bool $readable = true): bool
    {
        $allow = false;
        foreach ($this->rules($actor, $resource, $action, $channel) as $rule) {
            if ($rule['field_name'] !== $field) continue;
            $match = match ($rule['scope']) {
                'all' => true,
                'own' => $owner === $actor,
                'id' => $id !== null && $rule['object_id'] === $id,
                'delegated' => $this->delegated($actor, $resource, $action, $channel, $rule['effect'], $id, $owner, $destination, $deferred, $readable),
                default => $rule['effect'] === 'deny',
            };
            if (!$match) continue;
            if ($rule['effect'] === 'deny') return false;
            if ($rule['effect'] === 'allow') $allow = true;
        }
        return $allow;
    }

    public function fieldAllowed(string $actor, string $resource, string $action, string $channel, string $id, ?string $owner, string $field, ?array $destination = null, bool $deferred = false, bool $readable = true): bool
    {
        $rules = array_filter($this->rules($actor, $resource, $action, $channel), static fn($r) => $r['field_name'] === $field);
        $id = $id === '' ? null : $id;
        // No field rule means inherit the object's permission; any field rule makes it explicit.
        if (!$rules) return $this->allows($actor, $resource, $action, $channel, $id, $owner, '', $destination, $deferred, $readable);
        return $this->allows($actor, $resource, $action, $channel, $id, $owner, '', $destination, $deferred, $readable)
            && $this->allows($actor, $resource, $action, $channel, $id, $owner, $field, $destination, $deferred, $readable);
    }

    /** Whether any rule of the action (object or field) has scope `delegated`: its writes then need the final-value check. */
    public function delegates(string $actor, string $resource, string $action, string $channel): bool
    {
        return (bool) array_filter($this->rules($actor, $resource, $action, $channel), static fn($r) => $r['scope'] === 'delegated');
    }

    /** The resource's DelegationScope; a `delegated` rule without one is a configuration error. */
    private function scope(string $resource): \Blade\Feature\DelegationScope
    {
        $scope = $this->delegations ? ($this->delegations)($resource) : null;
        if (!$scope instanceof \Blade\Feature\DelegationScope) throw new \LogicException("A delegated rule of $resource needs its delegation declaration.");
        return $scope;
    }

    private function delegated(string $actor, string $resource, string $action, string $channel, string $effect, ?string $id, ?string $owner, ?array $destination, bool $deferred, bool $readable): bool
    {
        $scope = $this->scope($resource);
        $set = $scope->set($action);
        if ($destination !== null) return $scope->linkedValues($this->db, $set, $actor, $destination);
        if ($id === null) return $deferred ? $effect === 'allow' : $effect === 'deny';
        $key = json_encode(['delegated', $resource, $set, $actor, $id], JSON_THROW_ON_ERROR);
        $linked = $this->cache[$key] ??= $scope->linkedRow($this->db, $set, $actor, $id);
        if (!$linked || $effect !== 'allow' || $set !== 'write') return $linked;
        return $readable && $this->allows($actor, $resource, 'get', $channel, $id, $owner);
    }

    /**
     * Returns a bound SQL predicate before paging/counting; identifiers come only from registry. A `delegated` rule
     * correlates its links with the row alias $qualifier, which the caller must give (a LogicException otherwise);
     * it is supported for non-write actions (the listing reads).
     */
    public function predicate(string $actor, string $resource, string $action, string $channel, string $idColumn, ?string $ownerColumn, ?string $qualifier = null): array
    {
        foreach (array_filter([$idColumn, $ownerColumn, $qualifier]) as $column) {
            if (!preg_match('/^[a-zA-Z_][a-zA-Z0-9_]*$/D', $column)) throw new \InvalidArgumentException('Invalid scope column');
        }
        $allow = []; $deny = []; $params = [];
        foreach ($this->rules($actor, $resource, $action, $channel) as $r) {
            if ($r['field_name'] !== '') continue;
            $value = null;
            if ($r['scope'] === 'delegated') {
                $scope = $this->scope($resource);
                if ($qualifier === null) throw new \LogicException("A delegated rule of $resource needs a qualified row source.");
                if ($scope->set($action) !== 'read') throw new \LogicException("Delegated SQL scope is for read actions: $resource.$action.");
                $part = $scope->sql('read', $actor, $params, $qualifier);
            } else $part = match ($r['scope']) {
                'all' => '1=1',
                'id' => "$idColumn = :p".count($params),
                'own' => $ownerColumn ? "$ownerColumn = :p".count($params) : '1=0',
                // An unknown scope grants nothing, and as a deny it denies everything (fail closed).
                default => $r['effect'] === 'deny' ? '1=1' : '1=0',
            };
            if ($r['scope'] === 'id') $value = $r['object_id'];
            elseif ($r['scope'] === 'own' && $ownerColumn) $value = $actor;
            if ($value !== null) $params['p'.count($params)] = $value;
            if ($r['effect'] === 'allow') $allow[] = $part;
            else $deny[] = $part;
        }
        return ['('.($allow ? implode(' OR ', $allow) : '1=0').') AND NOT ('.($deny ? implode(' OR ', $deny) : '1=0').')', $params];
    }
}
