// World map: pannable / zoomable view of game.getMapCanvas() with exploration fog, POIs, markers and the player.
import { h, setText, clamp, bearingFromYaw } from '../dom.js';

const CELL = 8; // blocks per exploration cell
const GRID = 128; // blocks per grid square (A..H / 1..8)

export class MapPanel {
  constructor(ui) {
    this.ui = ui;
    this.game = ui.game;
    this.view = { cx: 512, cz: 512, zoom: 0 };
    this.drawT = 0;
    this.fogT = 0;
    this.drag = null;
    this.cursor = null;
    this.build();
  }

  get SX() { return this.game.world?.SX || 1024; }
  get SZ() { return this.game.world?.SZ || 1024; }

  build() {
    this.canvas = h('canvas.map-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.coords = h('div.map-coords');
    const btn = (label, title, fn) => {
      const b = h('button.btn.btn-sm.map-btn', { type: 'button', text: label, title });
      b.addEventListener('click', (e) => { e.stopPropagation(); this.ui.sound('ui_click'); fn(); });
      b.addEventListener('pointerdown', (e) => e.stopPropagation());
      return b;
    };
    this.legend = h('div.map-legend',
      h('div.ml-title', 'Legend'),
      h('div.ml-row', h('i.ml-player'), 'You'),
      h('div.ml-row', h('i.ml-poi'), 'Location'),
      h('div.ml-row', h('i.ml-marker'), 'Marker'),
      h('div.ml-row', h('i.ml-fog'), 'Unexplored'));
    this.revealNote = h('div.map-note');
    this.el = h('div.panel.map-panel',
      this.canvas,
      h('div.map-title', h('div.mt-main', 'Millbrook County'), h('div.mt-sub', 'Kentucky · Survey sheet 7')),
      h('div.map-ctrl',
        btn('+', 'Zoom in', () => this.zoomBy(1.4)),
        btn('−', 'Zoom out', () => this.zoomBy(1 / 1.4)),
        btn('Centre on me', 'Centre the map on your position', () => this.centre())),
      this.legend, this.coords, this.revealNote,
      h('div.map-hint', 'Drag to pan · Wheel to zoom'));

    this.canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 && e.button !== 1) return;
      this.drag = { x: e.clientX, y: e.clientY, cx: this.view.cx, cz: this.view.cz };
      this.canvas.setPointerCapture(e.pointerId);
      this.canvas.classList.add('grabbing');
    });
    this.canvas.addEventListener('pointermove', (e) => {
      const r = this.canvas.getBoundingClientRect();
      this.cursor = { x: e.clientX - r.left, y: e.clientY - r.top };
      if (this.drag) {
        const z = this.view.zoom;
        this.view.cx = this.drag.cx - (e.clientX - this.drag.x) / z;
        this.view.cz = this.drag.cz - (e.clientY - this.drag.y) / z;
        this.clampView();
      }
      this.dirty = true;
    });
    const end = (e) => {
      if (!this.drag) return;
      this.drag = null;
      try { this.canvas.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
      this.canvas.classList.remove('grabbing');
    };
    this.canvas.addEventListener('pointerup', end);
    this.canvas.addEventListener('pointercancel', end);
    this.canvas.addEventListener('pointerleave', () => { this.cursor = null; this.dirty = true; });
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = this.canvas.getBoundingClientRect();
      const f = Math.pow(1.0018, -e.deltaY);
      this.zoomBy(f, e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
  }

  // --------------------------------------------------------------- view
  fitZoom() {
    const r = this.canvas.getBoundingClientRect();
    return Math.min(r.width / this.SX, r.height / this.SZ) * 0.95;
  }

  zoomBy(f, sx, sy) {
    const r = this.canvas.getBoundingClientRect();
    if (sx == null) { sx = r.width / 2; sy = r.height / 2; }
    const v = this.view;
    const wx = v.cx + (sx - r.width / 2) / v.zoom;
    const wz = v.cz + (sy - r.height / 2) / v.zoom;
    v.zoom = clamp(v.zoom * f, this.fitZoom() * 0.8, 8);
    v.cx = wx - (sx - r.width / 2) / v.zoom;
    v.cz = wz - (sy - r.height / 2) / v.zoom;
    this.clampView();
    this.dirty = true;
  }

  centre() {
    const p = this.game.player;
    if (!p) return;
    this.view.cx = p.x;
    this.view.cz = p.z;
    if (this.view.zoom < 1.2) this.view.zoom = 1.6;
    this.clampView();
    this.dirty = true;
  }

  clampView() {
    const v = this.view;
    v.cx = clamp(v.cx, 0, this.SX);
    v.cz = clamp(v.cz, 0, this.SZ);
  }

  // --------------------------------------------------------------- lifecycle
  onShow() {
    this.resize();
    if (!this.view.zoom) {
      this.view.zoom = Math.max(this.fitZoom(), 1.1);
      this.centre();
      if (this.view.zoom > 1.6) this.view.zoom = 1.6;
    }
    this.buildFog();
    this.dirty = true;
    this.draw();
    if (document.fonts && !this._fontsHooked) {
      this._fontsHooked = true;
      document.fonts.ready.then(() => { this.dirty = true; });
    }
  }
  onHide() { this.drag = null; }
  refresh() { this.buildFog(); this.dirty = true; }
  onResize() { if (this.el.isConnected) { this.resize(); this.dirty = true; } }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(r.width * dpr));
    const hh = Math.max(1, Math.round(r.height * dpr));
    if (this.canvas.width !== w || this.canvas.height !== hh) {
      this.canvas.width = w;
      this.canvas.height = hh;
    }
    this.dpr = dpr;
  }

  buildFog() {
    const exp = this.game.mapExplored;
    const n = Math.round(this.SX / CELL);
    const m = Math.round(this.SZ / CELL);
    if (!this.fog || this.fog.width !== n) {
      this.fog = document.createElement('canvas');
      this.fog.width = n;
      this.fog.height = m;
      this.fogImg = this.fog.getContext('2d').createImageData(n, m);
    }
    const d = this.fogImg.data;
    for (let i = 0; i < n * m; i++) {
      const e = exp ? exp[i] : 0;
      const x = i % n, z = (i / n) | 0;
      const noise = ((x * 73856093) ^ (z * 19349663)) & 15;
      d[i * 4] = 12 + noise * 0.4;
      d[i * 4 + 1] = 11 + noise * 0.35;
      d[i * 4 + 2] = 10 + noise * 0.3;
      d[i * 4 + 3] = e ? 0 : 246;
    }
    this.fog.getContext('2d').putImageData(this.fogImg, 0, 0);
    this.fogT = 1;
  }

  update(dt) {
    this.fogT -= dt;
    if (this.fogT <= 0) this.buildFog();
    this.drawT -= dt;
    if (this.drawT <= 0 || this.dirty) {
      this.drawT = 1 / 20;
      this.draw();
    }
  }

  // --------------------------------------------------------------- drawing
  w2s(x, z) {
    const v = this.view;
    const W = this.canvas.width / this.dpr, H = this.canvas.height / this.dpr;
    return { x: (x - v.cx) * v.zoom + W / 2, y: (z - v.cz) * v.zoom + H / 2 };
  }

  draw() {
    this.dirty = false;
    const g = this.ctx;
    const dpr = this.dpr || 1;
    const W = this.canvas.width / dpr, H = this.canvas.height / dpr;
    if (W < 2 || H < 2) return;
    const v = this.view;
    const t = performance.now() / 1000;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#0b0a09';
    g.fillRect(0, 0, W, H);

    const o = this.w2s(0, 0);
    const mw = this.SX * v.zoom, mh = this.SZ * v.zoom;
    let map = null;
    try { map = this.game.getMapCanvas?.(); } catch (e) { console.warn('getMapCanvas failed', e); }
    if (map) {
      g.imageSmoothingEnabled = v.zoom < 1;
      g.drawImage(map, 0, 0, map.width, map.height, o.x, o.y, mw, mh);
    } else {
      g.fillStyle = '#26241f';
      g.fillRect(o.x, o.y, mw, mh);
    }
    // subtle paper tint
    g.fillStyle = 'rgba(40, 28, 12, 0.12)';
    g.fillRect(o.x, o.y, mw, mh);

    // grid
    g.lineWidth = 1;
    g.strokeStyle = 'rgba(255,240,210,0.10)';
    g.beginPath();
    for (let x = 0; x <= this.SX; x += GRID) {
      const s = this.w2s(x, 0);
      g.moveTo(Math.round(s.x) + 0.5, o.y); g.lineTo(Math.round(s.x) + 0.5, o.y + mh);
    }
    for (let z = 0; z <= this.SZ; z += GRID) {
      const s = this.w2s(0, z);
      g.moveTo(o.x, Math.round(s.y) + 0.5); g.lineTo(o.x + mw, Math.round(s.y) + 0.5);
    }
    g.stroke();

    // fog
    const revealed = !!this.game.mapRevealed;
    if (!revealed && this.fog) {
      g.imageSmoothingEnabled = true;
      g.drawImage(this.fog, o.x, o.y, mw, mh);
    }
    // border
    g.strokeStyle = 'rgba(0,0,0,0.9)';
    g.lineWidth = 3;
    g.strokeRect(o.x - 1.5, o.y - 1.5, mw + 3, mh + 3);
    g.strokeStyle = 'rgba(200,180,140,0.35)';
    g.lineWidth = 1;
    g.strokeRect(o.x - 4.5, o.y - 4.5, mw + 9, mh + 9);

    // grid labels
    g.font = '13px Silkscreen, monospace';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = 'rgba(230,215,185,0.55)';
    for (let i = 0; i < this.SX / GRID; i++) {
      const s = this.w2s((i + 0.5) * GRID, 0);
      const y = clamp(o.y - 14, 10, H - 10);
      g.fillText(String.fromCharCode(65 + i), s.x, y);
    }
    for (let i = 0; i < this.SZ / GRID; i++) {
      const s = this.w2s(0, (i + 0.5) * GRID);
      const x = clamp(o.x - 16, 12, W - 12);
      g.fillText(String(i + 1), x, s.y);
    }

    // POIs
    let pois = [];
    try { pois = this.game.getPOIs?.() || []; } catch (e) { console.warn('getPOIs failed', e); }
    const placed = [];
    const ordered = pois.filter((p) => revealed || p.discovered)
      .map((p) => ({ ...p, big: /town|city|village|area|district/i.test(p.type || '') }))
      .sort((a, b) => (b.big - a.big));
    for (const p of ordered) {
      const s = this.w2s(p.x, p.z);
      if (s.x < -100 || s.y < -40 || s.x > W + 100 || s.y > H + 40) continue;
      const big = p.big;
      const size = big ? Math.round(clamp(14 + v.zoom * 3, 15, 22)) : Math.round(clamp(9 + v.zoom * 2.5, 11, 17));
      if (!big && v.zoom < 0.75) continue;
      g.font = big ? `${size}px Silkscreen, monospace` : `${Math.round(size * 1.25)}px VT323, monospace`;
      const label = big ? p.name.toUpperCase() : p.name;
      const tw = g.measureText(label).width;
      const ly = big ? s.y : s.y - 12;
      const rect = { x0: s.x - tw / 2 - 4, x1: s.x + tw / 2 + 4, y0: ly - size / 2 - 2, y1: ly + size / 2 + 2 };
      const overlap = placed.some((q) => rect.x0 < q.x1 && rect.x1 > q.x0 && rect.y0 < q.y1 && rect.y1 > q.y0);
      if (!big) {
        g.fillStyle = '#1a1612';
        g.fillRect(Math.round(s.x) - 4, Math.round(s.y) - 4, 8, 8);
        g.fillStyle = poiColor(p.type);
        g.fillRect(Math.round(s.x) - 3, Math.round(s.y) - 3, 6, 6);
      }
      if (overlap) continue;
      placed.push(rect);
      g.lineJoin = 'round';
      g.lineWidth = big ? 4 : 3.5;
      g.strokeStyle = 'rgba(8,7,6,0.92)';
      g.strokeText(label, s.x, ly);
      g.fillStyle = big ? 'rgba(236,226,204,0.92)' : '#e8dcc0';
      g.fillText(label, s.x, ly);
    }

    // markers
    for (const m of this.game.markers || []) {
      const s = this.w2s(m.x, m.z);
      const pulse = (t * 1.2) % 1;
      g.strokeStyle = `rgba(220,60,40,${(1 - pulse) * 0.9})`;
      g.lineWidth = 2;
      g.beginPath();
      g.arc(s.x, s.y, 6 + pulse * 16, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = '#120e0b';
      g.beginPath(); g.moveTo(s.x, s.y - 8); g.lineTo(s.x + 8, s.y); g.lineTo(s.x, s.y + 8); g.lineTo(s.x - 8, s.y); g.closePath(); g.fill();
      g.fillStyle = m.type === 'airdrop' ? '#e2492f' : '#e0a83a';
      g.beginPath(); g.moveTo(s.x, s.y - 5.5); g.lineTo(s.x + 5.5, s.y); g.lineTo(s.x, s.y + 5.5); g.lineTo(s.x - 5.5, s.y); g.closePath(); g.fill();
      if (m.label) {
        g.font = '17px VT323, monospace';
        g.lineWidth = 3.5;
        g.strokeStyle = 'rgba(8,7,6,0.92)';
        g.strokeText(m.label, s.x, s.y + 18);
        g.fillStyle = '#f0b090';
        g.fillText(m.label, s.x, s.y + 18);
      }
    }

    // player
    const p = this.game.player;
    if (p) {
      const s = this.w2s(p.x, p.z);
      const b = (bearingFromYaw(p.yaw || 0) * Math.PI) / 180;
      const pulse = (t * 0.8) % 1;
      g.strokeStyle = `rgba(255,240,200,${(1 - pulse) * 0.5})`;
      g.lineWidth = 1.5;
      g.beginPath(); g.arc(s.x, s.y, 8 + pulse * 18, 0, Math.PI * 2); g.stroke();
      // view cone
      g.save();
      g.translate(s.x, s.y);
      g.rotate(b);
      const grad = g.createRadialGradient(0, 0, 2, 0, 0, 46);
      grad.addColorStop(0, 'rgba(255,236,180,0.32)');
      grad.addColorStop(1, 'rgba(255,236,180,0)');
      g.fillStyle = grad;
      g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, 46, -Math.PI / 2 - 0.5, -Math.PI / 2 + 0.5); g.closePath(); g.fill();
      g.fillStyle = '#0d0b09';
      g.beginPath(); g.moveTo(0, -12); g.lineTo(9, 9); g.lineTo(0, 4); g.lineTo(-9, 9); g.closePath(); g.fill();
      g.fillStyle = '#f4e9cf';
      g.beginPath(); g.moveTo(0, -9); g.lineTo(6.5, 6.5); g.lineTo(0, 2.5); g.lineTo(-6.5, 6.5); g.closePath(); g.fill();
      g.restore();
    }

    // vignette
    const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.72);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    g.fillStyle = vg;
    g.fillRect(0, 0, W, H);

    // cursor readout
    if (this.cursor) {
      const wx = v.cx + (this.cursor.x - W / 2) / v.zoom;
      const wz = v.cz + (this.cursor.y - H / 2) / v.zoom;
      if (wx >= 0 && wz >= 0 && wx < this.SX && wz < this.SZ) {
        const grid = String.fromCharCode(65 + Math.floor(wx / GRID)) + (Math.floor(wz / GRID) + 1);
        setText(this.coords, `${grid} · ${Math.floor(wx)}, ${Math.floor(wz)}`);
      } else setText(this.coords, '');
    } else if (p) {
      const grid = String.fromCharCode(65 + clamp(Math.floor(p.x / GRID), 0, 25)) + (Math.floor(p.z / GRID) + 1);
      setText(this.coords, `You: ${grid} · ${Math.floor(p.x)}, ${Math.floor(p.z)}`);
    }
    setText(this.revealNote, revealed ? '' : 'Find a town map to reveal the county');
  }
}

function poiColor(type) {
  const t = String(type || '');
  if (/hospital|clinic|pharmacy|medical/i.test(t)) return '#e05a4a';
  if (/police|military|army|gun/i.test(t)) return '#6a9ad6';
  if (/store|shop|market|gas|diner|bar|motel|commercial/i.test(t)) return '#e0b04a';
  if (/farm|camp|forest|park|cabin|ranger/i.test(t)) return '#7ab85a';
  if (/school|church|library|fire/i.test(t)) return '#c890e0';
  return '#d8ccb0';
}

