// Tiny static dev server for the repo root. Also serves /__fonts.css (from src/ui/fonts.json).
// Usage: node tools/serve.mjs [port]   (default 8080). Importable: startServer(port) → { port, close }.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8',
};

export function fontsCss({ inline = false } = {}) {
  const list = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/ui/fonts.json'), 'utf8'));
  return list.map((f) => {
    const src = inline
      ? `url(data:font/woff2;base64,${fs.readFileSync(path.join(ROOT, 'node_modules', f.file)).toString('base64')})`
      : `url(/node_modules/${f.file})`;
    return `@font-face{font-family:'${f.family}';src:${src} format('woff2');font-weight:${f.weight || 400};font-style:${f.style || 'normal'};font-display:block;}`;
  }).join('\n');
}

export function startServer(port = 0) {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (url === '/__fonts.css') { res.writeHead(200, { 'content-type': 'text/css' }); res.end(fontsCss()); return; }
    let file = path.join(ROOT, url);
    if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve({ port: server.address().port, close: () => server.close() })));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const port = Number(process.argv[2] || 8080);
  startServer(port).then(({ port: p }) => console.log(`HALLOWELL dev server: http://localhost:${p}/index.html`));
}
