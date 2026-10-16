<?php

declare(strict_types=1);

namespace Vapa\Configuration;

use InvalidArgumentException;

/** Small strict shape checks for the supported configuration contract. */
final class Shape
{
    public static function check(array $values, array $required, array $optional, string $path): void
    {
        $types = $required + $optional + ['description' => 'string'];
        foreach ($required as $key => $type) {
            if (!array_key_exists($key, $values)) {
                throw new InvalidArgumentException('Missing configuration key: '.$path.'.'.$key);
            }
        }
        foreach ($values as $key => $value) {
            if (!isset($types[$key])) {
                throw new InvalidArgumentException('Unknown configuration key: '.$path.'.'.$key);
            }
            $valid = match ($types[$key]) {
                'string' => is_string($value),
                'boolean' => is_bool($value),
                'integer' => is_int($value),
                'array' => is_array($value),
                'scalar' => is_scalar($value),
                'any' => true,
                default => false,
            };
            if (!$valid) {
                throw new InvalidArgumentException('Invalid configuration type: '.$path.'.'.$key);
            }
        }
    }
}
