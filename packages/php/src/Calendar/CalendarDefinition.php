<?php
declare(strict_types=1);
namespace Blade\Calendar;

use Blade\Feature\{Field, Workspace};

/**
 * Event calendar over the framework table `blade_calendar_events`. The consumer declares the
 * space, extra event fields, offered Scheduler views and an optional day action; every read and
 * write is a registered action running through the common executor.
 */
final readonly class CalendarDefinition
{
    public const VIEWS = ['day', 'week', 'month'];
    /** Field names the event model owns; extra fields must not reuse them. */
    public const RESERVED = ['id', 'text', 'start_date', 'end_date', 'rrule', 'duration', 'recurring_event_id', 'original_start', 'deleted', 'revision', 'from', 'to', 'date'];

    /**
     * @param list<Field> $fields extra event fields (text, textarea, select, number, checkbox), stored per event
     * @param list<string> $views offered Scheduler views, a subset of VIEWS
     * @param array{resource:string,action:string,label:string}|null $dayAction registered action
     *        called with `date` (YYYY-MM-DD) for the selected day; its result is shown read-only
     */
    public function __construct(
        public string $resource,
        public string $title,
        public string $space,
        public array $fields = [],
        public array $views = self::VIEWS,
        public string $defaultView = 'week',
        public int $firstHour = 0,
        public int $lastHour = 24,
        public int $maxRangeDays = 62,
        public ?array $dayAction = null,
        public ?string $group = null,
        public ?string $icon = 'dxi dxi-calendar-today',
        public bool $desktopOnly = false,
    ) {
        if (!preg_match('/^[a-z][a-z0-9_.-]*$/D', $resource) || $title === '' || !preg_match('/^[a-z][a-z0-9_-]{0,63}$/D', $space)) throw new \InvalidArgumentException('Invalid calendar definition.');
        if (!$views || array_diff($views, self::VIEWS) || count(array_unique($views)) !== count($views) || !in_array($defaultView, $views, true)) throw new \InvalidArgumentException('Invalid calendar views.');
        if ($firstHour < 0 || $lastHour > 24 || $firstHour >= $lastHour || $maxRangeDays < 1 || $maxRangeDays > 366) throw new \InvalidArgumentException('Invalid calendar limit.');
        foreach ($fields as $field) if (!$field instanceof Field || in_array($field->name, self::RESERVED, true) || $field->secret || !in_array($field->type, ['text', 'textarea', 'select', 'number', 'checkbox'], true)) throw new \InvalidArgumentException('Invalid calendar field.');
        if ($dayAction !== null && (array_keys($dayAction) !== ['resource', 'action', 'label'] || array_filter($dayAction, static fn($value) => !is_string($value) || $value === ''))) throw new \InvalidArgumentException('Invalid calendar day action.');
    }

    /** Explicit setup step; HTTP requests never create tables. */
    public static function install(\PDO $db): void
    {
        $mysql = $db->getAttribute(\PDO::ATTR_DRIVER_NAME) === 'mysql';
        $db->exec('CREATE TABLE IF NOT EXISTS blade_calendar_events (id '.($mysql ? 'BIGINT PRIMARY KEY AUTO_INCREMENT' : 'INTEGER PRIMARY KEY AUTOINCREMENT')
            .", space VARCHAR(64) NOT NULL, text VARCHAR(255) NOT NULL, start_at VARCHAR(19) NOT NULL, end_at VARCHAR(19) NOT NULL, rrule VARCHAR(500) NOT NULL DEFAULT '', duration BIGINT NOT NULL DEFAULT 0, recurring_event_id BIGINT NULL, original_start VARCHAR(19) NULL, deleted INTEGER NOT NULL DEFAULT 0, data TEXT NOT NULL, revision BIGINT NOT NULL DEFAULT 1)".($mysql ? ' ENGINE=InnoDB' : ''));
        if ($mysql) {
            $q = $db->query("SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='blade_calendar_events' AND INDEX_NAME='blade_calendar_window'");
            if (!$q->fetchColumn()) $db->exec('CREATE INDEX blade_calendar_window ON blade_calendar_events (space, start_at, end_at)');
        } else $db->exec('CREATE INDEX IF NOT EXISTS blade_calendar_window ON blade_calendar_events (space, start_at, end_at)');
    }

    public function register(Workspace $workspace): void
    {
        (new CalendarActions($this))->register($workspace->registry);
    }

    /** Concrete occurrences overlapping [$from, $to) for server-side consumers; no ACL is applied here. */
    public function occurrences(\PDO $db, \DateTimeImmutable $from, \DateTimeImmutable $to): array
    {
        return (new CalendarActions($this))->expand($db, $from, $to);
    }

    /** Browser configuration only: no SQL or rules. Field metadata is added per actor; `space` (the ACL object) is removed before it is sent. */
    public function metadata(): array
    {
        return ['space' => $this->space, 'views' => $this->views, 'default_view' => $this->defaultView, 'first_hour' => $this->firstHour, 'last_hour' => $this->lastHour,
            'max_range_days' => $this->maxRangeDays, 'day_action' => $this->dayAction];
    }
}
