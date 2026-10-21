# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Kötelező VAPA-fejlesztési szabályok

@AGENTS.md

Első és legfontosabb szabály: nincs a VAPA-t megkerülő egyedi fejlesztés. Hiányzó képességhez előbb a keretrendszer eszközeit kell bővíteni. Kivétel kizárólag az AGENTS.md 1. pontja szerint, dokumentáltan, logikusan nem bővíthető keret esetén lehetséges. Ez minden AI-fejlesztőre vonatkozik. (A validációs paritás szabálya az AGENTS.md-ben található.)

## Parancsok

```bash
npm ci --cache tmp/npm-cache      # első build internetet igényel (DHTMLX ikonfont, SHA-256 ellenőrzés: tools/vendor-assets.json)
npm run typecheck                        # tsc --noEmit
npm run build                            # esbuild: packages/frontend/src/admin.ts -> packages/frontend/dist
npm run demo:assets                      # dist kitétele: examples/demo-app/public/assets
(cd examples/demo-app && composer install)
```

PHP-tesztek: önálló szkriptek, keretrendszer nélkül (a demo-app vendor autoloadját húzzák be, hiba esetén kivételt dobnak). Egy teszt futtatása:

```bash
php8.4 tests/shell/contracts.php         # ugyanígy: admin, permissions, access, validation, i18n, configuration, lists, sorting, grid-edit, related-fields, list-presentation, authentication
php8.4 -l <fájl>                         # lint
```

A host alapértelmezett `php` 7.1 — mindig `php8.4`-et vagy `VAPA_PHP`-t használj (PHP 8.4+, PDO SQLite).

Böngészőtesztek kizárólag a védett wrapperrel (`tools/playwright.sh` → `tools/run-dev-check.sh`: közös flock, 1 worker, systemd cgroup memórialimit; foglalt lock/kevés memória esetén exit 75 — ilyenkor várj, ne indíts párhuzamosan újra):

```bash
npm run test:browser -- --project=shell tests/shell/workspace.spec.cjs                    # shell projekt (demo a 8086-os porton)
npm run test:browser -- --project=i18n               # további projektek: auth, grid-edit, preferences, presentation, related, sorting
```

Az egyetlen gyökérszintű `playwright.config.cjs` a `tests/browser/config.cjs` definícióit használja. Projektválasztás nélkül a `shell` csoport fut; a host 128-as taskkorlátja miatt egyszerre egy projekt indítható (a `--list` mindet felsorolja); a `shell` projekt kizárja a külön fixture-szerveres speceket, amelyek név szerint választhatók `--project` kapcsolóval. A Playwright rendszerszintű (`/usr/local/bin/playwright`, `VAPA_PLAYWRIGHT_MODULE`); a specek a `tools/playwright-test.cjs`-ből importálnak, nem a `@playwright/test`-ből közvetlenül. Demo kézi futtatása: `tools/serve-demo.sh` (idempotens setup, majd szerver; belépés: `demo@example.test` / `vapa-demo`).

Commit/push érdemi batch után: `/usr/local/bin/gitpush --all -t` a repó gyökeréből (a `-t` a helperben commitüzenet — változtatás nélkül használd).

## Architektúra
