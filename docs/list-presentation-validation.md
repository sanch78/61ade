# Listamegjelenítés: az FB-0019, FB-0020 és FB-0022 ellenőrzése

Dátum: 2026-10-17. Állapot: **a kért keretképességek megvalósítva és agent által
ellenőrizve**. Felhasználói elfogadást és production kiadást nem állítunk.
Használat: [munkaterületek](workspaces.md#kártyák-rekordadatok-sorszám-és-jelölés).

## Követelményenkénti evidencia

| Követelmény | Megvalósítás és ellenőrzés |
| --- | --- |
| Valódi kártyák | A natív DataView szélesség szerint több oszlopot használ; mobilon egyet. `list-presentation.spec.cjs` és a valódi `list-integration.spec.cjs` két szomszédos kártya helyét méri. |
| Egyetlen gridkeret | A belső layoutok `type: none`, a grid/content nem ad újabb külső bordert. A böngészőteszt számított 0 px belső bordert ellenőriz; a külső Találatok panel megmarad. |
| Alaphelyzet és login másodlagos gombok | Natív flat gombok ikonokkal. A szűrőpár egy sorban, legalább 8 px távolsággal; a megerősítő ablak gombjai teljes szélességgel, legalább 8 px függőleges térközzel. Tényleges szűrés, mobil/asztali értékmegőrzés és törlés: `list-integration.spec.cjs`; három téma és ablakon belüli geometria: `authentication.spec.cjs`. |
| Ikonok | A beépített műveletek és a konfigurált action ikonja megjelenik. A fontban minden használt osztály ellenőrzött; a dekoratív ikon `aria-hidden`, az elérhető gombnév tiszta szöveg. A fő műveletek teljes UI-útja és képernyőképei ellenőrzöttek. |
| A tartalom nem görget bele a toolbarba | `list-presentation.spec.cjs` tényleges egérgörgetést és pozitív Grid scrollpozíciót, illetve tényleges kártyagörgetést követően hit-testtel ellenőrzi a toolbar gombját mindhárom témán. |
| Teljes rekordadatok ablakban | Sorszám dupla kattintására natív Window nyílik, friss ACL-védett `get` adattal. A valódi JSON-fogyasztó gridből kihagyott leírása megjelenik; a titkos és objektummező-joggal tiltott érték nem jut a válaszba. `list-integration.spec.cjs`, `list-presentation.php`. |
| Alapértelmezett, kikapcsolható sorszám | A teljes jogosult/szűrt/rendezett halmazon belül folyamatos rang; nem indul újra 600 sornál. PHP `sorting.php`: minden rendezési irány, NULL/azonos érték, előre/hátra lapozás, élő középső ablak, elé beszúrt rekord, szűrés és kikapcsolás. UI kikapcsolás: `list-presentation.spec.cjs`. |
| Sorjelölés és tömeges művelet | Opt-in, tábla/kártya között megmaradó jelölés. A valódi szintetikus fogyasztó két kijelölt sorát a szerver ténylegesen módosította; a visszatöltött checkboxok is változtak. `list-integration.spec.cjs`. PHP `list-presentation.php`: ACL, API-tiltás, limit, duplikáció, titkos mező tilalma, soronkénti audit, részleges siker és revízióütközés. |
| A gomb elfér a konténerben, hover alatt is | Toolbar és menüsor méretezése keret-CSS-ben; `list-presentation.spec.cjs` és `browser.spec.cjs` Skyblue/Default/Éjjeli témán mér. A témagomb tényleges hover-képe is ellenőrzött. |
| Fehér csík a gombsor alatt | A Toolbar teljes cellamagasságot tölt ki, a navbar belső paddingje méretezett. A menüsor alján a teszt csak a natív 1 px panelhatárt engedi; nagy üres sáv nincs. |
| Nézet-dropdown utolsóként | A műveletek után, spacerrel jobbra igazított natív dropdown; az aktív nézet a feliratban látszik. `list-presentation.spec.cjs` ellenőrzi, hogy utolsó gomb; a váltás és mobil állapot is ellenőrzött. |
| Rendezés és ceruza nem ütközik | A mezőcím saját szélességű, a hover-ikon külön 24 px helyet kap; aktív rendezéskor nincs második Suite-nyíl. A fejléc CSS-geometriája és az `aria-sort` böngészőben ellenőrzött; a `header-editable-hover.png` és `header-editable-sorted.png` célzott képek vizuális ellenőrzése is sikeres. A rendezés továbbra is a teljes SQL-halmazé. |

## Lefutott próbák

- `list-presentation.spec.cjs`: **3/3 PASS** a végső, valódi görgetést is mérő változattal.
- `playwright.presentation.config.cjs` / `list-integration.spec.cjs`: **2/2 PASS** a végső, mobil szűrés/Alaphelyzet ellenőrzéssel is.
- `playwright.auth.config.cjs`: **4/4 PASS**; a későbbi egységes szélesség/térköz változtatása után az érintett háromtéma-próba külön **1/1 PASS**.
- `browser.spec.cjs`: az öt korábbi shell-/login-/témapróba PASS; az új hover-/menüsor-próba a natív 1 px keretet figyelembe vevő javítás után **1/1 PASS**.
- `mobile-grid.spec.cjs`: a külön szintetikus görgetéspróba PASS; a teljes mobil filter/modal/nézetváltás regressziója a widgetmozgatás megszüntetése után **1/1 PASS**.
- `workspace.spec.cjs`: **2/2 PASS**, CRUD és polling.
- `playwright.sorting.config.cjs`: **1/1 PASS**, 1801 rekord, szerkeszthető fejléc, SQL-rendezés, kétirányú smart rendering és legfeljebb 600 betöltött sor.
- PHP `list-presentation.php`, `sorting.php`, `lists.php`, `access.php`, `grid-edit.php`, `contracts.php`: PASS. TypeScript typecheck és frontend build: PASS.
- A fogyasztó saját szintetikus felhasználólista-integrációja külön ellenőrizte a három témát, rekordablakot, kártyákat, fejlécet, inline mentést és WebSocketes rendezéskövetést; eredménye a fogyasztó dokumentációjában van.

## Reprodukció és környezeti határ

A `tools/playwright.sh` a meglévő rendszertelepítést indítja a közös
`run-dev-check.sh` guardon belül: egy worker, közös lock és systemd cgroup.
`VAPA_PLAYWRIGHT_MODULE` a belépővel azonos rendszer-`@playwright/test`,
`VAPA_TMP_DIR` a kijelölt projekt-scratch. Nincs projektoldali böngészőtelepítés.
A rendszerfuttató bekötése: [fejlesztői útmutató](development.md#meglévő-közös-playwright-bekötése).

```sh
npm run test:browser -- list-presentation.spec.cjs
npm run test:browser -- --config playwright.presentation.config.cjs
npm run test:browser -- --config playwright.auth.config.cjs
npm run test:browser -- --config playwright.sorting.config.cjs
```

A fenti parancsok a leírt környezeti változókkal futnak. Az artifactok a
kijelölt scratchben keletkeznek; a képernyőképek szintetikus adatot tartalmaznak.
A sorjelölés/bulk a meglévő üzleti nézeteken egyelőre kikapcsolva marad,
a keretben JSON/PHP opt-innel használható. A bulk soronkénti tranzakciójú,
részleges siker lehetséges; nem teljes csomagra atomikus tranzakció.

## FB-0023: fejlécek, darabszám és hitelesítési ablakok

2026-10-17, implementációs checkpoint `3796fea`, a végső CSS-/tesztpontosítással.

- `sorting.php`: PASS, az ACL szerinti teljes és szűrt szám nem a limit/kurzor
  mérete; a középső élő ablakon kívüli beszúrás is frissíti a számot.
- `lists.php`, `list-presentation.php`, `contracts.php`, typecheck/build: PASS.
- `playwright.presentation.config.cjs`: 2/2 PASS, natív listacím, jobb oldali
  összes, mobil filter után összes/találat, Alaphelyzet és menüikon.
- `playwright.auth.config.cjs`: végső teljes futás 4/4 PASS; háromtéma-geometria,
  8 px gombköz, körülbelül 24 px alsó hely (natív keret/kerekítés ±2 px), a gomb
  alsó szélének tényleges hit-testje, hibás kód utáni modal- és loginfolyamat.
- `browser.spec.cjs`: 6/6 PASS; `mobile-grid.spec.cjs`: 2/2 PASS.
- `list-presentation.spec.cjs`: a toolbar/görgetés és dropdown/fejléc két próbája
  PASS. A kártya/bulk próba a natív átrajzolást megváró geometria és egyetlen
  DOM-pillanatban mintavételezett mobilkártyák javítása után 1/1 PASS. Az első
  azonnali koordinátamérés átmeneti pozíciót olvasott; a két egymást követő
  `boundingBox` hívás a viewportváltás közben lecserélt elemen várt. Nem fix
  időzített várakozás vagy lazított többoszlopos követelmény került a tesztbe.
- Fogyasztói háromtéma-, inline- és WebSocket-próbák: 3/3 PASS. A szűrt számláló
  külső átnevezés hatására 1→0→1 találatot mutat, ugyanannyi összes mellett.
  A fogyasztó PHP feature- és validációs szerződései is PASS.
- Dev HTTPS `/v2/`: login PASS, az utolsó gomb alsó széle is kattintható; a
  kiszolgált `v=8` JS/CSS tartalma a publikált builddel azonos.

A Window/Form kétszeres alsó térközét a hitelesítési ablak keretstílusa
szünteti meg; puszta magasságcsökkentés levágta volna a gomb alját.
Az automatikus méretezés nem hív újabb `show`-t a hibaüzenet modalja fölé.
Vizuálisan ellenőrzött szintetikus képek: `presentation-real-cards.png`,
`cityscreen-cards-skyblue.png`, `confirmation-skyblue.png`;
valódi dev login: `dev-login-compact.png`. Artifactgyökér:
`/space/share/tmp/dev.cityscreen.hu/runtime/vapa-ui/`.
A Playwright kizárólag a meglévő rendszerszintű runnerrel, a guardon belül futott.

## FB-0024 — Kártyaszerkesztés és ablakok, 2026-10-17

| Elvárás | Ellenőrzés | Eredmény |
| --- | --- | --- |
| Kártyán is írható mezők | Natív mezőszerkesztő text/select; közvetlen checkbox; hibás telefon elutasítása és javított mentés/reload | PASS |
| Gridmentés után nézetváltás | 600 ms késleltetett `__edit` válasz alatti váltás, mentés utáni ismételt kártya/tábla váltás | PASS |
| Dupla kattintás szövegkijelölés nélkül | Sorszám dupla kattintás: rekordablak megnyílik, `getSelection().toString()` üres | PASS |
| Kártyarendezés | Toolbar-dropdown SQL-rendezési kérése, aktív sorrend és visszaváltás/reload | PASS |
| Layout dupla kattintásra reset | Tényleges egérhúzás és dupla kattintás mindkét tengelyen, 260 px induló méret visszaáll | PASS |
| Tartalomhoz illeszkedő ablakok | Formgomb/adatcikk alatti térköz <40 px; 390×420 viewporton ablak ≤396 px és mindkét szélen ≥12 px | PASS |

Védett szintetikus Chromium: `playwright.grid-edit.config.cjs` **2/2 PASS**;
`layout-resizer.spec.cjs`, `list-presentation.spec.cjs`, `mobile-grid.spec.cjs`,
`workspace.spec.cjs` **9/9 PASS**, három téma és élő frissítés mellett.
A gridfixture futásonként külön, kijelölt scratch-almappát használ; a régi
futások adatállománya nem befolyásolja a következő próbát.
TypeScript typecheck/build, PHP `grid-edit.php` és `validation.php` PASS.
Használat: [kártyaszerkesztés és méretezés](workspaces.md#kártyaszerkesztés-rendezés-és-kompakt-ablakok).
