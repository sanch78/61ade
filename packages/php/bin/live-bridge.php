<?php
declare(strict_types=1);
// JSON-lines worker for the VAPA WebSocket transport, never a public HTTP endpoint.
require getenv('VAPA_AUTOLOAD_FILE') ?: throw new RuntimeException('VAPA_AUTOLOAD_FILE is required');
$app=require getenv('VAPA_APPLICATION_FILE') ?: throw new RuntimeException('VAPA_APPLICATION_FILE is required');
if(!$app instanceof Vapa\Shell\ApplicationDefinition || !$app->workspace)throw new RuntimeException('A VAPA workspace is required');
session_name($app->sessionName);
while(($line=fgets(STDIN,131073))!==false){
    $id=null;
    try{
        $request=json_decode($line,true,flags:JSON_THROW_ON_ERROR);$id=$request['id']??null;
        $state=Vapa\Live\Tickets::session($app->runtime,(string)($request['ticket']??''));
        $actor=$app->identities->find((string)$state['identity']);
        if(!$actor||($state['credentialVersion']??0)!==$app->workspace->version($actor->id))throw new Vapa\Feature\Failure('A munkamenet lejárt.',401);
        $ctx=new Vapa\Feature\Context($actor,'ui',$app->workspace->acl,$app->workspace->db);
        $result=$app->workspace->observe($ctx,$request['resource']??'', $request['query']??[], $request['version']??'');
        echo json_encode(['id'=>$id,'ok'=>true,'data'=>$result],JSON_THROW_ON_ERROR|JSON_INVALID_UTF8_SUBSTITUTE)."\n";
    }catch(Throwable $e){echo json_encode(['id'=>$id,'ok'=>false,'status'=>$e instanceof Vapa\Feature\Failure?$e->status:500,'error'=>$e instanceof Vapa\Feature\Failure?$e->getMessage():'Az élő kapcsolat nem érhető el.'],JSON_THROW_ON_ERROR)."\n";}
    fflush(STDOUT);
}
