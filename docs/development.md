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

Az önálló demó és a böngészőtesztek alapértelmezett PHP-binárisa `php8.4`. Más, PHP 8.4+ és PDO SQLite támogatású bináris vagy wrapper a `VAPA_PHP` környezeti változóval választható; a tesztben végzett külső adatbázisírás is ezt használja. Példa: `VAPA_PHP=/opt/php84/bin/php npm run test:browser -- tests/shell/workspace.spec.cjs`. A keret nem feltételezi egy fogyasztó checkoutját vagy saját runtime-wrapperét.

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

## Böngészőteszt korlátozott memóriájú fejlesztői hoston

Linux, systemd user manager, delegált cgroup v2 memory/pids kontrollerek, Bash és util-linux `flock` szükséges. A `npm run test:browser -- tests/shell/workspace.spec.cjs` a `tools/playwright.sh` útján indít: egy worker, egy közös nem blokkoló lock (`codex/tmp/dev-check.lock`), legalább 1280 MiB induláskori MemAvailable, 700 MiB MemoryHigh, 900 MiB MemoryMax, swap nélküli scope, legfeljebb 128 task (szálakkal együtt). Memória- vagy tasklimit esetén a teszt hibával leállhat; ilyenkor ne indíts párhuzamos újrapróbálást.

A fogyasztó ugyanazt a `tools/run-dev-check.sh command [args...]` eszközt hívja saját tesztbinárisával és munkakönyvtárából. Minden ilyen futás ugyanazt a framework-checkouthoz tartozó lockot használja. Több külön framework-checkout vagy más felhasználó nem osztozik ezen a záron. A futtató nem indít korlátlan fallbacket, ha a systemd nem érhető el. A teszt exitkódját továbbadja, foglalt lock vagy kevés memória esetén 75 az exitkód. A nyers Playwright CLI megkerüli a védelmet, ezért ezen a hoston nem támogatott fejlesztői belépési pont. A guard más nagy ellenőrzésekhez is használható, a korlátok ugyanazok.

Ellenőrzés: a futó scope `memory.max=943718400`, `memory.high=734003200`, `memory.swap.max=0`, `pids.max=128`; egymásba ágyazott guardhívás 75-tel elutasítva; mindkét projekt tesztfelderítése a wrapperen keresztül; egy szintetikus login/menu Chromium-próba sikeres a védett futtatóban (a rendelkezésre álló PHP 8.4 wrapper `VAPA_PHP` illesztésével). A limit érvényesítése kis terheléssel ellenőrzött, szándékos host-OOM teszt nincs. Ez a tesztek védelme, a teljes VS Code-session és más szolgáltatások összesített fogyasztását nem korlátozza. Hostszintű swap vagy további szolgáltatáskorlát rendszergazdai feladat.

Referencia: [systemd erőforráskorlátok](https://www.freedesktop.org/software/systemd/man/latest/systemd.resource-control.html).


### Kijelölt scratch és rendszerszintű böngésző

A build vendorfont-cache-e és a védett tesztfolyamat `TMPDIR`-je a
`VAPA_TMP_DIR` környezeti változóval kijelölhető. Az önálló demo setup,
adatbázis és session runtime, illetve az alap Playwright-konfiguráció
artifactkönyvtára is ezt követi. A közös `dev-check.lock` továbbra is a
keret meglévő zára: a scratch választása nem enged párhuzamos tesztfutást.
A régi alapútvonal kompatibilitásból marad meg; a host projektterületi
szerződése szerint mindig a kijelölt scratch értéket kell átadni.

A Playwright runner/böngésző Catalyston rendszerszinten, Infra által kezelt.
Hiányzó vagy eltérő browser revision esetén Infra-kérés szükséges;
projektterületre böngészőt letölteni, vagy a hostvédelmet megkerülni tilos.
A tesztartifact scratch és a közös böngészőtelepítés két külön felelősség.


### Meglévő közös Playwright bekötése

A védett wrapper `VAPA_PLAYWRIGHT_BIN` belépőt indít (alapérték
`/usr/local/bin/playwright`), a teszt- és configimportok pedig ugyanazt a
`VAPA_PLAYWRIGHT_MODULE` által kijelölt rendszerszintű `@playwright/test`
csomagot használják. A helyi `node_modules/.bin` npm általi PATH-előtétjére
nem hagyatkozunk. A projekt manifestje és lockfile-ja nem telepít Playwrightot.
A korábbról megmaradt helyi csomagokat nem töröljük automatikusan.

Catalyst meglévő felülete: `/usr/local/bin/playwright` és
`/opt/infraadmin/playwright/npm/lib/node_modules/@playwright/test`, 1.60.0;
a belépő a közös `/opt/infraadmin/playwright/browsers` könyvtárat használja.
Ezeket a projekt csak olvassa/indítja, nem telepíti vagy módosítja.

```sh
VAPA_PLAYWRIGHT_MODULE=/opt/infraadmin/playwright/npm/lib/node_modules/@playwright/test \
VAPA_TMP_DIR=/kijelolt/projekt-scratch \
  npm run test:browser -- list-presentation.spec.cjs
```

A scratch tényleges értékét a futtató a projektterületi szerződés szerint adja.
A kiválasztott rendszerfuttató és a tesztimport csomagjának egyezése kötelező;
a két külön Playwright-példányból származó `test()` nem kompatibilis.
