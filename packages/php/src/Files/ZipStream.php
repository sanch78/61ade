<?php
declare(strict_types=1);
namespace Blade\Files;

/**
 * Streaming ZIP writer (no ZIP64, no compression): every entry is STORED with UTF-8 names (flag bit 11);
 * file entries use a data descriptor (bit 3), so the CRC-32 and sizes are computed while the content is read
 * in 64 KiB chunks and written after it. Nothing is buffered beyond one chunk and the central directory;
 * no temporary copy of the archive exists. Folders are `name/` entries. length() gives the exact archive size
 * in advance, which must stay below 4 GiB.
 */
final class ZipStream
{
    public const MAX_BYTES = 0xFFFFFFFF;
    public const MAX_ENTRIES = 0xFFFF;
    private const CHUNK = 65536;
    private const FLAGS = 0x0800;
    private const DESCRIPTOR = 0x0008;

    private int $offset = 0;
    private string $central = '';
    private int $entries = 0;
    private readonly \Closure $output;

    /** $output receives each chunk; the default prints it and flushes. */
    public function __construct(?\Closure $output = null)
    {
        $this->output = $output ?? static function (string $bytes): void { echo $bytes; flush(); };
    }

    /** Exact archive size of entries [name, size, directory] as written by this class. */
    public static function length(array $entries): int
    {
        $total = 22;
        foreach ($entries as [$name, $size, $directory]) {
            $length = strlen($directory ? rtrim($name, '/').'/' : $name);
            $total += 30 + $length + 46 + $length + ($directory ? 0 : $size + 16);
        }
        return $total;
    }

    public function directory(string $name, string|int|null $modified = null): void
    {
        $name = rtrim($name, '/').'/';
        [$time, $date] = self::dos($modified);
        $local = $this->entry($name);
        $this->emit(pack('VvvvvvVVVvv', 0x04034b50, 20, self::FLAGS, 0, $time, $date, 0, 0, 0, strlen($name), 0).$name);
        $this->record($local, $name, self::FLAGS, $time, $date, 0, 0, (0o40755 << 16) | 0x10);
    }

    /** Streams one stored file from $path; an unreadable file is skipped (false) before anything is written. */
    public function file(string $name, string $path, string|int|null $modified = null): bool
    {
        $handle = is_file($path) ? @fopen($path, 'rb') : false;
        if ($handle === false) return false;
        try {
            $this->stored($name, $modified, static function () use ($handle): ?string {
                if (feof($handle)) return null;
                $chunk = fread($handle, self::CHUNK);
                return $chunk === false || $chunk === '' ? null : $chunk;
            });
            return true;
        } finally {
            fclose($handle);
        }
    }

    /** One file entry from bytes in memory (small generated notes). */
    public function content(string $name, string $bytes, string|int|null $modified = null): void
    {
        $this->stored($name, $modified, static function () use (&$bytes): ?string {
            if ($bytes === '') return null;
            $chunk = substr($bytes, 0, self::CHUNK);
            $bytes = (string) substr($bytes, self::CHUNK);
            return $chunk;
        });
    }

    /** Local header, the chunks of $next (null ends) with a running CRC-32, data descriptor and central record. */
    private function stored(string $name, string|int|null $modified, \Closure $next): void
    {
        $flags = self::FLAGS | self::DESCRIPTOR;
        [$time, $date] = self::dos($modified);
        $local = $this->entry($name);
        $this->emit(pack('VvvvvvVVVvv', 0x04034b50, 20, $flags, 0, $time, $date, 0, 0, 0, strlen($name), 0).$name);
        $crc = hash_init('crc32b');
        $size = 0;
        while (($chunk = $next()) !== null) {
            hash_update($crc, $chunk);
            $size += strlen($chunk);
            if ($size > self::MAX_BYTES) throw new \LengthException('ZIP entry too large.');
            $this->emit($chunk);
        }
        $sum = unpack('N', hash_final($crc, true))[1];
        $this->emit(pack('VVVV', 0x08074b50, $sum, $size, $size));
        $this->record($local, $name, $flags, $time, $date, $sum, $size, 0o100644 << 16);
    }

    /** Central directory and end record; returns the archive size. */
    public function finish(): int
    {
        $start = $this->offset;
        $this->emit($this->central);
        $this->emit(pack('VvvvvVVv', 0x06054b50, 0, 0, $this->entries, $this->entries, strlen($this->central), $start, 0));
        $this->central = '';
        return $this->offset;
    }

    /** Validates the next entry and returns the offset of its local header. */
    private function entry(string $name): int
    {
        if ($name === '' || strlen($name) > 0xFFFF || preg_match('//u', $name) !== 1 || str_contains($name, "\0")) throw new \InvalidArgumentException('Invalid ZIP entry name.');
        if (++$this->entries > self::MAX_ENTRIES) throw new \LengthException('Too many ZIP entries.');
        return $this->offset;
    }

    /** Central directory record of an entry whose local header starts at $local. */
    private function record(int $local, string $name, int $flags, int $time, int $date, int $crc, int $size, int $attributes): void
    {
        if ($this->offset > self::MAX_BYTES) throw new \LengthException('ZIP archive too large.');
        $this->central .= pack('VvvvvvvVVVvvvvvVV', 0x02014b50, 0x0314, 20, $flags, 0, $time, $date, $crc, $size, $size, strlen($name), 0, 0, 0, 0, $attributes, $local).$name;
    }

    private function emit(string $bytes): void
    {
        if ($bytes === '') return;
        ($this->output)($bytes);
        $this->offset += strlen($bytes);
    }

    /** DOS time and date of an ISO-8601 or Unix time (UTC components), clamped to 1980–2107. */
    private static function dos(string|int|null $modified): array
    {
        $time = is_int($modified) ? $modified : ($modified !== null && $modified !== '' ? (strtotime($modified) ?: time()) : time());
        $year = (int) gmdate('Y', $time);
        if ($year < 1980) return [0, (1 << 5) | 1];
        if ($year > 2107) return [(23 << 11) | (59 << 5) | 29, (127 << 9) | (12 << 5) | 31];
        return [((int) gmdate('G', $time) << 11) | ((int) gmdate('i', $time) << 5) | intdiv((int) gmdate('s', $time), 2),
            (($year - 1980) << 9) | ((int) gmdate('n', $time) << 5) | (int) gmdate('j', $time)];
    }
}
