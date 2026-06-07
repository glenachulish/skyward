/*
 * app.js — shell + router. Prefix-aware throughout: every route resolves
 * through Skyward.routePath(), so the same code runs at "/" on the Mac and
 * "/skyward/" on the Pi with no edits.
 *
 * Routes: "" (map / home), "webcams", "library".
 */
(function () {
  const S = window.Skyward;
  const ROUTES = ["", "forecast", "webcams", "library"];
  const NAMES = { "": "map", "forecast": "forecast", "webcams": "webcams", "library": "library" };

  let current = null;

  // Derive the logical route from the current pathname, stripping BASE.
  function routeFromPath() {
    let p = window.location.pathname;
    if (S.BASE && p.startsWith(S.BASE)) p = p.slice(S.BASE.length);
    p = p.replace(/^\/+/, "").replace(/\/+$/, "");
    return ROUTES.includes(p) ? p : "";
  }

  async function go(route, push = true, opts = {}) {
    if (!ROUTES.includes(route)) route = "";
    const viewName = NAMES[route];

    // Teardown previous view (Leaflet needs explicit cleanup).
    if (current && S.views[current] && S.views[current].teardown) {
      try { S.views[current].teardown(); } catch {}
    }

    const stage = document.getElementById("view");
    stage.innerHTML = "";
    current = viewName;

    await S.views[viewName].render(stage, opts);
    setActiveNav(route);

    if (push) {
      const target = S.routePath(route);
      if (window.location.pathname !== target) history.pushState({ route }, "", target);
    }
  }

  function setActiveNav(route) {
    document.querySelectorAll(".nav-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.route === route);
    });
  }

  function buildShell() {
    const app = document.getElementById("app");
    app.innerHTML = `
      <div id="view"></div>
      <nav id="nav">
        <button class="nav-btn" data-route="">
          <svg viewBox="0 0 24 24"><path d="M3 7l6-3 6 3 6-3v13l-6 3-6-3-6 3V7z"/><path d="M9 4v13M15 7v13"/></svg>
          Map
        </button>
        <button class="nav-btn" data-route="forecast">
          <svg viewBox="0 0 24 24"><path d="M7 16a4 4 0 010-8 5 5 0 019.6-1.5A3.5 3.5 0 0117 16H7z"/><path d="M8 20l1-2M12 20l1-2M16 20l1-2"/></svg>
          Forecast
        </button>
        <button class="nav-btn" data-route="webcams">
          <svg viewBox="0 0 24 24"><rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3z"/></svg>
          Webcams
        </button>
        <button class="nav-btn" data-route="library">
          <svg viewBox="0 0 24 24"><path d="M4 5a2 2 0 012-2h6v18H6a2 2 0 01-2-2V5z"/><path d="M12 3h6a2 2 0 012 2v14a2 2 0 01-2 2h-6"/></svg>
          Library
        </button>
      </nav>
      <div id="toast"></div>`;

    app.querySelectorAll(".nav-btn").forEach((b) => {
      b.addEventListener("click", () => go(b.dataset.route));
    });
  }

  // Public helper for contextual "What's This?" jumps from the map.
  S.openLibrary = (module, topic) => go("library", true, { module, topic });

  S.toast = (msg) => {
    const t = document.getElementById("toast");
    t.textContent = msg; t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 3200);
  };

  window.addEventListener("popstate", () => go(routeFromPath(), false));

  document.addEventListener("DOMContentLoaded", () => {
    buildShell();
    go(routeFromPath(), false);
  });
})();
