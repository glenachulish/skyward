/*
 * views/map.js — the home view. Full-screen Leaflet map with a centred
 * crosshair; "Investigate" fetches weather for the map centre and raises a
 * progressive bottom sheet (Morning/PM/Night summary -> swipe up for hourly).
 */
(function () {
  const S = window.Skyward;
  const { wx, compass, fetchWeather } = S.weather;

  let map = null;
  let areas = [];

  async function render(stage) {
    stage.innerHTML = `
      <div id="map"></div>
      <div id="crosshair"><div class="ring"></div></div>
      <div class="map-topbar">
        <select class="area-select" id="area-select" aria-label="Jump to forecast area">
          <option value="">Jump to area…</option>
        </select>
        <button class="winter-toggle" id="peaks-toggle" aria-pressed="false">⛰ Peaks</button>
        <button class="winter-toggle" id="small-toggle" aria-pressed="false">▲ Small</button>
        <button class="winter-toggle" id="winter-toggle" aria-pressed="false">❄ Winter</button>
      </div>
      <button class="fab" id="investigate">⌖ Investigate</button>
      <div id="sheet" aria-live="polite"></div>
    `;

    // --- Leaflet map ---------------------------------------------------------
    map = L.map("map", { zoomControl: true, attributionControl: true })
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

    // --- Winter toggle -------------------------------------------------------
    const wt = stage.querySelector("#winter-toggle");
    if (S.store.get("winter", false)) { document.body.classList.add("winter"); wt.setAttribute("aria-pressed", "true"); }
    wt.addEventListener("click", () => {
      const on = document.body.classList.toggle("winter");
      wt.setAttribute("aria-pressed", String(on));
      S.store.set("winter", on);
    });

    // --- Peaks layer toggles -------------------------------------------------
    const pt = stage.querySelector("#peaks-toggle");
    pt.addEventListener("click", () => toggleLayer("munros", "static/data/peaks.json", "peak-pin", pt));
    const st = stage.querySelector("#small-toggle");
    st.addEventListener("click", () => toggleLayer("small", "static/data/small-mountains.json", "peak-pin small-pin", st));
    // Restore last states (off by default to keep the map clean).
    if (S.store.get("peaks-on", false)) toggleLayer("munros", "static/data/peaks.json", "peak-pin", pt);
    if (S.store.get("small-on", false)) toggleLayer("small", "static/data/small-mountains.json", "peak-pin small-pin", st);

    // --- Investigate ---------------------------------------------------------
    stage.querySelector("#investigate").addEventListener("click", investigate);
    map.whenReady(() => setTimeout(() => map.invalidateSize(), 60)); // Leaflet layout fix
  }

  // Lazy-loaded marker layers, keyed by name.
  const layers = {};

  async function toggleLayer(key, dataPath, pinClass, btn) {
    if (layers[key] && map.hasLayer(layers[key])) {
      map.removeLayer(layers[key]);
      btn.setAttribute("aria-pressed", "false");
      S.store.set(key === "munros" ? "peaks-on" : "small-on", false);
      return;
    }
    if (!layers[key]) {
      let peaks = [];
      try { peaks = (await (await fetch(S.url(dataPath))).json()).peaks || []; } catch {}
      const lg = L.layerGroup();
      peaks.forEach((p) => {
        const icon = L.divIcon({
          className: pinClass,
          html: `<span class="peak-dot"></span><span class="peak-label">${p.name}</span>`,
          iconSize: [10, 10],
          iconAnchor: [5, 5],
        });
        const m = L.marker([p.lat, p.lon], { icon, title: p.name });
        m.on("click", () => openPeak(p));
        lg.addLayer(m);
      });
      layers[key] = lg;
    }
    layers[key].addTo(map);
    btn.setAttribute("aria-pressed", "true");
    S.store.set(key === "munros" ? "peaks-on" : "small-on", true);
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
        <button class="sheet-close" id="sheet-close">✕</button>
      </div>
      <div class="sheet-body">
        <div class="now">
          <div class="temp">${Math.round(cur.temperature_2m)}<small>°C</small></div>
          <div class="stat"><b>${Math.round(cur.apparent_temperature)}°</b><span>Feels</span></div>
          <div class="stat"><b>${Math.round(cur.wind_speed_10m)} ${compass(cur.wind_direction_10m)}</b><span>Wind mph</span></div>
          <div class="stat"><b>${Math.round(cur.wind_gusts_10m)}</b><span>Gust mph</span></div>
          <div class="stat"><b>${cur.precipitation ?? 0} mm</b><span>Precip</span></div>
        </div>

        <div class="triad-hint">
          <div class="triad">${triad}</div>
          <div class="expand-hint">▲ Swipe up for the hourly breakdown</div>
        </div>

        <div class="hourly">
          <h3>Next hours</h3>
          ${hourly}
        </div>

        <div class="attribution">
          Data: <a href="${data.attribution.url}" target="_blank" rel="noopener">${data.attribution.name}</a>
          (${data.attribution.licence}). Tap through to visit the source.
        </div>
      </div>
    `;

    sheet.querySelector("#sheet-close").addEventListener("click", () => sheet.classList.remove("open"));

    // Expand / collapse: tap grip toggles; also support a simple drag.
    const grip = sheet.querySelector("#grip");
    grip.addEventListener("click", () => sheet.classList.toggle("expanded"));
    enableDrag(sheet, grip);
  }

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
          <div class="t">${gl} ${t}°</div>
          <div class="sub">${lab}</div>
          <div class="sub">${pp}% rain${fl != null ? ` · FL ${Math.round(fl)}m` : ""}</div>
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
          <span class="wx">${gl} ${t}° · ${lab}</span>
          <span class="pp">${pp}%</span>
          <span class="wd">${ws}${wd}</span>
        </div>`);
    }
    return rows.join("");
  }

  // Minimal vertical drag on the grip to expand/collapse the sheet.
  function enableDrag(sheet, grip) {
    let startY = null;
    const down = (y) => { startY = y; };
    const up = (y) => {
      if (startY == null) return;
      const dy = y - startY;
      if (dy < -40) sheet.classList.add("expanded");
      else if (dy > 40) {
        if (sheet.classList.contains("expanded")) sheet.classList.remove("expanded");
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
    if (map) { map.remove(); map = null; }
    for (const k in layers) delete layers[k];
  }

  S.views = S.views || {};
  S.views.map = { render, teardown };
})();
