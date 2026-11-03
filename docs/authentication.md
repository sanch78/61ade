# Login: passwords, e-mail second factor, OAuth and remembered sessions

The complete flow belongs to 61ade: DHTMLX login/code forms, verification,
OAuth through the independent AuthHandler library, sessions, remembered login,
mail layout and audit. Consumers declare account source/e-mail attribute,
delivery method/text, OAuth client settings and admin ACL, and optionally the
pages' look and content: a logo, sign-in stylesheets, a notice and links,
and trusted sign-in modules with a restricted API
([sign-in customization](shell.md#sign-in-branding)); the forms and flows stay the framework's.

<a id="belépési-módok"></a>

## Login modes

| Mode | Enablement | Permitted account |
| --- | --- | --- |
| Password (e-mail/password) | Always | Active, enabled account with correct password. |
| Password + e-mail code | authentication / LoginSecurity | Account with E-mail confirmation enabled; code required after password. |
| AuthHandler OAuth (Google/Facebook/other Hybridauth providers) | oauth / AuthHandlerLogin plus built-in admin | Existing exact e-mail match with OAuth enabled and account allowed; password is irrelevant. The provider verification limitation is below. |
| OAuth only | oauth `exclusive: true` | As OAuth; the password, e-mail code and password-change flows are off ([OAuth-only sign-in](#oauth-only-sign-in)). |

All may be enabled together, as in the [feature demo](demos.md).
Switches are [admin fields](admin.md#fiókkapcsolók).

## Public access

An application may offer its ordinary 61ade UI without sign-in. This is opt-in:
`ApplicationDefinition(publicIdentity: '42')`, or JSON
`application.public_identity: "42"`, names a dedicated account in the application's
identity provider. The default `null` (omit the JSON key) keeps mandatory login.
PHP 8.4+, the ordinary account/ACL schema and current frontend assets are required;
no new schema or third-party dependency is needed. Reference consumer:
[public demo](demos.md#public-access-demo), [FB-0131](feedback.md#fb-0131).

1. Provision a dedicated active account through the application's existing
   account setup, with an unknown random password if password sign-in is unwanted.
2. Grant only the intended **UI** resource/action/object/field rights to that
   account, directly or through roles. The ordinary permission administration is
   used; configuring `publicIdentity` grants nothing. Start with read-only rights
   for a public catalogue, for example `catalog.list` and `catalog.get`.
3. Declare its exact account id as a nonempty string, at most 100 bytes with no
   control characters. The provider must return the same id. Do not use a personal
   or administrator account: all its UI permissions become public.

```php
return new Blade\Shell\ApplicationDefinition(
    // title, identities, menu, runtime, workspace and the other ordinary settings…
    publicIdentity: '42',
);
```

```json
{
    "application": {
        "title": "Public catalogue",
        "runtime": "runtime",
        "public_identity": "42"
    }
}
```

Without a signed-in account the server resolves the public account anew on every
page, action and WebSocket observation. A missing or disabled account closes public
access and shows the normal sign-in. ACL changes apply on the next request. There
is no authenticated session identity or login success event for guest access.
The visitor gets only the guest's offered views and actions; writes work only if
explicitly granted and pass the same validation, business guards, transactions
and audit. `Context::$actor->authenticated` and toolkit
`app.identity.authenticated` are `false` for a public visitor, `true` for a normal
sign-in. They describe identity state; server ACL still decides access.

The public shell loads the regular modules, stylesheets, skins, guides and routing.
Its top-row **Sign in** button is immediately before the rightmost logo on desktop.
On phones it is an accessible icon button immediately after the controls
hamburger, and the public shell hides the logo while offering Sign in.
The button opens `./?signin=1`, preserving the `#view=…` address. The ordinary
password, code, forced-password-change and OAuth flows remain responsible for
sign-in; their pages load the separate sign-in assets. Cancel returns to public
access and cancels pending sign-in state; in OAuth-only mode Cancel is in the
top row above the overlay. A completed sign-in replaces the public identity with
the member's own rights; logout returns to the public UI. Login-only applications
are unchanged. The demo's feature/starter/tenant applications still require login.

Public access uses an HttpOnly/SameSite session cookie for CSRF, live tickets and
session-bound uploads. UI POSTs still require CSRF. An invalid/expired guest token
returns 401 so an old page reloads into a fresh public session; authenticated CSRF
failures retain 403. GET-capable actions retain their fetch-metadata checks. Both
polling and WebSockets use the same ACL; tickets bind to the public account and
session and expire on sign-in/logout or account revocation. A request with an
Authorization header always uses the Bearer API channel: a missing/invalid token
returns 401 and never falls back to guest permissions.

**Limits:** this is one shared permission identity, not one user per visitor.
`own` scope and actor-based rate limits refer to that account for every visitor;
do not use `own` to isolate visitor data. Short-lived upload state retains its
separate session binding. Public visitors have no active tenant or tenant selector,
even if the configured account has memberships; tenant-scoped resources fail
closed. Consumers own account provisioning, business data and explicit grants;
61ade owns shell, sign-in, transport and authorization behavior.

<a id="konfiguráció"></a>

## Configuration

Optional application authentication enables the capability. With default settings,
e-mail confirmation is on for every account, including missing per-user settings.

```json
{
    "authentication": {
        "description": "E-mail verification and optional 90-day remembered login.",
        "email_attribute": "email",
        "default_email_confirmation": true,
        "remember_days": 90,
        "code_lifetime_seconds": 600,
        "mail": {
            "command": ["/usr/bin/php", "/space/share/bin/send-infra-mail.php", "--from={from_address}", "--from-name={from_name}", "--to={recipient}", "--subject={subject}", "--html", "--body-file={body_file}", "--transport=auto"],
            "from_address": "noreply@cyberspace.hu",
            "from_name": "Example admin",
            "texts": {"subject": "{application} – belépési kód", "intro": "Írd be a kódot a belépési ablakban."}
        }
    }
}
```

identity.attribute_columns must include email_attribute; the login e-mail column
is always available. Hungarian strings in examples are product/localization text.

<a id="levélküldés"></a>

### Mail delivery

61ade has one delivery method: a configured local command, started with
proc_open array arguments and no shell (R8). The command builds and submits
the message itself; 61ade does not build MIME or talk SMTP and has no
third-party PHP dependency.

| Key | Meaning |
| --- | --- |
| command (required) | Non-empty argument list. It must pass {body_file}. |
| command_timeout_seconds | 1–300, default 30. |
| from_address, from_name | Sender, substituted as {from_address} and {from_name}. |

An argument may end in exactly one placeholder, as the whole argument
(`{recipient}`) or as a suffix (`--to={recipient}`): {recipient}, {subject},
{from_address}, {from_name}, {body_file}. Values are checked before
substitution: recipient and sender are single valid addresses not starting
with `-`; subject and sender name are UTF-8 without newline or NUL, at most
998 bytes; command arguments contain no newline or NUL. The HTML body is
written to `mail-*.html` in the application runtime directory with mode 0600
and deleted in a `finally` block; the runtime directory must be private and
outside every web root. Stdin is `/dev/null`. Output is drained and never
logged. Nonzero exit or timeout is delivery failure: UI 503 and
email_send:error audit, without automatic retry (an exit code of 0 means local
MTA acceptance, not delivery).

The configuration stays consumer-supplied; on our hosts it uses the Infra mail
helper ([configuration example](configuration.md#mail-command)). Keys
`transport` and `dsn` were removed with SMTP delivery and now fail with
"SMTP mail delivery was removed" ([FB-0065](feedback.md#fb-0065)).
PHP: `new CommandDelivery([...],$from,$fromName,$runtime)`.
Demo delivery saves locally for the [mailbox](demos.md#demó-postafiók-mailbox),
without sending to recipients.

Mail is rendered in HTML and plain-text variants; command delivery passes the
HTML body (the Infra helper sends one part). Reusable `Blade\Mail\Layout` supplies an
e-mail-client-compatible colored application header, card, highlighted code and
footer. Consumers override texts and #rrggbb accent_color, not markup.
Text keys: subject, heading, greeting, intro, code_label, expiry, footer.
Placeholders: {application}, {name}, {minutes}. All business text is HTML-escaped.
Dynamic mail.text_overrides_binding names an explicitly registered
`(Identity): array` closure using those keys.
Precedence: framework defaults → JSON texts → PHP override.
No consumer rewrite of templates/delivery/auth flow is needed.

PHP: `LoginSecurity(Workspace,IdentityProvider,Delivery,LoginMessage,runtime,emailAttribute,...)`,
then ApplicationDefinition.authentication. Custom providers implement Delivery;
61ade still owns authentication.

<a id="belépési-folyamat"></a>

## Login flow

On a fresh GET, the server supplies an empty identifier and the password input
has no initial value. Neither field is populated with demo credentials by the
application. After a failed submission, the identifier comes from that POST;
the password is never returned. Standard `username` / `current-password`
autocomplete hints let the user's browser manage saved credentials.

Chrome's built-in Password Manager can fill both inputs independently of the
application, including on an empty static form with JavaScript disabled.
Remove the saved credential for the affected site in that password manager to
stop that source of filling ([Chrome instructions](https://support.google.com/chrome/answer/95606?hl=en)).
The framework does not erase browser-filled values or try to suppress the
password manager. FB-0094 and FB-0095's application-side suppression was
withdrawn by the owner; source diagnosis and rollback are recorded in
[FB-0097](feedback.md#fb-0097).

After a correct password there is no authenticated session/menu/API/UI data/
WebSocket ticket until a six-digit code succeeds. The code is single-use,
valid ten minutes and bound to that browser's attempt. Database storage is
HMAC with a key in private runtime. Saved e-mail fingerprint/authentication
version are rechecked on transition.

Five bad codes in a ten-minute account window limit further attempts.
Resend waits one minute; at most five sends per ten minutes/account.
New code invalidates that browser's predecessor. Clearing browser sessions
does not reset limits. Password IP limits remain separate. All login POSTs use CSRF.

Missing/invalid e-mail, expiry, disabled account or delivery failure has no
automatic bypass. An authorized admin corrects the address or disables
confirmation. Check delivery readiness and e-mail completeness before enabling.

<a id="felhasználónkénti-kapcsoló"></a>

## Per-user switch

Settings.get(actorId) returns email_confirmation 1 for missing rows under defaults.
Call Settings.update(Context,Workspace,actorId,enabled) only within a registered
ACL-checked executor action. Changes invalidate existing sessions/remembered login.

The built-in [admin checkbox](admin.md#fiókkapcsolók) appears in form/grid when
authentication is configured, replacing the earlier consumer-owned UI.
Self-change returns reauthenticate true. [members.json](../tests/fixtures/authentication/members.json)
retains the supported separate security action API as an example, not a required
UI pattern. form_values supplies initial values for an action's own form;
handler calls the framework service. Temporary-password accounts proceed from
verified login to forced change, and only afterward receive a session/remember
credential; see [admin behavior](admin.md#elvárt-működés).

<a id="bejelentkezve-maradok"></a>

## Remember me

Without the checkbox, only an ordinary session is created. After complete
authentication with it, a separate random 256-bit secret is placed in an
HttpOnly/SameSite cookie, Secure on TLS, host-bound and scoped to application path;
never localStorage. Server stores hash only. Absolute expiry is 90 days from
issue and never slides on restore.

A new browser session restores a 61ade session and rotates the secret. Replay
of an old secret is rejected and revokes that remembered login. Logout clears
the current remembered credential. Password/account/auth-setting changes revoke
all via authentication version. E-mail updates must also call
Workspace.revokeSessions(actorId).

Sessions predating e-mail protection require new authentication when it is
introduced. Legacy non-61ade sessions/direct password writes are not automatically
version-linked; integration must explicitly revoke them.

<a id="telepítés-és-ellenőrzés"></a>

## Installation and verification

PHP 8.4+, PDO; no third-party PHP dependency. Explicit Schema.install adds
blade_auth_settings, blade_login_challenges, blade_remembered_logins.
No request-time DDL. Private runtime/sessions/login and authentication.key must
be nonpublic/unversioned. Multiple instances need shared sessions/key.
Expired challenges/remember records require operational cleanup; cleanup does
not extend validity.

<a id="runtime-permissions"></a>

### Runtime directory and file permissions

Point `ApplicationDefinition::runtime` (JSON `application.runtime`) at a
nonpublic directory, for example a private `runtime/app` below the project's
tmp tree. Startup creates missing runtime, `sessions/` and `login/` directories
recursively with mode `0770`: other users receive no access, and an inherited
default POSIX ACL can grant the runtime identity and project owner access.
Without a default ACL, the process umask and owning group determine access.
Consumers must choose a trusted group/default ACL; 61ade does not provision
host permissions or change existing directory modes/ACLs.

PHP's `files` session handler creates `sessions/sess_*` with mode `0600`.
61ade explicitly sets `login/<IP hash>.json` to `0600` before reading or
writing counters on each authentication attempt, including existing files;
failure to restrict permissions stops the attempt. Directory access lets a
project owner list and delete a runtime-owned file for
[test-account cleanup](development.md#consumer-test-accounts), while its
contents remain private to the runtime identity. ACL write access to these
directories is therefore only for trusted maintainers. IP counters are not
account-specific; leave them to expire.

Existing directories created with `0700` are unchanged. Their owner or host
operator must restore the intended group/ACL mask once; recreation after tmp
cleanup then uses `0770`. This does not migrate runtime storage or change
session expiry. Verification: [FB-0093](feedback.md#fb-0093).

### Verification

- `php8.4 tests/shell/mail.php` (recording fake command, never real mail): placeholder substitution, 0600 HTML body file in runtime and its removal after success and failure, empty stdin, address/subject/name/argument validation, exit errors, removed `transport`/`dsn` keys, layout escaping/text/color.
- `php8.4 tests/shell/authentication.php`: default-on/per-user ACL, wrong/expired/cross-browser/replayed code, persistent limits, remember hash/rotation/expiry/revoke, sensitive-data-free audit.
- `npm run test:browser -- tests/shell/authentication.spec.cjs` (feature demo, `twofactor@example.test`, code from the demo mailbox): code gate, CSRF and wrong-code rejection, 90-day remembered login with rotation and revocation, no credential without remember, the Users admin e-mail-confirmation switch and the confirmation window in all themes. The demo command takes the Infra helper's arguments but stores the message locally. A session restored from the remember cookie starts in the site default language; the account default applies to password, code and OAuth logins ([i18n](i18n.md#account-default-language)).

<a id="oauth-belépés-authhandler"></a>

## Session lifetime

`ApplicationDefinition` accepts `sessionIdleTimeout` (seconds, 60–31536000,
default 1800) and `sessionCookieLifetime` (seconds, 0–31536000, default 0).
JSON uses `session.idle_timeout` and `session.cookie_lifetime` with the same
validation/defaults. Existing applications retain their 30-minute idle limit
and browser-session cookie.

For a rolling 30-day login, set both values to `30 * 86400` (JSON: 2592000).
The server checks the idle timeout against the last HTTP request, then
refreshes that timestamp. A positive cookie lifetime renews its expiry on
each HTTP request and survives browser restarts. Secure-on-HTTPS, HttpOnly,
SameSite=Lax, host-only scope and the declared cookie path remain unchanged.
Live bridge checks use the same application's timeout; live traffic alone
does not renew it. Logout still clears authentication and rotates the session,
and account/credential revocation is rechecked normally. This is session
retention, independent of the optional rotating remembered-login credential.

PHP's request-local `session.gc_maxlifetime` is raised to at least the idle
limit, without reducing a larger host value. The host's session-file cleanup
must also retain files for at least this interval. Pool-admin overrides,
shared-directory purge policies and platform changes belong to the hosting
operator; changing PHP application settings alone cannot promise retention.
Old sessions already expired or deleted cannot be recovered. An existing
unexpired session receives the new cookie policy on its next HTTP request.

## OAuth login (AuthHandler)

The independent _AuthHandler library runs OAuth unchanged
([FB-0046](feedback.md#fb-0046--oauth-az-önálló-authhandler-könyvtárral-szebb-nyelvsor-helyi-playwright-törölve)).
An external-account button appears when at least one provider is listed and not
disabled. It opens AuthHandler's native overlay with Google/Facebook icons,
even without credentials ([FB-0047](feedback.md#fb-0047--valódi-google--és-facebook-gomb-az-authhandler-overlay-én-mockup-nélkül)).
Without keys, 61ade intercepts start and returns setup feedback to login, auditing
oauth_start denial. With keys, AuthHandler owns redirect/callback through
Hybridauth and its identity store, in short-lived session `<sessionName>_oauth`.

On return, 61ade reads the AuthHandler e-mail, destroys that session immediately
and decides independently. Only existing lowercase exact-match accounts with
OAuth enabled and not disabled can enter. Unknown/disabled/disallowed accounts
share one generic message. Password, pending temporary-password state and
e-mail code are not required in this path. Unknown addresses may create rows
in AuthHandler's private oauth-identities.sqlite; these confer no 61ade rights.
Account language and remember selection, transferred through post-login
blade_remember=1, apply.

Known limitation: AuthHandler does not expose email_verified, so 61ade cannot
check it. The prior integration assumption was that configured Google/Facebook
flows provide confirmed addresses; that assumption is not independent verification
by 61ade. Other providers require an explicit trust policy. Any library enhancement
belongs in AuthHandler's own repository.

Prerequisites:

- `lib/_AuthHandler -> ../../_AuthHandler`; public links expose only AuthHandler.js, AuthHandler.css and images under public/lib/_AuthHandler, never PHP source.
- HTTPS because AuthHandler cookies are always Secure; PHP cURL for Hybridauth.
- Fixed site_url and exact registered callback `<site_url>?ah_action=provider&provider=<Name>&callback=1`.
- Built-in user admin with oauth true.

The overlay uses Bootstrap modal markup. 61ade supplies a small compatible shim
only without Bootstrap, plus scoped theme header/border styling; global Bootstrap
CSS never enters the DHTMLX interface. Overlay is above the top DHTMLX layer.
The shim plays Bootstrap's `fade` entrance itself: the overlay and backdrop
fade in (0.15 s) and the dialog slides down into place (0.3 s);
`prefers-reduced-motion: reduce` shows them at once ([FB-0118](feedback.md#fb-0118)).
The same-origin `./?blade_auth=bootstrap` script preserves script-src self CSP.

```json
"oauth": {
    "module": "../lib/_AuthHandler",
    "assets": "lib/_AuthHandler",
    "site_url": "https://admin.example.test/",
    "providers": {
        "Google": {"keys": {"id": {"$env": "GOOGLE_CLIENT_ID", "default": ""}, "secret": {"$env": "GOOGLE_CLIENT_SECRET", "default": ""}}, "scope": "openid email profile"},
        "Facebook": {"keys": {"id": {"$env": "FACEBOOK_APP_ID", "default": ""}, "secret": {"$env": "FACEBOOK_APP_SECRET", "default": ""}}, "scope": "email"}
    },
    "texts": {"registration_with_provider_google": {"hu": "Google-fiók", "en": "Google account"}}
}
```

- Module is the filesystem path relative to configuration; assets is browser-relative. Optional exclusive (default false) selects [OAuth-only sign-in](#oauth-only-sign-in). Optional storage defaults to runtime/oauth-identities.sqlite. Texts follow AuthHandler lang.json key → {language:text}.
- Names follow AuthHandler capitalization (Google/Facebook). Hybridauth adapter can select a custom adapter. Enabled false hides; empty keys keep buttons with feedback.
- PHP: `new AuthHandlerLogin($moduleDir,'lib/_AuthHandler',$providers,$accounts,$identities,$workspace,$storage,$siteUrl,texts: …)`, then ApplicationDefinition(oauth: …).
- AuthHandler receives only provider operations. provider_only_auth disables its password/register/reset flows; 61ade owns those.
- Audit: authentication.oauth_start, oauth_callback, oauth_login success/denial, without token/e-mail values.

<a id="oauth-only-sign-in"></a>

### OAuth-only sign-in

`"exclusive": true` in the oauth section (PHP `AuthHandlerLogin(..., exclusive: true)`)
makes the external account the only way in ([FB-0117](feedback.md#fb-0117)):

- The signed-out page shows no 61ade sign-in window. The shell opens AuthHandler's
  provider overlay directly; it has no close button, and Escape or a backdrop
  click does not dismiss it (the shim honours `data-bs-backdrop="static"` and
  `data-bs-keyboard="false"`; with the page's own Bootstrap it opens again after
  closing). The top row's language and theme selectors stay usable: the
  overlay and its backdrop start below the 40 px row
  (`data-blade-exclusive-sign-in` on `<html>`, [FB-0118](feedback.md#fb-0118)).
- The overlay opens only after the [trademark screen](brand.md#splash) has
  played and left the page (`splashLeft()` in `Splash.ts`), so it never stacks
  above it. On later pages of the same tab, where the screen does not play,
  it opens without delay ([FB-0118](feedback.md#fb-0118)).
- The window content declared for the sign-in window moves into the overlay: the
  logo (placement `window` or `both`) and the header slot above the provider
  buttons, the notice, links and footer slot below them
  ([sign-in customization](shell.md#sign-in-branding)). Sign-in stylesheets apply
  as on the password page.
- A server message (missing provider key, account not allowed) appears first;
  the overlay opens after it is closed.
- The server rejects `login`, `confirm_login`, `resend_login`, `cancel_login`,
  `change_password` and `cancel_password_change` with 403 and a
  `session.login` rejection audit, and sends no pending code or
  password-change state. No remembered-login choice is offered; existing
  remembered sessions keep working until they expire or are revoked.
- At least one provider must be enabled, otherwise configuration fails.

<a id="szolgáltatói-beállítás-google-facebook"></a>

### Provider settings (Google, Facebook)

The demo hostname is demo.61ade.com; the callback base is the demo `.env`
`BLADE_DEMO_URL=https://demo.61ade.com/`. The retired `61ade.sanch.hu`
callbacks must not be kept as a fallback ([FB-0100](feedback.md#fb-0100)).
These are required configuration values, not a claim of external-console
verification. Latest evidence: [FB-0100](feedback.md#fb-0100) (the provider
start sends these exact callbacks; console registration is an owner action)
and [FB-0050](feedback.md#fb-0050) (Google redirect_uri_mismatch, no completed
real-provider login).

The ignored [demo env](../examples/demo-app/.env) is reread each request;
no restart is required. Only developer/web-server principals may read it.

```ini
BLADE_DEMO_GOOGLE_CLIENT_ID=
BLADE_DEMO_GOOGLE_CLIENT_SECRET=
BLADE_DEMO_FACEBOOK_CLIENT_ID=
BLADE_DEMO_FACEBOOK_CLIENT_SECRET=
```

An existing own-site Google client/Facebook app may be reused by adding the
callback/domain. The existing app name then appears during login; rotating its
secret affects all associated sites. 61ade matches e-mail, not app-specific IDs.
This demo uses an existing own-domain app per FB-0047.

Register the exact callback. The historical guide notes that Google changes
may take several minutes to take effect; until then mismatch can occur.

| Setting | Google | Facebook |
| --- | --- | --- |
| Console | [Google Cloud](https://console.cloud.google.com/) → APIs & Services | [Meta developers](https://developers.facebook.com/apps/) → My Apps |
| Preparation | Consent screen / Branding/Audience, External, application/support details; Testing requires test-user addresses | Authenticate/request data with Facebook Login; Development permits assigned app roles only |
| Client | Credentials → OAuth client ID → Web application | Use cases → Facebook Login → Settings |
| Origin/domain | https://demo.61ade.com | App settings → Basic → App domains: demo.61ade.com |
| Callback | `https://demo.61ade.com/?ah_action=provider&provider=Google&callback=1` | `https://demo.61ade.com/?ah_action=provider&provider=Facebook&callback=1`; Client OAuth login/Web OAuth login/Enforce HTTPS enabled |
| Scope | openid email profile; previously documented as nonsensitive | email, public_profile; previously documented as standard |
| Env | Client ID/secret → BLADE_DEMO_GOOGLE_CLIENT_ID/_SECRET | App ID/secret → BLADE_DEMO_FACEBOOK_CLIENT_ID/_SECRET |

The account e-mail must match and OAuth permission must be enabled in Users.
Provider callbacks pass through the browser; server initiates outbound token
exchange, so the managed site's client-IP restriction remains compatible.

Verification: oauth.php checks provider filtering/configuration, the OAuth-only bootstrap and rejected password flows, single-use
handoff, account allow/off/unknown/invalid/disabled decisions, audit/protections
and JSON; configuration.php; managed demo.spec.cjs checks overlay/native icons
and start or missing-key feedback. Starting a provider is not completed login.
Original design references: [OWASP Authentication](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html),
[OWASP Sessions](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html),
[Hybridauth](https://hybridauth.github.io/).
E-mail verification is not phishing-resistant; passkeys/TOTP are not implemented.
