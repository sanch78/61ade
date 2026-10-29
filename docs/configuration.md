# JSON configuration and host environment

Declarative configuration is server-side modular JSON. Host addresses, database
credentials, runtime paths and public endpoints come from env. Business procedures
remain named registered PHP callbacks. No PHP/JavaScript in JSON, eval or automatic
class instantiation is supported.

<a id="belépés-és-alkalmazásszekciók"></a>

## Entrypoint and application sections

```php
return JsonApplication::load(
    file: __DIR__.'/config/application.json',
    identityBindings: Accounts::bindings(),
    workspaceBindings: WorkspaceBindings::create(...),
);
```

| Section | Responsibility |
| --- | --- |
| `description` | Human explanation, not runtime configuration; valid on every configuration object. |
| `environment` | Env files and the process variable selecting an alternate file. |
| `application` | `title`, `runtime`; relative runtime paths resolve from the JSON directory. Optional `version`, `skins` naming an identity binding `Closure(Identity): list<Skin>` ([application skins](shell.md#application-skins)), and `modules` / `stylesheets`: browser paths of the project's ES modules and CSS ([module loading](toolkit.md#module-loading)). |
| `database` | MySQL `host`, integer `port`, `name`, `charset`, `user`, `password`; password requires an env reference. |
| `session` | `name`, `cookie_path`; the framework owns session lifecycle. |
| `identity` | SQL account schema and named `allowed`/`password_verifier` adapters. |
| `authentication` | Optional [e-mail verification and remembered login](authentication.md), delivery and text overrides. |
| `admin` | Built-in [user/permission admin](admin.md); `identity.username_column` must be the e-mail column. Optional `protected_role`, default `admin`. |
| `live` | `transport` (`poll`/`websocket`), `endpoint`, integer `interval_ms`. Optional `applications`: name → application file (relative to the JSON directory) the WebSocket server also serves at `<endpoint>/<name>` ([live data](workspaces.md#élő-adat-konfigurálása-és-futtatása)). |
| `tenancy` | Optional; an empty object `{}` enables [multi-tenancy](tenancy.md). No other keys yet. |
| `workspace.modules` | Module JSON paths relative to the configuration directory; views supply menus. |

Env reference example:

```json
{
    "environment": {
        "files": [{"path": "../.env", "optional": true}],
        "override_file_env": "EXAMPLE_ENV"
    },
    "live": {
        "description": "The project's live transport and public endpoint.",
        "transport": {"$env": "EXAMPLE_LIVE_TRANSPORT", "default": "poll"},
        "endpoint": {"$env": "EXAMPLE_LIVE_ENDPOINT", "default": "live"},
        "interval_ms": {"$env": "EXAMPLE_LIVE_INTERVAL", "default": 2000, "type": "integer"}
    }
}
```

References are exact `{"$env":"NAME","default":value,"type":"string|integer|boolean"}`
objects. Without `default`, the variable is required. Resolution replaces the
whole value, without string interpolation. Precedence: process env, files in
reverse order, JSON default. With `override_file_env`, only the selected env file
loads. Files are INI-compatible `KEY=value`, not shell: no export, commands or
variable substitution. Local `.env` stays ignored; `.env.example` contains placeholders only.

<a id="mail-command"></a>

## Mail command

`$.authentication.mail` is consumer-supplied. On our hosts applications hand
mail to local Postfix through the Infra helper
`/space/share/bin/send-infra-mail.php`; they hold no SMTP credentials. A working
configuration ([placeholders and checks](authentication.md#levélküldés)):

```json
"mail": {
    "command": [
        "/usr/bin/php", "/space/share/bin/send-infra-mail.php",
        "--from={from_address}", "--from-name={from_name}",
        "--to={recipient}", "--subject={subject}",
        "--html", "--body-file={body_file}", "--transport=auto"
    ],
    "command_timeout_seconds": 30,
    "from_address": "noreply@cyberspace.hu",
    "from_name": "Example admin"
}
```

The helper accepts only `cyberspace.hu` senders by default; another domain is
an Infra decision. Exit code 0 means local MTA acceptance only; 61ade never
retries. A manual run of the helper sends real mail, so test only with the
owner's own address. `/usr/sbin/sendmail -t -i` reads MIME on stdin and is not
supported by this delivery.

<a id="moduldefiníció"></a>

## Module definition

Complete synthetic example: [notes.json](../tests/fixtures/configuration/notes.json).

| Section | Responsibility |
| --- | --- |
| `section_descriptions` | Free-text section explanations, non-executable metadata. |
| `lookups` | Named permission-filtered selectors: `resource`, `table`, `key`, `label`; optional `owner`, `where`, `extra`, `tenant_column` (choices of the active tenant only). |
| `resources.<name>.storage` | `table`, `key`; optional `owner_column`, `defaults`, `where`, `self_only`, `tenant_column` (a [tenant-scoped](tenancy.md#tenant-scoped-resources) resource; server-stamped, never a field). `where` is trusted developer-authored SQL. |
| `fields` | `name`, `label`; optional `type`, `required`, `max`, `secret` and one choices source: `options`, `options_lookup` or `options_binding`. `validation` follows [form validation](validation.md); `checkbox`, `default` and `column` (including optional secondary grid columns) follow [field presentation](field-presentation.md). `editor` names a project field type (dotted, [registries](toolkit.md#registries)); `column.presentation` may name a project presentation. |
| `operations` | `create`/`update` default true; `delete` defaults false. |
| `hooks` | `guard`, `normalize`, `after_save`, `delete_guard`, `after_delete`: explicit PHP binding names. `after_save` runs after create/update only; `after_delete` (`fn(Context, string $id, array $target)`) after a delete. |
| `operations.delete_policy` | `delete` (default) or `archive` (requires `delete: true` and consumer columns `archived_at`/`archived_by`); see [record delete policy and usages](workspaces.md#delete-usages). |
| `storage.computed` | `{name: SQL expression}` over the base row `blade_base` (trusted developer SQL, no `;`/`?`); the name must also be a declared text/number field, which becomes read-only and sortable. |
| `fields[].type: "file"` | With `file: {resource, mount, accept: ["image","video"], folder?}`: a file reference picked from or uploaded into a file-manager mount; see [workspaces](workspaces.md#file-field). |
| `view` | `title`; optional `id` (the [view id](toolkit.md#views), default the resource name), `group`, `singleton`, `columns`, `actions`, `layout`, `row_numbers`, `selection`, `row_selection`, `icon`, `desktop_only`, `row_height` (32–160), `tile_min_width` (120–480), `tiles`, `search` (field names), `subview` (`resource`: the child view id, which is its resource name unless that view declares another `id`; `field`; optional `embed`, default true: see [sub-views](workspaces.md#sub-views)), `activate` (`details`, `subview`, `page`, `view:<id>` or a record action of the view, or an activation map `{"field": …, "map": {value: target, "*": target}}`: what double-click and Enter run, see [record activation](workspaces.md#activation)), `commands` (at most 20 dotted [client command](toolkit.md#registries) names for the toolbar and record menu). Omitted columns/actions use the registered resource's default view. Media columns (`column.media`), icon columns (`column.presentation`), tiles and search: [workspaces](workspaces.md#media-tiles). |
| `view.layout` | `form_mode` (`overlay`/`panel`) and optional validated `tree`; see [workspaces](workspaces.md). |
| `actions` | Additional registered actions: `resource`, `name`, `label`, `handler`; optional `fields`, `target_resource`, `write`, `channels`, `form_values` (named initial-value binding). |
| `views.<id>` | Views of a project kind ([toolkit views](toolkit.md#views)), keyed by view id: `kind` (dotted, registered in the browser by a project module) and `title`; optional `resource`, `record` (a [record view](toolkit.md#record-views); needs that resource's `get`), `actions` (of `resource`), `options` (sent to the browser verbatim: JSON only, at most 64 KiB encoded, never backend-only data), `open` (`page`/`window`), `group`, `icon`, `desktop_only`. Built-in kinds are declared through `resources.<name>.view`, `fileManager()`, `diagram()` and `calendar()`. |

The compiler builds lookups/SQL resources, then custom actions, then the
resource views, then the module-level `views`, then sub-views; `view:<id>`
activation targets are checked last, once every view exists. Views may
therefore reference actions declared later in the same or another module.
Unknown keys, bindings, lookups, action resources and duplicate definitions
(including a view id declared twice in JSON) fail. The PHP definition API
remains available; JSON builds the same 61ade classes (`Blade\Feature\View`
through `Registry::addView`).

`workspaceBindings` is a `(Workspace, Registry): array` closure returning an
explicit name → closure map. JSON cannot discover arbitrary PHP functions.
Callbacks run inside common ACL/transaction/audit handling. Full configuration
and callback names stay server-side; only permitted view/field metadata reaches browsers.

<a id="ellenőrzés-és-korlát"></a>

## Verification and limits

`tests/shell/configuration.php` covers process/file/default precedence, type and
missing-value errors, invalid JSON, a complete synthetic application, bindings,
CRUD, layout, ACL and audit, plus `view.id`, activation maps, module-level
`views` and `application.modules`/`stylesheets`; `tests/shell/toolkit.php`
covers the PHP view, kind-provider and module contracts behind them. The optional fourth PDO argument of
`JsonApplication::load` injects an existing connection/isolated fixture;
otherwise it opens the declared MySQL connection.

Module JSON does not resolve env references; features belong there independently
of hosts. Configuration is trusted developer material loaded from the checkout,
with no HTTP editor or hot-reload protocol. Restart long-lived workers after
configuration changes. Complete JSON Schema/editor autocomplete and static
callback typing do not exist; the runtime compiler validates supported structures.

Optional string `application.version` supplies the application release identifier
shown beside `application.title` in the lower shell bar; no automatic framework-version substitution.

`application.modules` (`.js`/`.mjs`) and `application.stylesheets` (`.css`) are
browser paths relative to the page (not to the JSON directory) or root-absolute,
with `[A-Za-z0-9_-]` segments and an optional `?…` cache key; anything else, a
duplicate or a non-list fails at load. Without a cache key the shell appends
`?v=<application.version>` when the version is set. Only signed-in pages link
the stylesheets (after the framework CSS and skins) and list the modules in the
bootstrap `modules` key; the sign-in, e-mail confirmation and password-change
pages load neither ([module loading](toolkit.md#module-loading)).

`storage.related` declares a validated one-to-one mapping: `table`, `key`,
`fields`, optional `defaults`. Saving shares the main form's transaction,
revision, ACL and audit; see [related storage](field-presentation.md#egy-az-egyhez-kapcsolt-tárolás-a-főűrlapon).
