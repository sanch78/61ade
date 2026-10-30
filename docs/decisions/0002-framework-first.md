# ADR-0002 — 61ade = ADE v2; framework before business modules

Date: 2026-10-16. Accepted mandatory owner instruction.

> Superseded in part on 2026-10-29 by [ADR-0004](0004-project-domain-freedom.md):
> framework-first covers shared infrastructure; the "logically cannot be
> extended" exception no longer limits a consumer's own domain, data or UI.
> Further superseded on 2026-10-29 by [ADR-0005](0005-toolkit.md): 61ade is a
> toolkit; consumers write their own browser modules with its public API, and
> "framework first" inside 61ade means building the reusable tool. The
> exception wording in section 1 below is historical.

61ade succeeds ADE as a DHTMLX admin framework. All general capabilities belong
in the framework. Consumers declare application/menu/features and concrete
business rules/adapters; 61ade executes/renders them.

Every increment follows required contract → framework implementation →
synthetic verification → consumer configuration/business module → integration
verification. Missing capabilities never justify separate application admin infrastructure.

The initial custom HTML login, sidebar and card dashboard were the wrong
direction. Replacing widgets is insufficient: implement framework contracts and
responsibilities. The initial shell is DHTMLX Window/Form login, Menu and Layout
with an empty workspace. Application definitions supply menu hierarchy; the
framework does not invent information architecture.

ADE v2 means architectural/usage continuity, without copying old ADE code or
embedding CityScreen business concepts. Modern PHP, TypeScript and DHTMLX remain
the baseline. The full framework and migration span multiple milestones;
login/menu completion proves only the first capability.

<a id="pontosítás--2026-10-16"></a>

## Clarification — 2026-10-16

<a id="1-első-és-legfontosabb-szabály-minden-ai-fejlesztőnek-codex-claude-és-bármely-más-agent"></a>

## 1. First and most important development rule

No custom development bypassing 61ade. Extend missing framework capabilities
and implement business logic through them. A business need alone does not
justify a separate flow.

An exception is allowed if and only if the framework logically cannot be
extended for that need. Document the concrete reason, considered extension
and boundary alongside implementation. Only that narrow exception may use a
non-DHTMLX flow. Convenience, speed or tool preference is not justification.

On 2026-10-21 FB-0036 superseded application-only user administration:
every project must use a framework-owned admin module built from 61ade
definitions/tools. This is an accepted target, not proof the whole module is
complete. [ADR-0003](0003-product-direction.md) and
[current product evidence](../product-direction.md) track it.
