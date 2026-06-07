/*
 * store.js — privacy-first local persistence (blueprint: 100% account-free,
 * everything stored locally on the device). Thin wrapper over localStorage
 * with a namespace and JSON safety.
 *
 * NOTE: localStorage works in a real browser on the Mac and on the Pi. (It is
 * only disallowed inside Claude.ai artifacts — this app is served standalone.)
 */
(function () {
  const NS = "skyward:";

  function get(key, fallback) {
    try {
      const raw = localStorage.getItem(NS + key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch { return fallback; }
  }
  function set(key, value) {
    try { localStorage.setItem(NS + key, JSON.stringify(value)); } catch {}
  }
  function toggleIn(key, item) {
    const arr = get(key, []);
    const i = arr.indexOf(item);
    if (i === -1) arr.push(item); else arr.splice(i, 1);
    set(key, arr);
    return arr;
  }

  window.Skyward.store = { get, set, toggleIn };
})();
