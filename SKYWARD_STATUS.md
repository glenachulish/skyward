# Skyward — Status

**Updated:** 2026-06-07 (Session 3 — Voyager basemap, synced to Pi, repo now on GitHub)

## Session 3 changes (this session)
- **Map labels:** Callum reported tile place-names shrinking on zoom. Diagnosed as
  inherent Carto tile behaviour (labels are baked into the tile image, not HTML — peak
  `divIcon` labels were already fixed-size and not the cause). Compared two fixes live
  (Voyager bolder-label tiles vs. label-free base + our own fixed labels); Callum chose
  **Voyager**. One-line URL swap in `map.js` (`light_all` → `rastertiles/voyager`).
- Synced to the Pi by rsync; confirmed `voyager` present on the Pi copy. Frontend-only,
  so no service restart needed.
- Initialised git and pushed the whole project to GitHub (first remote — see below).
- Note for next time: tile labels still re-render per zoom level (unavoidable for any
  tile basemap); Voyager just draws them more legibly. A genuine "never resizes" option
  remains available as a hybrid (Voyager base + our own fixed peak labels on top).


## Live deployment
- **Public URL:** https://ceol-pi.tail01672f.ts.net/skyward/  (LIVE ✅)
- **Pi internal port:** 8005, bound to 127.0.0.1 only.
- **systemd unit:** `skyward.service` — enabled (starts on boot), `active (running)`.
  Runs `/home/pi/Skyward/backend/.venv/bin/uvicorn main:app --host 127.0.0.1 --port 8005`.
- **Funnel:** added to the **443** Funnel as an additive path handler:
  `sudo tailscale funnel --bg --https=443 --set-path=/skyward http://127.0.0.1:8005`.
  Verified additive — `/`, `/orain`, `/nature` all preserved and still 200 (Òrain/Nature)
  after the change. Tailscale STRIPS the `/skyward` prefix, so backend stays prefix-naïve;
  frontend is prefix-aware and auto-detects — no code edits at deploy time.
- **GitHub:** repo now live at https://github.com/glenachulish/skyward (`main` tracks
  `origin/main`). `.gitignore` excludes `.venv/`, `__pycache__/`, `*.key`/`*.crt`/`.env`,
  drift reports, `.DS_Store` — so a future DataHub key can't be committed. First push
  needed `--allow-unrelated-histories` (repo had an auto-created file); routine pushes now
  are just `git add . && git commit -m … && git push`.
- **Deploy method:** `rsync` Mac→Pi. Repeat to update:
  `rsync -avz --exclude '.venv' --exclude '__pycache__' --exclude '.DS_Store' ~/Skyward/ pi@ceol-pi.local:~/Skyward/`
  then `ssh pi@ceol-pi.local "sudo systemctl restart skyward"` (only needed if backend changed).
  Standard update loop: commit + push to GitHub, then rsync to the Pi.
- **End-to-end verified on Pi:** `/api/health` 200; `/api/weather` 200 (live Open-Meteo
  fetch works from the Pi — the real data path, which couldn't be tested in Claude's sandbox).

### Observed (NOT ours — Ceòl cleanup item)
- Ceòl's `/`→:8080 handler on 443 returns **502** — pre-existing, independently confirmed
  this session: nothing listens on :8080; Ceòl's real backend is :8001 via the **8443**
  Funnel (returns 307, healthy). Matches the PI-INFRASTRUCTURE.md 2026-05-31 note. Adding
  `/skyward` did not touch it. Flagged for the Ceòl project, not Skyward.

## Decisions made on Callum's behalf (confirmable)
- **Backend:** thin FastAPI + uvicorn (matches Pi convention; makes a future DataHub
  switch mechanical). The `/api/weather` route is the single swap point.
- **Weather source:** Open-Meteo now (free, no key); Met Office DataHub later.
- **Aesthetic:** SOFT TOPOGRAPHIC — warm off-white paper, slate ink, muted blue-grey
  accent (`#5a7d9a`) + slate-teal secondary. (The original dark instrument-panel theme
  was rejected by Callum and replaced.)
- **Prefix-awareness:** built in from line one (`config.js`); auto-detects `/skyward`.

## Phase status

### Phase 0 — Foundations ✅ DONE
- [x] Project structure; prefix constant + `url()` helper (tested both paths + edge cases).
- [x] Cache-busting `?v=N` (currently v10) on all local assets.
- [x] CSS/JS in own files. `drift-report.sh` + `drift-compare.sh` (compare tested).

### Phase 1 — Core map & data ✅ DONE (Open-Meteo)
- [x] `/api/health`, `/api/weather`; Leaflet full-screen map + centred crosshair
      (Carto **Voyager** tiles — `rastertiles/voyager`, switched from `light_all` in
      Session 3 for bolder, clearer place labels; chosen over a fixed-label approach).
- [x] "Investigate" fetches weather for map centre; full Open-Meteo set incl. freezing level.
- [x] Progressive panel: Morning/PM/Night → swipe/tap for hourly.
- [x] Loading + error + oceanic-coordinate handling. **Live fetch confirmed on the Pi.**

### Phase 2 — Navigation & shell ✅ DONE
- [x] Bottom tab bar, now FOUR tabs: Map / Forecast / Webcams / Library.
- [x] Prefix-aware SPA router; refresh + back/forward survive.

### Phase 3 — Webcams & forecasts ✅ DONE (was partial)
- [x] **MWIS area forecasts** rendered clean/ad-free: backend `/api/mwis` fetches the
      area page server-side, strips ads, parses per-day sections (wind/wet/cloud/
      freezing level/outlook), caches 1h, attributes + links back. Falls back to the
      in-app launch card if parsing fails. (10 MWIS areas with correct slugs.)
- [x] MWIS video + synoptic-chart links.
- [x] **Met Office mountain (summit) forecasts** added under each MWIS area —
      `metoffice-mountain.json` maps all 10 Met Office areas; offers page + PDF.
- [x] **Webcams** dashboard: 14 real cams grouped by MWIS area, live thumbnails where
      operators expose them, local favouriting, open operator site in in-app viewer.
- Note: MWUK turned out to be a **paid mobile app** with no public web forecast pages —
  not linkable; Met Office mountain forecasts used as the summit-forecast source instead.

### Phase 3.5 — Peaks on the map ✅ DONE (new this session)
- [x] **100 UK summits** (`peaks.json`) — top 70 Munros + 30 highest English/Welsh peaks,
      verified coordinates from the Database of British & Irish Hills (DoBIH).
- [x] **~40 small mountains** (`small-mountains.json`) — best non-Munro Corbetts/Grahams
      by prominence (Quinag, Suilven, Stac Pollaidh, The Storr, etc.), in the spirit of
      Cicerone's "Scotland's Best Small Mountains".
- [x] Two map toggles ("Peaks" amber, "Small" slate-teal hollow pins); off by default to
      keep the map clean. Tap a pin → height/coords + mountain-forecast.com summit link,
      or Investigate-at-summit.
- ⚠️ Slug caveat: mountain-forecast.com slugs are name-derived; a few obscure peaks may
  mismatch and need a manual slug fix if their forecast link 404s.

### Phase 4 — The Library ✅ DONE (content can grow)
- [x] Five modules with attributed source links (open in in-app viewer).
- [x] Deep-link hook `Skyward.openLibrary(module, topic)` for future "What's This?".
- [ ] Contextual "What's This?" from map features (needs Met Office vector charts).

### Phase 5 — Winter Mode 🟡 STARTED
- [x] Winter master toggle (persists; shifts accent cooler).
- [ ] SAIS avalanche overlay (Green→Red by region).
- [ ] Freezing-level contour lines on the map.
- [ ] UKC crag pins → in-app viewer (the viewer itself is built).

### Phase 6 — Offline & polish ⬜ NOT STARTED
- [ ] One-tap "Save for Offline" (Met Office data, MWIS PDFs, SAIS reports).
- [ ] Optical-phenomena photo interpretation — **scope question:** in Weather Watcher
      doc but not the blueprint. In or out?

### Phase 7 — Deploy to the Pi ✅ DONE (this session)
- See "Live deployment" above. One additive Funnel command, no code edits, because
  prefix-awareness was built in from the start.

## In-app viewer (iab) note
External sites (MWIS, Met Office, UKC, webcam operators) mostly refuse iframe embedding,
so the in-app viewer shows a clean "launch card" (title + "Open the page ↗" button) rather
than gambling on an iframe. Reliable, no broken-frame dead ends.

## Open questions for Callum
1. Confirm backend (FastAPI) + source (Open-Meteo→DataHub) choices.
2. Optical-phenomena photo interpretation — in scope or drop it?
3. When to get a Met Office DataHub key (unlocks synoptic charts + "What's This?").
4. Want the *exact* Cicerone 40 (via their GPX) rather than the prominence-curated set?

## Courtesy / licensing reminders (personal use is fine)
- MWIS forecasts are fetched + reformatted; MWIS is a funded non-profit reliant on traffic.
- Webcam thumbnails are hotlinked from operators (as MWIS itself does).
- Peak coords: DoBIH (non-commercial licence). Peak forecasts: mountain-forecast.com.
- If Skyward is ever shared beyond personal use, a courtesy note to MWIS and a check of
  each source's terms would be the right thing.

## How to verify on the Mac
```bash
cd backend && uvicorn main:app --reload --port 8005   # then open http://localhost:8005/
```
