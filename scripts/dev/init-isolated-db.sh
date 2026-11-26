#!/usr/bin/env bash
# Throwaway PostgreSQL for Farm V2 integration tests. Never points at production.
#
# The schema is not re-typed here: this script replays the exact `run:` blocks of
# .github/workflows/farm-v2-integration.yml, so the sandbox database and the CI
# database cannot drift apart. Every psql call in those blocks is forwarded into
# the container by a shim on PATH.
#
#   scripts/dev/init-isolated-db.sh            # rebuild and print DATABASE_URL
#   scripts/dev/init-isolated-db.sh --verify   # only check the replay list
set -euo pipefail
NAME=${NAME:-farm-v2-test-pg}
PORT=${PORT:-55432}
PASSWORD=${PASSWORD:-farm-v2-test}
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORKFLOW="$ROOT/.github/workflows/farm-v2-integration.yml"

# Steps that build the schema, in workflow order. Everything after them only
# runs the test suite, which the caller runs itself.
STEPS=(
  "Prepare Supabase-compatible database"
  "Apply the canonical baseline"
  "Create the platform friendships table"
  "Apply the farm migration chain"
  "Apply extracted production schema"
  "Apply migrations"
  "Apply extracted security policies"
  "Yield the core wallet policies to the platform migrations"
  "Record what the harness applied"
  "Apply the crop reward label last"
  "Probe the crop reward label in the isolated database"
)

extract_steps() {
  python3 - "$WORKFLOW" "$@" <<'PY'
import sys, textwrap

path, wanted = sys.argv[1], sys.argv[2:]
lines = open(path, encoding="utf-8").read().splitlines()
steps, current, body, in_run = [], None, [], False
for line in lines:
    stripped = line.strip()
    if stripped.startswith("- name: "):
        if current:
            steps.append((current, body))
        current, body, in_run = stripped[len("- name: "):].strip(), [], False
    elif current and not in_run and stripped == "run: |":
        in_run = True
    elif in_run:
        if line.strip() and not line.startswith("        "):
            in_run = False
        else:
            body.append(line)
if current:
    steps.append((current, body))

found = {name: textwrap.dedent("\n".join(body)) for name, body in steps}
missing = [name for name in wanted if name not in found]
if missing:
    sys.exit("workflow is missing steps: " + ", ".join(missing))
for name in wanted:
    print(f"### {name}")
    print(found[name].rstrip())
    print()
PY
}

if [ "${1:-}" = "--verify" ]; then
  extract_steps "${STEPS[@]}" >/dev/null
  echo "replay list matches $WORKFLOW"
  exit 0
fi

docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" -e POSTGRES_PASSWORD="$PASSWORD" -p "$PORT:5432" postgres:16 >/dev/null
for _ in $(seq 1 60); do
  docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 1
done

# psql shim: drop the workflow's host argument, run inside the container, and
# feed any -f file from the host because only the host sees the checkout.
SHIM="$(mktemp -d)"
trap 'rm -rf "$SHIM"' EXIT
cat >"$SHIM/psql" <<EOF
#!/usr/bin/env bash
args=()
file=""
while [ \$# -gt 0 ]; do
  case "\$1" in
    -h) shift 2 ;;
    -h*) shift ;;
    -f) file="\$2"; shift 2 ;;
    -f*) file="\${1#-f}"; shift ;;
    *) args+=("\$1"); shift ;;
  esac
done
if [ -n "\$file" ]; then
  exec docker exec -i -e PGPASSWORD="$PASSWORD" "$NAME" psql "\${args[@]}" -f - < "\$file"
fi
exec docker exec -i -e PGPASSWORD="$PASSWORD" "$NAME" psql "\${args[@]}"
EOF
chmod +x "$SHIM/psql"
export PATH="$SHIM:$PATH"
export PGPASSWORD="$PASSWORD"

cd "$ROOT"

# Each block is executed as its own bash process, exactly as CI does.
for name in "${STEPS[@]}"; do
  echo "== $name"
  extract_steps "$name" | tail -n +2 >/tmp/farm-v2-step.sh
  bash /tmp/farm-v2-step.sh
done

echo "DATABASE_URL=postgres://postgres:$PASSWORD@127.0.0.1:$PORT/farm_v2_test"

