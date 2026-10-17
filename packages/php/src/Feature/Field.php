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
        public array $column = [],
        public ?string $defaultValue = null,
    ) {
        if (!preg_match('/^[a-z][a-z0-9_]*$/D', $name)
            || !in_array($type, ['text', 'password', 'number', 'select', 'textarea', 'checkbox'], true)
            || $max < 1) {
            throw new InvalidArgumentException('Invalid field definition.');
        }
        foreach ($column as $property => $value) {
            if (!in_array($property, ['width', 'minWidth', 'maxWidth', 'align', 'editable'], true)
                || ($property === 'editable' ? !is_bool($value) : ($property === 'align' ? !in_array($value, ['left', 'center', 'right'], true) : !is_int($value) || $value < 1 || $value > 10000))) {
                throw new InvalidArgumentException('Invalid field column presentation.');
            }
        }
        if (($column['editable'] ?? false) && ($secret || $type === 'password')) throw new InvalidArgumentException('Secret fields cannot be edited in a grid.');
        if ($type === 'checkbox' && $defaultValue !== null && !in_array($defaultValue, ['0', '1'], true)) {
            throw new InvalidArgumentException('Invalid checkbox default.');
        }
        ValidationRules::check($validation);
        if (($validation['min_length'] ?? 0) > $max) {
            throw new InvalidArgumentException('Minimum field length exceeds maximum.');
        }
    }

    public function validate(mixed $value, ?Context $context = null, array $values = []): string
    {
        if ($this->type === 'checkbox' && is_bool($value)) $value = (int) $value;
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
        if ($this->type === 'checkbox' && !in_array($value, ['0', '1'], true)) {
            $this->reject('Csak 0 vagy 1 érték adható meg.');
        }
        if ($this->type === 'select' && !array_key_exists($value, $this->choices($context))) {
            $this->reject('Válassz az engedélyezett értékekből.');
        }
        return $value;
    }

    public function reject(string $message): never
    {
        throw new Failure(\Vapa\I18n\Translator::text($this->label).': '.\Vapa\I18n\Translator::text($message), 400, [$this->name => $message]);
    }

    private function choices(?Context $context): array
    {
        if ($this->type === 'checkbox' && $this->options === []) return ['0' => 'Nem', '1' => 'Igen'];
        return $this->options instanceof Closure
            ? ($context ? ($this->options)($context) : [])
            : $this->options;
    }

    public function metadata(?Context $context = null): array
    {
        return [
            'name' => $this->name,
            'label' => \Vapa\I18n\Translator::text($this->label),
            'type' => $this->type,
            'required' => $this->required,
            'max' => $this->max,
            'options' => $this->options instanceof Closure ? $this->choices($context) : array_map(\Vapa\I18n\Translator::text(...), $this->choices($context)),
            'secret' => $this->secret,
            'validation' => (object) \Vapa\I18n\Translator::presentation($this->validation),
            'defaultValue' => $this->defaultValue,
        ];
    }
}
