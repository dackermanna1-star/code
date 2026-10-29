// Packs a single-chunk Vite build (scripts/single/vite.config.mjs) plus public/assets into ONE
// self-contained HTML file that runs from file:// with no server: JS/CSS inline, and every
// fetched file (Havok wasm, texture/sound manifests, JPGs, OGGs) embedded as base64 behind a
// fetch() shim. The audio bank worker is started from a Blob URL.
//
//   npx vite build -c scripts/single/vite.config.mjs --outDir dist-single
//   node scripts/single/inline.mjs dist-single apartment-destruction-sim.html
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, extname } from "node:path";

const [dist = "dist-single", out = "apartment-destruction-sim.html"] = process.argv.slice(2);
const root = new URL("../..", import.meta.url).pathname;
const MIME = {
  ".wasm": "application/wasm", ".json": "application/json", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".png": "image/png", ".ogg": "audio/ogg", ".mp3": "audio/mpeg", ".wav": "audio/wav", ".md": "text/plain",
  ".js": "text/javascript",
};
const walk = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : [p];
});

const html = readFileSync(join(dist, "index.html"), "utf8");
const built = readdirSync(join(dist, "assets"));
const mainJs = built.find((f) => /^index-.*\.js$/.test(f));
const css = built.filter((f) => f.endsWith(".css")).map((f) => readFileSync(join(dist, "assets", f), "utf8")).join("\n");
const worker = built.find((f) => f.startsWith("bankWorker") && f.endsWith(".js"));

// Embedded files keyed by their path below the site root ("assets/...").
const files = {};
for (const f of built) if (f.endsWith(".wasm")) files["assets/" + f] = join(dist, "assets", f);
for (const p of walk(join(root, "public/assets"))) files[relative(join(root, "public"), p)] = p;

const embed = Object.entries(files).map(([k, p]) =>
  `${JSON.stringify(k)}:[${JSON.stringify(MIME[extname(p).toLowerCase()] ?? "application/octet-stream")},"${readFileSync(p).toString("base64")}"]`,
).join(",\n");

const safe = (s) => s.replace(/<\/(script)/gi, "<\\/$1");
const workerSrc = worker ? readFileSync(join(dist, "assets", worker), "utf8") : "";

const boot = `
(() => {
  const E = {${embed}};
  const cache = new Map();
  const bytes = (k) => {
    let b = cache.get(k);
    if (!b) { const s = atob(E[k][1]); b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); cache.set(k, b); }
    return b;
  };
  const keyOf = (url) => {
    let u;
    try { u = decodeURIComponent(new URL(url, location.href).pathname); } catch { return null; }
    const i = u.lastIndexOf("/assets/");
    if (i >= 0 && u.slice(i + 1) in E) return u.slice(i + 1);
    // Bundled files (the Havok wasm) are referenced relative to their chunk, which is now the page.
    return BASE[u.slice(u.lastIndexOf("/") + 1)] ?? null;
  };
  const BASE = {};
  for (const k in E) if (k.split("/").length === 2) BASE[k.slice(7)] = k;
  const realFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const k = keyOf(url);
    if (k) return Promise.resolve(new Response(bytes(k), { status: 200, headers: { "Content-Type": E[k][0] } }));
    if (/\\/assets\\//.test(url) || url.startsWith("file:")) return Promise.resolve(new Response("", { status: 404 }));
    return realFetch(input, init);
  };
  const WORKER = ${JSON.stringify(workerSrc)};
  const RealWorker = window.Worker;
  window.Worker = function (url, opts) {
    // file:// pages may not start blob: MODULE workers; the bundled worker has no imports, so it
    // runs as a classic worker.
    if (WORKER && /bankWorker/.test(String(url))) {
      url = URL.createObjectURL(new Blob([WORKER], { type: "text/javascript" }));
      opts = { ...opts, type: "classic" };
    }
    return new RealWorker(url, opts);
  };
  window.Worker.prototype = RealWorker.prototype;
})();`;

const page = html
  .replace(/<script[^>]*src="[^"]*index-[^"]*\.js"[^>]*><\/script>/, "")
  .replace(/<link[^>]*rel="stylesheet"[^>]*>/g, "")
  .replace(/<link[^>]*rel="modulepreload"[^>]*>/g, "")
  .replace("</head>", () => `<style>${css}</style>\n<script>${safe(boot)}</script>\n</head>`)
  .replace("</body>", () => `<script type="module">${safe(readFileSync(join(dist, "assets", mainJs), "utf8"))}</script>\n</body>`);

writeFileSync(out, page);
console.log(`${out}: ${(page.length / 1048576).toFixed(1)} MB, ${Object.keys(files).length} embedded files`);
