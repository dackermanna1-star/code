// The map of South Karevia (M): drawn once from the land itself - hills
// shaded, contour lines, forests, fields, water, every road and building -
// with the names of the places, a lettered grid, and you on it. Drag to pan,
// wheel to zoom.
import { O } from '../state.js';
import { N, CELL } from '../world/terrain.js';
import { HALF, PLACES, POIS } from '../world/layout.js';

const PX = 2; // map pixels per terrain sample
export class MapUI {
  constructor(root) {
    this.el = document.createElement('div');
    this.el.className = 'ob-screen ob-map hide';
    this.el.innerHTML = '<canvas></canvas><div class="title">South Karevia</div><div class="legend ob-panel"></div>';
    root.appendChild(this.el);
    this.cv = this.el.querySelector('canvas');
    this.zoom = 1.1; this.cx = 0; this.cz = 0;
    this.el.addEventListener('wheel', (e) => { e.preventDefault(); const k = e.deltaY > 0 ? 0.85 : 1.18; this.zoom = Math.max(0.45, Math.min(4, this.zoom * k)); this.draw(); }, { passive: false });
    let drag = null;
    this.el.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, cx: this.cx, cz: this.cz }; });
    window.addEventListener('pointermove', (e) => { if (!drag || !this.isOpen) return; const s = this._scale(); this.cx = drag.cx - (e.clientX - drag.x) / s; this.cz = drag.cz - (e.clientY - drag.y) / s; this.draw(); });
    window.addEventListener('pointerup', () => { drag = null; });
    this.el.querySelector('.legend').innerHTML = [
      ['#c8402a', 'Highway'], ['#e8b030', 'Road'], ['#8a6a4a', 'Dirt road'], ['#3a3a36', 'Buildings'], ['#4a6a3a', 'Forest'],
    ].map(([c, t]) => `<div><span style="display:inline-block;width:18px;height:4px;background:${c};vertical-align:middle;margin-right:8px"></span>${t}</div>`).join('') + '<div style="margin-top:6px;color:#8a867c">Drag to move · Wheel to zoom · M to close</div>';
  }
  get isOpen() { return !this.el.classList.contains('hide'); }
  open() { this.el.classList.remove('hide'); if (!this.img) this._render(); this.cx = O.player.pos.x; this.cz = O.player.pos.z; this.draw(); }
  /** Keep the map on the screen: no empty space past its edges (or centred, when it's smaller than the screen). */
  _clamp() {
    const s = this._scale() / PX * CELL, W = innerWidth, H = innerHeight, S = this.S;
    const half = (v) => v / s / PX * CELL / 2; // screen px -> studs
    for (const [k, span] of [['cx', W], ['cz', H]]) {
      const h = half(span), lim = S / PX * CELL / 2;
      this[k] = h >= lim ? 0 : Math.max(-lim + h, Math.min(lim - h, this[k]));
    }
  }
  close() { this.el.classList.add('hide'); }
  _scale() { return this.zoom * PX / CELL * (innerHeight / 1000) * 1.6; }

  /** Paint the whole map once. */
  _render() {
    const T = O.terrain, S = (N - 1) * PX;
    const c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d');
    const img = g.createImageData(S, S), d = img.data;
    for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
      const i = Math.min(N - 2, Math.floor(px / PX)), j = Math.min(N - 2, Math.floor(py / PX)), k = j * N + i;
      const h = T.h[k];
      let r, gg, b;
      const water = T.water[k] > -1e8 && T.water[k] > h;
      if (water) { const dep = Math.min(1, (T.water[k] - h) / 25); r = 120 - dep * 50; gg = 160 - dep * 50; b = 190 - dep * 30; }
      else {
        // land by height: green lowland, ochre hills, grey rock
        const t = Math.min(1, h / 420);
        r = 168 + t * 40; gg = 182 - t * 20; b = 128 + t * 30;
        const f = T.forest[k]; r -= f * 60; gg -= f * 30; b -= f * 50;
        const fi = T.field[k]; if (fi > 0.5) { r += 25; gg += 18; b -= 10; }
        if (T.coast[k] < 40) { r = 222; gg = 208; b = 168; }
        if (T.town[k] > 0.4) { r -= 8; gg -= 8; b -= 4; }
        // hillshade from the north-west
        const hx = T.h[Math.min(N * N - 1, k + 1)] - T.h[Math.max(0, k - 1)], hz = T.h[Math.min(N * N - 1, k + N)] - T.h[Math.max(0, k - N)];
        const sh = Math.max(0.55, Math.min(1.25, 1 - hx * 0.02 - hz * 0.02));
        r *= sh; gg *= sh; b *= sh;
      }
      const o = (py * S + px) * 4; d[o] = r; d[o + 1] = gg; d[o + 2] = b; d[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const toPx = (x) => (x + HALF) / CELL * PX;
    // contours every 40 studs
    g.fillStyle = 'rgba(90,70,40,0.22)';
    for (let j = 0; j < N - 1; j++) for (let i = 0; i < N - 1; i++) {
      const k = j * N + i, h0 = T.h[k];
      if (h0 < 2) continue;
      const c0 = Math.floor(h0 / 40);
      if (c0 !== Math.floor(T.h[k + 1] / 40) || c0 !== Math.floor(T.h[k + N] / 40)) g.fillRect(i * PX, j * PX, PX * 0.9, PX * 0.9);
    }
    // roads
    const roadCol = { highway: ['#c8402a', 3.2], road: ['#e8b030', 2.6], street: ['#f0ece0', 1.6], base: ['#d8d4c8', 1.8], dirt: ['#8a6a4a', 1.8], lane: ['#9a7a5a', 1.4], track: ['#9a7a5a', 1.2] };
    for (const pass of [0, 1]) for (const rd of T.roads) {
      const [col, w] = roadCol[rd.type] || ['#888', 1];
      g.strokeStyle = pass ? col : 'rgba(30,20,10,0.5)'; g.lineWidth = pass ? w : w + 1.6;
      if (rd.type === 'dirt' || rd.type === 'track' || rd.type === 'lane') g.setLineDash(pass ? [4, 3] : []); else g.setLineDash([]);
      g.beginPath();
      rd.pts.forEach((p, k) => (k ? g.lineTo(toPx(p.x), toPx(p.z)) : g.moveTo(toPx(p.x), toPx(p.z))));
      g.stroke();
    }
    g.setLineDash([]);
    // buildings
    g.fillStyle = '#3a3a36';
    for (const s of O.plan.sites) {
      g.save(); g.translate(toPx(s.x), toPx(s.z)); g.rotate(-s.yaw);
      const w = s.w / CELL * PX, h = s.d / CELL * PX;
      g.fillRect(-w / 2, -h / 2, w, h);
      g.restore();
    }
    // the grid
    const sq = S / 12;
    g.strokeStyle = 'rgba(40,40,40,0.25)'; g.lineWidth = 1;
    g.font = '600 13px Arial'; g.fillStyle = 'rgba(40,40,40,0.55)';
    for (let i = 0; i <= 12; i++) { g.beginPath(); g.moveTo(i * sq, 0); g.lineTo(i * sq, S); g.stroke(); g.beginPath(); g.moveTo(0, i * sq); g.lineTo(S, i * sq); g.stroke(); }
    for (let i = 0; i < 12; i++) { g.fillText(String.fromCharCode(65 + i), i * sq + 6, 16); g.fillText(String(i + 1), 4, i * sq + 30); }
    // names
    g.textAlign = 'center';
    for (const p of PLACES) {
      const big = p.kind === 'city' ? 28 : p.kind === 'town' ? 21 : 15;
      g.font = `${p.kind === 'city' ? 700 : 600} ${big}px Georgia, serif`;
      g.lineWidth = 4; g.strokeStyle = 'rgba(240,236,224,0.85)'; g.strokeText(p.name, toPx(p.x), toPx(p.z) - 8);
      g.fillStyle = p.kind === 'military' || p.kind === 'airfield' ? '#7a2a20' : '#1e1e1a'; g.fillText(p.name, toPx(p.x), toPx(p.z) - 8);
    }
    g.font = 'italic 600 12px Georgia, serif';
    for (const q of POIS) {
      if (q.kind === 'gas' || q.kind === 'farm') continue;
      const name = q.kind === 'camp' ? 'Camp' : q.name;
      g.lineWidth = 3; g.strokeStyle = 'rgba(240,236,224,0.8)'; g.strokeText(name, toPx(q.x), toPx(q.z) + 18);
      g.fillStyle = q.kind === 'camp' ? '#7a2a20' : '#2a2a26'; g.fillText(name, toPx(q.x), toPx(q.z) + 18);
      g.beginPath(); g.arc(toPx(q.x), toPx(q.z), 4, 0, 7); g.fill();
    }
    this.img = c; this.S = S;
  }

  draw() {
    if (!this.isOpen || !this.img) return;
    const cv = this.cv, W = innerWidth, H = innerHeight;
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    const g = cv.getContext('2d');
    this._clamp();
    g.fillStyle = '#0a0c0b'; g.fillRect(0, 0, W, H);
    const s = this._scale() / PX * CELL; // screen px per map px
    const mx = (this.cx + HALF) / CELL * PX, mz = (this.cz + HALF) / CELL * PX;
    g.save();
    g.translate(W / 2, H / 2); g.scale(s, s); g.translate(-mx, -mz);
    g.imageSmoothingEnabled = true;
    g.drawImage(this.img, 0, 0);
    g.restore();
    // you
    const P = O.player;
    const px = W / 2 + ((P.pos.x + HALF) / CELL * PX - mx) * s, pz = H / 2 + ((P.pos.z + HALF) / CELL * PX - mz) * s;
    g.save(); g.translate(px, pz); g.rotate(-P.yaw);
    g.fillStyle = '#e0483a'; g.strokeStyle = '#fff'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, -14); g.lineTo(9, 10); g.lineTo(0, 5); g.lineTo(-9, 10); g.closePath(); g.fill(); g.stroke();
    g.restore();
    // where your old body lies
    for (const b of O.bodies.list) if (b.player) { const bx = W / 2 + ((b.x + HALF) / CELL * PX - mx) * s, bz = H / 2 + ((b.z + HALF) / CELL * PX - mz) * s; g.fillStyle = '#e8c070'; g.font = '700 16px Arial'; g.textAlign = 'center'; g.fillText('✖', bx, bz + 6); }
    // scale bar: 300 m
    const m300 = 300 / 0.33 / CELL * PX * s;
    g.fillStyle = '#e9e5db'; g.fillRect(W - 40 - m300, H - 40, m300, 3);
    g.font = '13px Arial'; g.textAlign = 'right'; g.fillText('300 m', W - 40, H - 48);
  }
}
