<?php
declare(strict_types=1);
namespace Blade\Infrastructure;

final class Transaction
{
    /**
     * Action transactions always write (at least audit). SQLite therefore takes the write lock up
     * front: a deferred reader that upgrades later fails at once with SQLITE_BUSY when another
     * request writes concurrently, while IMMEDIATE waits for the lock within the busy timeout.
     */
    public static function begin(\PDO $db): void
    {
        if ($db->getAttribute(\PDO::ATTR_DRIVER_NAME) === 'sqlite') $db->exec('BEGIN IMMEDIATE');
        else $db->beginTransaction();
    }
}
