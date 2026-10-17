<?php

declare(strict_types=1);
namespace Vapa\I18n;

/** Request-scoped language context. Source text is a stable message key/fallback. */
final class Translator
{
    private static string $locale = 'hu';
    private static array $messages = [];

    public static function configure(Settings $settings, ?string $locale = null): void
    {
        self::$locale = isset($settings->languages[$locale ?? '']) ? $locale : $settings->default;
        $load = static function (string $language): array {
            $file = dirname(__DIR__, 2).'/resources/locales/'.$language.'.json';
            return is_file($file) ? json_decode(file_get_contents($file), true, flags: JSON_THROW_ON_ERROR) : [];
        };
        self::$messages = array_replace($load($settings->default), $settings->catalogues[$settings->default] ?? [], $load(self::$locale), $settings->catalogues[self::$locale] ?? []);
    }
    public static function locale(): string { return self::$locale; }
    public static function messages(): array { return self::$messages; }
    public static function text(string $key, array $parameters = []): string
    {
        $text = self::$messages[$key] ?? $key;
        $replace = [];
        foreach ($parameters as $name => $value) $replace['{'.$name.'}'] = (string) $value;
        return strtr($text, $replace);
    }
    /** Presentation only; never recursively translate records, IDs or user values. */
    public static function presentation(array $definition): array
    {
        foreach ($definition as $key => &$value) {
            if (is_string($value) && in_array($key, ['label','header','title','group','submitLabel','message','text'], true)) $value = self::text($value);
            elseif (is_array($value) && $key !== 'options' && $key !== 'defaultValue') $value = self::presentation($value);
        }
        return $definition;
    }
}
