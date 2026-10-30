/**
 * Sign-in extension point (docs/shell.md#sign-in-modules): the restricted API a project's sign-in module receives on
 * the sign-in, e-mail confirmation and password-change pages. Runtime: `src/SignIn.ts`.
 *
 * Trust: a sign-in module is trusted project code like `modules`, on a page that holds the password field. The
 * restriction is the contract (no transport, identity, registries, CSRF token or form values), not isolation;
 * untrusted code never runs here (it belongs in `SandboxFrame`, and not on the sign-in pages).
 */

/** The signed-out page kind, equal to `data-blade-page` on `<html>`. */
export type SignInPage = "sign-in" | "confirmation" | "password-change";

/**
 * Default export of a sign-in module (`ApplicationDefinition::$signInModules`, JSON `application.sign_in_modules`).
 * The shell mounts the window first, then imports every declared module in parallel and calls the exports in
 * declaration order. A failed import, a missing default export, a throw, a rejection or more than 5 s (per import
 * and per call) is reported on the console and skipped; the sign-in always works.
 */
export type SignInModule = (app: SignInApplication) => void | Promise<void>;

/** The restricted application object of a signed-out page; one per page load (each page kind is its own load). */
export interface SignInApplication {
  /** Contract generation; the same value as `Application.apiVersion`. */
  readonly apiVersion: 1;
  /** Which signed-out page this is. */
  readonly page: SignInPage;
  /** The page's server-provided catalog (framework and project texts of the locale). */
  readonly i18n: SignInI18n;
  /** The applied factory theme (the signed-out pages never use skins). */
  readonly theme: SignInTheme;
  /** The DHTMLX Suite namespace the shell uses (same instances and theme state); never bundle a second Suite. */
  readonly dhx: typeof import("@dhtmlx/suite");
  /**
   * Empty elements inside the window: `header` above the form, `footer` below its fields (and the declared notice and
   * links) and above its actions, which stay at the window bottom. The window refits to their content.
   */
  readonly slots: SignInSlots;
}

export interface SignInI18n {
  /** Message for `key`, `{name}` placeholders from `params`; the key itself when no catalog has it. Plain text. */
  t(key: string, params?: Record<string, unknown>): string;
  /** Active locale code. A language switch reloads the page. */
  locale(): string;
}

export interface SignInTheme {
  /** `skyblue`, `light` or `dark`. */
  current(): string;
  /** Called after each theme switch until `signal` aborts. */
  onChange(listener: (theme: string) => void, options?: { signal?: AbortSignal }): void;
}

export interface SignInSlots {
  readonly header: HTMLElement;
  readonly footer: HTMLElement;
}
