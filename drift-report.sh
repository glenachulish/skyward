#!/usr/bin/env bash
# drift report — one line per source file Claude might edit:
# size in bytes, sha256 first-8-chars, and the path. Run at the start of a
# session and paste into chat; Claude diffs against project knowledge and
# refuses to edit any file whose size doesn't match.
set -euo pipefail
cd "$(dirname "$0")"   # always run from the project root, wherever called from

print_file() {
  local p="$1"
  [ -f "$p" ] || return 0            # skip silently if the glob matched nothing
  local bytes hash
  bytes=$(wc -c < "$p" | tr -d ' ')
  hash=$(shasum -a 256 "$p" | cut -c1-8)
  printf "%-44s %8s  %s\n" "$p" "$bytes" "$hash"
}

echo "===== DRIFT REPORT — $(date '+%Y-%m-%d %H:%M:%S') ====="

# Backend
for f in backend/*.py; do print_file "$f"; done
print_file backend/requirements.txt

# Frontend root (html lives in static/)
for f in static/*.html; do print_file "$f"; done
for f in static/css/*.css; do print_file "$f"; done
for f in static/js/*.js; do print_file "$f"; done
for f in static/js/views/*.js; do print_file "$f"; done

# Static data
for f in static/data/*.json; do print_file "$f"; done

# Status / notes docs (tracked because Claude reads them too)
print_file README.md
print_file SKYWARD_STATUS.md

echo "===== END ====="
