import type { Application, ColumnMetadata, ListKindOptions, ViewDefinition as PublicDefinition, ViewReference } from "../../api/types";
import { resolveColumn } from "../../app/registries";
import { escape, optionText } from "../../RecordPresentation";
import type { ViewDefinition } from "./types";

/** Plain text of a column value (its option label or the value): what a failed renderer shows. */
const plain=(column:Pick<ColumnMetadata,"id"|"type"|"options">,row:Record<string,unknown>)=>optionText(column,row[column.id]);

/**
 * A list view in the list's internal shape: its `options` (the list keys, unchanged) beside the shared keys, the
 * sub-view's child view converted the same way. Columns and detail fields get their registered presentation or
 * field-type display here, once per mounted list or details (docs/toolkit.md#registries).
 */
export function listDefinition(view:PublicDefinition<ListKindOptions>):ViewDefinition{
  const subview=view.options.subview;
  const fields=[...(view.actions.find(action=>action.name==="update")?.fields??[]),...(view.actions.find(action=>action.name==="create")?.fields??[])];
  const resolve=<C extends ColumnMetadata>(columns:C[]|undefined)=>columns?.map(column=>resolveColumn(column,fields.find(field=>field.name===column.id),{escape,plain}));
  const detailFields=resolve(view.options.detailFields);
  return {...view.options,columns:resolve(view.options.columns),...(detailFields?{detailFields}:{}),id:view.id,resource:view.resource??"",title:view.title,actions:view.actions,
    ...(view.group?{group:view.group}:{}),...(view.icon?{icon:view.icon}:{}),...(view.desktopOnly?{desktopOnly:true}:{}),
    ...(subview?{subview:{...subview,...(subview.view?{view:listDefinition(subview.view)}:{})}}:{})} as unknown as ViewDefinition;
}

/**
 * A component's `view` option: an offered view id (`app.viewDefinition`) or a definition the caller holds; it must
 * be a list view (kind `list`, `options.columns`). An id that is not offered throws `Error`, any other view or value
 * `TypeError` (the rule of every component's view reference, `resolveView`).
 */
export function resolveListView(app:Pick<Application,"viewDefinition">,reference:ViewReference<ListKindOptions>):PublicDefinition<ListKindOptions>{
  const view=typeof reference==="string"?app.viewDefinition(reference):reference;
  if(typeof reference==="string"&&!view)throw new Error(`61ade: view "${reference}" is not offered to the actor.`);
  if(!view||typeof view!=="object"||(view.kind!==undefined&&view.kind!=="list")||!Array.isArray((view.options as ListKindOptions|undefined)?.columns)||typeof view.resource!=="string")
    throw new TypeError(`61ade: "${typeof reference==="string"?reference:String((reference as {id?:unknown})?.id)}" is not a list view.`);
  return view as PublicDefinition<ListKindOptions>;
}
