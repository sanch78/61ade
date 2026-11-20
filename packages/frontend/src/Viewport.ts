/** The page's one width breakpoint (docs/toolkit.md#viewport): phone layout below it, the CSS `(max-width: 767px)`. */
export const BREAKPOINT = 768;

let query: MediaQueryList | undefined;
/** The one media query of the breakpoint, created on first use (none without `matchMedia`). */
function media(): MediaQueryList | undefined {
  if (!query && typeof matchMedia === "function") query = matchMedia(`(max-width: ${BREAKPOINT - 1}px)`);
  return query;
}

/** Whether the viewport is below 768 px now (read at call time). */
export function narrow(): boolean {
  const list = media();
  return list ? list.matches : innerWidth < BREAKPOINT;
}

/** Calls $handler with the new state each time the viewport crosses 768 px, until $signal aborts. */
export function onViewport(handler: (narrow: boolean) => void, signal?: AbortSignal): void {
  if (signal?.aborted) return;
  media()?.addEventListener("change", event => handler(event.matches), { signal });
}
