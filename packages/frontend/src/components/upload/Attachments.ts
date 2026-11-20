import { Layout } from "@dhtmlx/suite";
import { t } from "../../I18n";
import { attachContent, ui } from "../../api/services";
import type { AttachmentItem, Attachments as AttachmentsApi, AttachmentsEvents, AttachmentsOptions, MountTarget } from "../../api/types";
import { sizeLabel, uploads as uploader, type UploadRow } from "../../Uploader";
import { Component } from "../list/component";
import "./attachments.css";

const invalid = (message: string) => new TypeError("61ade: Attachments " + message);
const ICONS: [RegExp, string][] = [
  [/^(png|jpe?g|gif|webp|bmp|svg|avif|heic)$/, "bi bi-file-earmark-image"], [/^pdf$/, "bi bi-file-earmark-pdf"],
  [/^(zip|rar|7z|gz|tar|tgz)$/, "bi bi-file-earmark-zip"], [/^(docx?|odt|rtf)$/, "bi bi-file-earmark-word"],
  [/^(xlsx?|ods|csv)$/, "bi bi-file-earmark-spreadsheet"], [/^(pptx?|odp)$/, "bi bi-file-earmark-slides"],
  [/^(txt|md|log|json|xml)$/, "bi bi-file-earmark-text"], [/^(mp3|wav|ogg|flac|m4a)$/, "bi bi-file-earmark-music"],
  [/^(mp4|webm|mov|mkv|avi)$/, "bi bi-file-earmark-play"],
];
const iconOf = (name: string) => { const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : ""; return ICONS.find(([test]) => test.test(ext))?.[1] ?? "bi bi-file-earmark"; };

/** A chip: the public item, the uploader's file id once reported, its element, whether it left or is being removed. */
type Entry = { item: AttachmentItem; upload?: string; removed?: boolean; removing?: boolean; chip?: HTMLElement };
let sequence = 0;

/**
 * Attached files (`app.components.Attachments`, docs/toolkit.md#attachments): a wrapping row of chips over the page's
 * one uploader (`background`, no window). Each file is queued with its own `Uploads.open` call (one upload request
 * per file, so `policy.maxFiles` limits a request, not the list); that call's own `onFile` reports reach only its chip.
 */
export class Attachments extends Component<AttachmentsEvents> implements AttachmentsApi {
  readonly layout: Layout;
  private readonly list = document.createElement("div");
  private readonly status = document.createElement("div");
  private readonly root = document.createElement("div");
  private readonly release = new AbortController();
  private readonly options: AttachmentsOptions;
  private entries: Entry[] = [];
  private focused = 0;
  private input?: HTMLInputElement;

  constructor(options: AttachmentsOptions) {
    super(options);
    if (!options || typeof options !== "object") throw invalid("needs options.");
    const upload = options.upload;
    if (!upload || typeof upload.resource !== "string" || typeof upload.action !== "string" || !upload.policy || !Array.isArray(upload.policy.extensions)) throw invalid("needs upload {resource, action, target, targetLabel, policy}.");
    if (typeof options.label !== "string" || !options.label) throw invalid("needs a label.");
    for (const name of ["remove", "thumbnail"] as const) if (options[name] !== undefined && typeof options[name] !== "function") throw invalid(`${name} must be a function.`);
    if (options.items !== undefined && !Array.isArray(options.items)) throw invalid("items must be an array.");
    this.options = options;
    this.entries = (options.items ?? []).map(file => ({ item: { id: String(file.id), name: String(file.name), size: Number(file.size) || 0, status: "done" } }));
    this.layout = new Layout(this.host, { type: "none", css: "blade-attachments-layout", rows: [{ id: "list", height: "content" }] } as any);
    this.list.className = "blade-attachments";
    this.list.setAttribute("role", "list");
    this.list.setAttribute("aria-label", options.label);
    this.list.tabIndex = -1;
    this.status.className = "blade-visually-hidden";
    this.status.setAttribute("role", "status");
    this.list.addEventListener("keydown", event => this.key(event));
    this.list.addEventListener("click", event => {
      const button = (event.target as HTMLElement).closest<HTMLElement>("[data-remove]");
      if (button) void this.remove(button.dataset.remove!);
    });
    this.list.addEventListener("focusin", event => {
      const index = this.chips().indexOf((event.target as HTMLElement).closest(".blade-attachment") as HTMLElement);
      if (index >= 0 && index !== this.focused) { this.focused = index; this.roving(); }
    });
    this.root.append(this.list, this.status);
    attachContent(this.layout.getCell("list"), this.root, this.release.signal);
    this.render();
    this.bind(options.signal);
  }

  /** The root's height follows the chips (none when empty), so it fits a composer row. */
  override mount(target: MountTarget): void {
    super.mount(target);
    this.host.style.height = "auto";
    this.render();
  }

  add(files: File[] | FileList | DataTransfer): void {
    if (this.destroyed) return;
    const list = files instanceof DataTransfer ? Array.from(files.files) : Array.from(files as ArrayLike<File>);
    if (list.some(file => !(file instanceof File))) throw invalid("add takes File objects, a FileList or a DataTransfer.");
    const { resource, action, target, targetLabel, policy } = this.options.upload;
    for (const file of list) {
      const entry: Entry = { item: { id: "local-" + ++sequence, name: file.name, size: file.size, status: "uploading", percent: 0 } };
      this.entries.push(entry);
      // A file the uploader ignored (already queued to this target) is never reported: its batch result tells.
      const settled = () => { if (!entry.upload && !entry.removed && entry.item.status === "uploading") this.failed(entry, t("A fájl már a feltöltési sorban van.")); };
      uploader.open({ resource, action, target: target ?? null, targetLabel, policy, files: [file], background: true,
        onFile: row => this.report(entry, row), onUploaded: () => queueMicrotask(settled) });
    }
    if (list.length) this.changed();
  }

  choose(): void {
    if (this.destroyed) return;
    if (!this.input) {
      this.input = Object.assign(document.createElement("input"), { type: "file", multiple: true, tabIndex: -1, hidden: true });
      this.input.setAttribute("aria-hidden", "true");
      this.input.addEventListener("change", () => { const files = Array.from(this.input!.files ?? []); this.input!.value = ""; this.add(files); });
      document.body.append(this.input);
    }
    this.input.accept = this.options.upload.policy.extensions.map(ext => "." + String(ext).replace(/^\./, "")).join(",");
    this.input.click();
  }

  items(): AttachmentItem[] { return this.entries.map(entry => ({ ...entry.item })); }
  ids(): string[] { return this.entries.filter(entry => entry.item.status === "done").map(entry => entry.item.id); }
  get pending(): boolean { return this.entries.some(entry => entry.item.status === "uploading"); }

  async remove(id: string): Promise<boolean> {
    const entry = this.entries.find(candidate => candidate.item.id === id);
    if (!entry || entry.removing || this.destroyed) return false;
    if (entry.item.status === "done" && this.options.remove) {
      entry.removing = true;
      try { await this.options.remove({ ...entry.item }); }
      catch (error) { ui.toast(error instanceof Error && error.message ? error.message : t("Sikertelen művelet."), "danger"); return false; }
      finally { entry.removing = false; }
      if (!this.entries.includes(entry) || this.destroyed) return false;
    }
    if (entry.upload) uploader.act(entry.upload, entry.item.status === "uploading" ? "cancel" : "remove");
    entry.removed = true;
    const index = this.entries.indexOf(entry), hadFocus = this.list.contains(document.activeElement);
    this.entries.splice(index, 1);
    this.focused = Math.min(index, this.entries.length - 1);
    this.render();
    if (hadFocus) (this.chips()[this.focused] ?? this.list).focus();
    this.emit("remove", { item: { ...entry.item } });
    this.changed();
    return true;
  }

  clear(): void {
    if (this.destroyed || !this.entries.length) return;
    // Running uploads keep running; their late events find no chip.
    for (const entry of this.entries) entry.removed = true;
    this.entries = [];
    this.focused = 0;
    this.render();
    this.changed();
  }

  protected dispose(): void {
    this.release.abort();
    this.layout.destructor();
    this.input?.remove();
  }

  /**
   * One report of the chip's own upload call. A removed chip's upload is cancelled once known; if it finished anyway
   * (the server was already storing it), the file is discarded through `options.remove`.
   */
  private report(entry: Entry, row: UploadRow): void {
    const known = !!entry.upload;
    entry.upload = row.id;
    if (entry.removed) {
      if (!known) uploader.act(row.id, "cancel");
      if (row.state === "done" && row.result?.id) void Promise.resolve().then(() => this.options.remove?.({ ...entry.item, id: String(row.result!.id), status: "done" })).catch(() => {});
      return;
    }
    if (this.destroyed || entry.item.status !== "uploading") return;
    if (row.state === "done") {
      if (!row.result?.id) return this.failed(entry, t("Sikertelen feltöltés."));
      this.update(entry, { id: String(row.result.id), status: "done", percent: undefined });
      this.say(t("Csatolva: {name}", { name: entry.item.name }));
    } else if (["failed", "cancelled", "skipped", "interrupted"].includes(row.state)) this.failed(entry, row.status || t("Sikertelen feltöltés."));
    else if (row.percent !== entry.item.percent) this.update(entry, { percent: row.percent });
  }

  private failed(entry: Entry, error: string): void {
    this.update(entry, { status: "failed", error, percent: undefined });
    this.say(t("Sikertelen feltöltés: {name}. {reason}", { name: entry.item.name, reason: error }));
  }
  private update(entry: Entry, changes: Partial<AttachmentItem>): void {
    Object.assign(entry.item, changes);
    for (const key of Object.keys(changes) as (keyof AttachmentItem)[]) if (changes[key] === undefined) delete entry.item[key];
    this.render();
    this.changed();
  }
  private changed(): void { this.emit("change", { items: this.items() }); }
  private say(text: string): void { this.status.textContent = ""; requestAnimationFrame(() => { this.status.textContent = text; }); }

  private chips(): HTMLElement[] { return Array.from(this.list.querySelectorAll<HTMLElement>(".blade-attachment")); }
  private roving(): void { this.chips().forEach((chip, index) => { chip.tabIndex = index === this.focused ? 0 : -1; }); }

  private key(event: KeyboardEvent): void {
    const chips = this.chips(), index = chips.indexOf((event.target as HTMLElement).closest(".blade-attachment") as HTMLElement);
    if (index < 0) return;
    let next = -1;
    if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); void this.remove(this.entries[index].item.id); return; }
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = Math.min(chips.length - 1, index + 1);
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = Math.max(0, index - 1);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = chips.length - 1;
    if (next < 0) return;
    event.preventDefault();
    this.focused = next;
    this.roving();
    chips[next].focus();
  }

  private render(): void {
    const empty = !this.entries.length;
    this.host.style.display = empty ? "none" : "";
    this.list.hidden = empty;
    this.focused = Math.max(0, Math.min(this.focused, this.entries.length - 1));
    const chips = this.entries.map((entry, index) => this.paint(entry, index));
    // Kept chips stay in the document (a focused one keeps its focus); only a different order rebuilds the row.
    const current = Array.from(this.list.children);
    if (current.every((chip, index) => chip === chips[index])) this.list.append(...chips.slice(current.length));
    else this.list.replaceChildren(...chips);
  }

  /** Creates or updates one chip in place. */
  private paint(entry: Entry, index: number): HTMLElement {
    const { item } = entry;
    let chip = entry.chip;
    if (!chip) {
      chip = entry.chip = document.createElement("div");
      chip.setAttribute("role", "listitem");
      chip.title = item.name;
      const name = Object.assign(document.createElement("span"), { className: "blade-attachment__name", textContent: item.name });
      const detail = Object.assign(document.createElement("span"), { className: "blade-attachment__detail" });
      const label = t("{name} eltávolítása", { name: item.name });
      const button = Object.assign(document.createElement("button"), { type: "button", tabIndex: -1, className: "blade-attachment__remove", title: label });
      button.setAttribute("aria-label", label);
      button.innerHTML = '<i class="bi bi-x-lg" aria-hidden="true"></i>';
      for (const part of [name, detail]) part.setAttribute("aria-hidden", "true");
      chip.append(document.createElement("i"), name, detail, button);
    }
    const state = item.status === "uploading" ? (item.percent ? item.percent + "%" : t("Feltöltés…")) : item.status === "failed" ? item.error ?? t("Sikertelen feltöltés.") : item.size ? sizeLabel(item.size) : "";
    chip.className = "blade-attachment blade-attachment--" + item.status;
    chip.tabIndex = index === this.focused ? 0 : -1;
    chip.setAttribute("aria-label", state ? `${item.name}, ${state}` : item.name);
    (chip.querySelector(".blade-attachment__remove") as HTMLElement).dataset.remove = item.id;
    chip.querySelector(".blade-attachment__detail")!.textContent = state;
    const thumb = item.status === "done" ? this.options.thumbnail?.({ ...item }) ?? null : null, visual = chip.firstElementChild as HTMLElement;
    const kind = thumb ? "img" : "i";
    if (visual.localName !== kind || (thumb && (visual as HTMLImageElement).getAttribute("src") !== thumb)) {
      const next = thumb ? Object.assign(document.createElement("img"), { src: thumb, alt: "", className: "blade-attachment__thumb" }) : document.createElement("i");
      next.setAttribute("aria-hidden", "true");
      visual.replaceWith(next);
    }
    const icon = chip.firstElementChild as HTMLElement;
    if (!thumb) icon.className = "blade-attachment__icon " + (item.status === "failed" ? "bi bi-exclamation-triangle-fill" : iconOf(item.name));
    icon.setAttribute("aria-hidden", "true");
    return chip;
  }
}
