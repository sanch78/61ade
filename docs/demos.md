# Demos: full feature demo and starter admin

Status: implemented and verified on 2026-10-21
([FB-0044](feedback.md#fb-0044--demók-szétválasztása-checkboxos-fiókállapot-oauth-kétfaktor-parancsos-levél-nyelv-api-kulcs));
user acceptance is not claimed.

Two independent applications share the Composer consumer `examples/demo-app`
and managed server, with separate SQLite databases, sessions and cookie paths:

| Demo | URL | Definition | Data | Purpose |
| --- | --- | --- | --- | --- |
| Full feature demo (kitchen sink, R11) | https://61ade.sanch.hu/ | [application.php](../examples/demo-app/application.php) | `tmp/web/features.sqlite` | Every demonstrable capability on synthetic data. |
| Starter admin | https://61ade.sanch.hu/admin/ | [admin-application.php](../examples/demo-app/admin-application.php) | `tmp/web/admin.sqlite` | Exactly the mandatory starter: login, language/theme selectors and admin module. |

Use this single development environment directly. Development and testing happen
there; there is no deployment, post-deployment testing or project backup workflow
([FB-0049](feedback.md#fb-0049), [FB-0051](feedback.md#fb-0051)).
CLI fixture tools do not establish a second environment.
See [development](development.md#development-environment) for build/asset preparation.

<a id="alapadmin-admin"></a>

## Starter admin (`/admin/`)

Menu: `Adminisztráció` → Users, Roles, Role memberships, Role permissions,
Individual permissions, API keys. No business modules. Hungarian/English
selector and per-account default language. Login:
`demo@example.test` / `61de-demo`; the first admin comes from explicit
`Permissions::grantAdministration` in setup.

Assembly is account mapping plus [Administration::register](admin.md#kötelező-adminmodul-egy-lépésben).
The subpath uses `cookiePath: '/admin/'`, `assets: '../assets'`; see [shell](shell.md).

<a id="teljes-feature-demó-"></a>

## Full feature demo (`/`)

| Area | Demonstration | Try |
| --- | --- | --- |
| Password login | E-mail/password, 90-day remember option | `demo@example.test` / `61de-demo` |
| E-mail second factor | Code after password; formatted message with project text/color overrides | `twofactor@example.test` / `61de-demo`; code in [mailbox](#demó-postafiók-mailbox) |
| OAuth (AuthHandler) | External-account button → native provider overlay; existing OAuth-enabled accounts only, no password | Native Google/Facebook buttons; missing keys show setup feedback, configured keys start the real provider flow; [setup](authentication.md#szolgáltatói-beállítás-google-facebook), HTTPS required |
| Language | Hungarian/English selector before theme, language row in login form, account default used for login and mail | `twofactor@example.test` defaults to English |
| User admin | Disabled, OAuth, e-mail confirmation, default language as form/grid checkbox/select | Administration → Users |
| ACL | Roles, memberships and catalog-based rules | Administration |
| API keys | Once-only secret, multiselect action scope, revocation checkbox | Administration → API keys |
| Workspace | Filters, sorting, panel forms, cards, inline text/select/checkbox edits, related storage, pattern validation, multiselect, delete, marks and bulk business action | Feature demo → Tasks; Notes |
| Dialogs | Six severity/mode combinations, long messages and mobile | Select a task and use `Párbeszéd: …` actions, confirmation then acknowledgment; [details](dialogs.md); also at ≤480 px |
| Menu | Unimplemented disabled item and policy-filtered item | `Nyilvántartás` |
| Appearance | Skyblue/light/dark, lower information bar and mobile menu | Any view |

Synthetic accounts: `demo@example.test` (admin), `viewer@example.test`
(menu only), `blocked@example.test` (consumer `active=0`),
`twofactor@example.test` (code, English default), `oauth@example.test`
(OAuth only; random unknown password). Shared synthetic password: `61de-demo`.

<a id="oauth-kulcsok"></a>

### OAuth keys

Keys stay in ignored `examples/demo-app/.env`:
`BLADE_DEMO_GOOGLE_CLIENT_ID`/`_SECRET`,
`BLADE_DEMO_FACEBOOK_CLIENT_ID`/`_SECRET`;
`BLADE_DEMO_URL` supplies callback base. See [provider setup](authentication.md#szolgáltatói-beállítás-google-facebook).
No simulated provider or mockup page remains (FB-0047).

<a id="demó-postafiók-mailbox"></a>

### Demo mailbox (`/mailbox/`)

The demo does not send mail. It uses [command delivery](authentication.md#levélküldés)
with [bin/outbox.php](../examples/demo-app/bin/outbox.php), saving complete MIME
messages in `tmp/demo/outbox` (last 50). The mailbox renders HTML inside a
sandboxed frame.

<a id="kivétel-az-1-szabály-alól-dokumentáltan"></a>

### Documented framework-first exception

`/mailbox/` is a test double for an external recipient mail client, not an
admin interface. Extending the framework cannot replace the external party
being simulated. Boundary: demo/tests only, no 61de admin functionality, never
a consumer operational interface.

<a id="webszerveres-futtatás-apache--php-fpm"></a>

## Web-server execution (Apache + PHP-FPM)

The managed URL serves `public/` behind the web server with an IP access policy.
Compared with the retained CLI fixture tooling:

- `public/.htaccess` sets `BLADE_DEMO_INSTANCE web`, selecting `tmp/web/`; CLI uses `tmp/demo/`. The developer and `www-data` therefore do not write the same instance.
- Initial/schema setup: `BLADE_DEMO_INSTANCE=web php8.4 examples/demo-app/setup-workspace.php`. Setup creates 02770 directories and 0660 databases. If group access is insufficient, a platform-approved ACL is needed, e.g. `setfacl -R -m u:www-data:rwX,d:u:www-data:rwX tmp/web`; do not change host policy as an onboarding workaround.
- Apache must forward Authorization to FPM. `CGIPassAuth On` in `.htaccess` supplies this; otherwise Bearer calls appear as UI calls and return 403. Every Apache-hosted consumer needs it or equivalent vhost configuration.
- Under FPM, `PHP_BINARY` is the daemon. The demo selects the CLI interpreter via `BLADE_PHP`, otherwise `PHP_BINDIR/phpX.Y`.
- OAuth callbacks use configured `BLADE_DEMO_URL`, never Host. Key files must be readable only by developer/web-server principals; the documented access arrangement is no other-user permissions plus a `www-data` read ACL. Both AuthHandler links must be readable by the server.

<a id="folyamatos-bővítés-kötelező"></a>

## Continuous extension (mandatory)

Every demonstrable new framework capability enters the full feature demo as
module, field, action or configuration and the table above in the same batch.
The starter admin changes only when the mandatory starter set changes.
See [project rules](development.md#mandatory-framework-development-rules).

<a id="ellenőrzés"></a>

## Verification

- `php8.4 tests/shell/contracts.php`: both setups, exact starter views, separate sessions/paths/assets and feature-demo accounts/login modes.
- Ignored `.env.test` selects `BLADE_DEMO_URL` and `BLADE_DEMO_INSTANCE=web`; the shell project uses the managed server without starting `php -S`.
- `npm run test:browser -- --project=shell tests/shell/demo.spec.cjs`: login modes/language row, provider overlay/start, mailbox code/English default, account columns, API issue/use/revoke, starter menu and Tasks. Real provider completion remains unverified; FB-0050 records Google's callback mismatch.
- `npm run test:browser -- --project=shell tests/shell/dialogs.spec.cjs`: six combinations on desktop/320×480, keys/focus and invalid-login caller.
- Manual verification: open the managed URLs directly from the checkout.

<a id="korlátok"></a>

## Limits

- The unauthenticated demo mailbox is a development tool, not a consumer security pattern.
- Retained `php -S` utilities are not a permitted testing route on this host or an operational reference.
