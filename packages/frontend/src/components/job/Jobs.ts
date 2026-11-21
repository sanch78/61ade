import { Layout, Toolbar } from "@dhtmlx/suite";
import { t, locale } from "../../I18n";
import { server } from "../../api/Server";
import { attachContent, openWindow } from "../../api/services";
import type { AppEvents, AppWindow, JobLogLine, JobReference, JobStartOptions, JobStatus, Jobs, JobView as JobViewApi, JobViewEvents, JobViewOptions, MountTarget } from "../../api/types";
import { Component } from "../list/component";
import "./jobs.css";

/**
 * Long-running jobs in the browser (`app.jobs`, `components.JobView`, docs/toolkit.md#jobs): starts with an idempotent
 * client token and finds a start whose answer was lost, polls each job once for the whole page (backing off while
 * nothing changes, paused while the page is hidden), keeps a leave-page guard while a job of this page runs, reattaches
 * the user's running jobs after a reload and reports `job:started`, `job:progress` and `job:done`.
 */
type JobEventName = "job:started" | "job:progress" | "job:done";
const listeners = new Set<(name: JobEventName, payload: AppEvents[JobEventName]) => void>();
/** The application forwards these to `app.events` (Application.ts). */
export function onJobEvent(listener: (name: JobEventName, payload: AppEvents[JobEventName]) => void): () => void { listeners.add(listener); return () => listeners.delete(listener); }
const emit = <K extends JobEventName>(name: K, payload: AppEvents[K]) => { for (const listener of listeners) try { listener(name, payload); } catch (error) { console.error(error); } };

const TERMINAL = new Set(["done", "failed", "cancelled"]);
const ID = /^[A-Za-z0-9_.:-]{1,100}$/, NAME = /^[a-z][a-z0-9_.-]*$/;
const invalid = (reason: string) => new TypeError("61ade: jobs: " + reason + ".");
function reference(job: unknown): JobReference {
  const value = (job && typeof job === "object" ? job : {}) as Record<string, unknown>;
  if (typeof value.id !== "string" || !ID.test(value.id) || typeof value.resource !== "string" || !NAME.test(value.resource) || typeof value.action !== "string" || !NAME.test(value.action)) throw invalid("a job is {id, resource, action}");
  return { id: value.id, resource: value.resource, action: value.action };
}
const token = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, "0")).join("");
const read = (job: JobReference, operation: string, values: Record<string, unknown> = {}) => server.call<any>(job.resource, "__job", { values: { operation, action: job.action, ...values } });

/** One poll loop per job for the whole page; its subscribers get every changed status with the whole log so far. */
class Tracker {
  status?: JobStatus;
  readonly subscribers = new Set<(status: JobStatus) => void>();
  private readonly failures = new Set<(error: unknown) => void>();
  private timer?: ReturnType<typeof setTimeout>;
  private delay = 1000;
  private lines: JobLogLine[] = [];
  private stopped = false;
  private polling = false;
  constructor(readonly job: JobReference, readonly guarded: boolean) {
    document.addEventListener("visibilitychange", this.visible);
    if (guarded) guard(1);
    void this.poll();
  }
  onError(handler: (error: unknown) => void): () => void { this.failures.add(handler); return () => this.failures.delete(handler); }
  private readonly visible = () => { if (!document.hidden && !this.stopped && !this.polling) { clearTimeout(this.timer); this.delay = 1000; void this.poll(); } };
  private async poll(): Promise<void> {
    if (this.stopped) return;
    // A hidden page is not polled; showing it again polls at once (visible).
    if (document.hidden) return;
    this.polling = true;
    try {
      const status: JobStatus = await read(this.job, "status", { id: this.job.id, after: this.status?.logNext ?? 0 });
      if (this.stopped) return;
      this.lines = [...this.lines, ...status.log];
      const next = { ...status, log: this.lines };
      const changed = !this.status || JSON.stringify({ ...this.status, log: this.status.log.length }) !== JSON.stringify({ ...next, log: next.log.length });
      this.status = next;
      if (changed) { this.delay = 1000; for (const subscriber of this.subscribers) subscriber(next); emit("job:progress", { status: next }); }
      else this.delay = Math.min(5000, Math.round(this.delay * 1.5));
      if (TERMINAL.has(next.state)) { emit("job:done", { status: next }); this.stop(); return; }
    } catch (error) {
      if (this.stopped) return;
      const code = (error as { status?: number }).status;
      // Gone, no longer visible or signed out: the job cannot be followed; a network or server failure is retried later.
      if (code === 401 || code === 403 || code === 404) { for (const failed of this.failures) failed(error); this.stop(); return; }
      this.delay = Math.min(15000, this.delay * 2);
    } finally { this.polling = false; }
    if (!this.stopped) this.timer = setTimeout(() => void this.poll(), this.delay);
  }
  stop(): void {
    if (this.stopped) return;
    this.stopped = true; clearTimeout(this.timer);
    document.removeEventListener("visibilitychange", this.visible);
    if (this.guarded) guard(-1);
    trackers.delete(key(this.job));
  }
}
/** Jobs of different sources may share an id: a job is its action and id. */
const key = (job: JobReference) => `${job.resource}.${job.action}:${job.id}`;
const trackers = new Map<string, Tracker>();
function track(job: JobReference, guarded = false): Tracker {
  let tracker = trackers.get(key(job));
  if (!tracker) { tracker = new Tracker(job, guarded); trackers.set(key(job), tracker); }
  return tracker;
}
/** The browser's leave confirmation while a job this page started or reattached is running. */
let guarded = 0;
const leaving = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
function guard(change: number): void {
  const before = guarded; guarded = Math.max(0, guarded + change);
  if (!before && guarded) addEventListener("beforeunload", leaving);
  if (before && !guarded) removeEventListener("beforeunload", leaving);
}

const time = (iso?: string) => iso ? new Date(iso).toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "";
const duration = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const STATE_TEXT: Record<string, () => string> = {
  queued: () => t("Várakozik az indulásra…"), running: () => t("Folyamatban…"), done: () => t("A feladat elkészült."),
  failed: () => t("A feladat nem sikerült."), cancelled: () => t("A feladat megszakítva."),
};

/**
 * The job's progress (`components.JobView`, docs/toolkit.md#jobs): its stage (`role="status"`), a native `<progress>`
 * (percent, or indeterminate), the step and the elapsed time, a heartbeat warning, the log (`role="log"`), the result
 * or error and `Megszakítás` while the source can cancel. Events `progress` and `done` carry the status.
 */
export class JobView extends Component<JobViewEvents> implements JobViewApi {
  readonly layout: Layout;
  private readonly job: JobReference;
  private readonly title: string;
  private readonly root = document.createElement("div");
  private readonly stage = document.createElement("p");
  private readonly bar = document.createElement("progress");
  private readonly meta = document.createElement("p");
  private readonly warning = document.createElement("p");
  private readonly log = document.createElement("ol");
  private readonly outcome = document.createElement("p");
  private readonly toolbar: Toolbar;
  private readonly release = new AbortController();
  private readonly tracker: Tracker;
  private readonly clock: ReturnType<typeof setInterval>;
  private beat?: { value?: string; at: number };
  private shownLines = 0;
  private cancelling = false;
  status?: JobStatus;

  constructor(options: JobViewOptions) {
    super(options);
    if (!options || typeof options !== "object") throw invalid("JobView needs options");
    this.job = reference(options.job);
    if (options.title !== undefined && (typeof options.title !== "string" || !options.title.trim())) throw invalid("title is plain text");
    this.title = options.title ?? t("Feladat");
    this.root.className = "blade-job";
    this.stage.className = "blade-job__stage"; this.stage.setAttribute("role", "status"); this.stage.setAttribute("aria-live", "polite");
    this.stage.textContent = t("Betöltés…");
    this.bar.className = "blade-progress__bar blade-job__bar"; this.bar.max = 100; this.bar.setAttribute("aria-label", this.title);
    this.meta.className = "blade-job__meta";
    this.warning.className = "blade-job__warning"; this.warning.hidden = true;
    this.log.className = "blade-job__log"; this.log.setAttribute("role", "log"); this.log.setAttribute("aria-label", t("Napló")); this.log.tabIndex = 0;
    this.outcome.className = "blade-job__outcome"; this.outcome.hidden = true;
    this.root.append(this.stage, this.bar, this.meta, this.warning, this.log, this.outcome);
    this.layout = new Layout(this.host, { type: "none", css: "blade-job-layout", rows: [{ id: "body" }, { id: "actions", height: "content", css: "blade-job__actions" }] } as any);
    this.toolbar = new Toolbar(undefined, { css: "blade-job__toolbar", data: [{ type: "spacer" }, { id: "cancel", value: t("Megszakítás"), icon: "bi bi-x-octagon", hidden: true }] } as any);
    this.toolbar.events.on("click", (id: string | number) => { if (id === "cancel") void this.cancel(); });
    this.tracker = track(this.job, options.guard !== false);
    const update = (status: JobStatus) => this.render(status);
    this.tracker.subscribers.add(update);
    const unavailable = this.tracker.onError(() => { if (!this.destroyed) { this.stage.textContent = t("A feladat nem érhető el."); this.bar.value = 0; } });
    this.release.signal.addEventListener("abort", () => { this.tracker.subscribers.delete(update); unavailable(); }, { once: true });
    if (this.tracker.status) queueMicrotask(() => this.tracker.status && this.render(this.tracker.status));
    this.clock = setInterval(() => this.tick(), 1000);
    this.bind(options.signal);
  }
  override mount(target: MountTarget): void {
    super.mount(target);
    if (this.destroyed) return;
    attachContent(this.layout.getCell("body"), this.root, this.release.signal);
    this.layout.getCell("actions").attach(this.toolbar);
  }
  /** Asks the source to stop the job; false when it cannot. */
  async cancel(): Promise<boolean> {
    if (this.cancelling || !this.status?.cancel) return false;
    this.cancelling = true; this.toolbar.disable("cancel");
    try {
      const answer = await read(this.job, "cancel", { id: this.job.id });
      if (answer.cancelled) this.stage.textContent = t("Megszakítás kérve…");
      return !!answer.cancelled;
    } finally { this.cancelling = false; if (!this.destroyed) this.toolbar.enable("cancel"); }
  }
  private render(status: JobStatus): void {
    if (this.destroyed) return;
    const first = !this.status;
    this.status = status;
    if (this.beat?.value !== status.heartbeat) this.beat = { value: status.heartbeat, at: Date.now() };
    const running = !TERMINAL.has(status.state);
    this.stage.textContent = running && status.stage ? status.stage : STATE_TEXT[status.state]();
    if (status.state === "done") this.bar.value = 100;
    else if (typeof status.percent === "number") this.bar.value = status.percent;
    else if (running) this.bar.removeAttribute("value");
    for (const line of status.log.slice(this.shownLines)) {
      const item = document.createElement("li"), at = document.createElement("time");
      item.className = "blade-job__line blade-job__line--" + line.level;
      at.dateTime = line.at; at.textContent = time(line.at);
      item.append(at, document.createTextNode(" " + (line.level === "info" ? "" : (line.level === "warning" ? t("Figyelmeztetés") : t("Hiba")) + ": ") + line.text));
      this.log.append(item);
    }
    if (status.log.length > this.shownLines) { this.shownLines = status.log.length; this.log.scrollTop = this.log.scrollHeight; }
    this.log.hidden = !status.log.length;
    if (!running) {
      const reveal = (status.result as { reveal?: { label?: string; value?: string; note?: string } } | undefined)?.reveal;
      this.outcome.hidden = false;
      this.outcome.className = "blade-job__outcome blade-job__outcome--" + status.state;
      this.outcome.textContent = status.state === "failed" ? (status.error ?? STATE_TEXT.failed()) : reveal ? `${reveal.label ?? ""}: ${reveal.value ?? ""}${reveal.note ? " — " + reveal.note : ""}` : STATE_TEXT[status.state]();
    }
    if (status.cancel && running) this.toolbar.show("cancel"); else this.toolbar.hide("cancel");
    this.tick();
    this.emit("progress", { status });
    if (!running) this.emit("done", { status });
    if (first) this.layout.paint();
  }
  private tick(): void {
    const status = this.status;if (!status || this.destroyed) return;
    const running = !TERMINAL.has(status.state);
    const start = Date.parse(status.started ?? status.created ?? "");
    const end = running ? Date.now() : Date.parse(status.finished ?? "") || Date.now();
    this.meta.textContent = [status.step ? t("Lépés: {index} / {count}", { index: status.step.index, count: status.step.count }) : "",
      Number.isFinite(start) ? t("Eltelt idő: {time}", { time: duration(end - start) }) : ""].filter(Boolean).join(" · ");
    // The heartbeat's age by this page's clock (the server's clock may differ): the time since it last changed.
    const silent = status.state === "running" && this.beat ? Math.floor((Date.now() - this.beat.at) / 1000) : 0;
    const warn = silent >= status.heartbeatAfter;
    if (warn !== !this.warning.hidden) this.warning.hidden = !warn;
    if (warn) this.warning.textContent = t("A feladat {seconds} másodperce nem jelzett.", { seconds: silent });
  }
  protected dispose(): void { clearInterval(this.clock); this.release.abort(); this.toolbar.destructor(); this.layout.destructor(); }
}

const windows = new Map<string, AppWindow>();
/** The framework job window of $job (one per job and page). */
function openJob(job: JobReference, options: { title?: string } = {}): AppWindow {
  const ref = reference(job);
  const open = windows.get(key(ref));
  if (open && !open.signal.aborted) return open;
  const win = openWindow({ title: options.title ?? t("Feladat"), width: 520, height: 420, fit: false, resizable: true });
  windows.set(key(ref), win);
  win.signal.addEventListener("abort", () => windows.delete(key(ref)), { once: true });
  new JobView({ job: ref, title: options.title, signal: win.signal }).mount(win);
  return win;
}

/** `app.jobs`. */
export const jobs: Jobs = {
  async start(resource, action, options: JobStartOptions = {}) {
    const key = token();
    let answer: { job?: unknown };
    try { answer = await server.call<{ job?: unknown }>(resource, action, { id: options.id ?? null, values: options.values ?? {}, signal: options.signal, token: key }); }
    catch (error) {
      // A lost answer (network failure): the start may have happened; its token finds the job.
      if ((error as { status?: number }).status !== 0 || options.signal?.aborted) throw error;
      let found: unknown = null;
      for (let attempt = 0; attempt < 3 && !found; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        try { found = (await server.call<{ job: unknown }>(resource, "__job", { values: { operation: "find", action, token: key } })).job; } catch { /* retried */ }
      }
      if (!found) throw error;
      answer = { job: found };
    }
    const job = reference(answer.job);
    emit("job:started", { job });
    track(job, true);
    if (options.window !== false) openJob(job, { title: options.title });
    return job;
  },
  open: (job, options) => openJob(job, options),
  status: async (job, after = 0) => { const ref = reference(job); return await read(ref, "status", { id: ref.id, after }) as JobStatus; },
  cancel: async job => { const ref = reference(job); return !!(await read(ref, "cancel", { id: ref.id })).cancelled; },
  running: async () => ((await server.call<{ jobs: unknown[] }>("", "__job", { values: { operation: "running" } })).jobs ?? []).map(reference),
};

/** After a reload: the signed-in user's running jobs reopen in their windows (and keep the leave guard). */
export async function reattachJobs(): Promise<void> {
  try { for (const job of await jobs.running()) { track(job, true); openJob(job); } }
  catch { /* no job reads offered (or none installed): nothing to reattach */ }
}
