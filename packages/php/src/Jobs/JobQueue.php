<?php
declare(strict_types=1);
namespace Blade\Jobs;

use Blade\Feature\{Action, Context, Failure, Workspace};
use Blade\Shell\IdentityProvider;

/**
 * 61ade's own job engine (`blade_jobs`, docs/workspaces.md#jobs): the JobSource of an action declared `job: true`. A
 * start stores the job in the action's transaction (atomic with its audit). The body, the action's handler `fn(Context,
 * array $target, array $values, Job $job)`, then runs after the response of the request that started it (session
 * closed, the request finished, its own time limit), or from the CLI (run(), for a consumer's tick task); a status poll
 * also runs its job when nobody runs it. Before the body runs, the actor's context (tenant membership) and the action's
 * ACL on the target are checked again. Each runner claims one job at a time; a job whose heartbeat stopped for
 * `stale()` seconds is claimed again, from its checkpoint, at most three attempts. Rows are kept for 7 days after they
 * finish. An actor sees only their own jobs.
 */
final class JobQueue implements JobSource
{
    /** Log lines kept per job; older ones are dropped (the line index keeps counting). */
    public const LOG_LINES = 500;
    public const ATTEMPTS = 3;
    /** Default time limit of one run, in seconds. */
    public const SECONDS = 600;
    /** Jobs this request started or polled (run by afterResponse). */
    private array $due = [];

    public function __construct(private \PDO $db) {}

    /** Explicit installer (idempotent); HTTP requests never create tables. */
    public static function install(\PDO $db): void
    {
        $mysql = $db->getAttribute(\PDO::ATTR_DRIVER_NAME) === 'mysql';
        // Logs, results and checkpoints exceed 64 KiB: MEDIUMTEXT on MySQL (SQLite TEXT has no such limit).
        $text = $mysql ? 'MEDIUMTEXT' : 'TEXT';
        $db->exec("CREATE TABLE IF NOT EXISTS blade_jobs (id VARCHAR(32) NOT NULL PRIMARY KEY, resource VARCHAR(100) NOT NULL, action VARCHAR(100) NOT NULL, actor_id VARCHAR(64) NOT NULL, tenant VARCHAR(100) NULL, channel VARCHAR(10) NOT NULL, scopes $text NOT NULL, token VARCHAR(64) NOT NULL, target_id VARCHAR(100) NULL, acl_id VARCHAR(100) NULL, target_owner VARCHAR(64) NULL, payload $text NOT NULL, state VARCHAR(10) NOT NULL, stage VARCHAR(200) NOT NULL DEFAULT '', percent DOUBLE NULL, step INT NULL, steps INT NULL, log $text NOT NULL, log_offset INT NOT NULL DEFAULT 0, result $text NULL, error VARCHAR(500) NULL, cancel_requested INT NOT NULL DEFAULT 0, checkpoint $text NULL, attempts INT NOT NULL DEFAULT 0, created_at VARCHAR(30) NOT NULL, started_at VARCHAR(30) NULL, heartbeat_at VARCHAR(30) NULL, finished_at VARCHAR(30) NULL)".($mysql ? ' ENGINE=InnoDB' : ''));
        foreach (['blade_jobs_token' => ['UNIQUE ', 'actor_id, token'], 'blade_jobs_state' => ['', 'state, heartbeat_at'], 'blade_jobs_actor' => ['', 'actor_id, state']] as $name => [$unique, $columns]) {
            if ($mysql) {
                $q = $db->prepare("SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='blade_jobs' AND INDEX_NAME=?");
                $q->execute([$name]);
                if (!$q->fetchColumn()) $db->exec("CREATE {$unique}INDEX $name ON blade_jobs ($columns)");
            } else $db->exec("CREATE {$unique}INDEX IF NOT EXISTS $name ON blade_jobs ($columns)");
        }
    }
    private static function now(int $offset = 0): string { return gmdate('Y-m-d\TH:i:s\Z', time() + $offset); }

    public function start(Context $ctx, Action $action, array $target, array $values, string $token): string
    {
        $targetId = isset($target['id']) ? (string) $target['id'] : null;
        // The same token answers the same job only for the same action, target and tenant.
        $existing = function () use ($ctx, $action, $token, $targetId): ?string {
            $q = $this->db->prepare('SELECT id, resource, action, target_id, tenant FROM blade_jobs WHERE actor_id=? AND token=?');
            $q->execute([$ctx->actor->id, $token]);
            if (!$row = $q->fetch(\PDO::FETCH_ASSOC)) return null;
            if ($row['resource'] !== $action->resource || $row['action'] !== $action->name || $row['target_id'] !== $targetId || $row['tenant'] !== $ctx->tenant) throw new Failure('Hibás feladatazonosító.', 409);
            return $row['id'];
        };
        if ($id = $existing()) return $id;
        $id = bin2hex(random_bytes(16));
        try {
            $this->db->prepare("INSERT INTO blade_jobs (id, resource, action, actor_id, tenant, channel, scopes, token, target_id, acl_id, target_owner, payload, state, log, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'queued','[]',?)")
                ->execute([$id, $action->resource, $action->name, $ctx->actor->id, $ctx->tenant, $ctx->channel, json_encode(array_values($ctx->scopes), JSON_THROW_ON_ERROR), $token,
                    $targetId, isset($target['acl_id']) ? (string) $target['acl_id'] : $targetId, isset($target['owner']) ? (string) $target['owner'] : null, json_encode($values, JSON_THROW_ON_ERROR), self::now()]);
        } catch (\PDOException $error) {
            // A simultaneous start with the same token (MySQL): the other one's job.
            if (!str_starts_with((string) $error->getCode(), '23') || !($id = $existing())) throw $error;
            return $id;
        }
        $this->due[$id] = true;
        return $id;
    }
    /** The actor's own job row, or null. */
    private function own(Context $ctx, string $id): ?array
    {
        $q = $this->db->prepare('SELECT * FROM blade_jobs WHERE id=? AND actor_id=?');
        $q->execute([$id, $ctx->actor->id]);
        $row = $q->fetch(\PDO::FETCH_ASSOC);
        return $row && ($row['tenant'] ?? null) === $ctx->tenant ? $row : null;
    }
    public function status(Context $ctx, string $id, int $after = 0): ?array
    {
        $row = $this->own($ctx, $id);
        if (!$row) return null;
        // A queued or stalled job that nobody runs is run after this poll's response.
        if ($this->claimable($row)) $this->due[$id] = true;
        $log = json_decode($row['log'], true) ?: [];
        $offset = (int) $row['log_offset'];
        return array_filter(['id' => $row['id'], 'resource' => $row['resource'], 'action' => $row['action'], 'target' => $row['target_id'], 'state' => $row['state'],
            'stage' => $row['stage'] !== '' ? $row['stage'] : null, 'percent' => $row['percent'] === null ? null : (float) $row['percent'],
            'step' => $row['step'] !== null ? ['index' => (int) $row['step'], 'count' => (int) $row['steps']] : null,
            'log' => array_slice($log, max(0, $after - $offset)), 'logNext' => $offset + count($log),
            'created' => $row['created_at'], 'started' => $row['started_at'], 'heartbeat' => $row['heartbeat_at'], 'finished' => $row['finished_at'],
            'result' => $row['result'] !== null ? json_decode($row['result'], true) : null, 'error' => $row['error'],
            'cancel' => in_array($row['state'], ['queued', 'running'], true) && !$row['cancel_requested']], static fn($value) => $value !== null);
    }
    public function find(Context $ctx, string $token): ?string
    {
        $q = $this->db->prepare('SELECT id FROM blade_jobs WHERE actor_id=? AND token=?');
        $q->execute([$ctx->actor->id, $token]);
        $id = $q->fetchColumn();
        return is_string($id) && $this->own($ctx, $id) ? $id : null;
    }
    public function running(Context $ctx): array
    {
        $q = $this->db->prepare("SELECT id, resource, action, tenant FROM blade_jobs WHERE actor_id=? AND state IN ('queued','running') ORDER BY created_at DESC LIMIT 20");
        $q->execute([$ctx->actor->id]);
        return array_values(array_map(static fn($row) => ['id' => $row['id'], 'resource' => $row['resource'], 'action' => $row['action']],
            array_filter($q->fetchAll(\PDO::FETCH_ASSOC), static fn($row) => $row['tenant'] === $ctx->tenant)));
    }
    public function cancel(Context $ctx, string $id): bool
    {
        $row = $this->own($ctx, $id);
        if (!$row || !in_array($row['state'], ['queued', 'running'], true)) return false;
        // A queued job never starts; a running one is asked and stops at its next cancelled() check.
        $q = $this->db->prepare("UPDATE blade_jobs SET state='cancelled', cancel_requested=1, finished_at=? WHERE id=? AND state='queued'");
        $q->execute([self::now(), $id]);
        if ($q->rowCount() === 0) $this->db->prepare('UPDATE blade_jobs SET cancel_requested=1 WHERE id=? AND state=\'running\'')->execute([$id]);
        return true;
    }

    /** @internal Jobs: the ACL object and owner the start was checked on (`acl_id` or the target, its owner). */
    public function acl(string $id): array
    {
        $q = $this->db->prepare('SELECT acl_id, target_owner FROM blade_jobs WHERE id=?');$q->execute([$id]);
        $row = $q->fetch(\PDO::FETCH_ASSOC) ?: [];
        return [$row['acl_id'] ?? null, $row['target_owner'] ?? null];
    }
    /** @internal Job: a progress report (and heartbeat) of the runner holding claim $attempt; false when it lost the job. */
    public function report(string $id, int $attempt, array $columns): bool
    {
        $columns['heartbeat_at'] = self::now();
        $q = $this->db->prepare('UPDATE blade_jobs SET '.implode(', ', array_map(static fn($name) => "$name=?", array_keys($columns)))." WHERE id=? AND state='running' AND attempts=?");
        $q->execute([...array_values($columns), $id, $attempt]);
        return $q->rowCount() === 1;
    }
    /** @internal Job: one log line; the oldest lines beyond LOG_LINES are dropped. */
    public function append(string $id, int $attempt, string $level, string $text): void
    {
        $q = $this->db->prepare('SELECT log, log_offset FROM blade_jobs WHERE id=?');$q->execute([$id]);
        $row = $q->fetch(\PDO::FETCH_ASSOC);if (!$row) return;
        $log = json_decode($row['log'], true) ?: [];$offset = (int) $row['log_offset'];
        $log[] = ['at' => self::now(), 'level' => $level, 'text' => $text];
        if (($drop = count($log) - self::LOG_LINES) > 0) { $log = array_slice($log, $drop); $offset += $drop; }
        $this->report($id, $attempt, ['log' => json_encode($log, JSON_THROW_ON_ERROR | JSON_INVALID_UTF8_SUBSTITUTE), 'log_offset' => $offset]);
    }
    /** @internal Job: a cancel was requested, or this runner lost the job (another claim took it over). */
    public function cancelRequested(string $id, int $attempt): bool
    {
        if (!$this->report($id, $attempt, [])) return true;
        $q = $this->db->prepare('SELECT cancel_requested FROM blade_jobs WHERE id=?');$q->execute([$id]);
        return (bool) $q->fetchColumn();
    }

    /** Seconds without a heartbeat after which a running job counts as abandoned. */
    public static function stale(Action $action): int { return max(120, $action->heartbeat * 4); }
    private function claimable(array $row): bool
    {
        return $row['state'] === 'queued' || ($row['state'] === 'running' && ($row['heartbeat_at'] ?? '') < self::now(-120));
    }
    /**
     * Shutdown hook of HTTP requests: runs the jobs this request started or polled once the response is out (the
     * session closed, `fastcgi_finish_request`). Never emits output.
     */
    public function afterResponse(Workspace $workspace, IdentityProvider $identities): void
    {
        try {
            // Without fastcgi_finish_request the client would wait for the body: such a host runs jobs from its CLI runner.
            if (!$this->due || $this->db->inTransaction() || !function_exists('fastcgi_finish_request')) return;
            if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
            fastcgi_finish_request();
            ignore_user_abort(true);
            $this->run($workspace, $identities, array_keys($this->due));
        } catch (\Throwable $error) {
            error_log('61ade jobs: '.get_class($error).': '.$error->getMessage());
        }
    }
    /**
     * Runs due jobs (all, or those of $ids) one after the other until none is left or $seconds have passed; for a CLI
     * runner (a consumer's tick task) and afterResponse(). $identities rechecks each actor's account (disabled: the job
     * fails). Returns how many it ran.
     */
    public function run(Workspace $workspace, IdentityProvider $identities, ?array $ids = null, int $seconds = self::SECONDS): int
    {
        $until = time() + $seconds; $ran = 0;
        // Housekeeping: finished rows after 7 days, and queued rows nobody ran for 7 days.
        $this->db->prepare('DELETE FROM blade_jobs WHERE (finished_at IS NOT NULL AND finished_at<?) OR (state=\'queued\' AND created_at<?)')->execute([self::now(-7 * 86400), self::now(-7 * 86400)]);
        while (time() < $until) {
            $q = $this->db->prepare("SELECT * FROM blade_jobs WHERE (state='queued' OR (state='running' AND heartbeat_at<?))".($ids !== null ? ' AND id IN ('.implode(',', array_fill(0, count($ids) ?: 1, '?')).')' : '').' ORDER BY created_at LIMIT 20');
            $q->execute([self::now(-120), ...($ids ?? [])]);
            $claimed = null;
            foreach ($q->fetchAll(\PDO::FETCH_ASSOC) as $row) {
                try { $action = $workspace->registry->get($row['resource'], $row['action']); } catch (Failure) { $action = null; }
                if ($row['state'] === 'running' && $action && $row['heartbeat_at'] >= self::now(-self::stale($action))) continue;
                if ($row['state'] === 'running' && (int) $row['attempts'] >= self::ATTEMPTS) { $this->finish($workspace, $row, (int) $row['attempts'], 'failed', null, 'A feladat megszakadt.'); continue; }
                $claim = $this->db->prepare("UPDATE blade_jobs SET state='running', attempts=attempts+1, started_at=COALESCE(started_at,?), heartbeat_at=? WHERE id=? AND state=? AND COALESCE(heartbeat_at,'')=?");
                $claim->execute([self::now(), self::now(), $row['id'], $row['state'], $row['heartbeat_at'] ?? '']);
                if ($claim->rowCount() === 1) { $claimed = [$row, $action, (int) $row['attempts'] + 1]; break; }
            }
            if (!$claimed) return $ran;
            $this->execute($workspace, $identities, ...$claimed);
            $ran++;
        }
        return $ran;
    }
    private function execute(Workspace $workspace, IdentityProvider $identities, array $row, ?Action $action, int $attempt): void
    {
        try {
            if (!$action || $action->job !== true) throw new Failure('A feladat már nem érhető el.', 404);
            // The account, tenant membership, channel and API scopes of the start, rechecked now.
            $actor = $identities->find($row['actor_id']) ?? throw new Failure('A fiók nem érhető el.', 403);
            $ctx = $workspace->context($actor, $row['channel'], $row['tenant'], json_decode($row['scopes'], true) ?: []);
            // The actor may have lost the right since the start: the action's ACL on its target, again.
            $target = $workspace->executor->authorize($ctx, $action, $row['target_id']);
            $job = new Job($this, $row['id'], $attempt, $row['checkpoint'] !== null ? json_decode($row['checkpoint'], true) : null);
            // A CLI runner has no time limit of its own; a web request gets one per job, where the host allows it.
            if (PHP_SAPI !== 'cli') set_time_limit(self::SECONDS);
            $result = ($action->handler)($ctx, $target, json_decode($row['payload'], true) ?: [], $job);
            if ($this->db->inTransaction()) { $this->db->rollBack(); throw new \LogicException("The job body of {$row['resource']}.{$row['action']} left a transaction open."); }
            if ($result !== null && !is_array($result)) throw new \LogicException("The job body of {$row['resource']}.{$row['action']} answers an array or null.");
            // A body that answered finished its work even if a cancel came late; one that stopped without an answer was cancelled.
            $this->finish($workspace, $row, $attempt, $result === null && $job->cancelled() ? 'cancelled' : 'done', $result, null);
        } catch (Failure $error) {
            $this->finish($workspace, $row, $attempt, 'failed', null, mb_substr($error->getMessage(), 0, 500));
        } catch (\Throwable $error) {
            error_log('61ade job '.$row['resource'].'.'.$row['action'].': '.get_class($error).': '.$error->getMessage());
            $this->finish($workspace, $row, $attempt, 'failed', null, 'A feladat nem sikerült.');
        }
    }
    /** Ends the job of claim $attempt; a runner that lost the job (another claim took it over) changes and journals nothing. */
    private function finish(Workspace $workspace, array $row, int $attempt, string $state, ?array $result, ?string $error): void
    {
        if ($this->db->inTransaction()) $this->db->rollBack();
        $q = $this->db->prepare("UPDATE blade_jobs SET state=?, result=?, error=?, finished_at=?, heartbeat_at=? WHERE id=? AND state='running' AND attempts=?");
        $q->execute([$state, $result === null ? null : json_encode($result, JSON_THROW_ON_ERROR | JSON_INVALID_UTF8_SUBSTITUTE), $error, self::now(), self::now(), $row['id'], $attempt]);
        if ($q->rowCount() === 1) $workspace->journal->record($row['actor_id'], $row['channel'], $row['resource'], 'job_'.$state, $row['id'], $state === 'failed' ? 'error' : 'success', detail: ['action' => $row['action']], tenant: $row['tenant']);
    }
}
