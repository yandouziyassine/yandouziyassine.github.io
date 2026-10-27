// Card covers drawn from measured results (own work, no dataset photos) for projects whose figures were photos:
// reads the library's docs/*.json and writes public/images/chart-<nn>.svg in the site's palette (16:9).
// Run by hand after a library result changes (outputs are committed; CI has no library checkout):
//   node scripts/result-charts.mjs [path-to-COMPUTER-VISION-PROJECT-LIBRARY]
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const LIB = path.resolve(process.argv[2] || path.join(ROOT, "..", "COMPUTER-VISION-PROJECT-LIBRARY"));
const read = (p) => JSON.parse(fs.readFileSync(path.join(LIB, p), "utf8"));

const C = { bg: "#141518", grid: "#262930", ink: "#ecebe6", ink2: "#a9a8a2", ink3: "#8a8984", signal: "#ff5b1f", ok: "#7fd18b", mute: "#5d6066" };
const FONT = "Geist, 'Helvetica Neue', Arial, sans-serif";
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Grouped vertical bars. groups: [{ label, bars: [{ v, text, series }] }], series: [{ name, color }]. */
function barChart({ title, subtitle, groups, series, max, source }) {
  const W = 1600, H = 900, L = 120, R = 70, T = 260, B = 150;
  const pw = W - L - R, ph = H - T - B;
  const gw = pw / groups.length, n = series.length, bw = Math.min(150, (gw * 0.7) / n);
  const y = (v) => T + ph * (1 - v / max);
  const ticks = Array.from({ length: 5 }, (_, i) => (max * i) / 4);
  const parts = [
    `<rect width="${W}" height="${H}" fill="${C.bg}"/>`,
    `<text x="${L}" y="96" font-size="52" fill="${C.ink}" font-family="${FONT}">${esc(title)}</text>`,
    `<text x="${L}" y="148" font-size="30" fill="${C.ink2}" font-family="${FONT}">${esc(subtitle)}</text>`,
    ...ticks.map((t) => `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" stroke="${C.grid}" stroke-width="2"/>` +
      `<text x="${L - 16}" y="${y(t) + 10}" font-size="26" fill="${C.ink3}" text-anchor="end" font-family="${FONT}">${max <= 1 ? Math.round(t * 100) + "%" : Math.round(t)}</text>`),
  ];
  groups.forEach((g, gi) => {
    const x0 = L + gi * gw + (gw - bw * n - 12 * (n - 1)) / 2;
    g.bars.forEach((b, bi) => {
      const x = x0 + bi * (bw + 12), color = series[b.series ?? bi].color;
      parts.push(`<rect x="${x}" y="${y(b.v)}" width="${bw}" height="${T + ph - y(b.v)}" fill="${color}" rx="4"/>`,
        `<text x="${x + bw / 2}" y="${y(b.v) - 14}" font-size="32" fill="${C.ink}" text-anchor="middle" font-family="${FONT}">${esc(b.text)}</text>`);
    });
    parts.push(`<text x="${L + gi * gw + gw / 2}" y="${T + ph + 52}" font-size="30" fill="${C.ink2}" text-anchor="middle" font-family="${FONT}">${esc(g.label)}</text>`);
  });
  // Legend on its own line under the subtitle, so long titles never collide with it.
  if (series.length > 1) series.forEach((s, i) => parts.push(
    `<rect x="${L + i * 380}" y="172" width="26" height="26" fill="${s.color}" rx="3"/>` +
    `<text x="${L + 38 + i * 380}" y="194" font-size="26" fill="${C.ink2}" font-family="${FONT}">${esc(s.name)}</text>`));
  parts.push(`<text x="${L}" y="${H - 40}" font-size="22" fill="${C.ink3}" font-family="${FONT}">${esc(source)}</text>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(title)}">${parts.join("")}</svg>\n`;
}

const pct = (v) => `${(100 * v).toFixed(1)}%`;
const charts = {};

{ // 07: laptop model vs full-data retrain, same 2,001 test images
  const a = read("07-ppe-safety-monitor/docs/results.json"), b = read("07-ppe-safety-monitor/docs/results_full.json");
  const at = (r) => r.site_alerts.sweep.find((s) => s.conf_threshold === 0.25);
  const rows = [["mAP50", (r) => r.object_level.mAP50], ["Alert recall", (r) => at(r).alert_recall], ["Alert precision", (r) => at(r).alert_precision]];
  charts["07"] = barChart({
    title: "Hard-hat detector: more data, fewer missed violations", subtitle: "YOLO11n on the same 2,001 test images, site alert at confidence 0.25",
    series: [{ name: "CPU, data subset", color: C.mute }, { name: "Full data, cloud GPU", color: C.signal }], max: 1,
    groups: rows.map(([label, f]) => ({ label, bars: [{ v: f(a), text: pct(f(a)) }, { v: f(b), text: pct(f(b)) }] })),
    source: "Project 07 · results.json / results_full.json",
  });
}
{ // 08: vehicles tracked per class
  const s = read("08-traffic-analytics/docs/summary.json");
  const cls = Object.entries(s.tracks_by_class);
  charts["08"] = barChart({
    title: `${s.unique_tracks} vehicles tracked, speeds from a homography`, subtitle: `Mean ${s.mean_speed_kmh} km/h, median ${s.median_speed_kmh} km/h · lane width checked at ${read("08-traffic-analytics/docs/calibration_check.json").lane_width_m} m`,
    series: [{ name: "tracks", color: C.signal }], max: Math.ceil(Math.max(...cls.map(([, v]) => v)) / 4) * 4,
    groups: cls.map(([k, v]) => ({ label: k, bars: [{ v, text: String(v) }] })),
    source: "Project 08 · YOLO11n + ByteTrack, summary.json",
  });
}
{ // 16: text-to-image recall
  const r = read("16-text-to-image-search/docs/results.json");
  charts["16"] = barChart({
    title: "Find the photo from a sentence", subtitle: `CLIP ${r.model} · ${r.n_captions.toLocaleString("en")} captions vs ${r.n_images.toLocaleString("en")} images · ${r.query_ms} ms per query`,
    series: [{ name: "recall", color: C.signal }], max: 1,
    groups: ["R@1", "R@5", "R@10"].map((k) => ({ label: `right photo in top ${k.slice(2)}`, bars: [{ v: r[k], text: pct(r[k]) }] })),
    source: "Project 16 · results.json",
  });
}
{ // 18: VQA accuracy by question type, own prompt vs the model's standard prompt
  const r = read("18-video-qa-assistant/docs/results.json"), a = r.vqav2_val_subset, b = r.vqav2_val_subset_standard;
  const types = [["yes/no", "accuracy_yes/no"], ["number", "accuracy_number"], ["other", "accuracy_other"], ["all", "accuracy"]];
  charts["18"] = barChart({
    title: "A 500M vision-language model on a laptop", subtitle: `SmolVLM2 on ${a.n} VQAv2 questions, ${b.s_per_question} s per answer on CPU`,
    series: [{ name: "first prompt", color: C.mute }, { name: "standard prompt", color: C.signal }], max: 1,
    groups: types.map(([label, k]) => ({ label, bars: [{ v: a[k], text: pct(a[k]) }, { v: b[k], text: pct(b[k]) }] })),
    source: "Project 18 · results.json",
  });
}

for (const [n, svg] of Object.entries(charts)) fs.writeFileSync(path.join(ROOT, "public", "images", `chart-${n}.svg`), svg);
console.log(`result charts: ${Object.keys(charts).map((n) => `chart-${n}.svg`).join(", ")}`);
