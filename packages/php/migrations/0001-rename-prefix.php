<?php
declare(strict_types=1);

/** Explicit SQLite upgrade; never loaded from an HTTP request or Schema::install(). */
return static function (PDO $db, string $previousPrefix): int {
    if ($db->getAttribute(PDO::ATTR_DRIVER_NAME) !== 'sqlite') {
        throw new InvalidArgumentException('This migration supports SQLite only.');
    }
    if (!preg_match('/^[a-z][a-z0-9_]*$/D', $previousPrefix) || $previousPrefix === 'blade') {
        throw new InvalidArgumentException('Specify the previous framework prefix.');
    }
    if ($db->inTransaction()) throw new LogicException('Run the migration outside a transaction.');
    $suffixes = ['roles', 'memberships', 'rules', 'audit', 'tokens', 'versions', 'migrations',
        'auth_settings', 'login_challenges', 'account_state', 'remembered_logins'];
    $tables = $db->query("SELECT name FROM sqlite_master WHERE type='table'")->fetchAll(PDO::FETCH_COLUMN);
    $pending = [];
    foreach ($suffixes as $suffix) {
        $old = $previousPrefix.'_'.$suffix;
        if (!in_array($old, $tables, true)) continue;
        if (in_array('blade_'.$suffix, $tables, true)) throw new RuntimeException('Both table prefixes exist; refusing to merge.');
        $pending[$old] = 'blade_'.$suffix;
    }
    if (!$pending) return 0;
    if (count($pending) !== count($suffixes)) throw new RuntimeException('Incomplete source schema; migrate the complete framework database.');
    $resources = [];
    foreach (['users', 'roles', 'memberships', 'role_rules', 'user_rules', 'api_keys'] as $suffix) {
        $resources[$previousPrefix.'_'.$suffix] = 'blade_'.$suffix;
    }
    $fields = [];
    foreach (['disabled', 'must_change', 'oauth', 'locale', 'email_confirmation'] as $suffix) {
        $fields[$previousPrefix.'_'.$suffix] = 'blade_'.$suffix;
    }
    $db->beginTransaction();
    try {
        // SQLite cannot rename indexes. Recreate only framework-owned indexes in this transaction.
        $indexes = $db->query("SELECT name,tbl_name,sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL")->fetchAll(PDO::FETCH_ASSOC);
        foreach ($indexes as $index) {
            if (!isset($pending[$index['tbl_name']]) || !str_starts_with($index['name'], $previousPrefix.'_')) continue;
            $db->exec('DROP INDEX "'.str_replace('"', '""', $index['name']).'"');
        }
        foreach ($pending as $old => $new) $db->exec("ALTER TABLE $old RENAME TO $new");
        foreach ($indexes as $index) {
            if (!isset($pending[$index['tbl_name']]) || !str_starts_with($index['name'], $previousPrefix.'_')) continue;
            $db->exec(str_replace($previousPrefix.'_', 'blade_', $index['sql']));
        }
        foreach (['blade_rules' => ['resource' => $resources, 'field_name' => $fields], 'blade_audit' => ['resource' => $resources]] as $table => $columns) {
            foreach ($columns as $column => $mapping) {
                $query = $db->prepare("UPDATE $table SET $column=? WHERE $column=?");
                foreach ($mapping as $old => $new) $query->execute([$new, $old]);
            }
        }
        $rows = $db->query('SELECT id,field_names FROM blade_audit')->fetchAll(PDO::FETCH_ASSOC);
        $update = $db->prepare('UPDATE blade_audit SET field_names=? WHERE id=?');
        foreach ($rows as $row) {
            $names = json_decode($row['field_names'], true, flags: JSON_THROW_ON_ERROR);
            $renamed = array_map(static fn($name) => $fields[$name] ?? $name, $names);
            if ($names !== $renamed) $update->execute([json_encode($renamed, JSON_THROW_ON_ERROR), $row['id']]);
        }
        $rows = $db->query('SELECT id,scopes FROM blade_tokens')->fetchAll(PDO::FETCH_ASSOC);
        $update = $db->prepare('UPDATE blade_tokens SET scopes=? WHERE id=?');
        foreach ($rows as $row) {
            $json = str_starts_with($row['scopes'], '[');
            $scopes = $json ? json_decode($row['scopes'], true, flags: JSON_THROW_ON_ERROR) : explode(',', $row['scopes']);
            $renamed = array_map(static function ($scope) use ($resources) {
                [$resource, $action] = array_pad(explode('.', $scope, 2), 2, null);
                return ($resources[$resource] ?? $resource).($action !== null ? '.'.$action : '');
            }, $scopes);
            if ($scopes !== $renamed) $update->execute([$json ? json_encode($renamed, JSON_THROW_ON_ERROR) : implode(',', $renamed), $row['id']]);
        }
        $db->commit();
        return count($pending);
    } catch (Throwable $error) {
        if ($db->inTransaction()) $db->rollBack();
        throw $error;
    }
};
