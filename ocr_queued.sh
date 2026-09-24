#!/usr/bin/env bash
# OCR every downloaded-but-unprocessed book in queued_book_imports with surya_ocr, then mark it
# 'inProgress'. Safe to interrupt (Ctrl-C) and restart at any time:
#   - it re-reads the database each run, so newly queued/downloaded books are picked up too;
#   - a book already OCR'd (valid results.json on disk) is just marked inProgress, not redone;
#   - a book whose PDF hasn't been downloaded yet to ../scholshelf/ is left 'queued' and skipped;
#   - the OCR model server is kept warm (--keep_server) across books *and* across restarts of this
#     script (it's a separate background process, probed on each invocation), which matters: a cold
#     start costs ~1-2 minutes just to load the model, vs ~6s/page once warm.
#
# Usage (from src/, on the Mac):  ./ocr_queued.sh [--limit N] [--book <id>]
#   --limit N     stop after OCR'ing N books this run (still marks them inProgress as it goes)
#   --book <id>   only process the one book whose pdf filename (without .pdf) is <id>
# Log: output/ocr_queued.log
#
# At last measurement on this machine: ~6s/page, no speedup from running books concurrently
# (the local model server is GPU-bound) — so this deliberately processes one book at a time.
set -uo pipefail
cd "$(dirname "$0")"

SURYA="${SURYA_OCR_BIN:-$HOME/.local/bin/surya_ocr}"
command -v "$SURYA" >/dev/null || SURYA=surya_ocr
SCHOLSHELF="../scholshelf"
RESULTS_DIR="$SCHOLSHELF/results/surya"
LOG=output/ocr_queued.log

LIMIT=0
ONLY_BOOK=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --limit) LIMIT="$2"; shift 2 ;;
    --book) ONLY_BOOK="$2"; shift 2 ;;
    *) echo "unknown option $1" >&2; exit 1 ;;
  esac
done

source ./db_env.sh   # sets DATABASE_URL (and C/PGU/PGD if it fell back to a docker container)
mkdir -p "$RESULTS_DIR" output
exec > >(tee -a "$LOG") 2>&1
echo "=== ocr_queued $(date)"

# Run a query, on the host psql if there is one, else via the postgres container (db_env.sh set C/PGU/PGD).
run_query() {
  if command -v psql >/dev/null; then
    psql "$DATABASE_URL" -At -F$'\t' -c "$1" < /dev/null
  else
    docker exec -i "$C" psql -U "$PGU" -d "$PGD" -At -F$'\t' -c "$1" < /dev/null
  fi
}

valid_json() { python3 -c "import json,sys; json.load(open(sys.argv[1]))" "$1" >/dev/null 2>&1; }

rows="$(run_query "select id, pdf_url from queued_book_imports where status = 'queued' order by id;")"
total=$(grep -c . <<< "$rows" || true)
echo "$total book(s) currently queued"

n=0; ocred=0; already=0; not_downloaded=0; failed=0
while IFS=$'\t' read -r qid url; do
  [[ -z "${qid:-}" ]] && continue
  n=$((n + 1))

  fname="$(basename "$url")"
  book_id="${fname%.pdf}"
  [[ -n "$ONLY_BOOK" && "$book_id" != "$ONLY_BOOK" ]] && continue

  pdf="$SCHOLSHELF/$fname"
  out_json="$RESULTS_DIR/$book_id/results.json"

  if [[ ! -f "$pdf" ]]; then
    not_downloaded=$((not_downloaded + 1))
    continue
  fi

  if [[ -s "$out_json" ]] && valid_json "$out_json"; then
    echo "[$n/$total] already OCR'd: $book_id -> marking inProgress"
    run_query "update queued_book_imports set status = 'inProgress' where id = $qid;" >/dev/null
    already=$((already + 1))
    continue
  fi

  if [[ $LIMIT -gt 0 && $ocred -ge $LIMIT ]]; then
    continue   # keep counting totals below, but do no more OCR this run
  fi

  echo "[$n/$total] OCR $book_id ($pdf)"
  start=$SECONDS
  if "$SURYA" "$pdf" --output_dir "$RESULTS_DIR" --keep_server < /dev/null && [[ -s "$out_json" ]] && valid_json "$out_json"; then
    elapsed=$((SECONDS - start))
    pages=$(python3 -c "import json; d=json.load(open('$out_json')); print(len(next(iter(d.values()))))" 2>/dev/null || echo '?')
    echo "[$n/$total] done $book_id: $pages pages in ${elapsed}s -> marking inProgress (queued_book_imports.id=$qid)"
    run_query "update queued_book_imports set status = 'inProgress' where id = $qid;" >/dev/null
    ocred=$((ocred + 1))
  else
    echo "[$n/$total] FAILED $book_id (left as 'queued'; rerun this script to retry)"
    failed=$((failed + 1))
  fi
done <<< "$rows"

echo "=== done $(date): queued=$total ocred_this_run=$ocred already_done=$already not_downloaded_yet=$not_downloaded failed=$failed"
[[ $failed -gt 0 ]] && exit 1
exit 0
