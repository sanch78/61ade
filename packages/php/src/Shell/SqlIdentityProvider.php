<?php
declare(strict_types=1);
namespace Vapa\Shell;

/** Maps an explicitly declared account schema; no application table names in VAPA. */
final class SqlIdentityProvider implements IdentityProvider
{
    public function __construct(
        private \PDO $db,
        private string $table,
        private string $idColumn,
        private string $usernameColumn,
        private string $passwordColumn,
        private string $nameColumn,
        private array $attributeColumns = [],
        private ?\Closure $allowed = null,
        private ?\Closure $passwordVerifier = null,
    ) {
        foreach ([$table, $idColumn, $usernameColumn, $passwordColumn, $nameColumn, ...$attributeColumns] as $identifier) {
            if (!is_string($identifier) || !preg_match('/^[a-zA-Z_][a-zA-Z0-9_]*$/D', $identifier)) {
                throw new \InvalidArgumentException('Invalid account schema identifier.');
            }
        }
        if (in_array($passwordColumn, [$idColumn, $usernameColumn, $nameColumn, ...$attributeColumns], true)) {
            throw new \InvalidArgumentException('Password data cannot be identity metadata.');
        }
    }

    public function authenticate(string $username, #[\SensitiveParameter] string $password): ?Identity
    {
        $row = $this->fetch($this->usernameColumn, $username, true);
        $hash = $row[$this->passwordColumn] ?? '';
        $valid = $this->passwordVerifier
            ? ($this->passwordVerifier)($password, $hash)
            : password_verify($password, $hash);
        if ($row) unset($row[$this->passwordColumn]);
        return $row && $valid ? $this->identity($row) : null;
    }

    public function find(string $id): ?Identity
    {
        $row = $this->fetch($this->idColumn, $id, false);
        return $row ? $this->identity($row) : null;
    }

    private function fetch(string $column, string $value, bool $withPassword): array|false
    {
        $columns = array_unique([$this->idColumn, $this->usernameColumn, $this->nameColumn, ...$this->attributeColumns]);
        if ($withPassword) $columns[] = $this->passwordColumn;
        $query = $this->db->prepare('SELECT '.implode(', ', $columns).' FROM '.$this->table.' WHERE '.$column.' = :value LIMIT 1');
        $query->execute(['value' => $value]);
        return $query->fetch(\PDO::FETCH_ASSOC);
    }

    private function identity(array $row): ?Identity
    {
        if ($this->allowed && !($this->allowed)($row)) return null;
        return new Identity((string) $row[$this->idColumn], (string) ($row[$this->nameColumn] ?: $row[$this->usernameColumn]), $row);
    }
}
