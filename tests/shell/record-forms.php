<?php

declare(strict_types=1);

require dirname(__DIR__, 2).'/examples/demo-app/vendor/autoload.php';

use Blade\Access\Schema;
use Blade\Configuration\WorkspaceConfiguration;
use Blade\Feature\{Action, Context, Failure, Field, Registry, SqlResource, Workspace};
use Blade\Shell\Identity;

// Record action forms: read-only fields (FB-0171: Action::$display, SqlResource createOnly / JSON storage.create_only,
// readable fields the actor may not write) and collapsible field sections (FB-0172: Field::$section / JSON section)
// over an in-memory database.
function verify(bool $value, string $message): void { if (!$value) throw new RuntimeException($message); }
function rejected(Closure $work, string $message): void
{
    try { $work(); } catch (InvalidArgumentException) { return; }
    throw new RuntimeException($message);
}
function failed(Closure $work, int $status, string $message): void
{
    try { $work(); } catch (Failure $error) { verify($error->status === $status, $message.': '.$error->getMessage()); return; }
    throw new RuntimeException($message.': accepted');
}

// Sections: a plain-text label of at most 100 characters, translated in the metadata.
verify((new Field('x', 'X', section: 'Képek'))->metadata()['section'] === 'Képek', 'Section in field metadata');
verify(!array_key_exists('section', (new Field('x', 'X'))->metadata()), 'No section key without a section');
foreach (['', '   ', str_repeat('a', 101), "a\nb", "a\tb"] as $bad) rejected(static fn() => new Field('x', 'X', section: $bad), 'Invalid section accepted: '.json_encode($bad));
// Fixed sections (FB-0177): `sectionCollapsible: false` on the wire only for a fixed one; never without a section; one
// value per section label in a resource and in an action.
verify((new Field('x', 'X', section: 'Alap', sectionCollapsible: false))->metadata()['sectionCollapsible'] === false, 'Fixed section in field metadata');
verify(!array_key_exists('sectionCollapsible', (new Field('x', 'X', section: 'Alap'))->metadata()), 'No collapsible key for a collapsible section');
rejected(static fn() => new Field('x', 'X', sectionCollapsible: false), 'A fixed section without a label accepted');
rejected(static fn() => (new Registry())->registerFields('mixed', [new Field('a', 'A', section: 'S'), new Field('b', 'B', section: 'S', sectionCollapsible: false)]), 'A section both collapsible and fixed accepted');
rejected(static fn() => (new Registry())->add(new Action('mixed', 'run', 'Run', [new Field('a', 'A', section: 'S', sectionCollapsible: false), new Field('b', 'B', section: 'S')], static fn() => [])), 'An action section both collapsible and fixed accepted');
(new Registry())->registerFields('agreed', [new Field('a', 'A', section: 'S', sectionCollapsible: false), new Field('b', 'B', section: 'S', sectionCollapsible: false), new Field('c', 'C', section: 'T')]);
// Section-filling fields (FB-0181): a textarea or file field of a section, without an editor, alone in its section;
// `sectionFill: true` in the form metadata only, not in a column's section.
$image = ['upload' => 'r.upload', 'accept' => ['image']];
verify((new Field('x', 'X', 'textarea', section: 'S', sectionFill: true))->metadata()['sectionFill'] === true && !array_key_exists('sectionFill', (new Field('x', 'X', 'textarea', section: 'S'))->metadata()), 'Section fill in field metadata');
verify(!array_key_exists('sectionFill', (new Field('x', 'X', 'textarea', section: 'S', sectionFill: true))->sectionMetadata()), 'No section fill in a column');
new Field('x', 'X', 'file', file: $image, section: 'S', sectionFill: true);
rejected(static fn() => new Field('x', 'X', 'textarea', sectionFill: true), 'A section fill without a section accepted');
rejected(static fn() => new Field('x', 'X', section: 'S', sectionFill: true), 'A text field filling its section accepted');
rejected(static fn() => new Field('x', 'X', 'textarea', editor: 'p.editor', section: 'S', sectionFill: true), 'A section fill with an editor accepted');
rejected(static fn() => (new Registry())->registerFields('shared', [new Field('a', 'A', 'textarea', section: 'S', sectionFill: true), new Field('b', 'B', section: 'S')]), 'A section-filling field sharing its section accepted');
rejected(static fn() => (new Registry())->add(new Action('shared', 'run', 'Run', [new Field('a', 'A', section: 'S'), new Field('b', 'B', 'textarea', section: 'S', sectionFill: true)], static fn() => [])), 'An action section-filling field sharing its section accepted');
(new Registry())->registerFields('alone', [new Field('a', 'A', 'textarea', section: 'S', sectionFill: true), new Field('b', 'B', section: 'T')]);
// Form rows (FB-0196): a key `[a-z][a-z0-9_]*` of at most 64 characters and a share 1–3 (only with a row); on the wire
// `row`, and `rowWidth` when it is not 1. Never on a section-filling field.
verify(['row' => 'basics', 'rowWidth' => 2] === array_intersect_key((new Field('x', 'X', row: 'basics', rowWidth: 2))->metadata(), ['row' => 1, 'rowWidth' => 1]), 'Form row in field metadata');
verify(($meta = (new Field('x', 'X', row: 'basics'))->metadata())['row'] === 'basics' && !array_key_exists('rowWidth', $meta) && !array_key_exists('row', (new Field('x', 'X'))->metadata()), 'Default share and no row off the wire');
new Field('x', 'X', row: str_repeat('a', 64), rowWidth: 3);
foreach (['', 'Basics', '1a', 'a-b', 'a b', str_repeat('a', 65)] as $bad) rejected(static fn() => new Field('x', 'X', row: $bad), 'Invalid form row accepted: '.json_encode($bad));
foreach ([0, 4, -1] as $bad) rejected(static fn() => new Field('x', 'X', row: 'r', rowWidth: $bad), 'Invalid row width accepted: '.$bad);
rejected(static fn() => new Field('x', 'X', rowWidth: 2), 'A row width without a row accepted');
rejected(static fn() => new Field('x', 'X', 'textarea', section: 'S', sectionFill: true, row: 'r'), 'A section-filling field in a row accepted');
// A row is one run of 2–4 consecutive fields of one section, in a resource and in an action.
(new Registry())->registerFields('rows', [new Field('a', 'A', row: 'r'), new Field('b', 'B', row: 'r'), new Field('c', 'C', section: 'S', row: 's'), new Field('d', 'D', section: 'S', row: 's'), new Field('e', 'E', section: 'S', row: 's'), new Field('f', 'F', section: 'S', row: 's', rowWidth: 3), new Field('g', 'G', section: 'S')]);
rejected(static fn() => (new Registry())->registerFields('split', [new Field('a', 'A', row: 'r'), new Field('b', 'B'), new Field('c', 'C', row: 'r')]), 'A row split by another field accepted');
rejected(static fn() => (new Registry())->registerFields('across', [new Field('a', 'A', section: 'S', row: 'r'), new Field('b', 'B', section: 'T', row: 'r')]), 'A row across sections accepted');
rejected(static fn() => (new Registry())->registerFields('out', [new Field('a', 'A', row: 'r'), new Field('b', 'B', section: 'S', row: 'r')]), 'A row from outside into a section accepted');
rejected(static fn() => (new Registry())->registerFields('wide', array_map(static fn($n) => new Field($n, strtoupper($n), row: 'r'), ['a', 'b', 'c', 'd', 'e'])), 'A row of five fields accepted');
rejected(static fn() => (new Registry())->add(new Action('split', 'run', 'Run', [new Field('a', 'A', row: 'r'), new Field('b', 'B', row: 's'), new Field('c', 'C', row: 'r')], static fn() => [])), 'An action row split by another row accepted');
// One field is not a row in a resource's declaration; an action may keep one field of a row (an update without its
// create-only fields), which then takes the whole width.
rejected(static fn() => (new Registry())->registerFields('lone', [new Field('a', 'A', row: 'r'), new Field('b', 'B')]), 'A row of one declared field accepted');
(new Registry())->add(new Action('lone', 'run', 'Run', [new Field('a', 'A', row: 'r'), new Field('b', 'B')], static fn() => []));
// Card lines of a long text (FB-0177): a textarea column option 0–50, one spelling.
verify((new Field('x', 'X', 'textarea', column: ['cardLines' => 0]))->column['cardLines'] === 0 && (new Field('x', 'X', 'textarea', column: ['card_lines' => 50]))->column['card_lines'] === 50, 'Card lines accepted');
foreach ([['text', ['cardLines' => 4]], ['textarea', ['cardLines' => -1]], ['textarea', ['cardLines' => 51]], ['textarea', ['cardLines' => '4']], ['textarea', ['cardLines' => 4, 'card_lines' => 4]]] as [$type, $column])
    rejected(static fn() => new Field('x', 'X', $type, column: $column), 'Invalid card lines accepted: '.json_encode([$type, $column]));
// Display fields: readable, not an input of the action, unique.
$noop = static fn() => [];
rejected(static fn() => new Action('r', 'a', 'A', [], $noop, display: [new Field('s', 'S', secret: true)]), 'Secret display field accepted');
rejected(static fn() => new Action('r', 'a', 'A', [], $noop, display: [new Field('p', 'P', 'password')]), 'Password display field accepted');
rejected(static fn() => new Action('r', 'a', 'A', [new Field('x', 'X')], $noop, display: [new Field('x', 'X')]), 'Display field that is an input accepted');
rejected(static fn() => new Action('r', 'a', 'A', [], $noop, display: [new Field('x', 'X'), new Field('x', 'X')]), 'Repeated display field accepted');
rejected(static fn() => new Action('r', 'a', 'A', [], $noop, display: ['x']), 'Display entry that is no Field accepted');
// Form sections (FB-0178): 'panels' by default, 'accordion' or 'accordion-multiple'; anything else is refused.
verify((new Action('r', 'a', 'A', [], $noop))->formSections === 'panels' && (new Action('r', 'a', 'A', [], $noop, formSections: 'accordion-multiple'))->formSections === 'accordion-multiple', 'Form sections accepted');
foreach (['', 'Accordion', 'tabs', 'accordion_multiple'] as $bad) rejected(static fn() => new Action('r', 'a', 'A', [], $noop, formSections: $bad), 'Invalid form sections accepted: '.$bad);
// Flush sections: accordion ones only.
verify((new Action('r', 'a', 'A', [], $noop, formSections: 'accordion', flushSections: true))->flushSections && !(new Action('r', 'a', 'A', [], $noop))->flushSections, 'Flush sections accepted');
rejected(static fn() => new Action('r', 'a', 'A', [], $noop, flushSections: true), 'Flush panels accepted');
// SqlResource::register gives its create and update actions the presentation.
$sections = new Registry();
(new SqlResource('things', 'things', 'id', [new Field('title', 'Title', section: 'S')]))->register($sections, 'Things', formSections: 'accordion', flushSections: true);
verify($sections->get('things', 'create')->formSections === 'accordion' && $sections->get('things', 'update')->formSections === 'accordion', 'SqlResource form sections');
verify($sections->get('things', 'create')->flushSections && $sections->get('things', 'update')->flushSections, 'SqlResource flush sections');
rejected(static fn() => (new SqlResource('things', 'things', 'id', [new Field('title', 'Title')]))->register(new Registry(), 'Things', formSections: 'tabs'), 'Invalid SqlResource form sections accepted');
// createOnly: a written, readable field no update path changes.
$fields = static fn() => [new Field('title', 'Title', required: true), new Field('kind', 'Kind', 'select', options: ['a' => 'Alpha', 'b' => 'Beta']), new Field('secret', 'Secret', secret: true),
    new Field('cell', 'Cell', column: ['editable' => true]), new Field('mass', 'Mass', bulk: true), new Field('total', 'Total', 'number')];
foreach ([['missing'], ['secret'], ['cell'], ['mass'], ['total'], ['kind', 'kind'], ['k' => 'kind']] as $bad)
    rejected(static fn() => new SqlResource('r', 'r', 'id', $fields(), computed: ['total' => '1'], createOnly: $bad), 'Invalid createOnly accepted: '.json_encode($bad));

$db = new PDO('sqlite::memory:', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
Schema::install($db);
$db->exec('CREATE TABLE items (id INTEGER PRIMARY KEY AUTOINCREMENT, parent_id TEXT NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL, note TEXT NOT NULL DEFAULT \'\', image TEXT NOT NULL DEFAULT \'\')');
$registry = new Registry();
(new SqlResource('items', 'items', 'id', [
    new Field('parent_id', 'Parent', 'select', required: true, options: ['1' => 'Root', '2' => 'Branch'], row: 'origin'),
    new Field('kind', 'Kind', 'select', required: true, options: ['a' => 'Alpha', 'b' => 'Beta'], row: 'origin'),
    new Field('title', 'Title', required: true),
    new Field('note', 'Note', 'textarea', column: ['card_lines' => 2], section: 'More', row: 'more', rowWidth: 2),
    new Field('image', 'Image', section: 'More', row: 'more'),
], createOnly: ['parent_id', 'kind']))->register($registry, 'Items');
$workspace = new Workspace($registry, $db);
$context = new Context(new Identity('1', 'Synthetic'), 'ui', $workspace->acl, $db);
$rule = $db->prepare("INSERT INTO blade_rules(subject_type, subject_id, resource, action, channel, effect, scope, object_id, field_name) VALUES ('user', '1', 'items', ?, 'ui', ?, 'all', '', ?)");
foreach (['list', 'get', 'create', 'update'] as $action) $rule->execute([$action, 'allow', '']);
$names = static fn(array $list) => array_map(static fn($field) => $field instanceof Field ? $field->name : $field['name'], $list);
verify($names($registry->get('items', 'create')->fields) === ['parent_id', 'kind', 'title', 'note', 'image'], 'Create takes the create-only fields');
verify($names($registry->get('items', 'update')->fields) === ['title', 'note', 'image', 'revision'] && $names($registry->get('items', 'update')->display) === ['parent_id', 'kind'], 'Update displays them');
$id = (string) $workspace->executor->execute($context, 'items', 'create', null, ['parent_id' => '2', 'kind' => 'b', 'title' => 'One'])['id'];
// The update form: the display fields first (read-only, with the stored values), then the inputs; sections in metadata.
$form = $workspace->describe($context, $registry->get('items', 'update'), $id);
verify($names($form['fields']) === ['parent_id', 'kind', 'title', 'note', 'image', 'revision'], 'Update form order: '.json_encode($names($form['fields'])));
verify(($form['fields'][0]['readOnly'] ?? false) && ($form['fields'][1]['readOnly'] ?? false) && !isset($form['fields'][2]['readOnly']), 'Display fields marked read-only');
verify($form['values']['parent_id'] === '2' && $form['values']['kind'] === 'b' && $form['fields'][1]['options'] === ['a' => 'Alpha', 'b' => 'Beta'], 'Display values and options');
verify(($form['fields'][3]['section'] ?? null) === 'More' && ($form['fields'][4]['section'] ?? null) === 'More' && !isset($form['fields'][2]['section']), 'Sections in the form metadata');
$create = $workspace->describe($context, $registry->get('items', 'create'), null);
verify($names($create['fields']) === ['parent_id', 'kind', 'title', 'note', 'image'] && !array_filter($create['fields'], static fn($field) => $field['readOnly'] ?? false), 'Create form: everything editable');
// The default section presentation is not on the wire; another one is (`formSections`).
verify(!array_key_exists('formSections', $create) && !array_key_exists('formSections', $form) && !array_key_exists('flushSections', $create), 'No formSections for panels');
$registry->add(new Action('items', 'survey', 'Survey', [new Field('answer', 'Answer', section: 'More')], $noop, write: true, formSections: 'accordion', flushSections: true));
$rule->execute(['survey', 'allow', '']);
$workspace->acl->invalidate();
$survey = $workspace->describe($context, $registry->get('items', 'survey'), null);
verify(($survey['formSections'] ?? null) === 'accordion' && ($survey['flushSections'] ?? null) === true, 'formSections and flushSections in the form description');
// A save that sends a display field is refused, nothing changes; without it the update saves.
$revision = $form['values']['revision'];
failed(static fn() => $workspace->executor->execute($context, 'items', 'update', $id, ['title' => 'Two', 'kind' => 'a', 'revision' => $revision]), 400, 'A display field sent');
verify($db->query('SELECT kind, title FROM items WHERE id = '.(int) $id)->fetch(PDO::FETCH_ASSOC) === ['kind' => 'b', 'title' => 'One'], 'Refused save changed nothing');
$workspace->executor->execute($context, 'items', 'update', $id, ['title' => 'Two', 'revision' => $revision]);
// Field ACL: a field the actor may read but not write in this action is shown read-only in place; one it may not read
// (get) is left out, a display field too.
$rule->execute(['update', 'deny', 'note']);
$rule->execute(['get', 'deny', 'kind']);
$workspace->acl->invalidate();
$form = $workspace->describe($context, $registry->get('items', 'update'), $id);
verify($names($form['fields']) === ['parent_id', 'title', 'note', 'image', 'revision'], 'Read-only by ACL: '.json_encode($names($form['fields'])));
verify(($form['fields'][2]['readOnly'] ?? false) && !isset($form['fields'][1]['readOnly']) && !array_key_exists('kind', $form['values']), 'Denied write shown read-only; denied read absent');
failed(static fn() => $workspace->executor->execute($context, 'items', 'update', $id, ['title' => 'Three', 'note' => 'x', 'revision' => $form['values']['revision']]), 403, 'A write-denied field sent');
// The create form keeps a write-denied field out (no record to read it from).
$rule->execute(['create', 'deny', 'note']);
$workspace->acl->invalidate();
verify(!in_array('note', $names($workspace->describe($context, $registry->get('items', 'create'), null)['fields']), true), 'Create leaves a write-denied field out');
// The list column metadata carries the section (the singleton's details form groups by it).
$columns = array_column($registry->provider('list')->metadata($context, $registry->views()[0])['options']['columns'], null, 'id');
verify(($columns['note']['section'] ?? null) === 'More' && !isset($columns['title']['section']), 'Column section');
// The form rows reach the forms (display fields too; `kind` is read-denied here) and the columns (the singleton's details form follows them).
$rows = array_column($workspace->describe($context, $registry->get('items', 'update'), $id)['fields'], null, 'name');
verify(($rows['parent_id']['row'] ?? null) === 'origin' && ($rows['note']['rowWidth'] ?? null) === 2 && ($rows['image']['row'] ?? null) === 'more' && !isset($rows['image']['rowWidth'], $rows['title']['row']), 'Form rows in the form metadata');
verify(($columns['note']['row'] ?? null) === 'more' && ($columns['note']['rowWidth'] ?? null) === 2 && !isset($columns['title']['row']), 'Column form rows');
// The cards and details group by the detail fields' sections and clamp a long text to its card lines (FB-0177).
$details = array_column($registry->provider('list')->metadata($context, $registry->views()[0])['options']['detailFields'], null, 'id');
verify(($details['note']['section'] ?? null) === 'More' && ($details['note']['cardLines'] ?? null) === 2 && !isset($details['note']['card_lines']) && !isset($details['title']['section'], $details['title']['cardLines']), 'Detail field section and card lines');

// JSON: storage.create_only and a field's section.
$directory = sys_get_temp_dir().'/blade-record-forms-'.bin2hex(random_bytes(4));
mkdir($directory);
try {
    $module = ['resources' => ['items' => ['storage' => ['table' => 'items', 'key' => 'id', 'create_only' => ['kind']],
        'fields' => [['name' => 'kind', 'label' => 'Kind', 'type' => 'select', 'options' => ['a' => 'Alpha']], ['name' => 'title', 'label' => 'Title', 'section' => 'More']], 'view' => ['title' => 'Items']]]];
    file_put_contents($directory.'/module.json', json_encode($module, JSON_THROW_ON_ERROR));
    $json = WorkspaceConfiguration::build($db, [$directory.'/module.json'], static fn() => []);
    verify($names($json->registry->get('items', 'update')->display) === ['kind'] && $json->registry->fields('items')['title']->section === 'More', 'JSON create_only and section');
    $fixed = $module;$fixed['resources']['items']['fields'][1]['section_collapsible'] = false;
    file_put_contents($directory.'/module.json', json_encode($fixed, JSON_THROW_ON_ERROR));
    verify(WorkspaceConfiguration::build($db, [$directory.'/module.json'], static fn() => [])->registry->fields('items')['title']->sectionCollapsible === false, 'JSON section_collapsible');
    $filling = $module;$filling['resources']['items']['fields'][1] += ['type' => 'textarea', 'section_fill' => true];
    file_put_contents($directory.'/module.json', json_encode($filling, JSON_THROW_ON_ERROR));
    verify(WorkspaceConfiguration::build($db, [$directory.'/module.json'], static fn() => [])->registry->fields('items')['title']->sectionFill === true, 'JSON section_fill');
    // A form row (FB-0196): `row` and `row_width`.
    $row = $module;$row['resources']['items']['fields'][0]['row'] = 'head';$row['resources']['items']['fields'][1] += ['row' => 'head', 'row_width' => 3];unset($row['resources']['items']['fields'][1]['section']);
    file_put_contents($directory.'/module.json', json_encode($row, JSON_THROW_ON_ERROR));
    $rowFields = WorkspaceConfiguration::build($db, [$directory.'/module.json'], static fn() => [])->registry->fields('items');
    verify($rowFields['kind']->row === 'head' && $rowFields['kind']->rowWidth === 1 && $rowFields['title']->row === 'head' && $rowFields['title']->rowWidth === 3, 'JSON row and row_width');
    // operations.form_sections gives the create and update forms their section presentation (FB-0178).
    $accordion = $module;$accordion['resources']['items']['operations'] = ['form_sections' => 'accordion-multiple', 'flush_sections' => true];
    file_put_contents($directory.'/module.json', json_encode($accordion, JSON_THROW_ON_ERROR));
    $built = WorkspaceConfiguration::build($db, [$directory.'/module.json'], static fn() => [])->registry;
    verify($built->get('items', 'create')->formSections === 'accordion-multiple' && $built->get('items', 'update')->formSections === 'accordion-multiple' && $built->get('items', 'update')->flushSections, 'JSON operations.form_sections and flush_sections');
    foreach ([['operations', 'form_sections', 'tabs'], ['operations', 'form_sections', true], ['operations', 'formSections', 'accordion'], ['operations', 'flush_sections', 'yes'], ['operations', 'flush_sections', true], ['storage', 'create_only', 'kind'], ['storage', 'create_only', ['missing']], ['field', 'section', ['More']], ['field', 'section', ''], ['field', 'section_collapsible', 'no'], ['field', 'sectionCollapsible', false], ['field', 'section_fill', 'yes'], ['field', 'section_fill', true], ['field', 'sectionFill', true], ['field', 'row', 'Head'], ['field', 'row', 2], ['field', 'row_width', 2], ['field', 'rowWidth', 2]] as [$where, $key, $value]) {
        $broken = $module;
        if ($where === 'field') $broken['resources']['items']['fields'][1][$key] = $value; else $broken['resources']['items'][$where][$key] = $value;
        file_put_contents($directory.'/module.json', json_encode($broken, JSON_THROW_ON_ERROR));
        rejected(static fn() => WorkspaceConfiguration::build($db, [$directory.'/module.json'], static fn() => []), 'Invalid JSON '.$key.' accepted: '.json_encode($value));
    }
} finally {
    array_map('unlink', glob($directory.'/*') ?: []);
    rmdir($directory);
}

echo "61ade record form contracts passed.\n";
