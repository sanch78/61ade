import { openProgress } from "../components/progress/ProgressDialog";
import { Layout, Window, awaitRedraw, message } from "@dhtmlx/suite";
import { languages, locale, t } from "../I18n";
import { requestChoice, showDialog } from "../MessageDialog";
import { fitWindow } from "../WindowSizing";
import { uploads as uploader } from "../Uploader";
import { Realtime, type LiveChannel } from "../Realtime";
import { NAME } from "../app/registries";
import { signalOf, tieTo } from "./Events";
import { prepareCell } from "../components/Lifecycle";
import { popupMenu } from "../PopupMenu";
import { UiPreferences, type WindowGeometry } from "../UiPreferences";
import type { AppWindow, I18n, Identity, Live, Mountable, Preferences, PreferenceStore, Theme, Ui, Uploads, WindowOptions } from "./types";
import { narrow, onViewport } from "../Viewport";

/**
 * Thin toolkit services over the existing shell modules (toolkit K-F2). They add no behaviour of their own: the
 * catalog is I18n.ts, dialogs are MessageDialog.ts, the uploader is Uploader.ts, live data is the tab's LiveChannel.
 */
const escape = (text: string) => text.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export const i18n: I18n = { t, locale, languages };

const themeListeners = new Set<(theme: string, skin: string | null) => void>();
let themeBase = "blade", themeSkin: string | null = null;
export const theme: Theme = {
  current: () => themeBase,
  skin: () => themeSkin,
  onChange(listener, options) {
    const release = () => { themeListeners.delete(listener); };
    if (tieTo(signalOf(options, "theme.onChange"), release)) themeListeners.add(listener);
    return release;
  },
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
    subscribe(resource, query, handlers, options) {
      const signal = signalOf(options, "live.subscribe");
      const handle = new Realtime(channel(), resource, snapshot => handlers.update(snapshot), text => handlers.state?.(text), () => handlers.denied?.());
      const subscription = { subscribe: (next: typeof query) => handle.subscribe({ ...next }), destroy: () => handle.destroy() };
      if (signal?.aborted) { handle.destroy(); return subscription; }
      signal?.addEventListener("abort", () => handle.destroy(), { once: true });
      handle.subscribe({ ...query });
      return subscription;
    },
    // One record as a subscription of query `{record: id}` (Workspace::observe). The server hashes the answer, so a
    // repeated version (the first answer after a reconnect or a shown tab) is not reported again.
    watch(resource, id, handlers, options) {
      const signal = signalOf(options, "live.watch");
      if (typeof resource !== "string" || !resource || typeof id !== "string" || !id || typeof handlers?.update !== "function")
        throw new TypeError("61ade: live.watch takes a resource, a record id and handlers with `update`.");
      let version: string | undefined;
      const handle = new Realtime(channel(), resource, snapshot => {
        const record = snapshot.items[0];
        if (record && snapshot.version !== version) { version = snapshot.version; handlers.update(record); }
      }, text => handlers.state?.(text), () => handlers.denied?.());
      const watch = { destroy: () => handle.destroy() };
      if (signal?.aborted) { handle.destroy(); return watch; }
      signal?.addEventListener("abort", () => handle.destroy(), { once: true });
      handle.subscribe({ record: id });
      return watch;
    },
  };
}

export const identity = (id: string, displayName: string, tenant: string | null, authenticated = true): Identity => Object.freeze({ id, displayName, tenant, authenticated });

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
    const { resource, action, target, targetLabel, policy, files, transfer, background, onUploaded } = options;
    if (typeof resource !== "string" || !resource || typeof action !== "string" || !action) throw invalid("a resource and an action name");
    if (target !== null && typeof target !== "string") throw invalid("a target id string or null");
    if (typeof targetLabel !== "string") throw invalid("a targetLabel text");
    if (!policy || typeof policy !== "object" || !Array.isArray(policy.extensions) || !(policy.maxFiles >= 1) || !(policy.maxSizeBytes > 0))
      throw invalid("the action's upload policy (ActionMetadata.upload or the files view's options.upload.policy)");
    const queued = files === undefined ? undefined : Array.from(files as ArrayLike<File>);
    if (queued?.some(file => !(file instanceof File))) throw invalid("File objects in `files`");
    if (transfer !== undefined && !(transfer instanceof DataTransfer)) throw invalid("a DataTransfer in `transfer`");
    if (onUploaded !== undefined && typeof onUploaded !== "function") throw invalid("a function in `onUploaded`");
    if (background !== undefined && typeof background !== "boolean") throw invalid("a boolean in `background`");
    uploader.open({ resource, action, target, targetLabel, policy: { ...policy, extensions: [...policy.extensions] },
      ...(queued?.length ? { files: queued } : {}), ...(transfer ? { transfer } : {}), ...(background !== undefined ? { background } : {}), ...(onUploaded ? { onUploaded } : {}) });
  },
  reopen: () => uploader.reopen(),
};

let slots = 0;
/**
 * Puts $node into $parent. From one place in the page to another it is a state-preserving move where the browser has
 * `moveBefore` (a frame keeps its document, focus and scroll positions stay, playback goes on); otherwise `append`.
 */
export function moveInto(parent: HTMLElement, node: HTMLElement): void {
  const keep = parent as HTMLElement & { moveBefore?(node: Node, child: Node | null): void };
  if (node.isConnected && parent.isConnected && typeof keep.moveBefore === "function") try { keep.moveBefore(node, null); return; } catch { /* another document */ }
  parent.append(node);
}
/**
 * Attaches a Suite widget, a component (its root `layout`) or a plain element to a Layout cell. An element
 * lives in a slot of the target's HTML content and is put back whenever a repaint replaces that slot. Returns the
 * element's placement (a no-op for a widget or component), for a caller that draws the slot synchronously.
 */
export function attachContent(target: { attach(content: any): unknown; attachHTML(html: string): void }, content: Mountable, signal: AbortSignal): () => void {
  if (!(content instanceof HTMLElement)) {
    prepareCell(target);
    // A public component is mounted there, so it is placed once and its events are delivered (FB-0153); a Suite widget
    // is attached as it is.
    if ("destroy" in content && "layout" in content && typeof (content as { mount?: unknown }).mount === "function") (content as { mount(target: unknown): void }).mount(target);
    else target.attach("destroy" in content && "layout" in content ? content.layout : content);
    return () => {};
  }
  const id = "blade-slot-" + ++slots;
  target.attachHTML(`<div class="blade-view-slot" id="${id}"></div>`);
  const place = () => { const slot = document.getElementById(id); if (slot && content.parentElement !== slot) moveInto(slot, content); };
  const observer = new MutationObserver(place);
  observer.observe(document.body, { childList: true, subtree: true });
  // An element a later slot took over (a `PageLayout` arrangement switch) stays there.
  signal.addEventListener("abort", () => { observer.disconnect(); if (content.parentElement?.id === id) content.remove(); }, { once: true });
  place();
  return place;
}

/** The workspace between the menu row and the lower bar: a maximized window's box (the viewport without a shell). */
export function workspaceBox(): { left: number; top: number; width: number; height: number } {
  const box = document.querySelector<HTMLElement>(".blade-workspace")?.getBoundingClientRect();
  return box && box.width > 0 && box.height > 0 ? { left: box.left, top: box.top, width: box.width, height: box.height } : { left: 0, top: 0, width: innerWidth, height: innerHeight };
}

/** The area a non-modal window stays in: the workspace with the same 12 px margin as the viewport's. */
const floatArea = () => { const area = workspaceBox(); return { left: area.left + 12, top: area.top + 12, width: Math.max(120, area.width - 24), height: Math.max(120, area.height - 24) }; };

/** $box inside $area (default: the viewport with a 12 px margin), its size at most the area's. */
function clampBox(box: { left: number; top: number; width: number; height: number }, area = { left: 12, top: 12, width: innerWidth - 24, height: innerHeight - 24 }) {
  const width = Math.min(box.width, area.width), height = Math.min(box.height, area.height);
  return { width, height, left: Math.max(area.left, Math.min(box.left, area.left + area.width - width)), top: Math.max(area.top, Math.min(box.top, area.top + area.height - height)) };
}

/** The open non-modal windows (FB-0199): a view guide does not open by itself over them (FB-0200). */
const nonModal = new Set<AppWindow>();
/** Whether a non-modal window other than $except is open. */
export function nonModalOpen(except?: AppWindow): boolean { return [...nonModal].some(win => win !== except); }

/**
 * A framework document window (`Ui.window`, record views with `open: "window"`); below 768 px a modal one is full screen
 * and a non-modal one fills the workspace, also when the viewport crosses 768 px while it is open. `user` keys a remembered window (`id`) like the other UI preferences.
 */
export function openWindow(options: WindowOptions & { css?: string }, user = ""): AppWindow {
  // Without its own `maxHeight` a fitted window stops at the application's default (`fitWindow`, FB-0225).
  const maxHeight = options.maxHeight;
  if (maxHeight !== undefined && (typeof maxHeight !== "number" || Number.isNaN(maxHeight) || maxHeight < 120)) throw new TypeError("61ade: window `maxHeight` is a number of px from 120 (Infinity: the viewport).");
  const { titleOverflow = "end", titlePrefix } = options;
  if (titleOverflow !== "end" && titleOverflow !== "start") throw new TypeError('61ade: window `titleOverflow` is "end" or "start".');
  if (titlePrefix !== undefined && typeof titlePrefix !== "string") throw new TypeError("61ade: window `titlePrefix` is a plain text.");
  const shaped = titleOverflow === "start" || titlePrefix !== undefined, full = (text: string) => titlePrefix ? titlePrefix + " " + text : text;
  const { id, maximizable = false, closable = true } = options;
  if (id !== undefined && (typeof id !== "string" || !NAME.test(id))) throw new TypeError("61ade: window `id` is the preference key ([a-z][a-z0-9_.-]*).");
  if (typeof maximizable !== "boolean") throw new TypeError("61ade: window `maximizable` is a boolean.");
  if (typeof closable !== "boolean") throw new TypeError("61ade: window `closable` is a boolean.");
  const modal = options.modal ?? true, controller = new AbortController();
  // The window follows the 768 px breakpoint while it is open and keeps its content (FB-0260).
  let mobile = narrow();
  // A remembered window (FB-0199) opens where it was left, clamped to the viewport; a phone's window has no geometry of
  // its own. The `window:` prefix cannot be a view id, so it never meets a list's preferences.
  const remembered = id !== undefined ? new UiPreferences(user, "window:" + id) : undefined;
  // A desktop non-modal window stays inside the workspace (below the menu row, above the lower bar).
  const area = () => !mobile && !modal ? floatArea() : undefined;
  // On a phone it fills that area, so the menu row and the lower bar stay usable (FB-0257); a modal window is full screen.
  const phoneBox = () => modal ? { left: 0, top: 0, width: innerWidth, height: innerHeight } : workspaceBox();
  const openSize = () => ({ width: Math.min(options.width ?? 720, innerWidth - 24), height: Math.min(options.height ?? 560, innerHeight - 24) });
  const saved = mobile ? undefined : remembered?.window(), start = saved && clampBox(saved, area()), first = mobile ? phoneBox() : start;
  const win = new Window({ css: options.css ?? "blade-content-window", title: escape(options.title), ariaLabel: full(options.title),
    width: first?.width ?? openSize().width, height: first?.height ?? openSize().height,
    modal, closable, resizable: options.resizable ?? true, movable: !mobile });
  let closed = false;
  const finish = () => { if (closed) return; closed = true; controller.abort(); void awaitRedraw().then(() => win.destructor()); };
  win.events.on("afterHide", finish);
  // A remembered size is the user's: the window no longer fits its content.
  let sized = !!saved;
  const fits = () => options.fit !== false && !mobile && !sized;
  // Suite's `Window.attach` and `attachHTML` fill this cell; content goes to it directly, so it can be emptied
  // (`detach`) between HTML and a widget.
  const cell = (win as unknown as { _layout: Layout })._layout.getCell("content");
  const dialog = () => win.getContainer()?.closest<HTMLElement>('[role="dialog"]');
  let title = options.title;
  // A shaped title (FB-0194) is the header item's HTML: the prefix keeps its width, the rest is one line cut at its end
  // or, `direction: rtl` around an isolated `<bdi>`, at its start; the full title is its tooltip only while it is cut.
  const tooltip = () => {
    const box = dialog()?.querySelector<HTMLElement>(".blade-window-title"), rest = box?.querySelector<HTMLElement>(".blade-window-title__text");
    if (box && rest) { if (rest.scrollWidth > rest.clientWidth) box.title = full(title); else box.removeAttribute("title"); }
  };
  const showTitle = (text: string) => {
    title = text; win.config.title = escape(text); dialog()?.setAttribute("aria-label", full(text));
    if (!shaped) { win.header?.data.update("title", { value: escape(text) }); return; }
    win.header?.data.update("title", { value: full(text), html: `<span class="blade-window-title blade-window-title--${titleOverflow}">`
      + (titlePrefix ? `<span class="blade-window-title__prefix">${escape(titlePrefix)}</span>` : "")
      + `<span class="blade-window-title__text"><bdi>${escape(text)}</bdi></span></span>` });
    void awaitRedraw().then(tooltip);
  };
  const api: AppWindow = {
    window: win,
    signal: controller.signal,
    // A Layout (a component's included) fills the requested size; a form inside it fits the window itself (RecordForm).
    attach(content) {
      if (closed) return;
      attachContent(cell, content, controller.signal);
      if (fits() && (content instanceof HTMLElement || !(content instanceof Layout || ("destroy" in content && "layout" in content)))) void fitWindow(win, maxHeight);
    },
    setTitle(text) { if (!closed) showTitle(String(text)); },
    // A window that does not fit (`fit: false`, a full-screen phone window) keeps its size, also when its content asks.
    fit: () => closed || !fits() ? Promise.resolve() : fitWindow(win, maxHeight),
    close() { if (closed) return; if (win.isVisible()) win.hide(); else finish(); },
    get maximized() { return maximized; },
    maximize(next) { toggle(next === true); },
  };
  // Maximize/restore (FB-0199): the maximized window fills the workspace, so the menu row stays reachable; the restored
  // box is kept (and remembered) while it is maximized. Phones have no button: their window is full screen.
  let maximized = false, restored: WindowGeometry | undefined;
  const box = () => ({ ...win.getPosition(), ...win.getSize() });
  const remember = () => { if (remembered && !closed && !mobile) remembered.setWindow({ ...(maximized ? restored! : box()), maximized }); };
  const fill = () => { const area = workspaceBox(); win.setSize(area.width, area.height); win.setPosition(area.left, area.top); };
  const label = () => t(maximized ? "Ablak visszaállítása" : "Ablak maximalizálása");
  const toggle = (next: boolean) => {
    if (!maximizable || mobile || closed || next === maximized) return;
    if (next) restored = { ...box(), maximized: false };
    maximized = next;
    if (next) fill(); else { const back = clampBox(restored!, area()); win.setSize(back.width, back.height); win.setPosition(back.left, back.top); }
    win.config.movable = !next;
    dialog()?.classList.toggle("blade-window--maximized", next);
    win.header?.data.update("blade-maximize", { icon: next ? "bi bi-arrows-angle-contract" : "bi bi-arrows-angle-expand", tooltip: label() });
    remember();
  };
  const zoomButton = () => { if (maximizable && !win.header?.data.exists("blade-maximize")) win.header?.data.add({ id: "blade-maximize", type: "button", view: "link", size: "medium", color: "secondary", circle: true, icon: "bi bi-arrows-angle-expand", tooltip: label() }, win.header.data.getIndex("close")); };
  if (maximizable) {
    const header = win.header;
    if (!mobile) zoomButton();
    header?.events.on("click", (item: string | number) => { if (item === "blade-maximize") toggle(!maximized); });
    win.events.on("headerDoubleClick", () => toggle(!maximized));
    addEventListener("resize", () => { if (maximized) fill(); }, { signal: controller.signal });
  }
  // Only the user's drag (`move`) and resize handles (one side or corner; `setSize`/`setPosition` and the content fit
  // report all four) are remembered, never the maximized box.
  if (remembered) {
    win.events.on("move", () => { if (!maximized) remember(); });
    win.events.on("resize", (_state: unknown, _old: unknown, sides?: { left?: boolean; right?: boolean; top?: boolean; bottom?: boolean }) => {
      if (!maximized && sides && !(sides.left && sides.right && sides.top && sides.bottom)) remember();
    });
  }
  // On open, after a drag and when the workspace changes, a non-modal window is moved (and if needed shrunk) into it.
  const keep = () => {
    if (closed || maximized || !win.isVisible()) return;
    const now = box(), next = clampBox(now, floatArea());
    if (next.width !== now.width || next.height !== now.height) win.setSize(next.width, next.height);
    if (next.left !== now.left || next.top !== now.top) win.setPosition(next.left, next.top);
    return next.left !== now.left || next.top !== now.top || next.width !== now.width;
  };
  const fillPhone = () => { if (closed || !win.isVisible()) return; const next = phoneBox(); win.setSize(next.width, next.height); win.setPosition(next.left, next.top); };
  // A `resize` can arrive before the media query's change: the crossing first, so the desktop box is kept unclamped.
  const follow = () => { if (narrow() !== mobile) cross(narrow()); if (mobile) fillPhone(); else if (!modal) keep(); };
  addEventListener("resize", follow, { signal: controller.signal });
  if (!modal) {
    const signal = controller.signal, space = document.querySelector(".blade-workspace");
    // A drag past the top edge scrolls the (overflow-hidden) body and with it the menu row away: put it back first.
    document.addEventListener("mouseup", () => requestAnimationFrame(() => { if (mobile) return; document.body.scrollTop = document.body.scrollLeft = 0; if (keep()) remember(); }), { signal, capture: true });
    if (space) { const observer = new ResizeObserver(follow); observer.observe(space); signal.addEventListener("abort", () => observer.disconnect(), { once: true }); }
  }
  // Across 768 px the window changes form and keeps its content: the desktop box and a maximized state come back.
  let desktop: WindowGeometry | undefined, resume = false;
  const cross = (next: boolean) => {
    if (closed || next === mobile) return;
    if (next) {
      resume = maximized;
      desktop = maximized ? restored : { ...box(), maximized: false };
      maximized = false;
      dialog()?.classList.remove("blade-window--maximized");
      mobile = true;
      win.config.movable = false;
      if (win.header?.data.exists("blade-maximize")) win.header.data.remove("blade-maximize");
      dialog()?.classList.add("blade-window--phone");
      fillPhone();
      return;
    }
    mobile = false;
    win.config.movable = true;
    dialog()?.classList.remove("blade-window--phone");
    zoomButton();
    const stored = desktop ? undefined : remembered?.window();
    if (stored) { sized = true; resume = !!stored.maximized; }
    const size = openSize(), back = clampBox(desktop ?? stored ?? { ...size, left: (innerWidth - size.width) / 2, top: (innerHeight - size.height) / 2 }, area());
    win.setSize(back.width, back.height);
    win.setPosition(back.left, back.top);
    if (resume) toggle(true);
    else if (!desktop && fits()) void fitWindow(win, maxHeight);
  };
  onViewport(cross, controller.signal);
  if (!modal) {
    nonModal.add(api);
    controller.signal.addEventListener("abort", () => nonModal.delete(api), { once: true });
  }
  // Suite closes only a modal window on Escape; a non-modal one closes while the focus is inside it (FB-0155). An
  // Escape already taken (a menu or popup inside the window closed first) is left alone.
  // An un-closable window (`closable: false`) has no close button and no Escape (Suite binds neither, ModalWindows
  // finds no button to click); only `close()` and `signal` close it.
  if (closable && !(options.modal ?? true)) document.addEventListener("keydown", event => {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    const dialog = win.getContainer()?.closest<HTMLElement>('[role="dialog"]');
    if (dialog && document.activeElement && dialog.contains(document.activeElement)) { event.preventDefault(); api.close(); }
  }, { signal: controller.signal });
  if (first) win.show(first.left, first.top); else win.show();
  if (mobile) dialog()?.classList.add("blade-window--phone");
  if (saved?.maximized) toggle(true);
  if (!mobile && !modal) keep();
  if (shaped) {
    showTitle(title);
    const observer = new ResizeObserver(tooltip), box = dialog();
    if (box) observer.observe(box);
    controller.signal.addEventListener("abort", () => observer.disconnect(), { once: true });
  }
  if (options.signal?.aborted) api.close();
  else options.signal?.addEventListener("abort", () => api.close(), { once: true });
  return api;
}

export const ui: Ui = {
  dialog: options => showDialog(options),
  choice: options => requestChoice(options),
  toast(text, severity = "neutral") {
    message({ text: escape(String(text)), css: "blade-toast" + (severity === "neutral" ? "" : " blade-toast--" + severity), expire: severity === "neutral" ? 4000 : 8000 });
  },
  window: options => openWindow(options),
  attach(target, content, options) {
    const signal = signalOf(options, "ui.attach");
    if (!signal) throw new TypeError("61ade: ui.attach needs the owner's signal ({ signal }).");
    if (!target || typeof target.attach !== "function" || typeof target.attachHTML !== "function")
      throw new TypeError("61ade: ui.attach takes a Suite Layout cell (layout.getCell(id)).");
    if (!content || typeof content !== "object") throw new TypeError("61ade: ui.attach takes a Suite widget, a component or an element.");
    if (!signal.aborted) attachContent(target, content, signal);
  },
  menu: (anchor, options) => popupMenu(anchor, options),
  progress: options => openProgress(options),
  async copy(text, options) {
    if (typeof text !== "string") throw new TypeError("61ade: ui.copy takes a plain text.");
    const label = options?.label, done = await copyText(text);
    if (done) ui.toast(label ? t("{label} másolva.", { label }) : t("Másolva."));
    else ui.toast(t("A másolás nem sikerült."), "danger");
    return done;
  },
  submitKeys(element, options) {
    const signal = signalOf(options, "ui.submitKeys");
    if (!signal) throw new TypeError("61ade: ui.submitKeys needs the owner's signal ({ signal }).");
    if (!(element instanceof HTMLElement)) throw new TypeError("61ade: ui.submitKeys takes an element.");
    if (typeof options.submit !== "function") throw new TypeError("61ade: ui.submitKeys `submit` is a function.");
    if (options.cancel !== undefined && typeof options.cancel !== "function") throw new TypeError("61ade: ui.submitKeys `cancel` is a function.");
    if (signal.aborted) return;
    element.setAttribute("aria-keyshortcuts", "Control+Enter Meta+Enter" + (options.cancel ? " Escape" : ""));
    element.addEventListener("keydown", event => {
      if (event.isComposing || event.defaultPrevented || event.repeat) return;
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey) { event.preventDefault(); options.submit(); }
      else if (event.key === "Escape" && options.cancel) { event.preventDefault(); options.cancel(); }
    }, { signal });
    signal.addEventListener("abort", () => element.removeAttribute("aria-keyshortcuts"), { once: true });
  },
};

/** Writes $text to the clipboard: the async Clipboard API, else a hidden textarea and `execCommand("copy")`. */
export async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fall back */ }
  const area = document.createElement("textarea"), focus = document.activeElement as HTMLElement | null;
  area.value = text; area.setAttribute("readonly", ""); area.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
  document.body.append(area); area.select();
  try { return document.execCommand("copy"); } catch { return false; } finally { area.remove(); focus?.focus?.(); }
}
