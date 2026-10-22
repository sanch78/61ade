<!-- shared-agents:begin -->
Read [the shared main prompt](/space/share/libs/agents/MAIN.md) first and
apply it before the project-specific instructions below.

Shared-library role: `library`. The shared library is read-only.
Use relevant shared skills within this project's locally declared scope.
<!-- shared-agents:end -->

# 61de project contract

Canonical checkout: `/space/share/libs/61ade` on `catalyst`, owner `sanch`.
The product is **61de**; identifiers use `Blade\`, `BLADE_*` and `blade`.

There is **one development environment only**, https://61ade.sanch.hu/
(`/admin/` for the starter admin). Develop and test directly there. There is
no production environment, deployment, deployment gate, post-deployment testing
or project backup workflow. Do not introduce any of these. Runtime scratch
belongs in this checkout's `tmp/`; preserve existing retained data and platform
backups. These owner decisions override generic environment/release guidance.

Read [development and project rules](docs/development.md),
[usage](docs/usage.md), [product direction](docs/product-direction.md), and
the affected topic guide and [feedback](docs/feedback.md) before editing.
Framework-first development, consumer boundaries, documentation duties,
validation parity and host protection are mandatory rules in those documents.
Use the existing DHTMLX framework capabilities; extend the framework first
when a capability is missing. `_AuthHandler` is a separate read-only dependency
during 61de work. Do not change consumer runtimes as a side effect.

Browser tests must use `npm run test:browser -- ...` and the managed URL.
Preserve existing changes and stage only intended paths. The project does not
require the `gitpush` helper after each batch; the configured remote and
checkpoint policy are documented in [development](docs/development.md#commit-and-push).
