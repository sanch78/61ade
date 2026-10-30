# Development and environment

## Development environment

Owner decisions of 2026-10-21 and 2026-10-22
([FB-0049](feedback.md#fb-0049), [FB-0051](feedback.md#fb-0051)):
**61ade** has one development/test environment at https://61ade.sanch.hu/;
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

Product/packages use `61ade`; identifiers use `Blade\`, `BLADE_*` and
`blade_*`. See [renaming](renaming.md) before reusing an earlier consumer or
database. [Consumers](#shared-library-consumption) take this checkout directly;
their deploys do not create a production environment here.

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

<a id="package-releases-and-consumption"></a>

## Shared-library consumption

Owner decision of 2026-10-27 ([FB-0066](feedback.md#fb-0066), superseding
[FB-0064](feedback.md#fb-0064)): 61ade is consumed like the other shared
libraries in `/space/share/libs`. There are no versions, tags, release tool or
Composer installation for consumers. Existing `v*` tags remain as history only.

- A pushed commit on `main` reaches every consumer's development URL at once on
  both dev hosts; the host-local lib-sync timer carries Git commits between
  Catalyst and Crypto.
- Each consumer's next `deploy-site` copies the then-current code into its
  release through `shared_assets`.

Consumers use exactly these runtime paths:

- `packages/php` as one directory (`src`, `resources`, `templates`,
  `migrations` and the rest). The consumer loads `Blade\` with its own small
  PSR-4 autoloader over `packages/php/src`.
- `packages/frontend/dist/admin.js` and `admin.css`; `sandbox.html` and
  `sandbox.js` beside them only for a project that uses
  [`SandboxFrame`](toolkit.md#packaging).

`packages/php/composer.json` remains only for the demo's path repository.

**No external PHP dependency** ([FB-0067](feedback.md#fb-0067)): the
no-Composer model holds only while `packages/php` requires nothing but PHP
itself and its bundled extensions. Optional integrations such as
`_AuthHandler` are separate shared libraries whose path the consumer passes in.
Adding a third-party package would bring back an installer and is a breaking
change. Every consumer would need a coordinated update, as described in
[breaking changes](#breaking-changes).

### Tracked frontend build

`packages/frontend/dist` and `packages/php/bin/live-server.mjs` (built from
`tools/live-server.mjs`) are tracked on `main`. `dist` holds `admin.js` and
`admin.css` (one ESM bundle and its stylesheet), `sandbox.html` and
`sandbox.js` (the [sandbox document](toolkit.md#sandbox-protocol), from
`src/sandbox/`) and `admin.d.ts` (toolkit API declarations from
`src/api/index.ts`, development use only). The same build writes the feature
demo's project module `examples/demo-app/public/app/demo.js` and its
stylesheet `demo.css` (the CSS its sources import) from
`examples/demo-app/frontend/src` ([toolkit consumer](demos.md#toolkit-consumer));
they are tracked the same way but are demo output, never consumer runtime.
Every commit that changes their
source carries the matching fresh `npm run build` output; the build is
reproducible, and `npm run build` reports when `dist` changed. `npm run
test:browser` first runs `node tools/build.mjs --check`, which builds all of
these files in memory and refuses to test an output that differs from the
source. `npm run typecheck` checks `packages/frontend/src` and, with
`tsc -p examples/demo-app/frontend`, the demo module against the generated
`dist/admin.d.ts` (build first after an API change).

### Consumer layout

This section is the consumer contract. Consumer agents follow it through the
[61ade-consumer skill](../.agents/skills/61ade-consumer/SKILL.md), which is a
checklist that links back here.

Example with consumer-chosen paths. In development, the consumer links the
shared checkout:

```sh
ln -s /space/share/libs/61ade/packages/php lib/61ade
ln -s /space/share/libs/61ade/packages/frontend/dist public/assets/61ade
```

The assets link is a dedicated subdirectory such as `public/assets/61ade`, never
the consumer's whole `public/assets`. Through a whole-directory link, the
consumer's own assets would be written into this shared `dist`. At deploy time
the main sync hides and protects every `shared_assets` target, so the
consumer's own files under that target never reach the release. A `files`
selection with `delete_excluded` also removes anything else already there.

The development links are committed in the consumer repository. Deploy
replaces them with copies: `deploy-site` syncs the consumer tree with
`--no-links` and protects the `shared_assets` targets during that sync. It then
removes a symlink found at each target and copies the asset there. (The
symlink refusals such as "Refusing to replace symlink with different target"
belong to the separate `links` option; `shared_assets` refuses only when a
target is a file where a directory is expected, or the reverse.) The consumer's
`.deploy.json` copies the same paths:

```json
{
    "shared_assets": [
        {
            "source": "/space/share/libs/61ade/packages/php",
            "target": "target:lib/61ade"
        },
        {
            "source": "/space/share/libs/61ade/packages/frontend/dist",
            "files": ["admin.js", "admin.css"],
            "target": "target:public/assets/61ade"
        }
    ]
}
```

Cache keys need no consumer action: the shell keys `admin.js`, `admin.css`,
skin stylesheets and the project's own `modules` and `stylesheets` by the
served file's modification time and size
([cache keys](toolkit.md#cache-keys)), so a new 61ade commit, a deploy copy or
a rebuilt project module reaches browsers on the next page load. Consumers bump
no asset version and edit no template; `version` only labels the release in the
lower bar and is the fallback key. The development link above leaves the
consumer's document root, so `admin.js`/`admin.css` there take the key of this
checkout's `dist` build, which is the same file. A host whose
`DOCUMENT_ROOT` is not the directory served at `/` sets `documentRoot`
(JSON `application.document_root`).

A project that uses `SandboxFrame` lists
`["admin.js", "admin.css", "sandbox.html", "sandbox.js"]` instead; the frame
loads `sandbox.html` from the directory of `admin.js`. `admin.d.ts` is never
deployed: the development link already exposes it for the
[TypeScript recipe](toolkit.md#typescript-recipe).

The autoloader goes in the consumer's earliest common bootstrap, before any
entrypoint touches a `Blade\` class. An entrypoint that runs framework code
before the application file is loaded needs it first. Here `__DIR__` is the
consumer directory that holds `lib/61ade`:

```php
spl_autoload_register(static function (string $class): void {
    if (str_starts_with($class, 'Blade\\')) {
        $file = __DIR__ . '/lib/61ade/src/' . strtr(substr($class, 6), '\\', '/') . '.php';
        if (is_file($file)) {
            require $file;
        }
    }
});
```

PHP resolves symlinks for `__DIR__`, so in development the framework loads its
templates, locales and other resources from this checkout through the link. In
a release it loads them from the copy. `packages/php/bin/live-bridge.php` (the
WebSocket worker, see [live data](workspaces.md#élő-adat-konfigurálása-és-futtatása))
requires `BLADE_AUTOLOAD_FILE`. Point it at a consumer PHP file that registers
this autoloader and anything else the application file needs. Do not point it
at a Composer `vendor/autoload.php`, which a consumer no longer has.

Committed consumer files must not depend on anything else from this checkout.

#### Live-data service (WebSocket)

Polling needs nothing beyond PHP. For `LiveConfig` transport `websocket`, the
consumer runs `packages/php/bin/live-server.mjs` from its copied `lib/61ade`:
a committed, self-contained bundle with the pinned `ws` inlined. A release
needs only the system `node` (18+) and PHP 8.4; no `npm install` and nothing
from `node_modules`. The server starts `live-bridge.php` beside itself.
Both reload themselves: the bridge exits with 75 when a loaded PHP file changes
and the server respawns it without closing sockets; a changed bundle makes the
server close sockets with 1012 and exit with 1. The supervisor must therefore
restart the service on failure (deploy-jobs `service` mode, systemd
`Restart=on-failure`). The server speaks live protocol 2: one connection per
browser tab with up to 64 subscriptions, at most 100 connections per server
([protocol](workspaces.md#live-channel)).

The consumer declares it in its `.deploy-jobs.json` as a service under the
PHP-FPM identity, so the bridge reads the sessions and runtime the web pool
writes. Example with consumer-chosen paths (environment values are literal
absolute paths):

```json
{
    "id": "live",
    "description": "61ade WebSocket live data",
    "host": "catalyst",
    "mode": "service",
    "run_as": "web",
    "cwd": "apps:.",
    "command": ["/usr/bin/node", "lib/61ade/bin/live-server.mjs"],
    "environment": {
        "BLADE_LIVE_PORT": "8091",
        "BLADE_LIVE_ORIGIN": "https://admin.example.test",
        "BLADE_AUTOLOAD_FILE": "/space/apps/example/bootstrap.php",
        "BLADE_APPLICATION_FILE": "/space/apps/example/application.php",
        "BLADE_PHP": "/usr/bin/php8.4"
    }
}
```

The application definition sets the matching endpoint:
`live: new Blade\Live\LiveConfig('websocket', 'wss://admin.example.test/live')`.
Further application files of the same hostname share the service: list them in
that definition's `applications` (name → absolute file) and give each its
endpoint `<endpoint>/<name>` ([live data](workspaces.md#élő-adat-konfigurálása-és-futtatása)).
The server listens on `127.0.0.1:<BLADE_LIVE_PORT>` and accepts only an
upgrade whose `Origin` equals `BLADE_LIVE_ORIGIN` exactly. Each hostname
(production and development) therefore needs its own service with its own
port and origin. The `/live` proxy on the hostname and the loopback port are
requested from Infra; the consumer does not configure the web server. The
service may write only the project's tmp and data roots, so the application
file's runtime (sessions, `live/` tickets) must lie there. Keep polling until
the proxy is live: WebSocket selection does not fall back to polling.

#### Release reproducibility

`deploy-site` refuses a `shared_assets` source when it is not in a Git
checkout, when the copied paths have uncommitted or untracked files (ignored
files are allowed), or when HEAD is not on its upstream. It records the copied
library commit in the consumer's `.deploy-history.jsonl`. For this repository,
that means `packages/php` and the two `dist` files must always be committed and
pushed. A half-done change there blocks every consumer's release until it is
committed or removed.

### Breaking changes

Every pushed commit goes live on all consumers' development sites at once, and
into their production on their next deploy. A breaking change to a public PHP,
configuration, template, database or frontend contract therefore needs a
coordinated update of every affected consumer in the same session, before or
together with the push. Run the [focused checks](#focused-task-groups) for each
change before every push.

- **Live protocol 2 (2026-10-29, [FB-0075](feedback.md#fb-0075)):** one live
  channel per tab (`hello`/`ready`, `subscribe`/`unsubscribe` by id,
  per-subscription `denied`) replaces one socket per list. The frontend `dist`
  and `packages/php/bin/live-server.mjs` must ship together in the same commit
  and release. A page loaded before the update gets 4409 from the new server
  and reloads once. Consumers running a WebSocket service restart nothing
  extra (the service restarts itself on a changed bundle), but a release that
  copies only one half breaks live lists. The frontend `Workspace` constructor
  now takes the shell's `LiveChannel` instead of a `LiveConfig`; consumers that
  only use `AdminShell` are not affected. Batched `__watch`
  (`values.subscriptions`) is new; the single-list form is still accepted.

- **File-derived cache keys (2026-10-30, [FB-0081](feedback.md#fb-0081)):**
  `admin.js`/`admin.css` are linked with `?v=<base36 mtime>-<base36 size>` of
  the served file instead of the hand-bumped `?v=32`; project `modules` and
  `stylesheets` get the same key instead of `?v=<version>` (still the
  fallback), and skin stylesheets and AuthHandler files gain one
  ([cache keys](toolkit.md#cache-keys)). Runtime needs no consumer change.
  Consumer browser specs that assert `?v=32` or `?v=<version>` on these URLs
  must accept the file key.

- **Toolkit transition (2026-10-29 to 2026-10-30, [FB-0081](feedback.md#fb-0081),
  [ADR-0005](decisions/0005-toolkit.md)):** the owner accepted breaking changes
  for this transition. As an exception to the rule above, the consumers migrate
  afterwards in their own sessions; 61ade sessions do not edit them. The
  [migration guide](toolkit.md#migration) lists every breaking and
  consumer-relevant change since `131263a`, the 61ade commit both consumers
  last released (M1–M15: `#view=` routing with the `#feature=` alias,
  `view:<id>` menu ids, `View` return values, `stylesheets`, sandbox files,
  file cache keys including the released `?v=30`, record commands in the list
  toolbar only, and the rest), followed by the ordered steps of a consumer
  session. Per-consumer notes: [StoryBloX](handoff/storyblox.md),
  [allflow](handoff/allflow.md).

#### Consumer update smoke check

The update reaches a consumer by itself, so the check comes after the push and
before the consumer's next release:

1. List what changed since the commit last released:
   `git -C /space/share/libs/61ade log --oneline <commit>..origin/main`, with
   `<commit>` taken from the last `shared_assets` record in
   `.deploy-history.jsonl`. Read the matching [feedback](feedback.md) entries
   for contract changes.
2. On the consumer's development URL: sign in, open the menu, open one list
   and one form, save one synthetic change and revert it. Check the browser
   console and the PHP error log for new errors.
3. Run the consumer's own browser specs through its
   [guarded wrapper](#consumer-browser-tests).
4. Run `deploy-site` only after these pass.

#### Consumer browser tests

Consumer specs cannot `require('@playwright/test')`: the system runner's
package is not on the consumer's module path. A consumer has two files of
its own:

- `tools/playwright.sh` derives the system `@playwright/test` from the exec
  target of `/usr/local/bin/playwright`, exports it in a project variable and
  runs `exec /space/share/bin/guarded-playwright test "$@"` with
  `PLAYWRIGHT_GUARD_TMPDIR=/space/share/tmp/<project>/playwright`.
- `tools/playwright-test.cjs` exports `require(<that variable>)`. Specs and
  `playwright.config.cjs` import it instead of `@playwright/test`.

The guard allows one run per host and fixes the worker count, so it refuses
`--workers`/`-j`. It needs the tmp directory under the consumer's existing
`/space/share/tmp/<project>/` and must be started from inside
`/space/share/dev/<project>`. Exit 75/76 (busy, low memory) means retry later.
Consumers do not call this checkout's `tools/run-dev-check.sh`.

#### Consumer test accounts

E-mail confirmation (`default_email_confirmation`, default `true`) applies only
when the consumer configures `authentication` (login security). Without it,
password login is the only gate. With it, a temporary test account either
receives its code through the consumer's mail command or has its
[e-mail confirmation switch](admin.md#fiókkapcsolók) turned off in the Users
admin.

Create the account in the consumer's Users admin. A generated temporary
password leads to a forced password change. The framework has no account
delete, so removal is consumer cleanup in its development database:

- the consumer's identity row;
- rows keyed by the actor ID: `blade_memberships`, `blade_versions`,
  `blade_auth_settings`, `blade_account_state`, `blade_tokens`,
  `blade_login_challenges`, `blade_remembered_logins`, and `blade_rules` with
  `subject_type = 'user'`;
- `blade_audit` rows the account produced or was the target of, if the
  consumer's test policy removes them;
- runtime files: its `runtime/sessions/sess_*` files and `runtime/live/`
  tickets. `runtime/login/*.json` holds password-attempt counters per client IP,
  not per account. Leave those to expire.

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
| Shell/bootstrap/theme | `php8.4 tests/shell/contracts.php`, `configuration.php`; `npm run test:browser -- --project=shell tests/shell/browser.spec.cjs tests/shell/skins.spec.cjs` |
| Workspace/layout/live lists | `php8.4 tests/shell/lists.php`; `node tools/build.mjs` then `node tests/shell/live-protocol.mjs` (live protocol 2 against the bundled server on a free loopback port, own throw-away demo instance under `tmp/`; `BLADE_LIVE_SERVER` may name another bundle); shell `workspace.spec.cjs`, `layout-resizer.spec.cjs`, `mobile-grid.spec.cjs`, `preferences.spec.cjs` |
| ACL/action/API permissions | PHP `access.php`, `permissions.php`, `api-keys.php`; shell `admin.spec.cjs` or the relevant `demo.spec.cjs` selector |
| Accounts/admin | PHP `admin.php`, `permissions.php`; shell `admin.spec.cjs` |
| Tenancy (tenants, scoped resources, keys) | PHP `tenancy.php`, `configuration.php`, `api-keys.php`; shell `tenancy.spec.cjs`, `admin.spec.cjs` |
| Sub-views (expandable rows/cards), record activation | PHP `tenancy.php`, `configuration.php`; shell `subview.spec.cjs`, `subview-demos.spec.cjs`, `tenancy.spec.cjs`, `activation.spec.cjs` |
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
| Toolkit (modules, views, registries, routing) | PHP `toolkit.php`, `contracts.php`, `configuration.php`, `lists.php`; `node tests/shell/toolkit-kernel.mjs`, `toolkit-list.mjs`, `toolkit-components.mjs`, `toolkit-registries.mjs`, `toolkit-sandbox.mjs`, `ui-preferences.mjs`; shell `browser.spec.cjs`, `preferences.spec.cjs`, `activation.spec.cjs`, `toolkit-*.spec.cjs` |

PHP shorthand in the table means `php8.4 tests/shell/<name>.php`.
Inspect affected dependencies: `npm ls --depth=0`, relevant Composer manifest/
path-package mappings and installed autoloading. Syntax checks use
`php8.4 -l <file>`, `node --check <file>` or `bash -n <file>`.

### Existing full smoke and coverage limits

There is **no pre-deploy or post-deploy smoke gate** here. When a full development
regression is actually warranted, the existing broad commands are:

```sh
(for check in contracts access admin api-keys permissions tenancy authentication oauth mail configuration validation i18n lists sorting grid-edit related-fields list-presentation files diagram calendar signage toolkit; do
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

The task budget is tight: Chromium and the two Playwright processes need about
90 tasks, so a spec must not add long-lived processes or threads. Spec fixture
bundles come from `lazyBundle` in `tests/shell/fixture.cjs`, built on first
use, never at the top level of a spec file. Playwright loads every spec file in
the runner to list the tests, so a top-level build bundles the frontend once
per file before any test runs. The configuration sets
`ESBUILD_WORKER_THREADS=0` (and `GOMAXPROCS=2` unless set), so esbuild runs as
a short-lived child per build instead of a resident service in the runner and
the worker. The resident services held about 31 tasks for the whole run. With
them the suite reached the 128-task limit (failed forks: page crashes,
`spawnSync php8.4 EAGAIN`) and the 700 MiB throttle, so unrelated tests failed
at random ([FB-0083](feedback.md#fb-0083)).

This checkout keeps its own guard instead of the host's
`/space/share/bin/guarded-playwright` ([FB-0067](feedback.md#fb-0067)). That
runner refuses to start outside `/space/share/dev/<project>` or
`/space/apps/<project>` (exit 77 from `/space/share/libs/61ade`). It requires
tmp under `/space/share/tmp/<project>/`, which conflicts with this project's
checkout-local `tmp/`. The limits are the same, but the locks differ: this
checkout's lock does not exclude a guarded consumer run on the same host.
Consumers use the host runner, as described in
[consumer browser tests](#consumer-browser-tests). There is no unlimited
fallback if systemd is unavailable. The guard
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

**Framework first, inside 61ade:** 61ade work implements general capabilities
in the framework with its DHTMLX adapters; it does not add one-off flows for a
single consumer.

**Shared infrastructure versus project domain** ([ADR-0004](decisions/0004-project-domain-freedom.md),
[FB-0080](feedback.md#fb-0080)): framework-first covers shared
infrastructure, not a project's domain. 61ade owns startup,
authentication/session, users/ACL/API keys/log admin, menu/shell/layout/windows,
generic forms/grids/trees/cards, dialogs, the upload flow, the file manager, the
action executor, audit, the live channel, localization and themes; a project
never builds a parallel version of one that exists. The project owns its
domain data and storage (including its own files and assets), business logic
and domain-specific UI (players, editors, canvas/SVG/WebGL views) with its own
browser code and libraries, without justification against 61ade. The test is
"would another project need this in the same form?": no → the project builds
it; yes and 61ade has it → use it; yes and 61ade lacks it → request it from
61ade and, without waiting, build an interim local version marked with the
request reference, migrating when 61ade delivers. Every server read/write
channel enforces authorization, and agent-written or otherwise untrusted code
runs only in a sandboxed `<iframe>` (`sandbox="allow-scripts"`, no
same-origin), never in the admin session's origin.

61ade is ADE v2, a reusable admin framework in a separate Git repository.
It owns application startup, configuration, authentication/session, permissions,
menus, layout, windows, forms, grids, communication, errors and state management.
UI controls use its DHTMLX adapters by default. Consumers own configuration,
business definitions/rules and concrete identity/data/integration adapters.
Do not add hand-built HTML/CSS replacements for the shared admin
infrastructure or parallel infrastructure to compensate for a missing framework
capability; a project's domain UI is not such a replacement.

Every application requires the framework's user, ACL, API-key and log admin
built from its own definitions/tools (FB-0036, ADR-0003). Consumers supply
configuration and adapters. The [product direction](product-direction.md)
R1–R12 is canonical; distinguish accepted requirements, evidence and open work.
There is no external framework benchmark or exhaustive component target
(FB-0037). New capabilities must be localized, themed, represented in the feature
demo and documented in the event catalog. No eval/executable configuration
strings; generated ACL catalogs never grant permission.

Keep CityScreen/ADE business code, table names, production data and integration
dependencies out of 61ade. Do not modify CityScreen runtime, database or old admin
as a side effect. `_AuthHandler` at `/space/share/libs/_AuthHandler` is a separate
library and must not be edited during 61ade work. Its links are
`lib/_AuthHandler` and `examples/demo-app/public/lib/_AuthHandler`. Fill gaps
in the 61ade adapter or a separately authorized library task (FB-0046).

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
alone are not parity. 61ade owns general validators; consumers own concrete
formats, thresholds and business exceptions. Verify client and server/UI/API
paths. Any remaining difference requires a documented decision.
