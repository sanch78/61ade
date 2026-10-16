# DHTMLX komponens- és képességmátrix

Ellenőrzés: 2026-10-16, upstream dokumentáció alapján. Ebben a scaffoldban egyetlen vendorcsomag sincs telepítve, adapter sincs megvalósítva. A kiválasztott pontos verziót és a csomagban lévő LICENSE fájlt M1-ben kell rögzíteni.

| Képesség | Tervezett forrás | Kiadási határ | VAPA feladat |
| --- | --- | --- | --- |
| Grid és inline szerkesztés | Suite Standard | Egyes fejlett funkciók PRO | Query, mezőtípus, action és policy integráció |
| Form és validáció | Suite Standard | Konkrét controlok verzió szerint | Metaadatból építés, szerverhibák, relációk |
| Tree | Suite Standard | Fejlett opciók ellenőrizendők | Lazy betöltés, scope, biztonságos áthelyezés |
| TreeGrid | Suite PRO | PRO-only | Külön capability és licencelt adapter |
| DataView, List | Suite Standard | Verzióhoz kötött részletes leltár | Template-regisztráció, kiválasztás, lapozás |
| Chart | Suite Standard | PRO-típusok/opciók külön | Scope-olt aggregáció és drill-down |
| Layout, tab, window, popup | Suite Standard | Részletes leltár M1/M4 | Shell és komponens-életciklus |
| Menü, toolbar, sidebar, ribbon | Suite Standard | Részletes leltár M1/M4 | Navigáció és capability megjelenítés |
| Date/time/color picker, combo | Suite Standard | Nem eseménynaptár | Típusok, locale, timezone |
| Eseménynaptár | Scheduler Standard (GPL) | Alap nézetek és ismétlődés elérhetők | Időablakos query és üzleti parancsok |
| Timeline és Units/resource nézet | Scheduler PRO | PRO-only | Erőforrás-policy és ütközési szabályok |
| Több scheduler ugyanazon oldalon | Scheduler fizetős kiadás | Licencszint is számít | Shell korlát és capability ellenőrzés |
| Gantt alap | Gantt 10+ Community (MIT) | Core feladat/függőség/mérföldkő | Hierarchia, parancsok, konfliktuskezelés |
| Auto scheduling, critical path, resource | Gantt PRO | PRO-only | Integráció külön licencdöntés után |
| Fájl és média | Saját szolgáltatás + UI control | Vault külön termék | Storage, jogosultság, preview, job |
| Rich text, diagram, pivot, kanban | Külön termék/adapter | Nem automatikus Suite Standard részek | Igény és licenc külön ellenőrzendő |
| Export/import | Saját backend + vendor adapter | Formátum/exportservice függő | Scope, mezőszűrés, háttérjob, letöltés |

## Teljesség jelentése

A cél a kiválasztott verzió/kiadás dokumentált publikus képességeinek hozzáférhetővé tétele. A mátrix még nem az összes metódus tételes leltára. Az M1/M4 során komponensenként géppel vagy kézzel ellenőrzött katalógus készül: konfigurációk, események, metódusok, licencigény, VAPA-leképezés és teszteset.

A gyakori képességekhez típusos VAPA-konfiguráció kell; ritka vendoropciókhoz ellenőrzött adapterbővítés. Egyedi klienskód csak regisztrált modulon át. Nem kell minden vendor metódushoz külön backend REST-végpont. Private/protected/internal API-ra nem építünk publikus VAPA-szerződést.

A PRO-hiányzó funkciókat nem vesszük ki csendben a teljes admin céljából. Nyitott függőségként kell vezetni, amíg licencelt vendoradapter vagy külön jóváhagyott alternatíva el nem készül. A jelen beszélgetés elfogadja a licencelés megfontolását, de nem jelent vásárlást vagy vendorcsomag-beszerzést.

## Licencek és lejárat

Suite Standard GPLv2; Scheduler Standard GPL; Gantt v10+ Community MIT. Régebbi Gantt-verziók GPL-feltételei nem változnak automatikusan MIT-vé. GPL-es felhasználás nem éves bevételi küszöbös CE-engedély; a terjesztési feltételeit teljesíteni kell. Az üzleti adat nem válik ettől publikussá.

A VAPA saját licencét külön kell kiválasztani. A frontend és a vendor kombinált terjesztése, a backend leválasztása és az alkalmazások forrásátadási kötelezettsége a tényleges csomagolás alapján értékelendő. Nem állítjuk automatikusan, hogy minden PHP-kód GPL, vagy hogy a REST elválasztás minden licenckérdést megold.

PRO-forrás és licenckulcs nem kerülhet nyilvános Git-repóba. npm-ről elérhető csomag nem feltétlenül tartalmaz minden dokumentált funkciót. A DHTMLX Gantt típusdefiníciója is leírhat PRO-only API-t; a runtime csomagot és edition-mátrixot együtt kell vizsgálni.

## Ellenőrzött upstream források

- [Suite termék és Standard GPL](https://dhtmlx.com/docs/products/dhtmlxSuite/)
- [Suite 9 dokumentáció](https://docs.dhtmlx.com/suite/)
- [TreeGrid PRO-only](https://docs.dhtmlx.com/suite/grid/treegrid_mode/)
- [Scheduler telepítés és Standard GPL](https://docs.dhtmlx.com/scheduler/guides/installation/)
- [Scheduler Standard/PRO](https://docs.dhtmlx.com/scheduler/guides/editions-comparison/)
- [Gantt Community/PRO](https://docs.dhtmlx.com/gantt/guides/editions-comparison/)
- [Gantt MIT kiadás](https://dhtmlx.com/blog/meet-dhtmlx-gantt-community-edition-mit-license/)
- [Gantt forrás és típusdefiníciós korlát](https://github.com/DHTMLX/gantt)
