<?php
declare(strict_types=1);
$path=parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH);
if(str_starts_with($path,'/assets/'))return false;
require dirname(__DIR__,3).'/examples/demo-app/vendor/autoload.php';
Vapa\Infrastructure\HttpEntrypoint::run(static fn()=>require __DIR__.'/application.php');
