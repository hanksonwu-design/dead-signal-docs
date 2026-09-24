// Local preview: serves the site and answers /api/docs straight from docs/*.md,
// so edits show up on refresh without rebuilding docs.json.
//   node tools/serve.mjs [port]
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, normalize, extname } from "node:path";
import { exec } from "node:child_process";
import { ROOT, buildPayload } from "./build-docs.mjs";

const PORT = Number(process.argv[2]) || 8765;
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".md": "text/markdown; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml",
};

createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  try {
    if (url.pathname === "/api/docs") {
      res.writeHead(200, { "Content-Type": TYPES[".json"], "Cache-Control": "no-store" });
      res.end(JSON.stringify(buildPayload()));
      return;
    }
    const rel = decodeURIComponent(url.pathname.endsWith("/") ? url.pathname + "index.html" : url.pathname);
    const file = normalize(join(ROOT, rel));
    if (!file.startsWith(normalize(ROOT))) throw Object.assign(new Error("forbidden"), { code: "ENOENT" });
    if (!(await stat(file)).isFile()) throw Object.assign(new Error("not a file"), { code: "ENOENT" });
    res.writeHead(200, { "Content-Type": TYPES[extname(file).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(await readFile(file));
  } catch (error) {
    const missing = error.code === "ENOENT";
    res.writeHead(missing ? 404 : 500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(missing ? "Not found" : String(error));
    if (!missing) console.error(error);
  }
}).listen(PORT, "127.0.0.1", () => {
  const address = `http://localhost:${PORT}/`;
  console.log(`Preview: ${address}  (Ctrl+C to stop)`);
  if (process.platform === "win32" && !process.argv.includes("--no-open")) exec(`start "" "${address}"`);
});
