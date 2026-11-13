import { t } from "../I18n";
import type { RegionPlaceholder } from "../api/types";

/** A load shorter than this shows no indicator (it would only flash). */
export const BUSY_DELAY = 300;

/** What a shown text says: nothing is there, nothing matches the filters or search, or the data could not be had. */
export type StatusKind = "empty" | "search" | "error";
/** The centred picture of each kind (decorative; the text says it): an empty tray, the search and the alert icon. */
const ICONS: Record<StatusKind, string> = {
  empty: '<span class="bi bi-inbox" aria-hidden="true"></span>',
  search: '<span class="bi bi-search" aria-hidden="true"></span>',
  error: '<span class="bi bi-exclamation-circle" aria-hidden="true"></span>',
};

/** The parts of a Suite Layout cell the status reads: its node, its widget and its markup. */
type StatusCell = { getCellView?(): { el?: unknown } | undefined; getWidget?(): unknown; config?: { html?: unknown } | null };

const statuses = new Set<CellStatus>();
let observer: MutationObserver | undefined;

/**
 * The loading and empty state of a region (a Layout cell: a `PageLayout` region, a tab, a section) or of a list's row
 * area (docs/toolkit.md#loading-and-empty-states). One `role="status"` element lies over the cell's content (below its
 * header): the theme's spinner over a dimmed area while busy (after `BUSY_DELAY`; `aria-busy` on the content at once),
 * otherwise its text in the look of the tree's empty text. It stays rendered (visually hidden with nothing to say), so
 * a new text is announced. With `auto` it shows only while the cell holds nothing (no widget, component or element):
 * content ends `busy`, and the text waits while busy. Suite leaves a foreign node in place across its
 * repaints; one observer of the page puts the element back when Suite creates the cell's node again (a collapsed
 * region expanding) and notices content coming and going.
 */
export class CellStatus {
  readonly element = document.createElement("div");
  private readonly label = document.createElement("span");
  private readonly icon = document.createElement("span");
  private message?: string;
  private kind: StatusKind = "empty";
  private loading = false;
  private spinning = false;
  private timer?: ReturnType<typeof setTimeout>;
  private empty = true;
  private shown = "";
  private released = false;
  /** The content node marked `aria-busy`. */
  private busyNode?: HTMLElement;
  private frame = 0;

  /** $inset: the height kept free at the top while shown (a table's header rows, which a header filter uses). */
  constructor(private readonly cell: StatusCell, private readonly options: { auto?: boolean; inset?: () => number } = {}) {
    this.element.className = "blade-status blade-status--idle";
    this.element.setAttribute("role", "status");
    this.element.innerHTML = '<svg class="dhx_spinner blade-status__spinner" viewBox="25 25 50 50" aria-hidden="true"><circle class="path" cx="50" cy="50" r="20"></circle></svg>';
    this.icon.className = "blade-status__icon";
    this.label.className = "blade-status__text";
    this.element.append(this.icon, this.label);
    statuses.add(this);
    if (!observer) {
      observer = new MutationObserver(() => { for (const status of statuses) { try { status.place(); } catch (error) { console.error(error); } } });
      observer.observe(document.body, { childList: true, subtree: true });
    }
    this.place();
  }

  /** The text shown while not busy (`undefined`: none), centred under the picture of its $kind on a blank surface. */
  text(message: string | undefined, kind: StatusKind = "empty"): void {
    if (message !== this.message || kind !== this.kind) { this.message = message; this.kind = kind; this.render(); }
  }

  /** Starts or ends a load: `aria-busy` at once, the spinner once the load outlasts `BUSY_DELAY`. */
  busy(busy: boolean): void {
    if (this.released || busy === this.loading) return;
    this.loading = busy;
    clearTimeout(this.timer);
    this.spinning = false;
    if (busy) this.timer = setTimeout(() => { this.spinning = true; this.render(); }, BUSY_DELAY);
    this.render();
  }

  /** Keeps the element in the cell's current content node and follows the cell's content (`auto`). */
  private place(): void {
    if (this.released) return;
    const root = this.cell.getCellView?.()?.el;
    if (!(root instanceof HTMLElement) || !root.isConnected) return;
    // A cell with a header wraps its content in a node of its own, which a collapsed cell leaves out.
    const host = root.querySelector<HTMLElement>(":scope > .dhx_layout-cell-content") ?? (root.querySelector(":scope > .dhx_layout-cell-header") ? null : root);
    if (host && this.element.parentElement !== host) host.append(this.element);
    if (this.options.auto) {
      const empty = !this.cell.getWidget?.() && !this.cell.config?.html;
      if (empty !== this.empty) { this.empty = empty; this.render(); }
      // A region with content shows its content: `busy` ends (or is ignored) there.
      if (!empty && this.loading) this.busy(false);
    }
    // `aria-busy` on the content that is loading (a list's views), not on the status itself, which announces.
    const content = this.loading ? Array.from(host?.children ?? []).find((child): child is HTMLElement => child !== this.element && child instanceof HTMLElement) : undefined;
    if (content !== this.busyNode) { this.busyNode?.removeAttribute("aria-busy"); this.busyNode = content; }
    if (content && content.getAttribute("aria-busy") !== "true") content.setAttribute("aria-busy", "true");
    // Measured at most once a frame and only while shown (an empty or loading list): a mode switch changes the header.
    if (this.options.inset && !this.frame && !this.element.classList.contains("blade-status--idle")) this.frame = requestAnimationFrame(() => { this.frame = 0; this.measure(); });
  }

  /** Keeps a table's header free. */
  private measure(): void {
    if (this.released || !this.options.inset) return;
    const top = Math.max(0, Math.round(this.options.inset())), value = top ? top + "px" : "";
    if (this.element.style.top !== value) this.element.style.top = value;
  }

  private render(): void {
    if (this.released) return;
    const busy = this.spinning, text = busy ? t("Betöltés…") : this.options.auto && (!this.empty || this.loading) ? undefined : this.message;
    const state = `${busy}|${this.kind}|${text ?? ""}`;
    if (state !== this.shown) {
      this.shown = state;
      const empty = !busy && text !== undefined;
      this.element.classList.toggle("blade-status--empty", empty);
      this.icon.innerHTML = empty ? ICONS[this.kind] : "";
      this.element.classList.toggle("blade-status--idle", text === undefined);
      if (text !== undefined) this.measure();
      this.element.classList.toggle("blade-status--busy", busy);
      this.label.classList.toggle("blade-visually-hidden", busy);
      // A changed text of the live region is announced (politely, `role="status"`).
      if (this.label.textContent !== (text ?? "")) this.label.textContent = text ?? "";
    }
    this.place();
  }

  /** Removes the element and the content's `aria-busy`; idempotent. */
  destroy(): void {
    if (this.released) return;
    this.busy(false);
    this.released = true;
    clearTimeout(this.timer);
    cancelAnimationFrame(this.frame);
    this.element.remove();
    statuses.delete(this);
    if (!statuses.size) { observer?.disconnect(); observer = undefined; }
  }
}

/** The status of a region (a `PageLayout` region, a tab, a section): the default text while it holds nothing. */
export function regionStatus(cell: StatusCell): CellStatus {
  const status = new CellStatus(cell, { auto: true });
  status.text(t("Nincs megjeleníthető tartalom."));
  return status;
}

/** Applies `placeholder(id, …)` of $owner to a region's status; a wrong shape throws `TypeError` before any change. */
export function placeholder(owner: string, status: CellStatus, options: RegionPlaceholder): void {
  const fail = (reason: string): never => { throw new TypeError(`61ade: ${owner}.placeholder: ${reason}.`); };
  if (!options || typeof options !== "object" || Array.isArray(options)) fail("the placeholder is an object");
  for (const key of Object.keys(options)) if (key !== "text" && key !== "busy") fail(`unsupported option "${key}"`);
  const { text, busy } = options;
  if (text !== undefined && text !== null && (typeof text !== "string" || !text.trim() || text.length > 200)) fail("text is plain text of 1 to 200 characters, or null");
  if (busy !== undefined && typeof busy !== "boolean") fail("busy is a boolean");
  if (text !== undefined) status.text(text ?? t("Nincs megjeleníthető tartalom."));
  if (busy !== undefined) status.busy(busy);
}
