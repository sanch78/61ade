<?php
declare(strict_types=1);
namespace Vapa\Access;
use Vapa\Feature\{Context,Failure,Workspace};

/** Account schema and password codec are supplied by the consuming application. */
final class Passwords
{
    public function __construct(private string $table,private string $idColumn,private string $passwordColumn,private \Closure $verify,private \Closure $encode,private ?\Closure $allowed=null)
    {
        foreach([$table,$idColumn,$passwordColumn] as $name)if(!preg_match('/^[a-zA-Z_][a-zA-Z0-9_]*$/D',$name))throw new \InvalidArgumentException('Invalid credential schema');
    }
    public function change(Context $ctx,Workspace $workspace,string $target,array $values,bool $self):array
    {
        if($self && $target!==$ctx->actor->id)throw new Failure('Csak a saját jelszó módosítható.',403);
        $password=$values['new_password']??'';
        if(strlen($password)<12 || strlen($password)>128)throw new Failure('Az új jelszó 12–128 karakter legyen.');
        if(!hash_equals($password,$values['confirm_password']??''))throw new Failure('A két új jelszó eltér.');
        $q=$ctx->db->prepare("SELECT * FROM {$this->table} WHERE {$this->idColumn}=?".($ctx->db->getAttribute(\PDO::ATTR_DRIVER_NAME)==='mysql'?' FOR UPDATE':''));$q->execute([$target]);$row=$q->fetch(\PDO::FETCH_ASSOC);
        if(!$row || ($this->allowed && !($this->allowed)($row)))throw new Failure('A fiók nem módosítható.',403);
        if($self && !($this->verify)($values['current_password']??'',(string)$row[$this->passwordColumn]))throw new Failure('A jelenlegi jelszó hibás.',403);
        $q=$ctx->db->prepare("UPDATE {$this->table} SET {$this->passwordColumn}=? WHERE {$this->idColumn}=?");$q->execute([($this->encode)($password),$target]);
        $workspace->revokeSessions($target);
        return ['reauthenticate'=>$target===$ctx->actor->id];
    }
}
