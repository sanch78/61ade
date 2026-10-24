<?php
declare(strict_types=1);
namespace Blade\Feature;
use Blade\Audit\Journal;
use Blade\I18n\Translator;

/**
 * Chunked, resumable upload protocol (pseudo-action `__upload`) of actions declaring an UploadPolicy.
 * Every operation resolves the target with the target action's resolver and checks its channel, token
 * scope and ACL (Executor::authorize); `upload_finish` runs the real action through Executor::execute
 * with the assembled file as its single `files` part, so validation, transaction and audit stay the
 * executor's. A transfer is `<tempRoot>/<id>/{meta.json,data}`, bound to actor, channel, owner hash
 * (session id or bearer token, never the raw value), resource, action and target; any mismatch is
 * indistinguishable from an unknown id (404). Expired transfers are swept by later begins (no cron).
 */
final class Transfers
{
    public const OPERATIONS = ['upload_preflight', 'upload_begin', 'upload_chunk', 'upload_status', 'upload_finish', 'upload_abort'];
    /** Operations that write their own audit row (begin) or run the audited action (finish). */
    public const AUDITED = ['upload_begin', 'upload_finish'];
    private const SWEEP_REMOVALS = 20;
    private const SWEEP_ENTRIES = 2000;
    private const PREFLIGHT_LIMIT = 1000;

    public function __construct(private Registry $registry, private Executor $executor, private Journal $journal) {}

    /** Owner binding of a transfer: sha256 of the session id (ui) or of the bearer token (api). */
    public static function owner(string $secret): string { return hash('sha256', $secret); }

    /** $values: {operation, action, ...}; a chunk arrives as the `chunk` part in $ctx->uploads. */
    public function handle(Context $ctx, string $owner, string $resource, ?string $id, array $values): mixed
    {
        if (!preg_match('/^[0-9a-f]{64}$/D', $owner)) throw new Failure('Érvénytelen munkamenet.', 403);
        $operation = $values['operation'] ?? null;
        $name = $values['action'] ?? null;
        if (!is_string($operation) || !in_array($operation, self::OPERATIONS, true) || !is_string($name) || str_starts_with($name, '__')) throw new Failure('Hibás feltöltési kérés.');
        $action = $this->registry->get($resource, $name);
        $policy = $action->upload;
        if (!$policy instanceof UploadPolicy || $policy->tempRoot === '') throw new Failure('A művelet nem fogad fájlt.', 415);
        $allowed = match ($operation) { 'upload_preflight' => ['files'], 'upload_begin' => ['file', 'fingerprint'], 'upload_chunk' => ['transfer', 'offset'], 'upload_finish' => ['transfer', 'decision'], default => ['transfer'] };
        if (array_diff(array_map('strval', array_keys($values)), ['operation', 'action', ...$allowed])) throw new Failure('Hibás feltöltési kérés.');
        if ($operation !== 'upload_chunk' && $ctx->uploads) throw new Failure('A művelet nem fogad fájlt.', 415);
        try {
            return match ($operation) {
                'upload_preflight' => $this->preflight($ctx, $action, $policy, $id, $values['files'] ?? null),
                'upload_begin' => $this->begin($ctx, $action, $policy, $owner, $id, $values),
                'upload_chunk' => $this->chunk($ctx, $action, $policy, $owner, $id, $values),
                'upload_status' => $this->status($ctx, $action, $policy, $owner, $id, $values),
                'upload_finish' => $this->finish($ctx, $action, $policy, $owner, $id, $values),
                'upload_abort' => $this->abort($ctx, $action, $policy, $owner, $id, $values),
            };
        } catch (Failure $error) {
            throw $error;
        } catch (\Throwable) {
            // Resolver, preflight or filesystem errors never leak details to the client.
            throw new Failure('A művelet nem hajtható végre.', 500);
        }
    }

    /** Per-file verdicts for announced files; nothing is created. */
    private function preflight(Context $ctx, Action $action, UploadPolicy $policy, ?string $id, mixed $files): array
    {
        if (!is_array($files) || !array_is_list($files) || !$files || count($files) > self::PREFLIGHT_LIMIT) throw new Failure('Hibás feltöltési kérés.');
        $files = array_map(self::file(...), $files);
        $target = $this->executor->authorize($ctx, $action, $id);
        $out = $checked = [];
        foreach ($files as $index => $file) {
            $problem = $index >= $policy->maxFiles ? ['code' => 'quota', 'message' => Translator::text('Egyszerre legfeljebb {count} fájl tölthető fel.', ['count' => $policy->maxFiles])] : $policy->problem($file['name'], $file['size'], $file['relative_path']);
            $out[$index] = $problem ? ['index' => $index, 'ok' => false, ...$problem] : ['index' => $index, 'ok' => true];
            if (!$problem) $checked[$index] = $file;
        }
        foreach ($this->domain($ctx, $policy, $target, $checked) as $index => $problem) $out[$index] = ['index' => $index, 'ok' => false, ...$problem];
        return ['files' => array_values($out)];
    }

    /** Starts a transfer, or returns the owner's unexpired transfer of the same fingerprint (resume). Audited with the size only. */
    private function begin(Context $ctx, Action $action, UploadPolicy $policy, string $owner, ?string $id, array $values): array
    {
        $size = null;
        try {
            $file = self::file($values['file'] ?? null);
            $size = $file['size'];
            $fingerprint = $values['fingerprint'] ?? null;
            if (!is_string($fingerprint) || $fingerprint === '' || strlen($fingerprint) > 128) throw new Failure('Hibás feltöltési kérés.');
            $target = $this->executor->authorize($ctx, $action, $id);
            $problem = $policy->problem($file['name'], $file['size'], $file['relative_path']) ?? $this->domain($ctx, $policy, $target, [$file])[0] ?? null;
            // A name conflict is decided at finish; every other verdict is final.
            if ($problem && $problem['code'] !== 'conflict') throw new Failure($problem['message'], 400, [], ['code' => $problem['code']]);
            $this->sweep($policy->tempRoot);
            $meta = $this->open($ctx, $policy, $owner, $action, $id, $file, $fingerprint);
            $this->journal->record($ctx->actor->id, $ctx->channel, $action->resource, $action->name, (string) ($target['id'] ?? ''), 'success', [], ['size' => $size]);
        } catch (\Throwable $error) {
            $this->journal->record($ctx->actor->id, $ctx->channel, $action->resource, $action->name, substr($id ?? '', 0, 100), $error instanceof Failure ? 'rejected' : 'error', [], $size !== null ? ['size' => $size] : []);
            if ($error instanceof Failure) throw $error;
            throw new Failure('A fájl feltöltése nem sikerült.', 500);
        }
        return ['transfer' => $meta['id'], 'received' => $meta['received'], 'size' => $meta['size'], 'chunk_bytes' => $policy->chunkBytes, 'expires_at' => gmdate('Y-m-d\TH:i:s\Z', $meta['expires_at'])];
    }

    /** Appends one part at exactly the received offset under an exclusive lock of the data file. */
    private function chunk(Context $ctx, Action $action, UploadPolicy $policy, string $owner, ?string $id, array $values): array
    {
        $this->executor->authorize($ctx, $action, $id);
        $meta = $this->load($ctx, $policy, $owner, $action, $id, $values['transfer'] ?? null);
        $offset = $values['offset'] ?? null;
        if (is_string($offset) && preg_match('/^(0|[1-9][0-9]{0,17})$/D', $offset)) $offset = (int) $offset;
        if (!is_int($offset) || $offset < 0) throw new Failure('Hibás feltöltési kérés.');
        $part = $ctx->uploads[0] ?? null;
        if (count($ctx->uploads) !== 1 || $part->field !== 'chunk') throw new Failure('Hibás feltöltés.');
        if (in_array($part->error, [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true)) throw new Failure('Túl nagy kérés.', 413);
        if ($part->error !== UPLOAD_ERR_OK) throw new Failure('Hibás feltöltés.');
        clearstatcache(true, $part->path);
        $length = is_file($part->path) ? filesize($part->path) : false;
        if ($length === false || $length < 1) throw new Failure('Hibás feltöltés.');
        if ($length > $policy->chunkBytes) throw new Failure('Túl nagy kérés.', 413);
        $directory = $policy->tempRoot.'/'.$meta['id'];
        $handle = $this->lock($directory);
        try {
            $received = fstat($handle)['size'];
            if ($offset !== $received) throw new Failure('A feltöltés más ponton folytatódik.', 409, [], ['received' => $received]);
            if ($received + $length > $meta['size']) throw new Failure($policy->tooLarge($meta['size']), 400, [], ['code' => 'too_large']);
            $source = fopen($part->path, 'rb');
            if ($source === false || fseek($handle, 0, SEEK_END) !== 0) throw new Failure('A fájl feltöltése nem sikerült.', 500);
            $copied = stream_copy_to_stream($source, $handle);
            fclose($source);
            fflush($handle);
            if ($copied !== $length) { ftruncate($handle, $received); throw new Failure('A fájl feltöltése nem sikerült.', 500); }
            $received += $length;
            // Activity keeps the transfer alive for another TTL.
            $this->save($directory, [...$meta, 'received' => $received, 'expires_at' => time() + $policy->ttlSeconds]);
        } finally {
            flock($handle, LOCK_UN);
            fclose($handle);
        }
        return ['received' => $received];
    }

    private function status(Context $ctx, Action $action, UploadPolicy $policy, string $owner, ?string $id, array $values): array
    {
        $this->executor->authorize($ctx, $action, $id);
        $meta = $this->load($ctx, $policy, $owner, $action, $id, $values['transfer'] ?? null);
        $received = $this->received($policy->tempRoot.'/'.$meta['id']);
        return ['received' => $received, 'size' => $meta['size'], 'state' => $received === $meta['size'] ? 'complete' : 'receiving'];
    }

    /**
     * Runs the target action for the assembled file. A name conflict (409) and transient errors keep the
     * transfer for a later finish (with a decision); success, skip and permanent errors remove it.
     */
    private function finish(Context $ctx, Action $action, UploadPolicy $policy, string $owner, ?string $id, array $values): mixed
    {
        $handle = null;
        try {
            // The action re-checks everything; the transfer's state is revealed only to an authorized owner.
            $this->executor->authorize($ctx, $action, $id);
            $meta = $this->load($ctx, $policy, $owner, $action, $id, $values['transfer'] ?? null);
            $directory = $policy->tempRoot.'/'.$meta['id'];
            $handle = $this->lock($directory);
            if (fstat($handle)['size'] !== $meta['size']) throw new Failure('A fájl még nem érkezett meg teljesen.', 400, [], ['code' => 'incomplete']);
        } catch (Failure $error) {
            if ($handle) { flock($handle, LOCK_UN); fclose($handle); }
            $this->journal->record($ctx->actor->id, $ctx->channel, $action->resource, $action->name, substr($id ?? '', 0, 100), 'rejected');
            throw $error;
        }
        $input = array_filter(['decision' => $values['decision'] ?? null, 'relative_path' => $meta['relative_path'] !== '' ? $meta['relative_path'] : null], static fn($value) => $value !== null);
        $upload = new Upload('files', $meta['name'], $directory.'/data', $meta['size'], UPLOAD_ERR_OK);
        try {
            $result = $this->executor->execute(new Context($ctx->actor, $ctx->channel, $ctx->acl, $ctx->db, $ctx->scopes, [$upload]), $action->resource, $action->name, $id, $input);
            $this->remove($directory, $handle);
            return $result;
        } catch (Failure $error) {
            if ($error->status !== 409 && $error->status < 500) $this->remove($directory, $handle);
            throw $error;
        } finally {
            flock($handle, LOCK_UN);
            fclose($handle);
        }
    }

    private function abort(Context $ctx, Action $action, UploadPolicy $policy, string $owner, ?string $id, array $values): array
    {
        $this->executor->authorize($ctx, $action, $id);
        $meta = $this->load($ctx, $policy, $owner, $action, $id, $values['transfer'] ?? null);
        $this->remove($policy->tempRoot.'/'.$meta['id']);
        return ['aborted' => true];
    }

    /** Normalized announced file; the browser type is informational and never trusted. */
    private static function file(mixed $file): array
    {
        if (!is_array($file) || array_diff(array_map('strval', array_keys($file)), ['name', 'size', 'type', 'relative_path', 'last_modified'])
            || !is_string($file['name'] ?? null) || strlen($file['name']) > 1020 || !is_int($file['size'] ?? null) || $file['size'] < 0
            || !is_string($file['type'] ?? '') || strlen($file['type'] ?? '') > 255 || !is_string($file['relative_path'] ?? '') || strlen($file['relative_path'] ?? '') > 4096
            || (isset($file['last_modified']) && !is_int($file['last_modified']))) throw new Failure('Hibás feltöltési kérés.');
        return ['name' => $file['name'], 'size' => $file['size'], 'type' => $file['type'] ?? '', 'relative_path' => $file['relative_path'] ?? ''];
    }

    /** Domain verdicts of the policy's preflight closure for files that passed the generic rules. */
    private function domain(Context $ctx, UploadPolicy $policy, array $target, array $files): array
    {
        if (!$files || !$policy->preflight) return [];
        $out = [];
        foreach (($policy->preflight)($ctx, $target, $files) as $index => $problem) {
            if (!isset($files[$index]) || !is_array($problem) || !in_array($problem['code'] ?? null, UploadPolicy::CODES, true)) throw new \LogicException('Invalid upload preflight result.');
            $out[$index] = array_intersect_key($problem, ['code' => 1, 'message' => 1, 'conflict' => 1]);
        }
        return $out;
    }

    /** Existing transfer of the same owner, target and fingerprint (and the same file), otherwise a new one. */
    private function open(Context $ctx, UploadPolicy $policy, string $owner, Action $action, ?string $id, array $file, string $fingerprint): array
    {
        $root = $policy->tempRoot;
        self::directory($root);
        $key = hash('sha256', implode("\0", [$owner, $ctx->actor->id, $ctx->channel, $action->resource, $action->name, $id ?? '', $fingerprint]));
        $index = fopen($root.'/'.$key.'.resume', 'c+');
        if ($index === false || !flock($index, LOCK_EX)) throw new \RuntimeException('Cannot open the transfer index.');
        try {
            @chmod($root.'/'.$key.'.resume', 0660);
            $previous = trim((string) stream_get_contents($index));
            $meta = preg_match('/^[0-9a-f]{32}$/D', $previous) ? self::read($root.'/'.$previous.'/meta.json') : null;
            if ($meta && $this->owns($meta, $ctx, $owner, $action, $id) && $meta['expires_at'] >= time() && $meta['name'] === $file['name'] && $meta['size'] === $file['size'] && $meta['relative_path'] === $file['relative_path']) {
                return [...$meta, 'received' => $this->received($root.'/'.$meta['id'])];
            }
            $transfer = bin2hex(random_bytes(16));
            $directory = $root.'/'.$transfer;
            if (!@mkdir($directory, 02770)) throw new \RuntimeException('Cannot create the transfer.');
            @chmod($directory, 02770);
            if (file_put_contents($directory.'/data', '') !== 0) throw new \RuntimeException('Cannot create the transfer.');
            @chmod($directory.'/data', 0660);
            $meta = ['id' => $transfer, 'actor' => $ctx->actor->id, 'channel' => $ctx->channel, 'owner' => $owner, 'resource' => $action->resource, 'action' => $action->name, 'target' => $id,
                'resume' => $key, 'name' => $file['name'], 'size' => $file['size'], 'relative_path' => $file['relative_path'], 'received' => 0, 'expires_at' => time() + $policy->ttlSeconds];
            $this->save($directory, $meta);
            ftruncate($index, 0);
            rewind($index);
            fwrite($index, $transfer);
            fflush($index);
            return $meta;
        } finally {
            flock($index, LOCK_UN);
            fclose($index);
        }
    }

    private function owns(array $meta, Context $ctx, string $owner, Action $action, ?string $id): bool
    {
        return hash_equals($meta['owner'], $owner) && $meta['actor'] === $ctx->actor->id && $meta['channel'] === $ctx->channel
            && $meta['resource'] === $action->resource && $meta['action'] === $action->name && $meta['target'] === $id;
    }

    /** The caller's unexpired transfer; anything else is "not found" without telling why. */
    private function load(Context $ctx, UploadPolicy $policy, string $owner, Action $action, ?string $id, mixed $transfer): array
    {
        $meta = is_string($transfer) && preg_match('/^[0-9a-f]{32}$/D', $transfer) ? self::read($policy->tempRoot.'/'.$transfer.'/meta.json') : null;
        if (!$meta || $meta['id'] !== $transfer || !$this->owns($meta, $ctx, $owner, $action, $id)) throw new Failure('Nem található feltöltés.', 404);
        if ($meta['expires_at'] < time()) {
            $this->remove($policy->tempRoot.'/'.$transfer);
            throw new Failure('Nem található feltöltés.', 404);
        }
        return $meta;
    }

    /** Exclusive lock of the data file; a transfer removed meanwhile is "not found". */
    private function lock(string $directory)
    {
        $handle = @fopen($directory.'/data', 'r+b');
        if ($handle === false) throw new Failure('Nem található feltöltés.', 404);
        if (!flock($handle, LOCK_EX)) { fclose($handle); throw new Failure('A fájl feltöltése nem sikerült.', 500); }
        clearstatcache(true, $directory.'/meta.json');
        if (!is_file($directory.'/meta.json')) { flock($handle, LOCK_UN); fclose($handle); throw new Failure('Nem található feltöltés.', 404); }
        return $handle;
    }

    private function received(string $directory): int
    {
        clearstatcache(true, $directory.'/data');
        $size = @filesize($directory.'/data');
        if ($size === false) throw new Failure('Nem található feltöltés.', 404);
        return $size;
    }

    private static function read(string $path): ?array
    {
        $json = is_file($path) ? @file_get_contents($path) : false;
        $meta = is_string($json) ? json_decode($json, true) : null;
        return is_array($meta) && is_string($meta['id'] ?? null) && is_string($meta['owner'] ?? null) && is_string($meta['actor'] ?? null) && is_int($meta['size'] ?? null) && is_int($meta['expires_at'] ?? null) ? $meta : null;
    }

    /** Atomic metadata update: temporary file in the same directory, then rename. */
    private function save(string $directory, array $meta): void
    {
        $temporary = $directory.'/meta.json.'.bin2hex(random_bytes(6)).'.tmp';
        if (file_put_contents($temporary, json_encode($meta, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)) === false) throw new \RuntimeException('Cannot write the transfer.');
        @chmod($temporary, 0660);
        if (!rename($temporary, $directory.'/meta.json')) { @unlink($temporary); throw new Failure('Nem található feltöltés.', 404); }
    }

    /** Removes a transfer under its data lock ($handle when the caller already holds it) and its resume index. */
    private function remove(string $directory, $handle = null): void
    {
        $own = $handle === null;
        if ($own) {
            $handle = @fopen($directory.'/data', 'r+b');
            if ($handle) flock($handle, LOCK_EX);
        }
        $meta = self::read($directory.'/meta.json');
        foreach (@scandir($directory) ?: [] as $entry) if (is_file($directory.'/'.$entry)) @unlink($directory.'/'.$entry);
        @rmdir($directory);
        if ($meta && is_string($meta['resume'] ?? null) && preg_match('/^[0-9a-f]{64}$/D', $meta['resume'])) {
            $index = dirname($directory).'/'.$meta['resume'].'.resume';
            if (is_file($index) && trim((string) @file_get_contents($index)) === basename($directory)) @unlink($index);
        }
        if ($own && $handle) { flock($handle, LOCK_UN); fclose($handle); }
    }

    /** Bounded sweep of expired transfers, orphans without metadata and stale resume indexes. */
    private function sweep(string $root): void
    {
        $listing = @opendir($root);
        if ($listing === false) return;
        $now = time();
        $removed = $seen = 0;
        while ($removed < self::SWEEP_REMOVALS && $seen++ < self::SWEEP_ENTRIES && ($entry = readdir($listing)) !== false) {
            $path = $root.'/'.$entry;
            if (preg_match('/^[0-9a-f]{32}$/D', $entry) && is_dir($path)) {
                // Metadata is rewritten on every chunk and the TTL is at least 600 s: a recent file is not expired.
                $modified = @filemtime($path.'/meta.json');
                if ($modified !== false && $modified > $now - 600) continue;
                $meta = self::read($path.'/meta.json');
                if ($meta ? $meta['expires_at'] < $now : (int) @filemtime($path) < $now - 86400) { $this->remove($path); $removed++; }
            } elseif (preg_match('/^([0-9a-f]{64})\.resume$/D', $entry) && (int) @filemtime($path) < $now - 600) {
                $transfer = trim((string) @file_get_contents($path));
                if (!preg_match('/^[0-9a-f]{32}$/D', $transfer) || !is_dir($root.'/'.$transfer)) @unlink($path);
            }
        }
        closedir($listing);
    }

    /** Group-shared transfer root (setgid, no "other"), like the content store. */
    private static function directory(string $path): void
    {
        if (is_dir($path)) return;
        if (!@mkdir($path, 02770, true) && !is_dir($path)) throw new \RuntimeException('Cannot create the transfer root.');
        @chmod($path, 02770);
    }
}
