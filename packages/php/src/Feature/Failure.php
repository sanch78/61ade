<?php
declare(strict_types=1);
namespace Vapa\Feature;
final class Failure extends \RuntimeException
{
    public function __construct(string $message, public readonly int $status = 400) { parent::__construct($message); }
}
