import type { ClientCommand, CommandContext, Row } from "../../api/types";

/** The list behind a command context: framework commands reach the list's own surfaces through it (not public). */
export const LIST=Symbol("61ade.list");
export type ListCommandContext=CommandContext&{readonly [LIST]?:{details(row:Row):void}};

/**
 * The lists' built-in client commands (dogfooding: registered on `app.commands` by builtins.ts, rendered, enabled and
 * run through the registry like a project command). `details` is the `Adatok` command of every non-singleton list
 * whose rows can be selected: the details of the toolbar's record, not while several rows are marked.
 */
export const builtinCommands:Record<string,ClientCommand>={
  details:{label:"Adatok",icon:"dxi dxi-information-outline",placement:"toolbar",
    enabled:({row,rows})=>!!row&&rows.length<=1,
    run:context=>{if(context.row)(context as ListCommandContext)[LIST]?.details(context.row);}},
};
