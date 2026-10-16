<?php

declare(strict_types=1);

namespace Vapa\Feature;

use Closure;
use InvalidArgumentException;

final readonly class Field
{
    public function __construct(
        public string $name,
        public string $label,
        public string $type = 'text',
        public bool $required = false,
        public int $max = 255,
        public array|Closure $options = [],
        public bool $secret = false,
        public array $validation = [],
    ) {
        if (!preg_match('/^[a-z][a-z0-9_]*$/D', $name)
            || !in_array($type, ['text', 'password', 'number', 'select', 'textarea'], true)
            || $max < 1) {
            throw new InvalidArgumentException('Invalid field definition.');
        }
        ValidationRules::check($validation);
        if (($validation['min_length'] ?? 0) > $max) {
            throw new InvalidArgumentException('Minimum field length exceeds maximum.');
        }
    }

    public function validate(mixed $value, ?Context $context = null, array $values = []): string
    {
        if (!is_string($value) && !is_int($value)) {
            $this->reject('Hibás érték.');
        }
        $value = $this->secret ? (string) $value : trim((string) $value);
        if (str_contains($value, "\0") || preg_match('//u', $value) !== 1) {
            $this->reject('Hibás szöveges érték.');
        }
        $error = ValidationRules::error($this, $value, $values);
        if ($error !== null) {
            $this->reject($error);
        }
        if ($value !== '' && $this->type === 'number' && !preg_match('/^\d+$/D', $value)) {
            $this->reject('Nemnegatív egész szám szükséges.');
        }
        if ($this->type === 'select' && !array_key_exists($value, $this->choices($context))) {
            $this->reject('Válassz az engedélyezett értékekből.');
        }
        return $value;
    }

    public function reject(string $message): never
    {
        throw new Failure($this->label.': '.$message, 400, [$this->name => $message]);
    }

    private function choices(?Context $context): array
    {
        return $this->options instanceof Closure
            ? ($context ? ($this->options)($context) : [])
            : $this->options;
    }

    public function metadata(?Context $context = null): array
    {
        return [
            'name' => $this->name,
            'label' => $this->label,
            'type' => $this->type,
            'required' => $this->required,
            'max' => $this->max,
            'options' => $this->choices($context),
            'secret' => $this->secret,
            'validation' => (object) $this->validation,
        ];
    }
}
