# VAPA fejlesztési szabályok

## 1. Első és legfontosabb szabály minden AI-fejlesztőnek (Codex, Claude és bármely más agent)

**NINCS A VAPA-T MEGKERÜLŐ EGYEDI FEJLESZTÉS.** A VAPA projekt a keretrendszer eszközeivel készül. Ha hiányzik egy képesség, a keretrendszer eszközeit kell bővíteni, és az üzleti logikát azokkal megvalósítani. Üzleti igény önmagában nem indokol külön egyedi folyamatot.

Kivétel **akkor és csak akkor** lehetséges, ha a keretrendszer logikusan nem bővíthető az adott igényre. Ennek konkrét okát, a megvizsgált keretbővítést és a kivétel határát az implementáció mellett dokumentálni kell. Ebben a szűk esetben az üzleti megoldás akár DHTMLX nélküli eljárást is alkalmazhat. Kényelmi, gyorsasági vagy AI-preferencia nem indok.

A felhasználó-, ACL-, API-kulcs- és naplóadmin minden alkalmazásban kötelező VAPA-alapképesség, a keret saját definícióiból és eszközeiből felépítve. A fogyasztó csak konfigurációt, identitás-/adatillesztést és üzleti szabályokat ad. Ez a 2026-10-21-i döntés felülírja a korábbi, kizárólag alkalmazásspecifikus user adminra vonatkozó szabályt; cél és megvalósított állapot: docs/product-direction.md, FB-0036, ADR-0003.

A termékirány canonical forrása a `docs/product-direction.md` (R1–R12): az elfogadott követelményt, a bizonyított állapotot és a nyitott kérdést külön kell tartani. A frontend alapja a DHTMLX; nincs külső keretrendszer-benchmark vagy teljes komponenslefedési követelmény (FB-0037). Új keretképesség lokalizált és témázható, kitchen-sink példát kap, naplóeseménye a lefedési katalógusba kerül. Konfigurációban nincs eval vagy végrehajtható string; generált ACL-katalógus nem ad jogot.


- A VAPA külön Git-repó, újrahasznosítható keretrendszer. CityScreen/ADE üzleti kód, táblanév, production adat vagy integrációs függőség nem kerülhet bele.
- A koncepció és fejlesztési terv a `docs/` alatt található. Megvalósításnál a dokumentációt ugyanabban a módosítási batchben frissítsd. A tervezett képességet ne jelöld késznek bizonyíték nélkül.
- A gyökér README az egyetlen README; részletes dokumentáció célzott `docs/*.md` fájlokban legyen.
- PHP forrás: `packages/php`; frontend: `packages/frontend`; tesztek: `tests`; segédeszközök: `tools`.
- Futási scratch, log, cache, tesztartifact, lock és runtime home a `tmp/` alatt legyen. Backup a repón kívül, `$CODEX_HOME/backup/project/vapa` alatt legyen; a CODEX_HOME értékét ne módosítsd.
- Csak szintetikus fixture és demo adatot commitolj. Secretet, vendored PRO csomagot, node_modules-t vagy vendort soha.
- A szerveroldali jogosultságvizsgálat kötelező minden olvasási és írási csatornán. A kliensoldali elrejtés nem védelem.
- A feature-definíció backend-only tartalma nem kerülhet a böngészőnek átadott metaadatokba.
- Ne módosítsd a CityScreen runtime-ját, adatbázisát vagy régi adminját a VAPA fejlesztés mellékhatásaként.
- Nagyobb tervezési vagy implementációs munkánál minden érdemi módosítási batch után kötelező: `/usr/local/bin/gitpush --all -t` a VAPA repó gyökeréből. Előtte ellenőrizd a staged tartalmat.
- A CityScreen symlink nem másolat: `git -C /space/frameworks/vapa status` a keret állapota; a fogyasztó repó állapotát külön ellenőrizd.

## Kötelező, folyamatos használati dokumentáció

- A VAPA felhasználási módszertanának canonical belépési pontja `docs/usage.md`. Minden új vagy módosított publikus képességhez ugyanabban a munkamenetben frissítsd a használat módját, előfeltételeit, példáját, korlátait és ellenőrzését. Ez a kész állapot feltétele, nem utólagos feladat.
- A felhasználó tesztelés közbeni észrevételeit, javításait és „mit hogyan kell használni” útmutatásait tartósan rögzítsd a `docs/feedback.md` naplóban. Ne hagyd csak a chatben vagy commitüzenetben.
- Különítsd el a kért/elvárt működést a ténylegesen megvalósítottól. Egyértelmű utasítást rögzíts elfogadott elvárásként, bizonytalan értelmezést nyitott kérdésként; ne állítsd késznek, amit még nem implementáltunk vagy ellenőriztünk.
- Az elfogadott, általánosan használható tanulságot vezesd át a canonical használati útmutatóba vagy az onnan hivatkozott témadoksiba. A naplóbejegyzés önmagában nem helyettesíti ezt. Ha a megoldás még várat magára, az útmutatóban tervezettként jelöld, a napló maradjon nyitott.
- Módosítás előtt olvasd el az érintett használati leírást és korábbi visszajelzéseket. Felülírt elvárásnál jelöld az új döntést és hivatkozd a régi bejegyzést; ne hagyj egymásnak ellentmondó aktív útmutatásokat.
- A visszajelzés lezárásához linkeld a frissített útmutatót, az implementációt, ha van, és az ellenőrzés eredményét. Viselkedési hibánál szükség szerint regressziós teszt kell; puszta dokumentációs változáshoz ne írj mesterséges runtime-tesztet.
- Csak általánosítható kerethasználati tapasztalat kerüljön a VAPA-ba, szintetikus példával. CityScreen-specifikus üzleti döntést a CityScreen doksijában rögzíts, személyes adatot, secretet vagy teljes chatmásolatot ne publikálj.

## Kötelező VAPA architektúraszabály

- VAPA-fejlesztést végzünk: a VAPA az ADE v2, önálló admin keretrendszer. Erre húzzuk rá egyenként az alkalmazások üzleti logikáját.
- Minden általános admin-képességet a VAPA biztosít: alkalmazásindítás, konfiguráció, hitelesítési folyamat, session, jogosultsági infrastruktúra, menü, layout, ablak, form, grid, kommunikáció, hiba- és állapotkezelés. A UI vezérlőket alapértelmezetten a VAPA DHTMLX komponensekből adja; kivétel kizárólag az 1. szabály szerint.
- Ha egy képesség hiányzik, előbb a VAPA-ban kell megvalósítani és dokumentálni, majd a fogyasztóban konfigurálni. Tilos alkalmazásspecifikus frontenddel, kézzel rajzolt HTML/CSS adminfelülettel vagy a keretet megkerülő általános kóddal pótolni.
- A fogyasztóban alkalmazáskonfiguráció, üzleti definíció, üzleti szabály és konkrét adat-/integrációs illesztés lehet. Általános admin-infrastruktúra nem.
- A sikeres alkalmazásdemo önmagában nem kész eredmény: az érintett VAPA-képességnek külön, szintetikus fogyasztóval is használhatónak és ellenőrizhetőnek kell lennie.
- A kért első lépés (teljesítve): VAPA által biztosított DHTMLX loginablak, majd konfigurált DHTMLX menü és üres munkaterület. Az üzleti modulok ezután, egyenként, valós igény szerint készülnek: igény → keretbeli hiány → legkisebb újrahasznosítható bővítés → szintetikus demó és teszt → dokumentáció → fogyasztói integráció → kontrollált kiadás.

## Kötelező validációs paritás feature-migrációnál

- Minden feature átvezetésekor fel kell mérni és dokumentáltan át kell venni a referencia összes érintett validációját (modul, lokális felülírás, közös konfig, mentés). A `required`/must-set önmagában nem teljes migráció.
- Az általános validátort a VAPA adja, a konkrét formátum, határérték és üzleti kivétel a fogyasztóé. Kliens és szerver/UI/API útvonal egyaránt ellenőrzendő. Eltérés csak dokumentált döntéssel maradhat.

## Fejlesztői host védelme

- A Playwright runner és a böngészők Catalyston rendszerszinten, Infra által kezeltek. Hiányzó vagy eltérő verziónál az Infrát kell kérni; projektterületre böngészőt/Playwright runtime-ot telepíteni tilos. A projekt-tmp csak tesztartifactra és eldobható futási kimenetre szolgál.

- Böngészőteszt csak a védett npm scripttel vagy Playwright wrapperrel indulhat: VAPA `npm run test:browser -- ...`, fogyasztó `cd codex && npm run test:e2e -- ...`. Közvetlen `npx playwright test` / Node Playwright-futtatás tilos ezen a közös hoston.
- A wrapper közös zárral kizárja a párhuzamos futásokat, egy workert és cgroup memóriakorlátot alkalmaz. Elutasításkor várj a másik futás végére vagy szabadíts fel memóriát; a védelmet ne kerüld meg.
