<?php
declare(strict_types=1);
namespace Vapa\Access;
use Vapa\Feature\Failure;
final class Tokens
{
    public function __construct(private \PDO $db) {}
    public function issue(string $actor,string $label,array $scopes,int $days=30): array
    {
        if(!$scopes || $days<1 || $days>90)throw new Failure('Érvénytelen tokenhatókör vagy lejárat.');
        $secret=bin2hex(random_bytes(32));$expires=gmdate('Y-m-d\TH:i:s\Z',time()+86400*$days);
        $q=$this->db->prepare('INSERT INTO vapa_tokens (actor_id,label,token_hash,scopes,expires_at) VALUES (?,?,?,?,?)');
        $q->execute([$actor,$label,hash('sha256',$secret),json_encode(array_values($scopes),JSON_THROW_ON_ERROR),$expires]);
        return ['id'=>$this->db->lastInsertId(),'secret'=>$secret,'expires_at'=>$expires];
    }
    public function authenticate(string $secret): ?array
    {
        if(!preg_match('/^[a-f0-9]{64}$/D',$secret))return null;
        $q=$this->db->prepare('SELECT actor_id,scopes FROM vapa_tokens WHERE token_hash=? AND revoked=0 AND expires_at>?');$q->execute([hash('sha256',$secret),gmdate('Y-m-d\TH:i:s\Z')]);$row=$q->fetch(\PDO::FETCH_ASSOC);
        if(!$row)return null;
        return ['actor_id'=>(string)$row['actor_id'],'scopes'=>json_decode($row['scopes'],true,flags:JSON_THROW_ON_ERROR)];
    }
    public function revoke(string $id,string $actor): void
    {
        $q=$this->db->prepare('UPDATE vapa_tokens SET revoked=1 WHERE id=? AND actor_id=?');$q->execute([$id,$actor]);
    }
}
