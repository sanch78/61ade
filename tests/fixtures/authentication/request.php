<?php

declare(strict_types=1);

// One shell request of the authentication fixture in its own process (a sign-in ends with exit), for
// tests/shell/authentication.php. Reads {options, server, cookies, post} as JSON on stdin; prints the cookies the
// shell set, the session cookie's name, id and parameters, and the session data.

namespace Blade\Shell {
    /** The CLI keeps no response headers, so the shell's setcookie calls are recorded instead. */
    function setcookie(string $name, string $value = '', array $options = []): bool
    {
        $GLOBALS['bladeCookies'][] = ['name' => $name, 'value' => $value, ...$options];
        return true;
    }
}

namespace {
    if (PHP_SAPI !== 'cli') exit;
    ini_set('display_errors', 'stderr');
    require dirname(__DIR__, 3).'/examples/demo-app/vendor/autoload.php';
    $request = json_decode(stream_get_contents(STDIN), true, flags: JSON_THROW_ON_ERROR);
    $fixture = require __DIR__.'/application.php';
    $definition = new Blade\Shell\ApplicationDefinition(...[
        'title' => $fixture->title, 'identities' => $fixture->identities, 'menu' => $fixture->menu, 'runtime' => $fixture->runtime,
        'sessionName' => $fixture->sessionName, 'cookiePath' => $fixture->cookiePath, 'workspace' => $fixture->workspace,
        'authentication' => $fixture->authentication, 'languages' => new Blade\I18n\Settings('hu', ['hu' => 'Magyar', 'en' => 'English'], true),
        ...$request['options'],
    ]);
    $_SERVER = ['REQUEST_METHOD' => 'GET', 'HTTPS' => 'on', 'REQUEST_URI' => '/', ...$request['server']];
    $_COOKIE = $request['cookies'];
    $_POST = $request['post'];
    $_GET = [];
    $GLOBALS['bladeCookies'] = [];
    register_shutdown_function(static function (): void {
        while (ob_get_level()) ob_end_clean();
        echo json_encode([
            'cookies' => $GLOBALS['bladeCookies'],
            'session' => ['name' => session_name(), 'id' => session_id(), ...session_get_cookie_params()],
            'data' => $_SESSION ?? [],
        ], JSON_THROW_ON_ERROR);
    });
    ob_start();
    (new Blade\Shell\Application($definition))->run();
}
