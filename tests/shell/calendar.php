<?php
declare(strict_types=1);
require dirname(__DIR__,2).'/examples/demo-app/vendor/autoload.php';
use Blade\Access\Schema;
use Blade\Calendar\{CalendarDefinition,Recurrence};
use Blade\Feature\{Registry,Workspace,Context,Failure,Field};
use Blade\Shell\Identity;
// Event calendar contract: RRULE subset, definition checks, metadata, ACL, exceptions, revisions, server-side expansion.
function check(bool $ok,string $message):void{if(!$ok)throw new RuntimeException($message);}
function fails(callable $call,int $status,string $message):Failure{try{$call();}catch(Failure $e){check($e->status===$status,$message.' (status '.$e->status.': '.$e->getMessage().')');return $e;}throw new RuntimeException($message.' (accepted)');}
$d=fn(string $s)=>new DateTimeImmutable($s,new DateTimeZone('UTC'));
$starts=fn(string $rule,string $start,int $duration,string $from,string $to,?string $end=null)=>array_map(fn($x)=>$x->format('Y-m-d H:i'),Recurrence::starts($rule,$d($start),$duration,$d($from),$d($to),$end?$d($end):null));

// Recurrence subset produced by the Scheduler editor.
check($starts('FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,WE,FR','2026-10-01 08:00',3600,'2026-10-19','2026-10-26')===['2026-10-19 08:00','2026-10-21 08:00','2026-10-23 08:00'],'Weekly BYDAY');
check($starts('FREQ=DAILY;INTERVAL=2;COUNT=3','2026-10-20 10:00',600,'2026-10-01','2026-11-30')===['2026-10-20 10:00','2026-10-22 10:00','2026-10-24 10:00'],'Daily COUNT');
check($starts('FREQ=MONTHLY;BYDAY=MO;BYSETPOS=2','2026-01-12 09:00',600,'2026-09-01','2026-11-01')===['2026-09-14 09:00','2026-10-12 09:00'],'Second Monday');
check($starts('FREQ=MONTHLY;BYDAY=FR;BYSETPOS=-1','2026-01-30 09:00',600,'2026-10-01','2026-11-01')===['2026-10-30 09:00'],'Last Friday');
check($starts('FREQ=MONTHLY;BYMONTHDAY=31','2026-01-31 09:00',600,'2026-02-01','2026-05-01')===['2026-03-31 09:00'],'Missing 31st skipped');
check($starts('FREQ=YEARLY;BYMONTH=10;BYMONTHDAY=24','2020-10-24 09:00',600,'2026-01-01','2028-01-01')===['2026-10-24 09:00','2027-10-24 09:00'],'Yearly');
check($starts('FREQ=DAILY;UNTIL=20261022T235959Z','2026-10-20 23:30',3600,'2026-10-21','2026-10-30')===['2026-10-20 23:30','2026-10-21 23:30','2026-10-22 23:30'],'UNTIL and overlap from the previous day');
check($starts('FREQ=DAILY','2026-10-20 08:00',60,'2026-10-20','2026-10-30','2026-10-22 08:00')===['2026-10-20 08:00','2026-10-21 08:00'],'Series end is exclusive');
check(count($starts('FREQ=DAILY','1990-01-01 08:00',60,'2026-10-20','2026-10-21'))===1,'Distant start skips whole periods');
foreach(['FREQ=HOURLY','FREQ=DAILY;BYHOUR=3','FREQ=WEEKLY;BYMONTHDAY=3','FREQ=MONTHLY;BYSETPOS=2','FREQ=DAILY;INTERVAL=0','FREQ=DAILY;FREQ=DAILY','FREQ=WEEKLY;BYDAY=1MO'] as $bad)fails(fn()=>Recurrence::parse($bad),400,'Rejected rule '.$bad);

// Definition checks.
$db=new PDO('sqlite::memory:',null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);Schema::install($db);
CalendarDefinition::install($db);CalendarDefinition::install($db);
$field=new Field('asset_id','Content','select',required:true,options:['a'=>'Alpha','b'=>'Beta']);
foreach([
    fn()=>new CalendarDefinition('cal','Calendar','Bad space'),
    fn()=>new CalendarDefinition('cal','Calendar','test',views:['year']),
    fn()=>new CalendarDefinition('cal','Calendar','test',views:['day'],defaultView:'week'),
    fn()=>new CalendarDefinition('cal','Calendar','test',[new Field('rrule','x')]),
    fn()=>new CalendarDefinition('cal','Calendar','test',[new Field('secret','x','password',secret:true)]),
    fn()=>new CalendarDefinition('cal','Calendar','test',firstHour:10,lastHour:9),
    fn()=>new CalendarDefinition('cal','Calendar','test',dayAction:['resource'=>'x']),
] as $invalid){try{$invalid();throw new RuntimeException('invalid definition accepted');}catch(InvalidArgumentException){}}

$definition=new CalendarDefinition('cal','Calendar','test',[$field],maxRangeDays:31,dayAction:['resource'=>'day','action'=>'show','label'=>'Day']);
$registry=new Registry();$workspace=new Workspace($registry,$db);$definition->register($workspace);
$registry->add(new Blade\Feature\Action('day','show','Day',[],fn()=>[]));
$rule=$db->prepare("INSERT INTO blade_rules(subject_type,subject_id,resource,action,channel,effect,scope,object_id,field_name) VALUES ('user',?,?,?,?,?,'all','',?)");
foreach(['events','occurrences','create','update','delete'] as $a)$rule->execute(['1','cal',$a,'ui','allow','']);
$rule->execute(['1','day','show','ui','allow','']);$rule->execute(['1','cal','occurrences','api','allow','']);
foreach(['events','occurrences'] as $a){$rule->execute(['2','cal',$a,'ui','allow','']);$rule->execute(['2','cal',$a,'ui','deny','asset_id']);}
$ctx=fn(string $actor='1',string $channel='ui',array $scopes=[])=>new Context(new Identity($actor,'Actor '.$actor),$channel,$workspace->acl,$db,$scopes);
$call=fn(string $action,?string $id,array $values=[],string $actor='1')=>$workspace->executor->execute($ctx($actor),'cal',$action,$id,$values);

// Metadata: offered actions, readable extra fields, day action only if offered; the space stays server-side.
$view=fn($actor)=>array_values(array_filter($workspace->views(new Identity($actor,'x')),fn($v)=>$v['resource']==='cal'));
$full=$view('1')[0];
check($full['kind']==='calendar'&&array_column($full['actions'],'name')===['events','occurrences','create','update','delete'],'Calendar actions');
check($full['options']['day_action']['action']==='show'&&array_column($full['options']['fields'],'name')===['asset_id'],'Day action and fields');
check(!str_contains(json_encode($full),'"test"'),'Space key stays server-side');
check(array_column($view('2')[0]['actions'],'name')===['events','occurrences']&&$view('2')[0]['options']['fields']===[]&&$view('2')[0]['options']['day_action']===null,'Read-only metadata');
check($view('3')===[],'No view without rules');

// Writes: series, single event, validation and read-only denial.
$series=$call('create',null,['text'=>'Promo','start_date'=>'2026-10-19 08:00','end_date'=>'9999-02-01 00:00','rrule'=>'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR','duration'=>'7200','asset_id'=>'a']);
$single=$call('create',null,['text'=>'Event','start_date'=>'2026-10-21 09:00','end_date'=>'2026-10-21 12:00','asset_id'=>'b']);
fails(fn()=>$call('create',null,['text'=>'x','start_date'=>'2026-10-21 09:00','end_date'=>'2026-10-21 08:00','asset_id'=>'a']),400,'End before start');
fails(fn()=>$call('create',null,['text'=>'x','start_date'=>'2026-10-21 09:00','end_date'=>'2026-10-21 10:00','asset_id'=>'z']),400,'Unknown option');
fails(fn()=>$call('create',null,['text'=>'x','start_date'=>'2026-10-21 9:00','end_date'=>'2026-10-21 10:00','asset_id'=>'a']),400,'Date format');
fails(fn()=>$call('create',null,['text'=>'x','start_date'=>'2026-10-21 09:00','end_date'=>'2026-10-21 10:00','rrule'=>'FREQ=DAILY','duration'=>'0','asset_id'=>'a']),400,'Recurring needs duration');
fails(fn()=>$call('create',null,['text'=>'x','start_date'=>'2026-10-21 09:00','end_date'=>'2026-10-21 10:00','recurring_event_id'=>$single['id'],'original_start'=>'2026-10-21 09:00','asset_id'=>'a']),400,'Exception needs a series');
fails(fn()=>$call('create',null,['text'=>'x','start_date'=>'2026-10-21 09:00','end_date'=>'2026-10-21 10:00','asset_id'=>'a'],'2'),403,'Read-only actor cannot create');

// Window read and field ACL on reads.
$events=$call('events',null,['from'=>'2026-10-19','to'=>'2026-10-26'])['events'];
check(array_column($events,'text')===['Promo','Event']&&$events[0]['asset_id']==='a','Window events');
check(!array_key_exists('asset_id',$call('events',null,['from'=>'2026-10-19','to'=>'2026-10-26'],'2')['events'][0]),'Denied field omitted');
fails(fn()=>$call('events',null,['from'=>'2026-01-01','to'=>'2026-03-01']),400,'Range limit');

// Exceptions: one deleted and one moved occurrence replace their slots in the expansion.
$call('create',null,['text'=>'Promo','start_date'=>'2026-10-20 08:00','end_date'=>'2026-10-20 10:00','recurring_event_id'=>$series['id'],'original_start'=>'2026-10-20 08:00','deleted'=>'1','asset_id'=>'a']);
$moved=$call('create',null,['text'=>'Promo late','start_date'=>'2026-10-22 15:00','end_date'=>'2026-10-22 16:00','recurring_event_id'=>$series['id'],'original_start'=>'2026-10-22 08:00','asset_id'=>'b']);
$occ=$call('occurrences',null,['from'=>'2026-10-19','to'=>'2026-10-24'])['occurrences'];
check(array_map(fn($o)=>$o['start'].' '.$o['text'],$occ)===['2026-10-19 08:00 Promo','2026-10-21 08:00 Promo','2026-10-21 09:00 Event','2026-10-22 15:00 Promo late','2026-10-23 08:00 Promo'],'Expansion with exceptions');
check($occ[3]['series_id']===$series['id']&&$occ[3]['recurring']&&$occ[0]['data']->asset_id==='a','Occurrence shape');
check(!property_exists($workspace->executor->execute($ctx('2'),'cal','occurrences',null,['from'=>'2026-10-19','to'=>'2026-10-20'])['occurrences'][0]['data'],'asset_id'),'Denied field omitted from occurrences');

// API channel: token scope narrows, rule grants.
fails(fn()=>$workspace->executor->execute($ctx('1','api',[]),'cal','occurrences',null,['from'=>'2026-10-19','to'=>'2026-10-20']),403,'API needs scope');
check(count($workspace->executor->execute($ctx('1','api',['cal.occurrences']),'cal','occurrences',null,['from'=>'2026-10-19','to'=>'2026-10-20'])['occurrences'])===1,'Scoped API');

// Revisions: stale update/delete is a conflict; changing the pattern drops its exceptions; deleting a series removes them.
$updated=$call('update',$single['id'],['text'=>'Event 2','start_date'=>'2026-10-21 09:00','end_date'=>'2026-10-21 12:00','asset_id'=>'b','revision'=>$single['revision']]);
check($updated['revision']==='2','Revision increments');
fails(fn()=>$call('update',$single['id'],['text'=>'x','start_date'=>'2026-10-21 09:00','end_date'=>'2026-10-21 12:00','asset_id'=>'b','revision'=>'1']),409,'Stale update');
fails(fn()=>$call('delete',$single['id'],['revision'=>'1']),409,'Stale delete');
$call('update',$series['id'],['text'=>'Promo','start_date'=>'2026-10-19 08:00','end_date'=>'9999-02-01 00:00','rrule'=>'FREQ=WEEKLY;BYDAY=MO,WE','duration'=>'7200','asset_id'=>'a','revision'=>'1']);
check((int)$db->query('SELECT COUNT(*) FROM blade_calendar_events WHERE recurring_event_id='.(int)$series['id'])->fetchColumn()===0,'Pattern change drops exceptions');
$moved=$call('create',null,['text'=>'Promo late','start_date'=>'2026-10-21 15:00','end_date'=>'2026-10-21 16:00','recurring_event_id'=>$series['id'],'original_start'=>'2026-10-21 08:00','asset_id'=>'b']);
$call('delete',$series['id'],['revision'=>'2']);
check((int)$db->query('SELECT COUNT(*) FROM blade_calendar_events')->fetchColumn()===1,'Series delete removes exceptions');
fails(fn()=>$call('update','999',['text'=>'x','start_date'=>'2026-10-21 09:00','end_date'=>'2026-10-21 12:00','asset_id'=>'b','revision'=>'1']),404,'Unknown event');

// Audit: writes are journalled with the event id.
check((int)$db->query("SELECT COUNT(*) FROM blade_audit WHERE resource='cal' AND action='create' AND outcome='success'")->fetchColumn()>=4,'Audited writes');
echo "calendar: ok\n";
