# VAPA alkalmazásalap — login, menü, munkaterület

A kötelező alapirány: [VAPA = ADE v2](decisions/0002-framework-first.md). A keret biztosítja az általános működést és a DHTMLX vezérlőket; a fogyasztó alkalmazásdefiníciót és üzleti illesztést ad. Az első képesség DHTMLX Window/Form bejelentkezés, Menu, Toolbar és Layout, üres munkaterülettel. Nincs külön alkalmazási frontend, dashboard vagy helyőrző oldal.

## Keretszerződés és használat

A PHP fogyasztó belépési pontja Composer-autoload után kizárólag a VAPA HTTP belépési pontját hívja:

```php
Vapa\Infrastructure\HttpEntrypoint::run(static fn() => require '../application.php');
```

Az `application.php` egy `Vapa\Shell\ApplicationDefinition` objektumot ad vissza. Kötelező argumentumok: `title`, `identities` (IdentityProvider), `menu` (Menu), `runtime` (privát írható könyvtár). Opcionális: egyedi `sessionName`, `cookiePath`. Az alapindítás, hibaválasz, session, CSRF, belépés/kilépés, metadata és UI előállítása a keret feladata.

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

Ebben a mérföldkőben a levélelemek tiltott, még meg nem valósított modulok. Üzleti művelet, hash-route és művi tartalomoldal nincs. A kijelentkezést a VAPA adja működő menüműveletként. Új modulnál előbb a szükséges VAPA feature-/action-/policy-képességet kell megvalósítani, utána az üzleti modult bekötni.

## DHTMLX megjelenítés és csomagolás

A VAPA `AdminShell` adapter kezeli a Layout, Toolbar, Menu, Window és Form teljes életciklusát, a bejelentkezési mezők validálását és billentyűzetes beküldését. A hibajelzést DHTMLX Alert jeleníti meg. A megjelenés a DHTMLX saját stílusa; a keret CSS-e csak a teljes ablak méretezését tartalmazza. A fogyasztónak nincs saját shell HTML/CSS/JS rétege.

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

Ez az első keretképesség. A teljes M1/M2/M4, Symfony hosting, feature/action registry, több szervezet, objektum-/mezőszintű policy, CRUD, PHP 8.5 és production FPM továbbra is hátravan. A mostani menüjogosultság nem helyettesíti a későbbi üzleti endpointok backend policy-ját.
