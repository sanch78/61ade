<?php
declare(strict_types=1);
namespace Blade\Files;

use Blade\Feature\UploadPolicy;
use Blade\Infrastructure\Transaction;
use Blade\Tasks\TaskQueue;

/**
 * Framework-owned virtual file store: entries are `blade_files` rows; their content lives in the
 * content-addressed ContentStore (`storage_key`, `sha256`), never in the database, so copies share
 * content and nothing reaches a web root. This class owns all SQL of `blade_files` and
 * `blade_file_derivatives`. Released content is collected by the `files.collect` task after commit.
 * A mount root has parent_id 0 and depth 0; names are unique per parent, case-insensitively.
 * Archived entries (`archived_at` set) are hidden from every read of this class as if deleted (live()); only
 * content collection still counts their references.
 */
final class FileStorage
{
    private const COLUMNS = 'id,mount_id,parent_id,kind,name,extension,mime_type,size,modified_at,revision,storage_key,sha256,width,height,duration_ms,orientation';
    /** Content columns; earlier tables receive them through ALTER TABLE. */
    private const CONTENT = ['storage_key' => "VARCHAR(80) NOT NULL DEFAULT ''", 'sha256' => "CHAR(64) NOT NULL DEFAULT ''", 'width' => 'INT NULL', 'height' => 'INT NULL', 'duration_ms' => 'BIGINT NULL', 'orientation' => "VARCHAR(10) NOT NULL DEFAULT ''",
        'archived_at' => 'VARCHAR(30) NULL', 'archived_by' => "VARCHAR(64) NOT NULL DEFAULT ''"];
    /** Listing sorts => key columns per kind rank (0 directories, 1 files); `id` is always the final tie-breaker. */
    public const SORTS = ['name' => [['name_key'], ['name_key']], 'modified' => [['modified_at'], ['modified_at']], 'size' => [['name_key'], ['size']], 'type' => [['extension', 'name_key'], ['extension', 'name_key']]];
    /** Listing type filters: `text` is text/* and JSON, `other` every file of no other class. */
    public const CLASSES = ['directory', 'image', 'video', 'text', 'other'];
    public readonly MediaProbe $probe;
    /** Locking-read suffix: on MySQL, shared content is read FOR UPDATE so a concurrent removal waits. */
    private readonly string $lock;

    public function __construct(private \PDO $db, public readonly string $space, public readonly ContentStore $store, public readonly TaskQueue $tasks, ?MediaProbe $probe = null, public readonly bool $thumbnails = true)
    {
        if (!preg_match('/^[a-z][a-z0-9_-]{0,63}$/D', $space) || $store->space !== $space) throw new \InvalidArgumentException('Invalid file space.');
        $this->probe = $probe ?? new MediaProbe();
        $this->lock = $db->getAttribute(\PDO::ATTR_DRIVER_NAME) === 'mysql' ? ' FOR UPDATE' : '';
    }

    /** Explicit installer (files, derivatives, tasks); HTTP requests never create tables. */
    public static function install(\PDO $db): void
    {
        $mysql = $db->getAttribute(\PDO::ATTR_DRIVER_NAME) === 'mysql';
        $content = implode('', array_map(static fn($column, $definition) => ", $column $definition", array_keys(self::CONTENT), self::CONTENT));
        $db->exec('CREATE TABLE IF NOT EXISTS blade_files (id '.($mysql ? 'BIGINT PRIMARY KEY AUTO_INCREMENT' : 'INTEGER PRIMARY KEY AUTOINCREMENT')
            .", space VARCHAR(64) NOT NULL, mount_id VARCHAR(64) NOT NULL, parent_id BIGINT NOT NULL DEFAULT 0, kind VARCHAR(10) NOT NULL, name VARCHAR(255) NOT NULL, name_key VARCHAR(255) NOT NULL, extension VARCHAR(32) NOT NULL DEFAULT '', mime_type VARCHAR(100) NOT NULL DEFAULT '', size BIGINT NOT NULL DEFAULT 0"
            .$content.', modified_at VARCHAR(30) NOT NULL, revision BIGINT NOT NULL DEFAULT 1, UNIQUE(space, mount_id, parent_id, name_key))'.($mysql ? ' ENGINE=InnoDB' : ''));
        $columns = $mysql ? $db->query("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='blade_files'")->fetchAll(\PDO::FETCH_COLUMN)
            : array_column($db->query('PRAGMA table_info(blade_files)')->fetchAll(\PDO::FETCH_ASSOC), 'name');
        foreach (self::CONTENT as $column => $definition) if (!in_array($column, $columns, true)) $db->exec("ALTER TABLE blade_files ADD COLUMN $column $definition");
        $db->exec("CREATE TABLE IF NOT EXISTS blade_file_derivatives (space VARCHAR(64) NOT NULL, file_id BIGINT NOT NULL, kind VARCHAR(32) NOT NULL, revision BIGINT NOT NULL, storage_key VARCHAR(80) NOT NULL DEFAULT '', mime VARCHAR(100) NOT NULL DEFAULT '', state VARCHAR(10) NOT NULL DEFAULT 'pending', updated_at VARCHAR(30) NOT NULL, PRIMARY KEY (file_id, kind))".($mysql ? ' ENGINE=InnoDB' : ''));
        // The listing indexes serve the keyset reads of page() (per kind, sort key, id).
        foreach ([['blade_files', 'blade_files_parent', 'space, parent_id'], ['blade_files', 'blade_files_content', 'space, storage_key'], ['blade_file_derivatives', 'blade_file_derivatives_content', 'space, storage_key'],
            ['blade_files', 'blade_files_list_name', 'space, parent_id, kind, name_key, id'], ['blade_files', 'blade_files_list_modified', 'space, parent_id, kind, modified_at, id'],
            ['blade_files', 'blade_files_list_size', 'space, parent_id, kind, size, id'], ['blade_files', 'blade_files_list_type', 'space, parent_id, kind, extension, name_key, id']] as [$table, $name, $index]) {
            if ($mysql) {
                $q = $db->prepare('SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND INDEX_NAME=?');
                $q->execute([$table, $name]);
                if (!$q->fetchColumn()) $db->exec("CREATE INDEX $name ON $table ($index)");
            } else $db->exec("CREATE INDEX IF NOT EXISTS $name ON $table ($index)");
        }
        TaskQueue::install($db);
    }

    /** Message key of the first violated rule, or null for a safe entry name (the framework upload rule). */
    public static function invalidName(string $name): ?string { return UploadPolicy::invalidName($name); }

    public static function extension(string $name): string { return UploadPolicy::extension($name); }

    private static function key(string $name): string { return mb_strtolower($name, 'UTF-8'); }

    /** The single archive predicate of every read ($alias: a table alias of blade_files). */
    public static function live(string $alias = ''): string { return ($alias !== '' ? $alias.'.' : '').'archived_at IS NULL'; }
    private static function now(): string { return gmdate('Y-m-d\TH:i:s\Z'); }

    public function root(string $mount): ?array
    {
        return $this->one('SELECT '.self::COLUMNS.' FROM blade_files WHERE space=? AND mount_id=? AND parent_id=0 AND '.self::live(), [$this->space, $mount]);
    }

    /** Setup-time creation of a mount root; idempotent. */
    public function ensureRoot(string $mount): int
    {
        $root = $this->root($mount);
        if ($root) return (int) $root['id'];
        $this->db->prepare("INSERT INTO blade_files (space,mount_id,parent_id,kind,name,name_key,modified_at) VALUES (?,?,0,'directory',?,?,?)")
            ->execute([$this->space, $mount, $mount, self::key($mount), self::now()]);
        return (int) $this->db->lastInsertId();
    }

    public function entry(int $id): ?array
    {
        return $this->one('SELECT '.self::COLUMNS.' FROM blade_files WHERE space=? AND id=? AND '.self::live(), [$this->space, $id]);
    }

    /** Entries of $ids keyed by id (unknown ids and other spaces are absent); one IN query per 500 ids. */
    public function entries(array $ids): array
    {
        $ids = array_values(array_unique(array_map('intval', $ids)));
        $out = [];
        foreach (array_chunk($ids, 500) as $chunk) {
            foreach ($this->all('SELECT '.self::COLUMNS.' FROM blade_files WHERE space=? AND '.self::live().' AND id IN ('.implode(',', array_fill(0, count($chunk), '?')).')', [$this->space, ...$chunk]) as $row) $out[(int) $row['id']] = $row;
        }
        return $out;
    }

    /** Store path of a file's content, for streaming; client paths are never used. */
    public function path(array $row): string
    {
        if ($row['kind'] !== 'file' || $row['storage_key'] === '') throw new \RuntimeException('The file has no stored content.');
        return $this->store->path($row['storage_key']);
    }

    /** Whole content of a small file (text editor); everything else is streamed from path(). */
    public function content(int $id, int $limit = 4194304): string
    {
        $row = $this->entry($id) ?? throw new \RuntimeException('Unknown file.');
        if ((int) $row['size'] > $limit) throw new \LengthException('The file is too large to read whole.');
        $content = file_get_contents($this->path($row));
        if ($content === false) throw new \RuntimeException('Cannot read stored content.');
        return $content;
    }

    /** Directories first, then names; one row more than $limit reveals truncation. */
    public function children(int $directory, int $limit): array
    {
        return $this->all('SELECT '.self::COLUMNS." FROM blade_files WHERE space=? AND parent_id=? AND archived_at IS NULL ORDER BY CASE kind WHEN 'directory' THEN 0 ELSE 1 END, name_key, id LIMIT ".($limit + 1), [$this->space, $directory]);
    }

    public function directories(string $mount, int $limit): array
    {
        return $this->all('SELECT id,parent_id,name FROM blade_files WHERE space=? AND mount_id=? AND kind=? AND '.self::live().' ORDER BY name_key, id LIMIT '.($limit + 1), [$this->space, $mount, 'directory']);
    }

    /** Files of a whole mount for its tree, by name; one row more than $limit reveals truncation. */
    public function files(string $mount, int $limit): array
    {
        return $this->all('SELECT id,parent_id,name,mime_type FROM blade_files WHERE space=? AND mount_id=? AND kind=? AND '.self::live().' ORDER BY name_key, id LIMIT '.($limit + 1), [$this->space, $mount, 'file']);
    }

    public function child(int $directory, string $name): ?array
    {
        return $this->one('SELECT '.self::COLUMNS.' FROM blade_files WHERE space=? AND parent_id=? AND name_key=? AND '.self::live(), [$this->space, $directory, self::key($name)]);
    }

    /**
     * Current live row of $id, read FOR UPDATE on MySQL (a plain read on SQLite, whose write transaction already
     * serializes): callers lock the top entry before reading its subtree (delete, archive, move, rename), so two
     * requests on the same entry serialize instead of acting on a subtree the other one is changing. Null when gone.
     */
    public function locked(int $id): ?array
    {
        return $this->one('SELECT '.self::COLUMNS.' FROM blade_files WHERE space=? AND id=? AND '.self::live().$this->lock, [$this->space, $id]);
    }

    /** Root-first chain ending with the entry itself; its length minus one is the depth. */
    public function ancestry(array $entry): array
    {
        $chain = [$entry];
        while ((int) $entry['parent_id'] !== 0) {
            $entry = $this->entry((int) $entry['parent_id']) ?? throw new \RuntimeException('Broken file hierarchy.');
            array_unshift($chain, $entry);
            if (count($chain) > 64) throw new \RuntimeException('Broken file hierarchy.');
        }
        return $chain;
    }

    /** Entry and descendants breadth-first with relative depth; null when larger than $limit. $archived includes archived descendants (removal). */
    public function subtree(array $entry, int $limit, bool $archived = false): ?array
    {
        $out = [[...$entry, 'relative' => 0]];
        for ($level = [$entry], $depth = 1; $level; $depth++) {
            $directories = array_column(array_filter($level, static fn($row) => $row['kind'] === 'directory'), 'id');
            if (!$directories) break;
            $level = $this->all('SELECT '.self::COLUMNS.' FROM blade_files WHERE space=?'.($archived ? '' : ' AND '.self::live()).' AND parent_id IN ('.implode(',', array_fill(0, count($directories), '?')).') ORDER BY id', [$this->space, ...$directories]);
            foreach ($level as $row) $out[] = [...$row, 'relative' => $depth];
            if (count($out) > $limit) return null;
        }
        return $out;
    }

    /**
     * Existing child directory of $parent named $name, or a new one ($created); an entry of another kind
     * returns null. On MySQL the parent row is locked first, so parallel finishes into the same (possibly
     * empty) folder serialize on it instead of deadlocking on the gap locks of their lookups; the lookup is
     * a locking read so it sees a directory committed meanwhile. A duplicate-key race that still happens
     * (another writer, SQLite) re-reads the winner's row.
     * @return ?array{0:array,1:bool}
     */
    public function directory(array $parent, string $name): ?array
    {
        $this->locked((int) $parent['id']);
        $find = fn() => $this->one('SELECT '.self::COLUMNS.' FROM blade_files WHERE space=? AND parent_id=? AND name_key=? AND '.self::live().$this->lock, [$this->space, (int) $parent['id'], self::key($name)]);
        $row = $find();
        if (!$row) {
            try {
                return [$this->entry($this->createDirectory($parent, $name)), true];
            } catch (\PDOException $error) {
                if (!str_starts_with((string) $error->getCode(), '23') || !($row = $find())) throw $error;
            }
        }
        return $row['kind'] === 'directory' ? [$row, false] : null;
    }

    public function createDirectory(array $parent, string $name): int
    {
        $this->db->prepare("INSERT INTO blade_files (space,mount_id,parent_id,kind,name,name_key,modified_at) VALUES (?,?,?,'directory',?,?,?)")
            ->execute([$this->space, $parent['mount_id'], $parent['id'], $name, self::key($name), self::now()]);
        return (int) $this->db->lastInsertId();
    }

    /** Stores the source file's bytes, probes media metadata and queues the thumbnail. */
    public function createFile(array $parent, string $name, string $mime, string $source, ?string $modified = null): int
    {
        $content = $this->stored($source, $mime);
        $id = $this->insertFile($parent, $name, $mime, $content, $modified ?? self::now());
        $this->ensure($content['key'], $source);
        $this->derive($id, 1, $mime);
        return $id;
    }

    /** Replaces content from a source file and bumps the revision; with $expected only that revision is replaced. */
    public function replaceContent(int $id, string $mime, string $source, ?string $modified = null, ?int $expected = null): bool
    {
        $old = $this->entry($id);
        if (!$old || $old['kind'] !== 'file' || ($expected !== null && (int) $old['revision'] !== $expected)) return false;
        $content = $this->stored($source, $mime);
        if (!$this->replace($old, $mime, $content, $modified ?? self::now())) return false;
        $this->ensure($content['key'], $source);
        $this->derive($id, (int) $old['revision'] + 1, $mime);
        return true;
    }

    /** Overwrite by copy: shares the source's content and metadata without rewriting bytes. */
    public function replaceFrom(int $id, array $source): bool
    {
        $old = $this->entry($id);
        if (!$old || $old['kind'] !== 'file' || $source['kind'] !== 'file') return false;
        $source = $this->source($source);
        if (!$this->replace($old, $source['mime_type'], self::shared($source), $source['modified_at'])) return false;
        $keys = $this->copyDerivatives($source, $id, (int) $old['revision'] + 1);
        if (!isset($keys[Thumbnails::KIND])) $this->derive($id, (int) $old['revision'] + 1, $source['mime_type']);
        $this->present([$source['storage_key'], ...array_values($keys)]);
        return true;
    }

    /** Recursive copy below $parent; files share content and ready derivatives. Returns the new top-level id. */
    public function copyTree(array $subtree, array $parent, string $name): int
    {
        $ids = $shared = [];
        foreach ($subtree as $row) {
            $target = $row['relative'] === 0 ? $parent : [...$parent, 'id' => $ids[$row['parent_id']]];
            $label = $row['relative'] === 0 ? $name : $row['name'];
            if ($row['kind'] === 'directory') {
                $ids[$row['id']] = $this->createDirectory($target, $label);
                continue;
            }
            $row = $this->source($row);
            $ids[$row['id']] = $id = $this->insertFile($target, $label, $row['mime_type'], self::shared($row), $row['modified_at']);
            $keys = $this->copyDerivatives($row, $id, 1);
            if (!isset($keys[Thumbnails::KIND])) $this->derive($id, 1, $row['mime_type']);
            array_push($shared, $row['storage_key'], ...array_values($keys));
        }
        $this->present($shared);
        return $ids[$subtree[0]['id']];
    }

    /** Re-parents an entry (renaming it when needed) and carries its subtree to the target mount. */
    public function moveTree(array $subtree, array $parent, string $name): void
    {
        $top = $subtree[0];
        $this->db->prepare('UPDATE blade_files SET parent_id=?, name=?, name_key=?, extension=?, revision=revision+1 WHERE space=? AND id=?')
            ->execute([$parent['id'], $name, self::key($name), $top['kind'] === 'file' ? self::extension($name) : '', $this->space, $top['id']]);
        // A move does not change content: derivatives of the moved file stay current.
        if ($top['kind'] === 'file') $this->run('UPDATE blade_file_derivatives SET revision=revision+1 WHERE space=? AND file_id=? AND revision=?', [$this->space, (int) $top['id'], (int) $top['revision']]);
        if ($top['mount_id'] === $parent['mount_id']) return;
        foreach (array_chunk(array_column($subtree, 'id'), 500) as $ids) {
            $this->db->prepare('UPDATE blade_files SET mount_id=? WHERE space=? AND id IN ('.implode(',', array_fill(0, count($ids), '?')).')')
                ->execute([$parent['mount_id'], $this->space, ...$ids]);
        }
    }

    /** Removes one file replaced by an overwriting move; directories are never removed here. Content is collected after commit. */
    public function removeFile(int $id): void
    {
        $row = $this->entry($id);
        if (!$row || $row['kind'] !== 'file') return;
        $this->dropDerivatives($id);
        $this->run("DELETE FROM blade_files WHERE space=? AND id=? AND kind='file'", [$this->space, $id]);
        $this->release($row['storage_key']);
    }

    /**
     * One window of a directory's live entries: directories before files in both directions, then the sort's key
     * columns (SORTS) and `id`, all in $direction. $after is the keyset position ['rank' => 0|1, 'keys' => [...],
     * 'id' => int] of the previous window's last row. $search is a case-folded substring of the name (bound LIKE
     * with ESCAPE), $type one of CLASSES or ''. Returns [rows, more].
     * @return array{0:list<array>,1:bool}
     */
    public function page(int $directory, string $sort, string $direction, string $search, string $type, int $limit, ?array $after): array
    {
        if (!isset(self::SORTS[$sort]) || !in_array($direction, ['asc', 'desc'], true) || ($type !== '' && !in_array($type, self::CLASSES, true)) || $limit < 1) throw new \InvalidArgumentException('Invalid listing query.');
        [$filter, $params] = $this->filter($search, $type);
        $ranks = match ($type) { '' => [0, 1], 'directory' => [0], default => [1] };
        $op = $direction === 'asc' ? '>' : '<';
        $rows = [];
        foreach ($ranks as $rank) {
            if ($after !== null && $rank < $after['rank']) continue;
            $columns = self::SORTS[$sort][$rank];
            $where = 'space=? AND parent_id=? AND kind=? AND '.self::live().$filter;
            $bind = [$this->space, $directory, $rank === 0 ? 'directory' : 'file', ...$params];
            if ($after !== null && $rank === $after['rank']) {
                // (k1, …, id) beyond the cursor, as nested comparisons the indexes can serve.
                $condition = "id $op ?";
                $values = [(int) $after['id']];
                foreach (array_reverse($columns, true) as $index => $column) {
                    $condition = "($column $op ? OR ($column = ? AND $condition))";
                    $values = [$after['keys'][$index], $after['keys'][$index], ...$values];
                }
                $where .= ' AND '.$condition;
                array_push($bind, ...$values);
            }
            $order = implode(', ', array_map(static fn($column) => "$column $direction", [...$columns, 'id']));
            array_push($rows, ...$this->run('SELECT '.self::COLUMNS." FROM blade_files WHERE $where ORDER BY $order LIMIT ".($limit + 1 - count($rows)), $bind)->fetchAll(\PDO::FETCH_ASSOC));
            if (count($rows) > $limit) break;
        }
        return [array_slice($rows, 0, $limit), count($rows) > $limit];
    }

    /** Live entries of a directory: all of them, and those matching the listing's search and type. @return array{0:int,1:int} */
    public function counts(int $directory, string $search, string $type): array
    {
        [$filter, $params] = $this->filter($search, $type);
        $total = (int) $this->run('SELECT COUNT(*) FROM blade_files WHERE space=? AND parent_id=? AND '.self::live(), [$this->space, $directory])->fetchColumn();
        $matched = $filter === '' ? $total : (int) $this->run('SELECT COUNT(*) FROM blade_files WHERE space=? AND parent_id=? AND '.self::live().$filter, [$this->space, $directory, ...$params])->fetchColumn();
        return [$total, $matched];
    }

    /** Keyset position of a listed row under $sort. */
    public static function position(array $row, string $sort): array
    {
        $rank = $row['kind'] === 'directory' ? 0 : 1;
        return ['rank' => $rank, 'keys' => array_map(static fn($column) => $column === 'size' ? (int) $row['size'] : (string) ($column === 'name_key' ? self::key($row['name']) : $row[$column]), self::SORTS[$sort][$rank]), 'id' => (int) $row['id']];
    }

    private function filter(string $search, string $type): array
    {
        $sql = '';
        $params = [];
        if ($search !== '') {
            $sql .= " AND name_key LIKE ? ESCAPE '!'";
            $params[] = '%'.strtr(self::key($search), ['!' => '!!', '%' => '!%', '_' => '!_']).'%';
        }
        $text = "(mime_type LIKE 'text/%' OR mime_type = 'application/json')";
        $sql .= match ($type) {
            '' => '', 'directory' => " AND kind = 'directory'", 'image' => " AND kind = 'file' AND mime_type LIKE 'image/%'", 'video' => " AND kind = 'file' AND mime_type LIKE 'video/%'",
            'text' => " AND kind = 'file' AND $text", 'other' => " AND kind = 'file' AND NOT (mime_type LIKE 'image/%' OR mime_type LIKE 'video/%' OR $text)",
        };
        return [$sql, $params];
    }

    /** Renames a live entry of the read revision in place and bumps the revision; a file's derivatives stay current (content unchanged). */
    public function rename(array $row, string $name): bool
    {
        $q = $this->run('UPDATE blade_files SET name=?, name_key=?, extension=?, revision=revision+1 WHERE space=? AND id=? AND revision=? AND '.self::live(),
            [$name, self::key($name), $row['kind'] === 'file' ? self::extension($name) : '', $this->space, (int) $row['id'], (int) $row['revision']]);
        if ($q->rowCount() !== 1) return false;
        if ($row['kind'] === 'file') $this->run('UPDATE blade_file_derivatives SET revision=revision+1 WHERE space=? AND file_id=? AND revision=?', [$this->space, (int) $row['id'], (int) $row['revision']]);
        return true;
    }

    /**
     * Delete policy `archive`: marks the subtree; the top entry's name becomes a unique tombstone so the name is free again. Content stays referenced.
     * An overwrite under `archive` archives the replaced file this way ([$row]) and stores the incoming content as a new entry.
     */
    public function archiveTree(array $subtree, string $actor): void
    {
        $now = self::now();
        foreach (array_chunk(array_map(static fn($row) => (int) $row['id'], $subtree), 500) as $ids) {
            $this->run('UPDATE blade_files SET archived_at=?, archived_by=? WHERE space=? AND '.self::live().' AND id IN ('.implode(',', array_fill(0, count($ids), '?')).')', [$now, substr($actor, 0, 64), $this->space, ...$ids]);
        }
        $this->run('UPDATE blade_files SET name_key=? WHERE space=? AND id=?', ['\0archived:'.$subtree[0]['id'], $this->space, (int) $subtree[0]['id']]);
    }

    /** Delete policy `delete`: removes the subtree's rows (archived descendants included) and derivatives; released content is collected after commit. */
    public function deleteTree(array $subtree): void
    {
        $keys = [];
        foreach (array_chunk(array_map(static fn($row) => (int) $row['id'], $subtree), 500) as $ids) {
            $in = implode(',', array_fill(0, count($ids), '?'));
            array_push($keys, ...array_column($this->all("SELECT storage_key FROM blade_file_derivatives WHERE space=? AND file_id IN ($in)", [$this->space, ...$ids]), 'storage_key'));
            $this->run("DELETE FROM blade_file_derivatives WHERE space=? AND file_id IN ($in)", [$this->space, ...$ids]);
            $this->run("DELETE FROM blade_files WHERE space=? AND id IN ($in)", [$this->space, ...$ids]);
        }
        foreach ($subtree as $row) if ($row['kind'] === 'file') $keys[] = $row['storage_key'];
        foreach (array_unique($keys) as $key) $this->release($key);
    }

    public function derivative(int $id, string $kind): ?array
    {
        return $this->one('SELECT file_id,kind,revision,storage_key,mime,state,updated_at FROM blade_file_derivatives WHERE space=? AND file_id=? AND kind=?', [$this->space, $id, $kind]);
    }

    /**
     * Thumbnail state per file id: 'ready', 'pending', 'failed' or 'none'. A thumbnailable file without
     * a current result and without a pending or failed task is queued again after the response (lazy retry).
     */
    public function thumbnails(array $rows): array
    {
        $states = [];
        $files = [];
        foreach ($rows as $row) {
            $states[(int) $row['id']] = 'none';
            if ($this->thumbnails && $row['kind'] === 'file' && $row['storage_key'] !== '' && Thumbnails::supports($row['mime_type'])) $files[(int) $row['id']] = $row;
        }
        if (!$files) return $states;
        $derived = [];
        foreach (array_chunk(array_keys($files), 500) as $ids) {
            foreach ($this->all('SELECT file_id,revision,state FROM blade_file_derivatives WHERE space=? AND kind=? AND file_id IN ('.implode(',', array_fill(0, count($ids), '?')).')', [$this->space, Thumbnails::KIND, ...$ids]) as $row) $derived[(int) $row['file_id']] = $row;
        }
        $tasks = $this->tasks->states(array_map(fn($row) => Thumbnails::dedupe($this->space, (int) $row['id'], (int) $row['revision']), $files));
        foreach ($files as $id => $row) {
            $current = $derived[$id] ?? null;
            if ($current && (int) $current['revision'] === (int) $row['revision'] && in_array($current['state'], ['ready', 'failed'], true)) { $states[$id] = $current['state']; continue; }
            $dedupe = Thumbnails::dedupe($this->space, $id, (int) $row['revision']);
            $task = $tasks[$dedupe] ?? null;
            if ($task === 'failed') { $states[$id] = 'failed'; continue; }
            if ($task !== 'pending' && $task !== 'running') $this->tasks->later('files.thumbnail', ['space' => $this->space, 'file_id' => $id, 'revision' => (int) $row['revision']], $dedupe);
            $states[$id] = 'pending';
        }
        return $states;
    }

    /** Ready thumbnail of the current revision: ['state' => 'ready', 'key' => ..., 'mime' => ...], otherwise only its state. */
    public function thumbnail(array $row): array
    {
        $state = $this->thumbnails([$row])[(int) $row['id']];
        if ($state !== 'ready') return ['state' => $state];
        $derivative = $this->derivative((int) $row['id'], Thumbnails::KIND);
        if ($derivative && ContentStore::valid($derivative['storage_key']) && $this->store->exists($derivative['storage_key'])) return ['state' => 'ready', 'key' => $derivative['storage_key'], 'mime' => $derivative['mime']];
        $this->tasks->later('files.thumbnail', ['space' => $this->space, 'file_id' => (int) $row['id'], 'revision' => (int) $row['revision']], Thumbnails::dedupe($this->space, (int) $row['id'], (int) $row['revision']));
        return ['state' => 'pending'];
    }

    /** Task step: stores a derivative of a still-current revision in a short transaction; null $key records a failure. */
    public function saveDerivative(int $id, string $kind, int $revision, ?string $key, string $mime): bool
    {
        Transaction::begin($this->db);
        try {
            $row = $this->entry($id);
            $current = $row && (int) $row['revision'] === $revision;
            if ($current) {
                $previous = $this->derivative($id, $kind);
                $this->run('DELETE FROM blade_file_derivatives WHERE space=? AND file_id=? AND kind=?', [$this->space, $id, $kind]);
                $this->run('INSERT INTO blade_file_derivatives (space,file_id,kind,revision,storage_key,mime,state,updated_at) VALUES (?,?,?,?,?,?,?,?)',
                    [$this->space, $id, $kind, $revision, $key ?? '', $mime, $key !== null ? 'ready' : 'failed', self::now()]);
                if ($previous && $previous['storage_key'] !== ($key ?? '')) $this->release($previous['storage_key']);
            }
            $this->db->commit();
            return $current;
        } catch (\Throwable $error) {
            if ($this->db->inTransaction()) $this->db->rollBack();
            throw $error;
        }
    }

    /**
     * Task step: removes the content of $key when no file or derivative row references it. The check and
     * the unlink share one transaction (SQLite write lock; MySQL row/gap lock), so a concurrent insert of
     * the same key waits; writers re-check the file after their insert (ensure(), present()). On MySQL the
     * protocol relies on InnoDB REPEATABLE READ (the default): READ COMMITTED takes no gap locks.
     */
    public function collect(string $key): bool
    {
        if (!ContentStore::valid($key)) return false;
        $lock = $this->lock;
        Transaction::begin($this->db);
        try {
            $used = (bool) $this->one('SELECT 1 AS used FROM blade_files WHERE space=? AND storage_key=? LIMIT 1'.$lock, [$this->space, $key])
                || (bool) $this->one('SELECT 1 AS used FROM blade_file_derivatives WHERE space=? AND storage_key=? LIMIT 1'.$lock, [$this->space, $key]);
            if (!$used) $this->store->remove($key);
            $this->db->commit();
            return !$used;
        } catch (\Throwable $error) {
            if ($this->db->inTransaction()) $this->db->rollBack();
            throw $error;
        }
    }

    /** Content written outside the action transaction is checked after the response; a rollback leaves nothing behind. */
    public function collectLater(string $key): void
    {
        $this->tasks->later('files.collect', ['space' => $this->space, 'key' => $key], 'files.collect:'.$this->space.':'.$key);
    }

    /** A dropped reference: collection is queued in the caller's transaction. */
    private function release(string $key): void
    {
        if ($key !== '') $this->tasks->enqueue('files.collect', ['space' => $this->space, 'key' => $key], 'files.collect:'.$this->space.':'.$key);
    }

    private function stored(string $source, string $mime): array
    {
        $content = $this->store->put($source);
        if ($content['created']) $this->collectLater($content['key']);
        return [...$content, ...$this->probe->probe($this->store->path($content['key']), $mime)];
    }

    private static function shared(array $row): array
    {
        return ['key' => $row['storage_key'], 'sha256' => $row['sha256'], 'size' => (int) $row['size'], 'width' => $row['width'], 'height' => $row['height'], 'duration_ms' => $row['duration_ms'], 'orientation' => $row['orientation']];
    }

    /** A collection that ran between put() and the row write removed the content: write it again. */
    private function ensure(string $key, string $source): void
    {
        if (!$this->store->exists($key)) $this->store->put($source);
    }

    private function insertFile(array $parent, string $name, string $mime, array $content, string $modified): int
    {
        $this->run("INSERT INTO blade_files (space,mount_id,parent_id,kind,name,name_key,extension,mime_type,size,storage_key,sha256,width,height,duration_ms,orientation,modified_at) VALUES (?,?,?,'file',?,?,?,?,?,?,?,?,?,?,?,?)",
            [$this->space, $parent['mount_id'], (int) $parent['id'], $name, self::key($name), self::extension($name), $mime, $content['size'], $content['key'], $content['sha256'],
                self::int($content['width']), self::int($content['height']), self::int($content['duration_ms']), $content['orientation'], $modified]);
        return (int) $this->db->lastInsertId();
    }

    /** Conditional on the read revision; releases the previous content and drops derivatives. */
    private function replace(array $old, string $mime, array $content, string $modified): bool
    {
        $q = $this->run("UPDATE blade_files SET mime_type=?, size=?, storage_key=?, sha256=?, width=?, height=?, duration_ms=?, orientation=?, modified_at=?, revision=revision+1 WHERE space=? AND id=? AND kind='file' AND revision=?",
            [$mime, $content['size'], $content['key'], $content['sha256'], self::int($content['width']), self::int($content['height']), self::int($content['duration_ms']), $content['orientation'], $modified, $this->space, (int) $old['id'], (int) $old['revision']]);
        if ($q->rowCount() !== 1) return false;
        if ($old['storage_key'] !== $content['key']) $this->release($old['storage_key']);
        $this->dropDerivatives((int) $old['id']);
        return true;
    }

    /** Ready derivatives of the source revision, re-keyed to the target file; returns kind => shared key. */
    private function copyDerivatives(array $source, int $target, int $revision): array
    {
        $rows = $this->all("SELECT kind,storage_key,mime FROM blade_file_derivatives WHERE space=? AND file_id=? AND revision=? AND state='ready'".$this->lock, [$this->space, (int) $source['id'], (int) $source['revision']]);
        foreach ($rows as $row) {
            $this->run('INSERT INTO blade_file_derivatives (space,file_id,kind,revision,storage_key,mime,state,updated_at) VALUES (?,?,?,?,?,?,?,?)',
                [$this->space, $target, $row['kind'], $revision, $row['storage_key'], $row['mime'], 'ready', self::now()]);
        }
        return array_column($rows, 'storage_key', 'kind');
    }

    /** Current source row of a copy, read FOR UPDATE on MySQL; gone meanwhile → retryable conflict. */
    private function source(array $row): array
    {
        return $this->one('SELECT '.self::COLUMNS.' FROM blade_files WHERE space=? AND id=? AND '.self::live().$this->lock, [$this->space, (int) $row['id']])
            ?? throw new \Blade\Feature\Failure('Egy fájl tartalma időközben eltávolításra került. Próbáld újra.', 409);
    }

    /** After inserting rows that share keys: a collection that won the race removed one, so the action fails and rolls back. */
    private function present(array $keys): void
    {
        foreach (array_unique(array_filter($keys, static fn($key) => $key !== '')) as $key) {
            if (!$this->store->exists($key)) throw new \Blade\Feature\Failure('Egy fájl tartalma időközben eltávolításra került. Próbáld újra.', 409);
        }
    }

    private function dropDerivatives(int $id): void
    {
        $keys = array_column($this->all('SELECT storage_key FROM blade_file_derivatives WHERE space=? AND file_id=?', [$this->space, $id]), 'storage_key');
        $this->run('DELETE FROM blade_file_derivatives WHERE space=? AND file_id=?', [$this->space, $id]);
        foreach (array_unique($keys) as $key) $this->release($key);
    }

    private function derive(int $id, int $revision, string $mime): void
    {
        if ($this->thumbnails && Thumbnails::supports($mime)) $this->tasks->enqueue('files.thumbnail', ['space' => $this->space, 'file_id' => $id, 'revision' => $revision], Thumbnails::dedupe($this->space, $id, $revision));
    }

    /** "name (2).ext" style free name in $directory. */
    public function freeName(int $directory, string $name, string $kind): string
    {
        $dot = $kind === 'file' ? strrpos($name, '.') : false;
        [$base, $suffix] = $dot && mb_strlen(substr($name, $dot), 'UTF-8') <= 33 ? [substr($name, 0, $dot), substr($name, $dot)] : [$name, ''];
        for ($i = 2; $i < 1000; $i++) {
            $candidate = mb_substr($base, 0, 248 - mb_strlen($suffix, 'UTF-8'), 'UTF-8').' ('.$i.')'.$suffix;
            if (!$this->child($directory, $candidate)) return $candidate;
        }
        throw new \Blade\Feature\Failure('Nem található szabad név.', 409);
    }

    private static function int(mixed $value): ?int { return $value === null || $value === '' ? null : (int) $value; }

    private function run(string $sql, array $params): \PDOStatement
    {
        $q = $this->db->prepare($sql);
        foreach (array_values($params) as $i => $value) $q->bindValue($i + 1, $value, match (true) { $value === null => \PDO::PARAM_NULL, is_int($value) => \PDO::PARAM_INT, default => \PDO::PARAM_STR });
        $q->execute();
        return $q;
    }

    private function one(string $sql, array $params): ?array
    {
        $q = $this->db->prepare($sql);
        $q->execute($params);
        return $q->fetch(\PDO::FETCH_ASSOC) ?: null;
    }

    private function all(string $sql, array $params): array
    {
        $q = $this->db->prepare($sql);
        $q->execute($params);
        return $q->fetchAll(\PDO::FETCH_ASSOC);
    }
}
