<?php
declare(strict_types=1);
require dirname(__DIR__).'/vendor/autoload.php';
Vapa\Infrastructure\HttpEntrypoint::run(static fn() => require dirname(__DIR__).'/application.php');
