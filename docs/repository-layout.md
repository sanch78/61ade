# Könyvtárak és csomaghatárok

## Két külön repó

- `/space/frameworks/vapa`: a keretrendszer canonical checkoutja, GitHub: https://github.com/sanch78/vapa.
- `/space/apps/cityscreen`: a fogyasztó alkalmazás meglévő repója; az új admin későbbi helye `v2/`.
- `/space/apps/cityscreen/vapa`: ignored helyi symlink a VAPA checkoutra, kizárólag kényelmes szerkesztéshez. Nem telepítési mechanizmus és nem submodule.
- Függőség: CityScreen → VAPA. Fordított függőség, CityScreen-forrásra mutató include vagy VAPA-ból elért alkalmazásglobális tiltott.

## Backend

`packages/php/src/Contracts`: bővítési interfészek; a konkrét alkalmazás adaptereit ezek kötik a kerethez.

`Feature`: regisztráció, típusos definíciók, ellenőrzés és fordítás. `UI`: nézetleírások. `Http` és `Api`: transport, válaszok és verziózás. `Security`: auth és policy pipeline. `Tenancy`: explicit szervezeti kontextus. `Data`: engedélyezett filter/sort/page modell és query adapterek. `Validation`: közös validációs infrastruktúra. `Files`, `Jobs`, `Audit`: közös infrastruktúra, alkalmazási hookokkal. `Integration/Symfony`: konkrét hosting framework integrációja, ha az ADR megerősíti.

`packages/php/config`: keret alapbeállításai; nem alkalmazássecret. `packages/php/migrations`: csak a keret által birtokolt táblák migrációi, amennyiben szükségesek. Ezeket a fogyasztó explicit regisztrálja és futtatja, csomagtelepítés nem migrál automatikusan.

## Frontend

`packages/frontend/src/app`: inicializáció és szolgáltatásregisztráció. `shell`: elrendezés és navigációs működés. `renderer`: schema alapján komponensépítés. `components`: DHTMLX adapterek komponensenként. `actions`: deklarált műveletek dispatchere. `api`: transport. `state`: workspace és nézetállapot. `contracts`: szerver-kliens szerződések. `i18n` és `styles`: közös fordítás és arculati alap.

Az üres adapterkönyvtár a tervezett lefedést jelöli, nem telepített vagy licencelt komponenst.

## Példaalkalmazás és tesztek

`examples/demo-app` önálló fogyasztóként fogja használni a két csomagot. Domainje szintetikus szervezetek, projektek, feladatok és dokumentumok. Nem CityScreen üzleti modulok másolata.

`tests/php`, `tests/frontend`, `tests/contracts`, `tests/e2e`, `tests/performance`, `tests/fixtures`: külön tesztrétegek. A CityScreen saját üzleti tesztjei a CityScreen `codex/tests/v2` alatt maradnak.

`tools`: fejlesztési segédeszközök; `codex/tmp`: ignored futási állományok. `docs/decisions`: elfogadott és javasolt döntések státusszal.

## Fogyasztó alkalmazás

A CityScreen `v2/src/Modules` alá kerülnek a feature-definíciók, domainmodellek, use case-ek, repository-implementációk, üzleti policy-k és jobok. A DMS, térkép, levelezés és tartalomforrások konkrét integrációi `v2/src/Integrations` alatt élnek. Saját frontend csak ott kell, ahol a közös renderer nem elég.

A két VAPA-csomag ugyanabban a VAPA-repóban él, mert közös protokollt valósít meg. A fogyasztó alkalmazás soha nem kerül ebbe a repóba.
