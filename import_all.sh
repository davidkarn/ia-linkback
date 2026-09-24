#!/usr/bin/env bash
# Import every book listed in books.tsv (id <TAB> title <TAB> author <TAB> url):
#   1. load all books (building output/<id>.sql first if it's missing, or for every book with --rebuild);
#   2. then link each book's citations, so citations between books in the collection link to each other
#      before anything is looked up on archive.org and queued.
# Resumable: loading is idempotent and archive.org answers are cached in output/archive_cache.json.
#
# Usage (from src/, on the Mac):  ./import_all.sh [--rebuild] [--no-archive] [--only-load] [--only-link]
# Log: output/import_all.log     Summary: output/import_all.summary.tsv
set -uo pipefail
cd "$(dirname "$0")"
REBUILD=0; LOAD=1; LINK=1; LINK_FLAGS=()
for a in "$@"; do
  case "$a" in
    --rebuild) REBUILD=1 ;;
    --no-archive) LINK_FLAGS+=("$a") ;;
    --only-load) LINK=0 ;;
    --only-link) LOAD=0 ;;
    *) echo "unknown option $a" >&2; exit 1 ;;
  esac
done
source ./db_env.sh
LOG=output/import_all.log
mkdir -p output
exec > >(tee -a "$LOG") 2>&1
echo "=== import_all $(date)"

BOOKS=()
while IFS=$'\t' read -r id title author url; do
  [[ -z "$id" || "$id" == \#* ]] && continue
  BOOKS+=("$id"$'\t'"$title"$'\t'"$author"$'\t'"${url:-}")
done < books.tsv
echo "${#BOOKS[@]} books"

npx tsx migrate.ts latest || exit 1

FAILED=()
if [[ $LOAD == 1 ]]; then
  if [[ $REBUILD == 1 ]]; then
    npx tsx extract_footnotes.ts $(printf '%s\n' "${BOOKS[@]}" | cut -f1) | tail -2
  fi
  n=0
  for row in "${BOOKS[@]}"; do
    IFS=$'\t' read -r id title author url <<< "$row"; n=$((n + 1))
    if [[ $REBUILD == 1 || ! -s "output/$id.sql" ]]; then
      [[ $REBUILD == 1 ]] || npx tsx extract_footnotes.ts "$id" > /dev/null
      npx tsx build_book.ts --book "$id" --title "$title" --author "$author" ${url:+--url "$url"} > /dev/null \
        && npx tsx book_to_sql.ts "output/$id.book.json" > "output/$id.sql" 2>/dev/null \
        || { echo "[$n/${#BOOKS[@]}] BUILD FAILED $id"; FAILED+=("$id"); continue; }
    fi
    if run_sql "output/$id.sql"; then echo "[$n/${#BOOKS[@]}] loaded $id"
    else echo "[$n/${#BOOKS[@]}] LOAD FAILED $id"; FAILED+=("$id"); fi
  done
fi

if [[ $LINK == 1 ]]; then
  n=0
  for row in "${BOOKS[@]}"; do
    IFS=$'\t' read -r id _ <<< "$row"; n=$((n + 1))
    [[ " ${FAILED[*]:-} " == *" $id "* ]] && continue
    echo "[$n/${#BOOKS[@]}] linking $id"
    npx tsx link_citations.ts --book "$id" ${LINK_FLAGS[@]+"${LINK_FLAGS[@]}"} | grep -E '"(works_cited|citations_linked|newly_queued|not_found|errors)"' \
      || { echo "LINK FAILED $id"; FAILED+=("$id"); }
  done
fi

# summary from the per-book reports
node -e '
const fs = require("fs");
const ids = process.argv.slice(1);
const rows = [["book", "citations_linked", "newly_queued", "already_queued", "not_found", "volume_not_stated", "errors"].join("\t")];
const queued = [];
for (const id of ids) {
  const f = `output/${id}.links.json`;
  if (!fs.existsSync(f)) continue;
  const r = JSON.parse(fs.readFileSync(f, "utf8"));
  rows.push([id, r.linked_to_books.reduce((n, l) => n + l.citations, 0), r.queued.length, r.already_queued.length,
    r.not_found.length, (r.volume_not_stated ?? []).reduce((n, v) => n + v.citations, 0), r.errors.length].join("\t"));
  for (const q of r.queued) queued.push(`${id}\t${q.author} | ${q.title}\t->\t${q.archive_title} (${q.archive_creator})\t${q.archive_url}`);
}
fs.writeFileSync("output/import_all.summary.tsv", rows.join("\n") + "\n");
fs.writeFileSync("output/import_all.queued.tsv", queued.join("\n") + "\n");
console.log(`summary: output/import_all.summary.tsv, newly queued: ${queued.length} (output/import_all.queued.tsv)`);
' $(printf '%s\n' "${BOOKS[@]}" | cut -f1)

if (( ${#FAILED[@]} )); then echo "FAILED: ${FAILED[*]}"; exit 1; fi
echo "=== done $(date)"
