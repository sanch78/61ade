# Könyvtárak és csomaghatárok

## Két külön repó

## Backend

`packages/php/src/Contracts`: bővítési interfészek; a konkrét alkalmazás adaptereit ezek kötik a kerethez.

`Feature`: regisztráció, típusos definíciók, ellenőrzés és fordítás. `UI`: nézetleírások. `Http` és `Api`: transport, válaszok és verziózás. `Security`: auth és policy pipeline. `Tenancy`: explicit szervezeti kontextus. `Data`: engedélyezett filter/sort/page modell és query adapterek. `Validation`: közös validációs infrastruktúra. `Files`, `Jobs`, `Audit`: közös infrastruktúra, alkalmazási hookokkal. `Integration/Symfony`: konkrét hosting framework integrációja, ha az ADR megerősíti.

`packages/php/config`: keret alapbeállításai; nem alkalmazássecret. `packages/php/migrations`: csak a keret által birtokolt táblák migrációi, amennyiben szükségesek. Ezeket a fogyasztó explicit regisztrálja és futtatja, csomagtelepítés nem migrál automatikusan.

## Frontend

`packages/frontend/src/app`: inicializáció és szolgáltatásregisztráció. `shell`: elrendezés és navigációs működés. `renderer`: schema alapján komponensépítés. `components`: DHTMLX adapterek komponensenként. `actions`: deklarált műveletek dispatchere. `api`: transport. `state`: workspace és nézetállapot. `contracts`: szerver-kliens szerződések. `i18n` és `styles`: közös fordítás és arculati alap.

Az üres adapterkönyvtár a tervezett lefedést jelöli, nem telepített vagy licencelt komponenst.

## Példaalkalmazás és tesztek

`tools`: fejlesztési segédeszközök; `codex/tmp`: ignored futási állományok. `docs/decisions`: elfogadott és javasolt döntések státusszal.

## Fogyasztó alkalmazás

A két VAPA-csomag ugyanabban a VAPA-repóban él, mert közös protokollt valósít meg. A fogyasztó alkalmazás soha nem kerül ebbe a repóba.
