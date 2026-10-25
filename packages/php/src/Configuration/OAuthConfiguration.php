<?php

declare(strict_types=1);

namespace Blade\Configuration;

use Closure;
use Blade\Admin\Accounts;
use Blade\Authentication\AuthHandlerLogin;
use Blade\Feature\Workspace;
use Blade\Shell\IdentityProvider;

/**
 * Optional "oauth" section: external sign-in through the standalone _AuthHandler library.
 * A provider whose id or secret resolves to an empty value (e.g. an unset environment
 * variable with "default": "") stays hidden.
 */
final class OAuthConfiguration
{
    public static function build(array $definition, Closure $path, string $runtime, Accounts $accounts, IdentityProvider $identities, Workspace $workspace): AuthHandlerLogin
    {
        Shape::check($definition, ['module' => 'string', 'assets' => 'string', 'providers' => 'array'], [
            'description' => 'string', 'site_url' => 'string', 'storage' => 'string', 'texts' => 'array',
        ], '$.oauth');
        $providers = [];
        foreach ($definition['providers'] as $name => $provider) {
            $where = '$.oauth.providers.'.$name;
            if (!is_array($provider)) throw new \InvalidArgumentException('Invalid OAuth provider at '.$where);
            Shape::check($provider, ['keys' => 'array'], ['scope' => 'string', 'enabled' => 'boolean'], $where);
            Shape::check($provider['keys'], ['id' => 'string', 'secret' => 'string'], [], $where.'.keys');
            $providers[$name] = $provider;
        }
        return new AuthHandlerLogin(
            $path($definition['module']), $definition['assets'], $providers, $accounts, $identities, $workspace,
            isset($definition['storage']) ? $path($definition['storage']) : $runtime.'/oauth-identities.sqlite',
            $definition['site_url'] ?? null, $definition['texts'] ?? [],
        );
    }
}
