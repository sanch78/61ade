// Feature demo project module (docs/demos.md#toolkit-consumer): the worked example of the toolkit TypeScript recipe
// (docs/toolkit.md#typescript-recipe). Built by tools/build.mjs into public/app/demo.js and declared in
// application.php `modules`; it imports 61ade types only and gets everything else from `app`.
import type { ApplicationModule } from "@61ade/admin";

/** One D-row of docs/toolkit-plan.md#6-feature-demo-transformation: registers its kinds, presentations, field types and commands. */
type Part = ApplicationModule;
const none: Part = () => {};

// Extension slots. A D-row lane adds `src/<file>.ts` with a default-exported Part and replaces only its own slot line
// with `import <name> from "./<file>";`; the comment lines between the slots keep parallel lane merges conflict-free.
// D1 Signage Médiatár: record view demo.asset-viewer (assets.ts)
import assets from "./assets";
// D2 Signage Napi műsor: view kind demo.playlist-preview (playlist.ts)
import playlist from "./playlist";
// D3 Mérések: dashboard kind and column presentation (readings.ts)
import readings from "./readings";
// D4 Tasks: field type and client command (tasks.ts)
import tasks from "./tasks";
// D5 Signage Lejátszási listák: record view kind demo.playlist-editor (playlist-editor.ts)
import playlistEditor from "./playlist-editor";

/**
 * Runs every part in D-row order. A failing part does not stop the later ones; the failures are rethrown together, so
 * the shell's module loader reports this module once (toast, `module:error`, console) and keeps what registered.
 */
const demo: ApplicationModule = async app => {
  const failures: unknown[] = [];
  for (const part of [assets, playlist, readings, tasks, playlistEditor]) {
    try { await part(app); } catch (error) { failures.push(error); }
  }
  if (failures.length) throw new AggregateError(failures, "61ade feature demo: a module part failed");
};
export default demo;
