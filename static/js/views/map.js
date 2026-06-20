/*
 * views/map.js — the home view. Full-screen Leaflet map with a centred
 * crosshair; "Investigate" fetches weather for the map centre and raises a
 * progressive bottom sheet (Morning/PM/Night summary -> swipe up for hourly).
 *
 * Two map actions sit at the bottom centre, as a pair:
 *   ⌖ Investigate   — live weather (Open-Meteo) for the exact crosshair point.
 *   ⛅ Forecast here — the Met Office 5-day forecast for the NEAREST named area
 *                      (metoffice-areas.json) to the map centre. Jumps to the
 *                      Forecast tab focused on that area via S.openForecast().
 * Both read the map CENTRE, so they never clash with left-click, right-click /
 * long-press (add a pin), or each other — there are no map-surface gestures
 * bound to either; the crosshair + buttons are the whole interaction.
 */
(function () {
  const S = window.Skyward;
  const { wx, compass, fetchWeather } = S.weather;

  let map = null;
  let areas = [];        // MWIS areas, for the "Jump to area…" select
  let moAreas = [];      // Met Office areas, for "Forecast here" nearest-match

  async function render(stage) {
    stage.innerHTML = `
      <div id="map"></div>
      <div id="crosshair"><div class="ring"></div></div>
      <div class="map-topbar">
        <div class="topbar-row">
          <select class="area-select" id="area-select" aria-label="Jump to forecast area">
            <option value="">Jump to area…</option>
          </select>
          <div class="text-size" role="group" aria-label="Text size">
            <button id="font-down" aria-label="Smaller text">A−</button>
            <button id="font-reset" aria-label="Reset text size">A</button>
            <button id="font-up" aria-label="Larger text">A+</button>
          </div>
          <div class="text-size zoom-ctl" role="group" aria-label="Map zoom">
            <button id="zoom-out" aria-label="Zoom out">Zoom −</button>
            <button id="zoom-in" aria-label="Zoom in">Zoom +</button>
          </div>
          <button class="winter-toggle" id="winter-toggle" aria-pressed="false">❄ Winter</button>
          <button class="winter-toggle" id="locate-btn" aria-label="Centre on my location">⦿ Locate</button>
        </div>
        <div class="topbar-row">
          <div class="seg" role="group" aria-label="Map layers">
            <button class="winter-toggle" id="peaks-toggle" aria-pressed="false">⛰ Peaks</button>
            <button class="winter-toggle" id="small-toggle" aria-pressed="false">▲ Hills</button>
            <button class="winter-toggle" id="crags-toggle" aria-pressed="false">⚒ Crags</button>
          </div>
          <button class="winter-toggle" id="search-btn" aria-label="Search for a place">🔍 Search</button>
        </div>
      </div>
      <div class="fab-stack">
        <button class="fab" id="investigate">⌖ Investigate</button>
        <button class="fab fab-secondary" id="forecast-here">⛅ Forecast here</button>
      </div>
      <div id="sheet" aria-live="polite"></div>
    `;

    // --- Leaflet map ---------------------------------------------------------
    // zoomControl:false — Leaflet's corner +/− overlapped the area dropdown;
    // zoom now lives in the topbar beside the text-size control.
    map = L.map("map", { zoomControl: false, attributionControl: true })
           .setView([56.8, -5.0], 8); // West Highlands default

    // Carto Voyager tiles — warm topographic base with bolder, clearer place labels.
    L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
      maxZoom: 18,
      attribution: '© OpenStreetMap contributors © CARTO',
    }).addTo(map);

    // --- Area jump-to --------------------------------------------------------
    try {
      const res = await fetch(S.url("static/data/mwis-areas.json"));
      areas = (await res.json()).areas || [];
      const sel = stage.querySelector("#area-select");
      areas.forEach((a) => {
        const opt = document.createElement("option");
        opt.value = a.id; opt.textContent = a.name;
        sel.appendChild(opt);
      });
      sel.addEventListener("change", (e) => {
        const a = areas.find((x) => x.id === e.target.value);
        if (a) map.flyTo([a.lat, a.lon], 10, { duration: .8 });
      });
    } catch { /* non-fatal: jump-to just stays empty */ }

    // --- Met Office areas (for "Forecast here") ------------------------------
    // Loaded once, used to find the nearest named area to the map centre. Same
    // file the Forecast tab uses — each area carries a lat/lon. Non-fatal: if
    // it doesn't load, the button degrades to a gentle toast.
    try {
      moAreas = (await (await fetch(S.url("static/data/metoffice-areas.json"))).json()).areas || [];
    } catch { moAreas = []; }

    // --- Winter toggle -------------------------------------------------------
    // Phase 5a: the SAIS avalanche overlay rides on this toggle — Winter on
    // draws the six region circles (in season), Winter off removes them.
    const wt = stage.querySelector("#winter-toggle");
    if (S.store.get("winter", false)) { document.body.classList.add("winter"); wt.setAttribute("aria-pressed", "true"); }
    wt.addEventListener("click", () => {
      const on = document.body.classList.toggle("winter");
      wt.setAttribute("aria-pressed", String(on));
      S.store.set("winter", on);
      setSaisOverlay(on);
    });
    if (S.store.get("winter", false)) setSaisOverlay(true);

    // --- Peaks / Hills / Crags layer toggles ---------------------------------
    // Crags (Phase 5b) is YEAR-ROUND, deliberately independent of the Winter
    // toggle — rock climbing isn't seasonal, only the conditions are.
    layerBtns = {
      munros: stage.querySelector("#peaks-toggle"),
      small:  stage.querySelector("#small-toggle"),
      crags:  stage.querySelector("#crags-toggle"),
    };
    for (const key of Object.keys(LAYER_DEFS)) {
      const d = LAYER_DEFS[key], btn = layerBtns[key];
      btn.addEventListener("click", () => toggleLayer(key, d.path, d.cls, btn));
      // Restore last state (off by default to keep the map clean).
      if (S.store.get({ munros: "peaks-on", small: "small-on", crags: "crags-on" }[key], false)) {
        toggleLayer(key, d.path, d.cls, btn);
      }
    }

    // My Pins: right-click (Mac) / long-press (phone) anywhere on the map to
    // add your own peak, hill or crag — no editing files behind the scenes.
    map.on("contextmenu", (e) => {
      if (e.originalEvent) e.originalEvent.preventDefault();
      openAddPin(e.latlng.lat, e.latlng.lng);
    });

    // --- Map zoom buttons (replace Leaflet's corner control) -----------------
    stage.querySelector("#zoom-in").addEventListener("click", () => map.zoomIn());
    stage.querySelector("#zoom-out").addEventListener("click", () => map.zoomOut());

    // Search: places via OpenStreetMap, crags via UKC link-out
    stage.querySelector("#search-btn").addEventListener("click", openSearch);

    // --- Text size control ---------------------------------------------------
    const fontDown = stage.querySelector("#font-down");
    const fontUp = stage.querySelector("#font-up");
    const fontReset = stage.querySelector("#font-reset");
    fontDown.addEventListener("click", () => { S.fontScale.set(S.fontScale.get() - 1); refreshFontState(stage); });
    fontUp.addEventListener("click", () => { S.fontScale.set(S.fontScale.get() + 1); refreshFontState(stage); });
    fontReset.addEventListener("click", () => { S.fontScale.reset(); refreshFontState(stage); });
    refreshFontState(stage);

    // --- Investigate ---------------------------------------------------------
    stage.querySelector("#investigate").addEventListener("click", investigate);

    // --- Forecast here -------------------------------------------------------
    stage.querySelector("#forecast-here").addEventListener("click", forecastHere);

    // --- Locate (geolocation) ------------------------------------------------
    stage.querySelector("#locate-btn").addEventListener("click", () => locate(true));
    // Auto-locate ONCE, then remember the choice; default centre on later loads.
    // (Change `false` to `true` below if you'd prefer it to locate every open.)
    if (!S.store.get("located-once", false)) locate(false);

    map.whenReady(() => setTimeout(() => map.invalidateSize(), 60)); // Leaflet layout fix
  }

  // Disable A−/A+ at the ends so the control communicates its range.
  function refreshFontState(stage) {
    const i = S.fontScale.get();
    const last = S.fontScale.steps.length - 1;
    const down = stage.querySelector("#font-down");
    const up = stage.querySelector("#font-up");
    if (down) down.disabled = (i <= 0);
    if (up) up.disabled = (i >= last);
  }

  // --- "Forecast here" ------------------------------------------------------
  // Find the nearest named Met Office area to the map centre and jump to the
  // Forecast tab focused on it. Pure client-side: the areas (with lat/lon) are
  // already loaded, so this is instant and works offline; the actual forecast
  // fetch is the Forecast tab's existing 1-hour-cached /api/metoffice call.
  function forecastHere() {
    const btn = document.getElementById("forecast-here");
    const c = map.getCenter();
    const nearest = nearestMoArea(c.lat, c.lng);
    if (!nearest) {
      S.toast("Forecast areas aren't loaded yet — try again in a moment.");
      return;
    }
    if (btn) {
      btn.disabled = true;
      setTimeout(() => { btn.disabled = false; }, 600); // re-enable after the view swap
    }
    S.toast(`Nearest Met Office area: ${nearest.name}`);
    S.openForecast(nearest.id, "metoffice");
  }

  // Great-circle (Haversine) distance in km between two lat/lon points.
  function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const toRad = (deg) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  // Nearest Met Office area to a point, or null if none are loaded.
  function nearestMoArea(lat, lon) {
    let best = null, bestD = Infinity;
    for (const a of moAreas) {
      if (a.lat == null || a.lon == null) continue;
      const d = haversineKm(lat, lon, a.lat, a.lon);
      if (d < bestD) { bestD = d; best = a; }
    }
    return best;
  }

  // Centre the map on the device location. `userInitiated` controls messaging:
  // a tap gives feedback; the silent first-load attempt stays quiet on failure.
  function locate(userInitiated) {
    if (!("geolocation" in navigator)) {
      if (userInitiated) S.toast("Location isn't available on this device.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        map.flyTo([latitude, longitude], 11, { duration: .8 });
        S.store.set("located-once", true);
      },
      (err) => {
        S.store.set("located-once", true); // don't nag on every load if denied
        if (userInitiated) {
          S.toast(err.code === err.PERMISSION_DENIED
            ? "Location permission denied — showing the default view."
            : "Couldn't get your location — showing the default view.");
        }
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
    );
  }

  // Item 2: ask the backend to reverse-geocode a point to a place name.
  // Backend route is /api/place?lat=&lon= (see the main.py snippet in chat).
  // Prefix-aware via S.url(); fails soft (returns null) so the panel keeps
  // showing coordinates if the lookup is unavailable.
  async function fetchPlaceName(lat, lon) {
    try {
      const res = await fetch(S.url(`api/place?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`));
      if (!res.ok) return null;
      const j = await res.json();
      return (j && j.name) ? j.name : null;
    } catch { return null; }
  }

  // Lazy-loaded marker layers, keyed by name.
  const layers = {};
  // One definition per layer, shared by the topbar toggles and the My-Pins
  // refresh logic. kind = the type a user-added pin declares.
  const LAYER_DEFS = {
    munros: { path: "static/data/peaks.json",           cls: "peak-pin",           kind: "peak" },
    small:  { path: "static/data/small-mountains.json", cls: "peak-pin small-pin", kind: "hill" },
    crags:  { path: "static/data/crags.json",           cls: "peak-pin crag-pin",  kind: "crag" },
  };
  let layerBtns = {};   // toggle buttons, captured each render

  // --- SAIS avalanche overlay (Phase 5a + 5d) -------------------------------
  // Shown when Winter is on. One /api/sais call covers all six regions; each
  // is drawn as a circle coloured on the EAWS scale via the existing
  // --good/--warn/--high/--danger/--severe vars (resolved at draw time so the
  // winter re-theme is picked up). Out of season: no circles, a dismissible
  // banner instead (Callum's chosen behaviour). Tap a region -> detail sheet
  // with a Library deep-link into Module 5 (the 5d wiring).
  //
  // Verified against library.json (uploaded 2026-06-10): Module 5 id.
  const SNOWPACK_MODULE = "snowpack-safety";
  let saisLayer = null;
  let saisBanner = null;

  function hazardColour(level) {
    const vars = ["--good", "--warn", "--high", "--danger", "--severe"];
    const v = level >= 1 && level <= 5 ? vars[level - 1] : null;
    const c = v ? getComputedStyle(document.body).getPropertyValue(v).trim() : "";
    return c || "#9aa5ad"; // neutral grey when no hazard category is issued
  }

  async function setSaisOverlay(on) {
    if (!on) {
      if (saisLayer && map && map.hasLayer(saisLayer)) map.removeLayer(saisLayer);
      saisLayer = null;
      removeSaisBanner();
      return;
    }
    let summary = null, regions = [];
    try {
      const [sumRes, regRes] = await Promise.all([
        fetch(S.url("api/sais")),
        fetch(S.url("static/data/sais-regions.json")),
      ]);
      summary = await sumRes.json();
      regions = (await regRes.json()).regions || [];
    } catch { /* fall through to the failure toast below */ }

    if (!map || !document.body.classList.contains("winter")) return; // toggled off meanwhile
    if (!summary || summary.parsed === false) {
      S.toast("Couldn't read the SAIS forecasts — try sais.gov.uk directly.");
      return;
    }
    if (!summary.in_season) {
      showSaisBanner("❄ SAIS avalanche forecasts have finished for the season — the overlay will return when winter forecasting restarts (usually December).");
      return;
    }

    const byId = {};
    (summary.regions || []).forEach((r) => { byId[r.id] = r; });
    saisLayer = L.layerGroup();
    regions.forEach((meta) => {
      const r = byId[meta.id] || { id: meta.id, name: meta.name };
      const colour = hazardColour(r.level);
      const circle = L.circle([meta.lat, meta.lon], {
        radius: meta.radius_m || 12000,
        color: colour, weight: 2, opacity: 0.9,
        fillColor: colour, fillOpacity: 0.25,
      });
      circle.bindTooltip(`${r.name}${r.hazard ? " — " + r.hazard : ""}`, { direction: "top" });
      circle.on("click", () => openSais(r));
      saisLayer.addLayer(circle);
    });
    saisLayer.addTo(map);
  }

  function showSaisBanner(msg) {
    removeSaisBanner();
    saisBanner = document.createElement("div");
    saisBanner.className = "sais-banner";
    saisBanner.innerHTML = `<span>${msg}</span><button aria-label="Dismiss">✕</button>`;
    saisBanner.querySelector("button").addEventListener("click", removeSaisBanner);
    const stage = document.getElementById("view");
    if (stage) stage.appendChild(saisBanner);
  }

  function removeSaisBanner() {
    if (saisBanner) { saisBanner.remove(); saisBanner = null; }
  }

  // Tap a region: instant sheet from the summary, detail filled in lazily from
  // /api/sais?region=… (the per-region page fetch happens server-side).
  function openSais(r) {
    const sheet = document.getElementById("sheet");
    sheet.classList.add("open");
    sheet.classList.remove("expanded");
    const lvl = r.level ? ` lvl-${r.level}` : "";
    sheet.innerHTML = `
      <div class="sheet-grip"><span></span></div>
      <div class="sheet-head">
        <div>
          <h2>⚠ ${r.name}</h2>
          <div class="coords">${r.published ? "Published " + r.published : "SAIS avalanche forecast"}</div>
        </div>
        <button class="sheet-close" onclick="document.getElementById('sheet').classList.remove('open')">✕</button>
      </div>
      <div class="sheet-body">
        ${r.hazard ? `<div class="sais-hazard${lvl}">${r.hazard}</div>` : ""}
        ${r.description ? `<p class="sais-desc">${r.description}</p>` : ""}
        <div class="sais-detail"><div class="sheet-state"><div class="spinner"></div>Fetching the full report…</div></div>
        <div class="fc-links">
          <a class="fc-link" id="sais-full">⚠ Full SAIS report</a>
          <a class="fc-link" id="sais-learn">📖 What do hazard levels &amp; roses mean?</a>
        </div>
        <div class="attribution">
          Data: <a href="${r.url}" target="_blank" rel="noopener">Scottish Avalanche Information Service</a>.
          Tap through to visit the source.
        </div>
      </div>`;
    sheet.querySelector("#sais-full").addEventListener("click", () => S.iab.open(r.url, `${r.name} — SAIS`));
    // 5d: the contextual hook from the overlay into Library Module 5.
    sheet.querySelector("#sais-learn").addEventListener("click", () => S.openLibrary(SNOWPACK_MODULE, "hazard-scale"));

    fetch(S.url(`api/sais?region=${encodeURIComponent(r.id)}`))
      .then((res) => res.json())
      .then((d) => {
        const box = sheet.querySelector(".sais-detail");
        if (!box) return; // sheet was replaced meanwhile
        if (!d.parsed || !d.forecast) { box.innerHTML = ""; return; }
        const f = d.forecast;
        const field = (label, text) => text ? `<div class="sais-field"><h4>${label}</h4><p>${text}</p></div>` : "";
        box.innerHTML = `
          ${f.period ? `<div class="sais-period">${f.period}</div>` : ""}
          ${field("Snow stability & avalanche hazard", f.stability)}
          ${field("Weather influences", f.weather)}
          ${field("Comments", f.comments)}`;
      })
      .catch(() => {
        const box = sheet.querySelector(".sais-detail");
        if (box) box.innerHTML = "";
      });
  }


  async function toggleLayer(key, dataPath, pinClass, btn) {
    const storeKey = { munros: "peaks-on", small: "small-on", crags: "crags-on" }[key] || key + "-on";
    if (layers[key] && map.hasLayer(layers[key])) {
      map.removeLayer(layers[key]);
      btn.setAttribute("aria-pressed", "false");
      S.store.set(storeKey, false);
      return;
    }
    if (!layers[key]) {
      let items = [];
      try {
        const data = await (await fetch(S.url(dataPath))).json();
        items = data.peaks || data.crags || [];
      } catch {}
      // Merge in the user's own pins of this kind (stored in this browser).
      const kind = (LAYER_DEFS[key] || {}).kind;
      const mine = (S.store.get("my-pins", []) || []).filter((x) => x.kind === kind);
      items = items.concat(mine.map((x) => ({ ...x, custom: true })));
      const lg = L.layerGroup();
      items.forEach((p) => {
        const icon = L.divIcon({
          className: pinClass + (p.custom ? " custom-pin" : ""),
          html: `<span class="peak-dot"></span><span class="peak-label">${p.name}</span>`,
          iconSize: [10, 10],
          iconAnchor: [5, 5],
        });
        const m = L.marker([p.lat, p.lon], { icon, title: p.name });
        m.on("click", () => (p.custom ? openCustomPin(p) : key === "crags" ? openCrag(p) : openPeak(p)));
        lg.addLayer(m);
      });
      layers[key] = lg;
    }
    layers[key].addTo(map);
    btn.setAttribute("aria-pressed", "true");
    S.store.set(storeKey, true);
  }

  // --- My Pins -------------------------------------------------------------
  // User-added peaks/hills/crags, stored in this browser via S.store
  // ("my-pins"). Added by right-click / long-press on the map, or from the
  // Investigate panel. Custom pins render inside the matching toggle layer
  // with a dashed-ring marker, and can be removed from their own sheet.
  const KIND_META = {
    peak: { key: "munros", label: "Peak", icon: "⛰" },
    hill: { key: "small",  label: "Hill", icon: "▲" },
    crag: { key: "crags",  label: "Crag", icon: "⚒" },
  };

  function refreshLayerFor(kind) {
    const key = KIND_META[kind].key;
    const def = LAYER_DEFS[key];
    const btn = layerBtns[key];
    const wasOn = layers[key] && map && map.hasLayer(layers[key]);
    if (wasOn) map.removeLayer(layers[key]);
    delete layers[key];                       // invalidate cache so pins reload
    if (btn) toggleLayer(key, def.path, def.cls, btn);   // (re)builds + shows
  }

  function openAddPin(lat, lon, suggested, opts) {
    opts = opts || {};
    const sheet = document.getElementById("sheet");
    sheet.classList.add("open");
    sheet.classList.remove("expanded");
    sheet.innerHTML = `
      <div class="sheet-grip"><span></span></div>
      <div class="sheet-head">
        <div>
          <h2>📍 New pin</h2>
          <div class="coords">${lat.toFixed(4)}, ${lon.toFixed(4)}</div>
        </div>
        <button class="sheet-close" onclick="document.getElementById('sheet').classList.remove('open')">✕</button>
      </div>
      <div class="sheet-body">
        <div class="pin-form">
          <input id="pin-name" type="text" maxlength="60" placeholder="Name this place…" value="${(suggested || "").replace(/"/g, "&quot;")}" />
          <div class="seg" role="group" aria-label="Pin type">
            <button class="winter-toggle pin-kind" data-kind="peak" aria-pressed="true">⛰ Peak</button>
            <button class="winter-toggle pin-kind" data-kind="hill" aria-pressed="false">▲ Hill</button>
            <button class="winter-toggle pin-kind" data-kind="crag" aria-pressed="false">⚒ Crag</button>
          </div>
          <button class="fab-inline" id="pin-save">Save pin</button>
          <div class="attribution">Saved on this device — your pins live in this browser's storage, so add them on the phone too if you want them there.</div>
        </div>
      </div>`;
    let kind = opts.kind || "peak";
    if (kind !== "peak") {
      sheet.querySelectorAll(".pin-kind").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.kind === kind)));
    }
    sheet.querySelectorAll(".pin-kind").forEach((b) => {
      b.addEventListener("click", () => {
        kind = b.dataset.kind;
        sheet.querySelectorAll(".pin-kind").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      });
    });
    sheet.querySelector("#pin-save").addEventListener("click", () => {
      const name = (sheet.querySelector("#pin-name").value || "").replace(/[<>]/g, "").trim() || "Unnamed pin";
      const pins = S.store.get("my-pins", []) || [];
      const pin = { id: Date.now(), name, kind, lat, lon };
      if (opts.ukc) pin.ukc = opts.ukc;       // pasted UKC link travels with the pin
      pins.push(pin);
      S.store.set("my-pins", pins);
      sheet.classList.remove("open");
      refreshLayerFor(kind);                  // show it immediately (turns the layer on)
      S.toast(`${KIND_META[kind].icon} ${name} pinned`);
    });
    const nameEl = sheet.querySelector("#pin-name");
    nameEl.focus();
    // If no name was suggested, quietly ask /api/place for one (non-blocking).
    if (!suggested) {
      fetchPlaceName(lat, lon).then((n) => {
        if (n && !nameEl.value) nameEl.value = n;
      }).catch(() => {});
    }
  }

  function openCustomPin(p) {
    const sheet = document.getElementById("sheet");
    const meta = KIND_META[p.kind] || KIND_META.peak;
    sheet.classList.add("open");
    sheet.classList.remove("expanded");
    sheet.innerHTML = `
      <div class="sheet-grip"><span></span></div>
      <div class="sheet-head">
        <div>
          <h2>${meta.icon} ${p.name}</h2>
          <div class="coords">Your ${meta.label.toLowerCase()} · ${p.lat.toFixed(4)}, ${p.lon.toFixed(4)}</div>
        </div>
        <button class="sheet-close" onclick="document.getElementById('sheet').classList.remove('open')">✕</button>
      </div>
      <div class="sheet-body">
        <div class="fc-links">
          ${p.ukc ? '<a class="fc-link" id="custom-ukc">⚒ Crag &amp; conditions on UKC</a>' : ""}
          <a class="fc-link" id="custom-investigate">⌖ Investigate this point</a>
          <a class="fc-link" id="custom-remove">🗑 Remove this pin</a>
        </div>
        <div class="attribution">A pin you added, stored in this browser.</div>
      </div>`;
    if (p.ukc) {
      sheet.querySelector("#custom-ukc").addEventListener("click", () =>
        S.iab.open(`https://www.ukclimbing.com/logbook/crags/${p.ukc}/`, `${p.name} — UKC`));
    }
    sheet.querySelector("#custom-investigate").addEventListener("click", () => {
      map.setView([p.lat, p.lon], Math.max(map.getZoom(), 11), { animate: true });
      investigate();
    });
    const rm = sheet.querySelector("#custom-remove");
    rm.addEventListener("click", () => {
      if (!rm.dataset.armed) {                 // two-tap confirm, no popup
        rm.dataset.armed = "1";
        rm.textContent = "🗑 Tap again to remove";
        return;
      }
      const pins = (S.store.get("my-pins", []) || []).filter((x) => x.id !== p.id);
      S.store.set("my-pins", pins);
      sheet.classList.remove("open");
      refreshLayerFor(p.kind);
      S.toast("Pin removed");
    });
  }

  // --- Search (places + crag link-out) ---------------------------------------
  // "Type Hen Cloud, the map flies there, pin it." Place results come from
  // /api/search (Nominatim forward geocoding — the same OSM service that
  // names Investigate points, same usage policy). Tap a result: fly there,
  // drop a temporary marker, offer Save-as-pin (pre-named) or Investigate.
  // UKC's own crag search stays one tap away in the same sheet (their API is
  // browser-only — see SESSION5D notes — so crags remain a courteous link-out).
  let searchMarker = null;
  let pendingUkc = null;   // {slug, name} from a pasted UKC link, carried into results/pins
  const esc = (s) => String(s || "").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));

  // "crags/hells_lum-28" -> {slug: "hells_lum-28", name: "Hells Lum"}
  function parseUkcUrl(text) {
    const m = String(text).match(/ukclimbing\.com\/logbook\/crags?\/([a-z0-9_'-]+-\d+)/i);
    if (!m) return null;
    const slug = m[1];
    const words = slug.replace(/-\d+$/, "").split(/[_]+/).filter(Boolean);
    const name = words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    return { slug, name };
  }

  // "53.1707, -1.9803" (or space-separated) -> {lat, lon}
  function parseCoords(text) {
    const m = String(text).trim().match(/^(-?\d{1,2}(?:\.\d+)?)[,\s]+(-?\d{1,3}(?:\.\d+)?)$/);
    if (!m) return null;
    const lat = parseFloat(m[1]), lon = parseFloat(m[2]);
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
    return { lat, lon };
  }

  function clearSearchMarker() {
    if (searchMarker && map) map.removeLayer(searchMarker);
    searchMarker = null;
  }

  function openSearch() {
    const sheet = document.getElementById("sheet");
    sheet.classList.add("open");
    sheet.classList.remove("expanded");
    sheet.innerHTML = `
      <div class="sheet-grip"><span></span></div>
      <div class="sheet-head">
        <div>
          <h2>🔍 Search</h2>
          <div class="coords">Hills, crags, glens, places — anywhere in the UK</div>
        </div>
        <button class="sheet-close" onclick="document.getElementById('sheet').classList.remove('open')">✕</button>
      </div>
      <div class="sheet-body">
        <div class="pin-form crag-search">
          <input id="search-q" type="text" maxlength="200" placeholder="Name, UKC crag link, or lat, lon…" />
          <button class="fab-inline" id="search-go">Search</button>
        </div>
        <div class="crag-results" id="search-results"></div>
        <div class="fc-links"><a class="fc-link" id="search-ukc">⚒ Climbing crag? Search UKC ↗</a></div>
        <div class="attribution">
          Searches names (© <a href="https://www.openstreetmap.org/" target="_blank" rel="noopener">OpenStreetMap</a> contributors) —
          or paste a <a href="https://www.ukclimbing.com/logbook/" target="_blank" rel="noopener">UKC</a> crag page link,
          or the Lat/Long shown on a UKC page, and Skyward takes you straight there.
        </div>
      </div>`;
    const input = sheet.querySelector("#search-q");
    const run = () => runPlaceSearch(input.value, sheet.querySelector("#search-results"));
    sheet.querySelector("#search-go").addEventListener("click", run);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") run(); });
    sheet.querySelector("#search-ukc").addEventListener("click", () => {
      const q = (input.value || "").trim();
      sheet.classList.remove("open");
      S.iab.open("https://www.ukclimbing.com/logbook/crags/" + (q ? "?name=" + encodeURIComponent(q) : ""),
                 q ? `UKC — "${esc(q)}"` : "UKC crag search");
    });
    input.focus();
  }

  async function runPlaceSearch(q, box) {
    q = (q || "").trim();
    if (q.length < 2 || !box) return;

    // Raw coordinates -> straight there. A UKC link pasted just before this
    // (e.g. its name wasn't in OSM) lends the spot its crag name + link.
    const co = parseCoords(q);
    if (co) {
      openSearchResult({
        name: (pendingUkc && pendingUkc.name) || "Pasted location",
        lat: co.lat, lon: co.lon,
        kind: "coordinates", area: "",
        ukc: pendingUkc && pendingUkc.slug,
      });
      return;
    }
    // UKC crag link -> extract the name, remember the slug, search the name.
    const u = parseUkcUrl(q);
    if (u) {
      pendingUkc = u;
      q = u.name;
    } else {
      pendingUkc = null;
    }

    box.innerHTML = `<div class="sheet-state"><div class="spinner"></div>Searching…</div>`;
    let d = null;
    try { d = await (await fetch(S.url("api/search?q=" + encodeURIComponent(q)))).json(); } catch {}
    if (!d || !d.parsed) {
      box.innerHTML = `<div class="sheet-state">Search isn't reachable right now — try again shortly.</div>`;
      return;
    }
    if (!d.results.length) {
      box.innerHTML = pendingUkc
        ? `<div class="sheet-state">OpenStreetMap doesn't know "${esc(q)}" by name — copy the <strong>Lat/Long</strong> from the UKC page and paste it here; the pin will keep the crag's name and link.</div>`
        : `<div class="sheet-state">Nothing in the UK matched "${esc(q)}".</div>`;
      return;
    }
    const carryUkc = pendingUkc && pendingUkc.slug;
    box.innerHTML = d.results.map((r, i) => `
      <button class="crag-result" data-i="${i}">
        <span class="crag-result-name">📍 ${esc(r.name)}</span>
        <span class="crag-result-meta">${esc(r.kind)}${r.kind && r.area ? " · " : ""}${esc(r.area)}</span>
      </button>`).join("");
    box.querySelectorAll(".crag-result").forEach((btn) => {
      btn.addEventListener("click", () => {
        const r = d.results[Number(btn.dataset.i)];
        if (carryUkc) r.ukc = carryUkc;
        openSearchResult(r);
      });
    });
  }

  function openSearchResult(r) {
    clearSearchMarker();
    const icon = L.divIcon({
      className: "peak-pin custom-pin",
      html: `<span class="peak-dot"></span><span class="peak-label">${esc(r.name)}</span>`,
      iconSize: [10, 10], iconAnchor: [5, 5],
    });
    searchMarker = L.marker([r.lat, r.lon], { icon, title: r.name }).addTo(map);
    searchMarker.on("click", () => openSearchResult(r));
    map.setView([r.lat, r.lon], Math.max(map.getZoom(), 13), { animate: true });

    const sheet = document.getElementById("sheet");
    sheet.classList.add("open");
    sheet.classList.remove("expanded");
    sheet.innerHTML = `
      <div class="sheet-grip"><span></span></div>
      <div class="sheet-head">
        <div>
          <h2>📍 ${esc(r.name)}</h2>
          <div class="coords">${esc(r.kind)}${r.kind && r.area ? " · " : ""}${esc(r.area)}</div>
        </div>
        <button class="sheet-close" onclick="document.getElementById('sheet').classList.remove('open')">✕</button>
      </div>
      <div class="sheet-body">
        <div class="fc-links">
          <a class="fc-link" id="result-pin">📍 Save as a My Pin</a>
          <a class="fc-link" id="result-investigate">⌖ Investigate this point</a>
          ${r.ukc ? '<a class="fc-link" id="result-ukc">⚒ Crag &amp; conditions on UKC</a>' : ""}
        </div>
        <div class="attribution">${r.kind === "coordinates" ? "Pasted coordinates" : "Found via OpenStreetMap"} — the marker is temporary until you pin it.</div>
      </div>`;
    sheet.querySelector("#result-pin").addEventListener("click", () => {
      clearSearchMarker();                      // the real pin replaces it
      openAddPin(r.lat, r.lon, r.name, { ukc: r.ukc, kind: r.ukc ? "crag" : undefined });
    });
    if (r.ukc) {
      sheet.querySelector("#result-ukc").addEventListener("click", () =>
        S.iab.open(`https://www.ukclimbing.com/logbook/crags/${r.ukc}/`, `${r.name} — UKC`));
    }
    sheet.querySelector("#result-investigate").addEventListener("click", () => {
      map.setView([r.lat, r.lon], Math.max(map.getZoom(), 12), { animate: true });
      investigate();
    });
  }

  // Open a crag (Phase 5b): name + route count, link to its UKC page in the
  // in-app viewer (link-out, not scrape — UKC gets the traffic), and
  // Investigate-at-crag. Every crag's id/slug/coords were verified against
  // UKC's own crag database, never guessed.
  function openCrag(c) {
    const sheet = document.getElementById("sheet");
    const url = `https://www.ukclimbing.com/logbook/crags/${c.ukc}/`;
    sheet.classList.add("open");
    sheet.classList.remove("expanded");
    sheet.innerHTML = `
      <div class="sheet-grip"><span></span></div>
      <div class="sheet-head">
        <div>
          <h2>⚒ ${c.name}</h2>
          <div class="coords">${c.area} · ${c.routes} routes on UKC</div>
        </div>
        <button class="sheet-close" onclick="document.getElementById('sheet').classList.remove('open')">✕</button>
      </div>
      <div class="sheet-body">
        <div class="fc-links">
          <a class="fc-link" id="crag-ukc">⚒ Crag &amp; conditions on UKC</a>
          <a class="fc-link" id="crag-investigate">⌖ Investigate this point</a>
        </div>
        <div class="attribution">
          Crag data © <a href="https://www.ukclimbing.com/" target="_blank" rel="noopener">UKClimbing.com</a>.
          Tap through for routes, logbooks and live condition reports.
        </div>
      </div>`;
    sheet.querySelector("#crag-ukc").addEventListener("click", () => S.iab.open(url, `${c.name} — UKC`));
    sheet.querySelector("#crag-investigate").addEventListener("click", () => {
      map.setView([c.lat, c.lon], Math.max(map.getZoom(), 11), { animate: true });
      investigate();
    });
  }

  // Open a summit: show a sheet with height + a link to its mountain-forecast.com
  // page (opened in the in-app viewer). Also offers Investigate-at-summit.
  function openPeak(p) {
    const sheet = document.getElementById("sheet");
    const url = `https://www.mountain-forecast.com/peaks/${p.slug}`;
    sheet.classList.add("open");
    sheet.classList.remove("expanded");
    sheet.innerHTML = `
      <div class="sheet-grip"><span></span></div>
      <div class="sheet-head">
        <div>
          <h2>⛰ ${p.name}</h2>
          <div class="coords">${p.h} m · ${p.lat.toFixed(3)}, ${p.lon.toFixed(3)}</div>
        </div>
        <button class="sheet-close" onclick="document.getElementById('sheet').classList.remove('open')">✕</button>
      </div>
      <div class="sheet-body">
        <div class="fc-links">
          <a class="fc-link" id="peak-fc">⛰ Summit forecast (mountain-forecast.com)</a>
          <a class="fc-link" id="peak-investigate">⌖ Investigate this point</a>
        </div>
        <div class="attribution">
          Coordinates: Database of British &amp; Irish Hills. Forecast: mountain-forecast.com.
        </div>
      </div>`;
    sheet.querySelector("#peak-fc").addEventListener("click", () => S.iab.open(url, `${p.name} — mountain-forecast.com`));
    sheet.querySelector("#peak-investigate").addEventListener("click", () => {
      map.setView([p.lat, p.lon], Math.max(map.getZoom(), 11), { animate: true });
      investigate();
    });
  }

  async function investigate() {
    const sheet = document.getElementById("sheet");
    const btn = document.getElementById("investigate");
    const c = map.getCenter();
    btn.disabled = true;

    sheet.classList.add("open");
    sheet.classList.remove("expanded");
    sheet.innerHTML = `<div class="sheet-state"><div class="spinner"></div>Reading the sky…</div>`;

    try {
      const data = await fetchWeather(c.lat, c.lng);
      if (data.oceanic) {
        sheet.innerHTML = stateMarkup("🌊", "That looks like open sea",
          "No land forecast here — pan the crosshair onto a mountain or coastline and try again.");
      } else {
        renderPanel(sheet, c, data);
        // Offer to keep this spot — feeds the My Pins feature.
        let resolvedName = null;
        const body = sheet.querySelector(".sheet-body");
        if (body) {
          const a = document.createElement("a");
          a.className = "fc-link pin-save";
          a.textContent = "📍 Save this point as a pin";
          a.addEventListener("click", () => openAddPin(c.lat, c.lng, resolvedName));
          body.appendChild(a);
        }
        // Item 2: resolve a human place name in the background and slot it into
        // the header once it arrives. Non-blocking — the panel renders instantly
        // with coordinates, and the name replaces them if/when it resolves.
        fetchPlaceName(c.lat, c.lng).then((name) => {
          if (!name) return;
          resolvedName = name;
          const el = sheet.querySelector(".coords");
          if (el) { el.textContent = name; el.classList.add("place-named"); }
        });
      }
    } catch (err) {
      sheet.innerHTML = stateMarkup("⚠", "Couldn't fetch the forecast", err.message + " — check your connection and try again.");
    } finally {
      btn.disabled = false;
    }
  }

  function stateMarkup(icon, title, msg) {
    return `
      <div class="sheet-grip"><span></span></div>
      <div class="sheet-head">
        <div><h2>${title}</h2></div>
        <button class="sheet-close" onclick="document.getElementById('sheet').classList.remove('open')">✕</button>
      </div>
      <div class="sheet-state"><div class="err-icon">${icon}</div><p>${msg}</p></div>`;
  }

  function renderPanel(sheet, coords, data) {
    const d = data.raw;
    const cur = d.current;
    const [label, glyph] = wx(cur.weather_code);
    const u = d.current_units || {};

    // Build Morning / PM / Night from today's hourly (09:00, 15:00, 21:00).
    const triad = buildTriad(d.hourly);

    // Hourly rows for today (next ~18 hours from now).
    const hourly = buildHourly(d.hourly);

    sheet.innerHTML = `
      <div class="sheet-grip" id="grip"><span></span></div>
      <div class="sheet-head">
        <div>
          <h2>${glyph} ${label}</h2>
          <div class="coords">${coords.lat.toFixed(3)}, ${coords.lng.toFixed(3)}</div>
        </div>
        <div class="sheet-head-right">
          <span class="src-badge src-om">Open-Meteo</span>
          <button class="sheet-close" id="sheet-close">✕</button>
        </div>
      </div>
      <div class="sheet-body">
        <div class="now">
          <div class="temp ${tempBand(Math.round(cur.temperature_2m))}">${Math.round(cur.temperature_2m)}<small>°C</small></div>
          <div class="stat"><b class="${tempBand(Math.round(cur.apparent_temperature))}">${Math.round(cur.apparent_temperature)}°</b><span>Feels</span></div>
          <div class="stat"><b class="${windBand(Math.round(cur.wind_speed_10m))}">${Math.round(cur.wind_speed_10m)} ${compass(cur.wind_direction_10m)}</b><span>Wind mph</span></div>
          <div class="stat"><b class="${windBand(Math.round(cur.wind_gusts_10m))}">${Math.round(cur.wind_gusts_10m)}</b><span>Gust mph</span></div>
          <div class="stat"><b>${cur.precipitation ?? 0} mm</b><span>Precip</span></div>
        </div>

        <div class="triad-hint">
          <div class="triad">${triad}</div>
          <button type="button" class="expand-hint" id="expand-toggle" aria-expanded="false">
            ▲ Tap for the hourly breakdown
          </button>
        </div>

        <div class="hourly">
          <button type="button" class="collapse-hint" id="collapse-toggle">▼ Hide hourly</button>
          <h3>Next hours</h3>
          ${hourly}
        </div>

        <div class="fc-links">
          <a class="fc-link" id="synoptic-chart">🌀 Synoptic (pressure) chart</a>
        </div>

        <div class="attribution">
          Data: <a href="${data.attribution.url}" target="_blank" rel="noopener">${data.attribution.name}</a>
          (${data.attribution.licence}). Tap through to visit the source.
        </div>
      </div>
    `;

    sheet.querySelector("#sheet-close").addEventListener("click", () => sheet.classList.remove("open"));

    // Expand / collapse. The whole grip AND the big hint button toggle the
    // hourly view — a tap works everywhere (the Mac has no swipe), and the
    // drag below is kept as a bonus on touchscreens.
    const grip = sheet.querySelector("#grip");
    const setExpanded = (on) => {
      sheet.classList.toggle("expanded", on);
      const t = sheet.querySelector("#expand-toggle");
      if (t) t.setAttribute("aria-expanded", String(on));
    };
    grip.addEventListener("click", () => setExpanded(!sheet.classList.contains("expanded")));
    sheet.querySelector("#expand-toggle").addEventListener("click", () => setExpanded(true));
    sheet.querySelector("#collapse-toggle").addEventListener("click", () => setExpanded(false));
    enableDrag(sheet, grip, setExpanded);

    // Synoptic chart — Met Office surface-pressure analysis, opened in the
    // in-app browser (no API key needed). Same source MWIS links to.
    sheet.querySelector("#synoptic-chart").addEventListener("click", () =>
      S.iab.open(
        "https://www.metoffice.gov.uk/weather/maps-and-charts/surface-pressure",
        "Synoptic chart — Met Office"
      ));
  }

  // --- Data colour banding -------------------------------------------------
  // Map a value to a CSS class. The classes resolve to the existing palette
  // tokens (cold blues -> warm ambers/reds for temp; settled green -> red for
  // rain & wind), so the winter re-theme is respected automatically.
  function tempBand(t) {
    if (t <= 0)  return "v-cold";   // freezing
    if (t <= 4)  return "v-cool";   // near-freezing
    if (t <= 9)  return "v-mild";
    if (t <= 15) return "v-warm";
    return "v-hot";
  }
  function rainBand(pp) {
    if (pp >= 70) return "v-rain-high";
    if (pp >= 40) return "v-rain-med";
    if (pp >= 15) return "v-rain-low";
    return "v-rain-none";
  }
  // Wind in mph, mountain-relevant thresholds (gusts make hills serious early).
  function windBand(ws) {
    if (ws >= 50) return "v-wind-severe";
    if (ws >= 35) return "v-wind-high";
    if (ws >= 20) return "v-wind-med";
    return "v-wind-low";
  }

  // Expose the bands so OTHER views (e.g. the Forecast tab's Met Office cards)
  // colour their numbers with the IDENTICAL thresholds and classes — one source
  // of truth, so a temperature reads the same colour everywhere in the app.
  S.bands = { temp: tempBand, rain: rainBand, wind: windBand };

  function buildTriad(hourly) {
    if (!hourly || !hourly.time) return "";
    const slots = [["Morning", "09:00"], ["Afternoon", "15:00"], ["Night", "21:00"]];
    const today = hourly.time[0].slice(0, 10);
    return slots.map(([name, hh]) => {
      const idx = hourly.time.indexOf(`${today}T${hh}`);
      if (idx === -1) return "";
      const [lab, gl] = wx(hourly.weather_code[idx]);
      const t = Math.round(hourly.temperature_2m[idx]);
      const pp = hourly.precipitation_probability?.[idx] ?? 0;
      const fl = hourly.freezing_level_height?.[idx];
      return `
        <div class="slot">
          <div class="when">${name}</div>
          <div class="t ${tempBand(t)}">${gl} ${t}°</div>
          <div class="sub">${lab}</div>
          <div class="sub"><span class="${rainBand(pp)}">${pp}% rain</span>${fl != null ? ` · FL ${Math.round(fl)}m` : ""}</div>
        </div>`;
    }).join("");
  }

  function buildHourly(hourly) {
    if (!hourly || !hourly.time) return "";
    const now = new Date();
    let start = hourly.time.findIndex((t) => new Date(t) >= now);
    if (start === -1) start = 0;
    const rows = [];
    for (let i = start; i < Math.min(start + 18, hourly.time.length); i++) {
      const hh = hourly.time[i].slice(11, 16);
      const [lab, gl] = wx(hourly.weather_code[i]);
      const t = Math.round(hourly.temperature_2m[i]);
      const pp = hourly.precipitation_probability?.[i] ?? 0;
      const ws = Math.round(hourly.wind_speed_10m[i]);
      const wd = compass(hourly.wind_direction_10m?.[i]);
      rows.push(`
        <div class="hourly-row">
          <span class="hr">${hh}</span>
          <span class="wx"><b class="${tempBand(t)}">${gl} ${t}°</b> · ${lab}</span>
          <span class="pp ${rainBand(pp)}">${pp}%</span>
          <span class="wd ${windBand(ws)}">${ws}${wd}</span>
        </div>`);
    }
    return rows.join("");
  }

  // Minimal vertical drag on the grip to expand/collapse the sheet (touch).
  function enableDrag(sheet, grip, setExpanded) {
    let startY = null;
    const down = (y) => { startY = y; };
    const up = (y) => {
      if (startY == null) return;
      const dy = y - startY;
      if (dy < -40) setExpanded(true);
      else if (dy > 40) {
        if (sheet.classList.contains("expanded")) setExpanded(false);
        else sheet.classList.remove("open");
      }
      startY = null;
    };
    grip.addEventListener("touchstart", (e) => down(e.touches[0].clientY), { passive: true });
    grip.addEventListener("touchend", (e) => up(e.changedTouches[0].clientY));
    grip.addEventListener("mousedown", (e) => down(e.clientY));
    window.addEventListener("mouseup", (e) => { if (startY != null) up(e.clientY); });
  }

  function teardown() {
    removeSaisBanner();
    saisLayer = null;
    searchMarker = null;
    if (map) { map.remove(); map = null; }
    for (const k in layers) delete layers[k];
  }

  S.views = S.views || {};
  S.views.map = { render, teardown };
})();
