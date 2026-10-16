<?php
declare(strict_types=1);
namespace Vapa\Feature;

/** Serializable layout contract; never accepts executable vendor configuration. */
final readonly class ViewLayout
{
    public array $tree;
    public function __construct(public string $formMode='overlay', ?array $tree=null)
    {
        if(!in_array($formMode,['overlay','panel'],true))throw new \InvalidArgumentException('Invalid form mode');
        $tree??=['cols'=>[
            ['id'=>'filter','header'=>'Szűrés','width'=>300,'minWidth'=>220,'resizable'=>true,'collapsable'=>true],
            ['id'=>'grid','header'=>'Találatok'],
            ...($formMode==='panel'?[['id'=>'form','header'=>'Szerkesztés','width'=>380,'minWidth'=>280,'resizable'=>true,'collapsable'=>true,'collapsed'=>true]]:[]),
        ]];
        $ids=[];$nodes=0;
        $validate=function(array $node,int $depth)use(&$validate,&$ids,&$nodes):void{
            if($depth>6 || ++$nodes>30)throw new \InvalidArgumentException('Layout is too complex');
            foreach($node as $key=>$value){
                if(!in_array($key,['id','header','rows','cols','width','height','minWidth','minHeight','resizable','collapsable','collapsed'],true))throw new \InvalidArgumentException('Unsupported layout option');
                if(in_array($key,['resizable','collapsable','collapsed'],true)&&!is_bool($value))throw new \InvalidArgumentException('Invalid layout flag');
                if(in_array($key,['width','height','minWidth','minHeight'],true)&&!(is_int($value)&&$value>=40&&$value<=3000))throw new \InvalidArgumentException('Invalid layout size');
                if($key==='header'&&(!is_string($value)||strlen($value)>150))throw new \InvalidArgumentException('Invalid layout heading');
            }
            if(isset($node['rows'])||isset($node['cols'])){
                if(isset($node['id'])||isset($node['rows'],$node['cols']))throw new \InvalidArgumentException('Invalid layout branch');
                foreach($node['rows']??$node['cols'] as $child){if(!is_array($child))throw new \InvalidArgumentException('Invalid child');$validate($child,$depth+1);}
            }else{
                $id=$node['id']??'';
                if(!in_array($id,['filter','grid','form'],true)||isset($ids[$id]))throw new \InvalidArgumentException('Invalid layout region');
                $ids[$id]=true;
            }
        };
        $validate($tree,0);
        if(!isset($ids['grid'])||($formMode==='panel'&&!isset($ids['form']))||($formMode==='overlay'&&isset($ids['form'])))throw new \InvalidArgumentException('Missing or incompatible layout region');
        $this->tree=$tree;
    }
    public function metadata():array{return ['formMode'=>$this->formMode,'tree'=>$this->tree];}
}
