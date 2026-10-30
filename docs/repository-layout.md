# Directories and package boundaries

<a id="két-külön-repó"></a>

## Two separate repositories

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

`tools` contains development utilities; ignored `tmp` holds runtime files.
`docs/decisions` records accepted and proposed decisions with status.

<a id="fogyasztó-alkalmazás"></a>

## Consumer application

Both 61ade packages share a repository because they implement one protocol.
The consumer application never belongs in this repository.
