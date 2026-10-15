// Tiny static server for asset previews.
//   /repo/...    -> repository root (public assets, node_modules, tools)
//   /scratch/... -> absolute path given by --scratch (raw/intermediate files outside the repo)
// usage: node tools/assets/characters/static_server.mjs --port 5231 [--scratch /abs/dir]
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const opt = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const port = Number(opt('--port', 5231));
const scratch = opt('--scratch', null);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.wasm': 'application/wasm', '.hdr': 'application/octet-stream' };
http.createServer((req, res) => {
  const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let f = null;
  if (u.startsWith('/repo/')) f = path.join(repo, u.slice(6));
  else if (u.startsWith('/scratch/') && scratch) f = path.join(scratch, u.slice(9));
  if (!f || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nf ' + u); return; }
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(f).pipe(res);
}).listen(port, () => console.log('serving on', port));
