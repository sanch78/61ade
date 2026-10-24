<?php
declare(strict_types=1);
namespace Blade\Tasks;

use Blade\Infrastructure\Transaction;

/**
 * Minimal post-response task queue (`blade_tasks`), a narrow precursor of the M6 job capability: no
 * cron or host timer. Tasks run after the HTTP response (`afterResponse`) or from setup/CLI (`run`);
 * reads that find missing results enqueue again (`later`). Handlers run outside any transaction and
 * must be idempotent: a task may run again after a crash or a failed attempt. One runner at a time per
 * database (`blade_task_lease`, a DB lease because web server and CLI run as different OS users), so
 * post-response work never multiplies on a shared host.
 */
final class TaskQueue
{
    public const ATTEMPTS = 3;
    private const BACKOFF = 30;
    private const STALE = 600;
    private const KEEP_DONE = 86400;
    /** Lease time beyond the run budget: one task may outlast the budget by its own tool timeout. */
    private const LEASE_MARGIN = 120;
    /** @var array<string,array<string,\Closure>> kind => owner => handler(array $payload): void */
    private array $handlers = [];
    /** @var array<string,array{string,array,string}> */
    private array $later = [];
    private int $sequence = 0;

    public function __construct(private \PDO $db) {}

    /** Explicit installer; HTTP requests never create tables. */
    public static function install(\PDO $db): void
    {
        $mysql = $db->getAttribute(\PDO::ATTR_DRIVER_NAME) === 'mysql';
        $db->exec('CREATE TABLE IF NOT EXISTS blade_tasks (id '.($mysql ? 'BIGINT PRIMARY KEY AUTO_INCREMENT' : 'INTEGER PRIMARY KEY AUTOINCREMENT')
            .", kind VARCHAR(64) NOT NULL, dedupe VARCHAR(191) NOT NULL DEFAULT '', payload TEXT NOT NULL, state VARCHAR(10) NOT NULL DEFAULT 'pending', attempts INT NOT NULL DEFAULT 0, available_at VARCHAR(30) NOT NULL, locked_at VARCHAR(30) NULL, error VARCHAR(255) NOT NULL DEFAULT '', created_at VARCHAR(30) NOT NULL, updated_at VARCHAR(30) NOT NULL)".($mysql ? ' ENGINE=InnoDB' : ''));
        foreach (['blade_tasks_due' => 'state, available_at', 'blade_tasks_dedupe' => 'dedupe, state'] as $name => $columns) {
            if ($mysql) {
                $q = $db->prepare("SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='blade_tasks' AND INDEX_NAME=?");
                $q->execute([$name]);
                if (!$q->fetchColumn()) $db->exec("CREATE INDEX $name ON blade_tasks ($columns)");
            } else $db->exec("CREATE INDEX IF NOT EXISTS $name ON blade_tasks ($columns)");
        }
        $db->exec("CREATE TABLE IF NOT EXISTS blade_task_lease (name VARCHAR(32) NOT NULL PRIMARY KEY, holder VARCHAR(64) NOT NULL DEFAULT '', expires_at VARCHAR(30) NOT NULL)".($mysql ? ' ENGINE=InnoDB' : ''));
        if (!$db->query("SELECT COUNT(*) FROM blade_task_lease WHERE name='runner'")->fetchColumn()) $db->exec("INSERT INTO blade_task_lease (name,holder,expires_at) VALUES ('runner','','')");
    }

    private static function now(int $offset = 0): string { return gmdate('Y-m-d\TH:i:s\Z', time() + $offset); }

    /** Several owners (e.g. one per file space) may handle one kind; each ignores payloads it does not own. */
    public function handle(string $kind, \Closure $handler, string $owner = ''): void
    {
        if (!preg_match('/^[a-z][a-z0-9_.-]{0,63}$/D', $kind)) throw new \InvalidArgumentException('Invalid task kind.');
        $this->handlers[$kind][$owner] = $handler;
    }

    /**
     * Inserts within the caller's transaction; skipped while a *pending* task has the same dedupe key.
     * A running one does not count: it may have read its input before the caller's change.
     */
    public function enqueue(string $kind, array $payload, string $dedupe = ''): void
    {
        if (!preg_match('/^[a-z][a-z0-9_.-]{0,63}$/D', $kind) || strlen($dedupe) > 191) throw new \InvalidArgumentException('Invalid task.');
        if ($dedupe !== '') {
            $q = $this->db->prepare("SELECT COUNT(*) FROM blade_tasks WHERE dedupe=? AND state='pending'");
            $q->execute([$dedupe]);
            if ($q->fetchColumn()) return;
        }
        $now = self::now();
        $this->db->prepare("INSERT INTO blade_tasks (kind,dedupe,payload,state,attempts,available_at,error,created_at,updated_at) VALUES (?,?,?,'pending',0,?,'',?,?)")
            ->execute([$kind, $dedupe, json_encode($payload, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES), $now, $now, $now]);
    }

    /** Kept in memory and inserted after the response in its own transaction, so it survives a rolled-back action. */
    public function later(string $kind, array $payload, string $dedupe = ''): void
    {
        if (!preg_match('/^[a-z][a-z0-9_.-]{0,63}$/D', $kind) || strlen($dedupe) > 191) throw new \InvalidArgumentException('Invalid task.');
        $this->later[$dedupe !== '' ? $dedupe : '#'.++$this->sequence] = [$kind, $payload, $dedupe];
    }

    /** Latest state per dedupe key ('pending', 'running', 'done', 'failed'); missing keys have no task. */
    public function states(array $dedupes): array
    {
        $out = [];
        foreach (array_chunk(array_values(array_unique(array_filter($dedupes, static fn($key) => $key !== ''))), 500) as $chunk) {
            $q = $this->db->prepare('SELECT dedupe,state FROM blade_tasks WHERE dedupe IN ('.implode(',', array_fill(0, count($chunk), '?')).') ORDER BY id');
            $q->execute($chunk);
            foreach ($q->fetchAll(\PDO::FETCH_NUM) as [$key, $state]) $out[$key] = $state;
        }
        return $out;
    }

    /** Inserts the `later` items; each in a short transaction of its own. */
    public function flush(): void
    {
        while ($this->later) {
            [$kind, $payload, $dedupe] = array_shift($this->later);
            Transaction::begin($this->db);
            try {
                $this->enqueue($kind, $payload, $dedupe);
                $this->db->commit();
            } catch (\Throwable $error) {
                if ($this->db->inTransaction()) $this->db->rollBack();
                throw $error;
            }
        }
    }

    /**
     * Runs due tasks of the registered kinds, one claim at a time, until $limit tasks ran or the
     * $seconds budget is used (checked before each task). Returns 0 at once while another runner holds
     * the lease. Attempts count at claim time, so a task that kills its worker still ends as `failed`.
     */
    public function run(int $limit = 4, float $seconds = 10.0): int
    {
        if ($this->db->inTransaction()) throw new \LogicException('Run tasks outside a transaction.');
        $this->flush();
        if (!$this->handlers) return 0;
        $holder = $this->lease((int) ceil($seconds) + self::LEASE_MARGIN);
        if ($holder === null) return 0;
        try {
            return $this->work($limit, $seconds);
        } finally {
            $this->db->prepare("UPDATE blade_task_lease SET holder='', expires_at='' WHERE name='runner' AND holder=?")->execute([$holder]);
        }
    }

    /** Conditional takeover of the single runner lease (free or expired); null while another runner holds it. */
    private function lease(int $seconds): ?string
    {
        $holder = bin2hex(random_bytes(16));
        Transaction::begin($this->db);
        try {
            $q = $this->db->prepare("UPDATE blade_task_lease SET holder=?, expires_at=? WHERE name='runner' AND (holder='' OR expires_at<?)");
            $q->execute([$holder, self::now($seconds), self::now()]);
            $taken = $q->rowCount() === 1;
            $this->db->commit();
            return $taken ? $holder : null;
        } catch (\Throwable $error) {
            if ($this->db->inTransaction()) $this->db->rollBack();
            throw $error;
        }
    }

    private function work(int $limit, float $seconds): int
    {
        $kinds = array_keys($this->handlers);
        $in = implode(',', array_fill(0, count($kinds), '?'));
        $this->db->prepare("UPDATE blade_tasks SET state=CASE WHEN attempts>=? THEN 'failed' ELSE 'pending' END, locked_at=NULL, error=CASE WHEN attempts>=? THEN 'Interrupted.' ELSE error END, updated_at=? WHERE state='running' AND locked_at<? AND kind IN ($in)")
            ->execute([self::ATTEMPTS, self::ATTEMPTS, self::now(), self::now(-self::STALE), ...$kinds]);
        $started = microtime(true);
        $done = 0;
        while ($done < $limit && microtime(true) - $started < $seconds) {
            $task = $this->claim($kinds, $in);
            if (!$task) break;
            $done++;
            try {
                $payload = json_decode($task['payload'], true, flags: JSON_THROW_ON_ERROR);
                foreach ($this->handlers[$task['kind']] as $handler) $handler(is_array($payload) ? $payload : []);
                $this->finish((int) $task['id'], 'done', '', 0);
            } catch (\Throwable $error) {
                if ($this->db->inTransaction()) $this->db->rollBack();
                $attempts = (int) $task['attempts'] + 1;
                $this->finish((int) $task['id'], $attempts >= self::ATTEMPTS ? 'failed' : 'pending', substr(get_class($error), 0, 255), self::BACKOFF * $attempts);
            }
            $this->flush();
        }
        $this->db->prepare("DELETE FROM blade_tasks WHERE state='done' AND updated_at<?")->execute([self::now(-self::KEEP_DONE)]);
        return $done;
    }

    private function claim(array $kinds, string $in): ?array
    {
        Transaction::begin($this->db);
        try {
            $q = $this->db->prepare("SELECT id,kind,payload,attempts FROM blade_tasks WHERE state='pending' AND available_at<=? AND kind IN ($in) ORDER BY available_at,id LIMIT 1");
            $q->execute([self::now(), ...$kinds]);
            $task = $q->fetch(\PDO::FETCH_ASSOC) ?: null;
            if ($task) {
                $q = $this->db->prepare("UPDATE blade_tasks SET state='running', attempts=attempts+1, locked_at=?, updated_at=? WHERE id=? AND state='pending'");
                $q->execute([self::now(), self::now(), $task['id']]);
                if ($q->rowCount() !== 1) $task = null;
            }
            $this->db->commit();
            return $task;
        } catch (\Throwable $error) {
            if ($this->db->inTransaction()) $this->db->rollBack();
            throw $error;
        }
    }

    private function finish(int $id, string $state, string $error, int $delay): void
    {
        $this->db->prepare('UPDATE blade_tasks SET state=?, error=?, locked_at=NULL, available_at=?, updated_at=? WHERE id=?')
            ->execute([$state, $error, self::now($delay), self::now(), $id]);
    }

    /** Shutdown hook of HTTP requests: never emits output; a no-op without handlers or due work. */
    public function afterResponse(): void
    {
        try {
            if (!$this->handlers || $this->db->inTransaction()) return;
            if (!$this->later) {
                $kinds = array_keys($this->handlers);
                $q = $this->db->prepare("SELECT 1 FROM blade_tasks WHERE ((state='pending' AND available_at<=?) OR (state='running' AND locked_at<?)) AND kind IN (".implode(',', array_fill(0, count($kinds), '?')).') LIMIT 1');
                $q->execute([self::now(), self::now(-self::STALE), ...$kinds]);
                if (!$q->fetchColumn()) return;
            }
            if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
            if (function_exists('fastcgi_finish_request')) fastcgi_finish_request();
            ignore_user_abort(true);
            $this->run();
        } catch (\Throwable $error) {
            error_log('61de tasks: '.get_class($error));
        }
    }
}
