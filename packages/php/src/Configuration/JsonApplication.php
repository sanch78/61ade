<?php

declare(strict_types=1);

namespace Vapa\Configuration;

use Closure;
use PDO;
use Vapa\Infrastructure\Database;
use Vapa\Live\LiveConfig;
use Vapa\Navigation\Menu;
use Vapa\Shell\ApplicationDefinition;

final class JsonApplication
{
    public static function load(string $file, array $identityBindings, Closure $workspaceBindings, ?PDO $db = null): ApplicationDefinition
    {
        $config = JsonConfiguration::load($file);
        $config->validate(array_fill_keys([
            'application', 'database', 'session', 'identity', 'live', 'workspace',
        ], 'array'), ['environment' => 'array', 'authentication' => 'array']);
        $database = $config->section('database');
        $application = $config->section('application');
        $session = $config->section('session');
        $live = $config->section('live');
        $workspace = $config->section('workspace');
        Shape::check($application, ['title' => 'string', 'runtime' => 'string'], ['version' => 'string'], '$.application');
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
        );
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
        );
    }
}
