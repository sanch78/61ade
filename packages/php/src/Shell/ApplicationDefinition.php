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
        /** Optional application skins of the effective identity (including public access); none keeps the factory themes. */
        public ?\Closure $skins = null,
        /**
         * Browser ES modules (`.js`/`.mjs`) of the project, paths like `assets`/skin stylesheets; the signed-in shell
         * imports them and calls each default export with its `Application` (docs/toolkit.md#module-loading).
         * Public access uses the same modules. @var list<string>
         */
        public array $modules = [],
        /** Project stylesheets (`.css`), linked on application pages after the framework CSS and skins. @var list<string> */
        public array $stylesheets = [],
        /**
         * Filesystem directory the site root `/` is served from; the shell derives the assets' cache keys from the files
         * below it (docs/toolkit.md#cache-keys). Null: the request's `DOCUMENT_ROOT`.
         */
        public ?string $documentRoot = null,
        /**
         * Logo of the top menu row and the sign-in windows (docs/shell.md#sign-in-logo); null: the 61ade product logo
         * (docs/brand.md) with placement `window`; `Logo::none()`: none.
         */
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
        /**
         * View guides by view id (docs/workspaces.md#view-guide), applied once every view is declared: they set or
         * replace the `guide` of any view of the workspace, the framework's own views (administration, API keys) too.
         * @var array<string, string>
         */
        public array $guides = [],
        /** Seconds since the last HTTP request before authentication expires (60–31536000); live traffic does not refresh it. */
        public int $sessionIdleTimeout = 1800,
        /** Session cookie lifetime in seconds (0–31536000); zero keeps a browser-session cookie, positive values renew on each HTTP request. */
        public int $sessionCookieLifetime = 0,
        /** View group labels that get a preceding native menu separator (docs/shell.md#menu-group-separators). @var list<string> */
        public array $menuSeparators = [],
        /** Optional active account id whose UI permissions are offered without sign-in (docs/authentication.md#public-access). */
        public ?string $publicIdentity = null,
        /** SameSite of the session and remembered-login cookies: `Lax` or `Strict` (docs/authentication.md#cookie-samesite). */
        public string $sameSite = 'Lax',
        /** End a signed-in session used from another client address (docs/authentication.md#client-address-binding). */
        public bool $bindSessionToClientAddress = false,
    ) {
        if ($title === '' || $runtime === '' || !preg_match('/^[a-zA-Z][a-zA-Z0-9_]+$/D', $sessionName)
            || !str_starts_with($cookiePath, '/') || preg_match('/[;\x00-\x20]/', $cookiePath)
            || !preg_match('~^(?:/|(?:\.\./)*)?[A-Za-z0-9_-]+(?:/[A-Za-z0-9_-]+)*$~D', $assets)
            || !self::paths($modules, 'm?js') || !self::paths($stylesheets, 'css')
            || ($documentRoot !== null && ($documentRoot === '' || str_contains($documentRoot, "\0")))) {
            throw new \InvalidArgumentException('Invalid 61ade application definition.');
        }
        if ($sessionIdleTimeout < 60 || $sessionIdleTimeout > 31536000 || $sessionCookieLifetime < 0 || $sessionCookieLifetime > 31536000) {
            throw new \InvalidArgumentException('Invalid 61ade session lifetime.');
        }
        if ($sameSite !== 'Lax' && $sameSite !== 'Strict') throw new \InvalidArgumentException('Invalid 61ade SameSite policy.');
        if ($publicIdentity !== null && ($publicIdentity === '' || strlen($publicIdentity) > 100 || preg_match('/[\x00-\x1f\x7f]/', $publicIdentity))) {
            throw new \InvalidArgumentException('Invalid 61ade public identity.');
        }
        if (!self::paths($signInStylesheets, 'css')) throw new \InvalidArgumentException('Invalid 61ade sign-in stylesheets.');
        if (!self::paths($signInModules, 'm?js')) throw new \InvalidArgumentException('Invalid 61ade sign-in modules.');
        if ($guides && !$workspace) throw new \InvalidArgumentException('View guides need a workspace.');
        foreach ($guides as $id => $guide) {
            if (!is_string($guide)) throw new \InvalidArgumentException('Invalid view guide: '.$id);
            $view = $workspace->registry->viewById((string) $id) ?? throw new \InvalidArgumentException('Unknown view in guides: '.$id);
            $workspace->registry->updateView($view->with(guide: $guide));
        }
        if (!array_is_list($menuSeparators)) throw new \InvalidArgumentException('Menu separators must be a list of view groups.');
        $groups = array_column($workspace?->registry->views() ?? [], 'group');
        $seen = [];
        foreach ($menuSeparators as $group) {
            if (!is_string($group) || !in_array($group, $groups, true) || isset($seen[$group])) {
                throw new \InvalidArgumentException('Menu separators require unique, declared view groups.');
            }
            $seen[$group] = true;
        }
        // `view:<id>` activation targets name record views once every view is declared.
        $workspace?->registry->checkViews();
        $workspace?->registry->checkFileFields();
    }

    /** Resolve on every request: a missing or disabled public account grants no access, and is never a sign-in. */
    public function publicActor(): ?Identity
    {
        $actor = $this->publicIdentity === null ? null : $this->identities->find($this->publicIdentity);
        if (!$actor) return null;
        if ($actor->id !== $this->publicIdentity) throw new \UnexpectedValueException('The public identity must resolve to its declared account id.');
        return new Identity($actor->id, $actor->displayName, $actor->attributes, authenticated: false);
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
