# VAPA — Very Advanced PHP Admin

Újrahasznosítható, konfigurációvezérelt admin alkalmazáskeret PHP referencia-backenddel és DHTMLX frontenddel. Cél a backendnyelvtől független JSON-szerződés.

**Állapot: PHP 8.4+ és DHTMLX shell, deklaratív form/grid és műveletvégrehajtó, ACL/API-token/audit alapok, JSON-konfiguráció, e-mailes belépésmegerősítés és többnyelvűség. Nincs kiadott csomag; a kötelező adminmodul és a teljes célrendszer még nem kész.** Részletek: [aktuális használat](docs/usage.md).

## Cél

Egy PHP-ban vagy tagolt JSON-ban megadott feature-definíció összefogja az objektumok mezőit, nézeteit, műveleteit és API-kitettségét. A VAPA megjeleníti és kiszolgálja ezeket; az üzleti logikát az alkalmazás explicit regisztrált kezelői valósítják meg. A frontend fullscreen DHTMLX alkalmazás beépített többnyelvűséggel és témákkal; minden alkalmazás a VAPA által adott user-, ACL-, API-kulcs- és naplóadmint használja (tervezett). A támogatott komponenskör a valós alkalmazási igényekből nő; nincs külső keretrendszer-benchmark vagy teljes lefedési cél. Követelmények és tényleges állapot: [termékirány](docs/product-direction.md).

Első fogyasztó: a teljesen újraírandó CityScreen admin. A CityScreen üzleti kódja, adatai és integrációi külön repóban maradnak. VAPA nem függhet CityScreentől vagy ADE-tól.

## Dokumentáció

A használati módszertant minden képességváltozással együtt vezetjük; a felhasználói tesztelés tanulságai tartósan bekerülnek a dokumentációba. Ez kötelező fejlesztési szabály.

- [Felhasználási módszertan](docs/usage.md)
- [Termékirány: követelmények, bizonyított állapot, nyitott kérdések, Claude-prompt](docs/product-direction.md)
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
- [Termékirány-döntés (ADR-0003)](docs/decisions/0003-product-direction.md)

## Csomagok

| Könyvtár | Tervezett csomag | Feladat |
| --- | --- | --- |
| `packages/php` | `sanch78/vapa` | PHP-definíciók, API, policy-k, infrastruktúra |
| `packages/frontend` | `@vapa/admin` | DHTMLX adapterek, renderer, admin shell |
| `examples/demo-app` | nem publikált | Szintetikus adatokkal működő referenciaalkalmazás |
| `tests` | nem publikált | Keret-, szerződés-, integrációs és böngészőtesztek |

A csomagnevek helyi tervezési azonosítók; npm/Packagist névfoglalás vagy publikálás nem történt. A PHP namespace `Vapa\`.

## Technológiai kiindulás

Elfogadott: modern PHP referencia-backend (PHP-FPM + OPcache), DHTMLX, verziókezelt PHP/JSON feature-definíciók, külön alkalmazásrepók. A frontend protokollja nyelvfüggetlen JSON-szerződés cél ([ADR-0003](docs/decisions/0003-product-direction.md)); tárolási cél MySQL, PostgreSQL, SQLite és JSON-fájl, jelenleg MySQL-kapcsolat és SQLite demó. Javasolt első megvalósítás: PHP 8.4 minimum, PHP 8.5 CI-lefedés, Symfony 7.4 LTS integráció, TypeScript frontend. A Symfony-választás javaslat, nem korábbi felhasználói döntés; az első runtime-mérföldkőben rögzítendő.

A frontend lockfile rögzíti a DHTMLX, TypeScript és esbuild függőségeket. A PHP shell Composer-autoloadot használ, hosting framework nélkül; Symfony integráció és a teljes runtime-szerződés még nincs. Részletek: [shell](docs/shell.md).

## Licencek

A VAPA saját kódjának licence még kiválasztandó; ez a repo jelenleg nem ad külön open source felhasználási engedélyt. A GitHub-repó nyilvánossága önmagában nem licenc. DHTMLX Suite Standard és Scheduler GPL, Gantt 10+ Community MIT; részletek és források a komponensmátrixban. Fizetős vendorcsomag, secret és ügyféladat nem kerülhet a repóba.
