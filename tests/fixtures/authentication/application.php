<?php

declare(strict_types=1);

use Vapa\Authentication\Settings;
use Vapa\Configuration\JsonApplication;
use Vapa\Configuration\JsonConfiguration;
use Vapa\Feature\{Context, Registry, Workspace};

$configuration = JsonConfiguration::load(__DIR__.'/application.json');
$runtime = $configuration->path($configuration->section('application')['runtime']);
$db = new PDO('sqlite:'.$runtime.'/data.sqlite', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
return JsonApplication::load(
    __DIR__.'/application.json',
    ['accounts.active' => static fn(array $row): bool => (bool) $row['active']],
    static fn(Workspace $workspace, Registry $registry): array => [
        'notes.normalize' => static fn($context, $target, $values) => $values,
        'notes.mark' => static fn() => [],
        'security.values' => static fn(Context $context, array $target): array => (new Settings($context->db))->get($target['id']),
        'security.update' => static fn(Context $context, array $target, array $values): array =>
            (new Settings($context->db))->update($context, $workspace, $target['id'], $values['email_confirmation'] === '1'),
    ],
    $db,
);
