/*
 * views/forecast.js — clean MWIS area forecasts (the brief: "the MWIS area
 * forecasts without all the adverts and distractions").
 *
 * Lists the 10 MWIS areas; tapping one fetches /api/mwis?area=… and renders the
 * summary, headline, per-day labelled sections, and planning outlook in
 * Skyward's own styling. Always attributes MWIS and links back to the source.
 * If the backend couldn't parse the page, we offer the live page in the in-app
 * browser instead of showing nothing. Also surfaces the MWIS video + PDF links.
 */
(function () {
  const S = window.Skyward;
  let areas = [];
  let metoffice = null;

  async function render(stage, opts = {}) {
    try { areas = (await (await fetch(S.url("static/data/mwis-areas.json"))).json()).areas || []; } catch {}
    try { metoffice = await (await fetch(S.url("static/data/metoffice-mountain.json"))).json(); } catch {}

    const list = areas.map((a) =>
      `<button class="area-row" data-area="${a.id}">
         <span class="area-name">${a.name}</span>
         <span class="area-go">View ›</span>
       </button>`).join("");

    stage.innerHTML = `
      <div class="scroll-view">
        <div class="view-head">
          <span class="eyebrow">Mountain forecasts</span>
          <h1>Forecasts</h1>
          <p>MWIS area forecasts, stripped of clutter. Tap an area for the full three-day outlook.</p>
        </div>
        <div id="fc-area-list" class="area-list">${list}</div>
        <div class="fc-links">
          <a class="fc-link" data-url="https://www.mwis.org.uk/forecasts/videos" data-name="MWIS Forecast Videos">▶ MWIS forecast videos</a>
          <a class="fc-link" data-url="https://www.mwis.org.uk/forecasts/synoptic-charts" data-name="MWIS Synoptic Charts">⊙ Synoptic charts</a>
        </div>
        <div id="fc-detail"></div>
      </div>`;

    stage.querySelectorAll(".area-row").forEach((b) =>
      b.addEventListener("click", () => loadArea(b.dataset.area, stage)));
    stage.querySelectorAll(".fc-link").forEach((a) =>
      a.addEventListener("click", () => S.iab.open(a.dataset.url, a.dataset.name)));

    if (opts.area) loadArea(opts.area, stage);
  }

  async function loadArea(areaId, stage) {
    const detail = stage.querySelector("#fc-detail");
    const area = areas.find((a) => a.id === areaId);
    detail.scrollIntoView({ behavior: "smooth", block: "start" });
    detail.innerHTML = `<div class="fc-card"><div class="sheet-state"><div class="spinner"></div>Fetching the ${area ? area.name : ""} forecast…</div></div>`;

    let data;
    try {
      data = await (await fetch(S.url(`api/mwis?area=${encodeURIComponent(areaId)}`))).json();
    } catch {
      detail.innerHTML = fallbackCard(area, null);
      return;
    }

    if (!data.parsed || !data.forecast) {
      detail.innerHTML = fallbackCard(area, data.source_url);
      wireFallback(detail, data.source_url, area);
      wireMetOffice(detail);
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
        <h2 class="fc-area-title">${data.area}</h2>
        ${f.headline ? `<div class="fc-headline">${escapeHtml(f.headline)}</div>` : ""}
        ${f.summary ? `<div class="fc-summary"><b>All areas:</b> ${escapeHtml(f.summary).replace(/\n/g, "<br>")}</div>` : ""}
        ${days}
        ${f.outlook ? `<div class="fc-outlook"><h3>Planning outlook</h3><p>${escapeHtml(f.outlook).replace(/\n/g, "<br>")}</p></div>` : ""}
        ${metOfficeBlock(areaId)}
        <div class="attribution">
          Source: <a data-url="${data.source_url}" data-name="${data.area} — MWIS" class="fc-src">${data.attribution.name}</a>.
          Forecasts © MWIS — please visit the source.
        </div>
      </div>`;

    detail.querySelector(".fc-src")?.addEventListener("click", (e) => {
      e.preventDefault(); S.iab.open(data.source_url, `${data.area} — MWIS`);
    });
    wireMetOffice(detail);
  }

  // Build a "Summit forecast (Met Office)" block for the MWIS area, if a
  // matching Met Office mountain area exists. Offers the web page and the PDF.
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

  function wireMetOffice(root) {
    root.querySelectorAll(".fc-summit .fc-link").forEach((a) =>
      a.addEventListener("click", (e) => { e.preventDefault(); S.iab.open(a.dataset.url, a.dataset.name); }));
  }

  function fallbackCard(area, url) {
    return `
      <div class="fc-card">
        <h2 class="fc-area-title">${area ? area.name : "Forecast"}</h2>
        <p style="color:var(--ink-dim)">Couldn't load a clean version just now${url ? "" : " (no connection)"}.
        ${url ? `You can open the full MWIS forecast instead.` : "Try again shortly."}</p>
        ${url ? `<button class="fab-inline fc-open">Open MWIS forecast</button>` : ""}
        ${area ? metOfficeBlock(area.id) : ""}
      </div>`;
  }

  function wireFallback(detail, url, area) {
    detail.querySelector(".fc-open")?.addEventListener("click", () =>
      S.iab.open(url, `${area ? area.name : "MWIS"} — MWIS`));
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  S.views = S.views || {};
  S.views.forecast = { render, teardown() {} };
})();
