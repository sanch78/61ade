import type { Layout } from "@dhtmlx/suite";
import type { ClientCommand, ColumnPresentation, FileManagerOptions, ListOptions, ViewDefinition, ViewHost, ViewInstance, ViewKind } from "../api/types";
import type { NamedRegistry } from "./registries";
import type { LiveChannel } from "../Realtime";
import { FileManager, type FileViewDefinition } from "../FileManager";
import { imagePresentation } from "../RecordPresentation";
import { builtinCommands } from "../components/list/commands";

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

/**
 * Registers the built-in entries (dogfooding): the kinds `list`, `files`, `diagram` and `calendar` on `views` (the
 * shell opens views only through it), the `image` column presentation on `presentations` and the lists' `details`
 * (`Adatok`) command on `commands`; the list surfaces render and run them through these registries.
 */
export function registerBuiltins(registries: { views: NamedRegistry<ViewKind<any>>; presentations: NamedRegistry<ColumnPresentation>; commands: NamedRegistry<ClientCommand> }, context: BuiltinContext): void {
  const { views } = registries;
  registries.presentations.builtin("image", imagePresentation);
  for (const [name, command] of Object.entries(builtinCommands)) registries.commands.builtin(name, command);
  // The list kind is the public ListView (dogfooding): mounted in the host, destroyed with its signal.
  views.builtin("list", { create(host, view: ViewDefinition<ListOptions>) {
    const list = new host.app.components.ListView({ view, filters: { ...host.filters }, signal: host.signal });
    list.mount(host);
    return { destroy: () => list.destroy(), editing: () => list.editing(), refresh: () => list.refresh() };
  } });
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
