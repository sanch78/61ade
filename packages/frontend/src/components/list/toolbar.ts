import { t } from "../../I18n";
import { actionIcon, escape } from "./fields";
import type { Column, ViewDefinition, WorkspaceScope } from "./types";

/**
 * The list's command bar items (one `ResponsiveToolbar`, the public `CommandBar`'s toolbar): details, filter
 * dialog (narrow screens), the view's actions, the sub-view window, then sort (cards), secondary columns and the
 * view mode switch. Item ids are the toolbar commands of `Workspace.command`.
 */
export function listCommands(view:ViewDefinition,options:{scope?:WorkspaceScope;filter:boolean;tiles:boolean;secondary:Column[];visible:Set<string>}):any[]{
  const {scope,secondary}=options;
  return [...(!view.singleton&&scope?.select!==false?[{id:"blade-results",value:t("Adatok"),icon:"dxi dxi-information-outline"}]:[]),
    ...(!view.singleton&&options.filter?[{id:"blade-filter",value:t("Szűrés"),icon:"dxi dxi-filter-variant"}]:[]),
    ...view.actions.filter(a=>a.name!=="get"&&!(view.singleton&&a.name==="update")&&(scope?.select!==false||a.name==="create"||!!a.upload)).map(a=>({id:a.name,value:escape(a.label),icon:actionIcon(a)})),
    ...(view.subview&&!scope?.compact&&(view.subview.shared||view.subview.view)?[{id:"blade-subview",value:escape(view.subview.view?.title??t("Alelemek")),icon:"dxi dxi-arrow-expand",tooltip:t("A kijelölt rekord kapcsolódó listája ablakban")}]:[]),
    ...(!view.singleton?[{type:"spacer"},
      {id:"blade-sort",value:t("Rendezés"),hidden:true,icon:"dxi dxi-sort",items:(view.sortable??[]).flatMap(field=>["asc","desc"].map(direction=>({id:"blade-sort:"+field+":"+direction,value:escape((view.columns.find(column=>column.id===field)?.header??(field==="id"?"ID":field))+ (direction==="asc"?" ↑":" ↓")),icon:direction==="asc"?"dxi dxi-arrow-up":"dxi dxi-arrow-down"})))},
      ...(secondary.length?[{id:"blade-columns",value:t("Oszlopok"),icon:"dxi dxi-table-check",items:secondary.map(column=>{const active=options.visible.has(column.id);return {id:"blade-column:"+column.id,value:escape(column.header),icon:active?"dxi dxi-checkbox-marked":"dxi dxi-checkbox-blank-outline",twoState:true,active};})}]:[]),
      {id:"blade-view",value:t("Nézet: Táblázat"),icon:"dxi dxi-table-check",items:[{id:"blade-table",value:t("Táblázat"),icon:"dxi dxi-table-check"},{id:"blade-cards",value:t("Kártyák"),icon:"dxi dxi-view-grid"},...(options.tiles?[{id:"blade-tiles",value:t("Csempék"),icon:"dxi dxi-border-all"}]:[])]}]:[])];
}
