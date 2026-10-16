# VAPA felhasználási módszertan

Ez a VAPA-t alkalmazásba építő fejlesztők és az admin működését tesztelők folyamatosan karbantartott útmutatója. A mindenkori tényleges használatot írja le; a célarchitektúra a [koncepcióban](concept.md), az elkészítés sorrendje a [fejlesztési tervben](development-plan.md) található.

## Jelenlegi állapot

2026-10-16: a VAPA saját ApplicationDefinition, IdentityProvider/SqlIdentityProvider, Menu/MenuItem és HTTP indítási szerződéseire épülő DHTMLX Window/Form/Menu/Layout alkalmazásalap készült. Önálló, szintetikus keretdemó és kerettesztek tartoznak hozzá. Integráció, konfiguráció, példa, ellenőrzés és korlátok: [első shell használata](shell.md). Nincs publikált release, feature API, CRUD vagy teljes ACL. A shell nem jelenti M1/M2/M4 lezárását.

## Kötelező fejlesztési irány

**VAPA = ADE v2.** Először minden általános képesség a VAPA-ban készül el, majd a fogyasztó deklarációval és üzleti logikával alkalmazza. Hiányzó keretfunkciót nem pótolunk külön alkalmazási admin-kóddal. A UI-t VAPA által adott DHTMLX vezérlők alkotják. Részletes döntés: [ADR-0002](decisions/0002-framework-first.md).

## Már alkalmazható módszertan

- A keret a saját VAPA-repóban fejlődik; a fogyasztó üzleti kódja külön repóban marad. A függés kizárólag alkalmazás → VAPA.
- Az alkalmazás saját feature-definíciói a közös keretet konfigurálják, saját üzleti szolgáltatásokra és policy-kra hivatkozva. A VAPA-ba nem kerülnek alkalmazásspecifikus táblák vagy szabályok.
- A helyi CityScreen `vapa` symlink szerkesztési segítség. A canonical checkout `/space/frameworks/vapa`; commit előtt ebben ellenőrizzük a Git-állapotot. A symlink nem későbbi telepítési függőség.
- A könyvtárstruktúra részletei a [csomaghatárok leírásában](repository-layout.md), a környezeti előfeltételek a [fejlesztői útmutatóban](development.md) vannak.

## Minden elkészülő képesség dokumentációs szerkezete

1. **Cél és hatókör:** milyen feladatot old meg, kinek szól, mi tartozik a kerethez és az alkalmazáshoz.
2. **Előfeltételek:** támogatott VAPA-/vendorverzió, komponenskiadás, konfiguráció és jogosultság.
3. **Alkalmazás lépései:** pontos fájlhelyek, regisztráció, bemenet, kimenet és működő minimálpélda szintetikus adatokkal.
4. **Elvárt működés:** UI-műveletek, API-viselkedés, hibák, tiltások és releváns szélső esetek.
5. **Ellenőrzés:** hogyan próbálja ki a fejlesztő vagy felhasználó, mi bizonyítja a helyes működést.
6. **Korlátok és módosítások:** nem támogatott opciók, kiadásfüggés, ismert hiba és verzióváltási teendő.
7. **Kapcsolódó tanulság:** visszajelzésazonosító és szükség esetén a döntési napló hivatkozása.

Növekedéskor témánként külön útmutató készülhet, innen hivatkozva; az aktív használati szabály egy canonical helyen legyen. Az API-referencia önmagában nem helyettesíti a lépésről lépésre alkalmazási példát.

## Fokozatosan kitöltendő témák

| Téma | Mikor válik alkalmazható útmutatóvá? |
| --- | --- |
| Telepítés, konfiguráció, első indítás | M1 runtime elkészültekor |
| Belépés, szervezet, szerepkör és policy | M2 ellenőrzött implementációval |
| Feature, query, action, validáció és REST | M3 teljes folyamattal |
| Shell, grid/form, tree, dataview és további nézetek | M4 adapterenként |
| Scheduler, Gantt, időzóna és összetett műveletek | M5 támogatott kiadásonként |
| Fájlok, export/import, audit és háttérjobok | M6 képességenként |
| Csomagfrissítés, kompatibilitás és üzemeltetés | M7 kiadási folyamattal |

## Felhasználói tesztelésből származó tudás

A visszajelzést ugyanabban a munkamenetben rögzítjük a [visszajelzési naplóban](feedback.md). Az elfogadott használati szabály bekerül ide vagy az érintett témadoksiba; meg nem valósult működés jól láthatóan tervezett marad. A tesztelési útmutatás, ismert korlát és bevált megoldás így a következő alkalmazás fejlesztőjének is elérhető.

A felhasználó egyértelmű útmutatását nem kell ismételten jóváhagyatni pusztán a rögzítéshez. Ha nem egyértelmű, hogy egy észrevétel általános keretszabály vagy alkalmazásspecifikus igény, ezt nyitott kérdésként jelöljük, és az értelmezést tisztázzuk.
