<?php
declare(strict_types=1);
namespace Blade\Shell;

final readonly class Identity
{
    /** Attributes stay on the server; never serialize this object to the client. */
    public function __construct(public string $id, public string $displayName, public array $attributes = []) {}
}
