import type { SandboxMessage } from "../api/types";
import { NAME } from "../app/registries";

/**
 * The sandbox protocol shared by `SandboxFrame` (parent) and the bootstrap of `sandbox.html` (frame), docs/toolkit.md#sandbox-protocol.
 * Everything received through it is untrusted input on both sides.
 */

/** Types the protocol reserves; every other type is a dotted project name (`scene.seek`). */
export const RESERVED: readonly string[] = ["load", "ready", "error"];

/** A project message type: a registry name with a dot, at most 128 characters. */
export const projectType = (type: unknown): type is string =>
  typeof type === "string" && type.length <= 128 && NAME.test(type) && type.includes(".");

/** The envelope `{blade: 1, id, type, payload}` of a received message, or `null` when it is not a valid one. */
export function envelope(data: unknown): SandboxMessage | null {
  if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
  const { blade, id, type, payload } = data as Record<string, unknown>;
  if (blade !== 1 || typeof id !== "string" || id.length < 1 || id.length > 64) return null;
  if (typeof type !== "string" || (!RESERVED.includes(type) && !projectType(type))) return null;
  return { blade: 1, id, type, payload };
}

/** Error text sent or reported through the protocol: a string of at most 1000 characters. */
export function describe(error: unknown): string {
  let text: string;
  try { text = error instanceof Error ? error.message || error.name : String(error); } catch { text = "Unknown error"; }
  return text.length > 1000 ? text.slice(0, 1000) + "…" : text;
}

/** UTF-8 size of a string. */
export const byteLength = (text: string): number => new TextEncoder().encode(text).byteLength;
