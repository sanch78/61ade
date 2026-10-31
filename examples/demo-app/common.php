<?php
declare(strict_types=1);

/**
 * Shared synthetic demo settings. The feature demo (/) and the base admin demo (/admin/)
 * are two independent 61ade applications with their own SQLite database and session.
 */
require_once __DIR__.'/sandbox.php';

/** Scratch root of every demo instance (BLADE_TMP_DIR, default the checkout's tmp/). */
function blade_demo_tmp(): string
{
    return getenv('BLADE_TMP_DIR') ?: dirname(__DIR__, 2).'/tmp';
}

/**
 * Data directory of the instance this process uses. BLADE_DEMO_INSTANCE separates the web server copy ("web", set
 * in public/.htaccess) from the CLI/test copy ("demo"), so two OS users never share files. A sandboxed web request
 * (blade_demo_sandbox_enter) replaces it with the visitor's own copy; $set is that hook.
 */
function blade_demo_instance_root(?string $set = null): string
{
    static $root = null;
    if ($set !== null) return $root = $set;
    if ($root !== null) return $root;
    $instance = getenv('BLADE_DEMO_INSTANCE') ?: 'demo';
    if (!preg_match('/^[a-z][a-z0-9-]{0,31}$/D', $instance)) throw new RuntimeException('Invalid demo instance.');
    return blade_demo_tmp().'/'.$instance;
}

function blade_demo_runtime(string $part = ''): string
{
    $directory = blade_demo_instance_root().($part !== '' ? '/'.$part : '');
    // Group-shared (setgid, no "other"): the web server user may reach data set up from the CLI.
    if (!is_dir($directory) && !mkdir($directory, 02770, true) && !is_dir($directory)) throw new RuntimeException('Cannot create demo runtime.');
    return $directory;
}

function blade_demo_db(string $name): PDO
{
    $file = blade_demo_runtime().'/'.$name.'.sqlite';
    $db = new PDO('sqlite:'.$file, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    // Effective process uid (getmyuid() is the script owner): only the file owner may chmod.
    if (PHP_SAPI === 'cli' && is_file($file) && function_exists('posix_geteuid') && fileowner($file) === posix_geteuid()) chmod($file, 0660);
    return $db;
}

/** CLI interpreter for the mail command; under PHP-FPM PHP_BINARY is the FPM daemon. */
function blade_demo_php(): string
{
    if (getenv('BLADE_PHP')) return (string) getenv('BLADE_PHP');
    if (in_array(PHP_SAPI, ['cli', 'cli-server'], true)) return PHP_BINARY;
    return PHP_BINDIR.'/php'.PHP_MAJOR_VERSION.'.'.PHP_MINOR_VERSION;
}

/** Hungarian and English with a visible selector; business texts come from the demo catalogue. */
function blade_demo_languages(): Blade\I18n\Settings
{
    $english = json_decode((string) file_get_contents(__DIR__.'/resources/locales/en.json'), true, flags: JSON_THROW_ON_ERROR);
    return new Blade\I18n\Settings('hu', ['hu' => 'Magyar', 'en' => 'English'], true, ['en' => $english], ['hu' => 'hu', 'en' => 'gb']);
}

/**
 * Host setting from the environment or the Git-ignored examples/demo-app/.env (KEY=VALUE). A visitor sandbox has no
 * WebSocket unit (polling), sends no mail out (outbox only) and keeps OAuth to its overlay (no provider keys).
 */
function blade_demo_setting(string $name): ?string
{
    if (blade_demo_sandboxed() && preg_match('/^BLADE_DEMO_(LIVE_ENDPOINT|MAIL_|GOOGLE_|FACEBOOK_)/', $name)) return null;
    static $file = null;
    $file ??= is_file(__DIR__.'/.env') ? (parse_ini_file(__DIR__.'/.env', false, INI_SCANNER_RAW) ?: []) : [];
    $value = getenv($name);
    if ($value === false) $value = $file[$name] ?? null;
    return is_string($value) && $value !== '' ? $value : null;
}

/** The consumer's own account table: e-mail sign-in, name, consumer-side flags. */
function blade_demo_accounts(PDO $db, array $accounts): void
{
    $db->exec('CREATE TABLE IF NOT EXISTS accounts(id INTEGER PRIMARY KEY AUTOINCREMENT,email TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,display_name TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,can_manage INTEGER NOT NULL DEFAULT 0)');
    // Missing synthetic accounts are added; existing ones keep their current state.
    // A null id takes the next free one (accounts added after the first setup).
    $exists = $db->prepare('SELECT COUNT(*) FROM accounts WHERE id = ? OR email = ?');
    $insert = $db->prepare('INSERT INTO accounts(id,email,password_hash,display_name,active,can_manage) VALUES (?,?,?,?,?,?)');
    foreach ($accounts as [$id, $email, $password, $name, $active, $manage]) {
        $exists->execute([$id, $email]);
        if (!$exists->fetchColumn()) $insert->execute([$id, $email, password_hash($password, PASSWORD_DEFAULT), $name, $active, $manage]);
    }
}

/**
 * Guides of the framework's own views (administration, API keys), set by view id through ApplicationDefinition
 * `guides` (docs/workspaces.md#view-guide); $tenancy: the tenant demo's variants and its Tenantok view.
 * @return array<string, string>
 */
function blade_demo_admin_guides(bool $tenancy = false): array
{
    return [
        'blade_users' => 'A keretrendszer kötelező felhasználókezelése, amelyet minden 61ade alkalmazás megkap: fiók létrehozása egyszer megjelenő ideiglenes jelszóval, és a belépés kapcsolói az űrlapon és a táblázatban is.'
            .($tenancy ? ' A Tenantok mező a felhasználó tagságait állítja.' : ' Kapcsolók: letiltás, OAuth-belépés, e-mailes megerősítés és alapértelmezett nyelv.')
            ."

".'Hozz létre egy fiókot, és jelentkezz be vele: az ideiglenes jelszó után új jelszót kér. A Letiltva kapcsoló azonnal kilépteti a fiókot minden munkamenetéből.',
        'blade_roles' => 'Szerepköralapú jogosultságkezelés: a szerepkör tagságok és jogosultsági szabályok csoportja. A védett admin szerepkör nem törölhető, és mindig marad legalább egy aktív tagja.'
            ."

".'Hozz létre egy szerepkört, adj hozzá tagot a Szerepkör-tagságokban és szabályt a Szerepkör-jogosultságokban. Tagokkal vagy szabályokkal rendelkező szerepkör nem törölhető.',
        'blade_memberships' => 'Melyik felhasználó melyik szerepkörbe tartozik. A tagság azonnal érvényes: a felhasználó a szerepkör szabályai szerint látja a menüt, és futtathatja a műveleteket.'
            ."

".'Tegyél be egy felhasználót egy szerepkörbe, és jelentkezz be vele: a menü a jogai szerint változik. A saját védett tagságodat nem vonhatod vissza.',
        'blade_role_rules' => 'Engedélyek szerepkörökre: erőforrás, művelet, csatorna (felület vagy API), hatókör és mező. A választható értékeket a regisztrált definíciókból képzett katalógus adja; a katalógus semmit sem enged meg, alapértelmezésben minden tiltott.'
            ."

".'Adj egy szerepkörnek jogot a Jegyzetek listájára, vagy tilts le egyetlen mezőt: a tiltott mező a válaszokból is kimarad.',
        'blade_user_rules' => 'Ugyanazok a szabályok egyetlen felhasználóra, a szerepköreitől függetlenül: egy-egy fiók kivétele, például egy mező tiltása.'
            ."

".'Adj egy felhasználónak egyedi szabályt, majd jelentkezz be vele, és nézd meg, mit lát.',
        'blade_api_keys' => 'Gépi hozzáférés a keretrendszer API-jához: a kulcs csak a kiválasztott műveleteket futtathatja, és csak azt, amit a tulajdonosa is megtehet. A titok egyszer jelenik meg, csak a lenyomata tárolódik; a visszavonás azonnali és végleges.'
            .($tenancy ? ' A Tenant mező a kulcsot egy tenanthoz köti, vagy globális marad.' : '')
            ."

".'Adj ki egy kulcsot, másold ki a titkot, és hívd meg vele az API-t Authorization: Bearer fejléccel; a visszavont kulcs nem állítható vissza.',
        ...($tenancy ? ['blade_tenants' => 'Több bérlős (multi-tenant) működés: a tenantok és a hozzáférések kezelése. Egy tenant kinyitva megmutatja, ki fér hozzá; a Hozzáférés kapcsoló egy tagság. Tenant nem törölhető, csak inaktiválható.'
            ."

".'Kapcsold be valakinek a hozzáférést, majd jelentkezz be vele: a navigációs sorban válthat a tenantjai között.'] : []),
    ];
}

/**
 * Feature-demo file manager: virtual space "demo" with three fictional mounts and the Signage mount of the signage
 * media; entries in SQLite, content in the instance's files store. The demo deletes for real (`archive` is the
 * framework default and recommendation).
 */
function blade_demo_files(): Blade\Files\FileManagerDefinition
{
    return new Blade\Files\FileManagerDefinition('files', 'Fájlkezelő', 'demo', ['a' => 'Drive A', 'b' => 'Drive B', 'c' => 'Drive C', 'signage' => 'Signage'],
        allowedExtensions: ['txt', 'md', 'csv', 'json', 'png', 'jpg', 'mp4', 'webm', 'mp3', 'wav', 'm4a'], maxSizeBytes: blade_demo_sandboxed() ? 20971520 : 1073741824, maxFiles: 20, duplicatePolicy: 'ask',
        textMaxBytes: 65536, group: 'Feature demó', desktopOnly: true, contentRoot: blade_demo_runtime('files'), deletePolicy: 'delete',
        guide: 'Kétpaneles fájlkezelő a keretrendszer fájlszolgáltatásán, három kitalált meghajtóval és a digitális kijelző médiatárával (Signage).'."\n\n".'Böngéssz a fában, másolj és mozgass a két panel között, tölts fel fájlokat és mappákat, nyisd meg a szövegfájlokat a szerkesztőben, nézd meg a képeket és videókat, és tölts le fájlokat vagy ZIP-csomagot. Csak asztali nézetben érhető el.');
}

/** Feature-demo diagram editor configured as a network topology builder (synthetic palette). */
function blade_demo_topology(): Blade\Diagram\DiagramDefinition
{
    return new Blade\Diagram\DiagramDefinition('topology', 'Hálózati topológia', 'demo', [
        'internet' => ['label' => 'Internet', 'glyph' => 'globe', 'color' => '#5c6bc0', 'shape' => 'circle'],
        'firewall' => ['label' => 'Tűzfal', 'glyph' => 'firewall', 'color' => '#e53935', 'shape' => 'rect'],
        'router' => ['label' => 'Router', 'glyph' => 'router', 'color' => '#ef6c00', 'shape' => 'circle'],
        'switch' => ['label' => 'Switch', 'glyph' => 'switch', 'color' => '#0288d1', 'shape' => 'rect'],
        'access-point' => ['label' => 'Wi-Fi AP', 'glyph' => 'access-point', 'color' => '#00897b', 'shape' => 'round'],
        'server' => ['label' => 'Szerver', 'glyph' => 'server', 'color' => '#546e7a', 'shape' => 'round'],
        'storage' => ['label' => 'NAS', 'glyph' => 'storage', 'color' => '#6d4c41', 'shape' => 'round'],
        'workstation' => ['label' => 'Munkaállomás', 'glyph' => 'workstation', 'color' => '#43a047', 'shape' => 'round'],
        'laptop' => ['label' => 'Laptop', 'glyph' => 'laptop', 'color' => '#7cb342', 'shape' => 'round'],
        'printer' => ['label' => 'Nyomtató', 'glyph' => 'printer', 'color' => '#8d6e63', 'shape' => 'round'],
        'phone' => ['label' => 'IP-telefon', 'glyph' => 'phone', 'color' => '#8e24aa', 'shape' => 'round'],
        'camera' => ['label' => 'IP-kamera', 'glyph' => 'camera', 'color' => '#f9a825', 'shape' => 'round'],
    ], [
        'ethernet' => ['label' => 'Ethernet (1 Gbit/s)', 'color' => '#607d8b', 'width' => 2],
        'fiber' => ['label' => 'Optika (10 Gbit/s)', 'color' => '#ef6c00', 'width' => 4],
        'wifi' => ['label' => 'Wi-Fi', 'color' => '#0288d1', 'style' => 'dashed', 'width' => 2],
        'vpn' => ['label' => 'VPN-alagút', 'color' => '#8e24aa', 'style' => 'dotted', 'width' => 3],
        'wan' => ['label' => 'WAN', 'color' => '#e53935', 'width' => 3],
    ], group: 'Feature demó', desktopOnly: true, guide: 'A keretrendszer diagramszerkesztője hálózati topológia-szerkesztőként beállítva: a paletta eszközei és a kapcsolattípusok a demó konfigurációja.'."\n\n".'Húzz eszközöket a vászonra, kösd össze őket, és mentsd a diagramot; saját eszköztípust is felvehetsz. Csak asztali nézetben érhető el.');
}
