<?php
declare(strict_types=1);
namespace Blade\Feature;

/**
 * Provider of a project kind (dotted name) without its own `Registry::kind()` provider. Its options reach the browser
 * verbatim, so at definition time they must be a JSON-safe map (null, booleans, integers, finite floats, UTF-8 strings,
 * lists and maps, no objects) and at most MAX_BYTES encoded. Offered when the actor is offered at least one declared
 * action (none declared: always); `Workspace::views()` adds the tenant and record (`get`) conditions.
 */
final class GenericViewKind implements ViewKindProvider
{
    public const MAX_BYTES = 65536;

    public function __construct(private ViewMetadata $meta) {}

    public function validate(Registry $registry, View $view): void
    {
        $safe=static function(mixed $value,int $depth)use(&$safe):bool{
            if(is_array($value)){
                if($depth>32)return false;
                foreach($value as $item)if(!$safe($item,$depth+1))return false;
                return true;
            }
            return $value===null||is_bool($value)||is_int($value)||(is_float($value)&&is_finite($value))||(is_string($value)&&preg_match('//u',$value)===1);
        };
        if(($view->options&&array_is_list($view->options))||!$safe($view->options,0))throw new \InvalidArgumentException('View options must be JSON-safe: '.$view->id);
        if(strlen(json_encode($view->options,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR))>self::MAX_BYTES)throw new \InvalidArgumentException('View options exceed '.self::MAX_BYTES.' bytes: '.$view->id);
    }

    public function metadata(Context $ctx, View $view): ?array
    {
        $actions=$this->meta->actions($ctx,$view);
        if($view->actions&&!$actions)return null;
        return ['actions'=>$actions,'options'=>$view->options];
    }
}
