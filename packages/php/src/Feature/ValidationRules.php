<?php

declare(strict_types=1);

namespace Blade\Feature;

use InvalidArgumentException;

/** Portable declarative rules shared with the DHTMLX form adapter. */
final class ValidationRules
{
    public static function check(array $rules): void
    {
        foreach ($rules as $key => $value) {
            $valid = match ($key) {
                'min_length' => is_int($value) && $value >= 0,
                'matches_field', 'not_before_field', 'not_after_field' => is_string($value) && preg_match('/^[a-z][a-z0-9_]*$/D', $value),
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
            return $field->required ? \Blade\I18n\Translator::text('Kötelező mező.') : null;
        }
        if (self::length($value) > $field->max) {
            return \Blade\I18n\Translator::text('Legfeljebb {count} karakter adható meg.', ['count'=>$field->max]);
        }
        $rules = $field->validation;
        if (self::length($value) < ($rules['min_length'] ?? 0)) {
            return \Blade\I18n\Translator::text('Legalább {count} karakter szükséges.', ['count'=>$rules['min_length']]);
        }
        if (isset($rules['pattern']) && preg_match(self::pattern($rules['pattern']), $value) !== 1) {
            return \Blade\I18n\Translator::text($rules['pattern']['message'] ?? 'Hibás formátum.');
        }
        if (isset($rules['matches_field']) && (!is_scalar($values[$rules['matches_field']] ?? null)
            || !hash_equals((string) $values[$rules['matches_field']], $value))) {
            return \Blade\I18n\Translator::text('A két mező értéke nem egyezik.');
        }
        // A range: dates (YYYY-MM-DD) and other text compare as strings, nonnegative integers as numbers; an empty other end is open.
        if (isset($rules['not_before_field']) && self::compare($value, $values[$rules['not_before_field']] ?? '') < 0) {
            return \Blade\I18n\Translator::text('Nem lehet korábbi vagy kisebb a kezdő értéknél.');
        }
        if (isset($rules['not_after_field']) && self::compare($value, $values[$rules['not_after_field']] ?? '') > 0) {
            return \Blade\I18n\Translator::text('Nem lehet későbbi vagy nagyobb a záró értéknél.');
        }
        return null;
    }

    /** <0, 0 or >0 as $value is before, equal to or after $other; 0 when $other is empty or not a scalar. */
    private static function compare(string $value, mixed $other): int
    {
        $other = is_scalar($other) ? trim((string) $other) : '';
        if ($other === '') return 0;
        if (preg_match('/^\d+$/D', $value) && preg_match('/^\d+$/D', $other)) return strlen(ltrim($value, '0')) <=> strlen(ltrim($other, '0')) ?: strcmp(ltrim($value, '0'), ltrim($other, '0'));
        return strcmp($value, $other);
    }
}
