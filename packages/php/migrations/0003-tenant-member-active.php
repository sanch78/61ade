<?php
declare(strict_types=1);

/**
 * Explicit removal of the membership switch `blade_tenant_members.active`; never loaded from an HTTP request or an
 * installer. Run it before Tenancy::install() on a database created before 2026-10-30. It deletes the suspended rows
 * (`active <> 1`, which grant nothing) and then drops the column; access is the existence of the membership row.
 * SQLite (3.35+) runs both in one transaction; MySQL commits the delete before the ALTER, so a failed ALTER is
 * finished by a re-run. A no-op without the table or the column.
 * @return array{deleted:int,dropped:bool}
 */
return static function (PDO $db): array {
    if ($db->inTransaction()) throw new LogicException('Run the migration outside a transaction.');
    $mysql = $db->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql';
    $columns = $mysql
        ? $db->query("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='blade_tenant_members'")->fetchAll(PDO::FETCH_COLUMN)
        : array_column($db->query('PRAGMA table_info(blade_tenant_members)')->fetchAll(PDO::FETCH_ASSOC), 'name');
    if (!in_array('active', $columns, true)) return ['deleted' => 0, 'dropped' => false];
    $db->beginTransaction();
    try {
        $deleted = $db->exec('DELETE FROM blade_tenant_members WHERE active IS NULL OR active <> 1');
        if ($mysql) $db->commit();
        $db->exec('ALTER TABLE blade_tenant_members DROP COLUMN active');
        if ($db->inTransaction()) $db->commit();
        return ['deleted' => (int) $deleted, 'dropped' => true];
    } catch (Throwable $error) {
        if ($db->inTransaction()) $db->rollBack();
        throw $error;
    }
};
