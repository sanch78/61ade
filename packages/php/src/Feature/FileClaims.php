<?php
declare(strict_types=1);
namespace Blade\Feature;

/**
 * Upload claims of stored file fields (FB-0167, docs/workspaces.md#stored-file-field). When the upload action that a
 * stored `file` field names returns a token (`['id' => token]`), the executor records who uploaded it: actor, channel,
 * owner hash (session or bearer token), tenant, the upload action, the MIME type detected from the bytes, the name and
 * the size, until the policy's TTL. A record save that sets the field to a new token is accepted only for an unexpired
 * claim of the same actor, session, tenant and upload action whose type the field accepts; the claim is removed after
 * the save commits, so a token is claimed once. Claims are `<tempRoot>/claims/<sha256>.json` (no bytes); expired ones
 * are swept by later uploads. The project owns the bytes and expires its own unclaimed uploads.
 */
final class FileClaims
{
    private const SWEEP_REMOVALS = 20;
    private const SWEEP_ENTRIES = 2000;

    /** The claim file of $token uploaded through $resource.$action. */
    private static function path(UploadPolicy $policy, string $resource, string $action, string $token): string
    {
        return $policy->tempRoot.'/claims/'.hash('sha256', $resource."\0".$action."\0".$token).'.json';
    }

    /** MIME type detected from the bytes at $path (libmagic); `application/octet-stream` when unknown. */
    public static function detect(string $path): string
    {
        $type = @(new \finfo(FILEINFO_MIME_TYPE))->file($path);
        return is_string($type) && preg_match('~^[a-z]+/[a-z0-9.+-]+$~D', $type) ? $type : 'application/octet-stream';
    }

    /** Whether $mime belongs to one of the accepted MIME classes (`image` accepts `image/*`). */
    public static function accepts(array $accept, string $mime): bool
    {
        foreach ($accept as $class) if (str_starts_with($mime, $class.'/')) return true;
        return false;
    }

    /** Records the claim of $token after its upload; sweeps a few expired claims. */
    public static function issue(Context $ctx, UploadPolicy $policy, Action $action, string $token, Upload $upload, string $mime): void
    {
        $root = $policy->tempRoot.'/claims';
        if (!is_dir($root) && !@mkdir($root, 02770, true) && !is_dir($root)) throw new \RuntimeException('Cannot create the upload claim root.');
        @chmod($root, 02770);
        self::sweep($root);
        $claim = ['actor' => $ctx->actor->id, 'channel' => $ctx->channel, 'owner' => $ctx->owner, 'tenant' => $ctx->tenant, 'resource' => $action->resource, 'action' => $action->name,
            'mime_type' => $mime, 'name' => UploadPolicy::shown($upload->name), 'size' => $upload->size, 'expires_at' => time() + $policy->ttlSeconds];
        $path = self::path($policy, $action->resource, $action->name, $token);
        $temporary = $path.'.'.bin2hex(random_bytes(6)).'.tmp';
        if (file_put_contents($temporary, json_encode($claim, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)) === false) throw new \RuntimeException('Cannot write the upload claim.');
        @chmod($temporary, 0660);
        if (!rename($temporary, $path)) { @unlink($temporary); throw new \RuntimeException('Cannot write the upload claim.'); }
    }

    /**
     * The field error of a new token for $field, or null with the claim's path in $path (removed after the save). Every
     * claim that is missing, expired or another actor's, session's, tenant's or upload action's gets one message, so
     * the reply reveals nothing about other uploads.
     */
    public static function problem(Context $ctx, Registry $registry, Field $field, string $token, ?string &$path = null): ?string
    {
        [$resource, $name] = $field->fileAction('upload');
        $policy = $registry->get($resource, $name)->upload;
        $missing = 'A kiválasztott fájl nem érhető el.';
        if (!$policy instanceof UploadPolicy || $policy->tempRoot === '') return $missing;
        $file = self::path($policy, $resource, $name, $token);
        $json = is_file($file) ? @file_get_contents($file) : false;
        $claim = is_string($json) ? json_decode($json, true) : null;
        if (!is_array($claim) || !is_int($claim['expires_at'] ?? null) || $claim['expires_at'] < time() || ($claim['actor'] ?? null) !== $ctx->actor->id || ($claim['channel'] ?? null) !== $ctx->channel
            || !is_string($claim['owner'] ?? null) || $ctx->owner === '' || !hash_equals($claim['owner'], $ctx->owner) || ($claim['tenant'] ?? null) !== $ctx->tenant
            || ($claim['resource'] ?? null) !== $resource || ($claim['action'] ?? null) !== $name) return $missing;
        if (!self::accepts($field->file['accept'], (string) ($claim['mime_type'] ?? ''))) return 'A fájl típusa ehhez a mezőhöz nem engedélyezett.';
        $path = $file;
        return null;
    }

    /** Removes claimed tokens after their save committed. */
    public static function release(array $paths): void
    {
        foreach ($paths as $path) @unlink($path);
    }

    /** Bounded sweep of expired claims and stale temporary files. */
    private static function sweep(string $root): void
    {
        $listing = @opendir($root);
        if ($listing === false) return;
        $now = time();
        $removed = $seen = 0;
        while ($removed < self::SWEEP_REMOVALS && $seen++ < self::SWEEP_ENTRIES && ($entry = readdir($listing)) !== false) {
            $path = $root.'/'.$entry;
            if (preg_match('/^[0-9a-f]{64}\.json$/D', $entry)) {
                $claim = json_decode((string) @file_get_contents($path), true);
                if (!is_array($claim) || !is_int($claim['expires_at'] ?? null) || $claim['expires_at'] < $now) { @unlink($path); $removed++; }
            } elseif (preg_match('/^[0-9a-f]{64}\.json\.[0-9a-f]{12}\.tmp$/D', $entry) && (int) @filemtime($path) < $now - 600) { @unlink($path); $removed++; }
        }
        closedir($listing);
    }
}
