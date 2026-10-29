<?php
declare(strict_types=1);
namespace Blade\Feature;

/** Shared browser metadata of view kind providers: ACL offering, field and action metadata. Reads ACL, never writes. */
final class ViewMetadata
{
    public function __construct(private Registry $registry) {}

    /** Some allow rule exists and no whole-action deny for all objects; object checks still run per request. */
    public function offered(Context $ctx, string $resource, string $name): bool
    {
        $rules=$ctx->acl->rules($ctx->actor->id,$resource,$name,'ui');
        return array_filter($rules,static fn($r)=>$r['effect']==='allow' && $r['field_name']==='') && !array_filter($rules,static fn($r)=>$r['effect']==='deny' && $r['scope']==='all' && $r['field_name']==='');
    }
    /** Fields a client fills: a delete's `preview` switch is a protocol flag of the usage confirmation, not a form field. */
    public static function formFields(Action $action): array
    {
        return array_values(array_filter($action->fields,static fn($f)=>!($action->name==='delete'&&$f->name==='preview')));
    }
    public function fields(Context $ctx, Action $action): array { return array_map(fn($f)=>$this->field($ctx,$f),self::formFields($action)); }
    /**
     * Field metadata; a `file` field adds the resolved folder id, the upload policy for its classes, whether the actor
     * may upload there (`can_upload`) and choose from it (`can_choose`: `list` on the mount, the picker's read); the folder
     * path, storage and rules stay server-side.
     */
    public function field(Context $ctx, Field $field): array
    {
        $out=$field->metadata($ctx);
        if($field->file===null)return $out;
        $source=$this->registry->mediaSource($field->file['resource']);
        $folder=$source instanceof FileSource?$source->folder($field->file['mount'],$field->file['folder']??''):null;
        return [...$out,'file'=>[...$out['file'],'folder_id'=>$folder,'policy'=>$source instanceof FileSource?$source->uploadPolicy($field->file['accept']):null,
            'can_upload'=>$folder!==null&&$source->allows($ctx,'upload',$field->file['mount']),'can_choose'=>$folder!==null&&$source->allows($ctx,'list',$field->file['mount'])]];
    }
    /** `usages: true` on a delete with registered UsageProviders (the client previews first); `upload`: the policy metadata of an UploadPolicy action. */
    public function extras(Action $action): array
    {
        return [...($action->name==='delete'&&$this->registry->usageProviders($action->resource)?['usages'=>true]:[]),...($action->upload instanceof UploadPolicy?['upload'=>$action->upload->metadata()]:[])];
    }
    /** Confirmation metadata of $action (labels translated; message and title by `Translator::presentation`). */
    public static function confirm(Action $action): ?array
    {
        $c=$action->confirm;
        return $c?array_filter(['message'=>$c['message'],'title'=>$c['title']??null,'severity'=>$c['severity']??'neutral','confirmLabel'=>isset($c['confirm_label'])?\Blade\I18n\Translator::text($c['confirm_label']):null,'cancelLabel'=>isset($c['cancel_label'])?\Blade\I18n\Translator::text($c['cancel_label']):null],static fn($v)=>$v!==null):null;
    }
    /** Offered actions of $view in the generic shape of project kinds (`ActionMetadata`). */
    public function actions(Context $ctx, View $view): array
    {
        $out=[];
        foreach($view->actions as $name){
            $a=$this->registry->get((string)$view->resource,$name);
            if($this->offered($ctx,$a->resource,$name))$out[]=['name'=>$name,'label'=>$a->label,'icon'=>$a->icon,'write'=>$a->write,'bulk'=>$a->bulk,'get'=>$a->get,'confirm'=>self::confirm($a),'fields'=>$this->fields($ctx,$a),...$this->extras($a)];
        }
        return $out;
    }
}
