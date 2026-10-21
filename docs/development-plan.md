# VAPA fejlesztési terv

Állapot: 2026-10-16, M0 után első login/navigációs shell és frontend build készült ([használat](shell.md)). M1/M2/M4 részfeladatok implementálva, a teljes mérföldkövek továbbra is nyitottak. A sorrend függőségeket jelöl, nem időbecslést. 2026-10-21: a [termékirány](product-direction.md) (R1–R12, [ADR-0003](decisions/0003-product-direction.md)) szerint frissítve.

## Igényvezérelt fejlesztési módszer

Minden fejlesztési szelet ezt a láncot követi:

konkrét igény → keretbeli hiány → legkisebb újrahasznosítható bővítés → szintetikus demó és releváns teszt → használati dokumentáció → fogyasztói integráció → kontrollált éles kiadás.

A mérföldkövek függőségi csoportok, nem kiadási kapuk. Hasznos kiadásnak nem feltétele egy kimerítő komponens- vagy funkciókatalógus elkészülte; a támogatott képességkör a valós igényekből nő. Nincs külső keretrendszer-benchmark ([FB-0037](feedback.md#fb-0037--ext-js-referencia-visszavonása-dhtmlx-alap-igényvezérelt-képességkör)).

## Termékirány-munkafolyamatok (javasolt, nem ütemezett)

Ezek javasolt munkák; a nyitott döntéseket a [termékirány 5. fejezete](product-direction.md#5-nyitott-tervezési-kérdések-és-javasolt-munka) sorolja.

| Munka | Követelmény | Első javasolt lépés |
| --- | --- | --- |
| P1 Kötelező adminmodul | R5, R6, R9 | [Terv](admin-module-plan.md); A1 és A2 kész ([használat](admin.md)); A3–A5 következik: API-kulcsok, naplónézet, jelszó-helyreállítás az SQLite demóban. |
| P2 Nyelvfüggetlen JSON-szerződés | R1 | Bootstrap, metaadat, query, action, hiba és capability séma rögzítése verzióval; conformance fixture-formátum javaslat. |
| P3 Tárolási határ | R7 | Tárolóinterfészek és garanciamátrix-tesztek; SQLite és MySQL tételes igazolása; PostgreSQL és JSON-fájl csak igény és teljesíthető garanciák esetén. |
| P4 Eseménykatalógus | R10 | Kategóriamező a naplóban; hiányzó biztonsági események (token, ACL-változás) és megőrzési szabály. |
| P5 Kitchen sink | R11 | A demó navigálható katalógussá szervezése; minden implementált képességhez példa. |
| P6 OAuth-belépés | R6 | Csak a hitelesítési policy-kérdések eldöntése után; provider adapter és biztonságos fiókösszekapcsolás. |
| P7 JSON-konfiguráció érése | R8, R9 | JSON Schema és sémaverzió; generált ACL-katalógus lekérdezése és árva szabályok egyeztetése. |

## M0 — Külön repó, szerkezet és koncepció

Eredmény: VAPA checkout, PHP/frontend csomaghelyek, teszt- és demokönyvtárak, részletes koncepció, ACL-modell, komponensmátrix és ez a terv. A CityScreen helyi ignored symlinken keresztül láthatja a keretet.

Átadási feltétel: manifestek érvényes JSON-t tartalmaznak, dokumentumhivatkozások működnek, csomaghatárok egyértelműek, nincs secret/vendor/üzleti kód, a külön remote-ra push megtörtént. Ez még nem futtatható release.

## M1 — Runtime és csomagszerződés

Feladatok:

- PHP 8.4+ fejlesztői futtatókörnyezet és Composer biztosítása a régi admin módosítása nélkül; PHP-FPM + OPcache referencia-konfiguráció.
- Symfony 7.4 LTS hosting javaslat véglegesítése ADR-ben; a szükséges komponensek és adatbázisadapter kiválasztása.
- Node/buildtool/TypeScript verziók rögzítése, DHTMLX tényleges csomagverzió és licence ellenőrzése.
- VAPA saját licencének és a GPL-es függőségek terjesztési modelljének eldöntése a publikálás előtt.
- Composer autoload, frontend build és szintetikus demoalkalmazás indítása; csak public webroot.
- HTTP/API hibamodell, metaadat-protokoll v1, feature registry és adapter interfészek rögzítése.
- Automatizált lint/static analysis, unit és contract tesztparancsok, CI; dependency lock és ellenőrizhető build.

Átadás: tiszta checkoutból dokumentált parancsokkal fut a demo health endpoint és üres admin shell. Egy csomagverzió-eltérés szabályosan elutasítható. Nem használ abszolút CityScreen pathot. Nincs még üzleti modulígéret.

## M2 — Auth, tenant és ACL alap

Feladatok: szintetikus identitások és két szervezet, login/logout, session/CSRF, szervezetváltás, gépi auth megoldás, role/action policy, query scope és mezőprojekció, cache invalidálás, audit.

Átadás: a security-model tesztmátrix releváns olvasási/írási esetei automatizáltan teljesülnek. Közvetlen API-hívás nem kerüli meg a policy-t. Szervezetváltás után nem marad előző szervezeti adat. A keret semmilyen CityScreen felhasználóflaget nem ismer.

## M3 — Első teljes feature-folyamat

Szintetikus projekt/feladat domain: lista, keresés, szerveroldali lapozás, részletek, form, létrehozás, módosítás és explicit törlési/archiválási művelet. Egy típusos definícióból UI-metaadat, műveleti regisztráció és opcionális külső REST.

Feladatok: inputvalidáció, engedélyezett filter/sort, QueryProvider és ActionHandler, tranzakció és optimista zárolás, strukturált mezőhibák, read-only és tiltott mezők kezelése.

Átadás: ugyanaz a use case működik formból, inline editből és API-ból. API-kitettség kikapcsolható az admin letiltása nélkül. Két egyidejű mentés konfliktusa nem okoz csendes adatvesztést. A feature-definíció nem tartalmaz frontendbe kijutó SQL-t.

## M4 — Teljes admin shell és adatnézetek

Navigáció, panelek, tabok, ablakok, toolbarok, mentetlen módosítás, jogosultságfüggő műveletek, személyes nézetállapot, lokalizáció, fókusz és billentyűzet.

Grid/form/DataView és kapcsolt objektumválasztók; további DHTMLX nézetek (tree, list, chart) konkrét igény esetén. TreeGrid csak ténylegesen rendelkezésre álló licencelt megoldással, explicit capability-ként. Minden nézet lokalizált és témázható. Layout és adapter életciklus tesztek szükségesek.

Átadás: minden vállalt adapterhez dokumentált konfiguráció és E2E példa; mount/destroy ciklus nem halmoz eseménykezelőket. Hibás vagy nem támogatott képességre érthető hiba jön, nem üres vagy félig működő UI. Nincs automatikus jogvesztés a nézetváltások között.

## M5 — Időtervezés, Gantt és összetett műveletek

Csak konkrét alkalmazási igény esetén indul.

Scheduler időablakos adatokkal, ismétlődés, timezone és DST tesztek. Gantt hierarchia, függőségek és módosítások. Áthelyezés, átméretezés és függőségmódosítás szerveroldali parancs.

A timeline, több erőforrásos nézet, automatikus ütemezés és más PRO-képesség előtt kiadás-/licencdöntés szükséges. Ezek teljesítetlenek maradnak, amíg megfelelő implementáció és teszt nincs; nem nyilvánítjuk késznek a teljes lefedést pusztán az alap Gantt alapján.

Átadás: tiltott áthúzás visszaáll; hozzáférhetetlen cél és ciklus elutasított; DST és ismétlődő esemény módosítása dokumentált viselkedésű; a támogatott komponensverziók rögzítettek.

## M6 — Fájlok, export/import, jobok és megfigyelhetőség

Privát storage adapter, feltöltés/preview/letöltés, kvóta és ellenőrzés, aszinkron export és import, retry és idempotencia, szükség esetén outbox. Audit, request ID, strukturált logok, jobstátusz és slow query mérés.

Átadás: export és letöltés sem ad ki tiltott mezőt vagy más szervezeti rekordot; visszavont hozzáférés a háttérmunkánál is érvényesül. Retry nem dupláz üzleti mellékhatást. Nagy export nem tartja fogva a webes kérést. Log nem tartalmaz credentialt.

## M7 — Teljesítmény, csomagkiadás és második fogyasztó

Rögzített gép-/runtime-/adatbázisprofil és szintetikus terhelési készlet. Lista, lookup, összetett ACL, bulk, naptár és exportindítás mérendő. Jelentés: p50/p95/p99, throughput, hibaarány, CPU, memória, SQL darabszám és idő.

Konkrét terhelési/SLO célokat az első mérés és a CityScreen várható adatmennyisége alapján rögzítünk a nagy migráció előtt. Üres JSON endpoint benchmark nem elfogadási bizonyíték. Worker mód csak kimutatható előnnyel és izolációs tesztekkel jöhet.

Átadás: külön üres fogyasztó repo rögzített verziókból telepíthető; a helyi symlink nem szükséges a buildhez. Publikus API dokumentált, release note és upgrade útmutató kész. Licencdöntés rendezett. A demo és CityScreen egymástól függetlenül frissíthető.

## Párhuzamos alkalmazási munkafolyamat — teljes CityScreen admin

Ez a munkafolyamat a CityScreen repóban történik. A VAPA koncepció nem helyettesíti az alkalmazás konkrét migrációs tervét.

### A0 — Teljes leltár, még a tömeges átírás előtt

Minden képernyőhöz/művelethez rögzítendő: jelenlegi belépési pont, jogosultság, adatforrás és kapcsolatok, mellékhatás, fogyasztó/integráció, megtart/áttervez/elhagy döntés, új modul, elfogadási eset és átállási függőség.

Vizsgálandó területek: identity/szervezetek/jogosultságok; cikk/esemény/videó/oldal és törzsadatok; médiatár és customer/content admin; sales/partnerek/ajánlatok/szerződések/marketing; CityScreen/AP/térkép/állapot/vezérlés és DMS; Workday admin/diszpécser/munkalapok; levelek, exportok, importok, cronok és naplók. A tényleges modulhatárokat a leltár bizonyítja.

A külön terepi Workday felület és publikus oldalak teljes UI-újraírása nem automatikus része az adminfeladatnak. Függőségeik és a teljes ADE-kivezetéshez szükséges backendmunkák külön rögzítendők, nem hagyhatók figyelmen kívül.

### A1 — Új alkalmazásváz a CityScreen /v2 alatt

VAPA csomagfüggőségek, alkalmazási konfiguráció, külön public webroot, környezet és tesztadatbázis. Identity/szervezeti modell és a meglévő adatok migrációjának megtervezése. Az első teljes üzleti modul az A0 alapján választandó: valós, megfelelően kicsi, de jogosultságot és adatkapcsolatot is igazoló folyamat.

### A2 — Modulcsoportonkénti átállás

Minden csoporthoz új use case-ek, új policy-k és explicit schema/data migráció. Előbb a függőségek, utána a rájuk épülő folyamatok. Minden migrációnál készítsünk képességpárosítást a régi és új admin között; az ismert hibás működést nem másoljuk át automatikusan.

Átadás előtt: tesztek, szerepkörös bejárás, adatmegőrzés ellenőrzése, kapcsolt fogyasztók ellenőrzése, egyetlen kijelölt írási út és dokumentált rollback/restore. Visszafordíthatatlan adatkonverzió esetén backup-visszaállítás szükséges, nem puszta alkalmazásverzió-visszakapcsolás.

### A3 — Teljes admin kiváltása

Minden egyeztetett képesség megvalósított vagy kifejezetten elhagyott. Összes háttérfeladat és integráció felelőse tisztázott. Régi route-ok és írási utak lekapcsolása csak ezek után. A fennmaradó ADE-függőségeket külön listázni kell; admin kivezetés nem bizonyítja automatikusan a teljes rendszer ADE-mentességét.

## Közös definition of done

- Implementáció és releváns teszt ugyanabban a batchben.
- Doksik, capability-mátrix és API-szerződés frissítve.
- Az új képesség lokalizált (keretkatalógus hu/en/de) és minden támogatott témában működik.
- Reprodukálható kitchen-sink példa szintetikus adatokkal, ugyanazon a publikus interfészen, mint az alkalmazás.
- Új naplóesemény a lefedési katalógusban kategorizálva; új tárolási igény a garanciamátrixban jelölve.
- A [használati módszertan](usage.md) tartalmazza az érintett képesség alkalmazását és ellenőrzését; a felhasználói tesztelés [visszajelzései](feedback.md) rögzítve és az elfogadott tanulságok átvezetve. Nyitott elvárás nem szerepel megvalósított funkcióként.
- Nincs keretbe került alkalmazási tudás vagy tiltott függési irány.
- Valós teszteredmény és fennmaradó korlát rögzítve; scaffold nem feature.
- Érdemi batch után `/usr/local/bin/gitpush --all -t`, az érintett repóban külön.
- A felhasználó értesül az eredményről, a tesztelésről és a tényleges blokkoló tényezőkről.
