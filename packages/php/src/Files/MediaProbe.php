<?php
declare(strict_types=1);
namespace Blade\Files;

/**
 * Display metadata of stored images and videos: `getimagesize` (JPEG EXIF orientation applied) and
 * `ffprobe` run with an argument array (no shell), a timeout, one thread, only the `file` protocol and
 * the demuxer forced from the stored MIME type. Metadata only: a missing tool or an unreadable file
 * gives nulls, and video length is never a validation rule.
 */
final readonly class MediaProbe
{
    /** Stored video type => forced ffmpeg demuxer; other types are never handed to ffmpeg. */
    public const DEMUXERS = ['video/mp4' => 'mp4', 'video/webm' => 'webm'];

    public function __construct(public string $ffprobe = '/usr/bin/ffprobe', public float $timeout = 10.0)
    {
        if (!str_starts_with($ffprobe, '/') || str_contains($ffprobe, "\0")) throw new \InvalidArgumentException('The ffprobe path must be absolute.');
    }

    /** @return array{width:?int,height:?int,duration_ms:?int,orientation:string} */
    public function probe(string $path, string $mime): array
    {
        [$width, $height, $duration] = match (true) {
            str_starts_with($mime, 'image/') => $this->image($path, $mime),
            isset(self::DEMUXERS[$mime]) => $this->video($path, self::DEMUXERS[$mime]),
            default => [null, null, null],
        };
        return ['width' => $width, 'height' => $height, 'duration_ms' => $duration, 'orientation' => self::orientation($width, $height)];
    }

    public static function orientation(?int $width, ?int $height): string
    {
        if (!$width || !$height) return '';
        return $width > $height ? 'landscape' : ($width < $height ? 'portrait' : 'square');
    }

    /** EXIF orientation 1–8 of a JPEG; 1 when absent. */
    public static function exifOrientation(string $path): int
    {
        if (!function_exists('exif_read_data')) return 1;
        $exif = @exif_read_data($path, 'IFD0');
        $value = is_array($exif) ? (int) ($exif['Orientation'] ?? 1) : 1;
        return $value >= 1 && $value <= 8 ? $value : 1;
    }

    private function image(string $path, string $mime): array
    {
        $size = @getimagesize($path);
        if (!is_array($size) || $size[0] < 1 || $size[1] < 1) return [null, null, null];
        [$width, $height] = [(int) $size[0], (int) $size[1]];
        if ($mime === 'image/jpeg' && self::exifOrientation($path) >= 5) [$width, $height] = [$height, $width];
        return [$width, $height, null];
    }

    private function video(string $path, string $format): array
    {
        $json = self::process([$this->ffprobe, '-v', 'error', '-threads', '1', '-protocol_whitelist', 'file', '-f', $format, '-print_format', 'json',
            '-show_entries', 'stream=width,height,duration:stream_tags=rotate:stream_side_data=rotation:format=duration', '-select_streams', 'v:0', 'file:'.$path], $this->timeout);
        $data = $json !== null ? json_decode($json, true) : null;
        if (!is_array($data)) return [null, null, null];
        $stream = $data['streams'][0] ?? [];
        $width = is_int($stream['width'] ?? null) && $stream['width'] > 0 ? $stream['width'] : null;
        $height = is_int($stream['height'] ?? null) && $stream['height'] > 0 ? $stream['height'] : null;
        $rotation = (int) ($stream['tags']['rotate'] ?? 0);
        foreach ($stream['side_data_list'] ?? [] as $side) if (isset($side['rotation'])) $rotation = (int) $side['rotation'];
        if (abs($rotation) % 180 === 90) [$width, $height] = [$height, $width];
        $seconds = $stream['duration'] ?? $data['format']['duration'] ?? null;
        $duration = is_numeric($seconds) && (float) $seconds >= 0 ? (int) round((float) $seconds * 1000) : null;
        return [$width, $height, $duration];
    }

    /**
     * Runs a tool without a shell: stdin and stderr closed, stdout captured up to $limit bytes.
     * Returns stdout on exit code 0, null on failure; the process is killed at the timeout, which
     * throws instead with $retryable (a transient cause the task queue retries).
     */
    public static function process(array $command, float $timeout, int $limit = 1048576, bool $retryable = false): ?string
    {
        if (!$command || !is_executable((string) $command[0])) return null;
        $process = @proc_open(array_map('strval', $command), [0 => ['file', '/dev/null', 'r'], 1 => ['pipe', 'w'], 2 => ['file', '/dev/null', 'w']], $pipes);
        if (!is_resource($process)) return null;
        stream_set_blocking($pipes[1], false);
        $deadline = microtime(true) + $timeout;
        $out = '';
        while (!feof($pipes[1]) && strlen($out) <= $limit && ($left = $deadline - microtime(true)) > 0) {
            $read = [$pipes[1]];
            $none = null;
            if (@stream_select($read, $none, $none, (int) $left, (int) (fmod($left, 1.0) * 1000000)) === false) break;
            $out .= (string) fread($pipes[1], 65536);
        }
        $closed = feof($pipes[1]);
        fclose($pipes[1]);
        for ($status = proc_get_status($process); $closed && $status['running'] && microtime(true) < $deadline; $status = proc_get_status($process)) usleep(10000);
        if ($status['running']) {
            proc_terminate($process, 9);
            proc_close($process);
            if ($retryable && strlen($out) <= $limit) throw new \RuntimeException('Media tool timed out.');
            return null;
        }
        proc_close($process);
        return $status['exitcode'] === 0 && strlen($out) <= $limit ? $out : null;
    }
}
