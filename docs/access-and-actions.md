# ACL, műveletek és audit

Állapot: implementáció alatt, még nem telepített képesség.

## Tartós szerződés

Az identitás adatait külön kezeljük a jogosultságoktól. Az actor ember vagy szolgáltatás; szerepkörtagságot és közvetlen szabályt kaphat. Nincs admin bypass. A regisztrált erőforrás és művelet az engedélyezhető jogok katalógusa; ismeretlen jog nem adhat hozzáférést.

Egy szabály: alany (user/role), erőforrás, művelet, csatorna (ui/api), hatás (allow/deny), objektumhatókör (all/own/id), opcionális objektumazonosító, mező (teljes művelet vagy konkrét mező). A konkrét objektum tulajdonosát a backend adatszolgáltató állapítja meg. Az explicit tiltás nyer; egyező engedély hiányában tiltás van. Mezőengedély önmagában nem engedélyez műveletet. API-token scope csak szűkít, soha nem ad jogot. A web UI és API ugyanazon műveletvégrehajtón fut.

A szerepkörök és szabályok adatként kezelhetők a VAPA form/grid eszközeivel létrehozott alkalmazási felületen. A kernelnek nincs beégetett felhasználóadminja. A szabályok kezelése külön jog; a jogosultságváltozások auditáltak, a döntés minden kérésben friss. A beépített üzleti korlátot (például saját profil vagy tiltott felhasználó) ACL-engedély sem írja felül.

Olvasásnál az objektumhatókör már az SQL lekérdezés feltétele; mezők szűrése a szerveroldali kivetítésben történik. Nincs tiltott mezőre kliens által megadható rendezés, szűrés vagy aggregáció. Módosítás explicit mezőlistás, objektumellenőrzéses és tranzakciós. Verzióütközés esetén mentés helyett 409.

Minden regisztrált művelet a közös végrehajtón halad át: autentikáció → csatorna/token scope → ACL → mezővalidáció → üzleti korlát → tranzakció → handler + audit → commit. A sikeres írás auditja ugyanabban a tranzakcióban készül. Hibánál rollback és külön hibaaudit. Naplóhiba nem enged csendben sikeres írást. Jelszó, token, session, nyers input és személyes mezőérték sosem kerül a naplóba; az esemény a műveletet, célt, érintett mezőneveket és eredményt tartalmazza.

Új üzleti folyamat mindig regisztrált művelet. Cron/job/import adapter ugyanazt a végrehajtót köteles használni; a még át nem hozott régi rendszer nem válik ettől automatikusan auditálttá.

## Bővítési határ

Az első alkalmazás egyetlen realm. Többszervezetes üzemhez explicit realm-tagság és adatforrás-scope adapter szükséges; annak hiányában nem hirdetünk tenant izolációt. Összetett ABAC-kifejezéshez típusos, regisztrált feltételadapter kell; felületen írható PHP/SQL/JavaScript kifejezés nem támogatott.

## Használati felület (első implementáció)

`Registry::add(Action)` regisztrál egy műveletet; a szerveroldali resolver adja az objektumot és tulajdonost, a handler az üzleti műveletet. `SqlResource` deklarált SQL-adapter list/get/create/update műveletekkel, paraméterkötéssel, 200-as lapozással és optimista revízióval. A `Registry::view` csak a frontendnek szükséges oszlopokat, műveleteket, csoportot és singleton-viselkedést írja le. A DHTMLX Workspace ebből készít gridet, toolbart és szerkesztőablakot. A `__form` kernel-végpont a konkrét célra engedélyezett mezőket adja; a mentés újraellenőrzi őket.

Az alkalmazás `ApplicationDefinition.workspace` argumentuma egy `Workspace(registry, PDO)` objektum. A PDO ugyanaz a kapcsolat, mint amelyen az üzleti handler és az audit fut. Minden írás tranzakcióban fut; a handler nem commitolhat önállóan. Külső mellékhatás (levél, eszközvezérlés) még nem támogatott: ahhoz előbb VAPA outbox/job képességet kell építeni.

Explicit telepítés: `Vapa\Access\Schema::install(PDO)`. HTTP kérés közben nincs sémamigráció. A szerepkörök és kezdeti jogosultságok feltöltése a fogyasztó külön, auditált migrációja; a `role_key` stabil alkalmazási kulcs, a felületi név módosítható. Azonosító és teljes szabálylista a backendben marad.

API: `POST ./?vapa=1`, `Content-Type: application/json`, `Authorization: Bearer <token>`. Törzs: `{"resource":"notes","action":"get","id":"1","values":{}}`. A token csak hash formában tárolt, lejáró és visszavonható; a scope például `notes.get`. A tulajdonos fiókállapotát minden kérés újraellenőrzi. A böngésző ugyanezt a végpontot sessionnel és `X-VAPA-CSRF` fejléccel használja. Írás csak POST, nincs cookie-val működő CSRF nélküli API-csatorna.

`Passwords` a fogyasztó fióksémáját és hash-kodekjét kapja. Saját jelszóváltásnál jelenlegi jelszó és ismétlés szükséges, minimum 12, maximum 128 karakter. Sikeres csere visszavonja a munkameneteket és API-tokeneket. Titkos mezős műveletek 5 próbálkozás/perc/actor/művelet korláttal futnak. A keret nem dönt a fogyasztó meglévő jelszóformátumáról; annak korszerűsítése külön kompatibilitási döntés.

Önálló demo: `php examples/demo-app/setup-workspace.php`, majd a shell demo. A Jegyzetek funkció kizárólag szintetikus, saját SQLite adatokkal használja ugyanazt a registryt és DHTMLX adaptert. `tests/shell/access.php` és `tests/shell/workspace.spec.cjs` ellenőrizte az ACL-t, API-scope-ot, rollbacket és a tényleges form/grid mentést. A fogyasztó integrációja még telepítés előtt áll.
