import type { AppEvents, EventBus, SignalOptions } from "./types";

type Handler = (payload: any) => void;

/**
 * The `signal` of a `SignalOptions` argument (`member` names the caller in the error). Absent options give none; a
 * non-object (a bare `AbortSignal` from the removed positional form too) or a `signal` that is not an `AbortSignal`
 * throws `TypeError`.
 */
export function signalOf(options: SignalOptions | undefined, member: string): AbortSignal | undefined {
  if (options === undefined) return undefined;
  if (options === null || typeof options !== "object" || options instanceof AbortSignal) throw new TypeError(`61ade: ${member} takes its signal as an option ({ signal }).`);
  const signal = options.signal;
  if (signal !== undefined && !(signal instanceof AbortSignal)) throw new TypeError(`61ade: ${member} option \`signal\` must be an AbortSignal.`);
  return signal;
}

/** Subscribes `release` to `signal`: returns false (subscribe nothing) when it already aborted. */
export function tieTo(signal: AbortSignal | undefined, release: () => void): boolean {
  if (signal?.aborted) return false;
  signal?.addEventListener("abort", release, { once: true });
  return true;
}

/** `Application.events` plus `dispatch`, the shell's own way to emit framework (`:`) events. */
export type InternalEventBus = EventBus & { dispatch<K extends keyof AppEvents>(event: K, payload: AppEvents[K]): void };

/**
 * The page-wide typed bus (toolkit K-F2). Handlers run synchronously in registration order; a throwing handler is
 * logged and the others still run. Project events need a dotted name; framework events (with `:`) are the shell's.
 */
export function createEventBus(): InternalEventBus {
  const handlers = new Map<string, Set<Handler>>();
  const run = (event: string, payload: unknown) => {
    for (const handler of [...(handlers.get(event) ?? [])]) {
      try { handler(payload); } catch (error) { console.error(error); }
    }
  };
  const off = (event: string, handler: Handler) => { handlers.get(event)?.delete(handler); };
  return {
    on(event, handler, options) {
      const name = String(event), signal = signalOf(options, "events.on");
      const release = () => off(name, handler);
      if (!tieTo(signal, release)) return release;
      if (!handlers.has(name)) handlers.set(name, new Set());
      handlers.get(name)!.add(handler);
      return release;
    },
    off: (event, handler) => off(String(event), handler),
    emit(event, payload) {
      const name = String(event);
      if (name.includes(":")) throw new Error(`61ade: "${name}" is a framework event; only 61ade emits it.`);
      if (!/^[a-z][a-z0-9_.-]*$/.test(name) || !name.includes(".")) throw new TypeError(`61ade: project event "${name}" needs a dotted name (project.event).`);
      run(name, payload);
    },
    dispatch: (event, payload) => run(String(event), payload),
  };
}
