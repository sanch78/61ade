<?php

declare(strict_types=1);

namespace Blade\Mail;

use Symfony\Component\Mailer\Mailer;
use Symfony\Component\Mailer\Transport;
use Symfony\Component\Mime\Address;
use Symfony\Component\Mime\Email;

final readonly class SmtpDelivery implements Delivery
{
    public function __construct(
        #[\SensitiveParameter] private string $dsn,
        private string $fromAddress,
        private string $fromName,
    ) {
        if (!filter_var($fromAddress, FILTER_VALIDATE_EMAIL)) {
            throw new \InvalidArgumentException('A valid mail sender address is required.');
        }
    }

    public function send(string $recipient, string $subject, string $html, string $text): void
    {
        $message = (new Email())
            ->from(new Address($this->fromAddress, $this->fromName))
            ->to($recipient)
            ->subject($subject)
            ->html($html)
            ->text($text);
        (new Mailer(Transport::fromDsn($this->dsn)))->send($message);
    }
}
