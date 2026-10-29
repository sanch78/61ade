<?php
declare(strict_types=1);
// JSON-lines worker for the 61de WebSocket transport, never a public HTTP endpoint.
require getenv('BLADE_AUTOLOAD_FILE') ?: throw new RuntimeException('BLADE_AUTOLOAD_FILE is required');
$applicationFile=getenv('BLADE_APPLICATION_FILE') ?: throw new RuntimeException('BLADE_APPLICATION_FILE is required');
$app=require $applicationFile;
if(!$app instanceof Blade\Shell\ApplicationDefinition || !$app->workspace)throw new RuntimeException('A 61de workspace is required');
session_name($app->sessionName);session_save_path($app->runtime.'/sessions');
ini_set('session.use_cookies','0');ini_set('session.cache_limiter','');ini_set('session.use_strict_mode','1');
ini_set('display_errors','stderr');
while(!feof(STDIN)){
    $read=[STDIN];$write=[];$except=[];
    if(stream_select($read,$write,$except,30)===0)continue;
    $line=fgets(STDIN,131073);if($line===false)continue;
    $id=null;
    try{
        $app=require $applicationFile;
        $request=json_decode($line,true,flags:JSON_THROW_ON_ERROR);$id=$request['id']??null;
        $state=Blade\Live\Tickets::session($app->runtime,(string)($request['ticket']??''));
        $actor=$app->identities->find((string)$state['identity']);
        if(!$actor||($state['credentialVersion']??0)!==$app->workspace->version($actor->id)||($app->authentication&&!($state['loginSecurityEnabled']??false)))throw new Blade\Feature\Failure('A munkamenet lejárt.',401);
        // The ticket's tenant must still be the session's tenant and a membership; a switch or revocation ends it.
        $tenant=$state['ticketTenant'];
        if($tenant!==($state['tenant']??null)||($tenant!==null&&!$app->workspace->tenancy?->member($actor->id,$tenant)))throw new Blade\Feature\Failure('A munkamenet lejárt.',401);
        $ctx=$app->workspace->context($actor,'ui',$tenant);
        $result=$app->workspace->observe($ctx,$request['resource']??'', $request['query']??[], $request['version']??'');
        echo json_encode(['id'=>$id,'ok'=>true,'data'=>$result],JSON_THROW_ON_ERROR|JSON_INVALID_UTF8_SUBSTITUTE)."\n";
    }catch(Throwable $e){echo json_encode(['id'=>$id,'ok'=>false,'status'=>$e instanceof Blade\Feature\Failure?$e->status:500,'error'=>$e instanceof Blade\Feature\Failure?$e->getMessage():'Az élő kapcsolat nem érhető el.'],JSON_THROW_ON_ERROR)."\n";}
    fflush(STDOUT);
}
