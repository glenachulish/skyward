/*
 * views/webcams.js — webcams dashboard grouped by MWIS forecast area
 * (blueprint: "a dedicated grid grouped by MWIS forecast areas… for rapid
 * morning checks"). Real cams sourced from MWIS (static/data/webcams.json),
 * each operated by an independent organisation.
 *
 * Each card shows the cam's latest thumbnail (a direct image URL that updates
 * periodically; some go offline at times, so we handle image errors). Tapping
 * a card opens the operator's site in the in-app viewer. Favouriting is
 * local-only (no accounts), and favourites float to a "Favourites" group at
 * the top for the rapid-morning-check use case.
 */
(function () {
  const S = window.Skyward;

  async function render(stage) {
    let areas = [], data = { groups: [] };
    try { areas = (await (await fetch(S.url("static/data/mwis-areas.json"))).json()).areas || []; } catch {}
    try { data = await (await fetch(S.url("static/data/webcams.json"))).json(); } catch {}

    const areaName = {};
    areas.forEach((a) => { areaName[a.id] = a.name; });
    const favs = S.store.get("fav-cams", []);

    // Flatten all cams with their area, so we can build a Favourites group.
    const all = [];
    data.groups.forEach((g) => g.cams.forEach((c) => all.push({ ...c, area: g.area })));

    const favCams = all.filter((c) => favs.includes(c.id));

    const groupHtml = (title, cams) => `
      <div class="area-group">
        <h2>${title}</h2>
        <div class="cam-grid">${cams.map(camCard.bind(null, favs)).join("")}</div>
      </div>`;

    let body = "";
    if (favCams.length) body += groupHtml("★ Favourites", favCams);
    data.groups.forEach((g) => {
      body += groupHtml(areaName[g.area] || g.area, g.cams);
    });

    const more = data.more_link
      ? `<a class="fc-link" data-url="${data.more_link.url}" data-name="${data.more_link.name}">↗ More: ${data.more_link.name}</a>`
      : "";

    stage.innerHTML = `
      <div class="scroll-view">
        <div class="view-head">
          <span class="eyebrow">Rapid morning checks</span>
          <h1>Webcams</h1>
          <p>Live mountain cams grouped by area. Tap the star to favourite; tap a cam to open the operator's site.</p>
        </div>
        ${body || `<p style="color:var(--ink-dim)">No webcams configured yet.</p>`}
        <div class="fc-links">${more}</div>
        <div class="attribution">
          Cams collated by <a data-url="https://www.mwis.org.uk/information/webcams" data-name="MWIS Webcams" class="att-link">MWIS</a>;
          each is run by an independent operator. Images may occasionally be offline.
        </div>
      </div>`;

    // Favourite toggles
    stage.querySelectorAll("[data-fav]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const arr = S.store.toggleIn("fav-cams", el.dataset.fav);
        el.classList.toggle("on", arr.includes(el.dataset.fav));
      });
    });
    // Card tap -> open operator site
    stage.querySelectorAll(".cam-card").forEach((card) => {
      card.addEventListener("click", () => S.iab.open(card.dataset.url, card.dataset.name));
    });
    // Footer / more links
    stage.querySelectorAll(".fc-link, .att-link").forEach((a) => {
      a.addEventListener("click", (e) => { e.preventDefault(); S.iab.open(a.dataset.url, a.dataset.name); });
    });
    // Thumbnail load errors -> show a graceful placeholder
    stage.querySelectorAll(".cam-thumb img").forEach((img) => {
      img.addEventListener("error", () => {
        const t = img.parentElement;
        t.classList.add("cam-thumb-empty");
        t.innerHTML = "📷";
      });
    });
  }

  function camCard(favs, cam) {
    const on = favs.includes(cam.id) ? "on" : "";
    // Cache-bust the thumbnail so we get a recent frame, not a stale cached one.
    const thumb = cam.thumb
      ? `<img src="${cam.thumb}${cam.thumb.includes("?") ? "&" : "?"}_=${Date.now()}" alt="${cam.name}" loading="lazy" referrerpolicy="no-referrer">`
      : "📷";
    return `
      <div class="cam-card" data-url="${cam.site}" data-name="${cam.name}">
        <span class="cam-fav ${on}" data-fav="${cam.id}">★</span>
        <div class="cam-thumb${cam.thumb ? "" : " cam-thumb-empty"}">${thumb}</div>
        <div class="cam-name">${cam.name}</div>
        ${cam.note ? `<div class="cam-note">${cam.note}</div>` : ""}
      </div>`;
  }

  S.views = S.views || {};
  S.views.webcams = { render, teardown() {} };
})();
