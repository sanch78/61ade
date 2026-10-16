# Munkaterület és élő listák

Állapot: fejlesztés alatt, 2026-10-16. Kapcsolódó elvárás: FB-0006.

A VAPA view külön filter, grid és opcionális beágyazott form területből álló, validált layoutfát deklarál. A területek fejléce, mérete, összecsukhatósága és sorrendje konfigurálható. Alap: bal oldali Szűrés és jobb oldali Találatok, overlay szerkesztő. A formMode panel esetén külön formterületet kell deklarálni. A singleton nézet közvetlen readonly/szerkeszthető adatlap, grid nélkül.

A lista kulcs szerinti kurzoros lekérdezést használ, nem mély SQL OFFSET-et. A DHTMLX grid megjelenítéséhez egy korlátozott, két irányba mozgó adatsáv töltődik; görgetéskor a keret előtölt és elengedi a távoli sorokat. Nincs szükség az összes rekord vagy placeholder böngészőbe töltésére. Az ACL és az engedélyezett mezőszűrők minden lekérdezés részei; a rejtett mezőn keresés is tiltott.

A Suite Standard 9.3.12 csomag nem tartalmazza a dokumentált PRO LazyDataProxy gridintegrációt. A VAPA a Standard Grid publikus scroll/data/selection API-jaira épített, saját adatforrás-adaptert ad; nem állítja, hogy PRO funkciót hív. A megjelenítés, layout és form továbbra is DHTMLX. Natív PRO adapter külön regisztrálható később.

A listák automatikus frissítése projektszintű LiveConfig alapján polling vagy WebSocket. Mindkét csatorna ugyanazt a jogosultságellenőrzött, korlátozott ablakot figyeli. Csak a megváltozott sorok kerülnek át a megjelenítésbe; a nyitott form nem írható felül háttérfrissítéssel. A megfigyelő a kereten kívüli adatbázisírásokat is érzékeli. A WebSocket szerver saját, loopback szolgáltatás; rövid, sessionhöz kötött jegy kell a feliratkozáshoz, és a jogokat minden ellenőrzés újraértékeli. A böngésző hálózata megszakadáskor újracsatlakozik, háttérben lévő lap nem tart fenn aktív figyelőt.
