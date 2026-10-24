import { t } from "./I18n";

type Handler = { login: (notice?: boolean) => void; setProviderRedirectGetQuery: (query: string | null) => void };
const instances = new WeakMap<Element, Modal>();

/**
 * Minimal Bootstrap 5 Modal contract (constructor, show, hide, getInstance, getOrCreateInstance,
 * data-bs-dismiss) for the _AuthHandler overlay. Installed only when the page has no Bootstrap,
 * so the global Bootstrap stylesheet never reaches the DHTMLX interface.
 */
class Modal {
  private backdrop?: HTMLElement;
  private keys = (event: KeyboardEvent) => { if (event.key === "Escape") this.hide(); };
  constructor(private element: HTMLElement) {
    instances.set(element, this);
    element.addEventListener("click", event => {
      const target = event.target as HTMLElement;
      if (target === element || target.closest('[data-bs-dismiss="modal"]')) this.hide();
    });
  }
  static getInstance(element: Element | null): Modal | null { return element ? instances.get(element) ?? null : null; }
  static getOrCreateInstance(element: HTMLElement): Modal { return instances.get(element) ?? new Modal(element); }
  show(): void {
    this.backdrop ??= Object.assign(document.createElement("div"), { className: "blade-external-backdrop" });
    // DHTMLX raises window layers dynamically: stack above the highest one at opening time.
    const top = Math.max(1000, ...Array.from(document.body.children, node => Number.parseInt(getComputedStyle(node).zIndex, 10) || 0));
    this.backdrop.style.zIndex = String(top + 1);
    this.element.style.zIndex = String(top + 2);
    document.body.append(this.backdrop);
    if (this.element.parentElement !== document.body) document.body.append(this.element);
    this.element.style.display = "block";
    this.element.classList.add("show");
    this.element.setAttribute("aria-modal", "true");
    this.element.setAttribute("role", "dialog");
    document.addEventListener("keydown", this.keys);
    requestAnimationFrame(() => this.element.querySelector<HTMLElement>("button, input")?.focus());
    this.element.dispatchEvent(new Event("shown.bs.modal"));
  }
  hide(): void {
    this.element.classList.remove("show");
    this.element.style.display = "none";
    this.backdrop?.remove();
    document.removeEventListener("keydown", this.keys);
    this.element.dispatchEvent(new Event("hidden.bs.modal"));
  }
}

const scope = window as unknown as { bootstrap?: { Modal?: unknown }; authHandler?: Handler };
if (!scope.bootstrap?.Modal) scope.bootstrap = { ...scope.bootstrap, Modal };

/** Opens AuthHandler's own provider overlay; the provider round trip returns to the 61de page. */
export function openExternalSignIn(remember: boolean): boolean {
  const handler = scope.authHandler;
  if (!handler) return false;
  handler.setProviderRedirectGetQuery(remember ? "blade_remember=1" : null);
  handler.login();
  return true;
}
export const externalSignInUnavailable = () => t("A külső belépés most nem érhető el. Próbáld újra később.");
