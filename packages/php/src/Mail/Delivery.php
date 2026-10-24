<?php

declare(strict_types=1);

namespace Blade\Mail;

interface Delivery
{
    public function send(string $recipient, string $subject, string $html, string $text): void;
}
