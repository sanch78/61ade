import { awaitRedraw } from "@dhtmlx/suite";
import { openWindow } from "../../api/services";
import type { ProgressDialog, ProgressOptions, StepState } from "../../api/types";
import { Steps, checkSteps } from "./Steps";

const invalid = (reason: string) => new TypeError("61ade: ui.progress: " + reason + ".");
const percentOf = (value: unknown): number | null => {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) throw invalid("percent is a number from 0 to 100 or null");
  return value;
};

/**
 * A blocking progress dialog (`app.ui.progress`, docs/dialogs.md#progress): a modal framework window without a close
 * button or Escape, holding the message (`role="status"`), a native `<progress>` and the optional `Steps`. While it is
 * open a `beforeunload` guard asks before the tab is left. The dialog itself takes the focus; closing it gives the
 * focus back (ModalWindows).
 */
export function openProgress(options: ProgressOptions): ProgressDialog {
  if (!options || typeof options !== "object") throw invalid("needs options");
  for (const key of ["title", "message"] as const) if (typeof options[key] !== "string" || !options[key].trim()) throw invalid(key + " is plain text");
  const steps = options.steps === undefined ? undefined : checkSteps(options.steps, "ui.progress");
  const start = options.percent === undefined ? null : percentOf(options.percent);
  if (start === null && options.percent === null) throw invalid("percent is a number from 0 to 100");
  if (options.signal !== undefined && !(options.signal instanceof AbortSignal)) throw invalid("signal is an AbortSignal");

  const root = document.createElement("div"), text = document.createElement("p"), bar = document.createElement("progress");
  root.className = "blade-progress";
  root.tabIndex = -1;
  text.className = "blade-progress__message";
  text.setAttribute("role", "status");
  text.setAttribute("aria-live", "polite");
  text.textContent = options.message;
  bar.className = "blade-progress__bar";
  bar.max = 100;
  bar.setAttribute("aria-label", options.title);
  const percent = (value: number | null) => { if (value === null) bar.removeAttribute("value"); else bar.value = value; };
  percent(start);
  root.append(text, bar);

  const win = openWindow({ title: options.title, modal: true, closable: false, fit: true, width: 420, height: 200, resizable: false });
  const list = steps && new Steps({ steps, label: options.title, current: steps[0].id, signal: win.signal });
  if (list) { const place = document.createElement("div"); root.append(place); list.mount(place); }
  win.attach(root);
  void awaitRedraw().then(() => { if (!win.signal.aborted) { void win.fit(); root.focus({ preventScroll: true }); } });
  // The browser's leave confirmation, as the uploader's while it sends files; one handler per dialog, so closing one
  // dialog keeps the guard of another that is still open.
  const leaving = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
  addEventListener("beforeunload", leaving);
  win.signal.addEventListener("abort", () => removeEventListener("beforeunload", leaving), { once: true });
  if (options.signal?.aborted) win.close();
  else options.signal?.addEventListener("abort", () => win.close(), { once: true, signal: win.signal });

  const step = (id: string, state?: StepState) => {
    if (!list) throw new Error(`61ade: ui.progress has no step "${id}".`);
    if (state === undefined) list.current(id); else list.state(id, state);
  };
  return {
    signal: win.signal,
    message(value) { if (!win.signal.aborted) text.textContent = String(value); },
    percent(value) { if (!win.signal.aborted) percent(percentOf(value)); },
    step: id => step(id),
    state: (id, state) => step(id, state),
    close: () => win.close(),
  };
}
