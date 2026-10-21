# ADR-0003 — Termékirány: kötelező adminmodul, nyelvfüggetlen szerződés, igényvezérelt képességkör

Dátum: 2026-10-21. Elfogadott felhasználói döntés ([FB-0036](../feedback.md#fb-0036--kötelező-adminmodul-és-igényvezérelt-keretfejlesztés), javítva: [FB-0037](../feedback.md#fb-0037--ext-js-referencia-visszavonása-dhtmlx-alap-igényvezérelt-képességkör)). A követelmények, a bizonyított állapot és a nyitott kérdések részletesen: [termékirány](../product-direction.md).

## Döntés

- A PHP a referencia-backend; a frontend verziózott, nyelvfüggetlen JSON-szerződésen kommunikál. A JSON-átvitel önmagában nem backendfüggetlenség.
- Minden alkalmazás kötelezően a VAPA által adott user-, ACL-, API-kulcs- és naplóadmint használja, a keret saját deklaratív definícióiból felépítve.
- A frontend alapja a DHTMLX, VAPA-adapterekkel és támogatott bővítési pontokkal. Nincs külső frontendkeretrendszer-benchmark, komponensmegfeleltetés vagy teljes lefedettségi követelmény; a támogatott képességkör a valós igényekből nő.
- Lokalizáció és téma beépített képesség; minden új keretképesség részt vesz bennük.
- Tárolási cél: MySQL, PostgreSQL, SQLite, JSON-fájl; támogatottnak csak a dokumentált garanciákat teszttel teljesítő tároló jelölhető.
- Moduláris JSON-konfiguráció, explicit regisztrált kezelők; nincs eval vagy végrehajtható string.
- A definíciókból generált ACL-katalógus nem ad automatikusan jogot.
- Eseménynaplózás explicit lefedési katalógussal; audit/biztonsági/üzemeltetési szétválasztás; credential és érzékeny payload nem naplózható.
- Navigálható kitchen sink minden implementált publikus képességhez.
- Fejlesztési sorrend: konkrét igény → keretbeli hiány → legkisebb újrahasznosítható bővítés → szintetikus demó és teszt → dokumentáció → fogyasztói integráció → kontrollált kiadás.

## Felülírt és pontosított korábbi döntések

- [ADR-0002](0002-framework-first.md) és FB-0004: a kizárólag alkalmazásspecifikus user admin döntését ez felülírja. A keretelső szabály és a szűk kivétel változatlan.
- [ADR-0001](0001-foundation.md): a „Modern PHP … Go és Node backend nem választott” pont a referencia-backendre vonatkozik; a frontend protokollja nem köti PHP-hoz. A „feature-definíciók verziókezelt kódban” pont a verziókezelt JSON-definíciókat is magában foglalja.
- Az FB-0036 Ext JS-referenciáját az FB-0037 visszavonta; aktív útmutatás nem írhat elő Ext JS-paritást.

## Következmények

Az adminmodul, a nyelvfüggetlen szerződés, a PostgreSQL- és JSON-tároló, az OAuth-belépés, a katalógus-API, a napló kategorizálása és a kitchen sink jelenleg nem kész; állapotukat a [termékirány](../product-direction.md#2-megvalósított-képességek-bizonyítékkal-és-hiányok) vezeti. Hasznos kiadásnak nem feltétele egy kimerítő komponenskatalógus.
