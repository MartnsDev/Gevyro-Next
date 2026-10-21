#!/usr/bin/env bash
set -euo pipefail
project_root="$(cd "$(dirname "$0")/.." && pwd)"
pg_bin="${GEVYRO_PG_BIN:-/usr/lib/postgresql/16/bin}"
test_dir="$(mktemp -d /tmp/gevyro-next-pg.XXXXXX)"
# Cluster descartável exclusivo do teste, sem TCP e sem conexão com bancos existentes.
"$pg_bin/initdb" -D "$test_dir/data" --auth=trust --no-locale > "$test_dir/init.log"
trap '"$pg_bin/pg_ctl" -D "$test_dir/data" -m fast stop > /dev/null 2>&1 || true' EXIT
"$pg_bin/pg_ctl" -D "$test_dir/data" -l "$test_dir/server.log" -o "-k $test_dir -h '' -p 55439" -w start
"$pg_bin/psql" -X -h "$test_dir" -p 55439 -d postgres -v ON_ERROR_STOP=1 -f "$project_root/tests/tenant-foundation.sql"
python3 "$project_root/tests/company-concurrency.py" "$pg_bin/psql" "$test_dir" 55439
python3 "$project_root/tests/sales-concurrency.py" "$pg_bin/psql" "$test_dir" 55439
