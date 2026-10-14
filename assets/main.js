/* Renders the page from data/projects.js. No framework, no build step. */
(function () {
  const S = window.SITE, F = window.FEATURED || [], P = window.PROJECTS || [], K = window.SKILLS || [];
  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const linkHtml = (links = []) =>
    links.map((l) => {
      const ext = /^https?:/.test(l.href);
      return `<a href="${esc(l.href)}"${ext ? ' target="_blank" rel="noopener"' : ""}>${esc(l.label)}${ext ? " ↗" : ""}</a>`;
    }).join("");
  const reading = (m) => (m ? `<div class="reading"><span class="v">${esc(m.value)}</span><span class="u">${esc(m.unit)}</span></div>` : "");

  // ── Hero
  $("#hero-name").textContent = S.name;
  $("#hero-role").textContent = S.role;
  $("#hero-focus").innerHTML = S.focus.map((f) => `<em>${esc(f)}</em>`).join('<span class="sep">/</span>');
  $("#hero-tagline").textContent = S.tagline;
  const deep = P.filter((p) => p.depth === 3).length;
  $("#readings").innerHTML = [
    ["CV projects", P.length, ""],
    ["In-depth analyses", deep, ""],
    ["Fastest speed-up", "17", "×"],
    ["Trained on", "1", "laptop CPU"],
  ].map(([t, v, u]) => `<div><dt>${esc(t)}</dt><dd>${esc(v)}${u ? `<small>${esc(u)}</small>` : ""}</dd></div>`).join("");
  if (S.machine) $("#machine").innerHTML = `<span>The laptop</span>${esc(S.machine)}`;

  // ── Featured
  $("#featured").innerHTML = F.map((f) => {
    const media = f.image
      ? `<img src="${esc(f.image)}" alt="${esc(f.title)}" loading="lazy">`
      : f.diagram
        ? `<div class="diagram" aria-label="Architecture diagram"><pre>${f.diagram.map(esc).join("\n").replace(/(engine loop|risk gate)/g, "<b>$1</b>")}</pre></div>`
        : "";
    return `<article class="feat">
      <div class="feat-media">${media}</div>
      <div class="feat-body">
        <span class="feat-kicker">${esc(f.kicker)}</span>
        <h3>${esc(f.title)}</h3>
        ${reading(f.metric)}
        <p>${esc(f.summary)}</p>
        <div class="chips">${(f.stack || []).map((s) => `<span class="chip">${esc(s)}</span>`).join("")}</div>
        <div class="links">${linkHtml(f.links)}</div>
      </div></article>`;
  }).join("");

  // ── Library grid + filters (areas come from the data, so new areas appear automatically)
  const depthHtml = (d) => `<span class="depth" title="${["", "working demo", "measured on a benchmark", "in-depth analysis"][d] || ""}">` +
    [1, 2, 3].map((i) => `<span class="${i <= d ? "" : "off"}">◆</span>`).join("") + "</span>";
  const ordered = [...P].sort((a, b) => (b.depth || 0) - (a.depth || 0) || a.n.localeCompare(b.n));
  $("#grid").innerHTML = ordered.map((p) => `
    <a class="card" data-area="${esc(p.area)}" href="${esc((p.links && p.links[0] && p.links[0].href) || "#")}" target="_blank" rel="noopener">
      <div class="card-media${p.image ? "" : " empty"}">
        ${p.image ? `<img src="${esc(p.image)}" alt="${esc(p.title)} result" loading="lazy">` : "live webcam app"}
        <span class="card-num">${esc(p.n)}</span>
      </div>
      <div class="card-body">
        <span class="area">${esc(p.area)}</span>
        <div class="card-top"><h3>${esc(p.title)}</h3>${depthHtml(p.depth)}</div>
        ${reading(p.metric)}
        <p>${esc(p.summary)}</p>
      </div>
    </a>`).join("");

  const areas = [...new Set(P.map((p) => p.area))];
  const counts = Object.fromEntries(areas.map((a) => [a, P.filter((p) => p.area === a).length]));
  $("#filters").innerHTML = [`<button class="filter" aria-pressed="true" data-f="*">All<span class="count">${P.length}</span></button>`]
    .concat(areas.map((a) => `<button class="filter" aria-pressed="false" data-f="${esc(a)}">${esc(a)}<span class="count">${counts[a]}</span></button>`))
    .join("");
  $("#filters").addEventListener("click", (e) => {
    const b = e.target.closest(".filter");
    if (!b) return;
    document.querySelectorAll(".filter").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    const f = b.dataset.f;
    document.querySelectorAll(".card").forEach((c) => {
      const show = f === "*" || c.dataset.area === f;
      c.classList.toggle("hide", !show);
      if (show) { c.classList.remove("in-view"); void c.offsetWidth; c.classList.add("in-view"); }
    });
  });

  // ── Skills
  $("#skill-list").innerHTML = K.map((g) =>
    `<div class="skill"><h3>${esc(g.group)}</h3><ul>${g.items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul></div>`).join("");

  // ── About
  $("#about-text").innerHTML = (S.about || []).map((t) => `<p>${esc(t)}</p>`).join("");
  $("#facts").innerHTML = (S.facts || []).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("");

  // ── More projects
  $("#more").innerHTML = (window.MORE || []).map((m) => `
    <a class="more-item" href="${esc(m.href)}" target="_blank" rel="noopener">
      <span class="more-when mono">${esc(m.when)}</span>
      <h4>${esc(m.title)} <span aria-hidden="true">↗</span></h4>
      <p>${esc(m.summary)}</p>
      <span class="more-stack mono">${(m.stack || []).map(esc).join(" · ")}</span>
    </a>`).join("");

  // ── Hardware & coursework
  $("#hardware").innerHTML = (window.HARDWARE || []).map((h) => `<li>${esc(h)}</li>`).join("");
  $("#courses").innerHTML = (window.COURSEWORK || []).map((c) =>
    `<li><b>${esc(c.course)}</b><span>${esc(c.detail)}</span></li>`).join("");

  // ── Contact + misc
  ["#nav-github", "#contact-github"].forEach((id) => { const a = $(id); a.href = S.github; a.target = "_blank"; a.rel = "noopener"; });
  $("#year").textContent = new Date().getFullYear();

  // Scroll reveal for cards and featured blocks
  const io = "IntersectionObserver" in window && new IntersectionObserver((entries) => {
    entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("in-view"); io.unobserve(en.target); } });
  }, { threshold: 0.12 });
  if (io) document.querySelectorAll(".card, .feat, .skill, .more-item").forEach((el) => io.observe(el));
})();
