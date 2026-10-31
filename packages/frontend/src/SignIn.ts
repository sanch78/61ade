import * as dhx from "@dhtmlx/suite";
import { t } from "./I18n";
import type { SignInApplication, SignInPage, SignInSlots } from "./api/sign-in";

/** Sign-in modules (docs/shell.md#sign-in-modules): the restricted application and its isolated loader. */
const LIMIT = 5000;
const listeners = new Set<(theme: string) => void>();
let current = "blade";

/** The shell's theme switch on a signed-out page (also the initial theme). */
export function signInThemeApplied(theme: string): void {
  current = theme;
  for (const listener of [...listeners]) {
    try { listener(theme); } catch (error) { console.error("61ade: sign-in theme listener failed", error); }
  }
}

export function signInApplication(page: SignInPage, locale: string, slots: SignInSlots): SignInApplication {
  return Object.freeze({
    apiVersion: 1 as const,
    page,
    i18n: Object.freeze({ t: (key: string, params?: Record<string, unknown>) => t(String(key), params ?? {}), locale: () => locale }),
    theme: Object.freeze({
      current: () => current,
      onChange(listener: (theme: string) => void, options: { signal?: AbortSignal } = {}) {
        if (typeof listener !== "function" || options.signal?.aborted) return;
        listeners.add(listener);
        options.signal?.addEventListener("abort", () => listeners.delete(listener), { once: true });
      },
    }),
    dhx,
    slots: Object.freeze({ header: slots.header, footer: slots.footer }),
  });
}

/**
 * Imports the modules in parallel and calls their default exports in declaration order. A failed import, a missing
 * default export, a throw, a rejection or more than 5 s is reported on the console and skipped.
 */
export async function loadSignInModules(app: SignInApplication, modules: readonly string[]): Promise<void> {
  const limited = <T>(work: Promise<T>, what: string) => {
    let timer = 0;
    return Promise.race([work, new Promise<never>((_, reject) => { timer = window.setTimeout(() => reject(new Error(`${what} exceeded ${LIMIT} ms`)), LIMIT); })])
      .finally(() => clearTimeout(timer));
  };
  const imports = modules.map(path => limited(import(/* @vite-ignore */ new URL(path, location.href).href) as Promise<{ default?: unknown }>, "import"));
  imports.forEach(loaded => loaded.catch(() => {}));
  for (const [index, module] of modules.entries()) {
    try {
      const main = (await imports[index]).default;
      if (typeof main !== "function") throw new TypeError("the module has no default export function");
      await limited(Promise.resolve().then(() => main(app)), "initialization");
    } catch (error) {
      console.error(`61ade: sign-in module ${module} failed`, error);
    }
  }
}
