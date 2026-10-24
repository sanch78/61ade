import { Grid, Layout, Toolbar, Window, awaitRedraw, message } from "@dhtmlx/suite";
import { locale, t } from "./I18n";
import { escape, recordIcon } from "./RecordPresentation";
import { requestChoiceAll } from "./MessageDialog";

/** Browser part of a server `UploadPolicy` (`UploadPolicy::metadata()`); never contains server paths. */
export type UploadPolicy = {
  extensions: string[];
  max_size_bytes: number;
  max_files: number;
  chunk_bytes: number;
  folders: boolean;
  max_depth: number;
  duplicate_policy: "ask" | "overwrite" | "rename" | "skip" | "reject";
};
/** Per-file outcome of the target action, the shape the file manager's `upload` returns. */
export type UploadResult = {
  /** `item` is the target's listing shape of the stored entry when it reports one (the file manager does), for in-place insertion. */
  succeeded: { id: string; name: string; parent?: string; item?: Record<string, unknown> }[];
  skipped: { name: string }[];
  failed: { name: string; code?: string; error: string }[];
};
/** Public, read-only description of one queued file in events. */
export type UploadFileInfo = { id: string; name: string; size: number; type: string; relativePath: string; resource: string; action: string; target: string | null };
export type UploadEvents = {
  "upload:queued": { file: UploadFileInfo };
  "upload:started": { file: UploadFileInfo };
  "upload:progress": { file: UploadFileInfo; received: number; size: number };
  "upload:conflict": { file: UploadFileInfo; conflicts: unknown[] };
  "upload:file-done": { file: UploadFileInfo; result: UploadResult };
  "upload:file-failed": { file: UploadFileInfo; code: string; message: string };
  "upload:complete": UploadResult;
  "upload:cancelled": { file: UploadFileInfo };
};
export type UploadOpenOptions = {
  /** ACL resource and registered action that receives the files (for example `files` / `upload`). */
  resource: string;
  action: string;
  /** Target id passed to the action's resolver (for example a directory id). */
  target: string | null;
  /** Human-readable target shown in the window ("Drive A:/Képek"). */
  targetLabel: string;
  policy: UploadPolicy;
  /** Files to queue at once (for example from a drop on the caller's own surface). */
  files?: File[] | FileList;
  /** A drop's DataTransfer from the caller's own surface (folders included); pass it synchronously from the drop handler. */
  transfer?: DataTransfer;
  /** Called once per batch when every file of it has settled; the caller refreshes its view. */
  onUploaded?: (result: UploadResult) => void;
};
/** Shell lower-bar indicator: text while transfers run with the window closed, `null` otherwise. */
export type UploadIndicator = { text: string; label: string } | null;

type State = "checking" | "queued" | "uploading" | "finishing" | "conflict" | "done" | "skipped" | "failed" | "cancelled" | "interrupted";
type Batch = { decision?: string; onUploaded?: (result: UploadResult) => void; items: Item[]; reported?: boolean };
type Item = {
  id: string; file?: File; name: string; size: number; type: string; lastModified: number; relativePath: string;
  resource: string; action: string; target: string | null; targetLabel: string; fingerprint: string;
  batch: Batch; state: State; received: number; transfer?: string; code?: string; error?: string; retry?: boolean;
  userSkipped?: boolean; result?: UploadResult["succeeded"][number]; preview?: string; controller?: AbortController; percent?: number;
  /** Pending `upload_abort` of a released transfer; a later run waits for it before `upload_begin` may resume. */
  releasing?: Promise<unknown>;
};
/** One of the {@link PARALLEL} transfer slots, held by a run; a run waiting for a conflict decision gives it up. */
type Slot = { held: boolean };
type Stored = Pick<Item, "fingerprint" | "transfer" | "resource" | "action" | "target" | "targetLabel" | "name" | "size" | "type" | "lastModified" | "relativePath">;
type Context = Omit<UploadOpenOptions, "files" | "transfer">;
type Added = { file: File; relativePath: string };
type Handler<K extends keyof UploadEvents> = (payload: UploadEvents[K]) => void;

/** One server answer that is not `ok`: HTTP status, `details.code` and the localized message. */
class UploadError extends Error {
  constructor(message: string, readonly status = 0, readonly code = "", readonly details: any = undefined, readonly transient = false) { super(message); }
}
class Aborted extends Error {}

const PARALLEL = 3, ATTEMPTS = 3, STORAGE = "blade-uploads";
const ACTIVE: State[] = ["checking", "queued", "uploading", "finishing", "conflict"];
const SETTLED: State[] = ["done", "skipped", "failed", "cancelled"];
/** Permanent per-file reasons: a retry would get the same answer. */
const PERMANENT = new Set(["too_large", "type", "content_mismatch", "conflict", "depth", "name", "quota"]);
const IMAGE = /^image\/(png|jpeg|gif|webp)$/;

const sizeLabel = (size: number) => size < 1024 ? t("{size} B", { size }) :
  new Intl.NumberFormat(locale(), { maximumFractionDigits: 1 }).format(size / (size < 1048576 ? 1024 : 1048576)) + (size < 1048576 ? " KB" : " MB");
const percentLabel = (ratio: number) => new Intl.NumberFormat(locale(), { style: "percent", maximumFractionDigits: 0 }).format(ratio);
/** Same Suite icons and accessible names as the file manager listing. */
const typeIcon = (type: string, name: string): { icon: string; label: string } => {
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  if (type.startsWith("image/")) return { icon: "dxi dxi-image-outline", label: t("Kép") };
  if (type.startsWith("video/")) return { icon: "dxi dxi-file-outline", label: t("Videó") };
  if (type === "text/csv" || extension === "csv") return { icon: "dxi dxi-file-excel", label: t("Táblázat") };
  if (type.startsWith("text/") || type === "application/json" || ["txt", "md", "json"].includes(extension)) return { icon: "dxi dxi-format-align-left", label: t("Szöveg") };
  return { icon: "dxi dxi-file-outline", label: t("Fájl") };
};
/** name|size|lastModified|relative_path, hashed to fit the server's 128-character limit. */
async function fingerprintOf(file: { name: string; size: number; lastModified: number }, relativePath: string): Promise<string> {
  const text = [file.name, file.size, file.lastModified, relativePath].join("|");
  try {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  } catch { return text.slice(0, 128); }
}
/** The server's `relative_path`: the folder part of "Fotók/2026/a.jpg" ("Fotók/2026"); empty for a plain file. */
const folderOf = (path: string) => path.split("/").slice(0, -1).join("/");
const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  const timer = setTimeout(resolve, ms);
  signal?.addEventListener("abort", () => { clearTimeout(timer); reject(new Aborted()); }, { once: true });
});

/**
 * Page-lifetime uploader: one non-modal Suite Window (drop zone with the rules, queue Grid, summary
 * and commands) owned by this service, not by a view, so transfers survive route changes and a
 * closed window. Files go through the `__upload` chunked protocol of the target action
 * (preflight → begin → chunks → finish) with 3 parallel transfers and resume after reload.
 */
class UploadService {
  private csrf = "";
  private user = "";
  private win?: Window;
  private grid?: Grid;
  private layout?: Layout;
  private commands?: Toolbar;
  private context?: Context;
  private items = new Map<string, Item>();
  private sequence = 0;
  private active = 0;
  private run: Item[] = [];
  private handlers = new Map<keyof UploadEvents, Set<(payload: any) => void>>();
  private indicators = new Set<(state: UploadIndicator) => void>();
  private indicatorText = "";
  private live?: HTMLElement;
  private spoken: string[] = [];
  private speaking?: ReturnType<typeof setTimeout>;
  private conflicts: Promise<unknown> = Promise.resolve();
  private restored = false;
  private opener?: HTMLElement | null;
  private zone = "";
  /**
   * The hidden file inputs live outside Suite's virtual DOM: a Layout repaint (for example a summary
   * update while files upload) would otherwise replace an input whose native picker is open, and its
   * `change` event would never reach the document, losing the chosen files.
   */
  private pickers: HTMLInputElement[] = [];
  private picker(folder: boolean): HTMLInputElement {
    const kind = folder ? "folder" : "files";
    let input = this.pickers.find(item => item.dataset.bladeUploadInput === kind);
    if (!input) {
      input = Object.assign(document.createElement("input"), { type: "file", multiple: true, tabIndex: -1, className: "blade-uploader__input" });
      input.setAttribute("aria-hidden", "true");
      input.dataset.bladeUploadInput = kind;
      if (folder) input.setAttribute("webkitdirectory", "");
      document.body.append(input);
      this.pickers.push(input);
    }
    return input;
  }
  private summaryText = "";
  private listening = false;
  private waiting: (() => void)[] = [];
  private guarded = false;
  private leaving = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };

  /** Session data of the shell: CSRF header for the UI channel and the actor (keys stored resumes). */
  configure(options: { csrf: string; userId?: string }): void {
    this.csrf = options.csrf;
    this.user = options.userId ?? "";
    this.listen();
  }

  on<K extends keyof UploadEvents>(event: K, handler: Handler<K>): void {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(handler);
  }
  off<K extends keyof UploadEvents>(event: K, handler: Handler<K>): void { this.handlers.get(event)?.delete(handler); }
  private emit<K extends keyof UploadEvents>(event: K, payload: UploadEvents[K]): void {
    for (const handler of [...(this.handlers.get(event) ?? [])]) {
      try { handler(payload); } catch (error) { console.error(error); }
    }
  }

  /** Subscribes the shell's lower-bar indicator; returns the unsubscribe function. */
  indicator(listener: (state: UploadIndicator) => void): () => void {
    this.indicators.add(listener);
    listener(this.indicatorText ? { text: this.indicatorText, label: t("Feltöltési ablak megnyitása") } : null);
    return () => this.indicators.delete(listener);
  }

  /** Shows the window for a target; queued files of other targets stay in the queue. */
  open(options: UploadOpenOptions): void {
    const { files, transfer, ...context } = options;
    this.context = context;
    this.mount();
    this.renderZone();
    if (!this.win!.isVisible()) {
      this.opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      this.win!.show();
    }
    this.restore();
    this.updateIndicator();
    void awaitRedraw().then(() => this.zoneNode()?.focus({ preventScroll: true }));
    // Folder entries of a drop are readable only in the drop handler's task: `dropped` takes them synchronously.
    if (transfer) void this.dropped(transfer);
    else if (files?.length) void this.add(Array.from(files, file => ({ file, relativePath: "" })));
  }

  /** Reopens the window with its current queue (shell indicator click). */
  reopen(): void {
    if (!this.win || !this.context) return;
    if (!this.win.isVisible()) { this.opener = document.activeElement instanceof HTMLElement ? document.activeElement : null; this.win.show(); }
    this.updateIndicator();
    void awaitRedraw().then(() => this.zoneNode()?.focus({ preventScroll: true }));
  }

  /** True while any file is being checked, waiting or transferred. */
  get busy(): boolean { return [...this.items.values()].some(item => ACTIVE.includes(item.state)); }

  // ---------------------------------------------------------------- window

  private mount(): void {
    if (this.win) return;
    this.liveRegion();
    const win = new Window({
      css: "blade-uploader-window", title: escape(t("Feltöltés")), ariaLabel: t("Feltöltés"),
      width: Math.min(760, innerWidth - 24), height: Math.min(580, innerHeight - 24), minWidth: 300, minHeight: 360,
      modal: false, closable: true, movable: true, resizable: true,
    });
    const layout = new Layout(document.createElement("div"), { type: "none", css: "blade-uploader", rows: [
      { id: "zone", height: "content", css: "blade-uploader__zone-cell" },
      { id: "queue", css: "blade-uploader__queue" },
      { id: "summary", height: "content", css: "blade-uploader__summary-cell" },
      { id: "commands", height: 48, css: "blade-command-row blade-uploader__commands" },
    ] });
    const grid = new Grid(null, {
      columns: [
        { id: "preview", header: [{ text: t("Előnézet") }], width: 88, htmlEnable: true, sortable: false, resizable: false, template: (_: unknown, row: any) => this.previewCell(row) },
        { id: "name", header: [{ text: t("Név") }], minWidth: 120, gravity: 2, htmlEnable: true, sortable: false, template: (_: unknown, row: any) => this.nameCell(row) },
        { id: "status", header: [{ text: t("Állapot") }], minWidth: 130, gravity: 1, htmlEnable: true, sortable: false, template: (_: unknown, row: any) => this.statusCell(row) },
        { id: "actions", header: [{ text: t("Műveletek") }], width: 92, htmlEnable: true, sortable: false, resizable: false, template: (_: unknown, row: any) => this.actionsCell(row) },
      ] as any,
      data: [], rowHeight: 56, autoWidth: true, resizable: false, sortable: false, keyNavigation: false, htmlEnable: false, css: "blade-uploader__grid",
      eventHandlers: { onclick: { "blade-uploader__action": (event: Event) => this.rowAction(event) } },
    });
    const commands = new Toolbar(undefined, { css: "blade-uploader__bar", data: [
      { type: "spacer" },
      { id: "clear", value: t("Befejezettek törlése"), icon: "dxi dxi-delete-outline", disabled: true },
      { id: "close", value: t("Bezárás"), icon: "dxi dxi-close" },
    ] });
    commands.events.on("click", (id: string | number) => {
      if (id === "clear") this.clearFinished();
      else if (id === "close") win.hide();
    });
    layout.getCell("queue").attach(grid);
    layout.getCell("commands").attach(commands);
    win.attach(layout);
    win.events.on("afterHide", () => {
      this.updateIndicator();
      if (this.opener?.isConnected) this.opener.focus({ preventScroll: true });
      this.opener = undefined;
    });
    win.events.on("afterShow", () => this.updateIndicator());
    Object.assign(this, { win, layout, grid, commands });
    this.paintSummary();
    this.listen();
  }

  /** Delegated document listeners (page lifetime): the window's cells are re-rendered by Suite. */
  private listen(): void {
    if (this.listening) return;
    this.listening = true;
    const inside = (target: EventTarget | null) => target instanceof Node && !!this.root()?.contains(target);
    document.addEventListener("click", event => {
      const button = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-blade-upload-pick]");
      if (!button || !inside(button)) return;
      this.picker(button.dataset.bladeUploadPick === "folder").click();
    });
    document.addEventListener("change", event => {
      const input = event.target as HTMLInputElement;
      if (!(input instanceof HTMLInputElement) || input.dataset.bladeUploadInput === undefined || !this.pickers.includes(input)) return;
      const folder = input.dataset.bladeUploadInput === "folder";
      let files = Array.from(input.files ?? [], file => ({ file, relativePath: folder ? file.webkitRelativePath : "" }));
      input.value = "";
      if (folder && files.length > this.limit()) { this.omitted(files.length - this.limit()); files = files.slice(0, this.limit()); }
      void this.add(files);
    }, true);
    const zone = (target: EventTarget | null) => target instanceof Element ? target.closest<HTMLElement>(".blade-uploader__zone") : null;
    for (const type of ["dragenter", "dragover"] as const) document.addEventListener(type, event => {
      if (!inside(event.target) || !event.dataTransfer?.types.includes("Files")) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      this.zoneNode()?.classList.add("blade-uploader__zone--over");
    });
    document.addEventListener("dragleave", event => {
      if (zone(event.target) && !zone(event.relatedTarget)) this.zoneNode()?.classList.remove("blade-uploader__zone--over");
    });
    document.addEventListener("drop", event => {
      if (!inside(event.target) || !event.dataTransfer) return;
      event.preventDefault();
      this.zoneNode()?.classList.remove("blade-uploader__zone--over");
      void this.dropped(event.dataTransfer);
    });
    // A file dropped anywhere else would make the browser open it and leave the page (and its transfers).
    // Only file drags nobody accepted are refused; other drags and the callers' own drop targets are untouched.
    const foreign = (event: DragEvent) => !!event.dataTransfer?.types.includes("Files") && !event.defaultPrevented && !inside(event.target);
    for (const type of ["dragenter", "dragover"] as const) document.addEventListener(type, event => {
      if (!foreign(event)) return;
      event.preventDefault();
      event.dataTransfer!.dropEffect = "none";
    });
    document.addEventListener("drop", event => { if (foreign(event)) event.preventDefault(); });
    // A file that does not decode as an image (wrong content) falls back to its type icon.
    document.addEventListener("error", event => {
      const image = event.target;
      if (!(image instanceof HTMLImageElement) || !image.classList.contains("blade-uploader__thumb")) return;
      const item = this.items.get(image.dataset.bladeUploadRow ?? "");
      if (!item?.preview) return;
      URL.revokeObjectURL(item.preview);
      item.preview = undefined;
      this.paint(item);
    }, true);
    // Clipboard files (a screenshot, files copied in the OS file browser) while the window has focus.
    document.addEventListener("paste", event => {
      if (!this.win?.isVisible() || !inside(event.target)) return;
      const data = event.clipboardData;
      let files = Array.from(data?.files ?? []);
      if (!files.length) files = Array.from(data?.items ?? []).filter(item => item.kind === "file").map(item => item.getAsFile()).filter((file): file is File => !!file);
      if (!files.length) return;
      event.preventDefault();
      void this.add(files.map(file => ({ file, relativePath: "" })));
    });
  }

  private root(): HTMLElement | null { return this.win?.isVisible() ? this.win.getContainer().closest<HTMLElement>(".blade-uploader-window") ?? this.win.getContainer() : null; }
  private zoneNode(): HTMLElement | null { return this.root()?.querySelector<HTMLElement>(".blade-uploader__zone") ?? null; }

  /** Target and rules of the current context; the HTML changes only when they do. */
  private renderZone(): void {
    const context = this.context!, policy = context.policy;
    const folders = policy.folders && "webkitdirectory" in HTMLInputElement.prototype;
    const rules = [
      t("Engedélyezett típusok: {types}. Legfeljebb {size} fájlonként.", { types: policy.extensions.join(", "), size: sizeLabel(policy.max_size_bytes) }),
      t("Egyszerre legfeljebb {count} fájl tölthető fel.", { count: policy.max_files }),
      ...(policy.folders ? [t("Mappák is feltölthetők.")] : []),
    ].join(" ");
    const accept = policy.extensions.map(extension => "." + extension).join(",");
    const button = (pick: string, icon: string, label: string, kind: string) =>
      `<button type="button" class="dhx_button dhx_button--size_medium dhx_button--view_flat dhx_button--color_${kind} blade-uploader__pick" data-blade-upload-pick="${pick}"><span class="dhx_button__icon ${icon}" aria-hidden="true"></span><span class="dhx_button__text">${escape(label)}</span></button>`;
    const html = `<div class="blade-uploader__zone" tabindex="0" role="group" aria-label="${escape(t("Feltöltési terület"))}" aria-describedby="blade-uploader-hint blade-uploader-rules">
      <div class="blade-uploader__target">${escape(t("Célmappa: {path}", { path: context.targetLabel }))}</div>
      <p class="blade-uploader__hint" id="blade-uploader-hint">${escape(t("Húzd ide a fájlokat, vagy illeszd be őket Ctrl+V-vel."))}</p>
      <p class="blade-uploader__rules" id="blade-uploader-rules">${escape(rules)}</p>
      <div class="blade-uploader__buttons">${button("files", "dxi dxi-file-import", t("Fájlok kiválasztása"), "primary")}${folders ? button("folder", "dxi dxi-folder-open", t("Mappa kiválasztása"), "secondary") : ""}</div>
    </div>`;
    this.picker(false).accept = accept;
    if (folders) this.picker(true);
    if (html === this.zone) return;
    this.zone = html;
    this.layout!.getCell("zone").attachHTML(html);
  }

  private liveRegion(): void {
    if (this.live) return;
    const live = document.createElement("div");
    live.className = "blade-uploader-live";
    live.setAttribute("role", "status");
    live.setAttribute("aria-live", "polite");
    document.body.append(live);
    this.live = live;
  }
  /** Polite announcements, joined when several arrive at once so none overwrites another. */
  private announce(text: string): void {
    this.liveRegion();
    this.spoken.push(text);
    clearTimeout(this.speaking);
    this.speaking = setTimeout(() => {
      if (!this.live) return;
      if (!this.live.isConnected) document.body.append(this.live);
      this.live.textContent = this.spoken.join(" ");
      this.spoken = [];
    }, 200);
  }

  // ---------------------------------------------------------------- queue rows

  private info(item: Item): UploadFileInfo {
    return { id: item.id, name: item.name, size: item.size, type: item.type, relativePath: item.relativePath, resource: item.resource, action: item.action, target: item.target };
  }
  private label(item: Item): string { return item.relativePath || item.name; }

  private statusText(item: Item): string {
    switch (item.state) {
      case "checking": return t("Ellenőrzés…");
      case "queued": return t("Várakozik");
      case "uploading": return t("Feltöltés…");
      case "finishing": return t("Feldolgozás…");
      case "conflict": return t("Döntésre vár");
      case "done": return t("Kész");
      case "skipped": return item.userSkipped ? t("Kihagyva (a felhasználó döntése)") : t("Kihagyva");
      case "failed": return t("Sikertelen: {reason}", { reason: item.error || t("Sikertelen művelet.") });
      case "cancelled": return t("Megszakítva");
      case "interrupted": return t("Megszakadt. A folytatáshoz add hozzá újra ugyanezt a fájlt.");
    }
  }
  private ratio(item: Item): number { return item.state === "done" ? 1 : item.size ? Math.min(1, item.received / item.size) : 0; }
  private row(item: Item): Record<string, unknown> {
    const percent = Math.floor(this.ratio(item) * 100);
    item.percent = percent;
    return { id: item.id, name: item.name, path: item.relativePath, size: item.size, type: item.type, state: item.state, status: this.statusText(item), percent,
      retry: !!(item.file && (item.state === "cancelled" || (item.state === "failed" && item.retry))), preview: item.preview ?? "",
      target: item.target !== this.context?.target || item.resource !== this.context?.resource ? item.targetLabel : "" };
  }
  private paint(item: Item): void {
    if (!this.grid || !this.items.has(item.id)) return;
    const row = this.row(item);
    if (this.grid.data.exists(item.id)) this.grid.data.update(item.id, row);
    else this.grid.data.add(row);
  }

  private previewCell(row: any): string {
    if (row.preview) return `<img class="blade-uploader__thumb" src="${escape(row.preview)}" data-blade-upload-row="${escape(row.id)}" alt="${escape(t("Előnézet: {name}", { name: row.name }))}">`;
    const { icon, label } = typeIcon(String(row.type), String(row.name));
    return recordIcon({ options: { [icon]: label } }, icon);
  }
  private nameCell(row: any): string {
    const folder = folderOf(String(row.path || ""));
    const meta = [sizeLabel(Number(row.size)), folder, row.target ? "→ " + row.target : ""].filter(Boolean).join(" · ");
    return `<div class="blade-uploader__name"><span class="blade-uploader__file" title="${escape(row.path || row.name)}">${escape(row.name)}</span><span class="blade-uploader__meta">${escape(meta)}</span></div>`;
  }
  private statusCell(row: any): string {
    const percent = Number(row.percent) || 0;
    return `<div class="blade-uploader__status blade-uploader__status--${escape(row.state)}"><span class="blade-uploader__state">${escape(row.status)}</span>` +
      `<div class="blade-uploader__progress" role="progressbar" aria-label="${escape(t("{name} feltöltése", { name: row.name }))}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}" aria-valuetext="${escape(percentLabel(percent / 100))}"><span class="blade-uploader__bar" style="width:${percent}%"></span></div></div>`;
  }
  /** Only state changes rewrite this cell, so a focused button survives progress updates. */
  private actionsCell(row: any): string {
    const name = String(row.path || row.name), state = String(row.state) as State;
    const button = (action: string, icon: string, label: string) =>
      `<button type="button" class="dhx_button dhx_button--size_small dhx_button--view_link dhx_button--color_secondary dhx_button--icon blade-uploader__action" data-blade-upload-action="${action}" data-blade-upload-row="${escape(row.id)}" aria-label="${escape(label)}" title="${escape(label)}"><span class="dhx_button__icon ${icon}" aria-hidden="true"></span></button>`;
    const buttons: string[] = [];
    if (["checking", "queued", "uploading"].includes(state)) buttons.push(button("cancel", "dxi dxi-close", t("Megszakítás: {name}", { name })));
    if (row.retry) buttons.push(button("retry", "dxi dxi-undo", t("Újrapróbálás: {name}", { name })));
    if (SETTLED.includes(state) || state === "interrupted") buttons.push(button("remove", "dxi dxi-delete-outline", t("Eltávolítás: {name}", { name })));
    return `<div class="blade-uploader__actions">${buttons.join("")}</div>`;
  }

  private rowAction(event: Event): void {
    const button = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-blade-upload-action]");
    const item = this.items.get(button?.dataset.bladeUploadRow ?? "");
    if (!button || !item) return;
    const action = button.dataset.bladeUploadAction;
    if (action === "cancel") this.cancel(item);
    else if (action === "retry") this.retry(item);
    else if (action === "remove") this.remove(item);
    // Keep keyboard users in the row: the next control of the same row, otherwise the drop zone.
    void awaitRedraw().then(() => {
      const next = this.root()?.querySelector<HTMLElement>(`button[data-blade-upload-row="${CSS.escape(item.id)}"]`);
      (next ?? this.zoneNode())?.focus({ preventScroll: true });
    });
  }

  private create(added: Added, fingerprint: string, context: Context, batch: Batch): Item {
    const { file, relativePath } = added;
    const item: Item = {
      id: "u" + ++this.sequence, file, name: file.name, size: file.size, type: file.type, lastModified: file.lastModified, relativePath,
      resource: context.resource, action: context.action, target: context.target, targetLabel: context.targetLabel, fingerprint,
      batch, state: "checking", received: 0,
      preview: IMAGE.test(file.type) && file.size <= 20 * 1048576 ? URL.createObjectURL(file) : undefined,
    };
    this.items.set(item.id, item);
    batch.items.push(item);
    this.join(item);
    this.paint(item);
    return item;
  }
  private join(item: Item): void { if (!this.run.includes(item)) this.run.push(item); }

  private set(item: Item, changes: Partial<Item>): void {
    Object.assign(item, changes);
    this.paint(item);
    this.paintSummary();
    this.updateIndicator();
  }

  // ---------------------------------------------------------------- adding files

  private async dropped(data: DataTransfer): Promise<void> {
    // Entries must be read synchronously in the drop handler's task; walk them afterwards.
    const entries = Array.from(data.items ?? []).filter(item => item.kind === "file").map(item => ({ entry: item.webkitGetAsEntry?.() ?? null, file: item.getAsFile() }));
    if (!entries.some(entry => entry.entry?.isDirectory)) {
      await this.add(Array.from(data.files ?? [], file => ({ file, relativePath: "" })));
      return;
    }
    const policy = this.context?.policy, collected: Added[] = [], rejected: string[] = [];
    const limit = this.limit();
    let omitted = 0;
    const fileOf = (entry: FileSystemFileEntry) => new Promise<File>((resolve, reject) => entry.file(resolve, reject));
    const children = async (directory: FileSystemDirectoryEntry) => {
      const reader = directory.createReader(), all: FileSystemEntry[] = [];
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
        if (!batch.length) return all;
        all.push(...batch);
      }
    };
    // Beyond the limit files are only counted (no File is read), so the user learns how many were left out.
    const walk = async (entry: FileSystemEntry, depth: number): Promise<void> => {
      if (entry.isFile && collected.length >= limit) omitted++;
      else if (entry.isFile) {
        const file = await fileOf(entry as FileSystemFileEntry), path = entry.fullPath.replace(/^\/+/, "");
        collected.push({ file, relativePath: path.includes("/") ? path : "" });
      } else if (entry.isDirectory && depth <= (policy?.max_depth ?? 5)) {
        for (const child of await children(entry as FileSystemDirectoryEntry)) await walk(child, depth + 1);
      }
    };
    for (const { entry, file } of entries) {
      try {
        if (entry?.isDirectory && !policy?.folders) rejected.push(entry.name);
        else if (entry) await walk(entry, 0);
        else if (file && collected.length >= limit) omitted++;
        else if (file) collected.push({ file, relativePath: "" });
      } catch { if (entry) rejected.push(entry.name); }
    }
    if (rejected.length) message({ text: t("Mappa nem tölthető fel ide: {names}", { names: rejected.join(", ") }), css: "blade-toast blade-uploader-toast--failed", expire: 6000 });
    if (omitted) this.omitted(omitted);
    await this.add(collected);
  }

  /** Files of one drop or folder choice taken into the queue; the rest of a huge folder is only counted. */
  private limit(): number { return (this.context?.policy.max_files ?? 20) + 100; }
  private omitted(count: number): void {
    const text = t("{count} további fájl nem került a feltöltési sorba.", { count });
    message({ text, css: "blade-toast blade-uploader-toast--failed", expire: 8000 });
    this.announce(text);
  }

  /** Preflights new files of one batch; resumable interrupted files continue without it. */
  private async add(files: Added[]): Promise<void> {
    const context = this.context;
    if (!context || !files.length) return;
    const batch: Batch = { items: [], onUploaded: context.onUploaded }, fresh: Item[] = [];
    let ignored = 0;
    for (const added of files) {
      const fingerprint = await fingerprintOf(added.file, added.relativePath);
      const same = (item: Item) => item.fingerprint === fingerprint && item.resource === context.resource && item.action === context.action;
      // Only a transfer to this very target is continued; for another target the file is queued afresh.
      const waiting = [...this.items.values()].find(item => item.state === "interrupted" && same(item) && item.target === context.target);
      if (waiting) {
        Object.assign(waiting, { file: added.file, batch, preview: waiting.preview ?? (IMAGE.test(added.file.type) && added.file.size <= 20 * 1048576 ? URL.createObjectURL(added.file) : undefined) });
        batch.items.push(waiting);
        this.join(waiting);
        this.enqueue(waiting);
        continue;
      }
      // The same file already in flight to the same target would share its server transfer.
      if ([...this.items.values()].some(item => same(item) && item.target === context.target && ACTIVE.includes(item.state))) { ignored++; continue; }
      const item = this.create(added, fingerprint, context, batch);
      if (fresh.length >= context.policy.max_files) this.fail(item, "quota", t("Egyszerre legfeljebb {count} fájl tölthető fel.", { count: context.policy.max_files }), false);
      else fresh.push(item);
    }
    if (ignored) this.announce(t("{count} fájl már a sorban van.", { count: ignored }));
    if (fresh.length) await this.preflight(fresh, context);
    const queued = batch.items.filter(item => item.state === "queued").length;
    if (queued) this.announce(t("Feltöltés elindult: {count} fájl.", { count: queued }));
    this.pump();
    this.settle();
  }

  private async preflight(items: Item[], context: Context): Promise<void> {
    try {
      const data = await this.call(items[0], { operation: "upload_preflight", files: items.map(item => ({ name: item.name, size: item.size, type: item.type, ...(folderOf(item.relativePath) ? { relative_path: folderOf(item.relativePath) } : {}) })) });
      const answers = new Map<number, any>(((data?.files ?? []) as any[]).map(answer => [Number(answer.index), answer]));
      items.forEach((item, index) => {
        if (item.state !== "checking") return;
        const answer = answers.get(index);
        // A name conflict is decided when the file is finished (dialog or the fixed policy), unless the policy rejects it.
        if (!answer || answer.ok || (answer.code === "conflict" && context.policy.duplicate_policy !== "reject")) this.enqueue(item);
        else this.fail(item, String(answer.code ?? ""), String(answer.message ?? t("Sikertelen művelet.")), false);
      });
    } catch (error) {
      const e = error as UploadError;
      for (const item of items) if (item.state === "checking") this.fail(item, e.code, e.message, e.transient);
    }
  }

  private enqueue(item: Item): void {
    this.set(item, { state: "queued", error: undefined, code: undefined, retry: undefined });
    this.emit("upload:queued", { file: this.info(item) });
  }

  private pump(): void {
    while (this.active < PARALLEL) {
      const next = [...this.items.values()].find(item => item.state === "queued");
      if (!next) return;
      const slot: Slot = { held: true };
      this.active++;
      void this.transfer(next, slot).finally(() => { this.release(slot); this.settle(); });
    }
  }
  /** Takes a slot again (after a conflict decision); waiting runs get freed slots before queued files. */
  private acquire(slot: Slot): Promise<void> {
    if (slot.held) return Promise.resolve();
    if (this.active < PARALLEL) { this.active++; slot.held = true; return Promise.resolve(); }
    return new Promise(resolve => this.waiting.push(() => { slot.held = true; resolve(); }));
  }
  private release(slot: Slot): void {
    if (!slot.held) return;
    slot.held = false;
    const next = this.waiting.shift();
    if (next) next(); // handed over: `active` is unchanged
    else { this.active--; this.pump(); }
  }

  // ---------------------------------------------------------------- protocol

  private endpoint(): string { const url = new URL(location.href); url.hash = ""; url.search = "?blade=1"; return url.toString(); }

  /** One `__upload` operation; `chunk` switches to multipart (JSON `request` + part `chunk`). */
  private async call(item: Item, values: Record<string, unknown>, chunk?: Blob, signal?: AbortSignal): Promise<any> {
    const request = JSON.stringify({ resource: item.resource, action: "__upload", id: item.target, values: { action: item.action, ...values } });
    const headers: Record<string, string> = { "X-BLADE-CSRF": this.csrf };
    let body: BodyInit = request;
    if (chunk) { const form = new FormData(); form.append("request", request); form.append("chunk", chunk, "chunk"); body = form; }
    else headers["Content-Type"] = "application/json";
    let response: Response;
    try { response = await fetch(this.endpoint(), { method: "POST", credentials: "same-origin", headers, body, signal }); }
    catch (error) {
      if (signal?.aborted) throw new Aborted();
      throw new UploadError(t("Hálózati hiba. A feltöltés újrapróbálható."), 0, "", undefined, true);
    }
    const result = await response.json().catch(() => ({ ok: false }));
    if (response.ok && result.ok) return result.data;
    // Single-file operations: a finish refusal carries the file's own reason in `details.failed`.
    const failed = Array.isArray(result.details?.failed) && result.details.failed.length === 1 ? result.details.failed[0] : undefined;
    throw new UploadError(String(failed?.error || result.error || t("Sikertelen művelet.")), response.status, String(result.details?.code ?? failed?.code ?? ""), result.details, response.status >= 500 || response.status === 0);
  }

  /** Network errors and 5xx answers are retried with backoff (3 tries in all) until the run is aborted. */
  private async retrying<T>(signal: AbortSignal, run: () => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      try { return await run(); }
      catch (error) {
        if (!(error instanceof UploadError) || !error.transient || attempt >= ATTEMPTS || signal.aborted) throw error;
        await sleep(500 * 3 ** (attempt - 1), signal);
      }
    }
  }
  /** Releases a server transfer; a later run of the item waits for it, so `upload_begin` cannot resume what is being removed. */
  private releaseTransfer(item: Item, transfer: string): void {
    const done = this.call(item, { operation: "upload_abort", transfer }).catch(() => undefined);
    item.releasing = Promise.all([item.releasing, done]);
  }

  private async transfer(item: Item, slot: Slot): Promise<void> {
    const controller = new AbortController(), signal = controller.signal;
    item.controller = controller;
    // This run still owns the item: not cancelled meanwhile and not superseded by a Retry's newer run.
    const owned = () => item.controller === controller && !signal.aborted && item.state === "uploading";
    this.set(item, { state: "uploading" });
    this.emit("upload:started", { file: this.info(item) });
    try {
      const file = item.file!;
      // A transfer released by an earlier Cancel is removed before begin could resume it.
      await item.releasing;
      if (!owned()) return;
      const begin = await this.retrying(signal, () => this.call(item, { operation: "upload_begin", fingerprint: item.fingerprint,
        file: { name: item.name, size: item.size, type: item.type, last_modified: item.lastModified, ...(folderOf(item.relativePath) ? { relative_path: folderOf(item.relativePath) } : {}) } }));
      const transfer = String(begin.transfer);
      if (!owned()) {
        // Begin is not aborted mid-flight, so a Cancel meanwhile still releases the transfer it created,
        // unless a newer run (Retry) owns the item: that run resumes this same transfer.
        if (item.controller === controller) this.releaseTransfer(item, transfer);
        return;
      }
      const chunkBytes = Math.max(1, Number(begin.chunk_bytes) || this.context?.policy.chunk_bytes || 4194304);
      item.transfer = transfer;
      item.received = Math.min(item.size, Math.max(0, Number(begin.received) || 0));
      this.persist();
      this.progress(item);
      let mismatches = 0;
      while (item.received < item.size) {
        const offset = item.received, blob = file.slice(offset, Math.min(item.size, offset + chunkBytes));
        const answer = await this.retrying(signal, async () => {
          try { return { received: Number((await this.call(item, { operation: "upload_chunk", transfer, offset }, blob, signal)).received), mismatch: false }; }
          catch (error) {
            // The server holds another offset (a retried chunk had arrived after all): continue from there, never resend it.
            if (error instanceof UploadError && error.status === 409 && Number.isFinite(Number(error.details?.received))) return { received: Number(error.details.received), mismatch: true };
            throw error;
          }
        });
        if (!owned()) return;
        if (answer.mismatch && ++mismatches > 3) throw new UploadError(t("Sikertelen művelet."), 409, "incomplete", undefined, true);
        if (!answer.mismatch) mismatches = 0;
        item.received = Math.min(item.size, Math.max(0, answer.received));
        this.progress(item);
      }
      if (!owned()) return;
      await this.finish(item, slot, signal);
    } catch (error) {
      if (error instanceof Aborted || signal.aborted || item.controller !== controller || !ACTIVE.includes(item.state)) return;
      const e = error instanceof UploadError ? error : new UploadError(t("Sikertelen művelet."));
      // An expired transfer (404) starts again on retry; permanent per-file reasons and denials do not.
      if (e.status === 404) item.transfer = undefined;
      this.fail(item, e.code, e.message, !PERMANENT.has(e.code) && (e.transient || e.status === 404 || e.code === "incomplete"));
    } finally { if (item.controller === controller) item.controller = undefined; }
  }

  private progress(item: Item): void {
    this.emit("upload:progress", { file: this.info(item), received: item.received, size: item.size });
    if (Math.floor(this.ratio(item) * 100) !== item.percent) this.paint(item);
    this.paintSummary();
    this.updateIndicator();
  }

  /** Runs the target action; network errors and 5xx answers are retried (the server keeps the transfer on ≥ 500). */
  private async finish(item: Item, slot: Slot, signal: AbortSignal, decision?: string): Promise<void> {
    // Only an uploaded (or conflict-decided) file of a live run is finished; a cancelled one never is.
    if (signal.aborted || !(item.state === "uploading" || item.state === "conflict")) return;
    const transfer = item.transfer;
    this.set(item, { state: "finishing" });
    try {
      const data = await this.retrying(signal, () => this.call(item, { operation: "upload_finish", transfer, ...(decision ? { decision } : {}) }, undefined, signal));
      this.finished(item, data);
    } catch (error) {
      if (error instanceof UploadError && error.status === 409 && Array.isArray(error.details?.conflicts)) { await this.conflict(item, slot, signal, error.details.conflicts); return; }
      throw error;
    }
  }

  /**
   * The target action's answer for one file. The file manager's shape (`succeeded`/`skipped`/`failed`,
   * plus server-reported `rejected` parts) is used as is; any other 2xx result (`{ok: true}`, a record)
   * is one success.
   */
  private finished(item: Item, data: any): void {
    if (item.state !== "finishing") return;
    const list = (value: unknown): any[] => Array.isArray(value) ? value.filter(entry => entry && typeof entry === "object") : [];
    const shaped = !!data && typeof data === "object" && ["succeeded", "skipped", "failed", "rejected"].some(key => Array.isArray(data[key]));
    const failed = shaped ? [...list(data.failed), ...list(data.rejected)].map(entry => ({ name: String(entry.name ?? item.name), ...(entry.code ? { code: String(entry.code) } : {}), error: String(entry.error ?? entry.message ?? t("Sikertelen művelet.")) })) : [];
    const result: UploadResult = shaped ? { succeeded: list(data.succeeded), skipped: list(data.skipped), failed }
      : { succeeded: [{ id: String(data?.id ?? ""), name: item.name }], skipped: [], failed: [] };
    item.transfer = undefined;
    if (result.succeeded.length || (!result.skipped.length && !result.failed.length)) {
      this.set(item, { state: "done", received: item.size, result: result.succeeded[0] ?? { id: "", name: item.name } });
      this.persist();
      this.announce(t("Feltöltve: {name}", { name: this.label(item) }));
      this.emit("upload:file-done", { file: this.info(item), result });
    } else if (result.skipped.length) {
      this.set(item, { state: "skipped" });
      this.persist();
      this.announce(t("Kihagyva: {name}", { name: this.label(item) }));
      this.emit("upload:file-done", { file: this.info(item), result });
    } else {
      const reason = result.failed[0];
      this.fail(item, String(reason?.code ?? ""), String(reason?.error || t("Sikertelen művelet.")), false);
    }
  }

  /**
   * One shared dialog per conflict; "apply to all" answers the rest of the batch. While the decision is
   * pending the run gives up its parallel slot, so other queued files continue; it takes one again to finish.
   */
  private async conflict(item: Item, slot: Slot, signal: AbortSignal, conflicts: unknown[]): Promise<void> {
    this.set(item, { state: "conflict" });
    this.emit("upload:conflict", { file: this.info(item), conflicts });
    this.release(slot);
    const answer = this.conflicts.then(async () => {
      if (item.batch.decision) return item.batch.decision;
      if (item.state !== "conflict") return null;
      const choice = await requestChoiceAll({
        title: t("Névütközés"), severity: "warning",
        message: t("A célmappában már létezik: {name}. Mit tegyünk vele?", { name: this.label(item) }),
        choices: [{ value: "overwrite", label: t("Felülírás") }, { value: "rename", label: t("Átnevezés") }, { value: "skip", label: t("Kihagyás") }],
        applyToAll: t("Alkalmazás az összes ütközésre"),
      });
      if (choice?.all) item.batch.decision = choice.value;
      return choice?.value ?? null;
    });
    this.conflicts = answer.catch(() => null);
    const decision = await answer;
    if (item.state !== "conflict") return;
    if (!decision) {
      // Cancel: the file is skipped by the user and its kept transfer is released.
      const transfer = item.transfer;
      item.transfer = undefined;
      this.set(item, { state: "skipped", userSkipped: true });
      this.persist();
      if (transfer) this.releaseTransfer(item, transfer);
      this.announce(t("Kihagyva: {name}", { name: this.label(item) }));
      this.emit("upload:cancelled", { file: this.info(item) });
      return;
    }
    await this.acquire(slot);
    await this.finish(item, slot, signal, decision);
  }

  private fail(item: Item, code: string, error: string, retry: boolean): void {
    const keep = retry && !!item.transfer;
    if (!keep) item.transfer = undefined;
    this.set(item, { state: "failed", code, error, retry });
    this.persist();
    this.announce(t("Sikertelen feltöltés: {name}. {reason}", { name: this.label(item), reason: error }));
    this.emit("upload:file-failed", { file: this.info(item), code, message: error });
  }

  private cancel(item: Item): void {
    // Finishing runs the target action on the server; it can no longer be withdrawn.
    if (!["checking", "queued", "uploading"].includes(item.state)) return;
    const transfer = item.transfer;
    item.controller?.abort();
    item.transfer = undefined;
    this.set(item, { state: "cancelled", retry: true });
    this.persist();
    if (transfer) this.releaseTransfer(item, transfer);
    this.announce(t("Megszakítva: {name}", { name: this.label(item) }));
    this.emit("upload:cancelled", { file: this.info(item) });
    this.settle();
  }

  private retry(item: Item): void {
    if (!item.file || !(item.state === "cancelled" || (item.state === "failed" && item.retry))) return;
    if (item.batch.reported) item.batch = { items: [item], onUploaded: item.batch.onUploaded, decision: item.batch.decision };
    item.userSkipped = false;
    this.join(item);
    this.enqueue(item);
    this.announce(t("Feltöltés elindult: {count} fájl.", { count: 1 }));
    this.pump();
  }

  private remove(item: Item): void {
    if (ACTIVE.includes(item.state)) return;
    if (item.transfer && item.state !== "done") this.releaseTransfer(item, item.transfer);
    this.drop(item);
    this.persist();
    this.paintSummary();
  }
  private drop(item: Item): void {
    if (item.preview) URL.revokeObjectURL(item.preview);
    this.items.delete(item.id);
    if (this.grid?.data.exists(item.id)) this.grid.data.remove(item.id);
  }
  private clearFinished(): void {
    for (const item of [...this.items.values()]) if (SETTLED.includes(item.state)) this.drop(item);
    this.persist();
    this.paintSummary();
    void awaitRedraw().then(() => this.zoneNode()?.focus({ preventScroll: true }));
  }

  // ---------------------------------------------------------------- completion, summary, indicator

  private outcome(items: Item[]): UploadResult {
    return {
      succeeded: items.filter(item => item.state === "done").map(item => item.result ?? { id: "", name: item.name }),
      skipped: items.filter(item => item.state === "skipped" || item.state === "cancelled").map(item => ({ name: this.label(item) })),
      failed: items.filter(item => item.state === "failed").map(item => ({ name: this.label(item), code: item.code, error: item.error ?? "" })),
    };
  }

  /** Reports finished batches to their caller and a finished run with a toast and an announcement. */
  private settle(): void {
    for (const batch of new Set(this.run.map(item => item.batch))) {
      if (batch.reported || !batch.items.every(item => SETTLED.includes(item.state))) continue;
      batch.reported = true;
      try { batch.onUploaded?.(this.outcome(batch.items)); } catch (error) { console.error(error); }
    }
    if (this.run.length && this.run.every(item => !ACTIVE.includes(item.state))) {
      const result = this.outcome(this.run);
      this.run = [];
      const counts = t("Sikeres: {success}, kihagyva: {skipped}, sikertelen: {failed}.", { success: result.succeeded.length, skipped: result.skipped.length, failed: result.failed.length });
      const clean = !result.failed.length && !result.skipped.length;
      const text = clean ? t("Feltöltés kész: {count} fájl.", { count: result.succeeded.length })
        : [t("Feltöltés kész."), counts, ...(result.failed.length ? [t("A részletek a feltöltési ablakban láthatók.")] : [])].join(" ");
      message({ text, css: "blade-toast" + (result.failed.length ? " blade-uploader-toast--failed" : ""), expire: result.failed.length ? 8000 : 5000 });
      this.announce(text);
      this.emit("upload:complete", result);
    }
    this.paintSummary();
    this.updateIndicator();
  }

  private runProgress(): { done: number; total: number; ratio: number } {
    const total = this.run.length, done = this.run.filter(item => SETTLED.includes(item.state)).length;
    const bytes = this.run.reduce((sum, item) => sum + item.size, 0);
    const received = this.run.reduce((sum, item) => sum + (SETTLED.includes(item.state) ? item.size : item.received), 0);
    return { done, total, ratio: bytes ? received / bytes : total ? done / total : 0 };
  }

  private paintSummary(): void {
    if (!this.layout) return;
    const items = [...this.items.values()];
    let text: string;
    if (this.run.some(item => ACTIVE.includes(item.state))) {
      const { done, total, ratio } = this.runProgress();
      text = t("Feltöltés: {done}/{total} · {percent}", { done, total, percent: percentLabel(ratio) });
    } else if (items.length) {
      const result = this.outcome(items);
      text = t("Sikeres: {success}, kihagyva: {skipped}, sikertelen: {failed}.", { success: result.succeeded.length, skipped: result.skipped.length, failed: result.failed.length });
      const interrupted = items.filter(item => item.state === "interrupted").length;
      if (interrupted) text += " " + t("Megszakadt: {count}.", { count: interrupted });
    } else text = t("Nincs fájl a feltöltési sorban.");
    if (text !== this.summaryText) {
      this.summaryText = text;
      this.layout.getCell("summary").attachHTML(`<div class="blade-uploader__summary">${escape(text)}</div>`);
    }
    if (items.some(item => SETTLED.includes(item.state))) this.commands?.enable("clear"); else this.commands?.disable("clear");
  }

  private updateIndicator(): void {
    this.guardUnload();
    let text = "";
    if (this.run.some(item => ACTIVE.includes(item.state)) && !this.win?.isVisible()) {
      const { done, total, ratio } = this.runProgress();
      text = t("Feltöltés: {done}/{total} · {percent}", { done, total, percent: percentLabel(ratio) });
    }
    if (text === this.indicatorText) return;
    this.indicatorText = text;
    const state: UploadIndicator = text ? { text, label: t("Feltöltési ablak megnyitása") } : null;
    for (const listener of [...this.indicators]) listener(state);
  }

  /** Leaving the page asks for confirmation only while files are checked, waiting or transferred. */
  private guardUnload(): void {
    const busy = this.busy;
    if (busy === this.guarded) return;
    this.guarded = busy;
    if (busy) addEventListener("beforeunload", this.leaving); else removeEventListener("beforeunload", this.leaving);
  }

  // ---------------------------------------------------------------- resume after reload

  private key(): string { return STORAGE + ":" + this.user; }
  private stored(): Stored[] {
    try {
      const value = JSON.parse(localStorage.getItem(this.key()) ?? "[]");
      return Array.isArray(value) ? value.filter(entry => entry && typeof entry.transfer === "string" && typeof entry.fingerprint === "string") : [];
    } catch { return []; }
  }
  /** Unfinished transfers (id and fingerprint, never content) for resuming after a reload. */
  private persist(): void {
    const keep: Stored[] = [...this.items.values()]
      .filter(item => item.transfer && (ACTIVE.includes(item.state) || item.state === "interrupted" || (item.state === "failed" && item.retry)))
      .map(({ fingerprint, transfer, resource, action, target, targetLabel, name, size, type, lastModified, relativePath }) => ({ fingerprint, transfer, resource, action, target, targetLabel, name, size, type, lastModified, relativePath }));
    try {
      if (keep.length) localStorage.setItem(this.key(), JSON.stringify(keep)); else localStorage.removeItem(this.key());
    } catch { /* storage unavailable: resume is a convenience */ }
  }
  /** Interrupted rows from the previous page; the server's received offset shows how far they got. */
  private restore(): void {
    if (this.restored) return;
    this.restored = true;
    for (const entry of this.stored()) {
      if ([...this.items.values()].some(item => item.transfer === entry.transfer)) continue;
      const item: Item = { ...entry, id: "u" + ++this.sequence, batch: { items: [] }, state: "interrupted", received: 0, relativePath: entry.relativePath ?? "" };
      item.batch.items.push(item);
      this.items.set(item.id, item);
      this.paint(item);
      void this.call(item, { operation: "upload_status", transfer: item.transfer }).then(status => {
        if (item.state !== "interrupted") return;
        this.set(item, { received: Math.min(item.size, Number(status?.received) || 0) });
      }).catch(error => {
        // Expired, finished or foreign transfers are gone: forget the row.
        if (error instanceof UploadError && !error.transient && item.state === "interrupted") { this.drop(item); this.persist(); this.paintSummary(); }
      });
    }
    this.paintSummary();
  }
}

/** The page's uploader; the shell configures it, views open it for their own target. */
export const uploads = new UploadService();
