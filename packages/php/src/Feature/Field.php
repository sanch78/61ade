<?php

declare(strict_types=1);

namespace Blade\Feature;

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
        public bool $bulk = false,
        /** Type `file` only: ['resource' => file manager resource, 'mount' => mount key, 'folder' => optional path below the mount, 'accept' => MIME classes]. */
        public ?array $file = null,
        /**
         * A project field type (`app.fieldTypes`, docs/toolkit.md#registries) that renders this field in forms, grid and
         * card editors and displays: a dotted name; the server still validates the value by $type.
         */
        public ?string $editor = null,
        /**
         * Conditional field: `['field' => f, 'in' => [values]]`. The field takes part only while the field f of the same
         * record (the submitted value, else the stored one) holds one of the values: forms show it only then, and the
         * server validates it only then; otherwise a save that sends f or this field stores it empty.
         */
        public ?array $visibleWhen = null,
        /**
         * Exclusive choice: field names of the same record that a value of this field stores empty (each field of
         * the choice names the others). Forms empty them as soon as this field gets a value; the server stores them
         * empty on every save that sends this field with a value (form, cell, bulk, API) and rejects a save that sends
         * both with a value.
         */
        public array $clears = [],
    ) {
        if (!preg_match('/^[a-z][a-z0-9_]*$/D', $name)
            || !in_array($type, ['text', 'password', 'number', 'select', 'multiselect', 'textarea', 'checkbox', 'date', 'file'], true)
            || $max < 1 || ($type === 'date' && ($max < 10 || $secret))) {
            throw new InvalidArgumentException('Invalid field definition.');
        }
        // `file`: the value is a file id of that file manager's mount; the column is a media column of that resource.
        if (($type === 'file') !== ($file !== null)) throw new InvalidArgumentException('File settings belong to file fields only.');
        if ($file !== null) {
            $folder = $file['folder'] ?? '';
            $accept = $file['accept'] ?? null;
            if (array_diff(array_keys($file), ['resource', 'mount', 'folder', 'accept'])
                || !is_string($file['resource'] ?? null) || !preg_match('/^[a-z][a-z0-9_.-]*$/D', $file['resource'])
                || !is_string($file['mount'] ?? null) || !preg_match('/^[a-z][a-z0-9_-]{0,63}$/D', $file['mount'])
                || !is_string($folder) || ($folder !== '' && (count(explode('/', $folder)) > 32 || array_filter(explode('/', $folder), static fn($segment) => UploadPolicy::invalidName($segment) !== null)))
                || !is_array($accept) || !$accept || !array_is_list($accept) || array_filter($accept, static fn($class) => !is_string($class) || !preg_match('/^[a-z]{1,32}$/D', $class)) || count(array_unique($accept)) !== count($accept)
                || $secret || isset($column['media']) || isset($column['presentation']) || ($column['editable'] ?? false) || $bulk) {
                throw new InvalidArgumentException('Invalid file field.');
            }
        }
        foreach ($column as $property => $value) {
            if (!in_array($property, ['width', 'minWidth', 'maxWidth', 'align', 'editable', 'secondary', 'media', 'presentation', 'imageBase', 'image_base', 'altOf', 'alt_of'], true)
                || match ($property) {
                    'editable', 'secondary' => !is_bool($value),
                    'align' => !in_array($value, ['left', 'center', 'right'], true),
                    'media' => !is_string($value) || !preg_match('/^[a-z][a-z0-9_.-]*$/D', $value),
                    // `icon`, `image` or a project presentation (`app.presentations`): a dotted name the browser resolves.
                    'presentation' => !is_string($value) || (!in_array($value, ['icon', 'image'], true) && !self::projectName($value)),
                    'imageBase', 'image_base' => !is_string($value) || !preg_match('~^(?:/|(?:\.\./)*)?[A-Za-z0-9_-]+(?:/[A-Za-z0-9_-]+)*/$~D', $value),
                    'altOf', 'alt_of' => !is_string($value) || !preg_match('/^[a-z][a-z0-9_]*$/D', $value),
                    default => !is_int($value) || $value < 1 || $value > 10000,
                }) {
                throw new InvalidArgumentException('Invalid field column presentation.');
            }
        }
        // `media`: the value is a file id of that registered MediaSource; `presentation: icon`: the value is a Suite icon class, options name it.
        if (isset($column['media']) && ($secret || !in_array($type, ['text', 'number', 'select'], true) || ($column['editable'] ?? false) || isset($column['presentation']))) throw new InvalidArgumentException('Media columns need a readable, non-editable text, number or select field.');
        $image = ($column['presentation'] ?? null) === 'image';
        if (!$image && array_intersect_key($column, ['imageBase' => 1, 'image_base' => 1, 'altOf' => 1, 'alt_of' => 1])) throw new InvalidArgumentException('Image options need presentation image.');
        // `presentation: image`: the value is a static image file name below the page-relative `imageBase`; no file manager, no ACL.
        if ($image && ($secret || $type !== 'text' || ($column['editable'] ?? false) || isset($column['media']) || $options !== [] || $file !== null
            || count(array_intersect_key($column, ['imageBase' => 1, 'image_base' => 1])) !== 1 || count(array_intersect_key($column, ['altOf' => 1, 'alt_of' => 1])) > 1)) {
            throw new InvalidArgumentException('Image columns need a readable, non-editable text field with one imageBase and no options.');
        }
        $icon = ($column['presentation'] ?? null) === 'icon';
        if ($icon && ($secret || !in_array($type, ['text', 'select'], true) || ($column['editable'] ?? false))) throw new InvalidArgumentException('Icon columns need a readable, non-editable text or select field.');
        if ($icon && (!is_array($options) || !$options || array_filter(array_keys($options), static fn($class) => !is_string($class) || trim($class) === '') || array_filter($options, static fn($label) => !is_string($label) || trim($label) === ''))) throw new InvalidArgumentException('Icon columns need static options naming every icon class.');
        // A project presentation only displays a readable value; its field stays editable like any other.
        if (isset($column['presentation']) && !$icon && !$image && ($secret || $type === 'password')) throw new InvalidArgumentException('Project presentations need a readable, non-secret field.');
        if ($editor !== null && (!self::projectName($editor) || $secret || in_array($type, ['password', 'file'], true) || isset($column['media']))) throw new InvalidArgumentException('Field editors need a dotted project field type name on a non-secret, non-password, non-file, non-media field.');
        if ($visibleWhen !== null && (array_diff(array_keys($visibleWhen), ['field', 'in']) || !is_string($visibleWhen['field'] ?? null) || !preg_match('/^[a-z][a-z0-9_]*$/D', $visibleWhen['field'])
            || $visibleWhen['field'] === $name || !is_array($visibleWhen['in'] ?? null) || !$visibleWhen['in'] || !array_is_list($visibleWhen['in']) || count($visibleWhen['in']) > 50
            || array_filter($visibleWhen['in'], static fn($value) => !is_string($value) || strlen($value) > 255) || count(array_unique($visibleWhen['in'])) !== count($visibleWhen['in'])
            || ($column['editable'] ?? false) || $bulk || $secret || $type === 'file')) {
            throw new InvalidArgumentException('Invalid conditional field: '.$name);
        }
        if (!array_is_list($clears) || count($clears) > 10 || count(array_unique($clears)) !== count($clears) || $secret
            || array_filter($clears, static fn($other) => !is_string($other) || !preg_match('/^[a-z][a-z0-9_]*$/D', $other) || $other === $name)) {
            throw new InvalidArgumentException('Invalid exclusive field: '.$name);
        }
        if (($column['editable'] ?? false) && ($secret || $type === 'password')) throw new InvalidArgumentException('Secret fields cannot be edited in a grid.');
        if (($column['editable'] ?? false) && $type === 'multiselect') throw new InvalidArgumentException('Multiple choices are edited on the form, not in a grid cell.');
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
        // Multiple choices travel as a list or as one comma-separated string; keys never contain commas.
        if ($this->type === 'multiselect' && is_array($value)) {
            if (!array_is_list($value) || array_filter($value, static fn($item) => !is_string($item))) $this->reject('Hibás érték.');
            $value = implode(',', $value);
        }
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
        // A file id; that it is a live, readable file of the declared mount and class is checked by the executor (FileSource).
        if ($value !== '' && $this->type === 'file' && !preg_match('/^[1-9][0-9]{0,17}$/D', $value)) {
            $this->reject('A kiválasztott fájl nem érhető el.');
        }
        if ($value !== '' && ($this->column['presentation'] ?? null) === 'image' && !self::imageFile($value)) {
            $this->reject('Érvénytelen képfájlnév.');
        }
        // `date`: a calendar date `YYYY-MM-DD`; forms and grid cells edit it with the native Suite date picker.
        if ($value !== '' && $this->type === 'date' && !self::date($value)) {
            $this->reject('Érvényes dátum szükséges (ÉÉÉÉ-HH-NN).');
        }
        if ($value !== '' && $this->type === 'number' && !preg_match('/^\d+$/D', $value)) {
            $this->reject('Nemnegatív egész szám szükséges.');
        }
        if ($this->type === 'checkbox' && !in_array($value, ['0', '1'], true)) {
            $this->reject('Csak 0 vagy 1 érték adható meg.');
        }
        if ($this->type === 'select' && $value !== '' && !array_key_exists($value, $this->choices($context))) {
            $this->reject('Válassz az engedélyezett értékekből.');
        }
        if ($this->type === 'multiselect' && $value !== '') {
            $items = array_map('trim', explode(',', $value));
            $choices = $this->choices($context);
            if (in_array('', $items, true) || count(array_unique($items)) !== count($items) || array_diff($items, array_map('strval', array_keys($choices)))) {
                $this->reject('Válassz az engedélyezett értékekből.');
            }
            $value = implode(',', $items);
        }
        return $value;
    }

    /** Whether the field takes part for the record values $values (always without `visibleWhen`). */
    public function active(array $values): bool
    {
        return $this->visibleWhen === null || in_array((string) ($values[$this->visibleWhen['field']] ?? ''), $this->visibleWhen['in'], true);
    }

    /** MediaSource resource of the column: `column.media`, or the file manager of a `file` field. */
    public function media(): ?string
    {
        return $this->column['media'] ?? $this->file['resource'] ?? null;
    }

    /** Whether the field presents its text value as a static image (`column.presentation: image`). */
    public function image(): bool
    {
        return ($this->column['presentation'] ?? null) === 'image';
    }

    /** A project registry name (`[a-z][a-z0-9_.-]*` containing a dot, docs/toolkit.md#registries). */
    public static function projectName(mixed $name): bool
    {
        return is_string($name) && str_contains($name, '.') && preg_match('/^[a-z][a-z0-9_.-]*$/D', $name) === 1;
    }

    /** A real calendar date `YYYY-MM-DD`. */
    public static function date(mixed $value): bool
    {
        return is_string($value) && preg_match('/^([0-9]{4})-([0-9]{2})-([0-9]{2})$/D', $value, $m) === 1 && checkdate((int) $m[2], (int) $m[3], (int) $m[1]);
    }

    /** A single image file name: letters, digits, `-`, `_`, `.`; no path, no `..`, no scheme, no leading dot; png, jpg, jpeg, webp, gif or svg. */
    public static function imageFile(mixed $value): bool
    {
        return is_string($value) && strlen($value) <= 255 && !str_contains($value, '..')
            && preg_match('/^[A-Za-z0-9_-][A-Za-z0-9_.-]*\.(?:png|jpe?g|webp|gif|svg)$/Di', $value) === 1;
    }

    public function reject(string $message): never
    {
        throw new Failure(\Blade\I18n\Translator::text($this->label).': '.\Blade\I18n\Translator::text($message), 400, [$this->name => $message]);
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
            'label' => \Blade\I18n\Translator::text($this->label),
            'type' => $this->type,
            'required' => $this->required,
            'max' => $this->max,
            'options' => $this->options instanceof Closure ? $this->choices($context) : array_map(\Blade\I18n\Translator::text(...), $this->choices($context)),
            'secret' => $this->secret,
            // Browser spelling of the rules (`minLength`, `matchesField`); the server validates with the declared ones.
            'validation' => (object) ViewMetadata::camel(\Blade\I18n\Translator::presentation($this->validation)),
            'defaultValue' => $this->defaultValue,
            'bulk' => $this->bulk,
            // Workspace adds the resolved folder, the upload policy and the actor's upload right; the folder path stays server-side.
            ...($this->file !== null ? ['file' => ['resource' => $this->file['resource'], 'mount' => $this->file['mount'], 'accept' => $this->file['accept']]] : []),
            ...($this->editor !== null ? ['editor' => $this->editor] : []),
            ...($this->visibleWhen !== null ? ['visibleWhen' => $this->visibleWhen] : []),
            ...($this->clears ? ['clears' => $this->clears] : []),
        ];
    }
}
