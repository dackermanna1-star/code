#!/usr/bin/env node
// ROBLOX (circa 2008) recreation server.
// Zero dependencies: plain Node http, a JSON file database and server-side
// rendered ".aspx" pages, mirroring the URL structure of the 2008 site.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const db = require('./src/db');
const { router } = require('./src/router');

const PORT = Number(process.env.PORT) || 8080;
const PUBLIC = path.join(__dirname, 'public');
const THUMBS = db.THUMB_DIR;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png', '.gif': 'image/gif', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.json': 'application/json', '.txt': 'text/plain; charset=utf-8', '.wav': 'audio/wav', '.xml': 'text/xml; charset=utf-8',
};

function serveFile(res, file, req) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('404 Not Found'); return; }
    const etag = `"${st.size}-${st.mtimeMs}"`;
    if (req.headers['if-none-match'] === etag) { res.writeHead(304); res.end(); return; }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': st.size,
      ETag: etag,
      'Cache-Control': 'no-cache',
    });
    fs.createReadStream(file).pipe(res);
  });
}

function readBody(req, limit = 8 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('Body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    let pathname = decodeURIComponent(u.pathname);
    if (pathname.includes('..')) { res.writeHead(400); res.end(); return; }

    // Static assets
    const lower = pathname.toLowerCase();
    if (lower.startsWith('/thumbs/')) return serveFile(res, path.join(THUMBS, path.basename(pathname)), req);
    if (/^\/(css|js|images|game\/client|sounds|fonts|dev)\//i.test(pathname) || lower === '/favicon.ico') {
      const p = pathname.replace(/^\/game\/client\//i, '/game/');
      return serveFile(res, path.join(PUBLIC, p), req);
    }

    let body = '';
    if (req.method === 'POST') body = await readBody(req);
    await router(req, res, u, body);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h1>Server Error in \'/\' Application.</h1><p>' + String(e.message).replace(/</g, '&lt;') + '</p>');
  }
});

db.load();
server.listen(PORT, () => {
  console.log(`ROBLOX 2008 recreation running at http://localhost:${PORT}/`);
});

process.on('SIGINT', () => { db.flush(); process.exit(0); });
process.on('SIGTERM', () => { db.flush(); process.exit(0); });
