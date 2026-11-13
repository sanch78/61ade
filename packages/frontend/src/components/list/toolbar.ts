import { t } from "../../I18n";
import { actionIcon, escape } from "./fields";
import type { ListCommand } from "../../app/registries";
import type { Column, ViewDefinition, WorkspaceScope } from "./types";

/**
 * Command bar items of client commands (`app.commands`): the translated, escaped label and the icon; a toggle is a
 * Suite two-state item (`aria-pressed`, a checked entry in `Műveletek`) in its $pressed state; a pinned one stays in the
 * bar when the others collapse (`bladePinned`, ResponsiveToolbar).
 */
const clientItems=(commands:ListCommand[],pressed:(command:ListCommand)=>boolean)=>commands.map(command=>({id:command.id,value:escape(t(command.entry.label)),...(command.entry.icon?{icon:command.entry.icon}:{}),
  ...(command.entry.type==="toggle"?{twoState:true,active:pressed(command),css:"blade-command--toggle"}:{}),...(command.entry.pinned?{bladePinned:true}:{})}));
/**
 * The list's command bar items (one `ResponsiveToolbar`, the public `CommandBar`'s toolbar): the built-in client
 * commands (details), filter dialog (narrow screens), the view's actions, its declared client commands, the sub-view
 * window, then sort (cards), secondary columns and the view mode switch (its offered `modes`; none: no switch). Item ids are the toolbar commands of
 * `Workspace.command`.
 */
export function listCommands(view:ViewDefinition,options:{scope?:WorkspaceScope;filter:"panel"|"cards"|false;modes:readonly ("table"|"cards"|"tiles")[];secondary:Column[];visible:Set<string>;commands:{builtin:ListCommand[];project:ListCommand[]};pressed:(command:ListCommand)=>boolean}):any[]{
  const {scope,secondary}=options;
  return [...clientItems(options.commands.builtin,options.pressed),
    // The filter dialog: the declared panel's on narrow screens, the header filters' in cards and tiles (shown by the list).
    ...(!view.singleton&&options.filter?[{id:"blade-filter",value:t("Szűrés"),icon:"bi bi-funnel",...(options.filter==="cards"?{hidden:true}:{})}]:[]),
    ...view.actions.filter(a=>a.name!=="get"&&a.name!=="move"&&!(view.singleton&&a.name==="update")&&(scope?.select!==false||a.name==="create"||!!a.upload)).map(a=>({id:a.name,value:escape(a.label),icon:actionIcon(a)})),
    ...clientItems(options.commands.project,options.pressed),
    // Manual order: the `move` action as two commands (also Alt+↑/↓ and dragging), never its form.
    ...(view.order&&view.actions.some(a=>a.name==="move")&&scope?.select!==false&&!scope?.compact?[{id:"blade-move-up",value:t("Feljebb"),icon:"bi bi-arrow-up"},{id:"blade-move-down",value:t("Lejjebb"),icon:"bi bi-arrow-down"}]:[]),
    ...(view.subview&&!scope?.compact&&(view.subview.shared||view.subview.view)?[{id:"blade-subview",value:escape(view.subview.view?.title??t("Alelemek")),icon:"bi bi-arrows-angle-expand",tooltip:t("A kijelölt rekord kapcsolódó listája ablakban")}]:[]),
    ...(!view.singleton?[{type:"spacer"},
      {id:"blade-sort",value:t("Rendezés"),hidden:true,icon:"bi bi-sort-down",items:(view.sortable??[]).flatMap(field=>["asc","desc"].map(direction=>({id:"blade-sort:"+field+":"+direction,value:escape((view.columns.find(column=>column.id===field)?.header??(field==="id"?"ID":field))+ (direction==="asc"?" ↑":" ↓")),icon:direction==="asc"?"bi bi-arrow-up":"bi bi-arrow-down"})))},
      ...(secondary.length?[{id:"blade-columns",value:t("Oszlopok"),icon:"bi bi-table",items:secondary.map(column=>{const active=options.visible.has(column.id);return {id:"blade-column:"+column.id,value:escape(column.header),icon:active?"bi bi-check-square":"bi bi-square",twoState:true,active};})}]:[]),
      ...(options.modes.length?[{id:"blade-view",value:t("Nézet: Táblázat"),icon:"bi bi-table",items:[{id:"blade-table",value:t("Táblázat"),icon:"bi bi-table"},{id:"blade-cards",value:t("Kártyák"),icon:"bi bi-grid"},{id:"blade-tiles",value:t("Csempék"),icon:"bi bi-grid-3x3"}].filter(item=>options.modes.includes(item.id.slice("blade-".length) as "table"))}]:[])]:[])];
}
