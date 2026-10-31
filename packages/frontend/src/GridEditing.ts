import { type Grid, awaitRedraw } from "@dhtmlx/suite";
import {dateValue,fieldError,type FieldDefinition} from "./FormValidation";
import type {Row} from "./Realtime";

type Column={id:string;header:string;type?:string;options?:Record<string,string>;editable?:boolean};
/** Record keys that Suite reads as row/item configuration (`height`: Grid row pixel height, `css`: DataView item class). */
export const RESERVED=["height","css"];
/** Widget data key and Grid column id of a record field: reserved keys live under an alias, so Suite never sees them. */
export const alias=(key:string)=>RESERVED.includes(key)?"__blade_"+key:key;
/** Record field of a widget data key or Grid column id. */
export const unalias=(key:string)=>key.startsWith("__blade_")&&RESERVED.includes(key.slice(8))?key.slice(8):key;
export function gridEditor(column:Column):object {
  if(column.type==="checkbox"&&column.editable)return {type:"boolean",editable:true};
  if(column.type==="select"&&column.editable)return {editorType:"select",editable:true,options:Object.entries(column.options??{}).map(([id,value])=>({id,value}))};
  // The date string stays the cell value: Suite parses it with dateFormat for the picker and formats the pick back.
  if(column.type==="date"&&column.editable)return {editorType:"datePicker",editable:true,dateFormat:"%Y-%m-%d",editorConfig:{weekStart:"monday"}};
  return {editable:!!column.editable,editorType:column.type==="textarea"?"textarea":"input"};
}

/**
 * Native Grid editors commit through the same revision/ACL/validation kernel as forms. Column ids may
 * be aliases (`alias`): the editor reads and writes the aliased data key, never Suite's own row keys.
 */
export class GridEditing {
  private disposed=false;
  private saving=false;
  private reporting=false;
  private starting=false;
  constructor(private grid:Grid,fields:FieldDefinition[],private rows:()=>Row[],private save:(row:Row,field:string,value:unknown)=>Promise<void>,private error:(error:unknown)=>Promise<void>,private active:(value:boolean)=>void){
    const known=new Map(fields.map(field=>[field.name,field]));
    grid.events.on("beforeEditStart",(row:any,column:any,editorType:any)=>{
      const current=rows().find(item=>String(item.id)===String(row.id));
      const allowed=!this.disposed&&!this.saving&&column.editable&&current?._editable instanceof Array&&current._editable.includes(unalias(String(column.id)));
      if(allowed){
        this.active(true);
        // Suite row selection restores cell focus after redraw. Finish that first,
        // otherwise it immediately blurs and closes the newly inserted editor.
        if(editorType!=="checkbox"&&!this.starting){
          (grid.selection as any).setCell(String(row.id),String(column.id));
          void awaitRedraw().then(()=>{if(this.disposed)return;this.starting=true;try{grid.editCell(row.id,column.id,editorType);}finally{this.starting=false;}});
          return false;
        }
      }
      return !!allowed;
    });
    grid.events.on("beforeEditEnd",(value:unknown,row:any,column:any)=>{
      if(value===undefined)return true;
      value=dateValue(value);
      const field=known.get(unalias(String(column.id)));
      if(!field)return false;
      const current=rows().find(item=>String(item.id)===String(row.id));
      const problem=fieldError(field,value,{...current,[field.name]:value});
      if(problem){if(!this.reporting){this.reporting=true;void this.error(new Error(`${field.label}: ${problem}`)).finally(()=>{this.reporting=false;});}return false;}
      return true;
    });
    grid.events.on("afterEditEnd",(value:unknown,row:any,column:any)=>{
      if(this.disposed||this.saving)return;
      value=dateValue(value);
      const current=rows().find(item=>String(item.id)===String(row.id));
      const field=known.get(unalias(String(column.id)));
      if(!current||!field||value===undefined||String(current[field.name])===String(value)||(field.type==="checkbox"&&String(current[field.name])===(value?"1":"0"))){this.active(false);return;}
      this.saving=true;
      void this.save(structuredClone(current),field.name,value).catch(async error=>{
        if(this.disposed)return;
        const latest=this.rows().find(item=>String(item.id)===String(row.id));
        if(latest)this.grid.data.update(String(row.id),{[alias(field.name)]:field.type==="checkbox"&&column.type==="boolean"?String(latest[field.name])==="1":latest[field.name]});
        await this.error(error);
      }).finally(()=>{this.saving=false;if(!this.disposed)this.active(false);});
    });
  }
  destroy():void{this.disposed=true;}
}
