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
