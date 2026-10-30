/**
 * 61ade toolkit API, version 1: the public type surface for project modules.
 *
 * Status: implemented. The kernel (application object, services, registries, module loader, routing, view host) is in
 * `src/api/*` and `src/app/*` (toolkit P2); the components (`src/components/*`), presentations, field types and client
 * commands on list surfaces followed in P3.
 * Each member names the internal code it wraps (FB-0081).
 * Reference and examples: docs/toolkit.md. Changes after gate G1 are recorded in docs/toolkit.md#changes.
 *
 * Ownership: 61ade owns every type, service and component declared here; a project owns its modules, the kinds,
 * presentations, field types and commands it registers, and its own browser code. Server authorization is never
 * delegated to this API: every read and write still goes through a registered, ACL-checked action.
 */
import type * as Suite from "@dhtmlx/suite";

// ---------------------------------------------------------------------------------------------------------------
// Modules and the application object
// ---------------------------------------------------------------------------------------------------------------

/**
 * Default export of a project module (`ApplicationDefinition::$modules`, JSON `application.modules`).
 * The shell `import()`s every declared module after sign-in, before the first route, and calls the exports in
 * declaration order with the one `Application` of the page. A rejected promise, a thrown error or a call that does
 * not settle within 5 s is reported (toast, `module:error` event, console) and skipped; the shell always starts.
 * Registrations a failing module made before failing stay in effect. Modules are never loaded on the sign-in,
 * e-mail confirmation or password-change pages. A module must not import `admin.js` (a second bundle instance);
 * it receives everything through `app` and imports only types (`import type`, from `admin.d.ts`).
 */
export type ApplicationModule = (app: Application) => void | Promise<void>;

/** API generation of this contract, a type only: the run-time value is `Application.apiVersion` (nothing to import). */
export type ApiVersion = 1;

/**
 * The page's application API, created once by the shell after sign-in and handed to every module.
 * It lives as long as the page; sign-out and tenant switches reload the page and create a new one.
 */
export interface Application {
  /** Contract generation (O11). A module may refuse to start on a value it does not know. */
  readonly apiVersion: ApiVersion;
  /**
   * The DHTMLX Suite namespace the shell itself uses (Standard edition 9.3.12, GPL; O10), the same instances and
   * theme state. Use it for project widgets (Layout, Toolbar, Chart, …) instead of bundling a second Suite.
   * Scheduler is not exposed; use `components.Calendar`.
   */
  readonly dhx: typeof Suite;
  /** JSON action transport of the UI channel (session cookie + CSRF header). */
  readonly server: Server;
  /** Framework dialogs, toasts and windows. */
  readonly ui: Ui;
  /** The shared uploader (one queue and window per page). */
  readonly uploads: Uploads;
  /** The server-provided message catalog of the page's locale. */
  readonly i18n: I18n;
  /** Appearance (factory theme or application skin). */
  readonly theme: Theme;
  /** Browser-local presentation preferences of the signed-in user. */
  readonly preferences: Preferences;
  /** List subscriptions on the tab's one live channel. */
  readonly live: Live;
  /** Typed page-wide event bus. */
  readonly events: EventBus;
  /** The signed-in identity (presentation data only; never a permission source). */
  readonly identity: Identity;
  /**
   * View kinds: kind name → factory (`ViewDefinition.kind`). Built-ins `list`, `files`, `diagram`, `calendar` are
   * registered by 61ade. The views themselves are `viewDefinitions()`/`viewDefinition(id)`.
   */
  readonly kinds: Registry<ViewKind<any>>;
  /** Column/value presentations: name → renderer (`column.presentation`). Built-in `image` (`icon` stays framework-internal). */
  readonly presentations: Registry<ColumnPresentation>;
  /** Field editors: name → form item factory and display renderer (`field.editor`); no built-in entries. */
  readonly fieldTypes: Registry<FieldType>;
  /** Client-side commands: name → handler, placed on list toolbars (`ListKindOptions.commands`). Built-in `details`. */
  readonly commands: Registry<ClientCommand>;
  /**
   * Public component classes, bound to this application: `ListView`, `RecordForm`, `RecordDetails`, `FileManager`,
   * `FilePicker`, `Calendar`, `DiagramEditor`, `MediaPlayer`, `SandboxFrame` and `CommandBar`.
   */
  readonly components: Components;
  /** Views offered to the actor (server-filtered bootstrap `views`), in menu order. */
  viewDefinitions(): readonly ViewDefinition[];
  /** One offered view by id, or `undefined` when it does not exist or is not offered to the actor. */
  viewDefinition(id: string): ViewDefinition | undefined;
  /**
   * Opens a view like a menu click or an address change: writes `#view=<id>[&record=…]` as a history entry
   * (page views only; `filters` are applied once and not written to the address) and mounts it through the `kinds` registry. Returns `false` (and changes nothing) when the view is
   * not offered to the actor, needs a record that was not given, or its kind is not registered. Record resolution
   * failures (403/404 from the record resource's `get`) show the shared error dialog and keep the current view.
   */
  navigate(target: NavigationTarget): boolean;
}

/** Target of `Application.navigate` and of the `#view=` route. */
export interface NavigationTarget {
  /** View id (`[a-z][a-z0-9_.-]*`). */
  view: string;
  /** Record id for a record view (`ViewDefinition.record`); ignored by other views. */
  record?: string;
  /** Filter presets of a list view, applied once like `filter.<field>=<value>` in the address. */
  filters?: Record<string, string>;
  /** Overrides `ViewDefinition.open` for this navigation. `window` creates no history entry. */
  open?: ViewOpenMode;
}

// ---------------------------------------------------------------------------------------------------------------
// Kernel services
// ---------------------------------------------------------------------------------------------------------------

/**
 * The `options` argument of every subscription and of `Server.form`: `signal` ends the subscription (or aborts the
 * request) when it aborts; an already aborted signal subscribes nothing. Anything but an object, or a `signal` that
 * is not an `AbortSignal`, throws `TypeError` (also a bare `AbortSignal` in place of the object).
 */
export interface SignalOptions {
  signal?: AbortSignal;
}

/** Options of one action call. */
export interface CallOptions {
  /** Target id passed to the action's resolver; `null` for collection and create actions. */
  id?: string | null;
  /** Action values (validated by the server against the action's fields). */
  values?: Record<string, unknown>;
  /** Aborts the request; the promise then rejects with the platform `AbortError` (a `DOMException`). */
  signal?: AbortSignal;
  /** Binary parts for actions declaring `Action::$upload` (multipart; the JSON request travels as `request`). */
  parts?: { field: string; blob: Blob; name?: string }[];
}

/**
 * Rejection of `Server.call`/`Server.request`/`Server.form`: the server's `{ok: false, error, fieldErrors, details}`
 * answer, or a transport failure (`status` 0, localized generic message). `message` is already localized.
 */
export interface ServerFailure extends Error {
  /**
   * HTTP status; 0 for a network failure or a 2xx answer without JSON (an error answer without JSON keeps its HTTP
   * status, so 401/5xx handling stays the same). 401: the session ended; 403: denied by ACL.
   */
  readonly status: number;
  /** Field name → localized message (server validation); empty when none. */
  readonly fieldErrors: Record<string, string>;
  /** Optional machine-readable details (for example `{code: "stale_cursor"}`). */
  readonly details?: unknown;
}

/**
 * The one JSON transport (`src/api/Server.ts`), also used by the list, file manager, calendar, diagram editor, uploader
 * and live channel: it POSTs `{resource, action, id, values}` to `./?blade=1` with `X-BLADE-CSRF`. No new endpoint
 * exists for modules.
 */
export interface Server {
  /**
   * Runs a registered action and resolves its `data`. Rejects with `ServerFailure` (`!response.ok` or `ok: false`)
   * or `AbortError`. Never retries. Authorization, validation, transaction and audit happen on the server.
   */
  call<T = unknown>(resource: string, action: string, options?: CallOptions): Promise<T>;
  /**
   * Like `call` but resolves the raw `Response` for binary results (`Download`, `DownloadStream`, e.g.
   * `content_get`). Rejects with `ServerFailure` when the response is not 2xx.
   */
  request(resource: string, action: string, options?: CallOptions): Promise<Response>;
  /**
   * Field metadata and initial values of an action form: the `__form` pseudo-action (`values.operation`), with the
   * actor's field ACL applied. `id` selects the target record (update forms); `signal` aborts the request.
   */
  form(resource: string, operation: string, id?: string | null, options?: SignalOptions): Promise<FormDescription>;
  /**
   * Same-origin GET URL of a field-free `get: true` action (`content_stream`, `thumbnail_get`, project media
   * actions) for `<img>`, `<video>`, `<audio>` sources. `version` only keys the browser cache. Wraps `actionUrl`.
   */
  url(resource: string, action: string, id: string, version?: string): string;
}

/** Answer of `Server.form`. */
export interface FormDescription {
  fields: FieldMetadata[];
  values: Record<string, unknown>;
}

/** Severity of a dialog or toast; meaning never depends on colour alone. Same values as `DialogSeverity`. */
export type Severity = "neutral" | "warning" | "danger";

/** Options of `Ui.dialog` (wraps `MessageDialog.showDialog`, the same `DialogOptions`). */
export interface DialogOptions {
  /** Plain text; never HTML. */
  message: string;
  title?: string;
  severity?: Severity;
  /** `acknowledge`: one OK button (default). `confirm`: Confirm + Cancel. */
  mode?: "acknowledge" | "confirm";
  okLabel?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Confirm mode only; a danger confirmation always starts on Cancel. */
  initialFocus?: "confirm" | "cancel";
}

/** Options of `Ui.choice` (wraps `MessageDialog.requestChoice`). Cancel is always added and resolves `null`. */
export interface ChoiceOptions {
  message: string;
  title?: string;
  severity?: Severity;
  cancelLabel?: string;
  choices: { value: string; label: string }[];
}

/** Options of `Ui.window`. */
export interface WindowOptions {
  /** Plain-text title (escaped by the framework). */
  title: string;
  /** Initial size; clamped to the viewport minus 24 px. Below 768 px the window is full screen. */
  width?: number;
  height?: number;
  /** Fits the height to the rendered form actions or content (`fitWindow`) after each `attach`. Default true. */
  fit?: boolean;
  modal?: boolean;
  resizable?: boolean;
  /** Aborting it closes the window (pass `host.signal` so the window closes with its view). */
  signal?: AbortSignal;
}

/**
 * A framework document window (`blade-content-window`: 40 px themed header, close button, Escape closes).
 * Owned by its creator; `close()` or the close button destroys the window and its attached content.
 */
export interface AppWindow {
  /** The underlying Suite Window, for options this interface does not cover. */
  readonly window: Suite.Window;
  /** Aborted when the window closes; pass it to calls and subscriptions made for the window's content. */
  readonly signal: AbortSignal;
  /** Attaches a Suite widget (Layout, Form, …) or an element as the window body (replaces the previous one). */
  attach(content: Mountable): void;
  setTitle(text: string): void;
  /** Remeasures the content height (see `WindowOptions.fit`). */
  fit(): Promise<void>;
  /** Closes and destroys the window; idempotent. */
  close(): void;
}

/** Dialogs, toasts and windows (over `MessageDialog.ts`, Suite `message` and `WindowSizing.ts`). */
export interface Ui {
  /** Modal alert/confirm; resolves `true` for OK/Confirm, `false` for Cancel/Escape. */
  dialog(options: DialogOptions): Promise<boolean>;
  /** Multiple-choice dialog; resolves the chosen value or `null`. */
  choice(options: ChoiceOptions): Promise<string | null>;
  /** Non-blocking gritter for a successful field-free command (the "no redundant dialogs" rule). Plain text. */
  toast(text: string, severity?: Severity): void;
  /** Opens a framework document window. */
  window(options: WindowOptions): AppWindow;
}

/** Browser part of a server `UploadPolicy` (`UploadPolicy::metadata()`); never contains server paths. */
export interface UploadPolicy {
  extensions: string[];
  max_size_bytes: number;
  max_files: number;
  chunk_bytes: number;
  folders: boolean;
  max_depth: number;
  duplicate_policy: "ask" | "overwrite" | "rename" | "skip" | "reject";
}

/** Per-file outcome of an upload target action (the file manager's `upload` shape). */
export interface UploadResult {
  succeeded: { id: string; name: string; parent?: string; item?: Record<string, unknown> }[];
  skipped: { name: string }[];
  failed: { name: string; code?: string; error: string }[];
}

/** Read-only description of one queued file in `upload:*` events. */
export interface UploadFileInfo {
  id: string;
  name: string;
  size: number;
  type: string;
  relativePath: string;
  resource: string;
  action: string;
  target: string | null;
}

/**
 * Options of `Uploads.open` (the same shape as `UploadOpenOptions` in `Uploader.ts`). The policy is the target
 * action's `ActionMetadata.upload` (list views) or a files view's `FilesKindOptions.upload.policy`.
 */
export interface UploadOpenOptions {
  /** ACL resource and registered action that receives the files (an action with an `upload` policy). */
  resource: string;
  action: string;
  /** Target id passed to the action's resolver (for example a directory id). */
  target: string | null;
  /** Human-readable target shown in the window. */
  targetLabel: string;
  policy: UploadPolicy;
  /** Files to queue at once (for example from a drop on the caller's own surface). */
  files?: File[] | FileList;
  /** A drop's DataTransfer (folders included); pass it synchronously from the drop handler. */
  transfer?: DataTransfer;
  /** Called once per batch when every file of it has settled. */
  onUploaded?: (result: UploadResult) => void;
}

/**
 * The shared uploader (`uploads` singleton of `Uploader.ts`: chunked, resumable `__upload` transfers, conflict
 * dialog, lower-bar indicator), the same one the file manager, list upload commands and `file` fields use (P3 C-2).
 * Progress is reported through `Application.events` (`upload:*`), for every upload of the page.
 */
export interface Uploads {
  /**
   * Shows the upload window for a target; files queued for other targets stay in the queue. `files`/`transfer`
   * queue at once (no second confirmation). Throws `TypeError` for a malformed option (no window opens); the server
   * checks every file against the action's policy, ACL and handler as for any upload.
   */
  open(options: UploadOpenOptions): void;
  /** Reopens the window with its current queue; does nothing before the first `open` of the page. */
  reopen(): void;
}

/** Translations (wraps `I18n.ts` `t`/`locale` and the bootstrap `i18n` block). */
export interface I18n {
  /**
   * Message for `key` in the page's locale, `{name}` placeholders replaced from `params`; the key itself when no
   * catalog has it. The catalog is the server-merged one (framework < project per locale, default locale as
   * fallback; `Blade\I18n\Translator::configure`). Plain text: escape it before inserting it as HTML.
   */
  t(key: string, params?: Record<string, unknown>): string;
  /** Active locale code (`hu`, `en`, `de`, `xx-YY`). A language switch reloads the page. */
  locale(): string;
  /** Site languages: code → native name. */
  languages(): Readonly<Record<string, string>>;
}

/** Appearance state (over AdminShell's `setTheme` handling and `data-blade-skin`). */
export interface Theme {
  /** The applied DHTMLX base theme: `skyblue`, `light` or `dark`. */
  current(): string;
  /** The applied application skin id (`data-blade-skin`), or `null` with a factory theme. */
  skin(): string | null;
  /** Called after every theme or skin change; returns the unsubscribe function. With `signal`, unsubscribes when it aborts. */
  onChange(listener: (theme: string, skin: string | null) => void, options?: SignalOptions): () => void;
}

/**
 * Browser-local preference store of one scope (over `UiPreferences.ts`). Keys live under the versioned
 * `blade-ui:1:` localStorage prefix, separated by page path, user id and scope. Values are JSON; storage failures
 * (private mode, quota) are swallowed: `get` then returns `undefined` and `set` does nothing.
 */
export interface PreferenceStore {
  get<T = unknown>(key: string): T | undefined;
  set(key: string, value: unknown): void;
  remove(key: string): void;
}

/** Preferences of the signed-in user: presentation only, never form values, secrets or permission data. */
export interface Preferences {
  /** A named store; use a project prefix (`demo.player`). List views keep their own keys by view id. */
  scope(name: string): PreferenceStore;
}

/** One list row as the list protocol and live updates deliver it (`Realtime.ts` `Row`). */
export interface Row {
  id: string;
  revision?: string;
  /** Record actions offered for this row. */
  _actions?: string[];
  /** Fields editable in the grid for this row. */
  _editable?: string[];
  _position?: Record<string, unknown>;
  [field: string]: unknown;
}

/** A list window (`Realtime.ts` `Snapshot`, list protocol response). */
export interface Snapshot {
  items: Row[];
  previous: string | null;
  next: string | null;
  version?: string;
  total?: number;
  matched?: number;
}

/** Query of a registered `list` action (docs/workspaces.md, list protocol). */
export interface ListQuery {
  mode?: "dynamic";
  /** At most 200 per request; live subscriptions at most 600. */
  limit?: number;
  filters?: Record<string, string>;
  sort?: { field: string; direction: "asc" | "desc" };
  cursor?: string | null;
  /** Server search over the view's `search` fields (at most 100 characters). */
  search?: string;
}

/** Callbacks of a live subscription (the `update`/`state`/`denied` callbacks of `Realtime`). */
export interface LiveHandlers {
  /** Changed rows of the subscribed window. Never called while the page is hidden. */
  update(snapshot: Snapshot): void;
  /** Connection state text for the user (empty when healthy). */
  state?(text: string): void;
  /** This subscription was refused (403/404/400/429); the channel stays open, loaded rows stay. */
  denied?(): void;
}

/** Handle of one subscription; owned by the caller, ended by `destroy()` or by the given signal. */
export interface LiveSubscription {
  /** Replaces the query (a new first window; frames of the old query are dropped). */
  subscribe(query: ListQuery): void;
  destroy(): void;
}

/** Live data on the tab's one channel (over `LiveChannel`/`Realtime`, protocol 2). */
export interface Live {
  /**
   * Subscribes to `resource`'s `list` window; the server re-authorizes on every read. Ends with `destroy()` or when
   * `options.signal` aborts (pass `{ signal: host.signal }` so a closed view never leaks a subscription).
   */
  subscribe(resource: string, query: ListQuery, handlers: LiveHandlers, options?: SignalOptions): LiveSubscription;
}

/**
 * Framework events. Projects add their own names (with a project prefix and a dot, e.g. `demo.scene-loaded`) by
 * module augmentation of this interface: `declare module "@61ade/admin" { interface AppEvents { … } }`.
 */
export interface AppEvents {
  "upload:queued": { file: UploadFileInfo };
  "upload:started": { file: UploadFileInfo };
  "upload:progress": { file: UploadFileInfo; received: number; size: number };
  "upload:conflict": { file: UploadFileInfo; conflicts: unknown[] };
  "upload:file-done": { file: UploadFileInfo; result: UploadResult };
  "upload:file-failed": { file: UploadFileInfo; code: string; message: string };
  "upload:complete": UploadResult;
  "upload:cancelled": { file: UploadFileInfo };
  /** A view was mounted in the workspace or a window. */
  "view:opened": { id: string; record?: string; open: ViewOpenMode };
  /** A view was destroyed. */
  "view:closed": { id: string; record?: string };
  /** A module failed to load or initialize (`reason` `load`, `init` or `timeout`). */
  "module:error": { module: string; reason: "load" | "init" | "timeout"; error: unknown };
  /** A sandboxed frame reported an error or timed out. */
  "sandbox:error": { message: string; code: SandboxErrorCode };
}

/**
 * Page-wide typed bus (it also carries the uploader's events). Handlers run synchronously in
 * registration order; a throwing handler is logged and does not stop the others.
 */
export interface EventBus {
  /** Subscribes; returns the unsubscribe function. With `options.signal`, unsubscribes when it aborts. */
  on<K extends keyof AppEvents>(event: K, handler: (payload: AppEvents[K]) => void, options?: SignalOptions): () => void;
  off<K extends keyof AppEvents>(event: K, handler: (payload: AppEvents[K]) => void): void;
  /**
   * Emits a project event. Framework names (with a `:`) are emitted by 61ade only; emitting one throws.
   */
  emit<K extends keyof AppEvents>(event: K, payload: AppEvents[K]): void;
}

/** The signed-in identity from the bootstrap (`userId`, `displayName`, `tenant.current`). */
export interface Identity {
  readonly id: string;
  readonly displayName: string;
  /** Active tenant id with tenancy, otherwise `null`. */
  readonly tenant: string | null;
}

// ---------------------------------------------------------------------------------------------------------------
// Registries
// ---------------------------------------------------------------------------------------------------------------

/** Options of `Registry.register`. */
export interface RegisterOptions {
  /** Allows replacing an existing entry (including a built-in one). Without it a duplicate name throws. */
  replace?: boolean;
}

/**
 * Name → entry map (`src/app/registries.ts`). Names are `[a-z][a-z0-9_.-]*`; built-in names have
 * no dot, project names must contain one (`<project>.<name>`), so a later built-in never collides with a project
 * entry. Registration happens normally in a module's initialization, before the first view opens; a later
 * registration affects only views mounted afterwards.
 */
export interface Registry<T> {
  /** Adds `entry`. Throws `Error` for a taken name (a built-in one too) without `replace: true`, else `TypeError` for an invalid name or a new name without a dot. */
  register(name: string, entry: T, options?: RegisterOptions): void;
  get(name: string): T | undefined;
  has(name: string): boolean;
  /** Registered names, in registration order. */
  names(): string[];
}

/** Where a view opens: the workspace (a menu page with an address) or a framework document window. */
export type ViewOpenMode = "page" | "window";

/** Built-in view kinds, registered by 61ade through the same registry (dogfooding, `src/app/builtins.ts`). */
export type BuiltinKind = "list" | "files" | "diagram" | "calendar";

/**
 * A view kind: creates the content of one view instance. Built-ins wrap `Workspace` (list), `FileManager`,
 * `DiagramEditor` and `Calendar`; `AdminShell.openView` then dispatches only through the registry.
 */
export interface ViewKind<Options = unknown> {
  /**
   * Mounts the view into `host`. Called once per opening; may be async (the host shows nothing until it resolves).
   * If the host's signal aborts before it resolves, the returned instance is destroyed at once. A throw or rejection
   * shows the shared error dialog and leaves an empty workspace (or closes the window).
   */
  create(host: ViewHost, view: ViewDefinition<Options>): ViewInstance | Promise<ViewInstance>;
}

/** What the shell gives a view instance. */
export interface ViewHost {
  readonly app: Application;
  /** Aborted when the view closes (navigation, window close, sign-out). Tie every call and listener to it. */
  readonly signal: AbortSignal;
  /** `page` (workspace) or `window`. */
  readonly open: ViewOpenMode;
  /** For a record view: the record resolved by the server through `record`'s `get` action (ACL, field ACL, tenant). */
  readonly record?: { resource: string; id: string; row: Row };
  /** Filter presets of the navigation (`filter.<field>=<value>`), applied once. */
  readonly filters: Readonly<Record<string, string>>;
  /** Sets the content (replaces a previous one). A Suite widget is attached to the workspace cell or window body. */
  attach(content: Mountable): void;
  /** Changes the visible title (window header; the menu entry keeps the declared title). */
  setTitle(text: string): void;
  /** Closes this view: a window closes; a page returns to the empty workspace. */
  close(): void;
}

/** A mounted view; the shell calls `destroy()` exactly once. */
export interface ViewInstance {
  /** Releases widgets, windows, listeners and subscriptions not already tied to `host.signal`. */
  destroy(): void;
  /** `true` while the view holds unsaved input (the live channel never reloads the page over it). */
  editing?(): boolean;
  /** Reloads the content (a parent's preview after its window closed). */
  refresh?(): void;
}

/**
 * One view as the server sends it (bootstrap `views`). The shared
 * keys stay at the top level; every kind-specific key moves verbatim into `options` (see `ListKindOptions`,
 * `FilesKindOptions`, `DiagramKindOptions`, `CalendarKindOptions`). All texts are already translated by the server.
 */
export interface ViewDefinition<Options = unknown> {
  /** Unique per application (`[a-z][a-z0-9_.-]*`); defaults to the resource for the built-in builders. */
  id: string;
  /** Registered kind name (`BuiltinKind` or a dotted project kind). */
  kind: string;
  title: string;
  /** ACL resource whose actions the view uses; absent for a view without actions. */
  resource?: string;
  /** Resource of the record a record view opens for (its `get` resolves the row); absent for other views. */
  record?: string;
  /** Actions of `resource` offered to the actor, with their field metadata. */
  actions: ActionMetadata[];
  /** Kind configuration: browser-safe JSON only, never backend-only data. */
  options: Options;
  /** Menu group label; absent: a top-level entry. */
  group?: string | null;
  /** Suite icon classes of the menu entry. */
  icon?: string | null;
  /** Below 768 px a notice replaces the view (`DesktopOnly`). */
  desktopOnly?: boolean;
  /** Default `page`. A record view never has a menu entry; it opens from activation, `navigate` or the URL. */
  open?: ViewOpenMode;
}

/** The built-in kinds' definitions as a discriminated union. */
export type BuiltinViewDefinition =
  | (ViewDefinition<ListKindOptions> & { kind: "list" })
  | (ViewDefinition<FilesKindOptions> & { kind: "files" })
  | (ViewDefinition<DiagramKindOptions> & { kind: "diagram" })
  | (ViewDefinition<CalendarKindOptions> & { kind: "calendar" });

// ---------------------------------------------------------------------------------------------------------------
// Bootstrap metadata shapes (as `Feature\Workspace::views()` and `Field::metadata()` emit them today)
// ---------------------------------------------------------------------------------------------------------------

/** Built-in field storage types (`Blade\Feature\Field` allowlist). */
export type BuiltinFieldType = "text" | "password" | "number" | "select" | "multiselect" | "textarea" | "checkbox" | "file";

/** Client-side validation hints mirroring the server rules (docs/validation.md); the server stays authoritative. */
export interface ValidationRules {
  min_length?: number;
  pattern?: { expression: string; flags?: string; message?: string };
  matches_field?: string;
  unique?: boolean;
}

/** Browser metadata of a `file` field (`Workspace::fieldMetadata`). The field value is the file id. */
export interface FileFieldConfig {
  resource: string;
  mount: string;
  folder_id?: string | null;
  accept?: string[];
  policy?: UploadPolicy | null;
  can_upload?: boolean;
  /** The actor may browse the field's folder (`list` on the mount). */
  can_choose?: boolean;
}

/** One form field (`Field::metadata()`; `FormValidation.ts` `FieldDefinition`). */
export interface FieldMetadata {
  name: string;
  label: string;
  type: BuiltinFieldType;
  required: boolean;
  max: number;
  options: Record<string, string>;
  secret?: boolean;
  defaultValue?: string | null;
  validation?: ValidationRules;
  bulk?: boolean;
  file?: FileFieldConfig;
  /** Registered `fieldTypes` name rendering this field (server `Field` `editor`, JSON `editor`; a dotted name). */
  editor?: string;
}

/** Confirmation the server declares for an action (`Action::$confirm`). Plain text. */
export interface ActionConfirmation {
  message: string;
  title?: string;
  severity?: Severity;
  confirmLabel?: string;
  cancelLabel?: string;
}

/**
 * One offered action (list: `Workspace::views`; files/diagram/calendar: their kind metadata). Calendar actions
 * carry no `fields`; only list actions carry `submitLabel`.
 */
export interface ActionMetadata {
  name: string;
  label: string;
  write: boolean;
  submitLabel?: string;
  icon?: string | null;
  bulk?: boolean;
  /** Field-free GET action usable through `Server.url`. */
  get?: boolean;
  confirm?: ActionConfirmation | null;
  /** A delete that previews references before confirmation. */
  usages?: boolean;
  /** The action receives files through the shared uploader with this policy. */
  upload?: UploadPolicy;
  fields?: FieldMetadata[];
}

/** Derived media column parts (`RecordPresentation.ts` `MediaPart`). */
export type MediaPart = "type" | "resolution" | "duration";

/** One grid/card column (`Workspace.ts` `ViewDefinition["columns"]`, merged with its field by the server). */
export interface ColumnMetadata {
  id: string;
  header: string;
  type?: string;
  /** Media column: the value is a file id of this registered media source resource. */
  media?: string;
  /** `icon`, `image` or a dotted `presentations` name (the server checks the name shape only). */
  presentation?: string;
  /** The field's `editor` (a `fieldTypes` name): its `display` renders the value unless a presentation does. */
  editor?: string;
  /**
   * Static image column (`presentation: "image"`): page-relative directory of the image files (configuration also
   * accepts `image_base`; the server always sends `imageBase`).
   */
  imageBase?: string;
  /** Static image column: the row field holding the image's accessible name (configuration `alt_of` too). */
  altOf?: string;
  /** Derived media column: the media field whose `_media` it presents (configuration `media_of`); with `part`. */
  mediaOf?: string;
  part?: MediaPart;
  options?: Record<string, string>;
  width?: number;
  minWidth?: number;
  maxWidth?: number;
  editable?: boolean;
  secondary?: boolean;
  align?: "left" | "center" | "right";
}

/** A layout tree region (`ViewLayout::metadata()`). */
export interface LayoutRegion {
  id?: "filter" | "grid" | "form";
  header?: string;
  rows?: LayoutRegion[];
  cols?: LayoutRegion[];
  width?: number;
  height?: number;
  minWidth?: number;
  minHeight?: number;
  resizable?: boolean;
  collapsable?: boolean;
  collapsed?: boolean;
}

/** An activation target (docs/workspaces.md#activation); `view:<id>` opens that record view for the row (O5). */
export type ActivationTarget = "details" | "subview" | "page" | `view:${string}` | (string & {});

/**
 * What double-click and Enter run on a record: one target, or a per-row map keyed by the string value of `field`
 * (O5). `"*"` is the default entry; a value without an entry and without `"*"` keeps the default behaviour. The
 * server validates every target at definition time; a target the actor or row is not offered opens the details.
 */
export type Activation = ActivationTarget | { field: string; map: Record<string, ActivationTarget> };

/** The resolved sub-view of a list (`Workspace::views` sub-view resolution). */
export interface SubviewMetadata {
  resource: string;
  field: string;
  /** The same resource (a hierarchy): the parent toolbar acts on a selected child. */
  shared?: boolean;
  /** The child view (its id, title, actions and list options). */
  view?: ViewDefinition<ListKindOptions> & { kind: "list" };
  select?: boolean;
  /** The child has its own page (`embed: false`), the target of `activate: 'page'`. */
  page?: boolean;
}

/** `options` of kind `list`: today's list-specific top-level keys of `Workspace.ts` `ViewDefinition`, unchanged. */
export interface ListKindOptions {
  singleton: boolean;
  columns: ColumnMetadata[];
  detailFields?: ColumnMetadata[];
  filters: FieldMetadata[];
  sortable?: string[];
  layout: { formMode: "overlay" | "panel"; tree: LayoutRegion };
  rowNumbers?: boolean;
  selection?: boolean;
  rowSelection?: boolean;
  rowHeight?: number;
  tileMinWidth?: number;
  tiles?: boolean;
  activate?: Activation;
  search?: { fields: string[] };
  subview?: SubviewMetadata;
  /**
   * Declared client command names (`Registry::view`/`SqlResource::register` `commands`, JSON `view.commands`; dotted,
   * at most 20) shown on the list's toolbar after the view's actions, in this order; an unregistered name is skipped.
   */
  commands?: string[];
}

/** `options` of kind `files`: today's `files` key (`FileManager.ts` `FileManagerConfig`). */
export interface FilesKindOptions {
  mounts: { id: string; label: string }[];
  upload: {
    allowed_extensions: string[];
    max_size_bytes: number;
    multiple: boolean;
    max_files?: number;
    duplicate_policy: string;
    policy: UploadPolicy;
  };
  text: { extension: string; max_bytes: number };
  preview: string[];
  max_depth: number;
}

/** `options` of kind `diagram`: today's `diagram` key (`DiagramView.ts` `DiagramConfig`). */
export interface DiagramKindOptions {
  nodeTypes: { id: string; label: string; glyph: string; color: string; shape: string; custom: boolean }[];
  linkTypes: { id: string; label: string; color: string; style: "solid" | "dashed" | "dotted"; width: number }[];
  glyphs: Record<string, string>;
  shapes: Record<string, string>;
  colors: string[];
  customTypes: boolean;
  maxNodes: number;
  maxLinks: number;
}

/** `options` of kind `calendar`: today's `calendar` key (`CalendarView.ts` `CalendarConfig`). */
export interface CalendarKindOptions {
  views: ("day" | "week" | "month")[];
  default_view: string;
  first_hour: number;
  last_hour: number;
  max_range_days: number;
  day_action: { resource: string; action: string; label: string } | null;
  fields: FieldMetadata[];
}

/** File metadata the media surfaces use (`RecordPresentation.ts` `MediaDescriptor`, row `_media`). */
export interface MediaDescriptor {
  id: string;
  name: string;
  mime_type: string;
  revision: string;
  duration_ms: number | null;
  width: number | null;
  height: number | null;
  thumbnail: "ready" | "pending" | "failed" | "none";
}

// ---------------------------------------------------------------------------------------------------------------
// Presentations, field types and client commands (implemented P3 C-5, docs/toolkit.md#registries)
// ---------------------------------------------------------------------------------------------------------------

/** Rendering size: a grid cell, a card field or a tile. */
export type PresentationSize = "cell" | "card" | "tile";

/**
 * A column value renderer, chosen by `column.presentation`: grid cells (`cell`), card fields and record details
 * (`card`) and the secondary line of a tile (`tile`; a tile's title uses `text`). The built-in `image` is registered
 * here (its media slot in cards and tiles too); `icon` stays framework-internal. A list resolves its columns once
 * when it is created; an unregistered name renders the plain value with one console warning. Must be pure and
 * synchronous: it runs for every visible row.
 */
export interface ColumnPresentation {
  /**
   * HTML for the value. The renderer owns escaping: every record value must pass through `escape` (row data is
   * never trusted). A throw renders the plain escaped text instead and is logged once per column.
   */
  render(value: unknown, row: Row, column: ColumnMetadata, size: PresentationSize, escape: (value: unknown) => string): string;
  /** Plain text for accessible names, tooltips and copy commands; default: the option label or the value. */
  text?(value: unknown, row: Row, column: ColumnMetadata): string;
}

/** Context of a field type in one form. */
export interface FieldTypeContext {
  readonly app: Application;
  /** The Suite Form that holds the item. */
  readonly form: Suite.Form;
  readonly field: FieldMetadata;
  readonly readOnly: boolean;
  /** Aborted when the form is destroyed. */
  readonly signal: AbortSignal;
}

/**
 * A field editor, chosen by `field.editor` (the server still validates the field by its storage `type`): the list's
 * create, update and bulk forms, a singleton's form, `RecordForm`, and the edit window an `editable` grid cell or card
 * field opens (a field type never uses the native Grid cell editor). Filters keep the built-in input. Unknown editors,
 * a throw or an item without the field's name fall back to the storage type's built-in editor (logged).
 */
export interface FieldType {
  /** Suite Form item configuration for the field; its `name` must be the field name so values save normally. */
  input(field: FieldMetadata, value: unknown, readOnly: boolean): Record<string, unknown>;
  /** Brings the item to life after the Form is created (listeners, popups); released through `context.signal`. */
  bind?(context: FieldTypeContext): void;
  /** HTML of the value in grid cells, cards and details; escaping as in `ColumnPresentation.render`. */
  display?(value: unknown, row: Row, field: FieldMetadata, size: PresentationSize, escape: (value: unknown) => string): string;
}

/**
 * What a client command acts on; every command sits in the list's command bar after the view's actions (and moves into
 * the `Műveletek` menu like them). `toolbar`: the view (no record needed); `record`: the toolbar's cursor record, like
 * the built-in record actions (disabled without one). `both` (accepted by `ClientCommand.placement`) means `record`.
 * While a selected sub-view record holds the toolbar, a command the sub-view's list has too (the built-in `details`, a
 * name its view declares; every command of a `shared` sub-view) runs in the sub-view's context; any other stays on
 * the list's own cursor record and marks (docs/toolkit.md#registries).
 */
export type CommandPlacement = "toolbar" | "record";

/** Context of one command run. */
export interface CommandContext {
  readonly app: Application;
  /** The view the record belongs to: the sub-view's for a command it has too while its record holds the toolbar. */
  readonly view: ViewDefinition;
  /**
   * The cursor record of `view`: the sub-view's selected record for a command delegated to it, otherwise the list's
   * own (never a record of another resource); absent without one.
   */
  readonly row?: Row;
  /** Marked rows of `view` (`selection`/`rowSelection` lists), possibly empty (a compact sub-view marks none). */
  readonly rows: readonly Row[];
  /** Aborted when the view closes. */
  readonly signal: AbortSignal;
}

/**
 * A client-side command (for example "copy as text"). It runs in the browser only; anything it changes on the
 * server goes through `app.server.call`, so ACL, validation and audit apply. A rejection shows the error dialog.
 */
export interface ClientCommand {
  /** Source text, translated through `app.i18n.t`. */
  label: string;
  icon?: string;
  /** `both` is the same as `record` (kept from the first P3 contract). */
  placement: CommandPlacement | "both";
  /**
   * Enabled state for the current context, evaluated when the toolbar's record, marks or rows change; default:
   * `toolbar` always, `record` with a cursor record and at most one marked row (like the built-in record actions; a
   * command that acts on the marks declares its own rule). A throw disables it (logged).
   */
  enabled?(context: CommandContext): boolean;
  run(context: CommandContext): void | Promise<void>;
}

// ---------------------------------------------------------------------------------------------------------------
// Components (src/components/*, docs/toolkit.md#components)
// ---------------------------------------------------------------------------------------------------------------

/** A Suite Layout cell (`layout.getCell(id)`), the usual mount target inside a project layout. */
export type LayoutCell = ReturnType<Suite.Layout["getCell"]>;

/** Content a host, cell or window can take: a Suite widget, a public component or a plain element. */
export type Mountable =
  | HTMLElement
  | Suite.Layout
  | Suite.Form
  | Suite.Toolbar
  | Suite.Grid
  | Suite.DataView
  | Suite.Tree
  | Suite.List
  | Suite.Chart
  | Component<any>;

/** Where a component is mounted: an element (filled at 100 %), a Layout cell, an `AppWindow` or a `ViewHost`. */
export type MountTarget = HTMLElement | LayoutCell | AppWindow | ViewHost;

/**
 * Common lifecycle of every public component. The creator owns it: `mount` attaches its root Layout, `destroy`
 * releases everything (widgets, windows it opened, listeners, live subscriptions) and is idempotent. A component
 * created with `signal` destroys itself when the signal aborts. Events are delivered only while mounted.
 */
export interface Component<Events extends object = object> {
  /** The component's root Suite Layout. */
  readonly layout: Suite.Layout;
  /**
   * Places the component once. A second mount or one after `destroy()` throws `Error`; an `AppWindow` or `ViewHost`
   * destroys it when it closes (an already closed one at once); any other target throws `TypeError`.
   */
  mount(target: MountTarget): void;
  /** Idempotent; detaches the root Layout from its Layout cell (an open window or host is emptied). */
  destroy(): void;
  /**
   * Subscribes to a component event (`TypeError` for a non-function); returns the unsubscribe function. With
   * `options.signal`, unsubscribes when it aborts; `destroy()` releases every handler anyway.
   */
  on<K extends keyof Events>(event: K, handler: (payload: Events[K]) => void, options?: SignalOptions): () => void;
}

/** Common constructor options. */
export interface ComponentOptions {
  /** Destroys the component when aborted (pass `host.signal`); anything but an `AbortSignal` throws `TypeError`. */
  signal?: AbortSignal;
}

/**
 * A view reference: an offered view id, or a definition the caller already holds. Every component throws `Error` for
 * an id that is not offered to the actor and `TypeError` for a view of the wrong kind or shape.
 */
export type ViewReference<Options> = string | ViewDefinition<Options>;

/**
 * Options of `ListView` (the list's constructor arguments as one object). `view` must be a list view (kind `list`): an
 * id that is not offered throws `Error`, any other view `TypeError`, as does `compact` without `scope`.
 */
export interface ListViewOptions extends ComponentOptions {
  view: ViewReference<ListKindOptions>;
  /** Nested list limited to `field` = `id` (today's `WorkspaceScope`). */
  scope?: { field: string; id: string; select?: boolean };
  /** A compact preview (sub-view row style): sortable headers only, no toolbar; `height` receives its content height. */
  compact?: { height(pixels: number): void };
  /** Filters the list opens with instead of the saved ones (declared filters only). */
  filters?: Record<string, string>;
}

/** Events of `ListView`. */
export interface ListViewEvents {
  /** The cursor record changed (`undefined`: none). */
  select: { row: Row | undefined };
  /**
   * Double-click/Enter resolved to `target` for `row` (after the activation map and its fallbacks), reported before it
   * runs; `details` also for a card or tile without a declared target and for the `#` cell.
   */
  activate: { row: Row; target: ActivationTarget };
  /**
   * A form of the list (create, update, a record action with fields, the singleton's Save) or an inline cell/card edit
   * (`action` `update`) saved; `row` is the server's answer (for an edit: the row with the saved values).
   */
  saved: { action: string; row: Row };
  /** The loaded window changed (load, live update, delete). */
  changed: { rows: readonly Row[]; total?: number; matched?: number };
}

/**
 * The framework list (grid, cards, tiles, filters, search, forms, sub-views, live, preferences); the built-in `list`
 * kind mounts it (`src/components/list`). `destroy` also closes its forms, details and sub-view windows.
 */
export interface ListView extends Component<ListViewEvents> {
  editing(): boolean;
  refresh(): void;
  /** The cursor record. */
  selected(): Row | undefined;
  /** Replaces the filters (declared filters only; other fields are ignored) and reloads. */
  setFilters(filters: Record<string, string>): void;
}

/** Options of `RecordForm`: one action form described by `Server.form`. */
export interface RecordFormOptions extends ComponentOptions {
  resource: string;
  /** Action name (`create`, `update` or a record action with fields). */
  action: string;
  id?: string | null;
  /** Initial values overriding the described ones (never sent unless they are fields of the action). */
  values?: Record<string, unknown>;
}

/** Events of `RecordForm`. */
export interface RecordFormEvents {
  /** The action succeeded: `action` is the submitted action's name, `result` its `data` (what `submit()` resolves). */
  saved: { action: string; result: unknown };
  cancel: Record<string, never>;
  /** A field value changed (dirty tracking). */
  changed: { field: string; value: unknown };
}

/** A framework action form (validation parity, file fields, field types, Cancel + submit row). */
export interface RecordForm extends Component<RecordFormEvents> {
  /**
   * Validates and submits; rejects with `ServerFailure` after showing field errors in the form (or the error dialog).
   * A client-side validation failure sends nothing and rejects with status 400 and the field errors, the server's own
   * shape; a declined confirmation (the action's `confirm` from an offered view) rejects with an `AbortError`.
   */
  submit(): Promise<unknown>;
  values(): Record<string, unknown>;
  dirty(): boolean;
}

/** Options of `RecordDetails`. */
export interface RecordDetailsOptions extends ComponentOptions {
  view: ViewReference<ListKindOptions>;
  /** The row to show, or a record id (loaded through the view's `get`). */
  record: Row | string;
}

/** Read-only record details as the list's `Adatok` command shows them (`recordFields`). */
export interface RecordDetails extends Component<Record<string, never>> {
  /** Shows another row (no request) or loads another id (a newer call wins); a failed load shows the error dialog and rejects. */
  show(record: Row | string): Promise<void>;
}

/** Options of `FileManager` (implemented P3 C-2). */
export interface FileManagerOptions extends ComponentOptions {
  /**
   * A files view: an offered view id or a held definition of any kind with a `resource`, its `actions` and
   * `FilesKindOptions` (at least one mount). A string that is not offered throws `Error`; a wrong shape `TypeError`.
   */
  view: ViewReference<FilesKindOptions>;
}

/**
 * Two-panel virtual file manager (`components/files/FileManager.ts` over `FileManager.ts`), the same class as the
 * built-in `files` kind; what it offers follows the view's `actions`. `opened` fires each time the viewer or the text
 * editor shows a file (also on previous/next). `destroy()` also closes its windows and aborts its pending reads.
 */
export interface FileManager extends Component<FileManagerEvents> {}

/** Events of `FileManager`. */
export interface FileManagerEvents {
  /** The viewer or the text editor showed a file (also on previous/next). */
  opened: { id: string; mime_type: string };
}

/** Options of `FilePicker.pick`. */
export interface FilePickerOptions {
  /** A `file` field's configuration (`FieldMetadata.file`, as `Server.form` describes it). */
  field: FileFieldConfig;
  /** Field label shown in the window title. */
  title: string;
  /** Currently chosen file id, preselected. */
  current?: string;
  signal?: AbortSignal;
}

/** The modal tiles picker of `file` fields (`FilePicker.ts`; implemented P3 C-2 as `components/files/FilePicker.ts`). */
export interface FilePicker {
  /**
   * Opens the picker over the field's folder (`folder_id`, otherwise the mount root), limited to its accepted MIME
   * classes. Resolves the chosen file or `null` (Cancel, Escape, abort; an already aborted signal opens nothing).
   * Malformed options throw `TypeError` before anything opens.
   */
  pick(options: FilePickerOptions): Promise<MediaDescriptor | null>;
}

/** Options of `Calendar` (implemented P3 C-2). */
export interface CalendarOptions extends ComponentOptions {
  /**
   * A calendar view: an offered view id or a held definition of any kind with a `resource`, its `actions` and
   * `CalendarKindOptions`. A string that is not offered throws `Error`; a wrong shape throws `TypeError`.
   */
  view: ViewReference<CalendarKindOptions>;
}

/**
 * Event calendar over Scheduler Standard (`components/calendar/Calendar.ts` over `CalendarView.ts`), the same class
 * as the built-in `calendar` kind. Writes go through the view resource's `create`/`update`/`delete`; read-only when
 * neither `create` nor `update` is offered. One instance per page: constructing a second Calendar before the first
 * is destroyed throws `Error`.
 */
export interface Calendar extends Component<Record<string, never>> {}

/** Options of `DiagramEditor` (implemented P3 C-2). */
export interface DiagramEditorOptions extends ComponentOptions {
  /** A diagram view: an offered view id or a held definition with a `resource`, `actions` and `DiagramKindOptions`. */
  view: ViewReference<DiagramKindOptions>;
}

/**
 * Visual diagram editor (`components/diagram/DiagramEditor.ts` over `DiagramView.ts`), the same class as the
 * built-in `diagram` kind. `saved` fires after the open diagram's content was saved; read-only without `save`.
 */
export interface DiagramEditor extends Component<DiagramEditorEvents> {
  /** `true` while the open diagram has unsaved changes. */
  editing(): boolean;
}

/** Events of `DiagramEditor`. */
export interface DiagramEditorEvents {
  /** The open diagram's content was saved (`Mentés`, Ctrl+S). */
  saved: Record<string, never>;
}

/**
 * Media source of `MediaPlayer`: a GET-capable action (`app.server.url`, fetched by the element with the session cookie
 * and HTTP Range requests), a URL the caller owns (same origin or `blob:`), or a Blob the player turns into an object
 * URL and revokes on `destroy()`.
 */
export type MediaSource =
  | { resource: string; action: string; id: string; version?: string }
  | { url: string }
  | { blob: Blob };

/** Options of `MediaPlayer` (P3 C-3, extracted from the file manager's image viewer and video player). */
export interface MediaPlayerOptions extends ComponentOptions {
  source: MediaSource;
  /** MIME type of the source (`image/*`, `video/*`, `audio/*`); decides the element. Any other type throws `TypeError`. */
  mime: string;
  /** Accessible name and image `alt` (plain text; the audio stage shows it); default the localized `Médiatartalom`. */
  name?: string;
  /** Plain text appended to the toolbar's dimensions, length and format (the file manager passes the file size). */
  info?: string;
  /** The player's toolbar (image zoom/rotation; video/audio loop and speed; the info text). Default true. */
  toolbar?: boolean;
  /** Native controls (default true). */
  controls?: boolean;
  loop?: boolean;
  autoplay?: boolean;
  muted?: boolean;
  playbackRate?: number;
}

/** Events of `MediaPlayer`. */
export interface MediaPlayerEvents {
  /** Metadata known: duration in seconds (0 for images), natural size for images and videos. */
  loaded: { duration: number; width?: number; height?: number };
  /** Playback position, at most every 250 ms while playing, on pause and after every `seek`. */
  position: { seconds: number };
  ended: Record<string, never>;
  /** The source cannot be shown or played; `message` is localized (also shown in the toolbar). */
  error: { message: string };
}

/**
 * Image, video and audio player with the framework's look and keyboard handling (media element: Space/K play or
 * pause, arrows seek 5 s, Home/End; image stage: `+`, `-`, `0`). Media methods do nothing for images.
 */
export interface MediaPlayer extends Component<MediaPlayerEvents> {
  /** Resolves when playback starts; rejects like `HTMLMediaElement.play()` (for example a refused autoplay). */
  play(): Promise<void>;
  pause(): void;
  /** Clamped to `0 … duration()`; emits `position` when the seek completes. */
  seek(seconds: number): void;
  position(): number;
  /** Seconds; 0 until the metadata is known and for images. */
  duration(): number;
  /** Moves the keyboard focus to the media element or the image stage. */
  focus(): void;
}

/**
 * Message between a `SandboxFrame` and its document (`postMessage`, structured clone). `id` is unique per sender
 * (1–64 characters); `type` `load`, `ready` and `error` are reserved for the protocol, project types are dotted
 * registry names (at most 128 characters). Anything else is a protocol violation.
 */
export interface SandboxMessage<T = unknown> {
  blade: 1;
  id: string;
  type: string;
  payload: T;
}

/** Payload of the parent's `load` message. */
export interface SandboxLoad {
  /** Untrusted script source, run inside the opaque-origin frame only (O7) as the body of an async function. */
  code: string;
  /** Named data the code may use (media as Blobs; the frame turns them into `blob:` URLs). */
  files: Record<string, Blob | string>;
}

/** Options of `SandboxFrame` (toolkit C-4). */
export interface SandboxFrameOptions extends ComponentOptions {
  /** Maximum UTF-8 size of `code` (default 1 MiB) and total size of `files` (default 32 MiB); a larger load fails with `size`. */
  maxCodeBytes?: number;
  maxFileBytes?: number;
  /** `ready` must arrive within this many ms after `load` (default 10 000), otherwise `error` with `timeout` and the frame is removed. */
  readyTimeout?: number;
  /** Accessible name of the iframe (default: the translated `Tartalom`). */
  title?: string;
}

/**
 * Events of `SandboxFrame` (delivered while mounted). Every failure is also the page's `sandbox:error` event, mounted or
 * not. A frame document reports only the first failure its own messages cause (`error`, or `protocol` for an invalid
 * or reserved message); its later ones are dropped.
 */
export interface SandboxFrameEvents {
  ready: Record<string, never>;
  /**
   * `error`: the frame reported a throw, rejection or uncaught error (`message` is the frame's untrusted text, at most
   * 1000 characters plus an ellipsis; the frame's own protocol violations arrive here too); `timeout`: no `ready` in time; `size`: a limit was exceeded; `protocol`: an invalid or reserved
   * message, or the frame document navigated or reloaded (the frame is then removed).
   */
  error: { message: string; code: SandboxErrorCode };
  /**
   * A project message from the frame (reserved types are not delivered here), while its document lives: also before
   * `ready` and after an `error`.
   */
  message: { type: string; payload: unknown };
}

/** Code of a `SandboxFrame` failure (`error` event, `sandbox:error`, `SandboxError`). */
export type SandboxErrorCode = "error" | "timeout" | "size" | "protocol";

/** Rejection of `SandboxFrame.load()` for a frame failure: `message` and `code` are the `error` event's. */
export interface SandboxError extends Error {
  readonly code: SandboxErrorCode;
}

/**
 * `<iframe sandbox="allow-scripts">` running `dist/sandbox.html` beside `admin.js` (opaque origin: no cookies, no
 * session, no CSRF). The parent accepts only messages whose `source` is its own frame and whose origin is `"null"`;
 * everything the frame sends, `ready` and `error` included, is untrusted input. Inside the frame the code sees
 * `blade.on(type, handler)`, `blade.post(type, payload)` and `blade.files`. `destroy()` removes the frame at once
 * (kill switch). Never pass the frame data the actor may not see: it can always navigate itself and leak it.
 */
export interface SandboxFrame extends Component<SandboxFrameEvents> {
  /**
   * Checks the limits, replaces the frame document and sends `load`; resolves on `ready`, rejects with a `SandboxError`
   * (its `code` is the `error` event's code), with an `AbortError` when a later `load` or `destroy()` replaces it, or
   * with a `TypeError` for malformed arguments (a plain `Error` when `sandbox.html` cannot be located beside `admin.js`).
   * Mount the component first: the timeout runs from this call.
   */
  load(code: string, files?: Record<string, Blob | string>): Promise<void>;
  /** Sends a project message (dotted type); throws before `ready`, does nothing after `destroy()`. */
  post(type: string, payload?: unknown): void;
}

/** One command bar item: a button (`type` omitted or `button`) or a spacer, which needs no id. */
export type CommandItem = CommandButton | CommandSpacer;

/** A command bar button; its `id` is what `click` reports and `update` addresses. */
export interface CommandButton {
  type?: "button";
  id: string;
  /** Plain text (escaped). */
  label: string;
  icon?: string;
  disabled?: boolean;
  hidden?: boolean;
}

/** Pushes the following items to the right (left out of the collapsed `Műveletek` menu). */
export interface CommandSpacer {
  type: "spacer";
}

/** Options of `CommandBar`. Button ids are `[A-Za-z0-9_.:-]+` and unique (`blade-command-menu` is reserved); otherwise `TypeError`. */
export interface CommandBarOptions extends ComponentOptions {
  items: CommandItem[];
}

/**
 * The framework's responsive toolbar (`ResponsiveToolbar.ts`): collapses into `Műveletek` when it does not fit or below
 * 768 px. Escape closes an open menu (also one opened with the mouse) and returns the focus to its toggle.
 */
export interface CommandBar extends Component<CommandBarEvents> {
  readonly toolbar: Suite.Toolbar;
  update(id: string, changes: Partial<Omit<CommandButton, "id" | "type">>): void;
}

/** Events of `CommandBar`. */
export interface CommandBarEvents {
  /** An item was clicked, also from the collapsed `Műveletek` menu. */
  click: { id: string };
}

/** A component class bound to the application. */
export type ComponentClass<Options, Instance> = new (options: Options) => Instance;

/** `Application.components`. Each class needs no shell internals beyond the `Application` it is bound to. */
export interface Components {
  readonly ListView: ComponentClass<ListViewOptions, ListView>;
  readonly RecordForm: ComponentClass<RecordFormOptions, RecordForm>;
  readonly RecordDetails: ComponentClass<RecordDetailsOptions, RecordDetails>;
  readonly FileManager: ComponentClass<FileManagerOptions, FileManager>;
  readonly FilePicker: FilePicker;
  readonly Calendar: ComponentClass<CalendarOptions, Calendar>;
  readonly DiagramEditor: ComponentClass<DiagramEditorOptions, DiagramEditor>;
  readonly MediaPlayer: ComponentClass<MediaPlayerOptions, MediaPlayer>;
  readonly SandboxFrame: ComponentClass<SandboxFrameOptions, SandboxFrame>;
  readonly CommandBar: ComponentClass<CommandBarOptions, CommandBar>;
}
