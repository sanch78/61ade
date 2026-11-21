<?php
declare(strict_types=1);
namespace Blade\Jobs;

/**
 * The running job, handed to a JobQueue job body as its fourth argument (`fn(Context $ctx, array $target, array $values,
 * Job $job)`). Each report is written at once on the body's connection (inside a transaction of the body only when that
 * commits) and counts as a heartbeat, so the job window shows it on its next poll. Report or beat() at least every
 * JobQueue::stale() seconds: a silent job is taken over by another runner, after which this one's reports are ignored and
 * cancelled() answers true. The body checks cancelled() between its steps and returns early when it is true.
 * checkpoint() keeps the body's own resume data: a job whose runner died is run again (at most three attempts) and
 * gets the last checkpoint back.
 */
final class Job
{
    /** @internal JobQueue creates it. */
    public function __construct(private JobQueue $queue, public readonly string $id, private int $attempt, private ?array $checkpoint = null) {}

    /** The current stage, plain text (at most 200 characters). */
    public function stage(string $text): void { $this->queue->report($this->id, $this->attempt, ['stage' => self::plain($text, 200)]); }
    /** Percent 0–100, or null for an indeterminate bar. */
    public function progress(?float $percent): void
    {
        if ($percent !== null && (!is_finite($percent) || $percent < 0 || $percent > 100)) throw new \InvalidArgumentException('Job progress is a percent from 0 to 100 or null.');
        $this->queue->report($this->id, $this->attempt, ['percent' => $percent === null ? null : round($percent, 1)]);
    }
    /** Step $index of $count (1-based). */
    public function step(int $index, int $count): void
    {
        if ($count < 1 || $count > 1000 || $index < 1 || $index > $count) throw new \InvalidArgumentException('A job step is 1 to its count (at most 1000).');
        $this->queue->report($this->id, $this->attempt, ['step' => $index, 'steps' => $count]);
    }
    /** Appends a log line (plain text, at most 500 characters): level `info`, `warning` or `error`. */
    public function log(string $text, string $level = 'info'): void
    {
        if (!in_array($level, ['info', 'warning', 'error'], true)) throw new \InvalidArgumentException('A job log level is info, warning or error.');
        $this->queue->append($this->id, $this->attempt, $level, self::plain($text, 500));
    }
    /** Whether the actor asked to stop the job, or this runner lost it to another one (also a heartbeat). */
    public function cancelled(): bool { return $this->queue->cancelRequested($this->id, $this->attempt); }
    /** A heartbeat without other news (a long step that reports nothing else). */
    public function beat(): void { $this->queue->report($this->id, $this->attempt, []); }
    /** With $data: stores it as the resume point (JSON, at most 64 KiB). Without: the stored one, or null. */
    public function checkpoint(?array $data = null): ?array
    {
        if (func_num_args() === 0) return $this->checkpoint;
        $json = json_encode($data, JSON_THROW_ON_ERROR);
        if (strlen($json) > 65536) throw new \InvalidArgumentException('A job checkpoint is at most 64 KiB of JSON.');
        $this->queue->report($this->id, $this->attempt, ['checkpoint' => $json]);
        return $this->checkpoint = $data;
    }
    private static function plain(string $text, int $max): string
    {
        $text = trim(preg_replace('/[\x00-\x1f\x7f]+/u', ' ', $text) ?? '');
        return mb_substr($text, 0, $max);
    }
}
