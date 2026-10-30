/** The shell address (toolkit K-F4): `#view=<id>[&record=<id>][&filter.<field>=<value>]`. */
export type Route = {
  /** View id; `undefined` for an empty address. */
  view?: string;
  record?: string;
  /** `filter.<field>` presets, applied once. */
  filters: Record<string, string>;
};

export function parseRoute(hash: string): Route {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const filters: Record<string, string> = {};
  params.forEach((value, key) => {
    if (key.startsWith("filter.") && key.length > "filter.".length) filters[key.slice("filter.".length)] = value;
  });
  return { view: params.get("view") || undefined, record: params.get("record") || undefined, filters };
}

/** The fragment (without `#`) of a navigation; filters only when given. */
export function routeHash(target: { view: string; record?: string; filters?: Record<string, string> }): string {
  const params = new URLSearchParams({ view: target.view });
  if (target.record !== undefined) params.set("record", target.record);
  for (const [field, value] of Object.entries(target.filters ?? {})) params.set("filter." + field, value);
  return params.toString();
}
