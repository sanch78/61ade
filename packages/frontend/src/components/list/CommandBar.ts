import { Layout, type Toolbar } from "@dhtmlx/suite";
import { ResponsiveToolbar } from "../../ResponsiveToolbar";
import { widgetIcons } from "../../WidgetIcons";
import type { CommandBar as CommandBarApi, CommandBarEvents, CommandBarOptions, CommandItem } from "../../api/types";
import { Component } from "./component";
import { escape } from "./fields";

const ID=/^[A-Za-z0-9_.:-]+$/;

/**
 * The framework's responsive command bar as a public component (`app.components.CommandBar`,
 * docs/toolkit.md#commandbar): the list's own `ResponsiveToolbar`, which moves every item into one `Műveletek`
 * menu below 768 px or when the items do not fit, keeping ids, state and click events.
 */
export class CommandBar extends Component<CommandBarEvents> implements CommandBarApi{
  readonly layout:Layout;
  readonly toolbar:Toolbar;
  private bar:ResponsiveToolbar;
  private ids=new Set<string>();
  private releaseIcons=widgetIcons();
  constructor(options:CommandBarOptions){
    super(options);
    const items=Array.isArray(options?.items)?options.items:[];
    for(const item of items)if(item.type!=="spacer"&&(typeof item.id!=="string"||!ID.test(item.id)||item.id==="blade-command-menu"||this.ids.has(item.id)))throw new TypeError(`61ade: invalid or duplicate command id "${String(item.id)}".`);
      else if(item.type!=="spacer")this.ids.add(item.id);
    this.layout=new Layout(this.host,{type:"none",rows:[{id:"commands",css:"blade-command-row"}]});
    this.bar=new ResponsiveToolbar(undefined,{data:items.map(item=>item.type==="spacer"?{type:"spacer"}:{id:item.id,value:escape(item.label),...(item.icon?{icon:item.icon}:{}),...(item.disabled?{disabled:true}:{}),...(item.hidden?{hidden:true}:{})})});
    this.toolbar=this.bar;
    this.bar.events.on("click",(id:string|number)=>{const key=String(id);if(this.ids.has(key))this.emit("click",{id:key});});
    this.layout.getCell("commands").attach(this.bar);
    this.bind(options?.signal);
  }
  /** Changes one item's label, icon, disabled or hidden state (also while it sits in the collapsed menu). */
  update(id:string,changes:Partial<Omit<CommandItem,"id"|"type">>):void{
    if(this.destroyed||!this.ids.has(id))return;
    const values={...(changes.label!==undefined?{value:escape(changes.label)}:{}),...(changes.icon!==undefined?{icon:changes.icon}:{})};
    if(Object.keys(values).length)this.bar.data.update(id,values);
    if(changes.disabled===true)this.bar.disable(id);else if(changes.disabled===false)this.bar.enable(id);
    if(changes.hidden===true)this.bar.hide(id);else if(changes.hidden===false)this.bar.show(id);
  }
  protected dispose():void{this.bar.disposeResponsive();this.releaseIcons();this.layout.destructor();}
}
