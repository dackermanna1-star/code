// Browser side of the co-op relay (see server/relay.js): room hosting/joining
// and JSON message passing over a single WebSocket.

export function defaultRelayUrl() {
  if (typeof location === 'undefined' || !/^https?:$/.test(location.protocol)) return 'ws://localhost:8787/net';
  return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/net';
}

export class NetLink {
  constructor(url) {
    this.url = normalizeUrl(url || defaultRelayUrl());
    this.ws = null;
    this.handlers = {};
    this.id = -1;
    this.code = null;
    this.pending = null;
    this.sentBytes = 0;
    this.recvBytes = 0;
  }
  on(type, fn) { this.handlers[type] = fn; return this; }
  emit(type, ...a) { this.handlers[type]?.(...a); }
  get open() { return this.ws && this.ws.readyState === 1; }
  get congested() { return this.ws && this.ws.bufferedAmount > 512 * 1024; }

  connect() {
    return new Promise((resolve, reject) => {
      let ws;
      try { ws = new WebSocket(this.url); } catch (e) { reject(new Error('Bad relay address: ' + this.url)); return; }
      this.ws = ws;
      let opened = false;
      const timer = setTimeout(() => { if (!opened) { try { ws.close(); } catch (e) { /* */ } reject(new Error('Timed out reaching the relay at ' + this.url)); } }, 6000);
      ws.onopen = () => { opened = true; clearTimeout(timer); resolve(); };
      ws.onerror = () => { if (!opened) { clearTimeout(timer); reject(new Error('Could not reach the co-op relay at ' + this.url)); } };
      ws.onclose = () => { if (opened) this.emit('close'); };
      ws.onmessage = (e) => this._msg(e.data);
    });
  }
  _msg(text) {
    this.recvBytes += text.length;
    let m;
    try { m = JSON.parse(text); } catch (e) { return; }
    switch (m.t) {
      case 'hosted': this.id = 0; this.code = m.code; this._settle(null, m.code); break;
      case 'joined': this.id = m.id; this.code = m.code; this._settle(null, m.id); break;
      case 'error': if (this.pending) this._settle(new Error(m.msg)); else this.emit('error', m.msg); break;
      case 'peer': this.emit('peer', m.id, m.name); break;
      case 'left': this.emit('left', m.id); break;
      case 'closed': this.emit('hostClosed'); break;
      case 'msg': this.emit('msg', m.from, m.d); break;
    }
  }
  _settle(err, v) {
    const p = this.pending;
    this.pending = null;
    if (!p) return;
    if (err) p.reject(err); else p.resolve(v);
  }
  _request(obj) {
    return new Promise((resolve, reject) => {
      this.pending = { resolve, reject };
      this._send(obj);
      setTimeout(() => this._settle(new Error('The relay did not answer.')), 6000);
    });
  }
  _send(obj) {
    if (!this.open) return false;
    const s = JSON.stringify(obj);
    this.sentBytes += s.length;
    this.ws.send(s);
    return true;
  }
  host(name) { return this._request({ t: 'host', name }); }
  join(code, name) { return this._request({ t: 'join', code: String(code || '').trim().toUpperCase(), name }); }
  toAll(d) { return this._send({ t: 'all', d }); }
  to(id, d) { return this._send({ t: 'to', id, d }); }
  up(d) { return this._send({ t: 'up', d }); }
  kick(id) { return this._send({ t: 'kick', id }); }
  close() {
    this.handlers = {};
    try { this.ws?.close(); } catch (e) { /* */ }
    this.ws = null;
  }
}

function normalizeUrl(u) {
  u = String(u).trim();
  if (!/^wss?:\/\//.test(u)) u = (u.startsWith('https') ? 'wss://' + u.replace(/^https:\/\//, '') : 'ws://' + u.replace(/^http:\/\//, ''));
  if (!/\/net\/?$/.test(u)) u = u.replace(/\/$/, '') + '/net';
  return u;
}
