<?php
declare(strict_types=1);
namespace Blade\Shell;

use Blade\Navigation\Menu;

final readonly class ApplicationDefinition
{
    /**
     * Same-origin browser path relative to the page or root-absolute, `[A-Za-z0-9_-]` segments, optional `?…` cache key;
     * `%s` is the extension alternation.
     */
    public const PATH = '~^(?:/|(?:\.\./)*)?[A-Za-z0-9_-]+(?:/[A-Za-z0-9_-]+)*\.(%s)(?:\?[A-Za-z0-9_.=-]+)?$~D';

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
        /**
         * Filesystem directory the site root `/` is served from; the shell derives the assets' cache keys from the files
         * below it (docs/toolkit.md#cache-keys). Null: the request's `DOCUMENT_ROOT`.
         */
        public ?string $documentRoot = null,
        /** Optional application logo of the top menu row and the sign-in windows (docs/shell.md#sign-in-branding). */
        public ?Logo $logo = null,
        /**
         * Project stylesheets (`.css`) of the sign-in, e-mail confirmation and password-change pages, linked there after
         * the framework CSS; the signed-in shell uses `stylesheets` instead. No project JavaScript runs before sign-in.
         * @var list<string>
         */
        public array $signInStylesheets = [],
        /** Optional notice and links of the sign-in windows (docs/shell.md#sign-in-content). */
        public ?SignIn $signIn = null,
        /**
         * Project ES modules (`.js`/`.mjs`) of the signed-out pages only, paths and keys like `modules`; each default
         * export gets the restricted `SignInApplication` (docs/shell.md#sign-in-modules). Trusted project code: the page
         * holds the password field.
         * @var list<string>
         */
        public array $signInModules = [],
    ) {
        if ($title === '' || $runtime === '' || !preg_match('/^[a-zA-Z][a-zA-Z0-9_]+$/D', $sessionName)
            || !str_starts_with($cookiePath, '/') || preg_match('/[;\x00-\x20]/', $cookiePath)
            || !preg_match('~^(?:/|(?:\.\./)*)?[A-Za-z0-9_-]+(?:/[A-Za-z0-9_-]+)*$~D', $assets)
            || !self::paths($modules, 'm?js') || !self::paths($stylesheets, 'css')
            || ($documentRoot !== null && ($documentRoot === '' || str_contains($documentRoot, "\0")))) {
            throw new \InvalidArgumentException('Invalid 61ade application definition.');
        }
        if (!self::paths($signInStylesheets, 'css')) throw new \InvalidArgumentException('Invalid 61ade sign-in stylesheets.');
        if (!self::paths($signInModules, 'm?js')) throw new \InvalidArgumentException('Invalid 61ade sign-in modules.');
        // `view:<id>` activation targets name record views once every view is declared.
        $workspace?->registry->checkViews();
    }

    /**
     * $path with `?v=<version>` appended unless it has its own cache key or the version is empty: the fallback key of
     * an asset whose file the shell cannot find (docs/toolkit.md#cache-keys).
     */
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
