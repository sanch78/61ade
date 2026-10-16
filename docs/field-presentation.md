# Jelzők, beszédes értékek és kapcsolt objektummezők

A VAPA `checkbox` mezőt natív DHTMLX checkboxként jeleníti meg a főűrlapon és a listában. A grid checkboxa állapotjelző: kattintás vagy billentyűzet nem ment és nem módosít helyileg. A módosítás a főűrlapon, a szokásos Mentés művelettel történik. Nem készül külön gomb vagy form pusztán egy kapcsolóhoz. A `select` oszlopok az opciófeliratot mutatják a nyers kulcs helyett.

## Mező és oszlop deklarálása

```json
{
    "name": "archived", "label": "Archivált", "type": "checkbox",
    "required": true, "default": "0",
    "options": {"0": "Aktív", "1": "Archivált"},
    "column": {"width": 100, "align": "center"}
}
```

A tárolt kanonikus érték `"0"` vagy `"1"`; bool és integer 0/1 is beküldhető, a backend ugyanarra normalizálja őket. Más érték mezőhibát ad. A required checkboxnál a kikapcsolt állapot is érvényes: a required nem „kötelező bepipálni”. Elhagyott opcionális mező megőrzi a korábbi értéket. A checkbox címkéje a jelölő mellett jelenik meg. A checkboxra érkező üzleti mezőhibát a kliens mezőnévvel ellátott DHTMLX Alertben mutatja (a Suite checkbox-captions kizárólag kötelező bepipálás mellett jelennek meg); a form kitöltése hiba esetén megmarad. A `default` a létrehozási form kezdőértéke; nem ír felül tárolt értéket, és nem helyettesít szerveroldali storage-defaultot.

A `column` támogatott opciói: pozitív integer `width`, `minWidth`, `maxWidth` (legfeljebb 10000 px), valamint `align`: `left`, `center`, `right`. Fix `width` mellett a grid nem nyújtja automatikusan a mezőt. A checkbox szűrője háromállapotú select: Bármely + a két beszédes opció. Az `options` fogyasztói feliratokat ad; elhagyáskor Nem/Igen az alap. A példában Aktív/Archivált szerepel. E két állapot megnevezésénél ahol lehet, az alkalmazási jelentést kell használni.

PHP API: a `Field` `type: 'checkbox'`, `column: ['width'=>100,'align'=>'center']`, `defaultValue: '0'` paramétereket fogadja. A deklarációt a JSON compiler ugyanarra a mezőre fordítja.

## Egy-az-egyhez kapcsolt tárolás a főűrlapon

Az objektum olyan mezői is szerepelhetnek ugyanazon a listán és formon, amelyek egy kapcsolt táblában vannak:

```json
{
    "storage": {
        "table": "items", "key": "id",
        "related": [{
            "table": "item_preferences", "key": "item_id",
            "fields": {"notify": "notifications"},
            "defaults": {"notify": 1}
        }]
    },
    "fields": [{
        "name": "notify", "label": "Értesítések", "type": "checkbox",
        "default": "1", "options": {"0": "Kikapcsolva", "1": "Bekapcsolva"},
        "column": {"width": 120, "align": "center"}
    }]
}
```

A `fields` a publikus mezőnév → kapcsolt oszlopnév megfeleltetés. A kapcsolt `key` az objektum azonosítóját tárolja, a DB-ben egyedi/primary key legyen. A táblát és a kulcsindexet a fogyasztó migrációja hozza létre; a keret nem módosít sémát futás közben. A kapcsolt mezőnek a főtáblában nem lehet azonos nevű oszlopa; egy mező csak egy related tárolóhoz tartozhat. Related mezőn a `validation.unique` jelenleg nem támogatott. A default string vagy integer lehet, hiánya üres szöveg. A példa teljes futtatható alakja: `tests/fixtures/related-fields/items.json`.

A listázás/szűrés/élő követés és a get ugyanazt az értéket adja hiányzó kapcsolt rekordnál is. A kapcsolt mező része az objektum revíziójának; külső módosítása a korábban megnyitott form mentését 409-cel védi. A fő- és kapcsolt tábla írása, az after_save hook és az audit a közös Executor tranzakciójában fut. Hibánál minden visszagördül. Az objektum törlése a deklarált kapcsolt rekordokat is törli; egyéb FK/outbox/cascade szabályokat továbbra is az alkalmazásnak kell meghatároznia.

A kapcsolt mező ugyanazt az objektum-/mező-/csatornajogot kapja, mint a főűrlap többi mezője. Tiltott mező nem írható; az elhagyott mezőt nem mentjük újra, a tárolt érték megmarad. Tiltott listamező nem szűrhető. A táblanevek, mappingok és hooknevek nem kerülnek a frontend metaadataiba. Az `after_save` opcionálisan választömböt adhat vissza (pl. `['reauthenticate'=>true]`), az objektum ID-ját a keret rögzíti. A kapcsolt beállítás üzleti mellékhatásait a fogyasztó hookja hívja meg; például session-visszavonást a VAPA `Workspace::revokeSessions` szolgáltatásával.

Előfeltétel: PDO SQLite vagy MySQL, tranzakcióképes fő- és kapcsolt tábla (MySQL-en InnoDB), Suite Standard 9.3.12. MySQLen a mentés zárolja a főrekordot és a meglévő kapcsolt rekordot; párhuzamos külső írásnál a revízió és az egyedi kulcs védi a közös mentést. Több-a-többhöz kapcsolatok, összetett kapcsolati kulcsok és listán belüli checkboxos mentés nem része ennek a képességnek.

## Ellenőrzés

- `tests/shell/related-fields.php`: checkbox-validáció UI/API útvonalon, default, közös mentés, kapcsolt változás megfigyelése, 409-es konfliktus, tranzakciós rollback, mező-ACL, tiltott szűrés, törlés.
- `VAPA_PHP=/path/to/php84 TMPDIR="$PWD/codex/tmp" npx playwright test --config=playwright.related.config.cjs`: külön szintetikus fogyasztó, natív lista-/form-checkbox, fix oszlopszélesség, közös mentés, újranyitás, beszédes filter.

Kapcsolódó elvárás: FB-0014. A korábbi külön regisztrált security action technikai lehetőség marad; kapcsoló megjelenítésének alapmódszere az objektum főűrlapja.
