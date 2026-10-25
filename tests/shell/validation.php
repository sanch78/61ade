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
echo "61de declarative field validation contracts passed.\n";
