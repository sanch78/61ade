import { t } from "../../I18n";
import { actionIcon, escape } from "./fields";
import type { ListCommand } from "../../app/registries";
import type { Column, ViewDefinition, WorkspaceScope } from "./types";

/** Command bar items of client commands (`app.commands`): the translated, escaped label and the icon. */
const clientItems=(commands:ListCommand[])=>commands.map(({id,entry})=>({id,value:escape(t(entry.label)),...(entry.icon?{icon:entry.icon}:{})}));
/**
 * The list's command bar items (one `ResponsiveToolbar`, the public `CommandBar`'s toolbar): the built-in client
 * commands (details), filter dialog (narrow screens), the view's actions, its declared client commands, the sub-view
 * window, then sort (cards), secondary columns and the view mode switch. Item ids are the toolbar commands of
 * `Workspace.command`.
 */
export function listCommands(view:ViewDefinition,options:{scope?:WorkspaceScope;filter:"panel"|"cards"|false;tiles:boolean;secondary:Column[];visible:Set<string>;commands:{builtin:ListCommand[];project:ListCommand[]}}):any[]{
  const {scope,secondary}=options;
  return [...clientItems(options.commands.builtin),
    // The filter dialog: the declared panel's on narrow screens, the header filters' in cards and tiles (shown by the list).
    ...(!view.singleton&&options.filter?[{id:"blade-filter",value:t("Szűrés"),icon:"dxi dxi-filter-variant",...(options.filter==="cards"?{hidden:true}:{})}]:[]),
    ...view.actions.filter(a=>a.name!=="get"&&a.name!=="move"&&!(view.singleton&&a.name==="update")&&(scope?.select!==false||a.name==="create"||!!a.upload)).map(a=>({id:a.name,value:escape(a.label),icon:actionIcon(a)})),
    ...clientItems(options.commands.project),
    // Manual order: the `move` action as two commands (also Alt+↑/↓ and dragging), never its form.
    ...(view.order&&view.actions.some(a=>a.name==="move")&&scope?.select!==false&&!scope?.compact?[{id:"blade-move-up",value:t("Feljebb"),icon:"dxi dxi-arrow-up"},{id:"blade-move-down",value:t("Lejjebb"),icon:"dxi dxi-arrow-down"}]:[]),
    ...(view.subview&&!scope?.compact&&(view.subview.shared||view.subview.view)?[{id:"blade-subview",value:escape(view.subview.view?.title??t("Alelemek")),icon:"dxi dxi-arrow-expand",tooltip:t("A kijelölt rekord kapcsolódó listája ablakban")}]:[]),
    ...(!view.singleton?[{type:"spacer"},
      {id:"blade-sort",value:t("Rendezés"),hidden:true,icon:"dxi dxi-sort",items:(view.sortable??[]).flatMap(field=>["asc","desc"].map(direction=>({id:"blade-sort:"+field+":"+direction,value:escape((view.columns.find(column=>column.id===field)?.header??(field==="id"?"ID":field))+ (direction==="asc"?" ↑":" ↓")),icon:direction==="asc"?"dxi dxi-arrow-up":"dxi dxi-arrow-down"})))},
      ...(secondary.length?[{id:"blade-columns",value:t("Oszlopok"),icon:"dxi dxi-table-check",items:secondary.map(column=>{const active=options.visible.has(column.id);return {id:"blade-column:"+column.id,value:escape(column.header),icon:active?"dxi dxi-checkbox-marked":"dxi dxi-checkbox-blank-outline",twoState:true,active};})}]:[]),
      {id:"blade-view",value:t("Nézet: Táblázat"),icon:"dxi dxi-table-check",items:[{id:"blade-table",value:t("Táblázat"),icon:"dxi dxi-table-check"},{id:"blade-cards",value:t("Kártyák"),icon:"dxi dxi-view-grid"},...(options.tiles?[{id:"blade-tiles",value:t("Csempék"),icon:"dxi dxi-border-all"}]:[])]}]:[])];
}
