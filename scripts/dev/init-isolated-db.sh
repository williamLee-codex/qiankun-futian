#!/usr/bin/env bash
# Throwaway PostgreSQL for Farm V2 integration tests. Never points at production.
set -euo pipefail
NAME=${NAME:-farm-v2-test-pg}
PORT=${PORT:-55432}
PASSWORD=${PASSWORD:-farm-v2-test}
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" -e POSTGRES_PASSWORD="$PASSWORD" -p "$PORT:5432" postgres:16 >/dev/null
for _ in $(seq 1 60); do
  docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 1
done

psql_exec() { timeout 60 docker exec -i "$NAME" psql -U postgres -v ON_ERROR_STOP=1 "$@"; }

psql_exec -d postgres -q -c "CREATE DATABASE farm_v2_test"
psql_exec -d farm_v2_test -q <<'SQL'
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY, email text);
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE farm_v2_runtime NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
SQL

docker cp "$ROOT/lib/db/migrations" "$NAME:/migrations" >/dev/null
for file in $(docker exec "$NAME" sh -c 'ls /migrations/*.sql | sort'); do
  if timeout 120 docker exec "$NAME" psql -U postgres -d farm_v2_test -v ON_ERROR_STOP=1 -q -f "$file" >/tmp/mig.log 2>&1; then
    echo "ok $file"
  else
    echo "FAIL $file"; grep -E "ERROR|LINE [0-9]" /tmp/mig.log | head -3; exit 1
  fi
done
echo "DATABASE_URL=postgres://postgres:$PASSWORD@127.0.0.1:$PORT/farm_v2_test"
