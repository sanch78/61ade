# Beépített adminmodul — első szelet terve

Állapot: **jóváhagyott terv**, 2026-10-21. Az A1 és A2 megvalósítva és agent által ellenőrizve ([használat](admin.md)); A3–A5 még nem. Implementáció nem történt. A bejelentkezési azonosító, az API-kulcs-kezelés és a beszúrás nélküli fióktár kérdése eldöntve (FB-0038 kiegészítés). Követelmények: [R5, R6, R9, R10](product-direction.md#1-elfogadott-termékkövetelmények); döntések: [FB-0038](feedback.md#fb-0038--fiókéletciklus-döntések-az-első-adminszelethez). A 4. fejezet alapértékei javaslatok, nem elfogadott követelmények.

## 1. Cél és hatókör

Az SQLite demóban működő, a VAPA saját eszközeiből épülő user-, szerepkör/ACL-, API-kulcs- és naplóadmin, amelyet bármely alkalmazás konfigurációval kap meg.

**Része:** fióklista, létrehozás ideiglenes jelszóval, név/e-mail módosítás, tiltás és visszaengedés, új ideiglenes jelszó; kötelező jelszócsere első belépéskor; e-mailes jelszó-helyreállítás; szerepkörök, tagságok, szabályok a definíciókból generált katalógus alapján; API-kulcs kiadás és visszavonás; csak olvasható naplónézet; utolsó admin és saját fiók védelme; hu/en/de felirat, mindhárom téma.

**Nem része:** meghívó link, végleges törlés/anonimizálás, Google/Facebook-belépés, PostgreSQL- és JSON-fájltároló, naplómegőrzés és külső logsink, többszervezetes izoláció, felhasználói önkiszolgáló API-kulcs.

## 2. Kiindulási állapot (forrás alapján)

| Terület | Megfigyelés | Forrás |
| --- | --- | --- |
| Identitás | Az `IdentityProvider` csak olvas (`authenticate`, `find`); fiók létrehozására, módosítására vagy tiltására nincs keretszerződés. A tiltást a fogyasztó `allowed` closure-je dönti el. | `Shell/IdentityProvider.php`, `Shell/SqlIdentityProvider.php` |
| Jelszó | `Passwords::change` kezeli a saját és admin általi cserét (12–128 karakter, megerősítés, munkamenet- és tokenvisszavonás); a hash-kodek a fogyasztóé. Kötelező csere állapota nincs. | `Access/Passwords.php` |
| Session-visszavonás | `Workspace::revokeSessions` növeli a hitelesítési verziót és visszavonja az összes tokent. | `Feature/Workspace.php` |
| Token | `Tokens::issue/revoke` közvetlen SQL; önmagában nem auditál, és nincs kezelőfelület. API-csatornán a scope csak szűkít (`Executor`). | `Access/Tokens.php`, `Feature/Executor.php` |
| ACL | `vapa_roles`, `vapa_memberships`, `vapa_rules`; default deny, explicit deny nyer. Katalógus-lekérdezés nincs, a `Registry::all()` viszont minden regisztrált műveletet visszaad. | `Access/Acl.php`, `Access/Schema.php`, `Feature/Registry.php` |
| Napló | `vapa_audit` kategória nélkül; belépés, kijelentkezés, CSRF, e-mailkód és minden végrehajtott művelet már rögzítve. | `Audit/Journal.php`, `Shell/Application.php` |
| Belépési folyamat | Pre-auth állapotgép (`pendingLogin`) már létezik az e-mailes kódhoz; ide illeszthető a kötelező jelszócsere is. | `Shell/Application.php` |
| Levél | Symfony Mailer `Delivery` és `LoginMessage` lokalizált sablonnal; a reset levél ugyanerre épülhet. | `Mail/*`, [hitelesítés](authentication.md) |
| Demó | A fiókok **memóriabeli** SQLite-ban vannak (minden kérésnél újra létrejönnek), a munkaterület külön SQLite-fájlban. Admin általi módosítás így nem maradna meg. | `examples/demo-app/application.php`, `workspace.php` |
| Előzmény | A fogyasztói useradmin mintája a `members.json` fixture (ACL-védett `security` action). | `tests/fixtures/authentication/members.json` |

## 3. Keretbővítések

Minden írás a közös `Executor`-on fut (ACL → validáció → tranzakció → audit). Nincs admin bypass: az adminmodul műveletei közönséges, katalógusba kerülő ACL-erőforrások.

### E1 — Írható fióktár-szerződés

Új `AccountStore` szerződés, a meglévő identity mapping bővítésével (opcionális `create_defaults` a fogyasztói tábla kötelező egyéb oszlopaihoz). **A bejelentkezési azonosító minden alkalmazásban az e-mail-cím** (eldöntve): a `username_column` az e-mail oszlopra mutat, az érték kisbetűsítve, szóközök nélkül tárolt és egyedi. E-mail-módosítás a fiók összes sessionjét, megjegyzett belépését és tokenjét visszavonja. Külön felhasználónevet használó meglévő fogyasztónál az átállás a fogyasztói integráció feladata. SQL-implementáció a `SqlIdentityProvider` mappingjéből. A VAPA-állapot külön, VAPA-tulajdonú `vapa_account_state` táblába kerül (`actor_id`, `disabled`, `must_change_password`, `temporary_expires_at`), így a fogyasztói sémát nem kell módosítani. Belépni csak akkor lehet, ha a fogyasztó `allowed` feltétele **és** a VAPA-állapot is engedi. Ha a fogyasztói tábla nem enged beszúrást, a létrehozás képessége kifejezetten letiltott, a meglévő fiókok továbbra is kezelhetők (eldöntve); a felület ezt jelzi, nem hibázik csendben.

### E2 — Adminmodul VAPA-definíciókból

A VAPA-tulajdonú táblák (szerepkör, tagság, szabály, token, napló) erőforrásai a csomagban szállított modul-JSON-ban vannak, a meglévő `WorkspaceConfiguration` compilerrel és név szerint regisztrált keretbindingokkal. A fióktábla erőforrása a fogyasztó identity mappingjéből épül, regisztrált keretbindinggal; nincs JSON-ba írt SQL-tábla vagy kód. Bekapcsolás az alkalmazás-JSON új `admin` szekciójával; menücsoport: „Adminisztráció”.

| Nézet | Műveletek |
| --- | --- |
| Felhasználók | lista, létrehozás (teljes név = `displayName`, e-mail mint bejelentkezési azonosító), név/e-mail módosítás, tiltás, visszaengedés, új ideiglenes jelszó, e-mailes megerősítés kapcsolója (meglévő `Settings`) |
| Szerepkörök | lista, létrehozás, átnevezés (stabil `role_key`), tagok hozzáadása/eltávolítása |
| Jogosultságok | szabálylista, létrehozás, módosítás, törlés; erőforrás/művelet/mező választó a katalógusból; árva szabály jelölése |
| API-kulcsok | lista (címke, tulajdonos, scope, lejárat, állapot; hash és titok soha), kiadás felhasználónak, visszavonás |
| Napló | csak olvasható lista szűréssel (idő, actor, erőforrás, művelet, eredmény, kategória) |

### E3 — Kötelező jelszócsere

Sikeres jelszavas (és ha be van kapcsolva, e-mailes) hitelesítés után, ha `must_change_password` aktív, a session új `pendingPasswordChange` állapotba kerül: nincs menü, munkaterület, API vagy WebSocket-ticket. A DHTMLX-űrlap a `Passwords` szabályait használja. Siker után a jelző törlődik, az összes korábbi session és token visszavonódik, és a teljes session létrejön. Lejárt ideiglenes jelszóval nem lehet belépni. Kötelező csere alatt álló fiók API-tokenje nem fogadható el.

### E4 — E-mailes jelszó-helyreállítás

A loginablakban „Elfelejtett jelszó” link: az e-mail-cím megadása után mindig ugyanaz a válasz. Létező, nem tiltott fiókhoz egyszer használható, lejáró link megy (`vapa_password_resets`: selector, verifier-hash, actor, hitelesítési verzió, lejárat, felhasználás). A link új jelszó megadását kéri. Siker után: jelszócsere, kötelező-csere jelző törlése, minden session, megjegyzett belépés és token visszavonása, audit. Ha nincs levélküldés konfigurálva, a funkció rejtett és letiltott. A levél lokalizált, és a `LoginMessage` szövegfelülírási rendjét követi.

### E5 — ACL-katalógus

Csak olvasható katalógus a `Registry`-ből: erőforrás, művelet, felirat, csatornák, írás jelző, mezők. Ez szolgál a szabályszerkesztő választékául és az API-scope-ok forrásaként. A katalógus **nem ad jogot**. A definícióból eltűnt erőforrásra mutató szabály árvaként jelenik meg, és csak kézzel törölhető. Az első admin explicit, auditált telepítő-/setup-lépéssel jön létre (szerepkör + szabályok), nem automatikusan.

### E6 — API-kulcsok auditált kezelése

**API-kulcsot csak megfelelő ACL-jogú admin kezel** (eldöntve): kiad bármely aktív felhasználónak, minden kulcsot lát (titok nélkül), visszavon. Közönséges felhasználó nem lát és nem kezel kulcsot; önkiszolgálás csak későbbi, külön jogként. A kiadás és a visszavonás regisztrált művelet (`Executor`), így auditált. Scope csak a katalógus `api` csatornás műveleteiből választható. Lejárat 1–90 nap (meglévő korlát). A titok egyszer jelenik meg. A tiltás és a jelszócsere minden tokent visszavon (meglévő `revokeSessions`).

### E7 — Naplónézet és kategória

Csak olvasható lista a `vapa_audit` fölött, szerveroldali szűréssel és rendezéssel, szerkesztő vagy törlő művelet nélkül. Kategória az első szeletben olvasáskor képezve: `session`, `authentication`, `transport` és az admin-erőforrások **biztonsági**, minden más **audit**. Üzemeltetési események még nincsenek a táblában. Külön kategóriaoszlop sémamigrációval későbbi döntés.

### E8 — Védelmek

- Saját fiók nem tiltható le, saját védett szerepkör-tagság nem vonható vissza.
- A konfigurált védett szerepkörnek (`admin.protected_role`) mindig marad legalább egy aktív tagja; a tiltást, tagságeltávolítást és szabálytörlést ugyanabban a tranzakcióban ellenőrizzük, MySQL alatt sorzárral.
- A védett szerepkör szabályai csak ACL-kezelési joggal módosíthatók; az üzleti szabály ACL-engedéllyel sem kerülhető meg.

### E9 — Lokalizáció és téma

Minden felirat, hibaüzenet és levél keretkatalógusban hu/en/de nyelven. Kizárólag natív DHTMLX-vezérlők, így Skyblue/Világos/Éjjeli témában ellenőrizhetők.

## 4. Alapértékek (jóváhagyva 2026-10-21)

| Kérdés | Javaslat |
| --- | --- |
| Ideiglenes jelszó forrása | A VAPA generálja (20 karakter), egyszer jelenik meg az adminnak; kézi megadás nincs. |
| Ideiglenes jelszó élettartama | 72 óra; utána új ideiglenes jelszó kell. |
| Reset link élettartama | 30 perc, egyszer használható; új kérés érvényteleníti az előzőt. |
| Reset rátakorlát | 3 kérés / 15 perc / fiók és 10 kérés / 15 perc / IP; a válasz ettől függetlenül egységes. |
| Reset után | Nincs automatikus belépés; normál belépés, a bekapcsolt e-mailes megerősítéssel együtt. |
| Védett szerepkör | `role_key: "admin"`, konfigurálható. |
| Naplókategória | Olvasáskor képezve (E7); sémamigráció nélkül. |

## 5. Tárolás

Az első szelet SQLite-on ellenőrzött. A meglévő MySQL-ágak (`FOR UPDATE`, InnoDB) megmaradnak, de MySQL-igazolás nem része a szeletnek. Az új táblák (`vapa_account_state`, `vapa_password_resets`) az explicit `Schema::install` részei; HTTP-kérés nem futtat DDL-t. PostgreSQL- és JSON-fájltámogatást nem ígérünk ([tárolási határ](product-direction.md#3-tárolási-határ-és-szükséges-garanciák)). A demó fiókjai a munkaterület SQLite-fájljába költöznek, a setup szkript hozza létre őket.

## 6. Új naplóesemények

| Esemény | Kategória | Útvonal |
| --- | --- | --- |
| Fiók létrehozása, módosítása, tiltása, visszaengedése, új ideiglenes jelszó | biztonsági | `Executor` |
| Szerepkör, tagság és szabály módosítása | biztonsági | `Executor` |
| API-kulcs kiadása és visszavonása | biztonsági | `Executor` |
| Kötelező jelszócsere sikere/elutasítása | biztonsági | pre-auth, `Journal` |
| Reset kérés (eredménytől független rögzítés), reset befejezése vagy elutasítása | biztonsági | pre-auth, `Journal` |
| Naplónézet megnyitása | audit | meglévő `subscribe` |

Jelszó, ideiglenes jelszó, reset link, token és e-mail-cím értéke nem kerül a naplóba; csak mezőnevek és eredmény.

## 7. Elfogadási feltételek és tesztek

- **PHP szerződésteszt** (`tests/shell/admin.php`): default deny minden admin-műveletre; jogosult admin létrehoz, módosít, tilt; a tiltott fiók sessionje, megjegyzett belépése és tokenje azonnal érvénytelen; ideiglenes jelszó lejárata; kötelező csere előtt nincs munkaterület és API; reset: egységes válasz, egyszer használható, lejár, rátakorlát, tiltott fióknak nem megy levél; utolsó admin és saját fiók védelme; árva szabály nem ad jogot; a katalógus nem ad jogot; API-scope csak szűkít; minden művelet auditált érzékeny érték nélkül; rollback hibánál.
- **Böngészőteszt** a védett runnerrel: a demó Adminisztráció menüje, felhasználó létrehozása → első belépés → kötelező csere; reset levél egy szintetikus SMTP-catcherrel (a meglévő auth fixture mintájára); a három nyelv és a három téma füstpróbája.
- **UI/API paritás:** ugyanaz a művelet UI-ból és tokennel is ellenőrizve, tiltott esetekkel.
- **Kitchen sink:** a demó „Adminisztráció” csoportja szintetikus fiókokkal (`demo`, `viewer`, `blocked`), ugyanazon a konfigurációs felületen, amelyet egy alkalmazás használ.
- **Dokumentáció:** új `docs/admin.md` használati útmutató (konfiguráció, első admin, korlátok, ellenőrzés), hivatkozás a [usage](usage.md)-ből, feedback-bejegyzés, az [authentication](authentication.md) frissítése.

## 8. Részszeletek

Mindegyik önállóan tesztelhető és dokumentálható; a sorrend függőséget jelöl.

1. **A1 — Fióktár és felhasználók:** E1, Felhasználók nézet, tiltás, ideiglenes jelszó, E3, demó-fiókok áttelepítése. **Kész** ([használat](admin.md)). Eltérés a tervtől: az E1 fióktár-szerződés az `Accounts` szolgáltatás és a `SqlResource` csak olvasható mezőivel valósult meg, külön interfész nélkül; az e-mailes megerősítés kapcsolója nem került az A1-be.
2. **A2 — Szerepkörök és jogosultságok:** E5, Szerepkörök és Jogosultságok nézet, E8, első admin setup. **Kész** ([használat](admin.md#szerepkörök-és-jogosultságok-a2)). Pontosítások: a szabályok két nézetben (szerepkör / egyedi) kezelhetők; adminerőforrásra tiltó szabály a felületen nem hozható létre; az első admin csak UI-jogot kap.
3. **A3 — API-kulcsok:** E6.
4. **A4 — Naplónézet:** E7.
5. **A5 — Jelszó-helyreállítás:** E4.

## 9. Felhasználói döntést igénylő kérdések

Nincs nyitott kérdés az első szelethez.

Eldöntve (FB-0038 kiegészítés): a 4. fejezet alapértékei; bejelentkezési azonosító az e-mail; API-kulcsot csak admin kezel, minden kulcsot lát titok nélkül; beszúrást nem engedő fióktárnál a létrehozás letiltott, a meglévő fiókok kezelhetők.
