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
let accessChanged: ((resource?: string,reload?:boolean) => void) | undefined;
const ACCESS_RESOURCES=new Set(["blade_users","blade_roles","blade_memberships","blade_role_rules","blade_user_rules","blade_tenants","blade_tenant_members"]);
const ACCESS_WRITES=new Set(["create","update","delete","__edit","__bulk"]);
/**
 * Set once by the shell from the bootstrap `csrf`; sign-in pages have none. `sessionEnded` runs on every 401
 * of the channel (the session is gone) before the caller sees the failure; the shell signs the page out with it.
 */
export function configureServer(token: string, sessionEnded?: () => void, changed?: (resource?: string,reload?:boolean) => void): void {
  csrf=token;ended=sessionEnded;accessChanged=changed;
}

const endpoint = (): string => { const url = new URL(location.href); url.hash = ""; url.search = "?blade=1"; return url.toString(); };

/**
 * The raw request; resolves the `Response` whatever its status and rejects only with the network or abort error.
 * Internal (the uploader keeps its own retry and error mapping on it); modules use `server.call`/`server.request`.
 */
export function post(resource: string, action: string, options: CallOptions = {}): Promise<Response> {
  const request = JSON.stringify({ resource, action, id: options.id ?? null, values: options.values ?? {}, ...(options.token !== undefined ? { token: options.token } : {}) });
  const headers: Record<string, string> = { "X-BLADE-CSRF": csrf };
  let body: BodyInit = request;
  // Binary content travels as multipart parts; the JSON request is the `request` part beside them.
  if (options.parts) { const form = new FormData(); form.append("request", request); for (const part of options.parts) form.append(part.field, part.blob, part.name); body = form; }
  else headers["Content-Type"] = "application/json";
  return fetch(endpoint(), { method: "POST", credentials: "same-origin", headers, body, signal: options.signal })
    .then(response => {
      if(response.status===401)ended?.();
      else if(response.ok&&ACCESS_RESOURCES.has(resource)&&ACCESS_WRITES.has(action))accessChanged?.(undefined,true);
      else if(action==="list"&&(response.status===403||response.status===404))accessChanged?.(resource);
      return response;
    });
}

/** A `ServerFailure`: the localized server message (or the generic one), field errors and optional details. */
export function failure(status: number, result: { error?: unknown; fieldErrors?: unknown; details?: unknown } = {}): ServerFailure {
  const fieldErrors = result.fieldErrors && typeof result.fieldErrors === "object" && !Array.isArray(result.fieldErrors) ? result.fieldErrors as Record<string, string> : {};
  return Object.assign(new Error(typeof result.error === "string" && result.error ? result.error : t("Sikertelen művelet.")),
    { status, fieldErrors, ...(result.details !== undefined ? { details: result.details } : {}) });
}

/** `request` with `version`: a GET of the `Server.url` address (a field-free `get: true` action, cacheable). */
const get = (resource: string, action: string, options: CallOptions): Promise<Response> =>
  fetch(actionUrl(resource, action, options.id!, options.version), { credentials: "same-origin", signal: options.signal })
    .then(response => { if (response.status === 401) ended?.(); return response; });

/** `post` (or `get`) with the network error mapped to a status 0 failure; the platform `AbortError` passes through. */
async function send(resource: string, action: string, options: CallOptions): Promise<Response> {
  try { return await (options.version === undefined ? post(resource, action, options) : get(resource, action, options)); }
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

/** `CallOptions.version` belongs to `request` alone. */
const unversioned = (options: object | undefined, member: string): void => {
  if ((options as { version?: unknown } | undefined)?.version !== undefined) throw new TypeError(`61ade: ${member} takes no \`version\` (server.request only).`);
};

/** `Application.server`. */
export const server: Server = {
  call: <T = unknown>(resource: string, action: string, options?: CallOptions) => { unversioned(options, "server.call"); return call<T>(resource, action, options); },
  request(resource, action, options) {
    // A GET carries the id and the cache key in its URL, nothing else.
    const version = options?.version;
    if (version !== undefined && (typeof version !== "string" || !version || typeof options!.id !== "string" || !options!.id || options!.values !== undefined || options!.parts !== undefined))
      throw new TypeError("61ade: server.request `version` is a non-empty string and needs an `id`, without `values` or `parts`.");
    return request(resource, action, options);
  },
  form: (resource, operation, id = null, options) => { unversioned(options, "server.form"); return call<FormDescription>(resource, "__form", { id, values: { operation }, signal: signalOf(options, "server.form") }); },
  url: actionUrl,
};
