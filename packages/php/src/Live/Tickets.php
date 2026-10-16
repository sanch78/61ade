<?php
declare(strict_types=1);
namespace Vapa\Live;
use Vapa\Feature\Failure;
final class Tickets
{
    public static function issue(string $runtime,string $session):string
    {
        $dir=$runtime.'/live';if(!is_dir($dir)&&!mkdir($dir,0700,true)&&!is_dir($dir))throw new \RuntimeException('Cannot create live storage');
        foreach(array_slice(glob($dir.'/*.json')?:[],0,100) as $old)if(filemtime($old)<time()-3600)unlink($old);
        $ticket=bin2hex(random_bytes(32));$file=$dir.'/'.hash('sha256',$ticket).'.json';
        $data=json_encode(['session'=>$session,'expires'=>time()+3600],JSON_THROW_ON_ERROR);
        if(file_put_contents($file,$data,LOCK_EX)===false)throw new \RuntimeException('Cannot issue live ticket');chmod($file,0600);
        return $ticket;
    }
    public static function session(string $runtime,string $ticket):array
    {
        if(!preg_match('/^[a-f0-9]{64}$/D',$ticket))throw new Failure('Érvénytelen élő kapcsolat.',401);
        $file=$runtime.'/live/'.hash('sha256',$ticket).'.json';$data=is_file($file)?json_decode(file_get_contents($file),true):null;
        if(!$data||($data['expires']??0)<time())throw new Failure('Az élő kapcsolat lejárt.',401);
        $session=$data['session']??'';
        if(!is_string($session)||!preg_match('/^[a-zA-Z0-9,-]{1,128}$/D',$session)||!is_file($runtime.'/sessions/sess_'.$session))throw new Failure('A munkamenet lejárt.',401);
        session_id($session);session_start(['read_and_close'=>true]);
        $state=$_SESSION;$_SESSION=[];
        if(!isset($state['identity'],$state['lastSeen'])||time()-$state['lastSeen']>1800)throw new Failure('A munkamenet lejárt.',401);
        return $state;
    }
}
