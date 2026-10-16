<?php
declare(strict_types=1);

use Vapa\Navigation\Menu;
use Vapa\Navigation\MenuItem;
use Vapa\Shell\ApplicationDefinition;
use Vapa\Shell\Identity;
use Vapa\Shell\SqlIdentityProvider;

$db = new PDO('sqlite::memory:', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$db->exec('CREATE TABLE accounts (id INTEGER, username TEXT, password_hash TEXT, display_name TEXT, active INTEGER, can_manage INTEGER)');
$insert = $db->prepare('INSERT INTO accounts VALUES (?, ?, ?, ?, ?, ?)');
$insert->execute([1, 'demo', password_hash('vapa-demo', PASSWORD_DEFAULT), 'Demo User', 1, 1]);
$insert->execute([2, 'viewer', password_hash('vapa-demo', PASSWORD_DEFAULT), 'Demo Viewer', 1, 0]);
$insert->execute([3, 'blocked', password_hash('vapa-demo', PASSWORD_DEFAULT), 'Blocked User', 0, 1]);
$provider = new SqlIdentityProvider($db, 'accounts', 'id', 'username', 'password_hash', 'display_name', ['active', 'can_manage'], allowed: static fn(array $row) => (bool) $row['active']);
return new ApplicationDefinition(
    title: 'VAPA keretdemó', identities: $provider,
    menu: new Menu([
        new MenuItem('library', 'Nyilvántartás', [new MenuItem('documents', 'Dokumentumok')]),
        new MenuItem('settings', 'Beállítások', [new MenuItem('members', 'Tagok')], visible: static fn(Identity $actor) => (bool) $actor->attributes['can_manage']),
    ]),
    runtime: dirname(__DIR__, 2).'/codex/tmp/shell-demo',
    sessionName: 'vapa_demo',
    workspace: require __DIR__.'/workspace.php',
);
