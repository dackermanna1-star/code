// Wall composition: simulates years of graffiti accumulation in eras.
// Each era is painted onto a transparent era layer (color + props), aged by its
// age in years (fade, chalking, erosion, grime) and composited over older eras.

import { Rng } from '../core/rng.js';
import { createCanvas, get2d } from '../core/canvas.js';
import { noise1 } from '../core/noise.js';
import { PAINT, pickTagColor, jitter, mix } from '../core/color.js';
import { Painter } from '../paint/painter.js';
import { buildFields, Accumulator } from './aging.js';
import { getWriterPool, pickLocalWriters, pickWriter } from './writers.js';
import { renderTag } from '../elements/tag.js';
import { renderThrowup } from '../elements/throwup.js';
import { renderPiece } from '../elements/piece.js';
import { renderRoller, renderExtinguisher } from '../elements/roller.js';
import { buffColor, shadeVariant, renderRollerBuff, renderPaintOut, renderSprayBuff, blockColor } from '../elements/buff.js';
import { renderStickerCluster, renderSticker } from '../elements/sticker.js';
import { renderPosterGroup } from '../elements/poster.js';
import { renderScribble } from '../elements/scribble.js';
import { renderGhostSign } from '../elements/ghostsign.js';

const CELL = 0.2;
const FORBID = new Set(['window', 'glass', 'vent', 'meter']);
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export const DEFAULT_STYLE = { pieces: 1, throwups: 1, tags: 1, buffs: 1, posters: 0.6, stickers: 1, rollers: 0.6, scribbles: 1, ghostSign: false };

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export function normalizeWallSpec(spec) {
  const S = {
    seed: spec.seed ?? 1,
    widthM: Math.max(0.5, spec.widthM ?? 8),
    heightM: Math.max(0.5, spec.heightM ?? 4),
    ppm: Math.max(4, spec.pxPerMeter ?? 48),
    wallTone: (spec.wallTone || [150, 112, 84]).slice(0, 3),
    density: clamp01(spec.density ?? 0.7),
    bands: spec.bands && spec.bands.length ? spec.bands : null,
    hotspots: spec.hotspots || [],
    holes: spec.holes || [],
    groundLine: spec.groundLine ?? 0,
    ageYears: Math.max(0.5, spec.ageYears ?? 14),
    style: { ...DEFAULT_STYLE, ...(spec.style || {}) },
    poolSeed: spec.poolSeed ?? 'alley',
    edgeMargin: spec.edgeMargin ?? 0.06,
    canvases: spec.canvases !== false,
    periodicX: !!spec.periodicX,
  };
  return S;
}

// piecewise-linear profile helper: pts = [[h, w], ...] sorted by h
function prof(pts, h) {
  if (h <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (h <= pts[i][0]) {
      const [h0, w0] = pts[i - 1], [h1, w1] = pts[i];
      return w0 + ((w1 - w0) * (h - h0)) / (h1 - h0);
    }
  }
  return pts[pts.length - 1][1];
}

const PROFILES = {
  tag: [[0, 0.22], [0.15, 0.35], [0.4, 0.8], [0.8, 1], [2.0, 1], [2.4, 0.62], [3.0, 0.28], [3.6, 0.1], [5, 0.025], [30, 0.012]],
  throw: [[0.25, 0.15], [0.6, 0.85], [0.9, 1], [2.0, 1], [2.6, 0.5], [3.4, 0.14], [5, 0.025], [30, 0.01]],
  piece: [[0.7, 0.05], [1.1, 0.5], [1.4, 1], [2.4, 1], [3.1, 0.45], [4.0, 0.12], [5.5, 0.02], [30, 0.01]],
  roller: [[1.5, 0.01], [3, 0.08], [4.2, 0.4], [6, 1], [30, 1]],
  sticker: [[0.8, 0.06], [1.15, 1], [1.85, 1], [2.25, 0.25], [2.6, 0]],
  poster: [[0.9, 0.05], [1.3, 1], [2.0, 1], [2.5, 0.25], [3.0, 0]],
  scribble: [[0.2, 0.3], [0.6, 1], [1.8, 1], [2.3, 0.35], [2.9, 0.06], [4, 0]],
  buff: [[0, 1], [2.6, 1], [3.3, 0.35], [4.2, 0]],
};
const HOT_AFFINITY = { tag: 1.4, throw: 0.9, piece: 0.25, roller: 1.0, sticker: 0.5, poster: 0.1, scribble: 0.5, buff: 0 };
const DOOR_MUL = { tag: 2.2, throw: 1.3, piece: 0.08, roller: 0.2, sticker: 2.5, poster: 0.4, scribble: 1.8, buff: 1 };

class WallWorld {
  constructor(S, rng) {
    this.S = S;
    this.rng = rng;
    this.gw = Math.max(1, Math.ceil(S.widthM / CELL));
    this.gh = Math.max(1, Math.ceil(S.heightM / CELL));
    const n = this.gw * this.gh;
    this.heat = new Float32Array(n);
    this.version = 0;
    this.eraBig = new Uint8Array(n);
    this.fresh = new Float32Array(n);
    this.items = [];
    // holes -> canvas meter rects
    this.forbid = [];
    this.doors = [];
    for (const hole of S.holes) {
      const r = this.toCanvasRect(hole);
      r.kind = hole.kind;
      if (FORBID.has(hole.kind)) this.forbid.push(r);
      else this.doors.push(r);
    }
    const pool = getWriterPool(S.poolSeed);
    this.local = pickLocalWriters(pool, rng.fork('local'), Math.min(pool.writers.length, Math.round(14 + S.widthM * 0.9)));
    this.buildMaps();
  }

  toCanvasRect(h) {
    // spec y is meters above ground; segment y = y + groundLine; canvas v = heightM - segY
    const yb = h.y + this.S.groundLine;
    return { x0: h.x, x1: h.x + h.w, y0: this.S.heightM - (yb + h.h), y1: this.S.heightM - yb };
  }

  hAG(v) { return this.S.heightM - v - this.S.groundLine; }

  bandMul(hAG) {
    const B = this.S.bands;
    if (!B) return 1;
    let m = -1;
    for (const b of B) if (hAG >= b.y0 && hAG <= b.y1) m = Math.max(m, b.density ?? 1);
    return m < 0 ? 0.03 : m;
  }

  hotspot(u, hAG) {
    let s = 0;
    for (const h of this.S.hotspots) {
      const dx = u - h.x, dy = hAG - h.y;
      s += (h.density ?? 1) * Math.exp(-(dx * dx + dy * dy) / Math.max(0.01, h.r * h.r));
    }
    return s;
  }

  inRects(rects, u, v, m = 0) {
    for (const r of rects) if (u >= r.x0 - m && u <= r.x1 + m && v >= r.y0 - m && v <= r.y1 + m) return r;
    return null;
  }

  buildMaps() {
    const S = this.S;
    const types = Object.keys(PROFILES);
    this.maps = {};
    this.caps = {};
    const seed = this.rng.int(0, 1e6);
    for (const t of types) { this.maps[t] = new Float32Array(this.gw * this.gh); this.caps[t] = 0; }
    for (let j = 0; j < this.gh; j++) {
      const v = (j + 0.5) * CELL;
      const h = this.hAG(v);
      for (let i = 0; i < this.gw; i++) {
        const u = (i + 0.5) * CELL;
        const idx = j * this.gw + i;
        if (h < 0.02 || u < S.edgeMargin || u > S.widthM - S.edgeMargin) continue;
        const band = this.bandMul(h);
        const hs = this.hotspot(u, h);
        const forb = this.inRects(this.forbid, u, v, 0.04);
        const door = this.inRects(this.doors, u, v, 0);
        const nearDoor = !door && this.inRects(this.doors, u, v, 0.7);
        // busy / quiet stretches along the wall
        const busy = 0.3 + 1.4 * noise1(u / 5.5, seed) * (0.6 + 0.4 * noise1(u / 1.7, seed + 5));
        for (const t of types) {
          if (forb) continue;
          let w = prof(PROFILES[t], h) * band * (1 + 2 * hs) + hs * HOT_AFFINITY[t] * (t === 'sticker' && h > 2.6 ? 0 : 1);
          if (t !== 'roller' && t !== 'buff') w *= busy;
          if (door) w *= DOOR_MUL[t];
          else if (nearDoor && (t === 'tag' || t === 'sticker' || t === 'scribble')) w *= 1.5;
          this.maps[t][idx] = w;
          this.caps[t] += w * CELL * CELL;
        }
      }
    }
  }

  /** Sample a position (canvas meters) for type t. cluster: heat attraction. */
  sample(t, rng, cluster = 1, opts = {}) {
    const map = this.maps[t];
    const n = map.length;
    const respect = opts.respect ?? 1;
    const freshK = opts.fresh ?? 0;
    const key = t + '|' + cluster + '|' + respect + '|' + freshK;
    if (!this._cdfs) this._cdfs = new Map();
    let ent = this._cdfs.get(key);
    // rebuild lazily: heat changes a little with every placement
    if (!ent || this.version - ent.version >= 6) {
      const cdf = ent ? ent.cdf : new Float32Array(n);
      const heat = this.heat, eraBig = this.eraBig, fresh = this.fresh;
      let tot = 0;
      for (let i = 0; i < n; i++) {
        let w = map[i];
        if (w > 0) {
          if (cluster) w *= 0.45 + Math.min(2.2, heat[i] * cluster);
          if (eraBig[i]) w *= respect;
          if (freshK) w *= 1 + freshK * fresh[i];
        }
        tot += w;
        cdf[i] = tot;
      }
      ent = { cdf, tot, version: this.version };
      this._cdfs.set(key, ent);
    }
    const cdf = ent.cdf;
    if (ent.tot <= 0) return null;
    const r = rng.next() * ent.tot;
    let lo = 0, hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cdf[mid] < r) lo = mid + 1; else hi = mid;
    }
    const i = lo % this.gw, j = (lo / this.gw) | 0;
    return { u: (i + rng.next()) * CELL, v: (j + rng.next()) * CELL };
  }

  /** Fit a box of size (w, h) centered at (u, v) inside the wall, avoiding forbidden holes. */
  fit(u, v, w, h, allowForbidOverlap = false) {
    const S = this.S;
    const m = S.edgeMargin;
    u = Math.max(m + w / 2, Math.min(S.widthM - m - w / 2, u));
    const vGround = S.heightM - S.groundLine;
    v = Math.max(m + h / 2, Math.min(vGround - 0.03 - h / 2, v));
    if (w + 2 * m > S.widthM || h + 2 * m > Math.min(S.heightM, vGround)) return null;
    const box = { x0: u - w / 2, y0: v - h / 2, x1: u + w / 2, y1: v + h / 2 };
    if (!allowForbidOverlap) {
      for (const r of this.forbid) {
        if (box.x0 < r.x1 + 0.03 && box.x1 > r.x0 - 0.03 && box.y0 < r.y1 + 0.03 && box.y1 > r.y0 - 0.03) return null;
      }
    }
    return { u, v, box };
  }

  addHeat(box, amount, big = false) {
    const gw = this.gw, gh = this.gh;
    this.version += big ? 100 : 1;
    const i0 = Math.max(0, Math.floor(box.x0 / CELL) - 1), i1 = Math.min(gw - 1, Math.floor(box.x1 / CELL) + 1);
    const j0 = Math.max(0, Math.floor(box.y0 / CELL) - 1), j1 = Math.min(gh - 1, Math.floor(box.y1 / CELL) + 1);
    const area = Math.max(1, (i1 - i0 + 1) * (j1 - j0 + 1));
    const a = amount / Math.sqrt(area);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const edge = i === i0 || i === i1 || j === j0 || j === j1;
        this.heat[j * gw + i] += edge ? a * 0.5 : a;
        if (big && !edge) this.eraBig[j * gw + i] = 1;
      }
    }
  }

  markFresh(box, k = 1) {
    const gw = this.gw, gh = this.gh;
    this.version += 100;
    const i0 = Math.max(0, Math.floor(box.x0 / CELL)), i1 = Math.min(gw - 1, Math.floor(box.x1 / CELL));
    const j0 = Math.max(0, Math.floor(box.y0 / CELL)), j1 = Math.min(gh - 1, Math.floor(box.y1 / CELL));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) this.fresh[j * gw + i] = k;
  }

  /** Remove heat under a buffed area (old tags covered -> less attraction, but edges attract). */
  coolHeat(box, k = 0.6) {
    const gw = this.gw, gh = this.gh;
    this.version += 100;
    const i0 = Math.max(0, Math.floor(box.x0 / CELL)), i1 = Math.min(gw - 1, Math.floor(box.x1 / CELL));
    const j0 = Math.max(0, Math.floor(box.y0 / CELL)), j1 = Math.min(gh - 1, Math.floor(box.y1 / CELL));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const idx = j * gw + i;
        const edge = i === i0 || i === i1 || j === j0;
        this.heat[idx] = edge ? this.heat[idx] + 0.4 : this.heat[idx] * (1 - k);
      }
    }
  }
}

function poisson(rng, lambda) {
  if (lambda <= 0) return 0;
  if (lambda > 30) return Math.max(0, Math.round(lambda + rng.gauss() * Math.sqrt(lambda)));
  const L = Math.exp(-lambda);
  let k = 0, p = 1;
  do { k++; p *= rng.next(); } while (p > L);
  return k - 1;
}

function tagSize(rng, hAG) {
  let h = Math.exp(rng.gauss() * 0.38) * 0.19;
  if (hAG > 2.2) h *= 1 + 0.25 * Math.min(4, hAG - 2.2);
  return Math.max(0.06, Math.min(0.6, h));
}

function chooseTagColor(rng, w) {
  const r = rng.next();
  if (r < 0.72) return w.color;
  if (r < 0.86 && w.altColor) return w.altColor;
  return pickTagColor(rng);
}

// ---------------------------------------------------------------------------

function planEras(S, rng) {
  const n = Math.max(2, Math.min(5, Math.round(1.5 + S.ageYears / 4)));
  const eras = [];
  for (let e = 0; e < n; e++) {
    const frac = (e + rng.range(0.25, 0.75)) / n;
    let age = S.ageYears * (1 - frac);
    if (e === n - 1) age = rng.range(0.15, Math.min(1.5, S.ageYears * 0.15));
    eras.push({ index: e, age, intensity: e === n - 1 ? rng.range(0.55, 0.9) : rng.range(0.6, 1.3) });
  }
  return eras;
}

/** Paint one era's elements. Returns counts. */
function paintEra(P, W, era, eraRng, counts) {
  const S = W.S;
  const st = S.style;
  const rng = eraRng;
  W.eraBig.fill(0);
  W.fresh.fill(0);
  W.version += 100;
  const dens = S.density * era.intensity;

  // --- buffs at the start of the era (not in the first era)
  if (era.index > 0 && st.buffs > 0) paintBuffs(P, W, era, rng.fork('buffs'), counts, dens);

  // --- schedule jobs over the era timeline
  const jobs = [];
  const caps = W.caps;
  const add = (type, n, tRange = [0, 1]) => { for (let i = 0; i < n; i++) jobs.push({ type, t: rng.range(tRange[0], tRange[1]) }); };
  add('piece', poisson(rng, caps.piece * 0.0105 * dens * st.pieces * 1.5), [0, 0.6]);
  add('throw', poisson(rng, caps.throw * 0.075 * dens * st.throwups), [0, 1]);
  add('roller', poisson(rng, caps.roller * 0.0035 * dens * st.rollers * (0.6 + era.index * 0.1)), [0, 1]);
  add('tag', Math.round(caps.tag * 0.95 * dens * st.tags * (0.85 + rng.next() * 0.3)), [0, 1]);
  add('sticker', poisson(rng, caps.sticker * 0.16 * dens * st.stickers * (era.index >= 1 ? 1 : 0.5)), [0.1, 1]);
  add('poster', poisson(rng, (S.widthM / 26) * st.posters * dens), [0, 0.8]);
  add('scribble', Math.round(caps.scribble * 0.4 * dens * st.scribbles), [0, 1]);
  add('block', poisson(rng, (S.widthM / 30) * st.buffs * dens * 0.5), [0, 0.3]);
  jobs.sort((a, b) => a.t - b.t);

  let ji = 0;
  for (const job of jobs) {
    const jr = rng.fork(1000 + ji++);
    switch (job.type) {
      case 'tag': doTag(P, W, era, jr, counts); break;
      case 'throw': doThrow(P, W, era, jr, counts); break;
      case 'piece': doPiece(P, W, era, jr, counts); break;
      case 'roller': doRoller(P, W, era, jr, counts); break;
      case 'sticker': doStickers(P, W, era, jr, counts); break;
      case 'poster': doPosters(P, W, era, jr, counts); break;
      case 'scribble': doScribble(P, W, era, jr, counts); break;
      case 'block': doColorBlock(P, W, era, jr, counts); break;
    }
  }
}

function doTag(P, W, era, rng, counts) {
  const pos = W.sample('tag', rng, 1.3, { respect: 0.3, fresh: 1.5 });
  if (!pos) return;
  const writer = pickWriter(W.local, rng);
  const h = tagSize(rng, W.hAG(pos.v));
  const len = writer.name.length + (writer.hand.number ? 1 : 0);
  const estW = Math.min(1.3, len * h * 0.62 + h * 0.3), estH = h * 1.6;
  const f = W.fit(pos.u, pos.v, estW, estH);
  if (!f) return;
  const box = renderTag(P, rng, { writer, h, x: f.u, y: f.v, color: chooseTagColor(rng, writer), maxW: 1.3, lod: era.age > 6 ? 1 : 0 });
  W.addHeat(box, 0.35);
  W.items.push({ type: 'tag', box, era: era.index });
  counts.tags++;
}

function doThrow(P, W, era, rng, counts) {
  const pos = W.sample('throw', rng, 0.6, { respect: 0.15, fresh: 3 });
  if (!pos) return;
  let writer = pickWriter(W.local, rng);
  if (!writer.throw) {
    const alt = W.local.filter((w) => w.throw);
    if (alt.length) writer = rng.pick(alt);
  }
  const h = Math.max(0.4, Math.min(1.4, Math.exp(rng.gauss() * 0.25) * 0.72));
  const n = (writer.throw ? writer.throw.text : writer.name.slice(0, 3)).length;
  const estW = n * h * 0.95 + h * 0.3, estH = h * 1.5;
  const f = W.fit(pos.u, pos.v, estW, estH);
  if (!f) return;
  const box = renderThrowup(P, rng, { writer, h, x: f.u, y: f.v });
  W.addHeat(box, 0.6, true);
  W.items.push({ type: 'throw', box, era: era.index });
  counts.throwups++;
}

function doPiece(P, W, era, rng, counts) {
  for (let tries = 0; tries < 5; tries++) {
    const pos = W.sample('piece', rng, 0, { respect: 0.02, fresh: 6 });
    if (!pos) return;
    const writer = pickWriter(W.local, rng);
    const h = Math.max(0.7, Math.min(1.8, Math.exp(rng.gauss() * 0.2) * 1.15));
    const n = Math.min(6, writer.name.length);
    const estW = Math.min(5, n * h * 0.9 + h * 0.5), estH = h * 1.55;
    const f = W.fit(pos.u, pos.v, estW, estH);
    if (!f) continue;
    // keep pieces of the same era apart
    let clash = false;
    for (const it of W.items) {
      if (it.era !== era.index || (it.type !== 'piece' && it.type !== 'throw')) continue;
      const ox = Math.min(it.box.x1, f.box.x1) - Math.max(it.box.x0, f.box.x0);
      const oy = Math.min(it.box.y1, f.box.y1) - Math.max(it.box.y0, f.box.y0);
      if (ox > 0 && oy > 0 && ox * oy > 0.2 * (f.box.x1 - f.box.x0) * (f.box.y1 - f.box.y0)) { clash = true; break; }
    }
    if (clash) continue;
    const box = renderPiece(P, rng, { writer, h, x: f.u, y: f.v, maxW: estW });
    W.addHeat(box, 0.8, true);
    W.items.push({ type: 'piece', box, era: era.index });
    counts.pieces++;
    return;
  }
}

function doRoller(P, W, era, rng, counts) {
  const pos = W.sample('roller', rng, 0);
  if (!pos) return;
  const writer = pickWriter(W.local, rng);
  const ext = rng.chance(0.4);
  const text = writer.name.slice(0, ext ? 6 : rng.int(3, 5));
  const h = ext ? rng.range(0.6, 1.4) : rng.range(0.9, 2.0);
  const estW = text.length * h * (ext ? 0.75 : 1.05), estH = h * 1.3;
  const f = W.fit(pos.u, pos.v, estW, estH);
  if (!f) return;
  const color = rng.pickW([[PAINT.black, 5], [PAINT.white, 3], [PAINT.silver, 1], [PAINT.maroon, 0.6], [PAINT.blue, 0.4]]);
  const box = ext
    ? renderExtinguisher(P, rng, { text, h, x: f.u, y: f.v, color })
    : renderRoller(P, rng, { text, h, x: f.u, y: f.v, color });
  W.addHeat(box, 0.3);
  W.items.push({ type: 'roller', box, era: era.index });
  counts.rollers++;
}

function doStickers(P, W, era, rng, counts) {
  const pos = W.sample('sticker', rng, 0.8);
  if (!pos) return;
  const n = 1 + Math.round(rng.exp(2.5));
  const f = W.fit(pos.u, pos.v, 0.4, 0.3);
  if (!f) return;
  const slappers = W.local.filter((w) => w.sticker);
  const box = renderStickerCluster(P, rng, { x: f.u, y: f.v, count: n, spread: rng.range(0.05, 0.3), age: era.index < 2 ? 0.3 : 0 }, slappers.length ? slappers : W.local);
  if (box) W.addHeat(box, 0.2);
  counts.stickers += n;
}

function doPosters(P, W, era, rng, counts) {
  const pos = W.sample('poster', rng, 0.2);
  if (!pos) return;
  const size = rng.pickW([[[0.42, 0.594], 4], [[0.297, 0.42], 2], [[0.61, 0.91], 1.5], [[0.28, 0.43], 2]]);
  const cols = rng.int(1, 5), rows = rng.chance(0.3) ? 2 : 1;
  const w = cols * size[0], h = rows * size[1];
  const f = W.fit(pos.u, pos.v, w + 0.1, h + 0.1);
  if (!f) return;
  const box = renderPosterGroup(P, rng, { x: f.box.x0 + 0.05, y: f.box.y0 + 0.05, cols, rows, pw: size[0], ph: size[1], layers: rng.int(1, 3), age: 0.15 });
  if (box) {
    W.addHeat(box, 0.4);
    W.markFresh(box, 0.5);
    W.items.push({ type: 'poster', box, era: era.index });
  }
  counts.posters += cols * rows;
}

function doScribble(P, W, era, rng, counts) {
  const pos = W.sample('scribble', rng, 1.0);
  if (!pos) return;
  const f = W.fit(pos.u, pos.v, 0.3, 0.15);
  if (!f) return;
  const writer = pickWriter(W.local, rng);
  let box;
  if (rng.chance(0.4)) {
    box = renderTag(P, rng, { writer, h: rng.range(0.04, 0.11), x: f.u, y: f.v, tool: 'marker', color: rng.chance(0.6) ? PAINT.black : writer.markerColor });
  } else {
    box = renderScribble(P, rng, { x: f.u, y: f.v, writer });
  }
  if (box) W.addHeat(box, 0.12);
  counts.scribbles++;
}

function doColorBlock(P, W, era, rng, counts) {
  const pos = W.sample('piece', rng, 0.3);
  if (!pos) return;
  const w = rng.range(0.8, 2.6), h = rng.range(1.0, 3.0);
  const f = W.fit(pos.u, pos.v, w, h);
  if (!f) return;
  const color = blockColor(rng);
  const box = rng.chance(0.6)
    ? renderRollerBuff(P, rng, { x0: f.box.x0, x1: f.box.x1, top: f.box.y0, bottom: f.box.y1, color, raggedTop: 0.05, raggedBottom: 0.04 })
    : renderSprayBuff(P, rng, { box: f.box, color, margin: 0.02 });
  W.markFresh(box, 1);
  W.coolHeat(box, 0.5);
  W.items.push({ type: 'block', box, era: era.index });
  counts.buffs++;
}

function paintBuffs(P, W, era, rng, counts, dens) {
  const S = W.S;
  const st = S.style;
  // campaign color family for this era
  const fam = buffColor(S.wallTone, rng);
  const campaigns = poisson(rng, (0.35 + S.widthM / 30) * st.buffs * (0.6 + 0.6 * dens));
  const vGround = S.heightM - S.groundLine;
  for (let c = 0; c < campaigns; c++) {
    // target: hot area within reach
    let best = null, bestHeat = -1;
    for (let k = 0; k < 6; k++) {
      const p = W.sample('buff', rng, 2.5);
      if (!p) break;
      const idx = Math.min(W.gh - 1, (p.v / CELL) | 0) * W.gw + Math.min(W.gw - 1, (p.u / CELL) | 0);
      if (W.heat[idx] > bestHeat) { bestHeat = W.heat[idx]; best = p; }
    }
    if (!best) break;
    const kind = rng.pickW([['band', 2], ['patch', 4], ['stack', 2]]);
    const color = rng.chance(0.75) ? fam.color : buffColor(S.wallTone, rng).color;
    if (kind === 'band') {
      // long band from (near) the ground up to a straight-ish top line
      const w = rng.range(3, Math.min(14, S.widthM));
      const x0 = Math.max(S.edgeMargin, Math.min(S.widthM - S.edgeMargin - w, best.u - w * rng.range(0.2, 0.8)));
      const topH = rng.range(0.9, 2.6);
      const bottom = vGround - rng.range(0, 0.25);
      const box = renderRollerBuff(P, rng, { x0, x1: x0 + w, top: vGround - topH, bottom, color: shadeVariant(color, rng, 0.04), raggedTop: rng.range(0.02, 0.1) });
      W.coolHeat(box, 0.7);
      W.markFresh(box, 1);
      W.items.push({ type: 'buff', box, era: era.index });
      counts.buffs++;
    } else {
      // overlapping rectangles of slightly different shades (patchwork)
      const n = kind === 'stack' ? rng.int(2, 5) : rng.int(1, 3);
      let cx = best.u, cy = best.v;
      for (let i = 0; i < n; i++) {
        const w = rng.range(0.6, 3.2), h = rng.range(0.4, 1.8);
        const x0 = Math.max(S.edgeMargin, Math.min(S.widthM - S.edgeMargin - w, cx - w / 2 + rng.range(-0.6, 0.6)));
        let top = cy - h / 2 + rng.range(-0.4, 0.4);
        let bottom = Math.min(vGround, top + h);
        if (rng.chance(0.3)) bottom = vGround - rng.range(0, 0.1);
        top = Math.max(0.1, top);
        if (bottom - top < 0.25) continue;
        const shade = shadeVariant(color, rng, 0.07);
        const box = rng.chance(0.55)
          ? renderRollerBuff(P, rng, { x0, x1: x0 + w, top, bottom, color: shade, raggedTop: rng.range(0.01, 0.06), raggedBottom: 0.02 })
          : renderPaintOut(P, rng, { x0, x1: x0 + w, top, bottom, color: shade });
        W.coolHeat(box, 0.6);
        W.markFresh(box, 1);
        W.items.push({ type: 'buff', box, era: era.index });
        counts.buffs++;
        cx = (box.x0 + box.x1) / 2 + rng.range(-1, 1) * w * 0.5;
        cy = (box.y0 + box.y1) / 2 + rng.range(-0.5, 0.5);
      }
    }
  }
  // spot buffs over individual older pieces/throw-ups/tags
  const olds = W.items.filter((it) => it.era < era.index && (it.type === 'throw' || it.type === 'tag' || it.type === 'piece'));
  const nSpot = Math.min(olds.length, poisson(rng, (S.widthM / 5) * st.buffs * (0.5 + dens)));
  for (let i = 0; i < nSpot; i++) {
    const it = olds[rng.int(0, olds.length - 1)];
    const c = rng.chance(0.6) ? shadeVariant(fam.color, rng, 0.08) : buffColor(S.wallTone, rng).color;
    let box;
    if (it.type === 'tag' || rng.chance(0.5)) {
      box = renderSprayBuff(P, rng, { box: it.box, color: c });
    } else {
      box = renderPaintOut(P, rng, { x0: it.box.x0 - rng.range(0.03, 0.2), x1: it.box.x1 + rng.range(0.03, 0.2), top: it.box.y0 - rng.range(0.03, 0.2), bottom: it.box.y1 + rng.range(0.03, 0.2), color: c });
    }
    W.coolHeat(box, 0.5);
    W.markFresh(box, 0.7);
    W.items.push({ type: 'buff', box, era: era.index });
    counts.buffs++;
  }
  // doors get repainted now and then
  for (const d of W.doors) {
    if (d.kind === 'door' && rng.chance(0.3 * st.buffs)) {
      const col = rng.pick([[52, 70, 58], [70, 70, 72], [92, 44, 40], [40, 46, 70], [34, 34, 36], [110, 96, 80]]);
      renderPaintOut(P, rng, { x0: d.x0, x1: d.x1, top: d.y0, bottom: Math.min(d.y1, vGround), color: jitter(col, rng, 5) });
      counts.buffs++;
    }
  }
}

// ---------------------------------------------------------------------------

const eraCanvasCache = { W: 0, H: 0, color: null, cctx: null, props: null, pctx: null };

function getEraCanvases(W, H) {
  const c = eraCanvasCache;
  if (c.W !== W || c.H !== H || !c.color) {
    c.W = W; c.H = H;
    c.color = createCanvas(W, H);
    c.cctx = get2d(c.color);
    c.props = createCanvas(Math.ceil(W / 2), Math.ceil(H / 2));
    c.pctx = get2d(c.props);
  }
  c.cctx.setTransform(1, 0, 0, 1, 0, 0);
  c.cctx.clearRect(0, 0, W, H);
  c.pctx.setTransform(1, 0, 0, 1, 0, 0);
  c.pctx.clearRect(0, 0, c.props.width, c.props.height);
  return c;
}

/** Generator: yields between eras so callers can spread work over frames. */
export function* wallPaintGen(spec) {
  const t0 = now();
  const S = normalizeWallSpec(spec);
  const Wpx = Math.max(1, Math.round(S.widthM * S.ppm));
  const Hpx = Math.max(1, Math.round(S.heightM * S.ppm));
  const rng = new Rng(S.seed);
  const fields = buildFields(S, Wpx, Hpx, rng.fork('fields'));
  const acc = new Accumulator(Wpx, Hpx);
  const world = new WallWorld(S, rng.fork('world'));
  const eras = planEras(S, rng.fork('eras'));
  const counts = { tags: 0, throwups: 0, pieces: 0, rollers: 0, buffs: 0, stickers: 0, posters: 0, scribbles: 0, ghostSign: 0 };
  const timings = { fields: now() - t0 };
  yield;

  const compositeEra = (age, index, opts = {}) => {
    const c = eraCanvasCache;
    const tg = now();
    const img = c.cctx.getImageData(0, 0, Wpx, Hpx).data;
    const pimg = c.pctx.getImageData(0, 0, c.props.width, c.props.height).data;
    const tc = now();
    acc.composite(img, pimg, fields, age, { wallTone: S.wallTone, eraIndex: index, pshift: 1, ...opts });
    timings.get = (timings.get || 0) + Math.round(tc - tg);
    timings.comp = (timings.comp || 0) + Math.round(now() - tc);
  };

  // ghost sign (decades old)
  if (S.style.ghostSign) {
    const gr = rng.fork('ghost');
    const topAG = S.heightM - S.groundLine;
    if (topAG > 5) {
      const sh = gr.range(1.3, Math.min(3.0, topAG - 4.4));
      const sw = Math.min(S.widthM - 0.6, gr.range(5, 12));
      for (let tries = 0; tries < 8; tries++) {
        const x0 = gr.range(0.3, Math.max(0.31, S.widthM - sw - 0.3));
        const y0 = gr.range(0.2, Math.max(0.21, Math.min(2.0, S.heightM - 4.4 - sh)));
        const box = { x0, y0, x1: x0 + sw, y1: y0 + sh };
        if (world.forbid.some((r) => box.x0 < r.x1 && box.x1 > r.x0 && box.y0 < r.y1 && box.y1 > r.y0)) continue;
        getEraCanvases(Wpx, Hpx);
        const c = eraCanvasCache;
        const P = new Painter({ ctx: c.cctx, pctx: c.pctx, ppm: S.ppm, widthM: S.widthM, heightM: S.heightM, wallTone: S.wallTone, propsScale: 0.5 });
        renderGhostSign(P, gr, { x0, y0, w: sw, h: sh });
        compositeEra(gr.range(55, 95), 17, { erosion: 1.15 });
        counts.ghostSign = 1;
        break;
      }
    }
    yield;
  }

  for (const era of eras) {
    const te = now();
    const c = getEraCanvases(Wpx, Hpx);
    const P = new Painter({ ctx: c.cctx, pctx: c.pctx, ppm: S.ppm, widthM: S.widthM, heightM: S.heightM, wallTone: S.wallTone, propsScale: 0.5 });
    paintEra(P, world, era, rng.fork('era' + era.index), counts);
    const tc = now();
    compositeEra(era.age, era.index);
    timings['era' + era.index] = Math.round(tc - te) + '+' + Math.round(now() - tc);
    yield;
  }

  // forbidden holes stay unpainted
  acc.clearRects(world.forbid.map((r) => ({ x0: r.x0 * S.ppm, x1: r.x1 * S.ppm, y0: r.y0 * S.ppm, y1: r.y1 * S.ppm })));
  const tf = now();
  const out = acc.finish({ canvases: S.canvases });
  timings.finish = Math.round(now() - tf);
  const stats = {
    ms: Math.round(now() - t0),
    width: Wpx,
    height: Hpx,
    eras: eras.map((e) => ({ age: +e.age.toFixed(1), intensity: +e.intensity.toFixed(2) })),
    counts,
    coverage: +out.coverage.toFixed(3),
    writers: world.local.map((w) => w.name),
    timings,
  };
  return { color: out.color, props: out.props, colorImage: out.colorImage, propsImage: out.propsImage, stats };
}

export { mix, renderSticker };
