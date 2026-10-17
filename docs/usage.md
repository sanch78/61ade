# VAPA felhasználási módszertan

Ez a VAPA-t alkalmazásba építő fejlesztők és az admin működését tesztelők folyamatosan karbantartott útmutatója. A mindenkori tényleges használatot írja le; a célarchitektúra a [koncepcióban](concept.md), az elkészítés sorrendje a [fejlesztési tervben](development-plan.md) található.

## Jelenlegi állapot

2026-10-16: a shell mellett működik a regisztrált műveletvégrehajtó, deklarált form/grid adapter, SQL objektumscope, mezőjog, ui/api csatornaszétválasztás, scope-olt token és tranzakciós audit. A fogyasztó saját user adminját és üzleti moduljait ezekből deklarálja. Részletek: [ACL és műveletek](access-and-actions.md), [shell](shell.md). A munkaterület [konfigurálható filter/form/grid layoutot, dinamikus listát, szerveroldali rendezést és polling/WebSocket követést](workspaces.md) ad; a singleton adatlap közvetlen form. A shell felső alkalmazásnév-fejléc nélkül indul; egyetlen alsó sávban balra a felhasználó, jobbra az alkalmazásnév és konfigurált verzió szerepel ([shell](shell.md#egységes-alsó-információs-sáv)). A Skyblue (alapértelmezett) / Default / Éjjeli mód DHTMLX `setTheme` alapú; a Skyblue a Suite 9 dokumentált témaváltozóival definiált VAPA-paletta. Önálló szintetikus demó és fogyasztói integrációs tesztek tartoznak hozzá. Többszervezetes izoláció, külső mellékhatások outboxa, összetett ABAC, export és teljes release-folyamat még nincs; ez nem a teljes M1–M7 lezárása.

## Kötelező fejlesztési irány

**VAPA = ADE v2.** Először minden általános képesség a VAPA-ban készül el, majd a fogyasztó deklarációval és üzleti logikával alkalmazza. Hiányzó keretfunkciót nem pótolunk külön alkalmazási admin-kóddal. Az első és legfontosabb AI-fejlesztési szabály az AGENTS.md 1. pontja. A UI-t alapértelmezetten VAPA által adott DHTMLX vezérlők alkotják. Egyedi folyamat csak dokumentáltan, logikusan nem bővíthető keret esetén készülhet; ekkor DHTMLX nélküli eljárás is megengedett. Részletes döntés: [ADR-0002](decisions/0002-framework-first.md).

## Már alkalmazható módszertan

- A keret a saját VAPA-repóban fejlődik; a fogyasztó üzleti kódja külön repóban marad. A függés kizárólag alkalmazás → VAPA.
- Az alkalmazás saját feature-definíciói a közös keretet konfigurálják, saját üzleti szolgáltatásokra és policy-kra hivatkozva. A VAPA-ba nem kerülnek alkalmazásspecifikus táblák vagy szabályok.
- A helyi CityScreen `vapa` symlink szerkesztési segítség. A canonical checkout `/space/frameworks/vapa`; commit előtt ebben ellenőrizzük a Git-állapotot. A symlink nem későbbi telepítési függőség.
- A könyvtárstruktúra részletei a [csomaghatárok leírásában](repository-layout.md), a környezeti előfeltételek a [fejlesztői útmutatóban](development.md) vannak.

### Üzleti konfiguráció és kód határa

A fogyasztóban marad az `ApplicationDefinition` összeállítása, a konkrét adatbázisséma illesztése, a `Field`/`SqlResource`/`Action` és nézetdefiníció, a kezdeti szerepkör- és jogkiosztás, valamint minden üzleti feltétel. A deklaratív beállítás tagolt JSON-ba kerül, a hostértékek env-be; a tényleges üzleti kód külön PHP-kezelő marad. A [JSON-konfiguráció útmutatója](configuration.md) rögzíti a betöltést, szekciókat és név szerinti bindingokat. A közvetlen PHP-definíciós API is elérhető. A `guard`, `normalize`, `afterSave` és regisztrált műveletkezelő a VAPA támogatott bővítési pontja. Növekedéskor a fogyasztó saját moduljaiba, policy-jaiba és szolgáltatásaiba emeli ki ezeket; a keret nem importál konkrét alkalmazási osztályt.

Például a szintetikus jegyzetmodul mezői és „lezárt jegyzet nem módosítható” szabálya a fogyasztóé; a formépítés, mezőellenőrzés, ACL, tranzakció, audit, lista és élő frissítés végrehajtása a VAPA-é. Az üzleti callback a közös műveletvégrehajtón belül fut; nem külön HTTP-végpontot vagy alternatív mentési folyamatot épít. A UI/API műveleteket a registryben kell regisztrálni, a kollekcióolvasás a keret jogosultságszűrt listaforrását használja. Külső mellékhatások tranzakciós outboxa még nem implementált.

A keret forrása, eszközei és szintetikus tesztjei sem tartalmazhatnak beégetett fogyasztói elérési utat. A futtató kívülről adhat át alkalmazásdefiníciót, autoloadert vagy PHP-binárist; ez konfigurált illesztés, nem fordított csomagfüggőség. Új képességnél az önálló szintetikus demó igazolja az alkalmazásfüggetlen használatot. Kapcsolódó visszajelzés: [FB-0007](feedback.md#fb-0007--az-üzleti-kód-és-a-keret-határa).

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

## E-mailes megerősítés és megjegyzett belépés

A [belépési védelem](authentication.md) JSON-ból konfigurálható VAPA-képesség: alapból minden felhasználónál bekapcsolt e-mailes kód, ACL-védett felhasználónkénti kapcsoló, formázott és üzleti szöveggel felülírható levél, opcionális 90 napos megjegyzés és visszavonás. SMTP/env és explicit sématelepítés szükséges.

## Jelzők és kapcsolt objektummezők

A [mezőmegjelenítési útmutató](field-presentation.md) a natív lista-/form-checkboxot, beszédes állapotneveket, korlátozott oszlopszélességet és a főűrlapba integrált, egy-az-egyhez kapcsolt tárolás közös mentését írja le.

## Formvalidáció és migráció

A [validációs útmutató](validation.md) a közös JSON/PHP mezőszabályokat, natív DHTMLX visszajelzést és backend/UI/API ellenőrzést rögzíti. Feature-migrációhoz a referencia teljes validációs leltára és az eltérések dokumentálása kötelező.

## ACL és műveletvégrehajtó fejlesztés

A [tartós ACL-/audit-szerződés](access-and-actions.md) első implementációja használható. A backend szerződésteszt `tests/shell/access.php`: default deny, objektumscope, mezőtiltás, API-csatorna és token-scope, optimista zárolás, audit és rollback ellenőrizve. A `Feature` registry/SqlResource és DHTMLX Workspace adapter önálló demo integrációja ellenőrzött; a fogyasztói telepítés és integráció ellenőrzött.

## Fejlesztői memória védelme

Böngészőteszt a [védett fejlesztői futtatóval](development.md#böngészőteszt-korlátozott-memóriájú-fejlesztői-hoston) indul: `npm run test:browser -- ...`. A közös lock, egy worker, indulási memóriaküszöb és cgroup-limit a fogyasztó saját tesztjeire is alkalmazható. Kapcsolódó visszajelzés: FB-0016.

A lista szerkeszthető oszlopait a fejléc `✎` jelzi; a fejléc kattintása a teljes SQL-találatot rendezi. A virtualizált megjelenítés és a legfeljebb 600 soros gördülő adatablak részletei: [rendezés és smart rendering](workspaces.md#rendezés-és-smart-rendering).

## Listaadatok és tömeges műveletek

A [kártyák és rekordadatok](workspaces.md#kártyák-rekordadatok-sorszám-és-jelölés)
útmutatója a többoszlopos DataView-t, alapértelmezett sorszámot, dupla kattintásra
nyíló jogosultságszűrt adatablakot és opcionális sorjelölést írja le. A
[tömeges műveletek](workspaces.md#tömeges-műveletek-és-ikonok) kifejezett opt-int
és soronkénti tranzakciót/ACL-t használnak; a teljes export továbbra sincs kész.

A [nézetválasztó](workspaces.md#nézetválasztás-és-fejlécjelzések) a lista-toolbar
utolsó, jobbra igazított dropdownja. A szerkeszthető fejléc és rendezésjel
külön helyet kap; az aktuális rendezésnek egyetlen irányjelzése van.

## URL és helyi felületbeállítások

Az aktív funkciót a shell `#feature=items` URL-részlete követi: frissítés és
Vissza/Előre navigáció visszaállítja a nézetet. A [helyi felületbeállítások](shell.md#url-és-helyi-felületbeállítások)
a grid és a munkaterület megjelenítési preferenciáit automatikusan megőrzik.

A lista-, toolbar-, rekordablak- és logingomb-javítások [követelményenkénti
minősítése](list-presentation-validation.md) a reprodukáló parancsokat és a
szintetikus fogyasztó bizonyítékait is tartalmazza.

A [listafejléc és rekordszám](workspaces.md#listafejléc-és-rekordszám)
a nézet címét a panelben, a teljes jogosult és szűrt darabszámot jobb oldalon
jeleníti meg. Ugyanitt található a konfigurálható főmenüikon használata.
A [kompakt hitelesítési ablakok](shell.md#kompakt-hitelesítési-ablakok-és-menüikonok)
a kirajzolt űrlaphoz méreteződnek, egységes alsó térközzel.

A [kártyaszerkesztés, rendezés és kompakt ablakok](workspaces.md#kártyaszerkesztés-rendezés-és-kompakt-ablakok)
a deklarált írható mezőket kártyán is elérhetővé teszik, közös `__edit`
mentéssel. A kártyák rendezése toolbar-dropdownból választható, a layout
méretezője dupla kattintásra a deklarált méretre áll vissza. A munkaterület
popupjai a tényleges tartalomhoz méreteződnek a viewport határáig.

A főmenü állandó, elkülönülő gombfelületeit és a Skyblue klasszikus Windows-hatását a [shell útmutató](shell.md#elkülönülő-főmenügombok) írja le; külön fogyasztói konfiguráció nincs.

A lista elválasztó árnyéka táblázatnézetben az oszlopfejléc alá kerül,
kártyanézetben a toolbar alatt marad ([munkaterületek](workspaces.md#listafejléc-és-rekordszám)).

A toolbar és a táblázat fejléce között témaszínű elválasztóvonal van.
Táblázat/kártya váltáskor a felső térköz megmarad, és a táblázatsor pixelben
mért belső eltolása nem görgeti be a kártyát ([munkaterületek](workspaces.md)).

A [checkbox és kártya-szerkesztésjelzés](field-presentation.md#egységes-checkbox-és-kártya-szerkesztésjelzés) közös Grid/DataView megjelenítést használ; checkbox csak módosítható mezőhöz és sorhoz látható.

A [kompakt ablakfejléc és teljes mobilmenü](shell.md#kompakt-ablakfejléc-és-teljes-mobilmenü)
40 px magas popupfejlécet és a Menü alá vont kijelentkezést ad. A
[reszponzív műveletsor](workspaces.md#reszponzív-műveletsor-és-azonos-kártyaszélesség)
a grid teljes toolbarját szűk panelen egy Műveletek gomb alá rendezi,
a kártyák pedig tartalomtól függetlenül egyforma szélességűek.

Skyblue témában a táblázat fehér–halványszürke (`#f7f7f7`) váltott sorhátteret
használ, az aktuális megjelenítési sorrend alapján, virtuális görgetésnél is.
A natív kijelölés a háttér fölött látszik; más témákat ez nem érint.
Külön fogyasztói konfiguráció nincs; build és assetpublikálás szükséges.

A popupok fejléce témához illő, a tartalomtól elkülönülő hátteret és minden
témában 1 px témaszínű alsó elválasztóvonalat kap,
a kompakt 40 px fejlécmagasságon belül ([shell](shell.md#kompakt-ablakfejléc-és-teljes-mobilmenü)).
