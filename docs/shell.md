# VAPA alkalmazásalap — login, menü, munkaterület

A kötelező alapirány: [VAPA = ADE v2](decisions/0002-framework-first.md). A keret biztosítja az általános működést és a DHTMLX vezérlőket; a fogyasztó alkalmazásdefiníciót és üzleti illesztést ad. Az első képesség DHTMLX Window/Form bejelentkezés, Menu, Toolbar és Layout, üres munkaterülettel. Nincs külön alkalmazási frontend, dashboard vagy helyőrző oldal. A későbbi, már működő feature/workspace és ACL réteg használata: [ACL és műveletek](access-and-actions.md).

## Keretszerződés és használat

A PHP fogyasztó belépési pontja Composer-autoload után kizárólag a VAPA HTTP belépési pontját hívja:

```php
Vapa\Infrastructure\HttpEntrypoint::run(static fn() => require '../application.php');
```

Az `application.php` egy `Vapa\Shell\ApplicationDefinition` objektumot ad vissza. Kötelező argumentumok: `title`, `identities` (IdentityProvider), `menu` (Menu), `runtime` (privát írható könyvtár). Opcionális: egyedi `sessionName`, `cookiePath`, valamint `version` (string, alapból üres). A JSON megfelelője `application.version`; például `"title": "Minta admin", "version": "0.1.0"`. Az alapindítás, hibaválasz, session, CSRF, belépés/kilépés, metadata és UI előállítása a keret feladata.

Az `IdentityProvider` `authenticate(username, password)` és `find(id)` metódusokat ad; siker esetén `Identity(id, displayName, attributes)` az eredmény. A backend attribútumokat nem serializáljuk. A `find` minden hitelesített HTTP-kéréskor újraellenőrzi a fiókot és a jogokat.

SQL-es fióktárhoz a keret `SqlIdentityProvider` képessége explicit táblanév- és oszlophozzárendelést fogad. Csak a deklarált oszlopokat olvassa, paraméterkötéssel; az azonosítókat ellenőrzi. A jelszóhash nem kerülhet attribútumba. Az alapellenőrzés `password_verify`; az alkalmazás konkrét meglévő jelszóformátumához és fiókállapotához szerveroldali `passwordVerifier`/`allowed` callback adható. Ez üzleti illesztés, nem saját alkalmazási loginfolyamat. A szolgáltató csak olvas.

A `Database::fromEnvironment(file, prefix, readOnly)` biztosítja a PDO MySQL kapcsolatot a `PREFIX_HOST/PORT/NAME/CHARSET/USER/PASSWORD` konfigurációból. Az environment felülírja a fájlt. `readOnly: true` esetén a kapcsolat tranzakciói read-only beállítással indulnak. A demo és az egységtesztek izolált PDO SQLite-ot használnak.

## Deklarált menü

```php
use Vapa\Navigation\{Menu, MenuItem};
use Vapa\Shell\Identity;

$menu = new Menu([
    new MenuItem('library', 'Nyilvántartás', [
        new MenuItem('documents', 'Dokumentumok'),
    ], visible: static fn(Identity $actor) => $actor->attributes['canViewLibrary']),
]);
```

A VAPA validálja az egész fa egyedi, stabil azonosítóit; a `visible` üzleti szabályt szerveroldalon futtatja, és az üres ágakat elhagyja. A böngésző kizárólag `id`, `label`, `items`, `disabled` adatokat kap. Callback, SQL és fiókattribútum nem mehet ki. A fogyasztó menüszerkezetét változatlanul rendereli rekurzív DHTMLX Menu formában.

A történeti shell MenuItem levélelemek tiltottak. Az implementált modulok a Feature Registry view-definícióiból kerülnek a navigációba. Üzleti művelet, hash-route és művi tartalomoldal nincs. A kijelentkezést a VAPA adja működő menüműveletként. Új modulnál előbb a szükséges VAPA feature-/action-/policy-képességet kell megvalósítani, utána az üzleti modult bekötni.

## DHTMLX megjelenítés és csomagolás

A VAPA `AdminShell` adapter kezeli a Layout, Toolbar, Menu, Window és Form teljes életciklusát, a bejelentkezési mezők validálását és billentyűzetes beküldését. A hibajelzést DHTMLX Alert jeleníti meg. A megjelenítést a DHTMLX vezérlői adják; a keret CSS-e a teljes ablak méretezését és a dokumentált Suite-témaváltozókat tartalmazza. 768 px alatti munkaterületen a keret a menüágakat egy DHTMLX „Menü” alá rendezi; a kijelentkezés is ugyanebbe a lenyíló menübe kerül. Átméretezéskor visszaáll a felső menüsor. A fogyasztónak nincs saját shell HTML/CSS/JS rétege.

PHP 8.4+; ellenőrzött helyi runtime: PHP 8.4.26. Node 18.19.1, npm 9.2.0, TypeScript 5.9.3, esbuild 0.25.12, DHTMLX Suite Standard 9.3.12, Playwright 1.58.2. A dependencyket lockfile rögzíti. A Suite ikonfontjai a `tools/vendor-assets.json` SHA-256 értékeivel ellenőrizve, `codex/tmp/dhx-icons` cache-ből kerülnek a buildbe. Az első build internetet igényel; eltérő asset-hash leállítja a buildet. A fontok beágyazottak, a böngésző nem kér CDN-erőforrást.

```bash
npm ci --cache codex/tmp/npm-cache
npm run typecheck
npm run build
```

A fogyasztó a `@vapa/admin` csomag `vapa-assets <public-assets-directory>` parancsával teszi ki a buildet. A package tartalmazza a publikáló eszközt; nincs fogyasztói asset-összeállító implementáció. A PHP belépési pont mellett `assets/admin.js` és `assets/admin.css` szükséges.

A `0.1.0` lokális fejlesztői csomagazonosító, nem publikált release. A mostani alkalmazásdefiníció felváltja az első, elutasított shell API-t; annak `brand/headline/description/loginHint` mezői és navigációs closure API-ja megszűntek. A korábbi UI nem marad támogatott alternatíva. Licenc- és végleges kiadási modell továbbra is külön nyitott mérföldkő.

## Önálló keretdemó és ellenőrzés

Az `examples/demo-app` saját Composer-fogyasztó, kizárólag szintetikus SQLite memóriabeli fiókokkal és menüvel. Más alkalmazástól nem importál forráskódot, konfigurációt vagy adatot.

```bash
# Composer és PHP 8.4+ a saját fejlesztői környezetből:
cd examples/demo-app && composer install && cd ../..
npm run demo:assets
php8.4 tests/shell/contracts.php
VAPA_PHP=/path/to/php84 tools/serve-demo.sh
# Másik terminálban:
TMPDIR="$PWD/codex/tmp" npm run test:browser
```

A `VAPA_PHP` lehet olyan CLI-wrapper is, amely a szükséges extensionöket betölti. A demóhoz PDO SQLite szükséges. Elérés: `http://127.0.0.1:8086/`; szintetikus belépések: `demo` / `vapa-demo`, `viewer` / `vapa-demo`. A `blocked` fiók tiltott. Ezek kizárólag a külön demóban léteznek. A demo nem production belépési mód.

A `tests/shell/contracts.php` a SQL provider, azonosítóvalidálás, fióktiltás, jelszóadat kizárása, menüjogok, üres ágak, duplikált ID és tiltott modul szerződését ellenőrzi. A saját böngészős tesztek a tényleges DHTMLX ablak/űrlap/menü működését, Enteres beküldést, hibás belépést, nézői jogokat, kijelentkezést és telefonméretet vizsgálják. Artifactok: `codex/tmp/playwright-results`. Ellenőrzés 2026-10-16: PHP szerződéstesztek, lint, TypeScript typecheck/build és mind a 4 Chromium keretteszt sikeres.

## Biztonsági és fejlesztési határ

Session: strict ID, HttpOnly/SameSite=Lax, HTTPS-en Secure; sikeres belépéskor/kilépéskor ID-csere, CSRF mindkét POST-on, 30 perc inaktivitási időkorlát. Öt hibás belépés/IP/60 másodperc után 429, privát, fájlzárolt közös limiter. Nincs jelszó/session-adat a menüben vagy logban. A webroot csak a fogyasztó public könyvtára lehet.

Proxy esetén a `HttpEntrypoint` explicit `trustLocalProxy: true` mellett kizárólag loopback kérésből fogadja el az `X-VAPA-HTTPS` és `X-VAPA-Client-IP` fejléceket. A proxy köteles ezeket a saját kapcsolati adataival felülírni. A runtime és cookie path az alkalmazás telepítési konfigurációja.

A shellhez azóta elkészült az első Feature Registry, SQL CRUD, objektum-/mező-ACL és auditképesség, lásd a fenti kapcsolódó leírást. A teljes M1/M2/M4, Symfony hosting, több szervezet, PHP 8.5 és production FPM továbbra is hátravan. A mostani menüjogosultság nem helyettesíti a későbbi üzleti endpointok backend policy-ját.

## Megjelenési mód

A menüsor jobb oldalán DHTMLX Toolbar választó adja a Skyblue (`skyblue`), Default (`light`) és Éjjeli (`dark`) témát. Mentett választás nélkül Skyblue az alapértelmezett. Érvényes korábbi választás megmarad; ismeretlen érték Skyblue-ra esik vissza. A `vapa-theme` localStorage kulcs a böngésző helyi preferenciája, nem jogosultsági vagy profiladat.

A Suite 9.3.12 nem szállítja a régi Suite Skyblue skinjét. A VAPA Skyblue ezért a [dokumentált custom-theme API](https://docs.dhtmlx.com/suite/themes/custom_theme/) alapján, a DHTMLX CSS-változóival definiált világoskék paletta. A komponensek Suite 9 komponensek maradnak: ez nem a régi képes/gradient skin teljes másolata. A `setTheme` a dokumentum gyökerére állítja a témát, így a menü, toolbar, ablak, form és grid azonos témát kap. Nincs legacy CSS-betöltés vagy alkalmazási skinréteg. Ellenőrzés: `browser.spec.cjs` Skyblue alapérték, tényleges toolbar-szín, Éjjeli/Skyblue váltás és újratöltés utáni megőrzés.

Munkaterület-váltáskor a VAPA leválasztja és felszabadítja az előző DHTMLX layoutot, kivárja az újrarajzolást, majd csatolja az új nézetet. A gyors egymás utáni váltások közül csak a legutolsó kerül fel. A `workspace.spec.cjs` ismételt nézetváltást is ellenőriz.

## Egységes alsó információs sáv

A felső sor közvetlenül a menü és a témaválasztó; nincs külön alkalmazásnév-fejléc. Egyetlen, 32 px magas DHTMLX Toolbar zárja az oldalt (a shell a Toolbar intrinsic magasságát a befogadó cellához méretezi, így a felirat nem vágódik le): balra a hitelesített identitás `displayName` értéke, jobbra a konfigurált alkalmazásnév és `version`. Bejelentkezés előtt balra „Nincs bejelentkezve” látható. A verzió az alkalmazás kiadásazonosítója; a keret nem következtet rá a saját csomagverziójából. Elhagyott verziónál csak az alkalmazásnév jelenik meg. Nincs workspace-enként külön kapcsolati/állapotsáv; az élő adatkövetés tovább működik. A műveleti hibák DHTMLX Alertben, a szerkesztés közben észlelt külső módosítás egyszeri DHTMLX Message-ben jelenik meg.

Ellenőrzés: `browser.spec.cjs` a felső menü és alsó felhasználó/alkalmazás/verzió elhelyezését; `workspace.spec.cjs` a külön állapotsáv hiányát és a háttérben tovább működő pollingot ellenőrzi. Kapcsolódó döntés: FB-0011.

## URL és helyi felületbeállítások

A VAPA menüből megnyitott funkció címe például `/admin/#feature=items`.
A fragmentben a registry `resource` azonosítója szerepel URL-kódolva; a shell
frissítéskor, bejelentkezés után és Vissza/Előre navigációnál az aktuális,
jogosultságszűrt `views` listából nyitja meg. Az üres vagy ismeretlen cím üres
munkaterületet ad. A navigáció nem hajt végre adatíró műveletet; rekordhoz vagy
nyitott szerkesztőhöz külön mélylink jelenleg nincs.

Nincs fogyasztói JavaScript vagy külön konfiguráció. A szerver bootstrap
`userId` mezője a hitelesített identitás azonosítója. A böngésző
`vapa-ui:1:` kezdetű localStorage kulcsa az alkalmazás pathname-ját, a user ID-t
és a resource-t különíti el. Tárolt értékek: oszlopszélesség, sikeresen
betöltött rendezés, kézzel választott táblázat/kártya mód, deklarált
panelméretek és szűrőpanel összecsukása. A szerkesztőpanel automatikus
nyitása/zárása nem tartós állapot. A mobil kényszerített kártyanézete nem írja
felül a kézi választást. Űrlapérték, rekordadat, szűrőérték és secret nem
kerül ebbe a tárolóba.

A visszaállítás mindig az aktuális definíciót követi: törölt oszlop vagy
rendezési mező figyelmen kívül marad, méretkorlátok érvényesülnek. Sérült vagy
letiltott localStorage mellett a felület alapértékekkel használható. Ez az
adott böngésző preferenciája; nincs szerveroldali vagy gépek közötti szinkron.
Visszaállítás alaphelyzetbe: az adott `vapa-ui:1:` kulcs törlése a böngésző
webhelytárából. Kijelentkezés nem törli a preferenciát, másik felhasználó
viszont külön kulcsot kap.

Ellenőrzés: `node tests/shell/ui-preferences.mjs` (elkülönítés, definícióváltozás,
méretkorlát, sérült/tiltott tár); védett szintetikus böngészőteszt:
`npm run test:browser -- --config playwright.preferences.config.cjs`, a
`VAPA_TMP_DIR` és `VAPA_PLAYWRIGHT_MODULE` környezeti szerződésével.
Kapcsolódó visszajelzés: FB-0021.

## Kompakt hitelesítési ablakok és menüikonok

A login és az e-mailes megerősítés natív Window/Form párost használ. Az ablak
magasságát a kirajzolt gombok alja határozza meg, 24 px alsó hellyel; a
viewport mérete felső korlát. Újramérés történik méretváltás és validáció
után is. Az újraméretezés nem aktiválja újra az ablakot: a hibaüzenet
modalrétege fölül marad. A megerősítés három azonos szélességű natív gombja
között 8 px hely van. A másodlagos műveletek is valódi gombok.

A menü minden szintje kap ikont: a statikus elemek alapértelmezett mappát,
a feature-ök konfigurálható nézetikont, a csoportok nyitott mappát, a kompakt
Menü és a kijelentkezés saját ikont. A kompakt töréspont az ikonok helyével
is számol. Fogyasztói megadás: [listafejléc és rekordszám](workspaces.md#listafejléc-és-rekordszám).

## Elkülönülő főmenügombok

A natív DHTMLX főmenüpontok mindhárom témában állandó keretet, témához illő
hátteret és 6 px térközt kapnak. Skyblue esetén a kék színátmenet, világos
felső él és árnyék klasszikus Windows-gombhatást ad; rámutatáskor arany,
nyitott/benyomott állapotban süllyesztett kék felület látszik. A billentyűzetes
fókusz külön körvonalat kap. Az almenük megőrzik a natív listaelrendezést. A konfigurált elválasztók
(például a kijelentkezés előtt) 1 px széles, halvány függőleges vonallal
jelennek meg; a vonal a téma keretszínét követi.
Fogyasztói konfiguráció nem szükséges; újra kell buildelni és publikálni az
asseteket. A shell assetverziója `v=11`. A kompakt menü töréspontja a keret
és térköz többlethelyével is számol. Ellenőrzés: `browser.spec.cjs`, három téma,
nyitott almenü és telefonméret.


## Kompakt ablakfejléc és teljes mobilmenü

A natív DHTMLX Window fejléce témától függetlenül 40 px magas, 16 px címfelirattal
és 32 px bezárógombbal. A gyári 28 px felső és 20 px alsó fejléctérköz helyett
4 px függőleges, 12 px vízszintes toolbar-padding érvényes. A tartalomhoz
illeszkedő ablakmérés továbbra is a tényleges fejlécet veszi figyelembe.

Kompakt főmenüben minden navigációs ág és a Kijelentkezés is a „Menü” gomb alá
kerül, köztük a natív elválasztóval. Asztali szélességre visszatérve az eredeti
felső menüsor áll vissza; az ACL és a kijelentkezés POST-folyamata változatlan.
A fogyasztóban nincs külön konfiguráció. FB-0028.
