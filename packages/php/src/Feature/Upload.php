<?php
declare(strict_types=1);
namespace Blade\Feature;

/** One received multipart part; the temporary path is PHP's verified upload file, never a client path. */
final readonly class Upload
{
    public function __construct(public string $field, public string $name, public string $path, public int $size, public int $error) {}

    /** Normalizes $_FILES; parts without a file are dropped, unverified paths are rejected. */
    public static function collect(array $files): array
    {
        $out = [];
        foreach ($files as $field => $part) {
            if (!is_string($field) || !is_array($part)) continue;
            foreach ((array) ($part['error'] ?? []) as $index => $error) {
                $item = static fn(string $key) => is_array($part[$key] ?? null) ? ($part[$key][$index] ?? null) : ($part[$key] ?? null);
                if ((int) $error === UPLOAD_ERR_NO_FILE) continue;
                $path = (string) $item('tmp_name');
                if ((int) $error === UPLOAD_ERR_OK && !is_uploaded_file($path)) throw new Failure('Hibás feltöltés.');
                $out[] = new self($field, (string) $item('name'), (int) $error === UPLOAD_ERR_OK ? $path : '', (int) $item('size'), (int) $error);
            }
        }
        return $out;
    }
}
