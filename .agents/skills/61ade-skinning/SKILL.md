---
name: 61ade-skinning
description: Customize a 61ade application's appearance by extending the Blade (blade/blade-night) or Generic (light/dark) family. Use for project branding, skin CSS, light/dark variants, and skin consistency reviews; preserve the framework's native controls and inherited appearance.
---

# 61ade skinning

Use this skill when a project wants its own appearance on 61ade, or when
reviewing the shared skin families. Read the project's `AGENTS.md`, the
[skinning contract](../../../docs/skinning.md#family-contract),
[application-skin API](../../../docs/shell.md#application-skins) and
[supported CSS hooks](../../../docs/shell.md#sign-in-css-hooks) first. Those
contracts take precedence over this workflow. The 61ade checkout is read-only
in a consumer session; edit the project's own declarations and assets.

## Extend one family

The owner requires every project appearance to extend an existing family:

| Family | Light base | Dark base | Inherited character |
| --- | --- | --- | --- |
| Blade | `blade` | `blade-night` | Blade typography, glossy chrome, selection treatment and motion |
| Generic | `light` | `dark` | Suite light/dark appearance with the shared 61ade presentation layer |

`Generic` is the family name, not a `Skin.base` value. Select an explicit base
for each offered variant; the API's omitted-base default is `light`. Offer
only the variants the project needs. When offering a light/dark pair, derive
both from the chosen family and preserve the same semantic roles.

Start with an unchanged base when it meets the need. If branding needs a
delta, a project-named `Skin` is the supported child of that base. Do not
create a standalone theme, copy a complete vendor/framework stylesheet,
replace native controls, or register another theme engine. Do not recreate
the same independent skin through `stylesheets` or a browser module.

## Declare the delta

1. Declare `Skin(id, label, stylesheet, base: ...)` through the server's
   identity callback. JSON `application.skins` names a binding returning the
   same `list<Skin>`; it does not define another theme format. Localize labels.
2. Keep the stylesheet a small same-origin CSS file. Every application-wide
   override belongs under its exact `[data-blade-skin="<id>"]` root selector:
   all offered skin stylesheets load together, including inactive ones.
3. Override documented Suite `--dhx-*` variables and explicitly documented
   61ade customization properties only. Internal `--blade-*` tokens are not
   automatically public. Keep the chosen family's inherited chrome and
   geometry; Suite colour or radius changes do not recolour or reshape every
   framework surface. Consult the [current limitations](../../../docs/skinning.md#customization-limits).
4. Let the shell set `data-blade-theme`, `data-dhx-theme`, `data-blade-skin`
   and call `setTheme`. Never write these markers or call `setTheme` from the
   project. Avoid internal `.dhx_*`/`.blade-*` selectors; a missing public
   customization hook is a framework request, not a reason to fork the skin.
5. Keep domain-component CSS scoped to the project's own classes through
   `stylesheets`; it should consume inherited semantic variables. Use `logo`,
   `signInStylesheets` and the supported page hooks for sign-in branding.
   Login-only applications have no skin before authentication. Public
   applications retain the public actor's skin behind every sign-in step;
   member-specific skins apply after sign-in.

For example, a Blade-derived project variant is a delta, not a replacement:

```php
$brand = new \Blade\Shell\Skin('brand', 'Brand', 'skins/brand.css', base: 'blade');
```

```css
[data-blade-skin="brand"] {
  --dhx-h-primary: 220;
  --dhx-s-primary: 55%;
  --dhx-l-primary: 42%;
}
```

This changes those Suite roles and retains the Blade character. Do not
promise full rebranding from a primary-colour override. Presentation never
grants or removes rights; the identity callback only selects appearances.

## Verify the offered variants

Use the project's managed URL and browser wrapper. For each offered child
skin, check desktop and narrow layouts, native popups/windows and relevant
components, keyboard focus, selected/marked, disabled, error and focused-error
states, readable contrast, long labels, and reduced motion. Review final
screenshots as well as computed styles: a solid-colour contrast helper does
not measure gradients or overlays.

Check switching and reload persistence, an invalid saved choice, separation
from the factory preference, and isolation from inactive skin stylesheets.
Cover the application's actual member/public/sign-in paths. If it uses a
calendar, verify the Scheduler follows the light/dark base; if it overrides
motion, verify reduced motion still stops it.

Record the base, supported deltas, checked combinations and omitted coverage
in the project's own documentation. For a shared-family review, compare
semantic token roles and state behavior, distinguish intentional family
differences from drift, and update the [consistency assessment](../../../docs/skinning.md#consistency-assessment).
Do not claim visual acceptance from source inspection or a build alone.

For consumer setup use [61ade-consumer](../61ade-consumer/SKILL.md), for
application features use [61ade-application](../61ade-application/SKILL.md),
and for shared record-surface behavior use [61ade-ui](../61ade-ui/SKILL.md).
