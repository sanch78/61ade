<!-- shared-agents:begin -->
Read [the shared main prompt](/space/share/libs/agents/MAIN.md) first and
apply it before the project-specific instructions below.

Shared-library role: `library`. The shared library is read-only.
Use relevant shared skills within this project's locally declared scope.
<!-- shared-agents:end -->

# 61ade project contract

Canonical checkout: `/space/share/libs/61ade` on `catalyst`, owner `sanch`.
The product is **61ade**; identifiers use `Blade\`, `BLADE_*` and `blade`.

There is **one development environment only**, https://demo.61ade.com/
(`/admin/` for the starter admin); the product website is https://61ade.com/
(`/hu/` in Hungarian). The former `61ade.sanch.hu` is retired with no fallback;
see [development](docs/development.md#development-environment). Develop and
test directly on the demo. There is no production environment, deployment,
deployment gate, post-deployment testing or project backup workflow. Do not
introduce any of these. Runtime scratch belongs in this checkout's `tmp/`;
preserve existing retained data and platform backups. These owner decisions override generic environment/release guidance.

Read [development and project rules](docs/development.md),
[usage](docs/usage.md), [product direction](docs/product-direction.md), and
the affected topic guide and [feedback](docs/feedback.md) before editing.
Framework-first development, consumer boundaries, documentation duties,
validation parity and host protection are mandatory rules in those documents.
Use the existing DHTMLX framework capabilities; extend the framework first
when a capability is missing. `_AuthHandler` is a separate read-only dependency
during 61ade work. Do not change consumer runtimes as a side effect.

Browser tests must use `npm run test:browser -- ...` and the managed URL.
Preserve existing changes and stage only intended paths. The project does not
require the `gitpush` helper after each batch; the configured remote and
checkpoint policy are documented in [development](docs/development.md#commit-and-push).

For any general grid, data-tree, or responsive card/DataView work, use the
project skill [grid-tree-card-ui](.agents/skills/grid-tree-card-ui/SKILL.md).
Keep reusable presentation rules in that skill; keep public runtime contracts,
limits, and evidence in the affected topic guide and feedback log.
