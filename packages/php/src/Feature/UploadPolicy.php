<?php
declare(strict_types=1);
namespace Blade\Feature;
use Blade\I18n\Translator;

/**
 * Typed upload rules of an action (`Action::$upload`). Besides a direct multipart request (limit
 * maxSizeBytes × maxFiles) the action then accepts the chunked, resumable transfer protocol of
 * Transfers (`__upload`). Only metadata() reaches the browser; tempRoot never does.
 * $preflight(Context $ctx, array $target, array $files): [index => ['code','message','conflict'?]] adds
 * domain checks (name conflicts, depth below a root); it must not write.
 */
final readonly class UploadPolicy
{
    public const MAX_SIZE_BYTES = 104857600;
    public const MAX_FILES = 20;
    public const DUPLICATE_POLICIES = ['ask', 'overwrite', 'rename', 'skip', 'reject'];
    /** Per-file error codes of preflight, begin/chunk/finish (`details.code`) and failed result items. */
    public const CODES = ['too_large', 'type', 'content_mismatch', 'conflict', 'depth', 'name', 'quota', 'incomplete'];
    /** Bytes of a multipart request beyond its parts (JSON `request` field and boundaries). */
    public const ENVELOPE_BYTES = 65536;

    public function __construct(public array $extensions, public int $maxSizeBytes, public int $maxFiles = self::MAX_FILES, public int $chunkBytes = 4194304, public bool $folders = false, public int $maxDepth = 5, public string $duplicatePolicy = 'ask', public string $tempRoot = '', public int $ttlSeconds = 86400, public ?\Closure $preflight = null)
    {
        if (!$extensions || !array_is_list($extensions) || array_filter($extensions, static fn($e) => !is_string($e) || !preg_match('/^[a-z0-9]{1,32}$/D', $e)) || count(array_unique($extensions)) !== count($extensions)) throw new \InvalidArgumentException('Invalid upload extensions.');
        if ($maxSizeBytes < 1 || $maxSizeBytes > self::MAX_SIZE_BYTES || $maxFiles < 1 || $maxFiles > self::MAX_FILES || $chunkBytes < 262144 || $chunkBytes > 8388608 || $maxDepth < 1 || $maxDepth > 32 || $ttlSeconds < 600 || $ttlSeconds > 604800) throw new \InvalidArgumentException('Invalid upload limit.');
        if (!in_array($duplicatePolicy, self::DUPLICATE_POLICIES, true)) throw new \InvalidArgumentException('Invalid duplicate policy.');
        if ($tempRoot !== '' && (!str_starts_with($tempRoot, '/') || str_contains($tempRoot, "\0") || preg_match('~(^|/)\.\.?(/|$)~', $tempRoot))) throw new \InvalidArgumentException('The upload transfer root must be an absolute path.');
        // A chunk request (part + envelope) must fit the runtime's request limit; 0 means unlimited.
        $post = ini_parse_quantity((string) ini_get('post_max_size'));
        if ($post > 0 && $chunkBytes + self::ENVELOPE_BYTES > $post) throw new \InvalidArgumentException('The upload chunk size exceeds post_max_size.');
    }

    /** Byte limit of a direct multipart request carrying every file at once. */
    public function requestBytes(): int { return $this->maxSizeBytes * $this->maxFiles; }

    /** Browser configuration only: never the transfer root or the preflight rules. */
    public function metadata(): array
    {
        return ['extensions' => $this->extensions, 'max_size_bytes' => $this->maxSizeBytes, 'max_files' => $this->maxFiles, 'chunk_bytes' => $this->chunkBytes,
            'folders' => $this->folders, 'max_depth' => $this->maxDepth, 'duplicate_policy' => $this->duplicatePolicy];
    }

    /** Message key of the first violated safe-name rule (file and folder names), or null. */
    public static function invalidName(string $name): ?string
    {
        if ($name === '') return 'A név nem lehet üres.';
        if (preg_match('//u', $name) !== 1) return 'Érvénytelen karakterkódolás.';
        if (mb_strlen($name, 'UTF-8') > 255) return 'Legfeljebb 255 karakter adható meg.';
        // Path separators, NUL, control and invisible format characters (e.g. bidi overrides) never belong in a name.
        if (preg_match('~[/\\\\]|\p{Cc}|\p{Cf}~u', $name)) return 'A név nem tartalmazhat perjelet, vezérlő- vagy formázókaraktert.';
        if (trim($name) !== $name) return 'A név nem kezdődhet és nem végződhet szóközzel.';
        if (preg_match('/^\.+$/D', $name)) return 'A név nem állhat csak pontokból.';
        return null;
    }

    public static function extension(string $name): string
    {
        $dot = strrpos($name, '.');
        return $dot ? mb_substr(mb_strtolower(substr($name, $dot + 1), 'UTF-8'), 0, 32, 'UTF-8') : '';
    }

    /**
     * Directory segments of a `/`-separated relative path (`Fotók/2026/a.jpg`); a last segment equal to
     * the file name is the file itself. Null when a segment is unsafe.
     */
    public static function segments(string $name, string $relativePath): ?array
    {
        if ($relativePath === '') return [];
        if (strlen($relativePath) > 4096) return null;
        $segments = explode('/', $relativePath);
        if (end($segments) === $name) array_pop($segments);
        foreach ($segments as $segment) if (self::invalidName($segment) !== null) return null;
        return $segments;
    }

    /** First generic violation of one announced file, as ['code' => ..., 'message' => translated text], or null. */
    public function problem(string $name, int $size, string $relativePath = ''): ?array
    {
        $error = self::invalidName($name);
        if ($error !== null) return ['code' => 'name', 'message' => Translator::text($error)];
        if (!in_array(self::extension($name), $this->extensions, true)) return ['code' => 'type', 'message' => Translator::text('Nem engedélyezett fájltípus. Engedélyezett: {types}.', ['types' => implode(', ', $this->extensions)])];
        if ($size > $this->maxSizeBytes) return ['code' => 'too_large', 'message' => $this->tooLarge()];
        $segments = self::segments($name, $relativePath);
        if ($segments === null) {
            $segments = explode('/', $relativePath);
            foreach ($segments as $segment) if (($error = self::invalidName($segment)) !== null) break;
            return ['code' => 'name', 'message' => Translator::text($error ?? 'Hibás feltöltés.')];
        }
        if ($segments && !$this->folders) return ['code' => 'name', 'message' => Translator::text('Mappa feltöltése nem engedélyezett.')];
        if (count($segments) > $this->maxDepth) return ['code' => 'depth', 'message' => Translator::text('A mappák legfeljebb {depth} szint mélyek lehetnek.', ['depth' => $this->maxDepth])];
        return null;
    }

    public function tooLarge(?int $size = null): string
    {
        return Translator::text('A fájl túl nagy (legfeljebb {size} bájt).', ['size' => $size ?? $this->maxSizeBytes]);
    }
}
