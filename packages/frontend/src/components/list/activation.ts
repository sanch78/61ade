/**
 * Record activation (double-click and Enter) of a list: the declared `activate` (one target or a per-row
 * `{field, map}`, toolkit O5) resolved for one row, with the same fallbacks the server documents
 * (docs/workspaces.md#activation). Pure: no DOM, no widgets, so it is checked without a browser
 * (tests/shell/toolkit-list.mjs).
 */

type Row={id:string|number;_actions?:string[];[field:string]:unknown};

/**
 * The declared target for $row: the string itself, or the map entry for the string value of the row's `field`
 * (`"*"` when the value has none). `undefined`: nothing declared, or a map without a matching entry and without
 * `"*"`, which keeps the default behaviour. A field the actor may not read is absent from the row and so has the
 * empty value (the `"*"` entry).
 */
export function declaredTarget(activate:unknown,row:Row):string|undefined{
  if(typeof activate==="string")return activate||undefined;
  if(!activate||typeof activate!=="object")return undefined;
  const {field,map}=activate as {field?:unknown;map?:unknown};
  if(typeof field!=="string"||!map||typeof map!=="object")return undefined;
  const raw=row[field],value=raw===null||raw===undefined?"":typeof raw==="boolean"?(raw?"1":"0"):String(raw);
  const entries=map as Record<string,unknown>,target=value!==""&&Object.hasOwn(entries,value)?entries[value]:entries["*"];
  return typeof target==="string"&&target!==""?target:undefined;
}

/** What an activation runs; `target` is the reported `ActivationTarget` (`activate` event). */
export type ResolvedActivation=
  |{kind:"page";target:"page";label:string;view:string;field:string}
  |{kind:"subview";target:"subview";label:string}
  |{kind:"action";target:string;label:string;action:string}
  |{kind:"view";target:`view:${string}`;label:string;view:string}
  |{kind:"details";target:"details";label:string};

export interface ActivationContext{
  /** The list's resource (a `view:` target must be a record view of it). */
  resource:string;
  /** The view's actions (name, label). */
  actions:readonly {name:string;label:string}[];
  /** The resolved sub-view: `shared` (a hierarchy of this view) or its child `view`; `page`: the child has its own page. */
  subview?:{shared?:boolean;field:string;page?:boolean;view?:{id:string;title:string;filters:readonly {name:string}[]}};
  /** A nested list (a sub-view window or preview): it never navigates to a page. */
  scoped:boolean;
  /** A compact preview: it opens no further child window or record view. */
  compact:boolean;
  /** An offered view by id (`Application.viewDefinition`); absent: no record view is offered. */
  viewDefinition?:(id:string)=>{id:string;title:string;record?:string}|undefined;
  /** Translated captions: the details command and a hierarchy's child list. */
  labels:{details:string;children:string};
}

/**
 * $name is the declared target (`declaredTarget`) or `undefined` (default: the update form when the row offers
 * `update`, otherwise the details). `page` navigates only from a menu page, otherwise it opens the sub-view
 * window; `subview` opens it also at a child count of 0; an action runs when the row offers it; `view:<id>` opens
 * that record view when it is offered, is a record view of this list's resource and the row offers `get`. Anything
 * not offered opens the details.
 */
export function resolveActivation(name:string|undefined,row:Row,context:ActivationContext):ResolvedActivation{
  const sub=context.subview,child=sub?.shared?{title:context.labels.children}:sub?.view;
  const details={kind:"details",target:"details",label:context.labels.details} as const;
  if(name==="page"&&sub?.page&&sub.view?.filters.some(filter=>filter.name===sub.field)&&!context.scoped)
    return {kind:"page",target:"page",label:sub.view.title,view:sub.view.id,field:sub.field};
  if((name==="subview"||name==="page")&&sub&&child&&!context.compact)return {kind:"subview",target:"subview",label:sub.shared?context.labels.children:child.title};
  if(name?.startsWith("view:")){
    const id=name.slice(5),view=context.compact?undefined:context.viewDefinition?.(id);
    const readable=!Array.isArray(row._actions)||row._actions.includes("get");
    return view&&view.record===context.resource&&readable?{kind:"view",target:`view:${id}`,label:view.title,view:id}:details;
  }
  const action=name==="details"||name==="subview"||name==="page"?undefined:context.actions.find(a=>a.name===(name??"update"));
  if(action&&row._actions?.includes(action.name))return {kind:"action",target:action.name,label:action.label,action:action.name};
  return details;
}
