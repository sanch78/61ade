<?php
declare(strict_types=1);
namespace Blade\Calendar;

use Blade\Feature\{Action, Context, Failure, Field, Registry};
use Blade\I18n\Translator;

/**
 * Registered calendar actions. The ACL object of every action is the calendar space, so rules
 * grant a whole calendar; the executor has already checked channel, scope and ACL and opened the
 * transaction. Events use the DHTMLX Scheduler recurring model: a series row carries `rrule`
 * and `duration`, an exception row points to it by `recurring_event_id` + `original_start`
 * and is either a moved occurrence or a `deleted` one. A tenant-scoped calendar keeps each tenant's events apart by
 * `tenant_id` (the Registry's tenant realm); the consumer's overlay adds read-only events to `events`.
 */
final class CalendarActions
{
    private const DATE = '^[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}$';
    private const DAY = '^[0-9]{4}-[0-9]{2}-[0-9]{2}( [0-9]{2}:[0-9]{2})?$';
    private const COLUMNS = 'id,text,start_at,end_at,rrule,duration,recurring_event_id,original_start,deleted,data,revision';
    private const EVENT_LIMIT = 2000;
    private const OCCURRENCE_LIMIT = 5000;

    private ?Registry $registry = null;

    public function __construct(private CalendarDefinition $definition)
    {
    }

    public function register(Registry $registry): void
    {
        $resource = $this->definition->resource;
        $this->registry = $registry;
        if ($this->definition->tenantScoped) $registry->scopeToTenant($resource);
        $date = static fn(string $name, string $label, bool $required, string $pattern = self::DATE) => new Field($name, $label, required: $required, max: 16, validation: ['pattern' => ['expression' => $pattern, 'message' => 'Formátum: ÉÉÉÉ-HH-NN ÓÓ:PP.']]);
        $range = [$date('from', 'Kezdete', true, self::DAY), $date('to', 'Vége', true, self::DAY)];
        $event = [
            new Field('text', 'Megnevezés', required: true, max: 255),
            $date('start_date', 'Kezdete', true), $date('end_date', 'Vége', true),
            new Field('rrule', 'Ismétlődés', max: 500),
            new Field('duration', 'Időtartam (mp)', 'number', max: 10),
            new Field('recurring_event_id', 'Sorozat', 'number', max: 18),
            $date('original_start', 'Eredeti kezdés', false),
            new Field('deleted', 'Törölt előfordulás', 'checkbox'),
            // Required extra fields are checked in save(): a blank value already stored may stay.
            ...array_map(static fn(Field $field) => new Field(...[...get_object_vars($field), 'required' => false]), $this->definition->fields),
        ];
        $revision = new Field('revision', 'Verzió', required: true, max: 20);
        $space = fn(Context $ctx) => ['id' => $this->definition->space, 'acl_id' => $this->definition->space, 'owner' => null];
        $entry = fn(Context $ctx, ?string $id) => $this->target($ctx->db, $id, $this->tenant($ctx));
        $actions = [
            new Action($resource, 'events', 'Események', $range, fn(Context $ctx, array $target, array $values) => $this->events($ctx, $values), resolve: $space),
            new Action($resource, 'occurrences', 'Előfordulások', $range, fn(Context $ctx, array $target, array $values) => $this->occurrences($ctx, $values), resolve: $space),
            new Action($resource, 'create', 'Új esemény', $event, fn(Context $ctx, array $target, array $values) => $this->save($ctx->db, null, $values, $this->tenant($ctx)), resolve: $space, write: true, icon: 'bi bi-plus-lg'),
            new Action($resource, 'update', 'Esemény mentése', [...$event, $revision], fn(Context $ctx, array $target, array $values) => $this->save($ctx->db, $target['row'], $values, $this->tenant($ctx)), resolve: $entry, write: true, icon: 'bi bi-floppy'),
            new Action($resource, 'delete', 'Esemény törlése', [$revision], fn(Context $ctx, array $target, array $values) => $this->delete($ctx->db, $target['row'], $values['revision'], $this->tenant($ctx)), resolve: $entry, write: true, icon: 'bi bi-trash'),
        ];
        foreach ($actions as $action) $registry->add($action);
        $registry->calendar($resource, $this->definition->title, array_map(static fn($action) => $action->name, $actions), $this->definition->fields, $this->definition->metadata(), $this->definition->group, $this->definition->icon, $this->definition->desktopOnly, guide: $this->definition->guide);
    }

    /** Raw series, single events and exceptions for the Scheduler, which expands series itself. */
    private function events(Context $ctx, array $values): array
    {
        [$from, $to] = $this->range($values);
        $fields = $this->readable($ctx, 'events');
        $events = array_map(fn($row) => $this->client($row, $fields), $this->window($ctx->db, $from, $to, $this->tenant($ctx)));
        if ($this->definition->overlay !== null) foreach (($this->definition->overlay)($ctx, $from, $to) as $item) {
            if (count($events) >= self::EVENT_LIMIT) throw new Failure('Túl sok esemény; szűkítsd az időszakot.', 413);
            $events[] = $this->overlaid($item);
        }
        return ['events' => $events];
    }

    /** A consumer's read-only overlay item in the Scheduler's event shape; its id cannot collide with a stored one. */
    private function overlaid(mixed $item): array
    {
        $date = static fn(mixed $value): bool => is_string($value) && preg_match('/'.self::DATE.'/D', $value) === 1;
        if (!is_array($item) || !is_string($item['id'] ?? null) || $item['id'] === '' || !is_string($item['text'] ?? null) || !$date($item['start'] ?? null) || !$date($item['end'] ?? null)
            || $item['end'] <= $item['start'] || (isset($item['tone']) && !in_array($item['tone'], CalendarDefinition::TONES, true))) throw new \LogicException('Invalid calendar overlay item.');
        return ['id' => 'overlay:'.$item['id'], 'text' => $item['text'], 'start_date' => $item['start'], 'end_date' => $item['end'], 'rrule' => '', 'duration' => 0,
            'recurring_event_id' => '', 'original_start' => '', 'deleted' => false, 'revision' => '', 'readonly' => true, 'tone' => $item['tone'] ?? 'primary'];
    }

    /** Server-side expansion: every concrete occurrence overlapping the window, in start order. */
    private function occurrences(Context $ctx, array $values): array
    {
        [$from, $to] = $this->range($values);
        $fields = array_flip($this->readable($ctx, 'occurrences'));
        $items = array_map(static fn($item) => ['data' => (object) array_intersect_key($item['data'], $fields)] + $item, $this->expand($ctx->db, $from, $to, $this->tenant($ctx)));
        return ['from' => $from->format('Y-m-d H:i'), 'to' => $to->format('Y-m-d H:i'), 'occurrences' => $items];
    }

    /** @return list<array{id:string,series_id:?string,text:string,start:string,end:string,recurring:bool,data:array}> */
    public function expand(\PDO $db, \DateTimeImmutable $from, \DateTimeImmutable $to, ?string $tenant = null): array
    {
        $rows = $this->window($db, $from, $to, $tenant);
        $exceptions = [];
        foreach ($rows as $row) if ($row['recurring_event_id'] !== null) $exceptions[$row['recurring_event_id'].'|'.$row['original_start']] = true;
        $out = [];
        foreach ($rows as $row) {
            $data = json_decode($row['data'], true, flags: JSON_THROW_ON_ERROR);
            $item = static fn(string $id, ?string $series, string $start, string $end) => ['id' => $id, 'series_id' => $series, 'text' => $row['text'], 'start' => substr($start, 0, 16), 'end' => substr($end, 0, 16), 'recurring' => $series !== null, 'data' => $data];
            if ($row['rrule'] !== '' && $row['recurring_event_id'] === null) {
                $starts = Recurrence::starts($row['rrule'], self::time($row['start_at']), (int) $row['duration'], $from, $to, self::time($row['end_at']), self::OCCURRENCE_LIMIT);
                foreach ($starts as $start) {
                    $key = $start->format('Y-m-d H:i:s');
                    if (!isset($exceptions[$row['id'].'|'.$key])) $out[] = $item($row['id'].'#'.$start->format('YmdHi'), (string) $row['id'], $key, $start->modify('+'.(int) $row['duration'].' seconds')->format('Y-m-d H:i:s'));
                }
            } elseif (!(int) $row['deleted'] && $row['start_at'] < $to->format('Y-m-d H:i:s') && $row['end_at'] > $from->format('Y-m-d H:i:s')) {
                $out[] = $item((string) $row['id'], $row['recurring_event_id'] !== null ? (string) $row['recurring_event_id'] : null, $row['start_at'], $row['end_at']);
            }
            if (count($out) > self::OCCURRENCE_LIMIT) throw new Failure('Túl sok előfordulás; szűkítsd az időszakot.', 413);
        }
        usort($out, static fn($a, $b) => [$a['start'], $a['end'], $a['id']] <=> [$b['start'], $b['end'], $b['id']]);
        return $out;
    }

    /** Rows overlapping the window, plus exceptions whose original slot lies in it. */
    private function window(\PDO $db, \DateTimeImmutable $from, \DateTimeImmutable $to, ?string $tenant): array
    {
        $f = $from->format('Y-m-d H:i:s');
        $t = $to->format('Y-m-d H:i:s');
        [$where, $params] = $this->scope($tenant);
        $q = $db->prepare('SELECT '.self::COLUMNS." FROM blade_calendar_events WHERE $where AND ((start_at<? AND end_at>?) OR (recurring_event_id IS NOT NULL AND original_start>=? AND original_start<?)) ORDER BY start_at,id LIMIT ".(self::EVENT_LIMIT + 1));
        $q->execute([...$params, $t, $f, $f, $t]);
        $rows = $q->fetchAll(\PDO::FETCH_ASSOC);
        if (count($rows) > self::EVENT_LIMIT) throw new Failure('Túl sok esemény; szűkítsd az időszakot.', 413);
        foreach ($rows as &$row) $row['recurring_event_id'] = $row['recurring_event_id'] === null ? null : (string) $row['recurring_event_id'];
        return $rows;
    }

    private function save(\PDO $db, ?array $row, array $values, ?string $tenant): array
    {
        $start = self::time($values['start_date'].':00');
        $end = self::time($values['end_date'].':00');
        if ($end <= $start) throw new Failure('Javítsd a megjelölt mezőket.', 400, ['end_date' => 'A vége a kezdés utáni legyen.']);
        $rrule = $values['rrule'] ?? '';
        $series = ($values['recurring_event_id'] ?? '') !== '' ? $values['recurring_event_id'] : null;
        $original = ($values['original_start'] ?? '') !== '' ? self::time($values['original_start'].':00')->format('Y-m-d H:i:s') : null;
        if ($rrule !== '') Recurrence::parse($rrule);
        if ($series !== null) {
            $parent = $this->entry($db, $series, $tenant);
            if (!$parent || $parent['rrule'] === '' || $parent['recurring_event_id'] !== null || $original === null || $rrule !== '' || ($row && (string) $row['id'] === $series)) throw new Failure('Érvénytelen sorozatkivétel.', 400, ['recurring_event_id' => 'Érvénytelen sorozatkivétel.']);
        } elseif ($original !== null || ($values['deleted'] ?? '0') === '1') throw new Failure('Érvénytelen sorozatkivétel.', 400, ['original_start' => 'Érvénytelen sorozatkivétel.']);
        $data = [];
        foreach ($this->definition->fields as $field) $data[$field->name] = $values[$field->name] ?? ($row ? (json_decode($row['data'], true)[$field->name] ?? '') : ($field->defaultValue ?? ''));
        // A reference cleared by a usage provider leaves a blank required value; moving, shortening or
        // deleting occurrences keeps it, only a new blank value is refused.
        $kept = $row ?? ($series !== null ? $parent : null);
        $stored = $kept ? (json_decode($kept['data'], true) ?: []) : [];
        foreach ($this->definition->fields as $field) {
            if ($field->required && trim((string) $data[$field->name]) === '' && ($kept === null || trim((string) ($stored[$field->name] ?? '')) !== '')) throw new Failure('Javítsd a megjelölt mezőket.', 400, [$field->name => 'Kötelező mező.']);
        }
        $record = [$values['text'], $start->format('Y-m-d H:i:s'), $end->format('Y-m-d H:i:s'), $rrule, $rrule !== '' ? (int) ($values['duration'] ?? 0) : 0, $series, $original, (int) (($values['deleted'] ?? '0') === '1'), json_encode($data, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE)];
        if ($rrule !== '' && $record[4] < 1) throw new Failure('Javítsd a megjelölt mezőket.', 400, ['duration' => 'Ismétlődő eseménynél pozitív időtartam szükséges.']);
        if ($row === null) {
            $db->prepare('INSERT INTO blade_calendar_events(space,'.($tenant !== null ? 'tenant_id,' : '').'text,start_at,end_at,rrule,duration,recurring_event_id,original_start,deleted,data,revision) VALUES (?,'.($tenant !== null ? '?,' : '').'?,?,?,?,?,?,?,?,?,1)')
                ->execute([...$this->scope($tenant)[1], ...$record]);
            return ['id' => (string) $db->lastInsertId(), 'revision' => '1', 'audit' => ['series' => $series]];
        }
        if (!hash_equals((string) $row['revision'], (string) $values['revision'])) throw new Failure('Az adat közben módosult.', 409, details: ['revision' => (string) $row['revision']]);
        $q = $db->prepare('UPDATE blade_calendar_events SET text=?,start_at=?,end_at=?,rrule=?,duration=?,recurring_event_id=?,original_start=?,deleted=?,data=?,revision=revision+1 WHERE id=? AND revision=?');
        $q->execute([...$record, $row['id'], $row['revision']]);
        if ($q->rowCount() !== 1) throw new Failure('Az adat közben módosult.', 409);
        // A changed series pattern invalidates its exceptions, as in the Scheduler.
        if ($row['rrule'] !== '' && ($row['rrule'] !== $rrule || $row['start_at'] !== $record[1] || (int) $row['duration'] !== $record[4])) $db->prepare('DELETE FROM blade_calendar_events WHERE '.$this->scope($tenant)[0].' AND recurring_event_id=?')->execute([...$this->scope($tenant)[1], $row['id']]);
        return ['id' => (string) $row['id'], 'revision' => (string) ((int) $row['revision'] + 1)];
    }

    private function delete(\PDO $db, array $row, string $revision, ?string $tenant): array
    {
        if (!hash_equals((string) $row['revision'], $revision)) throw new Failure('Az adat közben módosult.', 409, details: ['revision' => (string) $row['revision']]);
        [$where, $params] = $this->scope($tenant);
        $db->prepare("DELETE FROM blade_calendar_events WHERE $where AND (id=? OR recurring_event_id=?)")->execute([...$params, $row['id'], $row['id']]);
        return ['id' => (string) $row['id']];
    }

    private function target(\PDO $db, ?string $id, ?string $tenant): array
    {
        $row = $id !== null ? $this->entry($db, $id, $tenant) : null;
        if (!$row) throw new Failure('Nem található esemény.', 404);
        return ['id' => (string) $row['id'], 'acl_id' => $this->definition->space, 'owner' => null, 'row' => $row];
    }

    private function entry(\PDO $db, string $id, ?string $tenant): ?array
    {
        if (!preg_match('/^[1-9][0-9]{0,17}$/D', $id)) return null;
        [$where, $params] = $this->scope($tenant);
        $q = $db->prepare('SELECT '.self::COLUMNS." FROM blade_calendar_events WHERE $where AND id=?");
        $q->execute([...$params, $id]);
        $row = $q->fetch(\PDO::FETCH_ASSOC);
        if (!$row) return null;
        $row['recurring_event_id'] = $row['recurring_event_id'] === null ? null : (string) $row['recurring_event_id'];
        return $row;
    }

    /** The active tenant of a tenant-scoped calendar (403 without one), null for any other calendar. */
    private function tenant(Context $ctx): ?string
    {
        if (!$this->definition->tenantScoped) return null;
        return (string) $this->registry?->realm($ctx, $this->definition->resource)['write'];
    }

    /** @return array{0:string,1:list<string>} the row filter of the calendar (and of $tenant when tenant-scoped) */
    private function scope(?string $tenant): array
    {
        if ($this->definition->tenantScoped !== ($tenant !== null)) throw new \LogicException('Calendar tenant scope mismatch.');
        return $tenant !== null ? ['space=? AND tenant_id=?', [$this->definition->space, $tenant]] : ['space=?', [$this->definition->space]];
    }

    /** Extra fields the actor may read with this action; denied ones never reach the response. */
    private function readable(Context $ctx, string $action): array
    {
        [$resource, $space] = [$this->definition->resource, $this->definition->space];
        return array_values(array_map(static fn($field) => $field->name, array_filter($this->definition->fields,
            static fn($field) => $ctx->acl->fieldAllowed($ctx->actor->id, $resource, $action, $ctx->channel, $space, null, $field->name))));
    }

    private function client(array $row, array $fields): array
    {
        $data = array_intersect_key(json_decode($row['data'], true, flags: JSON_THROW_ON_ERROR), array_flip($fields));
        return ['id' => (string) $row['id'], 'text' => $row['text'], 'start_date' => substr($row['start_at'], 0, 16), 'end_date' => substr($row['end_at'], 0, 16),
            'rrule' => $row['rrule'], 'duration' => (int) $row['duration'], 'recurring_event_id' => $row['recurring_event_id'] ?? '',
            'original_start' => $row['original_start'] !== null ? substr($row['original_start'], 0, 16) : '', 'deleted' => (bool) $row['deleted'], 'revision' => (string) $row['revision'], ...$data];
    }

    /** @return array{0:\DateTimeImmutable,1:\DateTimeImmutable} */
    private function range(array $values): array
    {
        $parse = static fn(string $value) => self::time(strlen($value) === 10 ? $value.' 00:00:00' : $value.':00');
        [$from, $to] = [$parse($values['from']), $parse($values['to'])];
        $days = $this->definition->maxRangeDays;
        if ($to <= $from || $to->getTimestamp() - $from->getTimestamp() > $days * 86400)
            throw new Failure(Translator::text('Az időszak legfeljebb {days} nap lehet.', ['days' => $days]), 400, ['to' => 'Érvénytelen időszak.'], ['max_range_days' => $days]);
        return [$from, $to];
    }

    private static function time(string $value): \DateTimeImmutable
    {
        $date = \DateTimeImmutable::createFromFormat('!Y-m-d H:i:s', $value, new \DateTimeZone('UTC'));
        if (!$date || $date->format('Y-m-d H:i:s') !== $value) throw new Failure('Érvénytelen dátum.', 400);
        return $date;
    }
}
