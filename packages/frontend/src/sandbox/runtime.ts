import { describe, envelope, projectType } from "./protocol";

/** The global `blade` the delivered code sees inside the frame (docs/toolkit.md#sandbox-protocol). */
export interface SandboxScope {
  /** Subscribes to a project message type from the parent; returns the unsubscribe function. */
  on(type: string, handler: (payload: unknown) => void): () => void;
  /** Sends a project message (dotted type, structured-clone payload) to the parent. */
  post(type: string, payload?: unknown): void;
  /** The `load` files: Blobs as `blob:` URLs of the frame, strings unchanged. */
  readonly files: Readonly<Record<string, string>>;
}

/** What the bootstrap needs from its window; `bootstrap.ts` passes the real one, the node check a fake. */
export interface FrameHost {
  /** The frame's own window and its parent; equal when the document is not framed. */
  readonly self: unknown;
  /** The document's origin (`self.origin`): `"null"` only in an opaque-origin (sandboxed, no same-origin) frame. */
  readonly origin: string;
  readonly parent: { postMessage(message: unknown, targetOrigin: string): void };
  /** Where `blade` and the one-shot start hook are defined (the frame's global object). */
  readonly global: Record<string, unknown>;
  on(type: "message" | "error" | "unhandledrejection", handler: (event: any) => void): void;
  objectUrl(blob: Blob): string;
  /** Runs `source` as a classic script from a `blob:` URL; `failed` when it cannot be loaded. */
  execute(source: string, failed: () => void): void;
}

/** Name of the one-shot hook the wrapped code calls with its body. */
export const START = "__bladeSandboxStart";

/**
 * The frame side of the protocol, active only in a framed opaque-origin document. Accepts messages only from the parent window; runs the code of the first `load`
 * wrapped in an async function (`blade` in scope, top-level `await` and `return` allowed) and answers `ready` once
 * it settled, or `error` for a throw, a rejection, a later uncaught error and every protocol violation.
 */
export function startSandbox(host: FrameHost): void {
  // Opened directly instead of inside a SandboxFrame: posting to itself would answer its own messages. Framed without
  // `sandbox` or with `allow-same-origin` the document has a real origin and would run code in it: stay inert too.
  if (host.parent === host.self || host.origin !== "null") return;
  let sequence = 0, loaded = false;
  const handlers = new Map<string, Set<(payload: unknown) => void>>();
  const files: Record<string, string> = {};
  const send = (type: string, payload: unknown) => host.parent.postMessage({ blade: 1, id: "f" + ++sequence, type, payload }, "*");
  const fail = (error: unknown) => send("error", { message: describe(error) });
  const scope: SandboxScope = Object.freeze({
    on(type: string, handler: (payload: unknown) => void) {
      if (!projectType(type) || typeof handler !== "function") throw new TypeError(`blade.on: "${String(type)}" is not a dotted project message type.`);
      const set = handlers.get(type) ?? new Set();
      handlers.set(type, set);
      set.add(handler);
      return () => { set.delete(handler); };
    },
    post(type: string, payload?: unknown) {
      if (!projectType(type)) throw new TypeError(`blade.post: "${String(type)}" is not a dotted project message type.`);
      send(type, payload);
    },
    files,
  });
  Object.defineProperty(host.global, "blade", { value: scope, enumerable: true });

  const load = (payload: unknown) => {
    if (loaded) return fail(new Error("Protocol: the frame accepts one load."));
    loaded = true;
    const { code, files: given } = (typeof payload === "object" && payload !== null ? payload : {}) as { code?: unknown; files?: unknown };
    if (typeof code !== "string" || typeof given !== "object" || given === null) return fail(new Error("Protocol: invalid load payload."));
    for (const [name, value] of Object.entries(given)) {
      if (typeof value === "string") files[name] = value;
      else if (value instanceof Blob) files[name] = host.objectUrl(value);
      else return fail(new Error(`Protocol: file "${name}" is neither a Blob nor a string.`));
    }
    Object.freeze(files);
    host.global[START] = (main: (blade: SandboxScope) => unknown) => {
      delete host.global[START];
      Promise.resolve().then(() => main(scope)).then(() => send("ready", {}), fail);
    };
    host.execute(`globalThis.${START}(async function (blade) {\n${code}\n});`, () => fail(new Error("The code could not be started.")));
  };

  host.on("message", (event: MessageEvent) => {
    if (event.source !== host.parent) return;
    const message = envelope(event.data);
    if (!message) return fail(new Error("Protocol: invalid message."));
    if (message.type === "load") return load(message.payload);
    if (message.type === "ready" || message.type === "error") return fail(new Error(`Protocol: "${message.type}" is sent by the frame only.`));
    for (const handler of [...(handlers.get(message.type) ?? [])]) {
      try { handler(message.payload); } catch (error) { fail(error); }
    }
  });
  host.on("error", (event: ErrorEvent) => fail(event.error ?? event.message));
  host.on("unhandledrejection", (event: PromiseRejectionEvent) => fail(event.reason));
}
