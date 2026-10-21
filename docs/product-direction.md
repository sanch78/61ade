# Termékirány és igényvezérelt fejlesztés

Dátum: 2026-10-21. Döntések: [FB-0036](feedback.md#fb-0036--kötelező-adminmodul-és-igényvezérelt-keretfejlesztés), [FB-0037](feedback.md#fb-0037--ext-js-referencia-visszavonása-dhtmlx-alap-igényvezérelt-képességkör), [ADR-0003](decisions/0003-product-direction.md). Ez a dokumentum dokumentáció- és forrásvizsgálaton alapul; runtime-változást nem tartalmaz.

A dokumentum három kategóriát tart külön:

1. **Elfogadott termékkövetelmény** — a felhasználó által elfogadott cél; nem jelenti, hogy kész.
2. **Megvalósított, bizonyított képesség** — forrás és teszt igazolja; csak ez állítható késznek.
3. **Nyitott tervezési kérdés / javasolt munka** — még nem döntés; javaslatként kezelendő.

Az FB-0036 korábbi Ext JS-referenciája tévedés volt; az FB-0037 visszavonta. Nincs külső frontendkeretrendszer-benchmark, komponensmegfeleltetés vagy teljes lefedettségi követelmény. A frontend alapja a DHTMLX; a VAPA támogatott képességköre a valós alkalmazási igényekből nő.

## 1. Elfogadott termékkövetelmények

| # | Követelmény |
| --- | --- |
| R1 | **Keretrendszer és szerződés.** A VAPA újrahasznosítható admin alkalmazáskeret. A PHP a referencia-backend; a frontend verziózott, nyelvfüggetlen JSON-szerződésen kommunikál. A JSON-átvitel önmagában nem bizonyít backendfüggetlenséget: ehhez dokumentált séma, verziókezelés és nyelvfüggetlen megfelelőségi ellenőrzés kell. |
| R2 | **Kötelező kerethasználat.** A VAPA-val épülő alkalmazás a VAPA eszközeit használja. Hiányzó újrahasznosítható képességnél előbb a VAPA bővül, utána az alkalmazás konfigurálja. Kivétel kizárólag az [AGENTS.md 1. pontja](../AGENTS.md) szerinti, dokumentált, logikusan nem bővíthető eset; a kényelem nem indok. |
| R3 | **Frontend.** Fullscreen HTML5 alkalmazás a csomagolt DHTMLX komponensekkel, VAPA-adapterekkel és támogatott bővítési pontokkal. A layoutkezelés alapképesség. A form, layout és grid összetett, ergonomikus munkafolyamatokat szolgál ki, a konkrét igények megjelenésével bővülve. |
| R4 | **Lokalizáció és téma.** A többnyelvűség beépített keretképesség, a frontend témákat támogat. Minden új keretképesség mindkettőben részt vesz. |
| R5 | **Kötelező adminmodul.** Minden alkalmazásban VAPA által adott user-, ACL-, API-kulcs- és rendszer-/auditnapló-adminisztráció van, a VAPA saját deklaratív definícióiból és eszközeiből. Az alkalmazás konfigurációt, identitás-/tárolási illesztést és domainszabályokat ad. Felülírja az FB-0004 / ADR-0002 kizárólag alkalmazási useradmin-döntését. |
| R6 | **Felhasználókezelés.** E-mail, jelszó, teljes név, felhasználónként engedélyezhető Google/Facebook-belépés és konfigurálható e-mailes belépésmegerősítés. |
| R7 | **Tárolás.** Választható MySQL, PostgreSQL, SQLite és fájlalapú JSON cél; a demó SQLite. A támogatás a 3. fejezet garanciáinak teljesítését jelenti, nem azt, hogy kapcsolat nyitható. |
| R8 | **Moduláris JSON-konfiguráció.** Az alkalmazásszerkezet és a deklaratív üzleti definíciók tagolt JSON-ból jönnek. Összetett domainviselkedés explicit regisztrált kezelővel. Nincs végrehajtható string, eval vagy korlátlan szkriptnyelv. |
| R9 | **ACL-katalógus.** Az erőforrás-/műveletkatalógus az üzleti definíciókból generálódik. Az adminisztrátor kezeli a felhasználói jogokat és az API-hozzáférést. A katalógusgenerálás soha nem ad automatikusan jogot. Minden csatornán szerveroldali jogosultságvizsgálat; az API-kitettség és a token-scope csak szűkíti a meglévő hozzáférést. |
| R10 | **Eseménynaplózás.** Átfogó naplózás explicit lefedési katalógussal (4. fejezet); audit-, biztonsági és üzemeltetési események elkülönítve. A „mindent naplózunk” nem jelenti credentialok vagy korlátlan érzékeny payload tárolását. |
| R11 | **Kitchen-sink demó.** Navigálható demó szintetikus adatokkal. Minden implementált publikus komponenshez és képességhez reprodukálható példa, ugyanazokon a támogatott interfészeken, amelyeket az alkalmazások használnak. |
| R12 | **Igényvezérelt fejlesztés.** konkrét igény → keretbeli hiány → legkisebb újrahasznosítható bővítés → szintetikus demó és releváns teszt → használati dokumentáció → fogyasztói integráció → kontrollált éles kiadás. Kimerítő komponenskatalógus elkészülte nem feltétele a hasznos kiadásnak. |

## 2. Megvalósított képességek bizonyítékkal és hiányok

| # | Bizonyított jelenlegi állapot | Bizonyíték | Hiány (nem kész) |
| --- | --- | --- | --- |
| R1 | PHP 8.4+ referencia-runtime; a bootstrap `protocol: 1` mezőt ad, a frontend eltérésnél elutasít. Strukturált JSON műveleti API (`POST ./?vapa=1`). | `packages/php/src/Shell/Application.php`, `packages/frontend/src/AdminShell.ts`, [ACL és műveletek](access-and-actions.md) | Nincs publikált wire-séma, végpontonkénti verzió, kompatibilitási szabály vagy nyelvfüggetlen conformance fixture. A shellt PHP rendereli. |
| R2 | Szabály az AGENTS.md-ben és ADR-0002-ben; a fogyasztói hookok (`guard`, `normalize`, `after_save`, regisztrált action) a közös végrehajtón futnak. | [AGENTS.md](../AGENTS.md), [ADR-0002](decisions/0002-framework-first.md), [usage](usage.md#üzleti-konfiguráció-és-kód-határa) | Folyamatos felülvizsgálatot igényel; automatikus ellenőrzés nincs. |
| R3 | DHTMLX Window/Form login, Menu, Layout, Toolbar; Workspace adapter gridre, formra, DataView-kártyákra, konfigurálható layouttal és méretezővel. | [shell](shell.md), [munkaterületek](workspaces.md), `tests/shell/*.spec.cjs` | Billentyűzetes/fókusz-ergonómia, összetett többpaneles munkafolyamatok, tree/chart/scheduler/Gantt adapter nincs igazolva. |
| R4 | hu/en/de keretkatalógus, opcionális nyelvválasztó, kliens-/szervervalidáció és levél azonos nyelven; Skyblue/Világos/Éjjeli téma `setTheme` alapon. | [i18n](i18n.md), [shell témák](shell.md), `tests/shell/i18n.php`, `i18n.spec.cjs`, `browser.spec.cjs` | Az „új képesség részt vesz mindkettőben” szabály a definition of done-ba került; automatikus lefedettségi ellenőrzés nincs. |
| R5 | ACL-szabályok, scope-olt API-token, tranzakciós audit; **beépített felhasználóadmin (A1)**: lista, létrehozás ideiglenes jelszóval, módosítás, tiltás, kötelező jelszócsere; **szerepkör- és jogosultságadmin (A2)** védett szerepkörrel. | `packages/php/src/Admin/*`, `tests/shell/admin.php`, `tests/shell/permissions.php`, `tests/shell/admin.spec.cjs`, [admin](admin.md) | API-kulcs- és naplóadmin (A3–A4) még nincs. |
| R6 | SQL identitásillesztés (`SqlIdentityProvider`, `displayName`), jelszóellenőrzés és -csere, e-mailes belépési kód felhasználónkénti kapcsolóval, megjegyzett belépés; felhasználóadminnal e-mail mint azonosító, kötelező teljes név, ideiglenes jelszó és kötelező csere. | [authentication](authentication.md), `tests/shell/authentication.php`, `--project=auth` | Google/Facebook OAuth **nincs implementálva** (nincs provider adapter, fiókösszekapcsolás vagy felhasználónkénti engedély). Jelszó-helyreállítás (A5) még nincs. |
| R7 | SQLite: demó és fixture-ök. MySQL: `Database::connect`, JSON `database` szekció, `FOR UPDATE` és InnoDB ágak. | `Infrastructure/Database.php`, `Access/Schema.php`, `examples/demo-app/workspace.php` | PostgreSQL: nincs dialektuskód (a nem-MySQL DDL-ág SQLite-szintaxis). JSON-fájl: nincs adapter; Workspace/ACL/audit PDO-t igényel. Nincs tárolóinterfész. |
| R8 | `JsonApplication::load` tagolt JSON-nal, `$env` hivatkozással, névvel regisztrált bindingokkal; ismeretlen kulcs hiba; nincs eval. | [JSON-konfiguráció](configuration.md), `tests/shell/configuration.php` | Nincs JSON Schema, konfigurációs sémaverzió vagy migrációs út; a `storage.where` megbízható fejlesztői SQL. |
| R9 | Registry-alapú default deny; objektum-/mező-/csatornajog; token-scope csak szűkít; ismeretlen jog nem ad hozzáférést; definíciókból képzett `Catalogue`, szabálykezelő felület katalógus-validációval, árva szabályok jelölése, explicit első admin lépés. | [ACL és műveletek](access-and-actions.md), [admin](admin.md#szerepkörök-és-jogosultságok-a2), `tests/shell/access.php`, `tests/shell/permissions.php` | API-kitettség (scope) kezelése az API-kulcs-adminnal (A3); katalógus JSON-API nincs. |
| R10 | Közös `vapa_audit` napló: actor, csatorna, erőforrás, művelet, cél, eredmény, mezőnevek, request ID; érzékeny érték nélkül. | `Audit/Journal.php`, `Feature/Executor.php`, `Shell/Application.php` | Nincs kategóriaszétválasztás, megőrzési szabály, kereshető lognézet; több eseménytípus lefedése nem igazolt (4. fejezet). |
| R11 | Demó: shell + szintetikus jegyzetmodul SQLite-on; célzott fixture-ök (`tests/fixtures/*`). | `examples/demo-app`, `tests/fixtures` | Nincs egységes, navigálható kitchen sink, amely minden implementált képességet bemutat. |
| R12 | A „keret előbb, szintetikus teszt, fogyasztó” sorrend az ADR-0002 óta érvényes. | [ADR-0002](decisions/0002-framework-first.md), [fejlesztési terv](development-plan.md) | A kontrollált kiadás (verzió, frissítés, sémamigráció, visszaállítás) folyamata nyitott. |

## 3. Tárolási határ és szükséges garanciák

Javasolt határ (nem implementált): a keret szolgáltatásai (identitás, ACL, token, audit, lekérdezés, írás) explicit tárolóinterfészeken keresztül érik el az adatot; a PDO/SQL egy implementáció, nem a publikus szerződés része. Egy tároló csak akkor jelölhető támogatottnak egy területen, ha az adott terület minden garanciáját teszt igazolja. Ha egy garancia nem teljesíthető, a képesség az adott tárolón **kifejezetten nem támogatott**, és indításkor hibát ad; nem működhet csendben gyengébben.

| Terület | Szükséges garancia |
| --- | --- |
| Identitás | Egyedi, normalizált bejelentkezési azonosító/e-mail; fiókállapot-változás atomikus és azonnal érvényes; hash-only jelszó. |
| ACL | Szabálymódosítás atomikus; kérésen belül konzisztens olvasás; default deny hiányzó adatnál. |
| Token | Csak hash tárolás, egyedi azonosító, lejárat, azonnali visszavonás. |
| Audit | Hozzáfűzés-alapú; sikeres írás auditja ugyanabban a tranzakcióban; naplóhiba nem enged sikeres írást. |
| Lekérdezés | Objektumscope a lekérdezésben; szerveroldali szűrés/rendezés/lapozás; stabil kurzorrendezés. |
| Írás | Adat + audit atomikus; optimista revízió (409); soronkénti zárolás vagy egyenértékű konkurenciavédelem; összeomlás utáni konzisztencia. |

| Tároló | Jelenlegi állapot |
| --- | --- |
| SQLite | Demó és tesztek ezen futnak; a fenti garanciák tételes igazolása nincs külön dokumentálva. |
| MySQL | Kapcsolat, sématelepítés (InnoDB) és `FOR UPDATE`-ágak vannak; teljes garanciamátrix-teszt nincs. |
| PostgreSQL | Nem támogatott. |
| JSON-fájl | Nem támogatott; tranzakció, zárolás és crash recovery megoldása nyitott kérdés. |

## 4. Eseménynapló-lefedési katalógus

Kategóriák (elfogadott szétválasztás, R10): **audit** — ki, mit, min változtatott vagy olvasott üzletileg érdemben; **biztonsági** — hitelesítés, jogosultság, token, session, visszaélési jelek; **üzemeltetési** — hibák, jobok, integrációk, teljesítmény. Soha nem naplózott: jelszó, token, session-azonosító, e-mail-kód, SMTP/DB credential, nyers request body, titkos mező értéke.

| Esemény | Kategória | Állapot |
| --- | --- | --- |
| Regisztrált művelet siker/elutasítás/hiba (UI és API) | audit | megvalósítva (`Executor`) |
| Rekordleírás/form megnyitása (`describe`), élő feliratkozás | audit | megvalósítva (`Workspace`) |
| Jelszavas belépés siker/elutasítás, kijelentkezés | biztonsági | megvalósítva (`Shell/Application`) |
| CSRF-elutasítás, transport-szintű elutasított kérés | biztonsági | megvalósítva |
| E-mailkód küldés/ellenőrzés, megjegyzett belépés visszaállítása | biztonsági | megvalósítva (`Authentication/*`) |
| API-token kiadása/visszavonása | biztonsági | nem igazolt külön eseményként |
| ACL-szabály és szerepkör módosítása | biztonsági + audit | csak regisztrált műveleten át auditált; adminmodul nincs |
| Listaolvasás, export | audit | tervezett; részletesség és mennyiség nyitott |
| Konfiguráció-/sémaváltozás, telepítés | üzemeltetési | tervezett |
| Job, retry, integrációs hiba, lassú lekérdezés | üzemeltetési | tervezett (M6) |

## 5. Nyitott tervezési kérdések és javasolt munka

### Eldöntve az első adminszelethez — 2026-10-21

Elfogadott követelmények ([FB-0038](feedback.md#fb-0038--fiókéletciklus-döntések-az-első-adminszelethez)), még nem implementáltak:

- **Létrehozás:** az admin hozza létre a fiókot ideiglenes jelszóval; első belépéskor kötelező jelszócsere. Meghívó link nincs az első szeletben.
- **Megszüntetés:** csak tiltás; azonnal visszavonja a sessionöket, megjegyzett belépéseket és API-tokeneket; az auditnapló hivatkozásai épek maradnak. Végleges törlés és anonimizálás későbbi, külön döntés.
- **Teljes név:** kötelező, és a meglévő `displayName` hordozza; nincs külön névmező.
- **Jelszó-helyreállítás:** e-mailes, egyszer használható, lejáró link a loginablakból; egységes válasz a fiók létezésétől függetlenül, rátakorlát és audit.
- **Bejelentkezési azonosító:** minden alkalmazásban az e-mail-cím (normalizált, egyedi).
- **API-kulcsok:** egyelőre csak admin kezeli (kiadás, lista titok nélkül, visszavonás); önkiszolgálás későbbi, külön jog.
- **Beszúrást nem engedő fióktár:** a létrehozás letiltott, a meglévő fiókok kezelhetők.

### Még nyitott

Ezek nem elfogadott követelmények.

- **Fiókéletciklus további részei:** utolsó admin védelme, saját fiók tiltásának/jogvesztésének tilalma, ideiglenes jelszó lejárata, reset link élettartama, és hogy a reset után kell-e e-mailes belépésmegerősítés. Meglévő fióktárhoz adapteres illesztés kell, kényszerített adatduplikáció nélkül.
- **Hitelesítési policy:** OAuth és e-mailes megerősítés kombinálhatósága; providerhez kapcsolás/leválasztás; e-mail-egyezés alapú automatikus összekapcsolás tiltása vagy feltételei; elveszett hozzáférés kezelése; jelszó nélküli (csak OAuth) fiók engedése. Az e-mailes kód nem phishing-rezisztens, nem állítható MFA-megfelelőségnek.
- **JSON-fájl tároló:** milyen garanciákkal (egyfolyamatos, fájlzár, atomikus csere) és mely területekre vállalható; ha nem, mely képességek maradnak nem támogatottak.
- **JSON-szerződés:** sémaformátum, verziózási és deprecációs szabály, conformance fixture formája; a PHP által renderelt shell leválasztása.
- **Deklaratív szabályok határa:** milyen validált feltételek fejezhetők ki JSON-ban kezelő nélkül; workflow-motor nem következik automatikusan.
- **ACL-katalógus életciklusa:** definícióból törölt erőforrás meglévő szabályainak kezelése; katalógus-API formája.
- **Napló:** listaolvasás naplózásának részletessége, megőrzési idő, lognézet jogosultsága, külső sinkek.
- **Kitchen sink:** a demó szerkezete (egy alkalmazás moduljai vagy több fixture navigálható gyűjteménye).

Javasolt első szelet: **beépített adminmodul az SQLite demóban** — részletes terv: [adminmodul első szelet](admin-module-plan.md) a meglévő ACL/token/audit/form/grid képességekre építve, előtte a tároló- és szerződéshatár rögzítésével, hogy a modul ne vezessen be újabb PHP-/MySQL-kötést a frontend protokolljába. Ez nem írja elő egyszerre második backend vagy mind a négy tároló elkészítését.

## 6. Igényvezérelt végrehajtási módszer

1. **Konkrét igény:** feladat, szereplők, olvasási/írási csatornák, elfogadási esetek.
2. **Keretbeli hiány:** meglévő VAPA-képesség és a tényleges hiány; kernel, beépített modul és alkalmazási konfiguráció felelőssége.
3. **Legkisebb újrahasznosítható bővítés:** JSON-konfiguráció, protokoll, i18n, téma, ACL/API, tárolási garancia, naplóesemény és hibák.
4. **Szintetikus demó és teszt:** kitchen-sink példa ugyanazon a publikus interfészen; negatív jogosultsági, validációs és konkurenciateszt, ahol releváns.
5. **Használati dokumentáció:** [usage](usage.md) és témadoksi ugyanabban a batchben.
6. **Fogyasztói integráció:** konfiguráció és integrációs ellenőrzés a valós alkalmazásban.
7. **Kontrollált éles kiadás:** verzió, kompatibilitás, migráció és visszaállítás ellenőrzése után.

## Angol indítóprompt Claude számára

```text
You are implementing VAPA. Codex and the user define and review the work;
you implement bounded, reviewable increments. Read AGENTS.md, docs/usage.md,
docs/feedback.md, docs/product-direction.md, the relevant topic docs, and
the actual source before changing code. Preserve unrelated local changes.

Treat docs/product-direction.md (FB-0036 as corrected by FB-0037, ADR-0003)
as the current product direction. Keep three categories separate: accepted
requirements, implemented capabilities backed by evidence, and open
questions or proposals. Never mark a capability done without evidence.

VAPA must provide a mandatory built-in administration module in every
application: users, ACL, API keys, and system/audit logs. This supersedes
the earlier application-only user admin decision. Build it with VAPA's own
declarative definitions, DHTMLX adapters, authorization, validation,
execution, and audit facilities. Applications provide configuration,
identity/storage mappings, and domain rules; they must not implement
replacement admin infrastructure.

PHP is the reference backend, not a requirement of the frontend protocol.
Define versioned, language-neutral JSON contracts for bootstrap/metadata,
authentication state, queries, actions, validation, errors, capabilities,
and compatibility. JSON transport alone does not establish backend
independence. Keep PHP callbacks and SQL server-side. Do not rewrite the
backend or add a second implementation without a concrete need.

The frontend is a fullscreen HTML5 application built on the bundled DHTMLX
components, extended only through VAPA adapters and supported extension
points. Layout management is foundational. Grow forms, layouts, and grids
for complex, ergonomic workflows as concrete requirements arise. There is
no external framework benchmark and no complete component-coverage goal.
Every new framework feature must participate in localization and theming.

Target MySQL, PostgreSQL, SQLite, and file-based JSON behind explicit
storage contracts; the demo uses SQLite. Support means the documented
guarantees for identity, ACL, tokens, audit, queries, and writes are met
and tested, not that a connection opens. Declare unsupported guarantees
explicitly and fail fast instead of degrading silently.

Use validated, versioned, modular JSON for application structure and
declarative business definitions, with explicitly registered handlers for
complex domain logic. No eval, executable strings, or unrestricted
scripting. Generate the ACL resource/action catalogue from definitions,
but never grant access automatically. Enforce authorization server-side
on every channel; API exposure and token scopes only restrict access.

Log through an explicit coverage catalogue that separates audit, security,
and operational events. Never log credentials, tokens, codes, or raw
sensitive payloads. Maintain a navigable kitchen-sink demo with synthetic
data; every implemented public capability needs a reproducible example
using the same supported interfaces as applications.

Work incrementally: concrete requirement -> framework gap -> smallest
reusable extension -> synthetic demo and relevant tests -> usage docs ->
consumer integration -> controlled release. For the first increment,
produce an evidence-backed plan for the smallest built-in admin slice in
the SQLite demo: account lifecycle proposal, privilege-management rules,
storage boundary, event coverage, and acceptance criteria. Identify
decisions requiring user input. Do not promise complete OAuth, storage,
or logging coverage in this increment.

For each task, include relevant UI/API denial, validation, conflict, and
audit checks, record actual results and limitations, follow the browser
runner guards and commit/push rules, and report missing tools without
bypassing them.
```
