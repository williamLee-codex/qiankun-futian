#!/usr/bin/env bash
# Isolated PostgreSQL for Farm V2 integration tests.
# Never point this at production: it creates and drops its own database.
set -euo pipefail
NAME=${NAME:-farm-v2-test-pg}
PORT=${PORT:-55432}
PASSWORD=${PASSWORD:-farm-v2-test}
docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" -e POSTGRES_PASSWORD="$PASSWORD" -p "$PORT:5432" postgres:16 >/dev/null
for _ in $(seq 1 60); do
  docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 1
done
export PGPASSWORD="$PASSWORD"
psql "postgres://postgres@127.0.0.1:$PORT/postgres" -v ON_ERROR_STOP=1 <<'SQL'
CREATE DATABASE farm_v2_test;
SQL
psql "postgres://postgres@127.0.0.1:$PORT/farm_v2_test" -v ON_ERROR_STOP=1 <<'SQL'
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY, email text);
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE ROLE farm_v2_runtime NOLOGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
SQL
echo "DATABASE_URL=postgres://postgres:$PASSWORD@127.0.0.1:$PORT/farm_v2_test"
