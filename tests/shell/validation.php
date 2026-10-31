<?php

declare(strict_types=1);

require dirname(__DIR__, 2).'/examples/demo-app/vendor/autoload.php';

use Blade\Feature\Field;
use Blade\Feature\Failure;

function verify(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

$field = new Field('contact', 'Contact', required: true, max: 40, validation: [
    'min_length' => 3,
    'pattern' => ['expression' => '^[a-z]+@[a-z]+\\.[a-z]{2,}$', 'flags' => 'i', 'message' => 'Invalid contact.'],
]);
foreach (['', 'ab', 'invalid', 'a@b.c', str_repeat('x', 41)] as $value) {
    try {
        $field->validate($value);
        throw new RuntimeException('Invalid contact accepted');
    } catch (Failure $error) {
        verify(isset($error->fieldErrors['contact']), 'Field-level error');
    }
}
verify($field->validate(' A@B.test ') === 'A@B.test', 'Trimming and case-insensitive portable pattern');
$confirmation = new Field('confirmation', 'Confirmation', 'password', true, secret: true, validation: ['matches_field' => 'password']);
try {
    $confirmation->validate('one', values: ['password' => 'two']);
    throw new RuntimeException('Mismatch accepted');
} catch (Failure $error) {
    verify(isset($error->fieldErrors['confirmation']), 'Cross-field error');
}
verify($confirmation->validate(' space ', values: ['password' => ' space ']) === ' space ', 'Secret whitespace preserved');
$day = new Field('day', 'Day', 'date', max: 10);
verify($day->validate(' 2024-02-29 ') === '2024-02-29' && $day->validate('') === '', 'Calendar date and empty optional date');
foreach (['2023-02-29', '2024-13-01', '2024-1-01', '01.02.2024', '2024-02-01T00:00'] as $value) {
    try { $day->validate($value); throw new RuntimeException('Invalid date accepted: '.$value); } catch (Failure $error) { verify(isset($error->fieldErrors['day']), 'Date field error'); }
}
foreach ([fn() => new Field('day', 'Day', 'date', max: 9), fn() => new Field('day', 'Day', 'date', secret: true)] as $invalid) {
    try { $invalid(); throw new RuntimeException('Invalid date field accepted'); } catch (InvalidArgumentException) {}
}
$unicode = new Field('name', 'Name', max: 2);
verify($unicode->validate('á🦉') === 'á🦉', 'Unicode character length');
foreach ([['unknown' => true], ['min_length' => -1], ['pattern' => ['expression' => '[']]] as $rules) {
    try {
        new Field('test', 'Test', validation: $rules);
        throw new RuntimeException('Invalid validation definition accepted');
    } catch (InvalidArgumentException) {}
}
// Optional selects accept the explicit empty choice; required selects and unknown values do not.
$optional = new Field('state', 'State', 'select', options: ['a' => 'A']);
verify($optional->validate('') === '' && $optional->validate('a') === 'a', 'Optional select accepts empty value');
foreach ([[$optional, 'x'], [new Field('state', 'State', 'select', required: true, options: ['a' => 'A']), '']] as [$select, $value]) {
    try { $select->validate($value); throw new RuntimeException('Invalid select value accepted'); } catch (Failure $failure) { verify(isset($failure->fieldErrors['state']), 'Select field error'); }
}
// Composite unique keys may only name declared field, default or owner columns.
new Blade\Feature\SqlResource('items', 'items', 'id', [new Field('a', 'A')], defaults: ['kind' => 'x'], unique: [['a', 'kind']]);
foreach ([[['missing']], [[]], [['a', 'a']], ['a']] as $unique) {
    try { new Blade\Feature\SqlResource('items', 'items', 'id', [new Field('a', 'A')], unique: $unique); throw new RuntimeException('Invalid unique key accepted'); } catch (InvalidArgumentException) {}
}
// Range ends (`not_before_field`, `not_after_field`): dates and text compare as strings, nonnegative integers as
// numbers; an empty other end is open; the browser's FormValidation repeats the check.
$from = new Field('valid_from', 'From', 'date', max: 10, validation: ['not_after_field' => 'valid_to']);
$to = new Field('valid_to', 'To', 'date', max: 10, validation: ['not_before_field' => 'valid_from']);
verify($to->validate('2026-03-02', values: ['valid_from' => '2026-03-01']) === '2026-03-02' && $to->validate('2026-03-01', values: ['valid_from' => '2026-03-01']) === '2026-03-01'
    && $to->validate('2026-03-01', values: ['valid_from' => '']) === '2026-03-01' && $from->validate('2026-03-01', values: []) === '2026-03-01', 'Range end on or after its start; an open end');
foreach ([[$to, '2026-02-28', ['valid_from' => '2026-03-01']], [$from, '2026-03-02', ['valid_to' => '2026-03-01']]] as [$end, $value, $values]) {
    try { $end->validate($value, values: $values); throw new RuntimeException('Range violation accepted'); }
    catch (Failure $error) { verify(isset($error->fieldErrors[$end->name]), 'Range violation is a field error'); }
}
$most = new Field('most', 'Most', 'number', validation: ['not_before_field' => 'least']);
verify($most->validate('10', values: ['least' => '9']) === '10', 'Integers compare as numbers (10 is not before 9)');
try { $most->validate('9', values: ['least' => '10']); throw new RuntimeException('Numeric range violation accepted'); } catch (Failure) {}
try { new Field('bad', 'Bad', validation: ['not_before_field' => 'Not a name']); throw new RuntimeException('Invalid range rule accepted'); } catch (InvalidArgumentException) {}
echo "61ade declarative field validation contracts passed.\n";
