<?php
declare(strict_types=1);
namespace Vapa\Shell;

use Vapa\Navigation\Menu;

final readonly class ApplicationDefinition
{
    public function __construct(
        public string $title,
        public IdentityProvider $identities,
        public Menu $menu,
        public string $runtime,
        public string $sessionName = 'vapa_session',
        public string $cookiePath = '/',
        public ?\Vapa\Feature\Workspace $workspace = null,
        public \Vapa\Live\LiveConfig $live = new \Vapa\Live\LiveConfig(),
        public ?\Vapa\Authentication\LoginSecurity $authentication = null,
    ) {
        if ($title === '' || $runtime === '' || !preg_match('/^[a-zA-Z][a-zA-Z0-9_]+$/D', $sessionName)
            || !str_starts_with($cookiePath, '/') || preg_match('/[;\x00-\x20]/', $cookiePath)) {
            throw new \InvalidArgumentException('Invalid VAPA application definition.');
        }
    }
}
