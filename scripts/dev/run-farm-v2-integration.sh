#!/usr/bin/env bash
# Rebuild the isolated database, then run the Farm V2 integration suite.
# CI starts from an empty database every run; this does the same locally so a
# previous run's fixtures can never mask a failure.
#
#   scripts/dev/run-farm-v2-integration.sh [extra vitest args...]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
NAME=${NAME:-farm-v2-test-pg}
PORT=${PORT:-55432}

bash "$ROOT/scripts/dev/init-isolated-db.sh" >/tmp/farm-v2-db.log 2>&1 ||
  { tail -20 /tmp/farm-v2-db.log; exit 1; }
echo "isolated database ready on port $PORT"

cd "$ROOT/artifacts/api-server"
FARM_V2_TEST_DATABASE_URL="postgres://postgres:farm-v2-test@127.0.0.1:$PORT/farm_v2_test" \
FARM_V2_PLATFORM_CHECKOUT="$ROOT/artifacts/api-server/scripts/dev/platform-fixtures" \
  exec npx vitest run src/lib/farm-v2-wallet-saga.integration.test.ts "$@"
