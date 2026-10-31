<?php
declare(strict_types=1);
namespace Blade\Shell;

/**
 * Application-owned appearance on top of a factory theme: the shell applies `base` with DHTMLX `setTheme` and marks
 * the root with `data-blade-skin="<id>"`; the stylesheet overrides Suite `--dhx-*` variables on that selector.
 * Dark and Blade framework rules and the calendar follow the base. Presentation only; it never grants or limits access.
 */
final readonly class Skin
{
    /** Factory theme names (61ade and DHTMLX Suite) a skin cannot shadow. */
    public const RESERVED = ['blade', 'blade-night', 'light', 'dark', 'contrast-light', 'contrast-dark'];

    public function __construct(
        public string $id,
        /** Localizable label of the selector entry. */
        public string $label,
        /** Browser path of the stylesheet relative to the page (e.g. "skins/brand.css" or "../skins/brand.css?v=2"). */
        public string $stylesheet,
        /** Factory theme the skin refines: light, dark, blade or blade-night. */
        public string $base = 'light',
    ) {
        if (!preg_match('/^[a-z][a-z0-9-]{0,39}$/D', $id) || in_array($id, self::RESERVED, true) || trim($label) === ''
            || !in_array($base, ['light', 'dark', 'blade', 'blade-night'], true)
            || !preg_match('~^(?:/|(?:\.\./)*)?[A-Za-z0-9_-]+(?:/[A-Za-z0-9_-]+)*\.css(?:\?[A-Za-z0-9_.=-]+)?$~D', $stylesheet)) {
            throw new \InvalidArgumentException('Invalid 61ade skin: '.$id);
        }
    }
}
