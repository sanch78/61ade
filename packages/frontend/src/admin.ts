import { AdminShell, type ShellDefinition } from "./AdminShell";
import "@dhtmlx/suite/codebase/suite.min.css";
import "./themes/skyblue.css";
import "./admin.css";
import "./flags/flags.css";

const root = document.querySelector<HTMLElement>("#vapa-application");
const command = document.querySelector<HTMLFormElement>("#vapa-command");
const config = document.querySelector("#vapa-config");
if (root && command && config) {
  const shell = new AdminShell(
    root,
    command,
    JSON.parse(config.textContent || "{}") as ShellDefinition,
  );
  window.addEventListener("pagehide", () => shell.destroy(), { once: true });
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) location.reload();
  });
}
