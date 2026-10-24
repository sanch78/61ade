<?php
declare(strict_types=1);
namespace Blade\Files;

use Blade\Feature\{Context, MediaSource};

/**
 * MediaSource over a file manager space: a `column.media` value is a `blade_files` id. A file is
 * described only when the actor may read its thumbnail (`thumbnail_get` on its mount, for the channel
 * and API token scope), so names, types and states of other files never reach a list. Archived files are
 * neither described (FileStorage::entries) nor matched by a class filter.
 */
final readonly class FileMedia implements MediaSource
{
    public const CLASSES = ['image' => 'Kép', 'video' => 'Videó'];
    /** Distinct ids described per call; the largest list window is 600 rows. */
    private const MAX_IDS = 2000;

    public function __construct(private FileManagerDefinition $definition, private FileStorage $storage)
    {
    }

    /** Mounts whose thumbnails the actor may read on this channel (and API token scope). */
    private function visible(Context $ctx): array
    {
        $resource = $this->definition->resource;
        if ($ctx->channel === 'api' && !in_array($resource.'.thumbnail_get', $ctx->scopes, true)) return [];
        return array_values(array_filter(array_keys($this->definition->mounts), static fn($mount) => $ctx->acl->allows($ctx->actor->id, $resource, 'thumbnail_get', $ctx->channel, (string) $mount)));
    }

    public function describe(Context $ctx, array $ids): array
    {
        $resource = $this->definition->resource;
        if ($ctx->channel === 'api' && !in_array($resource.'.thumbnail_get', $ctx->scopes, true)) return [];
        $rows = [];
        $allowed = [];
        $ids = array_values(array_filter(array_slice(array_values(array_unique(array_filter($ids, 'is_string'))), 0, self::MAX_IDS), static fn($id) => preg_match('/^[1-9][0-9]{0,17}$/D', $id) === 1));
        $entries = $ids ? $this->storage->entries($ids) : [];
        foreach ($ids as $id) {
            $row = $entries[(int) $id] ?? null;
            if (!$row || $row['kind'] !== 'file' || !isset($this->definition->mounts[$row['mount_id']])) continue;
            $allowed[$row['mount_id']] ??= $ctx->acl->allows($ctx->actor->id, $resource, 'thumbnail_get', $ctx->channel, (string) $row['mount_id']);
            if ($allowed[$row['mount_id']]) $rows[$id] = $row;
        }
        $states = $rows ? $this->storage->thumbnails(array_values($rows)) : [];
        $number = static fn($value): ?int => $value === null || $value === '' ? null : (int) $value;
        $out = [];
        foreach ($rows as $id => $row) $out[(string) $id] = [
            'id' => (string) $row['id'], 'name' => (string) $row['name'], 'mime_type' => (string) $row['mime_type'], 'revision' => (string) $row['revision'],
            'duration_ms' => $number($row['duration_ms']), 'width' => $number($row['width']), 'height' => $number($row['height']),
            'thumbnail' => $states[(int) $row['id']] ?? 'none',
        ];
        return $out;
    }

    public function classes(): array { return self::CLASSES; }

    /** The outer column stays outside the subquery, so it never resolves to a `blade_files` column. */
    public function classPredicate(Context $ctx, string $column, string $class): array
    {
        if (!preg_match('/^[a-zA-Z_][a-zA-Z0-9_]*$/D', $column) || !isset(self::CLASSES[$class])) throw new \InvalidArgumentException('Invalid media class predicate.');
        $mounts = $this->visible($ctx);
        if (!$mounts) return ['1 = 0', []];
        $names = array_map(static fn($index) => 'mount'.$index, array_keys($mounts));
        return ["$column IN (SELECT media_file.id FROM blade_files media_file WHERE media_file.space = :space AND media_file.kind = 'file' AND ".FileStorage::live('media_file')." AND media_file.mime_type LIKE :pattern AND media_file.mount_id IN (:".implode(', :', $names).'))',
            ['space' => $this->storage->space, 'pattern' => $class.'/%', ...array_combine($names, $mounts)]];
    }
}
