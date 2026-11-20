import { Layout } from "@dhtmlx/suite";
import { t } from "../../I18n";
import { attachContent } from "../../api/services";
import type { MountTarget, StepDefinition, StepState, Steps as StepsApi, StepsOptions } from "../../api/types";
import { Component } from "../list/component";
import "./steps.css";

const ID = /^[a-z][a-z0-9_-]*$/;
const STATES: StepState[] = ["pending", "current", "done", "failed"];
const ICONS: Record<StepState, string> = { pending: "bi-circle", current: "bi-arrow-right-circle", done: "bi-check-circle-fill", failed: "bi-x-circle-fill" };
const TEXTS: Record<StepState, () => string> = { pending: () => t("várakozik"), current: () => t("folyamatban"), done: () => t("kész"), failed: () => t("sikertelen") };

/** Checks 1–20 steps (unique `[a-z][a-z0-9_-]*` ids, labels of 1–80 characters); throws `TypeError`. */
export function checkSteps(steps: unknown, owner = "Steps"): StepDefinition[] {
  const fail = (reason: string): never => { throw new TypeError(`61ade: ${owner}: ${reason}.`); };
  if (!Array.isArray(steps) || !steps.length || steps.length > 20) fail("steps is a list of 1 to 20 steps");
  const ids = new Set<string>();
  return (steps as unknown[]).map(step => {
    const value = (step && typeof step === "object" ? step : {}) as Record<string, unknown>;
    if (typeof value.id !== "string" || !ID.test(value.id) || ids.has(value.id)) fail(`step id "${String(value.id)}" is missing, invalid or repeated`);
    if (typeof value.label !== "string" || !value.label.trim() || value.label.length > 80) fail("a step label is text of 1 to 80 characters");
    ids.add(value.id as string);
    return { id: value.id as string, label: value.label as string };
  });
}

/**
 * A phase list (`app.components.Steps`, docs/toolkit.md#steps): an `<ol>` whose steps show their state by icon and a
 * visually hidden text, the current one `aria-current="step"`; a polite live region announces the current step. The
 * root is as tall as its steps.
 */
export class Steps extends Component<Record<string, never>> implements StepsApi {
  readonly layout: Layout;
  private readonly list = document.createElement("ol");
  private readonly live = document.createElement("div");
  private readonly items = new Map<string, { item: HTMLLIElement; state: StepState }>();
  private readonly release = new AbortController();
  private readonly steps: StepDefinition[];
  private readonly root: HTMLElement;

  constructor(options: StepsOptions) {
    super(options);
    if (!options || typeof options !== "object") throw new TypeError("61ade: Steps needs options.");
    this.steps = checkSteps(options.steps);
    if (typeof options.label !== "string" || !options.label.trim()) throw new TypeError("61ade: Steps: label is plain text.");
    if (options.current !== undefined && (typeof options.current !== "string" || !this.steps.some(step => step.id === options.current))) throw new TypeError("61ade: Steps: current names a declared step.");
    this.list.className = "blade-steps";
    this.list.setAttribute("aria-label", options.label);
    for (const step of this.steps) {
      const item = document.createElement("li"), label = document.createElement("span");
      label.className = "blade-steps__label";
      label.textContent = step.label;
      item.append(document.createElement("i"), label, document.createElement("span"));
      (item.lastChild as HTMLElement).className = "blade-visually-hidden";
      item.firstElementChild!.setAttribute("aria-hidden", "true");
      this.list.append(item);
      this.items.set(step.id, { item, state: "pending" });
      this.paint(step.id, "pending");
    }
    this.live.className = "blade-visually-hidden";
    this.live.setAttribute("aria-live", "polite");
    this.live.setAttribute("aria-atomic", "true");
    const root = document.createElement("div");
    root.append(this.list, this.live);
    this.root = root;
    this.layout = new Layout(this.host, { type: "none", css: "blade-steps-layout", rows: [{ id: "body", height: "content" }] } as any);
    if (options.current) this.setCurrent(options.current, false);
    this.bind(options.signal);
  }
  override mount(target: MountTarget): void {
    super.mount(target);
    if (this.destroyed) return;
    this.host.style.height = "auto";
    attachContent(this.layout.getCell("body"), this.root, this.release.signal);
  }

  current(id: string | null): void {
    if (this.destroyed) return;
    if (id !== null) this.known(id);
    this.setCurrent(id, true);
  }

  state(id: string, state: StepState): void {
    if (this.destroyed) return;
    this.known(id);
    if (!STATES.includes(state)) throw new TypeError("61ade: Steps: state is pending, current, done or failed.");
    if (state === "current") for (const [other, entry] of this.items) if (other !== id && entry.state === "current") this.paint(other, "pending");
    this.paint(id, state);
    this.announce(id, state);
  }

  states(): { id: string; state: StepState }[] { return this.steps.map(step => ({ id: step.id, state: this.items.get(step.id)!.state })); }

  private known(id: string): void { if (!this.items.has(id)) throw new Error(`61ade: Steps has no step "${id}".`); }

  private setCurrent(id: string | null, announce: boolean): void {
    const at = id === null ? this.steps.length : this.steps.findIndex(step => step.id === id);
    this.steps.forEach((step, index) => this.paint(step.id, index < at ? "done" : index === at ? "current" : "pending"));
    if (announce && id !== null) this.announce(id, "current");
  }

  private announce(id: string, state: StepState): void {
    if (state !== "current" && state !== "failed") return;
    this.live.textContent = this.steps.find(step => step.id === id)!.label + ": " + TEXTS[state]();
  }

  private paint(id: string, state: StepState): void {
    const entry = this.items.get(id)!, item = entry.item;
    entry.state = state;
    item.className = "blade-steps__item blade-steps__item--" + state;
    item.firstElementChild!.className = "bi " + ICONS[state];
    item.lastElementChild!.textContent = ", " + TEXTS[state]();
    if (state === "current") item.setAttribute("aria-current", "step"); else item.removeAttribute("aria-current");
  }

  protected dispose(): void { this.release.abort(); this.layout.destructor(); }
}
