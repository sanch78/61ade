# ADR-0001 — Foundation and open decisions

Date: 2026-10-16.

Historical decision: identity/repository/checkout details were superseded on
2026-10-21 by [FB-0049](../feedback.md#fb-0049). Current identity: 61ade,
checkout /space/share/libs/61ade, one development environment
https://61ade.sanch.hu/, without deployment or project backups.

<a id="elfogadott-felhasználói-döntések"></a>

## Accepted owner decisions

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

Open choices are not completed implementation contracts; later phases must settle them.

<a id="későbbi-pontosítás--2026-10-21"></a>

## Later clarification — 2026-10-21

PHP is the reference backend. The frontend targets a language-independent JSON
contract; versioned modular JSON is also a valid feature-definition format.
See [ADR-0003](0003-product-direction.md).
