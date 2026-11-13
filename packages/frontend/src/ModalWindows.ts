/**
 * Keyboard and focus of every modal Suite window (FB-0201): `app.ui.window`, record and action windows and any other
 * `new Window({modal: true})`, the W3C APG dialog pattern. While one is shown, the page before it in the document is
 * `inert` (also for screen readers), Tab and Shift+Tab cycle inside the topmost one, and closing it gives the focus back
 * to where it was. What opens above a window (Suite popups and menus, a stacked window, a framework dialog with its own
 * containment) comes after it in the document and stays usable. Non-modal windows are left alone.
 *
 * Escape closes the topmost modal window that holds the focus, with or without non-modal windows (Suite closes a modal
 * one only when it is the last window it lists, FB-0199). It is decided as the key bubbles to `<html>`, before Suite's
 * document handlers: a popup that took the key (stopped it or called `preventDefault`) keeps the window open, and so
 * does an open popup in the window that leaves the key to the browser (`:popover-open`, a menu, an expanded
 * `aria-haspopup` or combobox trigger); a framework dialog or a Suite popup or menu takes it as before. Inert is
 * counted per layer (`holdInert`, shared with MessageDialog), so layers may close in any order.
 */
const MODAL = ".dhx_popup--window_modal";
const TABBABLE = 'a[href],area[href],button,input:not([type="hidden"]),select,textarea,iframe,summary,[tabindex],[contenteditable]:not([contenteditable="false"]),audio[controls],video[controls]';
/** The shown modal windows: the release of what each holds inert and where the focus was before it. */
const shown = new Map<HTMLElement, { release: () => void; opener: HTMLElement | null }>();
/** How many layers (modal windows, framework dialogs) hold each node inert. */
const holds = new WeakMap<Element, number>();
/** Body children a layer never makes inert: live regions and toasts (still announced), hidden file pickers. */
const KEEP = '.dhx_message-container, [aria-live], [role="status"], [role="alert"], [role="log"], input[type="file"]';

/**
 * Makes $nodes inert for one layer and returns its release (idempotent). A node stays inert until every layer that
 * holds it has released it, in any order; a node inert for another reason is left alone.
 */
export function holdInert(nodes: Element[]): () => void {
  const taken = nodes.filter(node => !node.matches(KEEP) && (holds.has(node) || !node.hasAttribute("inert")));
  for (const node of taken) { holds.set(node, (holds.get(node) ?? 0) + 1); node.setAttribute("inert", ""); }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    for (const node of taken) {
      const count = (holds.get(node) ?? 1) - 1;
      if (count > 0) holds.set(node, count);
      else { holds.delete(node); node.removeAttribute("inert"); }
    }
  };
}
/** The element focused before the focus first entered a modal window that is being shown. */
const openers = new WeakMap<HTMLElement, HTMLElement>();
let installed = false, last: HTMLElement | null = null;

/** The topmost shown modal window: the last in the document, as Suite appends a window when it shows. */
function top(): HTMLElement | undefined {
  const list = document.querySelectorAll<HTMLElement>(MODAL);
  return list[list.length - 1];
}

/** The elements of $root that Tab reaches, in document order (one radio button of a group). */
function tabbables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(TABBABLE)).filter(node => {
    if (node.tabIndex < 0 || (node as HTMLButtonElement).disabled || node.closest("[inert]") || !node.getClientRects().length || getComputedStyle(node).visibility === "hidden") return false;
    if (!(node instanceof HTMLInputElement) || node.type !== "radio" || !node.name || node.checked) return true;
    const group = Array.from(root.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${CSS.escape(node.name)}"]`));
    return !group.some(radio => radio.checked) && group[0] === node;
  });
}

function opened(popup: HTMLElement, fallback: HTMLElement | null): void {
  // Everything before the window and its overlay: the page, earlier windows (modal or not), their overlays, and a
  // framework dialog still open (the window is drawn above it).
  const overlay = popup.previousElementSibling, stop = overlay?.classList.contains("dhx_window__overlay") ? overlay : popup, before: Element[] = [];
  for (let node = document.body.firstElementChild; node && node !== stop; node = node.nextElementSibling) before.push(node);
  const release = holdInert(before), opener = openers.get(popup);
  openers.delete(popup);
  shown.set(popup, { release, opener: opener?.isConnected ? opener : fallback });
}

/** Restores what $popup made inert; the focus goes back to its opener when it was inside the window (now lost). */
function closed(popup: HTMLElement): HTMLElement | null {
  const entry = shown.get(popup)!;
  shown.delete(popup);
  entry.release();
  const active = document.activeElement, opener = entry.opener;
  if ((!active || active === document.body) && opener?.isConnected && !opener.closest("[inert]")) opener.focus({ preventScroll: true });
  return opener;
}

function observe(records: MutationRecord[]): void {
  // A window closed and another opened in the same task (Save and open the next one): the new one returns the focus to
  // where the closed one would have.
  let fallback: HTMLElement | null = null;
  for (const record of records) for (const node of Array.from(record.removedNodes))
    if (node instanceof HTMLElement && shown.has(node)) fallback = closed(node) ?? fallback;
  for (const popup of Array.from(document.querySelectorAll<HTMLElement>(MODAL)))
    if (!shown.has(popup) && popup.parentElement === document.body) opened(popup, fallback);
}

/** The first focus inside a window that is being shown (Suite focuses it on `show`) comes from its opener. */
function focusin(event: FocusEvent): void {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const popup = target.closest<HTMLElement>(MODAL);
  if (popup && !shown.has(popup) && !openers.has(popup)) {
    const before = event.relatedTarget instanceof HTMLElement ? event.relatedTarget : last;
    if (before && !popup.contains(before)) openers.set(popup, before);
  }
  last = target;
}

/** Tab past the last element of the topmost window goes to its first, Shift+Tab past the first to its last. */
function tab(event: KeyboardEvent): void {
  if (event.key !== "Tab" || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
  const popup = top(), active = document.activeElement as HTMLElement | null;
  if (!popup || document.querySelector(".blade-dialog-overlay:not([inert])")) return;
  const inside = !!active && popup.contains(active);
  // A popup or menu above the window keeps its own Tab; the focus lost to the page body comes back.
  if (!inside && active && active !== document.body && !active.closest("[inert]")) return;
  const list = tabbables(popup), first = list[0], end = list[list.length - 1];
  let next: HTMLElement | undefined;
  if (!list.length) next = popup;
  else if (!inside) next = event.shiftKey ? end : first;
  else if (event.shiftKey) { if (!list.some(node => !node.contains(active) && active!.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_PRECEDING)) next = end; }
  else if (!list.some(node => active!.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING)) next = first;
  if (!next) return;
  event.preventDefault();
  next.focus();
}

/**
 * An open popup of $popup that leaves Escape to the browser or to its own later handler: a native popover in or after
 * the window, a focused menu, or an expanded popup trigger whose `aria-controls` popup is visible (without
 * `aria-controls`, only the trigger that has the key counts).
 */
function popupOpen(popup: HTMLElement, target: EventTarget | null): boolean {
  try {
    if (Array.from(document.querySelectorAll(":popover-open")).some(node => popup.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING)) return true;
  } catch { /* no Popover API */ }
  const at = target instanceof Element ? target : null;
  if (at?.closest('[role="menu"]')) return true;
  return Array.from(popup.querySelectorAll<HTMLElement>('[aria-expanded="true"]')).some(trigger => {
    const kind = trigger.getAttribute("aria-haspopup");
    if (trigger.getAttribute("role") !== "combobox" && (!kind || kind === "false")) return false;
    const id = trigger.getAttribute("aria-controls");
    return id ? !!document.getElementById(id)?.getClientRects().length : !!at && trigger.contains(at);
  });
}

function escape(event: KeyboardEvent): void {
  if (event.key !== "Escape" && event.key !== "Esc") return;
  const popup = top(), active = document.activeElement;
  if (!popup || !active || !popup.contains(active)) return;
  // Taken already (a search field cleared): Suite's hotkey, which ignores `defaultPrevented`, must not close the window.
  if (event.defaultPrevented) { event.stopPropagation(); return; }
  // A framework dialog, or a Suite popup or menu (a combo list, a context menu), takes the key as before.
  if (document.querySelector(".blade-dialog-overlay:not([inert]), .dhx_menu, .dhx_popup:not(.dhx_popup--window):not(.dhx_popup--window_modal)")) return;
  // Suite's own Escape (on the document) neither closes the window under the popup nor closes it a second time.
  if (popupOpen(popup, event.target)) { event.stopPropagation(); return; }
  const close = popup.querySelector<HTMLElement>('.dhx_window-header [data-dhx-id="close"]');
  if (!close) return;
  event.preventDefault();
  event.stopPropagation();
  close.click();
}

/** Starts the modal window behaviour once per page. */
export function installModalWindows(): void {
  if (installed) return;
  installed = true;
  new MutationObserver(observe).observe(document.body, { childList: true });
  document.addEventListener("focusin", focusin, true);
  document.documentElement.addEventListener("keydown", escape);
  window.addEventListener("keydown", tab);
}
