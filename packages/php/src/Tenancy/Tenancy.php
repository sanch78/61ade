<?php
declare(strict_types=1);
namespace Blade\Tenancy;

use Blade\Feature\{Failure, Field, Lookup, RelatedSet};

/**
 * Optional multi-tenancy (organizations are the same concept): framework-owned tenants, memberships between actors
 * and tenants, and the server-side resolution of the active tenant. Roles and rules stay global; membership is a
 * separate gate. An application without a Tenancy instance on its Workspace has no tenant tables, fields or checks.
 */
final class Tenancy
{
    public const RESOURCE = 'blade_tenants';
    public const MEMBERS = 'blade_tenant_members';

    public function __construct(private \PDO $db) {}

    /** Explicit installer step (never a request side effect): tenant tables and the tenant columns of audit and tokens. */
    public static function install(\PDO $db): void
    {
        $mysql = $db->getAttribute(\PDO::ATTR_DRIVER_NAME) === 'mysql';
        $auto = $mysql ? 'BIGINT PRIMARY KEY AUTO_INCREMENT' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
        foreach ([
            "CREATE TABLE IF NOT EXISTS blade_tenants (id $auto, name VARCHAR(200) NOT NULL UNIQUE, active INTEGER NOT NULL DEFAULT 1)",
            "CREATE TABLE IF NOT EXISTS blade_tenant_members (id $auto, tenant_id VARCHAR(100) NOT NULL, actor_id VARCHAR(100) NOT NULL, UNIQUE(tenant_id, actor_id))",
        ] as $sql) $db->exec($sql.($mysql ? ' ENGINE=InnoDB' : ''));
        $columns = static function (string $table) use ($db, $mysql): array {
            if (!$mysql) return array_column($db->query("PRAGMA table_info($table)")->fetchAll(\PDO::FETCH_ASSOC), 'name');
            $q = $db->prepare('SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?');$q->execute([$table]);
            return $q->fetchAll(\PDO::FETCH_COLUMN);
        };
        foreach (['blade_audit', 'blade_tokens'] as $table) {
            $known = $columns($table);
            if (!$known) throw new \LogicException("Install the access schema before tenancy ($table is missing).");
            if (!in_array('tenant_id', $known, true)) $db->exec("ALTER TABLE $table ADD COLUMN tenant_id VARCHAR(100) NOT NULL DEFAULT ''");
        }
        // A membership is its row. A database from before 2026-10-30 still has the removed `active` switch, whose
        // suspended rows would grant access now: refuse until migration 0003 deleted them and dropped the column.
        if (in_array('active', $columns('blade_tenant_members'), true)) throw new \LogicException('Run packages/php/migrations/0003-tenant-member-active.php before Tenancy::install().');
        $index = $mysql ? 'SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND INDEX_NAME=?' : null;
        if ($index) {
            $q = $db->prepare($index);$q->execute(['blade_tenant_members', 'blade_tenant_members_actor']);
            if (!$q->fetchColumn()) $db->exec('CREATE INDEX blade_tenant_members_actor ON blade_tenant_members (actor_id, tenant_id)');
        } else $db->exec('CREATE INDEX IF NOT EXISTS blade_tenant_members_actor ON blade_tenant_members (actor_id, tenant_id)');
    }

    /** Setup helper: the tenant id of $name, created when missing. */
    public static function ensure(\PDO $db, string $name): string
    {
        $q = $db->prepare('SELECT id FROM blade_tenants WHERE name = ?');$q->execute([$name]);
        $id = $q->fetchColumn();
        if ($id !== false) return (string) $id;
        $db->prepare('INSERT INTO blade_tenants (name) VALUES (?)')->execute([$name]);
        return (string) $db->lastInsertId();
    }

    /** Setup helper: adds a membership; idempotent. */
    public static function join(\PDO $db, string $tenant, string $actor): void
    {
        $q = $db->prepare('SELECT COUNT(*) FROM blade_tenant_members WHERE tenant_id = ? AND actor_id = ?');$q->execute([$tenant, $actor]);
        if (!$q->fetchColumn()) $db->prepare('INSERT INTO blade_tenant_members (tenant_id, actor_id) VALUES (?, ?)')->execute([$tenant, $actor]);
    }

    /** Active tenants of $actor, id => name, ordered by name; read fresh on every call. */
    public function memberships(string $actor): array
    {
        $q = $this->db->prepare('SELECT t.id, t.name FROM blade_tenants t JOIN blade_tenant_members m ON m.tenant_id = CAST(t.id AS CHAR) WHERE m.actor_id = ? AND t.active = 1 ORDER BY t.name, t.id');
        $q->execute([$actor]);
        return array_map('strval', array_column($q->fetchAll(\PDO::FETCH_ASSOC), 'name', 'id'));
    }

    public function member(string $actor, ?string $tenant): bool
    {
        if ($tenant === null || $tenant === '') return false;
        $q = $this->db->prepare('SELECT COUNT(*) FROM blade_tenants t JOIN blade_tenant_members m ON m.tenant_id = CAST(t.id AS CHAR) WHERE m.actor_id = ? AND m.tenant_id = ? AND t.active = 1');
        $q->execute([$actor, $tenant]);
        return (bool) $q->fetchColumn();
    }

    /** Shell selection: $requested while it is a membership, otherwise the first one by name, or null without any. */
    public function select(string $actor, ?string $requested): ?string
    {
        $memberships = $this->memberships($actor);
        if ($requested !== null && isset($memberships[$requested])) return $requested;
        return $memberships ? (string) array_key_first($memberships) : null;
    }

    /** ACL-scoped tenant choices for relation fields (the Users form, API keys). */
    public function lookup(): Lookup
    {
        return new Lookup(self::RESOURCE, 'blade_tenants', 'id', 'name');
    }

    /** Membership as a multiselect stored in blade_tenant_members, keyed by the actor ($byActor) or by the tenant. */
    public static function members(bool $byActor, string $field): RelatedSet
    {
        return $byActor ? new RelatedSet('blade_tenant_members', 'actor_id', $field, 'tenant_id') : new RelatedSet('blade_tenant_members', 'tenant_id', $field, 'actor_id');
    }

    /** Field of the Users form: the tenants an account belongs to. */
    public function membershipField(): Field
    {
        return new Field('blade_tenant_ids', 'Tenantok', 'multiselect', max: 4000, options: $this->lookup()->options(...), column: ['secondary' => true]);
    }
}
