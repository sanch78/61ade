<?php
declare(strict_types=1);
namespace Vapa\Access;

/** Explicit installer; never run migrations as a request side effect. */
final class Schema
{
    public static function install(\PDO $db): void
    {
        $auto = $db->getAttribute(\PDO::ATTR_DRIVER_NAME) === 'mysql' ? 'BIGINT PRIMARY KEY AUTO_INCREMENT' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
        foreach ([
            "CREATE TABLE IF NOT EXISTS vapa_roles (id $auto, name VARCHAR(100) NOT NULL UNIQUE, role_key VARCHAR(100) UNIQUE)",
            "CREATE TABLE IF NOT EXISTS vapa_memberships (id $auto, actor_id VARCHAR(100) NOT NULL, role_id BIGINT NOT NULL, UNIQUE(actor_id, role_id))",
            "CREATE TABLE IF NOT EXISTS vapa_rules (id $auto, subject_type VARCHAR(10) NOT NULL, subject_id VARCHAR(100) NOT NULL, resource VARCHAR(100) NOT NULL, action VARCHAR(100) NOT NULL, channel VARCHAR(10) NOT NULL, effect VARCHAR(10) NOT NULL, scope VARCHAR(10) NOT NULL, object_id VARCHAR(100) NOT NULL DEFAULT '', field_name VARCHAR(100) NOT NULL DEFAULT '')",
            "CREATE TABLE IF NOT EXISTS vapa_audit (id $auto, occurred_at VARCHAR(30) NOT NULL, request_id VARCHAR(40) NOT NULL, actor_id VARCHAR(100) NOT NULL, channel VARCHAR(10) NOT NULL, resource VARCHAR(100) NOT NULL, action VARCHAR(100) NOT NULL, object_id VARCHAR(100) NOT NULL, outcome VARCHAR(30) NOT NULL, field_names TEXT NOT NULL)",
            "CREATE TABLE IF NOT EXISTS vapa_tokens (id $auto, actor_id VARCHAR(100) NOT NULL, label VARCHAR(100) NOT NULL, token_hash VARCHAR(64) NOT NULL UNIQUE, scopes TEXT NOT NULL, expires_at VARCHAR(30) NOT NULL, revoked INTEGER NOT NULL DEFAULT 0)",
            "CREATE TABLE IF NOT EXISTS vapa_versions (actor_id VARCHAR(100) PRIMARY KEY, version INTEGER NOT NULL DEFAULT 1)",
            "CREATE TABLE IF NOT EXISTS vapa_migrations (name VARCHAR(100) PRIMARY KEY)",
            "CREATE TABLE IF NOT EXISTS vapa_auth_settings (actor_id VARCHAR(100) PRIMARY KEY, email_confirmation INTEGER NOT NULL DEFAULT 1)",
            "CREATE TABLE IF NOT EXISTS vapa_login_challenges (id VARCHAR(64) PRIMARY KEY, actor_id VARCHAR(100) NOT NULL, code_hash VARCHAR(64) NOT NULL, binding_hash VARCHAR(64) NOT NULL, email_hash VARCHAR(64) NOT NULL, credential_version INTEGER NOT NULL, remember_login INTEGER NOT NULL DEFAULT 0, created_at BIGINT NOT NULL, expires_at BIGINT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, consumed INTEGER NOT NULL DEFAULT 0)",
            "CREATE TABLE IF NOT EXISTS vapa_account_state (actor_id VARCHAR(100) PRIMARY KEY, disabled INTEGER NOT NULL DEFAULT 0, must_change_password INTEGER NOT NULL DEFAULT 0, temporary_expires_at BIGINT NOT NULL DEFAULT 0)",
            "CREATE TABLE IF NOT EXISTS vapa_remembered_logins (selector VARCHAR(32) PRIMARY KEY, actor_id VARCHAR(100) NOT NULL, secret_hash VARCHAR(64) NOT NULL, credential_version INTEGER NOT NULL, expires_at BIGINT NOT NULL)",
        ] as $sql) $db->exec($sql.($db->getAttribute(\PDO::ATTR_DRIVER_NAME)==='mysql'?' ENGINE=InnoDB':''));
        foreach(['vapa_rules_lookup'=>['vapa_rules','resource,action,channel,subject_type,subject_id'], 'vapa_audit_actor_action'=>['vapa_audit','actor_id,resource,action,occurred_at'], 'vapa_challenge_actor'=>['vapa_login_challenges','actor_id,created_at'], 'vapa_remember_actor'=>['vapa_remembered_logins','actor_id,expires_at']] as $name=>[$table,$columns]){
            if($db->getAttribute(\PDO::ATTR_DRIVER_NAME)==='mysql'){
                $q=$db->prepare('SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND INDEX_NAME=?');$q->execute([$table,$name]);
                if(!$q->fetchColumn())$db->exec("CREATE INDEX $name ON $table ($columns)");
            }else $db->exec("CREATE INDEX IF NOT EXISTS $name ON $table ($columns)");
        }
    }
}
