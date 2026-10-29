<?php

declare(strict_types=1);

namespace Blade\Admin;

use Blade\Feature\{Field, Registry, SqlResource};
use Blade\Tenancy\Tenancy;

/**
 * Tenant administration of an application with tenancy: create, rename and deactivate tenants (no delete) and
 * edit their members. Tenant records are global; their management is an ordinary audited, ACL-checked resource.
 * A deactivated tenant drops out of every membership on the members' next request.
 */
final class Tenants
{
    public static function register(Registry $registry, Accounts $accounts, string $title = 'Tenantok', ?string $group = 'Adminisztráció'): void
    {
        $resource = new SqlResource(Tenancy::RESOURCE, 'blade_tenants', 'id', [
            new Field('name', 'Név', required: true, max: 200, validation: ['unique' => true]),
            new Field('active', 'Aktív', 'checkbox', defaultValue: '1', column: ['editable' => true, 'align' => 'center', 'width' => 100]),
            new Field('members', 'Tagok', 'multiselect', max: 4000, options: $accounts->lookup()->options(...), column: ['secondary' => true]),
        ], related: [Tenancy::members(false, 'members')]);
        $resource->register($registry, $title, group: $group);
        foreach ($registry->views() as $view) {
            if ($view['resource'] === Tenancy::RESOURCE) $registry->view(Tenancy::RESOURCE, $view['title'], $view['columns'], $view['actions'], group: $view['group'], layout: $view['layout'], icon: 'dxi dxi-view-grid');
        }
    }
}
