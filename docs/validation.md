# Deklaratív formvalidáció és migráció

A validáció ugyanabból a `Field`-definícióból működik DHTMLX Formban és a szerveroldali UI/API műveletvégrehajtóban. A kliens ellenőrzése gyors visszajelzés; a backend minden beküldést ellenőriz. A hibás mezők név szerinti `fieldErrors` válaszban érkeznek, a nyitott form megőrzi a kitöltött értékeket, és natív DHTMLX mezőhiba jelenik meg.

```json
{
    "name": "contact",
    "label": "Kapcsolattartási cím",
    "required": true,
    "max": 200,
    "validation": {
        "min_length": 6,
        "pattern": {
            "expression": "^[a-z0-9_.-]+@[a-z0-9_.-]+\\.[a-z]{2,}$",
            "flags": "i",
            "message": "Érvényes kapcsolattartási cím szükséges."
        },
        "unique": true
    }
}
```

| Szabály | Végrehajtás |
| --- | --- |
| `required`, `max` | Kötelezőség és Unicode-karakterszám felső korlátja. Az üres opcionális érték a formátumszabályokat kihagyja. |
| `validation.min_length` | Unicode-karakterszám alsó korlátja. |
| `validation.pattern` | `expression`, opcionális `flags: "i"`, `message`. Közös JavaScript/PCRE szintaxisú reguláris kifejezést kell használni, PHP-delimiterek nélkül. |
| `validation.matches_field` | Másik beküldött mező nevével azonos érték; például jelszómegerősítés. |
| `validation.unique` | A `SqlResource` a konkrét táblában ellenőrzi az érték egyediségét, módosításkor a jelenlegi objektumot kihagyja. Csak szerveroldali, nincs külön kliensoldali adatlekérdezés. |
| `type: number/select` | Nemnegatív egész szám, illetve az ACL-szűrt választék egyik eleme. |

Szövegnél a keret trimel; `secret` mezőnél a szóköz is az érték része. A jelszómegerősítés a beküldött párt ellenőrzi. A minták a fejlesztő által megadott, megbízható konfiguráció részei, nem felhasználói regexek. Nem támogatott regexflagek és hibás definíciók induláskor hibát adnak. A két regexmotor minden speciális konstrukcióját nem konvertáljuk; hordozható kifejezést és UI/backend tesztet kell használni.

A `unique` előellenőrzés érthető hibát biztosít, de párhuzamos írás ellen adatbázisbeli UNIQUE constraint is szükséges. Az ellenőrzés a teljes táblát figyeli, a nem látható vagy törölt sorokat is; a foglalt érték nem foglalható újra pusztán UI-szűréssel. Nem adja vissza a másik rekord adatait. A hiba nem tartalmazhat beküldött jelszót, tokent vagy érzékeny értéket; az audit mezőneveket és eredményt tárol.

## Kötelező feature-migrációs lépés

Minden átvezetett feature előtt fel kell mérni a referencia modul, lokális felülírás, közös konfiguráció és mentési folyamat validációit. A kötelező mezők átvétele önmagában nem teljes migráció.

1. Mezőnként rögzítsd a formátumot, hosszt, egyediséget, kapcsolati/keresztmezős feltételt és védett értékeket.
2. Az általános mechanizmust a VAPA-ba emeld; a konkrét regexet, határértéket, üzenetet és üzleti kivételt a fogyasztó JSON-jában/PHP-szabályában tartsd.
3. A kiváltott régi jogosultságmezőket az új ACL-lel feleltesd meg. Ne másold vissza a régi flagalapú jogrendszert.
4. Minden eltérést dokumentálj; felhasználói döntés nélkül ne tekints elveszett validációt elfogadott változásnak.
5. Ellenőrizd a natív form visszajelzését és a közvetlen szerver/API beküldést is. Hibánál ne legyen részleges mentés; javítás után ugyanabból a formból lehessen újra küldeni.

Ellenőrzés: `tests/shell/validation.php`, az ACL-végrehajtó szerződéstesztjei, és a fogyasztó referencia szerinti mező-/egyediség-/jelszó-/böngészőtesztjei. A keret szintetikus példái nem tartalmaznak fogyasztói neveket vagy konkrét üzleti regexeket.
