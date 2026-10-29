# ADR-0003 — Mandatory admin, language-independent contract and demand-driven scope

Date: 2026-10-21. Accepted owner decision
([FB-0036](../feedback.md#fb-0036--kötelező-adminmodul-és-igényvezérelt-keretfejlesztés),
corrected by [FB-0037](../feedback.md#fb-0037--ext-js-referencia-visszavonása-dhtmlx-alap-igényvezérelt-képességkör)).
[Product direction](../product-direction.md) separates requirements, evidence and open questions.

<a id="döntés"></a>

## Decision

- PHP is reference backend; frontend uses versioned language-independent JSON. JSON transport alone is not backend independence.
- Every application uses framework user/ACL/API-key/log admin, built from its own declarations.
- DHTMLX with framework adapters/supported extension points; no external benchmark, component mapping or exhaustive coverage requirement. Capabilities grow with actual needs.
- Localization/themes are built in and apply to every new capability.
- Storage targets: MySQL/PostgreSQL/SQLite/JSON file. Support requires tests proving documented guarantees.
- Modular JSON with named registered handlers, no eval/executable strings.
- Generated ACL catalog never grants rights automatically.
- Explicit event coverage and audit/security/operational categories; no credentials/sensitive payloads in logs.
- Navigable kitchen sink for implemented public capabilities.
- Need → framework gap → smallest reusable extension → synthetic demo/tests → documentation → consumer integration → consumer-controlled release.

<a id="felülírt-és-pontosított-korábbi-döntések"></a>

## Superseded and clarified decisions

- [ADR-0002](0002-framework-first.md)/FB-0004 application-only user admin is superseded; framework-first remains. Its narrow exception is later superseded by [ADR-0004](0004-project-domain-freedom.md).
- [ADR-0001](0001-foundation.md): modern PHP rather than Go/Node refers to the reference backend, not a frontend protocol dependency. Versioned definitions include JSON.
- FB-0037 withdraws FB-0036's Ext JS reference. Active guidance cannot require Ext JS parity.

<a id="következmények"></a>

## Consequences

At the original decision checkpoint, mandatory admin, language-neutral schema,
PostgreSQL/JSON stores, OAuth, catalog API, log categories and kitchen sink were
incomplete. Subsequent A1–A3/OAuth/demo work is tracked in
[current evidence](../product-direction.md#2-megvalósított-képességek-bizonyítékkal-és-hiányok).
A useful increment does not require an exhaustive component catalog.
The project's dev-only/no-deployment/no-backup environment is governed by the
later owner [environment decision](../development.md#development-environment).
