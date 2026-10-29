/**
 * Public type entry of the 61ade toolkit API (docs/toolkit.md). The runtime is the `Application` the shell hands to
 * every module (`src/app/Application.ts`). Planned P3 C-6: `dist/admin.d.ts` is emitted from this file for project
 * modules (development use only).
 */
export type * from "./types";
import type { ApiVersion } from "./types";

/** Contract generation of this API; equals `Application.apiVersion`. */
export const apiVersion: ApiVersion = 1;
