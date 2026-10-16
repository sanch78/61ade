# Fejlesztés, környezet és kiadás

## Jelenlegi állapot

Az első PHP 8.4+ login/navigációs shell és frontend build elkészült. Futtatási integráció, előfeltételek és korlátok: [shell](shell.md). A host PHP 7.1 alapértelmezése megmarad; a fogyasztó izolált PHP 8.4 CLI-t használhat. Nincs még Symfony hosting, teljes CI vagy PHP 8.5 ellenőrzés.

## Szerkesztés két repóban

Canonical VAPA: `/space/frameworks/vapa`. A CityScreen `vapa` symlinkje ugyanerre mutat, így a fájlok helyben megnyithatók VS Code-ban. A Git műveleteket explicit repoútvonallal végezzük:

```bash
git -C /space/frameworks/vapa status
git -C /space/apps/cityscreen status
```

Ha az editor nem fedezi fel automatikusan a symlink mögötti repót, a canonical könyvtárat külön workspace folderként is hozzá lehet adni. A symlink nem fogyasztói dependency és CI-ban nem szükséges.

## Helyi csomagfejlesztés terve

A demo és CityScreen Composer path repositoryval használhatja a PHP csomagot. A frontend helyi workspace/file dependencyt használhat fejlesztéskor. Ezek lokális beállítások; production lockfile vagy publikált csomag nem hivatkozhat `/space/...` útvonalra.

Csomagkiadáshoz M7-ben automatizált PHP/frontend artifact készítés szükséges a monorepo alkönyvtáraiból. A package-könyvtárban lévő composer.json önmagában nem teszi a Git-repó gyökerét közvetlenül Composer VCS package-gé. A végleges artifact/registry módszert a kiadási pipeline rögzíti.

A library manifest kompatibilis verziótartományt deklarál, a fogyasztó lockfile konkrét verziót rögzít. Az első backend/frontend kiadások együtt verziózódnak. Törő protokollváltozásnál release note, migrációs leírás és új kompatibilitási tartomány kell.

## Fájlrendszer és környezet

Scratch, log, tesztartifact, cache, runtime home és ideiglenes lock: `codex/tmp/`. Backup: `$CODEX_HOME/backup/project/vapa`, a repón kívül. Secret environmentből vagy titokkezelőből érkezik, nem a csomag konfigurációjából.

Az alkalmazás publikus fájljai a fogyasztó public könyvtárában legyenek. Üzleti média, audit és tartós jobadat konfigurált storage-ba kerül, nem a framework checkoutba. A demó kizárólag szintetikus adatot használhat.

## Ellenőrzési stratégia

M0: JSON manifest parse, belső markdownhivatkozások, könyvtárak és symlink, whitespace, staged secret/vendor kizárás, remote commit egyezés.

M1-től: PHP lint, statikus analízis, frontend typecheck/build, egységtesztek. M2-től: izolált DB integráció és policy-mátrix. M3-tól: UI/API contract és E2E. M7-től: reprodukálható terhelésmérés. Nem létező tesztparancsra nem hivatkozunk sikeres ellenőrzésként.

## Commit és push

Minden érdemi módosítási batch után a VAPA gyökeréből:

```bash
/usr/local/bin/gitpush --all -t
```

A host jelenlegi helperében a `-t` commitüzenetként értelmeződik, nem kapcsolóként; ezt a kért parancsot változtatás nélkül használjuk. Üres repó első commitja külön bootstrap commit, mert a helper HEAD-et feltételez; utána a kötelező helper végzi a push-t. A helper működését nem módosítjuk.

## Technológiai referencia

- [PHP támogatott verziók](https://www.php.net/supported-versions.php)
- [OPcache](https://www.php.net/manual/en/book.opcache.php)
- [Symfony 7.4 LTS](https://symfony.com/releases/7.4)
- [FrankenPHP worker mód, későbbi opció](https://frankenphp.dev/docs/worker/)
