import { ContextMenu, awaitRedraw } from "@dhtmlx/suite";
import { t } from "./I18n";
import { signalOf } from "./api/Events";
import "./popup-menu.css";
import type { PopupMenu, PopupMenuEntry, PopupMenuEvents, PopupMenuItem, PopupMenuOptions, SignalOptions } from "./api/types";

const ID = /^[A-Za-z0-9_.:-]+$/;
/** Entries a menu may hold; about twelve are visible, the rest scroll. */
const LIMIT = 200;
let serial = 0;
/** The one open popup menu of the page: opening another closes it. */
let current: AnchoredMenu | undefined;

const invalid = (message: string) => new TypeError("61ade: " + message);
const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

/**
 * Suite's `ContextMenu` opened at a button the project placed (`navigationType: "click"`: leaving it with the pointer
 * keeps it open). Suite draws the entries (`menuitem`; `menuitemradio` with `aria-checked` for a toggle in a `group`)
 * and moves the focus with the arrows and Home/End. This subclass tracks whether it is shown and returns the focus to
 * the anchor when a close takes it out of the popup, because Suite returns it only to its own bar's buttons.
 */
class AnchoredMenu extends ContextMenu {
  onClose?: (focusWasInside: boolean) => void;
  /**
   * Shown by `showAt` until a close. Suite's `_popupActive` is not used: after a pick its context menu repaints in its
   * `afterHide` handler and sets the flag again with no popup on the screen.
   */
  visible = false;
  get popup(): HTMLElement | undefined { return this._vpopups?.node?.el as HTMLElement | undefined; }
  /** The drawn element of entry $id, focused with the roving tab stop Suite keeps (`_menuFocusId`); else the list. */
  focusEntry(id: string | undefined): void {
    const target = id === undefined ? undefined : this.popup?.querySelector<HTMLElement>(`[data-dhx-id="${CSS.escape(id)}"]`);
    if (target) { this._menuFocusId = id!; target.focus(); }
    else this.popup?.querySelector<HTMLElement>('[role="menu"]')?.focus();
  }
  /** The accessible name of the drawn `role="menu"` list: Suite takes it from the root item's `value` or `tooltip`. */
  name(label: string): void { (this as unknown as { _rootItem: { tooltip?: string } })._rootItem.tooltip = label; }
  /**
   * Replaces the entries. Suite's radio bookkeeping (`_groups`, which its click handler reads) is otherwise rebuilt
   * only 100 ms after a change, so a quick pick of a checkable entry would throw.
   */
  load(data: any[]): void {
    this.data.removeAll();
    this.data.parse(data);
    const groups: Record<string, { active?: string; elements: string[] }> = {};
    for (const item of data) if (item.group) {
      const group = groups[item.group] ??= { elements: [] };
      group.elements.push(item.id);
      if (item.active) group.active = item.id;
    }
    (this as unknown as { _groups: typeof groups })._groups = groups;
  }
  showAt(element: HTMLElement, mode?: "bottom" | "right"): void {
    if (current && current !== this) current.shut();
    super.showAt(element, mode);
    this.visible = true;
    current = this;
  }
  /** Closes the open popup as an outside click would. */
  shut(): void { if (this.visible || this._popupActive) this._close(new MouseEvent("click")); }
  protected _close(event: MouseEvent | TouchEvent): void {
    const open = this.visible, active = document.activeElement, inside = !!active && !!this.popup?.contains(active);
    this.visible = false;
    if (current === this) current = undefined;
    super._close(event);
    if (open) this.onClose?.(inside);
  }
}

/**
 * `app.ui.menu(anchor, options)` (docs/toolkit.md#popup-menu): an APG menu button on any element. The anchor gets
 * `aria-haspopup="menu"` and `aria-expanded`; a click, Enter, Space or ArrowDown opens the menu on the checked entry
 * (else the first), ArrowUp on the last; Escape closes it and returns the focus to the anchor before a window behind
 * it sees the key; Tab closes it and moves on from the anchor; a pick closes it, returns the focus and reports
 * `select {id}`. `items` may be a function, read at every opening.
 */
export function popupMenu(anchor: HTMLElement, options: PopupMenuOptions): PopupMenu {
  if (!(anchor instanceof HTMLElement)) throw invalid("ui.menu needs the anchor element (the button that opens it).");
  if (!options || typeof options !== "object") throw invalid("ui.menu needs options ({ label, items }).");
  if (typeof options.label !== "string" || !options.label.trim()) throw invalid("ui.menu needs a label (the menu's accessible name).");
  if (!Array.isArray(options.items) && typeof options.items !== "function") throw invalid("ui.menu items are an array or a function that returns one.");
  if (options.empty !== undefined && typeof options.empty !== "string") throw invalid("ui.menu empty is text.");
  const signal = signalOf(options, "ui.menu");
  if (Array.isArray(options.items)) build(options.items, "#check");

  const prefix = `blade-menu#${++serial}:`;
  const handlers = new Set<(payload: PopupMenuEvents["select"]) => void>();
  const life = new AbortController();
  const menu = new AnchoredMenu(undefined, { css: "blade-popup-menu", navigationType: "click" });
  menu.name(options.label);
  let ids = new Map<string, string>();
  let pressOpen: boolean | undefined;
  let width = 0;
  let destroyed = false;

  const hadPopup = anchor.getAttribute("aria-haspopup"), hadExpanded = anchor.getAttribute("aria-expanded");
  anchor.setAttribute("aria-haspopup", "menu");
  anchor.setAttribute("aria-expanded", "false");
  const native = anchor instanceof HTMLButtonElement || (anchor instanceof HTMLInputElement && /^(button|submit|reset)$/.test(anchor.type));
  const disabled = () => (anchor as HTMLButtonElement).disabled === true || anchor.getAttribute("aria-disabled") === "true";

  /** The height cap: the larger room below or above the anchor (Suite measures the list before it places it). */
  const space = () => {
    const box = anchor.getBoundingClientRect(), height = document.documentElement.clientHeight;
    return Math.max(120, Math.max(height - box.bottom, box.top) - 12);
  };
  menu.onClose = inside => {
    anchor.setAttribute("aria-expanded", "false");
    if (!current) document.documentElement.style.removeProperty("--blade-popup-menu-space");
    // A close that took the focus out of the popup (a heading click, a resize) gives it back to the anchor.
    if (inside && !destroyed && anchor.isConnected) anchor.focus();
  };

  menu.events.on("click", (suiteId: string | number) => {
    const id = ids.get(String(suiteId));
    // Suite closes the menu itself after the click (the focus is back on the anchor); then the handlers run.
    if (id !== undefined) queueMicrotask(() => {
      if (destroyed) return;
      for (const handler of [...handlers]) { try { handler({ id }); } catch (error) { console.error(error); } }
    });
  });

  const api: PopupMenu = {
    get opened() { return !destroyed && menu.visible; },
    open(focus = "checked") {
      if (destroyed) return;
      if (focus !== "checked" && focus !== "first" && focus !== "last") throw invalid(`ui.menu open focus "${String(focus)}" is checked, first or last.`);
      const items = typeof options.items === "function" ? options.items() : options.items;
      const built = build(items, prefix, options.empty ?? t("Nincs választható elem."));
      menu.shut();
      // Another open menu closes first, so its close does not clear this one's height cap.
      if (current && current !== menu) current.shut();
      ids = built.ids;
      menu.load(built.data);
      document.documentElement.style.setProperty("--blade-popup-menu-space", `${space()}px`);
      width = innerWidth;
      menu.showAt(anchor, "bottom");
      anchor.setAttribute("aria-expanded", "true");
      const entries = built.focusable;
      const target = focus === "last" ? entries[entries.length - 1] : focus === "first" ? entries[0] : built.checked ?? entries[0];
      void awaitRedraw().then(() => { if (!destroyed && menu.visible) menu.focusEntry(target); });
    },
    close() {
      if (!api.opened) return;
      menu.shut();
      anchor.focus();
    },
    on(event, handler, onOptions?: SignalOptions) {
      if (event !== "select") throw invalid(`ui.menu has no "${String(event)}" event.`);
      if (typeof handler !== "function") throw invalid("ui.menu event handler must be a function.");
      const handlerSignal = signalOf(onOptions, "menu.on");
      const release = () => { handlers.delete(handler); };
      if (destroyed || handlerSignal?.aborted) return release;
      handlers.add(handler);
      handlerSignal?.addEventListener("abort", release, { once: true, signal: life.signal });
      return release;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      menu.shut();
      life.abort();
      handlers.clear();
      menu.destructor();
      if (hadPopup === null) anchor.removeAttribute("aria-haspopup"); else anchor.setAttribute("aria-haspopup", hadPopup);
      if (hadExpanded === null) anchor.removeAttribute("aria-expanded"); else anchor.setAttribute("aria-expanded", hadExpanded);
    },
  };

  const listen = { signal: life.signal };
  // A press on the anchor while the menu is open closes it (Suite's outside click closes it first, on the document).
  anchor.addEventListener("pointerdown", () => { pressOpen = api.opened; }, { ...listen, capture: true });
  anchor.addEventListener("click", event => {
    // Only a pointer's click follows its press; a keyboard click (detail 0) acts on the state as it is.
    const open = event.detail > 0 && pressOpen !== undefined ? pressOpen : api.opened;
    pressOpen = undefined;
    if (disabled()) return;
    event.preventDefault();
    if (!open) api.open("checked");
    else if (api.opened) api.close();
    else anchor.focus();
  }, listen);
  anchor.addEventListener("keydown", event => {
    if (disabled()) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); api.open(event.key === "ArrowUp" ? "last" : "checked"); }
    // A native button turns Enter and Space into a click; another element (role="button") gets them here.
    else if (!native && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); if (api.opened) api.close(); else api.open("checked"); }
  }, listen);
  // Capture phase on the document: the menu takes Escape before a window, a dialog or a view behind it.
  document.addEventListener("keydown", event => {
    if (!api.opened) return;
    if (event.key === "Escape" || event.key === "Esc") { event.preventDefault(); event.stopImmediatePropagation(); api.close(); }
    // Tab leaves the menu from the anchor: the browser moves the focus on from where it is when the key's default runs.
    else if (event.key === "Tab") { menu.shut(); anchor.focus(); }
  }, { ...listen, capture: true });
  // A heading is not an entry: a click on it neither picks nor closes (Suite would treat its row as an item).
  document.addEventListener("click", event => {
    if (api.opened && event.target instanceof Element && event.target.closest(".blade-popup-menu__heading") && menu.popup?.contains(event.target)) {
      event.stopPropagation();
      menu.focusEntry(undefined);
    }
  }, { ...listen, capture: true });
  // A change of the viewport's width (rotation, a resized window) closes it; a phone's keyboard changing the height does not.
  window.addEventListener("resize", () => { if (api.opened && innerWidth !== width) menu.shut(); }, listen);

  if (signal?.aborted) api.destroy();
  else signal?.addEventListener("abort", () => api.destroy(), { once: true, signal: life.signal });
  return api;
}

type Built = { data: any[]; ids: Map<string, string>; focusable: string[]; checked?: string };

/** Suite items of $items (validated; `TypeError` for a malformed one). $empty: the note of a menu without entries. */
function build(items: unknown, prefix: string, empty = ""): Built {
  if (!Array.isArray(items)) throw invalid("ui.menu items must be an array.");
  const built: Built = { data: [], ids: new Map(), focusable: [] };
  const seen = new Set<string>();
  let count = 0, groups = 0;
  const check = (item: PopupMenuEntry): void => {
    if (!item || typeof item !== "object" || (item.type !== undefined && item.type !== "entry")) throw invalid("a menu group holds entries only.");
    if (typeof item.id !== "string" || !ID.test(item.id) || seen.has(item.id)) throw invalid(`invalid or duplicate menu entry id "${String(item.id)}".`);
    if (typeof item.label !== "string" || !item.label.trim()) throw invalid(`menu entry "${item.id}" needs a label.`);
    if (item.detail !== undefined && typeof item.detail !== "string") throw invalid(`the detail of menu entry "${item.id}" is text.`);
    if (item.icon !== undefined && typeof item.icon !== "string") throw invalid(`the icon of menu entry "${item.id}" is a class name.`);
    if (item.checked !== undefined && typeof item.checked !== "boolean") throw invalid(`the checked flag of menu entry "${item.id}" is true or false.`);
    if (item.checked !== undefined && item.icon !== undefined) throw invalid(`menu entry "${item.id}" is checkable: its check mark takes the icon's place.`);
    if (++count > LIMIT) throw invalid(`a menu holds at most ${LIMIT} entries.`);
    seen.add(item.id);
  };
  const entry = (item: PopupMenuEntry, radio: string, heading?: string): any => {
    const suiteId = prefix + item.id, checkable = item.checked !== undefined;
    built.ids.set(suiteId, item.id);
    if (!item.disabled) built.focusable.push(suiteId);
    if (item.checked && built.checked === undefined && !item.disabled) built.checked = suiteId;
    // The detail is text in the entry's own markup (not Suite's `hotkey`, which would register a keyboard shortcut). A
    // screen reader hears the group's heading with its first reachable entry (the heading row is not in the name list).
    const html = (heading ? `<span class="blade-visually-hidden">${escape(heading)}: </span>` : "")
      + `<span class="blade-popup-menu__label">${escape(item.label)}</span>`
      + (item.detail ? ` <span class="blade-popup-menu__detail">${escape(item.detail)}</span>` : "");
    return {
      id: suiteId, html,
      ...(checkable ? { twoState: true, active: item.checked, group: radio, icon: item.checked ? "dxi dxi-check" : "blade-popup-menu__blank" } : item.icon ? { icon: item.icon } : {}),
      ...(item.disabled ? { disabled: true } : {}),
      css: "blade-popup-menu__entry",
    };
  };
  for (const item of items as PopupMenuItem[]) {
    if (!item || typeof item !== "object") throw invalid("a menu item must be an object.");
    if (item.type === "separator") built.data.push({ type: "separator" });
    else if (item.type === "group") {
      if (item.label !== undefined && typeof item.label !== "string") throw invalid("a menu group label is text.");
      if (!Array.isArray(item.items)) throw invalid("a menu group needs its items.");
      item.items.forEach(check);
      if (!item.items.length) continue;
      const radio = `${prefix}group:${++groups}`, named = item.items.findIndex(child => !child.disabled);
      if (item.label) built.data.push({ id: `${radio}:heading`, type: "customHTML", css: "blade-popup-menu__heading", html: `<span aria-hidden="true">${escape(item.label)}</span>` });
      built.data.push(...item.items.map((child, index) => entry(child, radio, index === named ? item.label : undefined)));
    } else { check(item as PopupMenuEntry); built.data.push(entry(item as PopupMenuEntry, `${prefix}group:0`)); }
  }
  if (!count) built.data = [{ id: `${prefix}empty`, html: escape(empty), disabled: true, css: "blade-popup-menu__empty" }];
  return built;
}
