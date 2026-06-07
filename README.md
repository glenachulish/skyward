# Skyward

*Understand the Elements • Decode the Mountain.* A mountain-weather education
app for UK hikers, climbers and mountaineers. Developed on the Mac, deployed to
the Raspberry Pi behind Tailscale Funnel at `/skyward/`.

## Run it on the Mac

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate   # optional but tidy
pip install -r requirements.txt
uvicorn main:app --reload --port 8005
```

Open <http://localhost:8005/>. That's it — the frontend is served by the same
process, so there's nothing else to start.

## Architecture (and why)

A **thin FastAPI backend** (`backend/main.py`) serves the static frontend and
proxies weather APIs. It was chosen over a pure static site so that:

1. it matches the Pi convention (FastAPI + uvicorn on an internal port), and
2. when the **Met Office DataHub** switch happens (Phase 1 decision: Open-Meteo
   now, DataHub later), the API key lives server-side and the frontend never
   changes — it keeps calling `/api/weather`.

The frontend is **prefix-aware** (`static/js/config.js`). It works unchanged at
`/` (Mac) and `/skyward/` (Pi) because every URL is built through
`Skyward.url()` and nothing uses a leading-slash absolute path. The backend is
**prefix-naïve** — Tailscale strips the `/skyward` prefix before proxying (see
`PI-INFRASTRUCTURE.md`), so the backend genuinely lives at `/` from its own
view. Backend naïve, frontend aware: that's the contract.

### Layout

```
backend/main.py            FastAPI: /api/health, /api/weather, static + SPA fallback
static/index.html          entry point; relative asset paths + ?v= cache-busting
static/css/app.css         instrument-panel theme
static/js/config.js        THE PREFIX CONTRACT — edit with care
static/js/{store,weather,iab}.js   helpers
static/js/app.js           shell + SPA router
static/js/views/*.js       map, webcams, library
static/data/*.json         MWIS areas, library curriculum
```

## Cache-busting

Local assets are linked with `?v=N` in `index.html`. When you change a file,
bump its version number so Chrome refetches instead of serving a stale copy
(this is the handover-notes caching fix, done properly rather than inlining
everything into one file).

## The drift habit

Before any session that edits code, run `./drift-report.sh > disk-report.txt`,
ask Claude to regenerate the project-knowledge report, save it as
`pk-report.txt`, and run `./drift-compare.sh disk-report.txt pk-report.txt`.
Re-upload anything it flags. See `DRIFT-REPORT-HABIT.md`.

## Deploying to the Pi (Phase 7 — only once happy on the Mac)

1. Copy the project to the Pi; pick a free internal port (8004 is Òrain's; use
   **8005**). Run uvicorn on it (a systemd unit, like the other apps).
2. Add it to the 443 Funnel as an **added** path handler (verified additive):
   ```bash
   sudo tailscale funnel --bg --https=443 --set-path=/skyward http://127.0.0.1:8005
   ```
   Do **not** use `set-config`. Don't forget `sudo`.
3. Immediately curl the *other* paths (`/orain/…`, Ceòl's `/`) to confirm
   nothing else broke, then load `https://ceol-pi.tail01672f.ts.net/skyward/`.

Because the frontend auto-detects `/skyward`, no code edits are needed at deploy
time.
