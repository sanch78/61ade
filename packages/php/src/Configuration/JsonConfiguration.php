<?php

declare(strict_types=1);

namespace Blade\Configuration;

use InvalidArgumentException;
use JsonException;

/** Trusted, server-side JSON with explicit environment references; never executable code. */
final readonly class JsonConfiguration
{
    private function __construct(public string $directory, private array $values)
    {
    }

    public static function load(string $file): self
    {
        $values = self::read($file);
        $directory = dirname(realpath($file));
        $environment = [];
        $settings = $values['environment'] ?? [];
        Shape::check($settings, [], ['files' => 'array', 'override_file_env' => 'string'], '$.environment');
        $override = isset($settings['override_file_env']) ? getenv($settings['override_file_env']) : false;
        $files = $override !== false ? [['path' => $override]] : ($settings['files'] ?? []);

        foreach ($files as $entry) {
            Shape::check($entry, ['path' => 'string'], ['optional' => 'boolean'], '$.environment.files');
            $path = self::absolute($directory, $entry['path']);
            if (!is_file($path) && ($entry['optional'] ?? false)) {
                continue;
            }
            $parsed = is_file($path) ? parse_ini_file($path, false, INI_SCANNER_RAW) : false;
            if ($parsed === false) {
                throw new InvalidArgumentException('Cannot read environment configuration: '.$path);
            }
            $environment = array_replace($environment, $parsed);
        }

        return new self($directory, self::resolve($values, $environment, '$'));
    }

    public static function read(string $file): array
    {
        $contents = is_file($file) ? file_get_contents($file) : false;
        if ($contents === false) {
            throw new InvalidArgumentException('Cannot read JSON configuration: '.$file);
        }
        try {
            $object = json_decode($contents, false, 64, JSON_THROW_ON_ERROR);
            if (!$object instanceof \stdClass) {
                throw new InvalidArgumentException('JSON configuration must be an object: '.$file);
            }
            return json_decode($contents, true, 64, JSON_THROW_ON_ERROR);
        } catch (JsonException $error) {
            throw new InvalidArgumentException('Invalid JSON configuration: '.$file, previous: $error);
        }
    }

    public function section(string $name): array
    {
        $value = $this->values[$name] ?? null;
        if (!is_array($value)) {
            throw new InvalidArgumentException('Missing configuration section: '.$name);
        }
        return $value;
    }

    public function validate(array $required, array $optional = []): void
    {
        Shape::check($this->values, $required, $optional, '$');
    }

    public function has(string $name): bool
    {
        return array_key_exists($name, $this->values);
    }

    public function path(string $value): string
    {
        return self::absolute($this->directory, $value);
    }

    private static function absolute(string $directory, string $value): string
    {
        return str_starts_with($value, '/') ? $value : $directory.'/'.$value;
    }

    private static function resolve(mixed $node, array $environment, string $path): mixed
    {
        if (!is_array($node)) {
            return $node;
        }
        if (array_key_exists('$env', $node)) {
            Shape::check($node, ['$env' => 'string'], ['default' => 'scalar', 'type' => 'string'], $path);
            $name = $node['$env'];
            if (!is_string($name) || !preg_match('/^[A-Z][A-Z0-9_]*$/D', $name)) {
                throw new InvalidArgumentException('Invalid environment reference at '.$path);
            }
            $value = getenv($name);
            if ($value === false) {
                $value = $environment[$name] ?? ($node['default'] ?? null);
            }
            if ($value === null) {
                throw new InvalidArgumentException('Missing environment variable '.$name.' at '.$path);
            }
            $type = $node['type'] ?? 'string';
            if ($type === 'integer') {
                if (filter_var($value, FILTER_VALIDATE_INT) === false) {
                    throw new InvalidArgumentException('Expected integer environment variable '.$name.' at '.$path);
                }
                return (int) $value;
            }
            if ($type === 'boolean') {
                $boolean = filter_var($value, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
                if ($boolean === null) {
                    throw new InvalidArgumentException('Expected boolean environment variable '.$name.' at '.$path);
                }
                return $boolean;
            }
            if ($type !== 'string' || !is_scalar($value)) {
                throw new InvalidArgumentException('Invalid environment type at '.$path);
            }
            return (string) $value;
        }
        foreach ($node as $key => $value) {
            $node[$key] = self::resolve($value, $environment, $path.'.'.$key);
        }
        return $node;
    }
}
