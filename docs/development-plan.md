# VAPA fejlesztési terv

Állapot: 2026-10-16, M0 könyvtárváz és tervek. A sorrend függőségeket jelöl, nem időbecslést. Minden további mérföldkő még nyitott.

## M0 — Külön repó, szerkezet és koncepció

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

## M2 — Auth, tenant és ACL alap

Feladatok: szintetikus identitások és két szervezet, login/logout, session/CSRF, szervezetváltás, gépi auth megoldás, role/action policy, query scope és mezőprojekció, cache invalidálás, audit.

## M3 — Első teljes feature-folyamat

Szintetikus projekt/feladat domain: lista, keresés, szerveroldali lapozás, részletek, form, létrehozás, módosítás és explicit törlési/archiválási művelet. Egy típusos definícióból UI-metaadat, műveleti regisztráció és opcionális külső REST.

Feladatok: inputvalidáció, engedélyezett filter/sort, QueryProvider és ActionHandler, tranzakció és optimista zárolás, strukturált mezőhibák, read-only és tiltott mezők kezelése.

Átadás: ugyanaz a use case működik formból, inline editből és API-ból. API-kitettség kikapcsolható az admin letiltása nélkül. Két egyidejű mentés konfliktusa nem okoz csendes adatvesztést. A feature-definíció nem tartalmaz frontendbe kijutó SQL-t.

## M4 — Teljes admin shell és adatnézetek

Navigáció, panelek, tabok, ablakok, toolbarok, mentetlen módosítás, jogosultságfüggő műveletek, személyes nézetállapot, lokalizáció, fókusz és billentyűzet.

Grid/form mellett tree, dataview, list, chart és kapcsolt objektumválasztók. TreeGrid csak ténylegesen rendelkezésre álló licencelt megoldással, explicit capability-ként. Layout és adapter életciklus tesztek szükségesek.

Átadás: minden vállalt adapterhez dokumentált konfiguráció és E2E példa; mount/destroy ciklus nem halmoz eseménykezelőket. Hibás vagy nem támogatott képességre érthető hiba jön, nem üres vagy félig működő UI. Nincs automatikus jogvesztés a nézetváltások között.

## M5 — Időtervezés, Gantt és összetett műveletek

Scheduler időablakos adatokkal, ismétlődés, timezone és DST tesztek. Gantt hierarchia, függőségek és módosítások. Áthelyezés, átméretezés és függőségmódosítás szerveroldali parancs.

A timeline, több erőforrásos nézet, automatikus ütemezés és más PRO-képesség előtt kiadás-/licencdöntés szükséges. Ezek teljesítetlenek maradnak, amíg megfelelő implementáció és teszt nincs; nem nyilvánítjuk késznek a teljes lefedést pusztán az alap Gantt alapján.

Átadás: tiltott áthúzás visszaáll; hozzáférhetetlen cél és ciklus elutasított; DST és ismétlődő esemény módosítása dokumentált viselkedésű; a támogatott komponensverziók rögzítettek.

## M6 — Fájlok, export/import, jobok és megfigyelhetőség

Privát storage adapter, feltöltés/preview/letöltés, kvóta és ellenőrzés, aszinkron export és import, retry és idempotencia, szükség esetén outbox. Audit, request ID, strukturált logok, jobstátusz és slow query mérés.

Átadás: export és letöltés sem ad ki tiltott mezőt vagy más szervezeti rekordot; visszavont hozzáférés a háttérmunkánál is érvényesül. Retry nem dupláz üzleti mellékhatást. Nagy export nem tartja fogva a webes kérést. Log nem tartalmaz credentialt.

## M7 — Teljesítmény, csomagkiadás és második fogyasztó

Rögzített gép-/runtime-/adatbázisprofil és szintetikus terhelési készlet. Lista, lookup, összetett ACL, bulk, naptár és exportindítás mérendő. Jelentés: p50/p95/p99, throughput, hibaarány, CPU, memória, SQL darabszám és idő.

### A2 — Modulcsoportonkénti átállás

Minden csoporthoz új use case-ek, új policy-k és explicit schema/data migráció. Előbb a függőségek, utána a rájuk épülő folyamatok. Minden migrációnál készítsünk képességpárosítást a régi és új admin között; az ismert hibás működést nem másoljuk át automatikusan.

### A3 — Teljes admin kiváltása

Minden egyeztetett képesség megvalósított vagy kifejezetten elhagyott. Összes háttérfeladat és integráció felelőse tisztázott. Régi route-ok és írási utak lekapcsolása csak ezek után. A fennmaradó ADE-függőségeket külön listázni kell; admin kivezetés nem bizonyítja automatikusan a teljes rendszer ADE-mentességét.

## Közös definition of done

- Implementáció és releváns teszt ugyanabban a batchben.
- Doksik, capability-mátrix és API-szerződés frissítve.
- Nincs keretbe került alkalmazási tudás vagy tiltott függési irány.
- Valós teszteredmény és fennmaradó korlát rögzítve; scaffold nem feature.
- Érdemi batch után `/usr/local/bin/gitpush --all -t`, az érintett repóban külön.
- A felhasználó értesül az eredményről, a tesztelésről és a tényleges blokkoló tényezőkről.
