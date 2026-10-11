// Dev-only: serve a local folder of your own game files with CORS for tools/preview/bsp.html
// usage: node tools/serve-gamefiles.mjs <folder> [port]
import http from 'http';
import { readFile } from 'fs/promises';
import { join, normalize } from 'path';
const [dir, port = '8899'] = process.argv.slice(2);
http.createServer(async (req, res) => {
  const p = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
  try {
    const data = await readFile(join(dir, p));
    res.writeHead(200, { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/octet-stream' });
    res.end(data);
  } catch { res.writeHead(404, { 'Access-Control-Allow-Origin': '*' }); res.end(); }
}).listen(+port, () => console.log('serving', dir, 'on', port));
