<?php
declare(strict_types=1);
namespace Blade\Preferences;

use Blade\Feature\Failure;
use Blade\Infrastructure\Transaction;

/**
 * One JSON document of presentation settings per signed-in user (docs/user-preferences-plan.md):
 * `{v, entries: {"@theme": value, "<path>\t<key>": value}}`, least recently changed first. For one entry the last write
 * wins. Reset raises the row's `generation`, and a patch of another generation applies nothing. The stored text is
 * ASCII JSON, and every limit is measured on it. Values are decoded as objects, so an empty JSON object stays one.
 * Never creates its table (Schema::install).
 */
final class UserPreferences
{
    public const PATCH_BYTES = 61440;
    public const ENTRY_BYTES = 32768;
    public const DOCUMENT_BYTES = 262144;
    public const ENTRIES = 1000;
    /** `@theme`, `@skin`, or an entry with an optional device class or tenant part. Window geometry stays in the browser. */
    private const KEY = '/^(?:@theme|@skin|(?!@|window:)[^\x00-\x1f\x7f|]{1,200}(?:\|(?:wide|narrow|t:[^\x00-\x1f\x7f|]{1,100}))?)$/uD';
    /** Non-ASCII stays escaped, so the text survives a `charset=utf8` connection. */
    private const JSON = JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR;

    public function __construct(private \PDO $db) {}

    /** The application path of a request URI (the part before `?`), the page's `location.pathname`; null when unusable. */
    public static function path(string $uri): ?string
    {
        $path = explode('?', $uri, 2)[0];
        return str_starts_with($path, '/') && strlen($path) <= 255 && preg_match('//u', $path) && !preg_match('/[\x00-\x1f\x7f]/', $path) ? $path : null;
    }

    /**
     * Bootstrap `{entries, generation}` of $path, the account and the active $tenant. Null without the table. A document
     * this release cannot read answers `unreadable: true`: the page stays browser-local and the user can still reset it.
     */
    public function bootstrap(string $actor, string $path, ?string $tenant = null): ?array
    {
        try {
            $query = $this->db->prepare('SELECT document, generation FROM blade_user_preferences WHERE actor_id = ?');
            $query->execute([$actor]);
            $row = $query->fetch(\PDO::FETCH_ASSOC);
        } catch (\PDOException) {
            return null;
        }
        $document = self::decode($row['document'] ?? null);
        if (!$document) return ['entries' => new \stdClass(), 'generation' => (int) ($row['generation'] ?? 0), 'unreadable' => true];
        $entries = new \stdClass();
        $prefix = $path."\t";
        foreach (get_object_vars($document->entries) as $stored => $value) {
            $stored = (string) $stored;
            $key = ($stored[0] ?? '') === '@' ? $stored : (str_starts_with($stored, $prefix) ? substr($stored, strlen($prefix)) : null);
            // A damaged key (a restore, a direct edit) must not stop the page.
            if ($key === null || !preg_match(self::KEY, $key)) continue;
            $part = strpos($key, '|t:');
            if ($part === false || substr($key, $part + 3) === $tenant) $entries->{$key} = $value;
        }
        return ['entries' => $entries, 'generation' => (int) ($row['generation'] ?? 0)];
    }

    /**
     * Merges `{generation, set?, remove?, fill?}` into the document of $actor in one transaction, or with `{reset: true}`
     * empties it and raises its generation. `fill` stores only entries the document lacks, as the oldest. A patch of
     * another generation applies nothing and answers 409.
     * @return array{revision: int, generation: int}
     */
    public function patch(string $actor, string $path, mixed $patch): array
    {
        [$set, $remove, $generation, $fill, $reset] = self::validated($patch);
        try {
            $mysql = $this->db->getAttribute(\PDO::ATTR_DRIVER_NAME) === 'mysql';
            // The row exists before the transaction, so concurrent first saves queue on its lock instead of deadlocking on an insert.
            $this->db->prepare(($mysql ? 'INSERT IGNORE' : 'INSERT OR IGNORE').' INTO blade_user_preferences (actor_id, document, revision, generation, updated_at) VALUES (?, ?, 0, 0, ?)')
                ->execute([$actor, '{}', gmdate('c')]);
            Transaction::begin($this->db);
            $query = $this->db->prepare('SELECT document, revision, generation FROM blade_user_preferences WHERE actor_id = ?'.($mysql ? ' FOR UPDATE' : ''));
            $query->execute([$actor]);
            $row = $query->fetch(\PDO::FETCH_ASSOC);
            if (!$row) throw new Failure('Nem érhető el.', 503);
            $current = (int) $row['generation'];
            if ($reset) {
                $current++;
                $entries = [];
            } else {
                if ($generation !== $current) throw new Failure('Nem érhető el.', 409);
                $document = self::decode($row['document']);
                // A document of another version is never overwritten by a save; the user's own reset may still erase it.
                if (!$document) throw new Failure('Nem érhető el.', 503);
                $entries = self::merged(get_object_vars($document->entries), $path, $set, $remove, $fill);
            }
            $revision = (int) $row['revision'] + 1;
            $this->db->prepare('UPDATE blade_user_preferences SET document = ?, revision = ?, generation = ?, updated_at = ? WHERE actor_id = ?')
                ->execute([self::encode($entries), $revision, $current, gmdate('c'), $actor]);
            $this->db->commit();
            return ['revision' => $revision, 'generation' => $current];
        } catch (\PDOException) {
            if ($this->db->inTransaction()) $this->db->rollBack();
            throw new Failure('Nem érhető el.', 503);
        } catch (\Throwable $error) {
            if ($this->db->inTransaction()) $this->db->rollBack();
            throw $error;
        }
    }

    /** The entries after a patch: a written entry moves to the end, and the oldest go while the document is over a limit. */
    private static function merged(array $entries, string $path, array $set, array $remove, bool $fill): array
    {
        $name = static fn(string $key): string => $key[0] === '@' ? $key : $path."\t".$key;
        $filled = [];
        foreach ($set as $key => $value) {
            $stored = $name((string) $key);
            if ($fill) {
                if (!array_key_exists($stored, $entries)) $filled[$stored] = $value;
                continue;
            }
            unset($entries[$stored]);
            $entries[$stored] = $value;
        }
        foreach ($remove as $key) unset($entries[$name($key)]);
        $entries = $filled + $entries;
        $count = count($entries);
        $bytes = strlen(self::encode($entries));
        foreach ($entries as $stored => $value) {
            if ($count <= self::ENTRIES && $bytes <= self::DOCUMENT_BYTES) break;
            // Without the separator, so the running size never falls below the real one.
            $bytes -= strlen(json_encode((string) $stored, self::JSON)) + 1 + strlen(json_encode($value, self::JSON));
            unset($entries[$stored]);
            $count--;
        }
        return $entries;
    }

    /** @return array{0: array<string, mixed>, 1: list<string>, 2: int, 3: bool, 4: bool} */
    private static function validated(mixed $patch): array
    {
        if (!$patch instanceof \stdClass) throw new Failure('Hibás műveletkérés.');
        $fields = get_object_vars($patch);
        if (array_diff(array_map('strval', array_keys($fields)), ['generation', 'set', 'remove', 'fill', 'reset'])) throw new Failure('Hibás műveletkérés.');
        if (array_key_exists('reset', $fields)) {
            if ($fields['reset'] !== true || count($fields) !== 1) throw new Failure('Hibás műveletkérés.');
            return [[], [], 0, false, true];
        }
        $generation = $fields['generation'] ?? null;
        if (!is_int($generation) || $generation < 0) throw new Failure('Hibás műveletkérés.');
        $fill = array_key_exists('fill', $fields);
        if ($fill && ($fields['fill'] !== true || array_key_exists('remove', $fields))) throw new Failure('Hibás műveletkérés.');
        $values = $fields['set'] ?? new \stdClass();
        $remove = $fields['remove'] ?? [];
        if (!$values instanceof \stdClass || !is_array($remove) || !array_is_list($remove)) throw new Failure('Hibás műveletkérés.');
        $set = get_object_vars($values);
        if ((!$set && !$remove) || count($set) + count($remove) > self::ENTRIES) throw new Failure('Hibás műveletkérés.');
        foreach ($remove as $key) if (!is_string($key) || !preg_match(self::KEY, $key)) throw new Failure('Hibás műveletkérés.');
        foreach ($set as $key => $value) {
            $key = (string) $key;
            if ($value === null || !preg_match(self::KEY, $key)) throw new Failure('Hibás műveletkérés.');
            if ($key[0] === '@' && (!is_string($value) || !preg_match('/^[a-z][a-z0-9-]{0,39}$/D', $value))) throw new Failure('Hibás műveletkérés.');
            // A number outside the float range (1e999) decodes to INF, which has no JSON form.
            try {
                $bytes = strlen(json_encode($value, self::JSON));
            } catch (\JsonException) {
                throw new Failure('Érvénytelen JSON.');
            }
            if ($bytes > self::ENTRY_BYTES) throw new Failure('Túl nagy kérés.', 413);
        }
        return [$set, $remove, $generation, $fill, false];
    }

    private static function encode(array $entries): string
    {
        return json_encode(['v' => 1, 'entries' => (object) $entries], self::JSON);
    }

    /** The stored document, a blank one for an empty row, or null for a document this release cannot read. */
    private static function decode(mixed $stored): ?\stdClass
    {
        if ($stored === false || $stored === null || $stored === '' || $stored === '{}') return (object) ['v' => 1, 'entries' => new \stdClass()];
        $document = is_string($stored) ? json_decode($stored) : null;
        return $document instanceof \stdClass && ($document->v ?? null) === 1 && ($document->entries ?? null) instanceof \stdClass ? $document : null;
    }
}
