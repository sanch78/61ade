# Icons

61ade bundles [Bootstrap Icons](https://icons.getbootstrap.com/) 1.13.2
(MIT, over 2000 icons). The shell, built-in commands, file/media views,
tree controls, player controls and demos use this catalog. Projects choose
icons through the existing PHP, JSON and toolkit `icon` properties.

## Usage

Use the class pair `bi bi-<name>` from the catalog, for example
`bi bi-camera-video`, `bi bi-music-note-beamed`, `bi bi-person`,
`bi bi-cloud` or `bi bi-pencil`:

```php
$registry->updateView($view->with(icon: 'bi bi-camera-video'));
```

```json
{
    "icon": "bi bi-camera-video"
}
```

```ts
const bar = new app.components.CommandBar({ items: [
  { id: "play", label: app.i18n.t("Lejátszás"), icon: "bi bi-play-fill", iconOnly: true },
] });
```

The same classes work for menu entries, actions, command bars, popup entries
and registered media types. A record field with `column.presentation: "icon"`
uses these class pairs as its values and maps every value to a non-empty
accessible name through static `options`:

```php
new Blade\Feature\Field('kind', 'Típus', 'select', options: [
    'bi bi-camera-video' => 'Videó',
    'bi bi-music-note-beamed' => 'Hang',
], column: ['presentation' => 'icon']);
```

Buttons keep their translated label as their accessible name, including
icon-only buttons. Their glyphs are decorative. Table, card, tile and detail
icon fields preserve the field's accessible name. Icons inherit native
widget sizing, theme colours and disabled states in Blade, Blade Night,
light and dark; they do not add permissions or actions. Icon replacement
preserves established row, window and media-slot dimensions and native icon
sizes. Previously unavailable glyphs now occupy the normal icon slot, so a
content-sized button can gain width when its missing icon becomes visible.
The demo's `Előzmények` and `Modell` buttons use the normal 20 px icon slot
and keep their full captions, as chosen by the owner.
Menu count badges, labels and icons share a vertical centre without changing
the menu row or badge height. A menu command's entire icon/label/count group
is centred on the button and its painted pill, including commands without
a count and the icon-only form. There is no new event or audit operation.

## Packaging and compatibility

The frontend dependency is pinned in `packages/frontend/package.json` and the
root lockfile. The build embeds its WOFF2 font into `admin.css` and includes the
complete MIT notice. Consumers continue to copy only `admin.js` and `admin.css`:
no Bootstrap framework, extra asset, browser CDN request or consumer install
is required. Existing file-derived cache keys refresh the assets on reload.

Legacy `dxi dxi-…` classes remain supported, including record icon values.
The former `blade-icon blade-icon--…` glyphs remain aliases to Bootstrap
Icons. `repeat` and `repeat-off` share `bi-repeat`; the control's pressed state
conveys whether repeat is active. Native DHTMLX controls still generate their
own internal Suite icons; the framework does not patch vendor rendering.
There is no database rewrite: stored legacy icon values continue to display.

Choose a name present in the pinned catalog; an unknown glyph name displays
no icon. The server validates class syntax, not catalog membership. Icon
columns accept exactly `bi bi-<name>` or legacy `dxi dxi-<name>`; arbitrary
markup and extra classes are not accepted by their renderer.

## Verification

On the [managed feature demo](https://demo.61ade.com/), open `Munkaasztal`
and check its history and model buttons. The file manager/media viewer and
player controls show the same catalog. Switch among all four themes and
narrow the viewport: icons keep their names, colours and menu behavior.
Build/typecheck and affected shell, command-bar, media and presentation checks
use the existing [development workflow](development.md#focused-task-groups).
Recorded results: [FB-0203](feedback.md#fb-0203).
