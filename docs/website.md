# Product website

The bilingual product presentation lives in this repository. English is the
default; Hungarian has equivalent content, navigation and metadata.

| Page | URL |
| --- | --- |
| English | https://61ade.com/ |
| Hungarian | https://61ade.com/hu/ |

The apex is served directly from `examples/demo-app/public/website/` as its
document root; `https://www.61ade.com/` redirects to it. DNS, TLS, the ingress
and that redirect are Infra-owned. Page links and assets are relative (`./`,
`../` from `/hu/`), so the same files work at the apex root. Canonical,
`hreflang` and social-preview URLs are absolute on the apex. The retired
`61ade.sanch.hu` has no product, demo or redirect role
([FB-0100](feedback.md#fb-0100)). This adds no deployment or backup process;
browser verification uses these managed URLs and `npm run test:browser -- ...`.

## Sources and generated files

`examples/demo-app/website/` contains the English/Hungarian content in
`content.php`, one HTML renderer in `page.php`, and the site CSS/JavaScript.
The renderer is used at build time only. `tools/build-website.mjs` uses the
existing esbuild and PHP 8.4+ to prepare ordinary static files under
`examples/demo-app/public/website/`:

```sh
npm run website:assets
node tools/build-website.mjs --check
```

The PHP binary follows `BLADE_PHP`, defaulting to `php8.4`. Commit generated
HTML, JavaScript, CSS, fonts and the copied brand SVGs with source changes.
There is no npm installation, framework bootstrap, session, API request or
third-party request on the product page.

Fonts are self-hosted from `examples/demo-app/website/fonts/` under the SIL
Open Font License (`OFL-*.txt` beside them): Newsreader (display instance,
regular and italic) for headings, Geist for text and Geist Mono for labels,
each as Latin and Latin Extended subsets so Hungarian `ő`/`ű` come from the
same face. esbuild copies them to `assets/fonts/` without hashing; `page.php`
preloads the two Latin faces by that path.

## Design

A light, editorial page on a warm paper tone with a faint grain, deep navy
bands and the brand's blue as the only accent ([FB-0099](feedback.md#fb-0099)).
Each section has a full-width hairline on top and vertical guides along the
content edges, with a small node where they meet; on phones (≤ 760 px) the
guides are dropped. Section labels are numbered monospace tags (`01`–`06`).

| Section | Content |
| --- | --- |
| Hero | Stack badge, serif headline with an italic blue second line, both buttons, the shared demo sign-in in monospace; below, the workspace screenshot in a browser frame and the phone screenshot, half over a navy blueprint band with four facts (i18n with en · hu · de out of the box, built-in and customizable themes, permission levels, audit); the hero guides run on behind the screenshots to the navy grid; the fact dividers, which meet the grid lines only at full content width, are dropped below 1280 px, where the guides end in small nodes at the top of the band. |
| `#idea` | Three principles with line icons. |
| `#product` | Files, media, calendar and diagram, each with text, documentation link and a framed screenshot. |
| `#foundations` | Navy band: the six capabilities as a grid, then the product status. |
| `#story` | DDE → ADE → 61ade timeline and signature. |
| `#usage` | Usage intent, license card, and the demo invitation with the shared account in a sign-in-style card. |
| `#contact` | Closing question and e-mail; then a navy footer with the dark logo, links and languages. |

The header uses the light logo (`logo.svg` from `blade-logo.svg`), the footer
the dark one (`logo-dark.svg` from `blade-logo-dark.svg`).

Without JavaScript everything is visible and static: the interface features are
stacked with their own screenshots, and screenshot links open the original
image. With JavaScript:

- the hero rises in as the trademark screen fades (only while that screen
  still covers the page, so nothing visible is hidden again);
- sections fade up once as they scroll into view;
- above 1080 px the interface features become a list beside one framed
  screenshot; the active item advances every 7 s with a progress line, paused
  on hover, focus or off-screen, and stops for good once a visitor picks one
  (buttons with `aria-expanded`/`aria-controls`; narrower screens keep the
  stacked layout);
- the demo e-mail and password get copy buttons (Clipboard API);
- screenshots open in a native modal dialog with Escape and focus restoration.

With `prefers-reduced-motion: reduce` the entrance, reveal and autoplay are
skipped; the trademark screen keeps its own reduced-motion rules.

Changing a public capability requires reviewing both languages against its
topic guide and [product direction](product-direction.md). The site distinguishes
implemented features from future work, including storage, external sign-in,
tenant-scoped files and searchable log administration. The owner's historical
references belong to DDE and ADE, not to 61ade. Do not invent dates, customer
names or testimonials.

## Shared trademark screen

The shell and product site use the same `packages/php/templates/splash.php`
markup and generated trademark SVG. The website renderer inserts
`Blade\Shell\Splash::GATE`; its asset build bundles the original
`packages/frontend/src/Splash.ts` and `splash.css`. The ordinary logo and mark
are copied from their canonical brand sources, without redrawing them.

Thus the timing, page turns, wordmark, `.com`, glint, reflection, release and
reduced-motion behavior follow the [brand contract](brand.md#splash). It plays
once per tab/origin using `blade-splash` session storage. The product site
(`61ade.com`) and the demo (`demo.61ade.com`) are separate origins, so opening
the demo plays it once there too; a new tab plays again. JavaScript-disabled visitors see the website directly.
Run `npm run website:assets` after shared splash or logo changes, even when
the marketing copy has not changed.

## Public demo and retained screenshots

The demo link is https://demo.61ade.com/. Login remains required; its existing
shared synthetic account is intentionally public:

- E-mail: `demo@example.test`
- Password: `61ade-demo`

The same details are shown on both website languages and in the feature demo's
supported sign-in footer module, translated through its project catalogue.
They are selectable text, not prefilled input values. Starter and tenant-demo
sign-in pages retain their existing content. There is no guest login, new
account, permission change, data-reset job or new public API.

Twelve retained JPEGs in the website's `assets/` directory were captured on the
managed demo, at 1440 × 900 for desktop and 390 × 844 for the mobile list:
`workspace`, `files`, `media`, `calendar`, `diagram` and `mobile`, plus a
`-en` version of each. Each website language uses the matching real UI language
in the dark theme, including its social-preview image. Captions and alternative
text are localized too. Stored record values keep their original demo text;
capturing the English UI does not translate or modify retained demo data.
These images are website deliverables, not disposable test evidence.

When refreshing them, use the guarded browser wrapper, an isolated browser
context, the synthetic demo account and actual supported UI navigation. Select
only synthetic records/assets; do not publish private accounts, tokens,
customer data or arbitrary retained uploads. Inspect the images before committing.
Do not reset existing demo data to obtain a cleaner screenshot. Keep screenshot
dimensions and HTML image attributes aligned. Temporary capture specs, test
reports and review screenshots belong to task cleanup, not the product tree.

## Usage policy and contact

Public contact: `sanch@61ade.com`; source:
https://github.com/sanch78/61ade. The owner's intended policy is free use in
free projects and contact before money-making use; stars and thank-you messages
are welcome. The site labels this as intended policy: it does not silently
relicense the repository or grant rights for third-party code. The formal
license of 61ade's own code remains a separate task; the README records its
current status.

DHTMLX terms are described separately, with official
[Suite](https://github.com/DHTMLX/dhtmlx-suite-gpl) and
[Scheduler](https://docs.dhtmlx.com/scheduler/) links. GPL versus non-GPL use is
not determined solely by revenue. Never present the whole bundle as permissively
licensed or assume a contact with 61ade replaces a DHTMLX license.

## Verification

Task verification covers both languages at desktop, tablet and phone widths
(including 320 px without horizontal overflow), navigation and the mobile menu,
font loading, image loading and enlargement, the showcase list (autoplay,
selection, `aria-expanded`), copy buttons, public links, keyboard modal
controls, canonical and alternate-language metadata, JavaScript-disabled use,
reduced motion, once-per-tab trademark behavior with the hero entrance, and
the public demo login. Reuse the existing sign-in branding and splash suites
for shared template changes. Use targeted checks; temporary task-only browser
cases are removed after passing.

Recorded results and limits: [FB-0096](feedback.md#fb-0096),
[FB-0099](feedback.md#fb-0099).
