<?php
declare(strict_types=1);
namespace Blade\Diagram;

/**
 * Framework-owned diagram store: `blade_diagrams` holds one canonical JSON document per diagram,
 * `blade_diagram_types` the element types users define at runtime. Both are scoped by space.
 */
final class DiagramStorage
{
    public function __construct(private \PDO $db, public readonly string $space)
    {
        if (!preg_match('/^[a-z][a-z0-9_-]{0,63}$/D', $space)) throw new \InvalidArgumentException('Invalid diagram space.');
    }

    /** Explicit installer; HTTP requests never create tables. */
    public static function install(\PDO $db): void
    {
        $mysql = $db->getAttribute(\PDO::ATTR_DRIVER_NAME) === 'mysql';
        $id = $mysql ? 'BIGINT PRIMARY KEY AUTO_INCREMENT' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
        $engine = $mysql ? ' ENGINE=InnoDB' : '';
        $db->exec("CREATE TABLE IF NOT EXISTS blade_diagrams (id $id, space VARCHAR(64) NOT NULL, name VARCHAR(120) NOT NULL, name_key VARCHAR(120) NOT NULL, content "
            .($mysql ? 'MEDIUMTEXT' : 'TEXT')." NOT NULL, modified_at VARCHAR(30) NOT NULL, revision BIGINT NOT NULL DEFAULT 1, UNIQUE(space, name_key))$engine");
        $db->exec("CREATE TABLE IF NOT EXISTS blade_diagram_types (id $id, space VARCHAR(64) NOT NULL, type_key VARCHAR(40) NOT NULL, label VARCHAR(60) NOT NULL, glyph VARCHAR(40) NOT NULL, color VARCHAR(7) NOT NULL, shape VARCHAR(20) NOT NULL, UNIQUE(space, type_key))$engine");
    }

    private static function now(): string { return gmdate('Y-m-d\TH:i:s\Z'); }
    public static function key(string $name): string { return mb_strtolower($name, 'UTF-8'); }

    public function diagrams(int $limit): array
    {
        $q = $this->db->prepare('SELECT id,name,modified_at,revision FROM blade_diagrams WHERE space=? ORDER BY name_key LIMIT '.($limit + 1));
        $q->execute([$this->space]);
        return $q->fetchAll(\PDO::FETCH_ASSOC);
    }

    public function diagram(int $id): ?array
    {
        $q = $this->db->prepare('SELECT id,name,content,modified_at,revision FROM blade_diagrams WHERE space=? AND id=?');
        $q->execute([$this->space, $id]);
        return $q->fetch(\PDO::FETCH_ASSOC) ?: null;
    }

    public function named(string $name): ?array
    {
        $q = $this->db->prepare('SELECT id FROM blade_diagrams WHERE space=? AND name_key=?');
        $q->execute([$this->space, self::key($name)]);
        return $q->fetch(\PDO::FETCH_ASSOC) ?: null;
    }

    public function create(string $name, string $content): int
    {
        $this->db->prepare('INSERT INTO blade_diagrams (space,name,name_key,content,modified_at) VALUES (?,?,?,?,?)')
            ->execute([$this->space, $name, self::key($name), $content, self::now()]);
        return (int) $this->db->lastInsertId();
    }

    /** Optimistic write: false when the stored revision is no longer the expected one. */
    public function save(int $id, int $revision, string $content): bool
    {
        $q = $this->db->prepare('UPDATE blade_diagrams SET content=?, modified_at=?, revision=revision+1 WHERE space=? AND id=? AND revision=?');
        $q->execute([$content, self::now(), $this->space, $id, $revision]);
        return $q->rowCount() === 1;
    }

    public function delete(int $id): void
    {
        $this->db->prepare('DELETE FROM blade_diagrams WHERE space=? AND id=?')->execute([$this->space, $id]);
    }

    /** @return list<array{type_key:string,label:string,glyph:string,color:string,shape:string}> */
    public function types(): array
    {
        $q = $this->db->prepare('SELECT type_key,label,glyph,color,shape FROM blade_diagram_types WHERE space=? ORDER BY id');
        $q->execute([$this->space]);
        return $q->fetchAll(\PDO::FETCH_ASSOC);
    }

    public function createType(string $label, string $glyph, string $color, string $shape): string
    {
        $q = $this->db->prepare('SELECT COALESCE(MAX(id),0)+1 FROM blade_diagram_types');
        $q->execute();
        // Generated keys never collide with consumer-declared keys, which cannot start with "custom-".
        $key = 'custom-'.$q->fetchColumn();
        $this->db->prepare('INSERT INTO blade_diagram_types (space,type_key,label,glyph,color,shape) VALUES (?,?,?,?,?,?)')
            ->execute([$this->space, $key, $label, $glyph, $color, $shape]);
        return $key;
    }

    public function deleteType(string $key): void
    {
        $this->db->prepare('DELETE FROM blade_diagram_types WHERE space=? AND type_key=?')->execute([$this->space, $key]);
    }

    /** Names of the diagrams whose stored content still uses the type. */
    public function usingType(string $key): array
    {
        $q = $this->db->prepare('SELECT name, content FROM blade_diagrams WHERE space=? ORDER BY name_key');
        $q->execute([$this->space]);
        $names = [];
        foreach ($q->fetchAll(\PDO::FETCH_ASSOC) as $row) {
            $nodes = json_decode($row['content'], true)['nodes'] ?? [];
            if (array_filter($nodes, static fn($node) => ($node['type'] ?? '') === $key)) $names[] = $row['name'];
        }
        return $names;
    }
}
