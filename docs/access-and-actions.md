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
