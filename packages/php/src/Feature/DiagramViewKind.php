<?php
declare(strict_types=1);
namespace Blade\Feature;

/** Built-in kind `diagram` (`Registry::diagram`): options are `DiagramDefinition::metadata()`; offered with `list` offered. */
final class DiagramViewKind implements ViewKindProvider
{
    public function __construct(private Registry $registry, private ViewMetadata $meta) {}

    public function validate(Registry $registry, View $view): void
    {
        if($view->resource===null)throw new \InvalidArgumentException('Invalid diagram view: '.$view->id);
    }

    public function metadata(Context $ctx, View $view): ?array
    {
        $actions=[];
        foreach($view->actions as $name){
            $a=$this->registry->get($view->resource,$name);
            if($this->meta->offered($ctx,$a->resource,$name))$actions[]=['name'=>$name,'label'=>$a->label,'icon'=>$a->icon,'write'=>$a->write,'confirm'=>$a->confirm?array_filter(['message'=>$a->confirm['message'],'title'=>$a->confirm['title']??null,'severity'=>$a->confirm['severity']??'neutral','confirmLabel'=>$a->confirm['confirm_label']??null],static fn($v)=>$v!==null):null,'fields'=>array_map(static fn($f)=>$f->metadata($ctx),$a->fields)];
        }
        if(!array_filter($actions,static fn($a)=>$a['name']==='list'))return null;
        return ['actions'=>$actions,'options'=>$view->options];
    }
}
