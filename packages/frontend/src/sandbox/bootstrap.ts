import { startSandbox } from "./runtime";

/**
 * `dist/sandbox.js`, the classic script of `dist/sandbox.html` inside `<iframe sandbox="allow-scripts">`. The delivered
 * code runs from a `blob:` script of this opaque-origin document only (toolkit O7).
 */
startSandbox({
  self: window,
  origin: self.origin,
  parent: window.parent,
  global: window as unknown as Record<string, unknown>,
  on: (type, handler) => window.addEventListener(type, handler),
  objectUrl: blob => URL.createObjectURL(blob),
  execute(source, failed) {
    const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
    const script = document.createElement("script");
    script.src = url;
    script.onload = () => URL.revokeObjectURL(url);
    script.onerror = () => { URL.revokeObjectURL(url); failed(); };
    document.head.append(script);
  },
});
