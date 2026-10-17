# Felhasználói tesztelés és használati tanulságok

A napló célja, hogy a tesztelés során elmondott elvárások, javítások és használati útmutatások ne vesszenek el a beszélgetésekben. Az aktuális használat canonical leírása a [felhasználási módszertan](usage.md); a napló a megértés, döntés és ellenőrzés történetét őrzi.

## Rögzítés és feldolgozás

Minden érdemi észrevétel kap stabil `FB-NNNN` azonosítót. A rövid összefoglaló legyen önállóan érthető, teljes chatmásolat és bizalmas adatok nélkül. Azonnal különítsük el a megfigyelt viselkedést a kívánttól.

Állapotok: **nyitott** (még értelmezendő), **elfogadott / tervezett**, **megvalósítva / ellenőrzésre vár**, **lezárt / ellenőrzött**, **elvetett**, **felülírt**. Dokumentációs elvárás dokumentációs ellenőrzéssel zárható; runtime-visszajelzéshez tényleges működésellenőrzés kell. Agent által ellenőrzött eredményt nem nevezünk felhasználó által elfogadottnak.

Visszajelzés lezárása előtt a canonical útmutató és szükség esetén a fejlesztési terv, API-szerződés vagy ADR is frissüljön. Későbbi felülírásnál a korábbi bejegyzést megőrizzük, de jelöljük az utód azonosítóját, és az aktív útmutatóból eltávolítjuk az ellentmondást.

## Bejegyzéssablon

- **Azonosító, dátum, cím:** FB-NNNN, YYYY-MM-DD, rövid tárgy.
- **Forrás és kontextus:** felhasználói teszt/útmutatás, érintett komponens, verzió vagy commit, ha ismert.
- **Megfigyelés / reprodukció:** mit tett a tesztelő, mi történt; ha nincs runtime, ezt jelölni kell.
- **Elvárt működés / használat:** mit és hogyan szeretne alkalmazni.
- **Hatókör és döntés:** általános keretszabály vagy alkalmazási sajátosság; elfogadott értelmezés és esetleges nyitott kérdés.
- **Állapot és teendő:** megoldás, korlát vagy következő lépés.
- **Átvezetés:** link a használati útmutató megfelelő szakaszára, érintett implementációra és tesztre, ha vannak.
- **Ellenőrzés:** ki, hogyan és milyen eredménnyel ellenőrizte; felhasználói megerősítés csak akkor, ha ténylegesen megtörtént.

## FB-0001 — A használati módszertan folyamatos vezetése

- **Dátum:** 2026-10-16.
- **Forrás:** felhasználói fejlesztési utasítás a VAPA alapstruktúrájának elkészülte után.
- **Kontextus:** nincs még futtatható keret. A felhasználó kéri, hogy a használat módja folyamatosan dokumentálva legyen, és a későbbi tesztelés közben adott „mit hogyan” útmutatások a további felhasználásokat segítsék.
- **Elvárás:** minden képességhez karbantartott használati leírás; a visszajelzések tartós rögzítése és az általános tanulságok beépítése.
- **Hatókör és döntés:** kötelező VAPA-fejlesztési szabály, a definition of done része. Alkalmazásspecifikus üzleti tudás a fogyasztó dokumentációjában marad.
- **Állapot:** lezárt / dokumentációsan ellenőrzött. A szabály folyamatosan érvényes; a lezárás a bevezetésre vonatkozik.
- **Átvezetés:** [fejlesztési szabályok](../AGENTS.md), [használati módszertan](usage.md), [fejlesztési terv](development-plan.md).
- **Ellenőrzés:** az agent ellenőrizte a szabály, útmutató, napló és készállapot-feltétel összhangját, a belső hivatkozásokat és a diff formátumát. Runtime-teszt nem alkalmazható; későbbi felhasználói teszt még nem történt.

## FB-0002 — Fokozatos indulás login és navigációs shell segítségével

- **Dátum:** 2026-10-16.
- **Forrás:** első fogyasztó fejlesztési útmutatása.
- **Elvárás:** először bejelentkezés, majd alkalmazásnak megfelelő, üzleti funkció nélküli menü.
- **Döntés:** a keret adja a login/session/navigáció felületet; az identitásforrás és a menü az alkalmazásé. Nem tekintjük a shellt kész CRUD- vagy ACL-rendszernek.
- **Állapot:** felülírt — a felhasználó elutasította a megvalósítás irányát; utód: FB-0003. A technikai tesztek nem igazolták a keretrendszerrel szembeni elvárás teljesülését.
- **Átvezetés:** [shell használata és korlátai](shell.md), [PHP alkalmazás](../packages/php/src/Shell/Application.php), [frontend](../packages/frontend/src/admin.ts).
- **Ellenőrzés:** PHP 8.4 lint, TypeScript typecheck és build; a fogyasztó négy Chromium E2E tesztje szintetikus fiókokkal, mobilképek vizuális ellenőrzésével.

## FB-0003 — Minden általános képességet a VAPA ad; VAPA az ADE v2

- **Dátum:** 2026-10-16.
- **Forrás:** a felhasználó az első publikus felületet elutasította és kötelező szabályként pontosította az architektúrát.
- **Megfigyelés:** az egyedi loginoldal/kártyás dashboard a kívánt keretfejlesztési irányt nem teljesítette.
- **Elvárás:** VAPA keretrendszert fejlesztünk, majd erre kerülnek az üzleti modulok egyenként. Minden általános admin-képességet a VAPA ad DHTMLX komponensekkel; nincs azt megkerülő alkalmazási admin-megoldás.
- **Döntés:** kötelező architektúraszabály, nem vizuális preferencia. Az FB-0002 megvalósítási értelmezését felülírja.
- **Állapot:** első keretképesség és fogyasztói integráció megvalósítva, agent által ellenőrizve; felhasználói elfogadás még nincs. A szabály minden további képességre folyamatosan kötelező.
- **Átvezetés:** [AGENTS.md](../AGENTS.md), [ADR-0002](decisions/0002-framework-first.md), [használati módszertan](usage.md).
- **Ellenőrzés:** [önálló keretdemó és szerződéstesztek](shell.md#önálló-keretdemó-és-ellenőrzés), PHP lint, frontend typecheck/build. A 4 önálló Chromium keretteszt és a fogyasztó 4 integrációs tesztesete sikeres; publikus HTTPS login betöltése ellenőrizve. Mobilon a keret DHTMLX almenübe gyűjti az ágakat, átméretezéskor visszaállítja a menüsort.

## FB-0004 — Elsőbbségi keretszabály, kezelhető ACL és audit

- **Dátum:** 2026-10-16. Elfogadott felhasználói elvárás.
- **Döntés:** az AGENTS.md 1. szabálya minden AI-fejlesztőre kötelező; kivétel csak logikusan nem bővíthető keret dokumentált esetére. Az FB-0003 abszolút DHTMLX-megkötését ez pontosítja.
- **Elvárás:** UX-en kezelhető objektum-/művelet-/mező-/csatornajogok, azonos API-védelem; rendszeres audit minden admin- és üzleti folyamatra. Az alkalmazás adja saját user adminját, a keret az eszközöket. Admin szerepkör nem jelent üzleti szuperjogot. Csak implementált modul lehet a menüben.
- **Állapot:** első implementáció ellenőrizve és fogyasztóba telepítve; felhasználói elfogadás még nincs. A további keretképességek határa az ACL-leírásban szerepel.
- **Átvezetés:** [elsőbbségi szabály](../AGENTS.md), [ADR](decisions/0002-framework-first.md).

## FB-0005 — Natív DHTMLX témaváltás

- **Dátum:** 2026-10-16. Elfogadott felhasználói elvárás.
- **Döntés:** Default és Éjjeli stílus (a témakínálatot és alapértéket az FB-0012 bővíti Skyblue-val), a főmenüsor jobb oldalán; DHTMLX `setTheme` API, nem az ADE saját skin-rétegének átvétele. A választás böngészőnként megmarad.
- **Állapot:** implementálva, böngészőből ellenőrizve; a választás újratöltés után is megmarad.
- **Átvezetés:** `AdminShell` adapter, [shell](shell.md).

FB-0004 ellenőrzése: `tests/shell/access.php` és `tests/shell/workspace.spec.cjs`, valamint a fogyasztó profil/account/ACL/API PHP- és Chromium-tesztjei. Kapcsolódó implementáció: `packages/php/src/Feature`, `Access`, `Audit`, `packages/frontend/src/Workspace.ts`. Canonical használat: [ACL és műveletek](access-and-actions.md). Az admin saját profilján csak jelszóváltoztatás szerepel; ez a fogyasztó üzleti szabálya, nem kernelbe égetett user admin.

## FB-0006 — Konfigurálható munkaterület, dinamikus és élő listák

- **Dátum:** 2026-10-16. Elfogadott felhasználói pontosítás.
- **Elvárás:** a filter/form/grid külön, címzett és konfigurálható layoutterület legyen. Az overlay form választható és lehet alapértelmezett. A lapozógombos grid és a kézi Frissítés nem alapműködés. Nagy listák dinamikusan, korlátozott memóriával töltődnek.
- **Élő adatok:** minden látható lista változását figyeljük. Projektszinten polling vagy WebSocket választható; az első fogyasztó WebSocketet kap. A kiválasztást, szűrést, görgetést és nyitott űrlapot az automatikus frissítés megőrzi.
- **Műveletfeliratok:** lista: Hozzáadás / Módosítás, ACL-engedéllyel. Mentés kizárólag a tényleges beküldő gombon szerepel.
- **Profilom:** közvetlen adatlap/form, nem adatgrid. Csak a szerkeszthető mezők módosíthatók, a többi readonly. Saját ACL readonly nézete opcionális, nem helyettesíti a profilformot.
- **Állapot:** implementálva és agent által ellenőrizve; felhasználói elfogadás még nincs.
- **Döntés:** újrahasználható VAPA layout/lista/élőadat-képesség, alkalmazási frontend nélkül.
- **Átvezetés és ellenőrzés:** [munkaterületek](workspaces.md); `ViewLayout`, `ListSource`, `LiveConfig`, `Realtime`, WebSocket worker. 5000 rekordos PHP-teszt, overlay/polling keretdemo és WebSocketes fogyasztói böngészőtesztek sikeresek.

## FB-0007 — Az üzleti kód és a keret határa

- **Dátum:** 2026-10-16.
- **Forrás:** felhasználói kérdés arról, hol van az üzleti kód/konfiguráció, és szivárog-e alkalmazási logika a keretbe.
- **Elvárás és döntés:** a függés alkalmazás → VAPA. A konkrét séma, üzleti szabály és kezdeti jogkiosztás a fogyasztóé; a keret az általános végrehajtást és dokumentált bővítési pontokat biztosítja. Ez az FB-0003/0004 megerősítése.
- **Megfigyelés:** az ellenőrzött runtime-forrásban nem találtunk fogyasztói osztály-, üzleti tábla- vagy legacyflag-hivatkozást. Egy szintetikus pollingteszt alapértelmezett PHP-binárisa fogyasztói útvonalra mutatott; ez tesztkörnyezeti visszafüggés volt.
- **Módosítás:** a teszt most a demóindítóval egyezően `VAPA_PHP` vagy `php8.4` binárist használ. A konfiguráció és üzleti callback szerepe a [használati útmutatóban](usage.md#üzleti-konfiguráció-és-kód-határa), a tesztfuttatás a [fejlesztői útmutatóban](development.md#ellenőrzési-stratégia) szerepel.
- **Állapot és ellenőrzés:** útvonal javítva; a `tests/shell/workspace.spec.cjs` mindkét Chromium-tesztje sikeres, kívülről megadott `VAPA_PHP` binárissal (önálló CRUD/form és külső írás pollingkövetése). A célzott forráskeresésben nem maradt fogyasztói név/séma/legacyflag vagy a korábbi beégetett útvonal. `git diff --check` sikeres. Felhasználói elfogadást nem állítunk.

## FB-0008 — Olvasható JSON-definíció, env és rendezett PHP

- **Dátum:** 2026-10-16. Elfogadott felhasználói elvárás.
- **Elvárás:** a konfiguráció érthetően szekcionált JSON, a hostspecifikus beállítás env legyen; az üzleti PHP jól formázott, felelősségenként rendezett maradjon.
- **Döntés és megoldás:** új általános `Configuration` compiler a VAPA-ban; névvel regisztrált üzleti callbackekkel a meglévő Field/Action/SqlResource/Workspace végrehajtást használja. Az FB-0007 PHP-definíciós lehetőségét JSON-alapú alapmódszertannal egészíti ki.
- **Átvezetés:** [JSON/env használat](configuration.md), [üzleti határ](usage.md#üzleti-konfiguráció-és-kód-határa).
- **Ellenőrzés:** a szintetikus `tests/shell/configuration.php`, a shell- és ACL-szerződéstesztek sikeresek. A fogyasztó saját account/profil/ACL/API/jelszó PHP-tesztje sikeres. A publikus login JSON/env konfigurációval 200 választ ad. Felhasználói elfogadást nem állítunk.

## FB-0009 — A referencia teljes validációja a migráció része

- **Dátum:** 2026-10-16. Elfogadott felhasználói elvárás.
- **Megfigyelés:** a fogyasztó felhasználókezelésében a required ellenőrzés mellett referencia szerinti formátum- és egyediségi szabályok hiányoztak.
- **Döntés:** feature-migráció előtt teljes validációs leltár kell. Az általános mechanizmus a VAPA-é, a konkrét minta, hossz, üzenet és üzleti kivétel a fogyasztóé. A felhasználó kifejezetten megtartotta a jelenlegi 12–128 karakteres jelszószabályt.
- **Megoldás:** közös deklaratív min-hossz/minta/mezőegyezés/SQL-egyediség, natív DHTMLX mezőhiba, név szerinti backend mezőhibák. Hibánál a form tartalma megmarad.
- **Átvezetés:** [validáció és migráció](validation.md), [JSON-konfiguráció](configuration.md), AGENTS.md és CLAUDE.md kötelező paritásszabálya.
- **Ellenőrzés:** `tests/shell/validation.php`, ACL- és 5000 rekordos listateszt sikeres. A fogyasztó külön PHP-paritástesztje és natív formhibát/egyediséget/javítás utáni mentést ellenőrző Chromium-tesztje sikeres. Felhasználói elfogadást nem állítunk.

## FB-0010 — Megjegyzett belépés és e-mailes megerősítés

- **Dátum:** 2026-10-16. Elfogadott felhasználói elvárás.
- **Elvárás:** működő Bejelentkezve maradok, kiadástól 90 napos határral; felhasználónként kapcsolható, mindenkinél default-on e-mailes belépési megerősítés; keret által formázott levél üzletileg felülírható szöveggel.
- **Döntés és megvalósítás:** a teljes shell/auth/session/SMTP/MIME/remember folyamat VAPA-képesség, JSON/env konfigurációval. A fogyasztó csak a fiókillesztést, levélszöveget és ACL-védett adminaction definícióját adja. A megerősítés előtti session nem hitelesített, és nem kap API/UI/WebSocket hozzáférést.
- **Átvezetés:** [belépési védelem](authentication.md), [JSON-konfiguráció](configuration.md), `Authentication`, `Mail`, `Application`, DHTMLX `AdminShell`.
- **Ellenőrzés:** `tests/shell/authentication.php` sikeres. A három önálló SMTP/MIME/DHTMLX Chromium-teszt sikeres, beleértve az Enterrel beküldést, új böngészősessiont, abszolút lejáratot, logoutot, default-on állapotot és per-user kapcsolót. A tesztadatok és levelek szintetikusak. A fogyasztó SMTP-relayén csak TLS-kapcsolatot ellenőriztünk, valódi levél vagy felhasználói belépés nélkül. Felhasználói elfogadást nem állítunk.

## FB-0011 — Egyetlen alsó információs sáv

- **Dátum:** 2026-10-16. Elfogadott felhasználói elvárás.
- **Megfigyelés:** a felső alkalmazásnév-sáv, workspace-kapcsolatsáv és külön felhasználósáv fölöslegesen foglal helyet.
- **Elvárás és döntés:** nincs felső alkalmazásnév-fejléc és külön workspace-állapotsáv. Egyetlen alsó DHTMLX Toolbar bal oldalán a bejelentkezett felhasználó, jobb szélén az alkalmazás neve és verziószáma jelenik meg. Az élő adatkövetés megmarad.
- **Megvalósítás:** az alkalmazás opcionális `version` mezőt ad PHP/JSON-definícióban; az AdminShell jeleníti meg. A Workspace nem renderel állandó kapcsolati állapotot; műveleti hibák továbbra is Alertben, szerkesztési konfliktus Message-ben láthatók.
- **Állapot:** lezárt / agent által ellenőrzött; felhasználói elfogadást nem állítunk.
- **Ellenőrzés:** TypeScript typecheck/build és PHP lint/shell/JSON-szerződésteszt sikeres. A négy shell-böngészőteszt, az önálló CRUD/nézetváltás és a pollingteszt sikeres (a környezeti időtúllépéseket követő célzott újrafuttatásokkal).
- **Átvezetés:** [shell](shell.md#egységes-alsó-információs-sáv), [munkaterületek](workspaces.md), `ApplicationDefinition`, `JsonApplication`, `AdminShell`, `Workspace`.

## FB-0012 — Skyblue alapértelmezett megjelenés

- **Dátum:** 2026-10-16. Elfogadott felhasználói elvárás; az FB-0005 témakínálatát bővíti.
- **Elvárás:** Skyblue legyen az alapértelmezett skin.
- **Döntés és korlát:** a Suite 9-ben nincs gyári legacy Skyblue. A VAPA a dokumentált custom-theme CSS-változókkal világoskék Skyblue-palettát biztosít; ez nem a régi skin teljes, képes másolata. A vezérlők és a témaváltás DHTMLX maradnak.
- **Használat:** mentett választás nélkül `skyblue`; a meglévő érvényes böngészőpreferencia megmarad. Skyblue, Default és Éjjeli választható.
- **Állapot:** lezárt / agent által ellenőrzött; felhasználói elfogadást nem állítunk.
- **Ellenőrzés:** TypeScript typecheck/build; Chromiumban Skyblue alapérték, toolbar háttérszíne, Éjjeli/Skyblue váltás és reload utáni megőrzés sikeres. A képi ellenőrzés során az alsó Toolbar intrinsic magasságából eredő szövegvágást javítottuk; a teljes szöveg befoglaló méretét is ellenőrzi a shellteszt.
- **Átvezetés:** [shell megjelenési mód](shell.md#megjelenési-mód), `AdminShell.ts`, `admin.css`, `browser.spec.cjs`.

## FB-0013 — A panelméretező középre igazítása

- **Dátum:** 2026-10-16. Elfogadott felhasználói elvárás.
- **Megfigyelés:** a Suite `space` layoutban a hárompontos fogantyú a panel szegélyén jelenik meg; önálló gyári DHTMLX layouttal is reprodukálható.
- **Elvárás és döntés:** javítsuk a VAPA saját, célzott CSS-szabályával; a gyári DHTMLX CSS-fájlt ne módosítsuk. A fogantyú a 12 px panelköz közepére kerül mindkét tengelyen.
- **Megvalósítás:** `#vapa-application` alá szűkített `dhx_layout-space` resizerikon-felülírás; a többi layout és resizer változatlan.
- **Állapot:** lezárt / agent által ellenőrzött; felhasználói elfogadást nem állítunk.
- **Ellenőrzés:** frontend build és a két szintetikus Chromium-teszt sikeres; mindkét tengely középre igazítása három témával és tényleges egérhúzás ellenőrizve.
- **Átvezetés:** [panelméretező](workspaces.md#panelméretező-megjelenítése), `packages/frontend/src/admin.css`, `tests/shell/layout-resizer.spec.cjs`.

## FB-0014 — Checkboxok és kapcsolók az objektum főűrlapján

- **Dátum:** 2026-10-16. Elfogadott felhasználói elvárás.
- **Elvárás:** a bináris jelző a listában és a formon is checkbox; az oszlop szélessége korlátozható. A szűrők értékei ahol lehet, alkalmazási jelentésű feliratok legyenek általános Igen/Nem helyett. Egy kapcsoló ne igényeljen külön gombot és formot; a belépési megerősítés is főűrlapmező és listaoszlop.
- **Döntés:** általános VAPA checkbox/column és egy-az-egyhez kapcsolt tárolás a közös tranzakció/revízió/ACL/audit alatt. A konkrét állapotfeliratok és táblaillesztés a fogyasztóé. Listában a checkbox állapotjelző, mentés a főűrlapon.
- **Megvalósítás:** `Field`, `RelatedStorage`, `SqlResource`, `ListSource`, `WorkspaceConfiguration`, DHTMLX `Workspace`. A külön security action korábbi példája API-lehetőségként marad, UI-alapmintaként az egységes főűrlap váltja fel az FB-0010 megfelelő részét.
- **Állapot:** lezárt / agent által ellenőrzött; felhasználói elfogadást nem állítunk.
- **Ellenőrzés:** PHP related-field, ACL/API, lista és validációtesztek sikeresek; külön szintetikus Chromium-tesztben a natív checkboxok, fix szélesség, közös mentés, újranyitás és beszédes filter sikeres; a checkbox üzleti mezőhibája mezőnévvel ellátott DHTMLX Alertben jelenik meg, a form értékei megmaradnak. A fogyasztó account-checkbox integrációja, hat korábbi feature/validáció Chromium-próbája és PHP user/validáció-paritástesztje sikeres.
- **Átvezetés:** [mezőmegjelenítés és kapcsolt tárolás](field-presentation.md), [konfiguráció](configuration.md), [belépési kapcsoló](authentication.md#felhasználónkénti-kapcsoló).

## FB-0015 — Fölösleges keretezett layoutburkoló

- **Dátum:** 2026-10-16. Felhasználói tesztelési észrevétel.
- **Megfigyelés:** a Szűrés/Találatok panelek keretén kívül még egy keret és újabb térköz jelent meg. Az FB-0011-ben eltávolított állapotsáv egycellás `space` burkolója bent maradt.
- **Döntés és megvalósítás:** többpaneles nézetben a deklarált layoutfa közvetlenül a Workspace layout gyökere; az egycellás burkoló megszűnik. A singleton címzett panel és a deklarált belső ágak megmaradnak.
- **Állapot:** lezárt / agent által ellenőrzött; felhasználói elfogadást nem állítunk.
- **Ellenőrzés:** typecheck/build és négy célzott Chromium-próba sikeres. A workspace egyetlen space gyökere és 12 px térköze, CRUD/nézetváltás/polling és a kétirányú méretező ellenőrizve.
- **Átvezetés:** [layoutszintek és keretek](workspaces.md#layoutszintek-és-keretek), `Workspace.ts`, `workspace.spec.cjs`.

## FB-0016 — Fejlesztői tesztfuttatás ne merítse ki a közös hostot

- **Dátum:** 2026-10-16. Elfogadott felhasználói elvárás: VS Code fejlesztés közben előzzük meg a host memóriaelfogyását.
- **Döntés:** közös fejlesztői guard, soros böngészőtesztek, indulási memóriaküszöb és systemd cgroup-korlát; nincs alkalmazási admin-infrastruktúra változás.
- **Megvalósítás:** `tools/run-dev-check.sh`, `tools/playwright.sh`, npm belépési pont; a fogyasztó ugyanazt az eszközt hívja.
- **Ellenőrzés:** tényleges cgroup limitek kiolvasása és konkurens lock elutasítása sikeres; mindkét projekt wrapperes tesztfelderítése és egy szintetikus login/menu Chromium-próba sikeres. Host-OOM stresszteszt nincs.
- **Állapot:** fejlesztői tesztvédelmek megvalósítva; a teljes editor-session izolációját és a rootjogot igénylő hostvédelmet nem állítjuk késznek.
- **Átvezetés:** [fejlesztői futtató és korlátai](development.md#böngészőteszt-korlátozott-memóriájú-fejlesztői-hoston).

## FB-0017 — Deklarált mezőnkénti gridszerkesztés

- **Dátum:** 2026-10-16. Elfogadott felhasználói elvárás.
- **Elvárás:** checkbox csak kezelhető listaoszlophoz; szöveg, select és checkbox oszloponként szerkeszthető legyen, az ADE működésének megfelelően. A fogyasztó felhasználólistájában beosztás, telefon, e-mail és a kapcsolók legyenek kezelhetők. A Skyblue megjelenés külön feladat.
- **Döntés:** `Field.column.editable` és natív DHTMLX szerkesztők a VAPA-ban; közös update ACL, API-scope, revízió, audit és mentési hookok. A többi oszlop beszédes érték. Teljes űrlap helyett egyetlen deklarált mező validációja fut; a fogyasztói üzleti guard a teljes egyesített rekordot ellenőrzi.
- **Megvalósítás:** `GridEditing`, `Workspace`, `Executor::edit`, `SqlResource`; kapcsolt mezőre is ugyanaz a mentési út. A Suite kijelölési fókuszának befejezése után nyílik meg a cella; gyári fájl nem változik.
- **Ellenőrzés:** önálló PHP szerződésteszt (mezővalidáció, legacy érintetlen mező, select, related checkbox, ACL, API-scope, revízió, audit) és szintetikus Chromium text/select/checkbox, hibavisszajelzés, elvetés és újratöltés. CityScreen: PHP mezőmentés/validáció/session-visszavonás és két Chromium-próba (grid és főűrlap) sikeres; a korábbi account/validáció PHP regresszió is sikeres.
- **Állapot:** megvalósítva, agent által ellenőrizve; felhasználói elfogadást nem állítunk.
- **Átvezetés:** [mezőnkénti gridszerkesztés](field-presentation.md#mezőnkénti-gridszerkesztés).

## FB-0018 — Szerkeszthető fejlécjelzés, rendezés és smart rendering

- **Dátum:** 2026-10-16. Elfogadott felhasználói elvárás.
- **Elvárás:** a fejléc jelezze, ha az oszlop szerkeszthető; a listák legyenek rendezhetők; az ADE smart rendering képességének tényleges meglétét ellenőrizni kell.
- **Megfigyelés:** a Standard Grid megjelenítési virtualizációja és a VAPA 100-as/600-as gördülő adatablaka már működött; a rendezés a fejlécben tiltott, szerveren csak fix kulcssorrend volt. Teljes rekordszám szerinti scrollbar/ugrás nem volt megvalósítva, most sem állítjuk azt.
- **Döntés:** általános fejlécjelzés a VAPA közös CSS-ében, DHTMLX header tooltip és esemény; a teljes jogosult/szűrt halmaz SQL-rendezése, stabil kurzorokkal és live ablakhatárral. Az oszlopok olvashatóságából következik a rendezhetőség; nincs fogyasztói sort-kód vagy gyári DHTMLX-módosítás.
- **Megvalósítás:** `GridHeaders`, `Workspace`, `ListSource::sortableFields/read`, `Realtime` pozíciómetaadat. A readonly/titkos mezők védelme megmarad; rendezési kulcs módosításakor új szerverlista készül.
- **Ellenőrzés:** PHP teljes bejárás és visszafelé kurzor szöveg/szám/ID, NULL/duplikáció és ACL esetén; szintetikus Chromium 1801 rekorddal, fejlécjellel, mindkét rendezési iránnyal, szűréssel és virtualizált, memóriakorlátos görgetéssel sikeres. Kapcsolt checkbox és szám (2/9/10, hiányzó kapcsolt sor defaultja), valamint API-scope is ellenőrzött. CityScreen három Chromium-próbája: főűrlap, inline szerkesztés és fejléc/rendezés/WebSocket/újrarendező mentés sikeres.
- **Állapot:** megvalósítva és szintetikus fogyasztóval ellenőrizve; felhasználói elfogadást nem állítunk.
- **Átvezetés:** [rendezés és smart rendering](workspaces.md#rendezés-és-smart-rendering), [mezőmegjelenítés](field-presentation.md).

## FB-0019 — Listák, rekordadatok és vezérlők megjelenése

- **Dátum:** 2026-10-17. Elfogadott felhasználói elvárás.
- **Elvárás:** valódi többoszlopos kártyanézet; egyetlen gridkeret; toolbarba nem belógó tartalom; elférő, minden témán kezelhető gombok; natív másodlagos gombok a filteren és a loginfolyamatban; ikonok. Minden listán alapértelmezett, kikapcsolható sorszám; annak dupla kattintására teljes, jogosultságszűrt rekordadatok DHTMLX ablakban. Később bekapcsolható sorjelölés és tömeges művelet.
- **Megvalósítás:** `ResponsiveGrid`, `RecordPresentation`, `Workspace`, `AdminShell`, közös CSS; Registry/JSON nézetopciók, Action ikon/bulk opt-in, Executor soronkénti auditált batch. A kezdeti lokális sorszámozást az FB-0022 teljes SQL-rangra bővítette. A jelölés/bulk a fogyasztóban egyelőre kikapcsolva marad.
- **Átvezetés:** [kártyák és rekordadatok](workspaces.md#kártyák-rekordadatok-sorszám-és-jelölés), [tömeges műveletek és ikonok](workspaces.md#tömeges-műveletek-és-ikonok).
- **Kezdeti ellenőrzés (az FB-0022 előtt):** TypeScript typecheck/build, PHP list-presentation/ACL/lists/sorting/grid-edit/shell contracts PASS. A list-presentation a részleges sikert és revízióütközést is ellenőrzi. Egy közvetlen szintetikus DataView-teszt lefutott, a teljes UI-ellenőrzés nincs kész. Az első futás az örökölt rendszerszintű Playwright böngészőverzió-eltérésén megállt. A téves projektoldali böngészőtelepítést a felhasználó elutasította; leállítottuk és eltávolítottuk. A közben feltárt CSP-fixture és ikon-akadálymentességi hibák javítva, böngészős újraellenőrzésük vár. A fogyasztó INFRA-003/pool #36 rev1 kérésben kéri a közös környezet rendezését. **Frissített állapot:** az FB-0022 folytatásában a teljes UI-minősítés sikeresen lezárult; [evidencia](list-presentation-validation.md). Felhasználói elfogadást nem állítunk.

## FB-0020 — Nézet-dropdown és szerkeszthető fejléc rendezésjelzése

- **Dátum:** 2026-10-17. Elfogadott felhasználói pontosítás az FB-0019-hez.
- **Elvárás:** a nézetválasztó dropdown legyen, mindig a lista-toolbar utolsó elemeként. Szerkeszthető mező fejlécében a rendezés ikonja ne ütközzön a szerkeszthetőség jelzésével.
- **Megvalósítás:** `Workspace` a műveletek után, spacerrel jobbra igazított „Nézet: Táblázat / Kártyák” DHTMLX dropdownot ad; mobilon a kötelező kártyamód látszik, a dropdown tiltott. A közös CSS külön 24 px helyet tart fenn a hover-rendezésjelnek, a mezőcím csak a saját szélességét foglalja. Aktív SQL-rendezéskor kizárólag a VAPA iránynyila látszik, a második Suite ikon rejtett.
- **Használat:** [nézetválasztás és fejlécjelzések](workspaces.md#nézetválasztás-és-fejlécjelzések).
- **Ellenőrzés:** typecheck/build és a dropdown-/fejléc-, mobil- és háromtéma-regresszió PASS a meglévő rendszerfuttatóval; [teljes evidencia](list-presentation-validation.md). Nincs projektoldali böngészőtelepítés; felhasználói elfogadást nem állítunk.


## FB-0022 — Az eredeti listajavítások teljes ellenőrzése

- **Dátum:** 2026-10-17. A felhasználó kéri az FB-0019 és FB-0020 teljes befejezését; a build önmagában nem kész eredmény.
- **Pontosítás:** az FB-0019 adatablakon belüli sorszáma helyett a teljes jogosult, szűrt és rendezett halmazon belüli rang készül. A `numbered: false` a számítást is kikapcsolja. A PHP rendezésteszt előre/hátra lapozást, NULL/azonos értékeket, középső élő ablakot és ablak elé beszúrt rekord hatását ellenőrzi.
- **Feltárt hibák:** a filterablak `beforeHide` alatti destrukciója láthatatlan modalréteget hagyott; javítás `afterHide` életciklussal. A gyors műveletválasz és formleállítás közti rajzolási ütközés redraw-szinkronizálást kap. Nézetváltáskor inaktív widgetre rajzolást és elavult async restore-t tiltunk.
- **Platform:** a meglévő rendszerszintű Playwright használható, a korábbi blokk projektoldali runner/modul-verzió-keveredés volt. A közös belépő és a tesztimport ugyanazt a rendszertelepítést használja, a guard megmarad; új telepítés nincs.
- **Állapot:** lezárt / agent által ellenőrizve. PHP szerződések, a kibővített UI-, login-/téma- és valódi szerveres batch-próbák PASS. [Követelményenkénti evidencia](list-presentation-validation.md). Az FB-0019/0020 korábbi „Infra-javításra vár” állapota felülírt; felhasználói elfogadást nem állítunk.
- **Használat:** [munkaterületek](workspaces.md), [közös futtató](development.md#meglévő-közös-playwright-bekötése).

## FB-0021 — URL-követés és felületállapot megőrzése

- **Dátum:** 2026-10-17. Elfogadott felhasználói elvárás.
- **Elvárás:** a címsor kövesse az aktuális funkciót, frissítés ugyanarra a funkcióra térjen vissza; a grid és layout kézi beállításai maradjanak meg.
- **Megvalósítás:** `AdminShell` fragmentes feature-navigáció, belépésen át megőrzött URL és böngészőelőzmény; `UiPreferences` verziózott, alkalmazásútvonal/user ID/resource szerinti localStorage. A `Workspace` és `ResponsiveGrid` oszlopszélességet, rendezést, kézi nézetválasztást és panelméretet állít vissza. Aktuális ACL/definíció és méretkorlát az elsődleges; űrlapértéket nem tárolunk.
- **Használat és korlát:** [URL és helyi felületbeállítások](shell.md#url-és-helyi-felületbeállítások). Böngészőnkénti preferencia, szerveres szinkron nélkül; a megnyitott rekord/szerkesztő nem mélylink.
- **Ellenőrzés:** TypeScript typecheck/build, PHP shell contracts/lint és `ui-preferences.mjs` PASS. Védett szintetikus Chromium: 3/3 PASS; a bővített méret/panelösszecsukás/mobil–asztali preferenciateszt külön újrafuttatva 1/1 PASS. A belépés, reload, Vissza/Előre, ismeretlen feature és tiltott localStorage ellenőrzött. Megvalósítva és agent által ellenőrizve; felhasználói elfogadást nem állítunk.

## FB-0023 — Listafejléc, darabszám, menüikonok és kompakt login

- **Dátum:** 2026-10-17. Elfogadott felhasználói pontosítás az FB-0019/0022-höz.
- **Elvárás:** a lista neve a Találatok helyén legyen; ugyanabban a sorban jobbra az összes, szűrésnél összes/találat szám. A főmenü kapjon ikonokat. A filtergombok ne torlódjanak; a login és a megerősítés nagy üres alsó része szűnjön meg. A toolbar alatt árnyék válassza el a gördülő tartalmat.
- **Megvalósítás:** natív Layout-fejléc és kiegészítőhely, ACL-szűrt `ListSource` count/metaadat és polling/WebSocket továbbítás; konfigurálható view/MenuItem ikonok; kirajzolt gombokhoz méretezett Window, 24 px alsó hellyel; fix toolbar-árnyék. Az assetverzió `v=8`, hogy a böngésző friss csomagot kérjen. A filter és megerősítés korábbi natív gombelrendezése az új assetben érvényesül.
- **Átvezetés:** [munkaterületek](workspaces.md#listafejléc-és-rekordszám), [shell](shell.md#kompakt-hitelesítési-ablakok-és-menüikonok).
- **Ellenőrzés:** PHP teljeshalmaz/ACL/kurzor/szűrés/élő darabszám PASS; login/megerősítés három témában, desktop/mobil shell, toolbar/kártya és önálló szerveres fogyasztó PASS. CityScreen-integráció 3/3 PASS, WebSocketes szűrt darabszám 1→0→1 változással. Dev login és publikált assetegyezés is ellenőrzött; részletek a [minősítésben](list-presentation-validation.md#fb-0023-fejlécek-darabszám-és-hitelesítési-ablakok). Agent által ellenőrizve, felhasználói elfogadást nem állítunk.

## FB-0024 — Kártyaszerkesztés, mentés utáni nézetváltás, méret és rendezés

- **Dátum:** 2026-10-17. Elfogadott felhasználói hibajelzés és működési elvárás.
- **Elvárás:** a kártyák írható mezői kezelhetők; gridmentés után is működő nézetváltás; dupla kattintás ne jelölje ki a funkciót indító mező szövegét; kártyákon jobb oldali rendezés-dropdown; layoutméretező dupla kattintására deklarált induló méret; minden form-/contentablak a tartalom magasságát vegye fel a viewport határáig.
- **Megvalósítás:** `ResponsiveGrid` külön widget-adatpillanatképet tart, rejtett widgetet csak visszacsatoláskor szinkronizál; a DataView nem kapja meg a Workspace saját módosítható sorobjektumát. A kártyamezők a deklarált oszlopszerkeszthetőség és a sor `_editable` joga metszetét használják. Natív DHTMLX Window/Form, közös `saveCell`/`__edit`, kliens-/szervervalidáció, ACL, revízió és audit. Checkbox közvetlen kapcsolás, szöveg/select/textarea egyetlen mezős szerkesztő; a readonly adatablak változatlanul olvasás. A GridHeaders rejtett DOM-hoz nem ír ARIA-attribútumot. `UiPreferences` méretreset, `WindowSizing` tartalommérés és közös CSS. Assetverzió `v=9`.
- **Használat:** [kártyaszerkesztés, rendezés és kompakt ablakok](workspaces.md#kártyaszerkesztés-rendezés-és-kompakt-ablakok), [módszertan](usage.md).
- **Ellenőrzés:** TypeScript typecheck/build és PHP grid-edit/validáció szerződések PASS; a szintetikus grid/kártya Chromium 2/2 és a layout/lista/mobil/workspace regresszió 9/9 PASS. A késleltetett mentés alatti váltás, checkbox/text/select, mezőhiba, SQL-rendezés, reload, kétirányú méretreset és három téma ellenőrzött. Külső fogyasztói integráció 3/3 és dev betöltés 2/2 PASS. A kis viewportba illesztett rekordablak is ellenőrzött. Nem módosul gyári DHTMLX-kód.
- **Állapot:** lezárt / agent által ellenőrzött; felhasználói elfogadást nem állítunk.

## FB-0025 — Elkülönülő főmenügombok

- **Dátum:** 2026-10-17. Elfogadott felhasználói elvárás.
- **Elvárás:** a főmenüsor ne felsorolásnak hasson, a gombok különüljenek el; Skyblue esetén erősebb Windows-megjelenés. Felhasználói pontosítás: az elválasztó (például a kijelentkezés előtt) térköz mellett halvány vonallal is látszódjon.
- **Megvalósítás:** közös VAPA CSS a natív DHTMLX menüre: állandó keret, háttér, 6 px térköz, fókusz és benyomott állapot; Skyblue domborított kék gombok és arany hover. Kompakt töréspont helyigénye frissítve, assetverzió `v=11`.
- **Használat:** [shell](shell.md#elkülönülő-főmenügombok), [módszertan](usage.md). Az almenük listaelrendezése megmarad.
- **Ellenőrzés:** TypeScript typecheck/build és a szintetikus shell Chromium 6/6 PASS; az elválasztó után a háromtémás célzott próba újra 1/1 PASS (látható 1 px széles, 12 px-nél magasabb vonal, gombkeret/háttér/árnyék és sorméretek). Skyblue és Éjjeli screenshot képi ellenőrzése sikeres. A gombmegjelenést a felhasználó pozitívan visszajelezte; a vonalra további elfogadást nem állítunk.

## FB-0026 — Táblázatárnyék az oszlopfejléc alatt

- **Dátum:** 2026-10-17. Elfogadott felhasználói pontosítás az FB-0023 árnyékelhelyezéséhez; táblázatnézetben az ottani toolbar-árnyék elvárását felülírja.
- **Elvárás és megvalósítás:** táblázatnézetben a natív Grid oszlopfejléce veti az árnyékot a gördülő sorokra; a toolbar árnyéka ilyenkor kikapcsol. Kártyanézetben a toolbar alatt marad. Közös VAPA CSS, automatikus váltás a megjelenített Grid alapján, gyári kódmódosítás nélkül; assetverzió `v=12`.
- **Használat:** [listafejléc és rekordszám](workspaces.md#listafejléc-és-rekordszám), [módszertan](usage.md).
- **Ellenőrzés:** build és `git diff --check` PASS. Védett Chromium célzott prezentációs próba 1/1 PASS: Skyblue/Default/Dark témában nincs toolbar-árnyék táblázaton, van fejlécárnyék; kártyára váltva visszatér a toolbar-árnyék. Görgetés és visszaváltás is ellenőrzött, Skyblue screenshot képi ellenőrzése sikeres.
- **Állapot:** lezárt / agent által ellenőrzött; felhasználói elfogadást nem állítunk.

## FB-0027 — Toolbar/fejléc elválasztás és kártyák felső térköze

- **Dátum:** 2026-10-17. Elfogadott felhasználói pontosítás az FB-0026 után: az árnyék helye megfelelő, de a toolbar és az oszlopfejléc összefolyik; kártyára váltáskor a tartalom kissé begörgetve jelenik meg.
- **Megvalósítás:** 1 px témaszínű elválasztóvonal a toolbar alsó szélén táblázatnézetben, az árnyék az oszlopfejléc alatt marad. A `ResponsiveGrid.restore` külön kezeli a nézetváltást: a forrásnézet soron belüli pixeloffsetje nem kerül a más magasságú célnézetre; a lista tetején a scroll 0, középen a megfelelő rekord a természetes kártyatérközzel látható. Az azonos nézet élő frissítésének pontos pozíciómegőrzése megmarad. Assetverzió `v=13`.
- **Használat:** [munkaterületek](workspaces.md), [módszertan](usage.md).
- **Ellenőrzés:** typecheck/build és `git diff --check` PASS; védett Chromium listaprezentáció/mobil 6/6 PASS. Három téma, elválasztóvonal, árnyékhely, ismételt top→kártya→tábla váltás, részben görgetett táblázatból váltás, élő kártyafrissítés és kiválasztás ellenőrzött. A stabil kirajzolás után is vizsgált nézetváltási regresszió külön újrafuttatva; Skyblue screenshot képi ellenőrzése sikeres.
- **Állapot:** megvalósítva / agent által ellenőrzött; felhasználói elfogadást nem állítunk.

## FB-0029 — Jobb széli kártyaceruza és egységes, kezelhető checkbox

- **Dátum:** 2026-10-17. Elfogadott felhasználói elvárás: a kártyaceruza a jobb szélen indítsa a szerkesztést; checkboxhoz egyik nézetben se legyen ceruza, és checkbox csak kezelhető mezőhöz jelenjen meg. A kártya és a tábla jelölője legyen egységes. Az FB-0018/FB-0024 checkboxra vonatkozó általános ceruzajelzését pontosítja.
- **Megvalósítás:** közös `RecordPresentation.recordCheckbox` Suite-megjelenítés a Grid és DataView template-jében, deklarált szerkeszthetőség és sorjog metszetével; readonly mező/rekordadatablak szöveges. A mentés mindkét nézetben a meglévő mezőszerkesztési útvonal. A kártyaceruza jobb szélen, fenntartott helyen áll; checkbox fejlécében és értékénél nincs ceruza.
- **Használat:** [mezőprezentáció](field-presentation.md#egységes-checkbox-és-kártya-szerkesztésjelzés), [módszertan](usage.md).
- **Ellenőrzés:** typecheck/build és `git diff --check` PASS; védett szintetikus Chromium 2/2 és fogyasztói inline/kártya integráció 1/1 PASS. Checkboxméret-egyezés, ceruzamentes kapcsoló/fejléc, jobb széli ikonról nyitás, Enter/Space, mentés/validáció/újratöltés és readonly sorjog ellenőrzött. Skyblue képi ellenőrzés PASS; dev assetek publikálva, cacheverzió `v=15`.
- **Állapot:** megvalósítva / agent által ellenőrzött; felhasználói elfogadást nem állítunk.
