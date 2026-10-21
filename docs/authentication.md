# E-mailes belépési megerősítés és megjegyzett belépés

A teljes folyamat VAPA-képesség: DHTMLX loginablak, e-mailkód form, megerősítés, session, megjegyzett belépés, levélformázás és audit. A fogyasztó a fiókforrást, e-mail-attribútumot, levélküldési környezetet, szöveget és az adminisztrációhoz tartozó ACL-t deklarálja.

## Konfiguráció

Az alkalmazás JSON-jának opcionális `authentication` szekciója kapcsolja be a képességet. Ha a szolgáltatás konfigurálva van, minden felhasználónál alapból bekapcsolt az e-mailes megerősítés; hiányzó felhasználói beállítás is bekapcsoltat jelent.

```json
{
    "authentication": {
        "description": "Belépés e-mailes megerősítéssel, opcionális 90 napos megjegyzéssel.",
        "email_attribute": "email",
        "default_email_confirmation": true,
        "remember_days": 90,
        "code_lifetime_seconds": 600,
        "mail": {
            "dsn": {"$env": "EXAMPLE_MAILER_DSN"},
            "from_address": {"$env": "EXAMPLE_MAIL_FROM"},
            "from_name": "Example admin",
            "texts": {"subject": "{application} – belépési kód", "intro": "Írd be a kódot a belépési ablakban."}
        }
    }
}
```

Az `identity.attribute_columns` tartalmazza az `email_attribute` nevét. A SMTP DSN és a feladó env-ben legyen; publikus SMTP-n például `smtp://user:password@smtp.example.test:587?require_tls=true`. A DSN-ben a felhasználónév/jelszó speciális karaktereit URL-kódolni kell. A keret Symfony Mailer `^7.4` és MIME komponenst használ: [hivatalos transport és TLS leírás](https://symfony.com/doc/7.4/mailer.html). A SMTP beállítás soha nem kerül böngészőmetaadatba vagy naplózott hibaüzenetbe.

A levél HTML és plain-text változatot is tartalmaz. Felülírható szövegek: `subject`, `heading`, `greeting`, `intro`, `code_label`, `expiry`, `footer`. Helyettesítők: `{application}`, `{name}`, `{minutes}`. A HTML-megjelenítés minden üzleti szöveget escape-el. Dinamikus felülbírálás: `mail.text_overrides_binding`, az alkalmazás explicit bindingtérképében regisztrált `(Identity): array` closure, ugyanazokkal a szövegkulcsokkal. Prioritás: keretalap → JSON `texts` → PHP-ból adott felülbírálás. Sem levélsablont, sem küldési/auth flow-t nem kell a fogyasztóban újraírni.

A közvetlen PHP API: `LoginSecurity(Workspace, IdentityProvider, Delivery, LoginMessage, runtime, emailAttribute, ...)`, majd `ApplicationDefinition.authentication`. Egyedi mailprovider a keret `Delivery` interfészéhez illeszthető; a hitelesítési folyamatot továbbra is a VAPA futtatja.

## Belépési folyamat

Helyes jelszó után nincs belépett session, menü, API/UI-adat vagy WebSocket-ticket, amíg a hatjegyű e-mail-kód megerősítése nem sikerül. A kód 10 percig érvényes, egyszer használható és az adott böngésző belépési kísérletéhez kötött. A privát runtime-ban tárolt kulccsal HMAC-elt kód kerül az adatbázisba. A kiadáskor mentett e-mail lenyomata és a hitelesítési verzió váltáskor újra ellenőrzött.

Öt hibás kód tízperces felhasználói ablakban korlátozza a további próbálkozást. Új kód legkorábban egy perc után küldhető; tíz perc alatt legfeljebb öt küldés kezdeményezhető felhasználónként. Az új kód az ugyanabban a böngészőben kért előzőt érvényteleníti. A korlátok nem nullázhatók a böngésző sessionjének törlésével. A jelszóoldali külön IP-limit is megmarad. Minden belépési POST CSRF-védett.

Hibás vagy hiányzó e-mail-címnél, lejáratnál, tiltott fióknál vagy küldési hibánál nincs automatikus megkerülés. A cím javítása vagy a megerősítés kikapcsolása az arra jogosult admin feladata. A képesség bevezetése előtt ellenőrizni kell a kézbesítési környezetet és a felhasználói e-mail-adatok teljességét.

## Felhasználónkénti kapcsoló

A `Settings.get(actorId)` hiányzó rekord esetén is `email_confirmation: 1` értéket ad az alapbeállítással. A `Settings.update(Context, Workspace, actorId, enabled)` a közös végrehajtón belül regisztrált, ACL-ellenőrzött műveletből hívandó; változtatáskor a fiók korábbi VAPA sessionjei és megjegyzett belépései érvénytelenednek.

Az e-mailes megerősítés kapcsolójának adminfelülete jelenleg a fogyasztóé; a VAPA [felhasználóadminja](admin.md) (A1) még nem tartalmazza. A kapcsolót az objektum főűrlapján célszerű deklarálni: [kapcsolt tárolás és checkbox](field-presentation.md). A mapping a settings táblájára mutat; az alkalmazás after_save hookja tényleges változáskor a VAPA `Workspace::revokeSessions` szolgáltatását hívja. Saját beállítás módosításakor `reauthenticate: true` válasz kér új belépést. A szintetikus [members.json](../tests/fixtures/authentication/members.json) a továbbra is támogatott külön `security` action API-ját példázza; ez nem kötelező UI-minta. A `form_values` binding kezdőértéket ad egy regisztrált action saját formjához; a `handler` a keretszolgáltatást hívja. A VAPA felhasználóadminja bekapcsolva kötelező jelszócserét is kér: a megerősített belépés után ideiglenes jelszónál a jelszócsere következik, és csak utána jön létre session vagy megjegyzett belépés ([felhasználóadmin](admin.md#elvárt-működés)).

## Bejelentkezve maradok

A checkbox nélkül csak normál session készül. Bekapcsolva, teljes sikeres hitelesítés után külön, véletlen 256 bites titkot tartalmazó HttpOnly/SameSite cookie jön létre. TLS kiszolgáláskor Secure, hosthoz kötött, az alkalmazás cookie-útvonalán érvényes; nem localStorage. A keret a szerveren csak a titok hashét tárolja, lejárata kiadástól számított **90 nap**, visszaállításkor nem tolódik ki.

Új böngészősessionben ez új VAPA sessiont állít vissza, és forgatja a megjegyzett titkot. Régi titok újrajátszása elutasított és az adott megjegyzés visszavont. Logout a jelenlegi megjegyzett belépést törli. Jelszóváltás, fióktiltás és hitelesítési beállítás változtatása a VAPA hitelesítési verzióján keresztül visszavonja az összes ilyen belépést. Az alkalmazás e-mail-cím változtatásakor is hívja a `Workspace.revokeSessions(actorId)` metódust.

A már meglévő, e-mailvédelmet megelőző sessionök nem használhatók az új képesség bevezetése után; új hitelesítés kell. A régi, VAPA-n kívüli rendszer sessionjei és közvetlen jelszóírásai nincsenek automatikusan összekapcsolva a VAPA verziójával; az integráló folyamatnak explicit visszavonást kell hívnia.

## Telepítés és ellenőrzés

PHP 8.4+, PDO és Symfony Mailer dependency. Az explicit `Schema.install` új táblái: `vapa_auth_settings`, `vapa_login_challenges`, `vapa_remembered_logins`. HTTP kérés nem futtat DDL-migrációt. A privát runtime/sessions/login és `authentication.key` nem lehet publikus vagy verziókezelt. Több példány esetén a sessiont és a privát kulcsot közösen kell kezelni. A lejárt challenge- és remember-rekordok rendszeres takarítása üzemeltetési feladat; nem tolja ki a lejáratot.

- `tests/shell/authentication.php`: default-on, per-user kapcsoló és ACL, téves/lejárt/másik böngészőhöz tartozó/újrajátszott kód, tartós próbálkozáskorlát, megjegyzett titok hash/forgatás/lejárat/visszavonás, érzékeny adat nélküli audit.
- `VAPA_PHP=/path/to/php npm run test:browser -- --project=auth`: elkülönített szintetikus SMTP-catcher + JSON-alkalmazás, a tényleges Symfony SMTP/MIME és natív DHTMLX UI. A teszt levelei csak `tmp/auth-fixture` alatt maradnak, nem valódi címzettekhez mennek.

A megközelítéshez használt források: [OWASP Authentication](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html), [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html). Az e-mailes megerősítés nem phishing-rezisztens hitelesítő; passkey/TOTP és külső identity provider (a tervezett Google/Facebook-belépés is) jelenleg nincs implementálva.
