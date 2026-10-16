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
{"mode":"dynamic","limit":100,"filters":{"title":"minta"},"cursor":null}
```

Válasz: `items`, `previous`, `next`. A kurzor a következő/előző adatsáv kulcshatárát és irányát adja; nem jogosultság és nem SQL. Az adatforrás mindig újra alkalmazza az actor/csatorna ACL-jét. Egyszerre legfeljebb 200 rekord kérhető; a böngésző 100-as sávokat kér, és legfeljebb 600 rekordot tart. A megjelenítést a Standard Grid virtualizálja. A teljes adatállományhoz nincs böngészőbeli placeholder tömb és nincs kötelező COUNT lekérdezés. Ez gördülő adatsáv, nem a teljes táblát pozicionáló, rekordösszeggel arányos scrollbar.

A szűrőmezők a regisztrált, nem titkos skalármezőkből jönnek; szövegnél contains, számnál/selectnél egyenlőség. A `%` és `_` literális karakter, nem kliens által megadott wildcard. Részlegesen tiltott olvashatóságú mezőt konzervatívan nem lehet szűrésre használni. A `textarea` nem alapszűrő. Összetett/ágazati filterhez előbb a keret típusos query-szerződését kell bővíteni. Kliensoldali részlistasort nincs; a sorrend a szerver kulcs szerinti sorrendje.

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
