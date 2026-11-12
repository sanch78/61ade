# JSON configuration and host environment

Declarative configuration is server-side modular JSON. Host addresses, database
credentials, runtime paths and public endpoints come from env. Business procedures
remain named registered PHP callbacks. No PHP/JavaScript in JSON, eval or automatic
class instantiation is supported. Browser behaviour is a project module
(`application.modules`) that registers the dotted names the JSON refers to
(`kind`, `editor`, `column.presentation`, `commands`;
[toolkit](toolkit.md#registries)).

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
| `application` | `title`, `runtime`; relative runtime paths resolve from the JSON directory. Optional `version`, `skins` naming an identity binding `Closure(Identity): list<Skin>` ([application skins](shell.md#application-skins)), and `modules` / `stylesheets`: browser paths of the project's ES modules and CSS ([module loading](toolkit.md#module-loading)). Optional `document_root`: the directory served at `/`, relative to the JSON directory, default the request's `DOCUMENT_ROOT` ([cache keys](toolkit.md#cache-keys)). Optional sign-in customization ([shell](shell.md#sign-in-branding)): `logo` `{image, dark_image?, label?, placement?}`, `sign_in_stylesheets`, `sign_in` `{notice?, links?: [{label, href}], close_href?}` and `sign_in_modules`. Optional `guides`: view id → [view guide](workspaces.md#view-guide) text, for any view including the built-in administration. Optional `menu_separators`: unique declared view-group labels that get a preceding native separator ([menu groups](shell.md#menu-group-separators)). Optional `public_identity`: the string id of a dedicated active account whose explicit UI rights are available without sign-in ([public access](authentication.md#public-access)); omitted by default. |
| `database` | MySQL `host`, integer `port`, `name`, `charset`, `user`, `password`; password requires an env reference. Optional `collation` of that charset sets the connection collation; it must match the schema's string columns ([connection collation](shell.md#database-connection)). |
| `session` | `name`, `cookie_path`, optional `idle_timeout` (default 1800 seconds), `cookie_lifetime` (default 0); see [session lifetime](authentication.md#session-lifetime). Optional `same_site`: `"Lax"` (default) or `"Strict"` for the session and remember cookies; `"Strict"` with an `oauth` section is rejected at startup ([cookie SameSite](authentication.md#cookie-samesite)); `bind_to_client_address`: boolean, default `false` ([client-address binding](authentication.md#client-address-binding)). Proxy trust is an entrypoint argument, not JSON ([trusted proxies](shell.md#trusted-proxies)). |
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
| `resources.<name>.storage` | `table`, `key`; optional `owner_column`, `defaults`, `where`, `self_only`, `tenant_column` (a [tenant-scoped](tenancy.md#tenant-scoped-resources) resource; server-stamped, never a field), `shared_tenant` and `shared_roles` ([shared rows](tenancy.md#shared-rows): the tenant column value every tenant reads read-only, and the role keys that write it without a tenant). Optional `delegation` ([delegated access](access-and-actions.md#delegated-access)): `read` and `write` lists of `{table, object_column, actor_column, resource_column, via?: {table, key, parent_column}}`; rules with scope `delegated` then match the rows linked to the actor. `where` is trusted developer-authored SQL. |
| `fields` | `name`, `label`; optional `type`, `required`, `max`, `secret` and one choices source: `options`, `options_lookup` or `options_binding`. `validation` follows [form validation](validation.md); `checkbox`, `default` and `column` (including optional secondary grid columns) follow [field presentation](field-presentation.md). `editor` names a project field type (dotted, [registries](toolkit.md#registries)); `column.presentation` may name a project presentation. `scope_only: true` makes a [scope-only field](field-presentation.md#scope-only) (a list scope key offered on no list surface). `section` puts the field into a [form section](workspaces.md#form-sections) (its plain-text label; collapsible, `section_collapsible: false` makes it fixed and always open; `section_fill: true` makes a textarea or file field alone in its section the section's whole content, see [section-filling fields](workspaces.md#form-section-fill)) and a [card and details group](workspaces.md#card-groups); `column.card_lines` (0–50, textarea fields) sets a long text's [card lines](workspaces.md#long-text-in-cards). |
| `operations` | `create`/`update` default true; `delete` defaults false. |
| `hooks` | `guard`, `normalize`, `after_save`, `delete_guard`, `after_delete`: explicit PHP binding names. `after_save` runs after create/update only; `after_delete` (`fn(Context, string $id, array $target)`) after a delete. |
| `operations.delete_policy` | `delete` (default) or `archive` (requires `delete: true` and consumer columns `archived_at`/`archived_by`); see [record delete policy and usages](workspaces.md#delete-usages). |
| `operations.form_sections` | How the create and update forms show the fields' sections: `panels` (default, framed panels), `accordion` (one open at a time, a fixed height like the `Accordion` component) or `accordion-multiple`; see [accordion form sections](workspaces.md#form-accordion). `operations.flush_sections: true` runs the accordion sections edge to edge of the form (needs an accordion `form_sections`). |
| `storage.computed` | `{name: SQL expression}` over the base row `blade_base` (trusted developer SQL, no `;`/`?`); the name must also be a declared text/number field, which becomes read-only and sortable. A computed field may be a `column.media` column (the file id of a referenced record, for its thumbnail). |
| `storage.create_only` | Field names written by create only: the update does not take them and its form shows them read-only ([read-only fields](workspaces.md#read-only-fields)). |
| `storage.counts` | `{field: {resource, match: [fields], filters?: {field: value}, on?}}`: a declared number field counting the records of another list resource the actor could list ([count fields](workspaces.md#count-fields)). |
| `storage.order` | `{field, scope?}`: a manual order on a declared number field within the records sharing `scope`; adds the `move` action ([manual order](workspaces.md#manual-order)). |
| `fields[].type: "file"` | With `file: {resource, mount, accept: ["image","video"], folder?}`: a file reference picked from or uploaded into a file-manager mount; see [workspaces](workspaces.md#file-field). With `file: {upload: "resource.action", get?: "resource.action", accept}`: a file in the project's own storage, uploaded through the project's PHP-registered upload action and saved with the record; see [stored file field](workspaces.md#stored-file-field). |
| `view` | `title`; optional `id` (the [view id](toolkit.md#views), default the resource name), `group`, `singleton`, `columns`, `actions`, `layout`, `row_numbers`, `selection`, `row_selection`, `icon`, `desktop_only`, `row_height` (32–160), `tile_min_width` (120–480), `tiles`, `modes` (the offered presentations of `table`, `cards`, `tiles`; one hides the `Nézet` menu) and `card_columns` (1–6; 1 is one card per row; both [cards only and full-width cards](workspaces.md#cards-only-and-full-width-cards)), `search` (field names), `subview` (`resource`: the child view id, which is its resource name unless that view declares another `id`; `field`; optional `embed`, default true: see [sub-views](workspaces.md#sub-views)), `activate` (`details`, `subview`, `page`, `view:<id>` or a record action of the view, or an activation map `{"field": …, "map": {value: target, "*": target}}`: what double-click and Enter run, see [record activation](workspaces.md#activation)), `commands` (at most 20 dotted [client command](toolkit.md#registries) names for the list toolbar). Omitted columns/actions use the registered resource's default view. Media columns (`column.media`), icon columns (`column.presentation`), tiles and search: [workspaces](workspaces.md#media-tiles). |
| `view.layout` | `form_mode` (`overlay`/`panel`) and optional validated `tree`; see [workspaces](workspaces.md). |
| `view.drop` | `{from, field}`: records dragged in from a list of resource `from` are created here with `field` = their id ([drops](workspaces.md#manual-order)). |
| `view.attention` | `{filters, tone?}`: the menu entry shows a live count of the records matching `filters` (1–8 filterable fields of the resource → string value) in `tone` (`warning`, default, `danger` or `primary`); a list view with a menu entry that is not a singleton ([menu attention](shell.md#menu-attention)). |
| `actions` | Additional registered actions: `resource`, `name`, `label`, `handler`; optional `fields`, `target_resource`, `write`, `channels`, `form_values` (named initial-value binding), `form_sections` and `flush_sections` (the form's [section presentation](workspaces.md#form-accordion), as in `operations`). |
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
`views`, `application.modules`/`stylesheets` and the sign-in customization
(`application.logo`, `sign_in_stylesheets`, `sign_in`, `sign_in_modules`); `tests/shell/toolkit.php`
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
the served file's key `?v=<base36 mtime>-<base36 size>`, falling back to
`?v=<application.version>` when the version is set and the file cannot be
found below `application.document_root` (a non-empty string; default the
request's `DOCUMENT_ROOT`; see [cache keys](toolkit.md#cache-keys)). Application pages (signed in or explicitly public) link
the stylesheets (after the framework CSS and skins) and list the modules in the
bootstrap `modules` key; the sign-in, e-mail confirmation and password-change
pages of login-only applications load neither. With public access, the guest
background keeps them while the sign-in window additionally loads its own
assets ([module loading](toolkit.md#module-loading)).

`application.logo` is absent (the 61ade [product logo](brand.md), placement
`window`), `false` (no logo, `Logo::none()`) or an object with the optional
`image` and `dark_image` (`.svg`/`.png`/`.webp` browser paths, the same path
rules and keys; without `image` the product logo stays), `label` (accessible
text, default `application.title`, or `blade` for the product logo) and
`placement` (`window`, default, `top` or `both`: where the signed-out pages
show it; [logo](shell.md#sign-in-logo)); another key or type (`true`, a
string, a list), a `dark_image` without `image`, another extension,
placement or a blank `label` fails at load.
`application.sign_in_stylesheets` (`.css`, the same rules as `stylesheets`)
are linked only on the sign-in, e-mail confirmation and password-change pages;
they and the signed-in `stylesheets` may rely only on the
[supported CSS hooks](shell.md#sign-in-css-hooks). `application.sign_in` is an
object with the optional `notice` (catalogue key, plain text, at most 500
characters) and `links` (a list of at most six `{label, href}` objects; `href`
a same-origin path or an `https://` URL; [rules](shell.md#sign-in-content)). Optional `close_href`
uses the same destination validation and enables the first-step native header
X, navigating there on close; omitted preserves existing required/public
sign-in behavior ([header close](shell.md#sign-in-content)).
`application.sign_in_modules` (`.js`/`.mjs`, the rules of `modules`) are
imported only on those three pages with the restricted `SignInApplication`
([sign-in modules](shell.md#sign-in-modules)); like `modules` they are trusted
project code.

`storage.related` declares a validated one-to-one mapping: `table`, `key`,
`fields`, optional `defaults`. Saving shares the main form's transaction,
revision, ACL and audit; see [related storage](field-presentation.md#egy-az-egyhez-kapcsolt-tárolás-a-főűrlapon).
