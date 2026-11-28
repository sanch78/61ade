import type { ViewHost } from "../api/types";

/** A page owns the history entries of its mounted trees. Windows have no address. */
type Entry = { path: string[]; pending?: Promise<void>; restore(path: readonly string[]): void | Promise<void> };
type Page = { entries: Map<string, Entry>; write(url: URL, replace: boolean): void; current(): boolean };
const pages = new WeakMap<ViewHost, Page>();

function readPath(params: URLSearchParams, key: string): string[] | undefined {
  const ids = params.getAll(key);
  if (!ids.length) return undefined;
  if (ids.length === 1 && ids[0] === "") return [];
  return new Set(ids).size === ids.length &&
    ids.every(id => id.length > 0 && !id.includes("\0")) ? ids : undefined;
}

function samePath(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

export function registerTreePage(host: ViewHost, current: Page["current"], write: Page["write"]): (beforeChange?: () => void) => void {
  const entries = new Map<string, Entry>();
  pages.set(host, { entries, current, write });
  host.signal.addEventListener("abort", () => pages.delete(host), { once: true });
  return beforeChange => {
    const params = new URLSearchParams(location.hash.slice(1));
    for (const [key, entry] of entries) {
      const path = readPath(params, key) ?? [];
      if (samePath(path, entry.path)) continue;
      beforeChange?.();
      beforeChange = undefined;
      entry.path = path;
      trackLoad(entry, entry.restore(path));
    }
  };
}

/** A linked list can bind while a lazy Tree is still showing the previous scope. */
function trackLoad(entry: Entry, load: void | Promise<void>): void {
  entry.pending = load || undefined;
  if (load) void load.then(() => { if (entry.pending === load) entry.pending = undefined; });
}

export function pendingTreePaths(host: ViewHost): Promise<unknown> | undefined {
  const pending = [...(pages.get(host)?.entries.values() ?? [])].flatMap(entry => entry.pending ?? []);
  if (pending.length) return Promise.all(pending);
}

export function treeHistory(host: ViewHost, id: string, restore: Entry["restore"], signal: AbortSignal) {
  const page = pages.get(host);
  if (!page) throw new TypeError("61ade: Tree history requires the current page host.");
  const key = "tree." + id;
  if (page.entries.has(key)) throw new TypeError("61ade: Tree history needs a unique tree id on the page.");
  const initial = readPath(new URLSearchParams(location.hash.slice(1)), key);
  const entry = { restore, path: initial ?? [] };
  page.entries.set(key, entry);
  signal.addEventListener("abort", () => page.entries.delete(key), { once: true });
  return {
    initial,
    loading: (load: Promise<void>) => trackLoad(entry, load),
    write(path: readonly string[], replace: boolean): void {
      if (signal.aborted || !page.current()) return;
      const url = new URL(location.href), params = new URLSearchParams(url.hash.slice(1));
      entry.path = [...path];
      const encoded = path.length ? path : [""];
      if (samePath(params.getAll(key), encoded)) return;
      params.delete(key);
      for (const node of encoded) params.append(key, node);
      url.hash = params.toString();
      page.write(url, replace);
    },
  };
}
