import type { ViewHost } from "../api/types";

type Binding = { read(): void; cancel(): void };

/** Bindings live with their page or component. Each writer owns one fragment parameter. */
export class PageSelections {
  private bindings = new Map<string, Binding>();

  constructor(private current: () => boolean, private write: (url: URL, replace: boolean) => void,
    private pendingTrees: () => Promise<unknown> | undefined, private failed: (error: unknown) => void, private lifetime: AbortSignal) {
    lifetime.addEventListener("abort", () => this.cancel(), { once: true });
  }

  restore(): void {
    for (const binding of this.bindings.values()) binding.read();
  }

  cancel(): void {
    for (const binding of this.bindings.values()) binding.cancel();
  }

  bind: ViewHost["selection"] = (key, restore, options) => {
    if (typeof key !== "string" || !/^[a-z][a-z0-9_.-]{0,79}$/.test(key) || typeof restore !== "function")
      throw new TypeError("61ade: selection requires a stable key and a restore function.");
    if (this.bindings.has(key)) throw new TypeError("61ade: selection keys must be unique on the page.");
    const owner = options?.signal ?? this.lifetime;
    if (owner.aborted || this.lifetime.aborted) return () => {};
    const param = "select." + key;
    const params = () => new URLSearchParams(location.hash.slice(1));
    const current = () => !owner.aborted && !this.lifetime.aborted && this.current();
    let requested: string | null | undefined;
    let pending: AbortController | undefined;
    const cancel = () => { pending?.abort(); pending = undefined; requested = undefined; };

    const write = (value: string | null, replace: boolean) => {
      if (value !== null && (typeof value !== "string" || !value || value.length > 512 || value.includes("\0")))
        throw new TypeError("61ade: a selection value is null or 1–512 characters without NUL.");
      const url = new URL(location.href), query = params();
      requested = value;
      if (query.get(param) === value && query.getAll(param).length <= 1) return;
      if (value === null) query.delete(param);
      else query.set(param, value);
      url.hash = query.toString();
      this.write(url, replace);
    };
    const read = () => {
      if (!current()) return;
      const values = params().getAll(param), raw = values[0] ?? null;
      if (raw === requested && values.length <= 1) return;
      cancel();
      requested = raw;
      const controller = pending = new AbortController();
      const value = values.length === 1 && raw && raw.length <= 512 && !raw.includes("\0") ? raw : null;
      const active = () => !controller.signal.aborted && current() && params().get(param) === raw;
      const apply = async () => {
        try {
          for (let load = this.pendingTrees(); load; load = this.pendingTrees()) {
            await load;
            if (!active()) return;
          }
          const accepted = await restore(value, controller.signal);
          if (active()) write(accepted, true);
        } catch (error) {
          if (active()) this.failed(error);
        } finally {
          if (pending === controller) pending = undefined;
        }
      };
      void apply();
    };
    this.bindings.set(key, { read, cancel });
    owner.addEventListener("abort", () => { cancel(); this.bindings.delete(key); }, { once: true });
    read();
    return (value, options) => {
      if (!current()) return;
      cancel();
      write(value, options?.replace === true);
    };
  };
}
