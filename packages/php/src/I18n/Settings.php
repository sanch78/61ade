<?php

declare(strict_types=1);
namespace Blade\I18n;

/** Every application has a locale, independently of selector visibility. */
final readonly class Settings
{
    public function __construct(
        public string $default = 'hu',
        public array $languages = ['hu' => 'Magyar'],
        public bool $selector = false,
        public array $catalogues = [],
        public array $flags = [],
    ) {
        if (!$languages || !isset($languages[$default])) throw new \InvalidArgumentException('Default locale must be supported.');
        foreach ($languages as $locale => $label) {
            if (!is_string($locale) || !preg_match('/^[a-z]{2}(?:-[A-Z]{2})?$/D', $locale) || !is_string($label) || $label === '') throw new \InvalidArgumentException('Invalid language definition.');
        }
        foreach ($flags as $locale => $flag) {
            if (!isset($languages[$locale]) || !is_string($flag) || !in_array($flag, ['hu','gb','de'], true)) throw new \InvalidArgumentException('Invalid language flag.');
        }
        foreach ($catalogues as $locale => $messages) {
            if (!isset($languages[$locale]) || !is_array($messages)) throw new \InvalidArgumentException('Invalid locale catalogue.');
            foreach ($messages as $key => $text) if (!is_string($key) || !is_string($text)) throw new \InvalidArgumentException('Messages must be strings.');
        }
    }
}
