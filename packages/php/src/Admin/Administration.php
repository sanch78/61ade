<?php

declare(strict_types=1);

namespace Blade\Admin;

use Blade\Feature\Workspace;
use Blade\Shell\IdentityProvider;

/**
 * The mandatory administration every 61ade application starts with: users, roles,
 * memberships and role/user rules, with the API-key view registered at the root. With tenancy on the
 * workspace it adds the tenant view, tenant memberships on the Users form and tenant-bound API keys.
 * Returns the managed identity provider that the application definition must use.
 */
final class Administration
{
    public static function register(
        Workspace $workspace,
        Accounts $accounts,
        IdentityProvider $identities,
        string $usersTitle = 'Felhasználók',
        ?string $group = 'Adminisztráció',
        string $protectedRole = 'admin',
    ): IdentityProvider {
        $accounts->register($workspace->registry, $usersTitle, $group);
        // Tenancy (optional): tenant records and members; the Users form gains the tenant memberships.
        if ($workspace->tenancy) Tenants::register($workspace->registry, $accounts, group: $group);
        $managed = $accounts->identities($identities);
        $permissions = new Permissions($workspace, $accounts, $managed, $protectedRole);
        $permissions->register($workspace->registry, $group);
        // API keys are a first-class workspace feature. Their own ACL rules
        // determine whether the top-level menu item is visible to each actor.
        (new ApiKeys($accounts, $permissions->catalogue(), tenancy: $workspace->tenancy))->register($workspace->registry);
        return $managed;
    }
}
