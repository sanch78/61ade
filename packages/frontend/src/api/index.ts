/**
 * Public type entry of the 61ade toolkit API (docs/toolkit.md). The runtime is the `Application` the shell hands to
 * every module (`src/app/Application.ts`); its contract generation is `Application.apiVersion` (type `ApiVersion`).
 * `tools/build.mjs` emits `dist/admin.d.ts` from this file for project modules (development use only); it may only
 * re-export `./types` and the import-free `./sign-in`, so `admin.d.ts` declares no run-time value a module could try
 * to import.
 */
export type * from "./types";
export type * from "./sign-in";
