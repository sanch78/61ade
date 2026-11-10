import type { Components, ListViewOptions, RecordDetailsOptions, RecordFormOptions, TreeOptions } from "../../api/types";
import { CommandBar } from "./CommandBar";
import { ListView, type ListContext } from "./ListView";
import { RecordDetails } from "./RecordDetails";
import { RecordForm } from "./RecordForm";
import { RecordTree } from "./RecordTree";

export type { ListContext } from "./ListView";

/** The list components of `Application.components`, bound to the page's live channel, user and application. */
export function listComponents(context:ListContext):Pick<Components,"ListView"|"RecordForm"|"RecordDetails"|"Tree"|"CommandBar">{
  return {
    ListView:class extends ListView{constructor(options:ListViewOptions){super(context,options);}},
    RecordForm:class extends RecordForm{constructor(options:RecordFormOptions){super(context,options);}},
    RecordDetails:class extends RecordDetails{constructor(options:RecordDetailsOptions){super(context,options);}},
    Tree:class extends RecordTree{constructor(options:TreeOptions){super(context,options);}},
    CommandBar,
  };
}
