/*
 * views/library.js — the educational curriculum. Loads library.json and
 * renders the five modules as accordions; each topic carries attributed
 * source links that open in the in-app browser (driving traffic to origin).
 *
 * Supports deep-linking: S.views.library.render(stage, { module, topic })
 * lets the map's contextual "What's This?" jump straight to a topic.
 */
(function () {
  const S = window.Skyward;
  let cache = null;

  async function load() {
    if (cache) return cache;
    cache = (await (await fetch(S.url("static/data/library.json"))).json()).modules || [];
    return cache;
  }

  async function render(stage, opts = {}) {
    const modules = await load();

    const html = modules.map((m) => {
      const topics = m.topics.map((t) => `
        <div class="topic" id="topic-${t.id}">
          <h3>${t.title}</h3>
          <p>${t.body}</p>
          <div class="srcs">
            ${t.sources.map((s) => `<a data-url="${s.url}" data-name="${s.name}">${s.name}</a>`).join("")}
          </div>
        </div>`).join("");
      return `
        <div class="module" id="module-${m.id}">
          <div class="module-head" data-toggle="${m.id}">
            <div class="num">${m.number}</div>
            <div class="mt"><h2>${m.title}</h2><p>${m.summary}</p></div>
            <div class="chev">›</div>
          </div>
          <div class="module-body">${topics}</div>
        </div>`;
    }).join("");

    stage.innerHTML = `
      <div class="scroll-view">
        <div class="view-head">
          <span class="eyebrow">Self-paced learning</span>
          <h1>The Library</h1>
          <p>Five modules, from reading a synoptic chart to judging a snowpack. Every topic links to its source.</p>
        </div>
        ${html}
      </div>`;

    stage.querySelectorAll(".module-head").forEach((h) => {
      h.addEventListener("click", () => h.parentElement.classList.toggle("open"));
    });
    // Source links open in the in-app browser overlay.
    stage.querySelectorAll(".topic .srcs a").forEach((a) => {
      a.addEventListener("click", (e) => { e.preventDefault(); S.iab.open(a.dataset.url, a.dataset.name); });
    });

    // Deep link from a "What's This?" contextual button.
    if (opts.module) {
      const mod = stage.querySelector(`#module-${opts.module}`);
      if (mod) {
        mod.classList.add("open");
        const target = opts.topic ? stage.querySelector(`#topic-${opts.topic}`) : mod;
        setTimeout(() => target?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
      }
    }
  }

  S.views = S.views || {};
  S.views.library = { render, teardown() {} };
})();
