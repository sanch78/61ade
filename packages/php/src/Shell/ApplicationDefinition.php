<?php
declare(strict_types=1);
namespace Blade\Shell;

use Blade\Navigation\Menu;

final readonly class ApplicationDefinition
{
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
    ) {
        if ($title === '' || $runtime === '' || !preg_match('/^[a-zA-Z][a-zA-Z0-9_]+$/D', $sessionName)
            || !str_starts_with($cookiePath, '/') || preg_match('/[;\x00-\x20]/', $cookiePath)
            || !preg_match('~^(?:/|(?:\.\./)*)?[A-Za-z0-9_-]+(?:/[A-Za-z0-9_-]+)*$~D', $assets)) {
            throw new \InvalidArgumentException('Invalid 61ade application definition.');
        }
    }
}
