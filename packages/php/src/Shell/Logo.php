<?php
declare(strict_types=1);
namespace Blade\Shell;

/**
 * Application logo of the shell (docs/shell.md#sign-in-branding): the end of the signed-in top menu row and, on the
 * sign-in, e-mail confirmation and password-change pages, the window, the top row or both (`placement`). The light
 * image shows with Skyblue, light and light-based skins, the optional dark image with the dark theme and dark-based
 * skins. Presentation only.
 */
final readonly class Logo
{
    public function __construct(
        /** Browser path of the light-theme image (`.svg`/`.png`/`.webp`), checked and keyed like the stylesheets. */
        public string $image,
        /** Optional dark-theme image, same rules; null: the light image in every theme. */
        public ?string $darkImage = null,
        /** Localizable accessible text of the logo; null: the application title. */
        public ?string $label = null,
        /**
         * Where the signed-out pages show it: `window` (above the form; default: the page's one focus, never competing
         * with the selectors for room), `top` (end of the top row, as in the shell) or `both` (the window's instance
         * carries the accessible name, the top row's is hidden from assistive technology).
         */
        public string $placement = 'window',
    ) {
        if (!in_array($placement, ['window', 'top', 'both'], true)) throw new \InvalidArgumentException('Invalid 61ade logo placement: '.$placement);
        foreach ([$image, $darkImage ?? $image] as $path) {
            if (!preg_match(sprintf(ApplicationDefinition::PATH, 'svg|png|webp'), $path)) throw new \InvalidArgumentException('Invalid 61ade logo image: '.$path);
        }
        if ($label !== null && trim($label) === '') throw new \InvalidArgumentException('Invalid 61ade logo label.');
    }
}
