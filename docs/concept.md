# VAPA részletes koncepció

Állapot: tervezési alap, 2026-10-16. Ez a dokumentum a célrendszert írja le, nem már elkészült funkciókat.

## 1. Cél és sikerkritérium

A VAPA (Very Advanced PHP Admin) több alkalmazásban használható admin keretrendszer. Egy fejlesztő által írt, típusos feature-definíció alapján kapcsolja össze az objektumok nézeteit, műveleteit, validációját és REST-elérését. Nem generál helyettesítő üzleti logikát: az alkalmazás explicit szolgáltatásai hajtják végre a műveleteket.

Az első fogyasztó a teljes CityScreen admin újraírása. A VAPA sikere nem néhány CRUD-képernyő elkészülte: az új CityScreen admin összes egyeztetett képességét ki kell tudnia szolgálni. A teljes alkalmazási migráció külön projektmunka, saját repóval és elfogadási listával.

Sikerkritériumok:

- Egyszerű feature-höz nem kell külön frontend CRUD-kódot írni.
- Összetett üzleti képernyő és művelet elsőrendű bővítési lehetőség, nem kerülőút.
- Az UI és REST ugyanazokat a use case-eket, tranzakciókat és policy-kat használja.
- Szervezet, objektum és mező szintjén egységes, szerveroldali védelem működik.
- A csomagok tiszta checkoutból egy második, CityScreen-független alkalmazásba is telepíthetők.
- A régi ADE-s API, runlevel és generált JavaScript válaszformátum nem része az új szerződésnek.

## 2. Hatókör

A VAPA része a feature registry, UI renderer és shell, komponensadapterek, query protokoll, API infrastruktúra, auth-integráció, policy motor, szervezeti kontextus, fájl- és háttérmunka-infrastruktúra, audit és megfigyelhetőség.

Nem része: CityScreen üzleti fogalmak, adatbázistáblák, DMS vezérlés, ajánlatkalkuláció, munkalap-ellenőrzési szabályok, kampánylogika, produkciós adatkonverzió. Nem építünk vizuális no-code alkalmazásszerkesztőt. A frontend komponenseket nem írjuk újra a DHTMLX helyett.

A komponenskör teljes adminfelületet jelent: grid, tree, treegrid, form, dataview, list, dashboard/chart, calendar/scheduler, timeline, Gantt, navigáció, panelek, tabok, ablakok, fájlkezelés és szerkesztők. A kiadáshoz kötött képességeket a komponensmátrix rögzíti; egy könyvtár jelenléte nem jelent ingyenes vendorjogosultságot.

## 3. Technológiai alap

Elfogadott alap: modern PHP + PHP-FPM + OPcache. A PHP 8.4 minimum technikai kiindulás; PHP 8.5 kompatibilitást is ellenőrizni kell. A régi CityScreen PHP-runtime nem referencia és nem módosítható automatikusan.

Javasolt hosting alap: Symfony 7.4 LTS, kész HTTP/router/DI/validation/security/messenger infrastruktúrával. Ezt az M1-ben döntési naplóban véglegesítjük; az üzleti domain ne függjön a HTTP-keretrendszertől. Nem írunk saját jelszóhashelést, HTTP-szervert vagy általános SQL-drivert.

Frontend: TypeScript, DHTMLX Suite Standard, külön Scheduler és Gantt adapter. Nincs kötelező React/Vue réteg. Build közben fordítjuk a TypeScriptet, éles működéshez nem kell Node-szerver. A pontos Node-, buildtool- és vendorverziók M1-ben rögzítendők a telepített csomagok és licencek ellenőrzése után.

FrankenPHP worker mód későbbi, méréshez kötött opció. Az induló architektúra nem függ tőle.

## 4. Csomagolás és függési irány

Egy VAPA-repó két együtt verziózott csomaggal: PHP és frontend. A CityScreen külön repóban fogyasztja őket. A PHP package a `Vapa\\` namespace-t használja; a frontend publikus API-ját külön exportlista definiálja majd.

A keret az alkalmazást csak regisztrált szerződéseken keresztül éri el. Tervezett szerepkörök: FeatureProvider, QueryProvider, ActionHandler, Policy, IdentityProvider, TenantResolver, FileStorage, JobDispatcher, AuditSink. Ezek még tervezett szerződésnevek, nem létező osztályok.

Lokális fejlesztésnél Composer path repository és frontend workspace/link használható. Kiadásban rögzített csomagverzió, lockfile és reprodukálható build kell; abszolút lokális útvonal nem maradhat benne. GitHub-repó publikálása nem jelent automatikus npm/Packagist publikálást.

## 5. Feature-modell

Egy feature egy értelmezhető üzleti képesség, nem feltétlenül egy adatbázistábla. Több feature használhatja ugyanazt a domaint, más nézettel és hozzáféréssel. Az adatbázis sémáját nem publikáljuk automatikusan API-ként.

A definíció részei:

1. Stabil azonosító, címkék és lokalizációs kulcsok.
2. Objektumazonosság és szervezeti scope forrása.
3. Mezők: adattípus, olvasási/írási szerep, formátum, szervervalidáció és megjelenítési igény.
4. Kapcsolatok: célfeature, választólista, hivatkozás és lazy betöltés.
5. QueryProvider: engedélyezett szűrés, rendezés, lapozás és aggregáció.
6. Nézetek: grid, form, tree, dataview, naptár stb., közös mezőhivatkozásokkal.
7. Műveletek: input, ActionHandler, policy, tranzakció, audit, szinkron vagy job.
8. API-kitettség: feature-, erőforrás- és műveletszinten explicit engedélyezés.
9. Bővítések: regisztrált frontend komponens vagy eseménykezelő azonosítója.

A fejlesztő egy belépő definíciót ír; a komplex részek osztályokba és aldefiníciókba bonthatók. Az egykonfigos működés nem egy óriási fájlt jelent.

A registry fordításkor ellenőrzi a hivatkozásokat, duplikált ID-kat, műveletek handlerét, mezőtípusokat és vendor capability-ket. Hibás definícióval nincs részlegesen működő kiadás: a validálás a build/CI kapuja.

## 6. Backend és frontend metaadat határa

A teljes definíció szerveroldali. A böngésző csak ellenőrzött UI-projekciót kap: mezőcímkék, megjelenítési típus, layout, használható műveletek és endpointazonosítók. SQL, policy implementáció, secret, belső osztálynév vagy tiltott meződefiníció nem kerülhet bele.

A metaadat protokoll saját verziót kap. Eltérő frontend/backend protokoll esetén érthető inkompatibilitási hiba szükséges. A cache-kulcs része az alkalmazás/definíció verziója, locale és a jogosultsági kontextus; más felhasználónak vagy szervezetnek szánt metaadat nem osztható meg.

Nem küldünk végrehajtható JS/PHP stringet. Eseménykezelőket a frontend buildben regisztrált azonosítókkal választunk ki. Egyedi HTML csak explicit, biztonságosan kezelt komponensben engedhető meg.

## 7. Adatfolyam és tranzakciók

Olvasás: hitelesítés → szervezeti kontextus → feature/műveletengedély → query scope → validált filter/sort/page → adatlekérés → mezőprojekció → válasz.

Írás: hitelesítés és CSRF/token ellenőrzés → szervezeti kontextus → inputmezők engedélyezése → objektum lekérése engedélyezett scope-ból → policy → validáció → alkalmazási use case → tranzakció → audit → válasz.

A UI inline edit és form save ugyanahhoz a use case-hez vezet. A bulk, import, scheduler drag és Gantt linkmódosítás sem kerülheti meg ezt. Az API nem általános táblamódosító végpont.

Tranzakción belül tartjuk az összetartozó adatváltozásokat. Külső mellékhatást commit után, tartós job/outbox segítségével indítunk, ahol a megbízható kézbesítés üzletileg szükséges. Többszöri kézbesítést kezelő handler kell; a nyelv vagy queue nem biztosít automatikusan exactly-once üzleti végrehajtást.

Ütköző szerkesztéshez verziómező/optimista zárolás az alapirány. Egy időközben megváltozott objektum mentése 409 konfliktust adjon, ne írja felül csendben az újabb módosítást.

## 8. Lekérdezési modell és teljesítmény

Filter-, sort- és mezőnevek allowlist alapján oldhatók fel. Kliensből nem fogadunk SQL-t, táblanevet, join-kifejezést vagy tetszőleges oszlopnevet. A paramétereket kötjük, az SQL scope-ot backend adapter állítja elő.

A lapméret korlátozott; a végleges limiteket valós terhelésmérés alapján rögzítjük. Nagy adattömeghez szerveroldali lapozás, tree-nél lazy gyermekbetöltés, naptárnál időablak, Ganttnál dokumentált kiadásfüggő betöltés szükséges.

Count, autocomplete, aggregáció, export és kapcsolati feloldás ugyanazt a scope-ot használja. A jogosultságot nem soronkénti utólagos kiszűréssel oldjuk meg. A policy-scope hatékony lekérdezési terve és megfelelő indexei elfogadási feltételek.

Cache előtt mindig azonosítjuk a scope-ot és az érvénytelenítést. Megosztott cache nem tartalmazhat más szervezet számára olvasható eredményt. Nem vezetünk be Redis-függőséget pusztán megszokásból; infrastruktúraigényt mérés és funkció indokoljon.

## 9. Admin shell és komponensintegráció

Shell: bejelentkezés utáni navigáció, szervezetváltás, workspace, panelek/tabok, értesítések, loading/empty/error állapotok, route és állapotkezelés. Menü csak engedélyezett feature-öket mutat, de a backend ettől függetlenül ellenőriz.

Adapterenként egységes mount/update/destroy életciklus kell. El kell távolítani az eseménykezelőket, abortálni a lejárt kéréseket, és védeni a nézetet a később beérkező régi válaszoktól. A nem mentett változásokat jelezni kell navigációnál.

Közös szabványok: lokalizáció, timezone, hibák, billentyűzetes használat, fókuszkezelés, jogosultságváltozás, API megszakítás és kapcsolatvesztés. A jogosultságvesztés után a korábbi adatok nem maradhatnak aktív szerkesztőben.

Mentett nézet személyes vagy explicit megosztott lehet; mentett szűrő sosem tárol nyers SQL-t. A mezőjog változása után újra kell validálni.

## 10. Naptár, Gantt és hierarchia

Naptárhoz az időpont, időzóna, egész napos esemény és ismétlődés külön típus. A nyári/téli átállás tesztelendő; a dátum-only mezőt nem konvertáljuk automatikusan időpillanattá.

Áthúzás és átméretezés üzleti parancsot indít. A szerver elutasítása visszaállítja a nézetet és érthető hibaüzenetet ad. Ütközés, erőforrás-szabály és munkanaptár az alkalmazás szabálya; a keret hívási pontokat ad.

Tree áthelyezésnél a forrás és cél szervezetét, mindkét oldali jogosultságot és a ciklusmentességet is ellenőrizni kell. Gantt függőségnél a ciklus és a hozzáférhetetlen célobjektum kezelése szükséges. PRO-ban létező képességet Standard adapter nem ígérhet teljesítettnek.

## 11. REST és külső kliensek

Az admin belső HTTP API-ja és a külső integrációs REST-kitettség külön kapcsoló. Egy UI-ban használható feature nem válik automatikusan külső API-vá. A külső API verziózott; a séma dokumentációja csak az engedélyezett műveletekből készül.

Gépi identitás saját szervezeti és műveleti jogokkal rendelkezik. A token scope korlátoz, nem ad többet az identitás jogainál. A konkrét auth protokoll és token-életciklus M2-ben véglegesítendő; nem gyártunk saját kriptográfiai protokollt.

Hibák strukturáltak: validációs mezőhibák, nem hitelesített, tiltott/hozzáférhetetlen, konfliktus, limit és belső hiba. A válasz request ID-t ad, stack trace-t vagy SQL-t élesben nem. A publikus wire schema M1–M3 szerződésteszttel rögzítendő.

## 12. Fájlok, audit és háttérmunka

Fájlok nem a publikus webrootba kerülnek alapértelmezetten. Letöltés és preview policy-n keresztül megy; a fájlazonosító nem fájlrendszerútvonal. MIME/méret ellenőrzés, biztonságos fájlnév, feltöltési kvóta és megszakadt feltöltés takarítása szükséges.

Audit: actor, tenant, action, target, időpont, eredmény és korreláció. Jelszó/token soha nem auditadat. Érzékeny mezőknél explicit maszkolás. A megőrzést és hozzáférést az alkalmazás konfigurálja.

Job: explicit tenant/actor referencia, újraellenőrzött hozzáférés, retry, idempotencia és sikertelen job kezelése. Exportnál a generálás és letöltés időpontjában is érvényes jogosultság kell.

## 13. Tesztelés és üzemeltetés

Unit: definíciófordítás, policy kombináció, filter-validálás. Integráció: valós izolált tesztadatbázis, tranzakció, scope és jogosultság. Contract: PHP metaadat és frontend kompatibilitása. E2E: shell és minden vállalt komponens tényleges felhasználói működése. Performance: p50/p95/p99, hibaarány, throughput, SQL darabszám/idő, CPU és memória rögzített adathalmazon.

PHP-FPM pool és OPcache a VAPA-demo/fogyasztó új admin számára külön konfigurálható. Első telepítés nem kapcsolja át a régi admin PHP-ját. Request log, slow query és jobmetrikák segítik a diagnózist; személyes adatot ne használjunk címkeként.

## 14. CityScreen teljes átállása

A fogyasztó repóban készüljön teljes képernyő/művelet/integráció leltár és megtart/újratervez/elhagy döntési lista. Minden átvett modul üzleti logikáját újraírjuk. Legacy kompatibilitási réteg nincs.

Modulonkénti átadás előtt rögzítendő az adatok írási felelőse, az átmeneti közös adatbázis használata, a schema-kompatibilitás és visszaállási út. Két admin nem hajthat végre ugyanazon üzleti objektumon eltérő szabályú írást felügyelet nélkül.

Az adatmegőrzés, azonosítók, médiaútvonalak és kapcsolt DMS/publikus oldali olvasók szerződései alkalmazási migrációs feladatok. A publikus oldalak átépítése nem cél, működésük megőrzése viszont kötelező integrációs feltétel.

A régi ADE-admin csak a teljes egyeztetett üzleti képességlista teljesülése után vezethető ki. A VAPA demo elkészülte nem jelenti a CityScreen migráció befejezését.
