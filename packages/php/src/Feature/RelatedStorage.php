<?php

declare(strict_types=1);

namespace Vapa\Feature;

use InvalidArgumentException;
use PDO;

/** A declared, uniquely keyed one-to-one extension of an object's stored fields. */
final readonly class RelatedStorage
{
    public function __construct(
        public string $table,
        public string $key,
        public array $fields,
        public array $defaults = [],
    ) {
        if (!$fields || count(array_unique(array_values($fields))) !== count($fields)) {
            throw new InvalidArgumentException('Related storage requires distinct field mappings.');
        }
        foreach ([$table, $key, ...array_keys($fields), ...array_values($fields)] as $identifier) {
            if (!is_string($identifier) || !preg_match('/^[a-zA-Z_][a-zA-Z0-9_]*$/D', $identifier)) {
                throw new InvalidArgumentException('Invalid related storage identifier.');
            }
        }
        if (in_array($key, $fields, true) || array_diff_key($defaults, $fields)) {
            throw new InvalidArgumentException('Invalid related storage defaults or key mapping.');
        }
        foreach ($defaults as $value) {
            if (!is_int($value) && !is_string($value)) {
                throw new InvalidArgumentException('Related storage defaults must be strings or integers.');
            }
        }
    }

    public function expressions(PDO $db, string $baseKey): array
    {
        $out = [];
        foreach ($this->fields as $field => $column) {
            $default = $this->defaults[$field] ?? '';
            $fallback = is_int($default) ? (string) $default : $db->quote($default);
            $out[] = "CAST(COALESCE((SELECT vapa_related.$column FROM {$this->table} vapa_related WHERE vapa_related.{$this->key} = CAST(vapa_base.$baseKey AS CHAR)), $fallback) AS CHAR) AS $field";
        }
        return $out;
    }

    public function read(PDO $db, string $id): array
    {
        $columns = implode(', ', array_map(static fn($field, $column) => "$column AS $field", array_keys($this->fields), $this->fields));
        $lock = $db->inTransaction() && $db->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql' ? ' FOR UPDATE' : '';
        $query = $db->prepare("SELECT $columns FROM {$this->table} WHERE {$this->key} = ?$lock");
        $query->execute([$id]);
        $row = $query->fetch(PDO::FETCH_ASSOC) ?: [];
        $out = [];
        foreach ($this->fields as $field => $column) {
            $out[$field] = $row[$field] ?? $this->defaults[$field] ?? '';
        }
        return $out;
    }

    public function delete(PDO $db, string $id): void
    {
        $db->prepare("DELETE FROM {$this->table} WHERE {$this->key} = ?")->execute([$id]);
    }

    public function save(PDO $db, string $id, array $values): void
    {
        $values = array_intersect_key($values, $this->fields);
        if (!$values) return;
        $query = $db->prepare("SELECT {$this->key} FROM {$this->table} WHERE {$this->key} = ?");
        $query->execute([$id]);
        if ($query->fetchColumn() === false) {
            $values = array_replace($this->defaults, $values);
            $columns = array_map(fn($field) => $this->fields[$field], array_keys($values));
            $columns[] = $this->key;
            $query = $db->prepare("INSERT INTO {$this->table} (".implode(', ', $columns).') VALUES ('.implode(', ', array_fill(0, count($columns), '?')).')');
        } else {
            $columns = array_map(fn($field) => $this->fields[$field].' = ?', array_keys($values));
            $query = $db->prepare("UPDATE {$this->table} SET ".implode(', ', $columns)." WHERE {$this->key} = ?");
        }
        $query->execute([...array_values($values), $id]);
    }
}
