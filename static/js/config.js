/*
 * config.js — THE PREFIX CONTRACT (read PI-INFRASTRUCTURE.md before editing).
 *
 * Skyward must work at "/" on the Mac AND at "/skyward/" behind the Pi's
 * Tailscale Funnel, with ZERO code changes between the two. The whole app
 * therefore routes every URL through here and NEVER writes a leading-slash
 * absolute path anywhere else.
 *
 * How BASE is determined, automatically:
 *   - We read the path the page was served from. If it starts with /skyward,
 *     BASE = "/skyward". Otherwise BASE = "" (local dev at root).
 *   This means you never hand-edit a flag at deploy time — the same files
 *     behave correctly in both places. (Belt and braces: you can also force it
 *     by setting window.SKYWARD_BASE before this script loads.)
 *
 * Usage everywhere else:
 *   url("api/weather?lat=..")   -> "api/weather?.." (local) / "/skyward/api/weather?.." (pi)
 *   url("static/css/app.css")   -> prefixed correctly in both
 *   asset paths in HTML use relative links (no leading slash) for the same reason.
 */
(function () {
  function detectBase() {
    if (typeof window.SKYWARD_BASE === "string") return window.SKYWARD_BASE;
    const p = window.location.pathname;
    const m = p.match(/^\/skyward(?=\/|$)/);
    return m ? "/skyward" : "";
  }

  const BASE = detectBase();

  // Build an app URL from a prefix-relative path (no leading slash needed).
  function url(path) {
    const clean = String(path).replace(/^\/+/, ""); // strip any accidental leading slash
    return (BASE ? BASE + "/" : "/") + clean;
  }

  // For the SPA router: turn a logical route ("webcams") into a real path.
  function routePath(route) {
    return url(route === "" ? "" : route);
  }

  window.Skyward = window.Skyward || {};
  window.Skyward.BASE = BASE;
  window.Skyward.url = url;
  window.Skyward.routePath = routePath;
})();
