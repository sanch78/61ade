# Beépített felhasználóadmin

Állapot: **A1 és A2 részszelet megvalósítva és agent által ellenőrizve**, 2026-10-21; felhasználói elfogadás még nincs. Terv és további részszeletek: [adminmodul első szelet](admin-module-plan.md). Követelmények: R5, R6 ([termékirány](product-direction.md)); döntések: [FB-0038](feedback.md#fb-0038--fiókéletciklus-döntések-az-első-adminszelethez).

## Cél és hatókör

A VAPA saját felhasználóadminja az alkalmazás meglévő fióktáblája fölött. A keret adja a nézetet, a műveleteket, a jogosultságot, az auditot, az ideiglenes jelszót és a kötelező jelszócserét. Az alkalmazás csak az identity mappinget, a beszúráskori alapértékeket és az ACL-jogosultságokat adja meg.

Megvalósítva: lista és szűrés; létrehozás (teljes név, e-mail), amely generált ideiglenes jelszót ad; név és e-mail módosítása; tiltás és visszaengedés; új ideiglenes jelszó; kötelező jelszócsere az első belépéskor. A bejelentkezési azonosító az e-mail-cím.

A2: szerepkörök, szerepkör-tagságok, szerepkör- és egyedi jogosultságok a definíciókból képzett katalógus alapján; védett szerepkör, utolsó aktív tag és saját tagság védelme; első admin explicit telepítőlépéssel. Részletek: [Szerepkörök és jogosultságok](#szerepkörök-és-jogosultságok-a2).

Még nincs: API-kulcsok (A3), naplónézet (A4), e-mailes jelszó-helyreállítás (A5), az e-mailes megerősítés kapcsolója az adminnézetben.

## Előfeltételek

- PHP 8.4+, PDO; a `Schema::install` explicit futtatása (új tábla: `vapa_account_state`). HTTP-kérés nem futtat DDL-t.
- A fióktáblában van egyedi e-mail-, név- és jelszóoszlop; az oszlopnevek kisbetűs SQL-azonosítók.
- Egyedi hash-formátum (`identity.password_verifier`) esetén kötelező az `admin.password_encoder` binding is, különben az új jelszó nem lenne ellenőrizhető.
- Az adminműveleteket ACL-szabályok engedik; nincs admin bypass.

## Alkalmazás

JSON-alkalmazásban az `admin` szekció kapcsolja be; az identity mapping `username_column` értéke az e-mail-oszlop:

```json
{
    "identity": {"table": "accounts", "id_column": "id", "username_column": "email", "password_column": "password_hash", "name_column": "display_name"},
    "admin": {
        "description": "Beépített felhasználóadmin.",
        "group": "Adminisztráció",
        "create_defaults": {"active": 1},
        "temporary_password_hours": 72
    }
}
```

| Kulcs | Jelentés |
| --- | --- |
| `group`, `users_title` | Menücsoport és nézetcím (alapértelmezés: „Adminisztráció”, „Felhasználók”). |
| `create` | `false`, ha a fióktábla nem enged beszúrást: a létrehozás nincs regisztrálva, a meglévő fiókok kezelhetők. |
| `create_defaults` | A fióktábla további kötelező oszlopainak értéke beszúráskor (string vagy egész). Identity-oszlop nem adható meg. |
| `password_encoder` | Név szerint regisztrált `(string $password): string` closure az alkalmazás hash-formátumához. |
| `temporary_password_hours` | Az ideiglenes jelszó élettartama (1–720, alapértelmezés 72). |

PHP API (a demó így használja, [application.php](../examples/demo-app/application.php)):

```php
$accounts = new Accounts($workspace, 'accounts', 'id', 'email', 'display_name', 'password_hash', createDefaults: ['active' => 1]);
$accounts->register($workspace->registry);
$identities = $accounts->identities(new SqlIdentityProvider($workspace->db, 'accounts', 'id', 'email', 'password_hash', 'display_name'));
// ApplicationDefinition(..., identities: $identities, workspace: $workspace, accounts: $accounts)
```

Jogosultság (példa, az alkalmazás auditált migrációjában): `vapa_users` erőforrás, műveletek `list`, `get`, `create`, `update`, `deactivate`, `reactivate`, `temporary_password`, csatorna `ui`. API-hozzáférés külön `api` szabályt és token-scope-ot igényel.

## Elvárt működés

- **Létrehozás:** az e-mail kisbetűsítve, szóközök nélkül, egyediként tárolódik. A VAPA 20 karakteres ideiglenes jelszót generál, amely egyszer jelenik meg az adminnak, és 72 óráig érvényes. A naplóba csak mezőnevek kerülnek, jelszó soha.
- **Első belépés:** helyes ideiglenes jelszó (és bekapcsolt e-mailes megerősítés esetén a kód) után nincs session, menü, munkaterület, API vagy megjegyzett belépés, csak a „Jelszócsere” ablak. Az új jelszó 12–128 karakter, megerősítéssel, és nem egyezhet az ideiglenes jelszóval. Siker után az összes korábbi session és token visszavonódik, és létrejön a teljes session. A cserére 10 perc áll rendelkezésre.
- **Lejárt ideiglenes jelszó:** a belépés elutasított; az admin új ideiglenes jelszót ad.
- **Tiltás:** azonnal visszavonja a fiók sessionjeit, megjegyzett belépéseit és API-tokenjeit. A saját fiók nem tiltható le; ismételt tiltás vagy visszaengedés 409. A tiltás a fogyasztó saját `allowed` feltétele mellett, attól függetlenül érvényes.
- **E-mail módosítása:** visszavonja a fiók minden sessionjét és tokenjét; saját e-mail módosításakor új belépés szükséges.
- **Új ideiglenes jelszó:** másik fióknak adható, a saját fióknak nem.
- A „Tiltva” és „Jelszócsere szükséges” oszlop csak olvasható; állapotváltozás után a régi revízióval küldött mentés 409.

## Ellenőrzés

- `php8.4 tests/shell/admin.php`: default deny, létrehozás és normalizálás, egyedi és formátumhibás e-mail, csak olvasható állapot, kötelező csere és szabályai, lejárat, tiltás és visszaengedés, session-/tokenvisszavonás, e-mail-módosítás, API-csatorna és scope, konfigurációs hibák, audit jelszó nélkül.
- `npm run test:browser -- tests/shell/admin.spec.cjs`: a demóban felhasználó létrehozása, az ideiglenes jelszó egyszeri megjelenése, kötelező csere hibás és helyes jelszóval, a régi jelszó elutasítása, tiltott fiók belépésének elutasítása.
- Kézi próba: `tools/serve-demo.sh`, belépés `demo@example.test` / `vapa-demo`, Adminisztráció → Felhasználók.

## Szerepkörök és jogosultságok (A2)

Nézetek az „Adminisztráció” csoportban: **Szerepkörök**, **Szerepkör-tagságok**, **Szerepkör-jogosultságok**, **Egyedi jogosultságok**. ACL-erőforrások: `vapa_roles`, `vapa_memberships`, `vapa_role_rules`, `vapa_user_rules` (a két szabálynézet ugyanazt a `vapa_rules` táblát kezeli, alanytípus szerint szétválasztva).

- **Katalógus:** az erőforrás- és műveletválasztó a regisztrált definíciókból (`Vapa\Admin\Catalogue`) épül. Mentéskor a szerver ellenőrzi, hogy a művelet az adott erőforráson és csatornán létezik-e, a mezőszintű szabály mezője ismert-e, és az objektumazonosító pontosan a „Konkrét objektum” hatókörnél van-e megadva. **A katalógus semmilyen jogot nem ad**; új definíció után csak a kifejezetten felvett szabály enged.
- **Árva szabály:** a definícióból eltűnt erőforrás vagy művelet szabálya „— nincs a katalógusban” jelzéssel látszik, jogot nem ad (a végrehajtó ismeretlen műveletet nem futtat), és kézzel törölhető.
- **Szerepkör:** a `role_key` létrehozás után nem módosítható; tagokkal vagy szabályokkal rendelkező szerepkör nem törölhető; a védett szerepkör sosem törölhető.
- **Védett szerepkör** (`admin.protected_role`, alapértelmezés `admin`): adminerőforrásokra vonatkozó szabályai a felületen nem módosíthatók és nem törölhetők; legalább egy aktív (nem tiltott, a fogyasztó szerint is engedélyezett) tagja mindig marad, ezt a tagság törlése és a fióktiltás is ugyanabban a tranzakcióban ellenőrzi (MySQL alatt sorzárral); a saját védett tagság nem vonható vissza.
- **Tiltó szabály** VAPA-adminerőforrásra a felületen nem hozható létre (kizárási kockázat); ott a jog hiánya az alapértelmezett tiltás.

**Első admin:** explicit, idempotens és auditált telepítőlépés, nem HTTP-kérés mellékhatása:

```php
Vapa\Admin\Permissions::grantAdministration($db, $registry, $actorId); // védett szerepkör, tagság, admin UI-szabályok
```

Csak az adminerőforrások `ui` műveleteire ad engedélyt; üzleti erőforrásra és API-ra nem. A demó a `setup-workspace.php` végén hívja az 1-es fiókra.

Ellenőrzés: `php8.4 tests/shell/permissions.php` (katalógus, nincs automatikus jog, idempotens első admin, kulcs- és törlésszabályok, katalógus-validáció, tagságon át érvényes szerepkörszabály, egyedi mezőtiltás, árva szabály, védett szabály, utolsó aktív tag, audit értékek nélkül); `admin.spec.cjs`: szerepkör, tagság és szabály felvétele a felületen, majd az új tag eléri a Jegyzetek modult, az adminisztrációt nem.

## Korlátok

- Csak SQLite-on ellenőrzött; a MySQL-ágak megmaradtak, de MySQL-próba nem történt.
- Az e-mail-formátum ellenőrzése szintaktikai; a cím létezését semmi nem igazolja.
- Meglévő, nem e-mail felhasználónevű fogyasztónál az átállás a fogyasztói integráció feladata; a keret ebben nem migrál adatot.
- Az ideiglenes jelszót az admin juttatja el a felhasználóhoz; meghívó link nincs.
- A tagság- és szabályválasztók legfeljebb 2000 elemet listáznak (a `Lookup` korlátja).
- Az egyedi szabály alanya és objektumazonosítója nem keres: nagy fióklistához kereshető választó kell.
- Jogosultságváltozás után a már megnyitott felület menüje újratöltésig a régi; a szerver minden kérésnél frissen dönt.
