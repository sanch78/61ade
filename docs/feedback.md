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
- **Állapot:** elfogadott / javítás folyamatban.
- **Átvezetés:** [AGENTS.md](../AGENTS.md), [ADR-0002](decisions/0002-framework-first.md), [használati módszertan](usage.md).
- **Ellenőrzés:** a szabály tartós rögzítése megtörtént; a javított keret és fogyasztó ellenőrzése még hátravan.
