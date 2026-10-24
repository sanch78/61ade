<?php
declare(strict_types=1);
namespace Blade\Feature;

/**
 * Streamed binary action result without a file path or known length (e.g. a ZIP assembled while it is sent):
 * $write prints the body in chunks. Sent like DownloadStream (`nosniff`, sandboxing CSP, CORP, `attachment`
 * with the RFC 8187 name, `no-store`) but without Content-Length, ETag or ranges, after the executor's audit
 * commit. `audit` joins the executor's audit detail.
 */
final readonly class StreamedDownload
{
    public function __construct(public string $mimeType, public string $filename, public \Closure $write, public array $audit = [])
    {
        if (!preg_match('~^[a-z]+/[a-z0-9.+-]+$~D', $mimeType)) throw new \InvalidArgumentException('Invalid download type.');
        if ($filename === '') throw new \InvalidArgumentException('Invalid download name.');
    }

    /** @return list<string> */
    public function headers(): array
    {
        $disposition = (new DownloadStream($this->mimeType, '', 0, '"-"', [], 'attachment', $this->filename))->contentDisposition();
        return ['Content-Type: '.$this->mimeType, 'X-Content-Type-Options: nosniff', "Content-Security-Policy: default-src 'none'; sandbox", 'Cross-Origin-Resource-Policy: same-origin',
            'Cache-Control: no-store', 'Content-Disposition: '.$disposition];
    }

    /** Sends the headers and, unless HEAD, the body; output buffers are flushed so the body is never held in memory. */
    public function send(bool $head): void
    {
        http_response_code(200);
        foreach ($this->headers() as $header) header($header);
        if ($head) return;
        set_time_limit(0);
        while (ob_get_level() > 0 && ob_end_flush());
        ($this->write)();
    }
}
