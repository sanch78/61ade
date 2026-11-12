<?php
declare(strict_types=1);
namespace Blade\Infrastructure;

final class Database
{
    public static function fromEnvironment(string $file, string $prefix, bool $readOnly = false): \PDO
    {
        $env = is_file($file) ? parse_ini_file($file, false, INI_SCANNER_RAW) : [];
        if ($env === false) throw new \RuntimeException('Invalid database environment file.');
        $get = static function (string $field, bool $optional = false) use ($prefix, $env): ?string {
            $key = $prefix.'_'.$field;
            $value = getenv($key);
            if ($value === false) $value = $env[$key] ?? null;
            if ($optional && ($value === null || $value === '')) return null;
            if (!is_string($value) || ($value === '' && $field !== 'PASSWORD')) {
                throw new \RuntimeException('Missing database configuration: '.$field);
            }
            return $value;
        };
        return self::connect([
            'host' => $get('HOST'),
            'port' => $get('PORT'),
            'name' => $get('NAME'),
            'charset' => $get('CHARSET'),
            'user' => $get('USER'),
            'password' => $get('PASSWORD'),
            ...(($collation = $get('COLLATION', true)) !== null ? ['collation' => $collation] : []),
        ], $readOnly);
    }

    /**
     * Connect using resolved configuration; credentials are never part of errors. Optional `collation` sets the
     * connection collation (`SET NAMES charset COLLATE collation`); without it the server's default collation for
     * the charset applies, which must match the schema's string columns (docs/shell.md#database-connection).
     */
    public static function connect(array $configuration, bool $readOnly = false): \PDO
    {
        foreach (['host', 'port', 'name', 'charset', 'user', 'password'] as $field) {
            if (!isset($configuration[$field]) || !is_scalar($configuration[$field])
                || ((string) $configuration[$field] === '' && $field !== 'password')) {
                throw new \RuntimeException('Missing database configuration: '.$field);
            }
        }
        $host = (string) $configuration['host'];
        $port = (string) $configuration['port'];
        $name = (string) $configuration['name'];
        $charset = (string) $configuration['charset'];
        $collation = isset($configuration['collation']) ? $configuration['collation'] : null;
        if (!ctype_digit($port) || !preg_match('/^[a-zA-Z0-9_]+$/D', $charset) || preg_match('/[;\x00-\x1f]/', $host.$name)
            || ($collation !== null && (!is_string($collation) || !preg_match('/^[a-zA-Z0-9_]+$/D', $collation) || !str_starts_with($collation, $charset.'_')))) {
            throw new \RuntimeException('Invalid database configuration.');
        }
        $db = new \PDO("mysql:host=$host;port=$port;dbname=$name;charset=$charset", (string) $configuration['user'], (string) $configuration['password'], [
            \PDO::ATTR_ERRMODE => \PDO::ERRMODE_EXCEPTION,
            \PDO::ATTR_DEFAULT_FETCH_MODE => \PDO::FETCH_ASSOC,
            \PDO::ATTR_EMULATE_PREPARES => false,
        ]);
        if ($collation !== null) $db->exec("SET NAMES $charset COLLATE $collation");
        if ($readOnly) $db->exec('SET SESSION TRANSACTION READ ONLY');
        return $db;
    }
}
