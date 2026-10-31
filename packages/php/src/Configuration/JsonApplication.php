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
        Shape::check($application, ['title' => 'string', 'runtime' => 'string'], ['version' => 'string', 'skins' => 'string', 'modules' => 'array', 'stylesheets' => 'array', 'document_root' => 'string', 'logo' => 'any', 'sign_in_stylesheets' => 'array', 'sign_in' => 'array', 'sign_in_modules' => 'array', 'guides' => 'array'], '$.application');
        if (isset($application['guides']) && array_is_list($application['guides']) && $application['guides'] !== []) throw new \InvalidArgumentException('Invalid configuration type: $.application.guides');
        // `false`: no logo (Logo::none()); an object, `image` optional (without it the product logo); absent: the default.
        $logo = $application['logo'] ?? null;
        if ($logo !== null && $logo !== false && !is_array($logo)) throw new \InvalidArgumentException('Invalid configuration type: $.application.logo');
        if (is_array($logo)) Shape::check($logo, [], ['image' => 'string', 'dark_image' => 'string', 'label' => 'string', 'placement' => 'string'], '$.application.logo');
        $signIn = $application['sign_in'] ?? null;
        if ($signIn !== null) {
            Shape::check($signIn, [], ['notice' => 'string', 'links' => 'array'], '$.application.sign_in');
            if (!array_is_list($signIn['links'] ?? [])) throw new \InvalidArgumentException('Invalid configuration type: $.application.sign_in.links');
            foreach ($signIn['links'] ?? [] as $index => $link) {
                if (!is_array($link)) throw new \InvalidArgumentException('Invalid configuration type: $.application.sign_in.links.'.$index);
                Shape::check($link, ['label' => 'string', 'href' => 'string'], [], '$.application.sign_in.links.'.$index);
            }
        }
        Shape::check($session, ['name' => 'string', 'cookie_path' => 'string'], [], '$.session');
        Shape::check($live, [
            'transport' => 'string',
            'endpoint' => 'string',
            'interval_ms' => 'integer',
        ], ['applications' => 'array'], '$.live');
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
            live: new LiveConfig($live['transport'], $live['endpoint'], $live['interval_ms'], array_map($config->path(...), $live['applications'] ?? [])),
            authentication: $authentication,
            version: $application['version'] ?? '',
            languages: $languages,
            accounts: $accounts,
            oauth: $oauth,
            // Optional application skins: an identity binding name, Closure(Identity): list<Skin>.
            skins: (new Bindings($identityBindings))->get($application['skins'] ?? null),
            // Browser paths relative to the page (not to the JSON directory), validated by ApplicationDefinition.
            modules: $application['modules'] ?? [],
            stylesheets: $application['stylesheets'] ?? [],
            // Optional directory served at `/` (relative to the JSON directory) for the assets' cache keys.
            // Sign-in branding (docs/shell.md#sign-in-branding): browser paths like `stylesheets`.
            logo: match (true) { $logo === null => null, $logo === false => \Blade\Shell\Logo::none(), default => new \Blade\Shell\Logo($logo['image'] ?? null, $logo['dark_image'] ?? null, $logo['label'] ?? null, $logo['placement'] ?? 'window') },
            signInStylesheets: $application['sign_in_stylesheets'] ?? [],
            signIn: $signIn === null ? null : new \Blade\Shell\SignIn($signIn['notice'] ?? null, array_map(static fn(array $link) => new \Blade\Shell\SignInLink($link['label'], $link['href']), $signIn['links'] ?? [])),
            signInModules: $application['sign_in_modules'] ?? [],
            // View guides by view id, the framework's own views too (docs/workspaces.md#view-guide).
            guides: $application['guides'] ?? [],
            documentRoot: match ($application['document_root'] ?? null) { null => null, '' => '', default => $config->path($application['document_root']) },
        );
    }
}
