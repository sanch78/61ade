#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"
runner="${BLADE_PLAYWRIGHT_BIN:-/usr/local/bin/playwright}"
# The specs must use the same system-wide @playwright/test as the runner. Derive it from
# the Infra launcher (".../npm/bin/playwright" -> ".../@playwright/test/cli.js") unless set.
if [ -z "${BLADE_PLAYWRIGHT_MODULE:-}" ]; then
    target="$runner"
    launched="$(grep -oE '^exec [^ ]+' "$runner" 2>/dev/null | head -1 | cut -d' ' -f2 || true)"
    [ -n "$launched" ] && target="$launched"
    cli="$(readlink -f "$target")"
    if [ "$(basename "$cli")" = cli.js ] && [ -f "$(dirname "$cli")/package.json" ]; then
        export BLADE_PLAYWRIGHT_MODULE="$(dirname "$cli")"
    fi
fi
exec "$root/tools/run-dev-check.sh" "$runner" test "$@" --workers=1
