<?php

declare(strict_types=1);

namespace Vapa\Mail;

interface Delivery
{
    public function send(string $recipient, string $subject, string $html, string $text): void;
}
