<?php

declare(strict_types=1);
namespace Vapa\Configuration;

use Closure;
use Vapa\I18n\Settings;

final class LanguageConfiguration
{
    public static function build(array $definition, Closure $path): Settings
    {
        Shape::check($definition, ['default'=>'string','languages'=>'array'], ['selector'=>'boolean','catalogues'=>'array','flags'=>'array'], '$.i18n');
        $catalogues = [];
        foreach ($definition['catalogues'] ?? [] as $locale => $file) {
            if (!is_string($file)) throw new \InvalidArgumentException('Invalid catalogue path.');
            $catalogues[$locale] = JsonConfiguration::read($path($file));
        }
        return new Settings($definition['default'], $definition['languages'], $definition['selector'] ?? false, $catalogues, $definition['flags'] ?? []);
    }
}
