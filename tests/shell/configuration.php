<?php

declare(strict_types=1);

require dirname(__DIR__, 2).'/examples/demo-app/vendor/autoload.php';

use Vapa\Access\Schema;
use Vapa\Configuration\JsonApplication;
use Vapa\Configuration\JsonConfiguration;
use Vapa\Configuration\WorkspaceConfiguration;
use Vapa\Feature\Context;
use Vapa\Feature\Failure;

function verify(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function rejected(Closure $work, string $message): void
{
    try {
        $work();
    } catch (InvalidArgumentException) {
        return;
    }
    throw new RuntimeException($message);
}

$root = dirname(__DIR__, 2);
$directory = $root.'/codex/tmp/configuration-'.bin2hex(random_bytes(6));
mkdir($directory, 0700, true);
$file = $directory.'/application.json';
$write = static function (array $values) use ($file): void {
    file_put_contents($file, json_encode($values, JSON_THROW_ON_ERROR | JSON_PRETTY_PRINT));
};

try {
    file_put_contents($directory.'/.env', "VAPA_TEST_CONFIG_PORT=8080\nVAPA_TEST_CONFIG_ENABLED=false\n");
    $settings = [
        'environment' => ['files' => [['path' => '.env']]],
        'test' => [
            'port' => ['$env' => 'VAPA_TEST_CONFIG_PORT', 'type' => 'integer'],
            'enabled' => ['$env' => 'VAPA_TEST_CONFIG_ENABLED', 'type' => 'boolean'],
            'fallback' => ['$env' => 'VAPA_TEST_CONFIG_ABSENT', 'default' => 'safe'],
        ],
    ];
    $write($settings);
    $resolved = JsonConfiguration::load($file);
    verify($resolved->section('test') === ['port' => 8080, 'enabled' => false, 'fallback' => 'safe'], 'Typed env file and default');
    verify($resolved->path('relative') === $directory.'/relative', 'Config-relative paths');
    putenv('VAPA_TEST_CONFIG_PORT=9090');
    verify(JsonConfiguration::load($file)->section('test')['port'] === 9090, 'Process env overrides file');
    putenv('VAPA_TEST_CONFIG_PORT=not-an-integer');
    rejected(static fn() => JsonConfiguration::load($file), 'Invalid integer accepted');
    putenv('VAPA_TEST_CONFIG_PORT');
    $settings['test']['fallback'] = ['$env' => 'VAPA_TEST_CONFIG_ABSENT'];
    $write($settings);
    rejected(static fn() => JsonConfiguration::load($file), 'Missing env accepted');
    file_put_contents($file, '{invalid');
    rejected(static fn() => JsonConfiguration::load($file), 'Invalid JSON accepted');

    $db = new PDO('sqlite::memory:', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    Schema::install($db);
    $db->exec('CREATE TABLE accounts (id INTEGER PRIMARY KEY, login TEXT, password_hash TEXT, name TEXT, active INTEGER)');
    $query = $db->prepare('INSERT INTO accounts VALUES (1, ?, ?, ?, 1)');
    $query->execute(['synthetic', password_hash('synthetic-password', PASSWORD_DEFAULT), 'Synthetic User']);
    $db->exec('CREATE TABLE notes (id INTEGER PRIMARY KEY AUTOINCREMENT, owner_id TEXT, title TEXT)');
    $grant = $db->prepare("INSERT INTO vapa_rules(subject_type, subject_id, resource, action, channel, effect, scope, object_id, field_name) VALUES ('user', '1', 'notes', ?, 'ui', 'allow', 'all', '', '')");
    foreach (['list', 'get', 'create', 'update', 'mark'] as $action) {
        $grant->execute([$action]);
    }
    $module = $root.'/tests/fixtures/configuration/notes.json';
    $callbacks = static fn() => [
        'notes.normalize' => static fn($context, $target, $values) => ['title' => strtoupper($values['title'])],
        'notes.mark' => static function ($context, $target): array {
            $query = $context->db->prepare('UPDATE notes SET title = ? WHERE id = ?');
            $query->execute(['MARKED', $target['id']]);
            return [];
        },
    ];
    $settings = [
        'application' => ['title' => 'Synthetic JSON app', 'runtime' => 'runtime', 'version' => '2.3.4'],
        'database' => ['host' => 'unused', 'port' => 3306, 'name' => 'unused', 'charset' => 'utf8mb4', 'user' => 'unused', 'password' => ''],
        'session' => ['name' => 'json_test', 'cookie_path' => '/'],
        'identity' => ['table' => 'accounts', 'id_column' => 'id', 'username_column' => 'login', 'password_column' => 'password_hash', 'name_column' => 'name', 'attribute_columns' => ['active'], 'allowed' => 'accounts.active'],
        'live' => ['transport' => 'poll', 'endpoint' => 'live', 'interval_ms' => 500],
        'workspace' => ['modules' => [$module]],
    ];
    $write($settings);
    $app = JsonApplication::load($file, ['accounts.active' => static fn($row) => (bool) $row['active']], $callbacks, $db);
    $actor = $app->identities->authenticate('synthetic', 'synthetic-password');
    verify($actor !== null, 'JSON identity adapter');
    verify($app->version === '2.3.4', 'Application release version from JSON');
    $workspace = $app->workspace;
    $context = new Context($actor, 'ui', $workspace->acl, $db);
    $created = $workspace->executor->execute($context, 'notes', 'create', null, ['title' => 'hello']);
    $row = $workspace->executor->execute($context, 'notes', 'get', $created['id'], []);
    verify($row['title'] === 'HELLO', 'Named business normalization inside generic CRUD');
    $workspace->executor->execute($context, 'notes', 'mark', $created['id'], []);
    verify($db->query('SELECT title FROM notes')->fetchColumn() === 'MARKED', 'Named custom action and target');
    $views = $workspace->views($actor);
    verify($views[0]['layout']['formMode'] === 'panel', 'JSON layout');
    verify(!str_contains(json_encode($views), 'notes.normalize'), 'Backend bindings not exposed');
    verify((int) $db->query("SELECT COUNT(*) FROM vapa_audit WHERE outcome='success'")->fetchColumn() === 3, 'JSON operations retain audit');
    try {
        $workspace->executor->execute(new Context(new Vapa\Shell\Identity('2', 'Other'), 'ui', $workspace->acl, $db), 'notes', 'get', $created['id'], []);
        throw new RuntimeException('JSON action bypassed ACL');
    } catch (Failure $error) {
        verify($error->status === 403, 'Default deny retained');
    }

    $settings['session']['cookie_patth'] = '/wrong';
    $write($settings);
    rejected(static fn() => JsonApplication::load($file, [], $callbacks, $db), 'Unknown setting accepted');
    rejected(static fn() => WorkspaceConfiguration::build($db, [$module], static fn() => []), 'Unknown handler accepted');
    rejected(static fn() => WorkspaceConfiguration::build($db, [$module, $module], $callbacks), 'Duplicate resource accepted');
    echo "VAPA JSON/environment configuration contracts passed.\n";
} finally {
    putenv('VAPA_TEST_CONFIG_PORT');
    foreach (glob($directory.'/*') as $temporary) {
        if (is_file($temporary)) {
            unlink($temporary);
        }
    }
    unlink($directory.'/.env');
    rmdir($directory);
}
