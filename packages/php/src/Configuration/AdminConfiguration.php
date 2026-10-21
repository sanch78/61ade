<?php

declare(strict_types=1);

namespace Vapa\Configuration;

use Vapa\Admin\{Accounts, Permissions};
use Vapa\Feature\Workspace;
use Vapa\Shell\IdentityProvider;

/** Enables the mandatory built-in administration over the declared identity mapping. */
final class AdminConfiguration
{
    public static function build(array $definition, array $identity, array $callbacks, Workspace $workspace, IdentityProvider $identities): Accounts
    {
        Shape::check($definition, [], [
            'group' => 'string',
            'users_title' => 'string',
            'create' => 'boolean',
            'create_defaults' => 'array',
            'password_encoder' => 'string',
            'temporary_password_hours' => 'integer',
            'protected_role' => 'string',
        ], '$.admin');
        $bindings = new Bindings($callbacks);
        $accounts = new Accounts(
            workspace: $workspace,
            table: $identity['table'],
            idColumn: $identity['id_column'],
            emailColumn: $identity['username_column'],
            nameColumn: $identity['name_column'],
            passwordColumn: $identity['password_column'],
            encode: $bindings->get($definition['password_encoder'] ?? null),
            verify: $bindings->get($identity['password_verifier'] ?? null),
            createDefaults: $definition['create_defaults'] ?? [],
            creatable: $definition['create'] ?? true,
            temporaryHours: $definition['temporary_password_hours'] ?? 72,
        );
        $group = $definition['group'] ?? 'Adminisztráció';
        $accounts->register($workspace->registry, $definition['users_title'] ?? 'Felhasználók', $group);
        (new Permissions($workspace, $accounts, $accounts->identities($identities), $definition['protected_role'] ?? 'admin'))->register($workspace->registry, $group);
        return $accounts;
    }
}
