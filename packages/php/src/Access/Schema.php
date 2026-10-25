<?php
declare(strict_types=1);
namespace Blade\Access;

/** Explicit installer; never run migrations as a request side effect. */
final class Schema
{
    public static function install(\PDO $db): void
    {
        $auto = $db->getAttribute(\PDO::ATTR_DRIVER_NAME) === 'mysql' ? 'BIGINT PRIMARY KEY AUTO_INCREMENT' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
        foreach ([
            "CREATE TABLE IF NOT EXISTS blade_roles (id $auto, name VARCHAR(100) NOT NULL UNIQUE, role_key VARCHAR(100) UNIQUE)",
            "CREATE TABLE IF NOT EXISTS blade_memberships (id $auto, actor_id VARCHAR(100) NOT NULL, role_id BIGINT NOT NULL, UNIQUE(actor_id, role_id))",
            "CREATE TABLE IF NOT EXISTS blade_rules (id $auto, subject_type VARCHAR(10) NOT NULL, subject_id VARCHAR(100) NOT NULL, resource VARCHAR(100) NOT NULL, action VARCHAR(100) NOT NULL, channel VARCHAR(10) NOT NULL, effect VARCHAR(10) NOT NULL, scope VARCHAR(10) NOT NULL, object_id VARCHAR(100) NOT NULL DEFAULT '', field_name VARCHAR(100) NOT NULL DEFAULT '')",
            "CREATE TABLE IF NOT EXISTS blade_audit (id $auto, occurred_at VARCHAR(30) NOT NULL, request_id VARCHAR(40) NOT NULL, actor_id VARCHAR(100) NOT NULL, channel VARCHAR(10) NOT NULL, resource VARCHAR(100) NOT NULL, action VARCHAR(100) NOT NULL, object_id VARCHAR(100) NOT NULL, outcome VARCHAR(30) NOT NULL, field_names TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '{}')",
            "CREATE TABLE IF NOT EXISTS blade_tokens (id $auto, actor_id VARCHAR(100) NOT NULL, label VARCHAR(100) NOT NULL, token_hash VARCHAR(64) NOT NULL UNIQUE, scopes TEXT NOT NULL, expires_at VARCHAR(30) NOT NULL, revoked INTEGER NOT NULL DEFAULT 0)",
            "CREATE TABLE IF NOT EXISTS blade_versions (actor_id VARCHAR(100) PRIMARY KEY, version INTEGER NOT NULL DEFAULT 1)",
            "CREATE TABLE IF NOT EXISTS blade_migrations (name VARCHAR(100) PRIMARY KEY)",
            "CREATE TABLE IF NOT EXISTS blade_auth_settings (actor_id VARCHAR(100) PRIMARY KEY, email_confirmation INTEGER NOT NULL DEFAULT 1)",
            "CREATE TABLE IF NOT EXISTS blade_login_challenges (id VARCHAR(64) PRIMARY KEY, actor_id VARCHAR(100) NOT NULL, code_hash VARCHAR(64) NOT NULL, binding_hash VARCHAR(64) NOT NULL, email_hash VARCHAR(64) NOT NULL, credential_version INTEGER NOT NULL, remember_login INTEGER NOT NULL DEFAULT 0, created_at BIGINT NOT NULL, expires_at BIGINT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, consumed INTEGER NOT NULL DEFAULT 0)",
            "CREATE TABLE IF NOT EXISTS blade_account_state (actor_id VARCHAR(100) PRIMARY KEY, disabled INTEGER NOT NULL DEFAULT 0, must_change_password INTEGER NOT NULL DEFAULT 0, temporary_expires_at BIGINT NOT NULL DEFAULT 0, oauth_allowed INTEGER NOT NULL DEFAULT 0, locale VARCHAR(16) NOT NULL DEFAULT '')",
            "CREATE TABLE IF NOT EXISTS blade_remembered_logins (selector VARCHAR(32) PRIMARY KEY, actor_id VARCHAR(100) NOT NULL, secret_hash VARCHAR(64) NOT NULL, credential_version INTEGER NOT NULL, expires_at BIGINT NOT NULL)",
        ] as $sql) $db->exec($sql.($db->getAttribute(\PDO::ATTR_DRIVER_NAME)==='mysql'?' ENGINE=InnoDB':''));
        // Additive upgrades of tables created by earlier releases; existing values stay untouched.
        foreach ([
            ['blade_account_state', 'oauth_allowed', 'INTEGER NOT NULL DEFAULT 0'],
            ['blade_account_state', 'locale', "VARCHAR(16) NOT NULL DEFAULT ''"],
            ['blade_audit', 'detail', "TEXT NOT NULL DEFAULT '{}'"],
        ] as [$table, $column, $definition]) {
            if (!in_array($column, self::columns($db, $table), true)) $db->exec("ALTER TABLE $table ADD COLUMN $column $definition");
        }
        foreach(['blade_rules_lookup'=>['blade_rules','resource,action,channel,subject_type,subject_id'], 'blade_audit_actor_action'=>['blade_audit','actor_id,resource,action,occurred_at'], 'blade_challenge_actor'=>['blade_login_challenges','actor_id,created_at'], 'blade_remember_actor'=>['blade_remembered_logins','actor_id,expires_at']] as $name=>[$table,$columns]){
            if($db->getAttribute(\PDO::ATTR_DRIVER_NAME)==='mysql'){
                $q=$db->prepare('SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND INDEX_NAME=?');$q->execute([$table,$name]);
                if(!$q->fetchColumn())$db->exec("CREATE INDEX $name ON $table ($columns)");
            }else $db->exec("CREATE INDEX IF NOT EXISTS $name ON $table ($columns)");
        }
    }

    private static function columns(\PDO $db, string $table): array
    {
        if ($db->getAttribute(\PDO::ATTR_DRIVER_NAME) === 'mysql') {
            $query = $db->prepare('SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?');
            $query->execute([$table]);
            return $query->fetchAll(\PDO::FETCH_COLUMN);
        }
        return array_column($db->query("PRAGMA table_info($table)")->fetchAll(\PDO::FETCH_ASSOC), 'name');
    }
}
