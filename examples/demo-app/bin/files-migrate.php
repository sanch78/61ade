<?php
declare(strict_types=1);

// Explicit file content migration (0002) of the demo instance chosen by BLADE_DEMO_INSTANCE (default "demo"):
//   php8.4 examples/demo-app/bin/files-migrate.php migrate|verify|drop
// `migrate` also installs the file tables first and renders the queued thumbnails afterwards.
if (PHP_SAPI !== 'cli') exit(64);
$step = $argv[1] ?? '';
if (!in_array($step, ['migrate', 'verify', 'drop'], true)) {
    fwrite(STDERR, "Usage: php8.4 examples/demo-app/bin/files-migrate.php migrate|verify|drop\n");
    exit(64);
}
require dirname(__DIR__).'/vendor/autoload.php';
require_once dirname(__DIR__).'/common.php';
$db = blade_demo_db('features');
$files = blade_demo_files();
if ($step === 'migrate') $files->install($db);
$migration = require dirname(__DIR__, 3).'/packages/php/migrations/0002-file-content-store.php';
try {
    $report = $migration($db, [$files->space => $files->store()], $step, static function (string $message): void { fwrite(STDERR, $message."\n"); });
    if ($step === 'migrate') {
        $tasks = new Blade\Tasks\TaskQueue($db);
        $files->storage($db, $tasks);
        $report['tasks'] = $tasks->run(1000, 300.0);
    }
} catch (Throwable $error) {
    fwrite(STDERR, $step.' failed: '.$error->getMessage()."\n");
    exit(1);
}
echo json_encode(['instance' => getenv('BLADE_DEMO_INSTANCE') ?: 'demo', 'step' => $step, ...$report], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)."\n";
exit($report['failed'] ? 1 : 0);
