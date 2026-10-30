# Directories and package boundaries

<a id="két-külön-repó"></a>

## Two separate repositories

- `/space/share/libs/61ade`: canonical **61ade** checkout on `catalyst`. The owner renamed the repository; use its configured Git remote. [Environment contract](development.md#development-environment): development only, with no deployment or project backup workflow.
- `/space/apps/cityscreen`: the existing consumer repository; `v2/` is its planned new admin location.
- Consumer editor symlinks are conveniences. Verify their targets in the consumer project; a historical framework path does not establish a valid link after renaming.
- Dependency direction is CityScreen → 61ade. Reverse dependencies, includes of CityScreen source and application globals accessed from 61ade are forbidden.

## Backend

`packages/php/src/Contracts`: extension interfaces binding concrete application
adapters to the framework.

Planned responsibilities: `Feature` for registration, typed definitions,
validation and compilation; `UI` for views; `Http` and `Api` for transport,
responses and versioning; `Security` for authentication and policy; `Tenancy`
for explicit tenant (organization) context, implemented as optional
[multi-tenancy](tenancy.md); `Data` for allowed filter/sort/page models
and query adapters; `Validation` for common validation; `Files`, `Jobs` and
`Audit` for infrastructure with application hooks; `Integration/Symfony`
for hosting integration if confirmed by ADR.

`packages/php/config` holds framework defaults, never application secrets.
`packages/php/migrations` contains only framework-owned table migrations when
needed. Consumers register and run them explicitly; package installation never
migrates automatically.

## Frontend

Under `packages/frontend/src`: `api` holds the public toolkit API (`types.ts`,
the source of `dist/admin.d.ts`, the `Server` transport, services and the
event bus); `app` the `Application`, registries, built-in kinds and routes;
`components` the public components (`list`, `files`, `calendar`, `diagram`,
`media`, `sandbox`) and DHTMLX adapters; `sandbox` the frame bootstrap built
into `dist/sandbox.js`. Older top-level modules (`AdminShell.ts`,
`Uploader.ts`, `FileManager.ts`, …) are internals behind them
([toolkit](toolkit.md)). Planned responsibilities: `shell`, `renderer`,
`actions`, `state`, `contracts`, `i18n` and `styles`.

An empty adapter directory indicates planned scope, not an installed or licensed component.

<a id="példaalkalmazás-és-tesztek"></a>

## Example application and tests

`examples/demo-app` consumes both packages independently, using synthetic
organizations, projects, tasks and documents rather than copies of CityScreen modules.
Its project module sources are `examples/demo-app/frontend/src`, built into
`examples/demo-app/public/app/demo.js` and `demo.css`
([toolkit consumer](demos.md#toolkit-consumer)).

The planned test layers are `tests/php`, `tests/frontend`, `tests/contracts`,
`tests/e2e`, `tests/performance` and `tests/fixtures`; current runnable scripts
and selectors are documented in [development](development.md). CityScreen business
tests remain in its own `codex/tests/v2`.

`tools` contains development utilities; ignored `tmp` holds runtime files.
`docs/decisions` records accepted and proposed decisions with status.

<a id="fogyasztó-alkalmazás"></a>

## Consumer application

CityScreen `v2/src/Modules` owns feature definitions, domain models, use cases,
repository implementations, business policies and jobs. Concrete DMS, map, mail
and content-source integrations belong in `v2/src/Integrations`. Consumer
domain UI and its browser code belong to the consumer
([ADR-0004](decisions/0004-project-domain-freedom.md)); a missing general
renderer capability is requested from 61ade without blocking the consumer.
The consumer keeps its module sources in its own repository (for example
`frontend/src`), builds them into its public directory (for example
`public/app/main.js`) and declares them in `modules`
([toolkit packaging](toolkit.md#packaging),
[recipe](toolkit.md#typescript-recipe)).

Both 61ade packages share a repository because they implement one protocol.
The consumer application never belongs in this repository.
