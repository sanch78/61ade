import type { ListOptions, ViewDefinition, ViewKind } from "../api/types";
import type { NamedRegistry } from "./registries";
import type { LiveChannel } from "../Realtime";

/** What a built-in kind may need beyond the public API: the tab's live channel and the preference user. */
export type BuiltinContext = { channel: () => LiveChannel; user: string };

/** Registers `list`, `files`, `diagram` and `calendar` on the `views` registry (the shell opens views only through it). */
export function registerBuiltins(views: NamedRegistry<ViewKind<any>>, context: BuiltinContext): void {
  // The list kind is the public ListView (dogfooding): mounted in the host, destroyed with its signal.
  views.builtin("list", { create(host, view: ViewDefinition<ListOptions>) {
    const list = new host.app.components.ListView({ view, filters: { ...host.filters }, signal: host.signal });
    list.mount(host);
    return { destroy: () => list.destroy(), editing: () => list.editing(), refresh: () => list.refresh() };
  } });
  // Dogfooding: the files, diagram and calendar kinds are the public components, mounted into the host.
  views.builtin("files", { create(host, view) {
    const files = new host.app.components.FileManager({ view, signal: host.signal });
    files.mount(host);
    return { destroy: () => files.destroy() };
  } });
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
