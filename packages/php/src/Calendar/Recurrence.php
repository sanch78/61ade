<?php
declare(strict_types=1);
namespace Blade\Calendar;

use Blade\Feature\Failure;

/**
 * Server-side expansion of the RFC 5545 RRULE subset that the DHTMLX Scheduler recurrence editor
 * produces: FREQ DAILY/WEEKLY/MONTHLY/YEARLY, INTERVAL, BYDAY (plain weekdays), BYMONTHDAY,
 * BYSETPOS with one BYDAY, BYMONTH, COUNT and UNTIL. Times are wall-clock values without a zone;
 * weeks start on Monday. Anything else is rejected rather than expanded differently.
 */
final class Recurrence
{
    private const DAYS = ['MO' => 1, 'TU' => 2, 'WE' => 3, 'TH' => 4, 'FR' => 5, 'SA' => 6, 'SU' => 7];
    /** Upper bound of generated periods per series and request. */
    private const PERIODS = 50000;

    /** @return array{freq:string,interval:int,byday:list<int>,bymonthday:?int,bysetpos:?int,bymonth:?int,count:?int,until:?\DateTimeImmutable} */
    public static function parse(string $rule): array
    {
        $rule = preg_replace('/^RRULE:/i', '', trim($rule));
        $out = ['freq' => '', 'interval' => 1, 'byday' => [], 'bymonthday' => null, 'bysetpos' => null, 'bymonth' => null, 'count' => null, 'until' => null];
        $seen = [];
        foreach (explode(';', $rule) as $part) {
            [$key, $value] = array_pad(explode('=', $part, 2), 2, '');
            $key = strtoupper($key);
            if (isset($seen[$key])) self::reject();
            $seen[$key] = true;
            match ($key) {
                'FREQ' => in_array($value, ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'], true) ? $out['freq'] = $value : self::reject(),
                'INTERVAL' => $out['interval'] = self::number($value, 1, 999),
                'COUNT' => $out['count'] = self::number($value, 1, 5000),
                'BYMONTHDAY' => $out['bymonthday'] = self::number($value, 1, 31),
                'BYMONTH' => $out['bymonth'] = self::number($value, 1, 12),
                'BYSETPOS' => $out['bysetpos'] = $value === '-1' ? -1 : self::number($value, 1, 5),
                'BYDAY' => $out['byday'] = array_map(static fn($day) => self::DAYS[$day] ?? self::reject(), array_unique(explode(',', $value))),
                'UNTIL' => $out['until'] = self::until($value),
                'WKST' => $value === 'MO' ? null : self::reject(),
                default => self::reject(),
            };
        }
        $monthly = in_array($out['freq'], ['MONTHLY', 'YEARLY'], true);
        if ($out['freq'] === '' || ($out['bymonth'] !== null && $out['freq'] !== 'YEARLY') || ($out['bymonthday'] !== null && (!$monthly || $out['byday']))
            || ($out['bysetpos'] !== null && (!$monthly || count($out['byday']) !== 1))) self::reject();
        sort($out['byday']);
        return $out;
    }

    /**
     * Starts of the occurrences that overlap [$from, $to): an occurrence lasting $duration seconds.
     * $end is the series end (exclusive); at most $limit starts are returned, in order.
     * @return list<\DateTimeImmutable>
     */
    public static function starts(string $rule, \DateTimeImmutable $start, int $duration, \DateTimeImmutable $from, \DateTimeImmutable $to, ?\DateTimeImmutable $end = null, int $limit = 1000): array
    {
        $r = self::parse($rule);
        $start = self::wall($start);
        $time = $start->format('H:i:s');
        $earliest = self::wall($from)->modify('-'.max(0, $duration).' seconds');
        $to = self::wall($to);
        $stop = $r['until'];
        if ($end !== null && ($stop === null || self::wall($end) <= $stop)) $stop = self::wall($end)->modify('-1 second');
        $first = 0;
        // Without COUNT whole periods before the window can be skipped instead of generated.
        if ($r['count'] === null && in_array($r['freq'], ['DAILY', 'WEEKLY'], true) && $earliest > $start) {
            $span = $r['freq'] === 'DAILY' ? $r['interval'] : 7 * $r['interval'];
            $first = max(0, intdiv((int) self::monday($start, $r['freq'])->diff($earliest)->days, $span) - 1);
        }
        $out = [];
        $produced = 0;
        for ($period = $first; $period < $first + self::PERIODS; $period++) {
            $days = self::days($r, $start, $period);
            if ($days === null) break;
            foreach ($days as $day) {
                $occurrence = new \DateTimeImmutable($day->format('Y-m-d').' '.$time, new \DateTimeZone('UTC'));
                if ($occurrence < $start) continue;
                if (($stop !== null && $occurrence > $stop) || $occurrence >= $to || ($r['count'] !== null && $produced >= $r['count'])) return $out;
                $produced++;
                if ($occurrence >= $earliest && ($duration > 0 ? $occurrence->modify("+$duration seconds") > self::wall($from) : $occurrence >= self::wall($from))) {
                    $out[] = $occurrence;
                    if (count($out) >= $limit) return $out;
                }
            }
        }
        return $out;
    }

    /** Candidate days of one period, or null when the calendar cannot go further. */
    private static function days(array $r, \DateTimeImmutable $start, int $period): ?array
    {
        $step = $period * $r['interval'];
        if ($r['freq'] === 'DAILY') {
            $day = $start->setTime(0, 0)->modify("+$step days");
            return !$r['byday'] || in_array((int) $day->format('N'), $r['byday'], true) ? [$day] : [];
        }
        if ($r['freq'] === 'WEEKLY') {
            $monday = self::monday($start, 'WEEKLY')->modify('+'.(7 * $step).' days');
            return array_map(static fn($day) => $monday->modify('+'.($day - 1).' days'), $r['byday'] ?: [(int) $start->format('N')]);
        }
        $month = $r['freq'] === 'MONTHLY'
            ? $start->setDate((int) $start->format('Y'), (int) $start->format('n'), 1)->setTime(0, 0)->modify("+$step months")
            : $start->setDate((int) $start->format('Y') + $step, $r['bymonth'] ?? (int) $start->format('n'), 1)->setTime(0, 0);
        if ((int) $month->format('Y') > 9999) return null;
        $length = (int) $month->format('t');
        if ($r['byday']) {
            $days = [];
            for ($d = 0; $d < $length; $d++) if (in_array((int) $month->modify("+$d days")->format('N'), $r['byday'], true)) $days[] = $month->modify("+$d days");
            if ($r['bysetpos'] === null) return $days;
            $pick = $r['bysetpos'] > 0 ? ($days[$r['bysetpos'] - 1] ?? null) : end($days);
            return $pick ? [$pick] : [];
        }
        // RFC 5545: a month without that day (e.g. 31st) has no occurrence.
        $day = $r['bymonthday'] ?? (int) $start->format('j');
        return $day <= $length ? [$month->modify('+'.($day - 1).' days')] : [];
    }

    private static function monday(\DateTimeImmutable $date, string $freq): \DateTimeImmutable
    {
        $day = $date->setTime(0, 0);
        return $freq === 'WEEKLY' ? $day->modify('-'.((int) $day->format('N') - 1).' days') : $day;
    }

    /** Same wall-clock reading in UTC, so arithmetic never shifts at a DST change. */
    private static function wall(\DateTimeImmutable $date): \DateTimeImmutable
    {
        return new \DateTimeImmutable($date->format('Y-m-d H:i:s'), new \DateTimeZone('UTC'));
    }

    private static function until(string $value): \DateTimeImmutable
    {
        // The Scheduler writes the wall-clock end with UTC notation; it is read as wall-clock time.
        if (!preg_match('/^(\d{8})(?:T(\d{6})Z?)?$/D', $value, $m)) self::reject();
        $date = \DateTimeImmutable::createFromFormat('!YmdHis', $m[1].($m[2] ?? '235959'), new \DateTimeZone('UTC'));
        return $date ?: self::reject();
    }

    private static function number(string $value, int $min, int $max): int
    {
        if (!preg_match('/^[1-9][0-9]{0,3}$/D', $value) || (int) $value < $min || (int) $value > $max) self::reject();
        return (int) $value;
    }

    private static function reject(): never
    {
        throw new Failure('Nem támogatott ismétlődési szabály.', 400, ['rrule' => 'Nem támogatott ismétlődési szabály.']);
    }
}
