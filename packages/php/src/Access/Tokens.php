<?php
declare(strict_types=1);
namespace Blade\Access;
use Blade\Feature\Failure;
/** $tenancy: blade_tokens has the tenant column (Tenancy::install); a key is bound to one tenant or global (''). */
final class Tokens
{
    public function __construct(private \PDO $db, private bool $tenancy = false) {}
    public function issue(string $actor,string $label,array $scopes,int $days=30,string $tenant=''): array
    {
        if(!$scopes || $days<1 || $days>90)throw new Failure('Érvénytelen tokenhatókör vagy lejárat.');
        if($tenant!==''&&!$this->tenancy)throw new \LogicException('Tenant-bound keys need tenancy.');
        $secret=bin2hex(random_bytes(32));$expires=gmdate('Y-m-d\TH:i:s\Z',time()+86400*$days);
        $q=$this->db->prepare('INSERT INTO blade_tokens (actor_id,label,token_hash,scopes,expires_at'.($this->tenancy?',tenant_id':'').') VALUES (?,?,?,?,?'.($this->tenancy?',?':'').')');
        $q->execute([$actor,$label,hash('sha256',$secret),json_encode(array_values($scopes),JSON_THROW_ON_ERROR),$expires,...($this->tenancy?[$tenant]:[])]);
        return ['id'=>$this->db->lastInsertId(),'secret'=>$secret,'expires_at'=>$expires];
    }
    public function authenticate(string $secret): ?array
    {
        if(!preg_match('/^[a-f0-9]{64}$/D',$secret))return null;
        $q=$this->db->prepare('SELECT actor_id,scopes'.($this->tenancy?',tenant_id':'').' FROM blade_tokens WHERE token_hash=? AND revoked=0 AND expires_at>?');$q->execute([hash('sha256',$secret),gmdate('Y-m-d\TH:i:s\Z')]);$row=$q->fetch(\PDO::FETCH_ASSOC);
        if(!$row)return null;
        return ['actor_id'=>(string)$row['actor_id'],'scopes'=>self::scopes((string)$row['scopes']),...($this->tenancy?['tenant'=>(string)$row['tenant_id']]:[])];
    }
    public function revoke(string $id,string $actor): void
    {
        $q=$this->db->prepare('UPDATE blade_tokens SET revoked=1 WHERE id=? AND actor_id=?');$q->execute([$id,$actor]);
    }
    /** Stored as a JSON list (issue) or as the admin form's comma-separated list. */
    public static function scopes(string $stored): array
    {
        if(str_starts_with($stored,'['))return json_decode($stored,true,flags:JSON_THROW_ON_ERROR);
        return array_values(array_filter(explode(',',$stored),static fn($scope)=>$scope!==''));
    }
}
