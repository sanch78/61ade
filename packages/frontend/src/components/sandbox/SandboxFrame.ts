import { Layout } from "@dhtmlx/suite";
import type { AppEvents, ComponentClass, MountTarget, SandboxError, SandboxErrorCode, SandboxFrame as SandboxFrameApi, SandboxFrameEvents, SandboxFrameOptions } from "../../api/types";
import { attachContent } from "../../api/services";
import { Lifecycle, optionSignal } from "../Lifecycle";
import { t } from "../../I18n";
import { byteLength, describe, envelope, projectType } from "../../sandbox/protocol";
import "./sandbox.css";

/** G1 limits, confirmed in toolkit P3 C-4: code 1 MiB, files 32 MiB, `ready` within 10 s. */
export const SANDBOX_LIMITS = Object.freeze({ code: 1 << 20, files: 32 << 20, ready: 10_000 });

type ErrorCode = SandboxErrorCode;
type Report = (payload: AppEvents["sandbox:error"]) => void;
type Pending = { resolve(): void; reject(error: unknown): void; timer: ReturnType<typeof setTimeout> };

const limit = (value: number | undefined, fallback: number, name: string): number => {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) throw new TypeError(`61ade: SandboxFrame ${name} must be a positive number.`);
  return value;
};
const aborted = () => new DOMException("The sandbox frame was replaced or destroyed.", "AbortError");

/**
 * `app.components.SandboxFrame` (toolkit C-4): untrusted code in `<iframe sandbox="allow-scripts">` running
 * `sandbox.html` beside `admin.js` (opaque origin: no cookies, session, CSRF token or same-origin access).
 * `report` feeds the page's `sandbox:error` event; `address` is the sandbox document's URL, by default resolved on the
 * first `load()` beside `admin.js`, so creating the application never fails because of the sandbox.
 */
export function sandboxFrameClass(report: Report, address?: string): ComponentClass<SandboxFrameOptions, SandboxFrameApi> {
  return class SandboxFrame implements SandboxFrameApi {
    readonly layout: Layout;
    /** The Layout's own container, used for an element target. */
    private readonly root = document.createElement("div");
    /** Holds the iframe; placed into the Layout cell. */
    private readonly host = document.createElement("div");
    private readonly controller = new AbortController();
    private readonly life = new Lifecycle<SandboxFrameEvents>(() => this.destroy());
    private readonly limits: { code: number; files: number; ready: number };
    private readonly title: string;
    private frame?: HTMLIFrameElement;
    private frameListeners?: AbortController;
    private pending?: Pending;
    private ready = false;
    /** The current frame document already reported an error caused by its messages; it reports no more (noise bound). */
    private reported = false;
    private sequence = 0;

    constructor(options: SandboxFrameOptions = {}) {
      const signal = optionSignal(options);
      this.limits = {
        code: limit(options.maxCodeBytes, SANDBOX_LIMITS.code, "maxCodeBytes"),
        files: limit(options.maxFileBytes, SANDBOX_LIMITS.files, "maxFileBytes"),
        ready: limit(options.readyTimeout, SANDBOX_LIMITS.ready, "readyTimeout"),
      };
      this.title = options.title ?? t("Tartalom");
      this.root.className = "blade-sandbox";
      this.host.className = "blade-sandbox__host";
      this.layout = new Layout(this.root, { rows: [{ id: "frame" }] });
      attachContent(this.layout.getCell("frame"), this.host, this.controller.signal);
      window.addEventListener("message", event => this.receive(event), { signal: this.controller.signal });
      this.life.bind(signal);
    }

    mount(target: MountTarget): void { this.life.mount(target, this.layout, element => element.append(this.root)); }

    on<K extends keyof SandboxFrameEvents>(event: K, handler: (payload: SandboxFrameEvents[K]) => void): () => void { return this.life.on(event, handler); }

    load(code: string, files: Record<string, Blob | string> = {}): Promise<void> {
      if (this.life.destroyed) return Promise.reject(aborted());
      if (typeof code !== "string") return Promise.reject(new TypeError("61ade: SandboxFrame.load needs the code as a string."));
      if (typeof files !== "object" || files === null) return Promise.reject(new TypeError("61ade: SandboxFrame.load files must be an object."));
      let total = 0;
      for (const [name, value] of Object.entries(files)) {
        if (typeof value === "string") total += byteLength(value);
        else if (value instanceof Blob) total += value.size;
        else return Promise.reject(new TypeError(`61ade: sandbox file "${name}" must be a Blob or a string.`));
      }
      // The current frame stays until a valid load replaces it.
      if (byteLength(code) > this.limits.code) return Promise.reject(this.fail("size", `The sandbox code exceeds ${this.limits.code} bytes.`));
      if (total > this.limits.files) return Promise.reject(this.fail("size", `The sandbox files exceed ${this.limits.files} bytes.`));
      try { address ??= sandboxDocument(); } catch {
        return Promise.reject(new Error("61ade: SandboxFrame cannot resolve sandbox.html beside admin.js (the bundle has no usable import.meta.url)."));
      }
      const src = address;
      this.close();
      return new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => this.fail("timeout", `The sandbox did not become ready within ${this.limits.ready} ms.`, true), this.limits.ready);
        this.pending = { resolve, reject, timer };
        this.open(src, { code, files: { ...files } });
      });
    }

    post(type: string, payload?: unknown): void {
      if (this.life.destroyed) return;
      if (!projectType(type)) throw new TypeError(`61ade: sandbox message type "${String(type)}" needs a project prefix with a dot.`);
      if (!this.ready || !this.frame) throw new Error("61ade: the sandbox is not ready; await load() first.");
      this.send(this.frame, type, payload);
    }

    destroy(): void {
      if (!this.life.end(this.layout)) return;
      this.close();
      this.controller.abort();
      this.layout.destructor();
      this.root.remove();
    }

    /** Creates the iframe; its first `load` sends the code, any later one (navigation, reload) kills it. */
    private open(src: string, payload: { code: string; files: Record<string, Blob | string> }): void {
      const frame = document.createElement("iframe");
      frame.className = "blade-sandbox__frame";
      frame.setAttribute("sandbox", "allow-scripts");
      // Chromium: the frame's own requests and navigations carry no credentials at all.
      frame.setAttribute("credentialless", "");
      frame.referrerPolicy = "no-referrer";
      frame.title = this.title;
      frame.src = src;
      const listeners = new AbortController();
      let loads = 0;
      frame.addEventListener("load", () => {
        if (++loads === 1) this.send(frame, "load", payload);
        else this.fail("protocol", "The sandbox document was navigated or reloaded.", true);
      }, { signal: listeners.signal });
      this.frame = frame;
      this.frameListeners = listeners;
      this.reported = false;
      this.host.replaceChildren(frame);
    }

    /** Removes the frame (kill switch) and rejects a pending load. */
    private close(): void {
      this.frameListeners?.abort();
      this.frame?.remove();
      this.frame = this.frameListeners = undefined;
      this.ready = false;
      const pending = this.pending;
      this.pending = undefined;
      if (pending) { clearTimeout(pending.timer); pending.reject(aborted()); }
    }

    private send(frame: HTMLIFrameElement, type: string, payload: unknown): void {
      // The opaque origin cannot be named as the target; the window is this component's own frame.
      frame.contentWindow?.postMessage({ blade: 1, id: "p" + ++this.sequence, type, payload }, "*");
    }

    /**
     * Only messages of the own frame's window from the opaque origin; all of them are untrusted input. Project messages
     * are delivered while the frame document lives, also before `ready` (code may report during its evaluation) and
     * after an error; the first `error` or protocol violation a document's messages cause is reported, later ones are not.
     */
    private receive(event: MessageEvent): void {
      const frame = this.frame;
      if (!frame || event.source !== frame.contentWindow || event.origin !== "null") return;
      const message = envelope(event.data);
      if (!message) { this.noise("protocol", "The sandbox sent an invalid message."); return; }
      if (message.type === "ready") {
        const pending = this.pending;
        if (!pending || this.ready) return;
        this.ready = true;
        this.pending = undefined;
        clearTimeout(pending.timer);
        pending.resolve();
        this.life.emit("ready", {});
      } else if (message.type === "error") {
        const detail = message.payload as { message?: unknown } | null;
        this.noise("error", describe(typeof detail === "object" && detail !== null ? detail.message : detail));
      } else if (message.type === "load") this.noise("protocol", "The sandbox sent a reserved message type.");
      else this.life.emit("message", { type: message.type, payload: message.payload });
    }

    /** A failure the frame's own messages caused: reported once per frame document. */
    private noise(code: ErrorCode, message: string): void {
      if (this.reported) return;
      this.reported = true;
      this.fail(code, message);
    }

    /** Reports `error` and `sandbox:error`, rejects a pending load with an `Error` carrying `code`; `kill` removes the frame. */
    private fail(code: ErrorCode, message: string, kill = false): SandboxError {
      const error: SandboxError = Object.assign(new Error(message), { code });
      const pending = this.pending;
      this.pending = undefined;
      if (pending) { clearTimeout(pending.timer); pending.reject(error); }
      if (kill) this.close();
      const payload = { message, code };
      console.warn(`61ade: sandbox ${code}: ${message}`);
      // The component event only while mounted; the page's `sandbox:error` for every failure.
      this.life.emit("error", payload);
      try { report(payload); } catch (failure) { console.error(failure); }
      return error;
    }
  };
}

/** `sandbox.html` beside `admin.js`, with the bundle's cache key; throws when `import.meta.url` is not a usable base. */
function sandboxDocument(): string {
  const script = new URL(import.meta.url);
  if (script.protocol !== "https:" && script.protocol !== "http:") throw new TypeError(`admin.js is not served over HTTP: ${script.protocol}`);
  const url = new URL("sandbox.html", script);
  url.search = script.search;
  return url.href;
}
