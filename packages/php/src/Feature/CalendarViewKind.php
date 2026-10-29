<?php
declare(strict_types=1);
namespace Blade\Feature;

/**
 * Built-in kind `calendar` (`Registry::calendar`): options are `CalendarDefinition::metadata()` plus `fields` (the
 * extra event Fields). Offered with `events` offered; the browser gets the readable fields only and `day_action` only
 * when offered; `space` stays server-side.
 */
final class CalendarViewKind implements ViewKindProvider
{
    public function __construct(private Registry $registry, private ViewMetadata $meta) {}

    public function validate(Registry $registry, View $view): void
    {
        $o=$view->options;
        if($view->resource===null||!array_key_exists('space',$o)||!array_key_exists('day_action',$o)||!is_array($o['fields']??null)||array_filter($o['fields'],static fn($f)=>!$f instanceof Field))throw new \InvalidArgumentException('Invalid calendar view: '.$view->id);
    }

    public function metadata(Context $ctx, View $view): ?array
    {
        $actions=[];
        foreach($view->actions as $name){
            $a=$this->registry->get($view->resource,$name);
            if($this->meta->offered($ctx,$a->resource,$name))$actions[]=['name'=>$name,'label'=>$a->label,'icon'=>$a->icon,'write'=>$a->write];
        }
        if(!array_filter($actions,static fn($a)=>$a['name']==='events'))return null;
        $o=$view->options;
        $fields=array_values(array_filter($o['fields'],fn($f)=>$ctx->acl->fieldAllowed($ctx->actor->id,$view->resource,'events','ui',$o['space'],null,$f->name)));
        $day=$o['day_action'];
        if($day&&!$this->meta->offered($ctx,$day['resource'],$day['action']))$day=null;
        return ['actions'=>$actions,'options'=>[...array_diff_key($o,['space'=>1,'fields'=>1]),'day_action'=>$day,'fields'=>array_map(fn($f)=>$this->meta->field($ctx,$f),$fields)]];
    }
}
