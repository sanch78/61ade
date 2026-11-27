# Framework decisions and usage lessons

This register preserves stable feedback IDs and reusable framework decisions.
[Usage](usage.md) and the linked topic guides are canonical for current behavior;
historical decisions may be superseded by later entries. Entry headings identify
the topic, and do not by themselves assert implementation or verification.

<a id="rögzítés-és-feldolgozás"></a>

## Recording and processing

Assign stable FB-NNNN IDs to general framework observations and decisions.
Keep application identities, business facts, requests, screenshots, integration
status and validation evidence in the application that owns them. Record only
the reusable requirement and framework-owned implementation here, using synthetic
examples where needed.

Separate requested, accepted, implemented and verified behavior. Update the
canonical topic guide before closing an entry, and link superseding decisions.
Tool verification does not imply user acceptance.

<a id="bejegyzéssablon"></a>

## Entry template

- Stable ID and framework capability title.
- General requirement and framework decision.
- Framework implementation, status and limits.
- Canonical topic guide and synthetic framework checks.

<a id="fb-0001--a-használati-módszertan-folyamatos-vezetése"></a>

## FB-0001 — Maintain usage guidance continuously

Maintain usage guidance, prerequisites, limits and relevant checks for every public capability.

Guides: [usage](usage.md), [plan](development-plan.md).

<a id="fb-0002--fokozatos-indulás-login-és-navigációs-shell-segítségével"></a>

## FB-0002 — Start incrementally with login/navigation

Start with framework-owned authentication, session handling and navigation. The architecture is refined by FB-0003 and FB-0004.

Guides: [Shell](shell.md).

<a id="fb-0003--minden-általános-képességet-a-61de-ad-61de-az-ade-v2"></a>

## FB-0003 — All general capabilities belong to 61de, ADE v2

Build reusable shared admin capabilities in the framework using DHTMLX before application integration. FB-0004 refines the extension rule.

Guides: [ADR-0002](decisions/0002-framework-first.md), [usage](usage.md).

<a id="fb-0004--elsőbbségi-keretszabály-kezelhető-acl-és-audit"></a>

## FB-0004 — Framework-first rule, manageable ACL and audit

Use framework-first shared infrastructure with manageable object, action, field and channel rights, equal API protection and audit. FB-0036 supersedes application-owned user administration.

Guides: [ADR](decisions/0002-framework-first.md), [Canonical ACL guide](access-and-actions.md).

<a id="fb-0005--natív-dhtmlx-témaváltás"></a>

## FB-0005 — Native DHTMLX theme switching

Use native DHTMLX theme switching and persist the selection in browser preferences.

Guides: [shell](shell.md).

<a id="fb-0006--konfigurálható-munkaterület-dinamikus-és-élő-listák"></a>

## FB-0006 — Configurable workspace, dynamic/live lists

Offer configurable filter, form and list regions, bounded dynamic lists and live updates while keeping selection, filters, scroll and open forms.

Guides: [Workspace](workspaces.md).

<a id="fb-0007--az-üzleti-kód-és-a-keret-határa"></a>

## FB-0007 — Business code and framework boundary

Applications depend on the framework. Application schemas and business rules stay outside it; framework runners take application paths through configuration.

Guides: [Boundary](usage.md#üzleti-konfiguráció-és-kód-határa), [testing](development.md#ellenőrzési-stratégia).

<a id="fb-0008--olvasható-json-definíció-env-és-rendezett-php"></a>

## FB-0008 — Readable JSON, env and organized PHP

Keep declarative definitions in readable modular JSON, host settings in environment configuration and complex behavior in registered PHP handlers.

Guides: [JSON/env](configuration.md), [boundary](usage.md#üzleti-konfiguráció-és-kód-határa).

<a id="fb-0009--a-referencia-teljes-validációja-a-migráció-része"></a>

## FB-0009 — Full reference validation belongs to migration

Inventory reference validation before migration and preserve client, server, UI and API parity. General validators belong to the framework; domain values and exceptions belong to applications.

Guides: [Validation](validation.md), [configuration](configuration.md).

<a id="fb-0010--megjegyzett-belépés-és-e-mailes-megerősítés"></a>

## FB-0010 — Remembered login and e-mail verification

Provide remembered login, optional e-mail verification and framework-rendered authentication mail through account adapters. Pending verification grants no authenticated UI or API access.

Guides: [Authentication](authentication.md), [configuration](configuration.md).

<a id="fb-0011--egyetlen-alsó-információs-sáv"></a>

## FB-0011 — One lower information bar

Use one lower information bar, with the user on the left and application/version on the right.

Guides: [Shell](shell.md#egységes-alsó-információs-sáv), [workspace](workspaces.md).

<a id="fb-0012--skyblue-alapértelmezett-megjelenés"></a>

## FB-0012 — Skyblue default

The historical Skyblue custom theme retained native controls and respected a saved valid selection. Consult the current appearance guide for supported themes.

Guides: [Appearance](shell.md#megjelenési-mód).

<a id="fb-0013--a-panelméretező-középre-igazítása"></a>

## FB-0013 — Center panel resizer grips

Centre native resizer grips within the gap on both axes using scoped framework styling.

Guides: [Guide](workspaces.md#panelméretező-megjelenítése).

<a id="fb-0014--checkboxok-és-kapcsolók-az-objektum-főűrlapján"></a>

## FB-0014 — Flags in the object's main form

Edit account flags in the main form. Related storage shares the transaction, revision, authorization and audit path.

Guides: [Fields](field-presentation.md), [config](configuration.md), [authentication switch](authentication.md#felhasználónkénti-kapcsoló).

<a id="fb-0015--fölösleges-keretezett-layoutburkoló"></a>

## FB-0015 — Remove redundant framed layout wrapper

Attach a declared multi-panel layout directly instead of adding a redundant one-cell framed wrapper.

Guides: [Layout](workspaces.md#layoutszintek-és-keretek).

<a id="fb-0016--fejlesztői-tesztfuttatás-ne-merítse-ki-a-közös-hostot"></a>

## FB-0016 — Protect the shared host during tests

Use the guarded browser runner and serial execution to protect the shared development host.

Guides: [Guard and limits](development.md#böngészőteszt-korlátozott-memóriájú-fejlesztői-hoston).

<a id="fb-0017--deklarált-mezőnkénti-gridszerkesztés"></a>

## FB-0017 — Declared per-field grid editing

Declare editability per field and use the shared validation, revision, ACL and audit path for grid edits.

Guides: [Usage](field-presentation.md#mezőnkénti-gridszerkesztés).

<a id="fb-0018--szerkeszthető-fejlécjelzés-rendezés-és-smart-rendering"></a>

## FB-0018 — Editable headers, sorting and smart rendering

Keep editability indicators distinct from sort indicators; apply sorting to the full server-side result and render bounded windows.

Guides: [Sorting](workspaces.md#rendezés-és-smart-rendering), [fields](field-presentation.md).

<a id="fb-0019--listák-rekordadatok-és-vezérlők-megjelenése"></a>

## FB-0019 — Lists, record details and controls

Use shared table, card and record-detail presentations with consistent selection and bulk-action controls.

Guides: [Cards/details](workspaces.md#kártyák-rekordadatok-sorszám-és-jelölés), [bulk](workspaces.md#tömeges-műveletek-és-ikonok), [UI qualification](list-presentation-validation.md).

<a id="fb-0020--nézet-dropdown-és-szerkeszthető-fejléc-rendezésjelzése"></a>

## FB-0020 — Final view dropdown and nonoverlapping indicators

Use one view selector and keep header editability and sort indicators from overlapping.

Guides: [Usage](workspaces.md#nézetválasztás-és-fejlécjelzések), [Evidence](list-presentation-validation.md).

<a id="fb-0022--az-eredeti-listajavítások-teljes-ellenőrzése"></a>

## FB-0022 — Complete original list verification

Guides: [Evidence](list-presentation-validation.md), [Workspace](workspaces.md), [runner](development.md#meglévő-közös-playwright-bekötése).

<a id="fb-0021--url-követés-és-felületállapot-megőrzése"></a>

## FB-0021 — Feature URLs and persistent UI state

Keep addressable views and relevant UI preferences while leaving transient selections and open windows out of persistent state.

Guides: [Usage/limits](shell.md#url-és-helyi-felületbeállítások).

<a id="fb-0023--listafejléc-darabszám-menüikonok-és-kompakt-login"></a>

## FB-0023 — List headings/counts, menu icons and compact login

Give lists meaningful headings and counts, menu entries suitable icons and authentication windows content-fitted geometry.

Guides: [Workspace](workspaces.md#listafejléc-és-rekordszám), [shell](shell.md#kompakt-hitelesítési-ablakok-és-menüikonok), [Qualification](list-presentation-validation.md#fb-0023-fejlécek-darabszám-és-hitelesítési-ablakok).

<a id="fb-0024--kártyaszerkesztés-mentés-utáni-nézetváltás-méret-és-rendezés"></a>

## FB-0024 — Card editing, save switching, sizing and sorting

Share validation and saving between grid and card editing; preserve position when switching views and sort on the server.

Guides: [Usage](workspaces.md#kártyaszerkesztés-rendezés-és-kompakt-ablakok).

<a id="fb-0025--elkülönülő-főmenügombok"></a>

## FB-0025 — Distinct main-menu buttons

Make main-menu entries visually distinct while retaining native framework controls.

Guides: [Shell](shell.md#elkülönülő-főmenügombok), [usage](usage.md).

<a id="fb-0026--táblázatárnyék-az-oszlopfejléc-alatt"></a>

## FB-0026 — Grid shadow below column headings

Place the grid shadow below column headings.

Guides: [Counts/presentation](workspaces.md#listafejléc-és-rekordszám), [usage](usage.md).

<a id="fb-0027--toolbarfejléc-elválasztás-és-kártyák-felső-térköze"></a>

## FB-0027 — Toolbar/header divider and card top spacing

Separate toolbar and column headings with a theme divider and give cards their shared top spacing.

Guides: [Workspace](workspaces.md), [usage](usage.md).

<a id="fb-0029--jobb-széli-kártyaceruza-és-egységes-kezelhető-checkbox"></a>

## FB-0029 — Right-edge card pencil and shared editable checkbox

Place card edit indicators at the right edge and use one shared editable-checkbox presentation.

Guides: [Fields](field-presentation.md#egységes-checkbox-és-kártya-szerkesztésjelzés), [usage](usage.md).

<a id="fb-0028--kompakt-popup-és-teljes-mobil-navigációműveletsor"></a>

## FB-0028 — Compact popup, complete mobile navigation/commands

Keep compact popup headers and the full navigation and command set usable on narrow screens.

Guides: [Shell](shell.md#kompakt-ablakfejléc-és-teljes-mobilmenü), [commands](workspaces.md#reszponzív-műveletsor-és-azonos-kártyaszélesség), [usage](usage.md).

<a id="fb-0030--skyblue-váltott-táblázatsorok"></a>

## FB-0030 — Alternating Skyblue rows

Alternate row backgrounds by displayed row index, including virtual rendering.

Guides: [Usage](usage.md).

<a id="fb-0031--elkülönülő-popupfejléc-és-alsó-elválasztóvonal"></a>

## FB-0031 — Popup header background and divider

Give compact popup headers their theme background and one lower divider.

Guides: [Shell](shell.md#kompakt-ablakfejléc-és-teljes-mobilmenü), [usage](usage.md).

<a id="fb-0032--finomabb-szürke-skyblue-sorsávok"></a>

## FB-0032 — Subtler gray Skyblue stripes

Use subdued alternating row colours while retaining native selection and hover states.

Guides: [Usage](usage.md).

<a id="fb-0033--egyértelmű-témanevek-és-többnyelvűségi-helyzetkép"></a>

## FB-0033 — Clear theme names and localization inventory

Use clear localized theme labels. FB-0034 supplies the general localization capability.

Guides: [Usage](usage.md#többnyelvűség), [themes](shell.md).

<a id="fb-0034--alapvető-többnyelvűség-opcionális-site-választó"></a>

## FB-0034 — Built-in localization and optional site selector

Make locale and translation services universal, with an optional native language selector and separate application catalogues.

Guides: [I18n](i18n.md), [usage](usage.md#többnyelvűség), [shell](shell.md#opcionális-nyelvválasztó).

<a id="fb-0035--valódi-png-zászlók-emoji-helyett"></a>

## FB-0035 — Actual PNG flags instead of emoji

Package actual PNG flag assets instead of relying on emoji rendering.

Guides: [I18n](i18n.md), [provenance](flag-assets.md), [usage](usage.md).

<a id="fb-0036--kötelező-adminmodul-és-igényvezérelt-keretfejlesztés"></a>

## FB-0036 — Mandatory admin and demand-driven framework work

Require framework-owned user, ACL, API-key and log administration. Add capabilities in response to needs and prove them with synthetic examples.

Guides: [Product direction](product-direction.md), [usage](usage.md#elfogadott-termékirány--2026-10-21), [ACL](access-and-actions.md), [concept](concept.md), [ADR](decisions/0002-framework-first.md).

<a id="fb-0037--ext-js-referencia-visszavonása-dhtmlx-alap-igényvezérelt-képességkör"></a>

## FB-0037 — Withdraw Ext JS reference; DHTMLX and actual needs

DHTMLX is the foundation; there is no Ext JS benchmark or exhaustive component-coverage prerequisite.

Guides: [Product](product-direction.md), [ADR](decisions/0003-product-direction.md), [concept](concept.md#0-elfogadott-termékirány--2026-10-21), [plan](development-plan.md#igényvezérelt-fejlesztési-módszer), [matrix](component-matrix.md).

<a id="fb-0038--fiókéletciklus-döntések-az-első-adminszelethez"></a>

## FB-0038 — First admin-slice lifecycle decisions

Keep account lifecycle defaults and mandatory administration in the framework contract.

Guides: [Product](product-direction.md#eldöntve-az-első-adminszelethez--2026-10-21), [plan/defaults](admin-module-plan.md#4-alapértékek-jóváhagyva-2026-10-21).

<a id="fb-0039--beépített-felhasználóadmin-a1-részszelet"></a>

## FB-0039 — Built-in user administration, A1

Provide framework-owned user administration with managed account state and the common authorization and audit paths.

Guides: [Admin](admin.md), [usage](usage.md#beépített-felhasználóadmin), [config](configuration.md), [auth](authentication.md), [shell](shell.md).

<a id="fb-0040--beépített-szerepkör--és-jogosultságadmin-a2-részszelet"></a>

## FB-0040 — Built-in roles and permissions, A2

Provide framework-owned role, membership and permission administration without granting implicit business superuser rights.

Guides: [Admin](admin.md#szerepkörök-és-jogosultságok-a2), [usage](usage.md#beépített-felhasználóadmin), [config](configuration.md), [ACL](access-and-actions.md), [product](product-direction.md).

<a id="fb-0041--saját-létrehozás-után-az-új-sor-nem-kerül-látótérbe-görgethető-listán"></a>

## FB-0041 — Newly created row remains outside scrolled viewport

<a id="fb-0042--egységes-playwright-konfiguráció-és-gyökérszintű-tmp"></a>

## FB-0042 — Unified Playwright configuration and root tmp

Use one browser-test configuration and the ignored root tmp directory for generated test output.

Guides: [Usage](usage.md#fejlesztői-memória-védelme), [development](development.md#egységes-playwright-konfiguráció), [layout](repository-layout.md).

<a id="fb-0043--gitpush-kötelezettség-megszüntetése-és-helperútvonal-javítása"></a>

## FB-0043 — Remove mandatory gitpush and correct helper path

The gitpush helper is optional; the project commit and push policy remains applicable.

Guides: [Usage](usage.md#fejlesztési-batch-lezárása), [workflow](development.md#commit-és-push).

<a id="fb-0044--demók-szétválasztása-checkboxos-fiókállapot-oauth-kétfaktor-parancsos-levél-nyelv-api-kulcs"></a>

## FB-0044 — Two demos, account switches, OAuth, mail, language and keys

Keep the starter administration demo separate from the synthetic feature demo; starter changes follow the mandatory application baseline.

Guides: [Demos](demos.md), [admin](admin.md#fiókkapcsolók), [keys](admin.md#api-kulcsok-a3), [OAuth](authentication.md#oauth-belépés-authhandler), [mail](authentication.md#levélküldés).

<a id="fb-0045--a-demó-a-natív-url-en-rendszerszintű-playwright-automatikusan"></a>

## FB-0045 — Managed demo URL and automatic system Playwright

Run browser checks on the managed demo URL using the system-provided browser tooling.

Guides: [Demos](demos.md#webszerveres-futtatás-apache--php-fpm), [development](development.md#rendszerszintű-playwright-és-natív-url).

<a id="fb-0046--oauth-az-önálló-authhandler-könyvtárral-szebb-nyelvsor-helyi-playwright-törölve"></a>

## FB-0046 — Independent AuthHandler, aligned language row, remove local Playwright

Keep AuthHandler a separate read-only dependency. Adapt it through the framework and use the system browser tooling.

Guides: [OAuth](authentication.md#oauth-belépés-authhandler), [demos](demos.md), [i18n](i18n.md), [development](development.md#rendszerszintű-playwright-és-natív-url).

<a id="fb-0047--valódi-google--és-facebook-gomb-az-authhandler-overlay-én-mockup-nélkül"></a>

## FB-0047 — Native Google/Facebook buttons without mockup

Use the actual provider controls from AuthHandler rather than simulated OAuth buttons.

Guides: [Provider setup](authentication.md#szolgáltatói-beállítás-google-facebook), [OAuth](authentication.md#oauth-belépés-authhandler), [demos](demos.md#oauth-kulcsok), [usage](usage.md), [product](product-direction.md).

<a id="fb-0048--egységes-figyelmeztető-és-megerősítő-párbeszédablakok"></a>

## FB-0048 — Unified warning and confirmation dialogs

Use shared warning and confirmation dialogs with consistent focus and keyboard behavior.

Guides: [Dialogs](dialogs.md), [usage](usage.md#figyelmeztető-és-megerősítő-párbeszédablakok), [demos](demos.md), [actions](workspaces.md#megerősítés-művelet-előtt), [reason](dialogs.md#döntés-miért-nem-a-natív-dhtmlx-alertconfirm).

<a id="fb-0049"></a>

## FB-0049 — Project renamed to 61de; one development environment

Use one managed development environment. The product name was corrected to 61ade in FB-0070.

Guides: [usage](usage.md#project-name-and-development-environment), [development workflow](development.md#development-environment), [repository layout](repository-layout.md), [demos](demos.md), [OAuth configuration](authentication.md#szolgáltatói-beállítás-google-facebook).

<a id="fb-0050"></a>

## FB-0050 — Complete name refactor and blade identifier fallback

Use Blade identifiers and BLADE_* environment keys. Product and package spelling follows FB-0070.

Guides: [renaming](renaming.md), [usage](usage.md), [development](development.md).

<a id="fb-0051"></a>

## FB-0051 — Development/testing only; no deployment or project backups

61ade has development and testing only, with no project production, deployment or backup workflow.

- **Implementation:** documentation only. Existing public capabilities, product
  languages and code remain unchanged.

Guides: [development](development.md#development-environment), [usage](usage.md#project-name-and-development-environment), [demos](demos.md).

<a id="fb-0052"></a>

## FB-0052 — Browser tests only on the feature demo; localhost fixtures removed

- **Accepted instruction:** the seven browser projects that started localhost
  fixture servers (`auth`, `related`, `grid-edit`, `sorting`, `preferences`,
  `presentation`, `i18n`) are migrated onto the managed feature demo. No legacy
  route remains: fixture routers/servers, the extra Playwright projects and the
  localhost demo launcher are removed. Supersedes the "preserved but not
  launchable" coverage limit of [FB-0050](#fb-0050) and [FB-0051](#fb-0051).

Guides: [workspaces](workspaces.md), [development](development.md#existing-full-smoke-and-coverage-limits), [Playwright configuration](development.md#unified-playwright-configuration), [demos](demos.md), [dialogs](dialogs.md#keyboard-and-focus).

<a id="fb-0053--másodlagos-grid-oszlopok-kapcsolása"></a>

## FB-0053 — Toggleable secondary grid columns

Declare secondary grid columns and let users toggle them through the shared toolbar.

<a id="fb-0054--önálló-api-kulcs-menü-és-saját-kulcsok"></a>

## FB-0054 — Standalone API-key menu and self-scoped keys

Expose API keys through a standalone menu and enforce owner-scoped listing and target checks.

<a id="fb-0055--egyedi-muveleti-parancsok-es-ikonok"></a>

## FB-0055 — One command per action and complete action icons

Represent each action once in the command surface and give every command an appropriate icon.

<a id="fb-0056--minden-muvelethez-ervenyes-ikon"></a>

## FB-0056 — Every action uses a bundled icon

<a id="fb-0056--formok-megse-muvelete"></a>

## FB-0056 — Explicit Cancel on editable forms

<a id="fb-0056"></a>

## FB-0056 — No redundant intermediate action dialogs

Guides: [development](development.md#mandatory-framework-development-rules), [dialogs](dialogs.md#szerver-által-deklarált-megerősítés), [workspaces](workspaces.md#tömeges-műveletek-és-ikonok), [usage](usage.md#figyelmeztető-és-megerősítő-párbeszédablakok).

<a id="fb-0057--integralt-grid-fejlec-szurok"></a>

## FB-0057 — Integrated grid header filters

Put supported filters directly into grid headers and share their values with the other filter surfaces.

<a id="fb-0058"></a>

## FB-0058 — Virtual two-panel file manager (first vertical slice)

- **Accepted design:** framework `Blade\Files` (`FileStorage` over the
  `blade_files` table with BLOB content, `FileManagerDefinition`,
  `FileActions`), a `files` view kind, `FileManager.ts` and `TreeAdapter.ts`.
  All operations are registered actions through the common executor; the ACL
  object is the mount key. Supporting framework extensions: opt-in multipart
  transport (`Action::$upload`, `Context::$uploads`), `Failure::$details`,
  ID-only audit `detail`, resolver `acl_id`, `requestChoice` in the shared
  dialog, `ResponsiveGrid` `idColumn: false`.

Guides: [access and actions](access-and-actions.md#multipart-audit-detail-sqlite), [files](files.md), [usage](usage.md#virtuális-fájlkezelő), [demos](demos.md#teljes-feature-demó-), [dialogs](dialogs.md).

<a id="fb-0059"></a>

## FB-0059 — Single-record commands are disabled while several rows are marked

- **Scope:** general framework rule in the workspace toolbar.

- **Implementation:** `Workspace.capabilities()` disables non-bulk object
  actions and `Adatok` while two or more rows are marked; bulk-capable actions
  and create stay available. The click handler applies the same guard.
  [Workspaces](workspaces.md#tömeges-műveletek-és-ikonok).

Guides: [Workspaces](workspaces.md#tömeges-műveletek-és-ikonok).

<a id="fb-0060"></a>

## FB-0060 — Visual diagram editor: network topology builder demo

Guides: [diagrams](diagrams.md#building-blocks), [diagrams](diagrams.md), [usage](usage.md#vizuális-diagramszerkesztő), [demos](demos.md#teljes-feature-demó-), [component matrix](component-matrix.md).

<a id="fb-0061"></a>

## FB-0061 — Event calendar: digital signage (DMS) scheduler demo

Guides: [matrix](component-matrix.md), [calendar](calendar.md), [usage](usage.md#eseménynaptár), [demos](demos.md#teljes-feature-demó-).

<a id="fb-0062"></a>

## FB-0062 — Sibling items beside the collapsed desktop main menu

- **Accepted design:** `AdminShell` renders, after the compact `Menü` button
  and a native separator, the items of the open feature's branch as native
  top-level Menu items with prefixed IDs; the open one uses the native `active`
  state. Only at ≥ 768 px, only for nested items, and only when they fit by the
  existing width estimate; route changes re-render the menu.

- **Decision taken in implementation:** top-level features show no siblings,
  since their siblings are the whole collapsed menu.

Guides: [shell](shell.md#kompakt-ablakfejléc-és-teljes-mobilmenü), [usage](usage.md).

<a id="fb-0063"></a>

## FB-0063 — Uploader and file/media list decisions

Guides: [uploader and file/media list](files-media-plan.md), [files](files.md), [uploader](uploader.md), [workspaces](workspaces.md#media-tiles).

<a id="fb-0064"></a>

## FB-0064 — Versioned Composer VCS package

Superseded by [FB-0066](#fb-0066).

Guides: [package releases](development.md#package-releases-and-consumption).

<a id="fb-0065"></a>

## FB-0065 — Command-only mail delivery without symfony/mailer

- **Decisions taken in implementation:** placeholders `{recipient}`,
  `{subject}`, `{from_address}`, `{from_name}`, `{body_file}`, each ending one
  argument (whole or suffix); `{body_file}` is mandatory. The command gets the
  HTML body only, because the helper sends a single part; `LoginMessage` and
  `Layout` still render both variants. Stdin piping was dropped (stdin is
  `/dev/null`), so `sendmail -t -i` configurations must move to the helper.
  `transport`/`dsn` keys fail with "SMTP mail delivery was removed". The demo
  command takes the helper's arguments but stores JSON for the demo mailbox
  instead of sending.

Guides: [mail delivery](authentication.md#levélküldés), [mail command](configuration.md#mail-command).

<a id="fb-0066"></a>

## FB-0066 — Shared-library consumption without versions

Consume the Git checkout as a shared library, without package versions, release tooling or Composer installation. Track matching frontend build output.

- **Decisions taken in implementation:** `main` tracks
  `packages/frontend/dist`; `tools/build.mjs --check` builds in memory and fails
  on a stale `dist`, and `npm run test:browser` runs it first; a normal build
  reports a changed `dist`. Removed `tools/release`, the root `composer.json`, the
  export-ignore rules and the package `version` fields; `.gitattributes` now
  only exempts `dist` from whitespace checks;
  `packages/php/composer.json` stays for the demo's path repository, which
  now requires `@dev`.

Guides: [shared-library consumption](development.md#shared-library-consumption).

<a id="fb-0067"></a>

## FB-0067 — Consumer adoption procedure and corrections

Document integration, autoloading, dedicated asset subdirectories and guarded browser checks as one reusable adoption procedure.

Guides: [integration layout](development.md#consumer-layout), [update checks](development.md#consumer-update-smoke-check), [browser tests](development.md#consumer-browser-tests).

<a id="fb-0068"></a>

## FB-0068 — WebSocket live server for releases and the demo

- **Decisions taken in implementation:** `tools/live-server.mjs` stays the only
  source; `tools/build.mjs` bundles it with ws 8.22.0 inlined into the tracked
  `packages/php/bin/live-server.mjs`, and `--check` covers it like `dist`. The
  bundle uses Node built-ins only: ws's optional native add-ons are compiled
  out, and it starts `live-bridge.php` beside itself, so the source is not run
  directly. The demo selects WebSocket only when its ignored `.env` sets
  `BLADE_DEMO_LIVE_ENDPOINT`; the starter admin stays on polling. The demo
  bridge uses the demo's existing `vendor/autoload.php` and `application.php`
  with `BLADE_DEMO_INSTANCE=web`.

Guides: [live-data service](development.md#live-data-service-websocket), [demo WebSocket live data](demos.md#websocket-live-data), [live-data configuration](workspaces.md#élő-adat-konfigurálása-és-futtatása).

<a id="fb-0069"></a>

## FB-0069 — Optional multi-tenancy (stage 1)

- **Decisions taken in implementation:** the switch is on the Workspace
  (`tenancy: true`, JSON `"tenancy": {}`), installed explicitly with
  `Tenancy::install()`. Scope is declared by `SqlResource`/`Lookup`
  `tenantColumn` and marked in the registry. The executor, `__form` and the view
  list refuse a marked resource without a tenant, and the adapter checks again.
  A switch is a server POST that audits, rotates the CSRF token and reloads the
  shell, a simpler and stronger route than clearing every component in place:
  old tabs and live tickets of the previous tenant stop working. Uniqueness is
  checked per tenant, so it reveals nothing about other tenants. Memberships
  are edited through the new general `RelatedSet` (a many-to-many multiselect
  storage) on Users and Tenants. The tenant demo is a separate `/tenants/` app,
  because enabling tenancy in the full feature demo would change its behavior
  and every existing spec.

Guides: [tenancy](tenancy.md), [usage](usage.md#multi-tenancy), [configuration](configuration.md), [admin](admin.md#tenants), [security model](security-model.md).

<a id="fb-0070"></a>

## FB-0070 — Product name corrected from 61de to 61ade

The product and packages are named 61ade; PHP identifiers use Blade, BLADE_* and blade.

Guides: [renaming](renaming.md#61de--61ade-correction-2026-10-29), [renaming](renaming.md).

<a id="fb-0071"></a>

## FB-0071 — Sub-views: expandable rows and cards with a compact preview

- **Implementation:**
  - `Registry::subview()` and JSON `view.subview`.
  - A framework toggle column and spanned sub-row in the Standard Grid; a card
    toggle.
  - A compact `Workspace` scope with a measured height.
  - Nested widgets in a fixed, clipped layer outside the parent widget's DOM.
  - The toolbar command, and the full scoped view in a `blade-feature-window`.
  - A hierarchy mode (same resource, top-level filter, delegated toolbar).
  - Tenants: members sub-view (`Tenancy::MEMBERS`) and `blade_tenant_members.active`.
  - `RelatedSet` saves by difference.
  - Below 768 px the tenant choice moved into the main menu, because the
    selector covered the menu button (a stage-1 defect found here).

Guides: [development](development.md#existing-full-smoke-and-coverage-limits), [sub-views](workspaces.md#sub-views), [tenancy](tenancy.md#memberships-and-administration), [demos](demos.md#tenant-demo-tenants).

<a id="fb-0072"></a>

## FB-0072 — Optional application skins

- **Accepted instructions:** extends [FB-0005](#fb-0005--natív-dhtmlx-témaváltás)
  and [FB-0012](#fb-0012--skyblue-alapértelmezett-megjelenés). A skin stays a
  native DHTMLX custom theme supplied by the application; controls stay native
  and 61ade ships no application CSS. Opt-in per identity, resolved on the
  server; the sign-in page keeps the factory look. With skins the factory
  themes are not offered: one skin hides the selector, several fill it. The
  skin choice persists separately so the factory choice returns when a skin is
  lost. Presentation only, no access semantics.

- **Implementation:** `Blade\Shell\Skin` (with `base`), `ApplicationDefinition::$skins`
  (`Closure(Identity): list<Skin>`), JSON `application.skins` (identity binding
  name), bootstrap `skins`, stylesheet links in `templates/shell.php`, the
  `AdminShell` selector with `blade-skin` storage. Feature demo:
  `skin@example.test` / `skins@example.test` with synthetic `demo-slate` (light
  base) and `demo-ink` (dark base) stylesheets under `public/skins/`.

Guides: [application skins](shell.md#application-skins), [configuration](configuration.md#entrypoint-and-application-sections), [demos](demos.md).

<a id="fb-0073"></a>

## FB-0073 — Demo WebSocket refresh after the tenancy change

- **Fix:** the spec's external write targets the newest note, which is the top
  row. The framework live path is unchanged.

<a id="fb-0074"></a>

## FB-0074 — One live server for several applications

- **Accepted instructions:** framework-first (option 1 of two offered); no new
  unit, port or proxy route per application.

- **Implementation:** `LiveConfig::$applications` (name → absolute application
  file, never in the browser bootstrap) and `route()`; JSON `live.applications`
  resolved from the configuration directory. `live-server.mjs` passes the
  upgrade path to the bridge; the bridge serves a path ending in `/<name>` with
  that file and takes the session name and save path from the selected
  application per request, so a ticket is valid only on its own path. The
  Infra proxy already forwards the `/live` prefix, so the existing unit serves
  `/live/admin` and `/live/tenants` after a restart. Demo: the feature demo
  lists `admin-application.php` and `tenant-application.php`; both use
  `BLADE_DEMO_LIVE_ENDPOINT` + `/admin` or `/tenants`.

<a id="fb-0075"></a>

## FB-0075 — One live channel per tab, event-driven updates

Multiplex live subscriptions over one channel per browser tab and drive updates from framework change events.

Guides: [live channel plan](live-channel-plan.md), [demos](demos.md#websocket-live-data), [development](development.md#live-data-service-websocket), [workspaces](workspaces.md#élő-adat-konfigurálása-és-futtatása), [workspaces](workspaces.md#live-channel).

<a id="fb-0076"></a>

## FB-0076 — Static image column for lists

- **Implemented:** `column.presentation: "image"` + `imageBase` (+ `altOf`),
  server value rules, table cell, card, tile and detail rendering, tiles by
  default, placeholder on load error. See
  [workspaces](workspaces.md#media-tiles) and
  [field presentation](field-presentation.md). No new endpoint or right.

Guides: [workspaces](workspaces.md#media-tiles), [field presentation](field-presentation.md).

<a id="fb-0077"></a>

## FB-0077 — Declared record activation (double-click and Enter)

- **Implemented:** `Registry::view(…, activate:)` and JSON `view.activate`
  (registration rejects `create`, `get`, upload and collection actions and
  singletons); the Workspace runs it from the table, cards and tiles, opens the
  sub-view window also at a count of 0, falls back to the details when the
  action, record `_actions` or sub-view is not offered; cards and tiles carry an
  `aria-description` of the target; a child window opened by activation takes
  the focus so Escape closes it. Documented in
  [workspaces](workspaces.md#activation), [configuration](configuration.md),
  [usage](usage.md) and the [demos](demos.md) (`Polcok`). No new endpoint,
  right or audit event.

Guides: [R8](product-direction.md), [workspaces](workspaces.md#activation), [configuration](configuration.md), [usage](usage.md), [demos](demos.md).

<a id="fb-0078"></a>

## FB-0078 — Activation through SqlResource and to the child page

Guides: [workspaces](workspaces.md#activation), [configuration](configuration.md), [usage](usage.md), [demos](demos.md).

<a id="fb-0079"></a>

## FB-0079 — Menu pages keep their filter values

- **Decision:** supersedes the earlier exclusion of filter values in
  [shell](shell.md#url-és-helyi-felületbeállítások). A menu page stores its
  header and panel filter values with its other browser-local preferences
  (per path, user and resource). A page drill-down replaces the saved filters
  with its own. Not stored: the search text, sub-view previews and windows,
  singletons.

- **Implemented:** `UiPreferences.filters()`/`setFilters()`; restoration
  applies the server's filter value rules to the actor's current filter
  definitions and drops a value they no longer accept, so a stale option
  never makes the list fail. `Alaphelyzet` clears storage too.

Guides: [shell](shell.md#url-és-helyi-felületbeállítások).

<a id="fb-0080"></a>

## FB-0080 — Framework-first covers shared infrastructure; projects own their domain

Framework-first governs shared admin infrastructure. Applications own their domain data, storage, logic and UI, including browser modules.

Guides: [ADR-0004](decisions/0004-project-domain-freedom.md), [ADR-0002](decisions/0002-framework-first.md), [development](development.md#mandatory-framework-development-rules), [usage](usage.md#kötelező-fejlesztési-irány), [concept](concept.md).

<a id="fb-0081"></a>

## FB-0081 — 61ade becomes a toolkit

Expose the public application API, services, components and registries as a toolkit. Built-in views and synthetic demos use the same supported interfaces.

Guides: [ADR-0005](decisions/0005-toolkit.md), [toolkit plan](toolkit-plan.md), [toolkit reference](toolkit.md), [toolkit changes](toolkit.md#changes), [event catalog](toolkit.md#event-catalog).

<a id="fb-0082"></a>

## FB-0082 — Green regression baseline before the toolkit kernel

<a id="fb-0083"></a>

## FB-0083 — Stable full browser suite under the guard

- **Implemented:**
  - `tests/shell/fixture.cjs` `lazyBundle()`: a spec fixture bundle is built on
    first use and shared by the specs of a worker. `layout-resizer`,
    `list-presentation`, `subview`, `toolkit-list` and `toolkit-registries`
    use it; the last two share one bundle.
  - `tests/browser/config.cjs` sets `ESBUILD_WORKER_THREADS=0` and, unless
    set, `GOMAXPROCS=2`: every `buildSync` runs esbuild as a short-lived child.
  - The rule is in [development](development.md#browser-tests-on-the-shared-development-host).

Guides: [development](development.md#browser-tests-on-the-shared-development-host).

<a id="fb-0084"></a>

## FB-0084 — Shared skill for adopting and building on 61ade

Keep application authoring guidance separate from the operational integration checklist and link both to canonical framework contracts.

Guides: [toolkit](toolkit.md), [configuration](configuration.md), [usage](usage.md), [usage](usage.md#toolkit-and-project-modules).

<a id="fb-0085"></a>

## FB-0085 — Browser cache keys from the served file

- **Implemented:** `?v=<base36 mtime>-<base36 size>` for `admin.js`,
  `admin.css`, skins, project `modules` (also in the bootstrap) and
  `stylesheets`, and the sign-in page's AuthHandler assets (URLs only). Paths
  resolve with `realpath` inside the document root (optional
  `ApplicationDefinition` `documentRoot`, JSON `application.document_root`,
  default `DOCUMENT_ROOT`); own `?…` keys are kept; an unresolvable file
  falls back to `versioned()` (the application `version`). 61ade's assets
  outside the root use the package build's file. Limit: a rewrite of the same
  size within one second keeps the key. Contract: [toolkit changes](toolkit.md#changes) (M9).

Guides: [toolkit changes](toolkit.md#changes), [breaking changes](development.md#breaking-changes).

<a id="fb-0086"></a>

## FB-0086 — An ended session leads to the sign-in page

- **Implemented:** `configureServer(csrf, sessionEnded)` runs the shell's
  handler on every 401 of `post` (so `server.call`/`request` and the
  uploader); `LiveChannel` hook `ended` after `block()`. The shell reloads
  (sign-in page, address kept) or, when `editing()` is true, shows the warning
  modal (Bejelentkezés / Mégse, focus on Mégse; Mégse re-arms). A second
  automatic reload within 60 s asks instead (`sessionStorage`
  `blade-signed-out`). Guide: [ended session](shell.md#ended-session).

Guides: [ended session](shell.md#ended-session).

<a id="fb-0087"></a>

## FB-0087 — Customizable sign-in: application logo and sign-in stylesheets

Support application logos, sign-in stylesheets and restricted sign-in content slots through the public shell configuration.

Guides: [file cache keys](toolkit.md#cache-keys), [sign-in customization](shell.md#sign-in-branding), [logo](shell.md#sign-in-logo), [content](shell.md#sign-in-content), [modules](shell.md#sign-in-modules).

<a id="fb-0088"></a>

## FB-0088 — 61ade product logo and brand sources

Guides: [brand](brand.md), [sign-in logo](shell.md#sign-in-logo).

<a id="fb-0089"></a>

## FB-0089 — Animated 61ade trademark screen

- **Implemented:** `logo.mjs` also writes
  `packages/php/resources/brand/splash-logo.svg` (dark palette, ids
  `blade-splash-*`, wordmark clipped right of the mark);
  `templates/shell.php` renders `#blade-splash` with it and the fixed credit;
  `src/splash.css` plays the timeline, `src/Splash.ts` fades it out once
  `AdminShell` is built and the finite animations have played. No PHP or JSON
  option; reduced motion keeps a still screen; 12 s self-hide if `admin.js`
  never releases it. The glint is an overlay-blend band, so it shows on the
  tiles and ascenders only (the near-white ink cannot brighten); a spark on
  the `d` ascender carries it to the wordmark. Guide:
  [trademark screen](brand.md#splash); migration row M33. The spark moved to
  the tip of the `1` with the redrawn logo ([FB-0090](#fb-0090)).

Guides: [trademark screen](brand.md#splash).

<a id="fb-0090"></a>

## FB-0090 — The logo's b is the 6 of the source drawing

- **Implemented:** `logo.mjs` redrawn on that grid ([grid](brand.md#grid),
  [colours](brand.md#colours)); tiles are rounded paths (tile 1 a group of
  fill and rim); viewBox `-19 -46 1407 395`, so `admin.css` uses aspect ratio
  1407 / 395 and the 24 px top-row logo is about 85 px wide (was 91). The
  splash spark moved to the tip of the 1. `sign-in-branding.spec.cjs`: the
  narrower logo now fits the 390 px sign-in row; the menu-never-yields case
  uses 1240 px (about 73 px left for a 110 px logo).

Guides: [grid](brand.md#grid), [colours](brand.md#colours).

<a id="fb-0091"></a>

## FB-0091 — The b1ade logo

- **Implemented:** `logo.mjs` redrawn on the drawing's grid
  ([grid](brand.md#grid), [colours](brand.md#colours)): every glyph one
  outline of radius-per-corner arcs (`outline()`, which also draws the
  tiles), the `b` a real b, the `1` with flag and flaring foot, the `a` open
  by a slit, the `e` by a channel under its slanted bar; one `blade-b1`
  gradient replaces the 6's crescent and the 1's bevel. viewBox
  `-19 -46 1795 395` (`admin.css` aspect ratio 1795 / 395; the 24 px top-row
  logo is about 109 px wide, was 83). The screen's copy (`-19 -46 2270 395`)
  adds `.blade-logo__dot` and `.blade-logo__domain`, silver ink and a glow
  filter; `splash.css` adds the dot's pop, `com` sliding in, a blue floor
  light and `-webkit-box-reflect` (no reflection in Firefox), the logo
  `min(84vw, 760px)` wide, the spark on the 1's flag tip.

Guides: [grid](brand.md#grid), [colours](brand.md#colours).

<a id="fb-0092"></a>

## FB-0092 — Compact navigation reserved room for a hidden logout button

- **Implemented:** `AdminShell.renderMenu()` reserves the standalone logout
  width only for the full menu. Compact navigation counts `Menü`, any visible
  desktop siblings and the actual selector cells when checking sibling and
  logo fit. Full-menu collapse thresholds, signed-out placement, image/theme
  handling and server authorization are unchanged. There is no fixed phone
  cutoff for the logo; it still yields when the estimated remaining space
  cannot hold its measured width. Contract: [logo](shell.md#sign-in-logo).

Guides: [logo](shell.md#sign-in-logo).

<a id="fb-0093"></a>

## FB-0093 — Private runtime directories that project owners can clean

Create private runtime directories with permissions that let their owning maintainers manage them without widening access.

Guides: [runtime permissions](authentication.md#runtime-permissions), [usage](usage.md#belépési-módok-jelszó-e-mailes-kétfaktor-oauth).

<a id="fb-0094"></a>

## FB-0094 — Empty sign-in fields

Superseded by [FB-0097](#fb-0097).

Guides: [login flow](authentication.md#belépési-folyamat), [usage](usage.md#belépési-módok-jelszó-e-mailes-kétfaktor-oauth).

<a id="fb-0095"></a>

## FB-0095 — Verify and clear real saved-credential autofill

Superseded by [FB-0097](#fb-0097).

Guides: [login flow](authentication.md#belépési-folyamat), [usage](usage.md#belépési-módok-jelszó-e-mailes-kétfaktor-oauth).

<a id="fb-0096"></a>

## FB-0096 — Bilingual product website and public demo entry

- **Implemented:** English `/website/` and Hungarian `/website/hu/` on the
  existing managed origin; dark blue presentation, responsive navigation,
  capability disclosures, localized alternative text, keyboard-operable
  native image dialog, canonical/hreflang/social metadata and twelve retained
  synthetic-demo JPEGs. The site is static HTML/CSS/JavaScript generated by
  `npm run website:assets`; PHP is used only at build time to render both
  languages from one template. The website guide was removed in
  [FB-0139](#fb-0139).

<a id="fb-0097"></a>

## FB-0097 — Roll back login suppression and identify the writer

Remove framework autofill-suppression behavior and diagnose the actual source of sign-in values. This supersedes FB-0094 and FB-0095.

<a id="fb-0098"></a>

## FB-0098 — Remove the mailbox link from the sign-in window

- **Implemented:** removed the feature demo's `SignInLink` declaration and its
  unused import. The declarative notice remains; the mailbox is still directly
  available at `/mailbox/` for synthetic e-mail confirmation checks.

- **Scope:** demo configuration only. Framework link support, localization and
  authentication flows are unchanged. Guides: [demo mailbox](demos.md#demó-postafiók-mailbox),
  [sign-in customization](shell.md#sign-in-branding).

Guides: [demo mailbox](demos.md#demó-postafiók-mailbox), [sign-in customization](shell.md#sign-in-branding).

<a id="fb-0099"></a>

## FB-0099 — Redesigned product website

Guides: [product direction](product-direction.md).

<a id="fb-0100"></a>

## FB-0100 — Domain cutover to 61ade.com

Guides: [development](development.md#development-environment).

<a id="fb-0101"></a>

## FB-0101 — Deleting occurrences of an event whose content was deleted

- **Implemented:** `CalendarActions` checks required extra fields in `save()`:
  a blank value the event, or the series of an exception, already stores is
  kept; a new blank value is still refused. Guide:
  [calendar](calendar.md).

Guides: [calendar](calendar.md).

<a id="fb-0102"></a>

## FB-0102 — Media thumbnails, audio and animation icons, image and animation player

- **Implemented:** `TaskQueue` treats every `running` task as orphaned when a
  runner takes the single lease, and `afterResponse` starts a runner for one
  once the lease is free or expired: a dead runner delays tasks by at most its
  lease (budget + 120 s) instead of 10 minutes ([files](files.md)).
  Framework: `app.mediaTypes` (`MediaType` `mime`, `label`, `icon`; built-ins
  `image`, `video`, `audio`) used by media slots, the `type` part, the file
  picker and the file manager; glyphs `blade-icon--audio` (the built-in audio
  icon) and `blade-icon--animation`; activation maps on media fields match an
  exact MIME type before the class ([toolkit](toolkit.md#registries),
  [activation](workspaces.md#activation)). Demo: media type `demo.scene`
  (`Animáció`), `Médianéző` for images, video, audio and scenes (SandboxFrame
  with the scene runtime shared with `Napi műsor`, `scene.ts`), the toolbar
  command `demo.play` ([D1](demos.md#d1-asset-viewer)).

Guides: [files](files.md), [toolkit](toolkit.md#registries), [activation](workspaces.md#activation), [D1](demos.md#d1-asset-viewer).

<a id="fb-0103"></a>

## FB-0103 — Playlists for the signage programme

- **Implemented:** framework: `CalendarDefinition::$tones` (event colour rules
  over extra fields, theme tones, ACL-filtered metadata,
  [calendar](calendar.md)). Demo (project domain,
  [D5](demos.md#d5-playlist-editor)): `signage_playlists` with items,
  `signage_playlists.items`/`save_items`, the record view
  `demo.playlist-editor` with drag-and-drop Suite Lists, buttons and keys; the
  calendar field `content` (playlist or asset, older `asset_id` events
  migrated by setup); usage clearing for playlists and playlist items; the day
  answer and `Napi műsor` expand playlists item by item. The managed demo got
  four playlists (`Reggeli`, `Napközbeni`, `Esti`, `Hétvégi lista`) and a
  weekly 06:00–22:00 programme of playlists and single assets; 22:00–06:00 is
  free.

Guides: [calendar](calendar.md), [D5](demos.md#d5-playlist-editor).

<a id="fb-0104"></a>

## FB-0104 — A real date picker for date fields

- **Implemented:** framework field type `date` (PHP `Field`, JSON
  declarations, `BuiltinFieldType`): a real calendar date or empty, validated
  on the server and in the browser; the native Suite DatePicker in forms (typed
  dates and clearing kept despite the Suite 9.3 popup repaint), the Grid
  `datePicker` cell editor for editable columns, allowed as a calendar extra
  field ([field presentation](field-presentation.md#dátum-date)). Demo:
  `signage_defaults.date` and the `signage_playlist.day` action's `date` are
  `date` fields; the pattern and the business rule's own date check are gone.

Guides: [field presentation](field-presentation.md#dátum-date).

<a id="fb-0105"></a>

## FB-0105 — A fuller playlist editor: item overrides, transitions, library controls

- **Implemented** ([D5](demos.md#d5-playlist-editor)): list settings
  (`transition`, `transition_ms`, `shuffle`, edited with the 61ade RecordForm
  over `update`) and item settings (`duration`, `transition`, `enabled`,
  `valid_from`/`valid_to`, stored as a validated JSON list by `save_items`);
  setup adds the columns. The editor: library with search, type filter,
  sorting and list/tiles (DataView, browser preferences); preview stage with
  transitions and its transport bar; a proportional timeline; the playlist
  with badges, inline switch/remove, multi-select and keys; the item form for
  one or several items. The day answer applies the switch, validity, play
  time overrides, transitions and a stable per-date shuffle; `Hossz (mp)`
  counts overrides and leaves switched-off items out.

Guides: [D5](demos.md#d5-playlist-editor).

<a id="fb-0107"></a>

## FB-0107 — Guides on the feature-demo entries and a registry editor demo

- **Implemented:** framework: the [view guide](workspaces.md#view-guide)
  (`View`/builders/definitions `guide`, JSON `guide`, the shell's non-modal
  window and lower-bar button); [tree navigation](workspaces.md#tree-navigation)
  (`Registry::tree()`, JSON `view.tree`, `TreeNavigation` in `ListView`:
  children loaded on expansion through the node hierarchy's `list`, node
  actions in the tree panel, the list scoped to the selected node;
  `TreeAdapter.setChildren`); [conditional fields](workspaces.md#conditional-fields)
  (`Field` `visibleWhen`, JSON `visible_when`: forms show and validate the
  field only while its condition holds, the server skips an inactive field and
  stores it empty); a `RecordForm` mounted in an `AppWindow` fits it. Demo: a
  guide on every `Feature demó` entry, and `Regisztrációs adatbázis`
  ([registry.json](../examples/demo-app/modules/registry.json), seeded by
  `setup-workspace.php`) with a cycle guard and a subtree delete hook
  ([demos](demos.md)). Toolkit contract: M34 and the
  [changes](toolkit.md#changes) entry; additive.

Guides: [view guide](workspaces.md#view-guide), [tree navigation](workspaces.md#tree-navigation), [conditional fields](workspaces.md#conditional-fields), [demos](demos.md), [changes](toolkit.md#changes).

<a id="fb-0108"></a>

## FB-0108 — Playlist editor and day programme from 61ade components only

Guides: [manual order](workspaces.md#manual-order), [filters in cards and tiles](workspaces.md#card-filters), [`PageLayout`](toolkit.md#pagelayout), [rules](validation.md), [D2](demos.md#toolkit-d2-playlist).

<a id="fb-0109"></a>

## FB-0109 — A guide on every view, once per session, from the top row

Superseded by [FB-0243](#fb-0243).

Guides: [view guide](workspaces.md#view-guide), [changes](toolkit.md#changes).

<a id="fb-0110"></a>

## FB-0110 — Visitor sandboxes on the public demo

- **Implemented:** [visitor sandboxes](demos.md#visitor-sandboxes):
  `examples/demo-app/sandbox.php` (signed copy cookie, copy from a seed the
  web setup builds, idle purge, limits, the developer key selecting the shared
  instance), the gate in the four web entrypoints, `SetEnv
  BLADE_DEMO_SANDBOX 1`, the withheld host settings in `blade_demo_setting()`
  and the sandbox upload limit; `tools/playwright-test.cjs` adds the developer
  cookie to every test context, and the ended-session specs clear only the
  session cookie. Demo-only: no framework change.

Guides: [visitor sandboxes](demos.md#visitor-sandboxes).

<a id="fb-0111"></a>

## FB-0111 — Player commands that look like a player

- **Implemented:** framework: `CommandSeparator`, `CommandButton.iconOnly`,
  `MediaPlayerEvents` `play`/`pause`, glyphs `blade-icon--play`, `--pause`,
  `--skip-start`, `--skip-previous`, `--skip-next`, `--rewind`,
  `--fast-forward`, `--repeat`, `--repeat-off` ([CommandBar](toolkit.md#commandbar),
  [changes](toolkit.md#changes) entry; additive). Demo: the asset viewer
  (back, divider, `Elejére`, `Vissza 5 mp`, the toggle, `Előre 5 mp`, the
  loop as repeat on/off) and the shared player (`Elejére`, `Előző elem`, the
  toggle, `Következő elem`).

Guides: [CommandBar](toolkit.md#commandbar), [changes](toolkit.md#changes).

<a id="fb-0112"></a>

## FB-0112 — Real media in the signage demo

Guides: [development](development.md#development-environment), [signage media](demos.md#signage-media).

## FB-0113 — Playlist as default content

Guides: [exclusive fields](workspaces.md#exclusive-fields).

<a id="fb-0114"></a>

## FB-0114 — English demo data

- **Implemented:** the seeds of
  [setup-workspace.php](../examples/demo-app/setup-workspace.php) and
  [signage.php](../examples/demo-app/signage.php) are English: tasks
  (`Synthetic task 01`), readings (`Reading 0001`), catalog, shelves, items and
  zones, the Drive A–C file tree (names and text content, e.g.
  `Documents/note.txt`, `Upload samples/large-log.txt`, `Drive C:/Shared`), the
  two topologies (`Office network`, `Site VPN`), the signage media (file names
  and asset titles, e.g. `Craft coffee, slow mornings.png`, `calm-music.mp3`;
  the git-ignored `resources/media/` files were renamed), playlists and events
  (`Morning playlist`, `Brand animation`, `Orange fizz`), the tenants `Alpha`
  and `Beta` with their projects, tasks and notice, and the role `Editor`.
  Account display names were English already. Existing databases are renamed
  in place by setup before anything is seeded by name
  ([former-names.php](../examples/demo-app/former-names.php) and
  `BLADE_DEMO_SIGNAGE_FORMER`): only exact former values change (a file's
  content only while its hash is the former seed's), a taken English name
  leaves the entry, a rerun changes nothing. Tests and docs follow the new
  names; data that tests create themselves stays as written. Demo-only: no
  framework change.

<a id="fb-0115"></a>

## FB-0115 — Dark scrollbars, a themed calendar and a tiles-first library

- **Implemented:** dark bases set `color-scheme: dark` and a translucent
  `scrollbar-color` (`themes/character.css`). `calendar.css` maps every
  Scheduler colour, font, radius and border onto the Suite tokens on the root
  (popups included); the navigation buttons are flat Suite toolbar buttons,
  with the Blade hover, a pressed current view and a glossy day header in Blade
  and Blade Night ([calendar](calendar.md)). New, additive:
  `ListViewOptions.mode` (`table`, `cards`, `tiles`), the presentation a list
  opens in until its user picks one ([toolkit](toolkit.md#listview)); the
  playlist editor's library uses `tiles`.

Guides: [calendar](calendar.md), [toolkit](toolkit.md#listview).

<a id="fb-0116"></a>

## FB-0116 — Signage screenshots on the website and a real phone frame

- **Implemented:** all twelve website images recaptured from a fresh visitor
  sandbox on the `Digitális kijelző` views, Blade and Blade Night alternating
  (website removed in [FB-0139](#fb-0139)); the showcase
  is now media library, playlists, calendar and media viewer (files and
  diagram images removed; both stay in the capabilities text), with new
  English and Hungarian copy and alternative text. The phone frame gets its
  own status bar (time, island, signal and battery) and home indicator in the
  Blade bar colours, sized in container units; the phone image is 780 × 1688.
  Layout panel headers are passed as plain text
  ([toolkit](toolkit.md#pagelayout)).

Guides: [toolkit](toolkit.md#pagelayout).

<a id="fb-0117"></a>

## FB-0117 — OAuth-only sign-in

- **Implemented:** optional `oauth.exclusive` (PHP `AuthHandlerLogin`
  `exclusive`). The signed-out shell skips the 61ade window and opens
  AuthHandler's overlay, which cannot be dismissed; the declared logo, notice,
  links and sign-in module slots are placed in it. The server rejects every
  password, code and password-change action and omits their pending state
  ([OAuth-only sign-in](authentication.md#oauth-only-sign-in)). `_AuthHandler`
  is unchanged.

Guides: [OAuth-only sign-in](authentication.md#oauth-only-sign-in).

<a id="fb-0118"></a>

## FB-0118 — The OAuth-only overlay waits for the trademark screen and fades in

Guides: [OAuth-only sign-in](authentication.md#oauth-only-sign-in), [overlay](authentication.md#oauth-belépés-authhandler), [splash](brand.md#splash).

<a id="fb-0119"></a>

## FB-0119 — Optional player spectrum, composed repeat controls and bottom toolbar

<a id="fb-0120"></a>

## FB-0120 — Optional autoplay delegation for sandboxed scene playback

- **Implemented:** optional `SandboxFrameOptions.autoplay: true` adds only
  `allow="autoplay *"` to the iframe. The sandbox flags remain `allow-scripts`;
  credentialless loading, opaque origin, CSP, protocol validation and
  lifecycle behavior remain intact. Default false. The D1 animation viewer
  demonstrates opting into delegation. Scene autoplay, repeat and transport
  messages remain the scene adapter's contract.

<a id="fb-0121"></a>

## FB-0121 — Configurable session idle timeout and persistent cookie

- **Implemented:** additive `ApplicationDefinition.sessionIdleTimeout` and
  `sessionCookieLifetime`, with corresponding JSON `session.idle_timeout` and
  `cookie_lifetime`. Defaults remain 1800 and 0 seconds. HTTP idle expiry and
  live bridge authorization use the same configured timeout. Positive cookie
  lifetime renews on HTTP requests. Request-local PHP GC retention is raised
  to the idle limit without lowering a larger host value.

<a id="fb-0122"></a>

## FB-0122 — Common Toolbar spacing and unified navigation in every skin

- **Implemented:** native Menu and Toolbar controls share full-height flat
  geometry, 12 px horizontal padding, 8 px icon spacing, primary-tinted hover
  and open states, and inset keyboard focus. Selector Layout cells size to
  content with symmetric 8 px separator spacing, replacing fixed-width slots.
  Menu fitting uses the native font's measured label widths and the actual
  selector widths. Only the current view's section carries an underline.
  Blade and Blade Night keep their row chrome, with the same flat controls;
  their separate folder tabs and connected-popup presentation are removed.
  Normal Toolbars share `--blade-toolbar-padding` (`4px 8px`) and fill their
  host through common CSS, including a Toolbar directly attached to a Layout.
  The list-specific padding dependency is removed. Shell navigation, status
  and window headers keep their role-specific geometry. Below 768 px or when
  the control group cannot fit, tenant, guide, language and theme move into
  the right-hand `Beállítások` hamburger. Compact Toolbar submenus replace
  the current native popup, with `Vissza`/ArrowLeft to return and Escape to
  close and focus the opener. This also fixes overlapping cascades in compact
  list command menus. Submenu placement is superseded by the adaptive
  fit rule in [FB-0135](#fb-0135).
  [Shell](shell.md#elkülönülő-főmenügombok), [usage](usage.md).

Guides: [Shell](shell.md#elkülönülő-főmenügombok), [usage](usage.md).

<a id="fb-0123"></a>

## FB-0123 — Paste an image directly into a form field

- **Implemented:** the existing `file` field accepts one clipboard file while
  focused, or one dropped file. The shared uploader's additive
  `background: true` option keeps its queue, protocol, checks and events while
  leaving the form focused. A local image preview and localized status appear
  in the field; success selects the stored file id. Form validation blocks
  saving while this direct upload is pending. Failures preserve the old
  reference; another choice/clear invalidates earlier callbacks. Closing the
  form releases its listeners and object URLs. The existing picker and full
  upload-window button remain available. Image-only fields use the existing
  `accept: ["image"]` declaration. No server, storage or ACL contract changes.

Guides: [File field](workspaces.md#file-field), [uploader](uploader.md), [toolkit](toolkit.md#uploads), [usage](usage.md).

<a id="fb-0124"></a>

## FB-0124 — A Toolbar owns its bottom divider

- **Implemented:** the common native Toolbar style draws a 1 px bottom border
  using `--dhx-border-color`, inside its declared height. Direct Layout cells
  and cells holding only a public CommandBar delegate their adjoining rule to
  the Toolbar; a following native Grid drops its duplicate top edge. The
  list-only command-row border is removed. Navigation/status keep their own
  row boundaries and the native window header keeps its existing divider.
  [Toolkit](toolkit.md#commandbar), [usage](usage.md).

Guides: [Toolkit](toolkit.md#commandbar), [usage](usage.md).

<a id="fb-0125"></a>

## FB-0125 — Active list target across expanded rows and child windows

- **Decision:** additive `ListView` event `target` and query `target()` return
  `ListTarget` (`{view, row, rows}`): the offered view, its cursor record and
  its marked records. Each list retains its own cursor, independently of
  keyboard focus; `select` and `selected()` retain their main-list meaning.
  The active preview follows toolbar delegation. The foremost open modal
  child window supplies its own context until closed, including when it has
  no selection; closing it restores the underlying preview/main context.
  A non-selectable child never supplies a cursor record.

- **Implemented:** the shared Workspace exposes and forwards target snapshots
  through nested previews and full windows. Selection, marks, active-record
  data changes, preview removal and window lifecycle schedule a notification
  after synchronous native callbacks settle; an unchanged context emits
  nothing. The getter returns the same state as the event. Destroy releases
  pending notifications; before a tree has a scoped list and after destroy
  the public query returns `undefined`. Payload/marks arrays are frozen;
  record objects are not deep frozen. Existing per-command delegation stays
  intact (a parent-only command can still act on the parent).

Guides: [ListView](toolkit.md#listview), [sub-views](workspaces.md#sub-views), [usage](usage.md).

<a id="fb-0126"></a>

## FB-0126 — A single-file form input, separate from the full uploader

- **Implemented:** the shared `file` control has `Fájl megadása…` (then
  `Fájl cseréje…`), a native single-file input and the existing background
  transfer. Clicking the drop/preview surface or pressing Enter/Space on
  the file name opens the same native dialog. There is no stored-file
  picker or full-uploader button in a form. The preview spans the field,
  is 180 px high and uses `contain`, so portrait/landscape images stay whole.
  Optional clearing, pending-save validation, errors, ACL, file ids and
  metadata retain their contracts. The standalone public `FilePicker`
  remains available for explicit existing-file selection.

Guides: [file field](workspaces.md#file-field), [uploader](uploader.md), [toolkit](toolkit.md#uploads), [usage](usage.md), [demo](demos.md).

<a id="fb-0127"></a>

## FB-0127 — The uploader window uses the shared window action row

- **Implemented:** the row is the shared window action row (native Form,
  `blade-form-actions`, as the file picker and record forms): the clear
  command is the flat secondary button, `Bezárás` the primary one, with one
  rule above it and the window's lower edge below. The uploader window's
  content has no inset; each cell keeps its own. The class collision is gone.
  Commands, accessible names and the disabled state of the clear command are
  unchanged.

Guides: [uploader](uploader.md).

<a id="fb-0128"></a>

## FB-0128 — The demo file manager accepts at most 20 MiB per file

<a id="fb-0129"></a>

## FB-0129 — Window resize handles can be grabbed on their whole width

- **Implemented:** the window no longer clips. The header (and its toolbar)
  round their top corners, and the content rounds its bottom corners and
  clips itself, so the rounded look is unchanged.

<a id="fb-0130"></a>

## FB-0130 — Native separators before declared menu groups

- **Implemented:** `ApplicationDefinition::menuSeparators` / JSON
  `application.menu_separators` names unique declared view groups. Only
  offered groups enter the translated bootstrap. `AdminShell` inserts one
  native separator per selected group, counts its width, omits a leading
  separator and retains it in the compact menu. The default is an empty list;
  there is no new ordering API or CSS. The feature demo uses the option before
  `Digitális kijelző`.

Guides: [menu group separators](shell.md#menu-group-separators), [configuration](configuration.md), [usage](usage.md), [demo](demos.md).

<a id="fb-0131"></a>

## FB-0131 — Optional public application UI with sign-in beside the rightmost logo

- **Implemented:** optional `ApplicationDefinition.publicIdentity` / JSON
  `application.public_identity` selects a dedicated active account's explicit UI
  permissions. The default still requires login. The guest is resolved on each
  request and uses the existing ACL, field projection, guards, transactions and
  audit; no automatic grant or authenticated session identity. PHP
  `Identity.authenticated` and toolkit `app.identity.authenticated` distinguish a
  public visitor from an authenticated actor. The ordinary modules, stylesheets,
  skins, guides and routing work in the public shell.

Guides: [authentication](authentication.md#public-access), [shell](shell.md), [configuration](configuration.md), [toolkit](toolkit.md), [ACL](access-and-actions.md).

<a id="fb-0132"></a>

## FB-0132 — Sign-in keeps the public layout behind its modal

- **Implemented:** public Sign in fetches the existing `?signin=1` page's auth
  metadata and explicitly marked same-origin assets, then opens the framework's
  ordinary sign-in window in place. It does not rebuild the guest `Application`,
  view, form input, filter or live connection. Cancel before a server challenge
  closes only the window, removes its styles and listeners, and restores focus
  to Sign in. Native Form/Window destruction waits until Suite completes its
  button click dispatch. OAuth-only cancellation also removes its backdrop,
  decorations and reopening listener; AuthHandler itself is unchanged.

Guides: [authentication](authentication.md#public-access), [shell](shell.md), [toolkit](toolkit.md#module-loading), [configuration](configuration.md), [usage](usage.md).

<a id="fb-0133"></a>

## FB-0133 — Guest-session expiry must not request sign-in

- **Fixed:** guest expiry uses a localized Reload action and guest-session
  explanation; automatic recovery returns to public access and removes a stray
  `signin` URL flag when no sign-in was intentionally open. Unsaved input and the
  one-reload-per-minute guard retain their confirmation/Cancel behavior. The
  server opens authentication only for an explicit sign-in request, an auth POST
  or a pending challenge, not an unrelated public UI error. Mandatory-login
  behavior, CSRF rejection, server ACL and audit are unchanged; actions are not
  retried automatically. The guest account remains active in the managed demo.

Guides: [public access](authentication.md#public-access), [ended sessions](shell.md#ended-session), [usage](usage.md).

<a id="fb-0134"></a>

## FB-0134 — Blade chrome on collapsed vertical panel headers

- **Fixed:** in Blade and Blade Night, collapsed column headers fill the cell's
  height and contain the vertical caption below the native expand icon. Native
  horizontal padding preserves the previous strip width. Expanded columns and
  horizontally collapsed headers keep their existing geometry. The full strip
  remains the native toggle, including Enter support. No configuration, API,
  authorization or event changes; factory light/dark are unaffected.

Guides: [appearance](shell.md#61ade-character), [usage](usage.md).

<a id="fb-0135"></a>

## FB-0135 — Toolbar submenus cascade right when they fit

- **Implemented:** the common `ResponsiveToolbar` measures the native popup's
  actual themed width at each depth. A fitting submenu keeps Suite's rightward
  cascade. If it would cross the viewport's right edge, it replaces ancestor
  popups at the original toolbar toggle, with the existing localized `Vissza`
  and ArrowLeft return path. The rule applies to compact commands and desktop
  selectors near the right edge. Back retains the original toggle before
  Suite closes its clicked menu; Escape restores focus there. Resizing closes
  the open popup so the next opening measures the new available space.
  No configuration, permissions, server actions, audit or event changes.

Guides: [CommandBar](toolkit.md#commandbar), [shell controls](shell.md#elkülönülő-főmenügombok), [usage](usage.md).

<a id="fb-0136"></a>

## FB-0136 — Public sign-in windows can be closed

- **Implemented:** the native password, code-confirmation and forced-password-change
  windows expose Suite's header X and Escape when public access is available.
  They invoke the same cancellation path as public Cancel. Before a challenge,
  closing removes the window, modal blocker, listeners and sign-in styles,
  restores focus to Sign in and retains the guest view/input without reloading.
  Pending stages use the existing server-side cancellation/logout and reload
  public access. Submission guards remain effective. Native window destruction
  may complete its own hide without recursively cancelling or leaving an empty
  modal behind. Mandatory-login windows retain their existing required-login
  behavior; AuthHandler is unchanged. No new API, action or audit event.

Guides: [public access](authentication.md#public-access), [shell](shell.md), [toolkit](toolkit.md#module-loading), [usage](usage.md).

<a id="fb-0137"></a>

## FB-0137 — Hide the 61ade sign-in window behind AuthHandler

Guides: [authentication](authentication.md#oauth-belépés-authhandler), [usage](usage.md).

<a id="fb-0138"></a>

## FB-0138 — A sign-in header X can return to a public document

- **Implemented:** optional `SignIn.closeHref` (JSON `sign_in.close_href`),
  validated by the existing sign-in link destination rules. It enables the
  native password-window close action and restores AuthHandler's existing
  header X in OAuth-only mode. The latter has a localized accessible name
  and navigates without dismiss/reopen flicker. No extra content row is
  introduced. Omission preserves required/public sign-in behavior; pending
  challenges keep their existing cancellation flows. AuthHandler itself is
  unchanged. There is no new authentication, authorization or audit action.
  The feature demo declares `/public/` as its destination.

Guides: [sign-in content](shell.md#sign-in-content), [configuration](configuration.md), [OAuth only](authentication.md#oauth-only-sign-in), [usage](usage.md), [event catalog](product-direction.md#4-eseménynapló-lefedési-katalógus).

<a id="fb-0139"></a>

## FB-0139 — Remove the product website from the repository

The product website is outside this repository. The managed demo remains the development and test environment.

<a id="fb-0140"></a>

## FB-0140 — Align desktop logout to the right

- **Implemented:** the full navigation menu uses a native DHTMLX Menu spacer
  before the session separator, aligning logout to its right edge before the
  selector controls. Compact desktop and phone navigation retain logout in Menü.
  No configuration, authentication, permission, POST or audit changes.

Guides: [shell](shell.md#kompakt-ablakfejléc-és-teljes-mobilmenü), [usage](usage.md).

<a id="fb-0141"></a>

## FB-0141 — Make audio playback position clearly visible

Superseded by [FB-0142](#fb-0142).

Guides: [toolkit](toolkit.md#mediaplayer), [usage](usage.md), [files](files.md), [demo](demos.md#optional-audio-spectrum), [event catalog](product-direction.md#4-eseménynapló-lefedési-katalógus).

<a id="fb-0142"></a>

## FB-0142 — Recolour the original timeline and remove the duplicate

- **Implemented:** removed the extra slider, clock, listeners, styles and its
  unused HU/EN/DE label. The original native audio timeline uses orange played
  time, darker amber buffered time and black unbuffered time through scoped
  media-control CSS. Its geometry and native interactions are unchanged.
  Forced colours and browsers without the styling retain native appearance.
  This supersedes FB-0141's UI, with no new option or event contract.

Guides: [toolkit](toolkit.md#mediaplayer), [usage](usage.md), [files](files.md), [demo](demos.md#optional-audio-spectrum).

<a id="fb-0143"></a>

## FB-0143 — Opt-in Strict cookies, client-address binding and trusted proxy networks

- **Implemented:** `ApplicationDefinition.sameSite` (`Lax` default or
  `Strict`; JSON `session.same_site`; `None` is refused) applies to the
  session and remembered-login cookies. `bindSessionToClientAddress` (JSON
  `session.bind_to_client_address`, default `false`) stores the address at
  every sign-in. On a mismatch, the session is cleared, its ID rotated and
  `session`/`client_address` `rejected` recorded with the account id and no
  addresses. `HttpEntrypoint::run(..., bool|array $trustProxy)` accepts
  `false`, `true` (exactly `127.0.0.1`/`::1`, as before) or a list of
  canonical CIDR networks. An invalid list fails closed with the 503 page;
  `trustLocalProxy: true` remains an alias.

- **Decisions:** the language cookie stays `Lax`, being a display preference
  without a credential. Only signed-in sessions are bound. Sessions without a
  stored address end once binding is enabled. The remembered-login
  credential is not bound, so it restores a session at the new address. The
  live channel follows the session: an ended session's file fails the
  bridge's recheck (4401), and the server compares no addresses of its own.
  Proxy networks refuse `/0`, host bits, zones and prefix or IPv4 leading
  zeros; any valid IPv6 notation is accepted.

- **Compatibility:** under `Strict`, a cross-site top-level navigation (an
  e-mail or chat link, an OAuth callback chain) arrives without the session
  and remember cookies, and the fresh session it starts replaces the stored
  one. OAuth sign-in is therefore expected to be lost at the callback chain's
  final redirect, so applications with OAuth keep `Lax`; any other site can
  sign a visitor out by linking to the application. Proxy networks that
  include ordinary clients let them choose their address, which weakens
  `PasswordAttempts` throttling and the binding.

Guides: [cookie SameSite](authentication.md#cookie-samesite), [client-address binding](authentication.md#client-address-binding), [trusted proxies](shell.md#trusted-proxies), [security model](security-model.md), [configuration](configuration.md).

<a id="fb-0144"></a>

## FB-0144 — Overlay child-list buttons on card and tile covers

- **Implemented:** the existing native child-list button overlays the cover's
  upper-right corner on cards and its bottom edge at full width on tiles.
  Cards without media keep the footer button. Captions retain their child count,
  full accessible name and tooltip; long labels truncate within the cover.
  Buttons remain at least 40 px high. The same child-count visibility rules,
  full child-list window and keyboard behaviour apply in both modes. No new
  declaration, permission or server contract. This refines FB-0071's card footer.

Guides: [sub-views](workspaces.md#sub-views), [usage](usage.md), [demos](demos.md).

<a id="fb-0145"></a>

## FB-0145 — Tabs for switching between viewing and editing

Guides: [pitfalls](toolkit.md#pitfalls), [toolkit Tabs](toolkit.md#tabs), [PageLayout](toolkit.md#pagelayout), [usage](usage.md), [demos](demos.md).

<a id="fb-0146"></a>

## FB-0146 — Remove the demo menu group separator

- **Implemented:** removed the feature demo's `menuSeparators` declaration;
  it uses the default empty group-separator list. The optional framework
  capability and the session separator remain unchanged.

Guides: [shell](shell.md#menu-group-separators), [usage](usage.md), [demos](demos.md).

<a id="fb-0147"></a>

## FB-0147 — Keep the menu context on record pages

- **Implemented:** a record page inherits the first offered non-record view
  whose resource equals its record resource. An explicit record-view `group`
  limits the source group; if that group has no matching source, the group
  itself supplies the section and siblings, without selecting a child.
  Multiple sources follow declaration order; an absent source/group marks
  nothing. Window openings keep the underlying page's context. This uses
  existing permission-filtered metadata; no new option, data write or audit
  event. The playlist editor and asset viewer benefit automatically.

Guides: [menu context](shell.md#elkülönülő-főmenügombok), [record views](toolkit.md#record-views), [usage](usage.md), [playlist editor demo](demos.md#d5-playlist-editor).

<a id="fb-0148"></a>

## FB-0148 — Accordion attachable to a layout region

Guides: [toolkit Accordion](toolkit.md#accordion), [PageLayout](toolkit.md#pagelayout), [event catalog](toolkit.md#event-catalog), [usage](usage.md), [demos](demos.md#d1-asset-viewer).

<a id="fb-0149"></a>

## FB-0149 — List views without a menu entry

- **Implemented:**
  - `menu: false` on `View` (constructor, `with`), `View::list`,
    `Registry::view`, `SqlResource::register`; JSON
    `resources.<name>.view.menu` (a boolean). Only a list view that is not a
    singleton and has no guide (it never opens as a page) may set it; a
    record view, another kind, a singleton or a guide throw.
  - Bootstrap: `menu: false` on such views only (`ViewDefinition.menu`).
    The shell leaves them out of the main menu and the compact siblings; the
    address and `app.navigate` refuse them like a view that is not offered
    (the empty workspace, `false`); a record page's menu context never
    inherits from one.
  - A sub-view child with `menu: false` has no `page` in the sub-view
    metadata; a `page` activation over it throws in `subview()` and in
    `checkViews()` when the child leaves the menu later.
  - Demo: `signage_asset_items` (signage.php), the playlist items of one
    asset, mounted by the asset viewer as a third accordion section
    `Lejátszási listákban` (cards, `panel: false`, `showId: false`, scoped to
    `asset_id`, created on first opening, destroyed before the layout). The
    accordion now shows when `update` or this list is offered. Guide text
    updated (hu source, English); new text `Lejátszási listákban`.

Guides: [toolkit views](toolkit.md#menu-less-views), [shell menu context](shell.md#elkülönülő-főmenügombok), [workspaces sub-views](workspaces.md), [usage](usage.md), [demos](demos.md#d1-asset-viewer).

<a id="fb-0150"></a>

## FB-0150 — Player toolbars: toggles, choices, groups and a range in the CommandBar

- **Implemented:** `CommandToggle` (Suite `twoState`: `aria-pressed` in the
  bar, `menuitemcheckbox` in a menu, a primary tint with an inset bar),
  `CommandSelect` (a menu button `label: option` with `menuitemradio`
  entries), `CommandSegmented` (joined buttons in the bar, a submenu in the
  collapsed menu), `CommandGroup` (joined buttons, a block between separators
  in the menu) and `CommandRange` (a native range input with
  `aria-valuetext`, keys kept from the toolbar's navigation, throttled
  `change`). `update(id, CommandChanges)` and `value(id)`; options `label`
  (the toolbar's accessible name) and `placement: "bottom"`.
  `ResponsiveToolbar` learned an item shown inline in the bar but as a
  submenu when collapsed, an item pinned beside the menu, a state change that
  reaches the presentation not drawn at the moment (`setItem`), and to look
  up a submenu in its own popup: before, a second bar with a menu of the same
  name could take the first bar's popup. Internal Suite ids of menus, options
  and ranges carry a per-bar `#n`, which public ids cannot contain, so two
  bars never collide.

Guides: [CommandBar view controls](toolkit.md#commandbar-view-controls), [usage](usage.md), [changes](toolkit.md#changes).

<a id="fb-0151"></a>

## FB-0151 — A settings form without a record action

- **Implemented:** `app.components.SettingsForm`: the `RecordForm` types
  (without `file` and `password`) through the shared field factory,
  validation and field-type editors, plus `switch` (`role="switch"`),
  `segmented` (2–6 options over native radios), `range` (Suite Slider with
  a coupled, announced number input, `min`/`max`/`step`/`unit`), `color`
  (Suite ColorPicker) and `chips` (single or multiple, optional small
  decorative image). `values`, `setValues`, `set`, `reset`, `update(name,
  {disabled})`, `validate`; `change {field, value, values}` at once for
  switches, choices, chips and colours, on leaving a text field, at most every
  100 ms while a range is dragged and once more on release; `submit` only
  with the `submit` option. Conditional (`visibleWhen`) and exclusive
  (`clears`) fields as in `RecordForm`; groups with a native fieldset
  heading. With `key` the values are kept in `UiPreferences` under
  `settings:<key>` and checked against the fields when the form is created.
  Fixes found on the way: Suite marks a checkbox group as a `radiogroup` and
  leaves the choice groups unnamed, uses option ids as element ids, and
  disables a select's options but not the element; the form corrects each.
  Suite 9.3.12's fieldset destructor repaints the destroyed Form's Layout a
  frame later (a page error in about half of the runs that destroyed the form
  shortly after building it); the form releases its group fieldsets without
  that repaint ([pitfalls](toolkit.md#pitfalls)).
  Chosen segments and chips use a primary tint, border and ring with the
  normal text colour, because white text on the primary colour fell to
  2.7:1 in Blade Night.

Guides: [pitfalls](toolkit.md#pitfalls), [SettingsForm](toolkit.md#settingsform), [usage](usage.md), [changes](toolkit.md#changes).

<a id="fb-0152"></a>

## FB-0152 — First sort of a list and long text in cards

Guides: [admin](admin.md), [first sort](workspaces.md#list-sort), [long text in cards](workspaces.md#long-text-in-cards), [toolkit PHP signatures and changes](toolkit.md#changes), [usage](usage.md).

<a id="fb-0153"></a>

## FB-0153 — Collapsing a page region from code

- **Implemented:**
  - `PageLayout.collapse(id)`, `expand(id)`, `isCollapsed(id)` for a leaf
    declared `collapsable` (in `rows`/`cols`, beside a `tabs` or `accordion`
    branch, in a nested `PageLayout`); any other id throws `Error`.
    `collapse {id, collapsed}` (`PageLayoutEvents`) for the header click, its
    keys and the page's calls; a call that changes nothing reports nothing.
  - `UiPreferences.bindLayout` takes a `transient` check: a collapse made by
    `collapse`/`expand` (Suite reports it synchronously) is not stored.
  - Found on the way: `attach(id, component)` of `PageLayout`, `Tabs` and
    `Accordion` attached the component's Layout without mounting it, so the
    component never delivered its events (a nested `PageLayout` or an
    `Accordion` attached into a region was silent). `attachContent` now
    mounts a public component (M42).
  - Demo D7 `Feladatlap`: a first tab `Munka` with a nested `PageLayout`, a
    `CommandBar` toggle `Oldalpanel` over the side panel `Kijelölt jegyzet`
    (the selected note), in step with its header. On a phone the control
    region collapses while `Munka` is shown and opens again on another tab.

Guides: [PageLayout collapse](toolkit.md#pagelayout-collapse), [changes](toolkit.md#changes), [usage](usage.md), [demos D7](demos.md#d7-task-page).

<a id="fb-0154"></a>

## FB-0154 — A more actions menu in the CommandBar

Guides: [CommandBar menu](toolkit.md#commandbar-menu), [changes](toolkit.md#changes), [usage](usage.md), [demos D7](demos.md#d7-task-page).

<a id="fb-0155"></a>

## FB-0155 — Suite's English-only names and Escape in a non-modal window

- **Implemented:**
  - `SuiteLabels.ts`, started when the bundle loads (with or without the
    shell; the texts follow the page's language): one page-wide observer renames those elements when Suite draws them or
    changes the name. A collapsable header becomes `{header} összecsukása` /
    `{header} kinyitása` (`Összecsukás` / `Kinyitás` without a header),
    following the collapsed state; a window's close button becomes
    `Ablak bezárása` (Close window), also as its tooltip: not `Bezárás`,
    which several framework windows (the uploader) already use for their
    own lower button. This also covers a project's own Suite
    Layout or Window. The catalogue (hu, en, de) has the five new texts.
  - `openWindow` (`app.ui.window`, the view guide): a `modal: false` window
    closes on Escape while the focus is inside it; an Escape a menu or
    popup in it already took (`defaultPrevented`) is left alone, and one
    pressed elsewhere on the page does not close it.

Guides: [toolkit window](toolkit.md#app-window), [PageLayout header name](toolkit.md#pagelayout-collapse), [usage](usage.md).

<a id="fb-0156"></a>

## FB-0156 — One lower edge for toolbars and closed accordion sections

Guides: [CommandBar](toolkit.md#commandbar), [usage](usage.md).

<a id="fb-0157"></a>

## FB-0157 — A project element filling a Layout cell edge to edge

- **Implemented:** `Ui.attach(target: LayoutCell, content: Mountable,
  {signal})`. A plain element sits in a full-size slot of the cell (no
  padding or border) and keeps its node through Suite redraws. Aborting the
  signal removes it. A widget or component is attached or mounted as by
  `PageLayout.attach`. A missing signal, a target that is not a cell or
  non-object content throws `TypeError`; an aborted signal attaches nothing.
  Feature demo: the D7 task page's new `Vázlat` tab, a canvas the module
  draws between a top and a bottom `CommandBar` in a `type: "none"` box.
  Additive (M45).

Guides: [cell content](toolkit.md#cell-content), [pitfall](toolkit.md#pitfalls), [usage](usage.md), [D7](demos.md#d7-task-page), [changes](toolkit.md#changes).

<a id="fb-0158"></a>

## FB-0158 — A public Tree component over a record hierarchy

Guides: [Tree navigation](workspaces.md#tree-navigation), [toolkit Tree](toolkit.md#tree), [usage](usage.md), [D8](demos.md#d8-key-browser), [component matrix](component-matrix.md).

<a id="fb-0159"></a>

## FB-0159 — A two-state (toggle) client command for lists

- **Decision:** the state is keyed by the view id, not
  by the scope (a scoped list's own preferences are `<view id>@<field>`, which
  a mode that switches the field would lose), in the public
  `app.preferences.scope(<command name>)` store, so a host reads it before
  its first list without any new API. No new server or scope parameter: the
  host gives the mode its meaning. A `record` toggle is unsupported (skipped
  with a warning).

- **Implemented:** `ClientCommand.type: "toggle"`, `pressed` (default state),
  optional `toggle(ToggleContext)`; `run` is optional for a toggle.
  `resolveCommands` accepts a toggle only with `placement: "toolbar"`. The
  list's toolbar draws it as a Suite two-state item (`aria-pressed` and the
  pressed look of the `CommandBar` toggle, `menuitemcheckbox` with
  `aria-checked` in `Műveletek`) in its kept state from the first render. A
  user change stores the state, then (after the toolbar's click handling, so
  the host may replace the list) calls `toggle` with the list's own context
  and reports `ListView` `toggle {command, pressed}`. A toggle is never
  delegated to a sub-view record; a sub-view window keeps its own state (its
  view id). Feature demo: `demo.subkey-values` on the D8 values list switches
  between `key_id` and `parent_key_id` (a computed field of the registry
  values).

Guides: [toolkit registries](toolkit.md#registries), [workspaces](workspaces.md#project-presentations-field-types-and-client-commands), [usage](usage.md), [D8](demos.md#d8-key-browser).

<a id="fb-0160"></a>

## FB-0160 — A live attention count on a menu entry

Guides: [shell menu attention](shell.md#menu-attention), [live channel](workspaces.md#live-channel), [configuration](configuration.md), [usage](usage.md), [demos](demos.md#approvals-attention).

<a id="fb-0161"></a>

## FB-0161 — Destroy and mount into the same cell shows an empty cell

- **Decision:** accepted as a defect, fixed at the common boundary rather
  than documented: destroy + mount into the same place works any number of
  times, in one task, for every component and place, and a cell that showed
  markup takes a widget. Both pitfalls are removed.

- **Implemented:**
  - `prepareCell` (`components/Lifecycle.ts`), called before a widget goes
    into a Layout cell by `Lifecycle.mount` (every component) and by
    `attachContent` (behind `app.ui.attach` and the `attach` of `PageLayout`,
    `Tabs`, `Accordion`, view hosts and windows): a cell that a component's
    `destroy()` emptied in this frame (`Lifecycle.end()` marks it until the
    next frame) is redrawn at once, and a cell that shows HTML is detached
    and redrawn at once. The redraw happens at the mount, not at the destroy:
    redrawing at every destroy also repainted sibling cells whose widgets a
    page tear-down had already destroyed (`Cannot read properties of null
    (reading 'render')` in the accordion, task-page and asset specs of the
    first run).
  - `AppWindow` puts its content into the Suite window's content cell (what
    `Window.attach` does), so the window can be emptied the same way.
  - Feature demo D8 mounts its list and details into the page's regions
    directly, with a hint (`app.ui.attach`) in a region without a record; it
    keeps no elements of its own.

Guides: [pitfall](toolkit.md#pitfalls), [components](toolkit.md#components), [Tabs](toolkit.md#tabs), [usage](usage.md), [D8](demos.md#d8-key-browser).

<a id="fb-0162"></a>

## FB-0162 — Create defaults on a list scoped on a computed field

- **Implemented:** `ListViewOptions.createDefaults` (checked: an object of
  field names to strings, else `TypeError`); the create form starts with the
  server's values, then these for the fields of the `__form` answer that are
  not the scope field, a password or a file; another name is ignored with a
  console warning. Feature demo D8: on the subkey scope (`parent_key_id`,
  computed) `Hozzáadás` presets `Kulcs` with the selected key; the values
  view gained `create`.

Guides: [ListView](toolkit.md#listview), [usage](usage.md), [D8](demos.md#d8-key-browser), [changes](toolkit.md#changes).

<a id="fb-0163"></a>

## FB-0163 — A pinned client command

- **Decision:** accepted. The list toolbar is a `ResponsiveToolbar`, which
  already keeps `bladePinned` items after the `Műveletek` button; a client
  command maps `pinned` onto it. A toggle and a push button may be pinned
  (`toolbar` and `record` placement); the collapse stays all or nothing for
  the rest.

- **Implemented:** `ClientCommand.pinned` (`resolveCommands` skips a
  non-boolean with one warning); the list's toolbar item carries
  `bladePinned`. A pinned toggle keeps `aria-pressed` in the bar. Feature
  demo D8: `demo.subkey-values` is pinned.

Guides: [registries](toolkit.md#registries), [responsive command bar](workspaces.md#responsive-command-bar-and-uniform-card-width), [usage](usage.md), [D8](demos.md#d8-key-browser), [changes](toolkit.md#changes).

<a id="fb-0164"></a>

## FB-0164 — One preference key for several scopes of a view

- **Decision:** `preferencesKey` replaces the key; the
  per-field key stays the default, and filter values of a scoped list stay
  unsaved (the scope decides them). The FB-0159 toggle state is unaffected
  (already per view id).

- **Implemented:** `ListViewOptions.preferencesKey`
  (`[a-z][a-z0-9_.-]*`, at most 80 characters, else `TypeError`); the list
  keeps its `UiPreferences` under it (also the lists of a tree navigation).
  Feature demo D8: both scopes of the values list use
  `demo.registry-browser.values`.

Guides: [ListView](toolkit.md#listview), [workspaces](workspaces.md), [usage](usage.md), [D8](demos.md#d8-key-browser), [changes](toolkit.md#changes).

<a id="fb-0165"></a>

## FB-0165 — Fields hidden from the details

Guides: [field presentation](field-presentation.md), [workspaces](workspaces.md), [usage](usage.md), [D8](demos.md#d8-key-browser), [changes](toolkit.md#changes).

<a id="fb-0166"></a>

## FB-0166 — Scope-only fields: a scope key offered on no list surface

- **Decision:** a field option `scopeOnly` (JSON `scope_only`), not a
  `column` key: it narrows query surfaces, not only a presentation, so
  `column.details` stays the presentation flag of FB-0165 and implies
  nothing more. Refusing the field in `filters` while accepting it as a
  scope needs the server to tell the two apart, and a scoped list sent its
  scope as a filter: the list protocol gains `scope: {field, value}`, which
  every scoped list (nested lists, sub-view previews and windows, tree
  navigation lists, a page's `scope`) and the `Tree`'s levels now send. It
  takes the same field checks, value checks and field ACL as a filter and
  compares exactly (a scope is a key; a text filter still matches a part).
  This changes the wire shape of scoped list calls (migration row M50): a
  project's own `list` handler that read a scope from `filters` reads
  `scope`. A scope-only field also may not be a view column (refused), a
  first sort, an attention filter or a search field, and is left out of the
  default columns of `SqlResource::register`.

- **Implemented:**
  - PHP `Field::$scopeOnly` (a text, number, select or checkbox field, not
    secret, without `column`, `file`, `editor` or `bulk`, else
    `InvalidArgumentException`); JSON `scope_only`.
  - `ListSource`: `filterDefinitions` and `sortableFields` leave it out;
    `read` accepts `scope: {field, value}` (one field, not also in
    `filters`; `Hibás lista-hatókör.` otherwise) through the filter's checks
    with exact matching, refuses a scope-only field in `filters` (`A mező
    nem szűrhető.`, 403) and in `sort` (`A mező nem rendezhető.`, 403); a
    scope counts towards `matched` as a filter did. Search declarations
    refuse it.
  - `ListViewKind`: no `detailFields` entry; a column naming it and a first
    sort naming it are refused. `Registry` refuses it as an attention filter.
    `SqlResource::register` leaves it out of the default columns.
  - Frontend: `Workspace` sends the scope (and a shared sub-view's top level
    as the scope `""` when the list has no other scope) as `scope`;
    `NodeTree` loads levels with `scope`. The columns, header filters,
    `Szűrés` dialog and `Rendezés` menu follow the metadata, which no longer
    lists the field.
  - Feature demo D8: `Szülőkulcs` (`parent_key_id`) is `scope_only`; the
    raw `Kulcs` (`key_id`) keeps `column.details: false` (moved there from
    `Szülőkulcs`) so the FB-0165 flag stays demonstrated.

Guides: [field presentation](field-presentation.md#scope-only), [list protocol scope](workspaces.md#list-scope), [ListView](toolkit.md#listview), [configuration](configuration.md), [usage](usage.md).

<a id="fb-0167"></a>

## FB-0167 — A file field backed by the project's own storage

- **Decision:** the `file` option takes a second shape,
  `{upload: 'resource.action', get?: 'resource.action', accept}`. No new
  field type and no new route:
  - **Where the bytes live.** The project's upload action stores them and
    returns `['id' => token]`. The framework does not stage them, so the
    project's store and rules (deduplication, tenant, expiry) stay its own.
  - **Who checks the token.** "The token belongs to the actor's pending
    upload" is checked by the framework, not left to each handler. After the
    upload the executor records a claim under the upload policy's `tempRoot`.
    The claim binds actor, channel, session hash, tenant, upload action,
    detected type and TTL, and holds no token and no bytes. The record save
    accepts a new value only for a matching claim and removes it after the
    commit, so every foreign, reused, expired, made-up or other-tenant value
    gets one field error that reveals nothing.
  - **Type and size.** The type is detected from the bytes at upload time
    (any accepting field) and checked again at save time (the field's own
    `accept`). The policy keeps the size and extension rules.
  - **Preview.** It uses the GET action. A `HEAD` request gives the name and
    type, the same URL gives the image, so the project needs no descriptor
    API.
  - **A form field only.** The value is the project's opaque id, so the field
    is no column, detail, filter, sort or scope; a project column shows the
    file, as the demo's computed `Fájlnév` does.
  - **Types.** `FieldMetadata.file` becomes a union (M51, a TypeScript
    narrowing only).

- **Implemented:**
  - PHP:
    - `Field` accepts the stored shape (`stored()`, `fileAction()`); a token
      value is `[A-Za-z0-9][A-Za-z0-9._:-]{0,199}`; the `media`, `editable`
      and `presentation` column keys, `bulk` and `secret` are refused.
    - JSON `file: {upload, get?, accept}`.
    - `Registry::storedFileFields()`; `Registry::checkFileFields()`
      (`ApplicationDefinition`, `Workspace::views()`, after every action is
      registered) refuses an upload action without a policy, a `tempRoot` or
      with fields, and a `get` that is no GET action.
    - `ViewMetadata` sends `upload`, `get`, `policy`, `canUpload`,
      `canPreview`, `canChoose: false`.
    - New `FileClaims`: issue, check, release and a bounded sweep.
    - `Executor`:
      - on the upload action: one file, the type check (code `type`), a token
        answer (otherwise a 500 developer error), the claim before the commit;
      - on the record save: the claim check for a changed value, then release
        after the commit.
    - `ListSource`, `ListViewKind` and `SqlResource` leave the field out of
      filters, sort, scope, columns, details and the default columns.
  - Frontend:
    - `FileField` uploads a stored field to the project's action (target
      `null`); its result's `id` is the value;
    - on update it reads the name and type through the GET action (`HEAD`)
      and previews an image from the same URL; `Mentett fájl` when the file
      cannot be read;
    - `StoredFileFieldConfig` (public and internal).
  - Feature demo `Mellékletek` (`examples/demo-app/attachments.php`; tables
    `demo_attachments`, `demo_attachment_files`; a content-addressed
    directory; `afterSave` commits the pending row; the GET action serves a
    committed file of a record or the actor's own pending upload; unclaimed
    uploads expire after a day).

Guides: [file field](workspaces.md#file-field), [stored file field](workspaces.md#stored-file-field), [uploader](uploader.md), [configuration](configuration.md), [usage](usage.md).

<a id="fb-0168"></a>

## FB-0168 — Tree: initial expansion depth, expand and collapse all

- **Decision:**
  - **Stored-state marker:** `UiPreferences.tree()` leaves `expanded` out
    while none is stored; the tree writes `expanded` only once the user (or
    `expandAll`/`collapseAll`/`*`) changed the expansion, and before that
    stores only the selection. A stored `expanded`, an empty one included,
    is the user's and wins over `expand`. No extra flag: the presence of the
    key is the marker. A state stored before this change (the tree wrote
    `expanded` on every save since FB-0158, one day earlier) counts as the
    user's expansion.
  - **The 200-id cap stays:** a larger stored list would grow every save
    and restore with no bound. The tree stores the expanded ids upper levels
    first (by depth, stable within a level), so a restore after a large
    `expandAll` reopens the upper part of the tree and leaves the deepest
    levels collapsed rather than a random subset; documented.
  - **Caps:** 10 levels (also the largest `expand`), 2000 loaded nodes,
    checked before each child load with the server's ACL-filtered child
    count `_subview`, plus the existing 1000 children per node. A bulk
    expansion runs four loads at a time; the restore of a stored expansion
    (mount, `refresh`) uses the same pool instead of one load after another.
  - **Report:** `expandAll()` resolves `TreeExpansion` (`complete`, `nodes`,
    `reason`: `nodes`, `depth`, `children`, `cancelled`, `error`); no new
    event. The control reports a cap with the framework's non-blocking
    warning toast, the precedent of the file manager's truncated tree: the
    command bar has no text item, and a hand-made status line beside it
    would duplicate framework status presentation.
  - **Busy state:** the tree is `aria-busy="true"` while a bulk expansion
    loads and the expand button reads `Betöltés…` (it is not disabled, so a
    keyboard user keeps the focus on it; a second click does nothing).
  - **Tree navigation unchanged:** no control, no depth option and no `*`
    there (the engine's `*` is enabled only for the component). It never
    restores an expansion (no `id`, no `refresh`), so the parallel restore
    does not change its requests.
  - **After an independent review** (same day): the user's change wins over
    running bulk work. Expansions and collapses made by code are marked
    (`toggle`); every other one is the user's and sets the marker, also while
    the initial expansion or a restore loads, and a node the user collapsed
    meanwhile is not opened again by it. `collapseAll` cancels the initial
    expansion at once (its controller exists before the roots load);
    `expandAll` and `collapseAll` wait for a pending start or `refresh`.
    `expandAll` on failed roots reports `error`. Stored ids that do not load
    yet stay in the expansion and open when their parent loads (also on a
    later mount), and a stored expansion counts as the user's even when the
    roots fail on that mount. The first failed load of a bulk expansion or
    restore aborts the others and shows one dialog. `AbortSignal.any` (no
    documented browser baseline covers it) was replaced by a controller
    linked to the tree's own.

Guides: [toolkit Tree expansion](toolkit.md#tree-expansion), [usage](usage.md), [D8](demos.md#d8-key-browser), [component matrix](component-matrix.md).

<a id="fb-0169"></a>

## FB-0169 — ListView: cards only and full-width cards

- **Implemented:**
  - PHP: `modes` and `cardColumns` parameters (appended, nullable) of
    `View::list`, `Registry::view`, `SqlResource::register`; validated by
    `ListViewKind` and sent as `options.modes`/`options.cardColumns`; JSON
    `view.modes` (array) and `view.card_columns` (integer) in
    `WorkspaceConfiguration`.
  - Frontend: `ListKindOptions.modes`/`cardColumns`,
    `ListViewOptions.modes`/`cardColumns` (`api/types.ts`), `ViewDefinition`
    and `WorkspaceHooks` (`components/list/types.ts`); `ListView` validates;
    `Workspace` computes the offered modes (component, else view, else
    table, cards and the offered tiles), builds the `Nézet` items from them
    (none with one), starts with `mode`, else the first, and uses a kept
    mode only when offered; `ResponsiveGrid` caps the card columns.
  - Demo D7: `demo_task_notes` declares `"modes": ["cards"],
    "card_columns": 1` (`tasks.json`), so `Jegyzetek` drops its own
    `mode: "cards"`; `Munka` passes `modes: ["table", "cards"]`, which win
    over the view's.
  - `tests/shell/ui-preferences.mjs` read `mode` as a property since
    `38b1ef3` (it is a method) and failed at HEAD; it now calls `mode()`.

Guides: [cards only and full-width cards](workspaces.md#cards-only-and-full-width-cards), [cards](workspaces.md#cards-record-details-numbering-and-marks), [view selection](workspaces.md#nézetválasztás-és-fejlécjelzések), [uniform card width](workspaces.md#responsive-command-bar-and-uniform-card-width), [ListView](toolkit.md#listview).

<a id="fb-0170"></a>

## FB-0170 — Tree: the initial selection overrode a selection made while the start loaded

- **Implemented:** `NodeTree` (`components/list/RecordTree.ts`) counts
  selection changes; `begin()` compares the count from before the loads.

Guides: [toolkit Tree expansion](toolkit.md#tree-expansion), [changes](toolkit.md#changes).

<a id="fb-0171"></a>

## FB-0171 — Read-only fields in record action forms

- **Implemented:**
  - PHP: `Action` `display` (validated: `Field`s, not secret or password, not
    an input, unique); `SqlResource` `createOnly` (validated: a declared,
    written field, not read-only, computed or an order position, not secret,
    password, grid-editable or bulk); `Workspace::describe()` (the `__form`
    body, now callable from PHP checks) marks `readOnly: true`; JSON
    `storage.create_only`.
  - Frontend: `FieldMetadata.readOnly`, `RecordFormOptions.readOnly`;
    `fields.ts` `shownOnly`, `setShown` and the read-only items; `RecordForm`
    (rendering, validation, `values()`, `setValues`), the list's create and
    update forms (`actions.ts`: not sent, not validated, not in
    `createDefaults`) and the singleton's details form use them.
  - Demo: `Mellékletek` declares `createOnly: ['role']`; the update form shows
    `Szerep` read-only.

Guides: [read-only fields](workspaces.md#read-only-fields), [RecordForm](toolkit.md#recordform), [configuration](configuration.md), [usage](usage.md), [demos](demos.md).

<a id="fb-0172"></a>

## FB-0172 — Collapsible field sections in record forms

- **Decision:**
  - **Declaration on the field:** `Field::$section` (JSON `section`), the
    section's plain-text, translatable label; the fields with the same label
    form one section at the place of the first. The field property is used because `SqlResource` generates its create and update actions, so one
    declaration serves the create, update and details forms, and a field is
    in at most one section by construction (there are no unknown references
    to refuse). Labels: 1–100 characters, no control characters.
  - **Inside the one Form:** a fieldset under a Suite button item; the closed
    state is a CSS class set through the fieldset's `setProperties`, so the
    fields stay rendered and file previews keep their state; values are
    submitted and validated while closed.
  - **State:** closed unless a field holds a value (stored, preset, a file;
    a `default` or an unchecked checkbox does not count); an error in a
    closed section (client or server) opens it and focuses its first
    erroneous field. The open state is not stored.
  - **Accessibility:** a native button in the tab order with `aria-expanded`
    and `aria-controls`; the fieldset is a group named by the button
    (`aria-labelledby`).

- **Implemented:** `Field` `section` (metadata translated), JSON `section`,
  the list column metadata `section` (for the singleton's details form
  without an update right); `fields.ts` `formRows()` and the section binding
  inside `bindFieldTypes()` (refit callback), `FormValidation` reveal hook;
  `form-section.css`; used by `RecordForm`, the list's create and update
  forms and the singleton's details form. Demo: `Mellékletek` gains a second
  stored image `Részletkép` (column `detail`, migrated by the setup) and both
  images form the `Képek` section; `stored-file.spec.cjs` opens it.

Guides: [form sections](workspaces.md#form-sections), [RecordForm](toolkit.md#recordform), [configuration](configuration.md), [usage](usage.md), [demos](demos.md).

<a id="fb-0173"></a>

## FB-0173 — Count fields: related records the actor may list

- **Decision:**
  - Declaration:
    `SqlResource` `counts` (JSON `storage.counts`), `name => {resource,
    match, filters?, on?}` on a declared number field. The count runs through
    the counted resource's own list source like the sub-view count
    (`countBy`): its list ACL predicate, `where`, `countWhere`, tenant and row
    source with the archive policy. A record counts once per row when any
    match field equals the row's key (`on`: another readable field of the
    row).
  - **No misleading 0:** the value is left out when the actor has no `list`
    allow on the counted resource (or a whole-action deny), when it is
    tenant-scoped and no tenant is active, when a match or filter field is
    not queryable for the actor, or when the row's `on` field is not
    readable. A deny on the count field hides it as any field.
  - **Reads:** list rows (one grouped count per page and field: the page's
    values as a derived table joined with an `OR` over the match fields),
    `get` and live snapshots; never input, not in the revision; filtering,
    scoping and sorting by a count are refused (403) and the view's
    `filters`/`sortable` leave it out.
  - **Validation:** the shape at definition; the counted resource (an SQL
    list source), its match fields (scope-only allowed; not secret, long
    text, multiple choice or file; not a count) and filters (the menu
    attention rule, shared as `Registry::filterable`) at `checkViews()`.
  - The tenancy guide is corrected: `computed` SQL receives no tenant.

- **Implemented:** `SqlResource` `counts` (count fields read-only, projected
  as placeholders the actor may read, excluded from the revision),
  `ListSource` `counted()`/`countMatching()` (count fields kept out of its
  filter, scope and sort fields), `Registry::counts()`/`countFields()` and
  their check in `checkViews()`, JSON `storage.counts`. No browser change: a
  count is a number field. Tenant demo: global `Kategóriák` (two levels,
  `tenant_categories`) with `Tételek (alkategóriákkal)` and `Jegyzetek
  (közvetlenül)` over the tenant-scoped `Tételek` (`tenant_items`, archive
  delete, a scope-only computed parent category), which sits beside the
  category tree.

Guides: [count fields](workspaces.md#count-fields), [tenancy](tenancy.md), [configuration](configuration.md), [usage](usage.md), [demos](demos.md#tenant-demo-tenants).

<a id="fb-0174"></a>

## FB-0174 — Reject Strict cookies with OAuth

- **Implemented:** `ApplicationDefinition` rejects any non-null OAuth
  configuration with `sameSite: 'Strict'`, including disabled or unconfigured
  providers. JSON definitions use the same guard. OAuth with the default
  `Lax` policy and `Strict` without OAuth still work.

Guides: [authentication](authentication.md#cookie-samesite), [configuration](configuration.md), [usage](usage.md).

<a id="fb-0175"></a>

## FB-0175 — Shared rows in tenant-scoped resources

- **Decision (tenancy contract change):**
  - Declaration on the scoped resource: `sharedTenant` (the tenant column value
    of the shared rows, usually `''`) and `sharedRoles` (role keys); JSON
    `storage.shared_tenant`, `storage.shared_roles`. Without it nothing changes.
  - The realm of a request (`Registry::realm()`): with an active tenant, its own
    rows and the shared rows are read, its own rows written; without a tenant,
    an actor holding a shared role reads and writes the shared rows only;
    anyone else fails closed as before. The administrator, who works without a
    tenant, gets the shared role. An actor with a tenant stays a tenant actor.
  - With a tenant, every write action on a shared row is refused by the
    executor (403 `A közös adat csak olvasható.`), whatever the rules, also its
    update form, field edits and bulk items; it is left out of the row's
    `_actions` (create stays). No write grant for tenant actors. The tenant
    column stays server-owned, so no row is created with the shared value or
    moved into or out of it by a tenant.
  - Rows carry `_shared: true`. Uniqueness and the manual order scope work per
    realm. The journal records `shared: true` in the detail, with the actor.
  - Not part of it: lookup choices (a scoped `Lookup` still offers the active
    tenant's rows only).

- **Implemented:** `Acl::holds()` (role keys of an actor), `Registry::scopeToTenant()`
  with the shared value and roles, `Registry::realm()`/`tenantReady()`; the
  executor, `views()`, `__form` and `describe()` use the realm;
  `ListSource` reads, `countBy()` (sub-view counts) and `countMatching()`
  (count fields) filter by the realm's values; `SqlResource` `sharedTenant`,
  `sharedRoles` (target, projection with `_shared` and `_actions`, create
  stamp, uniqueness, order scope, audit detail); JSON
  `storage.shared_tenant`/`shared_roles`; the new message in hu/en/de. Tenant
  demo: `Tételek` declares shared rows (two shared items, a `Forrás` column),
  new account `shared@example.test` with the role `shared_editor` and no tenant.

Guides: [tenancy shared rows](tenancy.md#shared-rows), [access and actions](access-and-actions.md#bővítési-határ), [configuration](configuration.md), [usage](usage.md#multi-tenancy), [demos](demos.md#tenant-demo-tenants).

<a id="fb-0176"></a>

## FB-0176 — A collapsed region empty after a tab change on a phone (not reproduced)

- **Decision:** no change without a reproduction: a fix would be speculative.

<a id="fb-0177"></a>

## FB-0177 — Professional form sections, card groups, fitted windows and an icon tree control

- **Implemented:**
  - Frontend: `fields.ts` `formRows` (fixed sections: a fieldset with its
    legend; collapsible ones unchanged in behavior) and `bindSections` (fixed
    ones have no disclosure); `form-section.css` (panels, header bars, the
    fieldset border removed with Suite's specificity);
    `RecordPresentation.ts` `recordFields` (groups, wide long text,
    `cardLines` as `--blade-card-lines`); `admin.css` (groups, the label cap,
    the sticky action row with a `border-image` outset, which paints the
    rule and background to the form's edges without scrollable overflow, and
    the measure selectors); `WindowSizing.ts` `fitWindow(win, maxHeight)`,
    `FIT_MAX_HEIGHT`; `api/services.ts` `openWindow` `maxHeight`;
    `CommandBar` `pinned`; `ResponsiveToolbar` (no menu without unpinned
    items); `RecordTree` (icon buttons). Types: `FieldMetadata` and
    `ColumnMetadata` `sectionCollapsible`, `ColumnMetadata.cardLines`,
    `WindowOptions.maxHeight`, `CommandButton.pinned`.
  - PHP: `Field::$sectionCollapsible`, `Field::sectionMetadata()`,
    `Field::checkSections()` (called by `Registry::registerFields` and
    `Registry::add`), column option `cardLines`/`card_lines` (textarea only,
    0–50, one spelling); `ListViewKind` sends the section with the detail
    fields and `card_lines` as `cardLines`; JSON field
    `section_collapsible`.
  - Demo `Mellékletek`: the title and the role form the fixed `Alapadatok`
    section, `Fájlnév` is in `Képek`, the reason shows six card lines, and
    the view shows one card per row (`cardColumns: 1`).

Guides: [form sections](workspaces.md#form-sections), [card groups](workspaces.md#card-groups), [long text in cards](workspaces.md#long-text-in-cards), [window sizing](workspaces.md#window-sizing), [Tree expansion](toolkit.md#tree-expansion).

<a id="fb-0178"></a>

## FB-0178 — Accordion form sections beside the framed panels

- **Implemented:**
  - PHP: `Action::$formSections`, `Action::FORM_SECTIONS` (refuses another
    value); `SqlResource::register` `formSections`; `Workspace::describe`
    adds `formSections`; JSON `operations.form_sections` and an action's
    `form_sections` (`WorkspaceConfiguration`).
  - Frontend: `fields.ts` `formRows(..., mode)` (accordion rows: the header
    button with the cell header classes, a fixed section's legend) and
    `bindAccordion` (state, `aria-*`, keys, error reveal); `form-section.css`
    (stack, header, geometry, measuring rules); `admin.css` (the
    `Accordion` chevron rules shared); `blade-chrome.css` (the Blade header
    chrome and emboss on the fixed legend and the button title);
    `WindowSizing.ts` `fitWindow` (state-independent height); `actions.ts`,
    `RecordForm.ts`, `Workspace.ts` pass `formSections`. Types:
    `FormSections`, `FormDescription.formSections`.
  - Demo: `Kapcsolatok` ([contacts.php](../examples/demo-app/contacts.php),
    group `Feature demó`): `Alapadatok` fixed, `Elérhetőség` (a required
    e-mail), `Cím`, `Beállítások`; `formSections: 'accordion'`; the schema
    step in `setup-workspace.php`, rights for the demo account and the
    reader. `Mellékletek` keeps the panels.

Guides: [accordion form sections](workspaces.md#form-accordion), [form sections](workspaces.md#form-sections), [RecordForm](toolkit.md#recordform), [changes](toolkit.md#changes), [configuration](configuration.md).

<a id="fb-0179"></a>

## FB-0179 — MySQL connection collation and role-rule lookup

- **Implemented:**
  - `Acl::rules` reads the actor's role ids first and binds them as string
    parameters, so the rule lookup no longer depends on the connection
    collation.
  - `Database::connect` accepts an optional `collation` of the configured
    charset and applies it with `SET NAMES charset COLLATE collation`.
    `fromEnvironment` reads an optional `PREFIX_COLLATION`, and JSON
    accepts an optional `database.collation`. An invalid value, or one that
    does not belong to the charset, is rejected before connecting.
  - The connection-collation prerequisite and the case-insensitive key
    limit are documented.

Guides: [shell](shell.md#database-connection), [configuration](configuration.md).

<a id="fb-0180"></a>

## FB-0180 — Delegated access through application-owned relationship tables

- **Implemented:**
  - **Declaration:** `Blade\Feature\Delegation(read, write)`,
    `DelegationLink(table, objectColumn, actorColumn, resourceColumn, via)`
    and `DelegationVia(table, key, parentColumn)`, passed as the
    `SqlResource` `delegation` argument; JSON `storage.delegation`.
  - **Binding:** `SqlResource::register()` validates the resource columns
    and binds a `DelegationScope` (`Registry::delegate()`/`delegation()`),
    which `Acl` reads through its new provider argument.
  - **Rule evaluation:** `Acl::allows()`/`fieldAllowed()` evaluate
    `delegated` against the stored row or a `destination`, and `deferred`
    lets a create wait for its final values. `Acl::predicate()` correlates
    with an explicit `qualifier`, which `ListSource` and `Lookup` pass.
  - **Executor:** `Executor::permit()` re-resolves the ACL object through
    the resource's resolver and returns whether the decision is deferred.
    `SqlResource` checks create/update on the final row, including every
    written field, and authorizes renumbered peers of `move`.
  - **Administration:** offers `Delegált objektum` and refuses it for a
    resource without a declaration.
  - **Fail closed:** a deny with an unknown scope now denies.

Guides: [access and actions](access-and-actions.md#delegated-access), [configuration](configuration.md), [usage](usage.md), [toolkit](toolkit.md), [demos](demos.md).

<a id="fb-0181"></a>

## FB-0181 — Section-filling text and file fields in accordion forms

Guides: [section-filling fields](workspaces.md#form-section-fill), [RecordForm](toolkit.md#recordform), [configuration](configuration.md), [demos](demos.md).

<a id="fb-0182"></a>

## FB-0182 — Uploader double divider and empty window after a cancelled form

- **Implemented:** removed the command cell's border; the shared action row
  owns the only divider. `Uploader.paintSummary()` updates the UI only while
  visible, and `afterShow` refreshes the summary and clear button from the
  current queue. Transfers, queue data, events and the shell indicator keep
  updating while the window is closed.

Guides: [uploader](uploader.md).

<a id="fb-0183"></a>

## FB-0183 — Distinct control appearance for read-only form fields

- **Implemented:** the shared field factory marks a read-only field's Suite
  item `blade-field--readonly`, keeping its existing classes. Its native
  input (including textareas and the displayed choice or file name) has a
  flat, muted theme background, a transparent border and no inset shadow.
  The normal text colour, keyboard focus ring, selection and copying remain.
  The marker follows the semantic field state: an editable file field's
  internally readonly name input keeps its editable appearance. Registered
  field types keep their controls and receive the same marker.

Guides: [read-only fields](workspaces.md#read-only-fields), [usage](usage.md).

<a id="fb-0184"></a>

## FB-0184 — Cancellable activation of a composed list

- **Implemented:** `ListView.activate` adds `preventDefault()`. Calling it
  synchronously skips Workspace's default dispatch; no listener or no
  cancellation preserves existing behavior. All listeners still receive the
  row and resolved target. No server or toolbar behavior changes. The
  readings dashboard keeps its selection in its existing summary this way.

Guides: [ListView](toolkit.md#listview), [activation](workspaces.md#activation), [usage](usage.md), [feature demo](demos.md).

<a id="fb-0185"></a>

## FB-0185 — Loading and empty states for regions and lists

Give lists and layout regions shared loading and empty states with appropriate busy semantics.

Guides: [toolkit](toolkit.md#loading-and-empty-states), [usage](usage.md), [demos](demos.md#d8-key-browser), [development](development.md).

<a id="fb-0186"></a>

## FB-0186 — Equal-height section groups and project column sizing with CSS

- **Implemented:** the common card/details grid stretches its groups within
  each row. Inherited CSS properties `--blade-record-group-min-width`
  (automatic columns, default `240px`) and `--blade-record-group-columns`
  (an explicit Grid track list) are supported in the project's stylesheet.
  The record is an inline-size query container; below 492 px of content
  width its section grid has one column. The feature demo's own
  `record-groups.css` sets `minmax(0, 1fr) minmax(0, 2fr)`.

Guides: [section columns](workspaces.md#card-group-columns), [ListView](toolkit.md#listview), [usage](usage.md), [demos](demos.md).

<a id="fb-0187"></a>

## FB-0187 — Theme motion: accordion and layout regions ease on open and close

- **Implemented:** `Motion.ts` (`resizeMotion`, `collapseMotion`,
  `finishMotion`) eases a region from its old to its new size in 200 ms.
  It covers `Accordion` sections (also a `PageLayout` `accordion` branch),
  `collapsable` Layout cells of `PageLayout`, list workspaces and tree
  navigation (header click, keys, `collapse`/`expand`, the list's form
  panel), accordion form sections and, the folders of every Suite Tree (`treeMotion` in `TreeAdapter`:
  `RecordTree`, tree navigation, the file manager; children loaded on
  opening ease in too; a bulk change such as `expandAll` stays instant; a
  motion inside a running one ends the enclosing one first). The theme
  switches it on with
  `--blade-motion-duration` (`200ms` on `[data-blade-theme|="blade"]`);
  `prefers-reduced-motion: reduce` sets it to `0s` and now also stops
  Blade's decorative header corners and sheen. A closing accordion section
  shows its content until it is shut; a second toggle mid-motion continues
  from the current size; state, events, ARIA and focus change at once.

- **Scope and limits:** theme presentation only; no PHP/JSON options,
  events or ACL. Light, dark and skins on those bases have no motion (a skin
  may set the variable). A collapsing Suite Layout cell shrinks with its
  header only (Suite leaves its content out). Not animated: tabs, windows,
  popups, panel-mode form sections (their window refits at once) and
  expanded grid rows. Browser tests that read a region's size
  right after a toggle in Blade must wait for it to settle (Changes M66).

Guides: [theme motion](shell.md#theme-motion), [Accordion](toolkit.md#accordion), [PageLayout](toolkit.md#pagelayout-collapse), [accordion form sections](workspaces.md#form-accordion), [usage](usage.md).

<a id="fb-0188"></a>

## FB-0188 — Fixed accordion form headers stay above scrolling fields

- **Implemented:** `form-section.css` makes the fixed fieldset a column:
  its native legend keeps its height and only the content below it scrolls.
  A fixed section retains its natural height when it fits and can shrink
  when constrained. The field inset moves to that content (16 px framed,
  20 px flush); a section-filling textarea remains edge to edge. No new
  PHP/JSON option, DOM rewriting, event or server/validation change.

Guides: [accordion forms](workspaces.md#form-accordion), [usage](usage.md), [toolkit](toolkit.md).

<a id="fb-0189"></a>

## FB-0189 — Card and tile hover without moving the card

- **Implemented:** `themes/character.css` no longer moves a hovered card or
  tile. Its edge lights up instead: the border colour changes (same width),
  an outer 1 px ring and the theme's `--blade-lift-shadow` are drawn with
  `box-shadow` outside the layout, and one light sweep crosses the surface on
  a `::before` overlay (`pointer-events: none`), above the content without
  touching it. New token `--blade-card-hover-edge`: brand blue at 45 % on
  `light`/`dark`, the theme's `--blade-hover-ring` (gold in Blade, cyan in
  Blade Night). The cursor (selected) and the focused card keep their own
  rings under the pointer; the hovered card is raised in the stacking order
  only (`z-index`), so its halo is not covered by its neighbours.
  `prefers-reduced-motion: reduce` turns the sweep off.

- **Scope and limits:** theme presentation only; no options, events or ACL.
  Cards and tiles of the list views; grid rows keep their 1 px hover
  rise. A skin may override `--blade-card-hover-edge`.

Guides: [61ade character](shell.md#61ade-character), [toolkit](toolkit.md).

<a id="fb-0190"></a>

## FB-0190 — Focus the end of an accordion section's text on opening

- **Implemented:** the shared form section binding focuses a section-filling
  textarea on a user opening its header by click, Enter or Space, with the
  selection collapsed at the value's end and its last line in view. Both
  `accordion` and `accordion-multiple` use this, including an empty value.
  Focus follows the opening redraw, without waiting for theme motion. An
  aborted form, a section closed again, or focus already moved away from
  its header cancels the pending focus. Closing, initial focus and validation
  error reveal keep their existing behavior. No new option, event, server
  operation or authorization/validation change.

Guides: [section-filling fields](workspaces.md#form-section-fill), [usage](usage.md), [feature demo](demos.md).

<a id="fb-0191"></a>

## FB-0191 — Tree control in the list's command row, no scrollbar over it

Guides: [Tree expansion](toolkit.md#tree-expansion), [CommandBar](toolkit.md#commandbar), [tree navigation](workspaces.md#tree-navigation), [usage](usage.md).

<a id="fb-0192"></a>

## FB-0192 — No filename search control for static image columns

- **Implementation:** `ListViewKind` derives offered filters from the effective
  column presentation, including field declarations and view overrides. Static
  images offer no header, panel or cards/tiles dialog filter. Ordinary text,
  option and media-class filters keep their controls. Existing programmatic
  filename queries remain supported; no query/ACL contract changes.

Guides: [header filters](workspaces.md#integrated-grid-header-filters), [usage](usage.md#virtuális-fájlkezelő).

<a id="fb-0193"></a>

## FB-0193 — Tree rows like grid rows, optional stripes and classic lines

- **Decision and implementation:**
  - `tree.css` (imported by `TreeAdapter`, so every Suite Tree of 61ade gets
    it): rows 40 px (`--blade-tree-row-height`), one line with an ellipsis.
  - Stripes: `TreeAdapter` marks every second displayed row
    `data-blade-alternate` after each render (a `MutationObserver` on the
    tree's root; rows under a closed folder do not count, also while the
    theme motion closes it). An attribute rather than a class, because Suite
    rewrites a row's class when it patches it. The colour is the grid's
    `--blade-row-alternate`, so trees stripe exactly in the themes where grids
    do; hover, focus and selection draw over it.
  - Lines: pure CSS on Suite's markup. Each nested `li::after` draws the
    vertical dotted line from its parent's toggle centre down its subtree
    (to its own middle for the last child) and the horizontal stub to its box
    or icon; an open box continues the line down to its first child. The box
    replaces the arrow glyph on the same toggle element (11 px, dashed border,
    `+`/`−` drawn with gradients), so clicks, keys and `aria-expanded` are
    unchanged.
  - Options: `TreeOptions.striped` / `lines` (default `true`, non-boolean
    `TypeError`), `Registry::tree(..., striped:, lines:)`, JSON
    `tree.striped` / `tree.lines` (configuration shape check),
    `TreeMetadata.striped` / `lines` sent only when `false`. One `lines`
    switch covers lines and boxes: they are one look, and without lines
    Suite's arrow stays.
  - Guides: [Tree presentation](toolkit.md#tree-presentation),
    [tree navigation](workspaces.md#tree-navigation), [usage](usage.md), the
    61ade-ui skill; migration M70.

Guides: [Tree presentation](toolkit.md#tree-presentation), [tree navigation](workspaces.md#tree-navigation), [usage](usage.md).

<a id="fb-0194"></a>

## FB-0194 — Window title: keep the end visible when it does not fit

- **Decision:** `WindowOptions.titleOverflow` `"end"` (default, unchanged for
  existing windows) or `"start"`, and `WindowOptions.titlePrefix`, plain text
  that is never cut, in either mode; `setTitle` replaces only the title after
  it. The accessible name and tooltip are `<titlePrefix> <title>`.
  Right-to-left text is isolated and stays on one line, but `"start"` is not
  a right-to-left layout.

- **Implementation:** `openWindow` (`api/services.ts`) gives a shaped title
  (`"start"` or a prefix) to the header's Suite title item as HTML: a prefix
  span that keeps its width and the rest, one line with `text-overflow:
  ellipsis`, for `"start"` `direction: rtl` around an isolated `<bdi>`, so
  the cut and the `…` fall at its start. The item fills the row up to the
  close button (the header's spacer is left out). A `ResizeObserver` on the
  window sets the tooltip only while the title is cut. `setTitle` updates the
  dialog's `aria-label` in every mode. The feature demo's playlist `Naptár…`
  window uses it (`Nap választása: <view> / <day>`).

Guides: [window title](toolkit.md#window-title), [usage](usage.md), [demos](demos.md), [development](development.md#focused-task-groups).

<a id="fb-0195"></a>

## FB-0195 — Empty-valued select filters: no filter versus the empty value

- **Implementation:** a key present in the list's filters is a condition, an
  absent key none. `Workspace.setFilter` keeps `""` only for a select filter
  that declares an empty option (text, number, checkbox and other selects
  treat it as no filter); the initial, preset and `setFilters` paths and the
  saved preferences follow the same rule. `GridHeaders` gives the empty option
  its own picker item (`blade-filter-empty`), reports `Mind`, a cleared
  control or an empty text as no condition, and restores no condition with
  `clear` (ignoring the change events of its own writes) instead of
  `setValue("")`. `ListFilters.setValue` maps no condition to `Bármely` and
  `""` to `eq:`. At the top of a hierarchy (shared sub-view) a user filter on
  the parent field replaces the implicit `scope {parent, ""}`, which the
  server refuses beside a filter on the same field, and inside another record
  it takes precedence over the implied `parent: ""` filter; without such a
  filter the scoping is unchanged. No server or protocol change.

Guides: [header filters](workspaces.md#integrated-grid-header-filters), [hierarchy sub-views](workspaces.md#sub-views), [ListView](toolkit.md#listview).

<a id="fb-0196"></a>

## FB-0196 — Multi-column form layout

Guides: [form rows](workspaces.md#form-rows), [RecordForm](toolkit.md#recordform), [usage](usage.md), [demos](demos.md), [development](development.md#focused-task-groups).

<a id="fb-0197"></a>

## FB-0197 — Align the UI skill name and current guidance

Guides: [Tree contract](toolkit.md#tree).

<a id="fb-0198"></a>

## FB-0198 — Inherited project skins and family consistency assessment

- **Decision:** a project appearance is a scoped delta over an explicit
  `blade`/`blade-night` or `light`/`dark` base. Generic is the family name for
  light/dark, not another API value. A project-named child `Skin` is supported;
  a standalone replacement theme or copied framework/vendor stylesheet is
  outside the authoring contract. Native controls and the shell's theme
  application remain inherited. No runtime signature/default changes.

Guides: [family contract and assessment](skinning.md), [skin API](shell.md#application-skins), [usage](usage.md).

<a id="fb-0199"></a>

## FB-0199 — Menu-row application command and long-lived work window

Support registered menu-row application commands and long-lived non-modal windows through the public toolkit.

Guides: [D9](demos.md#d9-workbench), [menu commands](shell.md#menu-commands), [long-lived windows](toolkit.md#long-lived-windows), [registries](toolkit.md#registries), [usage](usage.md).

<a id="fb-0200"></a>

## FB-0200 — No automatic view guide over a long-lived window

- **Implementation:** `openWindow` keeps the set of open non-modal windows
  (`nonModalOpen(except?)`, internal); `AdminShell` checks it, excluding its
  own guide window, before the automatic `showGuide`. No public API or
  configuration change. Below 768 px the full-screen work window covers the
  top row, so `Útmutató` (in `Beállítások`) is reachable after it closes,
  which was already the case for every control behind it.

Guides: [view guide](workspaces.md#view-guide), [long-lived windows](toolkit.md#long-lived-windows), [usage](usage.md).

<a id="fb-0201"></a>

## FB-0201 — Modal window focus, Escape under a project popup, redraw after a window closes

Guides: [modal windows](toolkit.md#modal-windows), [long-lived windows](toolkit.md#long-lived-windows), [dialogs](dialogs.md#billentyűzet-és-fókusz), [usage](usage.md), [development](development.md#focused-task-groups).

<a id="fb-0202"></a>

## FB-0202 — Popup menu at any button: headings, checked entries, scrolling

- **Implementation:** `PopupMenu.ts` over Suite's `ContextMenu`. Suite already
  draws `menuitemradio`/`aria-checked` for toggles in a `group`,
  non-focusable `customHTML` rows (the headings) and the arrow, Home/End and
  Tab keys. The detail is escaped text in the entry's own markup: Suite's
  `hotkey` slot would register the text as a keyboard shortcut (a review found
  that a detail without an ASCII word throws in Suite's key parser and
  `Ctrl+D` became a live shortcut). The menu uses `navigationType: "click"`,
  so the pointer leaving it does not close it. Suite's radio bookkeeping
  (`_groups`) is seeded at each opening because Suite rebuilds it only
  100 ms after a change and its click handler would throw on an early pick.
  A heading click neither picks nor closes, and one popup menu is open at a
  time. 61ade adds the
  anchor's `aria-haspopup`/`aria-expanded` and its keys (ArrowDown/ArrowUp,
  Enter/Space for a non-native button). It also moves the focus into the menu
  (the checked entry) and back to the anchor after a pick, Escape or Tab, which
  Suite does only for its own bar's buttons. Escape is taken in the document's
  capture phase, before a window or dialog. The menu list gets its accessible
  name from the root item. Its open state is tracked by the subclass, because
  after a pick Suite's context menu repaints and sets `_popupActive` again
  without a popup on the screen. `popup-menu.css`: above windows, at most
  `min(28rem, 100vw − 16px)` wide, `27rem` (about 12 entries) or the room
  beside the anchor high (`--blade-popup-menu-space`), headings, the check
  mark's empty slot, a cut label and detail. Types `PopupMenu*` in
  `admin.d.ts`; `Nincs választható elem.` in hu/en/de. Coordinated with the
  modal-window work of [FB-0201](#fb-0201): a popup appended after a modal
  window stays outside its `inert` page, and its Escape handler keeps leaving
  an open `.dhx_menu` alone.

Guides: [D9](demos.md#d9-workbench), [popup menu](toolkit.md#popup-menu), [usage](usage.md).

<a id="fb-0203"></a>

## FB-0203 — Shared Bootstrap Icons catalog and migration of existing icons

Guides: [icons](icons.md), [usage](usage.md#icons), [workspaces](workspaces.md#bulk-actions-and-icons), [toolkit](toolkit.md#registries), [demo](demos.md).

<a id="fb-0204"></a>

## FB-0204 — View availability per tenant or runtime state

Allow view availability to depend on tenant or runtime state while keeping server authorization mandatory.

Guides: [view availability](workspaces.md#view-availability), [views](toolkit.md#menu-less-views), [migration table](toolkit.md#migration), [tenancy limits](tenancy.md#limits-and-later-stages), [tenant demo](demos.md#tenant-demo-tenants).

<a id="fb-0205"></a>

## FB-0205 — Centre the whole menu-command group within its pill

Guides: [menu commands](shell.md#menu-commands), [icons](icons.md), [usage](usage.md#icons).

<a id="fb-0206"></a>

## FB-0206 — Opt-in captions for list action commands

- **Implementation:** list action metadata chooses `commandLabel` before the
  existing caption fallback. The normal presentation translator resolves it
  into the existing `label`; there is no frontend or wire-format addition.
  The command remains `update`, its fields, handlers, ACL, audit and revision
  paths are unchanged. The tenant demo now declares one settings command over
  its SQL adapter's existing form and single-field save paths. Its English
  catalogue translates the service title and guide too.

Guides: [action command captions](workspaces.md#action-command-label), [ListView](toolkit.md#listview), [JSON actions](configuration.md), [migration table](toolkit.md#migration).

<a id="fb-0207"></a>

## FB-0207 — Read-only text difference component (`TextDiff`)

Provide a read-only TextDiff component for comparing two text values with keyboard navigation.

Guides: [TextDiff](toolkit.md#textdiff), [components](toolkit.md#components), [changes](toolkit.md#changes), [migration table](toolkit.md#migration), [usage](usage.md).

<a id="fb-0210"></a>

## FB-0210 — Continue the tab divider across the unused header width

Guides: [Tabs presentation](toolkit.md#tabs).

<a id="fb-0208"></a>

## FB-0208 — Tenant-scoped calendars and read-only overlay events

- **Implementation:** `CalendarDefinition` `tenantScoped` (the definition
  scopes the resource to the tenant; every query and write filters by
  `tenant_id`; `occurrences()` takes the tenant) and `overlay` (validated
  items appended to `events` as `overlay:<id>`, `readonly`, `tone`).
  `install()` adds the nullable column and the `blade_calendar_tenant` index
  to an existing table. `CalendarView` refuses the form and dragging for a
  read-only event and colours it by its `tone`
  (`blade-calendar-event--readonly`).

Guides: [calendar](calendar.md#tenant-scoped-calendars), [migration table](toolkit.md#migration).

<a id="fb-0209"></a>

## FB-0209 — Calendar windows close without a page error

Calendar form cancellation must close its window without destroying it during a native Form click dispatch.

Guides: [calendar](calendar.md).

## FB-0211 — Frame sources for the signed-in shell

- **Implementation:** `ApplicationDefinition::$frameSources` (JSON
  `application.frame_sources`), validated HTTPS origins with an optional
  `*.` subdomain wildcard; `frameSource()` gives `'self'` plus the sources and
  the shell CSP adds `frame-src` only when some are declared. Guide:
  [frame sources](shell.md#frame-sources),
  [configuration](configuration.md).

Guides: [frame sources](shell.md#frame-sources), [configuration](configuration.md).

<a id="fb-0212"></a>

## FB-0212 — Value tones, emphasized records and an attention label

Guides: [value tones and emphasized records](workspaces.md#value-tones), [field presentation](field-presentation.md), [menu attention](shell.md#menu-attention), [configuration](configuration.md), [usage](usage.md).

<a id="fb-0213"></a>

## FB-0213 — Page and tab commands attach directly above their content

Guides: [toolkit recipe](toolkit.md#page-command-bars), [usage](usage.md#toolkit-and-project-modules).

<a id="fb-0214"></a>

## FB-0214 — SQL keyword field names in list queries

<a id="fb-0215"></a>

## FB-0215 — Free-text search only when justified

- **Scope:** guidance and demo only; the framework does not reject a declared
  `search`, because whether the visible fields suffice is a design judgement.

Guides: [workspaces](workspaces.md#search-justification), [configuration](configuration.md).

<a id="fb-0216"></a>

## FB-0216 — Icons are mandatory and chosen for their meaning

- **Implemented:** `ApplicationDefinition::menuGroupIcons` / JSON
  `application.menu_group_icons` and `Registry::groupIcon()` give a declared
  view group its menu icon ([group icons](shell.md#menu-group-icons)). The
  bootstrap sends `menuGroupIcons` for offered groups by translated label, and
  the shell falls back to `bi-folder2-open`. `SqlResource::register()` accepts
  `icon`. The framework's administration views now carry distinct icons:
  `Felhasználók` `bi-people`, `Tenantok` `bi-buildings`, `Hozzáférések`
  `bi-person-check`, `Szerepkörök` `bi-shield-lock`, `Szerepkör-tagságok`
  `bi-person-badge`, `Szerepkör-jogosultságok` `bi-shield-check`,
  `Egyedi jogosultságok` `bi-person-gear`, and the `Adminisztráció` group
  `bi-sliders`. There is no new event, action, permission or audit entry.

Guides: [icon choice](icons.md#icon-choice), [group icons](shell.md#menu-group-icons).

<a id="fb-0217"></a>

## FB-0217 — A location bar below the main menu

- **Accepted expectation:** a shell-owned location bar directly below the
  menu row on every page view, with the default path (menu path, record
  title) and the view's own levels through `ViewHost.setLocation`, collapsing
  middle levels into `…`, a phone form, accessible names in the catalogues
  and an optional browser title.

- **Contract:** [location bar](shell.md#location-bar);
  `ViewHost.setLocation` and `LocationSegment` ([toolkit](toolkit.md#views),
  `api/types.ts`); the record view's `recordTitle` (PHP `View`, JSON
  `views.<id>.record_title`, [record views](toolkit.md#record-views),
  [configuration](configuration.md)). Bootstrap views may carry
  `recordTitle`. There is no new action, permission, event or audit entry:
  the record title is the row the record view's `get` already resolved, and
  a `target` segment is drawn as a link only when the actor is offered it
  (navigation, not authorization).

Guides: [location bar](shell.md#location-bar), [toolkit](toolkit.md#views), [record views](toolkit.md#record-views), [configuration](configuration.md), [D7](demos.md#d7-task-page).

<a id="fb-0218"></a>

## FB-0218 — A sized image and a long-text card in the record details

Superseded by [FB-0223](#fb-0223).

Guides: [sized image in the details](workspaces.md#details-media-width), [D11 `Médialapok`](demos.md#d11-media-sheets).

<a id="fb-0219"></a>

## FB-0219 — A sub-view card button that opens the child page

- **Accepted expectation:** with a `page` activation the card and tile button
  opens the child's page filtered to the record, the same navigation as the
  activation (a history entry, an ordinary filter); Back returns to the
  parent with its position kept, at 1366 and 390 px, with the keyboard
  (Enter on the focused button) as well. Without it nothing changes. The
  button's accessible name stays `‹child title› (n)` and its
  `aria-description` names the target as the activation does.

- **Contract:** no new option: the button follows the record's resolved
  activation, so `activate: 'page'` and a map entry that resolves to `page`
  for that record both take it; where the page is not offered (child view or
  its field filter not offered, a sub-view window, a hierarchy) the window
  opens as before. The button then carries `aria-description`
  "Megnyitás: ‹child title›" (English "Opens: …", the existing catalogue key)
  instead of `aria-haspopup="dialog"`, and the `bi-box-arrow-in-right` icon
  instead of `bi-arrows-angle-expand`. A list left through a `page`
  navigation keeps its visible record and offset, cursor record and sort in
  its own history entry (`history.state`, key `blade.list.return`) and shows
  them again on Back or a reload of that entry; a record beyond the first
  100 loads from its own position and the rows above follow
  ([activation](workspaces.md#activation), [sub-views](workspaces.md#sub-views),
  migration M86). The table's toggle preview and the toolbar's full-view
  command keep their window. No new action, permission, event or catalogue key.

- **Implemented:** `Workspace.ts` (`openPage` shared by the activation and the
  button, the kept state, its first-load restore with an anchored window),
  `ResponsiveGrid.ts` (`SubViewOptions.page`, the button's description and
  icon). Docs: [workspaces](workspaces.md#activation), the 61ade-ui skill.

Guides: [activation](workspaces.md#activation), [sub-views](workspaces.md#sub-views).

<a id="fb-0220"></a>

## FB-0220 — A record page whose location bar starts at its group

Superseded by [FB-0224](#fb-0224).

Guides: [location bar](shell.md#location-bar), [record views](toolkit.md#record-views), [configuration](configuration.md).

<a id="fb-0221"></a>

## FB-0221 — A frameless split inside a tab, and a long text read as a page

Superseded by [FB-0222](#fb-0222).

Guides: [`inner`](toolkit.md#pagelayout-inner), [D11 preview](demos.md#d11-media-sheets).

<a id="fb-0222"></a>

## FB-0222 — An inner layout in a PageLayout region (owner correction of FB-0221)

Provide a reusable inner layout within a PageLayout region. This supersedes the screen-shaped design of FB-0221.

Guides: [inner layout](toolkit.md#pagelayout-inner), [D12 `Médiaböngésző`](demos.md#d12-media-browser).

<a id="fb-0223"></a>

## FB-0223 — A field subset in RecordDetails and one rule for a media field alone in a section (owner correction of FB-0218)

Support a declared field subset in RecordDetails and a shared media-alone section rule. This supersedes the earlier special-purpose details design in FB-0218.

Guides: [media alone in a section](workspaces.md#details-media-alone), [sized image in the details](workspaces.md#details-media-width), [D11](demos.md#d11-media-sheets), [D12](demos.md#d12-media-browser), [usage](usage.md).

<a id="fb-0224"></a>

## FB-0224 — A record page under its parent record (owner correction of FB-0220)

- **Accepted expectation:** a record view declares its parent relation. The
  bar reads: the root of the parent chain's menu path › each parent record's
  title as a link to its record page › this record's level › the view's
  `setLocation` segments. The chain is derived from row data, so it holds
  after a reload, a direct link and Back/Forward. A parent the actor may not
  read is left out, and the chain stops there without an error dialog. The
  menu marker follows the root. Without `parent` nothing changes.
  `location` is removed.

- **Contract:** `parent` on a record view: PHP
  `View(parent: ['field' => f, 'view' => v])`, JSON
  `views.<id>.parent: {"field": f, "view": v}`, bootstrap and
  `ViewDefinition.parent?: {field, view}`
  ([parent records](shell.md#location-bar-parent),
  [record views](toolkit.md#record-views),
  [configuration](configuration.md), migration M90). Definition-time checks,
  each failure an `InvalidArgumentException`:
  - `parent` exists only on a record view, with exactly `field` and `view`
    (JSON also takes `description`, as every configuration object, and does
    not pass it on);
  - `field` is a non-secret `select`, `number` or `text` field of the record
    resource, the contract of a sub-view's reference field
    (`Registry::subview()`);
  - `view` is a record view (`checkViews()`, once every view is declared; a
    self-reference is allowed); its `record` resource is the parent's. A
    `select` whose options are a `Lookup` (JSON `options_lookup`, PHP
    `$lookup->options(...)`) must be a `Lookup` of that resource, an extra
    consistency check through the new `Field::references()` (`Lookup::$resource`
    is now public).

  Removed: PHP `View::$location` , the JSON key `location`,
  the bootstrap key and `ViewDefinition.location`. No new action,
  permission, event or framework catalogue key. The parent rows come from
  the parent resource's existing, ACL-checked `get`.

Guides: [parent records](shell.md#location-bar-parent), [record views](toolkit.md#record-views), [configuration](configuration.md), [D7](demos.md#d7-task-page), [usage](usage.md).

<a id="fb-0225"></a>

## FB-0225 — The default fitted-window height per application, and a placement for a long text outside the sections

- **Accepted expectation:** the default maximum height of fitted windows is
  configurable per application, 800 px staying the fallback and a window's
  own `maxHeight` still winning; a long text outside the sections can be
  declared at the end (today's behaviour), as a row at its declaration place,
  or as a group of its own at that place. Without the new declarations
  nothing changes.

- **Decisions:**
  - Why 800 px stays the fallback: it keeps a form window readable on
    1366 × 768 and 1080p screens without a full-height wall of fields; it is
    now documented with how to change it.
  - The bootstrap key is set on application pages only (inside the actor
    branch, beside `modules`): sign-in windows are not fitted by `fitWindow`.
  - The browser accepts the bootstrap value only as an integer 320–4000
    (`configureWindowSizing`) and otherwise keeps 800; the server already
    validates it.
  - "Without its own display" is decided at definition time as "no
    `column.presentation` and no `editor`": the server cannot know whether a
    project field type registers a `display`, so an `editor` field is refused
    rather than accepted with a placement the browser might ignore.
  - A `group` text is rendered as a framed `section` with the group title and
    the value alone (`.blade-grid-card__field--bare`, value element
    `.blade-grid-card__value`), not a `dl` without a `dt`, following the
    media-alone group of [FB-0223](#fb-0223); it keeps the field's card lines,
    whole text in the details, card editing and the emphasized-record weight.
    A `row` text is the labelled `dl.blade-record-wide` inside the group grid
    (`blade-record-wide--row`, `grid-column: 1 / -1`).
  - Demo: `Mellékletek`'s reason declares `group` (between `Alapadatok` and
    `Képek`; with the demo's 1:2 columns `Alapadatok` and the reason share
    the first row, `Képek` the next); D11's brief keeps `end`, so D11 and D12
    are unchanged. The feature demo declares no `windowMaxHeight`: any value
    other than 800 changes the cap its window specs check (a higher one makes
    `Mellékletek`'s create window with `Képek` open taller than the asserted
    800 px at the specs' 900 px viewport; a lower one changes every fitted
    window of the demo). The capability is shown through a fixture bootstrap
    in `record-forms.spec.cjs` and the PHP checks instead.

Guides: [window sizing](workspaces.md#window-sizing), [long-text placement](workspaces.md#long-text-placement), [configuration](configuration.md), [toolkit](toolkit.md), [usage](usage.md).

<a id="fb-0226"></a>

## FB-0226 — A location path entirely of the page's own

- **Accepted expectation:** a page can replace the whole location bar with its
  own levels, each with a link, a button or plain text; a link can lead to a
  filtered list. The automatic path stays the default.

- **Contract:** `ViewHost.setLocation(segments, {from: "page" | "root"})`
  (default `"page"`; anything else throws `TypeError`); `LocationSegment`
  `target.filters` (field → text value, at most 20, field names
  `[a-z][a-z0-9_]*`, values up to 255 characters; ignored for a record view;
  else `TypeError`) ([own path](shell.md#location-bar-own-path), migration M90).
  No new action, permission or catalogue key; a target the actor is not offered
  stays plain text as before.

- **Decisions:** the menu marker keeps following the menu source (the bar
  shows a place, the marker the menu entry); the document title follows the
  last segment as for every path; the first segment gets the view's icon so the
  bar keeps its leading icon; an empty array with `from: "root"` returns to the
  automatic path, as `setLocation([])` does (kept and documented after review;
  superseded by [FB-0236](#fb-0236): it now leaves the bar empty).

- **Implemented:** `AdminShell.ts` (`Mounted.whole`, `locate()`,
  `places()` filters, `setLocation` option), `api/types.ts`; feature demo
  D12 `Médiaböngésző` sets `Médialapok › ‹channel› › ‹sheet›` with the
  channel linking to the filtered list (`media-browser.ts`).

Guides: [own path](shell.md#location-bar-own-path).

<a id="fb-0227"></a>

## FB-0227 — A header with a count for a region of the inner layout

- **Accepted expectation:** an inner region can show an optional one-line
  frameless header: a title with an optional count badge, a line below it,
  and content that scrolls on its own below that. The host changes the count
  and the title later without rebuilding the layout. Regions without a
  header stay as they were.

- **Contract:** `PageRegion.header` (1–150 characters, plain text, escaped,
  translated like other declared headers) and `count` (a non-negative
  integer) on a region of an `inner` layout;
  `PageLayout.header(id, {label?, count?})`, where `count: null` hides the
  badge ([inner region header](toolkit.md#pagelayout-inner-header),
  migration M92). Several cases throw `TypeError`:
  - a `count` without `header`, or outside an inner layout;
  - a `header` on a branch of an inner layout, or an empty header;
  - an invalid change passed to `header`.

  An id without a header, a region holding an inner layout and an
  undeclared id throw `Error`. `cell`, `attach`, `placeholder` and kept sizes
  address the content below the header; `height` and `minHeight` are the
  whole region's. No new action, permission, event or catalogue key: the
  spoken count reuses `{count} elem` (English `{count} items`, German
  `{count} Elemente`).

Guides: [inner layout](toolkit.md#pagelayout-inner), [inner region header](toolkit.md#pagelayout-inner-header), [usage](usage.md), [test map](development.md).

<a id="fb-0228"></a>

## FB-0228 — A component destroyed after the Layout that holds it threw

- **Implemented:** `Lifecycle.end()` detaches a Layout cell only while the
  cell still has its `config`; a dead cell is left alone. Suite's Layout
  `destructor` is guarded by `config`, so the component's own second
  `destructor()` is a no-op. [Components](toolkit.md#components) (common
  rules) and the toolkit [changes](toolkit.md#changes). No API change.

Guides: [Components](toolkit.md#components), [changes](toolkit.md#changes).

<a id="fb-0229"></a>

## FB-0229 — Menu counts arriving after sign-in collapsed the menu row under the pointer

- **Accepted expectation:** the menu row's layout does not change when live
  counts arrive; specs open a group from the row or from `Menü`.

- **Contract:** no API change. An entry that can hold a count (a view
  declaring `attention`, a branch or `Menü` holding one, a menu-row command
  naming one) reserves its badge's room from the first render
  ([menu counts](shell.md#menu-attention)), so a row with such
  entries collapses at a slightly larger width than before, never later.

- **Implemented:** `AdminShell.ts` (`attends()`; `renderMenu` measures
  badges by capability, not by the current count, for entries, `Menü` and
  commands); test helper `openGroup` in `tests/shell/feature-demo.cjs`, used by
  `menuless-view.spec.cjs` and `task-page.spec.cjs`.

Guides: [menu counts](shell.md#menu-attention).

<a id="fb-0230"></a>

## FB-0230 — Sharper grip on a horizontal inner divider

- **Implemented:** the [horizontal inner divider](toolkit.md#pagelayout-inner)
  in `admin.css` draws three 3 px dots on a short theme-coloured backing,
  centred on the divider. The 8 px Suite drag handle sits above adjacent
  region statuses and takes the theme's accent colour on hover.

Guides: [horizontal inner divider](toolkit.md#pagelayout-inner).

<a id="fb-0231"></a>

## FB-0231 — Match the vertical and horizontal inner divider grips

- **Implemented:** both [inner dividers](toolkit.md#pagelayout-inner) share
  the same dot size, spacing, backing, hover colour and placement above
  region statuses. Each grip is oriented along its divider.

Guides: [inner dividers](toolkit.md#pagelayout-inner).

<a id="fb-0232"></a>

## FB-0232 — A busy state over a region that already holds content

Guides: [toolkit](toolkit.md#busy-filled-region).

<a id="fb-0233"></a>

## FB-0233 — Nested layout regions keep filling space after a divider drag

Guides: [page region](toolkit.md#pagelayout).

<a id="fb-0234"></a>

## FB-0234 — Restore a Tree in one frame on a same-tab return

- **Implementation.** [Tree](toolkit.md#tree) keeps a bounded snapshot of
  the previously loaded visible branches in the current shell. It builds
  the first frame with the saved expansion and selection, then rechecks the
  branches through their ordinary ACL-checked parent lists. The result
  applies together and keeps intervening selections and collapses where
  their nodes survive. Empty saved expansion keeps every root closed.

Guides: [Tree](toolkit.md#tree).

<a id="fb-0235"></a>

## FB-0235 — Keep an unchanged Tree across longer visits to another view

Guides: [Tree contract](toolkit.md#tree).

<a id="fb-0236"></a>

## FB-0236 — A page that owns its path may leave the location bar empty

setLocation([], {from: "root"}) leaves the location bar empty while the page owns its path.

Guides: [empty own path](shell.md#location-bar-empty).

<a id="fb-0237"></a>

## FB-0237 — No location bar for a top-level entry alone, and a per-view switch

- **Decision.** The automatic default changes. A page whose path would be
  only its own top-level menu entry (no group, record, parent or
  `setLocation` levels) has no bar while the full menu row shows that
  entry's current-section marker. The bar stays where the row cannot say it:
  collapsed into `Menü` (phone, narrow desktop), a top-level entry has no
  marker in the row, so the bar keeps naming it. A grouped entry keeps its
  two levels; an own path, also an empty one (FB-0236), keeps its line. The
  per-view switch is a declaration, `locationBar: false`, which removes the
  bar at every width whatever the path; no actor or record condition.
  Migration M95 records the behaviour change.

- **Implemented.** `AdminShell.ts`: `locate()` hides the cell for
  `locationBar: false` and for `alone()` while `menuFull`; `renderMenu()`
  records `menuFull` and redraws the bar only when that changes for a page
  that is `alone()`. PHP `View::$locationBar` (constructor and `with()`, so
  `Registry::updateView` switches any kind), `Workspace::views()` emits
  `locationBar: false`, JSON `views.<id>.location_bar` and
  `resources.<name>.view.location_bar` (`WorkspaceConfiguration.php`),
  `ViewDefinition.locationBar` in `api/types.ts`. The feature demo's D3
  `Mérési irányítópult` declares `location_bar: false`. The bootstrap shape
  and the D3 declaration are checked in `tests/shell/contracts.php`.

Guides: [Top-level entry](shell.md#location-bar-top-level), [switched off](shell.md#location-bar-off).

<a id="fb-0238"></a>

## FB-0238 — A switchable Back button in the location bar, and no level icons by default

- **Contract.** [Back button](shell.md#location-bar-back) and
  [level icons](shell.md#location-bar-icons); configuration keys in
  [configuration](configuration.md#entrypoint-and-application-sections).

- **Implemented.** PHP `ApplicationDefinition::$locationBack` /
  `$locationIcons` (JSON `application.location_back` / `location_icons` in
  `JsonApplication.php`, bootstrap `locationBack` / `locationIcons: true` in
  `Application.php`), `View::$locationBack` / `$locationIcons` (nullable;
  JSON `views.<id>.…` and `resources.<name>.view.…` in
  `WorkspaceConfiguration.php`, emitted by `Workspace::views()` only when
  declared), `ViewDefinition.locationBack` / `locationIcons` in
  `api/types.ts`. `AdminShell.ts`: `track()` (in `route`) and `push()` keep
  `history.state.bladeDepth`, the `replaceState` calls keep the state, and
  `locate()` resolves both switches. `LocationBar.ts`: the `Vissza` button
  (`bi bi-arrow-left`, `history.back()`, disabled at depth 0) and the
  divider before the list; `location-bar.css` lays the nav out as a flex row.
  The feature demo switches the button on for the application; `Mérések`
  declares `location_back: false` and `location_icons: true`.

Guides: [Back button](shell.md#location-bar-back), [level icons](shell.md#location-bar-icons), [configuration](configuration.md#entrypoint-and-application-sections).

<a id="fb-0239"></a>

## FB-0239 — Icons for tree nodes

- **Decision.** A general option of every record tree, not a per-screen
  look. Two forms, both from the bundled [catalog](icons.md): `icon`, one
  class pair every node shows in place of the folder glyph (decorative), and
  `iconField`, an existing [icon column](icons.md) (`column.presentation:
  "icon"`) whose value each node shows. The icon column contract is reused
  as it is: its static options name each icon, and that name becomes the
  node's `aria-description` and the glyph's tooltip, so the icon is never the
  only signal. An empty or other value falls back to `icon`, then to the
  folder glyph. Without either option nodes keep the folder glyph, so
  existing trees are unchanged. Tree navigation takes the same options.
  A derived icon is a computed select column (JSON `storage.computed`); no
  icon template or callback is accepted. Migration M97 (additive).

- **Contract.** [Tree icons](toolkit.md#tree-icons); tree navigation in
  [workspaces](workspaces.md#tree-navigation); [usage](usage.md).

- **Implemented.** `TreeAdapter.ts` passes a node's `icon` to Suite's
  `file`, `folder` and `openFolder` slots for every node (no longer only for
  leaves) and keeps its `description`; `RecordTree.ts` `NodeTree.icon()`
  takes the icon column's value (checked as one class pair,
  `isIconClass` in `RecordPresentation.ts`) or the fixed icon, `annotate()`
  sets `aria-description` and the glyph's `title`; `RecordTree` validates
  `icon` and `iconField` (`TypeError`); `TreeNavigation.ts` passes
  `TreeMetadata.icon` / `iconField`. PHP `Registry::tree(..., icon:,
  iconField:)` validates the class and that the field is an icon column of
  the node view; `Workspace::views()` resolves both;
  `WorkspaceConfiguration` reads JSON `tree.icon` / `icon_field`. Types:
  `TreeOptions` and `TreeMetadata` in `api/types.ts`. Feature demo: the
  registry keys have a computed icon column `Kulcstípus` (root keys
  `bi-hdd-stack`, others `bi-folder`), used by the registry editor's tree
  navigation (`icon_field`) and the key browser (`iconField`); the tenant
  demo's category tree has `icon: 'bi bi-tag'`.

Guides: [catalog](icons.md), [Tree icons](toolkit.md#tree-icons), [workspaces](workspaces.md#tree-navigation), [usage](usage.md).

<a id="fb-0240"></a>

## FB-0240 — Conditional form sections

- **Contract.** [Conditional sections](workspaces.md#form-section-conditional);
  [conditional fields](workspaces.md#conditional-fields);
  [RecordForm](toolkit.md#recordform); [usage](usage.md); migration M98 in
  the [toolkit](toolkit.md#migration).

- **Implemented.** PHP `Field::$sectionVisibleWhen` (validated with the
  shared condition shape; `active()` checks both conditions and counts
  booleans), `Field::checkSections()` (one condition per section, its field
  outside the section and unconditional, known in a resource's fields,
  checkbox values), `Action` (a `visibleWhen` on a field of a conditional
  section), `Executor` (an inactive section field is left out of the saved
  values; only an inactive `visibleWhen` field is stored empty),
  `WorkspaceConfiguration` (JSON `section_visible_when`). Frontend:
  `FormValidation.ts` `conditionHolds`/`fieldActive` (both conditions);
  `fields.ts` `bindFieldTypes` hides a section through its Suite frame cell
  (the fieldset's parent cell, which Suite then leaves out of the document)
  together with its fields (no Suite validation), refits the window, and
  `bindAccordion` keeps a shown section open (`sectionsSettle`) and moves the
  header keys over the shown headers only; `bindSections` decorates a panel
  shown again. Types: `FieldMetadata.sectionVisibleWhen`. Feature demo:
  `Értesítési szabályok` ([notifications.json](../examples/demo-app/modules/notifications.json),
  table and seed in `setup-workspace.php`, English catalogue entries).

Guides: [Conditional sections](workspaces.md#form-section-conditional), [conditional fields](workspaces.md#conditional-fields), [RecordForm](toolkit.md#recordform), [usage](usage.md), [toolkit](toolkit.md#migration).

<a id="fb-0241"></a>

## FB-0241 — A visible sub-view row toggle

- **Decision.** The toggle takes the framework's existing expand chevron, the
  one of the accordion and accordion form-section headers (7 px, 2 px stroke
  in `currentColor`, rotated from right to down), instead of an icon glyph, so
  every expandable control has one arrow. Size, colour, hover and the
  accessible name are unchanged.

- **Contract.** [Sub-views](workspaces.md#sub-views-expandable-rows-and-card-buttons).

- **Implemented.** `ResponsiveGrid.ts`: the toggle button carries no icon
  element; `admin.css`: `.blade-subrow-toggle::after` joins the shared chevron
  rule, `[aria-expanded="false"]` its right-pointing rotation and the
  reduced-motion rule.

Guides: [Sub-views](workspaces.md#sub-views-expandable-rows-and-card-buttons).

<a id="fb-0242"></a>

## FB-0242 — Form windows: a scrolling body and a fixed footer

- **Decision.** Every framework form has one frame, `formLayout(rows,
  actions, inset)` (`WindowSizing.ts`): the fields in one Form block,
  `blade-form-body`, which alone scrolls, with the inset (20 px; 16 px in the
  card field editor and a `SettingsForm`, 24 px in the details panel) on
  every side; the action row (`formFooter`) below it as a fixed footer with
  the message dialog's footer metrics: one rule, the secondary background,
  12 px above and below the buttons, the body's inset beside them. The body's
  last field or section keeps no margin, so the inset alone separates it from
  the rule. It stays one Form (validation, the disabled state and every
  `form` event unchanged), as FB-0177 required. A window or panel taller than
  its content keeps the footer at its lower edge; a fitted window measures to
  the footer and no longer counts other buttons of that form (a field's own
  scrolling list).

- **Contract.** [Window sizing](workspaces.md#window-sizing).

- **Implemented.** `WindowSizing.ts` `formLayout`, `formFooter`,
  `fitWindow`; `admin.css` (body and footer, sticky row removed, the textarea
  growth inside the body); `form-section.css` (accordion and flush rules
  address the body); the list's form and bulk windows, `RecordForm`,
  `SettingsForm`, the card editor and details panel, the file manager's,
  file picker's, uploader's, diagram's and calendar's forms.

Guides: [Window sizing](workspaces.md#window-sizing).

<a id="fb-0243"></a>

## FB-0243 — A view guide opens automatically once per user

- **Decision.** The common shell opens each view guide automatically once per
  user in the same browser profile. The `Útmutató` control can reopen it on
  request. This supersedes the sign-in-session timing of [FB-0109](#fb-0109).

- **Implementation.** The shell marks each shown guide in `localStorage`
  by application path, user ID and view ID, and carries over marks from open
  tabs using the former session storage. The saved mark survives sign-out
  and new tabs in that profile. The suppression over an open non-modal
  work window continues to apply ([FB-0200](#fb-0200)).

- **Contract.** [View guide](workspaces.md#view-guide).

Guides: [View guide](workspaces.md#view-guide).

<a id="fb-0244"></a>

## FB-0244 — Restore the Tree in the first frame after a browser reload

- **Contract.** [Tree](toolkit.md#tree).

Guides: [Tree](toolkit.md#tree).

<a id="fb-0245"></a>

## FB-0245 — A Back destination for each page

- **Decision.** An enabled location bar Back button first runs the page's
  current `setLocation` action, then uses its declared view target when no
  action is supplied. An absent or unavailable target falls back to the
  in-app browser history from [FB-0238](#fb-0238).

- **Implementation.** `View(locationBackTarget: …)` and JSON
  `location_back_target` name another registered, addressable view that
  needs no record ID. `ViewHost.setLocation(segments, {back})` supplies an
  action for the current page state. The demo's `Feladatlap` returns to its
  first tab from a secondary tab and opens `Feladatok` from the first tab.

- **Contract.** [Location bar Back destination](shell.md#location-bar-back-target).

Guides: [Location bar Back destination](shell.md#location-bar-back-target).

<a id="fb-0246"></a>

## FB-0246 — A breadcrumb can select a node in the kept Tree

- **Implementation.** `TreeOptions.initialPath` takes the root-to-target
  IDs with the ordinary Tree ID. A loaded path uses the same branches with
  the target selected in the first frame. Missing levels are prepared
  through the list action before painting. An unavailable target falls
  back to the ordinary mount, and a broken parent chain stops at its first
  unmatched step. Fresh background reads still apply. [FB-0247](#fb-0247)
  refines partial-cache display, target scrolling and cold expansion.

- **Contract.** [Tree](toolkit.md#tree).

Guides: [Tree](toolkit.md#tree).

<a id="fb-0247"></a>

## FB-0247 — Keep the Tree usable and its breadcrumb destination visible

- **Implementation.** Bounded snapshots give visible levels priority and
  also retain child lists from previously opened folders. A cached path
  opens straight to its target. A genuine miss shows the kept tree while
  resolving the path, with a newer user selection or toggle taking priority.
  The background check reuses fresh path reads. Breadcrumb selection moves
  the panel just enough to show its row. Cold entry combines the target
  ancestors with the saved expansion or the bounded default depth.

- **Contract.** [Tree navigation and snapshots](toolkit.md#tree),
  [usage](usage.md), [previous behavior](#fb-0246).

Guides: [Tree navigation and snapshots](toolkit.md#tree), [usage](usage.md).

<a id="fb-0248"></a>

## FB-0248 — One standard panel header: CommandBar title, popup and icons

Use a standard CommandBar panel header with a title, count, popup and icons.

Guides: [Panel header](toolkit.md#commandbar-title), [popup menu](toolkit.md#popup-menu), [usage](usage.md).

<a id="fb-0249"></a>

## FB-0249 — Public Blade palette for Blade-family child skins

- **Implementation.** Documentation of the 30 properties that both palette
  blocks of `themes/blade.css` define, with the surface each one paints;
  four of them (`--blade-rule`, `--blade-tab`, `--blade-tab-rule`,
  `--blade-tab-glow`) are defined but consumed by no current rule and are
  listed as reserved. Feature demo: the synthetic `demo-ember` skin (`Parázs`,
  base `blade-night`, a Suite primary hue and seven palette overrides) for
  the new `bladeskin@example.test` account.

Guides: [Public Blade palette](shell.md#blade-palette), [application skins](shell.md#application-skins), [61ade character](shell.md#61ade-character), [customization limits](skinning.md#customization-limits), [consistency assessment](skinning.md#consistency-assessment).

<a id="fb-0250"></a>

## FB-0250 — Responsive layouts, attachments, progress and common toolkit services

Provide shared viewport changes, responsive PageLayout arrangements, Attachments, Steps, progress dialogs, record watches, cacheable reads, copy and submit-key services.

- **Contract.** M101–M108 of the toolkit. Topic guides:
  - toolkit: [viewport](toolkit.md#viewport),
    [narrow tree](toolkit.md#pagelayout-narrow),
    [Attachments](toolkit.md#attachments), [Steps](toolkit.md#steps),
    [record watch](toolkit.md#record-watch),
    [cacheable reads](toolkit.md#request-version), [copy](toolkit.md#copy),
    [submit keys](toolkit.md#submit-keys),
    [closable](toolkit.md#window-closable),
    [long-lived windows](toolkit.md#long-lived-windows);
  - [progress dialog](dialogs.md#progress);
  - [form submit keys](workspaces.md#form-submit-keys);
  - [panel header tokens](shell.md#panel-header-tokens);
  - [security model](security-model.md);
  - [usage](usage.md), [demos](demos.md), and the 61ade-ui and
    61ade-skinning skills.

Guides: [viewport](toolkit.md#viewport), [narrow tree](toolkit.md#pagelayout-narrow), [Attachments](toolkit.md#attachments), [Steps](toolkit.md#steps), [record watch](toolkit.md#record-watch).

<a id="fb-0251"></a>

## FB-0251 — CommandBar names its toolbar and has a standard height

- **Implementation.** The bar's `label`, else its title, is the toolbar's
  `config.ariaLabel`, so it survives every redraw (resize, collapse into
  `Műveletek`, `narrow: "icons"`, `update`); the outer element has no name. A
  bar mounted into a plain element is at least `--blade-command-bar-height`
  (48 px, the framework's command rows); in a Layout cell, a window or a view
  host the container decides.

Guides: [Panel header](toolkit.md#commandbar-title).

<a id="fb-0252"></a>

## FB-0252 — Lists over rows from PHP handlers (provider lists)

Provide standard authorized list behavior over PHP-supplied rows through ProviderResource and ListProvider, within the documented provider-list limits.

Guides: [Provider lists](workspaces.md#provider-lists), [live protocol](workspaces.md#élő-adat-konfigurálása-és-futtatása), [toolkit changes](toolkit.md#changes), [usage](usage.md), [demos](demos.md).

<a id="fb-0253"></a>

## FB-0253 — Long-running jobs: job actions, JobQueue and the job window

Provide job actions, a framework JobQueue and a job window; external engines integrate through JobSource and application-owned scheduling.

- **Contract.** [Jobs](workspaces.md#jobs) (server),
  [app.jobs and JobView](toolkit.md#jobs) (client), the
  [toolkit changes](toolkit.md#changes), [security model](security-model.md),
  [usage](usage.md#warning-and-confirmation-dialogs), [demos](demos.md),
  [focused checks](development.md#focused-task-groups),
  [product direction](product-direction.md) and the
  [M6 plan](development-plan.md#m6--fájlok-exportimport-jobok-és-megfigyelhetőség).

Guides: [Jobs](workspaces.md#jobs), [app.jobs and JobView](toolkit.md#jobs), [toolkit changes](toolkit.md#changes), [security model](security-model.md), [usage](usage.md#warning-and-confirmation-dialogs).

<a id="fb-0254"></a>

## FB-0254 — `__Host-` session cookie

- **Implemented.** `sessionName` may start with `__Host-`. The definition then
  requires `cookiePath: '/'`, a request without HTTPS is refused, and a
  `session.cookie_domain` from the PHP configuration is cleared. The derived
  language, remember and OAuth cookies carry the prefix and the same scope.
  An empty or `OFF` `HTTPS` value now counts as plain HTTP for every cookie.

Guides: [`__Host-` session cookie](authentication.md#host-cookie), [M110](toolkit.md#migration).

<a id="fb-0255"></a>

## FB-0255 — Admin stylesheet against its own CSP

The build removes third-party calendar font faces and rejects third-party URLs in admin.css to keep the stylesheet compatible with the shell CSP.

Guides: [Tracked frontend build](development.md#tracked-frontend-build), [M111](toolkit.md#migration).

<a id="fb-0256"></a>

## FB-0256 — `Attachments.add` draws the chip at once

- **Implemented.** `add()` renders before it reports the change.

Guides: [Attachments](toolkit.md#attachments), [M112](toolkit.md#migration).

<a id="fb-0257"></a>

## FB-0257 — A phone's non-modal window keeps the menu and the lower bar

- **Implemented.** Below 768 px a non-modal window fills the workspace and
  follows its size. This also applies to the view guide and to a project's
  long-lived windows. The `app.jobs` window is modal and stays full screen.

Guides: [Long-lived windows](toolkit.md#long-lived-windows), [M113](toolkit.md#migration).

<a id="fb-0258"></a>

## FB-0258 — Tenant isolation of keyed statements, and the tenant singleton

- **Implemented.**
  - Every key-addressed statement of `SqlResource` also names the row's tenant.
  - Related and delegation storage and shared rows need a key unique across
    tenants. A unique index guarantees it; without one the data is checked, and
    a repeated key fails closed. Such a key cannot be taken or renamed.
  - `tenantSingleton` (JSON `tenant_singleton`) addresses one row per tenant as
    `self`; its ACL object is the tenant's key.
  - The tenant demo has `Tenant beállítások`.

Guides: [Tenant-scoped resources](tenancy.md#tenant-scoped-resources), [tenant singleton](tenancy.md#tenant-singleton), [M114](toolkit.md#migration).

<a id="fb-0259"></a>

## FB-0259 — Server-side user preferences

- **Implemented.** Table `blade_user_preferences` (`Schema::install` only; without
  it a page stays browser-local), the session-bound `__preferences` action, the
  bootstrap document, `AccountPreferences.ts` under the unchanged `UiPreferences`
  and `app.preferences`, fill-only browser migration, per-tenant filters and tree
  state, the theme applied from the bootstrap, and a localized reset action.

- **Contract.** For one entry the last write wins, across tabs and devices. A
  change that never reached the server is lost when the page closes: it is retried
  only while the page is open, and the page-hide request sends what is unsaved. A
  new page takes the server document as the truth. Reset raises the row's
  `generation`; a patch of another generation applies nothing (409), that page
  stops saving, and migration is skipped once the generation is above 0. The
  stored document is ASCII JSON, and the limits are measured on it.

Guides: [User preferences](user-preferences-plan.md), [M117](toolkit.md#migration).

<a id="fb-0260"></a>

## FB-0260 — An open window follows the 768 px breakpoint

- **Implemented.** `app.ui.window` changes form across 768 px and keeps its
  content. Below it a modal window is full screen and a non-modal one fills the
  workspace, with no maximize button, drag or resize. Above it the window returns
  to its desktop box and maximized state. A window opened on a phone takes its
  remembered box, else its declared size.

Guides: [Long-lived windows](toolkit.md#long-lived-windows), [M115](toolkit.md#migration).

<a id="fb-0261"></a>

## FB-0261 — Inset popup menu highlights

- **Implemented.** Shared popup entries have a 6 px inset on each side and
  use the theme's corner radius. The label shortens first and the right-hand
  detail keeps its natural width up to the existing 45 % cap.

Guides: [Popup menu](toolkit.md#popup-menu).

<a id="fb-0262"></a>

## FB-0262 — Shared styling for native and anchored popup menus

- **Implemented.** Both renderers use the same Suite popup list and row
  styling for spacing, corner radius and Blade hover and keyboard focus.
  Toolkit-specific sizing, headings and secondary detail retain their
  component rules.

Guides: [Shell controls](shell.md#elkülönülő-főmenügombok), [toolkit popup menus](toolkit.md#popup-menu).

<a id="fb-0263"></a>

## FB-0263 — One standard tab and command row height

Superseded by [FB-0264](#fb-0264).

Guides: [Page and tab command rows](toolkit.md#page-command-bars), [M118](toolkit.md#migration).

<a id="fb-0264"></a>

## FB-0264 — Reduce the standard header row to 44 px

- **Implemented.** `--blade-header-row-height` supplies a shared default of
  44 CSS px for tabs, command rows, window headers and main navigation.
  The shell resolves it at startup. Individual windows, tabs and plain
  command bars can set their own size. Navigation has its own CSS override.
  A project's Layout row can read `app.ui.headerRowHeight`.

Guides: [Page and tab command rows](toolkit.md#page-command-bars), [M119](toolkit.md#migration).

<a id="fb-0265"></a>

## FB-0265 — Forced password-change instruction as a paragraph

- **Implemented.** The window's native Layout has an instruction row above the
  form. The paragraph uses the sign-in notice typography and the existing
  translation key.

Guides: [Sign-in customization](shell.md#sign-in-content).

<a id="fb-0266"></a>

## FB-0266 — Loading feedback before a record page mounts

- **Implemented.** `AdminShell` shows one `CellStatus` on the workspace during
  a page navigation's record lookup. The target view's first `attach` or its
  resolved `create` ends it. A failure or later navigation also ends or takes
  it over, and a late response of an earlier navigation cannot clear it.

Guides: [Loading and empty states](toolkit.md#loading-and-empty-states), [view host](shell.md#application-modules).

<a id="fb-0267"></a>

## FB-0267 — Match the rendered command and tab bar heights

- **Implemented.** The tab row and plain-element CommandBar use the same
  resolved CSS height. The plain-element mount uses that exact height.
  Explicit tab and command bar sizes and sizing by a Layout cell remain
  available.

Guides: [Page and tab command rows](toolkit.md#page-command-bars).

<a id="fb-0268"></a>

## FB-0268 — A stronger divider where inner layout columns meet a header

Superseded by [FB-0269](#fb-0269).

Guides: [Inner layout](toolkit.md#pagelayout-inner).

<a id="fb-0269"></a>

## FB-0269 — Shade the header surface beside the one-pixel divider

Superseded by [FB-0271](#fb-0271).

Guides: [Inner layout](toolkit.md#pagelayout-inner).

<a id="fb-0270"></a>

## FB-0270 — Separate operations from dismissal in action rows

Start operation buttons on the left and dismissal at the right edge. Allow wrapping with spacing when captions exceed the row width.

Guides: [Forms](workspaces.md#form-submit-keys), [dialogs](dialogs.md).

<a id="fb-0271"></a>

## FB-0271 — Shade only the end edge of a header before a divider

Keep the 12 px header fade only at the end edge before an inner divider. The header after the divider and the final region have no fade.

Guides: [Inner layout](toolkit.md#pagelayout-inner).

<a id="fb-0272"></a>

## FB-0272 — Loading feedback for record images

Use a shared image-loading lifecycle through image decoding for tables, cards, tiles and details. Restore the static fallback on failure and respect reduced motion.

Guides: [Media columns](workspaces.md#media-columns-tiles-row-height-and-search).

<a id="fb-0273"></a>

## FB-0273 — A gap between adjacent popup menu rows

Separate adjacent Suite popup entries by 2 px, preserving heading and separator spacing.

Guides: [Popup menu](toolkit.md#popup-menu).

<a id="fb-0274"></a>

## FB-0274 — A gap between adjacent toolbar buttons

Separate independent Suite toolbar buttons by 4 px while keeping grouped and segmented buttons joined.

Guides: [CommandBar view controls](toolkit.md#commandbar-view-controls).

<a id="fb-0275"></a>

## FB-0275 — A view opened before the modules load keeps its dialog

When module loading finishes, keep an already open page with the same view and record and no filter presets, preserving its dialogs.

Guides: [Application modules](shell.md#application-modules), [URLs](shell.md#urls-and-local-ui-preferences).

<a id="fb-0276"></a>

## FB-0276 — Clickable views inside a submenu

A menu group can contain both direct views and a named subgroup of views.
The compact menu and the location bar follow the same hierarchy.

Managed-demo checks opened both views and their details at 1600 and 390 px,
checked the location levels, followed a compact sibling and browser Back,
and confirmed the branch was absent for an account offered neither view.

Guide: [submenus within view groups](shell.md#submenus-within-view-groups).

<a id="fb-0277"></a>

## FB-0277 — API keys: date expiry, a copyable one-time secret and delete

The API-key expiry was a typed text field showing a stored timestamp; the
issued key appeared in a toast that closed on click or after 10 seconds, so it
could not be copied; and a mistaken key could only be revoked, not deleted.

- `MessageDialog` acknowledgments take `copyValue`: the value stands selected
  in a read-only field with a Copy button until the user closes the dialog. A
  `reveal` with `copy: true` uses it; the issued API key and the temporary
  password of a new account set it.
- The expiry is a `date` field stored as `YYYY-MM-DD`, valid through the end of
  that UTC day; `Schema::install` converts earlier timestamps.
- API keys register Delete.

Managed-demo checks picked the expiry in the calendar, copied the key from the
dialog, closed it, revoked the key and deleted it; the temporary password of a
new account was read from the same dialog.

Guides: [API keys](admin.md#api-kulcsok-a3), [dialogs](dialogs.md).
