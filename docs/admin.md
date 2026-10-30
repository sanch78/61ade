# Built-in user administration

Status: A1/A2/A3 implemented and verified, 2026-10-21; user acceptance remains
open. Account state uses form/grid checkboxes
([FB-0044](feedback.md#fb-0044--demók-szétválasztása-checkboxos-fiókállapot-oauth-kétfaktor-parancsos-levél-nyelv-api-kulcs)).
See [admin plan](admin-module-plan.md), [R5/R6](product-direction.md) and
[FB-0038](feedback.md#fb-0038--fiókéletciklus-döntések-az-első-adminszelethez).

<a id="cél-és-hatókör"></a>

## Purpose and scope

Framework-owned admin over the application's existing account table. 61ade
provides views/actions/permissions/audit, temporary passwords and forced changes.
Consumers provide identity mapping, insertion defaults and explicit ACL.

Implemented: list/filter, create with full name/e-mail and generated temporary
password, edit name/e-mail, Disabled checkbox in form/grid (no separate
disable/enable buttons); optional OAuth, e-mail confirmation and default language
[fields](#fiókkapcsolók); replacement temporary password; forced first-login change.
Login identifier is e-mail.

A2 supplies roles, memberships, role/individual rules from the generated catalog,
protected-role/last-active-member/self-membership protection and explicit first
admin setup. A3 supplies key issue/scope/revoke. Log view A4 and e-mail password
recovery A5 are not implemented.

<a id="előfeltételek"></a>

## Prerequisites

- PHP 8.4+, PDO, explicit Schema::install including blade_account_state. No HTTP DDL.
- Account table with unique e-mail, name and password columns; lowercase SQL identifiers.
- Custom identity.password_verifier requires admin.password_encoder so generated passwords remain verifiable.
- ACL must allow admin actions; no admin bypass.

<a id="alkalmazás"></a>

## Integration

The JSON admin section enables it; identity.username_column is the e-mail column:

```json
{
    "identity": {"table": "accounts", "id_column": "id", "username_column": "email", "password_column": "password_hash", "name_column": "display_name"},
    "admin": {
        "description": "Built-in user administration.",
        "group": "Adminisztráció",
        "create_defaults": {"active": 1},
        "temporary_password_hours": 72
    }
}
```

| Key | Meaning |
| --- | --- |
| group, users_title | Menu group/view title; localized defaults Administration/Users. |
| create | false for non-insertable tables; create is unregistered, existing accounts remain manageable. |
| create_defaults | String/integer values for other mandatory columns; identity columns cannot be supplied. |
| password_encoder | Named `(string $password): string` closure for the consumer hash format. |
| temporary_password_hours | 1–720, default 72. |
| protected_role | Stable role key, default admin. |

The section enables the current mandatory admin views (users/ACL) and the
top-level API-key view. The API-key view is included in the root menu when the
actor has a usable UI list permission; `own` rules expose only that actor's keys,
while administrators can retain `all` scope for account-wide management.
Switches appear automatically: OAuth when oauth is configured, confirmation
when authentication is configured (default_email_confirmation), language when
i18n offers more than one.

PHP API, as in [application.php](../examples/demo-app/application.php):

```php
$accounts = new Accounts($workspace, 'accounts', 'id', 'email', 'display_name', 'password_hash', createDefaults: ['active' => 1],
    languages: $languages, oauth: true, emailConfirmation: false); // optional switches
$identities = Administration::register($workspace, $accounts, new SqlIdentityProvider($workspace->db, 'accounts', 'id', 'email', 'password_hash', 'display_name'));
// ApplicationDefinition(..., identities: $identities, workspace: $workspace, accounts: $accounts)
```

In an audited consumer migration, allow blade_users list/get/create/update/
temporary_password on ui. Switches use update or shared __edit with optional
field narrowing. API needs api-channel rules plus token scope. Earlier
deactivate/reactivate rules become powerless orphans marked absent from catalog
and may be deleted.

<a id="elvárt-működés"></a>

## Expected behavior

- Create normalizes e-mail to lowercase without spaces and enforces uniqueness. A generated 20-character password appears once, valid 72 hours by default. Audit contains field names, never password.
- Correct temporary password plus enabled e-mail code reaches only Password change, without authenticated session/menu/workspace/API/remember credential. New password is 12–128 characters with confirmation and must differ from temporary password. Within ten minutes, success revokes prior sessions/tokens and creates full session.
- Expired temporary passwords reject login; an admin issues another.
- Disabled checkbox immediately revokes sessions/remembered logins/API tokens. Unchecking permits new login, without restoring old sessions. Self-disable returns 403 field error; disabling the protected role's last active member returns 409. Framework state applies independently alongside consumer allowed.
- E-mail changes revoke all sessions/tokens; self-change requires login again.
- Replacement temporary passwords may be issued to another account only.
- Must-change state is read-only; stale revisions after state changes return 409.

<a id="ellenőrzés"></a>

## Verification

- `php8.4 tests/shell/admin.php`: default deny, create/normalize/unique/invalid e-mail, read-only state, forced-change rules/expiry, form/grid disable/re-enable, optional switches/effects, revocation, e-mail change, API/scope, config errors, secret-free audit.
- `npm run test:browser -- --project=shell tests/shell/admin.spec.cjs`: demo create/once-only password/forced change, invalid/correct password, old-password denial, grid disabling with no action button, disabled login denial.
- Manual: managed URL, demo@example.test / 61ade-demo, Administration → Users; [demos](demos.md) describe / and /admin/. Do not start an ad-hoc server.

<a id="szerepkörök-és-jogosultságok-a2"></a>

## Roles and permissions (A2)

Administration views: Roles, Role memberships, Role permissions, Individual
permissions. Resources: blade_roles, blade_memberships, blade_role_rules,
blade_user_rules; both rule views use blade_rules separated by subject type.

- Catalogue derives choices from registered definitions (`Blade\Admin\Catalogue`). Saving checks resource/action/channel, known field and object ID only for specific-object scope. Generation never grants rights.
- Removed definitions leave marked orphans; unknown actions cannot execute and rules are manually removable.
- role_key is immutable after creation. Roles with members/rules cannot be deleted; protected role never can.
- Protected-role admin-resource rules cannot be edited/deleted in UI. At least one active member, enabled by both framework and consumer, must remain. Membership removal/disabling checks transactionally, with MySQL row locks. Self protected membership cannot be revoked.
- UI cannot create deny rules for framework admin resources due to lockout risk; absence of allow is default deny.

First admin is explicit, idempotent, audited setup, never an HTTP side effect:

```php
Blade\Admin\Permissions::grantAdministration($db, $registry, $actorId);
```

It grants protected role/membership and admin UI rules only, without business
or API rights. Demo setup calls it for account 1.
`permissions.php` checks catalog/no automatic grants, idempotency, immutable
keys/deletion, validation, membership-based allows, individual field denies,
orphans, protected rules/last member and secret-free audit.
admin.spec.cjs creates a role/member/rule and verifies Notes access without admin access.

<a id="kötelező-adminmodul-egy-lépésben"></a>

## Mandatory admin in one step

`Blade\Admin\Administration::register($workspace,$accounts,$identities,usersTitle,group,protectedRole)`
registers Users, Roles, Memberships, Role permissions and Individual
permissions, plus the top-level API-key view, and returns the managed identity
provider for ApplicationDefinition.
JSON admin does the same. This is the [starter demo](demos.md#alapadmin-admin).

<a id="fiókkapcsolók"></a>

## Account switches

| Field | Appears | Storage | Effect |
| --- | --- | --- | --- |
| Disabled (blade_disabled) | Always | blade_account_state.disabled | Form/grid flag, revocation as above. |
| OAuth login (blade_oauth) | Accounts(oauth:true) / JSON oauth | blade_account_state.oauth_allowed | Only enabled non-disabled accounts use providers; switching off revokes sessions. |
| E-mail confirmation (blade_email_confirmation) | Accounts(emailConfirmation: default) / JSON authentication | blade_auth_settings.email_confirmation | Code after password; changing revokes sessions, self-change reauthenticates. |
| Default language (blade_locale) | Multiple Accounts languages / JSON i18n | blade_account_state.locale | Login/mail language; selector can later change it. Empty means site default; [i18n](i18n.md#felhasználói-alapnyelv). |

Grid checkboxes use __edit with revision/ACL/audit; language uses native select.
Explicit Schema::install adds oauth_allowed/locale on existing installations;
HTTP never executes DDL.

<a id="api-kulcsok-a3"></a>

## API keys (A3)

The root menu → API keys, resource blade_api_keys over blade_tokens. Fields:
label, owner account, permitted actions (multiselect from api-channel catalog
with resource.action keys), expiry YYYY-MM-DD through end of UTC day, future
and ≤365 days away, revoked checkbox. An empty owner on issue defaults to the
current actor; an administrator can select another account when their ACL scope
allows it.

- Issue generates 256-bit secret shown once; only SHA-256 hash is stored. Lists/audit contain no secret.
- Use `Authorization: Bearer <key>` at POST ./?blade=1. Both key scope and owner's api ACL must permit the action.
- Revocation via form/grid is immediate and irreversible (409 to restore); issue another key. Owner is immutable; scope/expiry editable. Disable/e-mail change revokes all account keys.
- Grant `blade_api_keys` list/get/create/update on `ui` with `own` scope for self-service. The actor may then issue and manage only keys whose `actor_id` matches the session; the view is absent without a usable UI rule. Use `all` scope for an administrator managing other accounts.
- New scopes use comma-separated storage; older Tokens::issue JSON lists remain valid.

`api-keys.php` checks default deny, initial admin, root-menu registration,
catalog choices, once-only secret/hash/audit, self-scope menu/list/create/update,
ACL+scope, validation, one-way revocation and old format.
Browser coverage: demo.spec.cjs.

<a id="tenants"></a>

## Tenants (with tenancy)

Only when the workspace has [tenancy](tenancy.md): Administration → `Tenantok`
(`blade_tenants`: name, `Aktív` switch; no delete; each tenant expands to its
access list: every account the actor may list, with one `Hozzáférés` switch
(a membership; rows are not selectable and open no form), and the
`Hozzáférések` command opens the same list in a window, see [tenancy](tenancy.md#memberships-and-administration)),
a `Tenantok` multiselect on the Users form and grid, and a `Tenant` field on API keys
(one of the owner's tenants, or global). The field is fixed after issue.
`grantAdministration` grants the Tenants and access-list actions to the protected role. Without
tenancy none of these exist.

<a id="korlátok"></a>

## Limits

- Verified on SQLite only, without MySQL execution.
- E-mail syntax validation does not prove the address exists.
- Consumers with non-e-mail usernames own their data/integration migration.
- Admin delivers temporary passwords; no invitation link.
- Membership/rule choices have Lookup's 2000-item cap.
- Individual subject/object-ID selectors lack search; large account lists need searchable support.
- Open menus stay stale until reload after permission changes; server decisions are fresh on every request.
