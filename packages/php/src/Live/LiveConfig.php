<?php
declare(strict_types=1);
namespace Vapa\Live;
final readonly class LiveConfig
{
    public function __construct(public string $transport='poll',public string $endpoint='live',public int $interval=2000)
    {
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
    public function metadata():array{return ['transport'=>$this->transport,'endpoint'=>$this->endpoint,'interval'=>$this->interval];}
}
