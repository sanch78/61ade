# VAPA fejlesztési szabályok

## Kötelező, folyamatos használati dokumentáció

## Kötelező VAPA architektúraszabály

- VAPA-fejlesztést végzünk: a VAPA az ADE v2, önálló admin keretrendszer. Erre húzzuk rá egyenként az alkalmazások üzleti logikáját.
- Minden általános admin-képességet a VAPA biztosít: alkalmazásindítás, konfiguráció, hitelesítési folyamat, session, jogosultsági infrastruktúra, menü, layout, ablak, form, grid, kommunikáció, hiba- és állapotkezelés. A UI vezérlőket a VAPA DHTMLX komponensekből adja.
- Ha egy képesség hiányzik, előbb a VAPA-ban kell megvalósítani és dokumentálni, majd a fogyasztóban konfigurálni. Tilos alkalmazásspecifikus frontenddel, kézzel rajzolt HTML/CSS adminfelülettel vagy a keretet megkerülő általános kóddal pótolni.
- A fogyasztóban alkalmazáskonfiguráció, üzleti definíció, üzleti szabály és konkrét adat-/integrációs illesztés lehet. Általános admin-infrastruktúra nem.
- A sikeres alkalmazásdemo önmagában nem kész eredmény: az érintett VAPA-képességnek külön, szintetikus fogyasztóval is használhatónak és ellenőrizhetőnek kell lennie.
- A kért első lépés: VAPA által biztosított DHTMLX loginablak, majd konfigurált DHTMLX menü és üres munkaterület. Az üzleti modulok ezután, egyenként készülnek.
