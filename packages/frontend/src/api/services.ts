import { Window, awaitRedraw, message } from "@dhtmlx/suite";
import { languages, locale, t } from "../I18n";
import { requestChoice, showDialog } from "../MessageDialog";
import { fitWindow } from "../WindowSizing";
import { uploads as uploader } from "../Uploader";
import { Realtime, type LiveChannel } from "../Realtime";
import { NAME } from "../app/registries";
import type { AppWindow, I18n, Identity, Live, Mountable, Preferences, PreferenceStore, Theme, Ui, Uploads, WindowOptions } from "./types";

/**
 * Thin toolkit services over the existing shell modules (toolkit K-F2). They add no behaviour of their own: the
 * catalog is I18n.ts, dialogs are MessageDialog.ts, the uploader is Uploader.ts, live data is the tab's LiveChannel.
 */
const escape = (text: string) => text.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export const i18n: I18n = { t, locale, languages };

const themeListeners = new Set<(theme: string, skin: string | null) => void>();
let themeBase = "skyblue", themeSkin: string | null = null;
export const theme: Theme = {
  current: () => themeBase,
  skin: () => themeSkin,
  onChange(listener) { themeListeners.add(listener); return () => { themeListeners.delete(listener); }; },
};
/** Called by the shell after every theme or skin application. */
export function themeApplied(base: string, skin: string | null): void {
  themeBase = base; themeSkin = skin;
  for (const listener of [...themeListeners]) { try { listener(base, skin); } catch (error) { console.error(error); } }
}

/**
 * `Application.preferences`: one localStorage entry per scope, `blade-ui:1:[path, user, "scope:<name>"]`, beside the
 * list views' `blade-ui:1:[path, user, <view id>]` entries (the `scope:` prefix cannot be a view id).
 */
export function preferences(user: string): Preferences {
  return {
    scope(name: string): PreferenceStore {
      if (typeof name !== "string" || !NAME.test(name) || !name.includes(".")) throw new TypeError(`61ade: preference scope "${String(name)}" needs a project prefix with a dot.`);
      const key = "blade-ui:1:" + JSON.stringify([location.pathname, user, "scope:" + name]);
      const read = (): Record<string, unknown> => {
        try { const value = JSON.parse(localStorage.getItem(key) ?? "{}"); return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
        catch { return {}; }
      };
      const write = (state: Record<string, unknown>) => {
        try { if (Object.keys(state).length) localStorage.setItem(key, JSON.stringify(state)); else localStorage.removeItem(key); } catch {}
      };
      return {
        get: <T>(field: string) => { const state = read(); return Object.hasOwn(state, field) ? state[field] as T : undefined; },
        set: (field, value) => { const state = read(); state[field] = value; write(state); },
        remove: field => { const state = read(); delete state[field]; write(state); },
      };
    },
  };
}

/** `Application.live`: a `Realtime` handle on the tab's one channel per subscription. */
export function live(channel: () => LiveChannel): Live {
  return {
    subscribe(resource, query, handlers, signal) {
      const handle = new Realtime(channel(), resource, snapshot => handlers.update(snapshot), text => handlers.state?.(text), () => handlers.denied?.());
      const subscription = { subscribe: (next: typeof query) => handle.subscribe({ ...next }), destroy: () => handle.destroy() };
      if (signal?.aborted) { handle.destroy(); return subscription; }
      signal?.addEventListener("abort", () => handle.destroy(), { once: true });
      handle.subscribe({ ...query });
      return subscription;
    },
  };
}

export const identity = (id: string, displayName: string, tenant: string | null): Identity => Object.freeze({ id, displayName, tenant });

/**
 * `Application.uploads` over the page's one `Uploader.ts` service (the shell's own uploads use the same service, so
 * the queue, window, indicator and `upload:*` events are shared). `open` checks and copies the options before the
 * window opens: a wrong shape is a `TypeError`, never a half-opened window. Files and a drop's DataTransfer queue
 * at once; the server still checks every file against the action's `UploadPolicy`, ACL and handler.
 */
export const uploads: Uploads = {
  open(options) {
    const invalid = (what: string) => new TypeError(`61ade: uploads.open needs ${what}.`);
    if (!options || typeof options !== "object") throw invalid("an options object");
    const { resource, action, target, targetLabel, policy, files, transfer, onUploaded } = options;
    if (typeof resource !== "string" || !resource || typeof action !== "string" || !action) throw invalid("a resource and an action name");
    if (target !== null && typeof target !== "string") throw invalid("a target id string or null");
    if (typeof targetLabel !== "string") throw invalid("a targetLabel text");
    if (!policy || typeof policy !== "object" || !Array.isArray(policy.extensions) || !(policy.max_files >= 1) || !(policy.max_size_bytes > 0))
      throw invalid("the action's upload policy (ActionMetadata.upload or the files view's options.upload.policy)");
    const queued = files === undefined ? undefined : Array.from(files as ArrayLike<File>);
    if (queued?.some(file => !(file instanceof File))) throw invalid("File objects in `files`");
    if (transfer !== undefined && !(transfer instanceof DataTransfer)) throw invalid("a DataTransfer in `transfer`");
    if (onUploaded !== undefined && typeof onUploaded !== "function") throw invalid("a function in `onUploaded`");
    uploader.open({ resource, action, target, targetLabel, policy: { ...policy, extensions: [...policy.extensions] },
      ...(queued?.length ? { files: queued } : {}), ...(transfer ? { transfer } : {}), ...(onUploaded ? { onUploaded } : {}) });
  },
  reopen: () => uploader.reopen(),
};

let slots = 0;
/**
 * Attaches a Suite widget, a component (its root `layout`) or a plain element to a Layout cell or Window. An element
 * lives in a slot of the target's HTML content and is put back whenever a repaint replaces that slot.
 */
export function attachContent(target: { attach(content: any): unknown; attachHTML(html: string): void }, content: Mountable, signal: AbortSignal): void {
  if (!(content instanceof HTMLElement)) { target.attach("destroy" in content && "layout" in content ? content.layout : content); return; }
  const id = "blade-slot-" + ++slots;
  target.attachHTML(`<div class="blade-view-slot" id="${id}"></div>`);
  const place = () => { const slot = document.getElementById(id); if (slot && content.parentElement !== slot) slot.append(content); };
  const observer = new MutationObserver(place);
  observer.observe(document.body, { childList: true, subtree: true });
  signal.addEventListener("abort", () => { observer.disconnect(); content.remove(); }, { once: true });
  place();
}

/** A framework document window (`Ui.window`, record views with `open: "window"`); full screen below 768 px. */
export function openWindow(options: WindowOptions & { css?: string }): AppWindow {
  const mobile = innerWidth < 768, controller = new AbortController();
  const win = new Window({ css: options.css ?? "blade-content-window", title: escape(options.title), ariaLabel: options.title,
    width: mobile ? innerWidth : Math.min(options.width ?? 720, innerWidth - 24), height: mobile ? innerHeight : Math.min(options.height ?? 560, innerHeight - 24),
    modal: options.modal ?? true, closable: true, resizable: !mobile && (options.resizable ?? true), movable: !mobile });
  let closed = false;
  const finish = () => { if (closed) return; closed = true; controller.abort(); void awaitRedraw().then(() => win.destructor()); };
  win.events.on("afterHide", finish);
  const fit = options.fit !== false && !mobile;
  const api: AppWindow = {
    window: win,
    signal: controller.signal,
    attach(content) { if (closed) return; attachContent(win, content, controller.signal); if (fit) void fitWindow(win); },
    setTitle(text) { if (closed) return; win.config.title = escape(text); win.header?.data.update("title", { value: escape(text) }); },
    fit: () => closed ? Promise.resolve() : fitWindow(win),
    close() { if (closed) return; if (win.isVisible()) win.hide(); else finish(); },
  };
  win.show();
  if (options.signal?.aborted) api.close();
  else options.signal?.addEventListener("abort", () => api.close(), { once: true });
  return api;
}

export const ui: Ui = {
  dialog: options => showDialog(options),
  choice: options => requestChoice(options),
  toast(text, severity = "neutral") {
    message({ text, css: "blade-toast" + (severity === "neutral" ? "" : " blade-toast--" + severity), expire: severity === "neutral" ? 4000 : 8000 });
  },
  window: options => openWindow(options),
};
