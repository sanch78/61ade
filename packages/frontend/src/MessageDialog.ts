import { t } from "./I18n";

/** Semantics of a message; independent of how the user answers it. */
export type DialogSeverity = "neutral" | "warning" | "danger";
/** `acknowledge`: one OK button. `confirm`: Confirm + Cancel. */
export type DialogMode = "acknowledge" | "confirm";
export type DialogOptions = {
  message: string;
  title?: string;
  severity?: DialogSeverity;
  mode?: DialogMode;
  okLabel?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Confirm mode only. Default: `cancel` for danger, `confirm` otherwise. Never overridable to confirm for danger. */
  initialFocus?: "confirm" | "cancel";
};
/** One answer of a multiple-choice dialog; Cancel is always added and resolves `null`. */
export type DialogChoice = { value: string; label: string };
/** Shape of the former DHTMLX alert()/confirm() properties, accepted by the compatibility wrappers. */
export type LegacyDialogOptions = { text: string; header?: string; buttons?: string[]; htmlEnable?: boolean; severity?: DialogSeverity };

// Distinct glyph per severity so meaning never depends on colour alone.
const ICONS: Record<DialogSeverity, string> = {
  neutral: '<circle cx="12" cy="12" r="10"/><path d="M12 11v6M12 7.2v.1" stroke-width="2.4"/>',
  warning: '<path d="M12 3 22 20H2z"/><path d="M12 9.5v5M12 17.2v.1" stroke-width="2.4"/>',
  danger: '<path d="M8 2h8l6 6v8l-6 6H8l-6-6V8z"/><path d="m9 9 6 6M15 9l-6 6" stroke-width="2.4"/>',
};
const open: { node: HTMLElement; close: (value: boolean | string, escaped?: boolean) => void }[] = [];

const severityLabel = (s: DialogSeverity) => s === "danger" ? t("Hiba") : s === "warning" ? t("Figyelmeztetés") : t("Információ");

/**
 * Modal alert/confirm dialog for every 61de caller. Resolves `true` for OK/Confirm and `false` for Cancel.
 * Keyboard: Tab/Shift+Tab stay inside the dialog; Enter activates only the focused button;
 * Escape = OK in acknowledgement mode and always Cancel (false) in confirm mode; a backdrop click does nothing.
 * Danger confirmations start on Cancel, so a stray Enter never confirms.
 */
export function showDialog(options: DialogOptions): Promise<boolean> {
  return present(options) as Promise<boolean>;
}

/** Choice mode: the given answers plus Cancel; Escape and Cancel resolve `null`, focus starts on Cancel. */
export function requestChoice(options: Omit<DialogOptions, "mode" | "confirmLabel" | "initialFocus"> & { choices: DialogChoice[] }): Promise<string | null> {
  return present({ ...options, mode: "confirm", initialFocus: "cancel" }, options.choices).then(value => typeof value === "string" ? value : null);
}

function present(options: DialogOptions, choices?: DialogChoice[]): Promise<boolean | string> {
  const severity = options.severity ?? "neutral", confirmMode = options.mode === "confirm";
  const title = options.title || (severity === "danger" ? (confirmMode ? t("Veszélyes művelet") : t("Hiba")) : severity === "warning" ? t("Figyelmeztetés") : confirmMode ? t("Megerősítés") : t("Információ"));
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const id = `blade-dialog-${Math.random().toString(36).slice(2)}`;

  const overlay = document.createElement("div");
  overlay.className = "blade-dialog-overlay";
  const box = document.createElement("div");
  box.className = `dhx_widget blade-dialog blade-dialog--${severity} blade-dialog--${options.mode ?? "acknowledge"}`;
  box.setAttribute("role", "alertdialog");
  box.setAttribute("aria-modal", "true");
  box.setAttribute("aria-labelledby", `${id}-title`);
  box.setAttribute("aria-describedby", `${id}-message`);
  box.tabIndex = -1;

  const header = document.createElement("div");
  header.className = "blade-dialog__header";
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("class", "blade-dialog__icon");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("role", "img");
  icon.setAttribute("aria-label", severityLabel(severity));
  icon.innerHTML = ICONS[severity];
  const heading = document.createElement("h2");
  heading.className = "blade-dialog__title";
  heading.id = `${id}-title`;
  heading.textContent = title;
  header.append(icon, heading);

  const body = document.createElement("div");
  body.className = "blade-dialog__body";
  body.id = `${id}-message`;
  body.textContent = options.message;

  const footer = document.createElement("div");
  footer.className = "blade-dialog__footer";
  const button = (label: string, kind: "primary" | "cancel" | "choice") => {
    const node = document.createElement("button");
    node.type = "button";
    node.textContent = label;
    node.className = `dhx_button dhx_button--size_medium blade-dialog__button blade-dialog__button--${kind} ` +
      (kind === "cancel" ? "dhx_button--view_link dhx_button--color_primary" : kind === "choice" ? "dhx_button--view_flat dhx_button--color_secondary" : `dhx_button--view_flat dhx_button--color_${severity === "danger" ? "danger" : "primary"}`);
    return node;
  };
  const primary = button(confirmMode ? (options.confirmLabel || t("Megerősítés")) : (options.okLabel || t("Rendben")), "primary");
  primary.dataset.bladeDialogAction = confirmMode ? "confirm" : "ok";
  const cancel = confirmMode ? button(options.cancelLabel || t("Mégse"), "cancel") : null;
  if (cancel) cancel.dataset.bladeDialogAction = "cancel";
  const answers = (choices ?? []).map((choice, index) => {
    const node = button(choice.label, index ? "choice" : "primary");
    node.dataset.bladeDialogAction = "choice:" + choice.value;
    return node;
  });
  footer.append(...(choices ? [cancel!, ...answers] : cancel ? [cancel, primary] : [primary]));

  box.append(header, body, footer);
  overlay.append(box);

  return new Promise<boolean | string>(resolve => {
    // Everything behind the dialog becomes inert; restored in LIFO order for stacked dialogs.
    const inerted = Array.from(document.body.children).filter(node => node !== overlay && !node.hasAttribute("inert"));
    let done = false;
    const entry = {
      node: overlay,
      close: (value: boolean | string) => {
        if (done) return;
        done = true;
        document.removeEventListener("keydown", keydown, true);
        overlay.remove();
        inerted.forEach(node => node.removeAttribute("inert"));
        open.splice(open.indexOf(entry), 1);
        if (previous?.isConnected) previous.focus({ preventScroll: true });
        resolve(value);
      },
    };
    const focusables = () => {
      const list = Array.from(footer.querySelectorAll<HTMLElement>("button"));
      return body.scrollHeight > body.clientHeight ? [body, ...list] : list;
    };
    // The key press that opened the dialog (e.g. Enter committing an inline edit) must not
    // also activate its focused button: keyboard clicks count only after a new key press.
    let pressed = false;
    const activate = (value: boolean | string) => (event: MouseEvent) => { if (event.detail > 0 || pressed) entry.close(value); };
    const keydown = (event: KeyboardEvent) => {
      if (open[open.length - 1] !== entry) return;
      pressed = true;
      if (event.key === "Escape" || event.key === "Esc") {
        event.preventDefault();
        event.stopImmediatePropagation();
        entry.close(!confirmMode);
      } else if (event.key === "Tab") {
        const list = focusables(), index = list.indexOf(document.activeElement as HTMLElement);
        if (!list.length) return;
        const next = event.shiftKey ? (index <= 0 ? list.length - 1 : index - 1) : (index < 0 || index === list.length - 1 ? 0 : index + 1);
        event.preventDefault();
        list[next].focus();
      } else if (event.key === "Enter" && !(document.activeElement instanceof HTMLButtonElement)) {
        // Enter never reaches a button the user has not focused.
        event.preventDefault();
      }
    };
    primary.addEventListener("click", activate(true));
    answers.forEach((node, index) => node.addEventListener("click", activate(choices![index].value)));
    cancel?.addEventListener("click", activate(false));
    open.push(entry);
    inerted.forEach(node => node.setAttribute("inert", ""));
    document.addEventListener("keydown", keydown, true);
    document.body.append(overlay);
    const focusCancel = confirmMode && (severity === "danger" || options.initialFocus === "cancel");
    (focusCancel && cancel ? cancel : primary).focus({ preventScroll: true });
    // Long messages scroll inside the body; make that region reachable by keyboard.
    if (body.scrollHeight > body.clientHeight) { body.tabIndex = 0; body.setAttribute("role", "document"); }
  });
}

export const acknowledge = (options: Omit<DialogOptions, "mode">) => showDialog({ ...options, mode: "acknowledge" });

/** Static, non-modal markup with the dialog look (header, glyph, message) for an in-place notice. */
export function noticeMarkup(options: { title: string; message: string; severity?: DialogSeverity }): string {
  const severity = options.severity ?? "neutral", box = document.createElement("div");
  box.className = `dhx_widget blade-dialog blade-dialog--${severity} blade-notice`;
  box.setAttribute("role", "status");
  const header = document.createElement("div"), heading = document.createElement("h2"), body = document.createElement("div");
  header.className = "blade-dialog__header";
  header.innerHTML = `<svg class="blade-dialog__icon" viewBox="0 0 24 24" role="img">${ICONS[severity]}</svg>`;
  header.firstElementChild!.setAttribute("aria-label", severityLabel(severity));
  heading.className = "blade-dialog__title"; heading.textContent = options.title;
  body.className = "blade-dialog__body"; body.textContent = options.message;
  header.append(heading); box.append(header, body);
  return box.outerHTML;
}
export const requestConfirmation = (options: Omit<DialogOptions, "mode">) => showDialog({ ...options, mode: "confirm" });
/** Closes every open dialog as dismissed (Cancel/OK); used when the owning view is destroyed. */
export const closeDialogs = () => [...open].reverse().forEach(entry => entry.close(false));

const legacy = (o: LegacyDialogOptions, mode: DialogMode): DialogOptions => ({
  message: o.text, title: o.header, severity: o.severity, mode,
  ...(mode === "confirm" ? { cancelLabel: o.buttons?.[1], confirmLabel: o.buttons?.[0] } : { okLabel: o.buttons?.[0] }),
});
/** Drop-in replacement for the DHTMLX alert(): `{header,text,buttons,htmlEnable}` plus optional `severity`. Text is always rendered as plain text. */
export const alert = (o: LegacyDialogOptions) => showDialog(legacy(o, "acknowledge"));
/** Drop-in replacement for the DHTMLX confirm(): `buttons: [apply, reject]`. */
export const confirm = (o: LegacyDialogOptions) => showDialog(legacy(o, "confirm"));
