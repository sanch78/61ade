import type { DialogSeverity } from "../../MessageDialog";
import type { UploadPolicy } from "../../Uploader";
import type { FieldDefinition } from "../../FormValidation";
import type { MediaPart } from "../../RecordPresentation";
import type { Row } from "../../Realtime";
import type { Activation, Application, ListKindOptions, ListViewEvents, ViewDefinition as PublicDefinition } from "../../api/types";
import type { Workspace } from "./Workspace";
import type { Resolved } from "../../app/registries";

export type { FieldDefinition } from "../../FormValidation";
export type ActionConfirmation={message:string;title?:string;severity?:DialogSeverity;confirmLabel?:string;cancelLabel?:string};
/**
 * `usages`: the action (a delete) reports references through a `preview` call before it is confirmed.
 * `upload`: the action receives files through the shared uploader with this policy (no record needed).
 */
export type ActionDefinition={name:string;label:string;submitLabel:string;write:boolean;icon?:string;bulk?:boolean;confirm?:ActionConfirmation;usages?:boolean;upload?:UploadPolicy;fields:FieldDefinition[]};
export type Region={id?:"filter"|"grid"|"form";header?:string;rows?:Region[];cols?:Region[];width?:number;height?:number;minWidth?:number;resizable?:boolean;collapsable?:boolean;collapsed?:boolean};
export type Column={id:string;header:string;type?:string;media?:string;presentation?:string;imageBase?:string;altOf?:string;mediaOf?:string;part?:MediaPart;options?:Record<string,string>;width?:number;minWidth?:number;maxWidth?:number;editable?:boolean;secondary?:boolean;align?:"left"|"center"|"right";
  /** A registered field type of the column's field (`app.fieldTypes`). */
  editor?:string}&Resolved;
/** The list kind's internal shape: the view's shared keys beside its `options` (definition.ts `listDefinition`). */
export type ViewDefinition={id:string;resource:string;title:string;icon?:string;desktopOnly?:boolean;rowNumbers?:boolean;selection?:boolean;rowSelection?:boolean;detailFields?:Column[];rowHeight?:number;tileMinWidth?:number;tiles?:boolean;
  /** Double-click/Enter: one target or a per-row `{field, map}` (activation.ts). */
  activate?:Activation;search?:{fields:string[]};columns:Column[];actions:ActionDefinition[];singleton:boolean;sortable?:string[];group?:string;filters:FieldDefinition[];layout:{formMode:"overlay"|"panel";tree:Region};
  /** Records expand to the `resource` list filtered to `field` = record id: its own `view`, or this view when `shared`. */
  subview?:{resource:string;field:string;shared?:boolean;view?:ViewDefinition;select?:boolean;page?:boolean};
  /** Tree navigation: the node list `view` beside this list, scoped to `field` = the selected node (api TreeMetadata). */
  tree?:{view:PublicDefinition<ListKindOptions>;field:string;parent:string;label:string};
  /** Declared project client commands (`app.commands` names) of the toolbar. */
  commands?:string[];
  /** Manual order and drops from another list (api ListKindOptions `order`, `drop`). */
  order?:{field:string;scope?:string};drop?:{from:string;field:string}};
/**
 * A nested (sub-view) instance: its list is limited to `field` = `id` and new records get that value. With
 * `shared` it has no toolbar of its own; its cursor record is reported to the parent, whose toolbar acts on it.
 */
export type WorkspaceScope={field:string;id:string;
  /** false: the rows never become the cursor record (no delegation, no record toolbar actions, double-click opens nothing). */
  select?:boolean;
  /** Reports the cursor record to the parent; `refresh`: a re-render, honoured only while this view holds the toolbar. */
  shared?:(workspace:Workspace,row:Row|undefined,refresh?:boolean)=>void;
  /**
   * A compact preview (expanded sub-row or card): a table that is always a table, sortable headers only (no filters,
   * search, toolbar, row numbers or marks), editable columns kept. `height` receives the height its content needs.
   * Without it the scoped view is the full child view filling a window (the window header is its only header).
   */
  compact?:{height:(pixels:number)=>void}};
/**
 * What a list instance gets beyond its definition: the public `ListView` events of the top-level list (nested
 * previews and windows report nothing) and the application's navigation for `view:<id>` activation targets.
 */
export type WorkspaceHooks={
  emit?:<K extends keyof ListViewEvents>(event:K,payload:ListViewEvents[K])=>void;
  app?:Pick<Application,"navigate"|"viewDefinition">;
  /** The view as the server sent it: the `view` of client command contexts. */
  view?:PublicDefinition<ListKindOptions>;
  /** The rows can be dragged into a list that declares `drop` from this resource (public `ListViewOptions.dragSource`). */
  dragSource?:boolean;
  /** false: the list sits in a host's panel and draws none of its own (public `ListViewOptions.panel`). */
  panel?:boolean;
  /** false: no ID column and no `ID · n` line on cards (public `ListViewOptions.showId`). */
  showId?:boolean;
  /** The presentation until the user picks one (public `ListViewOptions.mode`). */
  mode?:"table"|"cards"|"tiles";
};
