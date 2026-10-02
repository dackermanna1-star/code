// Blood that stays: splatters on walls and solid faces, strips and pools on
// floors, smears where bodies slid. Painted once into world-space tiles that
// are only allocated where blood actually lands, then blitted each frame.
// Visual only: the simulation never reads any of this.

import { RNG } from '../core/rng.js';

const TILE = 256; // world units per tile
const MAX_TILES = 180;
const TAU = Math.PI * 2;

export const BLOOD = ['rgba(150,8,18,0.92)', 'rgba(118,6,14,0.94)', 'rgba(178,16,26,0.9)'];
const POOL = 'rgb(104,4,12)';
const POOL_EDGE = 'rgb(128,8,16)';

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  return null;
}

export class Gore {
  constructor() {
    this.rng = new RNG(0xb100d);
    this.tiles = new Map();
    this.scale = 1;
    this.sim = null;
    this.enabled = true;
  }

  reset(sim, settings) {
    this.tiles.clear();
    this.sim = sim;
    const q = settings ? settings.quality : 'high';
    this.scale = q === 'low' ? 0.7 : q === 'medium' ? 1 : 1.5;
    this.level = settings ? settings.gore : 2;
  }

  // ------------------------------------------------------------ tiles
  tile(tx, ty, create) {
    const key = (tx + 2048) * 4096 + (ty + 2048);
    let t = this.tiles.get(key);
    if (!t && create) {
      if (this.tiles.size >= MAX_TILES) return null;
      const px = Math.ceil(TILE * this.scale);
      const c = makeCanvas(px, px);
      if (!c) return null;
      t = { tx, ty, c, ctx: c.getContext('2d') };
      t.ctx.lineCap = 'round';
      this.tiles.set(key, t);
    }
    return t;
  }

  // Run draw(ctx) in world coordinates on every tile the box touches.
  paint(x0, y0, x1, y1, draw) {
    const s = this.scale;
    const tx0 = Math.floor(x0 / TILE);
    const tx1 = Math.floor(x1 / TILE);
    const ty0 = Math.floor(y0 / TILE);
    const ty1 = Math.floor(y1 / TILE);
    for (let tx = tx0; tx <= tx1; tx++) {
      for (let ty = ty0; ty <= ty1; ty++) {
        const t = this.tile(tx, ty, true);
        if (!t) continue;
        t.ctx.setTransform(s, 0, 0, s, -tx * TILE * s, -ty * TILE * s);
        draw(t.ctx);
      }
    }
  }

  draw(ctx, view) {
    if (!this.tiles.size) return;
    const tx0 = Math.floor(view.x0 / TILE);
    const tx1 = Math.floor(view.x1 / TILE);
    const ty0 = Math.floor(view.y0 / TILE);
    const ty1 = Math.floor(view.y1 / TILE);
    for (let tx = tx0; tx <= tx1; tx++) {
      for (let ty = ty0; ty <= ty1; ty++) {
        const t = this.tile(tx, ty, false);
        if (t) ctx.drawImage(t.c, tx * TILE, ty * TILE, TILE, TILE);
      }
    }
  }

  // ------------------------------------------------------------ queries
  // Is there something behind (x, y) for blood to stick to: the interior
  // back wall indoors, or the face of a solid anywhere.
  wallAt(x, y) {
    const L = this.sim.level;
    if (!L.outdoor && x > 0 && x < L.width && y < -2 && y > L.bounds.top + 30) return true;
    return !!L.isSolidAt(x, y);
  }

  // ------------------------------------------------------------ marks
  // Radial splash on a wall, thrown in direction (dx, dy). Geometry is
  // rolled once so every tile the splash straddles paints the same shapes.
  wall(x, y, dx, dy, size) {
    if (!this.sim || !this.wallAt(x, y)) return false;
    const r = this.rng;
    const l = Math.hypot(dx, dy) || 1;
    const ang = Math.atan2(dy / l, dx / l);
    const reach = size * 3;
    const col = BLOOD[r.int(0, 2)];
    const blobs = [[x, y, size * r.range(0.5, 0.75), size * r.range(0.4, 0.6), ang]];
    const n = Math.round(4 + size * 1.2);
    for (let i = 0; i < n; i++) {
      const d = r.range(0.4, 1) * reach;
      const a = ang + r.range(-0.7, 0.7);
      const sz = Math.max(0.6, size * 0.28 * (1 - d / reach) + r.range(0.3, 1.2));
      blobs.push([x + Math.cos(a) * d, y + Math.sin(a) * d, sz * 1.6, sz, a]);
    }
    const lines = [];
    for (let i = 0; i < 2; i++) {
      const a = ang + r.range(-0.35, 0.35);
      const d0 = size * 0.6;
      const d1 = reach * r.range(0.6, 1.1);
      lines.push([x + Math.cos(a) * d0, y + Math.sin(a) * d0, x + Math.cos(a) * d1, y + Math.sin(a) * d1, r.range(0.8, 1.8)]);
    }
    const runs = size > 5 ? r.int(1, 3) : r.chance(0.3) ? 1 : 0;
    let low = y + reach;
    for (let i = 0; i < runs; i++) {
      const ox = x + r.range(-size * 0.5, size * 0.5);
      const len = size * 6 * r.range(0.3, 1);
      const w = r.range(1.2, 2.2);
      lines.push([ox, y, ox, y + len, w]);
      blobs.push([ox, y + len, w * 0.9, w * 0.9, 0]);
      low = Math.max(low, y + len + 3);
    }
    this.paint(x - reach - 4, y - reach - 4, x + reach + 4, low, (ctx) => {
      ctx.fillStyle = col;
      ctx.strokeStyle = col;
      ctx.beginPath();
      for (const [bx, by, rx, ry, a] of blobs) {
        ctx.moveTo(bx + rx, by);
        ctx.ellipse(bx, by, rx, ry, a, 0, TAU);
      }
      ctx.fill();
      for (const [x0, y0, x1, y1, w] of lines) {
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }
    });
    return true;
  }

  // A single droplet hitting a wall: a small streak along its flight.
  drop(x, y, dx, dy, size) {
    if (!this.sim || !this.wallAt(x, y)) return false;
    const r = this.rng;
    const ang = Math.atan2(dy, dx);
    const col = BLOOD[r.int(0, 2)];
    const len = size * r.range(1.2, 2.4);
    const sat = r.chance(0.35) ? [x + Math.cos(ang) * len * 2.2, y + Math.sin(ang) * len * 2.2, size * 0.45] : null;
    const run = size > 1.8 && r.chance(0.12) ? r.range(4, 12) : 0;
    const m = len * 3 + 4;
    this.paint(x - m, y - m, x + m, y + m + run, (ctx) => {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.ellipse(x, y, len, size * 0.6, ang, 0, TAU);
      if (sat) {
        ctx.moveTo(sat[0] + sat[2], sat[1]);
        ctx.arc(sat[0], sat[1], sat[2], 0, TAU);
      }
      ctx.fill();
      if (run) {
        ctx.strokeStyle = col;
        ctx.lineWidth = size * 0.5;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + run);
        ctx.stroke();
      }
    });
    return true;
  }

  // A strip of blood on the floor line at (x, y = floor top).
  floor(x, y, size) {
    if (!this.sim) return;
    const r = this.rng;
    const w = size * 1.8;
    const col = BLOOD[r.int(0, 2)];
    const blobs = [[x, y + 0.5, w * r.range(0.7, 1.1), Math.min(3.4, 1.2 + size * 0.25)]];
    const n = r.int(1, 4);
    for (let i = 0; i < n; i++) blobs.push([x + r.range(-w * 1.6, w * 1.6), y + 0.5, r.range(0.8, 2.6), r.range(0.6, 1.2)]);
    let drip = null;
    if (size > 3 && r.chance(0.5)) drip = [x + r.range(-w * 0.6, w * 0.6), r.range(3, 11), r.range(1, 1.8)];
    this.paint(x - w * 1.7 - 3, y - 6, x + w * 1.7 + 3, y + 14, (ctx) => {
      ctx.fillStyle = col;
      ctx.beginPath();
      for (const [bx, by, rx, ry] of blobs) {
        ctx.moveTo(bx + rx, by);
        ctx.ellipse(bx, by, rx, ry, 0, 0, TAU);
      }
      ctx.fill();
      if (drip) {
        ctx.strokeStyle = col;
        ctx.lineWidth = drip[2];
        ctx.beginPath();
        ctx.moveTo(drip[0], y);
        ctx.lineTo(drip[0], y + drip[1]);
        ctx.stroke();
      }
    });
  }

  // Pools grow by repainting a slightly larger opaque ellipse.
  pool(x, y, rx) {
    if (!this.sim) return;
    this.paint(x - rx - 2, y - 5, x + rx + 2, y + 6, (ctx) => {
      ctx.fillStyle = POOL_EDGE;
      ctx.beginPath();
      ctx.ellipse(x, y + 0.6, rx + 1.2, 3.2, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = POOL;
      ctx.beginPath();
      ctx.ellipse(x, y + 0.6, rx, 2.4, 0, 0, TAU);
      ctx.fill();
    });
  }

  // A dragged streak along the floor between x0 and x1.
  smear(x0, x1, y, k) {
    if (!this.sim) return;
    const a = Math.min(x0, x1);
    const b = Math.max(x0, x1);
    if (b - a < 1) return;
    this.paint(a - 2, y - 4, b + 2, y + 4, (ctx) => {
      ctx.strokeStyle = `rgba(120,6,14,${0.35 + 0.4 * Math.min(1, k)})`;
      ctx.lineWidth = 1.5 + 2 * Math.min(1, k);
      ctx.beginPath();
      ctx.moveTo(a, y + 0.6);
      ctx.lineTo(b, y + 0.6);
      ctx.stroke();
    });
  }
}
