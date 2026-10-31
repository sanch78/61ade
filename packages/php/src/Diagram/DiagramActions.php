<?php
declare(strict_types=1);
namespace Blade\Diagram;

use Blade\Feature\{Action, Context, Failure, Field, Registry};
use Blade\I18n\Translator;

/**
 * Registered diagram actions. The ACL object of every action is the diagram space, so rules grant
 * the editor as a whole; the executor has already checked channel, scope and ACL and opened the
 * transaction. Diagram content is validated and stored in canonical form, never as sent.
 */
final class DiagramActions
{
    /** Below the 64 KiB request limit of the JSON channel, with room for the envelope. */
    public const CONTENT_MAX = 60000;
    private const LABEL_MAX = 80;
    private const DETAIL_MAX = 200;
    private const COORDINATE_MAX = 20000;

    public function __construct(private DiagramDefinition $definition, private DiagramStorage $storage)
    {
    }

    public function register(Registry $registry): void
    {
        $resource = $this->definition->resource;
        $space = fn(Context $ctx, ?string $id): array => $this->space($id);
        $diagram = fn(Context $ctx, ?string $id): array => $this->target($id);
        $name = new Field('name', 'Diagram neve', required: true, max: 120);
        $actions = [
            new Action($resource, 'list', 'Diagramok', [], fn(Context $ctx, array $target) => $this->listing(), resolve: $space),
            new Action($resource, 'get', 'Diagram megnyitása', [], fn(Context $ctx, array $target) => $this->document($target['row']), resolve: $diagram),
            new Action($resource, 'create', 'Új diagram', [$name], fn(Context $ctx, array $target, array $values) => $this->create($values['name']), resolve: $space, write: true, icon: 'dxi dxi-plus'),
            new Action($resource, 'save', 'Mentés', [new Field('content', 'Tartalom', 'textarea', required: true, max: self::CONTENT_MAX), new Field('revision', 'Verzió', required: true, max: 20)],
                fn(Context $ctx, array $target, array $values) => $this->save($target['row'], $values['content'], $values['revision']), resolve: $diagram, write: true, icon: 'dxi dxi-content-save'),
            new Action($resource, 'delete', 'Diagram törlése', [], fn(Context $ctx, array $target) => $this->delete($target['row']), resolve: $diagram, write: true, icon: 'dxi dxi-delete',
                confirm: ['message' => 'A diagram véglegesen törlődik.', 'title' => 'Diagram törlése', 'severity' => 'danger', 'confirm_label' => 'Törlés']),
        ];
        if ($this->definition->customTypes) {
            $actions[] = new Action($resource, 'type_create', 'Új elemtípus', [
                new Field('label', 'Megnevezés', required: true, max: 60),
                new Field('glyph', 'Ikon', 'select', required: true, options: DiagramDefinition::GLYPHS),
                new Field('shape', 'Forma', 'select', required: true, options: DiagramDefinition::SHAPES),
                new Field('color', 'Szín', required: true, max: 7, validation: ['pattern' => ['expression' => '^#[0-9a-f]{6}$', 'flags' => 'i', 'message' => 'Szín #rrggbb formában.']]),
            ], fn(Context $ctx, array $target, array $values) => $this->createType($values), resolve: $space, write: true, icon: 'dxi dxi-plus-box');
            $actions[] = new Action($resource, 'type_delete', 'Elemtípus törlése', [], fn(Context $ctx, array $target) => $this->deleteType($target['type']), resolve: fn(Context $ctx, ?string $id) => $this->customType($id), write: true, icon: 'dxi dxi-delete-outline');
        }
        foreach ($actions as $action) $registry->add($action);
        $registry->diagram($resource, $this->definition->title, array_map(static fn($action) => $action->name, $actions), $this->definition->metadata(), $this->definition->group, $this->definition->icon, $this->definition->desktopOnly, guide: $this->definition->guide);
    }

    /** Space-level actions take no id; the ACL object is the space, which never reaches the browser. */
    private function space(?string $id): array
    {
        if ($id !== null) throw new Failure('Ismeretlen diagramtér.', 404);
        return ['id' => null, 'acl_id' => $this->definition->space, 'owner' => null];
    }

    private function target(?string $id): array
    {
        $row = $id !== null && preg_match('/^[1-9][0-9]{0,17}$/D', $id) ? $this->storage->diagram((int) $id) : null;
        if (!$row) throw new Failure('Nem található diagram.', 404);
        return ['id' => (string) $row['id'], 'acl_id' => $this->definition->space, 'owner' => null, 'row' => $row];
    }

    private function customType(?string $id): array
    {
        $known = array_column($this->storage->types(), null, 'type_key');
        if ($id === null || !isset($known[$id])) throw new Failure('Nem található elemtípus.', 404);
        return ['id' => $id, 'acl_id' => $this->definition->space, 'owner' => null, 'type' => $id];
    }

    private function listing(): array
    {
        $rows = $this->storage->diagrams($this->definition->maxDiagrams);
        return [
            'diagrams' => array_map(static fn($row) => ['id' => (string) $row['id'], 'name' => $row['name'], 'modified_at' => $row['modified_at']], array_slice($rows, 0, $this->definition->maxDiagrams)),
            'types' => $this->customTypes(),
        ];
    }

    private function customTypes(): array
    {
        return array_map(static fn($row) => ['id' => $row['type_key'], 'label' => $row['label'], 'glyph' => $row['glyph'], 'color' => $row['color'], 'shape' => $row['shape'], 'custom' => true], $this->storage->types());
    }

    private function document(array $row): array
    {
        return ['id' => (string) $row['id'], 'name' => $row['name'], 'revision' => (string) $row['revision'], 'modified_at' => $row['modified_at'], 'content' => json_decode($row['content'], true)];
    }

    private function create(string $name): array
    {
        if (preg_match('/\p{Cc}|\p{Cf}/u', $name)) throw new Failure('Javítsd a megjelölt mezőket.', 400, ['name' => 'A név nem tartalmazhat vezérlő- vagy formázókaraktert.']);
        if ($this->storage->named($name)) throw new Failure('Javítsd a megjelölt mezőket.', 409, ['name' => 'Ilyen nevű diagram már létezik.']);
        if (count($this->storage->diagrams($this->definition->maxDiagrams)) >= $this->definition->maxDiagrams) throw new Failure('Elérted a diagramok számának korlátját.', 413);
        $id = $this->storage->create($name, json_encode(['nodes' => [], 'links' => []], JSON_THROW_ON_ERROR));
        return ['id' => (string) $id, 'revision' => '1'];
    }

    private function save(array $row, string $content, string $revision): array
    {
        if (!preg_match('/^[1-9][0-9]{0,17}$/D', $revision)) throw new Failure('Hibás verzió.');
        $canonical = json_encode($this->canonical($content), JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE);
        if (!$this->storage->save((int) $row['id'], (int) $revision, $canonical)) throw new Failure('A diagramot közben valaki más módosította. Töltsd be újra.', 409);
        return ['id' => (string) $row['id'], 'revision' => (string) ((int) $revision + 1), 'audit' => ['revision' => (string) ((int) $revision + 1)]];
    }

    private function delete(array $row): array
    {
        $this->storage->delete((int) $row['id']);
        return ['id' => (string) $row['id']];
    }

    private function createType(array $values): array
    {
        if (count($this->storage->types()) >= $this->definition->maxCustomTypes) throw new Failure('Elérted az elemtípusok számának korlátját.', 413);
        $label = $values['label'];
        if (preg_match('/\p{Cc}|\p{Cf}/u', $label)) throw new Failure('Javítsd a megjelölt mezőket.', 400, ['label' => 'A név nem tartalmazhat vezérlő- vagy formázókaraktert.']);
        $taken = array_map(static fn($type) => DiagramStorage::key($type['label']), [...array_values($this->definition->nodeTypes), ...$this->customTypes()]);
        if (in_array(DiagramStorage::key($label), $taken, true)) throw new Failure('Javítsd a megjelölt mezőket.', 409, ['label' => 'Ilyen nevű elemtípus már létezik.']);
        $color = strtolower($values['color']);
        $key = $this->storage->createType($label, $values['glyph'], $color, $values['shape']);
        return ['id' => $key, 'type' => ['id' => $key, 'label' => $label, 'glyph' => $values['glyph'], 'color' => $color, 'shape' => $values['shape'], 'custom' => true]];
    }

    private function deleteType(string $key): array
    {
        $used = $this->storage->usingType($key);
        if ($used) throw new Failure(Translator::text('Az elemtípust még használja: {diagrams}.', ['diagrams' => implode(', ', array_slice($used, 0, 5))]), 409);
        $this->storage->deleteType($key);
        return ['id' => $key];
    }

    /** Validated canonical document: known types, existing endpoints, limits, bounded strings. */
    private function canonical(string $content): array
    {
        try { $data = json_decode($content, true, 8, JSON_THROW_ON_ERROR); } catch (\JsonException) { throw new Failure('Érvénytelen diagramtartalom.'); }
        if (!is_array($data) || array_diff(array_keys($data), ['nodes', 'links']) || !array_is_list($data['nodes'] ?? null) || !array_is_list($data['links'] ?? null)) throw new Failure('Érvénytelen diagramtartalom.');
        if (count($data['nodes']) > $this->definition->maxNodes) throw new Failure(Translator::text('Legfeljebb {count} elem lehet egy diagramon.', ['count' => $this->definition->maxNodes]), 413);
        if (count($data['links']) > $this->definition->maxLinks) throw new Failure(Translator::text('Legfeljebb {count} kapcsolat lehet egy diagramon.', ['count' => $this->definition->maxLinks]), 413);
        $types = [...array_keys($this->definition->nodeTypes), ...array_column($this->storage->types(), 'type_key')];
        $nodes = [];
        foreach ($data['nodes'] as $node) {
            if (!is_array($node) || array_diff(array_keys($node), ['id', 'type', 'label', 'detail', 'x', 'y'])) throw new Failure('Érvénytelen elem.');
            $id = $this->identifier($node['id'] ?? null);
            if (isset($nodes[$id])) throw new Failure('Ismétlődő elemazonosító.');
            if (!in_array($node['type'] ?? null, $types, true)) throw new Failure('Ismeretlen elemtípus.');
            $nodes[$id] = ['id' => $id, 'type' => $node['type'], 'label' => $this->text($node['label'] ?? '', self::LABEL_MAX), 'detail' => $this->text($node['detail'] ?? '', self::DETAIL_MAX),
                'x' => $this->coordinate($node['x'] ?? null), 'y' => $this->coordinate($node['y'] ?? null)];
        }
        $links = [];$pairs = [];
        foreach ($data['links'] as $link) {
            if (!is_array($link) || array_diff(array_keys($link), ['id', 'source', 'target', 'type', 'label'])) throw new Failure('Érvénytelen kapcsolat.');
            $id = $this->identifier($link['id'] ?? null);
            $source = $link['source'] ?? null;$target = $link['target'] ?? null;
            if (isset($links[$id]) || isset($nodes[$id])) throw new Failure('Ismétlődő kapcsolatazonosító.');
            if (!is_string($source) || !is_string($target) || !isset($nodes[$source], $nodes[$target])) throw new Failure('A kapcsolat nem létező elemre hivatkozik.');
            if ($source === $target) throw new Failure('Elem nem köthető önmagához.');
            if (!isset($this->definition->linkTypes[$link['type'] ?? ''])) throw new Failure('Ismeretlen kapcsolattípus.');
            $pair = $source < $target ? $source."\n".$target : $target."\n".$source;
            if (isset($pairs[$pair])) throw new Failure('Két elem között egy kapcsolat lehet.');
            $pairs[$pair] = true;
            $links[$id] = ['id' => $id, 'source' => $source, 'target' => $target, 'type' => $link['type'], 'label' => $this->text($link['label'] ?? '', self::LABEL_MAX)];
        }
        return ['nodes' => array_values($nodes), 'links' => array_values($links)];
    }

    private function identifier(mixed $value): string
    {
        if (!is_string($value) || !preg_match('/^[a-zA-Z0-9_-]{1,40}$/D', $value)) throw new Failure('Érvénytelen azonosító.');
        return $value;
    }

    private function text(mixed $value, int $max): string
    {
        if (!is_string($value) || preg_match('//u', $value) !== 1 || preg_match('/\p{Cc}|\p{Cf}/u', $value) || mb_strlen($value, 'UTF-8') > $max) throw new Failure(Translator::text('Érvénytelen felirat (legfeljebb {count} karakter, vezérlőkarakter nélkül).', ['count' => $max]));
        return trim($value);
    }

    private function coordinate(mixed $value): int
    {
        if (!is_int($value) && !is_float($value) || !is_finite((float) $value) || abs($value) > self::COORDINATE_MAX) throw new Failure('Érvénytelen elemhelyzet.');
        return (int) round($value);
    }
}
