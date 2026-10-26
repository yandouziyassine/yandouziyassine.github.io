import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const projects = fs.readdirSync("src/content/projects").filter((f) => f.endsWith(".md"));

describe("projects", () => {
  it("has the 25 migrated projects", () => {
    expect(projects.length).toBeGreaterThanOrEqual(25);
  });

  it("every project has a built case-study page", () => {
    const missing = projects.map((f) => f.replace(/\.md$/, "")).filter((s) => !fs.existsSync(path.join("dist", "projects", s, "index.html")));
    expect(missing).toEqual([]);
  });

  it("every local image a project links to exists in public/", () => {
    const broken = projects.flatMap((f) => {
      const md = fs.readFileSync(path.join("src/content/projects", f), "utf8");
      return [...md.matchAll(/(?:\]\(|src="|cover: )(\/(?:media|images)\/[^)"\s]+)/g)]
        .map((m) => m[1]).filter((p) => !fs.existsSync(path.join("public", p)));
    });
    expect(broken).toEqual([]);
  });

  it("every built page has an Open Graph card that exists (and no card template is left as a page)", () => {
    const pages = fs.readdirSync("dist", { recursive: true }).filter((f) => f.endsWith(".html")).map(String);
    const missing = pages.flatMap((f) => {
      const og = fs.readFileSync(path.join("dist", f), "utf8").match(/property="og:image" content="https?:\/\/[^/]+(\/[^"]+)"/);
      return og && fs.existsSync(path.join("dist", og[1])) ? [] : [f];
    });
    expect(missing).toEqual([]);
    expect(pages.filter((f) => f.split(/[\\/]/)[0] === "og")).toEqual([]);
  });

  it("every published image has a licence entry (owner rule: no copyrighted dataset images online)", () => {
    const { images, sources } = JSON.parse(fs.readFileSync("src/data/image-licences.json", "utf8"));
    // The depth game's images carry their own per-image credits (copied by scripts/depth-game.mjs, which already
    // refuses non-free licences); check them again here.
    if (fs.existsSync("src/data/depth-game.json")) {
      const game = JSON.parse(fs.readFileSync("src/data/depth-game.json", "utf8"));
      const free = /^(CC0|Public domain|CC BY(-SA)? \d\.\d|MIT|Apache-2\.0)\b/i;
      sources["depth-game"] = { name: "Depth game images", licence: "per image" };
      for (const c of game.credits) {
        expect(c.license, c.img).toMatch(free);
        images[c.img] = "depth-game";
      }
    }
    const files = ["images", "media"].flatMap((d) => fs.readdirSync(path.join("public", d), { recursive: true }).map(String)
      .filter((f) => /\.(png|jpe?g|gif|webp|svg|avif)$/i.test(f)).map((f) => `/${d}/${f.split(path.sep).join("/")}`));
    expect(files.filter((f) => !images[f])).toEqual([]);                        // a new image needs a licence entry
    expect(Object.keys(images).filter((k) => !files.includes(k))).toEqual([]);  // no stale entries
    expect(Object.values(images).filter((s) => !sources[s])).toEqual([]);

    // Every image a built page shows must come from that list (generated variants map back to their original).
    const original = (src) => src
      .replace(/^\/media-webp\/(.+?)(\.still)?\.webp$/, (_, p) => files.find((f) => f.replace(/\.[a-z]+$/i, "") === `/media/${p}`) || src)
      .replace(/^\/thumbs\/(.+)-(400|800)\.webp$/, (_, p) => files.find((f) => f.replace(/\.[a-z]+$/i, "") === `/images/${p}`) || src);
    const shown = new Set();
    for (const f of fs.readdirSync("dist", { recursive: true }).map(String).filter((f) => f.endsWith(".html"))) {
      const html = fs.readFileSync(path.join("dist", f), "utf8");
      for (const m of html.matchAll(/(?:src|srcset|data-anim)="([^"]+)"/g))
        for (const part of m[1].split(",")) shown.add(part.trim().split(" ")[0]);
    }
    const allowedRemote = /^https:\/\/raw\.githubusercontent\.com\/statsbomb\//; // StatsBomb logo, required by their terms
    const unlisted = [...shown].filter((s) => /\.(png|jpe?g|gif|webp|svg|avif)$/i.test(s) && !s.startsWith("/_astro/"))
      .filter((s) => !allowedRemote.test(s) && !images[original(s)]);
    expect(unlisted).toEqual([]);
  });

  it("every image in a case study has alt text", () => {
    const missing = fs.readdirSync("dist/projects", { recursive: true }).map(String).filter((f) => f.endsWith(".html"))
      .flatMap((f) => {
        const prose = fs.readFileSync(path.join("dist/projects", f), "utf8").split('class="prose')[1] || "";
        return [...prose.matchAll(/<img\b[^>]*>/g)].filter((m) => !/\balt="[^"]+"/.test(m[0])).map((m) => `${f}: ${m[0].slice(0, 80)}`);
      });
    expect(missing).toEqual([]);
  });
});
