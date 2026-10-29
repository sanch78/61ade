# User testing and usage lessons

This log preserves expectations, corrections, decisions and verification history.
[Usage](usage.md) is canonical for current behavior. Historical test results,
paths and superseded decisions below are evidence, not permission to repeat old
workflows. Entries translated into English retain original IDs/dates/results;
product labels, identifiers and quoted diagnostics stay unchanged.

<a id="rögzítés-és-feldolgozás"></a>

## Recording and processing

Assign stable FB-NNNN IDs to meaningful observations. Summaries must stand alone,
without full chats or confidential data. Separate observed from requested behavior.

Statuses: open (interpretation pending), accepted/planned, implemented/verification
pending, closed/verified, rejected, superseded. Documentation expectations may
close through documentation checks; runtime feedback requires actual behavior.
Tool verification is not user acceptance.

Before closure update canonical usage and relevant plan/API/ADR. Preserve
superseded entries with successor IDs and remove contradictions from active guidance.

<a id="bejegyzéssablon"></a>

## Entry template

- ID/date/title.
- Source/context, component/version/commit where known.
- Observation/reproduction, explicitly noting documentation-only cases.
- Expected behavior/usage.
- General framework versus consumer scope, decision/open interpretation.
- Status/action/limits.
- Guide/implementation/test links.
- Who checked what and actual results; user acceptance only when it occurred.

<a id="fb-0001--a-használati-módszertan-folyamatos-vezetése"></a>

## FB-0001 — Maintain usage guidance continuously

Date: 2026-10-16. Owner instruction after initial structure, before runnable runtime.
Every capability needs maintained usage guidance; preserve testing instructions
and incorporate general lessons. Mandatory completion rule, with consumer-specific
knowledge staying in consumer docs.
Closed/documentation-verified: [project contract](../AGENTS.md), [usage](usage.md),
[plan](development-plan.md) aligned; internal links/diff checked. Runtime not
applicable and later user testing had not occurred. The rule remains ongoing.

<a id="fb-0002--fokozatos-indulás-login-és-navigációs-shell-segítségével"></a>

## FB-0002 — Start incrementally with login/navigation

Date: 2026-10-16. First-consumer guidance: login then application-specific menu
without business modules. Framework owns login/session/navigation; consumers own
identity/menu. Shell was not complete CRUD/ACL.
Superseded by FB-0003 after owner rejected the implementation direction:
technical checks did not prove architectural acceptance.
[Shell](shell.md), [Application](../packages/php/src/Shell/Application.php),
[frontend](../packages/frontend/src/admin.ts).
Historical checks: PHP 8.4 lint, typecheck/build, four synthetic consumer Chromium
E2E cases and mobile visual inspection.

<a id="fb-0003--minden-általános-képességet-a-61de-ad-61de-az-ade-v2"></a>

## FB-0003 — All general capabilities belong to 61de, ADE v2

Date: 2026-10-16. Owner rejected custom login/cards dashboard.
Mandatory architecture, not visual preference: build framework capabilities with
DHTMLX, then business modules, without bypassing application admin code.
Supersedes FB-0002 interpretation; FB-0004 narrows the absolute DHTMLX rule.
Initial framework capability/consumer integration verified, no user acceptance.
[Contract](../AGENTS.md), [ADR-0002](decisions/0002-framework-first.md), [usage](usage.md).
Historical PHP lint/typecheck/build, four independent Chromium and four consumer
cases passed; HTTPS login loaded. Mobile gathers branches under native menu and
restores on widening.

<a id="fb-0004--elsőbbségi-keretszabály-kezelhető-acl-és-audit"></a>

## FB-0004 — Framework-first rule, manageable ACL and audit

Date: 2026-10-16. Accepted: framework-first with only documented logically-
unextendable exception, refining FB-0003. Object/action/field/channel rights
must be manageable in UI with equal API protection and audit of admin/business
flows. Admin role is not business superuser; menu includes implemented modules only.
The original application-owned useradmin decision is superseded by FB-0036.
ACL/audit/framework-first remain. Initial implementation/integration verified,
user acceptance open. [Contract](../AGENTS.md), [ADR](decisions/0002-framework-first.md).
Checks: access.php/workspace.spec.cjs plus consumer profile/account/ACL/API PHP/
Chromium. Implementation: Feature/Access/Audit and Workspace.ts.
[Canonical ACL guide](access-and-actions.md). Password-only own-profile behavior
was a consumer business rule, not a kernel useradmin requirement.

<a id="fb-0005--natív-dhtmlx-témaváltás"></a>

## FB-0005 — Native DHTMLX theme switching

Date: 2026-10-16. Accepted: Default/dark at menu right, DHTMLX setTheme rather
than ADE skin layer; browser persistence. FB-0012 later adds/defaults Skyblue.
Implemented/browser-verified including reload; AdminShell and [shell](shell.md).

<a id="fb-0006--konfigurálható-munkaterület-dinamikus-és-élő-listák"></a>

## FB-0006 — Configurable workspace, dynamic/live lists

Date: 2026-10-16. Accepted separate named/configurable filter/form/grid areas,
optional default overlay, dynamic bounded lists without pager/manual refresh.
All visible lists use configured polling/WebSocket; first consumer WebSocket.
Keep selection/filter/scroll/open forms on refresh. List labels Add/Modify under
ACL; Save only on submission. Profile is direct details/form, writable fields
only; optional read-only ACL does not replace it.
Implemented/verified, no user acceptance. [Workspace](workspaces.md), ViewLayout,
ListSource, LiveConfig, Realtime and WebSocket worker. Historical 5000-row PHP,
overlay/polling demo and consumer WebSocket browser checks passed.

<a id="fb-0007--az-üzleti-kód-és-a-keret-határa"></a>

## FB-0007 — Business code and framework boundary

Date: 2026-10-16. Owner asked about code/configuration and business leakage.
Dependency application → framework; consumers own schema/rules/initial grants,
61de general execution/extensions. Reinforces FB-0003/0004.
Runtime inventory found no consumer classes/tables/legacy flags, but polling
test PHP default referenced a consumer path. Corrected to BLADE_PHP/php8.4.
[Boundary](usage.md#üzleti-konfiguráció-és-kód-határa), [testing](development.md#ellenőrzési-stratégia).
Both workspace Chromium cases passed with injected PHP (CRUD/form/external-write
polling). Focused search clear; diff check passed. No user acceptance claimed.

<a id="fb-0008--olvasható-json-definíció-env-és-rendezett-php"></a>

## FB-0008 — Readable JSON, env and organized PHP

Date: 2026-10-16. Accepted modular understandable JSON, host env and well-organized
business PHP. Configuration compiler uses named callbacks through existing
Field/Action/SqlResource/Workspace; extends FB-0007's PHP option.
[JSON/env](configuration.md), [boundary](usage.md#üzleti-konfiguráció-és-kód-határa).
Synthetic configuration/shell/ACL and consumer account/profile/ACL/API/password
PHP passed; public login with JSON/env returned 200. No user acceptance.

<a id="fb-0009--a-referencia-teljes-validációja-a-migráció-része"></a>

## FB-0009 — Full reference validation belongs to migration

Date: 2026-10-16. Required-only consumer account validation omitted reference
format/uniqueness. Accepted full inventory before migration; framework owns
mechanism, consumer patterns/length/messages/exceptions. Owner explicitly retained
12–128 password length.
Implemented shared min length/pattern/matches/SQL uniqueness, native field feedback,
named backend errors and retained form values.
[Validation](validation.md), [configuration](configuration.md), project parity rule.
PHP validation/ACL/5000-row lists and consumer parity/browser correction-and-save
passed. No user acceptance.

<a id="fb-0010--megjegyzett-belépés-és-e-mailes-megerősítés"></a>

## FB-0010 — Remembered login and e-mail verification

Date: 2026-10-16. Accepted 90-day absolute remembered login, per-user default-on
e-mail verification and framework-formatted mail with consumer text.
61de owns auth/session/SMTP/MIME/remember through JSON/env; pending verification
has no authenticated UI/API/WebSocket. Consumers supply account adapter/text
and registered ACL actions.
[Authentication](authentication.md), [configuration](configuration.md),
Authentication/Mail/Application/AdminShell.
PHP auth and three independent SMTP/MIME/DHTMLX Chromium cases passed, including
Enter/new session/absolute expiry/logout/default/per-user toggle. Synthetic mail
only; consumer relay TLS checked without real mail/login. No user acceptance.

<a id="fb-0011--egyetlen-alsó-információs-sáv"></a>

## FB-0011 — One lower information bar

Date: 2026-10-16. Accepted removal of redundant top application header and workspace
connection/user bars. One lower native Toolbar: user left, application/version
right; live updates remain. Optional PHP/JSON version; no persistent workspace
status, action alerts/conflict messages remain.
Closed/verified, no user acceptance. Typecheck/build/PHP lint/shell/JSON and
four browser cases plus CRUD/switch/polling passed including targeted reruns
after environmental timeouts.
[Shell](shell.md#egységes-alsó-információs-sáv), [workspace](workspaces.md),
ApplicationDefinition/JsonApplication/AdminShell/Workspace.

<a id="fb-0012--skyblue-alapértelmezett-megjelenés"></a>

## FB-0012 — Skyblue default

Date: 2026-10-16. Accepted default Skyblue, extending FB-0005.
Suite 9 lacks factory legacy Skyblue; documented custom-theme variables define
a light-blue palette, not a complete legacy image skin. Native controls remain.
No saved preference → skyblue; valid saved choices retained.
Closed/verified: typecheck/build, default/color/switch/reload Chromium.
Visual inspection found/fixed lower Toolbar intrinsic-height clipping; tests
also check complete label bounds. No user acceptance.
[Appearance](shell.md#megjelenési-mód), AdminShell.ts/admin.css/browser.spec.cjs.

<a id="fb-0013--a-panelméretező-középre-igazítása"></a>

## FB-0013 — Center panel resizer grips

Date: 2026-10-16. Suite space grip sat on border, reproduced with independent
native Layout. Accepted scoped framework CSS, no vendor edit, centered in 12 px
gaps both axes. Scoped #blade-application override preserves other resizers.
Closed/verified, no user acceptance. Build/two Chromium checks across three themes
and real drags passed. [Guide](workspaces.md#panelméretező-megjelenítése),
admin.css/layout-resizer.spec.cjs.

<a id="fb-0014--checkboxok-és-kapcsolók-az-objektum-főűrlapján"></a>

## FB-0014 — Flags in the object's main form

Date: 2026-10-16. Accepted checkbox flags/form/list, bounded columns, meaningful
filter labels and no separate switch forms/buttons. Related one-to-one storage
shares transaction/revision/ACL/audit; consumers own labels/mappings.
Initial list checkbox was status-only; later editable-field decisions refine it.
Field/RelatedStorage/SqlResource/ListSource/WorkspaceConfiguration/Workspace.
Security action remains API option, while main form supersedes FB-0010's UI pattern.
Closed/verified, no user acceptance. PHP related/ACL/API/lists/validation,
synthetic native controls/width/shared save/reopen/filter/error retention and
consumer account checkboxes/six feature browsers/PHP parity passed.
[Fields](field-presentation.md), [config](configuration.md),
[authentication switch](authentication.md#felhasználónkénti-kapcsoló).

<a id="fb-0015--fölösleges-keretezett-layoutburkoló"></a>

## FB-0015 — Remove redundant framed layout wrapper

Date: 2026-10-16. A one-cell space wrapper remained after FB-0011, adding border/gap
outside filter/results. Declared multipanel tree becomes direct root; singleton
and explicit branches remain. Closed/verified, no user acceptance.
Typecheck/build and four targeted Chromium cases passed: one root/12 px gaps,
CRUD/switch/polling/two-axis resize.
[Layout](workspaces.md#layoutszintek-és-keretek), Workspace.ts/workspace.spec.cjs.

<a id="fb-0016--fejlesztői-tesztfuttatás-ne-merítse-ki-a-közös-hostot"></a>

## FB-0016 — Protect the shared host during tests

Date: 2026-10-16. Accepted prevent host memory exhaustion during editor development.
Shared guard, serial browsers, initial memory threshold/systemd cgroup; no admin
architecture change. run-dev-check.sh/playwright.sh/npm, shared by consumer.
Actual cgroup values/nested-lock denial, both wrappers' discovery and one Chromium
login/menu passed; no OOM stress. Test protection implemented, not complete
editor-session/root-level host isolation.
[Guard and limits](development.md#böngészőteszt-korlátozott-memóriájú-fejlesztői-hoston).

<a id="fb-0017--deklarált-mezőnkénti-gridszerkesztés"></a>

## FB-0017 — Declared per-field grid editing

Date: 2026-10-16. Accepted text/select/checkbox editing per column, checkboxes only
for manageable fields, including consumer contact/switch fields. Skyblue separate.
column.editable/native editors share update ACL/scope/revision/audit/hooks.
Validate selected field only; business guard receives full merged row.
GridEditing/Workspace/Executor::edit/SqlResource, including related fields;
open cell after native selection focus, no vendor edits.
PHP checks field/legacy untouched/select/related/ACL/scope/revision/audit and
synthetic text/select/checkbox/error/discard/reload passed. Consumer PHP
save/validation/revocation and two browser/form checks plus prior regressions passed.
Implemented/verified, no user acceptance. [Usage](field-presentation.md#mezőnkénti-gridszerkesztés).

<a id="fb-0018--szerkeszthető-fejlécjelzés-rendezés-és-smart-rendering"></a>

## FB-0018 — Editable headers, sorting and smart rendering

Date: 2026-10-16. Accepted visible editable columns, sortable lists, verified smart
rendering. Existing native virtualization/100-row chunks/600-row cap worked;
sorting was disabled/fixed-key only. Full-table scrollbar/ordinal jumping absent.
Framework CSS/tooltips/events plus complete authorized SQL sorting/stable cursors/
live bounds; no consumer sort code/vendor edits. GridHeaders/Workspace/
ListSource sortableFields/read and Realtime position metadata; protected fields
and reorder-on-sort-key-edit retained.
PHP full traversal/backward cursors text/number/id/NULL/ties/ACL; 1801-row
Chromium headers/directions/filter/virtual bounds; related numeric/checkbox
2/9/10/missing defaults/API scope; consumer three main-form/inline/WebSocket
sorting cases passed.
Implemented/synthetically verified, no user acceptance.
[Sorting](workspaces.md#rendezés-és-smart-rendering), [fields](field-presentation.md).

<a id="fb-0019--listák-rekordadatok-és-vezérlők-megjelenése"></a>

## FB-0019 — Lists, record details and controls

Date: 2026-10-17. Accepted multicolumn cards, single frame, toolbar isolation,
fitting controls in every theme, native secondary filter/login buttons/icons,
default optional ordinals/full ACL details on double-click, opt-in marks/bulk.
ResponsiveGrid/RecordPresentation/Workspace/AdminShell/CSS; view options/action
icons/bulk/Executor per-row audit. FB-0022 later replaces local numbering with
full SQL rank. Consumer bulk stayed off.
[Cards/details](workspaces.md#kártyák-rekordadatok-sorszám-és-jelölés),
[bulk](workspaces.md#tömeges-műveletek-és-ikonok).
Initial typecheck/build/PHP presentation/ACL/lists/sorting/grid-edit/contracts
passed, including partial-success/revision checks; direct DataView check passed
but full UI initially blocked by runner/browser mismatch. Owner rejected
project browser install; it was stopped/removed. Fixture CSP/icon accessibility
bugs fixed pending rerun. Consumer requested INFRA-003/pool #36 rev1.
Updated: FB-0022 completed [UI qualification](list-presentation-validation.md).
No user acceptance.

<a id="fb-0020--nézet-dropdown-és-szerkeszthető-fejléc-rendezésjelzése"></a>

## FB-0020 — Final view dropdown and nonoverlapping indicators

Date: 2026-10-17. Accepted FB-0019 refinement: final Toolbar dropdown and separate
sort/edit indicators. Workspace uses spacer/right native mode dropdown, disabled
forced mobile cards. CSS reserves 24 px hover icon; one active SQL arrow, native
duplicate hidden. [Usage](workspaces.md#nézetválasztás-és-fejlécjelzések).
Typecheck/build/dropdown/header/mobile/three-theme regression passed with existing
system runner, no browser install. [Evidence](list-presentation-validation.md).
No user acceptance.

<a id="fb-0022--az-eredeti-listajavítások-teljes-ellenőrzése"></a>

## FB-0022 — Complete original list verification

Date: 2026-10-17. Owner requested complete FB-0019/20, beyond build success.
Full authorized/filtered/sorted rank replaces local numbering; numbered false
also disables calculation. PHP covers both directions/NULL/ties/middle window/
preceding insert.
Fixed filter beforeHide destruction leaving invisible modal via afterHide;
synchronized action-response/form teardown redraw, blocked inactive drawing/stale
async restoration.
System Playwright was usable; block was runner/module version mixing. Same
installation now used by launcher/imports, guard retained, no install.
Closed/verified: PHP/expanded UI/login/themes/real server batch passed.
[Evidence](list-presentation-validation.md) supersedes earlier Infra-pending state.
No user acceptance. [Workspace](workspaces.md), [runner](development.md#meglévő-közös-playwright-bekötése).

<a id="fb-0021--url-követés-és-felületállapot-megőrzése"></a>

## FB-0021 — Feature URLs and persistent UI state

Date: 2026-10-17. Accepted current feature URL/reload restoration and saved manual
grid/layout settings. AdminShell hash/history/login preservation; versioned
UiPreferences by path/user/resource. Workspace/ResponsiveGrid restore widths,
sort/manual mode/panels under current ACL/definitions/bounds; no form data.
[Usage/limits](shell.md#url-és-helyi-felületbeállítások): local browser only,
no record/editor deep links.
Typecheck/build/PHP lint/contracts/ui-preferences.mjs and synthetic Chromium
3/3 passed; expanded sizes/collapse/mobile preference case reran 1/1.
Login/reload/history/unknown IDs/disabled storage checked.
Implemented/verified, no user acceptance.

<a id="fb-0023--listafejléc-darabszám-menüikonok-és-kompakt-login"></a>

## FB-0023 — List headings/counts, menu icons and compact login

Date: 2026-10-17. Accepted title in results header, total/matched at right, icons,
spaced filters, no oversized login/confirmation bottoms, content shadow.
Native Layout header/accessory, ACL counts via ListSource and both transports,
configurable view/MenuItem icons, measured Window with 24 px bottom, Toolbar shadow.
Historical asset v=8.
[Workspace](workspaces.md#listafejléc-és-rekordszám),
[shell](shell.md#kompakt-hitelesítési-ablakok-és-menüikonok).
Full-set/ACL/cursor/filter/live PHP counts, three-theme auth/desktop/mobile/
cards/real consumer passed; consumer integration 3/3 with WebSocket 1→0→1,
dev login/prepared-asset identity checked.
[Qualification](list-presentation-validation.md#fb-0023-fejlécek-darabszám-és-hitelesítési-ablakok).
Verified, no user acceptance.

<a id="fb-0024--kártyaszerkesztés-mentés-utáni-nézetváltás-méret-és-rendezés"></a>

## FB-0024 — Card editing, save switching, sizing and sorting

Date: 2026-10-17. Accepted writable cards, switches after grid save, no display-text
selection on functional double-click, right sorting dropdown, resizer reset,
content-fitting viewport-capped windows.
ResponsiveGrid keeps separate widget snapshots, syncs hidden widgets on attachment,
never passes mutable Workspace row objects into DataView. column.editable
intersects _editable. Native single-field editors/shared saveCell/__edit/
validation/ACL/revision/audit; direct checkbox, read-only details. GridHeaders
does not set ARIA on hidden DOM. UiPreferences reset, WindowSizing/CSS, asset v=9.
[Usage](workspaces.md#kártyaszerkesztés-rendezés-és-kompakt-ablakok).
Typecheck/build/PHP grid-edit/validation, Chromium grid/cards 2/2 and
layout/list/mobile/workspace 9/9 passed, including delayed-save switching,
errors/sort/reload/two-axis reset/themes/small viewport. Consumer integration
3/3 and dev load 2/2 passed. No vendor edits.
Closed/verified, no user acceptance.

<a id="fb-0025--elkülönülő-főmenügombok"></a>

## FB-0025 — Distinct main-menu buttons

Date: 2026-10-17. Accepted separated buttons/classic Skyblue Windows appearance;
separator also needs a faint line, not gap alone.
Framework CSS/native Menu: permanent border/background/6 px gap/focus/pressed,
raised blue/gold hover; adjusted breakpoint, asset v=11.
[Shell](shell.md#elkülönülő-főmenügombok), [usage](usage.md); submenus stay lists.
Typecheck/build/shell Chromium 6/6; separator three-theme repeat 1/1 with 1 px
line >12 px high and button geometry passed. Skyblue/dark images inspected.
Owner liked buttons; no further acceptance of separator claimed.

<a id="fb-0026--táblázatárnyék-az-oszlopfejléc-alatt"></a>

## FB-0026 — Grid shadow below column headings

Date: 2026-10-17. Accepted refinement superseding FB-0023 grid Toolbar shadow.
Native Grid header casts shadow over rows, Toolbar shadow off in grid/on in cards;
shared CSS/automatic native Grid detection, no vendor edit, asset v=12.
[Counts/presentation](workspaces.md#listafejléc-és-rekordszám), [usage](usage.md).
Build/diff and targeted guarded Chromium 1/1 across themes/scroll/back passed;
Skyblue image checked. Closed/verified, no user acceptance.

<a id="fb-0027--toolbarfejléc-elválasztás-és-kártyák-felső-térköze"></a>

## FB-0027 — Toolbar/header divider and card top spacing

Date: 2026-10-17. Owner accepted shadow position but requested divider and correction
of slightly scrolled cards. Theme 1 px divider; ResponsiveGrid.restore separates
view switches from same-view refresh. Source row pixel offset is not transferred
to cards; top stays zero, middle preserves record/natural gap. Same-view live
offset retention stays exact. Asset v=13.
[Workspace](workspaces.md), [usage](usage.md).
Typecheck/build/diff, guarded presentation/mobile 6/6 across themes/divider/
shadow/repeated switches/partial rows/live selection passed; stable-redraw
regression rerun and Skyblue inspection passed.
Implemented/verified, no user acceptance.

<a id="fb-0029--jobb-széli-kártyaceruza-és-egységes-kezelhető-checkbox"></a>

## FB-0029 — Right-edge card pencil and shared editable checkbox

Date: 2026-10-17. Accepted right-edge pencil; no checkbox pencils anywhere;
checkbox only for writable rows/fields, same Grid/DataView appearance.
Refines FB-0018/24.
RecordPresentation.recordCheckbox uses Suite styles, declared/per-row intersection;
read-only/details remain text, shared edit route. Reserved right icon space;
no checkbox header/value pencils.
[Fields](field-presentation.md#egységes-checkbox-és-kártya-szerkesztésjelzés), [usage](usage.md).
Typecheck/build/diff, guarded synthetic 2/2 and consumer 1/1 passed: dimensions,
icons, Enter/Space/save/errors/reload/read-only ACL. Skyblue inspected, dev assets
prepared v=15. Implemented/verified, no user acceptance.

<a id="fb-0028--kompakt-popup-és-teljes-mobil-navigációműveletsor"></a>

## FB-0028 — Compact popup, complete mobile navigation/commands

Date: 2026-10-17. Accepted smaller headers, responsive commands, every mobile
menu item/logout under Menu and equal mobile cards.
Native Window 40 px header, ResponsiveToolbar preserving IDs/ACL/events,
Actions dropdown for narrow panels, compact logout/separator. Resize closes
native popups and prevents menu-item types leaking into restored horizontal bar.
Cards use border-box/no shrinking. Final asset v=16; sizing waits for final redraw.
[Shell](shell.md#kompakt-ablakfejléc-és-teljes-mobilmenü),
[commands](workspaces.md#reszponzív-műveletsor-és-azonos-kártyaszélesség), [usage](usage.md).
Typecheck/build/diff and 15 distinct guarded framework cases passed including
corrected reruns, 390/460/1280 widths/long words/themes/ACL/nested sort/desktop
restore/marks/bulk/live. Fresh consumers per theme wait for popup draw/close.
Consumer 3/3/dev 2/2, Skyblue/consumer dark inspection passed.
Closed/verified, no user acceptance.

<a id="fb-0030--skyblue-váltott-táblázatsorok"></a>

## FB-0030 — Alternating Skyblue rows

Date: 2026-10-17. Accepted readable alternate row backgrounds.
Native rowCss by current data index, white/#edf5fc, Skyblue-only CSS with native
selection overlay, asset v=17. FB-0032 supersedes color.
[Usage](usage.md), no consumer config.
Typecheck/build/diff/guarded three-theme scroll/mode 1/1 passed; Skyblue image
showed regular bands; demo/consumer dev assets prepared.
Implemented/verified.

<a id="fb-0031--elkülönülő-popupfejléc-és-alsó-elválasztóvonal"></a>

## FB-0031 — Popup header background and divider

Date: 2026-10-17. Accepted bottom line/all-theme distinction, with light/dark
background separation. Native header 1 px --dhx-border-color inside existing
40 px; secondary background, retained Skyblue gradient. No consumer config;
asset v=18. [Shell](shell.md#kompakt-ablakfejléc-és-teljes-mobilmenü), [usage](usage.md).
Build/diff/guarded three-theme compact popup/action/mode 3/3 passed, close button
within header. Images confirmed line/background; demo/consumer dev assets prepared.
Implemented/verified.

<a id="fb-0032--finomabb-szürke-skyblue-sorsávok"></a>

## FB-0032 — Subtler gray Skyblue stripes

Date: 2026-10-17. Accepted FB-0030 refinement from blue to subtler #f7f7f7 gray,
same native row indexing/selection, asset v=19. [Usage](usage.md), no consumer config.
Build/diff/prepared CSS equality passed; demo/consumer dev assets updated.
Implemented; only stripe color changed.

<a id="fb-0033--egyértelmű-témanevek-és-többnyelvűségi-helyzetkép"></a>

## FB-0033 — Clear theme names and localization inventory

Date: 2026-10-17. Accepted rename Default, keep Skyblue actual default, clarify
localization status. Light display name becomes Világos; saved preferences retained,
asset v=20.
At this checkpoint catalogs/locale/selector were absent and PHP/frontend partly
hardcoded Hungarian; architectural i18n plan was not a completed capability.
[Usage](usage.md#többnyelvűség), [themes](shell.md).
Typecheck/build/diff and default/persistence/themes 2/2 passed; inventory of
frontend/backend/config/plans recorded, demo/consumer assets prepared.
Theme done/verified; i18n still planned here, followed by FB-0034.

<a id="fb-0034--alapvető-többnyelvűség-opcionális-site-választó"></a>

## FB-0034 — Built-in localization and optional site selector

Date: 2026-10-17. Accepted, supersedes FB-0033 missing status.
Single-language sites share localization; optional selector before themes;
consumers own business languages/translations.
PHP/TS locale/catalogs hu/en/de, validation/definition presentation/mail,
Toolbar and initial Form select, CSRF switching/site cookie/HTML/HTTP/bootstrap/
API, single-language hidden-selector mode. Data/dynamic lookups stay unchanged.
Asset v=23; owner additionally requested configured flags beside names.
[I18n](i18n.md), [usage](usage.md#többnyelvűség), [shell](shell.md#opcionális-nyelvválasztó).
Typecheck/build/47 PHP lint/diff and PHP i18n/config/shell/validation/auth/
catalog-placeholder parity passed. Final flagged Chromium 3/3: switching/persistence,
menus/fields/static options/status, validation/mobile/English-only, CSRF/unknown
locale, German Bearer errors/Content-Language. Six shell cases including localized
confirm rerun passed; consumer 4/4, dev three-language load 3/3, images checked.
Render checks sent no real e-mail. Implemented/framework-and-consumer verified.

<a id="fb-0035--valódi-png-zászlók-emoji-helyett"></a>

## FB-0035 — Actual PNG flags instead of emoji

Date: 2026-10-17. Owner saw GB letters on Windows; requested existing ADE PNGs.
Accepted font-independent images. Three original files copied byte-identically
into framework assets, native Toolbar icon CSS embedded as data URLs, login Layout
Toolbar, country-code configuration hu/gb/de. Asset v=26, supersedes emoji.
[I18n](i18n.md), [provenance](flag-assets.md), [usage](usage.md).
Typecheck/build/PHP i18n/diff, byte equality, guarded framework 3/3, consumer
mobile/languages 1/1, actual dev 3/3 passed. Tests decoded 16×11 PNG and visible
icons; dropdown/dev login visually inspected. Implemented/verified.

<a id="fb-0036--kötelező-adminmodul-és-igényvezérelt-keretfejlesztés"></a>

## FB-0036 — Mandatory admin and demand-driven framework work

Date: 2026-10-21. Owner clarified product goals; this original session used one
tool for analysis/prompts and another for implementation.
Accepted: framework-owned user/ACL/key/log admin, PHP reference with language-
neutral JSON, fullscreen DHTMLX/themes/i18n, synthetic examples, four storage
targets/SQLite demo, modular JSON/business handlers/generated catalog.
Original Ext JS benchmark reference is superseded by FB-0037.
Application-only useradmin in FB-0004/ADR-0002 is superseded; framework/ACL rules remain.
Need → smallest general extension → synthetic proof/docs → consumer integration/
consumer-controlled release.
Accepted/planned, Ext JS portion superseded. Source gap inventory/prompt completed,
no runtime implementation. Lifecycle/auth/JSON/storage/events remained questions.
[Product direction](product-direction.md), [usage](usage.md#elfogadott-termékirány--2026-10-21),
[ACL](access-and-actions.md), [concept](concept.md), [ADR](decisions/0002-framework-first.md),
[contract](../AGENTS.md).
Documentation/source reviewed; prior results historical, no runtime run.
Diff/eight-document links passed. Historical /usr/local/bin/gitpush --all -t
attempt failed exit 127; no commit/push. FB-0043 later corrects path/policy.

<a id="fb-0037--ext-js-referencia-visszavonása-dhtmlx-alap-igényvezérelt-képességkör"></a>

## FB-0037 — Withdraw Ext JS reference; DHTMLX and actual needs

Date: 2026-10-21. Owner corrected FB-0036 benchmark/mapping/exhaustive scope.
Accepted no Ext JS parity and no substitute external benchmark; DHTMLX capabilities
grow with actual needs. Other goals remain R1–R12, including then-planned OAuth,
storage guarantees, no eval/automatic catalog grants, events/demo.
Earlier reference remains historical, matrix becomes inventory rather than target.
[Product](product-direction.md), [ADR](decisions/0003-product-direction.md),
[concept](concept.md#0-elfogadott-termékirány--2026-10-21),
[plan](development-plan.md#igényvezérelt-fejlesztési-módszer), [matrix](component-matrix.md),
[usage](usage.md#elfogadott-termékirány--2026-10-21), [README](../README.md),
[contract](../AGENTS.md), [imports](../CLAUDE.md), [auth](authentication.md).
Documentation incorporated, most capabilities still planned. No runtime test
needed/run. Historical Ext JS search left only supersession mentions, links
223/0 errors (including fixing FB-0033 anchor), diff/whitespace passed.
Implemented-status claims inspected in Application/AdminShell/Database/Schema/
Journal/callers/demo. Wrong /usr/local/bin/gitpush absent; no commit/push.

<a id="fb-0038--fiókéletciklus-döntések-az-első-adminszelethez"></a>

## FB-0038 — First admin-slice lifecycle decisions

Date: 2026-10-21. Accepted before runtime implementation:
admin-created temporary password/forced change; disable-only removal with immediate
session/remember/token revocation and retained audit; full name in displayName;
one-use expiring e-mail recovery with uniform response/rate/audit.
Additions: e-mail login everywhere; admin-only keys/no self-service; non-insertable
stores disable create but retain management.
Approved defaults: generated 20 chars/72 hours, reset 30 minutes, 3/15min/account
and 10/15min/IP, normal login afterward, protected admin role, read-derived categories,
self/last-admin protection E8. The earlier “still open” line about those same
durations/reset confirmation is superseded by this approval. Hard deletion/
anonymization and broader OAuth policy remain separate.
[Product](product-direction.md#eldöntve-az-első-adminszelethez--2026-10-21),
[plan/defaults](admin-module-plan.md#4-alapértékek-jóváhagyva-2026-10-21).
Accepted/planned at this checkpoint; documentation links/diff checked.

<a id="fb-0039--beépített-felhasználóadmin-a1-részszelet"></a>

## FB-0039 — Built-in user administration, A1

Date: 2026-10-21. Approved plan implementation:
Accounts over SqlResource/RelatedStorage/Action, disable/re-enable/temporary/forced
change; ManagedIdentities checks framework state alongside consumer allowed;
blade_account_state, read-only SqlResource fields, Application pre-auth change,
JSON admin, DHTMLX change form, generic once-only reveal and hu/en/de.
Demo accounts moved to workspace SQLite/e-mail login; server utility ran idempotent setup.
Difference: Accounts service rather than AccountStore interface; e-mail switch
outside A1.
[Admin](admin.md), [usage](usage.md#beépített-felhasználóadmin),
[config](configuration.md), [auth](authentication.md), [shell](shell.md),
[product](product-direction.md), [plan](admin-module-plan.md).
12 PHP scripts including new admin.php, typecheck/build passed.
Guarded admin browser 2/2; full shell 19/21, two light/dark screenshot timeouts,
targeted compact commands 3/3 passed; auth 4/4/i18n 3/3.
BLADE_TMP_DIR=tmp/a1-browser required because earlier shell-demo sessions belonged
to www-data and were unwritable. Implemented/verification pending (no user acceptance).

<a id="fb-0040--beépített-szerepkör--és-jogosultságadmin-a2-részszelet"></a>

## FB-0040 — Built-in roles and permissions, A2

Date: 2026-10-21. Catalogue generates no rights. Permissions supplies four views
via SqlResource/Lookup, validation/orphans/protected role/last member/self protection/
grantAdministration; Accounts guardDisable/lookup, JSON protected_role and catalogs.
Demo setup grants account 1. UI admin-resource deny rules are prohibited to avoid
lockout; initial admin gets UI only.
[Admin](admin.md#szerepkörök-és-jogosultságok-a2),
[usage](usage.md#beépített-felhasználóadmin), [config](configuration.md),
[ACL](access-and-actions.md), [product](product-direction.md), [plan](admin-module-plan.md).
PHP 13/13 including permissions passed, admin browser 3/3.
Full shell 21/22; mocked presentation failed, separate rerun failed two different
previously green cases. Timing instability on loaded host; no frontend change in
A2 and those fixtures used no PHP. Implemented/verification pending.

<a id="fb-0041--saját-létrehozás-után-az-új-sor-nem-kerül-látótérbe-görgethető-listán"></a>

## FB-0041 — Newly created row remains outside scrolled viewport

Date: 2026-10-21. Tool-observed/open. With many demo users, live refresh inserted
new row at start and increased count, but preserved scroll so numbering started
at 2 until scrolling/filtering. Small lists unaffected.
Proposal, not accepted requirement: show/select newly created record.
Open framework Workspace/ResponsiveGrid behavior, not admin module.
admin.spec.cjs uses filtering to select the row.

<a id="fb-0042--egységes-playwright-konfiguráció-és-gyökérszintű-tmp"></a>

## FB-0042 — Unified Playwright configuration and root tmp

Date: 2026-10-21. Accepted one root config and tmp replacing codex scratch;
supersedes old paths while retaining guard.
[Entrypoint](../playwright.config.cjs), eight named [projects](../tests/browser/config.cjs),
one selected server/default shell, absolute scratch propagation from
[guard](../tools/run-dev-check.sh). Runtime moved/ignored; BLADE_TMP_DIR retained,
separate configs removed.
[Usage](usage.md#fejlesztői-memória-védelme), [development](development.md#egységes-playwright-konfiguráció),
[layout](repository-layout.md), affected topics/entrypoints.
Historical --list 38 tests/eight projects, auth+preferences seven.
PHP config/contracts/auth, lint, Node/Bash syntax/build/links/diff passed;
tmp ignored/untracked. Parallel guard denied with 75.
One targeted Chromium per group passed. First all-server attempt hit
pids.current=128/pids.events max 3, motivating one-project startup without
weakening guard. Sorting scroll request poll failed once, then passed both old/
new config with fresh runtime; instability remains. Full 38-test success not claimed.
Historical wrong gitpush path exit 127/no commit/push superseded by FB-0043;
existing unrelated work preserved. Implemented/targeted verified.

<a id="fb-0043--gitpush-kötelezettség-megszüntetése-és-helperútvonal-javítása"></a>

## FB-0043 — Remove mandatory gitpush and correct helper path

Date: 2026-10-21. Owner decision: no gitpush requirement in this project.
Helper is /space/share/bin/gitpush. Supersedes entrypoint/workflow batch command.
FB-0036/37/42 failures establish only that /usr/local/bin/gitpush was wrong,
not that the host lacked a helper.
[Usage](usage.md#fejlesztési-batch-lezárása),
[workflow](development.md#commit-és-push), [contract](../AGENTS.md), [imports](../CLAUDE.md).
Read-only existence/executable check, no helper invocation; diff passed.
Documentation-only, no runtime test needed. Recorded/incorporated.

<a id="fb-0044--demók-szétválasztása-checkboxos-fiókállapot-oauth-kétfaktor-parancsos-levél-nyelv-api-kulcs"></a>

## FB-0044 — Two demos, account switches, OAuth, mail, language and keys

Date: 2026-10-21. Accepted:
full feature demo grows with every demonstrable capability; /admin/ is mandatory
starter only; field-managed values have no redundant toggle button and disabled
is form/grid checkbox; configured OAuth requires existing e-mail and per-user allow,
without password; demonstrate password/OAuth/e-mail-code; configurable mail command,
formatted overridden texts without real demo mail; selector beside themes and
account default, hidden single-language fields.

E-mail code/selector already existed but were not enabled in demo.
Command means argument list without shell, not executable string (R8).
OAuth bypasses e-mail code/pending temporary password in this path, with no
automatic framework account creation/linking and uniform denied messages.
Key revocation is one-way. Initial mock provider/mailbox were documented external
test-double exceptions; mock later removed.

Implementation: Accounts switches/guard/revocation, ApiKeys/Administration,
original OAuthProvider/OAuthLogin/JSON clients (superseded FB-0046), CommandDelivery/
Layout/OAuthConfiguration/Application locale/mail/OAuth/CSP, ApplicationDefinition
oauth/assets, multiselect, additive Schema columns/frontend, two apps/tasks/
oauth-mock/mailbox and three-worker server utility.
[Demos](demos.md), [admin](admin.md#fiókkapcsolók), [keys](admin.md#api-kulcsok-a3),
[OAuth](authentication.md#oauth-belépés-authhandler), [mail](authentication.md#levélküldés),
[locale](i18n.md#felhasználói-alapnyelv), [multiselect](field-presentation.md#többes-választás-multiselect),
[shell](shell.md), [product](product-direction.md), [usage](usage.md).

Historical PHP 16/16, lint/typecheck/build/diff passed; curl four OAuth identities
(one success/three denials), mailbox code/English mail/UI passed.
Guarded shell 24/27, new demo 6/6/admin 3/3; auth 4/4 after adapting code regex,
i18n 3/3/related 1/1/grid-edit 2/2/sorting 1/1 after known initial scroll failure.
Not passed: presentation shell 3–6 variable timeouts, presentation project 1/2
because mobile filter is under Actions. Baseline without this frontend batch
also failed; recorded as existing issues. Open: real provider check, timing/mobile
filter issue and feature-demo singleton/WebSocket/custom-tree coverage.
Implemented/targeted verified, no user acceptance; own OAuth superseded FB-0046.

<a id="fb-0045--a-demó-a-natív-url-en-rendszerszintű-playwright-automatikusan"></a>

## FB-0045 — Managed demo URL and automatic system Playwright

Date: 2026-10-21. Owner saw unavailable page and questioned separate server when
Apache serves it. Accepted all testing on native URL, not localhost, using system
Playwright.
Cause: 0700 developer-owned demo runtime inaccessible to FPM www-data
(mkdir Permission denied/61de unavailable RuntimeException). Additional mock
autoload/FPM PHP_BINARY/token-port and missing Authorization forwarding defects.
Fixed web instance tmp/web/group modes+ACL, CGIPassAuth, CLI mail interpreter,
then-mock in-process handling/autoload; runner module auto-resolution and ignored
.env.test/BLADE_DEMO_URL.
[Demos](demos.md#webszerveres-futtatás-apache--php-fpm),
[development](development.md#rendszerszintű-playwright-és-natív-url).
Managed /,/admin/,/mailbox/ 200; password/then-mock OAuth/code/English/starter curl
passed; invalid Bearer 401. Shell initial 26/28 (one FPM reset/Bearer defect),
then admin/demo 9/9, formerly unstable presentation 7/7; contracts passed.
One AH01075 Connection reset by peer remained unexplained/nonreproduced; FPM logs
root-only. Implemented/verified, no user acceptance.

<a id="fb-0046--oauth-az-önálló-authhandler-könyvtárral-szebb-nyelvsor-helyi-playwright-törölve"></a>

## FB-0046 — Independent AuthHandler, aligned language row, remove local Playwright

Date: 2026-10-21. Accepted remove local Playwright; improve login language UI;
use unchanged /space/share/libs/_AuthHandler/native overlay as an independent
symlinked library. Supersedes FB-0044 custom OAuth.
Removed extraneous local packages/user-cache browsers/tmp remnants.
Language is first aligned form row/non-text-editable Combo/flags.
AuthHandlerLogin provider-only separate session hands e-mail to 61de, destroys
library session then checks account. Shim/scoped styling, private library link
and public JS/CSS/images only; original clients removed. Mock adapter later
removed FB-0047.
Library unknown-address rows grant no framework rights. email_verified is not
forwarded; simulated unverified case removed and library enhancement proposed
in its own repository.
Consumer reference on minecraft.gegu.hu was unreadable by this user; integration
used library docs/example, no comparison claimed. Real providers then lacked keys.
[OAuth](authentication.md#oauth-belépés-authhandler), [demos](demos.md),
[i18n](i18n.md), [development](development.md#rendszerszintű-playwright-és-natív-url).
PHP 16/16; native curl allowed/off/unknown checks passed. Shell first 27/28,
admin repeat 3/3; demo 6/6 (overlay/handoff/session destruction/language);
i18n 3/3 after locator correction/auth 4/4. Skyblue/dark overlay images inspected.
Implemented/verified, no user acceptance.

<a id="fb-0047--valódi-google--és-facebook-gomb-az-authhandler-overlay-én-mockup-nélkül"></a>

## FB-0047 — Native Google/Facebook buttons without mockup

Date: 2026-10-21. Accepted actual AuthHandler/native icons even without keys,
remove mock, working start and explicit key-file/provider setup.
Listed enabled providers reach overlay; configured checks keys. Missing-key start
returns setup message before Hybridauth, auditing deny. Removed oauth-mock/
DemoOAuthProvider/demo text. Keys remain ignored examples/demo-app/.env with
developer/www-data access only.
[Provider setup](authentication.md#szolgáltatói-beállítás-google-facebook),
[OAuth](authentication.md#oauth-belépés-authhandler), [demos](demos.md#oauth-kulcsok),
[usage](usage.md), [product](product-direction.md).
PHP 16/16, native bootstrap Google/Facebook, missing-key Google 303 feedback,
demo browser 6/6/full shell 28/28 passed; overlay screenshot checked.
Owner then chose existing sanch.hu clients/apps, registered callbacks and supplied
keys without printing them. Both starts 302 with exact redirect_uri; Facebook
showed no error, Google redirect_uri_mismatch remained. Open actual provider
completion/Google callback validity/email_verified limitation.
Implemented/verified, no user acceptance.

<a id="fb-0048--egységes-figyelmeztető-és-megerősítő-párbeszédablakok"></a>

## FB-0048 — Unified warning and confirmation dialogs

Date: 2026-10-21. Accepted independent severity neutral/warning/danger and
acknowledge/confirm modes; icon/title/color, distinct header/body/actions,
wrapping/safe-area margins/scroll/visible buttons, focus trap/restore/ARIA,
explicit Enter/Escape/no accidental destructive action, localized themed defaults,
existing callers and six long/mobile examples.
[MessageDialog.ts](../packages/frontend/src/MessageDialog.ts) provides showDialog/
acknowledge/requestConfirmation/compatible alert+confirm/closeDialogs; CSS,
Action/JSON confirm with translated metadata and reveal.severity. Migrated login/
workspace errors, unavailable external login/checkbox validation, once-only keys,
bulk summaries. No native alert caller remains. Tasks has three confirm→ack actions.
[Dialogs](dialogs.md), [usage](usage.md#figyelmeztető-és-megerősítő-párbeszédablakok),
[demos](demos.md), [actions](workspaces.md#megerősítés-művelet-előtt).
Framework-first exception: Suite confirm Escape/focus/severity/safe-area cannot
meet requirements; [reason](dialogs.md#döntés-miért-nem-a-natív-dhtmlx-alertconfirm).
Missing screenshot attachment meant source-based assessment. No real mobile/iOS/
screen-reader test, no queue, no prior non-demo confirm caller; API has no confirm.
Old native alert OK had Megerősítés aria label; checks now use data-blade-dialog-action=ok.
Typecheck/build/PHP contracts-confirm/admin/validation/lists/config/i18n passed.
Managed full shell 35/35, dialogs 7/7: desktop/320×480, ≥16 px margins,
long scroll/visible buttons/focus/keys/trap/restore/invalid login. Existing specs
migrated selectors. Historical images tmp/dialogs/*.png.
Initial six failures were test selectors/mobile editor click, not product defects.
Implemented/verified, no user acceptance.


<a id="fb-0049"></a>

## FB-0049 — Project renamed to 61de; one development environment

- **Date:** 2026-10-21.
- **Accepted owner instruction:** the project is now **61de**;
  the repository has already been renamed. This project has one development
  environment only, used directly without deployment. Project backups and a
  dev/production split do not apply. The managed test URL is
  `https://61ade.sanch.hu/`.
- **Concrete location:** existing checkout `/space/share/libs/61ade`, active
  host `catalyst`, owner `sanch`. The project name supplied by the owner is
  `61de`; the existing path and hostname use `61ade`.
- **Supersedes:** earlier local canonical checkout `/space/share/libs/61ade`,
  `$CODEX_HOME/backup/project/blade` backup instruction, and application of the
  generic Infra handoff's production/backup/deployment sections to this project.
  FB-0045's managed-URL testing rule remains, using the renamed hostname.
- **Implemented:** updated [agent contract](../AGENTS.md), [Claude entrypoint](../CLAUDE.md),
  [README](../README.md), [usage](usage.md#project-name-and-development-environment),
  [development workflow](development.md#development-environment),
  [repository layout](repository-layout.md), [demos](demos.md),
  [OAuth configuration](authentication.md#szolgáltatói-beállítás-google-facebook),
  [product direction](product-direction.md#project-identity-and-environment) and
  historical [foundation decision](decisions/0001-foundation.md).
- **Original scope (superseded by [FB-0050](#fb-0050)):** this initial
  documentation-only change did not migrate code/package/database identifiers. No host configuration, backup service, production tree or consumer
  runtime is changed. The supplied Infra onboarding is a subsequent task;
  credential enrollment and handoff readiness are not claimed here.
- **Local configuration:** updated only the existing `BLADE_DEMO_URL` setting in
  the ignored `.env.test` and `examples/demo-app/.env` files to the managed
  hostname. Credentials and external provider-console settings were not changed.
- **Verification:** relative documentation file links and the explicit feedback
  anchor checked; `git diff --check` passed. Both `/` and `/admin/` returned HTTP
  200 with expected framework titles and frontend scripts after the URL-setting
  update. Both ignored URL settings match. No browser suite was run; real
  provider login and the exact platform document-root mapping were not verified.
- **Checkpoint:** changes remain in the working tree. The affected tracked files
  already contained unrelated edits and `docs/demos.md` was already untracked;
  no mixed commit was created. Existing staged work was preserved.


<a id="fb-0050"></a>

## FB-0050 — Complete name refactor and blade identifier fallback

- **Date:** 2026-10-21.
- **Accepted instruction:** replace the former framework name throughout the
  project, including code, packages, database identifiers, configuration, demos,
  tests and documentation. The owner selected **blade** wherever the numeric
  product name cannot be an identifier. This supersedes FB-0049's initial
  documentation-only scope and its identifier-preservation statement.
- **Naming contract:** product/packages `61de`; namespace `Blade\`; technical
  prefix `blade`, environment prefix `BLADE_`. Existing path and hostname keep
  `61ade`. The GitHub API resolves the previous origin to `sanch78/61ade`; the
  configured origin was updated to that verified destination, preserving transport.
- **Implementation:** PHP namespace and Composer PSR-4 mapping, npm/Composer
  manifests/locks, frontend selectors/datasets/preferences, request headers/query
  keys, built-in resources/fields/tables, local env keys and generated package
  integration metadata. No third-party library implementation or consumer project
  was edited. The synthetic demo password is now `61de-demo`.
- **Data:** new explicit [SQLite prefix migration](../packages/php/migrations/0001-rename-prefix.php);
  all eleven tables in each of the two managed-web and two CLI-demo databases
  migrated without deleting data. Built-in ACL identifiers, audit fields and token
  scopes translated; customized passwords preserved. Old sessions/preferences are
  not carried across the namespace change. MySQL migration is not implemented.
- **Usage and constraints:** [renaming](renaming.md), [usage](usage.md),
  [development](development.md), [agent contract](../AGENTS.md).
- **Verification:** PHP lint 96 files PASS; all 16 PHP contract/integration checks
  PASS; frontend typecheck/build and local asset preparation PASS; shell/Node
  syntax 24 files PASS; npm dependency tree, Composer manifest hash/path-package
  consistency and all 400 documentation file/fragment links PASS. Source-name
  inventory is clear. Built assets contain no old identifiers; a coincidental
  character sequence inside a binary data URL is not an identifier and was preserved.
  Both managed URLs return HTTP 200 with new titles/bootstrap names. All four
  databases have eleven renamed framework tables and no previous schema names.
  Synthetic migration checks PASS for retained data, deny rules, both scope
  formats, indexes, collision refusal, transaction rollback and idempotency.
- **Browser result:** complete managed-URL `shell` run: **32/35 PASS**. Two failures
  were caused by the existing synthetic viewer's preserved `disabled=1` state;
  both passed on a targeted **2/2** repeat with that fixture temporarily enabled,
  after which its disabled state was restored. The remaining test reached Google's
  actual `redirect_uri_mismatch` page. Native provider buttons/overlay were visible;
  a read-only HTTP start returned 302 to Google with the correct current callback.
  The external Google client's allowed callback requires owner-side correction;
  completed provider login is not claimed. Other fixture browser groups were not
  launched because this host's tests must use the managed URL.
- **Other limitation:** the existing standalone UI-preferences unit script fails
  because its layout double lacks `getRootNode()`. The actual module's only change
  from HEAD is the storage-key prefix; the stale double was not broadened in this
  rename task. Composer is absent, so a fresh dependency install was not tested.
- **Cleanup/checkpoint:** temporary migration test source, reports and task-created
  synthetic browser accounts/roles/API keys/notes were removed; live demo databases
  and existing user state retained. Changes remain in the working tree because
  the same files already contain unrelated edits; no mixed commit or push was made.

<a id="fb-0051"></a>

## FB-0051 — Development/testing only; no deployment or project backups

- **Date:** 2026-10-22.
- **Accepted owner clarification:** this project has only the existing development
  environment. Develop and test directly there. There is no development/production
  split, deployment or post-deployment testability to provide. Project backups
  also do not apply. This reinforces FB-0049 and overrides generic onboarding
  deployment/backup assumptions; it does not authorize deleting retained evidence
  or changing platform backups.
- **Canonical guidance:** [development](development.md#development-environment),
  [usage](usage.md#project-name-and-development-environment),
  [project contract](../AGENTS.md), [demos](demos.md).
- **Implementation:** documentation only. Existing public capabilities, product
  languages and code remain unchanged.
- **Verification, 2026-10-22:** both managed URLs returned HTTP 200 with TLS
  verification result 0. A temporary nonce source probe confirmed immediate
  source visibility and exact PHP document root
  /space/share/libs/61ade/examples/demo-app/public; both probe/link were removed.
  Private dotfiles returned 403, application/AuthHandler PHP paths 404; attempted
  composer.json/database paths returned the same login HTML as the root, with no
  manifest/database disclosure. Vhost IP restrictions were inspected; denial
  from a genuinely untrusted network was not tested from this host.
  Protected discovery found 51 tests across eight projects. One existing managed
  Chromium login/menu/footer/logout check passed (1/1). An initial overly exact
  grep selected no tests, then the corrected title selector ran the actual browser.
- **Coverage limits:** preserved localhost fixture projects cannot launch under
  the current managed-URL contract. No full application smoke was required or
  run for this documentation task. Existing external OAuth callback and
  preferences-unit-double limits remain as recorded in FB-0050.
- **Documentation verification:** all 30 maintained documents have English prose;
  localized examples/labels, technical identifiers, historical evidence and legacy
  fragment anchors are preserved. All 396 local file/fragment links and the
  documentation whitespace check passed.
- **Cleanup:** removed the nonce probe/link and isolated browser output/cache.
  Existing suites, demo data, retained evidence and concurrent changes were preserved.
- **Status:** accepted and incorporated, documentation verified. No production,
  deployment, post-deploy testing, backup workflow or new permanent test was created.

<a id="fb-0052"></a>

## FB-0052 — Browser tests only on the feature demo; localhost fixtures removed

- **Date:** 2026-10-22.
- **Accepted instruction:** the seven browser projects that started localhost
  fixture servers (`auth`, `related`, `grid-edit`, `sorting`, `preferences`,
  `presentation`, `i18n`) are migrated onto the managed feature demo. No legacy
  route remains: fixture routers/servers, the extra Playwright projects and the
  localhost demo launcher are removed. Supersedes the "preserved but not
  launchable" coverage limit of [FB-0050](#fb-0050) and [FB-0051](#fb-0051).
- **Feature demo additions:** Tasks `after_save` business rule (an in-progress
  task keeps its notifications; the field error rolls the save back), the
  read-only Mérések list with 1801 rows, and `reader@example.test` with the Tasks
  description field denied. Setup now adds missing synthetic accounts to an
  existing database; an account added later takes the next free id.
- **Framework defect found by the migration:** the Enter that committed an
  inline grid edit also activated the focused OK button of the validation message
  it raised, so the message closed instantly. `MessageDialog` now ignores keyboard
  clicks until a new key press inside the dialog; pointer clicks are unchanged.
- **Second framework defect found:** with list responses slower than about
  300 ms, editable grid headers never received their `aria-description`; the
  one-time pass after the first redraw ran before the header cells existed in
  their final form. `GridHeaders.decorate()` now also runs after every data
  render ([workspaces](workspaces.md)). The localhost fixtures were fast enough
  to hide it.
- **Usage:** [development](development.md#existing-full-smoke-and-coverage-limits),
  [Playwright configuration](development.md#unified-playwright-configuration),
  [demos](demos.md), [dialogs](dialogs.md#keyboard-and-focus).
- **Coverage changes:** the single-language consumer has no managed demo; its
  hidden selector lost its browser check (translation stays in `i18n.php`).
  German is not offered by the demo, so the browser checks use Hungarian/English.
  SMTP transport stays covered by `mail.php`; the demo delivers by command.
  `twofactor@example.test` allows five code sends per ten minutes, so the
  authentication and demo specs can be repeated only after ten minutes.
- **Open question:** a session restored from the remember cookie starts in the
  site default language; the account default language applies only to password,
  code and OAuth logins ([i18n](i18n.md#account-default-language)). Whether
  restoration should apply the account default is not decided.
- **Verification, 2026-10-22:** PHP lint and 13 PHP checks PASS (contracts,
  related-fields, grid-edit, sorting, authentication, i18n, list-presentation,
  configuration, lists, validation, access, permissions, admin); typecheck,
  build and demo assets PASS; setup ran on both demo instances; 405 local
  documentation links and the whitespace check PASS. Full managed browser run:
  **46/49 PASS**, all 14 migrated tests included. The three failures are the
  FB-0050 states: `viewer@example.test` keeps `disabled=1` (authorization test,
  API-key call 401 instead of 404) and Google returns `redirect_uri_mismatch`.
- **Cleanup:** temporary exploration specs and browser output removed; accounts,
  roles, rules and unrevoked API keys created by these runs deleted; created
  tasks are deleted by the specs. Older test accounts/roles from earlier
  sessions were left unchanged.
- **Status:** implemented and verified on the managed URL; the open question
  above remains.

<a id="fb-0053--másodlagos-grid-oszlopok-kapcsolása"></a>

## FB-0053 — Toggleable secondary grid columns

Date: 2026-10-23. Requested a Grid Toolbar dropdown listing secondary-use
fields whose visibility can be enabled or disabled. Implemented as the shared
`column.secondary` presentation capability: native DHTMLX menu checkboxes call
the Grid `showColumn`/`hideColumn` API, while the existing per-user view
preferences retain the selected state. The Columns menu is omitted when the
view has no secondary columns. Cards and details keep all permitted readable
fields.
The admin account view marks password-change-required, OAuth, locale and email
confirmation status as secondary; these remain visible initially and can be
hidden per user.

The synthetic browser check exercised omission without secondary columns and
opening the Columns menu, hiding and restoring a secondary column; typecheck,
build, asset preparation, PHP lint, contracts and diff checks passed. User
acceptance remains pending.

<a id="fb-0054--önálló-api-kulcs-menü-és-saját-kulcsok"></a>

## FB-0054 — Standalone API-key menu and self-scoped keys

Date: 2026-10-23. Accepted: API keys move out of the Administration submenu to
their own root-menu item. The existing `blade_api_keys` ACL catalogue now also
supports self-service through `own` UI rules: a permitted actor sees the menu,
can issue and manage keys owned by that actor, and cannot list or open another
owner's key. Administrator `all` rules continue to cover account-wide work.

The framework API-key resource uses owner-scoped SQL listing and target checks;
self-service account choices include the current actor without exposing the
account administration view. The owner input exception is opt-in and remains
disabled for other consumer resources.

<a id="fb-0055--egyedi-muveleti-parancsok-es-ikonok"></a>

## FB-0055 — One command per action and complete action icons

Date: 2026-10-23. Requested: remove the separate “selected rows” command from
the list toolbar. Implemented: every action keeps its original label and icon;
when marks exist, a bulk-capable action applies to those rows. Actions with
input fields open the bulk form; field-free commands execute directly. Sort
choices also expose native icons, and the bulk form title refers only to the
row count.

The frontend bulk and list presentation browser checks were updated to use the
original command. Typecheck, build, asset preparation, PHP i18n/list contracts,
and the two focused managed-URL browser checks passed. User acceptance remains
pending.

<a id="fb-0056--minden-muvelethez-ervenyes-ikon"></a>

## FB-0056 — Every action uses a bundled icon

Date: 2026-10-23. Review found that the demo warning and danger actions used
icon aliases absent from the bundled DHTMLX font, leaving their disabled menu
rows without glyphs. Replaced them with the bundled `alert-circle` and
`close-circle` glyphs. The workspace icon contract now explicitly requires a
bundled glyph for every configured action icon.

<a id="fb-0056--formok-megse-muvelete"></a>

## FB-0056 — Explicit Cancel on editable forms

Date: 2026-10-23. Requested: Add/Modify forms should offer Cancel, with the
same escape route on other forms where abandoning the current input is logical.
The shared frontend form actions now expose Cancel beside Save or the operation
button for panel and overlay Add/Modify forms, singleton editing, card editing,
bulk operations and mobile filter dialogs. Cancel closes the transient form or
restores the singleton form from its current row; it never submits values.
Desktop filter panels retain Apply and Reset because they are persistent.

The framework build and demo assets were regenerated; TypeScript validation
passed. A managed-URL `related-fields` browser run was attempted after the
guard became available, but the existing feature page loaded without its
panel form region before the assertion, so this batch does not claim a passing
browser result for the new Cancel controls.

<a id="fb-0056"></a>

## FB-0056 — No redundant intermediate action dialogs

Date: 2026-10-23. Accepted correction: do not require a user to press a
button only to reach another button that starts the same field-free action. A
field-free individual or bulk command now executes from its originating
control; successful results are acknowledged with a non-blocking gritter/toast.
The shared confirmation dialog remains available when an action declares a
meaningful risk, and alerts remain for errors or other necessary blocking
information. Forms remain for actions that need input fields.

Implemented in the shared frontend workspace execution path and documented in
[development](development.md#mandatory-framework-development-rules),
[dialogs](dialogs.md#szerver-által-deklarált-megerősítés),
[workspaces](workspaces.md#tömeges-műveletek-és-ikonok) and
[usage](usage.md#figyelmeztető-és-megerősítő-párbeszédablakok). Existing
individual and bulk browser checks now assert that the field-free command does
not open a dialog; input-bearing bulk updates retain their form.

Verification, 2026-10-23: TypeScript typecheck, frontend build and demo asset
preparation passed; PHP contracts and list/bulk checks passed; the managed
`list-presentation` direct-bulk check passed 1/1 and the managed feature-demo
integration check passed 1/1. The change is implemented; user acceptance
remains pending.

<a id="fb-0057--integralt-grid-fejlec-szurok"></a>

## FB-0057 — Integrated grid header filters

Date: 2026-10-23. Requested for the Feature demo Tasks list: place the relevant
filter control above each displayed grid field and filter the list by its value.
Implemented in the shared Grid/Workspace path with native DHTMLX input filters
for text/number fields and option pickers for select/checkbox fields. Empty
controls remain empty and omit the field from the request; changing a control
reloads the ACL-scoped server result and keeps the existing bounded-window and
count behavior. The separate filter panel remains for filterable fields omitted
from the grid and for mobile/persistent workflows.

Typecheck, frontend build and managed `grid-sort` browser coverage passed after
the header filter was added. User acceptance remains pending.

Follow-up 2026-10-24: after a select filter was chosen, the input showed the
technical option key and reopening listed only that option, so another value
could not be chosen. Option picker items now carry the visible label as the
DHTMLX value (the key stays the item id and the request value), and an input
that exactly equals an option label lists every option. The managed
`grid-sort` filter test now reselects a second option after the first choice.

<a id="fb-0058"></a>

## FB-0058 — Virtual two-panel file manager (first vertical slice)

- **Date:** 2026-10-23.
- **Request:** a Norton Commander-style virtual file manager in the full feature
  demo, built as a reusable framework capability: a virtual `demo` space with
  fictional Drive A/B/C mounts, two panels with independent mount selection,
  directory Tree and file Grid, create directory (depth ≤ 5), copy/move to the
  opposite panel, `.txt` editing and binary upload. No deletion in this slice;
  no host directories, web-root storage, TreeGrid PRO or new frontend framework.
- **Accepted design:** framework `Blade\Files` (`FileStorage` over the
  `blade_files` table with BLOB content, `FileManagerDefinition`,
  `FileActions`), a `files` view kind, `FileManager.ts` and `TreeAdapter.ts`.
  All operations are registered actions through the common executor; the ACL
  object is the mount key. Supporting framework extensions: opt-in multipart
  transport (`Action::$upload`, `Context::$uploads`), `Failure::$details`,
  ID-only audit `detail`, resolver `acl_id`, `requestChoice` in the shared
  dialog, `ResponsiveGrid` `idColumn: false`.
- **Decisions taken in implementation:** one conflict decision applies to all
  conflicting items of a request; overwrite replaces files only (directories
  are reported as failed, never merged or deleted); move needs `move` on the
  source mount as well as `list`; the depth limit applies to directories; the
  directory name field is trimmed by the shared `Field` normalization, upload
  names with outer spaces are rejected; names are unique case-insensitively.
- **Framework defect found:** two concurrent deferred SQLite transactions that
  both read and then write audit failed immediately with `SQLITE_BUSY` (both
  panels loading at once returned a 500). The executor and list observer now
  begin SQLite transactions with `BEGIN IMMEDIATE`
  ([access and actions](access-and-actions.md#multipart-audit-detail-sqlite)).
- **Usage:** [files](files.md), [usage](usage.md#virtuális-fájlkezelő),
  [demos](demos.md#teljes-feature-demó-), [dialogs](dialogs.md),
  [component matrix](component-matrix.md).
- **Follow-up instruction (same day):** a panel shows either the tree or the
  file listing, selectable, as in mc. Implemented as per-panel view modes;
  in tree mode the selected folder is the panel's folder and, as a source, the
  copied/moved item. Create-folder, upload and editor windows gained Cancel
  beside the submit button (FB-0056 rule).
- **Framework defect found:** `ResponsiveGrid` read the width of a host inside
  an inactive Layout view (no DOM) and threw; it now skips resizing until shown.
- **Follow-up feedback (same day):** a stray border showed at the top and
  bottom of the gap between the panels: the panel group was a `none` group
  inside the `space` layout, which drew its own frame. The group is now a
  native `wide` group without the custom gap/border overrides. The divider
  between the panels is draggable.
- **Follow-up feedback (same day):** the divider still behaved custom: dragged
  fully left and then right, the divider stopped and the right panel shrank
  from its right edge. Cause: `minWidth` makes a DHTMLX Layout cell fixed, and
  a `calc()` width rewritten after each drag fought the native pixel logic.
  The panels now use the plain native resizer without width, `minWidth`,
  stored share, custom grip, keys or ARIA; only `contain: inline-size` keeps
  content from sizing the cells. The browser spec drags left and back right.
- **Follow-up feedback (2026-10-24):** the tree should show files too; the
  listing should use row marking as Notes does, without a checkbox column, and
  show an icon by MIME type; the divider's dots sat on the left panel's border
  again. The `tree` action now returns files (first 5000, `truncated`), the
  tree shows them as leaves with MIME icons and a chosen file is the operand.
  The listing uses `rowSelection` and a new framework `icon` column type. The
  grip was Suite's factory wide-layout position (right 13 px, on the cell
  border); the FB-0013 centring rule now covers wide layouts too. Found while
  testing: a Layout `views` switch re-created the listing's DOM and dropped
  `ResponsiveGrid`'s row-marking listeners, so the panel modes now toggle cell
  CSS instead.
- **Follow-up feedback (2026-10-24, later):** no Up button; the grid should have
  a `..` row instead. The panel header should show the current path, smartly:
  cut when it does not fit, the full path on hover. The listing's first row in
  a subfolder is now `..` with the framework's `_markable: false` row flag; it
  opens the parent with the cursor on the folder left. The Layout cell header
  shows the path; folders are collapsed from the root side until it fits, and
  the native Suite tooltip shows the full path.
- **Follow-up feedback (2026-10-24, editor window):** the text editor window
  again had a large empty band below its buttons; a recurring problem that
  the skill or the code must prevent. The editor was the only content window
  not sized by `fitWindow`, and its textarea had a fixed pixel height in a
  larger (and resizable) window. Fixed in the framework: `fitWindow` sizes
  every content window, and a Form textarea's cell grows into the height the
  window has or gains beyond its fitted content (paused while measuring), so
  workspace forms that users enlarge are covered too. The browser spec checks
  the gap after opening and after a drag of the window's bottom edge; the
  skill records the rule.
- **Follow-up feedback (2026-10-24, document windows):** a tasteful editor:
  a full one-cell Layout in the window with the editor inside and a button
  row (at least a Save icon); the same for an image viewer and a video
  player. Implemented as document windows: a full-window Layout with a native
  Toolbar row above the content cell (editor: Save with Ctrl+S, line wrap,
  cursor position, save state; image: zoom steps, fit/50/100/200 %,
  rotation, dimensions and size; video: native controls, loop, speed,
  dimensions and length; all: native full size). The bytes come from the new
  `content_get` action through the framework `Download` result (allowlisted
  type, `nosniff`, attachment, sandboxing CSP) as a blob URL; the shell CSP
  allows `blob:` images and media. Upload accepts `mp4`/`webm` with detected
  MIME types; the demo seeds `Drive A/Média` with a synthetic fractal JPEG and
  a test-pattern WebM. The editor's Cancel button is replaced by the window
  close with the unsaved-changes confirmation. The managed nginx strips the
  application's CSP headers, so the browser spec checks type, `nosniff` and
  disposition, not the CSP.
- **Follow-up instruction (same day):** when the viewport is unsuitable the
  content is not shown; a centred alert-style container says `Csak desktop
  környezetben elérhető funkció`. This is a system option a feature requests in
  its configuration: generic view option `desktopOnly` / JSON `desktop_only`
  ([shell](shell.md#desktop-only-views)); the demo file manager opts in.
- **Resolved (2026-10-24, [FB-0063](#fb-0063) U3):** `ResponsiveGrid` bound its
  root DOM listeners once, so a host that re-created the grid's Layout DOM
  (such as a `views` switch) lost row marking, card scrolling and card editing.
  The listeners are now delegated from the document and filtered by the current
  root, and a re-created root is observed again ([workspaces](workspaces.md#media-tiles));
  `mobile-grid.spec.cjs` re-creates the root through a host `views` switch.
- **Open:** deletion, download/preview, per-entry permissions, lazy trees and
  paged lists, JSON module configuration and an external blob store.
- **Status:** implemented; verification results are listed in
  [files](files.md#demo-and-verification) and the task report. User acceptance
  is pending.

<a id="fb-0059"></a>

## FB-0059 — Single-record commands are disabled while several rows are marked

- **Date:** 2026-10-24.
- **Observation:** in Notes (row marking), with several rows marked, the
  `Módosítás` command stayed enabled although no Notes field is bulk-editable;
  it opened the single-record editor for the active row only.
- **Expected:** with multiple marks, a command that cannot apply to the marks
  is unavailable; this covers every command that is not meaningful for a
  multi-row selection, not only update.
- **Scope:** general framework rule in the workspace toolbar.
- **Implementation:** `Workspace.capabilities()` disables non-bulk object
  actions and `Adatok` while two or more rows are marked; bulk-capable actions
  and create stay available. The click handler applies the same guard.
  [Workspaces](workspaces.md#tömeges-műveletek-és-ikonok).
- **Verification (agent):** `list-presentation.spec.cjs` checks that a non-bulk
  action and `Adatok` are disabled with two marks and enabled again with one;
  `list-presentation.spec.cjs` and `list-integration.spec.cjs` 10/10 pass.
  The live-login demo/workspace specs failed at sign-in both with and without
  this change (pre-existing environment issue), so the live Notes view was not
  rechecked by browser test.
- **Status:** implemented; user acceptance pending.

<a id="fb-0060"></a>

## FB-0060 — Visual diagram editor: network topology builder demo

- **Date:** 2026-10-24.
- **Request:** a visual workflow demo with movable elements where new elements
  can be defined; the demo is a network topology builder.
- **Accepted design:** reusable framework capability `Blade\Diagram`
  (`DiagramStorage` over `blade_diagrams`/`blade_diagram_types`,
  `DiagramDefinition`, `DiagramActions`), a `diagram` view kind and
  `DiagramEditor.ts`. The consumer declares the element palette, connection
  types and limits; users may define further element types at runtime (name,
  framework glyph, shape, colour). All reads and writes are registered actions;
  the ACL object is the space; saved content is rebuilt canonically on the
  server.
- **Framework-first exception (narrow):** Suite Standard has no diagram widget
  and DHTMLX Diagram is a separate, uninstalled product, so only the drawing
  surface is an own SVG element; the shell, palette and diagram lists, property
  form, windows, dialogs and toasts are Suite adapters. Considered extension:
  a licensed DHTMLX Diagram adapter, which would replace only the canvas
  ([diagrams](diagrams.md#building-blocks)).
- **Decision taken in implementation:** "new elements" was read as
  user-defined element types at runtime, in addition to the consumer palette;
  placing elements on the canvas is the other half. Open question for the
  owner whether element types should also carry custom properties/ports.
- **Framework lesson:** replacing the widget of an already rendered Layout cell
  follows the workspace detail order — `detach()`, destroy the old widget,
  `awaitRedraw()`, then `attach()`; attaching directly over earlier HTML left
  the cell empty without an error.
- **Usage:** [diagrams](diagrams.md), [usage](usage.md#vizuális-diagramszerkesztő),
  [demos](demos.md#teljes-feature-demó-), [component matrix](component-matrix.md).
- **Verification (agent):** `php8.4 tests/shell/diagram.php` pass;
  `npm run test:browser -- tests/shell/diagram.spec.cjs` 4/4 pass on the
  managed URL; `i18n.php`, `contracts.php`, `files.php`, `access.php` pass;
  `npm run typecheck` clean.
- **Status:** implemented; user acceptance pending.

<a id="fb-0061"></a>

## FB-0061 — Event calendar: digital signage (DMS) scheduler demo

- **Date:** 2026-10-24.
- **Request:** a calendar view like a DMS scheduler; image and video assets
  that can be scheduled into the programme; a recurring option; a demo of an
  API query that tells what goes on air on a selected day; a default content
  that can be given per day.
- **Follow-up instruction (same day):** not with the grid manager; use the
  native DHTMLX calendar solution. Accepted: the view is the native DHTMLX
  Scheduler Standard (GPL), the component the [matrix](component-matrix.md)
  lists for the event calendar; the newer DHTMLX Event Calendar is a paid
  product and not installed.
- **Accepted design:** reusable framework capability `Blade\Calendar`
  (`CalendarDefinition` over `blade_calendar_events`, `CalendarActions`,
  `Recurrence`), a `calendar` view kind and `Calendar.ts`. All reads and writes
  are registered actions with the space as ACL object; the Scheduler recurring
  model (series, moved and deleted occurrences) is stored as is and expanded
  on the server by `occurrences` for API consumers. The DMS logic stays in the
  feature demo consumer.
- **Decisions taken in implementation:** "default content per day" is
  implemented both per weekday and per specific date (the date wins); assets
  reference image/video files of the demo file manager; in the playlist
  timeline the latest-starting active programme wins and free time falls back
  to the default. Open question for the owner whether overlapping programmes
  need explicit priorities or a playlist of several assets per slot.
- **Framework lessons:** the Standard Scheduler is a single shared instance,
  so a view borrows and releases it instead of destroying it; occurrence copies
  inherit series fields through their prototype, so the save router reads the
  live event, not the data processor's serialized copy; the Scheduler reports
  view changes that keep the window (opening the lightbox), and a reload must
  not replace the data while a save is pending. The vendor Hungarian catalogue
  contains mistranslations, overridden by framework captions.
- **Follow-up instruction (same day):** "use unified form handling; the
  Scheduler's forms differ" (screenshot of the vendor lightbox with its select
  rows). Accepted: the vendor lightbox is replaced by the framework's Suite Form
  in a Window (the shared field inputs, Cancel + Save row, `FormValidation`
  with inline errors), the recurring scope question uses the shared choice
  dialog (`scheduler.ext.recurring.confirm`), deletion uses the shared danger
  confirmation, and the vendor select bar (inline edit, vendor delete confirm)
  is off. The form hands its values to the Scheduler the way the lightbox does,
  so the recurring plugin's occurrence/following/series handling is unchanged.
  Framework additions: `FormValidation.clearServerError()` for cross-field
  errors, exported `input`/`formActions` from `Workspace.ts`, and Suite
  Calendar/TimePicker locale (month/day names via `Intl`). Suite 9.3 datepicker
  repaints a typed value away when its open popup closes, so the date fields are
  picked in the popup (`editable: false`).
- **Usage:** [calendar](calendar.md), [usage](usage.md#eseménynaptár),
  [demos](demos.md#teljes-feature-demó-), [component matrix](component-matrix.md).
- **Verification (agent):** `php8.4 tests/shell/calendar.php` pass;
  `npm run test:browser -- tests/shell/calendar.spec.cjs` 6/6 pass on the
  managed URL after the form follow-up (shared form create, single-occurrence
  exception via the choice dialog, period validation and weekly series rule); `contracts.php`, `i18n.php`, `configuration.php`, `access.php`,
  `files.php`, `diagram.php` pass; `npm run typecheck` clean.
- **Status:** implemented; user acceptance pending.

<a id="fb-0062"></a>

## FB-0062 — Sibling items beside the collapsed desktop main menu

- **Date:** 2026-10-24.
- **Request:** when the main menu is a single button on desktop and the open
  menu item has siblings in the menu tree, show the relevant items next to the
  main menu (example: `#feature=signage_assets`).
- **Accepted design:** `AdminShell` renders, after the compact `Menü` button
  and a native separator, the items of the open feature's branch as native
  top-level Menu items with prefixed IDs; the open one uses the native `active`
  state. Only at ≥ 768 px, only for nested items, and only when they fit by the
  existing width estimate; route changes re-render the menu.
- **Decision taken in implementation:** top-level features show no siblings,
  since their siblings are the whole collapsed menu.
- **Usage:** [shell](shell.md#kompakt-ablakfejléc-és-teljes-mobilmenü),
  [usage](usage.md).
- **Verification (agent):** `npm run typecheck` clean; build and demo assets
  prepared; `npm run test:browser -- tests/shell/browser.spec.cjs -g "compact
  desktop"` pass; `i18n.spec.cjs`, `files.spec.cjs`, `preferences.spec.cjs`
  pass after the shared `openMenu` step. Failures seen in the same runs and not
  caused by this change: `browser.spec.cjs` tests expecting an uncollapsed
  1280 px menu and the viewer login, `dialogs.spec.cjs` actions that open a
  confirmation instead of a form, `grid-sort.spec.cjs` select header filter.
- **Status:** implemented; user acceptance pending.

<a id="fb-0063"></a>

## FB-0063 — Uploader and file/media list decisions

- **Date:** 2026-10-24.
- **Request:** a proper file uploader and a very good file list view for
  `#feature=signage_assets`, and the same new uploader in `#feature=files` and
  for every future upload.
- **Owner decisions:** disk content storage instead of DB BLOBs; 100 MB per
  file, at most 20 files per upload; video length is not validated at upload;
  ffmpeg/ffprobe may be used; signage assets' files are visible and managed in
  the file manager (shared files, dedicated demo mount); the file manager keeps
  its two panels; first version includes chunked/resumable and background
  upload, folder upload, clipboard paste (also into file manager panels),
  delete, rename and download; deleting a used file warns and clears the
  references; thumbnails are produced by a background task; build our own
  uploader on DHTMLX components (no Vault purchase, no Uppy); multi-file ZIP
  download is in the first version.
- **Delete policy decision:** the framework gets a configurable delete
  behaviour, `archive` (hidden as if deleted) or real `delete`. The demos use
  real delete; for framework development archive is the recommendation, but
  it is a per-case decision. Permission-gated visibility of archived records is
  always consumer-specific and needs no system-level feature.
- **Scope note:** `files` and `signage` are synthetic demo consumers showing
  the capabilities, not a DMS or file-manager product; real consumers configure
  the capabilities.
- **Plan:** [uploader and file/media list](files-media-plan.md).
- **U1 — disk content store, metadata, derivative tasks (implemented
  2026-10-24):** `ContentStore`, `MediaProbe`, `Thumbnails`, `TaskQueue`,
  `DownloadStream` and GET-capable actions (`content_stream`,
  `thumbnail_get`); `FileManagerDefinition` options `contentRoot`, `tempRoot`,
  `maxFiles` (replaces `multiple`) and `thumbnails`; migration 0002; the viewers
  load the GET stream. Guide: [files](files.md). Decision taken in
  implementation: `content_get` keeps its POST contract beside the new
  `content_stream`; derivative rows are only `ready`/`failed`, "pending" comes
  from the task state; a render failure is not retried on read.
  Found while testing: Suite Grid reads a row's `height` property as its pixel
  height, so the listing keeps media dimensions as `media_width`/`media_height`;
  the general guard for record fields named `height` belongs to U3.
  **Verification (agent):** `php8.4 tests/shell/files.php`, `access.php`,
  `lists.php`, `configuration.php`, `i18n.php`, `contracts.php`, `calendar.php`,
  `list-presentation.php` pass; `npm run typecheck`, `npm run build`,
  `npm run demo:assets` clean; `npm run test:browser --
  tests/shell/files.spec.cjs` 6/6 pass on the managed URL (Range `206`, `416`,
  `304`, HEAD, WebP thumbnail, cross-site and per-mount GET denial, seeking).
  Retained demo data of `tmp/demo` (20 files) and `tmp/web` (24 files) was
  migrated, verified (store and BLOB hashes) and the BLOB column dropped.
  `demo.spec.cjs` fails in 4 tests that click raw menu items or the
  unconfigured Google overlay (the FB-0062 collapsed-menu change; not caused
  by U1).
- **U2 — uploader (implemented 2026-10-24):** `UploadPolicy`, the `__upload`
  transfer protocol in `Transfers` (preflight, owner-bound resumable chunks,
  finish through the executor, TTL sweep), `Action::$upload` accepting a
  policy, per-file codes, folder upload with depth/name checks; the
  `uploads` window on Suite Window/Layout/Grid with drop, folders, paste,
  3 parallel transfers, per-file conflict choice with "apply to all"
  (`requestChoiceAll`), background upload with the lower-bar indicator and a
  toast, resume after reload by re-adding the file. Guide: [uploader](uploader.md).
  Decisions taken in implementation: the plan's `blade.upload.open` is the
  module export `uploads.open` (no window global); every operation authorizes
  before reading the transfer; a browser cannot keep a file across a reload,
  so resuming needs the file to be added again.
- **U3 — media-aware lists (implemented 2026-10-24):** `column.media` with
  `MediaSource`/`FileMedia` descriptors (`_media`) limited to readable mounts,
  `recordMedia()` (lazy thumbnail, type icon fallback, duration badge,
  type-stating name), `presentation: "icon"`, the MIME-class filter, declared
  server search, `rowHeight` in all paging math, the `tiles` mode
  (`tileMinWidth`), keyboard navigation, the tiles mode in `UiPreferences`, a
  guard for record fields named `height`/`css`, and the FB-0058 listener fix.
  Guide: [workspaces](workspaces.md#media-tiles). The signage `Médiatár`
  declares a media column, tiles, search and the type filter.
  **Verification (agent, U2+U3):** PHP `files`, `lists`, `list-presentation`,
  `configuration`, `access`, `sorting`, `i18n`, `contracts` pass;
  `node tests/shell/ui-preferences.mjs` passes (it failed before U3 on its
  own mock); typecheck/build/demo assets clean. Browser specs run one at a
  time on the managed URL: `uploader` 10/10, `files` 6/6, `list-presentation`
  9/9, `preferences` 3/3, `calendar` 6/6, `mobile-grid` 3/3 (its
  `native cards preserve selection…` test had failed since FB-0062 by clicking
  the `Jegyzetek` item directly inside the collapsed main menu; it now uses the
  shared `openMenu` step); `dialogs` 2/8 — the
  new `requestChoiceAll` case passes, the six severity tests are the known
  FB-0062 failures. Running several heavy specs in one guarded invocation can
  hit the guard's 128-task limit (`spawnSync … EAGAIN`) and time out; single
  spec runs pass.
- **U4 — file manager demo (implemented 2026-10-24):** paged server-sorted
  `list` (search, type filter, four sorts, keyset cursor; the 1000-entry cap is
  gone), the framework `deletePolicy` (`archive` default and recommended,
  hiding records from every framework read and also applied to overwrites;
  `delete` in the demo), `delete`, `rename`, GET `download`, streamed ZIP via a
  single-use owner-bound manifest (`zip_prepare`/`zip_get`, `ZipStream`,
  `StreamedDownload`, `Context::$owner`), listing/tiles/tree per panel, F2/Del,
  drop and paste onto panels with in-flight rows and in-place results, viewer
  previous/next. Review fixes applied: overwrite under archive, copy requires
  `download` on sources, ZIP `MISSING` note, mount-label and ZIP segment rules,
  MySQL top-row locks, video icon, counter drift; U2/U3 review fixes (direct
  multipart policy enforcement, generic finish results, resume by target,
  finish retry, cancel race, conflict slot release, reserved-key editing,
  media in details). Decisions taken in implementation: command labels
  `Másolás`/`Áthelyezés` (long texts as tooltips) so nine commands fit at
  1400 px; tiles without a media descriptor fall back to the icon column
  (framework `ResponsiveGrid`). Not yet: usages in the delete confirmation
  (U5 `FileUsageProvider`); previous/next covers the loaded rows only.
  **Verification (agent):** PHP `files`, `lists`, `list-presentation`, `access`,
  `configuration`, `i18n`, `contracts`, `calendar`, `sorting`, `grid-edit` pass;
  typecheck/build/assets clean; browser, one spec per run: `files` 11/11,
  `uploader` 14/14, `mobile-grid` 5/5, `list-presentation` 9/9, `preferences`
  3/3, `calendar` 6/6; `ui-preferences.mjs` passes. A first `files` run timed
  out once in the upload summary (passed on rerun).
- **U5 — signage on shared files (implemented 2026-10-24):** `UsageProvider`
  (`Registry::usage`), delete preview/apply with `cleared` for the file manager
  and `SqlResource` (journaled previews as `delete_preview`), the `SqlResource`
  delete policy (`archive`/`delete`, JSON `operations.delete_policy`), the
  `after_delete` hook (`after_save` no longer runs on delete — this also fixed
  signage deletes that always failed), field type `file` with picker and
  upload, derived media columns (`media_of`/`part`), computed read-only columns,
  `MountStorage` for consumer uploads, list actions with an `UploadPolicy`
  opening the uploader. Demo: `Signage` mount holding the asset files (moved
  with unchanged ids), `Médiatár` with thumbnail/type/resolution/length/play
  time/usage columns, upload as assets in one step, usage warnings that clear
  file references, defaults and event assets; the 500-row binding and kind
  check are gone. Review fixes: overwrites clear references, unchanged file ids
  are not re-validated, picker rights/focus/class rule, failed previews shown,
  name-check locks. Decisions taken in implementation: the upload button is
  `Fájl feltöltése…` (`Feltöltés…` is the existing "Uploading…" status); the
  plan's `file.policy` option is derived from the file manager's policy
  narrowed to the accepted classes; usage counts may count references the
  actor cannot read; `clear()` runs as consumer code without audit rows on the
  referencing resource.
  **Verification (agent):** PHP `signage`, `files`, `lists`,
  `list-presentation`, `configuration`, `calendar`, `access`, `admin`,
  `permissions`, `i18n`, `contracts` pass; typecheck/build/assets clean;
  browser, one spec per run on the managed URL: `signage` 7/7, `files` 11/11,
  `uploader` 14/14, `mobile-grid` 6/6, `calendar` 6/6, `list-presentation` 9/9,
  `preferences` 3/3, `i18n` 2/2. Failures not caused by this work (FB-0062
  collapsed menu, external OAuth): `demo` 4, `dialogs` 6, `browser` 4.
- **Final verification fixes (2026-10-24):** the uploader's hidden file
  inputs now live outside Suite's virtual DOM (a Layout repaint could replace
  an input whose picker was open, losing the chosen files); `TreeAdapter`
  destroys its Tree after Suite's pending redraw (a re-created file manager
  could throw `null.isFolder`); `__bulk` items carry `data` only when non-empty;
  the uploader spec passes its 20-file batch from disk (multi-MB buffers stalled
  under the guarded memory limit). Lead re-run, one spec per invocation: all PHP
  suites pass; `uploader` 14/14, `files` 11/11 (3 of 4 consecutive runs; the
  failing one came right after a rebuild), `signage` 7/7, `list-integration`
  2/2, `list-presentation` 9/9, `mobile-grid` 6/6, `preferences` 3/3,
  `calendar` 6/6, `diagram` 4/4, `grid-edit` 2/2, `grid-sort` 2/2, `i18n` 2/2,
  `layout-resizer` 4/4. Not caused by this work: `browser` 4, `demo` 4,
  `dialogs` 6, `admin` 3, `authentication` 1, `workspace` 2 (they click menu
  items directly although FB-0062 collapsed the desktop menu, or need the
  unconfigured OAuth), `related-fields` 1 (Suite 9.3.12 names an unlabelled
  checkbox `checkbox <label>`).
- **Status:** accepted; U1–U5 implemented (user acceptance pending).

<a id="fb-0064"></a>

## FB-0064 — Versioned Composer VCS package

- **Date:** 2026-10-27.
- **Request:** make 61de consumable as a versioned Composer VCS package, which
  resolves the open artifact/registry method of the former local package
  development plan.
- **Owner decisions:** root `composer.json` for `sanch78/61de` without a
  `version` field; `.gitattributes` export-ignore for non-runtime paths;
  `tools/release X.Y.Z` builds the frontend, bumps both package versions and
  tags a detached commit that force-adds `packages/frontend/dist`; `main` never
  tracks `dist`.
- **Decisions taken in implementation:** `packages/php/composer.json` stays for
  the demo's path repository (a root path repository would make the demo's
  vendor link contain itself), and the release tool requires identical
  `require` blocks; the version bump and demo pin are committed to `main`, and
  `main` plus the tag go out in one atomic push; `tools/live-server.mjs` stays
  in the archive as the WebSocket runtime; dev-time linking uses an uncommitted
  path repository with `versions`.
- **Guide:** [package releases](development.md#package-releases-and-consumption).
- **Verification (agent):** release dry run against a local bare clone, then
  throwaway consumers under `tmp/`: the tag installs through a VCS repository with
  `dist/admin.js`/`admin.css` and `Blade\` autoloading, the dev path link
  resolves the exact pin, and the tag archive excludes development paths.
- **Status:** superseded by [FB-0066](#fb-0066).

<a id="fb-0065"></a>

## FB-0065 — Command-only mail delivery without symfony/mailer

- **Date:** 2026-10-27.
- **Request (Infra, for the owner):** remove the only third-party PHP
  dependency, `symfony/mailer`, so 61de can later be consumed like the other
  shared libraries without Composer versions. Applications hand mail to local
  Postfix through the Infra helper `/space/share/bin/send-infra-mail.php` and
  hold no SMTP credentials.
- **Owner decision:** one configurable command transport; `SmtpDelivery` and
  the `smtp`/`dsn` options are removed. Packaging and release model unchanged
  in this step.
- **Decisions taken in implementation:** placeholders `{recipient}`,
  `{subject}`, `{from_address}`, `{from_name}`, `{body_file}`, each ending one
  argument (whole or suffix); `{body_file}` is mandatory. The command gets the
  HTML body only, because the helper sends a single part; `LoginMessage` and
  `Layout` still render both variants. Stdin piping was dropped (stdin is
  `/dev/null`), so `sendmail -t -i` configurations must move to the helper.
  `transport`/`dsn` keys fail with "SMTP mail delivery was removed". The demo
  command takes the helper's arguments but stores JSON for the demo mailbox
  instead of sending.
- **Guide:** [mail delivery](authentication.md#levélküldés),
  [mail command](configuration.md#mail-command).
- **Verification (agent):** `php -l` on changed PHP; `tests/shell/mail.php`
  with a recording fake command, `authentication.php`, `configuration.php`,
  `oauth.php`, `admin.php`, `i18n.php`, `contracts.php` passed; `composer
  validate` on both manifests; the demo lock holds only `sanch78/61de`; no
  `Symfony\` reference in `packages/php`. Browser: `authentication.spec.cjs`
  code gate/remember and `demo.spec.cjs` mailbox test passed through the
  managed URL; two Users-admin tests failed waiting for the `Adminisztráció`
  menu item (collapsed main menu, no mail involvement), not investigated here.
  No real mail sent.
- **Follow-up (owner, same day):** the demo may send real mail on our hosts
  without host configuration in Git. `BLADE_DEMO_MAIL_HELPER` and
  `BLADE_DEMO_MAIL_FROM` in the ignored demo `.env` route non-`@example.test`
  recipients through the helper; `@example.test` stays in the outbox. The demo
  mail footer no longer claims that mail never reaches a real recipient.
- **Real mail (agent, owner agreed):** a temporary account with the owner's
  address signed in through the managed URL; the web process ran the helper
  (audit `email_send` success, 2026-10-27T21:41:48Z) and the outbox stayed
  empty for it. The account and its rows were deleted afterwards. Receipt is
  for the owner to confirm.
- **Status:** accepted; implemented.

<a id="fb-0066"></a>

## FB-0066 — Shared-library consumption without versions

- **Date:** 2026-10-27.
- **Request (Infra, for the owner):** consume 61de like the other shared
  libraries in `/space/share/libs`; step 2 after [FB-0065](#fb-0065).
- **Owner decision:** supersedes [FB-0064](#fb-0064). A pushed commit reaches
  every consumer's development URL on both dev hosts through lib-sync, and each
  consumer's next `deploy-site` copies it through `shared_assets`. Consumers use
  `packages/php` with their own PSR-4 autoloader and
  `packages/frontend/dist/admin.{js,css}`. No versions, tags, release tool or
  Composer installation for consumers; existing tags stay as history. Breaking
  changes need a coordinated consumer update in the same session.
- **Decisions taken in implementation:** `main` tracks
  `packages/frontend/dist`; `tools/build.mjs --check` builds in memory and fails
  on a stale `dist`, and `npm run test:browser` runs it first; a normal build
  reports a changed `dist`. Removed `tools/release`, the root `composer.json`, the
  export-ignore rules and the package `version` fields; `.gitattributes` now
  only exempts `dist` from whitespace checks;
  `packages/php/composer.json` stays for the demo's path repository, which
  now requires `@dev`.
- **Guide:** [shared-library consumption](development.md#shared-library-consumption).
- **Verification (agent):** two consecutive builds are byte-identical and match
  the previous Catalyst build; `--check` passes on it and fails on a modified
  `admin.css`; the documented autoloader loads `Blade\Shell\ApplicationDefinition`
  over a linked `packages/php`.
- **Spec repair (owner asked, same day):** the two Users-admin specs FB-0063
  listed as failing now pass. They open the menu through `openMenu` (the
  collapsed desktop menu of FB-0062), accept the Suite 9.3.12 checkbox name
  `checkbox <label>`, read the one-time API key from its documented toast,
  and accept the resend-limit alert as proof of the code gate when the
  previous test sent a code under a minute earlier. The web instance's
  synthetic `viewer@example.test` had been disabled through the UI since
  2026-10-21, which made its API key correctly return 401; it was restored to
  its seeded enabled state. `authentication.spec.cjs` 3/3 and the
  `demo.spec.cjs` Users/API-key test pass on the managed URL.
- **Remaining suites (owner asked, same day):** `openMenu` also opens
  top-level items (no group) and sign-out; `admin`, `workspace` and `demo` use
  it. `admin` checks "signed in without administration" in the shell metadata
  and accepts the 9.3.12 checkbox name. `browser` checks the expanded top menu
  at 1600 px, where the demo menu fits (it collapses at 1280 px). `dialogs`
  follows FB-0056: the field-free `Párbeszéd:` actions confirm from their
  control and report success as a toast, so the acknowledge-dialog half of the
  old spec is gone; the confirmation checks (severity, focus, keyboard, mobile
  margins) remain, and the acknowledge dialog stays covered only by the danger
  sign-in error. `demo` filters the API-key grid by its label (the live insert
  could land above the visible window) and accepts the real Google sign-in page,
  because `page.route` never saw the redirect target. Result on the managed URL:
  `browser` 7/7, `dialogs` 8/8, `admin` 3/3, `workspace` 2/2,
  `authentication` 3/3, `demo` 6/6.
- **Status:** accepted; implemented.

<a id="fb-0067"></a>

## FB-0067 — Consumer adoption procedure and corrections

- **Date:** 2026-10-27.
- **Request (Infra, for the owner):** turn the first consumer adoption
  (StoryBloX) into one owned procedure: correct the consumer contract and add a
  consumer checklist skill that links to it.
- **Findings verified against the code:**
  - `packages/php` uses no third-party PHP package. Its `composer.json`
    requires only `php`, and the source imports only `Blade\` and PHP classes.
    This is now a stated invariant; changing it needs a coordinated consumer
    update.
  - The old sentence "deploy refuses to sync a shared asset into an existing
    symlink" was wrong. `deploy-site` syncs with `--no-links`, hides and
    protects `shared_assets` targets in the main sync, then removes a symlink
    at the target and copies the asset. "Refusing to replace" comes from
    `links`.
  - A whole-directory assets link (`public/assets` → `dist`) writes the
    consumer's own assets into the shared `dist`. In a release those assets
    never arrive, because the main sync hides the target. StoryBloX currently
    links and deploys its whole `public/assets`; changing that is the
    consumer's task.
  - `live-bridge.php` requires `BLADE_AUTOLOAD_FILE`; a consumer has no
    `vendor/autoload.php`.
  - `deploy-site` refuses a dirty or unpushed `shared_assets` source and
    records the library commit in `.deploy-history.jsonl`.
  - E-mail confirmation exists only when `authentication` is configured. The
    framework has no account delete; `runtime/login/*.json` is per client IP,
    not per account.
- **Runner decision:** consumers call `/space/share/bin/guarded-playwright`
  from their own `tools/playwright.sh`, with `tools/playwright-test.cjs` as
  the spec loader (the StoryBloX pattern). This checkout keeps
  `tools/run-dev-check.sh`. The host runner exits 77 for a working directory
  under `/space/share/libs`, and its tmp rule conflicts with the owner's
  checkout-local `tmp/`. Consumers no longer call this checkout's guard.
  **Open:** the two locks do not exclude each other. A shared lock would need
  an Infra change to the host runner, and that change needs the owner's
  approval.
- **Guide:** [consumer layout](development.md#consumer-layout),
  [update smoke check](development.md#consumer-update-smoke-check),
  [consumer browser tests](development.md#consumer-browser-tests),
  [consumer test accounts](development.md#consumer-test-accounts),
  [61de-consumer skill](../.agents/skills/61ade-consumer/SKILL.md).
- **Verification (agent):** documentation only. Internal links and anchors
  were checked with a script, plus `git diff --check`. No runner change, so no
  browser run.
- **Status:** accepted; implemented.

<a id="fb-0068"></a>

## FB-0068 — WebSocket live server for releases and the demo

- **Date:** 2026-10-28.
- **Request (Infra, for the owner):** 61de live data over WebSocket, first on
  61ade.sanch.hu, then StoryBloX and allflow. Infra supervises the server
  (`.deploy-jobs.json` `mode: service`, `run_as: web`), proxies `/live` on each
  hostname and reserves loopback ports (61ade demo 8088; storyblox 8091/8092;
  allflow 8093/8094). The library supplies a server that runs from a copied
  `packages/php`, the consumer contract and the demo settings.
- **Decisions taken in implementation:** `tools/live-server.mjs` stays the only
  source; `tools/build.mjs` bundles it with ws 8.22.0 inlined into the tracked
  `packages/php/bin/live-server.mjs`, and `--check` covers it like `dist`. The
  bundle uses Node built-ins only: ws's optional native add-ons are compiled
  out, and it starts `live-bridge.php` beside itself, so the source is not run
  directly. The demo selects WebSocket only when its ignored `.env` sets
  `BLADE_DEMO_LIVE_ENDPOINT`; the starter admin stays on polling. The demo
  bridge uses the demo's existing `vendor/autoload.php` and `application.php`
  with `BLADE_DEMO_INSTANCE=web`.
- **Guide:** [live-data service](development.md#live-data-service-websocket),
  [demo WebSocket live data](demos.md#websocket-live-data),
  [live-data configuration](workspaces.md#élő-adat-konfigurálása-és-futtatása).
- **Verification (agent):** `node tools/build.mjs --check`; `node --check` on
  the bundle; a copy of the bundle and bridge outside the checkout, run without
  `node_modules` or environment, loaded all of ws and stopped at the missing
  `BLADE_LIVE_ORIGIN` check, so it resolves only Node built-ins. The bridge,
  fed one JSON line on stdin with the demo files, answered 401 for an invalid
  ticket. `php -l`, `tests/shell/contracts.php`. `workspace.spec.cjs` on the
  managed URL: 2 passed, the new WebSocket case skipped (the demo still polls).
  No server or tunnel was started.
- **Pending (Infra):** the demo unit from [demos](demos.md#websocket-live-data)
  and the `/live` proxy on 61ade.sanch.hu. Then set
  `BLADE_DEMO_LIVE_ENDPOINT=wss://61ade.sanch.hu/live` in the demo `.env` and
  run `workspace.spec.cjs`; the WebSocket case is unverified until then.
- **First live run (same day):** Infra installed `infra-61ade-live-demo.service`
  and the `/live` proxy. With the endpoint set, the socket opened and passed
  the Origin check, but every subscription got 401 "A munkamenet lejárt.". The
  61ade FPM pool sets `php_admin_value[session.save_path] =
  /space/share/php_sessions`, which silently overrides the shell's
  `session_save_path($runtime.'/sessions')`; the bridge looks in the runtime
  and finds no session. The owner takes the pool setting up with Infra; the
  demo `.env` was reset to polling meanwhile.
- **Fixes from that run:** the client no longer resets its reconnect backoff
  when a socket opens, only after an update for the current subscription, so
  repeated 4401 closes back off to 15 s instead of reconnecting every 500 ms.
  The demo chmods a CLI-owned SQLite file only when the effective uid
  (`posix_geteuid()`) owns it; `getmyuid()` is the script owner and flooded the
  unit journal with chmod warnings under `www-data`. The earlier "PHP edits
  apply without a restart" note was wrong: classes and `require_once` files
  stay loaded, so any PHP change needs a unit restart. Checks: build
  `--check`, typecheck, `php -l`, `contracts.php`, `workspace.spec.cjs`
  2 passed / WebSocket case skipped (polling).
- **Live verification (same day):** Infra removed the pool's session-path
  override (sessions moved, so users sign in again). With
  `BLADE_DEMO_LIVE_ENDPOINT=wss://61ade.sanch.hu/live` in the demo `.env`,
  `workspace.spec.cjs` on the managed URL: 2 passed (WebSocket update frame
  for an external write; standalone grid), polling case skipped. The demo now
  runs on WebSocket. The unit (started 06:52:51 UTC) still runs the old
  `common.php` and logs chmod warnings until it is restarted.
- **Status:** accepted; implemented; verified live.

<a id="fb-0069"></a>

## FB-0069 — Optional multi-tenancy (stage 1)

- **Date:** 2026-10-29.
- **Request (consumer, recorded without consumer names or business terms):**
  one installation manages several independent content lines. Each line is a
  tenant, and users work only in the lines assigned to them. A user with one
  line is never asked to choose. Multi-tenancy is an optional capability that
  an application turns on. Without it nothing changes: no tables, menu entries,
  fields, selectors, request handling or behavior. Running background processes
  for a tenant is consumer business logic; the framework only lets a worker
  resolve and recheck a tenant and its permissions outside HTTP.
- **Owner decisions:** the public term is *tenant* (*organization* is a synonym).
  Roles stay global, and membership is a separate gate; per-tenant roles come
  later. A user without a membership signs in, keeps the global views the ACL
  allows and is refused every tenant-scoped resource. The tenant table is
  framework-owned only (`blade_tenants`).
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
- **Guide:** [tenancy](tenancy.md); [usage](usage.md#multi-tenancy),
  [configuration](configuration.md), [admin](admin.md#tenants),
  [security model](security-model.md), [demos](demos.md#tenant-demo-tenants),
  [plan M2](development-plan.md#m2--auth-tenant-és-acl-alap).
- **Verification (agent):** `php8.4 tests/shell/tenancy.php` passed (new,
  retained as the requested security-matrix check). Existing PHP checks passed:
  contracts, access, admin, api-keys, permissions, authentication, oauth, mail,
  configuration (extended with the JSON tenancy section), validation, i18n,
  lists, sorting, grid-edit, related-fields, list-presentation, files, diagram,
  calendar and signage. `npm run typecheck`, `npm run build` and
  `npm run demo:assets` passed. On the managed URL, `tenancy.spec.cjs` passed
  3/3 (no selector with one membership; the no-tenant notice and API refusal;
  switching removes the previous tenant's rows, a foreign ID returns 404, the
  old page token returns 403). `browser`, `admin`, `workspace` and `i18n`
  specs passed 14/14.
- **Limits / open:** tenant-scoped file spaces (requirement 9) are a later stage,
  because file storage, thumbnail tasks and ZIP manifests are keyed per space;
  file managers stay global under tenancy. Diagrams, calendars and non-SQL
  custom actions have no tenant adapter. Per-tenant roles, an audited
  cross-tenant read capability and list exports are not implemented. The
  WebSocket bridge's tenant check has no live browser test (the tenant demo
  polls). No user acceptance yet.
- **Status:** accepted; stage 1 implemented and verified by the agent; file
  stage open.

<a id="fb-0070"></a>

## FB-0070 — Product name corrected from 61de to 61ade

- **Date:** 2026-10-29.
- **Observation (owner):** prompts and documents said `61de`. The 2026-10-21
  rename request asked for `61ade`; [FB-0049](#fb-0049) recorded `61de` as the
  owner-supplied name and [FB-0050](#fb-0050) built the dual spelling on it.
  `blade` is the letter reading of `61ade`, so `61de` was a misspelling taken
  literally.
- **Accepted instruction:** use `61ade` everywhere, including package names,
  the asset command, the consumer skill, the demo password and the recommended
  consumer link names. The owner notifies the two consumer projects; their
  checkouts are not edited from here.
- **Implementation:** product/demo titles, comments, log and error texts,
  locale keys, `sanch78/61ade`, `@61ade/admin`, `61ade-assets`,
  `61ade-workspace`, `61ade/shell-demo`, skill `61ade-consumer` (directory and
  Claude link), `lib/61ade` / `public/assets/61ade` in the consumer layout,
  password `61ade-demo` in the demo seed and specs. Lockfiles regenerated with
  `npm install` and `composer update sanch78/61ade`; tracked build rebuilt.
  `Blade\`, `BLADE_*`, `blade_*` and all runtime identifiers are unchanged.
  Historical feedback entries and legacy anchors keep `61de` as evidence; only
  the moved skill link was updated.
- **Data:** synthetic accounts still on `61de-demo` in the retained demo
  databases were rehashed to `61ade-demo`; customized passwords were preserved.
- **Consumers:** existing `lib/61de` and `assets/61de` links keep working,
  because nothing inside the packages moved. Migration steps:
  [renaming](renaming.md#61de--61ade-correction-2026-10-29).
- **Usage and constraints:** [renaming](renaming.md), [development](development.md#consumer-layout),
  [agent contract](../AGENTS.md).

<a id="fb-0071"></a>

## FB-0071 — Sub-views: expandable rows and cards with a compact preview

- **Date:** 2026-10-29.
- **Observation (owner):** the tenant list should show its members in a sub-row.
  The native DHTMLX Grid `subRow` is PRO-only; the GPL Standard 9.3.12 build
  silently ignores it. The owner asked the framework to provide it ("if we cannot
  build it, we need a new framework").
- **Accepted instructions, in order:**
  - The expanded area is a grid/tree/card framework component fed by a separate
    related list through the normal API.
  - Card view expands too.
  - A full grid inside a card is unusable on a phone: the sub-row is a compact
    look. It shows all related records in a grid with only sortable headers, and
    an editable enabled switch stays.
  - The full list opens in a window from the parent toolbar; no title bar sits in
    the preview.
  - A window holding one simple framework feature shows it edge to edge, with the
    window header only (system rule).
  - The preview scrolls only above 5–10 rows, by the viewport, never fewer than 5.
  - The demos cover every sub-view kind, also on existing screens.
  - The tenant member switch means a membership-level enable/disable.
  - Follow-up: a record without related items is not expandable (server `_subview`
    count); the bottom edge of the preview is a single frame; cards do not embed
    the preview but carry a clear full-width button that opens the window.
  - Follow-up: a selected child takes the parent toolbar over for the same-named
    actions (also across resources); editing a child sends its known parent
    instead of failing on the required, hidden parent field.
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
- **Follow-up (owner, 2026-10-29): tenant access list.** On the tenant list,
  modifying a sub-row element is meaningless: the sub-rows must not be editable
  through forms and must not even be selectable. List all users, and let the
  flag mark which tenants each user can access.
  - Framework: `Registry::subview(..., select: false)` / JSON
    `view.subview.select`, carried in `views()` as `subview.select: false`. Such
    rows (preview and window) have native selection and key navigation off, no
    toolbar delegation, no double-click/Enter opening, and record actions leave
    the window toolbar; editable switch cells still save. Default unchanged, so
    projects→tasks and the task hierarchy keep delegation.
  - Framework: `ListSource` `countWhere` (count-only SQL) and `_subview_open`
    (always expandable at a partial count); `Accounts::visibleSql()` (the
    accounts the actor may list, as a derived source).
  - Tenants: `Tenancy::MEMBERS` is now a derived access list (tenants × visible
    accounts, id `<tenant>:<account>`, `E-mail`, `Név`, `Hozzáférés`) with only
    `list` and `update`; on inserts or re-enables the membership, off deletes
    it; each change is an audited, ACL-checked `__edit`. The count is the
    accounts with access. The `active` column stays (compatibility) but is no
    longer shown. Toolbar/card command: `Hozzáférések`.
  - Verification (agent, 2026-10-29): the full PHP loop of
    [development](development.md#existing-full-smoke-and-coverage-limits) passed
    (with new `tenancy.php` and `configuration.php` cases); `npm run typecheck`,
    build and demo assets. Through the managed URL `subview.spec.cjs`,
    `subview-demos.spec.cjs`, `admin.spec.cjs` and the rewritten access-list and
    phone cases of `tenancy.spec.cjs` passed (15/16). The remaining failure,
    `no membership`, is demo data: during the run a live UI session of
    `demo@example.test` (not the test) switched access in Alfa, so
    `none@example.test` now has Alfa access. It was left in place; switching
    it off again restores the fixture. No user acceptance.
- **Usage and constraints:** [sub-views](workspaces.md#sub-views),
  [tenancy](tenancy.md#memberships-and-administration), [demos](demos.md#tenant-demo-tenants).

<a id="fb-0072"></a>

## FB-0072 — Optional application skins

- **Date:** 2026-10-29.
- **Source:** consumer request. Its administrators keep the factory look; its
  content editors should work in an application-branded palette, and more
  application skins may follow.
- **Accepted instructions:** extends [FB-0005](#fb-0005--natív-dhtmlx-témaváltás)
  and [FB-0012](#fb-0012--skyblue-alapértelmezett-megjelenés). A skin stays a
  native DHTMLX custom theme supplied by the application; controls stay native
  and 61ade ships no application CSS. Opt-in per identity, resolved on the
  server; the sign-in page keeps the factory look. With skins the factory
  themes are not offered: one skin hides the selector, several fill it. The
  skin choice persists separately so the factory choice returns when a skin is
  lost. Presentation only, no access semantics.
- **Simpler route checked:** no existing route fits. The shell links only
  `admin.css` and offers a fixed theme list, so a consumer could neither load
  its stylesheet nor select its theme without hand-built shell markup.
- **Follow-up (owner, same day):** the first version applied the skin id itself
  as the DHTMLX theme, so skins were light only: Scheduler stayed light and the
  framework's dark rules did not apply. Asked for a unified, civilized fix.
  Decision: a skin refines a factory base (`light`, `dark`, `skyblue`). The base
  goes to `data-dhx-theme` through `setTheme`, the skin id to `data-blade-skin`,
  and the skin stylesheet overrides only `--dhx-*` variables there. The Suite
  dark theme is one variable block and every framework theme rule keys off
  `data-dhx-theme`, so all of them follow the base with no duplicated rule.
- **Implementation:** `Blade\Shell\Skin` (with `base`), `ApplicationDefinition::$skins`
  (`Closure(Identity): list<Skin>`), JSON `application.skins` (identity binding
  name), bootstrap `skins`, stylesheet links in `templates/shell.php`, the
  `AdminShell` selector with `blade-skin` storage. Feature demo:
  `skin@example.test` / `skins@example.test` with synthetic `demo-slate` (light
  base) and `demo-ink` (dark base) stylesheets under `public/skins/`.
- **Verification (agent, 2026-10-29):** `php8.4 tests/shell/configuration.php`
  and `contracts.php` passed (JSON binding, reserved id, off-page stylesheet);
  `npm run typecheck`, build and demo assets; through the managed URL
  `skins.spec.cjs` (one skin without selector and with its variables on the
  root, two skins only in the selector surviving reload, unknown stored value,
  unskinned user, sign-in page, untouched `blade-theme`) with the unchanged
  `browser.spec.cjs` and `preferences.spec.cjs`: 13/13 passed. Re-run after the
  base follow-up, adding the dark base (`data-dhx-theme=dark` under `demo-ink`,
  skin variable winning, other variables from Suite dark): 13/13 passed. No user
  acceptance.
- **Status:** implemented and verified by tools.
- **Limits:** no per-user server-side preference; the high-contrast Suite
  themes are not offered as a base.
- **Usage and constraints:** [application skins](shell.md#application-skins),
  [configuration](configuration.md#entrypoint-and-application-sections),
  [demos](demos.md).

<a id="fb-0073"></a>

## FB-0073 — Demo WebSocket refresh after the tenancy change

- **Date:** 2026-10-29.
- **Source:** owner question: should the demo refresh over WebSocket?
- **Finding:** yes; `.env` selects `wss://61ade.sanch.hu/live` and the proxy
  answers `101`. `workspace.spec.cjs` failed the WebSocket case for two reasons.
  The unit had run since 2026-10-28 06:52 UTC, before
  [FB-0069](#fb-0069) changed `live-bridge.php`, `Live/Tickets.php` and
  `Feature/Workspace.php`, so the bridge held stale code and sent no update;
  the owner restarted it (12:25:53 UTC). After that the update frame arrived,
  but the spec wrote note `id=1`: the standalone case leaves a note on every
  run, the grid sorts by id descending and renders only visible rows, so note 1
  (row 21) was off screen and `getByText` found nothing.
- **Fix:** the spec's external write targets the newest note, which is the top
  row. The framework live path is unchanged.
- **Verification (agent, 2026-10-29):** through the managed URL
  `workspace.spec.cjs` twice: 2 passed (standalone grid, WebSocket update frame
  shown in the grid), polling case skipped.
- **Status:** fixed; verified by tools.
- **Limits:** the standalone case still leaves its notes behind.

<a id="fb-0074"></a>

## FB-0074 — One live server for several applications

- **Date:** 2026-10-29.
- **Source:** owner: the feature demo refreshes over WebSocket, `/admin/` and
  `/tenants/` poll; why not all? Not every such need should be an Infra request.
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
- **Verification (agent, 2026-10-29):** `configuration.php` (routing, relative
  paths, bootstrap without files, rejected names and relative files),
  `contracts.php`, `tenancy.php`, typecheck, build `--check`. After the first
  restart the owner saw no working socket on `/tenants/`: every `/live/admin`
  and `/live/tenants` subscription got 401. In the CLI bridge the first `echo`
  marks headers as sent, after which `session_name()` and
  `session_save_path()` refuse to change, so later requests read the primary
  application's sessions. The bridge now answers with `fwrite(STDOUT)`; a local
  bridge run (primary request, then an admin ticket on `/live/admin` and on
  `/live`) passes the session check on its own path only. After the second
  restart (13:55:14 UTC), through the managed URL: `workspace.spec.cjs` 4
  passed (feature demo update frame and grid; `/live/admin` and
  `/live/tenants` update frames, their tickets refused with 4401 on `/live`),
  polling case skipped; `tenancy.spec.cjs` 4 passed, 1 failed on data: a
  leftover Alfa membership of `none@example.test` (`blade_tenant_members` id
  24) hides the "no tenant" notice, unrelated to live data.
- **Status:** implemented; verified by tools. No user acceptance.

<a id="fb-0075"></a>

## FB-0075 — One live channel per tab, event-driven updates

- **Date:** 2026-10-29.
- **Source:** owner, after seeing one socket per list: a signed-in client
  should hold one open socket that carries every change; the owner's earlier
  admin (ADE) opened one WebSocket per session.
- **Accepted instructions:** plan first, then implement with agents. The
  established model is one multiplexed connection per client tab; the current
  per-list sockets and per-socket 2 s server re-query are to be replaced by a
  shell-owned channel and change events from the framework write path.
- **Plan:** [live channel plan](live-channel-plan.md) (L0–L6, agent execution,
  owner decisions D1–D4).
- **Owner decisions (same day):** plan approved; D1 one channel per tab, D2
  bridge and server self-reload, D3 live traffic does not extend the session
  idle timeout, D4 15 s default sweep for external writes.
- **L0 (2026-10-29, self-reload):** `live-bridge.php` records mtime, size and
  inode of `get_included_files()` (after `clearstatcache()`) and exits with 75
  when one changed or vanished; it checks when idle (`stream_select` timeout
  now 2 s) and after each answered request, never inside one (about 0.3 ms per
  check with 70 files). `tools/live-server.mjs` respawns the bridge on 75 on
  the child's `close` event (after every written answer was read) and re-sends
  every unanswered request to the new bridge; requests made in between wait in
  the pending map. Five 75 exits in a row within 3 s of start (back-off 0.5, 1,
  2, 4 s) and any other bridge exit end the server with 1. The server polls its
  own file (`fs.watchFile`, 2 s) and, when its content differs from the loaded
  one, closes sockets with 1012 `Restart`, stops the bridge and exits with 1 for
  the supervisor. Content, not mtime, because the build rewrites an unchanged
  bundle. SIGTERM/SIGINT now exit 0 (1001), instead of 1 via the killed bridge.
  `Realtime.ts` reconnects with backoff on every close except 4403, so 1012
  needed no frontend change. Docs: [demos](demos.md#websocket-live-data),
  [development](development.md#live-data-service-websocket),
  [workspaces](workspaces.md#élő-adat-konfigurálása-és-futtatása).
  Verification (local, scratch instance `dbg`, port 18088): `php8.4 -l
  packages/php/bin/live-bridge.php`, `node --check tools/live-server.mjs`,
  `node tools/build.mjs` then `node tools/build.mjs --check` pass. With one
  client re-subscribing to `blade_users` every second and eight load clients
  every 50 ms, two `touch examples/demo-app/common.php` gave two
  `Live worker reloading after a PHP change 8 pending` lines and a new bridge
  PID; all nine sockets stayed open, kept receiving `update` frames and got no
  `error` frame or close. On a scratch copy of the bundle and bridge, `touch`
  of the bundle changed nothing; appending a comment closed the client with
  `1012 Restart` and the server exited with 1 within 2 s. A fake interpreter
  that always exits 75 gave four respawns, then `Live worker keeps reloading`
  and exit 1; `/bin/false` gave `Live worker exited 1` and exit 1.
  `tests/shell/contracts.php` and `tests/shell/configuration.php` pass.
  Not verified on the demo: the running unit has the old code and needs the
  one owner restart; then a `common.php` edit must reload without `sudo`
  (journal).
- **L0 review fixes (same day):** an independent review found no lost,
  duplicated or misrouted answer across a respawn, and two defects that turned
  a transient reload error into a hard failure. (1) A respawned bridge that
  died at startup (half-written file, exit 255) ended the service: now a bridge
  that has not answered anything is retried like a 75 exit, every respawn waits
  (150 ms × 2ⁿ, at most 5 s), any answer resets the counter, and the ninth
  failure in a row, or a crash of a serving bridge, shuts down with 1012
  instead of a bare exit. (2) A 5xx observation closed the socket with 4403,
  which the browser treats as revoked access and never retries: 5xx now
  closes with 1011 (reconnect). The bridge also keeps a content hash for files
  modified within the last second, so a same-second, same-size rewrite is not
  missed. Verified locally with stub bridges: 75 → 255 → serving kept the
  client open and answered it; always-255 gave 8 retries, then exit 1; a 500
  answer closed with 1011. Real bridge on scratch instance `dbg`: `touch
  examples/demo-app/common.php` reloaded the bridge while the client kept
  receiving `update` frames. `contracts.php`, `configuration.php`, build
  `--check` pass. Open risks noted by the review: process-global state an
  application sets (e.g. a session save handler) persists between
  applications in one bridge; a file changed between its first include and the
  post-request check within one second can be missed.
- **L0 demo verification:** after the owner's last restart (14:24:01 UTC),
  `touch examples/demo-app/common.php` logged `Live worker reloading after a PHP
  change` in the unit journal without `sudo`; `workspace.spec.cjs` through the
  managed URL: 4 passed, polling case skipped.
- **Status:** approved plan; L0 implemented and verified on the demo; L1–L2
  next.

<a id="fb-0076"></a>

## FB-0076 — Static image column for lists

- **Date:** 2026-10-29.
- **Demand (consumer):** a fixed, application-owned catalog whose rows each have
  an illustration shipped with the application's static assets. Tiles are the
  right presentation, but the media slot existed only for `media` columns,
  which need a file manager file id, content store and thumbnails. Application
  artwork is a deployment asset, so it must not enter a file space.
- **Simpler routes considered:** a `media` column over a read-only MediaSource
  would need mounts, rights and installation for a deployment asset; an
  `icon` column only takes Suite icon classes. A column presentation over
  the existing media slots is the smallest change. User-uploaded or versioned
  images keep using `media` and the file manager.
- **Implemented:** `column.presentation: "image"` + `imageBase` (+ `altOf`),
  server value rules, table cell, card, tile and detail rendering, tiles by
  default, placeholder on load error. See
  [workspaces](workspaces.md#media-tiles) and
  [field presentation](field-presentation.md). No new endpoint or right.
- **Consumer section:**
  - Put the images in the application's public directory (for example
    `public/images/catalog/`) and declare `image_base` relative to the page
    (`../images/catalog/` from `/admin/`), ending in `/`.
  - The row value is a file name only (`name.png`); letters, digits, `-`, `_`,
    `.`; extensions png, jpg, jpeg, webp, gif, svg. Anything else shows no image.
  - Give `alt_of` the text field that names the picture if the image carries
    meaning not already in the title; otherwise it is decorative.
  - **No ACL applies.** The web server serves the file to anyone who knows its
    URL. Do not put protected or personal data behind this column.
  - Square artwork is not cropped (`object-fit: contain`); the slot is square.
- **Verification (managed URL, 2026-10-29):** `php8.4 tests/shell/list-presentation.php`
  (option validation, value rules, wire options, server blanking),
  `configuration`, `lists`, `validation`, `i18n`, `contracts`, `files`,
  `sorting`, `grid-edit`, `related-fields`, `tenancy` pass; `npm run typecheck`,
  `node tools/build.mjs --check` pass. Browser `list-presentation.spec.cjs`
  (table, tiles, cards and details in Skyblue, light and dark; mobile tile
  count equal to media tiles; the managed `Katalógus` demo) and
  `workspace.spec.cjs` pass. `files`, `mobile-grid`, `list-integration` and
  `subview` specs passed; one `files.spec.cjs` upload test failed once in the
  combined run and passed alone, with no relation to this change.
- **Status:** implemented on the working tree, not committed. Limits: the file
  name check is the same regex on both sides; the existence of `alt_of`'s field
  is not validated (an unknown or hidden field gives an empty `alt`); no
  responsive image sizes or `srcset`.
