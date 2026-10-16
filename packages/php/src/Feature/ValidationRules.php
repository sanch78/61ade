<?php

declare(strict_types=1);

namespace Vapa\Feature;

use InvalidArgumentException;

/** Portable declarative rules shared with the DHTMLX form adapter. */
final class ValidationRules
{
    public static function check(array $rules): void
    {
        foreach ($rules as $key => $value) {
            $valid = match ($key) {
                'min_length' => is_int($value) && $value >= 0,
                'matches_field' => is_string($value) && preg_match('/^[a-z][a-z0-9_]*$/D', $value),
                'unique' => is_bool($value),
                'pattern' => is_array($value),
                default => false,
            };
            if (!$valid) {
                throw new InvalidArgumentException('Invalid field validation rule: '.$key);
            }
        }
        if (isset($rules['pattern'])) {
            $pattern = $rules['pattern'];
            if (array_diff(array_keys($pattern), ['expression', 'flags', 'message'])
                || !is_string($pattern['expression'] ?? null)
                || !is_string($pattern['flags'] ?? '')
                || !preg_match('/^i?$/D', $pattern['flags'] ?? '')
                || (isset($pattern['message']) && !is_string($pattern['message']))
                || @preg_match(self::pattern($pattern), '') === false) {
                throw new InvalidArgumentException('Invalid portable validation pattern.');
            }
        }
    }

    public static function pattern(array $pattern): string
    {
        return '~'.str_replace('~', '\\~', $pattern['expression']).'~u'.($pattern['flags'] ?? '');
    }

    public static function length(string $value): int
    {
        return preg_match_all('/./us', $value);
    }

    public static function error(Field $field, string $value, array $values): ?string
    {
        if ($value === '') {
            return $field->required ? 'Kötelező mező.' : null;
        }
        if (self::length($value) > $field->max) {
            return 'Legfeljebb '.$field->max.' karakter adható meg.';
        }
        $rules = $field->validation;
        if (self::length($value) < ($rules['min_length'] ?? 0)) {
            return 'Legalább '.$rules['min_length'].' karakter szükséges.';
        }
        if (isset($rules['pattern']) && preg_match(self::pattern($rules['pattern']), $value) !== 1) {
            return $rules['pattern']['message'] ?? 'Hibás formátum.';
        }
        if (isset($rules['matches_field']) && (!is_scalar($values[$rules['matches_field']] ?? null)
            || !hash_equals((string) $values[$rules['matches_field']], $value))) {
            return 'A két mező értéke nem egyezik.';
        }
        return null;
    }
}
