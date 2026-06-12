# Skyward — Session 5d notes (PWA: installable app + icon; Find-crag = link-out)

## Find-crag outcome (2026-06-12, supersedes the 5c design)
UKC's API turned out to be browser-only: 403 to ALL non-browser clients
(curl with Skyward UA, default UA, and browser-imitating headers alike — TLS
fingerprinting), and CORS-closed to other origins. That is UKC clearly not
wanting programmatic access, so Skyward does not fight it: /api/ukc was
REMOVED from the backend and **Find crag now links out** — type a name, UKC's
own crag search opens in the in-app viewer (every crag they have, routes,
logbooks, conditions). To keep a found crag: right-click/long-press its map
spot → save a My Pin. The 50 curated crag pins are unaffected (that data came
legitimately via the interactive browser session). Cache-bust: map.js → v15.

**Date:** 2026-06-11. SUPERSEDES the 5c drop — this file set contains
everything from 5c (UKC search etc.) plus the PWA, so it installs correctly
whether or not 5c was ever installed.

## What was added
- **App icon** (static/icons/): twin snow-capped peaks (slate ink + accent
  blue), topo contour rings, teal glen floor, on the soft-topographic paper —
  drawn programmatically at 1024px, shipped as 512/192/180(apple)/maskable.
- **manifest.webmanifest** — name, icons, standalone display, paper theme
  colour. start_url/scope are RELATIVE (".") so the same file works at "/"
  on the Mac and "/skyward/" on the Pi (prefix contract holds).
- **sw.js** — minimal service worker for installability. Deliberately does
  NO caching: ?v=N owns freshness (the handover-notes lesson); Phase 6
  "Save for Offline" is where real offline bundling belongs.
- **Backend**: /manifest.webmanifest and /sw.js served from the app ROOT
  (required for SW scope), placed before the SPA catch-all. BACKEND CHANGED.
- **index.html**: manifest link, apple-touch-icon + iOS standalone meta,
  theme-color updated #11161c → #f4f1ea (old dark-theme leftover), SW
  registration snippet (relative path).

## Installing Skyward as an app (after deploy)
- **iPhone/iPad**: open https://ceol-pi.tail01672f.ts.net/skyward/ in Safari
  → Share → **Add to Home Screen** → the twin-peaks icon appears; opens
  full-screen without browser chrome.
- **Mac Chrome**: install icon at the right of the address bar (or ⋮ → Cast,
  save and share → Install). **Mac Safari**: File → **Add to Dock**.
- Note: installing needs HTTPS — the Funnel URL qualifies; plain
  http://localhost also works for testing in Chrome.

## Verify on the Mac
- `curl http://localhost:8005/manifest.webmanifest` → JSON with 3 icons.
- `curl -I http://localhost:8005/sw.js` → 200, application/javascript.
- Hard-refresh the app; DevTools → Application → Manifest shows the icon.

## Deploy (GitHub + Pi)
```bash
cd ~/Skyward
git add . && git commit -m "Sessions 5a-5d: SAIS, map UI, crags, My Pins, responsive, UKC search, PWA" && git push
rsync -avz --exclude '.venv' --exclude '__pycache__' --exclude '.DS_Store' --exclude '*.bak-*' --exclude 'index.html.stray-*' ~/Skyward/ pi@ceol-pi.local:~/Skyward/
ssh -t pi@ceol-pi.local "sudo systemctl restart skyward"   # backend changed — REQUIRED
```
Post-deploy: curl /skyward/api/health, /skyward/api/ukc?q=ben, /skyward/manifest.webmanifest
on the Funnel; spot-check /orain/. Then re-upload to project knowledge:
main.py, map.js, app.css, index.html, manifest.webmanifest, sw.js, this file.

## State observed this session (via Chrome)
- Pi: Session 5a backend LIVE and correct (/api/sais parses real out-of-season
  SAIS); /api/ukc 404 → 5c not yet deployed. This deploy carries 5b-5d.
- Mac: uvicorn was not running; 5c install unconfirmed — this superset
  installer makes that moot.

## TODOs carried forward
- SAIS RSS, in-season parse check next winter, region GeoJSON.
- My Pins are per-browser; shared store needs auth thought (public URL).
- Phase 6: extend sw.js into real "Save for Offline".
