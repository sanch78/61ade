<?php

declare(strict_types=1);

namespace Blade\Configuration;

use Closure;
use PDO;
use Blade\Infrastructure\Database;
use Blade\Live\LiveConfig;
use Blade\Navigation\Menu;
use Blade\Shell\ApplicationDefinition;

final class JsonApplication
{
    public static function load(string $file, array $identityBindings, Closure $workspaceBindings, ?PDO $db = null): ApplicationDefinition
    {
        $config = JsonConfiguration::load($file);
        $config->validate(array_fill_keys([
            'application', 'database', 'session', 'identity', 'live', 'workspace',
        ], 'array'), ['environment' => 'array', 'authentication' => 'array', 'i18n' => 'array', 'admin' => 'array', 'oauth' => 'array', 'tenancy' => 'array']);
        // Multi-tenancy is opt-in: an (empty) `tenancy` object enables it; there are no further keys yet.
        if ($config->has('tenancy')) Shape::check($config->section('tenancy'), [], [], '$.tenancy');
        $languages = new \Blade\I18n\Settings();
        if ($config->has('i18n')) {
            $languages = LanguageConfiguration::build($config->section('i18n'), $config->path(...));
        }
        $database = $config->section('database');
        $application = $config->section('application');
        $session = $config->section('session');
        $live = $config->section('live');
        $workspace = $config->section('workspace');
        Shape::check($application, ['title' => 'string', 'runtime' => 'string'], ['version' => 'string', 'skins' => 'string'], '$.application');
        Shape::check($session, ['name' => 'string', 'cookie_path' => 'string'], [], '$.session');
        Shape::check($live, [
            'transport' => 'string',
            'endpoint' => 'string',
            'interval_ms' => 'integer',
        ], [], '$.live');
        Shape::check($workspace, ['modules' => 'array'], [], '$.workspace');
        Shape::check($database, [
            'host' => 'string',
            'port' => 'integer',
            'name' => 'string',
            'charset' => 'string',
            'user' => 'string',
            'password' => 'string',
        ], [], '$.database');
        $db ??= Database::connect($database);
        $identities = IdentityConfiguration::build($db, $config->section('identity'), $identityBindings);
        $builtWorkspace = WorkspaceConfiguration::build(
            $db,
            array_map($config->path(...), $workspace['modules']),
            $workspaceBindings,
            $config->has('tenancy'),
        );
        if ($config->has('oauth') && !$config->has('admin')) {
            throw new \InvalidArgumentException('The oauth section requires the admin section (per-account OAuth permission).');
        }
        $accounts = null;
        if ($config->has('admin')) {
            $emailConfirmation = $config->has('authentication') ? ($config->section('authentication')['default_email_confirmation'] ?? true) : null;
            if ($emailConfirmation !== null && !is_bool($emailConfirmation)) throw new \InvalidArgumentException('Invalid $.authentication.default_email_confirmation.');
            $accounts = AdminConfiguration::build($config->section('admin'), $config->section('identity'), $identityBindings, $builtWorkspace, $identities, $languages, $config->has('oauth'), $emailConfirmation);
            $identities = $accounts->identities($identities);
        }
        $oauth = $accounts && $config->has('oauth') ? OAuthConfiguration::build($config->section('oauth'), $config->path(...), $config->path($application['runtime']), $accounts, $identities, $builtWorkspace) : null;
        $authentication = null;
        if ($config->has('authentication')) {
            $authentication = AuthenticationConfiguration::build(
                $config->section('authentication'), $identityBindings, $application['title'], $config->path($application['runtime']), $builtWorkspace, $identities,
            );
        }

        return new ApplicationDefinition(
            title: $application['title'],
            identities: $identities,
            menu: new Menu([]),
            runtime: $config->path($application['runtime']),
            sessionName: $session['name'],
            cookiePath: $session['cookie_path'],
            workspace: $builtWorkspace,
            live: new LiveConfig($live['transport'], $live['endpoint'], $live['interval_ms']),
            authentication: $authentication,
            version: $application['version'] ?? '',
            languages: $languages,
            accounts: $accounts,
            oauth: $oauth,
            // Optional application skins: an identity binding name, Closure(Identity): list<Skin>.
            skins: (new Bindings($identityBindings))->get($application['skins'] ?? null),
        );
    }
}
