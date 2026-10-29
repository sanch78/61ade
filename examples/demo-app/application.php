<?php
declare(strict_types=1);

/*
 * Feature demo (kitchen sink, R11): every demonstrable 61ade capability on synthetic data.
 * Extend it in the same batch whenever a new demonstrable capability lands in 61ade.
 * The base admin demo (/admin/) shows only what a new 61ade project starts with.
 */

use Blade\Admin\{Accounts, Administration};
use Blade\Authentication\{AuthHandlerLogin, LoginSecurity};
use Blade\Configuration\WorkspaceConfiguration;
use Blade\Feature\{Context, Failure, Field, SqlResource};
use Blade\Live\LiveConfig;
use Blade\Mail\{CommandDelivery, Delivery, Layout, LoginMessage};
use Blade\Navigation\{Menu, MenuItem};
use Blade\Shell\{ApplicationDefinition, Identity, Skin, SqlIdentityProvider};

require_once __DIR__.'/common.php';
$runtime = blade_demo_runtime('features');
if (!is_file(blade_demo_runtime().'/features.sqlite')) throw new RuntimeException('Run examples/demo-app/setup-workspace.php first.');
$db = blade_demo_db('features');
$languages = blade_demo_languages();

// Business modules: declarative JSON with explicitly registered handlers, plus one PHP-registered resource.
require_once __DIR__.'/signage.php';
$workspace = WorkspaceConfiguration::build($db, [__DIR__.'/modules/tasks.json', __DIR__.'/modules/readings.json', __DIR__.'/modules/signage.json', __DIR__.'/modules/catalog.json'], static fn() => [
    ...blade_demo_signage_bindings(),
    'tasks.complete' => static function (Context $ctx, array $target): array {
        $ctx->db->prepare("UPDATE demo_tasks SET status = 'done' WHERE id = ?")->execute([$target['id']]);
        return [];
    },
    // Business rule across main and related storage: runs after the save, a field error rolls it back.
    'tasks.after_save' => static function (Context $ctx, string $id): array {
        $query = $ctx->db->prepare('SELECT t.status, COALESCE(s.notifications, 1) FROM demo_tasks t LEFT JOIN demo_task_settings s ON s.task_id = t.id WHERE t.id = ?');
        $query->execute([$id]);
        [$status, $notify] = $query->fetch(PDO::FETCH_NUM) ?: ['', 1];
        if ($status === 'progress' && !(int) $notify) throw new Failure('Javítsd a megjelölt mezőket.', 400, ['notify' => 'Folyamatban lévő feladatnál nem kapcsolható ki.']);
        return [];
    },
    // Dialog showcase: each action asks for confirmation (Action `confirm`) and then acknowledges (`reveal` + severity).
    'tasks.dialog_neutral' => static fn(Context $ctx, array $target): array => ['reveal' => ['label' => 'Információ', 'value' => 'A művelet lefutott.', 'note' => 'Semleges nyugtázás: egyetlen Rendben gomb.', 'severity' => 'neutral']],
    'tasks.dialog_warning' => static fn(Context $ctx, array $target): array => ['reveal' => ['label' => 'Figyelmeztetés', 'value' => str_repeat('Hosszú figyelmeztető üzenet, amely természetesen tördelődik. ', 8), 'note' => 'Warning nyugtázás hosszú szöveggel.', 'severity' => 'warning']],
    'tasks.dialog_danger' => static fn(Context $ctx, array $target): array => ['reveal' => ['label' => 'Hiba', 'value' => 'A művelet sikertelen: '.str_repeat('részletes_hibaüzenet_törés_nélkül_', 6), 'note' => "Második sor.\nHarmadik sor.", 'severity' => 'danger']],
]);
$notes = new SqlResource('notes', 'notes', 'id', [new Field('title', 'Cím', required: true)], 'owner_id', ['owner_id' => '1']);
$notes->register($workspace->registry, 'Jegyzetek', rowSelection: true);
$notes->registerDelete($workspace->registry);
// Two-panel virtual file manager (framework capability); mounts and upload limits are demo configuration.
$files = blade_demo_files();
$files->register($workspace);
// Visual diagram editor (framework capability) as a network topology builder; palette and link types are demo configuration.
blade_demo_topology()->register($workspace);
// Digital signage scheduler: framework event calendar over the media assets, plus the per-day playlist API.
blade_demo_signage_register($workspace, $files);

// Mandatory administration with every sign-in switch: OAuth permission, e-mail confirmation, default language.
$accounts = new Accounts($workspace, 'accounts', 'id', 'email', 'display_name', 'password_hash',
    createDefaults: ['active' => 1, 'can_manage' => 0], languages: $languages, oauth: true, emailConfirmation: false);
$identities = Administration::register($workspace, $accounts, new SqlIdentityProvider(
    $workspace->db, 'accounts', 'id', 'email', 'password_hash', 'display_name', ['active', 'can_manage'],
    allowed: static fn(array $row) => (bool) $row['active'],
));

// Second factor by e-mail. @example.test mail always goes to a local writer read in the synthetic
// mailbox (/mailbox/); it takes the arguments of the host mail helper. Only when the Git-ignored
// .env names the helper and an allowed sender does mail to real addresses go out through it.
$arguments = ['--from={from_address}', '--from-name={from_name}', '--to={recipient}', '--subject={subject}', '--html', '--body-file={body_file}'];
$outbox = new CommandDelivery([blade_demo_php(), __DIR__.'/bin/outbox.php', blade_demo_runtime('outbox'), ...$arguments], 'noreply@example.test', '61ade feature demó', $runtime);
$helper = blade_demo_setting('BLADE_DEMO_MAIL_HELPER');
$sender = blade_demo_setting('BLADE_DEMO_MAIL_FROM');
$delivery = $helper && $sender ? new class($outbox, new CommandDelivery([blade_demo_php(), $helper, ...$arguments, '--transport=auto'], $sender, '61ade feature demó', $runtime)) implements Delivery {
    public function __construct(private Delivery $outbox, private Delivery $helper) {}
    public function send(string $recipient, string $subject, string $html, string $text): void
    {
        (str_ends_with(strtolower($recipient), '@example.test') ? $this->outbox : $this->helper)->send($recipient, $subject, $html, $text);
    }
} : $outbox;
$authentication = new LoginSecurity(
    workspace: $workspace,
    identities: $identities,
    delivery: $delivery,
    // Project-level overrides of the framework mail: texts and accent colour, never the markup.
    message: new LoginMessage('61ade feature demó', [
        'subject' => '{application} – belépési kód',
        'footer' => 'A 61ade feature demó automatikus levele.',
    ], layout: new Layout('#0f7b6c')),
    runtime: $runtime,
    emailAttribute: 'email',
    defaultEmailConfirmation: false,
);

// External sign-in through the standalone _AuthHandler library (symlinked as lib/_AuthHandler,
// assets under public/lib/_AuthHandler). The Google and Facebook buttons always show in its
// overlay; the client keys go into the Git-ignored examples/demo-app/.env (see docs/authentication.md).
$site = blade_demo_setting('BLADE_DEMO_URL');
$oauth = new AuthHandlerLogin(
    dirname(__DIR__, 2).'/lib/_AuthHandler', 'lib/_AuthHandler',
    [
        'Google' => ['keys' => ['id' => (string) blade_demo_setting('BLADE_DEMO_GOOGLE_CLIENT_ID'), 'secret' => (string) blade_demo_setting('BLADE_DEMO_GOOGLE_CLIENT_SECRET')], 'scope' => 'openid email profile'],
        'Facebook' => ['keys' => ['id' => (string) blade_demo_setting('BLADE_DEMO_FACEBOOK_CLIENT_ID'), 'secret' => (string) blade_demo_setting('BLADE_DEMO_FACEBOOK_CLIENT_SECRET')], 'scope' => 'email'],
    ],
    $accounts, $identities, $workspace, $runtime.'/oauth-identities.sqlite', $site,
);

// Application skins (synthetic, neutral palettes over a light and a dark base): granted per account, everyone else
// keeps the factory themes.
$slate = new Skin('demo-slate', 'Pala', 'skins/demo-slate.css');
$ink = new Skin('demo-ink', 'Tinta', 'skins/demo-ink.css', base: 'dark');
$skins = static function (Identity $actor) use ($db, $slate, $ink): array {
    $email = $db->prepare('SELECT email FROM accounts WHERE id = ?');
    $email->execute([$actor->id]);
    return match ($email->fetchColumn()) {
        'skin@example.test' => [$slate],
        'skins@example.test' => [$slate, $ink],
        default => [],
    };
};

// Live data: polling unless the Git-ignored .env names the WebSocket endpoint served by the Infra unit (docs/demos.md).
// The same unit serves the starter admin and the tenant demo at <endpoint>/admin and <endpoint>/tenants.
$liveEndpoint = blade_demo_setting('BLADE_DEMO_LIVE_ENDPOINT');

return new ApplicationDefinition(
    title: '61ade feature demó', version: '0.2.0', identities: $identities,
    // Static menu: a not yet implemented module and a policy-filtered item (consumer flag can_manage).
    menu: new Menu([
        new MenuItem('library', 'Nyilvántartás', [
            new MenuItem('documents', 'Dokumentumok'),
            new MenuItem('members', 'Tagok', visible: static fn(Identity $actor) => (bool) $actor->attributes['can_manage']),
        ]),
    ]),
    runtime: $runtime,
    sessionName: 'blade_demo',
    workspace: $workspace,
    authentication: $authentication,
    languages: $languages,
    accounts: $accounts,
    oauth: $oauth,
    skins: $skins,
    live: $liveEndpoint ? new LiveConfig('websocket', $liveEndpoint, applications: [
        'admin' => __DIR__.'/admin-application.php',
        'tenants' => __DIR__.'/tenant-application.php',
    ]) : new LiveConfig(),
);
