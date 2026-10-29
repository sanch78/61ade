<?php
declare(strict_types=1);
namespace Blade\Feature;

/** Built-in kind `files` (`Registry::fileManager`): options are `FileManagerDefinition::metadata()`; offered with an offered action and a readable mount. */
final class FileViewKind implements ViewKindProvider
{
    public function __construct(private Registry $registry, private ViewMetadata $meta) {}

    public function validate(Registry $registry, View $view): void
    {
        if($view->resource===null||!is_array($view->options['mounts']??null)||!array_is_list($view->options['mounts']))throw new \InvalidArgumentException('Invalid file manager view: '.$view->id);
    }

    public function metadata(Context $ctx, View $view): ?array
    {
        $actions=[];
        foreach($view->actions as $name){
            $a=$this->registry->get($view->resource,$name);
            if($this->meta->offered($ctx,$a->resource,$name))$actions[]=['name'=>$name,'label'=>$a->label,'icon'=>$a->icon,'write'=>$a->write,'get'=>$a->get,'confirm'=>ViewMetadata::confirm($a),'fields'=>$this->meta->fields($ctx,$a),...$this->meta->extras($a)];
        }
        $mounts=array_values(array_filter($view->options['mounts'],fn($m)=>$ctx->acl->allows($ctx->actor->id,$view->resource,'tree','ui',$m['id'])));
        if(!$actions||!$mounts)return null;
        return ['actions'=>$actions,'options'=>[...$view->options,'mounts'=>$mounts]];
    }
}
