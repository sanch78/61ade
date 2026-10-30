/**
 * Public type entry of the 61ade toolkit API (docs/toolkit.md). The runtime is the `Application` the shell hands to
 * every module (`src/app/Application.ts`). `tools/build.mjs` emits `dist/admin.d.ts` from this file for project
 * modules (development use only); it may only re-export `./types`.
 */
export type * from "./types";
export type * from "./sign-in";
import type { ApiVersion } from "./types";

/** Contract generation of this API; equals `Application.apiVersion`. */
export const apiVersion: ApiVersion = 1;
