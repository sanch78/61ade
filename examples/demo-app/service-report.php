<?php
declare(strict_types=1);

/*
 * Feature-demo provider list (docs/workspaces.md#provider-lists): a synthetic service status report computed in PHP on
 * every read, not an SQL table. The closure gives every row; 61ade filters, sorts, windows, counts and observes them like
 * an SQL list, and the report's generation time reaches the list as its notice. The states change every minute, so the
 * live list refreshes on its own. The `Újraellenőrzés` record action shows a consumer action on a provider row.
 */

use Blade\Feature\{Action, Context, Field, ProviderResource, View, Workspace};

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
    $workspace->registry->appendViewActions('demo_service_report', ['recheck']);
    // A record view of a provider row (the module's kind demo.service-page): double-click or Enter opens it; `Adatok` stays.
    $workspace->registry->addView(new View('demo.service-page', 'demo.service-page', 'Szolgáltatáslap', 'demo_service_report', record: 'demo_service_report', actions: ['get'], recordTitle: 'name', locationBackTarget: 'demo_service_report', icon: 'bi bi-hdd-network'));
}
