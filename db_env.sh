# Sourced by import_book.sh / import_all.sh: sets DATABASE_URL and run_sql for the project's Postgres.
# Uses $DATABASE_URL if set. Otherwise finds the running postgres container ($PG_CONTAINER, or the first
# container whose image name contains "postgres") and derives the URL from its POSTGRES_* environment and
# published port. run_sql <file> uses psql on the host if installed, else psql inside the container.
C="${PG_CONTAINER:-}"
if [[ -z "${DATABASE_URL:-}" || ! -x "$(command -v psql)" ]]; then
  if [[ -z "$C" ]]; then
    C="$(docker ps --format '{{.Names}} {{.Image}}' | awk 'tolower($2) ~ /postgres/ {print $1; exit}')"
  fi
  [[ -n "$C" ]] || { echo "no running postgres container found (set PG_CONTAINER or DATABASE_URL)" >&2; exit 1; }
  PGU="$(docker exec "$C" printenv POSTGRES_USER 2>/dev/null || echo postgres)"
  PGD="$(docker exec "$C" printenv POSTGRES_DB 2>/dev/null || echo "$PGU")"
fi
if [[ -z "${DATABASE_URL:-}" ]]; then
  PGP="$(docker exec "$C" printenv POSTGRES_PASSWORD 2>/dev/null || true)"
  PORT="$(docker port "$C" 5432/tcp | head -1 | sed 's/.*://')"
  [[ -n "$PORT" ]] || { echo "container $C doesn't publish port 5432; set DATABASE_URL" >&2; exit 1; }
  export DATABASE_URL="postgres://${PGU}${PGP:+:$PGP}@localhost:${PORT}/${PGD}"
fi
run_sql() {
  if command -v psql >/dev/null; then psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$1"
  else docker exec -i "$C" psql -U "$PGU" -d "$PGD" -v ON_ERROR_STOP=1 -q < "$1"; fi
}
echo "database: ${DATABASE_URL%%@*}@... (${C:-DATABASE_URL})"
