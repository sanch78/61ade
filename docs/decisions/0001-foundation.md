# ADR-0001 — Foundation and open decisions

Date: 2026-10-16.

Historical decision: identity/repository/checkout details were superseded on
2026-10-21 by [FB-0049](../feedback.md#fb-0049). Current identity: 61ade,
checkout /space/share/libs/61ade, one development environment
https://demo.61ade.com/ (from 2026-10-31, [FB-0100](../feedback.md#fb-0100)), without
deployment or project backups.

<a id="elfogadott-felhasználói-döntések"></a>

## Accepted owner decisions

- 61ade admin framework is a separate reusable repository: https://github.com/sanch78/61ade.
- Rewrite the complete CityScreen admin, not merely a framework or several grids.
- Framework and consumer business logic cannot share a repository.
- Modern PHP, PHP-FPM and OPcache; Go/Node backend was not selected.
- DHTMLX Suite/Gantt/Scheduler with framework adapters over existing controls.
- Developer-authored feature definitions in version-controlled source.
- Multiple organizations, object/field permissions, per-feature external API switches.
- Module-by-module migration, rewriting business logic without an ADE compatibility layer.
- License constraints do not block planning; no PRO purchase was made.
- A local CityScreen/blade editor symlink is needed.

<a id="ebben-a-scaffoldban-választott-technikai-alapértékek"></a>

## Scaffold technical defaults

- Canonical checkout: /space/share/libs/61ade.
- PHP/frontend packages share the 61ade monorepo; namespace Blade.
- Manifest minimum PHP 8.4; TypeScript frontend planned at this checkpoint.
- Example application uses an independent synthetic domain.
- Frontend package is private; no accidental publication.

<a id="javaslat-m1-ben-véglegesítendő"></a>

## Proposal to settle in M1

Symfony 7.4 LTS hosting for established HTTP/DI/validation/security/jobs.
The owner selected modern PHP, not a specific PHP framework. This remains a
proposal rather than a previously approved product choice.

<a id="nyitott-döntések-határidővel"></a>

## Open decisions and deadlines

| Decision | Latest point |
| --- | --- |
| Own license/GPL frontend distribution | M1, before publication |
| Hosting framework, DB adapter, toolchain/dependency versions | M1 |
| Metadata/API wire schema and public interfaces | M1–M3 |
| Machine authentication/token lifecycle/revocation | M2 |
| Licensed PRO capabilities or alternatives | Before relevant M4/M5 adapter |
| Package artifacts/registry/release automation | M7 |
| CityScreen module boundaries/first module/schema migration | Consumer A0/A1 |
| Measurable performance targets | Before M7, after baseline |

Open choices are not completed implementation contracts; later phases must settle them.

<a id="későbbi-pontosítás--2026-10-21"></a>

## Later clarification — 2026-10-21

PHP is the reference backend. The frontend targets a language-independent JSON
contract; versioned modular JSON is also a valid feature-definition format.
See [ADR-0003](0003-product-direction.md).
