<?php
declare(strict_types=1);
namespace Blade\Files;

/**
 * Framework-owned virtual file store (`blade_files`). Entries are rows with BLOB content, so
 * nothing reaches the host filesystem or a web root and copy/move share the action transaction.
 * A mount root has parent_id 0 and depth 0; names are unique per parent, case-insensitively.
 */
final class FileStorage
{
    private const COLUMNS = 'id,mount_id,parent_id,kind,name,extension,mime_type,size,modified_at,revision';

    public function __construct(private \PDO $db, public readonly string $space)
    {
        if (!preg_match('/^[a-z][a-z0-9_-]{0,63}$/D', $space)) throw new \InvalidArgumentException('Invalid file space.');
    }

    /** Explicit installer; HTTP requests never create tables. */
    public static function install(\PDO $db): void
    {
        $mysql = $db->getAttribute(\PDO::ATTR_DRIVER_NAME) === 'mysql';
        $db->exec('CREATE TABLE IF NOT EXISTS blade_files (id '.($mysql ? 'BIGINT PRIMARY KEY AUTO_INCREMENT' : 'INTEGER PRIMARY KEY AUTOINCREMENT')
            .", space VARCHAR(64) NOT NULL, mount_id VARCHAR(64) NOT NULL, parent_id BIGINT NOT NULL DEFAULT 0, kind VARCHAR(10) NOT NULL, name VARCHAR(255) NOT NULL, name_key VARCHAR(255) NOT NULL, extension VARCHAR(32) NOT NULL DEFAULT '', mime_type VARCHAR(100) NOT NULL DEFAULT '', size BIGINT NOT NULL DEFAULT 0, content "
            .($mysql ? 'LONGBLOB' : 'BLOB').', modified_at VARCHAR(30) NOT NULL, revision BIGINT NOT NULL DEFAULT 1, UNIQUE(space, mount_id, parent_id, name_key))'.($mysql ? ' ENGINE=InnoDB' : ''));
        if ($mysql) {
            $q = $db->query("SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='blade_files' AND INDEX_NAME='blade_files_parent'");
            if (!$q->fetchColumn()) $db->exec('CREATE INDEX blade_files_parent ON blade_files (space, parent_id)');
        } else $db->exec('CREATE INDEX IF NOT EXISTS blade_files_parent ON blade_files (space, parent_id)');
    }

    /** Message key of the first violated rule, or null for a safe entry name. */
    public static function invalidName(string $name): ?string
    {
        if ($name === '') return 'A név nem lehet üres.';
        if (preg_match('//u', $name) !== 1) return 'Érvénytelen karakterkódolás.';
        if (mb_strlen($name, 'UTF-8') > 255) return 'Legfeljebb 255 karakter adható meg.';
        // Path separators, NUL, control and invisible format characters (e.g. bidi overrides) never belong in a name.
        if (preg_match('~[/\\\\]|\p{Cc}|\p{Cf}~u', $name)) return 'A név nem tartalmazhat perjelet, vezérlő- vagy formázókaraktert.';
        if (trim($name) !== $name) return 'A név nem kezdődhet és nem végződhet szóközzel.';
        if (preg_match('/^\.+$/D', $name)) return 'A név nem állhat csak pontokból.';
        return null;
    }

    public static function extension(string $name): string
    {
        $dot = strrpos($name, '.');
        return $dot ? mb_substr(mb_strtolower(substr($name, $dot + 1), 'UTF-8'), 0, 32, 'UTF-8') : '';
    }

    private static function key(string $name): string { return mb_strtolower($name, 'UTF-8'); }
    private static function now(): string { return gmdate('Y-m-d\TH:i:s\Z'); }

    public function root(string $mount): ?array
    {
        return $this->one('SELECT '.self::COLUMNS.' FROM blade_files WHERE space=? AND mount_id=? AND parent_id=0', [$this->space, $mount]);
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
        return $this->one('SELECT '.self::COLUMNS.' FROM blade_files WHERE space=? AND id=?', [$this->space, $id]);
    }

    public function content(int $id): string
    {
        $q = $this->db->prepare('SELECT content FROM blade_files WHERE space=? AND id=?');
        $q->execute([$this->space, $id]);
        $value = $q->fetchColumn();
        return is_resource($value) ? (string) stream_get_contents($value) : (string) $value;
    }

    /** Directories first, then names; one row more than $limit reveals truncation. */
    public function children(int $directory, int $limit): array
    {
        return $this->all('SELECT '.self::COLUMNS." FROM blade_files WHERE space=? AND parent_id=? ORDER BY CASE kind WHEN 'directory' THEN 0 ELSE 1 END, name_key, id LIMIT ".($limit + 1), [$this->space, $directory]);
    }

    public function directories(string $mount, int $limit): array
    {
        return $this->all('SELECT id,parent_id,name FROM blade_files WHERE space=? AND mount_id=? AND kind=? ORDER BY name_key, id LIMIT '.($limit + 1), [$this->space, $mount, 'directory']);
    }

    /** Files of a whole mount for its tree, by name; one row more than $limit reveals truncation. */
    public function files(string $mount, int $limit): array
    {
        return $this->all('SELECT id,parent_id,name,mime_type FROM blade_files WHERE space=? AND mount_id=? AND kind=? ORDER BY name_key, id LIMIT '.($limit + 1), [$this->space, $mount, 'file']);
    }

    public function child(int $directory, string $name): ?array
    {
        return $this->one('SELECT '.self::COLUMNS.' FROM blade_files WHERE space=? AND parent_id=? AND name_key=?', [$this->space, $directory, self::key($name)]);
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

    /** Entry and descendants breadth-first with relative depth; null when larger than $limit. */
    public function subtree(array $entry, int $limit): ?array
    {
        $out = [[...$entry, 'relative' => 0]];
        for ($level = [$entry], $depth = 1; $level; $depth++) {
            $directories = array_column(array_filter($level, static fn($row) => $row['kind'] === 'directory'), 'id');
            if (!$directories) break;
            $level = $this->all('SELECT '.self::COLUMNS.' FROM blade_files WHERE space=? AND parent_id IN ('.implode(',', array_fill(0, count($directories), '?')).') ORDER BY id', [$this->space, ...$directories]);
            foreach ($level as $row) $out[] = [...$row, 'relative' => $depth];
            if (count($out) > $limit) return null;
        }
        return $out;
    }

    public function createDirectory(array $parent, string $name): int
    {
        $this->db->prepare("INSERT INTO blade_files (space,mount_id,parent_id,kind,name,name_key,modified_at) VALUES (?,?,?,'directory',?,?,?)")
            ->execute([$this->space, $parent['mount_id'], $parent['id'], $name, self::key($name), self::now()]);
        return (int) $this->db->lastInsertId();
    }

    public function createFile(array $parent, string $name, string $mime, string $content, ?string $modified = null): int
    {
        $q = $this->db->prepare("INSERT INTO blade_files (space,mount_id,parent_id,kind,name,name_key,extension,mime_type,size,content,modified_at) VALUES (?,?,?,'file',?,?,?,?,?,?,?)");
        foreach ([$this->space, $parent['mount_id'], $parent['id'], $name, self::key($name), self::extension($name), $mime, strlen($content)] as $i => $value) $q->bindValue($i + 1, $value);
        $q->bindValue(9, $content, \PDO::PARAM_LOB);
        $q->bindValue(10, $modified ?? self::now());
        $q->execute();
        return (int) $this->db->lastInsertId();
    }

    /** Replaces content and bumps the revision; with $expected only that revision is replaced. */
    public function replaceContent(int $id, string $mime, string $content, ?string $modified = null, ?int $expected = null): bool
    {
        $q = $this->db->prepare("UPDATE blade_files SET mime_type=?, size=?, content=?, modified_at=?, revision=revision+1 WHERE space=? AND id=? AND kind='file'".($expected !== null ? ' AND revision=?' : ''));
        foreach ([$mime, strlen($content), $content, $modified ?? self::now(), $this->space, $id, ...($expected !== null ? [$expected] : [])] as $i => $value) {
            $q->bindValue($i + 1, $value, $i === 2 ? \PDO::PARAM_LOB : (is_int($value) ? \PDO::PARAM_INT : \PDO::PARAM_STR));
        }
        $q->execute();
        return $q->rowCount() === 1;
    }

    /** Recursive copy below $parent; returns the new top-level id. */
    public function copyTree(array $subtree, array $parent, string $name): int
    {
        $ids = [];
        foreach ($subtree as $row) {
            $target = $row['relative'] === 0 ? $parent : [...$parent, 'id' => $ids[$row['parent_id']]];
            $label = $row['relative'] === 0 ? $name : $row['name'];
            $ids[$row['id']] = $row['kind'] === 'directory'
                ? $this->createDirectory($target, $label)
                : $this->createFile($target, $label, $row['mime_type'], $this->content((int) $row['id']), $row['modified_at']);
        }
        return $ids[$subtree[0]['id']];
    }

    /** Re-parents an entry (renaming it when needed) and carries its subtree to the target mount. */
    public function moveTree(array $subtree, array $parent, string $name): void
    {
        $top = $subtree[0];
        $this->db->prepare('UPDATE blade_files SET parent_id=?, name=?, name_key=?, extension=?, revision=revision+1 WHERE space=? AND id=?')
            ->execute([$parent['id'], $name, self::key($name), $top['kind'] === 'file' ? self::extension($name) : '', $this->space, $top['id']]);
        if ($top['mount_id'] === $parent['mount_id']) return;
        foreach (array_chunk(array_column($subtree, 'id'), 500) as $ids) {
            $this->db->prepare('UPDATE blade_files SET mount_id=? WHERE space=? AND id IN ('.implode(',', array_fill(0, count($ids), '?')).')')
                ->execute([$parent['mount_id'], $this->space, ...$ids]);
        }
    }

    /** Removes one file replaced by an overwriting move; directories are never removed here. */
    public function removeFile(int $id): void
    {
        $this->db->prepare("DELETE FROM blade_files WHERE space=? AND id=? AND kind='file'")->execute([$this->space, $id]);
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
