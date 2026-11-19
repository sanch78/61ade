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
// A media field's image width in the details (FB-0218): a media column option 160–800, one spelling.
verify((new Field('x', 'X', column: ['media' => 'files', 'detailsWidth' => 160]))->column['detailsWidth'] === 160 && (new Field('x', 'X', 'file', file: ['resource' => 'files', 'mount' => 'm', 'accept' => ['image']], column: ['details_width' => 800]))->column['details_width'] === 800, 'Details width accepted');
foreach ([['detailsWidth' => 480], ['media' => 'files', 'detailsWidth' => 159], ['media' => 'files', 'detailsWidth' => 801], ['media' => 'files', 'detailsWidth' => '480'], ['media' => 'files', 'detailsWidth' => 480, 'details_width' => 480], ['presentation' => 'image', 'imageBase' => 'img/', 'detailsWidth' => 480]] as $column)
    rejected(static fn() => new Field('x', 'X', column: $column), 'Invalid details width accepted: '.json_encode($column));
// The place of a long text outside the sections (FB-0225): `end`, `row` or `group`, only on a textarea without its own
// display (presentation, editor) and without a section.
foreach (['end', 'row', 'group'] as $placement) verify((new Field('x', 'X', 'textarea', column: ['placement' => $placement, 'cardLines' => 2]))->column['placement'] === $placement, 'Placement accepted: '.$placement);
foreach ([['text', ['placement' => 'row'], null, null], ['select', ['placement' => 'group'], null, null], ['textarea', ['placement' => 'row'], 'S', null], ['textarea', ['placement' => 'group', 'presentation' => 'demo.markdown'], null, null],
    ['textarea', ['placement' => 'row'], null, 'demo.markdown'], ['textarea', ['placement' => 'middle'], null, null], ['textarea', ['placement' => 'Row'], null, null], ['textarea', ['placement' => ''], null, null], ['textarea', ['placement' => true], null, null], ['textarea', ['placement' => ['row']], null, null]] as [$type, $column, $section, $editor])
    rejected(static fn() => new Field('x', 'X', $type, options: $type === 'select' ? ['a' => 'A'] : [], column: $column, section: $section, editor: $editor), 'Invalid placement accepted: '.json_encode([$type, $column, $section, $editor]));
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
// The details width reaches the detail fields and the columns in its browser spelling (FB-0218).
$sized = new Registry();
(new SqlResource('pictures', 'items', 'id', [new Field('title', 'Title', section: 'Data'), new Field('image', 'Image', column: ['media' => 'files', 'details_width' => 480], section: 'Image')]))->register($sized, 'Pictures');
$db->exec("INSERT INTO blade_rules(subject_type, subject_id, resource, action, channel, effect, scope, object_id, field_name) VALUES ('user', '1', 'pictures', 'get', 'ui', 'allow', 'all', '', '')");
$sizedContext = new Context(new Identity('1', 'Synthetic'), 'ui', (new Workspace($sized, $db))->acl, $db);
$sizedOptions = $sized->provider('list')->metadata($sizedContext, $sized->views()[0])['options'];
$sizedDetails = array_column($sizedOptions['detailFields'], null, 'id');
$sizedColumns = array_column($sizedOptions['columns'], null, 'id');
verify(($sizedDetails['image']['detailsWidth'] ?? null) === 480 && !isset($sizedDetails['image']['details_width'], $sizedDetails['title']['detailsWidth']) && ($sizedColumns['image']['detailsWidth'] ?? null) === 480, 'Details width in the detail fields and columns');
// The placement reaches the detail fields (cards and details) and the columns (FB-0225); none without the option.
$placed = new Registry();
(new SqlResource('notes', 'items', 'id', [new Field('title', 'Title', section: 'Data'), new Field('note', 'Note', 'textarea', column: ['placement' => 'row']), new Field('kind', 'Kind', 'textarea')]))->register($placed, 'Notes');
$db->exec("INSERT INTO blade_rules(subject_type, subject_id, resource, action, channel, effect, scope, object_id, field_name) VALUES ('user', '1', 'notes', 'get', 'ui', 'allow', 'all', '', '')");
$placedOptions = $placed->provider('list')->metadata(new Context(new Identity('1', 'Synthetic'), 'ui', (new Workspace($placed, $db))->acl, $db), $placed->views()[0])['options'];
$placedDetails = array_column($placedOptions['detailFields'], null, 'id');
$placedColumns = array_column($placedOptions['columns'], null, 'id');
verify(($placedDetails['note']['placement'] ?? null) === 'row' && ($placedColumns['note']['placement'] ?? null) === 'row' && !isset($placedDetails['kind']['placement'], $placedColumns['kind']['placement'], $placedDetails['title']['placement']), 'Placement in the detail fields and columns');

// Conditional sections (FB-0240): `sectionVisibleWhen` on every field of a section, a condition like `visibleWhen`.
$on = ['field' => 'enabled', 'in' => ['1']];
verify((new Field('x', 'X', 'textarea', section: 'S', sectionVisibleWhen: $on))->metadata()['sectionVisibleWhen'] === $on, 'Section condition in field metadata');
verify(!array_key_exists('sectionVisibleWhen', (new Field('x', 'X', 'textarea', section: 'S', sectionVisibleWhen: $on))->sectionMetadata()) && !array_key_exists('sectionVisibleWhen', (new Field('x', 'X', section: 'S'))->metadata()), 'No section condition in a column or without one');
foreach ([['field' => 'x', 'in' => ['1']], ['field' => 'enabled', 'in' => []], ['field' => 'enabled', 'in' => ['1', '1']], ['field' => 'enabled', 'in' => [1]], ['field' => 'enabled'], ['field' => 'Enabled', 'in' => ['1']], ['field' => 'enabled', 'in' => ['1'], 'not' => true], ['field' => 'enabled', 'in' => array_map('strval', range(1, 51))], ['field' => 'enabled', 'in' => ['a' => '1']]] as $bad)
    rejected(static fn() => new Field('x', 'X', section: 'S', sectionVisibleWhen: $bad), 'Invalid section condition accepted: '.json_encode($bad));
foreach ([
    'without a section' => static fn() => new Field('x', 'X', sectionVisibleWhen: $on),
    'with its own condition' => static fn() => new Field('x', 'X', section: 'S', visibleWhen: ['field' => 'kind', 'in' => ['a']], sectionVisibleWhen: $on),
    'grid-editable' => static fn() => new Field('x', 'X', column: ['editable' => true], section: 'S', sectionVisibleWhen: $on),
    'bulk' => static fn() => new Field('x', 'X', bulk: true, section: 'S', sectionVisibleWhen: $on),
    'secret' => static fn() => new Field('x', 'X', secret: true, section: 'S', sectionVisibleWhen: $on),
    'a file' => static fn() => new Field('x', 'X', 'file', file: $image, section: 'S', sectionVisibleWhen: $on),
] as $case => $declare) rejected($declare, 'A conditional section field '.$case.' accepted');
$enabled = new Field('enabled', 'Enabled', 'checkbox');
rejected(static fn() => (new Registry())->registerFields('mix', [$enabled, new Field('a', 'A', section: 'S', sectionVisibleWhen: $on), new Field('b', 'B', section: 'S')]), 'A section with and without a condition accepted');
rejected(static fn() => (new Registry())->registerFields('mix', [$enabled, new Field('a', 'A', section: 'S', sectionVisibleWhen: $on), new Field('b', 'B', section: 'S', sectionVisibleWhen: ['field' => 'enabled', 'in' => ['0']])]), 'A section with two conditions accepted');
rejected(static fn() => (new Registry())->add(new Action('mix', 'run', 'Run', [new Field('a', 'A', section: 'S'), new Field('b', 'B', section: 'S', sectionVisibleWhen: $on)], $noop)), 'An action section with and without a condition accepted');
rejected(static fn() => (new Registry())->registerFields('unknown', [new Field('a', 'A', section: 'S', sectionVisibleWhen: $on)]), 'A resource section condition on an unknown field accepted');
rejected(static fn() => (new Registry())->registerFields('inside', [new Field('enabled', 'Enabled', 'checkbox', section: 'S'), new Field('a', 'A', section: 'S', sectionVisibleWhen: ['field' => 'enabled', 'in' => ['1']])]), 'A section condition on a field of the section accepted');
rejected(static fn() => (new Registry())->registerFields('chain', [new Field('kind', 'Kind', visibleWhen: ['field' => 'title', 'in' => ['x']]), new Field('a', 'A', section: 'S', sectionVisibleWhen: ['field' => 'kind', 'in' => ['a']])]), 'A section condition on a conditional field accepted');
rejected(static fn() => (new Registry())->registerFields('chain', [$enabled, new Field('kind', 'Kind', section: 'T', sectionVisibleWhen: $on), new Field('a', 'A', section: 'S', sectionVisibleWhen: ['field' => 'kind', 'in' => ['a']])]), 'A section condition on a field of a conditional section accepted');
rejected(static fn() => new Action('chain', 'run', 'Run', [$enabled, new Field('kind', 'Kind', section: 'T', sectionVisibleWhen: $on), new Field('a', 'A', visibleWhen: ['field' => 'kind', 'in' => ['a']])], $noop), 'A field condition on a field of a conditional section accepted');
rejected(static fn() => (new Registry())->registerFields('box', [$enabled, new Field('a', 'A', section: 'S', sectionVisibleWhen: ['field' => 'enabled', 'in' => ['true']])]), 'A checkbox section condition outside "0"/"1" accepted');
// An action may name a condition field it does not carry (the stored record's value decides).
(new Registry())->add(new Action('stored', 'run', 'Run', [new Field('a', 'A', section: 'S', sectionVisibleWhen: $on), new Field('b', 'B', section: 'S', sectionVisibleWhen: $on)], $noop));
// Stored values: a field of an inactive section is neither validated nor stored (its stored value stays); the client
// sends it or not. An inactive conditional field (`visibleWhen`) is still stored empty when it or its condition is sent.
$db->exec("CREATE TABLE webs (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 0, mode TEXT NOT NULL DEFAULT 'a', proxy TEXT NOT NULL DEFAULT '', php TEXT NOT NULL DEFAULT '', legacy TEXT NOT NULL DEFAULT '', alpha TEXT NOT NULL DEFAULT '', beta TEXT NOT NULL DEFAULT '')");
$conditional = new Registry();
(new SqlResource('webs', 'webs', 'id', [
    new Field('title', 'Title', required: true),
    new Field('enabled', 'Enabled', 'checkbox'),
    new Field('mode', 'Mode', 'select', options: ['a' => 'A', 'b' => 'B']),
    new Field('proxy', 'Proxy', 'textarea', required: true, max: 1000, section: 'Proxy', sectionFill: true, sectionVisibleWhen: $on),
    new Field('php', 'PHP', 'textarea', max: 1000, section: 'PHP', sectionFill: true, sectionVisibleWhen: $on),
    new Field('legacy', 'Legacy', visibleWhen: $on),
    new Field('alpha', 'Alpha', required: true, section: 'Alpha', sectionVisibleWhen: ['field' => 'mode', 'in' => ['a']]),
    new Field('beta', 'Beta', required: true, section: 'Beta', sectionVisibleWhen: ['field' => 'mode', 'in' => ['b']]),
]))->register($conditional, 'Webs');
$web = new Workspace($conditional, $db);
$webContext = new Context(new Identity('1', 'Synthetic'), 'ui', $web->acl, $db);
foreach (['list', 'get', 'create', 'update'] as $action) $db->exec("INSERT INTO blade_rules(subject_type, subject_id, resource, action, channel, effect, scope, object_id, field_name) VALUES ('user', '1', 'webs', '$action', 'ui', 'allow', 'all', '', '')");
$web->acl->invalidate();
$stored = static fn(string $id) => $db->query('SELECT enabled, mode, proxy, php, legacy, alpha, beta FROM webs WHERE id = '.(int) $id)->fetch(PDO::FETCH_ASSOC);
$revisionOf = static fn(string $id) => $web->describe($webContext, $conditional->get('webs', 'update'), $id)['values']['revision'];
$webForm = array_column($web->describe($webContext, $conditional->get('webs', 'create'), null)['fields'], null, 'name');
verify(($webForm['proxy']['sectionVisibleWhen'] ?? null) === $on && !isset($webForm['legacy']['sectionVisibleWhen'], $webForm['title']['sectionVisibleWhen']), 'Section condition in the form description');
$webId = (string) $web->executor->execute($webContext, 'webs', 'create', null, ['title' => 'One', 'enabled' => true, 'mode' => 'a', 'proxy' => 'P1', 'php' => 'H1', 'legacy' => 'L1', 'alpha' => 'A1', 'beta' => 'B0'])['id'];
verify($stored($webId) === ['enabled' => 1, 'mode' => 'a', 'proxy' => 'P1', 'php' => 'H1', 'legacy' => 'L1', 'alpha' => 'A1', 'beta' => ''], 'Create stores the active sections only: '.json_encode($stored($webId)));
// Off: the hidden required proxy is not validated; the sent (even changed or emptied) texts are not stored.
$web->executor->execute($webContext, 'webs', 'update', $webId, ['title' => 'One', 'enabled' => false, 'mode' => 'a', 'proxy' => '', 'php' => 'changed', 'legacy' => 'L2', 'alpha' => 'A1', 'revision' => $revisionOf($webId)]);
verify($stored($webId) === ['enabled' => 0, 'mode' => 'a', 'proxy' => 'P1', 'php' => 'H1', 'legacy' => '', 'alpha' => 'A1', 'beta' => ''], 'Inactive sections keep their stored values, a conditional field is emptied: '.json_encode($stored($webId)));
// On again: the kept texts are back and validated again.
failed(static fn() => $web->executor->execute($webContext, 'webs', 'update', $webId, ['enabled' => '1', 'proxy' => '', 'revision' => $revisionOf($webId)]), 400, 'An active required section field left empty');
$web->executor->execute($webContext, 'webs', 'update', $webId, ['title' => 'One', 'enabled' => '1', 'mode' => 'a', 'proxy' => 'P2', 'php' => 'H1', 'alpha' => 'A1', 'revision' => $revisionOf($webId)]);
verify($stored($webId)['proxy'] === 'P2' && $stored($webId)['php'] === 'H1', 'An active section stores its fields');
// A select controller: one section per value; the other value's section keeps its text and is not required.
failed(static fn() => $web->executor->execute($webContext, 'webs', 'update', $webId, ['title' => 'One', 'enabled' => '1', 'mode' => 'b', 'proxy' => 'P2', 'alpha' => '', 'revision' => $revisionOf($webId)]), 400, 'The active section of a select value left empty');
$web->executor->execute($webContext, 'webs', 'update', $webId, ['title' => 'One', 'enabled' => '1', 'mode' => 'b', 'proxy' => 'P2', 'alpha' => '', 'beta' => 'B1', 'revision' => $revisionOf($webId)]);
verify($stored($webId)['alpha'] === 'A1' && $stored($webId)['beta'] === 'B1', 'Select sections: the inactive one keeps its value: '.json_encode($stored($webId)));
// A create with the sections off stores nothing for them (their column defaults), the hidden required fields unchecked.
$offId = (string) $web->executor->execute($webContext, 'webs', 'create', null, ['title' => 'Off', 'enabled' => '0', 'mode' => 'b', 'proxy' => 'typed', 'beta' => 'B2'])['id'];
verify($stored($offId) === ['enabled' => 0, 'mode' => 'b', 'proxy' => '', 'php' => '', 'legacy' => '', 'alpha' => '', 'beta' => 'B2'], 'Create with inactive sections: '.json_encode($stored($offId)));
// A condition on a boolean counts it as "1"/"0" (also `visibleWhen`), as the browser does.
verify((new Field('x', 'X', section: 'S', sectionVisibleWhen: ['field' => 'enabled', 'in' => ['0']]))->active(['enabled' => false]) && !(new Field('x', 'X', visibleWhen: ['field' => 'enabled', 'in' => ['0']]))->active(['enabled' => true]), 'Boolean condition values');

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
    // A conditional section (FB-0240): `section_visible_when`, shaped like `visible_when`.
    $gated = $module;$gated['resources']['items']['fields'][1]['section_visible_when'] = ['field' => 'kind', 'in' => ['a']];
    file_put_contents($directory.'/module.json', json_encode($gated, JSON_THROW_ON_ERROR));
    verify(WorkspaceConfiguration::build($db, [$directory.'/module.json'], static fn() => [])->registry->fields('items')['title']->sectionVisibleWhen === ['field' => 'kind', 'in' => ['a']], 'JSON section_visible_when');
    foreach ([['field' => 'kind'], ['field' => 'kind', 'in' => 'a'], ['field' => 'nothing', 'in' => ['a']], 'kind'] as $bad) {
        $gated['resources']['items']['fields'][1]['section_visible_when'] = $bad;
        file_put_contents($directory.'/module.json', json_encode($gated, JSON_THROW_ON_ERROR));
        rejected(static fn() => WorkspaceConfiguration::build($db, [$directory.'/module.json'], static fn() => []), 'Invalid JSON section_visible_when accepted: '.json_encode($bad));
    }
    // A long text's `column.placement` (FB-0225): a textarea outside the sections.
    $placing = $module;$placing['resources']['items']['fields'][1] = ['name' => 'title', 'label' => 'Title', 'type' => 'textarea', 'column' => ['placement' => 'group']];
    file_put_contents($directory.'/module.json', json_encode($placing, JSON_THROW_ON_ERROR));
    verify(WorkspaceConfiguration::build($db, [$directory.'/module.json'], static fn() => [])->registry->fields('items')['title']->column['placement'] === 'group', 'JSON column.placement');
    $placing['resources']['items']['fields'][1]['section'] = 'More';
    file_put_contents($directory.'/module.json', json_encode($placing, JSON_THROW_ON_ERROR));
    rejected(static fn() => WorkspaceConfiguration::build($db, [$directory.'/module.json'], static fn() => []), 'JSON column.placement on a sectioned field accepted');
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
    foreach ([['operations', 'form_sections', 'tabs'], ['operations', 'form_sections', true], ['operations', 'formSections', 'accordion'], ['operations', 'flush_sections', 'yes'], ['operations', 'flush_sections', true], ['storage', 'create_only', 'kind'], ['storage', 'create_only', ['missing']], ['field', 'section', ['More']], ['field', 'section', ''], ['field', 'section_collapsible', 'no'], ['field', 'sectionCollapsible', false], ['field', 'section_fill', 'yes'], ['field', 'section_fill', true], ['field', 'sectionFill', true], ['field', 'row', 'Head'], ['field', 'row', 2], ['field', 'row_width', 2], ['field', 'rowWidth', 2], ['field', 'column', ['placement' => 'row']]] as [$where, $key, $value]) {
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
