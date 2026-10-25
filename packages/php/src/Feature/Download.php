<?php
declare(strict_types=1);
namespace Blade\Feature;

/**
 * Binary action result. The transport sends the bytes instead of JSON, with the handler's
 * allowlisted MIME type, `nosniff` and a sandboxing CSP; `audit` joins the executor's audit detail.
 */
final readonly class Download
{
    public function __construct(public string $mimeType, public string $content, public array $audit = [])
    {
        if (!preg_match('~^[a-z]+/[a-z0-9.+-]+$~D', $mimeType)) throw new \InvalidArgumentException('Invalid download type.');
    }
}
