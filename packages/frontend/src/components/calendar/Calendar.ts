import type { Application, CalendarComponent, CalendarComponentOptions, CalendarOptions, ComponentClass } from "../../api/types";
import { CalendarView, type CalendarViewDefinition } from "./CalendarView";
import { Facade, resolveView } from "../Facade";

const calendarOptions = (options: unknown): boolean => {
  const value = options as Partial<CalendarOptions> | null;
  return !!value && typeof value === "object" && Array.isArray(value.views) && Array.isArray(value.fields) && typeof value.default_view === "string";
};

/** The page's one live Calendar: DHTMLX Scheduler Standard has a single instance (O10). */
let active: CalendarFacade | undefined;

/**
 * Public `Calendar` (`app.components.Calendar`): the event calendar of a view whose resource offers the calendar
 * actions (`events`, `create`, `update`, `delete`), over `CalendarView`. Read-only when the actor is offered neither
 * `create` nor `update`. Only one Calendar exists per page; constructing a second one before the first is destroyed
 * throws. The built-in `calendar` view kind uses this class too.
 */
export class CalendarFacade extends Facade<Record<string, never>, CalendarView> implements CalendarComponent {
  constructor(app: Application, options: CalendarComponentOptions) {
    if (!options || typeof options !== "object") throw new TypeError("61ade: Calendar needs an options object.");
    if (active) throw new Error("61ade: only one Calendar can exist per page (DHTMLX Scheduler Standard); destroy the other one first.");
    const view = resolveView<CalendarOptions>(app, options.view, "Calendar", calendarOptions);
    super(options, container => new CalendarView(container, {
      kind: "calendar", resource: view.resource!, title: view.title, actions: view.actions, calendar: view.options,
    } as unknown as CalendarViewDefinition));
    if (!this.isDestroyed) active = this;
  }

  override destroy(): void {
    if (active === this) active = undefined;
    super.destroy();
  }
}

/** The `Calendar` class bound to one application (resolves view ids through it). */
export function bindCalendar(app: () => Application): ComponentClass<CalendarComponentOptions, CalendarComponent> {
  return class Calendar extends CalendarFacade {
    constructor(options: CalendarComponentOptions) { super(app(), options); }
  };
}
