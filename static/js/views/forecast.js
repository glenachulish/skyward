/*
 * views/forecast.js — the Forecast tab, now carrying TWO independent forecast
 * sources, each clearly badged so the origin is never ambiguous:
 *
 *   • MWIS       — the cleaned MWIS area forecasts (the original brief:
 *                  "the MWIS area forecasts without all the adverts").
 *                  Per-day labelled sections, planning outlook, video/synoptic
 *                  links, and the Met Office SUMMIT-forecast link block.
 *
 *   • Met Office — a 5-day area forecast from the Met Office Site-Specific
 *                  Global Spot API (/api/metoffice), with its own, separate
 *                  list of named UK areas. Per-day max/min temp, feels-like,
 *                  wind + gust + direction, precip probability, UV.
 *
 * A segmented toggle at the top switches between the two. The two area lists
 * and renderers are independent — this is deliberate: MWIS areas and Met Office
 * areas are different things, and the app shows that honestly. Every detail
 * card carries a "Source: …" badge and links back to the origin.
 */
(function () {
  const S = window.Skyward;

  let mwisAreas = [];
  let moAreas = [];
  let metoffice = null;     // metoffice-mountain.json (MWIS summit-link map)
  let source = "mwis";      // "mwis" | "metoffice"

  async function render(stage, opts = {}) {
    try { mwisAreas = (await (await fetch(S.url("static/data/mwis-areas.json"))).json()).areas || []; } catch {}
    try { moAreas = (await (await fetch(S.url("static/data/metoffice-areas.json"))).json()).areas || []; } catch {}
    try { metoffice = await (await fetch(S.url("static/data/metoffice-mountain.json"))).json(); } catch {}

    if (opts.source === "metoffice" || opts.source === "mwis") source = opts.source;

    stage.innerHTML = `
      <div class="scroll-view">
        <div class="view-head">
          <span class="eyebrow">Mountain forecasts</span>
          <h1>Forecasts</h1>
          <p>Two independent sources. Switch between them — every forecast is labelled with where it comes from.</p>
        </div>

        <div class="fc-source-toggle" role="tablist" aria-label="Forecast source">
          <button class="fc-src-btn" data-source="mwis" role="tab">
            MWIS
            <small>3-day, worded</small>
          </button>
          <button class="fc-src-btn" data-source="metoffice" role="tab">
            Met Office
            <small>5-day, by numbers</small>
          </button>
        </div>

        <div id="fc-area-list" class="area-list"></div>
        <div id="fc-extra"></div>
        <div id="fc-detail"></div>
      </div>`;

    stage.querySelectorAll(".fc-src-btn").forEach((b) =>
      b.addEventListener("click", () => {
        if (source === b.dataset.source) return;
        source = b.dataset.source;
        paintSource(stage);
      }));

    paintSource(stage, opts.area);
  }

  // Render the area list + source-specific extras for the current `source`.
  function paintSource(stage, preselectArea) {
    stage.querySelectorAll(".fc-src-btn").forEach((b) =>
      b.classList.toggle("active", b.dataset.source === source));

    const listEl = stage.querySelector("#fc-area-list");
    const extraEl = stage.querySelector("#fc-extra");
    const detailEl = stage.querySelector("#fc-detail");
    detailEl.innerHTML = "";

    const areas = source === "mwis" ? mwisAreas : moAreas;

    if (source === "mwis") {
      listEl.innerHTML = areas.map((a) =>
        `<button class="area-row" data-area="${a.id}">
           <span class="area-name">${a.name}</span>
           <span class="area-go">View ›</span>
         </button>`).join("");
      extraEl.innerHTML = `
        <div class="fc-links">
          <a class="fc-link" data-url="https://www.mwis.org.uk/forecasts/videos" data-name="MWIS Forecast Videos">▶ MWIS forecast videos</a>
          <a class="fc-link" data-url="https://www.mwis.org.uk/forecasts/synoptic-charts" data-name="MWIS Synoptic Charts">⊙ Synoptic charts</a>
        </div>`;
      extraEl.querySelectorAll(".fc-link").forEach((a) =>
        a.addEventListener("click", () => S.iab.open(a.dataset.url, a.dataset.name)));
      listEl.querySelectorAll(".area-row").forEach((b) =>
        b.addEventListener("click", () => loadMwis(b.dataset.area, stage)));
    } else {
      // Met Office: group the areas by nation for a tidier list.
      const groups = {};
      areas.forEach((a) => { (groups[a.group] = groups[a.group] || []).push(a); });
      listEl.innerHTML = Object.keys(groups).map((g) => `
        <div class="fc-group-head">${g}</div>
        ${groups[g].map((a) =>
          `<button class="area-row" data-area="${a.id}">
             <span class="area-name">${a.name}</span>
             <span class="area-go">5-day ›</span>
           </button>`).join("")}`).join("");
      extraEl.innerHTML = "";
      listEl.querySelectorAll(".area-row").forEach((b) =>
        b.addEventListener("click", () => loadMetoffice(b.dataset.area, stage)));
    }

    if (preselectArea) {
      (source === "mwis" ? loadMwis : loadMetoffice)(preselectArea, stage);
    }
  }

  // ---- MWIS (worded 3-day) --------------------------------------------------
  async function loadMwis(areaId, stage) {
    const detail = stage.querySelector("#fc-detail");
    const area = mwisAreas.find((a) => a.id === areaId);
    detail.scrollIntoView({ behavior: "smooth", block: "start" });
    detail.innerHTML = `<div class="fc-card"><div class="sheet-state"><div class="spinner"></div>Fetching the ${area ? area.name : ""} forecast…</div></div>`;

    let data;
    try {
      data = await (await fetch(S.url(`api/mwis?area=${encodeURIComponent(areaId)}`))).json();
    } catch {
      detail.innerHTML = mwisFallbackCard(area, null);
      return;
    }

    if (!data.parsed || !data.forecast) {
      detail.innerHTML = mwisFallbackCard(area, data.source_url);
      wireMwisFallback(detail, data.source_url, area);
      wireMetOfficeLinks(detail);
      return;
    }

    const f = data.forecast;
    const days = f.days.map((d) => `
      <div class="fc-day">
        ${d.date ? `<h3 class="fc-date">${d.date}</h3>` : ""}
        ${d.fields.map((fld) => `
          <div class="fc-field">
            <div class="fc-label">${fld.label}</div>
            <div class="fc-text">${escapeHtml(fld.text).replace(/\n/g, "<br>")}</div>
          </div>`).join("")}
      </div>`).join("");

    detail.innerHTML = `
      <div class="fc-card">
        <div class="fc-badge fc-badge-mwis">Source: MWIS</div>
        <h2 class="fc-area-title">${data.area}</h2>
        ${f.headline ? `<div class="fc-headline">${escapeHtml(f.headline)}</div>` : ""}
        ${f.summary ? `<div class="fc-summary"><b>All areas:</b> ${escapeHtml(f.summary).replace(/\n/g, "<br>")}</div>` : ""}
        ${days}
        ${f.outlook ? `<div class="fc-outlook"><h3>Planning outlook</h3><p>${escapeHtml(f.outlook).replace(/\n/g, "<br>")}</p></div>` : ""}
        ${metOfficeBlock(areaId)}
        <div class="attribution">
          Source: <a data-url="${data.source_url}" data-name="${data.area} — MWIS" class="fc-src-link">${data.attribution.name}</a>.
          Forecasts © MWIS — please visit the source.
        </div>
      </div>`;

    detail.querySelector(".fc-src-link")?.addEventListener("click", (e) => {
      e.preventDefault(); S.iab.open(data.source_url, `${data.area} — MWIS`);
    });
    wireMetOfficeLinks(detail);
  }

  // ---- Met Office (5-day by numbers) ---------------------------------------
  async function loadMetoffice(areaId, stage) {
    const detail = stage.querySelector("#fc-detail");
    const area = moAreas.find((a) => a.id === areaId);
    detail.scrollIntoView({ behavior: "smooth", block: "start" });
    detail.innerHTML = `<div class="fc-card"><div class="sheet-state"><div class="spinner"></div>Fetching the Met Office forecast for ${area ? area.name : ""}…</div></div>`;

    let data;
    try {
      data = await (await fetch(S.url(`api/metoffice?area=${encodeURIComponent(areaId)}`))).json();
    } catch {
      detail.innerHTML = moFallbackCard(area, null, null);
      return;
    }

    if (!data.parsed || !data.forecast) {
      detail.innerHTML = moFallbackCard(area, data.source_url, data.error);
      wireMoFallback(detail, data.source_url, area);
      return;
    }

    const f = data.forecast;
    const days = f.days.map((d) => moDayRow(d)).join("");

    detail.innerHTML = `
      <div class="fc-card">
        <div class="fc-badge fc-badge-mo">Source: Met Office</div>
        <h2 class="fc-area-title">${data.area}</h2>
        ${f.location ? `<div class="fc-mo-site">Nearest Met Office forecast site: ${escapeHtml(f.location)}</div>` : ""}
        <div class="fc-mo-days">${days}</div>
        <div class="attribution">
          Source: <a data-url="${data.source_url}" data-name="${data.area} — Met Office" class="fc-src-link">${data.attribution.name}</a>.
          ${escapeHtml(data.attribution.licence || "")}
        </div>
      </div>`;

    detail.querySelector(".fc-src-link")?.addEventListener("click", (e) => {
      e.preventDefault(); S.iab.open(data.source_url, `${data.area} — Met Office`);
    });
  }

  function moDayRow(d) {
    const date = d.date ? fmtDate(d.date) : "";
    // Reuse the app-wide colour bands (defined in map.js, shared via S.bands)
    // so temp/wind/rain read the same colour here as on the Investigate sheet.
    // Safe fallback to no class if bands aren't available for any reason.
    const B = (S.bands) || {};
    const tempCls = (v) => (B.temp && v != null) ? B.temp(v) : "";
    const windCls = (v) => (B.wind && v != null) ? B.wind(v) : "";
    const rainCls = (v) => (B.rain && v != null) ? B.rain(v) : "";

    const tMax = d.temp_max, tMin = d.temp_min;
    const temp = (tMax != null ? `<span class="${tempCls(tMax)}">${tMax}°</span>` : "–") +
                 (tMin != null ? ` / <span class="${tempCls(tMin)}">${tMin}°</span>` : "");
    const feels = (d.feels_max != null || d.feels_min != null)
      ? `feels ${d.feels_max != null ? `<span class="${tempCls(d.feels_max)}">${d.feels_max}°</span>` : "–"}${d.feels_min != null ? ` / <span class="${tempCls(d.feels_min)}">${d.feels_min}°</span>` : ""}`
      : "";
    const wind = d.wind_day != null
      ? `<span class="${windCls(d.wind_day)}">${d.wind_dir_day ? d.wind_dir_day + " " : ""}${d.wind_day}${d.gust_day != null ? `<span class="fc-mo-gust"> g${d.gust_day}</span>` : ""} mph</span>`
      : "";
    const pop = d.precip_prob_day != null
      ? `<span class="${rainCls(d.precip_prob_day)}">${d.precip_prob_day}%</span>`
      : "";
    return `
      <div class="fc-mo-day">
        <div class="fc-mo-date">${date}</div>
        <div class="fc-mo-wx">${d.wx_day ? escapeHtml(d.wx_day) : ""}</div>
        <div class="fc-mo-grid">
          <div class="fc-mo-cell"><span class="fc-mo-k">Temp</span><span class="fc-mo-v">${temp}</span>${feels ? `<span class="fc-mo-sub">${feels}</span>` : ""}</div>
          <div class="fc-mo-cell"><span class="fc-mo-k">Wind</span><span class="fc-mo-v">${wind || "–"}</span></div>
          <div class="fc-mo-cell"><span class="fc-mo-k">Rain</span><span class="fc-mo-v">${pop || "–"}</span></div>
          <div class="fc-mo-cell"><span class="fc-mo-k">UV</span><span class="fc-mo-v">${d.uv != null ? d.uv : "–"}</span></div>
        </div>
      </div>`;
  }

  function fmtDate(iso) {
    // "2026-06-18T00:00Z" -> "Thu 18 Jun". Falls back to the raw string.
    try {
      const dt = new Date(iso);
      if (isNaN(dt)) return iso;
      return dt.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
    } catch { return iso; }
  }

  function moFallbackCard(area, url, error) {
    return `
      <div class="fc-card">
        <div class="fc-badge fc-badge-mo">Source: Met Office</div>
        <h2 class="fc-area-title">${area ? area.name : "Forecast"}</h2>
        <p style="color:var(--ink-dim)">${error ? escapeHtml(error) : "Couldn't load the Met Office forecast just now."}
        ${url ? " You can open the Met Office forecast page instead." : ""}</p>
        ${url ? `<button class="fab-inline fc-mo-open">Open Met Office forecast</button>` : ""}
      </div>`;
  }

  function wireMoFallback(detail, url, area) {
    detail.querySelector(".fc-mo-open")?.addEventListener("click", () =>
      S.iab.open(url, `${area ? area.name : "Met Office"} — Met Office`));
  }

  // ---- Met Office SUMMIT-forecast link block (used inside MWIS cards) -------
  function metOfficeBlock(mwisAreaId) {
    if (!metoffice) return "";
    const mo = metoffice.areas.find((a) => a.mwis === mwisAreaId);
    if (!mo) return "";
    const page = `${metoffice.base}/${mo.slug}`;
    const pdf = `${metoffice.pdf_base}/${mo.slug}.pdf`;
    return `
      <div class="fc-summit">
        <h3>Summit forecast — Met Office</h3>
        <p>Multi-elevation wind, temperature, feels-like and freezing level, plus mountain hazards, for <b>${mo.name}</b>.</p>
        <div class="fc-links">
          <a class="fc-link" data-url="${page}" data-name="${mo.name} — Met Office mountain forecast">⛰ Open summit forecast</a>
          <a class="fc-link" data-url="${pdf}" data-name="${mo.name} — Met Office (PDF)">⤓ PDF</a>
        </div>
      </div>`;
  }

  function wireMetOfficeLinks(root) {
    root.querySelectorAll(".fc-summit .fc-link").forEach((a) =>
      a.addEventListener("click", (e) => { e.preventDefault(); S.iab.open(a.dataset.url, a.dataset.name); }));
  }

  function mwisFallbackCard(area, url) {
    return `
      <div class="fc-card">
        <div class="fc-badge fc-badge-mwis">Source: MWIS</div>
        <h2 class="fc-area-title">${area ? area.name : "Forecast"}</h2>
        <p style="color:var(--ink-dim)">Couldn't load a clean version just now${url ? "" : " (no connection)"}.
        ${url ? `You can open the full MWIS forecast instead.` : "Try again shortly."}</p>
        ${url ? `<button class="fab-inline fc-open">Open MWIS forecast</button>` : ""}
        ${area ? metOfficeBlock(area.id) : ""}
      </div>`;
  }

  function wireMwisFallback(detail, url, area) {
    detail.querySelector(".fc-open")?.addEventListener("click", () =>
      S.iab.open(url, `${area ? area.name : "MWIS"} — MWIS`));
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  S.views = S.views || {};
  S.views.forecast = { render, teardown() {} };
})();
