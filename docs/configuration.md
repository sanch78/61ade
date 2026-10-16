# JSON-konfiguráció és hostkörnyezet

A deklaratív beállítás szerveroldali, tagolt JSON. A hostcím, adatbázis-hozzáférés, runtime-hely és publikus végpont env-ből érkezik. Az üzleti eljárás PHP marad, névvel regisztrált callbackként. Nincs JSON-ba írt PHP, JavaScript, eval vagy automatikus osztálypéldányosítás.

## Belépés és alkalmazásszekciók

```php
return JsonApplication::load(
    file: __DIR__.'/config/application.json',
    identityBindings: Accounts::bindings(),
    workspaceBindings: WorkspaceBindings::create(...),
);
```

| Szekció | Feladat |
| --- | --- |
| `description` | Embernek szóló magyarázat, nem runtime-beállítás. Minden konfigurációs objektumon használható. |
| `environment` | Env-fájlok betöltése és az alternatív fájlt kiválasztó folyamatváltozó. |
| `application` | `title`, `runtime`; relatív runtime-útvonal a JSON könyvtárához képest. |
| `database` | MySQL `host`, integer `port`, `name`, `charset`, `user`, `password`; jelszó csak env-hivatkozásból. |
| `session` | `name`, `cookie_path`. A session életciklusát a keret kezeli. |
| `identity` | SQL fiókséma és névvel regisztrált `allowed`/`password_verifier` illesztés. |
| `live` | `transport` (`poll`/`websocket`), `endpoint`, integer `interval_ms`. |
| `workspace.modules` | Modul-JSON fájlok a konfiguráció könyvtárához képest; a nézetek adják a menüt. |

Env-hivatkozás:

```json
{
    "environment": {
        "files": [{"path": "../.env", "optional": true}],
        "override_file_env": "EXAMPLE_ENV"
    },
    "live": {
        "description": "A projekt élő adatkövetése és publikus végpontja.",
        "transport": {"$env": "EXAMPLE_LIVE_TRANSPORT", "default": "poll"},
        "endpoint": {"$env": "EXAMPLE_LIVE_ENDPOINT", "default": "live"},
        "interval_ms": {"$env": "EXAMPLE_LIVE_INTERVAL", "default": 2000, "type": "integer"}
    }
}
```

A referencia pontos `{"$env": "NÉV", "default": érték, "type": "string|integer|boolean"}` objektum. `default` nélkül a változó kötelező. A feloldás teljes értéket helyettesít, nem végez karakterlánc-interpolációt. A folyamat env-je elsőbbségű, utána a fájlok fordított sorrendje, végül a JSON defaultja érvényes. Beállított `override_file_env` esetén kizárólag a kiválasztott env-fájl töltődik be. A fájl INI-kompatibilis `KEY=value` formátumú, nem shell-script; nincs `export`, parancs vagy változóbehelyettesítés. A helyi `.env` ignored, az `.env.example` csak helykitöltőket tartalmazzon.

## Moduldefiníció

A teljes szintetikus példa: [notes.json](../tests/fixtures/configuration/notes.json).

| Szekció | Feladat |
| --- | --- |
| `section_descriptions` | Szabad szöveges szekciómagyarázatok; nem végrehajtható metaadat. |
| `lookups` | Névvel ellátott, jogosultságszűrt választók: `resource`, `table`, `key`, `label`, opcionális `owner`, `where`, `extra`. |
| `resources.<név>.storage` | `table`, `key`, opcionális `owner_column`, `defaults`, `where`, `self_only`. A `where` megbízható, fejlesztő által írt SQL-feltétel. |
| `fields` | `name`, `label`, opcionális `type`, `required`, `max`, `secret`, valamint egyetlen választóforrás: `options`, `options_lookup` vagy `options_binding`. A `validation` a [formvalidációs szerződést](validation.md) használja. |
| `operations` | `create`/`update` alapból igaz, `delete` alapból hamis. |
| `hooks` | `guard`, `normalize`, `after_save`, `delete_guard`: explicit PHP-binding neve. |
| `view` | `title`, opcionális `group`, `singleton`, `columns`, `actions`, `layout`. Oszlopok/műveletek nélkül a regisztrált erőforrás alapnézete érvényes. |
| `view.layout` | `form_mode` (`overlay`/`panel`) és opcionális, validált `tree`. Lásd [munkaterületek](workspaces.md). |
| `actions` | További regisztrált műveletek: `resource`, `name`, `label`, `handler`, opcionális `fields`, `target_resource`, `write`, `channels`. |

A compiler előbb a lookupokat és SQL-erőforrásokat, majd az egyedi műveleteket, végül a nézeteket állítja össze. Így a nézet hivatkozhat ugyanazon vagy más modulban később deklarált műveletre. Ismeretlen kulcs, binding, lookup, művelet-erőforrás vagy ismételt definíció hibát ad. A meglévő PHP-alapú definíciós API továbbra is használható; a JSON ugyanazokat a VAPA-osztályokat építi fel.

A `workspaceBindings` egy `(Workspace, Registry): array` closure; a visszatérő tömb explicit név → closure térkép. A JSON nem kereshet tetszőleges PHP-függvényt. A callback a közös ACL/tranzakció/audit alatt fut. A teljes konfiguráció és a callbacknevek nem kerülnek a böngészőbe, csak a megengedett nézet-/mezőmetaadat.

## Ellenőrzés és korlát

`tests/shell/configuration.php`: env-fájl/process/default precedencia, típus és kötelező érték hibája, hibás JSON, önálló szintetikus teljes alkalmazás, binding, CRUD, layout, ACL és audit. `JsonApplication::load` opcionális negyedik PDO paramétere meglévő kapcsolat/izolált fixture befecskendezésére használható; alapból a deklarált MySQL-kapcsolatot nyitja.

A modul-JSON nem dolgoz fel env-hivatkozásokat: ide hostfüggetlen feature-definíciók kerülnek. A konfiguráció deployolt, megbízható fejlesztői anyag, nincs hozzá HTTP-s szerkesztő vagy hot-reload protokoll. Hosszú életű worker konfigurációváltás után újraindítandó. Nincs teljes JSON Schema/editor-autocomplete vagy PHP-callbackek statikus típusellenőrzése; a támogatott struktúrákat a runtime compiler ellenőrzi.
