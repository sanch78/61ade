/**
 * The shell address (toolkit K-F4): `#view=<id>[&record=<id>][&filter.<field>=<value>]`. `#feature=<resource>` is the
 * legacy alias of `#view=<resource>` (delivered e-mails use it); the shell rewrites it with `history.replaceState`.
 */
export type Route = {
  /** View id; `undefined` for an empty address. */
  view?: string;
  record?: string;
  /** `filter.<field>` presets, applied once. */
  filters: Record<string, string>;
  /** The address used `feature=` and must be rewritten to `canonical`. */
  legacy: boolean;
  /** The same address with `feature=` renamed to `view=` (other parameters and their order kept). */
  canonical: string;
};

export function parseRoute(hash: string): Route {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const legacy = !params.has("view") && params.has("feature");
  const filters: Record<string, string> = {};
  const canonical = new URLSearchParams();
  params.forEach((value, key) => {
    if (key.startsWith("filter.") && key.length > "filter.".length) filters[key.slice("filter.".length)] = value;
    if (key === "feature" && !legacy) return;
    canonical.append(key === "feature" ? "view" : key, value);
  });
  return { view: (legacy ? params.get("feature") : params.get("view")) || undefined, record: params.get("record") || undefined, filters, legacy, canonical: canonical.toString() };
}

/** The fragment (without `#`) of a navigation; filters only when given. */
export function routeHash(target: { view: string; record?: string; filters?: Record<string, string> }): string {
  const params = new URLSearchParams({ view: target.view });
  if (target.record !== undefined) params.set("record", target.record);
  for (const [field, value] of Object.entries(target.filters ?? {})) params.set("filter." + field, value);
  return params.toString();
}
