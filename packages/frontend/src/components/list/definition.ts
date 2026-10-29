import type { Application, ListOptions, ViewDefinition as PublicDefinition, ViewReference } from "../../api/types";
import type { ViewDefinition } from "./types";

/**
 * A list view in the list's internal shape: its `options` (the list keys, unchanged) beside the shared keys, the
 * sub-view's child view converted the same way.
 */
export function listDefinition(view:PublicDefinition<ListOptions>):ViewDefinition{
  const subview=view.options.subview;
  return {...view.options,id:view.id,resource:view.resource??"",title:view.title,actions:view.actions,
    ...(view.group?{group:view.group}:{}),...(view.icon?{icon:view.icon}:{}),...(view.desktopOnly?{desktopOnly:true}:{}),
    ...(subview?{subview:{...subview,...(subview.view?{view:listDefinition(subview.view)}:{})}}:{})} as unknown as ViewDefinition;
}

/**
 * A component's `view` option: an offered view id (`app.viewDefinition`) or a definition the caller holds; it must
 * be a list view (kind `list`, `options.columns`). Throws `TypeError` otherwise.
 */
export function resolveListView(app:Pick<Application,"viewDefinition">,reference:ViewReference<ListOptions>):PublicDefinition<ListOptions>{
  const view=typeof reference==="string"?app.viewDefinition(reference):reference;
  if(!view||typeof view!=="object"||(view.kind!==undefined&&view.kind!=="list")||!Array.isArray((view.options as ListOptions|undefined)?.columns)||typeof view.resource!=="string")
    throw new TypeError(`61ade: "${typeof reference==="string"?reference:String((reference as {id?:unknown})?.id)}" is not an offered list view.`);
  return view as PublicDefinition<ListOptions>;
}
