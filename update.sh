#!/usr/bin/env bash
# Skyward updater — after clicking Download on a Skyward drop in the chat, run:
#     bash ~/Skyward/update.sh
# Finds the newest download (zip or loose installer, whatever folder it landed
# in), stages it, runs the installer inside, and remembers when — so old
# downloads can never be picked up by mistake on a later run.
set -euo pipefail
DL="$HOME/Downloads"
STAGE="$DL/skyward-drop"
MARK="$HOME/Skyward/.last-update"

newer() {  # newest path matching the find args, but only if newer than MARK
  if [ -f "$MARK" ]; then
    find "$@" -newer "$MARK" 2>/dev/null | while IFS= read -r f; do ls -t "$f"; done | head -1
  else
    find "$@" 2>/dev/null -exec ls -t {} + 2>/dev/null | head -1
  fi
}

zip=$(newer "$DL" -maxdepth 1 -name 'files*.zip' || true)
if [ -n "$zip" ]; then
  rm -rf "$STAGE"; mkdir -p "$STAGE"
  unzip -oq -j "$zip" -d "$STAGE"
  inst=$(ls -t "$STAGE"/install-*.sh 2>/dev/null | head -1 || true)
  [ -n "$inst" ] || { echo "That download had no installer — tell Claude."; exit 1; }
else
  inst=$(newer "$DL" -maxdepth 2 -name 'install-*.sh' || true)
  [ -n "$inst" ] || { echo "No NEW Skyward download found in ~/Downloads."; echo "Click the Download button in the chat first, then run this again."; exit 1; }
fi
echo "── Running installer: $inst"
bash "$inst"
touch "$MARK"
