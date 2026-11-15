import { Layout } from "@dhtmlx/suite";
import { t } from "../../I18n";
import { escape } from "../../RecordPresentation";
import { attachContent } from "../../api/services";
import type { MountTarget, TextDiff as TextDiffApi, TextDiffMode, TextDiffOptions, TextDiffSummary } from "../../api/types";
import { Component } from "../list/component";
import { CommandBar } from "../list/CommandBar";
import { lineDiff, words, type Line, type Piece } from "./diff";
import "./diff.css";

/** Side by side needs this much component width; a narrower component shows the unified view. */
export const SPLIT_WIDTH = 720;
const MINUS = "−";
const KINDS = ["kept", "removed", "added"] as const;

type Side = { line?: Line; pieces?: Piece[] };
/** A change keeps its number and its paired sides (word highlights computed once, not on every render). */
type Change = { kind: "change"; number: number; removed: Line[]; added: Line[]; old: Side[]; next: Side[] };
type Block = { kind: "same"; lines: Line[] } | Change;

const invalid = (message: string) => new TypeError("61ade: TextDiff " + message);

/**
 * Read-only difference of two texts (`app.components.TextDiff`, docs/toolkit.md#textdiff): a unified or side-by-side
 * line view with word highlights inside a changed line, unchanged stretches folded behind an expander, a `+N −M`
 * summary and keyboard navigation between the changes. Each line's kind is a visible sign (`−`, `+`) and a visually
 * hidden prefix, not only a colour.
 */
export class TextDiff extends Component<Record<string, never>> implements TextDiffApi {
  readonly layout: Layout;
  private readonly bar?: CommandBar;
  private readonly body = document.createElement("div");
  private readonly release = new AbortController();
  private readonly label: string;
  private readonly names: { before: string; after: string };
  private readonly context: number;
  private requested: TextDiffMode;
  private blocks: Block[] = [];
  private counts: TextDiffSummary = { added: 0, removed: 0, changes: 0, label: "+0 " + MINUS + "0" };
  private digits = 1;
  /** Fold ids (block index) the user opened. */
  private expanded = new Set<number>();
  private current = -1;
  /** Whether the component is wide enough for side by side; unknown until it is laid out. */
  private wide?: boolean;
  private resize?: ResizeObserver;

  constructor(options: TextDiffOptions) {
    super(options);
    if (!options || typeof options !== "object") throw invalid("needs options.");
    if (options.mode !== undefined && options.mode !== "unified" && options.mode !== "split") throw invalid('mode must be "unified" or "split".');
    const context = options.context ?? 3;
    if (!Number.isInteger(context) || context < 0 || context > 50) throw invalid("context must be an integer from 0 to 50.");
    for (const name of ["label", "beforeLabel", "afterLabel"] as const) if (options[name] !== undefined && typeof options[name] !== "string") throw invalid(`${name} must be text.`);
    if (options.toolbar !== undefined && typeof options.toolbar !== "boolean") throw invalid("toolbar must be a boolean.");
    this.context = context;
    this.requested = options.mode ?? "unified";
    this.label = options.label || t("Különbség");
    this.names = { before: options.beforeLabel || t("Eredeti"), after: options.afterLabel || t("Módosított") };
    this.compute(options.before, options.after);

    const bar = options.toolbar !== false;
    this.layout = new Layout(this.host, { type: "none", css: "blade-diff-layout", rows: [...(bar ? [{ id: "commands", height: 48 }] : []), { id: "body" }] });
    if (bar) {
      this.bar = new CommandBar({ label: this.label, items: [
        { id: "previous", label: t("Előző változás"), icon: "bi bi-chevron-up", iconOnly: true, pinned: true },
        { id: "next", label: t("Következő változás"), icon: "bi bi-chevron-down", iconOnly: true, pinned: true },
        { type: "separator" },
        { id: "split", type: "toggle", label: t("Egymás mellett"), icon: "bi bi-layout-split", pressed: this.requested === "split", hidden: true },
        { id: "expand", label: t("Összes sor kibontása"), icon: "bi bi-arrows-expand" },
      ] });
      this.bar.on("click", ({ id }) => { if (id === "previous") this.previous(); else if (id === "next") this.next(); else if (id === "expand") this.expandAll(); });
      this.bar.on("toggle", ({ id, pressed }) => { if (id === "split") this.setMode(pressed ? "split" : "unified"); });
      this.bar.mount(this.layout.getCell("commands"));
    }
    this.body.className = "blade-diff";
    this.body.tabIndex = 0;
    this.body.setAttribute("role", "region");
    this.body.setAttribute("aria-label", this.label);
    this.listen();
    this.render();
    this.bind(options.signal);
  }

  /** Places the region and starts following its width only once mounted, so an unmounted diff holds no observer. */
  override mount(target: MountTarget): void {
    super.mount(target);
    if (this.destroyed || this.resize) return;
    attachContent(this.layout.getCell("body"), this.body, this.release.signal);
    // The side-by-side view follows the component's own width (a window, a region or the phone).
    this.resize = new ResizeObserver(() => {
      if (!this.body.clientWidth) return;
      const wide = this.body.clientWidth >= SPLIT_WIDTH;
      if (wide === this.wide) return;
      this.wide = wide;
      this.bar?.update("split", { hidden: !wide });
      if (this.requested === "split") this.render();
    });
    this.resize.observe(this.body);
  }

  /** Line and change counts; `label` is `+N −M` (U+2212) for a window title or a list column. */
  summary(): TextDiffSummary { return { ...this.counts }; }

  /** Compares two other texts: folds close again and the navigation starts over. */
  show(before: string, after: string): void {
    if (this.destroyed) return;
    this.compute(before, after);
    this.expanded.clear();
    this.current = -1;
    this.render();
  }

  next(): void { this.go(this.current + 1); }
  previous(): void { this.go(this.current < 0 ? 0 : this.current - 1); }
  /** Focuses the current change, else the difference region. */
  focus(): void {
    // Right after `mount` the region reaches the document with the cell's next repaint: focus it then (a few frames at most).
    const attempt = (frames: number) => {
      if (this.destroyed) return;
      if (this.body.isConnected) (this.change(this.current) ?? this.body).focus();
      else if (frames > 0) requestAnimationFrame(() => attempt(frames - 1));
    };
    attempt(10);
  }

  private compute(before: unknown, after: unknown): void {
    if (typeof before !== "string" || typeof after !== "string") throw invalid("compares two strings (before, after).");
    const result = lineDiff(before, after), blocks: Block[] = [];
    let added = 0, removed = 0, changes = 0;
    for (const line of result) {
      const last = blocks[blocks.length - 1];
      if (line.kind === 0) { if (last?.kind === "same") last.lines.push(line); else blocks.push({ kind: "same", lines: [line] }); continue; }
      let block = last?.kind === "change" ? last : undefined;
      if (!block) blocks.push(block = { kind: "change", number: changes++, removed: [], added: [], old: [], next: [] });
      if (line.kind === 1) { block.removed.push(line); removed++; } else { block.added.push(line); added++; }
    }
    // The n-th removed and added lines of a change pair up for word highlights.
    for (const block of blocks) if (block.kind === "change") {
      for (let i = 0; i < Math.max(block.removed.length, block.added.length); i++) {
        const a = block.removed[i], b = block.added[i], pair = a && b ? words(a.text, b.text) : null;
        block.old.push({ line: a, pieces: pair?.before });
        block.next.push({ line: b, pieces: pair?.after });
      }
    }
    this.blocks = blocks;
    this.counts = { added, removed, changes, label: `+${added} ${MINUS}${removed}` };
    this.digits = String(Math.max(result.length, 1)).length;
  }

  private setMode(mode: TextDiffMode): void { if (mode !== this.requested) { this.requested = mode; this.render(); } }
  private get split(): boolean { return this.requested === "split" && this.wide === true; }

  private expandAll(): void {
    this.blocks.forEach((block, index) => { if (block.kind === "same") this.expanded.add(index); });
    this.render();
  }

  /** Click on a fold, keys n/p and F7/Shift+F7, and the focused change becoming the current one. */
  private listen(): void {
    const signal = this.release.signal;
    this.body.addEventListener("click", event => {
      const fold = (event.target as Element).closest<HTMLButtonElement>(".blade-diff__fold");
      if (!fold) return;
      const index = Number(fold.dataset.block);
      this.expanded.add(index);
      fold.closest(".blade-diff__kept")!.outerHTML = this.blockHtml(index);
      // The opened lines take the focus (a labelled group with a visible focus ring) where the button was.
      this.body.querySelector<HTMLElement>(`[data-revealed="${index}"]`)?.focus();
      this.state();
    }, { signal });
    this.body.addEventListener("keydown", event => {
      if (event.altKey || event.ctrlKey || event.metaKey || (event.target as Element).closest("button")) return;
      const key = event.key;
      if (key === "n" || (key === "F7" && !event.shiftKey)) this.next();
      else if (key === "p" || (key === "F7" && event.shiftKey)) this.previous();
      else return;
      event.preventDefault();
    }, { signal });
    this.body.addEventListener("focusin", event => {
      const change = (event.target as Element).closest<HTMLElement>(".blade-diff__change");
      if (change) { this.current = Number(change.dataset.change); this.state(); }
    }, { signal });
  }

  private change(index: number): HTMLElement | null { return index < 0 ? null : this.body.querySelector<HTMLElement>(`[data-change="${index}"]`); }

  private go(index: number): void {
    if (this.destroyed || !this.counts.changes) return;
    this.current = Math.max(0, Math.min(this.counts.changes - 1, index));
    const element = this.change(this.current);
    element?.focus({ preventScroll: true });
    element?.scrollIntoView({ block: "nearest" });
    this.state();
  }

  /** Toolbar availability after a render, a navigation or an opened fold. */
  private state(): void {
    if (!this.bar) return;
    const changes = this.counts.changes;
    this.bar.update("previous", { disabled: this.current <= 0 });
    this.bar.update("next", { disabled: !changes || this.current >= changes - 1 });
    this.bar.update("expand", { disabled: !this.body.querySelector(".blade-diff__fold") });
  }

  private render(): void {
    if (this.destroyed) return;
    const { added, removed, changes } = this.counts, split = this.split;
    this.body.classList.toggle("blade-diff--split", split);
    this.body.style.setProperty("--blade-diff-digits", String(this.digits));
    const sentence = t("Hozzáadott sorok: {added}, törölt sorok: {removed}", { added, removed });
    let html = `<div class="blade-diff__header"><div class="blade-diff__summary"><span aria-hidden="true"><span class="blade-diff__count blade-diff__count--added">+${added}</span> <span class="blade-diff__count blade-diff__count--removed">${MINUS}${removed}</span></span><span class="blade-visually-hidden">${escape(sentence)}</span>${changes ? "" : `<span class="blade-diff__same">${escape(t("Nincs különbség."))}</span>`}</div>`;
    if (split) html += `<div class="blade-diff__heads" aria-hidden="true"><span>${escape(this.names.before)}</span><span>${escape(this.names.after)}</span></div>`;
    html += "</div>";
    html += this.blocks.map((_, index) => this.blockHtml(index)).join("");
    // A re-render (side by side, expand all, a resize across 720 px) keeps the focus on the current change.
    const focused = this.body.contains(document.activeElement) && document.activeElement !== this.body;
    this.body.innerHTML = html;
    if (this.current >= changes) this.current = changes - 1;
    if (focused) (this.change(this.current) ?? this.body).focus({ preventScroll: true });
    this.state();
  }

  /** One block: a change group, or kept lines with the stretch beyond the context folded until opened. */
  private blockHtml(index: number): string {
    const block = this.blocks[index];
    if (block.kind === "change") {
      const number = block.number;
      const name = t("Változás {index} / {count} ({summary})", { index: number + 1, count: this.counts.changes,
        summary: t("Hozzáadott sorok: {added}, törölt sorok: {removed}", { added: block.added.length, removed: block.removed.length }) });
      return `<div class="blade-diff__change" role="group" tabindex="-1" data-change="${number}" aria-label="${escape(name)}">${this.changeHtml(block)}</div>`;
    }
    const lines = block.lines, open = this.expanded.has(index), first = index === 0, last = index === this.blocks.length - 1;
    const before = first ? 0 : this.context, after = last ? 0 : this.context;
    const hidden = lines.length - before - after;
    // Folding fewer than three lines saves nothing; a text without changes folds as a whole from three lines.
    const name = open ? ` data-revealed="${index}" tabindex="-1" role="group" aria-label="${escape(t("{count} változatlan sor", { count: lines.length }))}"` : "";
    if (open || hidden < 3) return `<div class="blade-diff__kept"${name}>${lines.map(line => this.same(line)).join("")}</div>`;
    const head = lines.slice(0, before), tail = lines.slice(lines.length - after);
    const fold = `<button type="button" class="blade-diff__fold" data-block="${index}" aria-expanded="false"><i class="bi bi-arrows-expand" aria-hidden="true"></i> ${escape(t("{count} változatlan sor", { count: lines.length - head.length - tail.length }))}</button>`;
    return `<div class="blade-diff__kept">${head.map(line => this.same(line)).join("")}${fold}${tail.map(line => this.same(line)).join("")}</div>`;
  }

  /** Removed lines, then added ones (unified), or the two side by side; the n-th removed and added lines pair up for word highlights. */
  private changeHtml(block: Change): string {
    const { old, next } = block;
    if (this.split) return old.map((side, i) => `<div class="blade-diff__row">${this.side(side, 1)}${this.side(next[i], 2)}</div>`).join("");
    return old.filter(side => side.line).map(side => this.line(side, 1)).join("") + next.filter(side => side.line).map(side => this.line(side, 2)).join("");
  }

  private same(line: Line): string {
    if (this.split) return `<div class="blade-diff__row">${this.side({ line }, 0, line.old)}${this.side({ line }, 0, line.new)}</div>`;
    return this.line({ line }, 0);
  }

  /** A unified line: old number, new number, sign, text. */
  private line(side: Side, kind: 0 | 1 | 2): string {
    const line = side.line!;
    return `<div class="blade-diff__line" data-kind="${KINDS[kind]}"><span class="blade-diff__number" aria-hidden="true">${line.old ?? ""}</span><span class="blade-diff__number" aria-hidden="true">${line.new ?? ""}</span>${this.text(side, kind)}</div>`;
  }

  /** One half of a side-by-side row; an empty half stands opposite a removed or added line. */
  private side(side: Side, kind: 0 | 1 | 2, number = kind === 1 ? side.line?.old : side.line?.new): string {
    if (!side.line) return `<div class="blade-diff__side blade-diff__side--empty"></div>`;
    return `<div class="blade-diff__side" data-kind="${KINDS[kind]}"><span class="blade-diff__number" aria-hidden="true">${number ?? ""}</span>${this.text(side, kind)}</div>`;
  }

  private text(side: Side, kind: 0 | 1 | 2): string {
    const sign = ["", MINUS, "+"][kind], prefix = kind === 1 ? t("Törölve:") : kind === 2 ? t("Hozzáadva:") : "";
    const tag = kind === 1 ? "del" : "ins";
    const content = side.pieces
      ? side.pieces.map(piece => piece.changed ? `<${tag} class="blade-diff__word">${escape(piece.text)}</${tag}>` : escape(piece.text)).join("")
      : escape(side.line!.text);
    return `<span class="blade-diff__sign" aria-hidden="true">${sign}</span><span class="blade-diff__text">${prefix ? `<span class="blade-visually-hidden">${escape(prefix)} </span>` : ""}${content}</span>`;
  }

  protected dispose(): void {
    this.release.abort();
    this.resize?.disconnect();
    this.bar?.destroy();
    this.layout.destructor();
  }
}
