import light from "../brand/blade-logo.svg";
import dark from "../brand/blade-logo-dark.svg";

/** Instance counter: the gradient ids of every inlined copy are unique on the page. */
let instances = 0;

/**
 * Inline markup of the 61ade product logo (docs/brand.md), bundled from `packages/frontend/brand`: both variants
 * (CSS shows the one of the applied base theme), ids made unique per call, each SVG hidden from assistive technology
 * (the surrounding logo element carries the name). Inline, so CSS can address its parts (`.blade-logo__mark`, …).
 */
export function brandLogo(): string {
  const prefix = `blade-${++instances}-`;
  const inline = (svg: string, variant: "light" | "dark") => svg
    .replace(/<!--[\s\S]*?-->\s*/g, "")
    .replace(`class="blade-logo blade-logo--${variant}"`, `class="blade-logo__image blade-logo__image--${variant}"`)
    .replace(' role="img" aria-label="blade"', ' aria-hidden="true" focusable="false"')
    .replace(/id="blade-/g, `id="${prefix}`)
    .replace(/url\(#blade-/g, `url(#${prefix}`)
    .trim();
  return inline(light, "light") + inline(dark, "dark");
}
