#!/usr/bin/env node
// Minimal static file server for local play: `node tools/serve.mjs [port]`.
// ES modules and AudioWorklets need http(s), so file:// URLs won't work.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const port = Number(process.argv[2] || process.env.PORT || 8080);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.wad': 'application/octet-stream',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    let path = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
    if (!path || path.endsWith('/')) path = join(path, 'index.html');
    const file = join(root, path);
    if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
    const info = await stat(file);
    if (info.isDirectory()) { res.writeHead(302, { Location: `${url.pathname}/` }).end(); return; }
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': types[extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found');
  }
}).listen(port, () => {
  console.log(`DOOM is running at http://localhost:${port}/`);
});
