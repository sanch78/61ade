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

Planned responsibilities under `packages/frontend/src`: `app` for initialization
and services; `shell` for layout/navigation; `renderer` for schema-based component
construction; `components` for DHTMLX adapters; `actions` for action dispatch;
`api` for transport; `state` for workspace/view state; `contracts` for
server/client contracts; `i18n` and `styles` for shared translation and styling.

An empty adapter directory indicates planned scope, not an installed or licensed component.

<a id="példaalkalmazás-és-tesztek"></a>

## Example application and tests

`examples/demo-app` consumes both packages independently, using synthetic
organizations, projects, tasks and documents rather than copies of CityScreen modules.

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
and content-source integrations belong in `v2/src/Integrations`. Consumer frontend
extensions are permitted only within the documented framework-first exception;
missing general renderer capabilities must first be added to 61ade.

Both 61ade packages share a repository because they implement one protocol.
The consumer application never belongs in this repository.
