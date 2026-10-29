import type { Layout } from "@dhtmlx/suite";
import type { FileManagerOptions, ListOptions, ViewDefinition, ViewHost, ViewInstance, ViewKind } from "../api/types";
import type { NamedRegistry } from "./registries";
import type { LiveChannel } from "../Realtime";
import { Workspace, type ViewDefinition as ListDefinition } from "../Workspace";
import { FileManager, type FileViewDefinition } from "../FileManager";

/** What the built-in list kind needs beyond the public API: the tab's live channel and the preference user. */
export type BuiltinContext = { channel: () => LiveChannel; user: string };

/** The shared top-level keys of a view in the internal component shape (`group`/`icon` without `null`). */
const shared = (view: ViewDefinition) => ({ id: view.id, resource: view.resource ?? "", title: view.title, actions: view.actions,
  ...(view.group ? { group: view.group } : {}), ...(view.icon ? { icon: view.icon } : {}), ...(view.desktopOnly ? { desktopOnly: true } : {}) });

/**
 * A list view in `Workspace`'s shape: its `options` (today's list keys, unchanged) beside the shared keys, the sub-view's
 * child view converted the same way.
 */
export function listDefinition(view: ViewDefinition<ListOptions>): ListDefinition {
  const subview = view.options.subview;
  return { ...view.options, ...shared(view),
    ...(subview ? { subview: { ...subview, ...(subview.view ? { view: listDefinition(subview.view) } : {}) } } : {}) } as unknown as ListDefinition;
}

type Content = { layout: Layout; destroy(): void };
/** A built-in kind: the component is created, attached to the host and released by the instance. */
const kind = <Options, C extends Content>(create: (view: ViewDefinition<Options>, host: ViewHost) => C,
  extras: (content: C) => Omit<ViewInstance, "destroy"> = () => ({})): ViewKind<Options> => ({
  create(host, view) {
    const content = create(view, host);
    host.attach(content.layout);
    return { ...extras(content), destroy: () => content.destroy() };
  },
});

/** Registers `list`, `files`, `diagram` and `calendar` on the `views` registry (the shell opens views only through it). */
export function registerBuiltins(views: NamedRegistry<ViewKind<any>>, context: BuiltinContext): void {
  views.builtin("list", kind((view: ViewDefinition<ListOptions>, host) =>
    new Workspace(document.createElement("div"), listDefinition(view), context.channel(), context.user, undefined, { ...host.filters }),
    list => ({ editing: () => list.editing(), refresh: () => list.refresh() })));
  views.builtin("files", kind((view: ViewDefinition<FileManagerOptions>) =>
    new FileManager(document.createElement("div"), { ...shared(view), kind: "files", files: view.options } as unknown as FileViewDefinition)));
  // Dogfooding: the diagram and calendar kinds are the public components, mounted into the host.
  views.builtin("diagram", { create(host, view) {
    const editor = new host.app.components.DiagramEditor({ view, signal: host.signal });
    editor.mount(host);
    return { editing: () => editor.editing(), destroy: () => editor.destroy() };
  } });
  views.builtin("calendar", { create(host, view) {
    const calendar = new host.app.components.Calendar({ view, signal: host.signal });
    calendar.mount(host);
    return { destroy: () => calendar.destroy() };
  } });
}
