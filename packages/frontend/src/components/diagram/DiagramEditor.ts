import type { Application, ComponentClass, DiagramEditor as DiagramEditorApi, DiagramEditorEvents, DiagramEditorOptions, DiagramKindOptions } from "../../api/types";
import { DiagramView, type DiagramViewDefinition } from "./DiagramView";
import { Facade, resolveView } from "../Facade";

const diagramOptions = (options: unknown): boolean => {
  const value = options as Partial<DiagramKindOptions> | null;
  return !!value && typeof value === "object" && Array.isArray(value.nodeTypes) && Array.isArray(value.linkTypes) && value.linkTypes.length > 0;
};

/**
 * Public `DiagramEditor` (`app.components.DiagramEditor`): the node-and-link editor of a view whose resource offers
 * the diagram actions (`list`, `get`, and optionally `create`, `save`, `delete`, `type_create`, `type_delete`), over
 * `DiagramView`. Read-only without `save`. `saved` fires after the open diagram's content was saved; `editing()` is
 * true while it has unsaved changes. The built-in `diagram` view kind uses this class too.
 */
export class DiagramEditorFacade extends Facade<DiagramEditorEvents, DiagramView> implements DiagramEditorApi {
  constructor(app: Application, options: DiagramEditorOptions) {
    if (!options || typeof options !== "object") throw new TypeError("61ade: DiagramEditor needs an options object.");
    const view = resolveView<DiagramKindOptions>(app, options.view, "DiagramEditor", diagramOptions);
    super(options, (container, emit) => new DiagramView(container, {
      kind: "diagram", resource: view.resource!, title: view.title, actions: view.actions, diagram: view.options,
    } as unknown as DiagramViewDefinition, { saved: () => emit("saved", {}) }));
  }

  editing(): boolean { return !this.isDestroyed && this.engine.editing(); }
}

/** The `DiagramEditor` class bound to one application (resolves view ids through it). */
export function bindDiagramEditor(app: () => Application): ComponentClass<DiagramEditorOptions, DiagramEditorApi> {
  return class DiagramEditor extends DiagramEditorFacade {
    constructor(options: DiagramEditorOptions) { super(app(), options); }
  };
}
