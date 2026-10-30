import { t } from "../I18n";
import { actionUrl } from "../ActionUrl";
import type { CallOptions, FormDescription, Server, ServerFailure } from "./types";
import { signalOf } from "./Events";

/**
 * The one JSON transport of the UI channel (toolkit K-F1): every component and project module POSTs
 * `{resource, action, id, values}` to `./?blade=1` with the session cookie and the page's `X-BLADE-CSRF` token.
 */
let csrf = "";
let ended: (() => void) | undefined;
/**
 * Set once by the shell from the bootstrap `csrf`; signed-out pages have none. `sessionEnded` runs on every 401
 * of the channel (the session is gone) before the caller sees the failure; the shell signs the page out with it.
 */
export function configureServer(token: string, sessionEnded?: () => void): void { csrf = token; ended = sessionEnded; }

const endpoint = (): string => { const url = new URL(location.href); url.hash = ""; url.search = "?blade=1"; return url.toString(); };

/**
 * The raw request; resolves the `Response` whatever its status and rejects only with the network or abort error.
 * Internal (the uploader keeps its own retry and error mapping on it); modules use `server.call`/`server.request`.
 */
export function post(resource: string, action: string, options: CallOptions = {}): Promise<Response> {
  const request = JSON.stringify({ resource, action, id: options.id ?? null, values: options.values ?? {} });
  const headers: Record<string, string> = { "X-BLADE-CSRF": csrf };
  let body: BodyInit = request;
  // Binary content travels as multipart parts; the JSON request is the `request` part beside them.
  if (options.parts) { const form = new FormData(); form.append("request", request); for (const part of options.parts) form.append(part.field, part.blob, part.name); body = form; }
  else headers["Content-Type"] = "application/json";
  return fetch(endpoint(), { method: "POST", credentials: "same-origin", headers, body, signal: options.signal })
    .then(response => { if (response.status === 401) ended?.(); return response; });
}

/** A `ServerFailure`: the localized server message (or the generic one), field errors and optional details. */
export function failure(status: number, result: { error?: unknown; fieldErrors?: unknown; details?: unknown } = {}): ServerFailure {
  const fieldErrors = result.fieldErrors && typeof result.fieldErrors === "object" && !Array.isArray(result.fieldErrors) ? result.fieldErrors as Record<string, string> : {};
  return Object.assign(new Error(typeof result.error === "string" && result.error ? result.error : t("Sikertelen művelet.")),
    { status, fieldErrors, ...(result.details !== undefined ? { details: result.details } : {}) });
}

/** `post` with the network error mapped to a status 0 failure; the platform `AbortError` passes through. */
async function send(resource: string, action: string, options: CallOptions): Promise<Response> {
  try { return await post(resource, action, options); }
  catch (error) { if (options.signal?.aborted || (error as Error)?.name === "AbortError") throw error; throw failure(0); }
}

async function call<T = unknown>(resource: string, action: string, options: CallOptions = {}): Promise<T> {
  const response = await send(resource, action, options);
  let result: any;
  try { result = await response.json(); }
  catch (error) {
    if (options.signal?.aborted) throw error;
    // No JSON: an error status is kept (401 ends the session, 5xx is transient); a 2xx without JSON is status 0.
    throw failure(response.ok ? 0 : response.status);
  }
  if (!response.ok || !result?.ok) throw failure(response.status, result ?? {});
  return result.data as T;
}

async function request(resource: string, action: string, options: CallOptions = {}): Promise<Response> {
  const response = await send(resource, action, options);
  if (response.ok) return response;
  throw failure(response.status, await response.json().catch(() => ({})));
}

/** `Application.server`. */
export const server: Server = {
  call,
  request,
  form: (resource, operation, id = null, options) => call<FormDescription>(resource, "__form", { id, values: { operation }, signal: signalOf(options, "server.form") }),
  url: actionUrl,
};
