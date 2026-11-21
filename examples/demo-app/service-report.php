<?php
declare(strict_types=1);

/*
 * Feature-demo provider list (docs/workspaces.md#provider-lists): a synthetic service status report computed in PHP on
 * every read, not an SQL table. The closure gives every row; 61ade filters, sorts, windows, counts and observes them like
 * an SQL list, and the report's generation time reaches the list as its notice. The states change every minute, so the
 * live list refreshes on its own. The `Újraellenőrzés` record action shows a consumer action on a provider row.
 * `Régióellenőrzés` is a long-running job (docs/workspaces.md#jobs) on 61ade's JobQueue: one step per service of the
 * row's region, about 1.5 s each, with log lines, a checkpoint per step and `Megszakítás`.
 */

use Blade\Feature\{Action, Context, Field, ProviderResource, View, Workspace};
use Blade\Jobs\Job;

/** The report's rows at $minute: 36 services in four regions, state and latency derived from the minute. */
function blade_demo_service_rows(int $minute): array
{
    $names = ['Bejelentkezés', 'Fizetés', 'Keresés', 'Értesítések', 'Képfeldolgozás', 'Jelentések', 'Export', 'Naptár', 'Archívum'];
    $regions = ['eu-west', 'eu-central', 'us-east', 'ap-south'];
    $rows = [];
    foreach ($regions as $r => $region) foreach ($names as $n => $name) {
        $seed = ($n * 7 + $r * 13 + $minute) % 29;
        $state = $seed === 0 ? 'down' : ($seed < 4 ? 'degraded' : 'ok');
        $rows[] = ['key' => "$region.".($n + 1), 'name' => $name, 'region' => $region, 'state' => $state,
            'latency' => $state === 'down' ? null : 20 + ($seed * 17 + $n * 5) % 180, 'team' => ['Platform', 'Fizetés', 'Adat'][$n % 3],
            'note' => $state === 'ok' ? '' : ($state === 'down' ? 'Nem válaszol az állapotellenőrzésre.' : 'A válaszidő a megszokottnál hosszabb.')];
    }
    return $rows;
}

function blade_demo_service_report_register(Workspace $workspace): void
{
    $report = new ProviderResource('demo_service_report', 'key', [
        new Field('name', 'Szolgáltatás'),
        new Field('region', 'Régió', 'select', options: ['eu-west' => 'eu-west', 'eu-central' => 'eu-central', 'us-east' => 'us-east', 'ap-south' => 'ap-south']),
        new Field('state', 'Állapot', 'select', options: ['ok' => 'Működik', 'degraded' => 'Lassú', 'down' => 'Leállt'], column: ['tones' => ['degraded' => 'warning', 'down' => 'danger']]),
        new Field('latency', 'Válaszidő (ms)', 'number'),
        new Field('team', 'Felelős csapat', section: 'Részletek'),
        new Field('note', 'Megjegyzés', 'textarea', column: ['placement' => 'group']),
    ], static function (Context $ctx): array {
        $now = time();
        $rows = blade_demo_service_rows(intdiv($now, 60));
        $down = count(array_filter($rows, static fn($row) => $row['state'] === 'down'));
        return ['rows' => $rows, 'notice' => ['text' => 'Szimulált jelentés · készült: '.gmdate('H:i', $now).' UTC'.($down ? " · $down leállt szolgáltatás" : ''), 'tone' => $down ? 'warning' : 'info']];
    }, search: ['name']);
    $report->register($workspace->registry, 'Szolgáltatásjelentés', group: 'Feature demó', icon: 'bi bi-activity', sort: ['field' => 'state', 'direction' => 'asc'], activate: 'view:demo.service-page',
        attention: ['filters' => ['state' => 'down'], 'tone' => 'danger', 'label' => '{count} leállt szolgáltatás'],
        guide: 'Szolgáltatói lista: a sorokat nem SQL tábla, hanem a projekt PHP kódja adja (ProviderResource). A szűrés, a rendezés, a keresés, a darabszám, a kártyák, az Adatok ablak és az élő frissítés ugyanaz, mint egy SQL listánál.'."\n\n".'A jelentés percenként változik; a sorok fölötti sáv a jelentés készítésének idejét mutatja.');
    // A consumer action on a provider row: the target comes from the provider (ProviderResource::target).
    $workspace->registry->add(new Action('demo_service_report', 'recheck', 'Újraellenőrzés', [], static fn(Context $ctx, array $target): array => ['reveal' => ['label' => 'Újraellenőrzés', 'value' => $target['row']['name'].' ('.$target['row']['region'].'): '.($target['row']['state'] === 'ok' ? 'működik' : 'továbbra is hibás'), 'note' => 'Szimulált ellenőrzés.']],
        resolve: static fn(Context $ctx, ?string $id): array => $report->target($ctx, $id), icon: 'bi bi-arrow-repeat'));
    // A long-running job on a provider row (docs/workspaces.md#jobs): runs after the response, reports each step.
    $workspace->registry->add(new Action('demo_service_report', 'audit', 'Régióellenőrzés', [], static function (Context $ctx, array $target, array $values, Job $job): ?array {
        $region = $target['row']['region'];
        $services = array_values(array_filter(blade_demo_service_rows(intdiv(time(), 60)), static fn($row) => $row['region'] === $region));
        $from = ($job->checkpoint()['done'] ?? 0) + 1;
        $job->log("A(z) $region régió ellenőrzése: ".count($services).' szolgáltatás.');
        for ($i = $from; $i <= count($services); $i++) {
            if ($job->cancelled()) { $job->log('Az ellenőrzés megszakítva.', 'warning'); return null; }
            $service = $services[$i - 1];
            $job->step($i, count($services)); $job->stage('Ellenőrzés: '.$service['name']); $job->progress(($i - 1) * 100 / count($services));
            usleep(1_500_000);
            $job->log($service['name'].': '.['ok' => 'működik', 'degraded' => 'lassú', 'down' => 'leállt'][$service['state']], $service['state'] === 'ok' ? 'info' : ($service['state'] === 'down' ? 'error' : 'warning'));
            $job->checkpoint(['done' => $i]);
        }
        $job->progress(100);
        $faulty = count(array_filter($services, static fn($row) => $row['state'] !== 'ok'));
        return ['reveal' => ['label' => 'Régióellenőrzés', 'value' => "$region: ".($faulty ? "$faulty hibás szolgáltatás" : 'minden szolgáltatás működik'), 'note' => 'Szimulált ellenőrzés.']];
    }, resolve: static fn(Context $ctx, ?string $id): array => $report->target($ctx, $id), icon: 'bi bi-list-check', job: true, heartbeat: 10));
    $workspace->registry->appendViewActions('demo_service_report', ['recheck', 'audit']);
    // A record view of a provider row (the module's kind demo.service-page): double-click or Enter opens it; `Adatok` stays.
    $workspace->registry->addView(new View('demo.service-page', 'demo.service-page', 'Szolgáltatáslap', 'demo_service_report', record: 'demo_service_report', actions: ['get'], recordTitle: 'name', locationBackTarget: 'demo_service_report', icon: 'bi bi-hdd-network'));
}
