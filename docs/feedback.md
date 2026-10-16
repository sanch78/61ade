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
- **Döntés:** Default és Éjjeli stílus, a főmenüsor jobb oldalán; DHTMLX `setTheme` API, nem az ADE saját skin-rétegének átvétele. A választás böngészőnként megmarad.
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
