import type { AppEvents, EventBus } from "./types";

type Handler = (payload: any) => void;

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
    on(event, handler, signal) {
      const name = String(event);
      const release = () => off(name, handler);
      if (signal?.aborted) return release;
      if (!handlers.has(name)) handlers.set(name, new Set());
      handlers.get(name)!.add(handler);
      signal?.addEventListener("abort", release, { once: true });
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
