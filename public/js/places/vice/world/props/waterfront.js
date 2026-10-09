// Where the land meets the water: concrete seawalls (a face with a dark tide
// band and a capped edge) along every 'wall' shore and both banks of the
// canals, riprap boulders on the 'rocks' shores, mangrove clumps along the
// south coast, three marinas (South Pointe, Bayside, Dinner Key) with floating
// docks, pilings, gangways and moored boats that bob on the swell, channel
// markers leading ships from the ocean round South Pointe to the port, and
// the swimming-area buoys off the beach.
import * as THREE from 'three';
import { V } from '../../state.js';
import { L, tint, shade, cyl, cylAB, tri, resample, offsetLine, rnd, hash, mergeColored, faceUp, GROUND, TAU } from './kit.js';
import { SP } from './flora.js';
import { modelGeometry, hasModel } from '../../assets/models.js';
import { hull } from './port.js';
import { frame } from './beach.js';

const TOP = GROUND + 0.5;    // the seawall cap
const FACE = -3.5;           // the face stands this far out from the coast line (hides the height map's slope)
const BACK = 1.6;            // the cap reaches this far inland
const MAPH = 4090;
const T = { low: [0.2, 0.22, 0.18], tide: [0.42, 0.42, 0.36], face: [0.8, 0.78, 0.74], cap: [0.88, 0.87, 0.84] };
const inMap = (x, z) => Math.abs(x) < MAPH && Math.abs(z) < MAPH;

// marinas: a stretch of coast (in the land polygon's order, so + is inland), the arc length range for the docks
const MARINAS = [
  { id: 'southpointe', land: 'beach', pts: [[2140, 2520], [2010, 2280], [1960, 1800]], from: 60, to: 600, slips: 'yacht' },
  { id: 'bayside', land: 'mainland', pts: [[580, -1000], [560, -700], [600, -350]], from: 90, to: 330, slips: 'mixed' },
  { id: 'dinnerkey', land: 'mainland', pts: [[330, 2000], [180, 2450], [-60, 2900]], from: 420, to: 820, slips: 'sail' },
];
// the ship channel from the ocean round South Pointe, up the bay to the port
const CHANNEL = [[3900, 2800], [2600, 2790], [1700, 2700], [1480, 2300], [1440, 1200], [1420, 400], [1380, -160]];

export function buildWaterfront(P) {
  const plan = P.plan;
  P.marinas = [];
  // ---- the shores ----
  for (const Ld of plan.lands) {
    const pts = Ld.pts, n = pts.length;
    const kindOf = (i) => (Ld.beachSet.has(i) ? 'beach' : Ld.mangroveSet.has(i) ? 'mangrove' : Ld.shore);
    let start = 0;
    while (start < n && kindOf(start) === kindOf((start - 1 + n) % n)) start++;
    const closed = start >= n;
    if (closed) start = 0;
    let run = null, rk = null;
    const flush = () => {
      if (run && run.length > 1) {
        if (rk === 'wall') seawall(P, run, closed && run.length === n + 1);
        else if (rk === 'rocks') riprap(P, run);
        else if (rk === 'mangrove') mangroves(P, run);
      }
      run = null;
    };
    for (let k = 0; k < n; k++) {
      const i = (start + k) % n, a = pts[i], b = pts[(i + 1) % n], kd = kindOf(i);
      const out = !inMap(a[0], a[1]) && !inMap(b[0], b[1]);
      if (out || kd !== rk) { flush(); rk = kd; }
      if (out) continue;
      if (!run) run = [a];
      run.push(b);
    }
    flush();
  }
  // ---- the canals: both banks, and round the ends that are inland ----
  for (const c of plan.canals) {
    const hw = c.w / 2;
    for (const side of [-1, 1]) {
      const face = offsetLine(c.pts, side * (hw + FACE)), lip = offsetLine(c.pts, side * (hw + FACE - 0.35)), back = offsetLine(c.pts, side * (hw + BACK)), land = offsetLine(c.pts, side * (hw + 6));
      wallRun(P, face, lip, back, (i, t) => { const p = lerp2(land[i], land[i + 1], t); return plan.isLand(p[0], p[1]) && inMap(p[0], p[1]); });
    }
    for (const end of [0, 1]) {
      const p = end ? c.pts[c.pts.length - 1] : c.pts[0], q = end ? c.pts[c.pts.length - 2] : c.pts[1];
      const dx = p[0] - q[0], dz = p[1] - q[1], l = Math.hypot(dx, dz), ux = dx / l, uz = dz / l;
      if (!plan.isLand(p[0] + ux * (hw + 6), p[1] + uz * (hw + 6))) continue;
      // a half circle round the end
      const arc = (r) => { const o = []; const a0 = Math.atan2(uz, ux); for (let k = 0; k <= 10; k++) { const a = a0 - Math.PI / 2 + (k / 10) * Math.PI; o.push([p[0] + Math.cos(a) * r, p[1] + Math.sin(a) * r]); } return o; };
      wallRun(P, arc(hw + FACE), arc(hw + FACE - 0.35), arc(hw + BACK), () => true);
    }
  }
  // ---- marinas ----
  for (const M of MARINAS) marina(P, M);
  // mega-yachts moored off Star Island and Brickell Key
  for (const [x, z, h, L, liv] of [[1300, -1648, Math.PI / 2, 150, 0], [1500, -1650, -Math.PI / 2, 120, 2], [940, 230, 0, 110, 1]]) if (P.ground.heightAt(x, z) < -3) yacht(P, x, z, h, L, liv);
  // ---- channel markers ----
  const ch = resample(CHANNEL, 330);
  for (let i = 1; i < ch.length - 1; i++) {
    const s = ch[i];
    for (const side of [-1, 1]) {
      const x = s.x - s.tz * 75 * side, z = s.z + s.tx * 75 * side;
      if (P.ground.heightAt(x, z) > -3 || P.roads.near(x, z, 30)) continue;
      // heading to the port, red is on the right (side +1 = right of travel)
      marker(P, x, z, side > 0);
    }
  }
}
const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/** A vertical quad from ground points a to b, heights y0..y1, facing direction (nx, nz). */
function vquad(g, a, b, y0, y1, nx, nz, o) {
  const tx = b[0] - a[0], tz = b[1] - a[1];
  if (-tz * nx + tx * nz < 0) { const t = a; a = b; b = t; }
  g.quad([a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]], o);
}

/** A seawall along a run of the coast (in the polygon's order: + is inland). */
function seawall(P, run, closed) {
  const pts = closed ? run.slice(0, -1) : run;
  const face = offsetLine(pts, FACE, closed), lip = offsetLine(pts, FACE - 0.35, closed), back = offsetLine(pts, BACK, closed);
  wallRun(P, face, lip, back, () => true);
}
/** The wall itself, from three parallel lines (face, lip, back) with the same points; ok(i, t) says where to build. */
function wallRun(P, face, lip, back, ok) {
  let since = 0;
  for (let i = 0; i < face.length - 1; i++) {
    const len = Math.hypot(face[i + 1][0] - face[i][0], face[i + 1][1] - face[i][1]);
    const k = Math.max(1, Math.ceil(len / 16));
    for (let j = 0; j < k; j++) {
      const t0 = j / k, t1 = (j + 1) / k, tm = (t0 + t1) / 2;
      const F0 = lerp2(face[i], face[i + 1], t0), F1 = lerp2(face[i], face[i + 1], t1);
      const L0 = lerp2(lip[i], lip[i + 1], t0), L1 = lerp2(lip[i], lip[i + 1], t1);
      const B0 = lerp2(back[i], back[i + 1], t0), B1 = lerp2(back[i], back[i + 1], t1);
      const mx = (F0[0] + F1[0] + B0[0] + B1[0]) / 4, mz = (F0[1] + F1[1] + B0[1] + B1[1]) / 4;
      if (!inMap(mx, mz) || !ok(i, tm) || P.roads.clear(mx, mz) < 1.5) { since = 0; continue; }
      // outward: from the back line towards the face
      let nx = (F0[0] + F1[0] - B0[0] - B1[0]) / 2, nz = (F0[1] + F1[1] - B0[1] - B1[1]) / 2; const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl;
      const g = P.C.get('surf', mx, mz);
      vquad(g, F0, F1, -8, 0.2, nx, nz, { lay: L.concrete, tint: T.low, scale: 10 });
      vquad(g, F0, F1, 0.2, TOP - 0.55, nx, nz, { lay: L.concrete, tint: T.face, scale: 10 });
      vquad(g, L0, L1, TOP - 0.55, TOP, nx, nz, { lay: L.concrete, tint: T.cap, scale: 8 });
      vquad(g, B0, B1, GROUND - 0.3, TOP, -nx, -nz, { lay: L.concrete, tint: T.cap, scale: 8 });
      g.quad([L0[0], TOP, L0[1]], [L1[0], TOP, L1[1]], [B1[0], TOP, B1[1]], [B0[0], TOP, B0[1]], { lay: L.concrete, tint: T.cap, scale: 8, normal: [0, 1, 0] });
      faceUp(g);
      // a low step for people every few pieces
      if (since++ % 3 === 0) {
        const cx = (L0[0] + L1[0] + B0[0] + B1[0]) / 4, cz = (L0[1] + L1[1] + B0[1] + B1[1]) / 4, pl = Math.hypot(L1[0] - L0[0], L1[1] - L0[1]);
        P.box(cx, TOP - 0.4, cz, (BACK - FACE + 0.35) / 2, 0.4, pl * 1.5 + 0.5, Math.atan2(L1[0] - L0[0], L1[1] - L0[1]), 'concrete', { kerb: true, noBlock: true, seawall: true });
      }
    }
  }
}

/** Riprap: boulders piled along the shore. */
function riprap(P, run) {
  const r = rnd(run.length * 131 + Math.round(run[0][0]));
  const pts = run;
  for (const [d, sMin, sMax, step] of [[-8, 2.8, 4.0, 4.4], [-3.5, 2.2, 3.2, 3.6], [0.5, 1.6, 2.4, 3.6]]) {
    const line = resample(offsetLine(pts, d), step);
    for (const s of line) {
      const x = s.x + (r() - 0.5) * 2, z = s.z + (r() - 0.5) * 2;
      if (!inMap(x, z) || P.roads.clear(x, z) < 1) continue;
      const sc = sMin + r() * (sMax - sMin), y = P.ground.heightAt(x, z) + sc * 0.15;
      rock(P.C.get('surf', x, z), x, Math.max(y, -1.5), z, sc, Math.floor(r() * 1e6), r);
    }
  }
}
// a rock: an octahedron split once (18 corners, 32 faces), each corner pushed in or out
const ROCK = (() => {
  const V0 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  const F0 = [[0, 2, 4], [4, 2, 1], [1, 2, 5], [5, 2, 0], [4, 3, 0], [1, 3, 4], [5, 3, 1], [0, 3, 5]];
  const verts = V0.map((v) => v.slice()), key = new Map(), faces = [];
  const mid = (i, j) => {
    const k = i < j ? i * 64 + j : j * 64 + i;
    if (!key.has(k)) { const a = verts[i], b = verts[j], m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], l = Math.hypot(...m); verts.push([m[0] / l, m[1] / l, m[2] / l]); key.set(k, verts.length - 1); }
    return key.get(k);
  };
  for (const [a, b, c] of F0) { const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a); faces.push([a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]); }
  return { verts, faces };
})();
function rock(g, x, y, z, s, seed, r) {
  const sx = 0.8 + r() * 0.5, sy = 0.55 + r() * 0.3, sz = 0.8 + r() * 0.5, rot = r() * TAU, c = Math.cos(rot), sn = Math.sin(rot);
  const tn = hash(seed, 1, 1), col = [0.82 + tn * 0.18, 0.79 + tn * 0.15, 0.72 + tn * 0.12];
  const W = ROCK.verts.map((q, i) => {
    const j = 0.82 + hash(i * 97 + seed, i * 31, 3) * 0.36;
    const lx = q[0] * s * sx * j, ly = Math.max(-0.5, q[1]) * s * sy * j, lz = q[2] * s * sz * j;
    return [x + lx * c + lz * sn, y + ly, z - lx * sn + lz * c];
  });
  const o = { lay: L.concrete, tint: col, scale: 6 };
  for (const [a, b, d] of ROCK.faces) tri(g, W[a], W[b], W[d], o);
}

/** Mangroves: dense clumps on the mud flats and in the shallows. */
function mangroves(P, run) {
  const r = rnd(9001);
  const line = resample(run, 9);
  for (const s of line) {
    // a thicket: dense along the waterline, thinning out over the flats
    for (let k = 0; k < 5; k++) {
      const d = -38 + Math.pow(r(), 1.4) * 110, x = s.x - s.tz * d + (r() - 0.5) * 6, z = s.z + s.tx * d + (r() - 0.5) * 6;
      if (!inMap(x, z) || P.roads.clear(x, z) < 4 || !P.free(x, z, 4)) continue;
      const gy = P.ground.heightAt(x, z);
      if (gy > GROUND - 0.4 || gy < -3.5) continue; // only on the flats and in the shallows
      P.flora.add(SP.mangrove, x, Math.max(gy, -0.2), z, 0.9 + r() * 0.8, r() * TAU, 0, 0.75 + r() * 0.3);
    }
  }
}

// ---- marinas -----------------------------------------------------------------------------------
const DOCK_Y = 1.5, DOCK_W = 3.6, FINGER = 30, SLIP = 22, OUT = 26;
function marina(P, M) {
  const dock = offsetLine(M.pts, -OUT), line = resample(dock, 2);
  const pts = line.filter((s) => s.d >= M.from && s.d <= M.to);
  if (pts.length < 4) return;
  const deck = [0.82, 0.76, 0.68], side = [0.25, 0.27, 0.3];
  const info = { id: M.id, slips: [], kind: M.slips };
  P.marinas.push(info);
  // the main dock: a strip along the line
  for (let i = 0; i < pts.length - 1; i += 4) {
    const a = pts[i], b = pts[Math.min(pts.length - 1, i + 4)];
    deckStrip(P, a.x, a.z, b.x, b.z, DOCK_W, deck, side);
  }
  const a0 = pts[0], a1 = pts[pts.length - 1];
  P.phys.addDeck({ x: a0.x, y: DOCK_Y, z: a0.z }, { x: pts[Math.floor(pts.length / 2)].x, y: DOCK_Y, z: pts[Math.floor(pts.length / 2)].z }, DOCK_W);
  P.phys.addDeck({ x: pts[Math.floor(pts.length / 2)].x, y: DOCK_Y, z: pts[Math.floor(pts.length / 2)].z }, { x: a1.x, y: DOCK_Y, z: a1.z }, DOCK_W);
  // fingers out into the water, slips between them
  let k = 0;
  for (let d = M.from + 8; d <= M.to - 8; d += SLIP) {
    const s = pts.reduce((best, p) => (Math.abs(p.d - d) < Math.abs(best.d - d) ? p : best), pts[0]);
    const ox = s.tz, oz = -s.tx; // seaward (left of travel)
    const fx0 = s.x + ox * DOCK_W, fz0 = s.z + oz * DOCK_W, fx1 = s.x + ox * (DOCK_W + FINGER), fz1 = s.z + oz * (DOCK_W + FINGER);
    if (P.ground.heightAt(fx1, fz1) > -1.5) continue;
    deckStrip(P, fx0, fz0, fx1, fz1, 1.8, deck, side);
    P.phys.addDeck({ x: fx0, y: DOCK_Y, z: fz0 }, { x: fx1, y: DOCK_Y, z: fz1 }, 1.8);
    // pilings at the end of each finger
    const g = P.C.get('surf', fx1, fz1);
    for (const sx of [-1, 1]) {
      const px = fx1 + s.tx * 2.4 * sx, pz = fz1 + s.tz * 2.4 * sx;
      cyl(g, px, -7, pz, 0.75, 13.2, 7, { lay: L.deck, tint: [0.5, 0.42, 0.34], scale: 6, capTint: [0.95, 0.95, 0.95] });
    }
    // a dock light and a power post
    const gd = P.C.get('detail', fx0, fz0);
    gd.box(fx0 + s.tx * 2.5, DOCK_Y + 1.6, fz0 + s.tz * 2.5, 0.5, 1.6, 0.5, 0, { lay: L.concrete, tint: [0.92, 0.92, 0.9] });
    gd.box(fx0 + s.tx * 2.5, DOCK_Y + 3.35, fz0 + s.tz * 2.5, 0.42, 0.18, 0.42, 0, { lay: L.whiteTiles, tint: [1, 0.92, 0.75], glow: 1 });
    // the slip on the far side of this finger
    const cx = s.x + ox * (DOCK_W + FINGER * 0.55) + s.tx * SLIP / 2, cz = s.z + oz * (DOCK_W + FINGER * 0.55) + s.tz * SLIP / 2;
    if (P.ground.heightAt(cx, cz) < -2) {
      const slip = { x: cx, z: cz, heading: Math.atan2(ox, oz) + (hash(cx, cz, 1) < 0.5 ? 0 : Math.PI), k: k++ };
      info.slips.push(slip);
      if (M.slips === 'yacht' && hash(cx, cz, 2) < 0.6) { yacht(P, cx, cz, slip.heading, 48 + hash(cx, cz, 3) * 16, Math.floor(hash(cz, cx, 4) * 4)); slip.taken = true; }
    }
  }
  // gangways from the seawall to the dock at both ends and the middle
  for (const s of [pts[2], pts[Math.floor(pts.length / 2)], pts[pts.length - 3]]) {
    const ix = -s.tz, iz = s.tx; // inland
    const x0 = s.x + ix * DOCK_W, z0 = s.z + iz * DOCK_W, x1 = s.x + ix * (OUT + 1.5), z1 = s.z + iz * (OUT + 1.5);
    const g = P.C.get('surf', x0, z0), w = 2.2;
    const nx = -iz * w, nz = ix * w;
    g.quad([x0 + nx, DOCK_Y + 0.4, z0 + nz], [x1 + nx, TOP, z1 + nz], [x1 - nx, TOP, z1 - nz], [x0 - nx, DOCK_Y + 0.4, z0 - nz], { lay: L.shutter, tint: [0.7, 0.72, 0.75], scale: 3 });
    faceUp(g);
    for (const sd of [-1, 1]) cylAB(g, [x0 + nx * sd, DOCK_Y + 3.6, z0 + nz * sd], [x1 + nx * sd, TOP + 3.2, z1 + nz * sd], 0.12, 0.12, 4, { lay: L.concrete, tint: [0.85, 0.85, 0.85] });
    P.phys.addDeck({ x: x0, y: DOCK_Y + 0.4, z: z0 }, { x: x1, y: TOP, z: z1 }, w);
  }
}
/** A motor yacht: a sleek white hull, two or three decks with dark glass, a radar arch. Length L along its heading. */
const YACHT = [{ hull: 0xfbfbf8, boot: 0x1d3557 }, { hull: 0x1d2433, boot: 0x1d2433 }, { hull: 0xfbfbf8, boot: 0x0f9b8e }, { hull: 0xd9dde2, boot: 0x3a3f47 }];
function yacht(P, x, z, h, Lh, liv) {
  const Y = YACHT[liv % YACHT.length], W = Lh * 0.2, g = P.C.get('surf', x, z), F = frame(g, x, 0, z, h), FW = frame(P.C.get('win', x, z), x, 0, z, h);
  const white = tint(0xfbfbf8, 1.12), glass = { lay: L.whiteTiles, tint: [0.06, 0.08, 0.11], rough: 0.06, glow: 0.5, scale: 4 };
  const top = Lh * 0.075, keel = Lh * 0.05;
  hull(g, F, Lh, W, keel, top, tint(Y.hull, 1.12), tint(Y.boot, 1.1), 0.6);
  // decks: each shorter, stepping back, with raked fronts
  const decks = Lh > 100 ? 3 : 2;
  for (let k = 0; k < decks; k++) {
    const y0 = top + k * 4.6, zb = -Lh * (0.36 - k * 0.04), zf = Lh * (0.2 - k * 0.09), hw = W / 2 - 1.2 - k * 1.2, hh = 4.6;
    F.box(0, y0 + hh / 2, (zb + zf) / 2 - 1.5, hw, hh / 2, (zf - zb) / 2 - 1.5, { lay: L.stucco, tint: white, scale: 6 });
    // the raked front: a sloped windscreen
    F.quad([-hw, y0, zf - 3], [hw, y0, zf - 3], [hw, y0 + hh, zf - 3 - hh * 0.9], [-hw, y0 + hh, zf - 3 - hh * 0.9], glass);
    F.quad([hw, y0, zf - 3], [-hw, y0, zf - 3], [-hw, y0 + hh * 0.98, zf - 3 - hh * 0.88], [hw, y0 + hh * 0.98, zf - 3 - hh * 0.88], glass);
    for (const sx of [-1, 1]) FW.quad([sx * (hw + 0.05), y0 + 1.2, sx > 0 ? zf - 4 : zb + 2], [sx * (hw + 0.05), y0 + 1.2, sx > 0 ? zb + 2 : zf - 4], [sx * (hw + 0.05), y0 + 3.6, sx > 0 ? zb + 2 : zf - 4], [sx * (hw + 0.05), y0 + 3.6, sx > 0 ? zf - 4 : zb + 2], glass);
  }
  // the radar arch and a dome, the swim platform, a teak aft deck
  const ya = top + decks * 4.6;
  F.box(0, ya + 2.6, -Lh * 0.08, W / 2 - 3, 0.5, 1.4, { lay: L.stucco, tint: white });
  for (const sx of [-1, 1]) F.box(sx * (W / 2 - 3), ya + 1.2, -Lh * 0.08, 0.6, 1.4, 1.4, { lay: L.stucco, tint: white });
  F.tube([0, ya + 3.1, -Lh * 0.08], [0, ya + 4.4, -Lh * 0.08], 1.1, 0.2, 8, { lay: L.stucco, tint: white });
  F.box(0, top * 0.25, -Lh / 2 - 2, W / 2 - 2, 0.3, 2.4, { lay: L.deck, tint: [0.85, 0.7, 0.55], scale: 4 });
  F.quad([-(W / 2 - 1.5), top + 0.06, -Lh * 0.48], [W / 2 - 1.5, top + 0.06, -Lh * 0.48], [W / 2 - 1.5, top + 0.06, -Lh * 0.36], [-(W / 2 - 1.5), top + 0.06, -Lh * 0.36], { lay: L.deck, tint: [0.85, 0.7, 0.55], scale: 4 });
  P.box(x, (top - keel) / 2 + 1, z, W / 2 - 1, (top + keel) / 2 + 1, Lh / 2 - 2, h, 'metal', { boat: true, shootable: true });
}

/** A floating dock from (ax, az) to (bx, bz), half width w: deck, dark pontoon sides. */
function deckStrip(P, ax, az, bx, bz, w, deck, side) {
  const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz); if (l < 0.1) return;
  const nx = -dz / l * w, nz = dx / l * w;
  const g = P.C.get('surf', (ax + bx) / 2, (az + bz) / 2);
  g.quad([ax + nx, DOCK_Y, az + nz], [bx + nx, DOCK_Y, bz + nz], [bx - nx, DOCK_Y, bz - nz], [ax - nx, DOCK_Y, az - nz], { lay: L.deck, tint: deck, scale: 7, normal: [0, 1, 0] });
  faceUp(g);
  vquad(g, [ax + nx, az + nz], [bx + nx, bz + nz], -0.6, DOCK_Y, nx / w, nz / w, { lay: L.concrete, tint: side, scale: 6 });
  vquad(g, [ax - nx, az - nz], [bx - nx, bz - nz], -0.6, DOCK_Y, -nx / w, -nz / w, { lay: L.concrete, tint: side, scale: 6 });
}

/** A channel marker: a pile with a red triangle or a green square on top. */
function marker(P, x, z, red) {
  const g = P.C.get('surf', x, z);
  cyl(g, x, -12, z, 0.9, 22, 7, { lay: L.deck, tint: [0.42, 0.36, 0.3], scale: 6 });
  const col = red ? tint(0xd62828, 1.2) : tint(0x2a9d4a, 1.2), h = Math.atan2(x, z);
  const c = Math.cos(h), s = Math.sin(h), W = (lx, ly) => [x + lx * c, ly, z - lx * s];
  if (red) { for (const off of [0.95, -0.95]) { const o = [s * off, 0, c * off]; const A = W(-2.6, 10.2), B = W(2.6, 10.2), C = W(0, 14.8); const p = (q) => [q[0] + o[0], q[1], q[2] + o[2]]; tri(g, p(A), p(B), p(C), { lay: L.stucco, tint: col }); tri(g, p(B), p(A), p(C), { lay: L.stucco, tint: col }); } }
  else g.box(x, 12.4, z, 2.2, 2.2, 0.2, h, { lay: L.stucco, tint: col });
  // the light on top
  g.box(x, 15.6, z, 0.35, 0.5, 0.35, 0, { lay: L.whiteTiles, tint: red ? [1, 0.25, 0.2] : [0.3, 1, 0.4], glow: 1 });
  P.box(x, 2, z, 1.0, 10, 1.0, 0, 'wood', { marker: true });
}

// ---- the Kenney boats (after the models are inflated) --------------------------------------------
const BOATS = {
  yacht: ['boat-speed-j', 'boat-speed-i', 'boat-speed-a', 'boat-sail-b', 'boat-speed-g'],
  mixed: ['boat-speed-a', 'boat-speed-c', 'boat-speed-e', 'boat-fishing-small', 'boat-speed-g', 'boat-sail-a', 'boat-row-small'],
  sail: ['boat-sail-a', 'boat-sail-b', 'boat-sail-a', 'boat-fishing-small', 'boat-speed-c', 'boat-sail-b'],
};
// scale [x, y, z] to studs (sleeker than the toy-like originals) and how deep they sit
const BSCALE = { 'boat-sail-a': [5.4, 7, 8.4], 'boat-sail-b': [5.4, 7, 8.4], 'boat-house-a': [4.8, 5.5, 7], 'boat-row-small': [3.4, 4, 4.4], 'boat-tug-a': [7, 7, 9] };
const SINK = 0.22;

export function buildKenney(P) {
  const list = [], r = rnd(31337);
  const add = (name, x, z, heading, sc, extra = {}) => {
    if (!hasModel(name)) return null;
    const geo = modelGeometry(name), bb = geo.boundingBox;
    const s = sc || BSCALE[name] || [5.2, 5.5, 8];
    const y = -(bb.max.y - bb.min.y) * s[1] * (extra.sink ?? SINK);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), heading), new THREE.Vector3(...s));
    list.push({ geo, m, tintC: extra.tint || null, x4: [x, z, r() * TAU, extra.amp ?? 0.35] });
    if (extra.solid !== false) {
      const hx = (bb.max.x - bb.min.x) * s[0] / 2, hz = (bb.max.z - bb.min.z) * s[2] / 2, hy = (bb.max.y - bb.min.y) * s[1] * 0.3;
      P.box(x, y + hy + 1, z, hx * 0.9, hy + 1, hz * 0.9, heading, 'metal', { boat: true, shootable: true });
    }
    return true;
  };
  for (const M of P.marinas || []) {
    const names = BOATS[M.kind] || BOATS.mixed;
    for (const s of M.slips) {
      if (s.taken || r() < 0.18) continue; // a yacht is there already, or an empty slip
      add(names[Math.floor(r() * names.length)], s.x, s.z, s.heading + (r() - 0.5) * 0.06);
    }
  }
  // swimming-area buoys off the beach, and a few boats at anchor in the bay
  const beach = P.plan.landById.beach, raw = [];
  for (let i = 1; i <= 9; i++) raw.push(beach.pts[i]);
  for (const s of resample(offsetLine(raw, -75), 46)) if (P.ground.heightAt(s.x, s.z) < -1 && inMap(s.x, s.z)) add('buoy', s.x, s.z, 0, [2.2, 2.2, 2.2], { solid: false, amp: 0.5, tint: [1.2, 1.1, 0.4] });
  for (let i = 0; i < 26; i++) {
    const x = 700 + r() * 1200, z = -2600 + r() * 5000;
    if (P.ground.heightAt(x, z) > -6 || P.roads.near(x, z, 60) || Math.abs(x - 1400) < 120) continue;
    add(BOATS.mixed[Math.floor(r() * BOATS.mixed.length)], x, z, r() * TAU);
  }
  if (!list.length) return;
  const geo = mergeColored(list, true);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.05 });
  const uni = { uT: { value: 0 } };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uT = uni.uT;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 bob; uniform float uT;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
{ float t = uT * 1.3 + bob.z;
  transformed.y += sin(t) * bob.w + (position.x - bob.x) * 0.014 * sin(t * 0.8 + 1.3) * bob.w * 2.0 + (position.z - bob.y) * 0.008 * cos(t * 0.7) * bob.w * 2.0; }`);
  };
  mat.customProgramCacheKey = () => 'vc-boats';
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = 'props:boats';
  mesh.matrixAutoUpdate = false; mesh.updateMatrix();
  P.group.add(mesh);
  P.boats = { mesh, count: list.length };
  (P.anim = P.anim || []).push((dt) => { uni.uT.value += dt; });
  void V;
}
