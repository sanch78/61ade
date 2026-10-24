# DHTMLX component and capability matrix

Historical upstream review: 2026-10-16; 61de source/test status: 2026-10-23.
Suite Standard 9.3.12 is installed and shell/workspace adapters are in use.
PRO capabilities are not in the installed package.

This is an availability/edition/license/implementation inventory, not a coverage
target. [R3/R12](product-direction.md#1-elfogadott-termékkövetelmények) grow
capabilities from real needs; unimplemented rows are candidates, not commitments.

| Capability | Source | Edition boundary | 61de status | Work when needed |
| --- | --- | --- | --- | --- |
| Grid/inline edit | Suite Standard | Some advanced options PRO | Workspace implemented, [usage](workspaces.md), grid-edit | Query/types/actions/policies |
| Dynamic grid source | Framework Standard Grid adapter | Native LazyDataProxy integration PRO-only | Cursor window implemented | Bounded queries/scrolling |
| Forms/validation | Suite Standard | Controls version-dependent | Metadata forms, client/server [validation](validation.md) | Errors/relations/types |
| Layout/window | Suite Standard | — | Shell/workspace/resizers/popups implemented | Complex multipanel flows |
| Menu/toolbar | Suite Standard | — | Main/list menus, theme/language selectors | Navigation/capabilities |
| DataView | Suite Standard | Detailed inventory version-dependent | Cards implemented | Templates/selection |
| Tabs/popup/sidebar/ribbon/List | Suite Standard | Inventory on demand | No verified independent adapter | Shell/lifecycle |
| Tree | Suite Standard | Advanced options need checking | `TreeAdapter` over a flat parent list, used by the [file manager](files.md); view.layout.tree remains a layout tree | Lazy children/drag moves |
| TreeGrid | Suite PRO | PRO-only | None | Licensed adapter/capability |
| Chart | Suite Standard | PRO types/options separate | None | Scoped aggregates/drill-down |
| Date/time/color picker/combo | Suite Standard | Not event calendar | Not independently qualified as a capability | Types/locale/timezone |
| Event calendar | Scheduler Standard GPL (`dhtmlx-scheduler` 7.2.15) | Basic views/recurrence available; one instance per page | Framework [calendar](calendar.md): day/week/month, framework event form (Suite Form) with recurrence, exceptions, windowed `events`, server-side `occurrences` | Live updates, time zones, per-event ACL |
| Timeline/Units/resources | Scheduler PRO | PRO-only | None | Resource policies/conflicts |
| Multiple schedulers/page | Paid Scheduler | License tier matters | None | Shell/capability checks |
| Basic Gantt | Gantt 10+ Community MIT | Core tasks/dependencies/milestones | None | Hierarchy/actions/conflicts |
| Autoscheduling/critical path/resources | Gantt PRO | PRO-only | None | Separate license decision |
| Files/media | Own service + UI | Vault separate | Virtual [file manager](files.md): DB BLOB storage, per-mount ACL, multipart upload, TXT editor; native file input, no Vault | Deletion/download/preview, per-entry ACL, external blob store, jobs |
| Diagram | DHTMLX Diagram is a separate product, not installed | Not in Suite Standard | Framework [diagram editor](diagrams.md): Suite shell/List/Form/Window around an own SVG canvas | Ports/routing/export; licensed Diagram adapter if acquired |
| Rich text/pivot/kanban | Separate product/adapter | Not automatic Standard Suite features | None | Need/license assessment |
| Export/import | Backend + vendor adapter | Format/service-dependent | No export; bulk exists | Scopes/field filtering/jobs/downloads |

Every implemented capability needs localization/themes/kitchen-sink examples
([R4/R11](product-direction.md#1-elfogadott-termékkövetelmények)); outstanding
examples remain gaps in product direction.

<a id="bővítés-módja"></a>

## Extension method

Add components/vendor options for concrete consumer needs, following
[demand-driven work](development-plan.md#igényvezérelt-fejlesztési-módszer).
[FB-0037](feedback.md#fb-0037--ext-js-referencia-visszavonása-dhtmlx-alap-igényvezérelt-képességkör)
supersedes exhaustive coverage of every public vendor capability.

Common capabilities need typed framework configuration; rare options need
validated adapter extensions. Custom client code uses registered modules.
Each vendor method does not require a separate REST endpoint. Public contracts
must not depend on private/protected/internal APIs.

PRO-only requests remain open dependencies until a licensed adapter or separately
approved alternative exists. Considering licensing is not purchasing or acquiring packages.

<a id="licencek-és-lejárat"></a>

## Licenses and version boundaries

The original reviewed baseline records Suite Standard GPLv2, Scheduler Standard
GPL, Gantt v10+ Community MIT. Older Gantt GPL versions do not automatically
become MIT. GPL is not a revenue-threshold community license; distribution
conditions apply and do not make business data public.

61de's own license remains undecided. Evaluate combined frontend/vendor
distribution, backend separation and consumer source obligations against actual
packaging. Do not assume all PHP is GPL or REST separation resolves every issue.

Never commit PRO source/keys to a public repository. npm availability does not
prove every documented feature is included. Gantt types may describe PRO-only
APIs; inspect runtime and edition matrix together.

<a id="ellenőrzött-upstream-források"></a>

## Previously reviewed upstream references

- [Suite product/Standard GPL](https://dhtmlx.com/docs/products/dhtmlxSuite/)
- [Suite 9 documentation](https://docs.dhtmlx.com/suite/)
- [TreeGrid PRO-only](https://docs.dhtmlx.com/suite/grid/treegrid_mode/)
- [Scheduler installation](https://docs.dhtmlx.com/scheduler/guides/installation/)
- [Scheduler editions](https://docs.dhtmlx.com/scheduler/guides/editions-comparison/)
- [Gantt editions](https://docs.dhtmlx.com/gantt/guides/editions-comparison/)
- [Gantt MIT release](https://dhtmlx.com/blog/meet-dhtmlx-gantt-community-edition-mit-license/)
- [Gantt source/types](https://github.com/DHTMLX/gantt)
