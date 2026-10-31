<?php
declare(strict_types=1);
namespace Blade\Shell;

/**
 * Logo of the shell (docs/shell.md#sign-in-logo): the end of the signed-in top menu row and, on the sign-in, e-mail
 * confirmation and password-change pages, the window, the top row or both (`placement`). Without an `image` it is the
 * 61ade product logo, the framework default an application gets when it declares no logo (docs/brand.md);
 * `Logo::none()` shows none. With images, the light one shows with Blade, light and light-based skins, the optional
 * dark one with the dark theme and dark-based skins. Presentation only.
 */
final readonly class Logo
{
    /** Accessible name of the product logo: its visible wordmark (docs/brand.md). */
    public const PRODUCT_LABEL = 'blade';

    public function __construct(
        /** Browser path of the light-theme image (`.svg`/`.png`/`.webp`), checked and keyed like the stylesheets; null: the product logo. */
        public ?string $image = null,
        /** Optional dark-theme image, same rules (needs `image`); null: the light image in every theme. */
        public ?string $darkImage = null,
        /** Localizable accessible text; null: the application title, or `blade` for the product logo. */
        public ?string $label = null,
        /**
         * Where the signed-out pages show it: `window` (above the form; default: the page's one focus, never competing
         * with the selectors for room), `top` (end of the top row, as in the shell) or `both` (the window's instance
         * carries the accessible name, the top row's is hidden from assistive technology).
         */
        public string $placement = 'window',
        /** False only for `Logo::none()`: no logo anywhere. */
        public bool $shown = true,
    ) {
        if (!in_array($placement, ['window', 'top', 'both'], true)) throw new \InvalidArgumentException('Invalid 61ade logo placement: '.$placement);
        if ($image === null && $darkImage !== null) throw new \InvalidArgumentException('Invalid 61ade logo: a dark image needs an image.');
        foreach (array_filter([$image, $darkImage], 'is_string') as $path) {
            if (!preg_match(sprintf(ApplicationDefinition::PATH, 'svg|png|webp'), $path)) throw new \InvalidArgumentException('Invalid 61ade logo image: '.$path);
        }
        if ($label !== null && trim($label) === '') throw new \InvalidArgumentException('Invalid 61ade logo label.');
    }

    /** No logo at all: the opt-out from the framework default. */
    public static function none(): self
    {
        return new self(shown: false);
    }
}
