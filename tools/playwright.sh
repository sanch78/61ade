#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"
# Preserve the original shell default; --list still discovers every project.
project_selected=false
for arg in "$@"; do
    case "$arg" in --project|--project=*|--list) project_selected=true ;; esac
done
if ! "$project_selected"; then
    set -- "$@" --project=shell
fi
exec "$root/tools/run-dev-check.sh" "${VAPA_PLAYWRIGHT_BIN:-/usr/local/bin/playwright}" test "$@" --workers=1
