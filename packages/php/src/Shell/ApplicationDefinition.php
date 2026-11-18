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
    /** An HTTPS origin, optionally every subdomain of a domain of at least two labels (`https://*.example.com`). */
    public const FRAME_SOURCE = '~^https://(?:\*\.)?[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+(?::[0-9]{1,5})?$~D';

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
        /**
         * Menu icons of view groups by declared group label (docs/shell.md#menu-group-icons), applied once every view is
         * declared: they set or replace the icon of any group, the framework's `Adminisztráció` too. @var array<string, string>
         */
        public array $menuGroupIcons = [],
        /** Optional active account id whose UI permissions are offered without sign-in (docs/authentication.md#public-access). */
        public ?string $publicIdentity = null,
        /** SameSite of the session and remembered-login cookies: `Lax` or `Strict` (docs/authentication.md#cookie-samesite). */
        public string $sameSite = 'Lax',
        /** End a signed-in session used from another client address (docs/authentication.md#client-address-binding). */
        public bool $bindSessionToClientAddress = false,
        /** Application commands of the menu row, at most 3 with unique ids (docs/shell.md#menu-commands). @var list<\Blade\Navigation\MenuCommand> */
        public array $menuCommands = [],
        /**
         * Further origins the signed-in shell may show in frames (docs/shell.md#frame-sources): `https://host[:port]` or
         * `https://*.domain[:port]`. The page's CSP then has `frame-src 'self'` plus these; none keeps frames to the shell's
         * own origin (the `default-src 'self'` fallback). The framed site decides with its own `frame-ancestors`.
         * @var list<string>
         */
        public array $frameSources = [],
        /**
         * The default largest height in px of a fitted window (docs/workspaces.md#window-sizing), an integer 320–4000;
         * null keeps the framework's 800. A window's own `WindowOptions.maxHeight` still wins, and the viewport less
         * 24 px still caps it. The bootstrap carries it only when declared.
         */
        public ?int $windowMaxHeight = null,
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
        if ($windowMaxHeight !== null && ($windowMaxHeight < 320 || $windowMaxHeight > 4000)) throw new \InvalidArgumentException('Invalid 61ade window maximum height (320–4000 px).');
        if ($sameSite !== 'Lax' && $sameSite !== 'Strict') throw new \InvalidArgumentException('Invalid 61ade SameSite policy.');
        if ($sameSite === 'Strict' && $oauth !== null) throw new \InvalidArgumentException('61ade OAuth requires SameSite=Lax.');
        if ($publicIdentity !== null && ($publicIdentity === '' || strlen($publicIdentity) > 100 || preg_match('/[\x00-\x1f\x7f]/', $publicIdentity))) {
            throw new \InvalidArgumentException('Invalid 61ade public identity.');
        }
        if (!self::paths($signInStylesheets, 'css')) throw new \InvalidArgumentException('Invalid 61ade sign-in stylesheets.');
        if (!self::paths($signInModules, 'm?js')) throw new \InvalidArgumentException('Invalid 61ade sign-in modules.');
        if (!array_is_list($frameSources) || count(array_unique($frameSources, SORT_REGULAR)) !== count($frameSources)
            || array_filter($frameSources, static fn($source): bool => !is_string($source) || !preg_match(self::FRAME_SOURCE, $source))) {
            throw new \InvalidArgumentException('Invalid 61ade frame sources.');
        }
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
        if ($menuGroupIcons && !$workspace) throw new \InvalidArgumentException('Menu group icons need a workspace.');
        foreach ($menuGroupIcons as $group => $icon) {
            if (!is_string($icon)) throw new \InvalidArgumentException('Invalid group icon: '.$group);
            $workspace->registry->groupIcon((string) $group, $icon);
        }
        if (!array_is_list($menuCommands) || count($menuCommands) > 3) throw new \InvalidArgumentException('Menu commands must be a list of at most 3 MenuCommand objects.');
        $commands = [];
        foreach ($menuCommands as $command) {
            if (!$command instanceof \Blade\Navigation\MenuCommand || isset($commands[$command->id])) throw new \InvalidArgumentException('Menu commands must be unique MenuCommand objects.');
            $commands[$command->id] = true;
            // The count is that of a declared view's attention (docs/shell.md#menu-attention).
            if ($command->attention !== null && ($workspace?->registry->viewById($command->attention)?->attention === null)) {
                throw new \InvalidArgumentException('A menu command\'s attention names a view that declares attention: '.$command->id);
            }
        }
        // `view:<id>` activation targets name record views once every view is declared.
        $workspace?->registry->checkViews();
        $workspace?->registry->checkFileFields();
    }

    /** The shell CSP's `frame-src` value: `'self'` and the declared frame sources; '' when none is declared. */
    public function frameSource(): string
    {
        return $this->frameSources ? "'self' ".implode(' ', $this->frameSources) : '';
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
