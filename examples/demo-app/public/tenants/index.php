<?php
declare(strict_types=1);
require dirname(__DIR__, 2).'/vendor/autoload.php';
Blade\Infrastructure\HttpEntrypoint::run(static fn() => require dirname(__DIR__, 2).'/tenant-application.php');
