# Skin families and customization

<a id="family-contract"></a>

## Family contract

Owner decision of 2026-11-13: a project's own appearance must extend the
existing Blade or Generic family. Keep the inherited theme and native
controls; express the project appearance as scoped differences. A standalone
replacement skin, a copy of the framework/vendor CSS, or another theme engine
is outside this contract. The agent workflow is
[61ade-skinning](../.agents/skills/61ade-skinning/SKILL.md).

| Family | `Skin.base`, light | `Skin.base`, dark | Character retained by a child skin |
| --- | --- | --- | --- |
| Blade | `blade` | `blade-night` | Blade typography, glossy chrome, shared selection and region motion |
| Generic | `light` | `dark` | Suite light/dark with the common 61ade presentation layer |

Generic names the existing light/dark family; it is not an API identifier.
There are four bases, not a fifth `generic` theme. A project-named `Skin`
remains supported as a child of one of those bases. Choose its base explicitly
even though the constructor defaults to `light`. A project offering both
light and dark variants derives them from the same family. One variant is
sufficient when that is the project's requirement.

The [application-skin API](shell.md#application-skins) owns identity selection,
base application, stylesheet order, caching and saved choice. Its existing
four-value base validation already supports this rule. The scoped-delta rule
is an authoring contract: the runtime validates IDs, bases and paths, but does
not inspect CSS contents or prevent an author from writing broad selectors.
This decision changes no PHP/JSON signature or runtime default.

All offered skin stylesheets are linked together. Scope application-wide
differences to `[data-blade-skin="<id>"]` so an inactive variant cannot alter
the active one. Use documented Suite custom properties and explicitly
documented 61ade customization properties. Keep project domain CSS under its
own classes and the [supported CSS hooks](shell.md#sign-in-css-hooks); it must
not replace the shared skin through internal widget selectors. The shell
owns theme application and root theme attributes.

<a id="customization-limits"></a>

## Customization limits

The Suite and 61ade character layers have different jobs. Changing a Suite
primary colour does not automatically recolour the shared blue/cyan accents,
selection gradients, canvases or Blade chrome. Likewise,
`--dhx-border-radius` is not one radius for every framework surface: controls,
panels and record cards have separate geometry. Preserve the chosen family's
character rather than compensating with selectors on private classes.

Not every `--blade-*` implementation token is public. Properties explicitly
documented for customization include the logo dimensions in the
[CSS hooks](shell.md#sign-in-css-hooks), the
[motion duration](shell.md#theme-motion) and the card hover edge in
[61ade character](shell.md#61ade-character). An application that needs another
shared visual capability requests a public hook from 61ade; its consumer
session does not modify this library or fork its stylesheet. A complete public
brand-token inventory remains a proposed improvement below.

<a id="consistency-assessment"></a>

## Consistency assessment — 2026-11-13

The architecture is coherent enough to make inheritance mandatory. The skin
sets are **not yet fully consistent or fully qualified**: a focused-error
style has different precedence between families, customization tokens do not
form a complete public set, and several state/base combinations lack browser
coverage. Intentional colour, chrome, typography and motion differences
between the two families are not defects.

Scope: the four factory bases, the two demo child skins, the theme loader,
shared CSS, component adapters, skin declarations and established tests.
Source baseline: `8a18bb0`; unrelated form-layout work in progress was outside
the assessment. Findings concern existing theme sources. Consumer runtimes
were not inspected or changed.

### Structural comparison

| Area | Assessment | Evidence |
| --- | --- | --- |
| Base selection and inheritance | Consistent. Four accepted bases; Blade Night applies Suite `dark`, with its factory lineage retained separately. | [Skin](../packages/php/src/Shell/Skin.php), [AdminShell](../packages/frontend/src/AdminShell.ts) constructor theme application |
| Blade pair palette | Symmetric. Both palette blocks define the same 30 `--blade-*` properties. The Suite overrides differ intentionally (18 in Blade, 15 in Night), because Night inherits the dark background roles. | [blade.css](../packages/frontend/src/themes/blade.css), the two palette blocks |
| Generic and common layer | Shared. Fourteen root `--blade-*` defaults and dark refinements supply common character; Generic is not an unstyled Suite installation. | [character.css](../packages/frontend/src/themes/character.css), root defaults and dark block |
| CSS layering | Coherent. Suite, low-specificity Blade chrome, admin rules, common character and Blade palette are bundled in order; offered skin CSS and project stylesheets follow. | [admin.ts](../packages/frontend/src/admin.ts), [shell template](../packages/php/templates/shell.php) |
| Dark adapters | Shared base semantics. Calendar maps Suite variables to Scheduler; uploader and media use the applied dark base rather than a child skin ID. | [calendar.css](../packages/frontend/src/calendar.css), [uploader.css](../packages/frontend/src/uploader.css), [media.css](../packages/frontend/src/components/media/media.css) |
| Motion | Intentional difference. Blade defaults to 200 ms; Generic defaults to no region motion. A child can opt in/out; reduced motion is also enforced in JavaScript and custom durations are capped. | [blade.css](../packages/frontend/src/themes/blade.css), [Motion.ts](../packages/frontend/src/Motion.ts) |

### Findings and follow-up

1. **Focused validation appearance differs between families — medium priority.**
   In [character.css](../packages/frontend/src/themes/character.css), the
   Generic focused-input/textarea selector has specificity `(0,4,0)` and
   supplies a primary-colour shadow. It outranks the installed Suite error
   selector `.dhx_form-group--state_error .dhx_input:focus` at `(0,3,0)`.
   The error shadow is therefore replaced while focus remains; the error
   caption and validation behavior remain intact. The combobox focus wrapper
   has a related precedence risk. [Blade chrome](../packages/frontend/src/themes/blade-chrome.css)
   uses `:where(...)` to let native state styles win. Follow-up: lower the
   Generic specificity or exclude error states, then verify focused invalid
   inputs and comboboxes across all four bases. This finding is from source
   and installed CSS, not a new browser reproduction. No CSS was changed.
2. **Brand and geometry customization are only partly tokenized.**
   The [Slate](../examples/demo-app/public/skins/demo-slate.css) and
   [Ink](../examples/demo-app/public/skins/demo-ink.css) examples override 11
   and 8 Suite variables respectively, while independent character colours
   remain inherited. Native radius, `--blade-control-radius`,
   `--blade-radius` and fixed card/tile radii also serve different roles.
   This is a limit of customization, not proof that each different radius or
   inherited accent is a defect. Follow-up: publish the supported semantic
   colour/state/geometry tokens before promising complete project rebranding;
   do not expose all implementation tokens as public API by implication.
3. **Documentation had drifted from inheritance and identity behavior.**
   The skin guide described only signed-in actors, omitted `base` from its
   bootstrap description, restricted all customization to Suite variables
   despite documented 61ade properties, and described only the Suite root
   hook. This change corrects those statements in [shell](shell.md#application-skins),
   [usage](usage.md) and the application skill. Public actors can carry skins
   behind sign-in steps; the Blade factory hook is distinct from Suite dark.
4. **Browser coverage does not prove whole-family consistency.**
   The matrix below covers useful common controls, but there is no established
   Blade-derived child skin, public-actor skin scenario, or complete
   cross-family focused-error/disabled/motion matrix. Add those combinations
   when qualifying or changing the affected capability; they are proposed
   follow-up work, not implementation claims.

### Established coverage

These are source-backed descriptions of existing tests, not new pass results.

| Test area | Present coverage | Important limit |
| --- | --- | --- |
| [SettingsForm](../tests/shell/settings-form.spec.cjs), `view controls render in …` | All four bases plus Slate/Ink, 1366 and 390 px; selected text contrast, pressed state, overflow and page errors | Selected controls only; its [contrast helper](../tests/shell/view-controls.cjs) composites solid background colours and does not measure gradients or overlays |
| [Skins](../tests/shell/skins.spec.cjs) | One/multiple Generic-derived skins, variables, switching, reload, fallback and factory-choice isolation, unskinned user/sign-in | No Blade-derived skin or public-identity skin |
| [Sign-in branding](../tests/shell/sign-in-branding.spec.cjs) | Supported hooks/order, light/dark logos, dark child skin, narrow layout | No four-base matrix |
| [Theme motion](../tests/shell/theme-motion.spec.cjs) | Blade versus light, reduced-motion Blade, region/tree behavior | No child-skin duration or full family matrix |
| [Mobile grid](../tests/shell/mobile-grid.spec.cjs) | Keyboard and visible focus under Blade/light/dark | Blade Night and full invalid/disabled-state matrix absent |
| [Calendar](../tests/shell/calendar.spec.cjs) | Dark Scheduler and Suite background mapping | Inherited dark/Blade Night calendar combinations absent |
| [Configuration](../tests/shell/configuration.php), [toolkit](../tests/shell/toolkit.php) | Skin binding and rejected declarations; asset order and cache keys | No parameterized success matrix for all four bases |

### Verification in this assessment

The documentation and skill receive metadata, local-link and whitespace
validation. A focused managed-demo browser run was requested through
`npm run test:browser` for the three skin cases and six common-control matrix
cases. A new cold asset
cache initially failed before browser launch with
`Vendor asset integrity mismatch: dhx-icons.css`; the existing cache matches
the committed hashes. Reusing those verified cached bytes retains the normal
integrity check. With that cache the wrapper reached the managed development
guard, which refused both attempts with exit 75 because another check was
running. No browser was launched; none of the nine cases is reported as a new
pass. This cold-fetch reproducibility issue is separate from skin-state
correctness and is not resolved by this documentation change.

This assessment does not certify every component, rendered gradient contrast
or full accessibility compliance. Runtime CSS/token improvements above remain
follow-up proposals.
