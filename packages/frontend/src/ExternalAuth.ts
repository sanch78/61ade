import { t } from "./I18n";

type Handler = { ready?: boolean; login: (notice?: boolean) => void; setProviderRedirectGetQuery: (query: string | null) => void };
const instances = new WeakMap<Element, Modal>();

/**
 * Minimal Bootstrap 5 Modal contract (constructor, show, hide, getInstance, getOrCreateInstance,
 * data-bs-dismiss, data-bs-backdrop="static", data-bs-keyboard="false", the `fade` entrance) for the _AuthHandler overlay.
 * Installed only when the page has no Bootstrap, so the global Bootstrap stylesheet never reaches
 * the DHTMLX interface.
 */
class Modal {
  private backdrop?: HTMLElement;
  private keys = (event: KeyboardEvent) => { if (event.key === "Escape" && this.element.dataset.bsKeyboard !== "false") this.hide(); };
  constructor(private element: HTMLElement) {
    instances.set(element, this);
    element.addEventListener("click", event => {
      const target = event.target as HTMLElement;
      if ((target === element && element.dataset.bsBackdrop !== "static") || target.closest('[data-bs-dismiss="modal"]')) this.hide();
    });
  }
  static getInstance(element: Element | null): Modal | null { return element ? instances.get(element) ?? null : null; }
  static getOrCreateInstance(element: HTMLElement): Modal { return instances.get(element) ?? new Modal(element); }
  show(): void {
    this.element.dispatchEvent(new Event("show.bs.modal"));
    this.backdrop ??= Object.assign(document.createElement("div"), { className: "blade-external-backdrop" });
    // DHTMLX raises window layers dynamically: stack above the highest one at opening time.
    const top = Math.max(1000, ...Array.from(document.body.children, node => Number.parseInt(getComputedStyle(node).zIndex, 10) || 0));
    this.backdrop.style.zIndex = String(top + 1);
    this.element.style.zIndex = String(top + 2);
    document.body.append(this.backdrop);
    if (this.element.parentElement !== document.body) document.body.append(this.element);
    this.element.style.display = "block";
    // Bootstrap's `fade`: the hidden state renders once, so `.show` runs the entrance transition (admin.css).
    void this.element.offsetHeight;
    this.backdrop.classList.add("show");
    this.element.classList.add("show");
    this.element.setAttribute("aria-modal", "true");
    this.element.setAttribute("role", "dialog");
    document.addEventListener("keydown", this.keys);
    requestAnimationFrame(() => this.element.querySelector<HTMLElement>("button, input")?.focus());
    this.element.dispatchEvent(new Event("shown.bs.modal"));
  }
  hide(): void {
    this.element.classList.remove("show");
    this.backdrop?.classList.remove("show");
    this.element.style.display = "none";
    this.backdrop?.remove();
    document.removeEventListener("keydown", this.keys);
    this.element.dispatchEvent(new Event("hidden.bs.modal"));
  }
}

const scope = window as unknown as { bootstrap?: { Modal?: unknown }; authHandler?: Handler };
if (!scope.bootstrap?.Modal) scope.bootstrap = { ...scope.bootstrap, Modal };

/** Opens AuthHandler's own provider overlay; the provider round trip returns to the 61ade page. */
export function openExternalSignIn(remember: boolean): boolean {
  const handler = scope.authHandler;
  if (!handler) return false;
  handler.setProviderRedirectGetQuery(remember ? "blade_remember=1" : null);
  handler.login();
  return true;
}
/**
 * OAuth-only sign-in (docs/authentication.md#oauth-only-sign-in): AuthHandler's overlay is the sign-in window. It
 * stays open until sign-in unless a close destination is declared. `decorate` adds the application's content once.
 */
export async function openExclusiveSignIn(decorate: (content: HTMLElement) => void, signal?: AbortSignal, closeHref?: string): Promise<boolean> {
  const handler = scope.authHandler;
  if (!handler) return false;
  // AuthHandler initializes asynchronously after its bootstrap script.
  for (const started = Date.now(); !handler.ready; await new Promise(resolve => setTimeout(resolve, 20)))
    if (signal?.aborted || Date.now() - started > 5000) return false;
  if(signal?.aborted)return false;
  handler.setProviderRedirectGetQuery(null);
  // The overlay and its backdrop start below the top row, whose language and theme selectors stay usable (admin.css).
  document.documentElement.dataset.bladeExclusiveSignIn = "";
  handler.login();
  const modal = document.getElementById("authhandler-login-modal");
  const content = modal?.querySelector<HTMLElement>(".modal-content");
  if (!modal || !content) return false;
  Object.assign(modal.dataset, { bsBackdrop: "static", bsKeyboard: "false" });
  const close = modal.querySelector<HTMLButtonElement>(".modal-header .btn-close");
  if (closeHref && close) {
    close.removeAttribute("data-bs-dismiss");
    close.setAttribute("aria-label", t("Bezárás"));
    close.addEventListener("click", () => location.assign(closeHref), { signal });
  } else close?.remove();
  decorate(content);
  // The page's own Bootstrap reads those options only once: if it still closes the overlay, it opens again.
  const reopen=()=>setTimeout(()=>{if(!signal?.aborted)handler.login();});
  modal.addEventListener("hidden.bs.modal",reopen);
  signal?.addEventListener("abort",()=>{
    modal.removeEventListener("hidden.bs.modal",reopen);
    delete document.documentElement.dataset.bladeExclusiveSignIn;
    (scope.bootstrap?.Modal as typeof Modal)?.getInstance(modal)?.hide();
  },{once:true});
  return true;
}
export const externalSignInUnavailable = () => t("A külső belépés most nem érhető el. Próbáld újra később.");
