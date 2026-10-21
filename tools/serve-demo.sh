#!/usr/bin/env bash
set -euo pipefail
framework_root="$(cd "$(dirname "$0")/.." && pwd)"
# Idempotent synthetic data and schema setup; HTTP requests never run DDL.
"${VAPA_PHP:-php8.4}" "$framework_root/examples/demo-app/setup-workspace.php" >/dev/null
exec "${VAPA_PHP:-php8.4}" -S 127.0.0.1:8086 -t "$framework_root/examples/demo-app/public"
