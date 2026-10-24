// Minimal static server for a Next.js `out/` export (prod-like: immutable cache on /_next/static, html fallback, 404.html).
import { createServer } from "node:http";
import { stat, readFile } from "node:fs/promises";
import { join, extname, normalize } from "node:path";
import { brotliCompressSync, gzipSync, constants } from "node:zlib";
const TEXT = new Set([".html", ".js", ".css", ".json", ".txt", ".xml", ".svg", ".map", ".webmanifest"]);
const root = process.argv[2] || "out";
const port = Number(process.argv[3] || 3101);
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".txt": "text/plain; charset=utf-8", ".xml": "application/xml", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".ico": "image/x-icon", ".woff2": "font/woff2", ".woff": "font/woff", ".pdf": "application/pdf", ".webmanifest": "application/manifest+json", ".map": "application/json" };
async function fileOf(p) { try { const s = await stat(p); return s.isFile() ? p : null; } catch { return null; } }
createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  let p = decodeURIComponent(url.pathname);
  if (p.endsWith("/")) p += "index.html";
  p = normalize(p).replace(/^(\.\.[/\\])+/, "");
  let f = await fileOf(join(root, p));
  if (!f && !extname(p)) f = await fileOf(join(root, p + ".html"));
  let status = 200;
  if (!f) { f = await fileOf(join(root, "404.html")); status = 404; }
  if (!f) { res.writeHead(404); return res.end("not found"); }
  let body = await readFile(f);
  const headers = { "content-type": MIME[extname(f)] || "application/octet-stream", vary: "accept-encoding" };
  const ae = String(req.headers["accept-encoding"] || "");
  if (TEXT.has(extname(f)) && body.length > 512) {
    if (/\bbr\b/.test(ae)) { body = brotliCompressSync(body, { params: { [constants.BROTLI_PARAM_QUALITY]: 5 } }); headers["content-encoding"] = "br"; }
    else if (/\bgzip\b/.test(ae)) { body = gzipSync(body, { level: 6 }); headers["content-encoding"] = "gzip"; }
  }
  headers["content-length"] = body.length;
  if (p.startsWith("/_next/static/")) headers["cache-control"] = "public, max-age=31536000, immutable";
  else headers["cache-control"] = "public, max-age=0, must-revalidate";
  res.writeHead(status, headers); res.end(body);
}).listen(port, () => console.log(`static ${root} on http://localhost:${port}`));
