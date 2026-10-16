# Első bejelentkezési és navigációs keret

Állapot: 2026-10-16. A PHP 8.4+ shell és TypeScript/DHTMLX Sidebar működik; ez fejlesztői előnézet, nem a teljes M1/M2/M4 átadása. Symfony hosting, feature-registry, szervezeti/objektum-/mezőpolicy és CRUD még nincs.

## Előfeltételek és build

Node 18.19.1 / npm 9.2.0 és külön PHP 8.4.26 CLI környezetben ellenőrizve. A host alapértelmezett PHP-ját ne cseréld le. A shellnek a core session, filter, hash és random képességek szükségesek; az alkalmazási IdentityProvider további extensionöket kérhet.

```bash
npm ci
npm run typecheck
npm run build
```

A lockfile TypeScript 5.9.3, esbuild 0.25.12 és DHTMLX Suite Standard 9.3.12 verziókat rögzít. A build a `packages/frontend/dist/admin.js` és `admin.css` fájlokat állítja elő, a fontokat beágyazza és elhagyja a vendor opcionális CDN ikonfont importját. Nincs runtime CDN vagy Node-szerver. A teljes Suite bundle egyelőre bekerül; komponensenkénti optimalizálás későbbi munka. A GPL-2.0-only vendor licence nem változik; a VAPA saját licence és a kiadási modell továbbra is nyitott.

A PHP csomag Composer path repositoryval fogyasztható. A `0.1.0` itt lokális fejlesztői csomagazonosító, nem publikált release. A csomagmanifestek és lockfile-ok még fejlesztői checkoutokra hivatkoznak; a kiadási artifact és registry munkája hátravan.

## Alkalmazási integráció

Az alkalmazás implementálja a `Vapa\Shell\IdentityProvider` két metódusát:

- `authenticate(string $username, string $password): ?Identity`: a fiók és jelszó ellenőrzése; sikertelenségkor null. A jelszót nem tárolhatja/logolhatja.
- `find(string $id): ?Identity`: minden hitelesített HTTP-kéréskor friss fiókadat és jogosultság; törölt/tiltott fióknál null.

A `new Identity('synthetic-1', 'Demo User', ['canViewLibrary' => true])` harmadik argumentuma backend-only alkalmazási adat. A keret nem adja át a böngészőnek. Ez nem policy-motor, nem szervezeti jogosultsági szerződés.

Az alkalmazás `new Application($provider, $navigationClosure, $config)` után `run()`-t hív egy saját public belépési pontból. A closure csak engedélyezett csoportokat és menüelemeket adjon vissza, például:

```php
$navigation = static fn(Identity $actor): array => $actor->attributes['canViewLibrary'] ? [
    ['id' => 'library', 'label' => 'Könyvtár', 'description' => 'Szintetikus példa.',
     'items' => [['id' => 'documents', 'label' => 'Dokumentumok']]],
] : [];
```

Konfiguráció: `brand`, `title`, `headline`, `description`, `loginHint` szövegek; `runtime` kötelező privát, írható útvonal; opcionális egyedi `sessionName` és `cookiePath`. A runtime soha ne legyen public webroot. A `brand` jelenleg latin betűs név; az embléma első karaktere abból képződik. A közös feliratok magyarok, teljes lokalizáció még nincs.

A build két fájlját a fogyasztó public `assets/` könyvtárába kell másolni. Csak az alkalmazás public könyvtárát szolgáld ki; a PHP package, vendor és konfiguráció nem lehet webroot. A navigáció hash útvonalat használ: a csoportok alatti gombok kizárólag „előkészítés alatt” helyőrzőt nyitnak. Nincs üzleti adatlekérés vagy módosító endpoint.

## Viselkedés és biztonsági határ

- HTML login form natív required mezőkkel, autocomplete-tal és szerveroldali inputellenőrzéssel; a jelszó nincs visszatöltve.
- Elkülönített, HttpOnly/SameSite=Lax cookie, strict session ID, sikeres belépéskor és kilépéskor ID-csere, CSRF-védelem mindkét POST-on, 30 perc inaktivitási időkorlát.
- TLS esetén Secure cookie. TLS-termináló proxy esetén a hostingnak megbízhatóan kell átadnia a HTTPS állapotot; tetszőleges kliens forwarded headerét nem fogadjuk el.
- Öt sikertelen belépés/IP/60 másodperc után 429 és Retry-After; fájlzárral védett közös bucket a privát runtime alatt. Több processz ugyanazon runtime-ot használja. Több gépes elosztott limiter még nincs; az IP a közvetlen szerver REMOTE_ADDR értéke.
- A menü és az identitás attribútumai csak hitelesítés után, szerveroldali szűrésből származnak. A frontend csak menüazonosítót/címkét/leírást kap; a template escape-el és JSON_HEX opciókkal kódol.
- CSP, no-store, nosniff, same-origin referrer. A hash módosítása nem ad új jogosultságot. Új üzleti endpointnál külön backend policy kell; a menüszűrés önmagában nem védelem.
- Aktív böngészőlap még nem kap élő jogosultságváltozási értesítést; új HTTP-kéréskor frissül, bfcache visszatéréskor újratölt. A shellben egyelőre nincs üzleti adat.

## Ellenőrzés

A fogyasztó izolált tesztjei a konkrét IdentityProviderrel ellenőrzik a jelszót, fióktiltást és menüjogosultságot. A shellt Chromiumban szintetikus fiókokkal ellenőriztük: login, sessioncsere, metadata-szűrés, navigáció, reload, kijelentkezés, CSRF, IP limiter új session mellett és 390 px mobilnézet. A frontend typecheck/build és PHP 8.4 lint sikeres. PHP 8.5, teljes ACL, Symfony hosting és production FPM telepítés még nincs ellenőrizve.
