import type { Application, ComponentClass, FileManager as FileManagerApi, FileManagerEvents, FileManagerOptions, FilesKindOptions } from "../../api/types";
import { FileManager, type FileViewDefinition } from "../../FileManager";
import { Facade, resolveView } from "../Facade";

const fileOptions = (options: unknown): boolean => {
  const value = options as Partial<FilesKindOptions> | null;
  return !!value && typeof value === "object" && Array.isArray(value.mounts) && value.mounts.length > 0 && Array.isArray(value.preview)
    && !!value.upload && typeof value.upload === "object" && !!value.text && typeof value.text === "object";
};

/**
 * Public `FileManager` (`app.components.FileManager`): the two-panel virtual file manager of a view whose resource
 * offers the file actions (`tree`, `list`, and optionally the writes, `content_stream`, `text_get`/`text_save`,
 * `upload`), over `FileManager.ts`. What it offers follows the view's actions; the server checks every call. `opened`
 * fires when the viewer or the text editor shows a file. The built-in `files` view kind uses this class too.
 */
export class FileManagerFacade extends Facade<FileManagerEvents, FileManager> implements FileManagerApi {
  constructor(app: Application, options: FileManagerOptions) {
    if (!options || typeof options !== "object") throw new TypeError("61ade: FileManager needs an options object.");
    const view = resolveView<FilesKindOptions>(app, options.view, "FileManager", fileOptions);
    super(options, (container, emit) => new FileManager(container, {
      kind: "files", resource: view.resource!, title: view.title,
      actions: view.actions.map(action => ({ ...action, fields: action.fields ?? [] })), files: view.options,
    } as unknown as FileViewDefinition, { opened: file => emit("opened", file) }));
  }
}

/** The `FileManager` class bound to one application (resolves view ids through it). */
export function bindFileManager(app: () => Application): ComponentClass<FileManagerOptions, FileManagerApi> {
  return class FileManager extends FileManagerFacade {
    constructor(options: FileManagerOptions) { super(app(), options); }
  };
}
