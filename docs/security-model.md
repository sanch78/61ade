# Jogosultsági és szervezeti modell

Állapot: tervezett szerződés. Kötelező alapelv: default deny, központi szerveroldali végrehajtás.

## Kontextus és döntés

A kérés actor (ember vagy gép), szervezet, csatorna, művelet és célobjektum kontextussal fut. A szervezetet nem fogadjuk el ellenőrzés nélkül kliensparaméterből: a tagságot és váltási jogot hitelesített identitással ellenőrizzük.

Az effektív engedély az alábbi feltételek metszete:

- a feature és a kérés csatornája engedélyezett;
- az actor szervezeti hozzáférése érvényes;
- a szerepkör engedi a műveletet;
- az objektumpolicy engedi az adott célt;
- a mezőpolicy engedi az olvasott/írt mezőket;
- az API-token scope-ja engedi a műveletet, ha tokenes a kérés;
- az üzleti állapot megengedi az átmenetet.

A szerepkör megadja a képességet, a policy szűkíti. Explicit tiltás felülírja az engedélyt. Rendszergazdai vagy szervezetközi hozzáférés külön, auditált képesség; nincs rejtett, minden scope-ot megkerülő flag.

## Olvasás

A QueryProvider szervezeti és objektumhozzáférési feltételeket kap a lekérdezés előtt. Hiányzó scope adapter esetén a művelet meghiúsul, nem engedélyez mindent.

Lista, egyedi objektum, count, chart, autocomplete, kapcsolt objektum, export és tree gyermekbetöltés azonos szabályt követ. A hozzáférhetetlen objektum létezését külső API-n következetes 404 válasz rejti; a belső audit rögzíti az okot.

Tiltott mezőre nem engedünk rendezést, szűrést vagy aggregációt sem, ha azok információt árulnának el. A kliens csak a megengedett mezőket kapja, nem CSS-sel elrejtett teljes rekordot.

## Írás

Az input mezői allowlist alapján fogadhatók el; read-only vagy ismeretlen mező hibát eredményez, nem tömeges model bindingot. Tenant ID, owner és státusz csak saját deklarált műveletben változhat.

A módosítás célját engedélyezett query scope-ból töltjük be. Kapcsolt objektumhoz külön hozzáférésellenőrzés kell. A form, inline edit, import, API és bulk ugyanazt a handlert használja.

Bulk esetén minden objektumot ellenőrzünk. Alapértelmezett egy tranzakciós műveletnél az egész kérés elutasítása; részleges végrehajtás csak explicit feature-szerződéssel és objektumonkénti eredménnyel engedett.

## Hitelesítés és állapot

Böngészőben szerveroldali session, biztonságos cookie és CSRF-védelem az alapirány. A session cookie nem hordoz korlátlanul megbízható, tartós policy-döntést. Bejelentkezési próbák limitálása, kijelentkezés és session-visszavonás szükséges.

Gépi klienseknek visszavonható, scope-olt credential szükséges. A protokoll M2-ben döntendő. Jogosultságváltás után a policy-cache érvénytelenítendő; szervezetváltás törli a korábbi adat- és UI-kontextust.

## Kötelező tesztmátrix

- Saját szervezetben engedélyezett olvasás és tiltott írás.
- Más szervezet objektumának ID-val, relációval és szűrővel történő elérése.
- Szerepkör engedély + objektum tiltás; mező olvasható, de nem írható.
- API kikapcsolva, miközben az admin művelet engedélyezett.
- API bekapcsolva, de elégtelen actor/token scope.
- Export/count/chart/lookup információszivárgás elleni teszt.
- Bulk vegyesen megengedett és tiltott célokkal.
- Háttérjob indítása után visszavont jogosultság.
- Cache és egymást követő kérések szervezeti izolációja.
- CSRF, mass assignment, nem engedélyezett filter/sort, tárolt XSS.
- Párhuzamos mentés és optimista zárolási konfliktus.

A frontend capability-listája kizárólag UX-segítség; a backend minden kérésnél új döntést hoz.
