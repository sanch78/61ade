/**
 * Public entry of the 61ade toolkit API (contract only, toolkit plan P1; docs/toolkit.md).
 * Planned P3 C-6: `dist/admin.d.ts` is emitted from this file for project modules (development use only).
 * Not imported by `admin.ts` yet, so the built bundle is unchanged.
 */
export type * from "./types";
import type { ApiVersion } from "./types";

/** Contract generation of this API; equals `Application.apiVersion`. */
export const apiVersion: ApiVersion = 1;
