<?php
declare(strict_types=1);
// JSON-lines worker for the 61ade WebSocket transport, never a public HTTP endpoint.
require getenv('BLADE_AUTOLOAD_FILE') ?: throw new RuntimeException('BLADE_AUTOLOAD_FILE is required');
$applicationFile=getenv('BLADE_APPLICATION_FILE') ?: throw new RuntimeException('BLADE_APPLICATION_FILE is required');
$app=require $applicationFile;
if(!$app instanceof Blade\Shell\ApplicationDefinition || !$app->workspace)throw new RuntimeException('A 61ade workspace is required');
ini_set('session.use_cookies','0');ini_set('session.cache_limiter','');ini_set('session.use_strict_mode','1');
ini_set('display_errors','stderr');
// Loaded classes and require_once files stay as first loaded: a changed or vanished included file ends the
// worker with 75 between requests, and the server respawns it and replays the unanswered requests.
// A file modified within the last second also keeps its content hash: a same-second, same-size rewrite has equal stat.
$loaded=[];
$stale=static function()use(&$loaded):bool{
    clearstatcache();
    foreach(get_included_files() as $f){
        $s=@stat($f);if(!$s)return true;$k="$s[mtime]/$s[size]/$s[ino]";$recent=$s['mtime']>=time()-1;
        if(!isset($loaded[$f])){$loaded[$f]=[$k,$recent?md5_file($f):null];continue;}
        [$known,$hash]=$loaded[$f];
        if($k!==$known||($hash!==null&&md5_file($f)!==$hash))return true;
        if($hash!==null&&!$recent)$loaded[$f]=[$k,null];
    }
    return false;
};
$stale();
while(!feof(STDIN)){
    $read=[STDIN];$write=[];$except=[];
    if(stream_select($read,$write,$except,2)===0){if($stale())exit(75);continue;}
    $line=fgets(STDIN,131073);if($line===false)continue;
    $id=null;
    try{
        $app=require $applicationFile;
        $request=json_decode($line,true,flags:JSON_THROW_ON_ERROR);$id=$request['id']??null;
        // An upgrade path ending in a declared name (LiveConfig::$applications) selects that application file.
        $file=$app->live->route(is_string($request['path']??null)?$request['path']:'');
        if($file!==null){$app=require $file;if(!$app instanceof Blade\Shell\ApplicationDefinition||!$app->workspace)throw new RuntimeException('A 61ade workspace is required');}
        session_name($app->sessionName);session_save_path($app->runtime.'/sessions');
        $state=Blade\Live\Tickets::session($app->runtime,(string)($request['ticket']??''));
        $actor=$app->identities->find((string)$state['identity']);
        if(!$actor||($state['credentialVersion']??0)!==$app->workspace->version($actor->id)||($app->authentication&&!($state['loginSecurityEnabled']??false)))throw new Blade\Feature\Failure('A munkamenet lejárt.',401);
        // The ticket's tenant must still be the session's tenant and a membership; a switch or revocation ends it.
        $tenant=$state['ticketTenant'];
        if($tenant!==($state['tenant']??null)||($tenant!==null&&!$app->workspace->tenancy?->member($actor->id,$tenant)))throw new Blade\Feature\Failure('A munkamenet lejárt.',401);
        $ctx=$app->workspace->context($actor,'ui',$tenant);
        // `check`: the hello of a channel, authentication only; each later observation repeats every check above.
        $result=($request['check']??false)===true?[]:$app->workspace->observe($ctx,(string)($request['resource']??''),is_array($request['query']??null)?$request['query']:[],(string)($request['version']??''));
        // fwrite, not echo: output marks headers as sent, after which the session name and path can no longer change.
        fwrite(STDOUT,json_encode(['id'=>$id,'ok'=>true,'data'=>$result],JSON_THROW_ON_ERROR|JSON_INVALID_UTF8_SUBSTITUTE)."\n");
    }catch(Throwable $e){fwrite(STDOUT,json_encode(['id'=>$id,'ok'=>false,'status'=>$e instanceof Blade\Feature\Failure?$e->status:500,'error'=>$e instanceof Blade\Feature\Failure?$e->getMessage():'Az élő kapcsolat nem érhető el.'],JSON_THROW_ON_ERROR)."\n");}
    fflush(STDOUT);
    if($stale())exit(75);
}
