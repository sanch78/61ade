import type { FilePickerApi, FilePickerOptions, MediaDescriptor } from "../../api/types";
import { server } from "../../api/Server";
import { FilePicker, fieldFolder, type ResourceCall } from "../../FilePicker";

const text = (value: unknown): value is string => typeof value === "string" && value !== "";

/**
 * `FilePicker.pick` (`app.components.FilePicker`): the modal tiles picker of `file` fields over the field's folder
 * (`folder_id`, otherwise the mount root), limited to the field's accepted MIME classes. Resolves the chosen file's
 * descriptor, or `null` on Cancel, Escape or when `signal` aborts; its requests end with it. The server checks `list`
 * on the mount for every request.
 */
function pick(options: FilePickerOptions): Promise<MediaDescriptor | null> {
  const field = options?.field;
  if (!field || typeof field !== "object" || !text(field.resource) || !text(field.mount) || (field.accept !== undefined && !Array.isArray(field.accept)))
    throw new TypeError("61ade: FilePicker.pick needs a file field configuration with a resource and a mount.");
  if (typeof options.title !== "string") throw new TypeError("61ade: FilePicker.pick needs a title.");
  if (options.current !== undefined && typeof options.current !== "string") throw new TypeError("61ade: FilePicker.pick `current` must be a file id.");
  const signal = options.signal;
  if (signal !== undefined && !(signal instanceof AbortSignal)) throw new TypeError("61ade: FilePicker.pick `signal` must be an AbortSignal.");
  if (signal?.aborted) return Promise.resolve(null);
  const requests = new AbortController();
  const call: ResourceCall = (resource, action, id, values) => server.call(resource, action, { id, values, signal: requests.signal });
  const config = { ...field, policy: field.policy ?? undefined };
  const picker = new FilePicker(config, options.title, call, () => fieldFolder(config, call), options.current ?? "");
  const abort = () => picker.close();
  signal?.addEventListener("abort", abort, { once: true });
  return picker.result.finally(() => { signal?.removeEventListener("abort", abort); requests.abort(); });
}

/** `app.components.FilePicker`. */
export const filePicker: FilePickerApi = Object.freeze({ pick });
