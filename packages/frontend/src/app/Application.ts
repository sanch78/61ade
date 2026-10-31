import * as Suite from "@dhtmlx/suite";
import { t } from "../I18n";
import { uploads as uploader, type UploadEvents } from "../Uploader";
import type { LiveChannel } from "../Realtime";
import type { Application, ClientCommand, ColumnPresentation, Components, FieldType, MediaType, NavigationTarget, ViewDefinition, ViewKind } from "../api/types";
import { server } from "../api/Server";
import { createEventBus, type InternalEventBus } from "../api/Events";
import { i18n, identity, live, preferences, theme, ui, uploads } from "../api/services";
import { NamedRegistry, extensions } from "./registries";
import { registerBuiltins } from "./builtins";
import { listComponents } from "../components/list";
import { bindCalendar } from "../components/calendar/Calendar";
import { bindDiagramEditor } from "../components/diagram/DiagramEditor";
import { bindFileManager } from "../components/files/FileManager";
import { filePicker } from "../components/files/FilePicker";
import { sandboxFrameClass } from "../components/sandbox/SandboxFrame";
import { MediaPlayer } from "../components/media/MediaPlayer";

/** What the shell hands the application object: its live channel, the signed-in identity, its views and router. */
export type ShellBridge = {
  channel: () => LiveChannel;
  userId: string;
  displayName: string;
  tenant: string | null;
  views: readonly ViewDefinition[];
  navigate(target: NavigationTarget): boolean;
};

export type Kernel = { app: Application; events: InternalEventBus; kinds: NamedRegistry<ViewKind<any>> };

const UPLOAD_EVENTS: (keyof UploadEvents)[] = ["upload:queued", "upload:started", "upload:progress", "upload:conflict", "upload:file-done", "upload:file-failed", "upload:complete", "upload:cancelled"];

/** The page's one `Application` (toolkit K-F3), created by the shell after sign-in, with the built-in kinds. */
export function createApplication(bridge: ShellBridge): Kernel {
  const events = createEventBus();
  for (const name of UPLOAD_EVENTS) uploader.on(name, payload => events.dispatch(name, payload as never));
  const kinds = new NamedRegistry<ViewKind<any>>("view kind");
  const presentations = new NamedRegistry<ColumnPresentation>("presentation");
  const fieldTypes = new NamedRegistry<FieldType>("field type");
  const commands = new NamedRegistry<ClientCommand>("command");
  const mediaTypes = new NamedRegistry<MediaType>("media type");
  // Before any module, so a project can replace a built-in entry with `{replace: true}`.
  registerBuiltins({ kinds, presentations, commands, mediaTypes }, { channel: bridge.channel, user: bridge.userId });
  const offered = Object.freeze([...bridge.views]);
  const app: Application = Object.freeze({
    apiVersion: 1 as const,
    dhx: Suite,
    server,
    ui,
    uploads,
    i18n,
    theme,
    preferences: preferences(bridge.userId),
    live: live(bridge.channel),
    events,
    identity: identity(bridge.userId, bridge.displayName, bridge.tenant),
    kinds,
    presentations,
    fieldTypes,
    commands,
    mediaTypes,
    // Public component classes (toolkit P3 C-1 … C-4), bound to this application.
    components: Object.freeze<Partial<Components>>({
      ...listComponents({ channel: bridge.channel, user: bridge.userId, app: () => app }),
      Calendar: bindCalendar(() => app),
      DiagramEditor: bindDiagramEditor(() => app),
      FileManager: bindFileManager(() => app),
      FilePicker: filePicker,
      SandboxFrame: sandboxFrameClass(payload => events.dispatch("sandbox:error", payload)),
      MediaPlayer,
    }) as Components,
    viewDefinitions: () => offered,
    viewDefinition: (id: string) => offered.find(view => view.id === id),
    navigate: (target: NavigationTarget) => bridge.navigate(target),
  });
  // The framework surfaces (lists, details, forms) read the page's registries when they are created.
  Object.assign(extensions, { app, presentations, fieldTypes, commands, mediaTypes });
  return { app, events, kinds };
}

/** Per module: its import and its initialization each have this long (G1 decision 5). */
const MODULE_TIMEOUT = 5000;
const TIMEOUT = Symbol("timeout");
const limited = <T>(promise: Promise<T>): Promise<T | typeof TIMEOUT> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([promise, new Promise<typeof TIMEOUT>(resolve => { timer = setTimeout(() => resolve(TIMEOUT), MODULE_TIMEOUT); })])
    .finally(() => clearTimeout(timer));
};

/**
 * Module loader (O1): `import()`s every declared module in parallel, then calls the default exports one by one in
 * declaration order with `app`. A failed import, a missing default export, a throw, a rejection or more than 5 s is
 * reported (toast, `module:error`, console) and skipped; registrations made before a failure stay. Never rejects.
 * The server sends each path with its cache key (`?v=<base36 mtime>-<base36 size>` of the served file, or a key of its
 * own; docs/toolkit.md#cache-keys); only a path that arrives without any `?` gets `?v=<version>` here as a fallback.
 */
export async function loadModules(kernel: Kernel, modules: readonly string[], version = ""): Promise<void> {
  const report = (module: string, reason: "load" | "init" | "timeout", error: unknown) => {
    console.error(`61ade: application module ${module} failed (${reason})`, error);
    kernel.events.dispatch("module:error", { module, reason, error });
    kernel.app.ui.toast(t("Egy alkalmazásmodul nem indult el: {module}", { module }), "danger");
  };
  const address = (path: string) => { const url = new URL(path, location.href); if (!url.search && version) url.searchParams.set("v", version); return url.href; };
  const imports = modules.map(path => limited(import(/* @vite-ignore */ address(path)) as Promise<{ default?: unknown }>));
  for (const [index, module] of modules.entries()) {
    let loaded: { default?: unknown } | typeof TIMEOUT;
    try { loaded = await imports[index]; } catch (error) { report(module, "load", error); continue; }
    if (loaded === TIMEOUT) { report(module, "timeout", new Error(`import exceeded ${MODULE_TIMEOUT} ms`)); continue; }
    const main = loaded.default;
    if (typeof main !== "function") { report(module, "load", new TypeError("the module has no default export function")); continue; }
    try {
      if (await limited(Promise.resolve(main(kernel.app))) === TIMEOUT) report(module, "timeout", new Error(`initialization exceeded ${MODULE_TIMEOUT} ms`));
    } catch (error) { report(module, "init", error); }
  }
}
