#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"
exec "$root/tools/run-dev-check.sh" "${VAPA_PLAYWRIGHT_BIN:-/usr/local/bin/playwright}" test "$@" --workers=1
