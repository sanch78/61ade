# VAPA fejlesztési szabályok

## 1. Első és legfontosabb szabály minden AI-fejlesztőnek (Codex, Claude és bármely más agent)

**NINCS A VAPA-T MEGKERÜLŐ EGYEDI FEJLESZTÉS.** A VAPA projekt a keretrendszer eszközeivel készül. Ha hiányzik egy képesség, a keretrendszer eszközeit kell bővíteni, és az üzleti logikát azokkal megvalósítani. Üzleti igény önmagában nem indokol külön egyedi folyamatot.

Kivétel **akkor és csak akkor** lehetséges, ha a keretrendszer logikusan nem bővíthető az adott igényre. Ennek konkrét okát, a megvizsgált keretbővítést és a kivétel határát az implementáció mellett dokumentálni kell. Ebben a szűk esetben az üzleti megoldás akár DHTMLX nélküli eljárást is alkalmazhat. Kényelmi, gyorsasági vagy AI-preferencia nem indok.

Az alkalmazásspecifikus felhasználóadmin is VAPA-definíciókból és eszközökből áll; nem készül kötelező, univerzális felhasználóadmin a keretbe. A keret az újrahasználható ACL-, form-, adatkezelési, API- és auditképességeket adja.

## Kötelező, folyamatos használati dokumentáció

## Kötelező VAPA architektúraszabály

- VAPA-fejlesztést végzünk: a VAPA az ADE v2, önálló admin keretrendszer. Erre húzzuk rá egyenként az alkalmazások üzleti logikáját.
- Minden általános admin-képességet a VAPA biztosít: alkalmazásindítás, konfiguráció, hitelesítési folyamat, session, jogosultsági infrastruktúra, menü, layout, ablak, form, grid, kommunikáció, hiba- és állapotkezelés. A UI vezérlőket alapértelmezetten a VAPA DHTMLX komponensekből adja; kivétel kizárólag az 1. szabály szerint.
- Ha egy képesség hiányzik, előbb a VAPA-ban kell megvalósítani és dokumentálni, majd a fogyasztóban konfigurálni. Tilos alkalmazásspecifikus frontenddel, kézzel rajzolt HTML/CSS adminfelülettel vagy a keretet megkerülő általános kóddal pótolni.
- A fogyasztóban alkalmazáskonfiguráció, üzleti definíció, üzleti szabály és konkrét adat-/integrációs illesztés lehet. Általános admin-infrastruktúra nem.
- A sikeres alkalmazásdemo önmagában nem kész eredmény: az érintett VAPA-képességnek külön, szintetikus fogyasztóval is használhatónak és ellenőrizhetőnek kell lennie.
- A kért első lépés: VAPA által biztosított DHTMLX loginablak, majd konfigurált DHTMLX menü és üres munkaterület. Az üzleti modulok ezután, egyenként készülnek.
