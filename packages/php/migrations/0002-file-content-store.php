<?php
declare(strict_types=1);

use Blade\Files\{ContentStore, MediaProbe, Thumbnails};
use Blade\Infrastructure\Transaction;
use Blade\Tasks\TaskQueue;

/**
 * Explicit move of `blade_files.content` BLOBs into the content store; never loaded from an HTTP
 * request or an installer. Run FileStorage::install() first (it adds the content columns).
 * $stores maps file space => ContentStore. Steps:
 * - `migrate`: streams every file row without a storage key to its store in 1 MiB chunks, checks the
 *   size, records key, hash and media metadata in a per-row transaction together with the ledger row
 *   (`blade_file_content_migration`: file id => hash of the migrated BLOB) and queues the thumbnail.
 *   Resumable and idempotent; a no-op without the content column. A row changed meanwhile is skipped
 *   and the content written for it is left to the collection task.
 * - `verify`: every file row's current store file exists with its size and hash, and a remaining BLOB
 *   matches the hash recorded when it was migrated (the file may have been replaced since). Never
 *   changes data.
 * - `drop`: verifies, refuses on any failure, then drops the content column and the ledger. A no-op once dropped.
 * @return array{migrated:int,verified:int,failed:list<int>,dropped:bool}
 */
return static function (PDO $db, array $stores, string $step = 'migrate', ?Closure $log = null): array {
    if (!in_array($step, ['migrate', 'verify', 'drop'], true)) throw new InvalidArgumentException('Unknown migration step.');
    if ($db->inTransaction()) throw new LogicException('Run the migration outside a transaction.');
    foreach ($stores as $space => $store) if (!$store instanceof ContentStore || $store->space !== $space) throw new InvalidArgumentException('Map each file space to its content store.');
    $log ??= static function (string $message): void {};
    $mysql = $db->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql';
    $report = ['migrated' => 0, 'verified' => 0, 'failed' => [], 'dropped' => false];
    $columns = $mysql ? $db->query("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='blade_files'")->fetchAll(PDO::FETCH_COLUMN)
        : array_column($db->query('PRAGMA table_info(blade_files)')->fetchAll(PDO::FETCH_ASSOC), 'name');
    if (!$columns) return $report;
    if (!in_array('storage_key', $columns, true)) throw new RuntimeException('Run FileStorage::install() before this migration.');
    $blob = in_array('content', $columns, true);
    $ledgerExists = static function () use ($db, $mysql): bool {
        $q = $db->prepare($mysql ? 'SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?' : "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?");
        $q->execute(['blade_file_content_migration']);
        return (bool) $q->fetchColumn();
    };
    $chunk = 1048576;
    // SQLite substr() counts bytes only on BLOB values; the cast keeps text-typed rows byte-exact.
    $part = !$blob ? null : $db->prepare($mysql ? 'SELECT SUBSTRING(content, ?, ?) FROM blade_files WHERE id=?' : 'SELECT substr(CAST(content AS BLOB), ?, ?) FROM blade_files WHERE id=?');
    $read = static function (int $id, Closure $write) use ($part, $chunk): void {
        for ($offset = 1; ; $offset += $chunk) {
            $part->execute([$offset, $chunk, $id]);
            $value = $part->fetchColumn();
            $part->closeCursor();
            $bytes = is_resource($value) ? (string) stream_get_contents($value) : (string) $value;
            if ($bytes !== '') $write($bytes);
            if (strlen($bytes) < $chunk) return;
        }
    };
    $verify = static function () use ($db, $stores, $blob, $read, $ledgerExists, &$report, $log): void {
        $hasBlob = $blob ? $db->prepare('SELECT COUNT(*) FROM blade_files WHERE id=? AND content IS NOT NULL') : null;
        $ledger = $blob && $ledgerExists() ? $db->query('SELECT file_id, sha256 FROM blade_file_content_migration')->fetchAll(PDO::FETCH_KEY_PAIR) : [];
        foreach ($db->query("SELECT id, space, size, storage_key, sha256 FROM blade_files WHERE kind='file' ORDER BY id")->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $id = (int) $row['id'];
            $store = $stores[$row['space']] ?? null;
            $ok = $store && ContentStore::valid($row['storage_key']) && basename($row['storage_key']) === $row['sha256'] && $store->exists($row['storage_key']);
            if ($ok) {
                $path = $store->path($row['storage_key']);
                clearstatcache(true, $path);
                $ok = filesize($path) === (int) $row['size'] && hash_file('sha256', $path) === $row['sha256'];
            }
            if ($ok && $hasBlob) {
                $hasBlob->execute([$id]);
                if ($hasBlob->fetchColumn()) {
                    $hash = hash_init('sha256');
                    $read($id, static function (string $bytes) use ($hash): void { hash_update($hash, $bytes); });
                    $ok = hash_final($hash) === ($ledger[$id] ?? $row['sha256']);
                }
            }
            if ($ok) $report['verified']++;
            else {
                $report['failed'][] = $id;
                $log('verify failed: file '.$id);
            }
        }
    };

    if ($step === 'migrate') {
        if (!$blob) return $report;
        $pending = $db->query("SELECT id, space, size, mime_type, revision FROM blade_files WHERE kind='file' AND storage_key='' ORDER BY id")->fetchAll(PDO::FETCH_ASSOC);
        $missing = array_diff(array_unique(array_column($pending, 'space')), array_keys($stores));
        if ($missing) throw new RuntimeException('No content store for file space: '.implode(', ', $missing).'.');
        $probe = new MediaProbe();
        $tasks = new TaskQueue($db);
        $db->exec('CREATE TABLE IF NOT EXISTS blade_file_content_migration (file_id BIGINT NOT NULL PRIMARY KEY, sha256 CHAR(64) NOT NULL)'.($mysql ? ' ENGINE=InnoDB' : ''));
        $ledger = $db->prepare('INSERT INTO blade_file_content_migration (file_id, sha256) VALUES (?,?)');
        $forget = $db->prepare('DELETE FROM blade_file_content_migration WHERE file_id=?');
        $collect = static fn(string $space, string $key) => $tasks->enqueue('files.collect', ['space' => $space, 'key' => $key], 'files.collect:'.$space.':'.$key);
        $update = $db->prepare("UPDATE blade_files SET storage_key=?, sha256=?, width=?, height=?, duration_ms=?, orientation=? WHERE id=? AND storage_key=''");
        foreach ($pending as $row) {
            $id = (int) $row['id'];
            $store = $stores[$row['space']];
            $temporary = $store->temporary();
            $file = fopen($temporary, 'xb');
            if ($file === false) throw new RuntimeException('Cannot write a temporary file.');
            try {
                $read($id, static function (string $bytes) use ($file): void { if (fwrite($file, $bytes) !== strlen($bytes)) throw new RuntimeException('Cannot write a temporary file.'); });
            } finally {
                fclose($file);
            }
            $content = $store->put($temporary, true);
            if ($content['size'] !== (int) $row['size']) {
                if ($content['created']) $collect($row['space'], $content['key']);
                $report['failed'][] = $id;
                $log('migrate failed: file '.$id.' size differs');
                continue;
            }
            $meta = $probe->probe($store->path($content['key']), $row['mime_type']);
            Transaction::begin($db);
            try {
                $update->execute([$content['key'], $content['sha256'], $meta['width'], $meta['height'], $meta['duration_ms'], $meta['orientation'], $id]);
                $updated = $update->rowCount() === 1;
                if ($updated) {
                    $forget->execute([$id]);
                    $ledger->execute([$id, $content['sha256']]);
                    if (Thumbnails::supports($row['mime_type'])) $tasks->enqueue('files.thumbnail', ['space' => $row['space'], 'file_id' => $id, 'revision' => (int) $row['revision']], Thumbnails::dedupe($row['space'], $id, (int) $row['revision']));
                } elseif ($content['created']) $collect($row['space'], $content['key']);
                $db->commit();
            } catch (Throwable $error) {
                if ($db->inTransaction()) $db->rollBack();
                throw $error;
            }
            if (!$updated) {
                $log('migrate skipped: file '.$id.' changed meanwhile');
                continue;
            }
            $report['migrated']++;
        }
        $log('migrated '.$report['migrated'].' file(s)');
        return $report;
    }
    $verify();
    if ($step === 'verify') return $report;
    if (!$blob) {
        if ($ledgerExists()) $db->exec('DROP TABLE blade_file_content_migration');
        return $report;
    }
    if ($report['failed']) throw new RuntimeException('Content verification failed for '.count($report['failed']).' file(s); the content column is kept.');
    $db->exec('ALTER TABLE blade_files DROP COLUMN content');
    if ($ledgerExists()) $db->exec('DROP TABLE blade_file_content_migration');
    $report['dropped'] = true;
    $log('dropped blade_files.content');
    return $report;
};
