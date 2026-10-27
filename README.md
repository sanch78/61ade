# 61de

Checkout: `/space/share/libs/61ade`. The project uses a single development
environment at https://61ade.sanch.hu/, directly from the checkout, with no
deployment, post-deployment testing or project backups. See the
[development contract](docs/development.md#development-environment).
Packages: `sanch78/61de` and `@61de/admin`. Identifiers use `Blade\`,
`BLADE_*` and `blade`; see [renaming and migration](docs/renaming.md).

A reusable, configuration-driven admin application framework with a PHP
reference backend and DHTMLX frontend. A backend-language-independent JSON
contract is a product goal.

**Status:** PHP 8.4+ DHTMLX shell, declarative forms/grids and action executor,
ACL/API-token/audit foundations, JSON configuration, e-mail login verification
and localization are available. No package has been released. The mandatory
admin module and the complete target system remain incomplete.
See [current usage](docs/usage.md).

<a id="cél"></a>

## Goal

A feature definition in PHP or modular JSON brings together object fields,
views, actions and API exposure. 61de renders and serves them; explicitly
registered application handlers implement business logic. The fullscreen DHTMLX
frontend includes localization and themes. Every application must use the
framework's user, ACL, API-key and log administration (partly implemented).
Capabilities grow with actual application needs; no external framework benchmark
or exhaustive component coverage is required. See [product direction](docs/product-direction.md)
for requirements and verified status.

The first consumer is a complete rewrite of the CityScreen admin. Its business
code, data and integrations stay in a separate repository. 61de must not depend
on CityScreen or ADE.

<a id="dokumentáció"></a>

## Documentation

Usage guidance changes with every capability. Lessons from user testing are
recorded durably and incorporated into the relevant guide; this is mandatory.

- [Usage methodology](docs/usage.md)
- [Product requirements, evidence, open questions and implementation prompt](docs/product-direction.md)
- [Login and navigation shell](docs/shell.md)
- [Testing feedback and lessons](docs/feedback.md)
- [Detailed concept](docs/concept.md)
- [Development plan and milestones](docs/development-plan.md)
- [Directories and package boundaries](docs/repository-layout.md)
- [ACL, organizations and API security](docs/security-model.md)
- [DHTMLX capabilities and licenses](docs/component-matrix.md)
- [Development environment and verification](docs/development.md)
- [Foundation decisions](docs/decisions/0001-foundation.md)
- [Mandatory framework-first direction: 61de = ADE v2](docs/decisions/0002-framework-first.md)
- [Product direction decision (ADR-0003)](docs/decisions/0003-product-direction.md)

<a id="csomagok"></a>

## Packages

| Directory | Planned package | Responsibility |
| --- | --- | --- |
| `packages/php` | `sanch78/61de` | PHP definitions, API, policies and infrastructure |
| `packages/frontend` | `@61de/admin` | DHTMLX adapters, renderer and admin shell |
| `examples/demo-app` | Unpublished | Synthetic feature demo (`/`) and starter admin (`/admin/`); [demo guide](docs/demos.md) |
| `tests` | Unpublished | Framework, contract, integration and browser tests |

Consumers use this checkout as a shared library: `packages/php` and the tracked
build in `packages/frontend/dist`, without versions or registry publication. See
[shared-library consumption](docs/development.md#shared-library-consumption).
The PHP namespace is `Blade\`.

<a id="technológiai-kiindulás"></a>

## Technology baseline

Accepted: modern PHP reference backend (PHP-FPM + OPcache), DHTMLX, versioned
PHP/JSON feature definitions and separate application repositories. The frontend
targets a language-independent JSON contract ([ADR-0003](docs/decisions/0003-product-direction.md)).
Storage targets are MySQL, PostgreSQL, SQLite and JSON files; currently a MySQL
connection and SQLite demo exist. The proposed initial implementation uses
PHP 8.4 minimum, PHP 8.5 CI coverage, Symfony 7.4 LTS integration and TypeScript.
Symfony remains a proposal to settle in the first runtime milestone, not a
previously accepted owner decision.

The frontend lockfile pins DHTMLX, TypeScript and esbuild. The PHP shell uses
Composer autoloading without a hosting framework; Symfony integration and the
complete runtime contract remain open. See [shell](docs/shell.md).

<a id="licencek"></a>

## Licenses

The license for 61de's own code is undecided; this repository currently grants
no separate open-source usage permission. A public GitHub repository is not a
license. DHTMLX Suite Standard and Scheduler use GPL; Gantt 10+ Community uses
MIT. Details and sources are in the component matrix. Never commit paid vendor
packages, secrets or customer data.
