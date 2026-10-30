# Toolkit plan: opening 61ade to project code

Status: accepted direction ([ADR-0005](decisions/0005-toolkit.md),
[FB-0081](feedback.md#fb-0081)); P0 done, P1 contract accepted at gate G1 (2026-10-29) in the
[toolkit reference](toolkit.md); P2 (G2), P3 (G3) and P4 feature demo done, gate G4 passed (2026-10-30);
P5 documentation, P6 consumer handoff and P7 verification and reviews done (2026-10-30); gate G5 open. Written 2026-10-29 for execution
by a coordinating agent with sub-agents in a new thread. Breaking changes are
accepted; consumers adapt themselves.

This plan is the single brief for that thread. Section 11 is the operating
procedure for the agents; sections 1–10 are the content.

## 1. Goal and non-goals

**Goal.** A project builds its admin with 61ade the way an Ext JS application
is built with Ext JS: it declares what is declarative, and writes its own
frontend (and backend) code with 61ade's public services, components and
registries where it needs more. 61ade's own screens use the same API.

Acceptance in one sentence: the StoryBloX asset viewer (61ade toolbar and
form, a stage cell with an audio player or a sandboxed, agent-written scene
driven by a timeline, opened by double-click only for audio/scene records) can
be written entirely in the project, and the feature demo contains a synthetic
equivalent built only through the public API.

**Non-goals.** No component-parity programme with Ext JS (FB-0037 stands); no
second UI library; no `eval` of configuration strings in the admin origin; no
loosening of server-side authorization; no new environment, deployment or
backup workflow; no change to `_AuthHandler`.

## 2. Diagnosis (verified 2026-10-29)

| Finding | Evidence |
| --- | --- |
| The bundle exports nothing; it only boots `AdminShell`. | `packages/frontend/src/admin.ts`; `package.json` exports only `dist/admin.{js,css}` |
| The shell page loads only `admin.js` (plus skin CSS); no project script hook. | `packages/php/templates/shell.php` |
| View kinds are hard-coded in both tiers. | `AdminShell.openView` (`AdminShell.ts` ~l.278–299: Calendar/Diagram/Files/Workspace); `Feature/Workspace::views` (`kind` branches ~l.53–63); `Registry::view/fileManager/diagram/calendar` |
| View identity = resource; route `#feature=<resource>`; menu ids `feature:<resource>`. | `AdminShell.route`, `renderMenu` (~l.82, 250–259) |
| Six components each carry their own JSON transport with the CSRF header. | `X-BLADE-CSRF` in `Workspace`, `FileManager`, `Calendar`, `DiagramEditor`, `Uploader`, `Realtime` |
| Components have positional constructors bound to shell internals. | `new Workspace(host, view, csrf, live, userId, scope, preset)` |
| Media viewer is private to the file manager; image/video only. | `FileManager.openImage/openVideo` (~l.940–1040); `FileManagerDefinition::PREVIEW_TYPES`; `MediaProbe::DEMUXERS` |
| The server already has toolkit-like parts. | `Action`, `Field`, `SqlResource`, `ListSource`, `UploadPolicy`, `DownloadStream` (any MIME, Range), handlers, `Registry` |
| Shell CSP allows same-origin scripts and frames only. | `Shell/Application::headers` (`script-src 'self'`, no `frame-src` → `default-src 'self'`) |
| Empty placeholders show the intended structure. | `packages/frontend/src/{api,app,components/*,renderer,shell,state,...}/.gitkeep`; `examples/demo-app/frontend/` empty |
| `component-matrix.md` already says "Custom client code uses registered modules", never implemented. | `docs/component-matrix.md#bővítés-módja` |
| Guards: one guarded check at a time; browser tests only against the managed URL served from this checkout. | `tools/run-dev-check.sh` lock; `docs/development.md` browser-test sections |

## 3. Fixed decisions and open decisions

Fixed by the owner: toolkit direction; projects may restructure themselves;
existing demos are transformed rather than adding a separate synthetic demo;
starter admin and tenant demo stay declarative; both trusted modules and the
sandboxed frame are in scope.

Open decisions. Each has a recommended default; the coordinator proceeds with
the default unless the owner overrides it at the P1 gate.

| # | Question | Recommended default |
| --- | --- | --- |
| O1 | How a project module gets the API | Dependency injection: the shell `import()`s each declared module and calls its default export with the `Application` object. No import map (inline importmap would need a CSP hash/nonce; importing `admin.js` by URL twice would create a second module instance because the shell loads it with `?v=`). Types come from a published `admin.d.ts`. |
| O2 | Module language/build | Plain ES modules are accepted; TypeScript is recommended and built by the project. 61ade publishes `dist/admin.d.ts` and documents an esbuild recipe. The feature demo uses TypeScript built by `tools/build.mjs`. |
| O3 | View identity | New view `id` (`[a-z][a-z0-9_.-]*`, unique per application), independent of `resource`. Default `id` = resource for existing list/file/diagram/calendar views, so declarations change little. Route `#view=<id>[&record=<id>][&filter.<f>=<v>]`; `#feature=` is dropped (breaking; UI preference keys migrate once). |
| O4 | Record views | A view may declare `record: <resource>`: it opens for one record, receives the id, and the server resolves the row through that resource's `get` action (ACL, field ACL, tenant). Opened from activation, a record action, `app.navigate()` or the URL. Rendered in the workspace or a document window (`open: "page" \| "window"`). |
| O5 | Per-record activation | `activate` accepts a map keyed by a column value: `{"field": "kind", "map": {"audio": "view:asset-player", "scene": "view:scene-player", "*": "details"}}`. The server validates targets; the client chooses per row. Existing values (`details`, `subview`, `page`, action name) keep working; `view:<id>` is new. |
| O6 | Sandbox document | A static `dist/sandbox.html` + `sandbox.js` bootstrap with a meta CSP, loaded in `<iframe sandbox="allow-scripts">` (opaque origin, no cookies). The parent fetches code and data through actions and sends them by `postMessage`; the bootstrap runs the code inside the frame. `shared_assets.files` grows by these two files (breaking for consumers' `.deploy.json`). |
| O7 | Running untrusted code inside the sandbox | Allowed (`new Function`/blob script inside the opaque-origin frame only). R8's "no eval/executable configuration strings" is clarified to apply to configuration and the admin origin. |
| O8 | Project CSS | `stylesheets` list in the application definition, same path rules as `modules`. |
| O9 | Project translations | Modules call `app.i18n.t`; project messages merge into the server-provided catalog from the application's locale resources (existing mechanism to be confirmed in P1); no client-side catalog loading. |
| O10 | DHTMLX exposure | `app.dhx` is the Suite namespace instance the shell uses (Standard edition, GPL obligations per `component-matrix.md`); Scheduler only through the Calendar component. |
| O11 | API stability | `app.apiVersion = 1`. Until the transition closes, breaking changes are allowed with a feedback entry; afterwards they follow `development.md#breaking-changes`. |

## 4. Target architecture

### 4.1 Layers

1. **Kernel services** (`src/api/`): `Server` (one JSON transport: `call`, `url`, error shape, field errors, abort), `Events` (typed bus, the existing `upload:*` events included), `I18n`, `Theme`, `Preferences`, `Live`, `Identity`, `Navigation`.
2. **Components** (`src/components/`): public classes with options objects: `ListView` (today's `Workspace`), `RecordForm`, `RecordDetails`, `FileManager`, `FilePicker`, `Calendar`, `DiagramEditor`, `MediaPlayer`, `SandboxFrame`, `CommandBar` (responsive toolbar), layout helpers. Each has `mount(target)`, `destroy()`, events, and needs no shell internals beyond the `Application`.
3. **Registries** (`src/app/registries.ts`): `views` (kind → factory), `presentations` (column renderer), `fieldTypes` (form/grid editor), `commands` (client-side action handlers and toolbar commands), `activations` (resolved by O5).
4. **Shell** (`src/shell/`): login, menu, status bar, routing, view host; it opens views only through the `views` registry.
5. **Application modules**: framework built-ins (`src/app/builtins.ts` registers list/files/diagram/calendar) and project modules (loaded by O1).

### 4.2 Public API sketch (to be finalised in P1, `src/api/types.ts`)

```ts
export type ApplicationModule = (app: Application) => void | Promise<void>;

export interface Application {
  readonly apiVersion: 1;
  readonly dhx: typeof import("@dhtmlx/suite");
  readonly server: {
    call<T = unknown>(resource: string, action: string,
      options?: { id?: string | null; values?: Record<string, unknown>; signal?: AbortSignal }): Promise<T>;
    url(resource: string, action: string, id: string, version?: string): string;
  };
  readonly ui: {
    dialog(options: DialogOptions): Promise<boolean>;
    choice(options: ChoiceOptions): Promise<string | null>;
    toast(text: string, severity?: "neutral" | "warning" | "danger"): void;
    window(options: WindowOptions): AppWindow;          // framework-sized, themed, closable
  };
  readonly uploads: UploadsApi;                          // opens the framework uploader for an upload action
  readonly i18n: { t(key: string, params?: Record<string, unknown>): string; locale(): string };
  readonly theme: { current(): string; onChange(fn: (theme: string) => void): () => void };
  readonly preferences: Preferences;                     // per user/view, browser-local
  readonly live: LiveApi;                                // list subscriptions on the tab's channel
  readonly events: EventBus;
  readonly identity: { id: string; displayName: string };
  readonly views: Registry<ViewKind>;
  readonly presentations: Registry<ColumnPresentation>;
  readonly fieldTypes: Registry<FieldType>;
  readonly commands: Registry<ClientCommand>;
  readonly components: Components;                       // ListView, RecordForm, MediaPlayer, SandboxFrame, ...
  navigate(target: { view: string; record?: string; filters?: Record<string, string> }): void;
}

export interface ViewKind<Options = unknown> {
  create(host: ViewHost, view: ViewDefinition<Options>): ViewInstance | Promise<ViewInstance>;
}
export interface ViewHost {
  readonly app: Application;
  readonly signal: AbortSignal;                          // aborted when the view closes
  readonly record?: { id: string; row: Record<string, unknown> };
  attach(content: import("@dhtmlx/suite").Layout | HTMLElement): void;
  setTitle(text: string): void;
}
export interface ViewInstance { destroy(): void; editing?(): boolean; refresh?(): void }
```

`ViewDefinition` is what the server sends for a view: `id`, `kind`, `title`,
`resource?`, `record?`, `actions` (with fields, as today), `options` (kind
configuration: JSON, browser-safe), `group`, `icon`, `desktopOnly`.

### 4.3 Server side

- `Blade\Feature\View` value object (id, kind, title, resource, record, actions, options, group, icon, desktopOnly, open) and `Registry::addView(View)`. The existing `view()/fileManager()/diagram()/calendar()` become builders returning `View`s of the built-in kinds; their option payloads move into `options`.
- A kind provider interface for server-side metadata (`ViewKindProvider::metadata(Context, View): array`), replacing the `kind` branches in `Workspace::views`; built-ins register providers. Custom kinds use a generic provider: options pass through after a JSON-safety and size check; visibility follows the same ACL rule as today's views.
- `ApplicationDefinition`: `modules` and `stylesheets` (relative browser paths, same validation as `assets`, versioned with `version`), rendered by `templates/shell.php`; JSON `application.modules/stylesheets`.
- JSON module configuration: `view.id`, `view.kind`, `view.record`, `view.options`, `view.open`, and the O5 `activate` map (`docs/configuration.md`).
- Record context: `get` resolution for record views; navigation to a record view the actor cannot read falls back exactly like activation does today.
- Media: audio MIME types in `FileManagerDefinition` (upload allowlist, `PREVIEW_TYPES`), `MediaProbe` duration/codec for audio (ffprobe), file-manager viewer opens audio with `MediaPlayer`.
- No new endpoint is required: modules use the existing action endpoint, GET actions and `DownloadStream`.

### 4.4 Sandbox frame

`SandboxFrame` component + `dist/sandbox.{html,js}`. Protocol (versioned
message envelope `{blade: 1, id, type, payload}`), parent → frame:
`load(code, files)`, arbitrary project messages; frame → parent: `ready`,
`error`, project messages. The parent validates `event.source` (its own frame)
and the `null` origin; the frame never receives the CSRF token or the session.
Size/time limits and a kill switch (`destroy()` removes the frame). The meta CSP
of `sandbox.html` allows only `blob:`/inline execution needed by the bootstrap,
`data:`/`blob:` media and no network (`connect-src 'none'`). Exact CSP to be
verified in Chromium during P3; record browser support.

### 4.5 Security model

- Trusted project modules run with the user's session; they are project code
  (same trust as its PHP handlers). The shell loads only paths declared on
  the server, from the application's own origin.
- Server authorization is unchanged: every module call goes through actions.
- Untrusted code: only in `SandboxFrame`.
- Backend-only data never enters view `options`.
- Security review of module loading, `options` pass-through, `postMessage`
  handling and the sandbox CSP is a required P7 task.

### 4.6 Packaging

- `dist/admin.js` stays a single ESM bundle (no chunks, so the consumer
  `shared_assets` copy stays simple); new `dist/admin.d.ts` (tsc
  `emitDeclarationOnly` from `src/api/index.ts`, development use only) and
  `dist/sandbox.{html,js}`.
- `tools/build.mjs --check` covers all tracked dist files.
- `packages/frontend/package.json` exports `./admin.d.ts` and the sandbox files.

## 5. Rules and documentation to rewrite

| Document | Change |
| --- | --- |
| `docs/development.md#mandatory-framework-development-rules` | Toolkit rules: what the project writes (modules, kinds, handlers), what stays mandatory, trust model; remove "no application-specific frontend". |
| `docs/usage.md` | New "Toolkit and project modules" section; update direction and activation lines. |
| `docs/toolkit.md` (new) | API reference and guide: module loading, every service/component/registry with examples, record views, activation map, sandbox, packaging, TypeScript recipe, migration guide. Canonical public contract. |
| `docs/shell.md` | Remove "consumers have no shell HTML/CSS/JS layer"; routing `#view=`; modules/stylesheets; view host. |
| `docs/workspaces.md` | `ListView`/`RecordForm` public use; view ids; activation map and `view:` targets. |
| `docs/files.md`, `docs/uploader.md` | Audio; `MediaPlayer`; public `FileManager`/`FilePicker`/uploads API. |
| `docs/configuration.md` | `application.modules/stylesheets`, `view.id/kind/record/options/open`, activation map. |
| `docs/concept.md`, `docs/product-direction.md` | R2/R3 toolkit wording; R8 clarification (O7); evidence rows; event catalog entries for module load failures and sandbox errors. |
| `docs/component-matrix.md`, `docs/repository-layout.md` | Public components; project frontend location. |
| `docs/demos.md` | Feature demo as toolkit consumer; table rows; continuous-extension rule includes toolkit examples; starter/tenant remain declarative. |
| `docs/decisions/0002`, `0004` | Supersession notes pointing to ADR-0005. |
| `.agents/skills/61ade-consumer/SKILL.md` | Module setup, `.deploy.json` files list, d.ts, sandbox, migration steps. |
| `.agents/skills/grid-tree-card-ui` | Check that its rules address `ListView` composition and custom presentations. |
| `AGENTS.md` | Only if wording conflicts (it says "extend the framework first", which stays true for 61ade work). |
| `docs/feedback.md` | FB entries per phase with verification; close FB-0080 items. |

## 6. Feature demo transformation

The feature demo (`examples/demo-app/application.php`, `https://61ade.sanch.hu/`)
becomes a toolkit consumer. It keeps declarations where they suffice and adds
code where the toolkit is the point. Every row below replaces or extends an
existing demo area; no separate showcase application.

| ID | Area | Change | Proves |
| --- | --- | --- | --- |
| D0 | Build | `examples/demo-app/frontend/src/*.ts` → `examples/demo-app/public/app/demo.js` via `tools/build.mjs` (second entry, `--check` included), declared in `application.php` `modules`. | Module loading, d.ts, recipe |
| D1 | Signage `Médiatár` | Synthetic audio assets (generated tones, WAV/MP3/M4A, committed as small fixtures); audio upload; record view `demo.asset-viewer`: Layout with 61ade `CommandBar` (play, pause, position, loop), `RecordDetails`, stage cell with `MediaPlayer` (image/video/audio); activation map: audio/video → viewer, image → details. | Record views, per-record activation, composition, MediaPlayer, audio |
| D2 | Signage `Napi műsor` | A separate menu entry beside the calendar (whose `Napi műsor (API)` day button with the bare API answer stays): the custom kind `demo.playlist-preview`, a timeline of the day's playlist (from `signage_playlist.day`), playhead driving `MediaPlayer` for assets and a `SandboxFrame` for a synthetic "scene" asset whose code (a small canvas animation with `load/duration/renderAt(t)/play/pause/seek`) is delivered by an action. Keep showing the API request. | Sandbox, timeline/StoryBloX pattern, module ↔ frame protocol |
| D3 | `Mérések` | A dashboard page kind: `ListView` of measurements + DHTMLX Chart cell + own summary, linked by selection/filter; one custom column presentation (inline bar/sparkline) registered by the module and used in the list declaration. | Composition of framework components, presentation registry |
| D4 | `Tasks` | A custom field type (for example a priority rating editor) used in form, grid and card; a client command (for example "Copy as text") on the list toolbar. | Field-type and command registries |
| D5 | Built-ins | List, file manager, diagram and calendar open through the registry; no demo-visible change. | Dogfooding |
| D6 | Starter `/admin/`, tenant `/tenants/` | Unchanged and declarative; contract test asserts they declare no modules. | Declarative path stays complete |

Existing browser specs must stay green after each step; they are the
regression proof that the opened architecture behaves like the closed one.

## 7. Consumer migration

61ade sessions do not edit consumer projects. The coordinator produces, in
`docs/toolkit.md#migration`, an exact list of breaking changes and steps, and
a handoff note per consumer (StoryBloX, allflow; confirm the inventory in P0).
Expected breaking items: view ids and `#view=` routes (bookmarks, any code
using `#feature=`), `Registry` view builder signatures and option placement,
JSON `view` keys, `.deploy.json` `shared_assets.files`, UI preference keys,
removed internal globals if any. StoryBloX's requested viewer (its D-019 to
D-021) is then built in StoryBloX on the public API, using D1/D2 as reference.

## 8. Work breakdown

IDs are referenced by agents and feedback entries. "Lane" = can run in
parallel with other lanes of the same phase.

### P0 — Preparation (coordinator)

- P0.1 Settle the working tree: the FB-0079 changes in progress are committed
  or explicitly parked by the owner before any toolkit edit.
- P0.2 Baseline: run the PHP checks and all browser specs listed in
  `docs/demos.md#ellenőrzés` and topic guides; record pass/fail and durations
  in a scratch note under `tmp/`.
- P0.3 Consumer inventory (read-only): locate the StoryBloX and allflow
  development checkouts and list every 61ade API they use (PHP classes,
  `Registry` calls, JSON keys, routes, deploy config).
- P0.4 Confirm O9 (how project messages reach `t()`), and record findings.

### P1 — Contracts (sequential; owner gate at the end)

- P1.1 `src/api/types.ts`: the complete public type surface (4.2) with doc
  comments; `src/api/index.ts` exports.
- P1.2 PHP contract: `View`, `ViewKindProvider`, `Registry::addView`,
  `ApplicationDefinition::modules/stylesheets`, JSON keys; written as
  interfaces and documented signatures, no behaviour yet.
- P1.3 `docs/toolkit.md` skeleton with the API reference generated from P1.1/P1.2
  and the open decisions O1–O11 resolved.
- P1.4 ADR-0005 consequences updated with the resolved decisions.
- **Gate G1:** owner reviews P1.1–P1.3 (short summary in Hungarian plus links).

### P2 — Kernel (two lanes; one owner per hot file)

- Lane K-F (frontend), owns `AdminShell.ts`, `admin.ts`, `src/api/*`, `src/app/*`:
  - K-F1 `Server` transport; replace the six private transports.
  - K-F2 `Events`, `I18n`, `Theme`, `Preferences`, `Live`, `Identity` services over the existing modules.
  - K-F3 Registries and `Application` object; module loader (O1) with error reporting (toast + event + console; a failing module never blocks the shell).
  - K-F4 Routing `#view=…&record=…`; menu ids from view ids; preference key migration.
  - K-F5 Built-in kinds registered in `src/app/builtins.ts`; `openView` dispatches only through the registry; `ViewHost` with abort signal.
- Lane K-S (server), owns `Feature/Registry.php`, `Feature/Workspace.php`, `Feature/View*.php`, `Shell/*`, `templates/shell.php`, `Configuration/*`:
  - K-S1 `View` + providers; built-in builders on top; metadata shape `options`.
  - K-S2 `modules`/`stylesheets` (definition, JSON, template, path validation, version suffix).
  - K-S3 Record views (`record`, `open`), `view:` activation target and O5 map, with validation and ACL fallbacks.
  - K-S4 PHP checks: extend `tests/shell/contracts.php`, `configuration.php`, `lists.php`; new `tests/shell/toolkit.php`.
- Integration step (coordinator): merge K-F/K-S, `npm run typecheck`, `npm run build`, all PHP checks, all existing browser specs. **Gate G2:** zero regressions.

### P3 — Public components and capabilities (parallel lanes)

- C-1 `ListView`/`RecordForm`/`RecordDetails`/`CommandBar`: options-object constructors, mountable in any cell or window, events (`select`, `activate`, `saved`, `changed`); `Workspace.ts` split into `src/components/list/*` without behaviour change.
- C-2 `FileManager`, `FilePicker`, `Calendar`, `DiagramEditor` facades with options objects; uploads API.
- C-3 `MediaPlayer` (image, video, audio; length, format, native controls, loop/speed, position events, `seek`), extracted from `FileManager`; server audio support (4.3 Media); file-manager viewer uses it.
- C-4 `SandboxFrame` + `dist/sandbox.{html,js}` + protocol + CSP verification; build/check/export updates.
- C-5 Presentation, field-type and command registries; at least one built-in presentation and one built-in command moved onto them (dogfooding).
- C-6 `admin.d.ts` emission and `--check`.
- Each lane: unit-level checks (PHP or Node where possible), typecheck/build, a focused browser spec on a temporary demo declaration or the D-row it serves, docs for its part in `docs/toolkit.md` and the topic guide.
- Integration step and **Gate G3:** all existing specs plus new component specs green.

### P4 — Feature demo transformation (lanes per D-row, after P3 parts they need)

- D0 first (build). Then D1 (needs C-1, C-3), D2 (needs C-3, C-4, D1 fixtures), D3 (needs C-1, C-5), D4 (needs C-5), D5 (done in P2), D6 (contract test).
- Each D-row: implementation, browser spec (`tests/shell/toolkit-*.spec.cjs`), `docs/demos.md` row, i18n hu/en/de, themes (Skyblue/light/dark and skins), mobile behaviour or `desktopOnly`.
- **Gate G4:** owner tries D1–D4 on https://61ade.sanch.hu/.

### P5 — Documentation and rules (lane can start after G1, finishes after P4)

- All rows of section 5; feedback entries (FB-0081 progress, one per phase); event catalog; `docs/toolkit.md` complete with examples copied from the demo sources.

### P6 — Consumer handoff

- Migration guide, per-consumer handoff notes (Hungarian summary for the owner, English technical body), consumer skill update. No consumer edits from 61ade sessions.
- Follow-up after G5 (separate session): a shared skill for adopting and building on 61ade, [FB-0084](feedback.md#fb-0084).

### P7 — Final verification and review

- Full PHP checks, `npm run typecheck`, `npm run build -- --check` (or `node tools/build.mjs --check`), every browser spec, focused performance check on `Mérések` (large list unchanged).
- Independent review agents (not the implementers): security (4.5), API consistency/naming, documentation accuracy against code.
- **Gate G5:** owner acceptance; FB entries closed or left open with reasons.

## 9. Verification matrix

| Area | Checks |
| --- | --- |
| Module loading | declared paths only; bad path rejected at definition; failing module isolated; version suffix; no module on starter/tenant |
| Registries | duplicate/unknown kind errors; built-ins via registry; project kind overrides refused unless explicitly allowed |
| Routing/record views | `#view`, `#view&record`, filters preset, Back, reload, unauthorized record fallback, tenant switch |
| Activation map | per-row targets in table, cards, tiles, Enter and double-click; fallback for missing rights |
| Components | mount/destroy without leaks (listeners, live subscriptions, windows), theme switch, language switch |
| MediaPlayer/audio | Range requests, length/format, keyboard, mobile, file-manager viewer unchanged for image/video |
| Sandbox | no cookies/CSRF in frame, `null` origin checks, CSP blocks network, error and timeout reporting, destroy |
| Regression | every existing PHP check and browser spec |

## 10. Risks

| Risk | Mitigation |
| --- | --- |
| `Workspace.ts`/`AdminShell.ts` refactors break subtle behaviour (live, preferences, activation). | One lane owns each hot file; behaviour-preserving split first, features after; full spec run at every gate. |
| Parallel agents collide in one checkout and one managed URL. | Code lanes in git worktrees; only the coordinator merges into the canonical checkout and runs browser specs (the guard allows one check at a time). |
| API frozen too early or too late. | P1 gate fixes types; changes after G1 need a recorded reason in `docs/toolkit.md#changes`. |
| Sandbox CSP differs across browsers. | Verify in Playwright Chromium; record limits; never relax the shell CSP for it. |
| GPL/vendor obligations when exposing DHTMLX. | Note in `component-matrix.md`; no change of edition. |
| Consumers break silently. | Migration guide and handoff before the breaking commit lands on their development URLs (`development.md#breaking-changes`). |

## 11. Operating procedure for the agent thread

**Coordinator** (main thread): owns this plan, the hot-file assignments, the
canonical checkout, merges, builds, browser runs, gates and owner
communication (Hungarian, short). It does not implement lane work itself
except P0 and integration fixes.

**Before starting**, every agent reads: `AGENTS.md`, `/space/share/libs/agents/MAIN.md`,
`docs/development.md`, `docs/usage.md`, `docs/product-direction.md`, this plan,
ADR-0004/0005, and the topic guides of its lane; list lanes also use the
`grid-tree-card-ui` skill.

**Lane agents** work in their own git worktree on a branch named after the lane
(`toolkit/K-F`, `toolkit/C-3`, ...), touch only the files their lane owns
(section 8), run `npm run typecheck`, `npm run build` and PHP checks in the
worktree, and return: summary, changed files, checks run with results, docs
updated, open questions. They never run browser specs, never push, never edit
consumer projects or `_AuthHandler`.

**Integration**: the coordinator merges a lane, rebuilds `dist`, runs the
focused and regression browser specs with `npm run test:browser -- ...`
against the managed URL (one at a time, through the guard), fixes or returns
failures, then commits only the intended paths with a feedback reference.

**Review agents** get the diff and the relevant contract, not the
implementer's conclusions.

**Gates** G1–G5 stop for the owner. Between gates the coordinator proceeds on
the recommended defaults of section 3.

**Done** when: section 1 acceptance is demonstrable in the feature demo; all
checks of section 9 pass; section 5 documents are updated with evidence;
consumer handoff notes are delivered; feedback entries record verification.
