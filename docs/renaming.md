# Naming and migration

Decision: 2026-10-21, [FB-0050](feedback.md#fb-0050); name corrected
2026-10-29, [FB-0070](feedback.md#fb-0070). The product is **61ade**, the same
spelling as the repository, checkout and hostname. The owner selected **blade**
(the letter reading of 61ade) wherever the leading digit cannot be used as an
identifier. This is a breaking interface rename, with no old-name aliases.

| Surface | Current spelling |
| --- | --- |
| Product and demo titles | `61ade` |
| PHP package / PSR-4 namespace | `sanch78/61ade` / `Blade\` |
| Frontend package / asset command | `@61ade/admin` / `61ade-assets` |
| Environment variables | `BLADE_*`, including `BLADE_TMP_DIR`, `BLADE_PHP`, `BLADE_DEMO_URL` |
| SQL tables, built-in resources and fields | `blade_*` |
| DOM IDs, CSS classes and custom properties | `blade-*`, `--blade-*`, `data-blade-*` |
| UI preferences | `blade-ui:1:` local-storage namespace |
| Workspace / OAuth bootstrap query | `?blade=1` / `?blade_auth=bootstrap` |
| HTTP headers | `X-BLADE-CSRF`, `X-BLADE-Locale`, `X-BLADE-HTTPS`, `X-BLADE-Client-IP` |
| Demo password | `61ade-demo` (synthetic accounts only) |
| Repository, checkout, development URL | `sanch78/61ade`, `/space/share/libs/61ade`, `https://demo.61ade.com/` |

The single development environment, direct source use and absence of deployment
and project backup workflows remain as defined in [development](development.md#development-environment).
Product, packages, repository, checkout and hostname all use `61ade`.

## 61de → 61ade correction (2026-10-29)

The 2026-10-21 rename recorded the product as `61de`, a misspelling of the
requested `61ade`. The correction renames only these surfaces; `Blade\`,
`BLADE_*`, `blade_*` and every other identifier in the table stay unchanged:

| Surface | Before | Now |
| --- | --- | --- |
| Product and demo titles | `61de` | `61ade` |
| PHP package | `sanch78/61de` | `sanch78/61ade` |
| Frontend package / asset command | `@61de/admin` / `61de-assets` | `@61ade/admin` / `61ade-assets` |
| Consumer skill | `61de-consumer` | `61ade-consumer` |
| Recommended consumer links | `lib/61de`, `public/assets/61de` | `lib/61ade`, `public/assets/61ade` |
| Demo password | `61de-demo` | `61ade-demo` |

No database, session, header, preference or file path inside the packages
changes, so an existing consumer keeps working on its old link names. A
consumer migrates by renaming its links and every reference to them (autoloader
path, includes, `.deploy.json` `shared_assets` targets, asset URLs, live-server
command), and a `sanch78/61de` Composer requirement to `sanch78/61ade`. For this
checkout, the synthetic accounts that still used `61de-demo` in the retained
`tmp/{web,demo}` and `tmp/contracts-demo/demo` databases were rehashed to
`61ade-demo`; customized passwords were preserved.

## Consumers and private configuration

Update imports, package requirements, workspace links, application session names,
CSS hooks, request headers/query parameters, built-in resource/field references
and environment variable names together. For example:

```php
use Blade\Access\Schema;
use Blade\Admin\Administration;
```

```ini
BLADE_DEMO_URL=https://demo.61ade.com
BLADE_DEMO_GOOGLE_CLIENT_ID=
BLADE_DEMO_GOOGLE_CLIENT_SECRET=
BLADE_DEMO_FACEBOOK_CLIENT_ID=
BLADE_DEMO_FACEBOOK_CLIENT_SECRET=
```

Rename setting keys in private env files without changing credential values.
The demo's private `.env.test` and `examples/demo-app/.env` were updated locally;
they remain Git-ignored. The Apache demo instance selector in `public/.htaccess`
uses `BLADE_DEMO_INSTANCE=web`. External provider callbacks still use AuthHandler's
own `ah_action` parameters; these belong to the unchanged `_AuthHandler` library.

Install consumer dependencies and regenerate Composer autoload metadata after
updating the package definitions. For this checkout, existing generated Composer
metadata and local package symlinks were updated without installing dependencies;
Composer is not installed on the host, so a fresh Composer install was not tested.
The lockfile's content hash follows Composer's existing manifest hash format.
Installed third-party implementation code and the shared AuthHandler library
were not edited. These changes do not migrate another application's checkout.

New session cookie names require signing in again. Old browser preference keys
are no longer read, so grid/theme preferences start with the configured defaults.
No automatic browser-state migration or old-name protocol compatibility is provided.

## Existing SQLite databases

Prerequisites: PHP 8.4+, PDO SQLite, exclusive application access during the
migration, and the complete source framework schema (all eleven tables).
Run the explicit framework-owned migration **before** running the renamed
application or `Schema::install()` against an existing database. Never execute
this migration as an HTTP side effect.

The migration returns a callable accepting the database and its previous table
prefix (without a trailing underscore). Supply the actual previous prefix;
`legacy` is only a synthetic example:

```php
$migrate = require '/path/to/61ade/packages/php/migrations/0001-rename-prefix.php';
$db = new PDO('sqlite:/path/to/consumer.sqlite', options: [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
]);
$renamedTables = $migrate($db, 'legacy');
```

The transaction renames framework tables and their indexes, translates built-in
resource/field names in ACL and audit records, and translates resource names in
JSON or comma-separated API-key scopes. Account state, rule effects, token hashes,
row IDs and business tables remain intact. It creates no rights. A repeated run
with no source tables returns zero; mixed old/new tables and incomplete schemas
are rejected. An error rolls the transaction back. Use the same existing database
file; no new data root is needed.

Limitations: this migration supports SQLite only; MySQL migration is not
implemented or verified. It targets the current eleven-table schema. A different
historical schema needs its own reviewed migration. It does not rewrite consumer
business data or reset consumer passwords. For this checkout only, the four
synthetic `tmp/{web,demo}/{features,admin}.sqlite` databases were migrated;
accounts still using the previous documented demo password were changed to
`61de-demo` (now `61ade-demo`, see the correction above). Customized passwords
were preserved.

## Verification

Run the PHP contract, ACL, admin, token, configuration, authentication and
localization checks; run frontend typecheck/build and prepare demo assets with
`npm run demo:assets`. Through the protected wrapper, test the managed development
URL for password sign-in, admin resources, CSRF requests, dialogs and OAuth overlay
startup. A provider redirect does not prove a completed external provider login.

Migration verification must cover retained row IDs/data, deny rules, both scope
formats, renamed indexes, repeated invocation, collision refusal and rollback.
Record actual results in [FB-0050](feedback.md#fb-0050).
