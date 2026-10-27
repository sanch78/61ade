<?php
declare(strict_types=1);

// Demo mail command: stores the message instead of sending it. It accepts the arguments of the
// host helper send-infra-mail.php: [PHP_BINARY, this file, <outbox directory>, --to=..., --body-file=..., ...].
if (PHP_SAPI !== 'cli' || !isset($argv[1]) || !is_dir($argv[1])) exit(64);
$options = [];
foreach (array_slice($argv, 2) as $argument) {
    if (preg_match('/^--([a-z-]+)(?:=(.*))?$/sD', $argument, $match)) $options[$match[1]] = $match[2] ?? true;
}
$body = is_string($options['body-file'] ?? null) ? file_get_contents($options['body-file'], length: 1048576) : false;
if (!is_string($options['to'] ?? null) || !is_string($options['subject'] ?? null) || !isset($options['html']) || $body === false || $body === '') exit(65);
$message = ['date' => date(DATE_RFC2822), 'from' => $options['from'] ?? '', 'from_name' => $options['from-name'] ?? '', 'to' => $options['to'], 'subject' => $options['subject'], 'html' => $body];
$file = $argv[1].'/'.sprintf('%.6f', microtime(true)).'-'.bin2hex(random_bytes(4)).'.json';
if (file_put_contents($file, json_encode($message, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR)."\n", LOCK_EX) === false) exit(73);
chmod($file, 0660);
$messages = glob($argv[1].'/*.json') ?: [];
rsort($messages);
foreach (array_slice($messages, 50) as $old) unlink($old);
