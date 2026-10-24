<?php
declare(strict_types=1);
namespace Blade\Feature;

/**
 * Streamed binary action result: a server-side file path (never a client path) sent in 64 KiB chunks
 * with one optional byte range, a strong ETag and `nosniff` plus a sandboxing CSP. `audit` joins the
 * executor's audit detail, which is committed before the first byte. $maxAge: null `no-store`,
 * 0 `private, no-cache`, otherwise `private, max-age`.
 */
final readonly class DownloadStream
{
    public function __construct(public string $mimeType, public string $path, public int $size, public string $etag, public array $audit = [], public string $disposition = 'attachment', public ?string $filename = null, public ?int $maxAge = null)
    {
        if (!preg_match('~^[a-z]+/[a-z0-9.+-]+$~D', $mimeType)) throw new \InvalidArgumentException('Invalid download type.');
        if (!preg_match('/^"[\x21\x23-\x7e]{1,128}"$/D', $etag)) throw new \InvalidArgumentException('Invalid download entity tag.');
        if ($size < 0 || !in_array($disposition, ['inline', 'attachment'], true) || ($maxAge !== null && $maxAge < 0)) throw new \InvalidArgumentException('Invalid download.');
    }

    /**
     * One satisfiable `bytes=a-b`, `bytes=a-` or `bytes=-n` range as [start, end]; null sends the whole
     * content (no, malformed or multiple ranges), false is unsatisfiable (416).
     */
    public static function range(?string $header, int $size): array|null|false
    {
        if ($header === null || !preg_match('/^\s*bytes\s*=\s*([0-9]{0,18})\s*-\s*([0-9]{0,18})\s*$/Di', $header, $m) || ($m[1] === '' && $m[2] === '')) return null;
        if ($m[1] === '') {
            $length = (int) $m[2];
            return $length === 0 || $size === 0 ? false : [max(0, $size - $length), $size - 1];
        }
        $start = (int) $m[1];
        if ($m[2] !== '' && (int) $m[2] < $start) return null;
        if ($start >= $size) return false;
        return [$start, $m[2] === '' ? $size - 1 : min((int) $m[2], $size - 1)];
    }

    public function cacheControl(): string
    {
        return match (true) { $this->maxAge === null => 'no-store', $this->maxAge === 0 => 'private, no-cache', default => 'private, max-age='.$this->maxAge };
    }

    /** `inline`/`attachment` with an ASCII fallback name and the RFC 8187 UTF-8 name; control characters are dropped. */
    public function contentDisposition(): string
    {
        if ($this->filename === null) return $this->disposition;
        $name = (string) preg_replace('/[\p{Cc}\p{Cf}]/u', '', mb_scrub($this->filename, 'UTF-8'));
        if ($name === '') return $this->disposition;
        $ascii = (string) preg_replace('/[^\x20-\x7e]|["\\\\%;]/u', '_', $name);
        return $this->disposition.'; filename="'.$ascii.'"; filename*=UTF-8\'\''.rawurlencode($name);
    }

    /**
     * Status, headers and byte range for a request ($server: `$_SERVER`-style keys). `If-None-Match`
     * gives 304; `Range` is honoured when `If-Range` is absent or equals the ETag.
     * @return array{status:int,headers:list<string>,range:?array{int,int}}
     */
    public function plan(array $server): array
    {
        $headers = ['Content-Type: '.$this->mimeType, 'X-Content-Type-Options: nosniff', "Content-Security-Policy: default-src 'none'; sandbox", 'Cross-Origin-Resource-Policy: same-origin',
            'Accept-Ranges: bytes', 'ETag: '.$this->etag, 'Cache-Control: '.$this->cacheControl(), 'Content-Disposition: '.$this->contentDisposition()];
        $match = is_string($server['HTTP_IF_NONE_MATCH'] ?? null) ? array_map(static fn($tag) => (string) preg_replace('~^W/~', '', trim($tag)), explode(',', $server['HTTP_IF_NONE_MATCH'])) : [];
        if (in_array('*', $match, true) || in_array($this->etag, $match, true)) return ['status' => 304, 'headers' => array_slice($headers, 1), 'range' => null];
        $ifRange = $server['HTTP_IF_RANGE'] ?? null;
        $range = $ifRange === null || $ifRange === $this->etag ? self::range(is_string($server['HTTP_RANGE'] ?? null) ? $server['HTTP_RANGE'] : null, $this->size) : null;
        if ($range === false) return ['status' => 416, 'headers' => [...$headers, 'Content-Range: bytes */'.$this->size, 'Content-Length: 0'], 'range' => null];
        if ($range !== null) return ['status' => 206, 'headers' => [...$headers, 'Content-Range: bytes '.$range[0].'-'.$range[1].'/'.$this->size, 'Content-Length: '.($range[1] - $range[0] + 1)], 'range' => $range];
        return ['status' => 200, 'headers' => [...$headers, 'Content-Length: '.$this->size], 'range' => $this->size > 0 ? [0, $this->size - 1] : null];
    }

    /** Sends headers and, unless HEAD, the planned bytes in 64 KiB chunks; an unreadable file is a bodiless 404. */
    public function send(bool $head, array $server): void
    {
        $file = is_file($this->path) ? @fopen($this->path, 'rb') : false;
        if ($file === false) {
            http_response_code(404);
            return;
        }
        $plan = $this->plan($server);
        http_response_code($plan['status']);
        foreach ($plan['headers'] as $header) header($header);
        if ($head || $plan['range'] === null) {
            fclose($file);
            return;
        }
        set_time_limit(0);
        while (ob_get_level() > 0 && ob_end_flush());
        [$start, $end] = $plan['range'];
        if ($start > 0) fseek($file, $start);
        for ($left = $end - $start + 1; $left > 0 && !feof($file) && !connection_aborted();) {
            $chunk = fread($file, min(65536, $left));
            if ($chunk === false || $chunk === '') break;
            echo $chunk;
            flush();
            $left -= strlen($chunk);
        }
        fclose($file);
    }
}
