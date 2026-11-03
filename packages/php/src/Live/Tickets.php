<?php
declare(strict_types=1);
namespace Blade\Live;
use Blade\Feature\Failure;
final class Tickets
{
    /** $tenant: the session's active tenant at issue time; the bridge refuses the ticket once the session switched. */
    public static function issue(string $runtime,string $session,?string $tenant=null,?string $publicIdentity=null):string
    {
        $dir=$runtime.'/live';if(!is_dir($dir)&&!mkdir($dir,0700,true)&&!is_dir($dir))throw new \RuntimeException('Cannot create live storage');
        foreach(array_slice(glob($dir.'/*.json')?:[],0,100) as $old)if(filemtime($old)<time()-3600)unlink($old);
        $ticket=bin2hex(random_bytes(32));$file=$dir.'/'.hash('sha256',$ticket).'.json';
        $data=json_encode(['session'=>$session,'expires'=>time()+3600,...($tenant!==null?['tenant'=>$tenant]:[]),...($publicIdentity!==null?['publicIdentity'=>$publicIdentity]:[])],JSON_THROW_ON_ERROR | JSON_PRETTY_PRINT)."\n";
        if(file_put_contents($file,$data,LOCK_EX)===false)throw new \RuntimeException('Cannot issue live ticket');chmod($file,0600);
        return $ticket;
    }
    public static function session(string $runtime,string $ticket,int $idleTimeout=1800):array
    {
        if(!preg_match('/^[a-f0-9]{64}$/D',$ticket))throw new Failure('Érvénytelen élő kapcsolat.',401);
        $file=$runtime.'/live/'.hash('sha256',$ticket).'.json';$data=is_file($file)?json_decode(file_get_contents($file),true):null;
        if(!$data||($data['expires']??0)<time())throw new Failure('Az élő kapcsolat lejárt.',401);
        $session=$data['session']??'';
        if(!is_string($session)||!preg_match('/^[a-zA-Z0-9,-]{1,128}$/D',$session)||!is_file($runtime.'/sessions/sess_'.$session))throw new Failure('A munkamenet lejárt.',401);
        session_id($session);session_start(['read_and_close'=>true,'gc_maxlifetime'=>max($idleTimeout,(int)ini_get('session.gc_maxlifetime'))]);
        $state=$_SESSION;$_SESSION=[];
        if((!isset($state['identity'])&&!isset($state['publicIdentity']))||!isset($state['lastSeen'])||time()-$state['lastSeen']>$idleTimeout)throw new Failure('A munkamenet lejárt.',401);
        $public=is_string($data['publicIdentity']??null)?$data['publicIdentity']:null;
        if($public!==null&&(isset($state['identity'])||($state['publicIdentity']??null)!==$public))throw new Failure('A munkamenet lejárt.',401);
        if($public===null&&!isset($state['identity']))throw new Failure('A munkamenet lejárt.',401);
        return [...$state,'ticketTenant'=>is_string($data['tenant']??null)?$data['tenant']:null,'ticketPublicIdentity'=>$public];
    }
}
