let standardHeight = 44;
let navigationHeight = standardHeight;

/** Read application-level sizing once before creating the shell and its Layouts. */
export function configureHeaderRows(): void {
  const root = document.documentElement;
  const style = getComputedStyle(root);
  const pixels = (name: string): number | undefined => {
    const match = /^(\d+)px$/.exec(style.getPropertyValue(name).trim());
    const value = Number(match?.[1]);
    return Number.isSafeInteger(value) && value > 0 ? value : undefined;
  };
  standardHeight = pixels("--blade-header-row-height") ?? standardHeight;
  navigationHeight = pixels("--blade-navigation-height") ?? standardHeight;
  root.style.setProperty("--blade-header-row-size", `${standardHeight}px`);
  root.style.setProperty("--blade-navigation-row-size", `${navigationHeight}px`);
}

export function headerRowHeight(override?: number, option = "headerHeight"): number {
  if (override === undefined) return standardHeight;
  if (!Number.isSafeInteger(override) || override < 1) throw new TypeError(`61ade: ${option} must be a positive integer in CSS pixels.`);
  return override;
}

export function navigationRowHeight(): number {
  return navigationHeight;
}
