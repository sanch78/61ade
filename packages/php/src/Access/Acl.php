<?php
declare(strict_types=1);
namespace Blade\Access;

final class Acl
{
    private array $cache=[];
    public function __construct(private \PDO $db) {}
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

    public function allows(string $actor, string $resource, string $action, string $channel, ?string $id = null, ?string $owner = null, string $field = ''): bool
    {
        $allow = false;
        foreach ($this->rules($actor, $resource, $action, $channel) as $rule) {
            if ($rule['field_name'] !== $field) continue;
            $match = match ($rule['scope']) { 'all' => true, 'own' => $owner === $actor, 'id' => $id !== null && $rule['object_id'] === $id, default => false };
            if (!$match) continue;
            if ($rule['effect'] === 'deny') return false;
            if ($rule['effect'] === 'allow') $allow = true;
        }
        return $allow;
    }

    public function fieldAllowed(string $actor, string $resource, string $action, string $channel, string $id, ?string $owner, string $field): bool
    {
        $rules = array_filter($this->rules($actor, $resource, $action, $channel), static fn($r) => $r['field_name'] === $field);
        // No field rule means inherit the object's permission; any field rule makes it explicit.
        if (!$rules) return $this->allows($actor, $resource, $action, $channel, $id, $owner);
        return $this->allows($actor, $resource, $action, $channel, $id, $owner)
            && $this->allows($actor, $resource, $action, $channel, $id, $owner, $field);
    }

    /** Returns a bound SQL predicate before paging/counting; identifiers come only from registry. */
    public function predicate(string $actor, string $resource, string $action, string $channel, string $idColumn, ?string $ownerColumn): array
    {
        foreach (array_filter([$idColumn, $ownerColumn]) as $column) {
            if (!preg_match('/^[a-zA-Z_][a-zA-Z0-9_]*$/D', $column)) throw new \InvalidArgumentException('Invalid scope column');
        }
        $allow = []; $deny = []; $params = [];
        foreach ($this->rules($actor, $resource, $action, $channel) as $r) {
            if ($r['field_name'] !== '') continue;
            $value = null;
            $part = match ($r['scope']) {
                'all' => '1=1',
                'id' => "$idColumn = :p".count($params),
                'own' => $ownerColumn ? "$ownerColumn = :p".count($params) : '1=0',
                default => '1=0',
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
