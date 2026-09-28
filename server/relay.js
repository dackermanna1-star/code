// Co-op relay: a tiny zero-dependency WebSocket server that pairs one host
// with up to three joining players by room code and forwards messages
// between them. The host's browser runs the authoritative simulation; the
// relay never inspects game data.
//
//   node server/relay.js [port]      -> serves ./dist (if built) + relay on /net
//   (the Vite dev/preview servers also mount the relay on /net, see vite.config.js)
//
// Control protocol (JSON text frames):
//   client -> relay  {t:'host', name}            relay -> {t:'hosted', code}
//   client -> relay  {t:'join', code, name}      relay -> {t:'joined', id, code} | {t:'error', msg}
//                                                relay -> host {t:'peer', id, name}
//   host   -> relay  {t:'to', id, d} | {t:'all', d} | {t:'kick', id}
//   peer   -> relay  {t:'up', d}                 relay -> host {t:'msg', from, d}
//   relay  -> peers  {t:'msg', from:0, d}  ...  {t:'closed'} when the host leaves
//   relay  -> host   {t:'left', id}
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_PEERS = 3;
const MAX_MSG = 4 * 1024 * 1024;

// ----------------------------------------------------------- WebSocket core --
class Socket {
  constructor(sock) {
    this.sock = sock;
    this.buf = Buffer.alloc(0);
    this.frags = [];
    this.fragOp = 0;
    this.open = true;
    this.onmessage = null;
    this.onclose = null;
    sock.setNoDelay(true);
    sock.on('data', (d) => this._data(d));
    sock.on('close', () => this._closed());
    sock.on('error', () => this._closed());
  }
  _closed() {
    if (!this.open) return;
    this.open = false;
    this.onclose?.();
  }
  _data(d) {
    this.buf = this.buf.length ? Buffer.concat([this.buf, d]) : d;
    for (;;) {
      const b = this.buf;
      if (b.length < 2) return;
      const fin = (b[0] & 0x80) !== 0;
      const op = b[0] & 0x0f;
      const masked = (b[1] & 0x80) !== 0;
      let len = b[1] & 0x7f;
      let off = 2;
      if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (b.length < 10) return; len = Number(b.readBigUInt64BE(2)); off = 10; }
      if (len > MAX_MSG) { this.close(); return; }
      const mOff = off;
      if (masked) off += 4;
      if (b.length < off + len) return;
      let payload = b.subarray(off, off + len);
      if (masked) {
        const m = b.subarray(mOff, mOff + 4);
        payload = Buffer.from(payload);
        for (let i = 0; i < payload.length; i++) payload[i] ^= m[i & 3];
      }
      this.buf = b.subarray(off + len);
      this._frame(fin, op, payload);
      if (!this.open) return;
    }
  }
  _frame(fin, op, payload) {
    if (op === 0x8) { this._send(0x8, Buffer.alloc(0)); this.close(); return; }
    if (op === 0x9) { this._send(0xA, payload); return; }
    if (op === 0xA) return;
    if (op === 0x1 || op === 0x2) { this.fragOp = op; this.frags = [payload]; }
    else if (op === 0x0) this.frags.push(payload);
    else return;
    if (!fin) return;
    const all = this.frags.length === 1 ? this.frags[0] : Buffer.concat(this.frags);
    this.frags = [];
    if (this.fragOp === 0x1) this.onmessage?.(all.toString('utf8'));
  }
  _send(op, data) {
    if (!this.open) return;
    const len = data.length;
    let head;
    if (len < 126) { head = Buffer.alloc(2); head[1] = len; }
    else if (len < 65536) { head = Buffer.alloc(4); head[1] = 126; head.writeUInt16BE(len, 2); }
    else { head = Buffer.alloc(10); head[1] = 127; head.writeBigUInt64BE(BigInt(len), 2); }
    head[0] = 0x80 | op;
    try { this.sock.write(Buffer.concat([head, data])); } catch (e) { this._closed(); }
  }
  send(text) { this._send(0x1, Buffer.from(text, 'utf8')); }
  close() {
    if (!this.open) return;
    try { this.sock.end(); } catch (e) { /* ignore */ }
    this._closed();
  }
}

function upgrade(req, sock) {
  const key = req.headers['sec-websocket-key'];
  if (!key) { sock.destroy(); return null; }
  const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
  sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  return new Socket(sock);
}

// -------------------------------------------------------------- rooms --
const rooms = new Map(); // code -> {host, peers: Map(id -> {ws,name}), nextId}

function makeCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  for (;;) {
    let c = '';
    for (let i = 0; i < 4; i++) c += A[Math.floor(Math.random() * A.length)];
    if (!rooms.has(c)) return c;
  }
}

function handle(ws, log) {
  let room = null;
  let id = -1; // 0 = host
  const send = (w, o) => w.send(JSON.stringify(o));
  ws.onmessage = (text) => {
    let m;
    try { m = JSON.parse(text); } catch (e) { return; }
    if (!room) {
      if (m.t === 'host') {
        const code = makeCode();
        room = { code, host: ws, peers: new Map(), nextId: 1 };
        rooms.set(code, room);
        id = 0;
        send(ws, { t: 'hosted', code });
        log(`room ${code} hosted by ${m.name || '?'}`);
      } else if (m.t === 'join') {
        const r = rooms.get(String(m.code || '').toUpperCase());
        if (!r) { send(ws, { t: 'error', msg: 'No game with that code.' }); return; }
        if (r.peers.size >= MAX_PEERS) { send(ws, { t: 'error', msg: 'That game is full.' }); return; }
        room = r;
        id = r.nextId++;
        r.peers.set(id, { ws, name: String(m.name || 'Player').slice(0, 24) });
        send(ws, { t: 'joined', id, code: r.code });
        send(r.host, { t: 'peer', id, name: r.peers.get(id).name });
        log(`peer ${id} joined ${r.code}`);
      }
      return;
    }
    if (id === 0) {
      if (m.t === 'to') { const p = room.peers.get(m.id); if (p) p.ws.send(JSON.stringify({ t: 'msg', from: 0, d: m.d })); }
      else if (m.t === 'all') { const s = JSON.stringify({ t: 'msg', from: 0, d: m.d }); for (const p of room.peers.values()) p.ws.send(s); }
      else if (m.t === 'kick') { const p = room.peers.get(m.id); if (p) { send(p.ws, { t: 'error', msg: 'Removed by host.' }); p.ws.close(); } }
    } else if (m.t === 'up') {
      room.host.send(JSON.stringify({ t: 'msg', from: id, d: m.d }));
    }
  };
  ws.onclose = () => {
    if (!room) return;
    if (id === 0) {
      for (const p of room.peers.values()) { send(p.ws, { t: 'closed' }); p.ws.close(); }
      rooms.delete(room.code);
      log(`room ${room.code} closed`);
    } else {
      room.peers.delete(id);
      if (room.host.open) send(room.host, { t: 'left', id });
      log(`peer ${id} left ${room.code}`);
    }
    room = null;
  };
}

// Attach the relay to an existing http server on `route` (default /net).
export function attachRelay(server, route = '/net', log = () => {}) {
  server.on('upgrade', (req, sock) => {
    const url = (req.url || '').split('?')[0];
    if (url !== route) return; // leave other upgrades (e.g. Vite HMR) alone
    const ws = upgrade(req, sock);
    if (ws) handle(ws, log);
  });
}

// ----------------------------------------------------- standalone server --
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ico': 'image/x-icon' };

function serveStatic(root) {
  return (req, res) => {
    let p = decodeURIComponent((req.url || '/').split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.normalize(path.join(root, p));
    if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end(fs.existsSync(root) ? 'Not found' : 'Build the game first: npm run build');
        return;
      }
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    });
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const port = +process.argv[2] || +process.env.PORT || 8787;
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
  const server = http.createServer(serveStatic(root));
  attachRelay(server, '/net', (s) => console.log('[relay]', s));
  server.listen(port, () => console.log(`The Last Four: game + co-op relay on http://localhost:${port}/  (relay at ws://<host>:${port}/net)`));
}
