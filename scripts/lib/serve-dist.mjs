// Tiny static server for dist/: the built pages reference /_astro/... absolute paths, so file:// does not work.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

export const DIST = path.resolve(import.meta.dirname, "..", "..", "dist");
const TYPES = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".woff2": "font/woff2" };

/** Starts the server on a free port; resolves to { origin, close }. */
export async function serveDist() {
  const server = http.createServer((req, res) => {
    let p = path.join(DIST, decodeURIComponent(new URL(req.url, "http://x").pathname));
    if (p.endsWith(path.sep) || !path.extname(p)) p = path.join(p, "index.html");
    fs.readFile(p, (err, data) => {
      if (err) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { "content-type": TYPES[path.extname(p)] || "application/octet-stream" });
      res.end(data);
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { origin: `http://127.0.0.1:${server.address().port}`, close: () => server.close() };
}
