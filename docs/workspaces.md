# Munkaterület és élő listák

Állapot: implementálva és szintetikus integrációban ellenőrizve, 2026-10-16. Kapcsolódó elvárás: FB-0006.

A VAPA view külön filter, grid és opcionális beágyazott form területből álló, validált layoutfát deklarál. A területek fejléce, mérete, összecsukhatósága és sorrendje konfigurálható. Alap: bal oldali Szűrés és jobb oldali Találatok, overlay szerkesztő. A formMode panel esetén külön formterületet kell deklarálni. A singleton nézet közvetlen readonly/szerkeszthető adatlap, grid nélkül.

A lista kulcs szerinti kurzoros lekérdezést használ, nem mély SQL OFFSET-et. A DHTMLX grid megjelenítéséhez egy korlátozott, két irányba mozgó adatsáv töltődik; görgetéskor a keret előtölt és elengedi a távoli sorokat. Nincs szükség az összes rekord vagy placeholder böngészőbe töltésére. Az ACL és az engedélyezett mezőszűrők minden lekérdezés részei; a rejtett mezőn keresés is tiltott.

A Suite Standard 9.3.12 csomag nem tartalmazza a dokumentált PRO LazyDataProxy gridintegrációt. A VAPA a Standard Grid publikus scroll/data/selection API-jaira épített, saját adatforrás-adaptert ad; nem állítja, hogy PRO funkciót hív. A megjelenítés, layout és form továbbra is DHTMLX. Natív PRO adapter külön regisztrálható később.

A listák automatikus frissítése projektszintű LiveConfig alapján polling vagy WebSocket. Mindkét csatorna ugyanazt a jogosultságellenőrzött, korlátozott ablakot figyeli. Csak a megváltozott sorok kerülnek át a megjelenítésbe; a nyitott form nem írható felül háttérfrissítéssel. A megfigyelő a kereten kívüli adatbázisírásokat is érzékeli. A WebSocket szerver saját, loopback szolgáltatás; rövid, sessionhöz kötött jegy kell a feliratkozáshoz, és a jogokat minden ellenőrzés újraértékeli. A böngésző hálózata megszakadáskor újracsatlakozik, háttérben lévő lap nem tart fenn aktív figyelőt.

A nézet nem hoz létre külön állapotsávot vagy állandó „Élő kapcsolat” feliratot. A felhasználó és az alkalmazás/verzió adatai az [egyetlen shell-sávban](shell.md#egységes-alsó-információs-sáv) szerepelnek; ez nem kapcsolja ki a háttérfrissítést.

## Konfiguráció

```php
use Vapa\Feature\ViewLayout;
$source->register($registry, 'Elemek', layout: new ViewLayout(
    formMode: 'panel',
    tree: ['cols' => [
        ['id'=>'filter', 'header'=>'Szűrés', 'width'=>300, 'resizable'=>true, 'collapsable'=>true],
        ['rows'=>[
            ['id'=>'grid', 'header'=>'Találatok'],
            ['id'=>'form', 'header'=>'Szerkesztés', 'height'=>300, 'collapsed'=>true, 'collapsable'=>true],
        ]],
    ]],
));
```

Az alapértelmezett `new ViewLayout()` bal oldali filtert, jobb oldali gridet és overlay formot ad. Panel módban a `form` levél kötelező. Sorok/oszlopok tetszőleges fastruktúrában állíthatók össze a validált opciókból; header, width/height, minWidth/minHeight, resizable, collapsable és collapsed használható. Futtatható JavaScript/HTML vagy tetszőleges vendoropció nem kerülhet a layoutdefinícióba.

A singleton view közvetlen űrlap: a `get` által engedett adatot mutatja; a konkrét objektumhoz kapott `__form(update)` mezők szerkeszthetők. A többi readonly. A jelszó és egyéb külön művelet a saját action-formját nyitja. A lista toolbar Hozzáadás és Módosítás gombjai a jogosultságokból jönnek; a tényleges formbeküldő gomb Mentés. A kijelölt sor `_actions` képességei tiltják/engedik a sorműveleteket.

## Listaprotokoll

Ugyanaz a regisztrált `list` művelet fogadja az új `values` objektumot:

```json
{"mode":"dynamic","limit":100,"filters":{"title":"minta"},"sort":{"field":"title","direction":"asc"},"cursor":null}
```

Válasz: `items`, `previous`, `next`. A kurzor a következő/előző adatsáv kulcshatárát és irányát adja; nem jogosultság és nem SQL. Az adatforrás mindig újra alkalmazza az actor/csatorna ACL-jét. Egyszerre legfeljebb 200 rekord kérhető; a böngésző 100-as sávokat kér, és legfeljebb 600 rekordot tart. A megjelenítést a Standard Grid virtualizálja. A teljes adatállományhoz nincs böngészőbeli placeholder tömb és sorszám nélkül nincs kötelező COUNT lekérdezés. Sorszámozott középső ablaknál a szerver az első sor előtti jogosult/szűrt rekordok számát számolja meg, majd a betöltött sorokhoz folyamatos `_number` értéket ad; az első ablakhoz nincs külön COUNT. Ez gördülő adatsáv, nem a teljes táblát pozicionáló, rekordösszeggel arányos scrollbar.

A szűrőmezők a regisztrált, nem titkos skalármezőkből jönnek; szövegnél contains, számnál/selectnél egyenlőség. A `%` és `_` literális karakter, nem kliens által megadott wildcard. Részlegesen tiltott olvashatóságú mezőt konzervatívan nem lehet szűrésre használni. A `textarea` nem alapszűrő. Összetett/ágazati filterhez előbb a keret típusos query-szerződését kell bővíteni. A fejléc kattintása szerveroldali növekvő/csökkenő rendezést kér. Nincs kliensoldali részlistasort.

### Rendezés és smart rendering

A `sort` opcionális, alakja `{"field":"title","direction":"asc"}`; a másik irány `desc`. Az alap a publikus `id` csökkenő sorrendje. A teljes jogosult és szűrt találati halmazt az SQL rendezi. Egy mező rendezhető egyszerre; az azonos értékek közt az egyedi kulcs ugyanabban az irányban dönt, a NULL mindkét irányban a végére kerül. Számok numerikusan, szövegek az adatbázis kollációja szerint, select/checkbox mezők a tárolt érték szerint rendeződnek. Titkos, textarea, ismeretlen és részlegesen tiltott mezőre rendezni sem lehet; a `sortable` nézetmetaadat az engedélyezett publikus mezőneveket adja. Külön fogyasztói frontend vagy sort-endpoint nem kell. Gyakran rendezett nagy táblán a fogyasztó adatbázisindexet ad a rendezési mezőre és kulcsra; a keret nem módosít adatbázissémát.

A fejléc `↑` / `↓` jelzi az irányt, és `aria-sort` teszi elérhetővé. A `column.editable: true` oszlop fejlécén `✎` látható, tooltipje leírja a szerkesztés módját; az editor és checkbox akadálymentes neve változatlan. A jelzés az oszlop képessége, a konkrét sor/mező ACL-je továbbra is korlátozhatja a szerkesztést.

A kurzor a rendezési mezőt, irányt, határértéket és egyedi kulcsot is hordozza. Más rendezéshez tartozó kurzor elutasításra kerül. A sor `_position` technikai metaadata teszi lehetővé, hogy a kliens a 600-as gördülő ablak levágásakor is helyes visszafelé kurzort és élő ablakhatárt készítsen, Unicode értékekkel is. A `watch` a `sort` mellett középső ablaknál az első sor `first` azonosítóját és az abból képzett `anchor` kurzort kapja. Az első ablak követi az új élre kerülő sorokat; középső ablak a rendezett határhoz kötött marad. Új rendezés az elejéről tölt. A rendezési mező helyben módosítása után a szerver újrarendezi a listát.

A smart rendering két rétege már működik: a Standard DHTMLX Grid virtualizálja a megjelenítést, a VAPA 100-as adatcsomagokkal, maximum 600 betöltött sorral korlátozza a memóriát. Ez nem a régi ADE teljes rekordszám szerinti görgetősávja: tetszőleges sorszámra ugrás és teljes táblaméretű scrollbar nincs. A rendezés és szűrés ettől függetlenül a teljes SQL-találathalmazra érvényes.

Ellenőrzés: `tests/shell/sorting.php` (1501 rekord, szöveg/szám/ID mindkét irányban, ismétlődő és NULL értékek, teljes bejárás, visszagörgetés, rendezett live ablak, ACL/injection); `playwright.sorting.config.cjs` és `tests/fixtures/grid-sort` (1801 rekord, fejlécjel, teljes rendezés, szűrés, kétirányú görgetés, maximum 600 adat és 100-nál kevesebb renderelt sor).

A korábbi üres `values` + offset API átmeneti kompatibilitásként megmarad, de az új frontend nem használja. A régi lapozó- és frissítőgombok megszűntek.

## Élő adat konfigurálása és futtatása

```php
new ApplicationDefinition(/* alkalmazásdefiníció */, live: new Vapa\Live\LiveConfig(
    transport: 'websocket', // vagy poll
    endpoint: 'wss://admin.example.test/live',
    interval: 2000,
));
```

Polling módban csak HTTP kell. `__watch` a látható, maximum 600 soros ablak hashét ellenőrzi. Változatlan állapotnál csak verzióválasz jön; a kliens nem rajzol újra.

WebSocket módban a VAPA `tools/live-server.mjs` folyamatát kell indítani Node 18+ és PHP 8.4+ alatt. Függőség: lockfile-ban rögzített `ws` (jelenleg 8.22.0). Környezet: `VAPA_AUTOLOAD_FILE`, `VAPA_APPLICATION_FILE`, `VAPA_PHP`, `VAPA_LIVE_ORIGIN`, opcionálisan `VAPA_LIVE_PORT` (8088), `VAPA_LIVE_INTERVAL` (2000). A proxy HTTPS/WSS útvonalról loopbackre továbbít. Az `Origin` pontos ellenőrzése és a sessionhöz kötött, privát runtime-ban tárolt ticket kötelező; a jegy nem visz ki session ID-t a böngészőnek.

A szerver megfigyelője a látható adatsávokat ellenőrzi időközönként az adatbázisban, így külső írás is felismerhető. A böngésző felé csak változáskor küld WebSocket csomagot: módosult sorok, törölt azonosítók és aktuális sorrend. A kapcsolati heartbeat, az újracsatlakozás és a régi szűrőhöz tartozó késői csomagok eldobása a keret feladata. Elrejtett böngészőfülnél a figyelő leáll, visszatéréskor automatikusan feliratkozik. Nincs csendes átváltás pollingra, ha a projekt WebSocketet választott.

A hitelesítés, lejárat, fiókállapot, session-visszavonás és ACL minden megfigyelésnél új ellenőrzést kap. A megfigyelés technikai olvasás: a feliratkozás auditált, a változatlan tickek nem termelnek üzleti auditot. A valódi módosítás továbbra is a közös tranzakciós műveletvégrehajtón naplózódik. Nyitott formot a háttéradat nem ír felül; konfliktus esetén a beküldés 409-cel védett.

## Ellenőrzés

`tests/shell/lists.php`: 5000 rekord, scope, kétirányú kurzor, teljes bejárás duplikáció nélkül, filter-injection/mezőtiltás, külső írás és törlés. `tests/shell/workspace.spec.cjs`: valódi overlay form, polling, ismételt nézetváltás. A fogyasztó szintetikus integrációja külön ellenőrzi a WebSocketes módosítást és jogvisszavonást, a filtert, a beágyazott form megőrzését, a profilformot és a 600 soros memóriakorlátot.

A WebSocket kliens a sorrendlistán kívüli cache-bejegyzéseket is elengedi, így az újracsatlakozás sem növeli korlátlanul a memóriát. A leállított/régi socket késői eseményeit figyelmen kívül hagyja.

## Layoutszintek és keretek

A többpaneles nézet deklarált layoutfája közvetlenül a munkaterület DHTMLX `space` layoutjának gyökere. Nincs körülötte újabb egycellás, keretezett `space` burkoló: a panelek saját keretet és egyetlen 12 px külső térközt kapnak. Az alkalmazás shellje és a grid toolbar/adatterületének belső layoutja külön feladatot lát el; ezek nem adnak újabb keretezett panelburkolót. A singleton adatlap saját, címzett panelje megmarad. A fogyasztó által szándékosan deklarált további sor/oszlopágakat a keret megtartja.

Ellenőrzés: `workspace.spec.cjs` az alapnézet egyetlen `space` gyökerét, a filter/grid panelek 12 px eltolását, a CRUD-ot és az ismételt nézetváltást vizsgálja. Kapcsolódó döntés: FB-0015.

## Panelméretező megjelenítése

A Suite 9.3.12 `space` layoutja 12 px panelközt hagy, de a gyári CSS a hárompontos fogantyút az előző cella szegélyére teszi. A VAPA `admin.css` a `#vapa-application` alatti `dhx_layout-space` resizerikonjára célzott CSS-felülírást ad: vízszintes panelosztásnál `right: -6px`, függőleges panelosztásnál `bottom: -6px`. Így az ikon a panelköz közepére kerül; a natív DHTMLX méretezési eseménykezelés működik tovább.

A fogyasztónak nincs külön teendője: a VAPA assetet kell publikálnia. A gyári Suite CSS-fájl változatlan marad; a VAPA szabályai utána töltődnek be. A `line` és `wide` layoutot, valamint a gridoszlop- és ablakméretezőt ez nem érinti. A javítás a Suite 9.3.12 gyári 12 px panelközére épül; vendorfrissítéskor a célzott tesztet futtatni kell.

Ellenőrzés: `tests/shell/layout-resizer.spec.cjs` önálló szintetikus DHTMLX layouton méri mindkét tengely fogantyújának középpontját Light/Skyblue/Dark témában, és tényleges egérhúzással ellenőrzi a panel átméretezését. Kapcsolódó visszajelzés: FB-0013.

## Kártyák, rekordadatok, sorszám és jelölés

A kártyanézet natív DHTMLX DataView: a rendelkezésre álló panelszélesség szerint
340 px célméretű oszlopokat használ; mobilon egy oszlopra vált. A kártya minden
regisztrált, a `list` válaszában olvasható mezőt megjelenít, a gridből kihagyott
mezőket is. A technikai revízió/ACL-metaadat és a titkos mező nem adatlapmező.

Minden listában alapértelmezett a `#` sorszámoszlop. A sorszám a teljes jogosult, szűrt és rendezett találathalmazon belüli
pozíciót mutatja, az adatablak továbbgörgetésekor is folyamatos. Nem adatbázis-ID;
rendezés, szűrés vagy közben beszúrt/törölt sor változtathatja a pozíciót. Dupla kattintása a friss `get`
műveleten át DHTMLX rekordablakot nyit. Az „Adatok” toolbar-gomb ugyanazt adja,
akkor is, ha a sorszámot kikapcsoljuk. Kártyán dupla kattintás is ezt nyitja.
Ablakban minden regisztrált, `get` szerint olvasható mező látható; a szerver
objektum- és mezőjogai érvényesek. A módosító űrlap külön művelet marad.

JSON `view` beállítások: `row_numbers: false` kikapcsolja a sorszámot;
`selection: true` bekapcsolja a sorjelölő checkboxokat (alapból false).
PHP: `$registry->view(..., rowNumbers: false, selection: true)`.
A jelölés elkülönül az aktív/szerkesztett sortól, megmarad tábla/kártya váltáskor
és azonos sorok élő frissítésekor. Az adatablakból kikerülő sor jelölése megszűnik.

A toolbar és a nézetváltó belső layoutja `type: none`; a külső Találatok panel
adja az egyetlen keretet. A toolbar a saját sorának magasságát tölti ki,
a görgethető tartalom nem rajzolhat bele. A szűrő alaphelyzetbe állítása és a
belépési megerősítés másodlagos műveletei natív másodlagos flat gombok.

## Tömeges műveletek és ikonok

A regisztrált Action opcionális `icon` DHTMLX ikon-osztályt fogad, például
`dxi dxi-check`; JSON action ugyanilyen `icon` kulcsot használ. Az alapműveletek,
a nézetváltás, szűrés és mentés keretbeli alapikont kapnak.

Tömeges művelet csak kifejezett `Action(..., bulk: true)` / JSON `bulk: true`
esetén és bekapcsolt sorjelölés mellett jelenik meg. A jelenlegi fogyasztói
üzleti modulok ezt még nem kapcsolják be. Példa egy fogyasztó által regisztrált,
objektumonként végrehajtott „Lezárás” művelet: adj hozzá `bulk: true`-t és
`icon: 'dxi dxi-check'`-et, majd a view-hoz `selection: true`-t. A handler,
a resolver és a jogkiosztás ugyanaz, mint az egyedi műveletnél.

A „… — jelöltek” gomb az engedélyezett sorokra közös űrlapot nyit;
eltérő mezőjogoknál elutasítja az összevont űrlapot. 1–100 sor kezelhető.
A `__bulk` UI-csatornán `operation` és `items: [{id, values}]` bemenetet fogad.
Minden sor saját revízióval, validációval, objektum-/mező-ACL-lel, tranzakcióval
és audittal fut a közös Executorban. Titkos/jelszómezős és collection action
nem lehet bulk. API bulk nem támogatott. A soronkénti eredmény részleges sikert
is jelenthet; a már sikeres sorok nem gördülnek vissza más sor hibája miatt.
A kliens összesítést és a sikertelen azonosítókhoz hibaüzenetet mutat;
automatikus újrapróbálás nincs. Ez nem atomikus tömeges tranzakció és nem export.

Ellenőrzés: `tests/shell/list-presentation.php` a jogosultságot, titkos mezőt,
nézetmetaadatot, bulk opt-int, limitet, duplikációt és részleges sikert vizsgálja;
`tests/shell/list-presentation.spec.cjs` a kártyaoszlopokat, mobilváltást,
rekordablakot, ikonokat, jelölést, tömeges beküldést és három téma geometriai
határait ellenőrzi. Kapcsolódó visszajelzés: FB-0019.

## Nézetválasztás és fejlécjelzések

A lista-toolbar utolsó eleme a jobbra igazított DHTMLX nézet-dropdown.
Felirata az aktuális megjelenítés: „Nézet: Táblázat” vagy „Nézet: Kártyák”.
A menüben Táblázat és Kártyák választható; a váltás megőrzi a kijelölt sort.
Mobilon a kártyamegjelenítés kötelező, ezt a tiltott dropdown felirata is mutatja;
az asztali preferencia a szélesség visszaállításakor ismét érvényesül.
Singleton adatlapon nincs nézet-dropdown. Ez az FB-0019 két külön nézetgombját
az FB-0020 pontosítása szerint váltja fel; fogyasztói konfiguráció nem kell.

A szerkeszthetőség ceruzája a mezőcím mellett marad, a hover-rendezés ikonja
külön, 24 px széles helyet kap a fejléc jobb szélén. Aktív rendezéskor egyetlen
irányjelzés jelenik meg a VAPA SQL-sorrendje alapján. A mezőcím szükség esetén
ellipszissel rövidül, a tooltip és az `aria-sort` megmarad. A szabály minden
VAPA-témára érvényes. Ellenőrzés: `list-presentation.spec.cjs` és
`mobile-grid.spec.cjs`; a [befejezett minősítés](list-presentation-validation.md) a teljes követelménylistát ellenőrzi.

A listaprotokoll `numbered` logikai értéke alapértelmezetten true; false esetén
a pozíciószámítás és az `_number` metaadat is kimarad. A frontend a
`view.row_numbers` szerint kéri, az élő megfigyelésben is. A PHP rendezésteszt
mindkét irányú lapozásnál és középső élő ablaknál ellenőrzi a teljes rangot.

A mobil szűrőablak külön natív Form-példányt használ; alkalmazáskor az értékek
a panel szűrőjébe is átkerülnek. Bezáráskor nincs widgetmozgatás a layoutok
között. A Szűrés/Alaphelyzet gombpár egy sorban, 8 px távolsággal jelenik meg.
