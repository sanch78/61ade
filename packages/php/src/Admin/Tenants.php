<?php

declare(strict_types=1);

namespace Blade\Admin;

use Blade\Feature\{Action, Context, Failure, Field, ListSource, Registry, SqlResource};
use Blade\Tenancy\Tenancy;

/**
 * Tenant administration of an application with tenancy: create, rename and deactivate tenants (no delete). Each
 * tenant expands to its access list (a non-selectable sub-view): every visible account with one access switch.
 * Tenant records are global; their management is an ordinary audited, ACL-checked resource. A deactivated tenant
 * drops out of every membership on the members' next request.
 */
final class Tenants
{
    public static function register(Registry $registry, Accounts $accounts, Tenancy $tenancy, string $title = 'Tenantok', ?string $group = 'Adminisztráció'): void
    {
        $resource = new SqlResource(Tenancy::RESOURCE, 'blade_tenants', 'id', [
            new Field('name', 'Név', required: true, max: 200, validation: ['unique' => true]),
            new Field('active', 'Aktív', 'checkbox', defaultValue: '1', column: ['editable' => true, 'align' => 'center', 'width' => 100]),
        ]);
        $registry->updateView($resource->register($registry, $title, group: $group)->with(icon: 'dxi dxi-view-grid'));
        self::registerAccess($registry, $accounts, $tenancy, $group);
    }

    /**
     * Tenant access list (resource Tenancy::MEMBERS): one row per tenant and account the actor may list (Accounts
     * lookup ACL), id "<tenant>:<actor>", with the single flag `access` = a membership row. Switching it on
     * inserts the membership, off deletes the row. The only write is the audited,
     * ACL-checked single-field edit (`__edit` / update); there is no create, form or delete. The sub-view count is the
     * number of accounts with access.
     */
    private static function registerAccess(Registry $registry, Accounts $accounts, Tenancy $tenancy, ?string $group): void
    {
        $fields = [
            new Field('tenant_id', 'Tenant', 'select', required: true, max: 100, options: $tenancy->lookup()->options(...)),
            new Field('blade_email', 'E-mail', max: 320),
            new Field('blade_name', 'Név', max: 200),
            new Field('access', 'Hozzáférés', 'checkbox', column: ['editable' => true, 'align' => 'center', 'width' => 130]),
        ];
        $source = static function (Context $ctx) use ($accounts): string {
            $key = $ctx->db->getAttribute(\PDO::ATTR_DRIVER_NAME) === 'mysql' ? "CONCAT(CAST(t.id AS CHAR), ':', a.actor_id)" : "CAST(t.id AS CHAR) || ':' || a.actor_id";
            return "(SELECT $key AS blade_key, CAST(t.id AS CHAR) AS tenant_id, a.actor_id, a.blade_email, a.blade_name, CASE WHEN m.id IS NULL THEN '0' ELSE '1' END AS access"
                ." FROM blade_tenants t CROSS JOIN {$accounts->visibleSql($ctx)} a LEFT JOIN blade_tenant_members m ON m.tenant_id = CAST(t.id AS CHAR) AND m.actor_id = a.actor_id) blade_access";
        };
        $revision = static fn(array $row): string => hash('sha256', $row['tenant_id'].':'.$row['actor_id'].':'.$row['access']);
        $project = static function (Context $ctx, array $row) use ($registry, $fields, $revision): array {
            $id = (string) $row['blade_key'];
            $out = ['id' => $id, 'revision' => $revision($row)];
            foreach ($fields as $field) if ($ctx->acl->fieldAllowed($ctx->actor->id, Tenancy::MEMBERS, 'list', $ctx->channel, $id, null, $field->name)) $out[$field->name] = (string) $row[$field->name];
            $out['_actions'] = $ctx->acl->allows($ctx->actor->id, Tenancy::MEMBERS, 'update', $ctx->channel, $id, null) ? ['update'] : [];
            $out['_editable'] = $out['_actions'] && array_key_exists('access', $out) && $ctx->acl->fieldAllowed($ctx->actor->id, Tenancy::MEMBERS, 'update', $ctx->channel, $id, null, 'access') ? ['access'] : [];
            return $out;
        };
        $list = new ListSource(Tenancy::MEMBERS, 'blade_tenant_members', 'blade_key', $fields, null, '1=1', $project, $source, ['blade_email', 'blade_name'], $registry, countWhere: "access = '1'");
        $registry->registerFields(Tenancy::MEMBERS, $fields);
        $registry->add(new Action(Tenancy::MEMBERS, 'list', 'Lista', [], static fn(Context $c, $t, array $values) => $list->read($c, $values), collection: true, listSource: $list));
        // The target is a tenant the actor may list and an account of the visible set; the row is the membership state.
        $resolve = static function (Context $ctx, ?string $id) use ($accounts, $tenancy): array {
            if ($id === null || !preg_match('/^([0-9]{1,20}):([a-zA-Z0-9_.:-]{1,79})$/D', $id, $match)) throw new Failure('Nem található objektum.', 404);
            [, $tenant, $actor] = $match;
            // Without the update right the executor refuses it (403) before anything about the pair is looked up.
            if (!$ctx->acl->allows($ctx->actor->id, Tenancy::MEMBERS, 'update', $ctx->channel, $id, null)) return ['id' => $id, 'owner' => null];
            if (!isset($tenancy->lookup()->options($ctx)[$tenant]) || !isset($accounts->lookup()->options($ctx)[$actor])) throw new Failure('Nem található objektum.', 404);
            $q = $ctx->db->prepare('SELECT id FROM blade_tenant_members WHERE tenant_id = ? AND actor_id = ?');
            $q->execute([$tenant, $actor]);
            $member = $q->fetch(\PDO::FETCH_ASSOC) ?: null;
            return ['id' => $id, 'owner' => null, 'row' => ['tenant_id' => $tenant, 'actor_id' => $actor, 'access' => $member ? '1' : '0', 'member' => $member], 'audit' => ['tenant_id' => $tenant, 'actor_id' => $actor]];
        };
        $save = static function (Context $ctx, array $target, array $values) use ($revision): array {
            $row = $target['row'];
            if (!hash_equals($revision($row), (string) ($values['revision'] ?? ''))) throw new Failure('Az adat közben módosult. Nyisd meg újra.', 409);
            if (!array_key_exists('access', $values)) throw new Failure('Nincs módosítás.');
            $access = (string) $values['access'] === '1' ? '1' : '0';
            if ($access === '1') {
                if ($row['member'] === null) $ctx->db->prepare('INSERT INTO blade_tenant_members (tenant_id, actor_id) VALUES (?, ?)')->execute([$row['tenant_id'], $row['actor_id']]);
            } else $ctx->db->prepare('DELETE FROM blade_tenant_members WHERE tenant_id = ? AND actor_id = ?')->execute([$row['tenant_id'], $row['actor_id']]);
            $ctx->acl->invalidate();
            return ['id' => $target['id'], 'revision' => $revision([...$row, 'access' => $access]), 'values' => ['access' => $access], 'audit' => ['access' => $access]];
        };
        $registry->add(new Action(Tenancy::MEMBERS, 'update', 'Mentés', [$fields[3], new Field('revision', 'Verzió', required: true, max: 64)], $save, resolve: $resolve, write: true, editHandler: $save));
        $registry->view(Tenancy::MEMBERS, 'Hozzáférések', array_map(static fn($f) => ['id' => $f->name, 'header' => $f->label], $fields), ['update'], group: $group);
        $registry->subview(Tenancy::RESOURCE, Tenancy::MEMBERS, 'tenant_id', select: false);
    }
}
