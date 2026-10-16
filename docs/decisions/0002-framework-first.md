# ADR-0002 — VAPA = ADE v2; keretfejlesztés az üzleti modulok előtt

Dátum: 2026-10-16. Elfogadott, kötelező felhasználói utasítás.

A VAPA az ADE utódjaként készülő, DHTMLX alapú admin keretrendszer. Minden általános képesség a keretben készül el. A fogyasztók deklarálják az alkalmazást, a menüt, a feature-öket és a konkrét üzleti szabályokat/illesztéseket; a VAPA futtatja és megjeleníti ezeket.

Fejlesztési sorrend minden lépésben: szükséges keretszerződés → VAPA implementáció → szintetikus keretteszt → fogyasztói konfiguráció/üzleti modul → integrációs ellenőrzés. Hiányzó képességhez nem készül külön alkalmazási admin-infrastruktúra.

A kezdeti egyedi HTML loginoldal, oldalsáv és kártyás dashboard hibás irány volt. Nem elegendő más widgetre cserélni: a keret szerződéseit és felelősségeit kell megvalósítani. A shell első átadása DHTMLX Window/Form login, Menu és Layout, üres munkaterülettel. A menü struktúrája az alkalmazás definíciójából jön; a VAPA nem talál ki új információs architektúrát.

ADE v2 az architekturális és használati folytonosságot jelenti. A régi ADE kódot nem másoljuk a keretbe, CityScreen üzleti fogalmakat nem égetünk bele. A modern PHP, TypeScript és DHTMLX alapirány fennmarad.

A teljes keret és a teljes alkalmazásmigráció továbbra is több mérföldkő. A login és menü elkészülte kizárólag az első keretképesség átadása.
