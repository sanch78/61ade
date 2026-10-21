# DHTMLX komponens- és képességmátrix

Ellenőrzés: 2026-10-16, upstream dokumentáció alapján; VAPA-állapot oszlop 2026-10-21, forrás és tesztek alapján. A Suite Standard 9.3.12 telepítve, a shell és workspace adapter használatban. A PRO-képességek továbbra sem részei a telepített csomagnak.

A mátrix a DHTMLX-elérhetőség, a kiadási/licenchatár és a VAPA tényleges állapotának leltára, nem lefedettségi cél. A VAPA támogatott képességköre a valós alkalmazási igényekből nő ([R3, R12](product-direction.md#1-elfogadott-termékkövetelmények)); a nem megvalósított sor jelölt bővítés, nem vállalás.

| Képesség | Forrás | Kiadási határ | VAPA-állapot | VAPA feladat igény esetén |
| --- | --- | --- | --- | --- |
| Grid és inline szerkesztés | Suite Standard | Egyes fejlett funkciók PRO | Megvalósítva: Workspace adapter ([munkaterületek](workspaces.md), `grid-edit`) | Query, mezőtípus, action és policy integráció |
| Grid dinamikus forrás | VAPA Standard Grid adapter | A natív LazyDataProxy integráció PRO-only | Megvalósítva: kurzoros adatsáv ([használat](workspaces.md)) | Kurzoros lekérdezés, korlátozott adatsáv, scroll események |
| Form és validáció | Suite Standard | Konkrét controlok verzió szerint | Megvalósítva: metaadatból épített form, kliens/szerver validáció ([validáció](validation.md)) | Szerverhibák, relációk, további mezőtípusok |
| Layout, window | Suite Standard | — | Megvalósítva: shell és munkaterület-layout, méretező, popupok ([shell](shell.md)) | Összetett többpaneles munkafolyamatok |
| Menü, toolbar | Suite Standard | — | Megvalósítva: főmenü, lista-toolbar, téma- és nyelvválasztó | Navigáció és capability megjelenítés |
| DataView | Suite Standard | Verzióhoz kötött részletes leltár | Megvalósítva: kártyanézet ([munkaterületek](workspaces.md)) | Template-regisztráció, kiválasztás |
| Tab, popup, sidebar, ribbon, List | Suite Standard | Részletes leltár igény szerint | Nincs igazolt VAPA-adapter | Shell és komponens-életciklus |
| Tree | Suite Standard | Fejlett opciók ellenőrizendők | Nincs (a `view.layout.tree` layoutfa, nem Tree komponens) | Lazy betöltés, scope, biztonságos áthelyezés |
| TreeGrid | Suite PRO | PRO-only | Nincs | Külön capability és licencelt adapter |
| Chart | Suite Standard | PRO-típusok/opciók külön | Nincs | Scope-olt aggregáció és drill-down |
| Date/time/color picker, combo | Suite Standard | Nem eseménynaptár | Nem igazolt külön képességként | Típusok, locale, timezone |
| Eseménynaptár | Scheduler Standard (GPL) | Alap nézetek és ismétlődés elérhetők | Nincs | Időablakos query és üzleti parancsok |
| Timeline és Units/resource nézet | Scheduler PRO | PRO-only | Nincs | Erőforrás-policy és ütközési szabályok |
| Több scheduler ugyanazon oldalon | Scheduler fizetős kiadás | Licencszint is számít | Nincs | Shell korlát és capability ellenőrzés |
| Gantt alap | Gantt 10+ Community (MIT) | Core feladat/függőség/mérföldkő | Nincs | Hierarchia, parancsok, konfliktuskezelés |
| Auto scheduling, critical path, resource | Gantt PRO | PRO-only | Nincs | Integráció külön licencdöntés után |
| Fájl és média | Saját szolgáltatás + UI control | Vault külön termék | Nincs | Storage, jogosultság, preview, job |
| Rich text, diagram, pivot, kanban | Külön termék/adapter | Nem automatikus Suite Standard részek | Nincs | Igény és licenc külön ellenőrzendő |
| Export/import | Saját backend + vendor adapter | Formátum/exportservice függő | Nincs (tömeges műveletek igen, export nem) | Scope, mezőszűrés, háttérjob, letöltés |

Minden megvalósított sorhoz lokalizációnak, témázhatóságnak és kitchen-sink példának kell tartoznia ([R4, R11](product-direction.md#1-elfogadott-termékkövetelmények)); ahol a példa még hiányzik, az a termékirány 2. fejezetében hiányként szerepel.

## Bővítés módja

Új komponens vagy vendoropció akkor kerül a VAPA-ba, ha konkrét alkalmazási igény indokolja ([módszer](development-plan.md#igényvezérelt-fejlesztési-módszer)). A korábbi „a kiválasztott verzió összes dokumentált publikus képessége” teljességi célt az [FB-0037](feedback.md#fb-0037--ext-js-referencia-visszavonása-dhtmlx-alap-igényvezérelt-képességkör) felváltotta.

A gyakori képességekhez típusos VAPA-konfiguráció kell; ritka vendoropciókhoz ellenőrzött adapterbővítés. Egyedi klienskód csak regisztrált modulon át. Nem kell minden vendor metódushoz külön backend REST-végpont. Private/protected/internal API-ra nem építünk publikus VAPA-szerződést.

Ha egy igényelt képesség csak PRO-kiadásban érhető el, nyitott függőségként vezetjük, amíg licencelt vendoradapter vagy külön jóváhagyott alternatíva el nem készül. A licencelés megfontolása nem jelent vásárlást vagy vendorcsomag-beszerzést.

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
