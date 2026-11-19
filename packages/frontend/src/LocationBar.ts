import { t } from "./I18n";
import { popupMenu } from "./PopupMenu";
import type { PopupMenu } from "./api/types";
import "./location-bar.css";

/** One drawn level: a link (`href`), a button for a place inside the page (`select`) or plain text; the last is current. */
export type Place = { label: string; icon?: string; href?: string; select?: () => void };

/** Below this bar width only the parent and the current level show (docs/shell.md#location-bar). */
const PHONE = 768;

/**
 * The shell's location bar below the menu row (docs/shell.md#location-bar): `<nav>` named `Hely` with an ordered list
 * of the levels, `›` between them (CSS, not spoken), the last one `aria-current="page"`. Where the levels do not fit,
 * the middle ones (never the first or the current) collapse into one `…` button that opens a 61ade popup menu with
 * them in order; below 768 px only the parent (as a back link) and the current level show, the rest in that menu.
 * The natural widths are measured once per path, so a resize only redraws when the collapsed set changes.
 */
export class LocationBar {
  readonly element = document.createElement("nav");
  private list = document.createElement("ol");
  private places: Place[] = [];
  private hidden: number[] = [];
  private widths: number[] = [];
  private moreWidth = 0;
  private state = "";
  private more?: PopupMenu;

  constructor(signal: AbortSignal) {
    this.element.className = "blade-location";
    this.element.setAttribute("aria-label", t("Hely"));
    this.list.className = "blade-location__list";
    this.element.append(this.list);
    const resize = new ResizeObserver(() => this.fit());
    resize.observe(this.element);
    signal.addEventListener("abort", () => { resize.disconnect(); this.more?.destroy(); }, { once: true });
  }

  /**
   * Shows $places, the last one the current level. None leaves the line empty and hides the `<nav>` from assistive
   * technology until levels return (docs/shell.md#location-bar-own-path).
   */
  show(places: Place[]): void {
    this.places = places;
    this.widths = [];
    this.state = "";
    if (places.length) this.element.removeAttribute("aria-hidden");
    else this.element.setAttribute("aria-hidden", "true");
    this.fit();
  }

  /** Collapses for the bar's width; nothing while the bar is hidden (no width), the observer fits it once shown. */
  fit(): void {
    const width = this.element.clientWidth, last = this.places.length - 1;
    if (last < 0) { if (this.state !== "empty") { this.state = "empty"; this.draw([], false); } return; }
    if (!width) return;
    const phone = width < PHONE, hidden: number[] = [];
    if (phone) for (let index = 0; index < last - 1; index++) hidden.push(index);
    else {
      if (!this.widths.length) this.measure();
      const room = this.list.clientWidth;
      let used = this.widths.reduce((sum, value) => sum + value, 0);
      for (let index = 1; index < last && used > room; index++) {
        used -= this.widths[index];
        if (!hidden.length) used += this.moreWidth;
        hidden.push(index);
      }
    }
    const state = JSON.stringify([phone, hidden]);
    if (state !== this.state) { this.state = state; this.draw(hidden, phone); }
  }

  /** Every level and a `…` button at their natural widths (separators included). */
  private measure(): void {
    this.draw([], false, true);
    const items = Array.from(this.list.children) as HTMLElement[];
    this.moreWidth = Math.ceil(items.pop()!.getBoundingClientRect().width);
    this.widths = items.map(item => Math.ceil(item.getBoundingClientRect().width));
    this.list.classList.remove("blade-location__list--measure");
  }

  private draw(hidden: number[], phone: boolean, measuring = false): void {
    this.more?.destroy();
    this.more = undefined;
    this.hidden = hidden;
    this.list.replaceChildren();
    this.list.classList.toggle("blade-location__list--measure", measuring);
    this.element.classList.toggle("blade-location--phone", phone);
    const last = this.places.length - 1;
    this.places.forEach((place, index) => {
      if (hidden.includes(index)) { if (index === hidden[0]) this.list.append(this.moreItem()); return; }
      const item = document.createElement("li");
      item.className = "blade-location__item";
      item.append(this.placeElement(place, index === last, phone && index === last - 1));
      this.list.append(item);
    });
    if (measuring) this.list.append(this.moreItem(true));
  }

  private placeElement(place: Place, current: boolean, back: boolean): HTMLElement {
    const element = current ? document.createElement("span") : place.href ? document.createElement("a") : place.select ? document.createElement("button") : document.createElement("span");
    element.className = current ? "blade-location__place blade-location__place--current" : place.href || place.select ? "blade-location__place blade-location__link" : "blade-location__place";
    if (current) element.setAttribute("aria-current", "page");
    else if (element instanceof HTMLAnchorElement) element.href = place.href!;
    else if (element instanceof HTMLButtonElement) {
      element.type = "button";
      element.addEventListener("click", () => this.activate(place));
    }
    if (back) element.classList.add("blade-location__back");
    const icon = back && (place.href || place.select) ? "bi bi-chevron-left" : place.icon;
    if (icon) {
      const mark = document.createElement("span");
      mark.className = "blade-location__icon " + icon;
      mark.setAttribute("aria-hidden", "true");
      element.append(mark);
    }
    const label = document.createElement("span");
    label.className = "blade-location__label";
    label.textContent = place.label;
    element.append(label);
    element.title = place.label;
    return element;
  }

  /** The `…` button of the collapsed levels (`További szintek`), with its popup menu. */
  private moreItem(probe = false): HTMLElement {
    const item = document.createElement("li"), button = document.createElement("button");
    item.className = "blade-location__item blade-location__item--more";
    button.type = "button";
    button.className = "blade-location__place blade-location__link blade-location__more";
    button.textContent = "…";
    button.title = t("További szintek");
    button.setAttribute("aria-label", t("További szintek"));
    item.append(button);
    if (probe) return item;
    const menu = this.more = popupMenu(button, { label: t("További szintek"), items: () => this.hidden.map(index => {
      const place = this.places[index];
      return { id: "place:" + index, label: place.label, ...(place.icon ? { icon: place.icon } : {}), disabled: !place.href && !place.select };
    }) });
    menu.on("select", ({ id }) => { const place = this.places[Number(id.slice(6))]; if (place) this.activate(place); });
    return item;
  }

  private activate(place: Place): void {
    if (place.href) { location.assign(place.href); return; }
    try { place.select?.(); } catch (error) { console.error(error); }
  }
}
