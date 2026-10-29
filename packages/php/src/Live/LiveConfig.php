<?php
declare(strict_types=1);
namespace Blade\Live;
final readonly class LiveConfig
{
    /** @param array<string,string> $applications further application files the live server started with this application serves at "<endpoint>/<name>" */
    public function __construct(public string $transport='poll',public string $endpoint='live',public int $interval=2000,public array $applications=[])
    {
        foreach($applications as $name=>$file)if(!is_string($name)||!preg_match('/^[a-z][a-z0-9-]{0,31}$/D',$name)||!is_string($file)||!str_starts_with($file,'/')||preg_match('/[\x00-\x1f]/',$file))throw new \InvalidArgumentException('Invalid live application');
        if(!in_array($transport,['poll','websocket'],true)||$interval<500||$interval>30000||preg_match('/[\x00-\x20]/',$endpoint))throw new \InvalidArgumentException('Invalid live configuration');
        if(!str_starts_with($endpoint,'ws://')&&!str_starts_with($endpoint,'wss://')&&!preg_match('/^[a-zA-Z0-9_\/-]+$/D',$endpoint))throw new \InvalidArgumentException('Invalid WebSocket endpoint');
    }
    public function connectSource():string
    {
        $url=parse_url($this->endpoint);
        if(!isset($url['scheme']))return '';
        if(!in_array($url['scheme'],['ws','wss'],true)||!preg_match('/^[a-zA-Z0-9.-]+$/D',$url['host']??''))throw new \InvalidArgumentException('Invalid WebSocket origin');
        return $url['scheme'].'://'.$url['host'].(isset($url['port'])?':'.$url['port']:'');
    }
    /** The application file for an upgrade path whose last segment names a further application; null serves this one. */
    public function route(string $path):?string{return $this->applications[basename(parse_url($path,PHP_URL_PATH)?:'/')]??null;}
    public function metadata():array{return ['transport'=>$this->transport,'endpoint'=>$this->endpoint,'interval'=>$this->interval];}
}
