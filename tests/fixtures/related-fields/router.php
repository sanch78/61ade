<?php

declare(strict_types=1);

$root = dirname(__DIR__, 3);
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if (in_array($path, ['/assets/admin.js', '/assets/admin.css'], true)) {
    header('Content-Type: '.(str_ends_with($path, '.css') ? 'text/css' : 'application/javascript'));
    readfile($root.'/packages/frontend/dist/'.basename($path));
    return;
}
if ($path !== '/') { http_response_code(404); return; }
require $root.'/examples/demo-app/vendor/autoload.php';
Vapa\Infrastructure\HttpEntrypoint::run(static fn() => require __DIR__.'/application.php');
