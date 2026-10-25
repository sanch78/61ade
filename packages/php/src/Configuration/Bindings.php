<?php

declare(strict_types=1);

namespace Blade\Configuration;

use Closure;
use InvalidArgumentException;

/** Only closures explicitly supplied by the consumer can be referenced from JSON. */
final readonly class Bindings
{
    public function __construct(private array $callbacks)
    {
        foreach ($callbacks as $name => $callback) {
            if (!is_string($name) || !$callback instanceof Closure) {
                throw new InvalidArgumentException('Bindings must be named closures.');
            }
        }
    }

    public function get(?string $name): ?Closure
    {
        if ($name === null) {
            return null;
        }
        return $this->callbacks[$name] ?? throw new InvalidArgumentException('Unknown configuration binding: '.$name);
    }
}
