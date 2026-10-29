<?php

declare(strict_types=1);

namespace Blade\Feature;

use InvalidArgumentException;
use PDO;

/**
 * A declared many-to-many extension of an object: one multiselect field stored as rows of a link table
 * ($key = the object's id, $value = one chosen key). Values read and list as a sorted comma-separated string.
 */
final readonly class RelatedSet
{
    /** @var array<string,string> field => value column, the shape SqlResource reads from RelatedStorage too */
    public array $fields;

    public function __construct(public string $table, public string $key, string $field, public string $value)
    {
        foreach ([$table, $key, $field, $value] as $identifier) {
            if (!preg_match('/^[a-zA-Z_][a-zA-Z0-9_]*$/D', $identifier)) throw new InvalidArgumentException('Invalid related set identifier.');
        }
        if ($key === $value) throw new InvalidArgumentException('Invalid related set key mapping.');
        $this->fields = [$field => $value];
    }

    public function expressions(PDO $db, string $baseKey): array
    {
        $field = array_key_first($this->fields);
        return ["COALESCE((SELECT GROUP_CONCAT(blade_set.{$this->value} ORDER BY blade_set.{$this->value}) FROM {$this->table} blade_set WHERE blade_set.{$this->key} = CAST(blade_base.$baseKey AS CHAR)), '') AS $field"];
    }

    public function read(PDO $db, string $id): array
    {
        $query = $db->prepare("SELECT {$this->value} FROM {$this->table} WHERE {$this->key} = ? ORDER BY {$this->value}");
        $query->execute([$id]);
        return [array_key_first($this->fields) => implode(',', array_map('strval', $query->fetchAll(PDO::FETCH_COLUMN)))];
    }

    public function delete(PDO $db, string $id): void
    {
        $db->prepare("DELETE FROM {$this->table} WHERE {$this->key} = ?")->execute([$id]);
    }

    public function save(PDO $db, string $id, array $values): void
    {
        $field = array_key_first($this->fields);
        if (!array_key_exists($field, $values)) return;
        $chosen = array_values(array_filter(explode(',', (string) $values[$field]), static fn($item) => $item !== ''));
        $this->delete($db, $id);
        $insert = $db->prepare("INSERT INTO {$this->table} ({$this->key}, {$this->value}) VALUES (?, ?)");
        foreach ($chosen as $item) $insert->execute([$id, $item]);
    }
}
