#!/usr/bin/env bash
# Import one OCR'd book end to end: extract -> Book JSON -> SQL -> load into Postgres (Docker) -> link citations
# and queue cited books found on archive.org.
#
# Usage (from src/, on the Mac):
#   ./import_book.sh <book-id> "<title>" "<author>" [<archive url>] [--no-archive] [--dry-run]
#
# Database: see db_env.sh ($DATABASE_URL, else the running postgres container).
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
source ./db_env.sh

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
