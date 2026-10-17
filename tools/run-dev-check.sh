#!/usr/bin/env bash
# Shared low-memory-host guard. All child processes belong to one limited scope.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if (( $# == 0 )); then
    echo "Usage: tools/run-dev-check.sh command [args...]" >&2
    exit 64
fi
runtime_dir="${VAPA_TMP_DIR:-$root/codex/tmp}"
mkdir -p "$runtime_dir"
exec 9>"$root/codex/tmp/dev-check.lock"
if ! flock -n 9; then
    echo "Another guarded development check is running; retry after it finishes." >&2
    exit 75
fi
available_kib=$(awk '/^MemAvailable:/ {print $2}' /proc/meminfo)
if [[ -z "$available_kib" ]] || (( available_kib < 1310720 )); then
    echo "Development check refused: at least 1280 MiB MemAvailable is required." >&2
    exit 75
fi
export TMPDIR="$runtime_dir"
# Fail closed if the user manager cannot enforce cgroup limits; no unbounded fallback.
systemd-run --user --scope --quiet --collect \
    -p MemoryAccounting=yes -p MemoryHigh=700M -p MemoryMax=900M \
    -p MemorySwapMax=0 -p TasksMax=128 -- "$@"
