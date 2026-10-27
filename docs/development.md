# Development and environment

## Development environment

Owner decisions of 2026-10-21 and 2026-10-22
([FB-0049](feedback.md#fb-0049), [FB-0051](feedback.md#fb-0051)):
**61de** has one development/test environment at https://61ade.sanch.hu/;
the starter admin is https://61ade.sanch.hu/admin/. The canonical checkout is
`/space/share/libs/61ade` on `catalyst`, owned by `sanch`. Its expected document
root is `examples/demo-app/public/` in this checkout.

Develop and test directly in this environment. There is no production
environment, deployment, deployment gate, post-deployment testability or project
backup process. Do not introduce any of them. This overrides older local rules
and generic Infra guidance about production, backup or deployment. Preserve
existing retained data and platform backups; do not create additional project,
production, backup or synchronization roots.

PHP/configuration edits are consumed directly through the managed URL. Frontend
edits need the existing build and local asset preparation:

```sh
npm run build
npm run demo:assets
```

These commands prepare files in this checkout. Use the managed URL and protected
browser wrapper for verification; never start an ad-hoc server or tunnel.

The ignored root `.env.test` uses `KEY=VALUE` lines, read by
`tests/browser/config.cjs`; process variables take precedence.
`BLADE_DEMO_URL=https://61ade.sanch.hu` selects the managed URL,
`BLADE_DEMO_INSTANCE=web` selects its data instance. OAuth uses the same
`BLADE_DEMO_URL` key in `examples/demo-app/.env`, read by `demoHostSetting`
in `common.php` with process-env precedence. Preserve these loaders and private
files; inspect only needed keys and never print or commit credentials.

Product/packages use `61de`; identifiers use `Blade\`, `BLADE_*` and
`blade_*`. See [renaming](renaming.md) before reusing an earlier consumer or
database. [Package releases](#package-releases-and-consumption) are Git tags;
they and consumer releases do not create a production environment here.

<a id="jelenlegi-állapot"></a>

## Current status

The initial PHP 8.4+ login/navigation shell and frontend build exist.
See [shell](shell.md) for integration, prerequisites and limits. The host's
default PHP remains 7.1; use `php8.4` or a PHP 8.4+ `BLADE_PHP` binary with
PDO SQLite. Symfony hosting, complete CI and PHP 8.5 verification remain open.

<a id="szerkesztés-két-repóban"></a>

## Working across repositories

Check the framework explicitly:

```sh
git -C /space/share/libs/61ade status
```

Consumer repositories and editor symlinks are separate. Verify actual targets
under the consumer's contract; an old link does not prove the current location.

<a id="helyi-csomagfejlesztés-terve"></a>

## Package releases and consumption

Decision of 2026-10-27 ([FB-0064](feedback.md#fb-0064)): 61de is consumed as one
Composer VCS package, `sanch78/61de`, from https://github.com/sanch78/61ade.
There is no Packagist or npm registration; the Git tag is the release artifact.

The root `composer.json` is the package manifest (`Blade\` →
`packages/php/src/`, no `version` field; Composer takes the version from the
`vX.Y.Z` tag). `packages/php/composer.json` remains only for the demo's path
repository: pointing the demo at the root would make its
`vendor/sanch78/61de` a symlink to the checkout containing that vendor
directory. Both manifests must declare the same `require`; the release tool
refuses to run otherwise. `.gitattributes` export-ignores development paths, so a
dist archive carries `composer.json`, `README.md`, `packages/php`,
`packages/frontend/{bin,dist,package.json}` and `tools/live-server.mjs`
(the [WebSocket transport](workspaces.md)).

### Release procedure

```sh
tools/release X.Y.Z
```

It requires `main`, a clean working tree and `HEAD` equal to `origin/main`, and an
unused tag. It runs `npm run build`, sets `X.Y.Z` in `packages/php/composer.json`,
`packages/frontend/package.json` and `package-lock.json`, pins the demo to it
(`composer require` refreshes `examples/demo-app/composer.lock`) and commits that
bump to `main` as `Release X.Y.Z` when anything changed. It then creates a
detached commit on top of it in a private index that force-adds
`packages/frontend/dist`, tags it `vX.Y.Z`, checks that the tag archive holds
the manifest, PHP source and built assets and no `docs`/`tests`/`examples`, and
pushes `main` and the tag with one atomic push. `main` never tracks `dist`, and
the working tree is not switched. Initial backend/frontend releases share one
version. If a check fails before the push, delete the local tag and reset the
unpushed bump commit before retrying.

Before cutting a release, run the focused checks for the changes it contains.
After the push, verify with a throwaway consumer under `tmp/` (below) and remove it.

### Consumer contract

```json
{
    "repositories": [
        {
            "type": "vcs",
            "url": "https://github.com/sanch78/61ade"
        }
    ],
    "require": {
        "sanch78/61de": "0.1.0"
    }
}
```

- Require the exact release version and commit `composer.lock`; the lock pins the
  tag's commit. Upgrade deliberately with `composer require sanch78/61de:X.Y.Z`.
  Breaking protocol changes require release notes, migration guidance and new
  compatibility ranges.
- Frontend assets come from the same package:
  `node vendor/sanch78/61de/packages/frontend/bin/publish.mjs public/assets`.
  The WebSocket server, when used, is `vendor/sanch78/61de/tools/live-server.mjs`;
  the consumer supplies its lockfile-pinned `ws` dependency.
- Committed consumer manifests and lockfiles must never contain `/space/...`
  development paths.

**Dev-time linking against the shared checkout:** in an uncommitted local
manifest (for example `COMPOSER=composer.dev.json composer install`, with its
lock ignored), put a path repository before the VCS entry:

```json
{
    "type": "path",
    "url": "/space/share/libs/61ade",
    "options": {
        "symlink": true,
        "versions": {
            "sanch78/61de": "0.1.0"
        }
    }
}
```

`vendor/sanch78/61de` then symlinks the checkout, with the same layout as a
release; `versions` lets the exact pin resolve. Its frontend is the checkout's
working-tree build, so run `npm run build` there first. The demo app uses the
equivalent path repository to `packages/php`.

<a id="fájlrendszer-és-környezet"></a>

## Filesystem and environment

Scratch, logs, test artifacts, caches, runtime homes and temporary locks belong
in this checkout's `tmp/`. Secrets stay unversioned in existing protected
environment configuration. No project backups apply.

Application public files belong in its own public directory. Business media,
audit and persistent job data use configured storage rather than the framework
checkout. Demo data must be synthetic.

<a id="ellenőrzési-stratégia"></a>

## Verification strategy

The demo and browser tests default to `php8.4`; override with `BLADE_PHP`
for another PHP 8.4+ binary/wrapper with PDO SQLite. External writes made by tests
use it too. Example:

```sh
BLADE_PHP=/opt/php84/bin/php npm run test:browser -- tests/shell/workspace.spec.cjs --project=shell
```

The framework must not assume a consumer checkout or runtime wrapper.

M0 checks: manifest JSON, internal Markdown links, directories/symlinks,
whitespace, staged secret/vendor exclusion and remote commit identity.
From M1: PHP lint, static analysis, frontend typecheck/build and units.
From M2: isolated database integration and policy matrix.
From M3: UI/API contracts and E2E.
From M7: reproducible load measurements. A planned command is never a passed check.

### Focused task groups

Use existing scripts and selectors; do not add a runner or reorganize suites.
PHP scripts use the demo Composer autoloader and throw on failure.

| Change | Focused checks |
| --- | --- |
| Documentation/entrypoints | Internal file/fragment links, skill symlinks, `git diff --check`; no artificial runtime test |
| Shell/bootstrap/theme | `php8.4 tests/shell/contracts.php`; `npm run test:browser -- --project=shell tests/shell/browser.spec.cjs` |
| Workspace/layout/live lists | `php8.4 tests/shell/lists.php`; shell `workspace.spec.cjs`, `layout-resizer.spec.cjs`, `mobile-grid.spec.cjs`, `preferences.spec.cjs` |
| ACL/action/API permissions | PHP `access.php`, `permissions.php`, `api-keys.php`; shell `admin.spec.cjs` or the relevant `demo.spec.cjs` selector |
| Accounts/admin | PHP `admin.php`, `permissions.php`; shell `admin.spec.cjs` |
| Authentication/OAuth/mail | PHP `authentication.php`, `oauth.php`, `mail.php`; shell `authentication.spec.cjs`, `demo.spec.cjs` with `--grep` for the affected flow |
| JSON/env/validation | PHP `configuration.php`, `validation.php`, affected `contracts.php` |
| Inline/related fields | PHP `grid-edit.php`, `related-fields.php`; shell `grid-edit.spec.cjs`, `related-fields.spec.cjs` |
| Sorting/list presentation | PHP `sorting.php`, `list-presentation.php`, `lists.php`; shell `list-presentation.spec.cjs`, `list-integration.spec.cjs`, `grid-sort.spec.cjs` |
| Localization | `php8.4 tests/shell/i18n.php`; shell `i18n.spec.cjs` |
| Dialogs | `npm run test:browser -- --project=shell tests/shell/dialogs.spec.cjs` |
| Diagram editor | `php8.4 tests/shell/diagram.php`; shell `diagram.spec.cjs` |
| Event calendar | `php8.4 tests/shell/calendar.php`; shell `calendar.spec.cjs` |
| File manager/multipart/Tree | `php8.4 tests/shell/files.php`; shell `files.spec.cjs` (also `access.php` for executor changes) |
| Frontend implementation | `npm run typecheck`, `npm run build`, `npm run demo:assets`, then affected browser selectors |

PHP shorthand in the table means `php8.4 tests/shell/<name>.php`.
Inspect affected dependencies: `npm ls --depth=0`, relevant Composer manifest/
path-package mappings and installed autoloading. Syntax checks use
`php8.4 -l <file>`, `node --check <file>` or `bash -n <file>`.

### Existing full smoke and coverage limits

There is **no pre-deploy or post-deploy smoke gate** here. When a full development
regression is actually warranted, the existing broad commands are:

```sh
(for check in contracts access admin api-keys permissions authentication oauth mail configuration validation i18n lists sorting grid-edit related-fields list-presentation files diagram calendar; do
    php8.4 "tests/shell/$check.php" || exit
done)
npm run typecheck
npm run build
npm run demo:assets
npm run test:browser
```

Do not run this full set merely for skill linking or translation.
A targeted pass does not establish full-smoke success. The full shell run
includes external OAuth behavior; the last recorded limitation is Google's
`redirect_uri_mismatch` ([FB-0050](feedback.md#fb-0050)).

Every browser spec runs in the single `shell` project against the managed
feature demo or starter admin ([FB-0052](feedback.md#fb-0052)). The former
localhost fixture projects were migrated onto the feature demo and removed;
`tests/fixtures/` now holds only synthetic definitions read by the PHP checks.
Specs that change shared demo data restore it: created tasks are deleted, the
demo account ends on Hungarian and `twofactor@example.test` keeps its e-mail
confirmation. The framework allows five code sends per account in ten minutes;
`demo.spec.cjs` and `authentication.spec.cjs` together request four codes for
`twofactor@example.test`, so repeat those specs only after ten minutes.

A single-language consumer has no managed demo; its translation is covered by
`i18n.php`, but the hidden language selector has no browser check. There is no
production-only coverage category in this dev-only project. Real external
providers and MySQL guarantees remain distinct coverage limits.

<a id="commit-és-push"></a>

## Commit and push

Configured remote: `origin` = `git@github.com:sanch78/61ade.git`; branch
`main`. Verify these before pushing. No active local Git hooks or repository
`.github` workflows were found in the onboarding inventory; remote-side
automation outside the checkout is not established by that observation.
A push does not create a deployment step here.

The owner removed the requirement to run `gitpush` after every batch on
2026-10-21 ([FB-0043](feedback.md#fb-0043--gitpush-kötelezettség-megszüntetése-és-helperútvonal-javítása)).
The host helper, when explicitly needed, is `/space/share/bin/gitpush`;
the older `/usr/local/bin/gitpush` path was wrong. Preserve configured Git
identity and review/stage exact intended paths. Preserve existing staged and
unstaged work. Incorporate earlier document edits in a documentation checkpoint
only with owner authorization; exclude unrelated source edits and staged paths.

<a id="technológiai-referencia"></a>

## Technology references

- [PHP supported versions](https://www.php.net/supported-versions.php)
- [OPcache](https://www.php.net/manual/en/book.opcache.php)
- [Symfony 7.4 LTS](https://symfony.com/releases/7.4)
- [FrankenPHP worker mode, a later option](https://frankenphp.dev/docs/worker/)

<a id="böngészőteszt-korlátozott-memóriájú-fejlesztői-hoston"></a>

## Browser tests on the shared development host

Required: Linux, a systemd user manager, delegated cgroup v2 memory/pids
controllers, Bash and util-linux `flock`. `npm run test:browser -- ...` calls
`tools/playwright.sh` through `tools/run-dev-check.sh`: one worker, a shared
nonblocking `tmp/dev-check.lock`, at least 1280 MiB initial MemAvailable,
700 MiB MemoryHigh, 900 MiB MemoryMax, zero swap and at most 128 tasks including
threads. On resource refusal, wait or free memory; never bypass the guard or
start concurrent retries.

Consumers may call `tools/run-dev-check.sh command [args...]` from their own
working directory. They share this checkout's lock; other checkouts/users do
not. There is no unlimited fallback if systemd is unavailable. The guard
preserves the child exit status; busy lock or insufficient memory returns 75.
The raw Playwright CLI is not a supported host entrypoint. The same guard may
protect other large checks under the same limits.

Historical verification: `memory.max=943718400`, `memory.high=734003200`,
`memory.swap.max=0`, `pids.max=128`; nested invocation rejected with 75;
both projects' wrapper discovery and a synthetic Chromium login/menu check
passed with an available PHP 8.4 wrapper. Enforcement was checked with small
loads, without deliberate host OOM. The guard does not cap the entire editor
session or other services. Host swap/service policy belongs to Infra.

Reference: [systemd resource control](https://www.freedesktop.org/software/systemd/man/latest/systemd.resource-control.html).

<a id="kijelölt-scratch-és-rendszerszintű-böngésző"></a>

### Scratch and system browser

`BLADE_TMP_DIR` selects the build's vendor-font cache, guarded process TMPDIR,
demo setup/database/session runtime and Playwright artifact root. Default:
repository `tmp/`; use an absolute path under this checkout for any override.
The shared lock stays at the framework's existing location. Scratch selection
does not allow parallel browser runs. The former `codex/` scratch directory
was removed.

Infra owns the installed runner and browsers on Catalyst. Missing or incompatible
versions require the declared Infra handoff; no project browser/runtime download,
tool installation or host-configuration workaround is allowed. Scratch artifacts
and system browser installation are separate responsibilities.

<a id="meglévő-közös-playwright-bekötése"></a>

### Existing system Playwright

`tools/playwright.sh` launches `BLADE_PLAYWRIGHT_BIN` (default
`/usr/local/bin/playwright`). It resolves the launcher's exec target to locate
the matching `@playwright/test`; `BLADE_PLAYWRIGHT_MODULE` overrides discovery.
Tests and configuration import that same installation through
`tools/playwright-test.cjs`, never a second local package. npm's local
`node_modules/.bin` prefix is not used to select the runner.

The documented system installation is
`/opt/infraadmin/playwright/npm/lib/node_modules/@playwright/test`, version 1.60.0,
with browsers at `/opt/infraadmin/playwright/browsers`. Read/run these only.
The project manifests/locks do not install Playwright.

```sh
BLADE_PLAYWRIGHT_MODULE=/opt/infraadmin/playwright/npm/lib/node_modules/@playwright/test \
BLADE_TMP_DIR="$PWD/tmp" \
  npm run test:browser -- list-presentation.spec.cjs
```

The runner and imported test package must match; `test()` from different
Playwright instances is incompatible.

<a id="egységes-playwright-konfiguráció"></a>

### Unified Playwright configuration

The sole root `playwright.config.cjs` imports `tests/browser/config.cjs`.
It defines one project, `shell`, for every `tests/shell/*.spec.cjs` with the
managed `BLADE_DEMO_URL` as base URL, and starts no web server. A missing
`BLADE_DEMO_URL` stops the run with an error. Discover tests without launching
a browser:

```sh
npm run test:browser -- --list
npm run test:browser -- tests/shell/browser.spec.cjs
npm run test:browser -- tests/shell/workspace.spec.cjs
```

Shared feature-demo steps (sign-in, menu, commands, view switch, API calls,
synthetic task creation/deletion) live in `tests/shell/feature-demo.cjs`.
Artifacts use `tmp/playwright-results/` or the corresponding subdirectory of
`BLADE_TMP_DIR`; relative scratch resolves from the repository root.
Before cleaning runtime files, check active consumers and retain needed evidence.

<a id="rendszerszintű-playwright-és-natív-url"></a>

## System Playwright and managed URL

The ignored `.env.test` supplies the managed server URL; no local server is started.
See [demos](demos.md#webszerveres-futtatás-apache--php-fpm), FB-0045.
Local Playwright packages and the user-cache browsers were removed on
2026-10-21 (FB-0046). If dependencies reintroduce them, remove that dependency;
the system runner remains canonical.

## Mandatory framework development rules

These project rules apply to all development tools.

**No redundant dialogs:** a user must not confirm an action merely to press a
second button that starts the same action. Field-free commands, including bulk
commands, execute from their originating control and acknowledge success with a
non-blocking gritter/toast. Use the shared confirmation dialog only when the
action declares a meaningful risk that requires confirmation, and use an alert
only for an error or other necessary blocking information. A form remains
appropriate when the action needs input fields; this rule does not remove a
justified confirm or alert.

**Framework first:** no custom development that bypasses 61de. Implement
missing general capabilities in 61de, then express business logic through them.
A business request alone never justifies a separate flow. An exception is
permitted if and only if the framework logically cannot be extended for the
need. Document the concrete reason, considered extension and exception boundary
alongside the implementation. Only that narrow exception may use a flow
without DHTMLX. Convenience, speed or tool preference is not justification.

61de is ADE v2, a reusable admin framework in a separate Git repository.
It owns application startup, configuration, authentication/session, permissions,
menus, layout, windows, forms, grids, communication, errors and state management.
UI controls use its DHTMLX adapters by default. Consumers own configuration,
business definitions/rules and concrete identity/data/integration adapters.
Do not add application-specific frontend, hand-built HTML/CSS admin interfaces
or parallel infrastructure to compensate for a missing framework capability.

Every application requires the framework's user, ACL, API-key and log admin
built from its own definitions/tools (FB-0036, ADR-0003). Consumers supply
configuration and adapters. The [product direction](product-direction.md)
R1–R12 is canonical; distinguish accepted requirements, evidence and open work.
There is no external framework benchmark or exhaustive component target
(FB-0037). New capabilities must be localized, themed, represented in the feature
demo and documented in the event catalog. No eval/executable configuration
strings; generated ACL catalogs never grant permission.

Keep CityScreen/ADE business code, table names, production data and integration
dependencies out of 61de. Do not modify CityScreen runtime, database or old admin
as a side effect. `_AuthHandler` at `/space/share/libs/_AuthHandler` is a separate
library and must not be edited during 61de work. Its links are
`lib/_AuthHandler` and `examples/demo-app/public/lib/_AuthHandler`. Fill gaps
in the 61de adapter or a separately authorized library task (FB-0046).

Source locations: PHP `packages/php`, frontend `packages/frontend`, tests
`tests`, tools `tools`. The root README is the only project README; detailed
documentation belongs in focused `docs/*.md`. Commit only synthetic fixtures/
demo data; never secrets, vendored PRO packages, node_modules or vendor.

Enforce server authorization on every read/write channel. UI hiding is not
protection. Backend-only feature content must never enter browser metadata.
A successful consumer demo is insufficient: prove the general capability with
an independent synthetic consumer.

There are [two demos](demos.md). Every demonstrable new capability enters the
full feature demo and capability table in the same batch. Change the starter
admin only when every project's mandatory starter set changes (FB-0044).
When a form field manages a value, do not add a single-purpose action button;
make the field editable in the form and, where useful, grid.

The initial requested step is complete: framework-owned DHTMLX login,
configured DHTMLX menu and empty workspace. Further modules follow real needs:
need → framework gap → smallest reusable extension → synthetic demo/relevant
checks → documentation → consumer integration. Any consumer release follows
that consumer's separate contract.

## Mandatory usage documentation and validation parity

`docs/usage.md` is the usage entrypoint. For each new/changed public capability,
update usage, prerequisites, example, limits and verification in the same session;
this is a completion condition. Update relevant architecture/planning documents
in the same batch and never mark a plan implemented without evidence.

Record user testing corrections and usage instructions in `docs/feedback.md`.
Clear instructions are accepted expectations; uncertain interpretations remain
open questions. Incorporate general accepted lessons into the canonical guide
or a linked topic document. A feedback entry alone is insufficient. Unimplemented
expectations remain planned and open. Before editing, read the relevant guide
and prior feedback; superseding decisions must link the earlier entry and remove
contradictory active guidance. Close feedback with guide, implementation where
applicable, and verification links/results. Behavioral defects may require
regression coverage; documentation-only edits need no artificial runtime tests.
Keep only general framework lessons and synthetic examples here; consumer
business decisions belong in the consumer documentation. Never publish personal
data, secrets or complete chat copies.

Feature migration requires an inventory of every relevant reference validation:
module, local overrides, common configuration and persistence. Required fields
alone are not parity. 61de owns general validators; consumers own concrete
formats, thresholds and business exceptions. Verify client and server/UI/API
paths. Any remaining difference requires a documented decision.
