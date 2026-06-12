# Skyward — Session 6b notes (UKC-assisted pinning)

**Date:** 2026-06-12. FRONTEND ONLY — no service restart anywhere.

## What it adds
The 🔍 Search box now accepts three kinds of input:
1. **A place name** — as before (Nominatim).
2. **A pasted UKC crag page link** — Skyward extracts the crag's name from the
   URL slug, searches it, and the result/pin CARRIES THE LINK: the saved pin's
   sheet gains "⚒ Crag & conditions on UKC", and the pin form pre-selects Crag.
3. **Pasted coordinates** ("53.1707, -1.9803" — UKC prints Lat/Long on every
   crag page) — instant marker at the exact spot; if a UKC link was pasted
   just before (name not in OSM), the crag's name + link carry over.

The easy Hen Cloud loop: Search → ⚒ Search UKC → open the crag page → copy
its URL → back in Skyward, paste into Search → tap the result → Save as a
My Pin (already named, already a Crag, already linked). If OSM doesn't know
the name, the no-results message says to paste the page's Lat/Long instead.

## Files
- map.js → static/js/views/  (parsers, threading ukc through result→pin→sheet)
- index.html → static/       (map.js → v17)
No backend change; pins with links live in the same my-pins storage.

## Deploy (frontend only — no restart)
git add/commit/push, rsync as usual; skip the systemctl restart this time.
Re-upload to project knowledge after: map.js, index.html, this file.
