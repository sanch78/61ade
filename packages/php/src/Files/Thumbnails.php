<?php
declare(strict_types=1);
namespace Blade\Files;

/**
 * `thumb320` derivatives: longest side 320 px WebP, from images with GD (EXIF orientation applied,
 * more than 40 megapixels refused before decoding) and from videos as one ffmpeg frame (argument
 * array, timeout, one thread, `file` protocol only, demuxer forced from the stored type). Rendered by
 * the `files.thumbnail` task; rows live in `blade_file_derivatives`. Only undecodable or unsupported
 * input is recorded as `failed`; transient causes (memory headroom, tool timeout, missing tool) throw,
 * so the queue retries them and marks the task `failed` after its last attempt.
 */
final readonly class Thumbnails
{
    public const KIND = 'thumb320';
    public const SIZE = 320;
    public const TYPES = ['image/png', 'image/jpeg', 'video/mp4', 'video/webm'];
    private const MAX_PIXELS = 40000000;

    public function __construct(public string $ffmpeg = '/usr/bin/ffmpeg', public float $timeout = 30.0)
    {
        if (!str_starts_with($ffmpeg, '/') || str_contains($ffmpeg, "\0")) throw new \InvalidArgumentException('The ffmpeg path must be absolute.');
    }

    public static function supports(string $mime): bool { return in_array($mime, self::TYPES, true); }

    public static function dedupe(string $space, int $id, int $revision): string { return 'files.thumbnail:'.$space.':'.$id.':'.$revision; }

    /** Task handler: skips stale revisions and existing results; an undecodable source is stored as `failed`. */
    public function run(FileStorage $storage, array $payload): void
    {
        if (($payload['space'] ?? null) !== $storage->space) return;
        $id = (int) ($payload['file_id'] ?? 0);
        $revision = (int) ($payload['revision'] ?? 0);
        $row = $storage->entry($id);
        if (!$row || $row['kind'] !== 'file' || (int) $row['revision'] !== $revision || $row['storage_key'] === '' || !self::supports($row['mime_type'])) return;
        $current = $storage->derivative($id, self::KIND);
        if ($current && (int) $current['revision'] === $revision && ($current['state'] === 'failed' || ($current['state'] === 'ready' && $storage->store->exists($current['storage_key'])))) return;
        $source = $storage->path($row);
        if (!is_file($source)) throw new \RuntimeException('Stored content is missing.');
        $output = $storage->store->temporary();
        try {
            $ok = $this->render($source, $row['mime_type'], $row['duration_ms'] !== null ? (int) $row['duration_ms'] : null, $output);
            $stored = $ok ? $storage->store->put($output, true) : null;
        } finally {
            if (is_file($output)) unlink($output);
        }
        if ($stored && $stored['created']) $storage->collectLater($stored['key']);
        $storage->saveDerivative($id, self::KIND, $revision, $stored['key'] ?? null, 'image/webp');
    }

    /** Writes the WebP thumbnail to $output; false when the source cannot be rendered, an exception for a transient cause. */
    public function render(string $path, string $mime, ?int $durationMs, string $output): bool
    {
        return str_starts_with($mime, 'video/') ? $this->video($path, $mime, $durationMs, $output) : $this->image($path, $mime, $output);
    }

    private function image(string $path, string $mime, string $output): bool
    {
        $size = @getimagesize($path);
        if (!is_array($size) || $size[0] < 1 || $size[1] < 1 || $size[0] * $size[1] > self::MAX_PIXELS) return false;
        // GD holds the decoded image in memory; without headroom in this worker now, a later attempt may succeed.
        $limit = self::bytes((string) ini_get('memory_limit'));
        if ($limit > 0 && memory_get_usage() + $size[0] * $size[1] * 6 + (int) filesize($path) > $limit * 0.9) throw new \RuntimeException('Not enough memory for the thumbnail now.');
        $image = @imagecreatefromstring((string) file_get_contents($path));
        if (!$image) return false;
        $orientation = $mime === 'image/jpeg' ? MediaProbe::exifOrientation($path) : 1;
        $angle = [3 => 180, 4 => 180, 5 => 270, 6 => 270, 7 => 90, 8 => 90][$orientation] ?? 0;
        if ($angle) {
            $rotated = imagerotate($image, $angle, 0);
            if (!$rotated) return false;
            $image = $rotated;
        }
        if (in_array($orientation, [2, 4, 5, 7], true)) imageflip($image, IMG_FLIP_HORIZONTAL);
        [$width, $height] = [imagesx($image), imagesy($image)];
        $scale = self::SIZE / max($width, $height);
        $thumb = imagecreatetruecolor(max(1, (int) round($width * $scale)), max(1, (int) round($height * $scale)));
        imagealphablending($thumb, false);
        imagesavealpha($thumb, true);
        imagefill($thumb, 0, 0, imagecolorallocatealpha($thumb, 0, 0, 0, 127));
        imagecopyresampled($thumb, $image, 0, 0, 0, 0, imagesx($thumb), imagesy($thumb), $width, $height);
        return imagewebp($thumb, $output, 80) && is_file($output) && filesize($output) > 0;
    }

    private function video(string $path, string $mime, ?int $durationMs, string $output): bool
    {
        if (!is_executable($this->ffmpeg)) throw new \RuntimeException('The ffmpeg tool is not available.');
        $format = MediaProbe::DEMUXERS[$mime] ?? null;
        if ($format === null) return false;
        $at = $durationMs !== null ? min(1.0, $durationMs / 2000) : 0.0;
        $result = MediaProbe::process([$this->ffmpeg, '-nostdin', '-v', 'error', '-y', '-threads', '1', '-protocol_whitelist', 'file', '-f', $format, '-ss', sprintf('%.3f', $at), '-i', 'file:'.$path,
            '-frames:v', '1', '-vf', 'scale='.self::SIZE.':'.self::SIZE.':force_original_aspect_ratio=decrease', '-c:v', 'libwebp', '-quality', '80', '-threads', '1', '-f', 'webp', $output], $this->timeout, retryable: true);
        return $result !== null && is_file($output) && filesize($output) > 0;
    }

    private static function bytes(string $value): int
    {
        $number = (int) $value;
        return match (strtolower(substr(trim($value), -1))) { 'g' => $number << 30, 'm' => $number << 20, 'k' => $number << 10, default => $number };
    }
}
