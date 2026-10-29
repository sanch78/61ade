<?php
declare(strict_types=1);
namespace Blade\Shell;

use Blade\Navigation\Menu;

final readonly class ApplicationDefinition
{
    /** Same-origin browser path relative to the page or root-absolute, `[A-Za-z0-9_-]` segments, optional `?…` cache key. */
    private const PATH = '~^(?:/|(?:\.\./)*)?[A-Za-z0-9_-]+(?:/[A-Za-z0-9_-]+)*\.(%s)(?:\?[A-Za-z0-9_.=-]+)?$~D';

    public function __construct(
        public string $title,
        public IdentityProvider $identities,
        public Menu $menu,
        public string $runtime,
        public string $sessionName = 'blade_session',
        public string $cookiePath = '/',
        public ?\Blade\Feature\Workspace $workspace = null,
        public \Blade\Live\LiveConfig $live = new \Blade\Live\LiveConfig(),
        public ?\Blade\Authentication\LoginSecurity $authentication = null,
        public string $version = '',
        public \Blade\I18n\Settings $languages = new \Blade\I18n\Settings(),
        public ?\Blade\Admin\Accounts $accounts = null,
        public ?\Blade\Authentication\AuthHandlerLogin $oauth = null,
        /** Browser path of the built frontend, relative to the page (e.g. "../assets" under /admin/). */
        public string $assets = 'assets',
        /** Optional application skins of the signed-in identity: Closure(Identity): list<Skin>; none keeps the factory themes. */
        public ?\Closure $skins = null,
        /**
         * Browser ES modules (`.js`/`.mjs`) of the project, paths like `assets`/skin stylesheets; the signed-in shell
         * imports them and calls each default export with its `Application` (docs/toolkit.md#module-loading).
         * @var list<string>
         */
        public array $modules = [],
        /** Project stylesheets (`.css`), linked on signed-in pages after the framework CSS and skins. @var list<string> */
        public array $stylesheets = [],
    ) {
        if ($title === '' || $runtime === '' || !preg_match('/^[a-zA-Z][a-zA-Z0-9_]+$/D', $sessionName)
            || !str_starts_with($cookiePath, '/') || preg_match('/[;\x00-\x20]/', $cookiePath)
            || !preg_match('~^(?:/|(?:\.\./)*)?[A-Za-z0-9_-]+(?:/[A-Za-z0-9_-]+)*$~D', $assets)
            || !self::paths($modules, 'm?js') || !self::paths($stylesheets, 'css')) {
            throw new \InvalidArgumentException('Invalid 61ade application definition.');
        }
        // `view:<id>` activation targets name record views once every view is declared.
        $workspace?->registry->checkViews();
    }

    /** $path with `?v=<version>` appended unless it has its own cache key or the version is empty. */
    public function versioned(string $path): string
    {
        return $this->version === '' || str_contains($path, '?') ? $path : $path.'?v='.rawurlencode($this->version);
    }

    private static function paths(array $paths, string $extension): bool
    {
        if (!array_is_list($paths) || count(array_unique($paths, SORT_REGULAR)) !== count($paths)) return false;
        foreach ($paths as $path) if (!is_string($path) || !preg_match(sprintf(self::PATH, $extension), $path)) return false;
        return true;
    }
}
