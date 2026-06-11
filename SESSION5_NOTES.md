# Skyward — Session 5 notes (Phase 5a: SAIS avalanche overlay + 5d Library wiring)

**Date:** 2026-06-09. Built against the files uploaded this session
(`main.py`, `map.js`, `app.js`, `config.js` — all current per the drift habit).
`app.css` and `index.html` were NOT uploaded, so their changes ship as
manual steps below rather than blind edits.

## The SAIS source investigation (the session's first task — findings)

- **No public JSON API.** sais.gov.uk is WordPress; `/api/sais` is an HTML
  parser, same pattern as `/api/mwis`.
- **The homepage carries all six region cards** (hazard word, EAWS
  description, published date) — so the overlay needs ONE fetch for all six
  regions, not six. Region pages (`sais.gov.uk/lochaber/` etc.) carry the
  detail (forecast period, snow stability, weather influences, comments) and
  are fetched lazily per tap.
- **Out-of-season is detectable**: the homepage says reports have
  "finished … for the winter", and published dates go stale. Both are used
  (message wins; >3-day-old reports as backstop).
- Region pages advertise a per-region **RSS feed** — possibly a more stable
  parse target. Unverified; TODO below.

## What was built

### Backend — `backend/main.py` (REPLACE your copy; backend changed → restart on Pi later)
- New `/api/sais` route, MWIS-style: server-side fetch, 3 h in-process cache,
  identifying User-Agent, attribution + source link on every response,
  `parsed: false` soft fallback on network/parse failure.
  - `/api/sais` → all-regions summary `{parsed, in_season, regions:[{id, name,
    hazard, level 1–5, description, published, url}], attribution}`.
  - `/api/sais?region=lochaber` → detail `{forecast:{period, hazard, level,
    stability, weather, comments}, in_season, …}`.
- Hazard words map Low→1 … Very High→5. Parser anchors each homepage card to
  the region name as a whole line and cuts at the next heading, so nav-menu
  mentions of region names can't poison the parse (a failure mode caught and
  fixed by the tests).

### Data — `static/data/sais-regions.json` (NEW)
The six regions: id, name, page slug, and **indicative** circle anchor points
(each pinned to the region's best-known summit) + radius. These are overlay
anchors, not survey data — proper region GeoJSON is a later nicety.

### Frontend — `static/js/views/map.js` (REPLACE your copy)
- The overlay **rides the existing Winter toggle** (the Phase 5 design):
  Winter on → one `/api/sais` call → six `L.circle`s coloured via the existing
  `--good/--warn/--high/--danger/--severe` vars (resolved at draw time, so the
  winter re-theme is honoured). Winter off → layer removed.
- **Out of season** (your chosen behaviour): no circles; a dismissible banner
  explains forecasts return in winter. It is out of season NOW, so this is
  what you'll see on the Mac in June — the in-season path is covered by tests.
- Tap a region → the existing sheet pattern: hazard chip + EAWS description
  instantly, full report detail filled in lazily, link to the full SAIS page
  via `S.iab.open()`, and — **the 5d wiring** — a "What do hazard levels &
  roses mean?" link calling `Skyward.openLibrary(SNOWPACK_MODULE, "hazard-rose")`.
- Teardown cleans the layer + banner.

### Tests — `test_sais.py`
Mocked-httpx suite (sais.gov.uk and Open-Meteo are unreachable in Claude's
sandbox): in-season parse with all six levels, nav-noise immunity, cache hit,
out-of-season detection, region detail without section bleed, unknown region
404, network-failure fallback. **All pass.** Keep or discard; it isn't a
runtime file.

## Manual steps (the two files Claude couldn't see)

1. **`static/css/app.css`** — append the whole of `sais-css-additions.css`
   to the end, then delete that helper file.
2. **`static/index.html`** — bump cache-bust on the two changed assets:
   `css/app.css?v=11` → `v=12` and `js/views/map.js?v=11` → `v=12`.
3. **Re-upload to project knowledge** afterwards: `main.py`, `views/map.js`,
   `app.css`, `index.html` (and this file) — keeps the drift report honest.

## Verify on the Mac

```bash
cd backend && uvicorn main:app --reload --port 8005   # then http://localhost:8005/
```
- `curl http://localhost:8005/api/sais` — expect real parsed cards with
  `in_season: false` (it's June). This is the one thing the sandbox couldn't
  test live (same caveat as Open-Meteo/Nominatim in earlier sessions).
- In the app: toggle **❄ Winter** on the map → the out-of-season banner should
  appear (and no circles).
- **To preview the in-season circles now**: temporarily change the summary
  payload line in `main.py` to `"in_season": True,` (it's the line calling
  `_sais_in_season`), reload, toggle Winter. Hazard will be grey/last-published
  colours. **Revert before deploying.**
- Check the Library link in a region sheet lands on Module 5 — see TODO below.

## Deploy to the Pi (when happy — backend changed, so restart needed)

```bash
git add . && git commit -m "Phase 5a: SAIS avalanche overlay + Library wiring" && git push
rsync -avz --exclude '.venv' --exclude '__pycache__' --exclude '.DS_Store' ~/Skyward/ pi@ceol-pi.local:~/Skyward/
ssh -t pi@ceol-pi.local "sudo systemctl restart skyward"   # -t matters
```
Then curl `/skyward/api/sais` on the Funnel and spot-check `/orain/` and the
other paths as always.

## TODOs / open items

- **Library module id**: `SNOWPACK_MODULE = "snowpack"` in `map.js` is a
  guess — check the real Module 5 id in the library curriculum JSON /
  `library.js` (neither uploaded this session) and correct the constant.
- **RSS feeds**: each region page advertises one (likely
  `sais.gov.uk/<region>/feed/`). One manual check on the Mac; if clean, it's a
  more stable parse target than HTML for a future hardening pass.
- **Live-parse confirmation next winter** (or from the forecast archive): the
  parser is built from the page structure as fetched 2026-06-09 + tests; the
  `parsed:false` fallback covers drift, but eyeball the first in-season fetch.
- **Region GeoJSON boundaries** to replace the circles (nicety, not blocker).
- **Hazard rose / avalanche problems** aren't parsed yet (icon-based markup) —
  the sheet links to the full report instead. Candidate for a later pass.
- **Next up per the agreed order: 5b — UKC crag pins** (no backend, reuses the
  peaks-layer + in-app-viewer patterns; main work is curating ~50 venues per
  your decision).
