# ADR-0002 — VAPA = ADE v2; keretfejlesztés az üzleti modulok előtt

Dátum: 2026-10-16. Elfogadott, kötelező felhasználói utasítás.

A VAPA az ADE utódjaként készülő, DHTMLX alapú admin keretrendszer. Minden általános képesség a keretben készül el. A fogyasztók deklarálják az alkalmazást, a menüt, a feature-öket és a konkrét üzleti szabályokat/illesztéseket; a VAPA futtatja és megjeleníti ezeket.

Fejlesztési sorrend minden lépésben: szükséges keretszerződés → VAPA implementáció → szintetikus keretteszt → fogyasztói konfiguráció/üzleti modul → integrációs ellenőrzés. Hiányzó képességhez nem készül külön alkalmazási admin-infrastruktúra.

A kezdeti egyedi HTML loginoldal, oldalsáv és kártyás dashboard hibás irány volt. Nem elegendő más widgetre cserélni: a keret szerződéseit és felelősségeit kell megvalósítani. A shell első átadása DHTMLX Window/Form login, Menu és Layout, üres munkaterülettel. A menü struktúrája az alkalmazás definíciójából jön; a VAPA nem talál ki új információs architektúrát.

ADE v2 az architekturális és használati folytonosságot jelenti. A régi ADE kódot nem másoljuk a keretbe, CityScreen üzleti fogalmakat nem égetünk bele. A modern PHP, TypeScript és DHTMLX alapirány fennmarad.

A teljes keret és a teljes alkalmazásmigráció továbbra is több mérföldkő. A login és menü elkészülte kizárólag az első keretképesség átadása.

## Pontosítás — 2026-10-16

## 1. Első és legfontosabb szabály minden AI-fejlesztőnek (Codex, Claude és bármely más agent)

**NINCS A VAPA-T MEGKERÜLŐ EGYEDI FEJLESZTÉS.** A VAPA projekt a keretrendszer eszközeivel készül. Ha hiányzik egy képesség, a keretrendszer eszközeit kell bővíteni, és az üzleti logikát azokkal megvalósítani. Üzleti igény önmagában nem indokol külön egyedi folyamatot.

Kivétel **akkor és csak akkor** lehetséges, ha a keretrendszer logikusan nem bővíthető az adott igényre. Ennek konkrét okát, a megvizsgált keretbővítést és a kivétel határát az implementáció mellett dokumentálni kell. Ebben a szűk esetben az üzleti megoldás akár DHTMLX nélküli eljárást is alkalmazhat. Kényelmi, gyorsasági vagy AI-preferencia nem indok.

A korábbi, kizárólag alkalmazásspecifikus user adminra vonatkozó döntést 2026-10-21-én az FB-0036 felülírta: a keret minden projekthez kötelező adminmodult biztosít, saját VAPA-definíciókból és eszközökből. Ez elfogadott cél, a modul még nem kész. Döntés: [ADR-0003](0003-product-direction.md); részletek: [termékirány](../product-direction.md).
