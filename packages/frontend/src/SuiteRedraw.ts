import { Layout } from "@dhtmlx/suite";

/** Suite's view model (domvm): `render` draws the view, `_redraw` patches the page with that drawing. */
type ViewModel = { node: unknown; render: (...args: unknown[]) => unknown; _redraw: (...args: unknown[]) => unknown };
let installed = false;

/**
 * Drops the redraw of a destroyed Suite view (FB-0201). Suite redraws a changed view in the next animation frame
 * (`paint()`). A destroyed Layout draws nothing (`_root` is gone), nor does a destroyed form control (`config`), so a
 * redraw asked for in the frame that destroys it threw "Cannot read properties of null (reading 'type')": a closed
 * window is destroyed one frame after it hides, and a viewport resize in that frame repaints its form-row cells first.
 * A view that draws nothing keeps its last drawing, so domvm patches nothing.
 */
export function installRedrawGuard(): void {
  if (installed) return;
  installed = true;
  // The prototype every Suite view model shares, from a layout that is never shown.
  const probe = new Layout(null as unknown as HTMLElement, {});
  const proto = Object.getPrototypeOf(probe.getRootView()) as ViewModel;
  probe.destructor();
  const redraw = proto._redraw;
  proto._redraw = function (this: ViewModel, ...args: unknown[]) {
    const render = this.render;
    this.render = function (this: ViewModel, ...input: unknown[]) { return render.apply(this, input) ?? this.node; };
    try { return redraw.apply(this, args); } finally { this.render = render; }
  };
}
