<?php
declare(strict_types=1);
namespace Blade\Jobs;

use Blade\Feature\{Action, Context, Failure, Registry};

/**
 * The job reads of the UI and API channels (`__job`, docs/workspaces.md#jobs): `status`, `find` (a lost start's token),
 * `running` (the actor's jobs, for reattaching after a reload) and `cancel`. Each is checked like an action: the job
 * action must be offered on the channel, and a status or cancel needs the actor's permission for that action on the
 * job's target (object ACL, as at its start); the source then shows only the jobs it allows the actor to see.
 */
final class Jobs
{
    public const STATES = ['queued', 'running', 'done', 'failed', 'cancelled'];

    public function __construct(private Registry $registry, private JobQueue $queue) {}

    /** The job action $resource.$name and its source; 404 for anything else. */
    private function action(string $resource, mixed $name): array
    {
        if (!is_string($name)) throw new Failure('Hibás feladatkérés.');
        $action = $this->registry->get($resource, $name);
        if ($action->job === false) throw new Failure('Nem található feladat.', 404);
        return [$action, $action->job === true ? $this->queue : $action->job];
    }
    private static function offered(Context $ctx, Action $action): bool
    {
        if (!in_array($ctx->channel, $action->channels, true) || ($ctx->channel === 'api' && !in_array($action->resource.'.'.$action->name, $ctx->scopes, true))) return false;
        return (bool) array_filter($ctx->acl->rules($ctx->actor->id, $action->resource, $action->name, $ctx->channel), static fn($r) => $r['effect'] === 'allow' && $r['field_name'] === '');
    }
    /** The checked status of job $id of $action for the actor, or a 404 (unknown, foreign, or no permission). */
    private function status(Context $ctx, Action $action, JobSource $source, mixed $id, int $after): array
    {
        if (!is_string($id) || !preg_match('/^[A-Za-z0-9_.:-]{1,100}$/D', $id)) throw new Failure('Hibás feladatkérés.');
        $missing = new Failure('Nem található feladat.', 404);
        if (!self::offered($ctx, $action)) throw $missing;
        $status = $source->status($ctx, $id, $after) ?? throw $missing;
        if (($status['resource'] ?? null) !== $action->resource || ($status['action'] ?? null) !== $action->name || ($status['id'] ?? null) !== $id) throw $missing;
        // The object the start was checked on: JobQueue keeps it; a JobSource names it (`target`, `owner`) or checks itself.
        [$object, $owner] = $source instanceof JobQueue ? $this->queue->acl($id) : [isset($status['target']) ? (string) $status['target'] : null, isset($status['owner']) ? (string) $status['owner'] : null];
        if (($source instanceof JobQueue || isset($status['target'])) && !$ctx->acl->allows($ctx->actor->id, $action->resource, $action->name, $ctx->channel, $object, $owner)) throw $missing;
        return self::check($status, $action);
    }
    /** `__job` with `values` `{operation, action?, id?, token?, after?}` on $resource. */
    public function handle(Context $ctx, string $resource, array $values): array
    {
        $operation = $values['operation'] ?? null;
        $allowed = ['status' => ['operation', 'action', 'id', 'after'], 'cancel' => ['operation', 'action', 'id'], 'find' => ['operation', 'action', 'token'], 'running' => ['operation']];
        if (!is_string($operation) || !isset($allowed[$operation]) || array_diff(array_keys($values), $allowed[$operation])) throw new Failure('Hibás feladatkérés.');
        if ($operation === 'running') {
            $out = [];$sources = [];
            foreach ($this->registry->all() as $action) if ($action->job !== false && self::offered($ctx, $action)) {
                $source = $action->job === true ? $this->queue : $action->job;
                $sources[spl_object_id($source)] = $source;
            }
            foreach ($sources as $source) foreach ($source->running($ctx) as $entry) {
                try { [$action, $own] = $this->action((string) ($entry['resource'] ?? ''), $entry['action'] ?? null); } catch (Failure) { continue; }
                if ($own !== $source || !self::offered($ctx, $action) || !is_string($entry['id'] ?? null)) continue;
                $out[] = ['id' => $entry['id'], 'resource' => $action->resource, 'action' => $action->name];
            }
            return ['jobs' => array_slice($out, 0, 20)];
        }
        [$action, $source] = $this->action($resource, $values['action'] ?? null);
        if ($operation === 'find') {
            $token = $values['token'] ?? null;
            if (!is_string($token) || !preg_match('/^[A-Za-z0-9_-]{16,64}$/D', $token)) throw new Failure('Hibás feladatkérés.');
            $id = self::offered($ctx, $action) ? $source->find($ctx, $token) : null;
            return ['job' => $id === null ? null : ['id' => $id, 'resource' => $action->resource, 'action' => $action->name]];
        }
        $after = $values['after'] ?? 0;
        if (!is_int($after) || $after < 0) throw new Failure('Hibás feladatkérés.');
        $status = $this->status($ctx, $action, $source, $values['id'] ?? null, $after);
        if ($operation === 'status') return $status;
        return ['cancelled' => $status['cancel'] && $source->cancel($ctx, $status['id'])];
    }
    /** A source's status as the browser gets it (a developer error when it breaks the JobSource contract). */
    public static function check(array $status, Action $action): array
    {
        $bad = static fn(string $why) => new \LogicException("The job status of {$action->resource}.{$action->name}: $why.");
        if (!in_array($status['state'] ?? null, self::STATES, true)) throw $bad('state is one of '.implode(', ', self::STATES));
        $percent = $status['percent'] ?? null;
        if ($percent !== null && (!is_int($percent) && !is_float($percent) || $percent < 0 || $percent > 100)) throw $bad('percent is 0 to 100 or null');
        $step = $status['step'] ?? null;
        if ($step !== null && (!is_int($step['index'] ?? null) || !is_int($step['count'] ?? null) || $step['index'] < 1 || $step['index'] > $step['count'])) throw $bad('step is {index, count}');
        $log = $status['log'] ?? [];
        if (!is_array($log) || !array_is_list($log) || !is_int($status['logNext'] ?? null)) throw $bad('log is a list and logNext its next index');
        foreach ($log as $line) if (!is_string($line['text'] ?? null) || !in_array($line['level'] ?? null, ['info', 'warning', 'error'], true) || !is_string($line['at'] ?? null)) throw $bad('a log line is {at, level, text}');
        foreach (['title', 'stage', 'error', 'created', 'started', 'heartbeat', 'finished'] as $key) if (isset($status[$key]) && !is_string($status[$key])) throw $bad("$key is text");
        if (isset($status['result']) && !is_array($status['result'])) throw $bad('result is an object');
        return [...array_intersect_key($status, array_flip(['id', 'resource', 'action', 'title', 'state', 'stage', 'percent', 'step', 'log', 'logNext', 'created', 'started', 'heartbeat', 'finished', 'result', 'error'])),
            'cancel' => ($status['cancel'] ?? false) === true && in_array($status['state'], ['queued', 'running'], true), 'heartbeatAfter' => $action->heartbeat];
    }
}
