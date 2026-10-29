<?php
declare(strict_types=1);
namespace Blade\Feature;

use Blade\I18n\Translator;

/**
 * Built-in kind `list` (`Registry::view`, `SqlResource::register`). Options: `columns`, `singleton`, `layout`
 * (ViewLayout), `rowNumbers`, `selection`, `rowSelection`, optional `rowHeight`, `tileMinWidth`, `tiles`, `activate`;
 * `subview` is set only by `Registry::subview()`. Bootstrap options add `detailFields`, `filters`, `sortable`, `search`.
 */
final class ListViewKind implements ViewKindProvider
{
    private const OPTIONS = ['columns', 'singleton', 'layout', 'rowNumbers', 'selection', 'rowSelection', 'rowHeight', 'tileMinWidth', 'tiles', 'activate'];
    private const TARGETS = ['details', 'subview', 'page'];

    public function __construct(private Registry $registry, private ViewMetadata $meta) {}

    /** Every target named by an activation (a string or an `{field, map}` map). */
    public static function targets(string|array|null $activate): array
    {
        return is_array($activate) ? array_values(is_array($activate['map'] ?? null) ? $activate['map'] : []) : ($activate === null ? [] : [$activate]);
    }

    public function validate(Registry $registry, View $view): void
    {
        $o=$view->options;
        if(isset($o['subview']))throw new \InvalidArgumentException('Attach sub-views with Registry::subview() after the final declaration: '.$view->id);
        if($view->resource===null||array_diff(array_keys($o),self::OPTIONS)||!is_array($o['columns']??null)||!array_is_list($o['columns'])||!($o['layout']??null) instanceof ViewLayout)throw new \InvalidArgumentException('Invalid list view: '.$view->id);
        foreach(['singleton','rowNumbers','selection','rowSelection'] as $flag)if(!is_bool($o[$flag]??false))throw new \InvalidArgumentException('Invalid list view: '.$view->id);
        if(($o['tiles']??true)!==true)throw new \InvalidArgumentException('Invalid view presentation.');
        $rowHeight=$o['rowHeight']??null;$tileMinWidth=$o['tileMinWidth']??null;
        if(($rowHeight!==null&&(!is_int($rowHeight)||$rowHeight<32||$rowHeight>160))||($tileMinWidth!==null&&(!is_int($tileMinWidth)||$tileMinWidth<120||$tileMinWidth>480)))throw new \InvalidArgumentException('Invalid view presentation.');
        $this->activation($registry,$view,$o['activate']??null);
        $this->columns($registry,$view->resource,$o['columns']);
    }
    /**
     * A target is `details`, `subview`, `page`, `view:<id>` (a record view of this resource, checked by
     * `Registry::checkViews()` once every view is declared) or a record action of the view (not `create`, `get`, an
     * upload or a collection action). A map adds `field`: a registered, non-secret field of the resource.
     */
    private function activation(Registry $registry, View $view, mixed $activate): void
    {
        if($activate===null)return;
        $invalid=new \InvalidArgumentException('Invalid view activation.');
        if(($view->options['singleton']??false)||!(is_string($activate)||is_array($activate)))throw $invalid;
        if(is_array($activate)){
            if(count($activate)!==2||!is_string($activate['field']??null)||!is_array($activate['map']??null)||!$activate['map'])throw $invalid;
            $field=$registry->fields($view->resource)[$activate['field']]??null;
            if(!$field||$field->secret||$field->type==='password')throw $invalid;
            foreach($activate['map'] as $value=>$target)if((string)$value===''||!is_string($target))throw $invalid;
        }
        foreach(self::targets($activate) as $target){
            if(in_array($target,self::TARGETS,true))continue;
            if(str_starts_with($target,'view:')){if(!preg_match(View::ID,substr($target,5)))throw $invalid;continue;}
            if(!in_array($target,$view->actions,true)||in_array($target,['create','get'],true))throw $invalid;
            $known=$registry->get($view->resource,$target);
            if($known->collection||$known->upload!==null)throw $invalid;
        }
    }
    /**
     * Derived media columns: a column without a field may declare `media_of` (a media field of the resource) and
     * `part` (type, resolution or duration); the client renders it from the row's `_media`; never sorted or filtered.
     */
    private function columns(Registry $registry, string $resource, array $columns): void
    {
        $fields=$registry->fields($resource);
        foreach($columns as $column){
            if(!is_array($column)||!is_string($column['id']??null))throw new \InvalidArgumentException('Invalid view column.');
            if(!isset($column['media_of'])&&!isset($column['part']))continue;
            $source=is_string($column['media_of']??null)?($fields[$column['media_of']]??null):null;
            if(isset($fields[$column['id']])||!$source||$source->media()===null||!in_array($column['part']??null,['type','resolution','duration'],true))throw new \InvalidArgumentException('Invalid derived media column.');
        }
    }

    public function metadata(Context $ctx, View $view): ?array
    {
        $o=$view->options;$singleton=$o['singleton']??false;$actor=$ctx->actor;
        $actions=[];
        foreach($view->actions as $name){
            $a=$this->registry->get($view->resource,$name);
            if($singleton && !$ctx->acl->allows($actor->id,$a->resource,$name,'ui',$actor->id,$actor->id))continue;
            if(!$this->meta->offered($ctx,$a->resource,$name))continue;
            $actions[]=['name'=>$name,'icon'=>$a->icon,'bulk'=>$a->bulk,'confirm'=>$a->confirm?array_filter(['message'=>Translator::text($a->confirm['message']),'title'=>isset($a->confirm['title'])?Translator::text($a->confirm['title']):null,'severity'=>$a->confirm['severity']??'neutral','confirmLabel'=>isset($a->confirm['confirm_label'])?Translator::text($a->confirm['confirm_label']):null,'cancelLabel'=>isset($a->confirm['cancel_label'])?Translator::text($a->confirm['cancel_label']):null],static fn($v)=>$v!==null):null,'label'=>match($name){'create'=>'Hozzáadás','update'=>'Módosítás',default=>$a->label},'submitLabel'=>in_array($name,['create','update'],true)?'Mentés':$a->label,'write'=>$a->write,'fields'=>$this->meta->fields($ctx,$a),...$this->meta->extras($a)];
        }
        if(!$actions)return null;
        $fields=$this->registry->fields($view->resource);
        $columns=array_map(static function($column) use ($fields,$ctx){
            $field=$fields[$column['id']]??null;
            if(!$field)return $column;
            return [...$field->column,...($field->media()!==null?['media'=>$field->media()]:[]),...$column,'type'=>$field->type,'options'=>$field->metadata($ctx)['options']];
        },$o['columns']);
        $detailFields=array_values(array_map(static fn($field)=>['id'=>$field->name,'header'=>$field->label,'type'=>$field->type,'options'=>$field->metadata($ctx)['options'],...($field->media()!==null?['media'=>$field->media()]:[]),...array_intersect_key($field->column,['presentation'=>true,'imageBase'=>true,'image_base'=>true,'altOf'=>true,'alt_of'=>true])],array_filter($fields,static fn($field)=>!$field->secret&&$field->type!=='password')));
        $list=$this->registry->get($view->resource,$singleton?'get':'list');
        $activate=$o['activate']??null;
        $options=['columns'=>$columns,'detailFields'=>$detailFields,'singleton'=>$singleton,'layout'=>$o['layout']->metadata(),
            'rowNumbers'=>$o['rowNumbers']??true,'selection'=>$o['selection']??false,'rowSelection'=>$o['rowSelection']??false,
            ...array_intersect_key($o,['rowHeight'=>1,'tileMinWidth'=>1,'tiles'=>1]),
            // A map is always a JSON object, also for consecutive integer keys.
            ...($activate!==null?['activate'=>is_array($activate)?['field'=>$activate['field'],'map'=>(object)$activate['map']]:$activate]:[]),
            'filters'=>$list->listSource?->filterDefinitions($ctx)??[],'sortable'=>$list->listSource?->sortableFields($ctx)??[]];
        if($search=$list->listSource?->searchMetadata($ctx))$options['search']=$search;
        if(isset($o['subview']))$options['subview']=$o['subview'];
        return ['actions'=>$actions,'options'=>$options];
    }
}
