<?php
declare(strict_types=1);
namespace Blade\Jobs;

use Blade\Feature\{Action, Context};

/**
 * A long-running job engine behind job actions (`Action::$job`, docs/workspaces.md#jobs). 61ade's own JobQueue is the
 * default; a consumer with its own engine (its tables, runner and step model) implements this interface and passes it
 * as the action's `job`. 61ade checks the action like any other before start(). Before status() and cancel() answer, the
 * action must be offered to the actor on the channel; a status that names its ACL object (`target`, with `owner`) is also
 * checked on it (object ACL, deny included). A source without `target` decides alone which of its jobs an actor may see:
 * an actor's own ones, as JobQueue does, or more.
 *
 * A status is `{id, resource, action, state, title?, stage?, percent?, step?, log, logNext, created?, started?,
 * heartbeat?, finished?, result?, error?, cancel}` (Jobs::status() checks it): state `queued`, `running`, `done`,
 * `failed` or `cancelled`; `percent` 0–100 or null; `step` `{index, count}` (1-based); `log` the lines after the
 * requested index, each `{at, level, text}` (level `info`, `warning` or `error`), `logNext` the index after them;
 * times in ISO 8601 UTC; `result` the body's answer (an action result such as `reveal`); `error` a plain message; `cancel`
 * whether cancel() can still stop it.
 */
interface JobSource
{
    /** Starts $action's job for $target with the validated $values; the same actor and $token answer the same id. */
    public function start(Context $ctx, Action $action, array $target, array $values, string $token): string;
    /** The job $id as $ctx's actor may see it, its log from line $after; null when there is none for this actor. */
    public function status(Context $ctx, string $id, int $after = 0): ?array;
    /** The id of the actor's job started with $token (a start whose answer was lost), or null. */
    public function find(Context $ctx, string $token): ?string;
    /** The actor's queued and running jobs: `[{id, resource, action}, …]`, newest first, at most 20. */
    public function running(Context $ctx): array;
    /** Asks the job to stop; false when it cannot (finished, unknown, or the source cannot cancel). */
    public function cancel(Context $ctx, string $id): bool;
}
