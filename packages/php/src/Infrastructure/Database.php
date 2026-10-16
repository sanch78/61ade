<?php
declare(strict_types=1);
namespace Vapa\Infrastructure;

final class Database
{
    public static function fromEnvironment(string $file, string $prefix, bool $readOnly = false): \PDO
    {
        $env = is_file($file) ? parse_ini_file($file, false, INI_SCANNER_RAW) : [];
        if ($env === false) throw new \RuntimeException('Invalid database environment file.');
        $get = static function (string $field) use ($prefix, $env): string {
            $key = $prefix.'_'.$field;
            $value = getenv($key);
            if ($value === false) $value = $env[$key] ?? null;
            if (!is_string($value) || ($value === '' && $field !== 'PASSWORD')) {
                throw new \RuntimeException('Missing database configuration: '.$field);
            }
            return $value;
        };
        $host = $get('HOST'); $port = $get('PORT'); $name = $get('NAME'); $charset = $get('CHARSET');
        if (!ctype_digit($port) || !preg_match('/^[a-zA-Z0-9_]+$/D', $charset) || preg_match('/[;\x00-\x1f]/', $host.$name)) {
            throw new \RuntimeException('Invalid database configuration.');
        }
        $db = new \PDO("mysql:host=$host;port=$port;dbname=$name;charset=$charset", $get('USER'), $get('PASSWORD'), [
            \PDO::ATTR_ERRMODE => \PDO::ERRMODE_EXCEPTION,
            \PDO::ATTR_DEFAULT_FETCH_MODE => \PDO::FETCH_ASSOC,
            \PDO::ATTR_EMULATE_PREPARES => false,
        ]);
        if ($readOnly) $db->exec('SET SESSION TRANSACTION READ ONLY');
        return $db;
    }
}
