import { AdminShell, type ShellDefinition } from "./AdminShell";
import { releaseSplash } from "./Splash";
import { installSuiteLabels } from "./SuiteLabels";
import "@dhtmlx/suite/codebase/suite.min.css";
import "./themes/blade-chrome.css";
import "./admin.css";
import "./themes/character.css";
import "./themes/blade.css";
import "./flags/flags.css";
import "./uploader.css";
import "./splash.css";

// Suite's English-only names (a collapsable header, a window's close button) in the page's language, on every page
// that loads the bundle, with or without the shell (FB-0155).
installSuiteLabels();
const root = document.querySelector<HTMLElement>("#blade-application");
const command = document.querySelector<HTMLFormElement>("#blade-command");
const config = document.querySelector("#blade-config");
if (root && command && config) {
  try {
    const shell = new AdminShell(
      root,
      command,
      JSON.parse(config.textContent || "{}") as ShellDefinition,
    );
    window.addEventListener("pagehide", () => shell.destroy(), { once: true });
    window.addEventListener("pageshow", (event) => {
      if (event.persisted) location.reload();
    });
  } finally {
    releaseSplash();
  }
}
