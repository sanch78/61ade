<?php
declare(strict_types=1);

use Vapa\Admin\{Accounts, Permissions};
use Vapa\Navigation\Menu;
use Vapa\Navigation\MenuItem;
use Vapa\Shell\ApplicationDefinition;
use Vapa\Shell\Identity;
use Vapa\Shell\SqlIdentityProvider;

$workspace = require __DIR__.'/workspace.php';
// Built-in user administration over the demo's own account table; VAPA state stays in vapa_account_state.
$accounts = new Accounts($workspace, 'accounts', 'id', 'email', 'display_name', 'password_hash', createDefaults: ['active' => 1, 'can_manage' => 0]);
$accounts->register($workspace->registry);
$provider = $accounts->identities(new SqlIdentityProvider($workspace->db, 'accounts', 'id', 'email', 'password_hash', 'display_name', ['active', 'can_manage'], allowed: static fn(array $row) => (bool) $row['active']));
(new Permissions($workspace, $accounts, $provider))->register($workspace->registry);
return new ApplicationDefinition(
    title: 'VAPA keretdemó', version: '0.1.0', identities: $provider,
    menu: new Menu([
        new MenuItem('library', 'Nyilvántartás', [new MenuItem('documents', 'Dokumentumok')]),
        new MenuItem('settings', 'Beállítások', [new MenuItem('members', 'Tagok')], visible: static fn(Identity $actor) => (bool) $actor->attributes['can_manage']),
    ]),
    runtime: (getenv('VAPA_TMP_DIR') ?: dirname(__DIR__, 2).'/tmp').'/shell-demo',
    sessionName: 'vapa_demo',
    workspace: $workspace,
    accounts: $accounts,
);
