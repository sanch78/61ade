<?php
declare(strict_types=1);

// Demo mail command: stores the MIME message from stdin instead of sending it.
// Configured like any sendmail-compatible command: [PHP_BINARY, this file, <outbox directory>].
if (PHP_SAPI !== 'cli' || !isset($argv[1]) || !is_dir($argv[1])) exit(64);
$message = stream_get_contents(STDIN, 1048576);
if ($message === false || $message === '') exit(65);
$file = $argv[1].'/'.sprintf('%.6f', microtime(true)).'-'.bin2hex(random_bytes(4)).'.eml';
if (file_put_contents($file, $message, LOCK_EX) === false) exit(73);
chmod($file, 0660);
$messages = glob($argv[1].'/*.eml') ?: [];
rsort($messages);
foreach (array_slice($messages, 50) as $old) unlink($old);
