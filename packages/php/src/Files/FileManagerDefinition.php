<?php
declare(strict_types=1);
namespace Blade\Files;

use Blade\Feature\{UploadPolicy, Workspace};
use Blade\Tasks\TaskQueue;

/**
 * Two-panel virtual file manager over FileStorage. The consumer declares the space, mounts, content
 * root and upload limits; every operation is a registered action running through the common executor.
 */
final readonly class FileManagerDefinition
{
    /** Detected MIME types accepted per extension, and the type stored for it. */
    public const TYPES = [
        'txt' => ['text/plain', ['text/plain', 'application/x-empty', 'inode/x-empty']],
        'md' => ['text/markdown', ['text/plain', 'text/markdown', 'text/x-markdown', 'application/x-empty', 'inode/x-empty']],
        'csv' => ['text/csv', ['text/csv', 'text/plain', 'application/csv', 'application/x-empty', 'inode/x-empty']],
        'json' => ['application/json', ['application/json', 'text/plain', 'application/x-empty', 'inode/x-empty']],
        'png' => ['image/png', ['image/png']],
        'jpg' => ['image/jpeg', ['image/jpeg']],
        'jpeg' => ['image/jpeg', ['image/jpeg']],
        'mp4' => ['video/mp4', ['video/mp4']],
        'webm' => ['video/webm', ['video/webm']],
        'mp3' => ['audio/mpeg', ['audio/mpeg']],
        'wav' => ['audio/wav', ['audio/wav', 'audio/x-wav', 'audio/wave', 'audio/vnd.wave']],
        'm4a' => ['audio/mp4', ['audio/mp4', 'audio/x-m4a']],
    ];
    /** Stored types the media player (image viewer, video and audio player) opens; `content_get`/`content_stream` serve only these. */
    public const PREVIEW_TYPES = ['image/png', 'image/jpeg', 'video/mp4', 'video/webm', 'audio/mpeg', 'audio/wav', 'audio/mp4'];
    /** Only plain text files open in the editor; the check is server-side and case-insensitive. */
    public const TEXT_EXTENSION = 'txt';
    public const DUPLICATE_POLICIES = ['ask', 'overwrite', 'rename', 'skip', 'reject'];
    /** `archive` (recommended) hides deleted entries from every framework read and keeps their content; `delete` removes them. */
    public const DELETE_POLICIES = ['archive', 'delete'];
    /** PHP's default max_file_uploads; more parts would be dropped silently by the runtime. */
    public const MAX_FILES = 20;

    /**
     * @param array<string,string> $mounts mount key => label (a safe name, UploadPolicy::invalidName)
     * @param list<string> $allowedExtensions upload allowlist, a subset of TYPES
     * @param string $contentRoot absolute directory of the content store (required); never exposed to the browser
     * @param ?string $tempRoot absolute directory of upload transfers, default `<contentRoot>/.transfers`
     * @param string $ffprobePath / $ffmpegPath absolute media tool paths (video/audio metadata, video thumbnails)
     * @param string $deletePolicy `archive` (default) or `delete`, see DELETE_POLICIES
     */
    public function __construct(
        public string $resource,
        public string $title,
        public string $space,
        public array $mounts,
        public array $allowedExtensions = ['txt'],
        public int $maxSizeBytes = 1048576,
        public int $maxFiles = self::MAX_FILES,
        public string $duplicatePolicy = 'ask',
        public int $textMaxBytes = 262144,
        public int $maxDepth = 5,
        public ?string $group = null,
        public ?string $icon = 'dxi dxi-folder-open',
        public bool $desktopOnly = false,
        /** The view's guide text (Blade\Feature\View $guide). */
        public ?string $guide = null,
        public string $contentRoot = '',
        public ?string $tempRoot = null,
        public bool $thumbnails = true,
        public string $ffprobePath = '/usr/bin/ffprobe',
        public string $ffmpegPath = '/usr/bin/ffmpeg',
        public string $deletePolicy = 'archive',
    ) {
        if (!preg_match('/^[a-z][a-z0-9_.-]*$/D', $resource) || $title === '' || !$mounts || count($mounts) > 26) throw new \InvalidArgumentException('Invalid file manager definition.');
        // A label names the mount root in paths and ZIP archives, so it follows the safe-name rule (no separators, not dot-only).
        foreach ($mounts as $key => $label) if (!is_string($key) || !preg_match('/^[a-z][a-z0-9_-]{0,63}$/D', $key) || !is_string($label) || UploadPolicy::invalidName($label) !== null) throw new \InvalidArgumentException('Invalid file mount.');
        if (!$allowedExtensions || array_diff($allowedExtensions, array_keys(self::TYPES)) || count(array_unique($allowedExtensions)) !== count($allowedExtensions)) throw new \InvalidArgumentException('Unsupported upload extension.');
        if ($maxSizeBytes < 1 || $maxSizeBytes > \Blade\Feature\UploadPolicy::MAX_SIZE_BYTES || $textMaxBytes < 1 || $textMaxBytes > 4194304 || $maxDepth < 1 || $maxDepth > 32) throw new \InvalidArgumentException('Invalid file manager limit.');
        if ($maxFiles < 1 || $maxFiles > self::MAX_FILES) throw new \InvalidArgumentException('Invalid file manager limit.');
        if (!in_array($duplicatePolicy, self::DUPLICATE_POLICIES, true)) throw new \InvalidArgumentException('Invalid duplicate policy.');
        if (!in_array($deletePolicy, self::DELETE_POLICIES, true)) throw new \InvalidArgumentException('Invalid delete policy.');
        foreach ([$ffprobePath, $ffmpegPath] as $path) if (!str_starts_with($path, '/') || str_contains($path, "\0") || preg_match('~(^|/)\.\.?(/|$)~', $path)) throw new \InvalidArgumentException('Media tool paths must be absolute.');
        foreach ([$contentRoot, $tempRoot ?? '/'] as $path) if (!str_starts_with($path, '/') || str_contains($path, "\0") || preg_match('~(^|/)\.\.?(/|$)~', $path)) throw new \InvalidArgumentException('The file manager content root must be an absolute path.');
    }

    public function store(): ContentStore { return new ContentStore($this->contentRoot, $this->space); }

    /** Public storage API for consumer code (folders of a mount, storing an uploaded file); see MountStorage. */
    public function files(\PDO $db, ?TaskQueue $tasks = null): MountStorage { return new MountStorage($this, $this->storage($db, $tasks)); }

    /**
     * Whether the type detected from the bytes at $path is accepted for $extension (TYPES); libmagic reports very
     * short text as octet-stream, so text types then need clean UTF-8 bytes.
     */
    public static function contentMatches(string $extension, string $path): bool
    {
        if (!isset(self::TYPES[$extension])) return false;
        $detected = (string) (new \finfo(FILEINFO_MIME_TYPE))->file($path);
        $text = in_array('text/plain', self::TYPES[$extension][1], true);
        if ($text && $detected === 'application/octet-stream' && filesize($path) <= 65536 && preg_match('/^[^\x00-\x08\x0B\x0E-\x1F\x7F]*$/Du', (string) file_get_contents($path))) $detected = 'text/plain';
        return in_array($detected, self::TYPES[$extension][1], true);
    }

    public function temporaryRoot(): string { return $this->tempRoot ?? rtrim($this->contentRoot, '/').'/.transfers'; }

    /** Upload rules of the `upload` action: folders allowed, transfers under temporaryRoot(); $preflight adds the domain checks. */
    public function uploadPolicy(?\Closure $preflight = null): UploadPolicy
    {
        return new UploadPolicy($this->allowedExtensions, $this->maxSizeBytes, $this->maxFiles, folders: true, maxDepth: $this->maxDepth, duplicatePolicy: $this->duplicatePolicy, tempRoot: $this->temporaryRoot(), preflight: $preflight);
    }

    /** Storage bound to $tasks; the file task handlers of this space are registered on it (setup and CLI too). */
    public function storage(\PDO $db, ?TaskQueue $tasks = null): FileStorage
    {
        $tasks ??= new TaskQueue($db);
        $storage = new FileStorage($db, $this->space, $this->store(), $tasks, new MediaProbe($this->ffprobePath), $this->thumbnails);
        $thumbnails = new Thumbnails($this->ffmpegPath);
        $tasks->handle('files.collect', static function (array $payload) use ($storage): void {
            if (($payload['space'] ?? null) === $storage->space && is_string($payload['key'] ?? null)) $storage->collect($payload['key']);
        }, $this->space);
        $tasks->handle('files.thumbnail', static fn(array $payload) => $thumbnails->run($storage, $payload), $this->space);
        return $storage;
    }

    /** Explicit setup step: tables and one root per mount. */
    public function install(\PDO $db): void
    {
        FileStorage::install($db);
        $storage = $this->storage($db);
        foreach (array_keys($this->mounts) as $mount) $storage->ensureRoot($mount);
    }

    public function register(Workspace $workspace): void
    {
        $storage = $this->storage($workspace->db, $workspace->tasks);
        (new FileActions($this, $storage))->register($workspace->registry);
        // Media columns of other resources (`column.media`) describe and filter files of this space.
        $workspace->registry->media($this->resource, new FileMedia($this, $storage));
    }

    /** Browser configuration only: no SQL, storage keys, paths or rules. */
    public function metadata(): array
    {
        return [
            'mounts' => array_map(static fn($key, $label) => ['id' => $key, 'label' => $label], array_keys($this->mounts), $this->mounts),
            // The upload rules once: the browser part of the `upload` action's policy (allowlist, size, count, duplicates).
            'upload' => ['policy' => $this->uploadPolicy()->metadata()],
            'text' => ['extension' => self::TEXT_EXTENSION, 'max_bytes' => $this->textMaxBytes],
            'preview' => self::PREVIEW_TYPES,
            'thumbnails' => $this->thumbnails ? Thumbnails::TYPES : [],
            'max_depth' => $this->maxDepth,
            'delete_policy' => $this->deletePolicy,
        ];
    }
}
