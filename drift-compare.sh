#!/usr/bin/env bash
# drift-compare.sh — diff two drift reports and print only the files that
# differ (or are missing from one side). Usage:
#   ./drift-compare.sh disk-report.txt project-knowledge-report.txt
set -eu

[ "$#" -eq 2 ] || { echo "usage: $0 <disk-report> <pk-report>" >&2; exit 2; }

echo "===== DRIFT COMPARISON ====="
printf "%-44s %s\n" "FILE" "STATUS"
printf "%-44s %s\n" "----" "------"

out=$(awk '
  /^=====/ || /^[[:space:]]*$/ { next }
  FNR==NR { d_b[$1]=$2; d_h[$1]=$3; all[$1]=1; next }
          { p_b[$1]=$2; p_h[$1]=$3; all[$1]=1 }
  END {
    for (f in all) {
      ind=(f in d_b); inp=(f in p_b)
      if (ind && !inp)            print f "\tMISSING from project knowledge — upload it"
      else if (!ind && inp)       print f "\tin project knowledge but NOT on disk — stale/renamed upload?"
      else if (d_b[f] != p_b[f])  print f "\tDRIFT (disk " d_b[f] "b vs pk " p_b[f] "b) — re-upload"
      else if (d_h[f] != p_h[f])  print f "\tDRIFT (same size, hash differs) — re-upload"
    }
  }
' "$1" "$2" | sort)

if [ -z "$out" ]; then
  echo "(no drift — every tracked file matches)"
else
  printf '%s\n' "$out" | while IFS=$'\t' read -r f status; do
    printf "%-44s %s\n" "$f" "$status"
  done
fi
echo "===== END ====="
