#!/usr/bin/env bash
# Import one OCR'd book end to end: extract -> Book JSON -> SQL -> load into Postgres (Docker) -> link citations
# and queue cited books found on archive.org.
#
# Usage (from src/, on the Mac):
#   ./import_book.sh <book-id> "<title>" "<author>" [<archive url>] [--no-archive] [--dry-run]
#
# Database: uses $DATABASE_URL if set. Otherwise finds the running postgres container ($PG_CONTAINER, or the
# first container whose image name contains "postgres") and derives the URL from its POSTGRES_* environment
# and published port. The SQL is loaded with psql if installed, else with psql inside the container.
set -euo pipefail
cd "$(dirname "$0")"

BOOK="${1:?book id}"; TITLE="${2:?title}"; AUTHOR="${3:?author}"; shift 3
URL=""; LINK_FLAGS=()
for a in "$@"; do
  case "$a" in
    --no-archive|--dry-run) LINK_FLAGS+=("$a") ;;
    *) URL="$a" ;;
  esac
done
DRY=0; [[ " ${LINK_FLAGS[*]:-} " == *" --dry-run "* ]] && DRY=1

# --- database -----------------------------------------------------------------------------------------------
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

# --- pipeline -----------------------------------------------------------------------------------------------
npx tsx migrate.ts latest
npx tsx extract_footnotes.ts "$BOOK" | tail -3
npx tsx build_book.ts --book "$BOOK" --title "$TITLE" --author "$AUTHOR" ${URL:+--url "$URL"}
npx tsx book_to_sql.ts "output/$BOOK.book.json" > "output/$BOOK.sql"
if [[ $DRY == 1 ]]; then
  echo "dry run: output/$BOOK.sql not loaded; link_citations needs the book loaded, skipping"
  exit 0
fi
run_sql "output/$BOOK.sql"
echo "loaded output/$BOOK.sql"
npx tsx link_citations.ts --book "$BOOK" ${LINK_FLAGS[@]+"${LINK_FLAGS[@]}"}
