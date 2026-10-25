<?php

declare(strict_types=1);

namespace Blade\Mail;

use Symfony\Component\Mime\Address;
use Symfony\Component\Mime\Email;

/**
 * Pipes the complete MIME message to a configured local command (sendmail-compatible,
 * e.g. ["/usr/sbin/sendmail", "-t", "-i"]). The command is an argument list started
 * without a shell, so no configuration string is ever interpreted as shell code.
 * An argument that is exactly "{recipient}" receives the validated recipient address.
 */
final readonly class CommandDelivery implements Delivery
{
    public function __construct(
        private array $command,
        private string $fromAddress,
        private string $fromName,
        private int $timeout = 30,
    ) {
        if (!$command || !array_is_list($command)) throw new \InvalidArgumentException('A mail command argument list is required.');
        foreach ($command as $argument) {
            if (!is_string($argument) || $argument === '' || str_contains($argument, "\0")) throw new \InvalidArgumentException('Invalid mail command argument.');
        }
        if (!filter_var($fromAddress, FILTER_VALIDATE_EMAIL)) throw new \InvalidArgumentException('A valid mail sender address is required.');
        if ($timeout < 1 || $timeout > 300) throw new \InvalidArgumentException('Invalid mail command timeout.');
    }

    public function send(string $recipient, string $subject, string $html, string $text): void
    {
        if (!filter_var($recipient, FILTER_VALIDATE_EMAIL) || str_starts_with($recipient, '-')) throw new \InvalidArgumentException('Invalid recipient.');
        $message = (new Email())
            ->from(new Address($this->fromAddress, $this->fromName))
            ->to($recipient)
            ->subject($subject)
            ->html($html)
            ->text($text);
        $command = array_map(static fn(string $argument): string => $argument === '{recipient}' ? $recipient : $argument, $this->command);
        $process = proc_open($command, [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
        if (!is_resource($process)) throw new \RuntimeException('Mail command cannot be started.');
        fwrite($pipes[0], $message->toString());
        fclose($pipes[0]);
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
}
