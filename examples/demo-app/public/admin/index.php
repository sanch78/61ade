<?php
declare(strict_types=1);
require dirname(__DIR__, 2).'/vendor/autoload.php';
require_once dirname(__DIR__, 2).'/common.php';
blade_demo_sandbox_enter(); // visitor sandbox, docs/demos.md#visitor-sandboxes
Blade\Infrastructure\HttpEntrypoint::run(static fn() => require dirname(__DIR__, 2).'/admin-application.php');
