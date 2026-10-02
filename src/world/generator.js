// Procedural arena generation. Four environment families share the same
// structural vocabulary (slabs, stairs, walls, doorways, windows, holes,
// catwalks, railings, obstacles) and differ in layout rules and decoration.

import { RNG, mixSeed } from '../core/rng.js';
import { clamp } from '../core/math.js';
import { Level } from './level.js';
import { ENV_CONDITIONS } from '../config.js';
import { buildNav } from './nav.js';

const ENV_IDS = ['facility', 'warehouse', 'rooftop', 'construction'];
const INDOOR = { facility: true, warehouse: true };

function snap(v, step = 10) {
  return Math.round(v / step) * step;
}

class Builder {
  constructor(level, rng, settings) {
    this.L = level;
    this.rng = rng;
    this.S = settings;
    this.occ = new Map();
    this.hd = settings.hazardDensity;
    this.pd = settings.propDensity;
  }

  solid(o) {
    return this.L.addSolid(o);
  }

  intervals(fk) {
    let a = this.occ.get(fk);
    if (!a) {
      a = [];
      this.occ.set(fk, a);
    }
    return a;
  }

  isFree(fk, x0, x1) {
    for (const iv of this.intervals(fk)) if (x1 > iv[0] && x0 < iv[1]) return false;
    return true;
  }

  reserve(fk, x0, x1, tag) {
    this.intervals(fk).push([x0, x1, tag]);
  }

  findSpot(fk, width, lo, hi, margin, tries = 80) {
    if (hi - lo < width) return null;
    for (let i = 0; i < tries; i++) {
      const x0 = snap(this.rng.range(lo, hi - width), 2);
      if (this.isFree(fk, x0 - margin, x0 + width + margin)) return x0;
    }
    return null;
  }

  // Straight flight of one-way steps. xb/yb = bottom, dir = ascending direction.
  stairs(xb, yb, rise, dir, opts = {}) {
    const L = this.L;
    const stepH = opts.stepH || 20;
    const n = Math.max(2, Math.round(rise / stepH));
    const sh = rise / n;
    const sw = opts.stepW || 22;
    const id = L.stairs.length;
    const steps = [];
    for (let i = 1; i <= n; i++) {
      const xa = dir > 0 ? xb + (i - 1) * sw : xb - i * sw;
      steps.push(
        this.solid({
          x: xa - 1,
          y: yb - i * sh,
          w: sw + 2,
          h: 10,
          oneWay: true,
          step: true,
          stairs: id,
          kind: 'step',
          material: opts.material || 'concrete',
        }),
      );
    }
    const xt = xb + dir * n * sw;
    const st = {
      id,
      xBottom: xb,
      yBottom: yb,
      xTop: xt,
      yTop: yb - rise,
      dir,
      n,
      stepH: sh,
      stepW: sw,
      steps,
      x0: Math.min(xb, xt),
      x1: Math.max(xb, xt),
      style: opts.style || 'concrete',
    };
    L.stairs.push(st);
    return st;
  }

  // x-range of the steps that need head clearance through the slab above.
  stairOpening(st, slabBottomGap) {
    // first step index whose standing head would hit the slab above
    const clearSteps = Math.floor(Math.max(0, slabBottomGap - 108) / st.stepH);
    const i0 = clamp(clearSteps, 1, st.n);
    const xa = st.xBottom + st.dir * (i0 - 0.6) * st.stepW;
    const xb = st.xTop;
    return [Math.min(xa, xb), Math.max(xa, xb)];
  }

  railing(x, floorY, h = 46) {
    const s = this.solid({ x: x - 4, y: floorY - h, w: 8, h, kind: 'railing', material: 'metal' });
    this.L.decor.push({ type: 'railingPost', x, y: floorY, h });
    return s;
  }

  // Horizontal slab between x0..x1 minus the given openings.
  slab(x0, x1, y, h, openings, kind = 'floor', material = 'concrete') {
    const ops = openings.slice().sort((a, b) => a[0] - b[0]);
    let cur = x0;
    const out = [];
    for (const [a, b] of ops) {
      if (b <= cur || a >= x1) continue;
      if (a > cur) out.push(this.solid({ x: cur, y, w: a - cur, h, kind, material }));
      cur = Math.max(cur, b);
    }
    if (cur < x1) out.push(this.solid({ x: cur, y, w: x1 - cur, h, kind, material }));
    return out;
  }

  // Vertical wall from yTop to yBot with gaps [[g0, g1], ...] (y ranges).
  wall(x0, w, yTop, yBot, gaps, kind = 'wall', material = 'concrete') {
    const gs = gaps.slice().sort((a, b) => a[0] - b[0]);
    let cur = yTop;
    for (const [a, b] of gs) {
      if (a > cur) this.solid({ x: x0, y: cur, w, h: a - cur, kind, material });
      cur = Math.max(cur, b);
    }
    if (cur < yBot) this.solid({ x: x0, y: cur, w, h: yBot - cur, kind, material });
  }

  glass(x, y, w, h, breakSpeed = 330, kind = 'glass') {
    const s = this.solid({ x, y, w, h, kind, material: 'glass', breakable: true, breakSpeed });
    this.L.windows.push(s);
    return s;
  }

  prop(kind, x, y, extra = {}) {
    this.L.propSpawns.push({ kind, x, y, ...extra });
  }

  hazard(h) {
    h.id = this.L.hazards.length;
    this.L.hazards.push(h);
    return h;
  }

  spawn(sp) {
    sp.id = this.L.spawnPoints.length;
    this.L.spawnPoints.push(sp);
    return sp;
  }

  decor(d) {
    this.L.decor.push(d);
    return d;
  }

  light(x, y, radius, intensity = 1, color = '255,244,214') {
    this.L.lights.push({ x, y, radius, intensity, color, flicker: this.rng.next() });
  }

  // Scatter dynamic props on the free parts of a floor span.
  scatterProps(fk, y, lo, hi, kinds, count) {
    for (let i = 0; i < count; i++) {
      const kind = this.rng.weighted(kinds);
      const w = kind === 'crateStack' ? 70 : 50;
      const x0 = this.findSpot(fk, w, lo, hi, 24, 30);
      if (x0 === null) continue;
      this.reserve(fk, x0, x0 + w, 'prop');
      const cx = x0 + w / 2;
      if (kind === 'crateStack') {
        const n = this.rng.int(1, 3);
        const size = this.rng.pick([46, 52, 58]);
        for (let j = 0; j < n; j++) {
          const sz = j === 0 ? size : size - 6 * j;
          this.prop('crate', cx + this.rng.range(-5, 5), y - size * j - sz / 2 - 1, { w: sz, h: sz });
        }
      } else if (kind === 'weapon') {
        this.prop(this.rng.pick(['pipe', 'bat', 'crowbar', 'plank']), cx, y - 6);
      } else {
        this.prop(kind, cx, y - 30);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Research facility: stacked floors, elevators, stairs, holes, windows.
// ---------------------------------------------------------------------------
function buildFacility(b) {
  const { L, rng } = b;
  const FH = 360;
  const SLAB = 74;
  const WALL = 44;
  const floors = rng.chance(0.55) ? 3 : 2;
  const W = snap(rng.range(2700, 3900), 20);
  const roofY = -floors * FH;
  L.width = W;
  L.outdoor = false;
  L.bounds = { left: -WALL - 420, right: W + WALL + 420, top: roofY - 30, bottom: 150 };
  L.killY = 1400;

  b.solid({ x: -900, y: 0, w: W + 1800, h: 700, kind: 'ground' });
  b.solid({ x: -980, y: -2400, w: 80, h: 2400, kind: 'bounds' });
  b.solid({ x: W + 900, y: -2400, w: 80, h: 2400, kind: 'bounds' });
  b.solid({ x: -WALL - 200, y: roofY, w: W + 2 * WALL + 400, h: SLAB, kind: 'ceiling' });
  b.decor({ type: 'roofline', x0: -WALL - 200, x1: W + WALL + 200, y: roofY });

  for (let k = 0; k < floors; k++) {
    L.floors.push({ index: k, y: -k * FH, ceil: -k * FH - FH + SLAB, x0: 0, x1: W });
  }

  // Elevator shafts: vertical, reserved on every floor.
  const elevX = [];
  const nElev = W > 3300 ? 2 : 1;
  for (let i = 0; i < nElev; i++) {
    const lo = nElev === 1 ? W * 0.35 : i === 0 ? W * 0.2 : W * 0.6;
    const hi = nElev === 1 ? W * 0.65 : i === 0 ? W * 0.4 : W * 0.8;
    const ex = snap(rng.range(lo, hi), 10);
    elevX.push(ex);
    for (let k = 0; k < floors; k++) b.reserve(k, ex - 120, ex + 120, 'elevator');
  }

  // Stairs between consecutive floors, with matching slab openings.
  const openings = new Map();
  for (let k = 1; k < floors; k++) openings.set(k, []);
  for (let k = 1; k < floors; k++) {
    const n = W > 3300 && rng.chance(0.5) ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const run = Math.round(FH / 20) * 22;
      let placed = false;
      for (let t = 0; t < 140 && !placed; t++) {
        const dir = rng.sign();
        // relax the clearance margins if the first attempts fail (only needed for i === 0)
        const m = t < 60 ? 70 : i === 0 ? 22 : 70;
        const xb = snap(rng.range(160 + (dir < 0 ? run : 0), W - 160 - (dir > 0 ? run : 0)), 2);
        const x0 = Math.min(xb, xb + dir * run);
        const x1 = Math.max(xb, xb + dir * run);
        if (!b.isFree(k - 1, x0 - m, x1 + m)) continue;
        const fy = -(k - 1) * FH;
        // tentative opening check on the floor above
        const tmp = { xBottom: xb, xTop: xb + dir * run, dir, n: Math.round(FH / 20), stepH: FH / Math.round(FH / 20), stepW: 22 };
        const op = b.stairOpening(tmp, FH - SLAB);
        if (!b.isFree(k, op[0] - m + 10, op[1] + m - 10)) continue;
        const st = b.stairs(xb, fy, FH, dir, { style: 'concrete' });
        b.reserve(k - 1, x0, x1, 'stairs');
        b.reserve(k, op[0] - 20, op[1] + 20, 'opening');
        openings.get(k).push([op[0], op[1]]);
        st.opening = op;
        placed = true;
      }
    }
  }

  // Drop holes in upper slabs.
  for (let k = 1; k < floors; k++) {
    if (!rng.chance(0.6 * Math.min(1.5, b.hd))) continue;
    const w = snap(rng.range(100, 130), 2);
    for (let t = 0; t < 40; t++) {
      const x0 = b.findSpot(k, w, 220, W - 220, 90, 1);
      if (x0 === null) continue;
      if (!b.isFree(k - 1, x0 - 30, x0 + w + 30)) continue;
      b.reserve(k, x0, x0 + w, 'hole');
      b.reserve(k - 1, x0 - 10, x0 + w + 10, 'holeLanding');
      openings.get(k).push([x0, x0 + w]);
      L.ledges.push({ x0, x1: x0 + w, y: -k * FH, floor: k });
      b.decor({ type: 'holeEdge', x0, x1: x0 + w, y: -k * FH });
      break;
    }
  }

  // Upper slabs.
  for (let k = 1; k < floors; k++) b.slab(0, W, -k * FH, SLAB, openings.get(k), 'floor');

  // Outer walls: street doors on the ground floor, windows or plain wall above.
  for (const side of [-1, 1]) {
    const wx = side < 0 ? -WALL : W;
    const gaps = [];
    for (let k = 0; k < floors; k++) {
      const fy = -k * FH;
      if (k === 0) {
        gaps.push([fy - 150, fy]);
        b.decor({ type: 'streetDoor', x: side < 0 ? -WALL : W, w: WALL, y: fy, h: 150, side });
        b.spawn({ type: 'door', x: side < 0 ? -WALL - 150 : W + WALL + 150, y: fy, floor: 0, side, dir: -side });
      } else if (rng.chance(0.72)) {
        const gy0 = fy - 232;
        gaps.push([gy0, fy]);
        b.glass(wx + WALL * 0.3, gy0, WALL * 0.4, 232);
        b.decor({ type: 'window', x: wx, w: WALL, y: gy0, h: 232, floor: k, side });
      }
    }
    b.wall(wx, WALL, roofY, 0, gaps);
  }
  b.decor({ type: 'street', x0: -900, x1: -WALL, y: 0 });
  b.decor({ type: 'street', x0: W + WALL, x1: W + 900, y: 0 });

  // Partition walls with doorways and low ducts (choke points).
  for (let k = 0; k < floors; k++) {
    const fy = -k * FH;
    const ceil = fy - FH + SLAB;
    if (rng.chance(0.55)) {
      const x0 = b.findSpot(k, 26, 300, W - 300, 110);
      if (x0 !== null) {
        b.reserve(k, x0 - 10, x0 + 36, 'partition');
        b.solid({ x: x0, y: ceil, w: 26, h: fy - 134 - ceil, kind: 'lintel' });
        L.doorways.push({ x: x0 + 13, y: fy, top: fy - 134, floor: k });
        b.decor({ type: 'doorway', x: x0, w: 26, y: fy, top: fy - 134, ceil });
      }
    }
    if (rng.chance(0.4)) {
      const w = snap(rng.range(300, 520), 10);
      const x0 = b.findSpot(k, w, 120, W - 120, 30);
      if (x0 !== null) {
        b.reserve(k, x0, x0 + w, 'duct');
        const bottom = fy - 168;
        b.solid({ x: x0, y: ceil, w, h: bottom - ceil, kind: 'soffit', material: 'metal' });
        L.walls.push({ type: 'lowCeiling', x0, x1: x0 + w, y: fy, bottom, floor: k });
        b.decor({ type: 'soffit', x0, x1: x0 + w, y: ceil, bottom });
      }
    }
  }

  // Elevators and ceiling vents as spawn points.
  elevX.forEach((ex, shaft) => {
    for (let k = 0; k < floors; k++) {
      const fy = -k * FH;
      const d = b.decor({ type: 'elevator', x: ex, y: fy, w: 150, h: 176, floor: k, shaft, open: 0 });
      b.spawn({ type: 'elevator', x: ex, y: fy, floor: k, decor: d });
    }
  });
  for (let k = 0; k < floors; k++) {
    const fy = -k * FH;
    const ceil = fy - FH + SLAB;
    const x0 = b.findSpot(k, 80, 200, W - 200, 20);
    if (x0 === null) continue;
    const d = b.decor({ type: 'vent', x: x0 + 40, y: ceil, w: 70, open: 0 });
    b.spawn({ type: 'vent', x: x0 + 40, y: ceil + 6, floor: k, decor: d, landY: fy });
  }

  // Hazards.
  const nElec = Math.round(rng.range(1, 2.4) * b.hd);
  for (let i = 0; i < nElec; i++) {
    const k = rng.int(0, floors - 1);
    const x0 = b.findSpot(k, 100, 160, W - 160, 50);
    if (x0 === null) continue;
    b.reserve(k, x0, x0 + 100, 'electric');
    b.hazard({ type: 'electric', x: x0 + 50, y: -k * FH, w: 96, h: 128, floor: k, style: 'skull' });
  }
  if (rng.chance(0.55 * b.hd)) {
    const k = rng.int(0, floors - 1);
    const x0 = b.findSpot(k, 40, 200, W - 200, 60);
    if (x0 !== null) {
      const dir = x0 < W / 2 ? 1 : -1;
      b.hazard({ type: 'steam', x: x0 + 20, y: -k * FH - 62, dir, length: 170, floor: k, period: rng.range(6, 11), phase: rng.range(0, 6) });
    }
  }
  const nCan = Math.round(rng.range(0, 2.6) * b.hd);
  for (let i = 0; i < nCan; i++) {
    const k = rng.int(0, floors - 1);
    const x0 = b.findSpot(k, 40, 140, W - 140, 30);
    if (x0 === null) continue;
    b.reserve(k, x0, x0 + 40, 'canister');
    b.prop('canister', x0 + 20, -k * FH - 30);
  }

  // Props and weapons.
  for (let k = 0; k < floors; k++) {
    const fy = -k * FH;
    const n = Math.round(rng.range(1.5, 3.5) * b.pd);
    b.scatterProps(k, fy, 80, W - 80, [['crateStack', 4], ['barrel', 1.5], ['box', 2], ['weapon', 2]], n);
  }

  // Decoration.
  for (let k = 0; k < floors; k++) {
    const fy = -k * FH;
    const ceil = fy - FH + SLAB;
    const ops = k + 1 < floors ? openings.get(k + 1) : [];
    for (let x = 160 + rng.range(0, 120); x < W - 100; x += rng.range(380, 470)) {
      if (ops.some(([a, c]) => x > a - 40 && x < c + 40)) continue;
      b.decor({ type: 'lamp', x, y: ceil });
      b.light(x, ceil + 34, 330, 1);
    }
    // vending machines and wall furniture where free
    if (rng.chance(0.7)) {
      const x0 = b.findSpot(k, 110, 120, W - 120, 20);
      if (x0 !== null) {
        b.reserve(k, x0, x0 + 110, 'vending');
        b.decor({ type: 'vending', x: x0 + 8, y: fy, w: 96, h: 136, variant: rng.int(0, 2) });
      }
    }
    // pipe runs along the upper wall
    const nPipes = rng.int(1, 3);
    for (let p = 0; p < nPipes; p++) {
      const xa = rng.range(40, W - 300);
      const xb2 = xa + rng.range(200, 700);
      const py = ceil + rng.range(26, 70);
      const drop = rng.chance(0.6);
      const pts = [[xa, ceil], [xa, py], [Math.min(W - 30, xb2), py]];
      if (drop) pts.push([Math.min(W - 30, xb2), fy - rng.range(110, 170)]);
      b.decor({ type: 'pipe', pts, w: rng.pick([8, 10, 12]) });
    }
    // misc wall items
    const nItems = rng.int(2, 5);
    for (let i = 0; i < nItems; i++) {
      const x = rng.range(100, W - 100);
      const kind = rng.weighted([['poster', 3], ['panel', 2], ['clock', 1], ['extinguisher', 1.5], ['sign', 1.5]]);
      b.decor({ type: kind, x, y: fy - rng.range(120, 190), floor: k, hue: rng.int(0, 360), variant: rng.int(0, 3) });
    }
    // structural column with an alarm light
    if (rng.chance(0.6)) {
      const x0 = b.findSpot(k, 70, 200, W - 200, 10);
      if (x0 !== null) {
        b.decor({ type: 'column', x: x0 + 35, y: fy, top: ceil, w: 70 });
        b.decor({ type: 'alarm', x: x0 - 2, y: ceil + 60 });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Warehouse: one tall hall, catwalks, crate stacks, roll-up doors.
// ---------------------------------------------------------------------------
function buildWarehouse(b) {
  const { L, rng } = b;
  const H = 560;
  const WALL = 44;
  const W = snap(rng.range(3200, 4400), 20);
  const MEZZ = 270;
  L.width = W;
  L.outdoor = false;
  L.bounds = { left: -WALL - 420, right: W + WALL + 420, top: -H - 50, bottom: 150 };
  L.killY = 1400;
  b.solid({ x: -900, y: 0, w: W + 1800, h: 700, kind: 'ground' });
  b.solid({ x: -980, y: -2400, w: 80, h: 2400, kind: 'bounds' });
  b.solid({ x: W + 900, y: -2400, w: 80, h: 2400, kind: 'bounds' });
  b.solid({ x: -WALL - 200, y: -H - 44, w: W + 2 * WALL + 400, h: 44, kind: 'ceiling', material: 'metal' });
  L.floors.push({ index: 0, y: 0, ceil: -H, x0: 0, x1: W });
  L.floors.push({ index: 1, y: -MEZZ, ceil: -H, x0: 0, x1: W, partial: true });

  // Catwalks with stairs.
  const nCat = W > 3800 ? 3 : 2;
  const segW = (W - 240) / nCat;
  const catwalks = [];
  for (let i = 0; i < nCat; i++) {
    const lo = 120 + i * segW;
    const len = snap(rng.range(segW * 0.45, segW * 0.75), 10);
    const x0 = snap(lo + rng.range(0, segW - len), 10);
    const x1 = x0 + len;
    const touchesWall = (i === 0 && rng.chance(0.4)) || (i === nCat - 1 && rng.chance(0.4));
    const cx0 = touchesWall && i === 0 ? 0 : x0;
    const cx1 = touchesWall && i === nCat - 1 ? W : x1;
    b.solid({ x: cx0, y: -MEZZ, w: cx1 - cx0, h: 14, oneWay: true, kind: 'catwalk', material: 'metal' });
    b.decor({ type: 'catwalk', x0: cx0, x1: cx1, y: -MEZZ });
    b.reserve(1, cx0, cx1, 'catwalk');
    catwalks.push({ x0: cx0, x1: cx1 });
  }
  for (const c of catwalks) {
    const run = Math.round(MEZZ / 20) * 22;
    const options = [];
    if (c.x0 - run > 60 && b.isFree(0, c.x0 - run - 40, c.x0 + 10)) options.push(1);
    if (c.x1 + run < W - 60 && b.isFree(0, c.x1 - 10, c.x1 + run + 40)) options.push(-1);
    let stairDir = 0;
    if (options.length) {
      stairDir = rng.pick(options);
      const xb = stairDir > 0 ? c.x0 - run : c.x1 + run;
      b.stairs(xb, 0, MEZZ, stairDir, { style: 'steel', material: 'metal' });
      b.reserve(0, Math.min(xb, xb + stairDir * run) - 10, Math.max(xb, xb + stairDir * run) + 10, 'stairs');
    } else {
      // No room at either end: tuck the flight under the (one-way) catwalk.
      for (let t = 0; t < 12; t++) {
        const dir = rng.sign();
        const xb = dir > 0 ? rng.range(c.x0 + 20, c.x1 - run - 20) : rng.range(c.x0 + run + 20, c.x1 - 20);
        const x0 = Math.min(xb, xb + dir * run);
        if (!b.isFree(0, x0 - 20, x0 + run + 20)) continue;
        b.stairs(snap(xb, 2), 0, MEZZ, dir, { style: 'steel', material: 'metal' });
        b.reserve(0, x0 - 10, x0 + run + 10, 'stairs');
        break;
      }
    }
    // railing at ends not served by stairs and not against a wall
    if (stairDir !== 1 && c.x0 > 0) {
      if (rng.chance(0.7)) b.railing(c.x0 + 6, -MEZZ);
    }
    if (stairDir !== -1 && c.x1 < W) {
      if (rng.chance(0.7)) b.railing(c.x1 - 6, -MEZZ);
    }
    // catwalk-level doors in the outer walls
    if (c.x0 === 0) b.spawn({ type: 'door', x: 70, y: -MEZZ, floor: 1, side: -1, dir: 1, inside: true });
    if (c.x1 === W) b.spawn({ type: 'door', x: W - 70, y: -MEZZ, floor: 1, side: 1, dir: -1, inside: true });
    if (c.x0 === 0) b.decor({ type: 'officeDoor', x: 10, y: -MEZZ });
    if (c.x1 === W) b.decor({ type: 'officeDoor', x: W - 70, y: -MEZZ });
    // a few props on the catwalk
    if (rng.chance(0.6 * b.pd)) {
      const x = rng.range(c.x0 + 60, c.x1 - 60);
      b.prop(rng.chance(0.5) ? 'box' : rng.pick(['pipe', 'crowbar']), x, -MEZZ - 24);
    }
  }

  // Outer walls with roll-up doors.
  for (const side of [-1, 1]) {
    const wx = side < 0 ? -WALL : W;
    b.wall(wx, WALL, -H - 44, 0, [[-236, 0]]);
    b.decor({ type: 'rollupDoor', x: wx, w: WALL, y: 0, h: 236, side, open: 0.75 });
    b.spawn({ type: 'door', x: side < 0 ? -WALL - 150 : W + WALL + 150, y: 0, floor: 0, side, dir: -side });
  }
  b.decor({ type: 'street', x0: -900, x1: -WALL, y: 0 });
  b.decor({ type: 'street', x0: W + WALL, x1: W + 900, y: 0 });

  // Hazards.
  const nElec = Math.round(rng.range(1, 2.2) * b.hd);
  for (let i = 0; i < nElec; i++) {
    const x0 = b.findSpot(0, 100, 200, W - 200, 50);
    if (x0 === null) continue;
    b.reserve(0, x0, x0 + 100, 'electric');
    b.hazard({ type: 'electric', x: x0 + 50, y: 0, w: 96, h: 128, floor: 0, style: 'panel' });
  }
  const nCan = Math.round(rng.range(1, 3.4) * b.hd);
  for (let i = 0; i < nCan; i++) {
    const x0 = b.findSpot(0, 40, 140, W - 140, 30);
    if (x0 === null) continue;
    b.reserve(0, x0, x0 + 40, 'canister');
    b.prop('canister', x0 + 20, -30);
  }

  // Lots of crates, pallets and loose weapons.
  b.scatterProps(0, 0, 100, W - 100, [['crateStack', 6], ['barrel', 2], ['box', 2], ['weapon', 2]], Math.round(rng.range(5, 9) * b.pd));

  // Decoration: racks, forklift, lamps, trusses.
  for (let x = 120; x < W - 200; x += rng.range(260, 520)) {
    if (rng.chance(0.55)) b.decor({ type: 'rack', x, y: 0, w: rng.pick([160, 200, 240]), h: rng.pick([300, 380, 440]), seed: rng.int(0, 1e6) });
  }
  if (rng.chance(0.7)) b.decor({ type: 'forklift', x: rng.range(300, W - 300), y: 0, dir: rng.sign() });
  for (let x = 200 + rng.range(0, 150); x < W - 100; x += rng.range(420, 520)) {
    b.decor({ type: 'hangLamp', x, y: -H, len: rng.range(90, 150) });
    b.light(x, -H + 150, 420, 1.1, '255,220,170');
  }
  b.decor({ type: 'trusses', x0: -WALL, x1: W + WALL, y: -H });
  for (let i = 0; i < 3; i++) {
    b.decor({ type: 'stripes', x0: rng.range(100, W - 400), w: rng.range(160, 320), y: 0 });
  }
  const nSigns = rng.int(1, 3);
  for (let i = 0; i < nSigns; i++) b.decor({ type: 'sign', x: rng.range(200, W - 200), y: -rng.range(330, 440), floor: 0, hue: 40, variant: rng.int(0, 3) });
}

// ---------------------------------------------------------------------------
// Rooftops at dusk: neighbouring roofs at different heights, gaps, edges.
// ---------------------------------------------------------------------------
function buildRooftop(b) {
  const { L, rng } = b;
  L.outdoor = true;
  const segs = [];
  const nSeg = rng.int(3, 5);
  let x = 0;
  let y = 0;
  for (let i = 0; i < nSeg; i++) {
    const w = snap(rng.range(560, 1150), 10);
    let gap = 0;
    let ny = y;
    if (i > 0) {
      gap = rng.chance(0.42) ? snap(rng.range(80, 150), 2) : 0;
      const dy = rng.pick([-200, -160, -90, -60, 0, 0, 60, 90, 160, 200]);
      ny = clamp(y + dy, -260, 100);
      if (gap > 0 && Math.abs(ny - y) > 80) ny = y + Math.sign(ny - y) * 60;
    }
    segs.push({ x0: x + gap, x1: x + gap + w, y: ny, gap });
    x += gap + w;
    y = ny;
  }
  const W = x;
  L.width = W;
  const minY = Math.min(...segs.map((s) => s.y));
  L.bounds = { left: -380, right: W + 380, top: minY - 520, bottom: 160 + Math.max(...segs.map((s) => s.y)) };
  L.killY = 1500;
  L.floors.push({ index: 0, y: 0, ceil: minY - 600, x0: 0, x1: W });

  segs.forEach((s, i) => {
    // building body, with an optional skylight hole covered by glass
    const sky = s.x1 - s.x0 > 700 && rng.chance(0.5 * Math.min(1.6, b.hd));
    if (sky) {
      const sw = 96;
      const sx = snap(rng.range(s.x0 + 180, s.x1 - 180 - sw), 2);
      b.solid({ x: s.x0, y: s.y, w: sx - s.x0, h: 3200, kind: 'roof' });
      b.solid({ x: sx + sw, y: s.y, w: s.x1 - sx - sw, h: 3200, kind: 'roof' });
      b.glass(sx, s.y, sw, 12, 520, 'skylight');
      b.decor({ type: 'skylight', x: sx, y: s.y, w: sw });
      b.reserve(i, sx - 20, sx + sw + 20, 'skylight');
      L.ledges.push({ x0: sx, x1: sx + sw, y: s.y, floor: 0, skylight: true });
    } else {
      b.solid({ x: s.x0, y: s.y, w: s.x1 - s.x0, h: 3200, kind: 'roof' });
    }
    b.decor({ type: 'building', x0: s.x0, x1: s.x1, y: s.y, seed: rng.int(0, 1e6) });
    // connect to previous segment
    if (i > 0) {
      const p = segs[i - 1];
      const dy = s.y - p.y;
      if (s.gap === 0 && Math.abs(dy) > 105) {
        // stairs on the lower roof up to the higher one
        const rise = Math.abs(dy);
        const run = Math.round(rise / 20) * 22;
        if (dy < 0) {
          // current roof is higher: stairs on previous roof ascending right
          const xb = s.x0 - run;
          b.stairs(xb, p.y, rise, 1, { style: 'steel', material: 'metal' });
          b.reserve(i - 1, xb - 10, s.x0, 'stairs');
        } else {
          const xb = p.x1 + run;
          b.stairs(xb, s.y, rise, -1, { style: 'steel', material: 'metal' });
          b.reserve(i, p.x1, xb + 10, 'stairs');
        }
      }
      if (s.gap > 0) L.ledges.push({ x0: p.x1, x1: s.x0, y: Math.max(p.y, s.y), floor: 0, gap: true });
    }
  });

  // Parapets or open edges at the ends.
  const first = segs[0];
  const last = segs[segs.length - 1];
  if (rng.chance(0.5)) b.railing(first.x0 + 8, first.y, 30);
  else L.ledges.push({ x0: first.x0 - 400, x1: first.x0, y: first.y, floor: 0, edge: true });
  if (rng.chance(0.5)) b.railing(last.x1 - 8, last.y, 30);
  else L.ledges.push({ x0: last.x1, x1: last.x1 + 400, y: last.y, floor: 0, edge: true });

  // Structures: access sheds (spawns), AC units (obstacles), climb-up spawns.
  segs.forEach((s, i) => {
    if (s.x1 - s.x0 > 500 && (i % 2 === 0 || rng.chance(0.5))) {
      const x0 = b.findSpot(i, 120, s.x0 + 60, s.x1 - 60, 40);
      if (x0 !== null) {
        b.reserve(i, x0, x0 + 120, 'shed');
        b.decor({ type: 'shed', x: x0, y: s.y, w: 120, h: 150 });
        b.spawn({ type: 'door', x: x0 + 60, y: s.y, floor: 0, side: 0, dir: rng.sign(), inside: true });
      }
    }
    const nAC = rng.int(0, 2);
    for (let a = 0; a < nAC; a++) {
      const w = snap(rng.range(80, 110), 2);
      const h = snap(rng.range(48, 66), 2);
      const x0 = b.findSpot(i, w, s.x0 + 80, s.x1 - 80, 60);
      if (x0 === null) continue;
      b.reserve(i, x0, x0 + w, 'ac');
      b.solid({ x: x0, y: s.y - h, w, h, kind: 'obstacle', material: 'metal' });
      b.decor({ type: 'ac', x: x0, y: s.y, w, h });
    }
    if (rng.chance(0.4)) b.decor({ type: 'waterTower', x: rng.range(s.x0 + 100, s.x1 - 100), y: s.y });
    if (rng.chance(0.5)) b.decor({ type: 'antenna', x: rng.range(s.x0 + 40, s.x1 - 40), y: s.y, h: rng.range(120, 220) });
    if (rng.chance(0.35)) b.decor({ type: 'neon', x: rng.range(s.x0 + 80, s.x1 - 240), y: s.y, text: rng.pick(['HOTEL', 'NOODLES', 'BAR', 'OPEN 24', 'ARCADE']) });
    for (let c = 0; c < rng.int(1, 3); c++) b.decor({ type: 'chimney', x: rng.range(s.x0 + 30, s.x1 - 30), y: s.y, h: rng.range(30, 60) });
  });
  b.spawn({ type: 'climb', x: first.x0 + 30, y: first.y, floor: 0, side: -1, dir: 1 });
  b.spawn({ type: 'climb', x: last.x1 - 30, y: last.y, floor: 0, side: 1, dir: -1 });
  if (segs.length > 3) {
    const mid = segs[Math.floor(segs.length / 2)];
    if (mid.gap > 0) b.spawn({ type: 'climb', x: mid.x0 + 30, y: mid.y, floor: 0, side: -1, dir: 1 });
  }

  // Hazards.
  const nElec = Math.round(rng.range(0.6, 1.8) * b.hd);
  for (let i = 0; i < nElec; i++) {
    const si = rng.int(0, segs.length - 1);
    const s = segs[si];
    const x0 = b.findSpot(si, 100, s.x0 + 60, s.x1 - 60, 40);
    if (x0 === null) continue;
    b.reserve(si, x0, x0 + 100, 'electric');
    b.hazard({ type: 'electric', x: x0 + 50, y: s.y, w: 96, h: 120, floor: 0, style: 'transformer' });
  }
  const nCan = Math.round(rng.range(0, 2.2) * b.hd);
  for (let i = 0; i < nCan; i++) {
    const si = rng.int(0, segs.length - 1);
    const s = segs[si];
    const x0 = b.findSpot(si, 40, s.x0 + 50, s.x1 - 50, 30);
    if (x0 === null) continue;
    b.reserve(si, x0, x0 + 40, 'canister');
    b.prop('canister', x0 + 20, s.y - 30);
  }
  segs.forEach((s, i) => {
    b.scatterProps(i, s.y, s.x0 + 50, s.x1 - 50, [['box', 3], ['crateStack', 1.5], ['weapon', 2.5], ['barrel', 1]], Math.round(rng.range(0.5, 2.2) * b.pd));
  });
  L.segments = segs;
}

// ---------------------------------------------------------------------------
// Construction site: open concrete frame, scaffolds, barriers, big drops.
// ---------------------------------------------------------------------------
function buildConstruction(b) {
  const { L, rng } = b;
  L.outdoor = true;
  const FH = 340;
  const SLAB = 36;
  const W = snap(rng.range(3000, 4200), 20);
  L.width = W;
  L.bounds = { left: -720, right: W + 720, top: -2 * FH - 360, bottom: 150 };
  L.killY = 1400;
  b.solid({ x: -1100, y: 0, w: W + 2200, h: 700, kind: 'ground', material: 'dirt' });
  b.solid({ x: -1180, y: -2400, w: 80, h: 2400, kind: 'bounds' });
  b.solid({ x: W + 1100, y: -2400, w: 80, h: 2400, kind: 'bounds' });
  L.floors.push({ index: 0, y: 0, ceil: -FH + SLAB, x0: -1000, x1: W + 1000 });
  L.floors.push({ index: 1, y: -FH, ceil: -2 * FH + SLAB, x0: 0, x1: W });
  const top0 = snap(rng.range(W * 0.08, W * 0.3), 10);
  const top1 = snap(rng.range(W * 0.7, W * 0.92), 10);
  L.floors.push({ index: 2, y: -2 * FH, ceil: -3 * FH, x0: top0, x1: top1 });

  const ops = new Map([[1, []], [2, []]]);
  // stairs ground->1 and 1->2
  for (const k of [1, 2]) {
    const lo = k === 1 ? 160 : top0 + 160;
    const hi = k === 1 ? W - 160 : top1 - 160;
    const run = Math.round(FH / 20) * 22;
    for (let t = 0; t < 60; t++) {
      const dir = rng.sign();
      const xb = snap(rng.range(lo + (dir < 0 ? run : 0), hi - (dir > 0 ? run : 0)), 2);
      const x0 = Math.min(xb, xb + dir * run);
      const x1 = Math.max(xb, xb + dir * run);
      if (!b.isFree(k - 1, x0 - 60, x1 + 60)) continue;
      const tmp = { xBottom: xb, xTop: xb + dir * run, dir, n: Math.round(FH / 20), stepH: FH / Math.round(FH / 20), stepW: 22 };
      const op = b.stairOpening(tmp, FH - SLAB);
      if (!b.isFree(k, op[0] - 50, op[1] + 50)) continue;
      const st = b.stairs(xb, -(k - 1) * FH, FH, dir, { style: 'concrete' });
      st.opening = op;
      b.reserve(k - 1, x0, x1, 'stairs');
      b.reserve(k, op[0] - 20, op[1] + 20, 'opening');
      ops.get(k).push(op);
      break;
    }
  }
  // unfinished gaps on floor 1
  const nGaps = rng.int(0, 2);
  for (let i = 0; i < nGaps; i++) {
    const w = snap(rng.range(110, 170), 2);
    const x0 = b.findSpot(1, w, 300, W - 300, 100);
    if (x0 === null) continue;
    if (!b.isFree(0, x0 - 20, x0 + w + 20)) continue;
    b.reserve(1, x0, x0 + w, 'gap');
    ops.get(1).push([x0, x0 + w]);
    L.ledges.push({ x0, x1: x0 + w, y: -FH, floor: 1 });
    b.decor({ type: 'holeEdge', x0, x1: x0 + w, y: -FH });
  }
  b.slab(0, W, -FH, SLAB, ops.get(1), 'floor');
  b.slab(top0, top1, -2 * FH, SLAB, ops.get(2), 'floor');
  L.ledges.push({ x0: -50, x1: 0, y: -FH, floor: 1, edge: true });
  L.ledges.push({ x0: W, x1: W + 50, y: -FH, floor: 1, edge: true });
  L.ledges.push({ x0: top0 - 50, x1: top0, y: -2 * FH, floor: 2, edge: true });
  L.ledges.push({ x0: top1, x1: top1 + 50, y: -2 * FH, floor: 2, edge: true });

  // Columns (decor) and scaffolds.
  for (let x = 0; x <= W; x += snap(rng.range(380, 520), 10)) {
    b.decor({ type: 'beam', x, y: 0, top: -FH });
    if (x >= top0 && x <= top1) b.decor({ type: 'beam', x, y: -FH, top: -2 * FH });
  }
  // Scaffolds extend floor 1 outwards and give a second route up from the street.
  for (const side of [-1, 1]) {
    if (!rng.chance(0.7)) continue;
    const sx0 = side < 0 ? -230 : W;
    const sx1 = side < 0 ? 0 : W + 230;
    const sy = -FH;
    b.solid({ x: sx0, y: sy, w: sx1 - sx0, h: 10, oneWay: true, kind: 'scaffold', material: 'wood' });
    b.decor({ type: 'scaffold', x0: sx0, x1: sx1, y: sy, ground: 0 });
    const rise = -sy;
    const run = Math.round(rise / 20) * 22;
    const xb = side < 0 ? sx0 + 10 - run : sx1 - 10 + run;
    b.stairs(xb, 0, rise, side < 0 ? 1 : -1, { style: 'wood', material: 'wood' });
  }

  // Barriers on the ground floor (jumpable obstacles).
  const nBar = rng.int(1, 3);
  for (let i = 0; i < nBar; i++) {
    const x0 = b.findSpot(0, 100, 120, W - 120, 80);
    if (x0 === null) continue;
    b.reserve(0, x0, x0 + 100, 'barrier');
    b.solid({ x: x0, y: -54, w: 100, h: 54, kind: 'obstacle' });
    b.decor({ type: 'barrier', x: x0, y: 0, w: 100, h: 54 });
  }

  // Spawns: the street edges and a hoist.
  b.spawn({ type: 'edge', x: -880, y: 0, floor: 0, side: -1, dir: 1 });
  b.spawn({ type: 'edge', x: W + 880, y: 0, floor: 0, side: 1, dir: -1 });
  const hoistX = rng.chance(0.5) ? top0 + 70 : top1 - 70;
  for (const k of [0, 1, 2]) {
    if (b.isFree(k, hoistX - 70, hoistX + 70)) {
      b.reserve(k, hoistX - 70, hoistX + 70, 'hoist');
      const d = b.decor({ type: 'hoist', x: hoistX, y: -k * FH, w: 110, h: 160, open: 0, floor: k });
      b.spawn({ type: 'elevator', x: hoistX, y: -k * FH, floor: k, decor: d });
    }
  }

  // Hazards.
  const nElec = Math.round(rng.range(0.7, 1.8) * b.hd);
  for (let i = 0; i < nElec; i++) {
    const k = rng.int(0, 1);
    const x0 = b.findSpot(k, 100, 150, W - 150, 50);
    if (x0 === null) continue;
    b.reserve(k, x0, x0 + 100, 'electric');
    b.hazard({ type: 'electric', x: x0 + 50, y: -k * FH, w: 100, h: 110, floor: k, style: 'generator' });
  }
  const nCan = Math.round(rng.range(1, 3.2) * b.hd);
  for (let i = 0; i < nCan; i++) {
    const k = rng.int(0, 2);
    const f = L.floors[k];
    const x0 = b.findSpot(k, 40, f.x0 + 100, f.x1 - 100, 30);
    if (x0 === null) continue;
    b.reserve(k, x0, x0 + 40, 'canister');
    b.prop('canister', x0 + 20, -k * FH - 30);
  }
  for (const k of [0, 1, 2]) {
    const f = L.floors[k];
    b.scatterProps(k, -k * FH, Math.max(f.x0, -200) + 60, Math.min(f.x1, W + 200) - 60, [['box', 2], ['crateStack', 2], ['weapon', 2.5], ['barrel', 1.2]], Math.round(rng.range(1.5, 3.2) * b.pd));
  }
  // Decor.
  b.decor({ type: 'crane', x: rng.chance(0.5) ? -320 : W + 320, y: 0, h: 1050 });
  for (let i = 0; i < 4; i++) b.decor({ type: 'cone', x: rng.range(-500, W + 500), y: 0 });
  b.decor({ type: 'siteSign', x: rng.chance(0.5) ? -420 : W + 300, y: 0 });
  b.decor({ type: 'mixer', x: rng.range(-480, -200), y: 0 });
}

function applyCondition(L, condition, rng) {
  L.condition = condition;
  L.friction = 1;
  L.wind = 0;
  L.dark = false;
  L.smoke = false;
  L.rain = false;
  if (condition === 'wet') {
    L.friction = 0.42;
    if (L.outdoor) L.rain = true;
    L.puddles = []; // placed once the collision grid exists (placePuddles)
  } else if (condition === 'wind') {
    L.wind = rng.sign() * rng.range(90, 170);
  } else if (condition === 'dark') {
    L.dark = true;
  } else if (condition === 'smoke') {
    L.smoke = true;
  }
}

// Puddles only where there is open floor under their whole width.
function placePuddles(L, rng) {
  const onFloor = (x, y) => {
    const g = L.groundUnder(x - 1, x + 1, y - 3, 6, false);
    return g && Math.abs(g.y - y) < 2;
  };
  for (const so of L.solids) {
    if (so.oneWay || so.w < 220 || !(so.kind === 'ground' || so.kind === 'floor' || so.kind === 'roof')) continue;
    const n = rng.int(1, so.w > 900 ? 4 : 2);
    for (let i = 0; i < n; i++) {
      const w = Math.min(rng.range(120, 300), so.w * 0.5);
      const x = rng.range(so.x + w / 2 + 12, so.x + so.w - w / 2 - 12);
      if (onFloor(x - w / 2, so.y) && onFloor(x, so.y) && onFloor(x + w / 2, so.y)) L.puddles.push({ x, y: so.y, w });
    }
  }
}

export function generateLevel(seed, settings) {
  const rng = new RNG(mixSeed(seed, 0x51ab1e));
  const theme = ENV_IDS.includes(settings.environment) ? settings.environment : rng.pick(ENV_IDS);
  let condition = settings.condition;
  if (condition === 'random' || !condition) condition = rng.pick(ENV_CONDITIONS[theme]);
  if (condition === 'wind' && INDOOR[theme]) condition = 'clear';
  if (condition === 'dark' && theme === 'rooftop') condition = 'clear';
  const L = new Level();
  L.seed = seed;
  L.theme = theme;
  const b = new Builder(L, rng, settings);
  if (theme === 'facility') buildFacility(b);
  else if (theme === 'warehouse') buildWarehouse(b);
  else if (theme === 'rooftop') buildRooftop(b);
  else buildConstruction(b);
  applyCondition(L, condition, rng);
  L.buildGrid();
  if (L.puddles) placePuddles(L, rng);
  buildNav(L);
  return L;
}
