<?php
declare(strict_types=1);
namespace Blade\Feature;

/**
 * Built-in kind `files` (`Registry::fileManager`): options are `FileManagerDefinition::metadata()`, sent with camelCase
 * keys (`maxDepth`, `upload.maxSizeBytes`, `text.maxBytes`, …); offered with an offered action and a readable mount.
 */
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
        $options=ViewMetadata::camel([...$view->options,'mounts'=>$mounts]);
        foreach(['upload','text'] as $key)if(is_array($options[$key]??null))$options[$key]=ViewMetadata::camel($options[$key]);
        return ['actions'=>$actions,'options'=>$options];
    }
}
