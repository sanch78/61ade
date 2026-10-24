<?php
declare(strict_types=1);
namespace Blade\Diagram;

use Blade\Feature\Workspace;

/**
 * Visual node-and-link editor over DiagramStorage. The consumer declares the space, the palette of
 * element (node) types, the connection (link) types and limits; users may add element types at
 * runtime when `customTypes` is on. Every operation is a registered action through the executor.
 */
final readonly class DiagramDefinition
{
    /** Framework glyph set drawn by the editor; consumer and custom types pick one by key. */
    public const GLYPHS = ['router' => 'Router', 'switch' => 'Switch', 'server' => 'Szerver', 'firewall' => 'Tűzfal', 'cloud' => 'Felhő', 'workstation' => 'Munkaállomás',
        'laptop' => 'Laptop', 'access-point' => 'Hozzáférési pont', 'printer' => 'Nyomtató', 'database' => 'Adatbázis', 'phone' => 'Telefon', 'globe' => 'Internet',
        'storage' => 'Tároló', 'camera' => 'Kamera', 'box' => 'Általános'];
    public const SHAPES = ['rect' => 'Téglalap', 'round' => 'Lekerekített', 'circle' => 'Kör', 'diamond' => 'Rombusz'];
    public const LINK_STYLES = ['solid', 'dashed', 'dotted'];
    /** Colours offered for runtime element types; consumer types may use any #rrggbb value. */
    public const COLORS = ['#0288d1', '#00897b', '#43a047', '#f9a825', '#ef6c00', '#e53935', '#8e24aa', '#5c6bc0', '#6d4c41', '#546e7a'];

    /**
     * @param array<string,array{label:string,glyph:string,color:string,shape?:string}> $nodeTypes
     * @param array<string,array{label:string,color:string,style?:string,width?:int}> $linkTypes
     */
    public function __construct(
        public string $resource,
        public string $title,
        public string $space,
        public array $nodeTypes,
        public array $linkTypes,
        public bool $customTypes = true,
        public int $maxNodes = 300,
        public int $maxLinks = 600,
        public int $maxDiagrams = 200,
        public int $maxCustomTypes = 40,
        public ?string $group = null,
        public ?string $icon = 'dxi dxi-line-connect',
        public bool $desktopOnly = false,
    ) {
        if (!preg_match('/^[a-z][a-z0-9_.-]*$/D', $resource) || $title === '' || !$nodeTypes || !$linkTypes || count($nodeTypes) > 60 || count($linkTypes) > 20) throw new \InvalidArgumentException('Invalid diagram definition.');
        foreach ($nodeTypes as $key => $type) {
            if (!is_string($key) || !preg_match('/^[a-z][a-z0-9_-]{0,39}$/D', $key) || str_starts_with($key, 'custom-') || !is_array($type) || array_diff_key($type, ['label' => 1, 'glyph' => 1, 'color' => 1, 'shape' => 1])
                || !is_string($type['label'] ?? null) || $type['label'] === '' || !isset(self::GLYPHS[$type['glyph'] ?? ''])
                || !self::color($type['color'] ?? null) || !isset(self::SHAPES[$type['shape'] ?? 'round'])) throw new \InvalidArgumentException('Invalid diagram element type.');
        }
        foreach ($linkTypes as $key => $type) {
            if (!is_string($key) || !preg_match('/^[a-z][a-z0-9_-]{0,39}$/D', $key) || !is_array($type) || array_diff_key($type, ['label' => 1, 'color' => 1, 'style' => 1, 'width' => 1])
                || !is_string($type['label'] ?? null) || $type['label'] === '' || !self::color($type['color'] ?? null)
                || !in_array($type['style'] ?? 'solid', self::LINK_STYLES, true) || !is_int($type['width'] ?? 2) || ($type['width'] ?? 2) < 1 || ($type['width'] ?? 2) > 6) throw new \InvalidArgumentException('Invalid diagram link type.');
        }
        if ($maxNodes < 1 || $maxNodes > 2000 || $maxLinks < 0 || $maxLinks > 4000 || $maxDiagrams < 1 || $maxDiagrams > 1000 || $maxCustomTypes < 0 || $maxCustomTypes > 200) throw new \InvalidArgumentException('Invalid diagram limit.');
    }

    public static function color(mixed $value): bool { return is_string($value) && preg_match('/^#[0-9a-f]{6}$/D', $value) === 1; }

    public function storage(\PDO $db): DiagramStorage { return new DiagramStorage($db, $this->space); }

    /** Explicit setup step. */
    public function install(\PDO $db): void { DiagramStorage::install($db); }

    public function register(Workspace $workspace): void
    {
        (new DiagramActions($this, $this->storage($workspace->db)))->register($workspace->registry);
    }

    /** Browser configuration only: palette, connection types and limits; no SQL or rules. */
    public function metadata(): array
    {
        return [
            'nodeTypes' => array_map(static fn($key, $type) => ['id' => $key, 'label' => $type['label'], 'glyph' => $type['glyph'], 'color' => $type['color'], 'shape' => $type['shape'] ?? 'round', 'custom' => false], array_keys($this->nodeTypes), $this->nodeTypes),
            'linkTypes' => array_map(static fn($key, $type) => ['id' => $key, 'label' => $type['label'], 'color' => $type['color'], 'style' => $type['style'] ?? 'solid', 'width' => $type['width'] ?? 2], array_keys($this->linkTypes), $this->linkTypes),
            'glyphs' => self::GLYPHS, 'shapes' => self::SHAPES, 'colors' => self::COLORS,
            'customTypes' => $this->customTypes, 'maxNodes' => $this->maxNodes, 'maxLinks' => $this->maxLinks,
        ];
    }
}
