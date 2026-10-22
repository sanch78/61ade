# Directories and package boundaries

<a id="két-külön-repó"></a>

## Two separate repositories

## Backend

`packages/php/src/Contracts`: extension interfaces binding concrete application
adapters to the framework.

Planned responsibilities: `Feature` for registration, typed definitions,
validation and compilation; `UI` for views; `Http` and `Api` for transport,
responses and versioning; `Security` for authentication and policy; `Tenancy`
for explicit organization context; `Data` for allowed filter/sort/page models
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

`tools` contains development utilities; ignored `tmp` holds runtime files.
`docs/decisions` records accepted and proposed decisions with status.

<a id="fogyasztó-alkalmazás"></a>

## Consumer application

Both 61de packages share a repository because they implement one protocol.
The consumer application never belongs in this repository.
