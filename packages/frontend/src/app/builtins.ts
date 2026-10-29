import type { Layout } from "@dhtmlx/suite";
import type { CalendarOptions, DiagramOptions, FileManagerOptions, ListOptions, ViewDefinition, ViewHost, ViewInstance, ViewKind } from "../api/types";
import type { NamedRegistry } from "./registries";
import type { LiveChannel } from "../Realtime";
import { FileManager, type FileViewDefinition } from "../FileManager";
import { DiagramEditor, type DiagramViewDefinition } from "../DiagramEditor";
import { Calendar, type CalendarViewDefinition } from "../Calendar";

/** What a built-in kind may need beyond the public API: the tab's live channel and the preference user. */
export type BuiltinContext = { channel: () => LiveChannel; user: string };

/** The shared top-level keys of a view in the internal component shape (`group`/`icon` without `null`). */
const shared = (view: ViewDefinition) => ({ id: view.id, resource: view.resource ?? "", title: view.title, actions: view.actions,
  ...(view.group ? { group: view.group } : {}), ...(view.icon ? { icon: view.icon } : {}), ...(view.desktopOnly ? { desktopOnly: true } : {}) });

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
  // The list kind is the public ListView (dogfooding): mounted in the host, destroyed with its signal.
  views.builtin("list", { create(host, view: ViewDefinition<ListOptions>) {
    const list = new host.app.components.ListView({ view, filters: { ...host.filters }, signal: host.signal });
    list.mount(host);
    return { destroy: () => list.destroy(), editing: () => list.editing(), refresh: () => list.refresh() };
  } });
  views.builtin("files", kind((view: ViewDefinition<FileManagerOptions>) =>
    new FileManager(document.createElement("div"), { ...shared(view), kind: "files", files: view.options } as unknown as FileViewDefinition)));
  views.builtin("diagram", kind((view: ViewDefinition<DiagramOptions>) =>
    new DiagramEditor(document.createElement("div"), { ...shared(view), kind: "diagram", diagram: view.options } as unknown as DiagramViewDefinition),
    editor => ({ editing: () => editor.editing() })));
  views.builtin("calendar", kind((view: ViewDefinition<CalendarOptions>) =>
    new Calendar(document.createElement("div"), { ...shared(view), kind: "calendar", calendar: view.options } as unknown as CalendarViewDefinition)));
}
