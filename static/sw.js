/* Skyward service worker — minimal installability shim.
   Deliberately does NO caching: asset freshness is owned by the ?v=N
   cache-busting in index.html, and fighting that with a SW cache causes the
   exact staleness bugs the handover notes warn about. Phase 6 ("Save for
   Offline") is the place to add real offline bundling, carefully. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => { /* network passthrough */ });
