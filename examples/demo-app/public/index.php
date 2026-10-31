<?php
declare(strict_types=1);
require dirname(__DIR__).'/vendor/autoload.php';
require_once dirname(__DIR__).'/common.php';
blade_demo_sandbox_enter(); // visitor sandbox, docs/demos.md#visitor-sandboxes
Blade\Infrastructure\HttpEntrypoint::run(static fn() => require dirname(__DIR__).'/application.php');
