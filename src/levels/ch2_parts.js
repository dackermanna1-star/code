// Chapter 2 helpers: subway track & rolling stock (walk-through cars, derailed
// wrecks), tunnel/station dressing, electrical props, office and pawn-shop
// props. Everything is built from level boxes / prop parts (merged batches).
import * as THREE from 'three';
import { P, sign } from './kit.js';
import { F_SOLID, F_SHOOT, F_DEFAULT } from '../world/collision.js';
import { trs } from '../world/geom.js';
import { makeRng } from '../core/math.js';

export const rng = makeRng(2202);
const NC = { collide: false };

// ------------------------------------------------------------------ track --
// Ties, running rails and (optionally) a covered third rail along X at zc.
// Visual only: the track bed underneath stays flat for navigation.
export function track(L, x0, x1, zc, y, o = {}) {
  const skip = o.skip || [];
  const inSkip = (x) => skip.some(([a, b]) => x > a && x < b);
  for (let x = x0 + 0.3; x < x1 - 0.3; x += o.tieStep ?? 1.0) {
    if (inSkip(x)) continue;
    L.box(x, y, zc - 1.2, x + 0.24, y + 0.06, zc + 1.2, 'woodDark', { collide: false, tint: 0x7a6e62 });
  }
  const spans = [];
  let cur = x0;
  for (const [a, b] of skip.slice().sort((p, q) => p[0] - q[0])) { if (a > cur) spans.push([cur, a]); cur = Math.max(cur, b); }
  if (cur < x1) spans.push([cur, x1]);
  for (const [a, b] of spans) {
    for (const s of [-1, 1]) {
      const z = zc + s * 0.72;
      L.box(a, y + 0.06, z - 0.03, b, y + 0.15, z + 0.03, 'metalDark', NC);
      L.box(a, y + 0.15, z - 0.04, b, y + 0.19, z + 0.04, 'metalClean', { collide: false, tint: 0xa8a49c });
    }
    if (o.third) {
      const z = zc + o.third * 1.38;
      L.box(a, y + 0.2, z - 0.05, b, y + 0.3, z + 0.05, 'metalDark', { collide: false, tint: 0x6a5a48 });
      L.box(a, y + 0.4, z - 0.2, b, y + 0.43, z + 0.2, 'wood', { collide: false, tint: 0x9a8a5a });
      for (let x = a + 1.2; x < b - 0.3; x += 3) L.box(x, y, z - 0.07, x + 0.14, y + 0.4, z + 0.07, 'metalDark', NC);
    }
  }
}

// ------------------------------------------------------------ oriented col --
// Approximate a rotated rectangle (car wreck) with n axis-aligned boxes.
export function orientedCol(L, cx, cz, len, w, ry, y0, y1, n = 8, flags = F_DEFAULT) {
  const c = Math.cos(ry), s = Math.sin(ry);
  for (let i = 0; i < n; i++) {
    const a = -len / 2 + (len / n) * i, b = a + len / n;
    const pts = [[a, -w / 2], [a, w / 2], [b, -w / 2], [b, w / 2]].map(([lx, lz]) => [cx + lx * c + lz * s, cz - lx * s + lz * c]);
    const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]);
    // shrink a little so the stair-stepped approximation hugs the hull
    const sh = Math.min(0.25, Math.abs(s) * (len / n) * 0.35);
    L.clip(Math.min(...xs) + sh, y0, Math.min(...zs) + sh, Math.max(...xs) - sh, y1, Math.max(...zs) - sh, flags);
  }
}

// ------------------------------------------------------------ subway car --
const CAR_W = 3.0, CAR_H = 2.3;
// Walk-through subway car along X, centred at (cx, cz) on the track bed ty.
// Floor top = ty + 1.2 (platform height). o: {len, color, lit, flicker,
// doorsN:[open,open], doorsS:[open,open], endW, endE: 'open'|'closed'|'cab', number, seat}
export function trainCar(L, cx, ty, cz, o = {}) {
  const len = o.len ?? 15;
  const fy = ty + 1.2;
  const x0 = cx - len / 2, x1 = cx + len / 2, z0 = cz - CAR_W / 2, z1 = cz + CAR_W / 2;
  const col = o.color ?? 0xa4a8aa;
  const wt = 0.08, H = CAR_H, dh = 2.02, dw = 1.3;
  const doorX = [cx - len / 4, cx + len / 4];
  // ---- running gear & body block (solid below the floor)
  for (const bx of [x0 + 2.6, x1 - 2.6]) {
    L.box(bx - 1.25, ty + 0.25, cz - 1.0, bx + 1.25, ty + 0.72, cz + 1.0, 'metalDark', NC);
    const p = P.prop(L, bx, ty, cz, 0);
    for (const wx of [-0.75, 0.75]) for (const s of [-1, 1]) p.cyl(wx, 0.42, s * 0.72, 0.4, 0.12, 'metalDark', 0x3a3a3a, [Math.PI / 2, 0, 0], 12);
  }
  L.box(x0 + 0.5, ty + 0.72, z0 + 0.25, x1 - 0.5, fy - 0.3, z1 - 0.25, 'metalDark', { tint: 0x5a5a5a });
  L.box(x0, fy - 0.3, z0, x1, fy - 0.03, z1, 'metalClean', { tint: col });
  L.box(x0 + wt, fy - 0.03, z0 + wt, x1 - wt, fy, z1 - wt, 'rubber', { tint: o.floorTint ?? 0x4a4644 });
  // ---- side walls with door openings & window band
  const winOps = [];
  const segs = [[x0 + 0.45, doorX[0] - dw / 2 - 0.35], [doorX[0] + dw / 2 + 0.35, cx - 0.2], [cx + 0.2, doorX[1] - dw / 2 - 0.35], [doorX[1] + dw / 2 + 0.35, x1 - 0.45]];
  for (const [a, b] of segs) if (b - a > 0.6) winOps.push({ a, b, y0: fy + 0.95, y1: fy + 1.85 });
  const sides = [['n', z0 + wt / 2, o.doorsN || [false, false], -1], ['s', z1 - wt / 2, o.doorsS || [false, false], 1]];
  for (const [, zw, doors, sg] of sides) {
    const ops = winOps.concat(doorX.map((dx) => ({ a: dx - dw / 2, b: dx + dw / 2, y0: fy, y1: fy + dh })));
    L.wallX(x0, x1, zw, fy, fy + H, 'metalClean', wt, ops, { tint: col });
    // glass (solid for movement, transparent to sight)
    for (const q of winOps) {
      L.box(q.a, q.y0, zw - 0.015, q.b, q.y1, zw + 0.015, 'glassDirty', { collide: false, tint: 0x2a3234 });
      L.clip(q.a, q.y0, zw - 0.04, q.b, q.y1, zw + 0.04, F_SOLID | F_SHOOT);
    }
    // exterior stripe + door leaves
    const zo = zw + sg * (wt / 2);
    for (const [a, b] of [[x0, doorX[0] - dw / 2], [doorX[0] + dw / 2, doorX[1] - dw / 2], [doorX[1] + dw / 2, x1]]) {
      L.box(a, fy + 0.62, zo, b, fy + 0.78, zo + sg * 0.012, 'paintedBlue', { collide: false, tint: o.stripe ?? 0x2a58a8 });
    }
    doors.forEach((open, i) => {
      const dx = doorX[i];
      if (open) {
        // leaves slid into the wall pockets (visible edge only)
        for (const s of [-1, 1]) L.box(dx + s * (dw / 2) - 0.02, fy, zw - wt / 2 - 0.01, dx + s * (dw / 2) + 0.02, fy + dh, zw + wt / 2 + 0.01, 'rubber', { collide: false, tint: 0x1a1a1a });
      } else {
        for (const s of [-1, 1]) {
          const a = s < 0 ? dx - dw / 2 : dx, b = s < 0 ? dx : dx + dw / 2;
          L.box(a + 0.01, fy, zw - 0.03, b - 0.01, fy + dh, zw + 0.03, 'metalClean', { tint: col });
          L.box(a + 0.12, fy + 1.05, zw - 0.035, b - 0.12, fy + 1.8, zw + 0.035, 'glassDirty', { collide: false, tint: 0x20282a });
        }
      }
    });
  }
  // ---- end walls
  for (const [end, xw] of [['w', x0 + wt / 2], ['e', x1 - wt / 2]]) {
    const kind = end === 'w' ? o.endW ?? 'closed' : o.endE ?? 'closed';
    const cab = kind === 'cab' || kind === 'cabClosed';
    const ops = [{ a: cz - 0.62, b: cz + 0.62, y0: fy, y1: fy + dh }];
    if (cab) ops.push({ a: z0 + 0.25, b: cz - 0.8, y0: fy + 1.0, y1: fy + 1.85 }, { a: cz + 0.8, b: z1 - 0.25, y0: fy + 1.0, y1: fy + 1.85 });
    L.wallZ(z0 + wt, z1 - wt, xw, fy, fy + H, 'metalClean', wt, ops, { tint: col });
    if (kind === 'closed' || kind === 'cabClosed') L.box(xw - 0.03, fy, cz - 0.6, xw + 0.03, fy + dh, cz + 0.6, 'metalClean', { tint: col });
    if (cab) {
      const sg = end === 'w' ? -1 : 1;
      for (const [a, b] of [[z0 + 0.25, cz - 0.8], [cz + 0.8, z1 - 0.25]]) {
        L.box(xw - 0.015, fy + 1.0, a, xw + 0.015, fy + 1.85, b, 'glassDirty', { collide: false, tint: 0x2a3234 });
        L.clip(xw - 0.04, fy + 1.0, a, xw + 0.04, fy + 1.85, b, F_SOLID | F_SHOOT);
      }
      // headlights / marker lights on the nose
      for (const s of [-1, 1]) L.box(xw + sg * 0.05, fy + 0.35, cz + s * 1.1 - 0.12, xw + sg * 0.07, fy + 0.55, cz + s * 1.1 + 0.12, o.headlights ? 'emissiveWarm' : 'blackMatte', NC);
      L.box(xw + sg * 0.05, fy + 2.0, cz - 0.5, xw + sg * 0.07, fy + 2.22, cz + 0.5, 'blackMatte', NC);
      sgn(L, o.dest ?? 'OUT OF SERVICE', xw + sg * 0.075, fy + 2.11, cz, sg > 0 ? -Math.PI / 2 : Math.PI / 2, 0.95, 0.19, { bg: '#0c0c0c', fg: '#ffa020', glow: o.lit ? 1.2 : 0, light: false });
    }
  }
  // ---- roof & ceiling liner
  L.box(x0, fy + H, z0, x1, fy + H + 0.03, z1, 'plasticGloss', { tint: 0xb8b8b0 });
  L.box(x0 - 0.02, fy + H + 0.03, z0 - 0.02, x1 + 0.02, fy + H + 0.25, z1 + 0.02, 'metalClean', { tint: col });
  for (const s of [-1, 1]) L.box(x0 + 0.5, fy + H - 0.03, cz + s * 0.55 - 0.1, x1 - 0.5, fy + H, cz + s * 0.55 + 0.1, o.lit ? 'emissiveCool' : 'blackMatte', { collide: false, tint: o.lit ? 0x888888 : 0x333333 });
  // ---- interior: longitudinal seats between the doors
  const seatCol = o.seat ?? 0x8a5a2a;
  const seatSpans = [[x0 + wt + 0.4, doorX[0] - dw / 2 - 0.15], [doorX[0] + dw / 2 + 0.15, doorX[1] - dw / 2 - 0.15], [doorX[1] + dw / 2 + 0.15, x1 - wt - 0.4]];
  for (const [a, b] of seatSpans) {
    for (const s of [-1, 1]) {
      const zi = s < 0 ? z0 + wt : z1 - wt;
      const za = s < 0 ? zi : zi - 0.48, zb = s < 0 ? zi + 0.48 : zi;
      L.box(a, fy, za, b, fy + 0.3, zb, 'metalClean', { tint: 0x8a8e8e });
      L.box(a, fy + 0.3, za, b, fy + 0.46, zb, 'plasticGloss', { tint: seatCol });
      L.box(a, fy + 0.46, s < 0 ? zi : zi - 0.07, b, fy + 1.0, s < 0 ? zi + 0.07 : zi, 'plasticGloss', { collide: false, tint: seatCol });
    }
  }
  // poles & grab rails (visual)
  const p = P.prop(L, cx, fy, cz, 0);
  for (const dx of doorX) for (const s of [-1, 1]) p.cyl(dx - cx + s * 1.0, H / 2, 0, 0.022, H, 'chrome', null, null, 8);
  for (const s of [-1, 1]) P.pipe(L, x0 + 0.8, fy + 1.9, cz + s * 0.85, x1 - 0.8, fy + 1.9, cz + s * 0.85, 0.016, 'chrome');
  // interior ad cards above the windows
  if (o.ads) {
    for (const [i, t] of o.ads.entries()) {
      const s = i % 2 ? 1 : -1;
      const x = cx - len * 0.3 + (i >> 1) * len * 0.6;
      sgn(L, t, x, fy + 2.05, s < 0 ? z0 + wt + 0.2 : z1 - wt - 0.2, s < 0 ? Math.PI : 0, 1.3, 0.3, { bg: '#e8e0c8', fg: '#2a2a3a' });
    }
  }
  if (o.number) {
    for (const s of [-1, 1]) sgn(L, String(o.number), x0 + 1.2, fy + 2.05, s < 0 ? z0 - 0.02 : z1 + 0.02, s < 0 ? 0 : Math.PI, 0.5, 0.26, { bg: '#1a1a1a', fg: '#e8e8e8' });
  }
  const lights = [];
  if (o.lit) {
    for (const k of [-0.28, 0.28]) lights.push(L.light(cx + k * len, fy + H - 0.3, cz, 0xd8f0ff, o.intensity ?? 7, 7.5, { flicker: o.flicker ?? 0.3, buzz: 1 }));
  }
  L.reverb(x0, fy, z0, x1, fy + H, z1, 'room');
  return { fy, x0, x1, z0, z1, doorX, lights };
}

// Bellows gangway between two coupled cars (xa: end of car A, xb: start of car B).
export function gangway(L, xa, xb, ty, cz) {
  const fy = ty + 1.2;
  L.box(xa - 0.1, fy - 0.3, cz - 0.62, xb + 0.1, fy, cz + 0.62, 'diamond', { tint: 0x777777 });
  for (const s of [-1, 1]) L.box(xa, fy, cz + s * 0.7 - 0.05, xb, fy + 2.1, cz + s * 0.7 + 0.05, 'rubber', { tint: 0x222222 });
  L.box(xa, fy + 2.1, cz - 0.75, xb, fy + 2.2, cz + 0.75, 'rubber', { tint: 0x222222 });
  // couplers below
  L.box(xa - 0.3, ty + 0.55, cz - 0.15, xb + 0.3, ty + 0.8, cz + 0.15, 'metalDark', NC);
}

// Derailed, closed-up car (not enterable). Visual rotated shell + oriented collision.
// (cx, y, cz): centre at the bottom of the body; ry yaw, rx roll (about the length axis), rz pitch.
export function wreckCar(L, cx, y, cz, ry, o = {}) {
  const len = o.len ?? 15, W = CAR_W, H = 3.4;
  const col = o.color ?? 0x8a8e90;
  const p = P.prop(L, cx, y, cz, ry);
  p.base = trs(cx, y, cz, o.rx ?? 0, ry, o.rz ?? 0);
  const body = o.burnt ? 'rust' : 'metalClean';
  const bc = o.burnt ? 0x4a3a30 : col;
  p.box(0, 0.45, 0, len - 1.0, 0.6, W - 0.5, 'metalDark', 0x4a4a4a);
  p.box(0, 0.95, 0, len, 0.4, W, body, bc);
  for (const s of [-1, 1]) {
    p.box(0, 1.55, s * (W / 2 - 0.04), len, 0.8, 0.08, body, bc);
    p.box(0, 2.35, s * (W / 2 - 0.04), len - 0.2, 0.8, 0.07, o.burnt ? 'blackMatte' : 'glassDirty', o.burnt ? 0x080808 : 0x1c2224);
    p.box(0, 3.0, s * (W / 2 - 0.04), len, 0.5, 0.08, body, bc);
    for (let i = -3; i <= 3; i++) p.box(i * 2.1, 2.35, s * (W / 2 - 0.04), 0.25, 0.8, 0.1, body, bc);
    p.box(0, 1.45, s * (W / 2 + 0.005), len, 0.14, 0.01, 'paintedBlue', o.burnt ? 0x2a2420 : 0x2a58a8);
    for (const dx of [-len / 4, len / 4]) p.box(dx, 1.75, s * (W / 2 + 0.01), 1.3, 2.0, 0.02, 'metalClean', o.burnt ? 0x3a3028 : 0xb0b4b4);
  }
  p.box(0, 3.3, 0, len, 0.2, W, body, bc);
  for (const s of [-1, 1]) {
    p.box(s * (len / 2 - 0.04), 2.15, 0, 0.08, 2.4, W, body, bc);
    p.box(s * (len / 2 - 0.02), 2.3, 0, 0.06, 0.7, W - 0.6, 'glassDirty', 0x1c2224);
  }
  for (const bx of [-len / 2 + 2.6, len / 2 - 2.6]) for (const wx of [-0.75, 0.75]) for (const s of [-1, 1]) p.cyl(bx + wx, 0.4, s * 0.72, 0.4, 0.12, 'metalDark', 0x333333, [Math.PI / 2, 0, 0], 12);
  orientedCol(L, cx, cz, len, W, ry, y, y + 3.4, o.segs ?? 10);
  return p;
}

// ------------------------------------------------------------------ signs --
// NOTE: kit.sign() orients its quad with rotation.y = ry, so ry=0 actually faces +Z
// (LEVEL_GUIDE.md documents the opposite). These wrappers use the prop convention
// (front faces -Z at ry=0, PI/2 faces -X) and put the glow light in front.
export function sgn(L, text, x, y, z, ry, w, h, o = {}) {
  const m = sign(L, text, x, y, z, ry + Math.PI, w, h, Object.assign({}, o, { light: false }));
  if (o.glow && o.light !== false) L.light(x - Math.sin(ry) * 0.5, y, z - Math.cos(ry) * 0.5, o.lightColor ?? 0xff4030, o.lightIntensity ?? 4, 6);
  return m;
}
export function graf(L, text, x, y, z, ry, w = 2, h = 0.8, color = '#b8201a') {
  return sgn(L, text, x, y, z, ry, w, h, { fg: color, spray: true, font: 'Impact, Arial Black, sans-serif', w: 512, h: 200 });
}

// --------------------------------------------------------------- dressing --
// Framed advertisement / poster on a wall.
export function poster(L, text, x, y, z, ry, w, h, o = {}) {
  const fx = -Math.sin(ry), fz = -Math.cos(ry); // facing direction (towards the reader)
  const p = P.prop(L, x, y, z, ry);
  p.box(0, 0, -0.015, w + 0.12, h + 0.12, 0.03, 'metalDark', o.frame ?? 0x3a3a3a);
  sgn(L, text, x + fx * 0.035, y, z + fz * 0.035, ry, w, h, { bg: o.bg ?? '#e8e2d0', fg: o.fg ?? '#1a1a2a', border: o.border, font: o.font, glow: o.glow, light: false });
}
// Row of metal lockers (front faces -Z before rotation).
export function lockers(L, x, y, z, ry, n = 4, tint = 0x5a6a7a, openIdx = -1) {
  const p = P.prop(L, x, y, z, ry);
  const w = 0.46 * n;
  p.box(0, 0.95, 0, w, 1.9, 0.5, 'metal', tint);
  for (let i = 0; i < n; i++) {
    const lx = -w / 2 + 0.23 + i * 0.46;
    if (i === openIdx) {
      p.box(lx, 0.97, -0.24, 0.4, 1.78, 0.02, 'blackMatte', 0x111111);
      p.box(lx - 0.2, 0.97, -0.45, 0.02, 1.78, 0.4, 'metal', tint, [0, 0.3, 0]);
    } else {
      p.box(lx, 0.97, -0.255, 0.42, 1.8, 0.012, 'metal', tint);
      for (let k = 0; k < 3; k++) p.box(lx, 1.6 + k * 0.05, -0.265, 0.24, 0.02, 0.005, 'metalDark');
      p.box(lx + 0.14, 1.05, -0.27, 0.03, 0.12, 0.02, 'chrome');
    }
  }
  p.col(0, 0.95, 0, w, 1.9, 0.5, 'metal');
  return p;
}
// Glass-topped display counter (pawn shop).
export function displayCase(L, x, y, z, ry, len = 2.2) {
  const p = P.prop(L, x, y, z, ry);
  p.box(0, 0.4, 0, len, 0.8, 0.7, 'woodDark', 0x6a4a30);
  p.box(0, 0.82, 0, len, 0.04, 0.7, 'metalClean');
  for (const s of [-1, 1]) p.box(s * (len / 2 - 0.02), 1.02, 0, 0.03, 0.36, 0.7, 'chrome');
  p.box(0, 1.21, 0, len, 0.02, 0.7, 'glass', 0xd8eeee);
  p.box(0, 1.02, -0.34, len - 0.04, 0.36, 0.01, 'glass', 0xd8eeee);
  const gold = [0xd8b040, 0xc8c8d0, 0xe0c060, 0xa8a8b0, 0x40a0e0, 0xd02030];
  for (let i = 0; i < Math.floor(len * 6); i++) {
    const lx = -len / 2 + 0.12 + rng() * (len - 0.24), lz = -0.25 + rng() * 0.5;
    if (rng() < 0.5) p.box(lx, 0.86, lz, 0.05, 0.02, 0.07, 'chrome', gold[Math.floor(rng() * gold.length)]);
    else p.box(lx, 0.87, lz, 0.1, 0.04, 0.1, 'plastic', rng() < 0.5 ? 0x1a1a1a : 0x5a2a2a);
  }
  p.col(0, 0.61, 0, len, 1.22, 0.7, 'wood', F_DEFAULT);
  return p;
}
// Acoustic / electric guitar hanging on a wall (y = centre of the body), faces -Z.
export function guitar(L, x, y, z, ry, color = 0x9a5a2a, electric = false) {
  const p = P.prop(L, x, y, z, ry);
  const R = [Math.PI / 2, 0, 0];
  if (electric) {
    p.box(0, 0, 0, 0.34, 0.42, 0.05, 'plasticGloss', color, [0, 0, 0.2]);
    p.box(0.06, 0.02, -0.03, 0.08, 0.2, 0.01, 'blackMatte');
  } else {
    p.cyl(0, 0, 0, 0.2, 0.09, 'woodPale', color, R, 14);
    p.cyl(0, 0.26, 0, 0.155, 0.09, 'woodPale', color, R, 14);
    p.cyl(0, 0.13, -0.047, 0.05, 0.004, 'blackMatte', null, R, 10);
  }
  p.box(0, 0.65, 0, 0.055, 0.62, 0.03, 'woodDark');
  p.box(0, 1.0, 0, 0.085, 0.15, 0.03, 'woodDark');
  p.box(0, 1.1, 0.02, 0.04, 0.04, 0.04, 'metalDark');
  return p;
}
// Old CRT television on a surface (faces -Z).
export function crt(L, x, y, z, ry, s = 1, on = false) {
  const p = P.prop(L, x, y, z, ry);
  p.box(0, 0.22 * s, 0.02, 0.5 * s, 0.44 * s, 0.46 * s, 'plastic', rng() < 0.5 ? 0x2a2a2a : 0x6a6a64);
  p.box(0, 0.23 * s, -0.215 * s, 0.4 * s, 0.32 * s, 0.01, on ? 'emissiveCool' : 'glassDirty', on ? 0x445566 : 0x1a2022);
  return p;
}
// Metal shelving unit with random boxes (faces -Z).
export function shelving(L, x, y, z, ry, w = 1.8, h = 2.0, fill = 0.7) {
  const p = P.prop(L, x, y, z, ry);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.box(sx * (w / 2 - 0.03), h / 2, sz * 0.22, 0.04, h, 0.04, 'metalDark');
  for (let k = 0; k < 4; k++) {
    const sy = 0.12 + k * (h - 0.2) / 3;
    p.box(0, sy, 0, w, 0.03, 0.5, 'metal', 0x8a8a84);
    let bx = -w / 2 + 0.08;
    while (bx < w / 2 - 0.2 && k < 3) {
      const bw = 0.2 + rng() * 0.35;
      if (rng() < fill) p.box(bx + bw / 2, sy + 0.015 + 0.12, (rng() - 0.5) * 0.1, bw - 0.03, 0.24 + rng() * 0.1, 0.36, rng() < 0.6 ? 'fabric' : 'plastic', [0x9a8060, 0x8a7a60, 0x5a6a7a, 0x7a3a2a, 0xb0a890][Math.floor(rng() * 5)]);
      bx += bw;
    }
  }
  p.col(0, h / 2, 0, w, h, 0.5, 'metal');
  return p;
}
// Cable tray along X on a wall (visual).
export function cableTrayX(L, x0, x1, y, z, side = 1) {
  L.box(x0, y, z, x1, y + 0.04, z + side * 0.35, 'metalDark', NC);
  L.box(x0, y + 0.04, z + side * 0.33, x1, y + 0.12, z + side * 0.35, 'metalDark', NC);
  for (let i = 0; i < 3; i++) L.box(x0, y + 0.04, z + side * (0.06 + i * 0.09), x1, y + 0.1, z + side * (0.12 + i * 0.09), 'rubber', { collide: false, tint: [0x1a1a1a, 0x3a2a1a, 0x222a3a][i] });
  for (let x = x0 + 1; x < x1; x += 3) L.box(x, y - 0.3, z, x + 0.05, y, z + side * 0.05, 'metalDark', NC);
}
// Transformer / switchgear block with cooling fins (faces -Z).
export function transformer(L, x, y, z, ry, w = 2.2, d = 1.6, h = 2.2) {
  const p = P.prop(L, x, y, z, ry);
  p.box(0, 0.08, 0, w + 0.2, 0.16, d + 0.2, 'concreteDark');
  p.box(0, h / 2 + 0.16, 0, w, h, d, 'paintedGreen', 0x5a6a5a);
  for (let i = 0; i < 7; i++) p.box(-w / 2 + 0.2 + i * (w - 0.4) / 6, h / 2 + 0.1, -d / 2 - 0.08, 0.05, h * 0.8, 0.16, 'metal', 0x6a7a6a);
  p.box(0, h + 0.3, 0, 0.3, 0.3, 0.3, 'plasticGloss', 0x8a6a4a);
  p.box(0, h * 0.75, -d / 2 - 0.17, 0.5, 0.35, 0.01, 'paintedYellow', 0xc8a020);
  p.col(0, h / 2 + 0.1, 0, w + 0.2, h + 0.2, d + 0.3, 'metal');
  return p;
}
// Big diesel generator set (length along local X, control side faces -Z).
export function dieselGen(L, x, y, z, ry, o = {}) {
  const p = P.prop(L, x, y, z, ry);
  p.box(0, 0.15, 0, 7.2, 0.3, 2.6, 'metalDark');
  p.box(-0.9, 1.3, 0, 4.4, 2.0, 2.1, 'paintedYellow', o.color ?? 0xb08a22);
  for (let i = 0; i < 9; i++) p.box(-2.8 + i * 0.44, 1.35, -1.06, 0.06, 1.5, 0.02, 'metalDark');
  p.box(2.3, 1.45, 0, 1.1, 2.3, 2.3, 'metal', 0x5a5e5a);
  for (let i = 0; i < 8; i++) p.box(2.86, 0.6 + i * 0.25, 0, 0.02, 0.12, 2.1, 'metalDark');
  p.box(-3.3, 1.2, 0, 0.8, 1.8, 1.9, 'paintedGreen', 0x3a5a4a);
  p.box(-0.9, 2.45, 0, 3.8, 0.3, 1.4, 'metalDark');
  p.cyl(-2.2, 2.9, 0.4, 0.13, 0.9, 'metalDark', 0x4a4a4a, null, 10);
  p.cyl(0.4, 2.9, 0.4, 0.13, 0.9, 'metalDark', 0x4a4a4a, null, 10);
  p.cyl(1.0, 0.75, -1.25, 0.35, 0.4, 'metal', 0x6a6a64, [Math.PI / 2, 0, 0], 14);
  p.col(0, 1.3, 0, 7.2, 2.6, 2.6, 'metal');
  return p;
}
// Invisible-collider railing with visible posts and rails along X or Z.
// gaps: [[a,b], ...] along the rail where it is broken (infected drop through).
export function railing(L, axis, a0, a1, fixed, y, gaps = [], o = {}) {
  const h = o.h ?? 1.05;
  const spans = [];
  let cur = a0;
  for (const [g0, g1] of gaps.slice().sort((p, q) => p[0] - q[0])) { if (g0 > cur) spans.push([cur, g0]); cur = Math.max(cur, g1); }
  if (cur < a1) spans.push([cur, a1]);
  for (const [a, b] of spans) {
    if (b - a < 0.05) continue;
    if (axis === 'x') {
      L.box(a, y + h - 0.05, fixed - 0.03, b, y + h, fixed + 0.03, 'paintedYellow', { collide: false, tint: o.tint ?? 0xb89a2a });
      L.box(a, y + h * 0.5 - 0.02, fixed - 0.02, b, y + h * 0.5 + 0.02, fixed + 0.02, 'metalDark', NC);
      L.box(a, y, fixed - 0.06, b, y + 0.1, fixed + 0.06, 'metalDark', NC);
      for (let x = a; x <= b + 0.01; x += Math.max(0.5, (b - a) / Math.max(1, Math.round((b - a) / 1.5)))) L.box(x - 0.03, y, fixed - 0.03, x + 0.03, y + h, fixed + 0.03, 'metalDark', NC);
      L.clip(a, y, fixed - 0.05, b, y + h, fixed + 0.05, F_SOLID);
    } else {
      L.box(fixed - 0.03, y + h - 0.05, a, fixed + 0.03, y + h, b, 'paintedYellow', { collide: false, tint: o.tint ?? 0xb89a2a });
      L.box(fixed - 0.02, y + h * 0.5 - 0.02, a, fixed + 0.02, y + h * 0.5 + 0.02, b, 'metalDark', NC);
      L.box(fixed - 0.06, y, a, fixed + 0.06, y + 0.1, b, 'metalDark', NC);
      for (let z = a; z <= b + 0.01; z += Math.max(0.5, (b - a) / Math.max(1, Math.round((b - a) / 1.5)))) L.box(fixed - 0.03, y, z - 0.03, fixed + 0.03, y + h, z + 0.03, 'metalDark', NC);
      L.clip(fixed - 0.05, y, a, fixed + 0.05, y + h, b, F_SOLID);
    }
  }
}

// ------------------------------------------------------------ dynamics --
// Intermittent electrical sparks with a blue-white flash (optionally a shock hazard).
export function sparker(L, x, y, z, o = {}) {
  const g = L.game;
  const light = L.light(x, y, z, 0xa8c8ff, 0, o.range ?? 6, { on: false });
  let t = Math.random() * 2;
  const pos = new THREE.Vector3(x, y, z);
  const d = {
    update(dt) {
      if (light.intensity > 0) { light.intensity = Math.max(0, light.intensity - dt * 70); light.on = light.intensity > 0.2; }
      t -= dt;
      if (t > 0) return;
      t = (o.min ?? 0.5) + Math.random() * (o.max ?? 2.5);
      const cp = g.camPos;
      if (!cp || (cp.x - x) ** 2 + (cp.z - z) ** 2 > 2200) return;
      g.fx.sparks(x, y, z, o.nx ?? 0, o.ny ?? -0.2, o.nz ?? 0, 8 + Math.floor(Math.random() * 16), [0.75, 0.88, 1], 5);
      if (Math.random() < 0.5) g.fx.sparks(x, y, z, 0, 1, 0, 6, [1, 0.8, 0.4], 3);
      light.intensity = o.intensity ?? 9;
      light.on = true;
      if (Math.random() < 0.6) g.audio.play('radioStatic', { pos, vol: o.vol ?? 0.25, rate: 1.6 });
    },
  };
  L.dynamics.push(d);
  if (o.hazard) L.hazard(...o.hazard, 'electric', o.dps ?? 18);
  return d;
}
// Periodic positional one-shot (infected banging behind a door, dripping water...).
export function soundEmitter(L, x, y, z, names, o = {}) {
  const g = L.game;
  const pos = new THREE.Vector3(x, y, z);
  let t = (o.first ?? 3) + Math.random() * 3;
  const e = {
    enabled: true,
    update(dt) {
      if (!e.enabled) return;
      t -= dt;
      if (t > 0) return;
      const burst = o.burst ?? 1;
      t = (o.min ?? 4) + Math.random() * (o.max ?? 8);
      const cp = g.camPos;
      if (!cp || (cp.x - x) ** 2 + (cp.z - z) ** 2 > (o.range ?? 45) ** 2) return;
      for (let i = 0; i < burst; i++) setTimeout(() => g.audio.play(names[Math.floor(Math.random() * names.length)], { pos, vol: o.vol ?? 0.6 }), i * (o.gap ?? 350));
      if (o.dust) g.fx.dust(x, y + 1.5, z, o.dust[0], 0, o.dust[1], [0.4, 0.38, 0.35], 3, 0.4);
    },
  };
  L.dynamics.push(e);
  return e;
}
