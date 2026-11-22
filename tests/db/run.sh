#!/usr/bin/env bash
# Spin up a throwaway local Postgres, apply migrations + demo seed, run the SQL scenario.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin | tail -1)"
DATA="$(mktemp -d)"
PORT=$((55000 + RANDOM % 900))
cleanup() { "$PGBIN/pg_ctl" -D "$DATA" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$DATA"; }
trap cleanup EXIT

if [ "$(id -u)" = "0" ]; then RUN="runuser -u postgres --"; chown postgres "$DATA"; else RUN=""; fi
$RUN "$PGBIN/initdb" -D "$DATA" -A trust -U postgres >/dev/null
$RUN "$PGBIN/pg_ctl" -D "$DATA" -o "-p $PORT -k /tmp" -l "$DATA/log" start >/dev/null
sleep 1
PSQL="psql -h /tmp -p $PORT -U postgres -d postgres -X -q -v ON_ERROR_STOP=1"
$PSQL -f "$ROOT/tests/db/supabase_stub.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do echo "migrate: $(basename "$f")"; $PSQL -f "$f"; done
$PSQL -f "$ROOT/supabase/seed/demo_seed.sql"
$PSQL -f "$ROOT/tests/db/scenario.sql" 2>&1 | sed 's/^psql:[^ ]* NOTICE:  /  /'
