<?php
declare(strict_types=1);
namespace Blade\Files;

use Blade\Feature\Workspace;

/**
 * Two-panel virtual file manager over FileStorage. The consumer declares the space, mounts and
 * upload limits; every operation is a registered action running through the common executor.
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
    ];
    /** Stored types the image viewer and video player open; `content_get` serves only these. */
    public const PREVIEW_TYPES = ['image/png', 'image/jpeg', 'video/mp4', 'video/webm'];
    /** Only plain text files open in the editor; the check is server-side and case-insensitive. */
    public const TEXT_EXTENSION = 'txt';
    public const DUPLICATE_POLICIES = ['ask', 'overwrite', 'rename', 'skip', 'reject'];

    /**
     * @param array<string,string> $mounts mount key => label
     * @param list<string> $allowedExtensions upload allowlist, a subset of TYPES
     */
    public function __construct(
        public string $resource,
        public string $title,
        public string $space,
        public array $mounts,
        public array $allowedExtensions = ['txt'],
        public int $maxSizeBytes = 1048576,
        public bool $multiple = true,
        public string $duplicatePolicy = 'ask',
        public int $textMaxBytes = 262144,
        public int $maxDepth = 5,
        public ?string $group = null,
        public ?string $icon = 'dxi dxi-folder-open',
        public bool $desktopOnly = false,
    ) {
        if (!preg_match('/^[a-z][a-z0-9_.-]*$/D', $resource) || $title === '' || !$mounts || count($mounts) > 26) throw new \InvalidArgumentException('Invalid file manager definition.');
        foreach ($mounts as $key => $label) if (!is_string($key) || !preg_match('/^[a-z][a-z0-9_-]{0,63}$/D', $key) || !is_string($label) || $label === '') throw new \InvalidArgumentException('Invalid file mount.');
        if (!$allowedExtensions || array_diff($allowedExtensions, array_keys(self::TYPES)) || count(array_unique($allowedExtensions)) !== count($allowedExtensions)) throw new \InvalidArgumentException('Unsupported upload extension.');
        if ($maxSizeBytes < 1 || $maxSizeBytes > 104857600 || $textMaxBytes < 1 || $textMaxBytes > 4194304 || $maxDepth < 1 || $maxDepth > 32) throw new \InvalidArgumentException('Invalid file manager limit.');
        if (!in_array($duplicatePolicy, self::DUPLICATE_POLICIES, true)) throw new \InvalidArgumentException('Invalid duplicate policy.');
    }

    public function storage(\PDO $db): FileStorage { return new FileStorage($db, $this->space); }

    /** Explicit setup step: table and one root per mount. */
    public function install(\PDO $db): void
    {
        FileStorage::install($db);
        foreach (array_keys($this->mounts) as $mount) $this->storage($db)->ensureRoot($mount);
    }

    public function register(Workspace $workspace): void
    {
        (new FileActions($this, $this->storage($workspace->db)))->register($workspace->registry);
    }

    /** Browser configuration only: no SQL, storage keys or rules. */
    public function metadata(): array
    {
        return [
            'mounts' => array_map(static fn($key, $label) => ['id' => $key, 'label' => $label], array_keys($this->mounts), $this->mounts),
            'upload' => ['allowed_extensions' => $this->allowedExtensions, 'max_size_bytes' => $this->maxSizeBytes, 'multiple' => $this->multiple, 'duplicate_policy' => $this->duplicatePolicy],
            'text' => ['extension' => self::TEXT_EXTENSION, 'max_bytes' => $this->textMaxBytes],
            'preview' => self::PREVIEW_TYPES,
            'max_depth' => $this->maxDepth,
        ];
    }
}
