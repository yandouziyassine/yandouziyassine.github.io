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

  it("every image in a case study has alt text", () => {
    const missing = fs.readdirSync("dist/projects", { recursive: true }).map(String).filter((f) => f.endsWith(".html"))
      .flatMap((f) => {
        const prose = fs.readFileSync(path.join("dist/projects", f), "utf8").split('class="prose')[1] || "";
        return [...prose.matchAll(/<img\b[^>]*>/g)].filter((m) => !/\balt="[^"]+"/.test(m[0])).map((m) => `${f}: ${m[0].slice(0, 80)}`);
      });
    expect(missing).toEqual([]);
  });
});
