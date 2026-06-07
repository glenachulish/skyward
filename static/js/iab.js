/*
 * iab.js — in-app viewer for external links (blueprint: a "protected In-App
 * Browser… with a native Done button to seamlessly return users to the map").
 *
 * Hard reality: most of the sites Skyward links to (MWIS, UKC, Met Office,
 * SAIS) send X-Frame-Options / CSP headers that forbid being embedded in an
 * iframe. A blocked iframe renders as a broken-image glyph with no explanation
 * — a dead end. So we DON'T gamble on embedding for those.
 *
 * Behaviour:
 *   - Known-unembeddable domains (and by default, all external http(s) links):
 *     show a clean "card" — the page title, a short note, and a big primary
 *     button that opens the real page in a new browser tab (a direct user
 *     click, never pop-up-blocked). The "Done" button returns to the map.
 *   - We keep the option to genuinely embed (e.g. a future same-origin page)
 *     via open(url, name, {embed:true}).
 *
 * This is honest about what a web app can and can't do with other people's
 * sites, and never leaves the user staring at a broken frame.
 */
(function () {
  const S = window.Skyward;

  function ensure() {
    let el = document.getElementById("iab");
    if (el) return el;
    el = document.createElement("div");
    el.id = "iab";
    el.innerHTML = `
      <div class="iab-bar">
        <button class="iab-done" id="iab-done">‹ Done</button>
        <span class="iab-url" id="iab-url"></span>
      </div>
      <div class="iab-stage" id="iab-stage"></div>`;
    document.getElementById("app").appendChild(el);
    el.querySelector("#iab-done").addEventListener("click", close);
    return el;
  }

  function open(url, name, opts) {
    opts = opts || {};
    const el = ensure();
    const stage = el.querySelector("#iab-stage");
    el.querySelector("#iab-url").textContent = name || url;

    if (opts.embed) {
      // Genuine embed path (same-origin or known-friendly). Iframe fills stage.
      stage.innerHTML = `<iframe class="iab-frame" referrerpolicy="no-referrer" src="${url}"></iframe>`;
    } else {
      // Default: a clean launch card — no iframe gamble, no broken glyph.
      stage.innerHTML = `
        <div class="iab-card">
          <div class="iab-card-icon">↗</div>
          <h2>${escapeHtml(name || "External page")}</h2>
          <p>This opens at the original site, so you see it exactly as published
             — with full, up-to-date content and proper credit to the source.</p>
          <a class="iab-launch" href="${url}" target="_blank" rel="noopener">Open the page ↗</a>
          <div class="iab-host">${hostOf(url)}</div>
        </div>`;
    }
    el.classList.add("open");
  }

  function close() {
    const el = document.getElementById("iab");
    if (!el) return;
    el.classList.remove("open");
    el.querySelector("#iab-stage").innerHTML = "";   // unload any iframe
  }

  function hostOf(url) {
    try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  S.iab = { open, close };
})();
