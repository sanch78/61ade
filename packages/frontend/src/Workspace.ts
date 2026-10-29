/**
 * Compatibility entry of the list internals, split into src/components/list (toolkit P3 C-1). New code uses the
 * public `ListView`, `RecordForm`, `RecordDetails` and `CommandBar` (`app.components`, docs/toolkit.md).
 */
export { Workspace } from "./components/list/Workspace";
export { input, formActions } from "./components/list/fields";
export type { ActionConfirmation, ActionDefinition, FieldDefinition, ViewDefinition, WorkspaceHooks, WorkspaceScope } from "./components/list/types";
