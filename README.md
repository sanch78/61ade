# VAPA — Very Advanced PHP Admin

Újrahasznosítható, konfigurációvezérelt admin alkalmazáskeret modern PHP backenddel és DHTMLX frontenddel.

**Állapot: első önálló VAPA alkalmazásalap PHP 8.4+ és DHTMLX Window/Form/Menu/Layout vezérlőkkel. Nincs kiadott csomag, feature API vagy CRUD.**

## Cél

Egy típusos feature-definíció összefogja az objektumok mezőit, nézeteit, műveleteit és API-kitettségét. A VAPA megjeleníti és kiszolgálja ezeket; az üzleti logikát az alkalmazás saját szolgáltatásai valósítják meg. Grid/form mellett tree, treegrid, dataview, list, chart, Gantt, scheduler és teljes admin shell támogatása a cél, dokumentált kiadásfüggőségekkel.

Első fogyasztó: a teljesen újraírandó CityScreen admin. A CityScreen üzleti kódja, adatai és integrációi külön repóban maradnak. VAPA nem függhet CityScreentől vagy ADE-tól.

## Dokumentáció

A használati módszertant minden képességváltozással együtt vezetjük; a felhasználói tesztelés tanulságai tartósan bekerülnek a dokumentációba. Ez kötelező fejlesztési szabály.

- [Felhasználási módszertan](docs/usage.md)
- [Bejelentkezési és navigációs shell](docs/shell.md)
- [Tesztelési visszajelzések és tanulságok](docs/feedback.md)
- [Részletes koncepció](docs/concept.md)
- [Fejlesztési terv és mérföldkövek](docs/development-plan.md)
- [Könyvtárak és csomaghatárok](docs/repository-layout.md)
- [ACL, szervezetek és API-biztonság](docs/security-model.md)
- [DHTMLX-képességek és licencek](docs/component-matrix.md)
- [Fejlesztés, futtatás és kiadás](docs/development.md)
- [Döntési napló](docs/decisions/0001-foundation.md)
- [Kötelező irány: VAPA = ADE v2](docs/decisions/0002-framework-first.md)

## Csomagok

| Könyvtár | Tervezett csomag | Feladat |
| --- | --- | --- |
| `packages/php` | `sanch78/vapa` | PHP-definíciók, API, policy-k, infrastruktúra |
| `packages/frontend` | `@vapa/admin` | DHTMLX adapterek, renderer, admin shell |
| `examples/demo-app` | nem publikált | Szintetikus adatokkal működő referenciaalkalmazás |
| `tests` | nem publikált | Keret-, szerződés-, integrációs és böngészőtesztek |

A csomagnevek helyi tervezési azonosítók; npm/Packagist névfoglalás vagy publikálás nem történt. A PHP namespace `Vapa\`.

## Technológiai kiindulás

Elfogadott: modern PHP, PHP-FPM + OPcache, DHTMLX, kódban definiált feature-ök, külön alkalmazásrepók. Javasolt első megvalósítás: PHP 8.4 minimum, PHP 8.5 CI-lefedés, Symfony 7.4 LTS integráció, TypeScript frontend. A Symfony-választás javaslat, nem korábbi felhasználói döntés; az első runtime-mérföldkőben rögzítendő.

A frontend lockfile rögzíti a DHTMLX, TypeScript és esbuild függőségeket. A PHP shell Composer-autoloadot használ, hosting framework nélkül; Symfony integráció és a teljes runtime-szerződés még nincs. Részletek: [shell](docs/shell.md).

## Licencek

A VAPA saját kódjának licence még kiválasztandó; ez a repo jelenleg nem ad külön open source felhasználási engedélyt. A GitHub-repó nyilvánossága önmagában nem licenc. DHTMLX Suite Standard és Scheduler GPL, Gantt 10+ Community MIT; részletek és források a komponensmátrixban. Fizetős vendorcsomag, secret és ügyféladat nem kerülhet a repóba.
