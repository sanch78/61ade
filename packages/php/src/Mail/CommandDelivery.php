<?php

declare(strict_types=1);

namespace Blade\Mail;

/**
 * Hands the message to a configured local command, e.g. the host's mail helper. The command is an
 * argument list started without a shell, so no configuration string is ever interpreted as shell code.
 * An argument may end in one placeholder ("{recipient}" or "--to={recipient}"); see PLACEHOLDERS.
 * The HTML body is written to a private file in the runtime directory and passed as {body_file};
 * the command builds the message itself. The plain-text alternative is not used.
 */
final readonly class CommandDelivery implements Delivery
{
    public const PLACEHOLDERS = ['recipient', 'subject', 'from_address', 'from_name', 'body_file'];

    public function __construct(
        private array $command,
        private string $fromAddress,
        private string $fromName,
        private string $runtime,
        private int $timeout = 30,
    ) {
        if (!$command || !array_is_list($command)) throw new \InvalidArgumentException('A mail command argument list is required.');
        $bodyFile = false;
        foreach ($command as $argument) {
            if (!is_string($argument) || $argument === '' || preg_match('/[\0\r\n]/', $argument)) throw new \InvalidArgumentException('Invalid mail command argument.');
            $name = self::placeholder($argument)[1] ?? null;
            if (preg_match_all('/\{('.implode('|', self::PLACEHOLDERS).')\}/', $argument) > ($name ? 1 : 0)) throw new \InvalidArgumentException('A mail command placeholder must end its argument.');
            $bodyFile = $bodyFile || $name === 'body_file';
        }
        if (!$bodyFile) throw new \InvalidArgumentException('The mail command must pass {body_file}.');
        if (!self::address($fromAddress)) throw new \InvalidArgumentException('A valid mail sender address is required.');
        if (!self::plain($fromName)) throw new \InvalidArgumentException('Invalid mail sender name.');
        if (!is_dir($runtime) || !is_writable($runtime)) throw new \InvalidArgumentException('The mail runtime directory is not writable.');
        if ($timeout < 1 || $timeout > 300) throw new \InvalidArgumentException('Invalid mail command timeout.');
    }

    public function send(string $recipient, string $subject, string $html, string $text): void
    {
        if (!self::address($recipient)) throw new \InvalidArgumentException('Invalid recipient.');
        if (!self::plain($subject)) throw new \InvalidArgumentException('Invalid mail subject.');
        $file = $this->runtime.'/mail-'.bin2hex(random_bytes(12)).'.html';
        try {
            $handle = fopen($file, 'xb');
            if ($handle === false || !chmod($file, 0600) || fwrite($handle, $html) !== strlen($html) || !fclose($handle)) throw new \RuntimeException('Mail body cannot be written.');
            $values = ['recipient' => $recipient, 'subject' => $subject, 'from_address' => $this->fromAddress, 'from_name' => $this->fromName, 'body_file' => $file];
            $command = array_map(static fn(string $argument): string => ($match = self::placeholder($argument)) ? $match[0].$values[$match[1]] : $argument, $this->command);
            $this->run($command);
        } finally {
            if (is_file($file)) unlink($file);
        }
    }

    private function run(array $command): void
    {
        $process = proc_open($command, [0 => ['file', '/dev/null', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
        if (!is_resource($process)) throw new \RuntimeException('Mail command cannot be started.');
        // Output is drained but never logged: it may echo addresses or message content.
        $deadline = time() + $this->timeout;
        foreach ([1, 2] as $pipe) stream_set_blocking($pipes[$pipe], false);
        while (($status = proc_get_status($process))['running'] && time() < $deadline) {
            stream_get_contents($pipes[1]);
            stream_get_contents($pipes[2]);
            usleep(20000);
        }
        if ($status['running']) {
            proc_terminate($process);
            throw new \RuntimeException('Mail command timed out.');
        }
        fclose($pipes[1]);
        fclose($pipes[2]);
        proc_close($process);
        if ($status['exitcode'] !== 0) throw new \RuntimeException('Mail command failed.');
    }

    /** [prefix, name] when the argument ends in a placeholder. */
    private static function placeholder(string $argument): ?array
    {
        return preg_match('/^(.*)\{('.implode('|', self::PLACEHOLDERS).')\}$/sD', $argument, $match) ? [$match[1], $match[2]] : null;
    }

    private static function address(string $value): bool
    {
        return filter_var($value, FILTER_VALIDATE_EMAIL) !== false && !str_starts_with($value, '-');
    }

    private static function plain(string $value): bool
    {
        return !preg_match('/[\0\r\n]/', $value) && mb_check_encoding($value, 'UTF-8') && strlen($value) <= 998;
    }
}
