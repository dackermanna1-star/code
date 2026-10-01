// Waste containers: commercial dumpster, rolling carts, cans, grease bin.
import {
  VB, mat, V, MCLS, VS_FINE, VS_MED, COL, rgbMul, rgbMix, rgbJitter, valueNoise2, valueNoise3, fbm2, fbm3, clamp,
  inPoly, polyDist, extrude, grime, rust, streaks, chips, dent, recolor, applyPaint, paintFor, addProp, vrand, lathe, mottle, famSet,
  eachSurface, F_PY, DEG, textMask, projectFace, torusY, variant,
} from './kit.js';
import { trashBag } from './bags.js';
import { cardboardSheet } from './sheets.js';

const DUMPSTER_COLORS = {
  brown: [76, 56, 42],
  green: [40, 64, 48],
  blue: [36, 56, 88],
  grey: [86, 88, 88],
};

function distPolyline(u, v, pts) {
  let best = Infinity;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
    const abx = bx - ax, aby = by - ay;
    const l2 = abx * abx + aby * aby || 1e-9;
    let t = ((u - ax) * abx + (v - ay) * aby) / l2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const dx = u - ax - abx * t, dy = v - ay - aby * t;
    best = Math.min(best, dx * dx + dy * dy);
  }
  return Math.sqrt(best);
}

/** Black plastic dumpster lid. Local frame: hinge line along x at origin, lid extends +z, y=0 underside. */
function dumpsterLid(rng, Lw, Ll, vs, opts = {}) {
  const lipH = 3;
  const b = new VB(Lw, lipH + 3, Ll + 1, vs, [-(Lw * vs) / 2, -lipH * vs, -vs]);
  const P = b.P;
  const tone = rng.range(0.85, 1.15);
  const lid = mat.plastic(P, 'lid', rgbMul([26, 26, 28], tone), { rough: 0.5, vari: 0.07 });
  const faded = mat.plastic(P, 'lidFaded', rgbMul([38, 38, 40], tone), { rough: 0.68, vari: 0.1 });
  const dirt = mat.plastic(P, 'lidDirt', [52, 46, 38], { rough: 0.85, vari: 0.14 });
  const pin = mat.steel(P, 'pin', [60, 54, 48]);
  const z0 = 1; // index of hinge
  const L = Ll;
  b.box(0, lipH, z0, Lw, lipH + 1, z0 + L, lid);
  b.box(0, 0, z0 + L - 1, Lw, lipH, z0 + L, lid); // front skirt
  b.box(0, 1, z0 + 3, 1, lipH, z0 + L, lid); // side skirts
  b.box(Lw - 1, 1, z0 + 3, Lw, lipH, z0 + L, lid);
  // raised border + ribs
  b.box(0, lipH + 1, z0 + L - 2, Lw, lipH + 2, z0 + L, lid);
  b.box(0, lipH + 1, z0, 1, lipH + 2, z0 + L, lid);
  b.box(Lw - 1, lipH + 1, z0, Lw, lipH + 2, z0 + L, lid);
  const nr = Lw > 26 ? 3 : 2;
  for (let k = 1; k <= nr; k++) {
    const x = Math.round((Lw * k) / (nr + 1));
    b.box(x, lipH + 1, z0 + 3, x + 1, lipH + 2, z0 + L - 2, lid);
  }
  b.box(1, lipH + 1, z0 + 3, Lw - 1, lipH + 2, z0 + 4, lid);
  // hinge knuckles
  for (const hx of [Math.round(Lw * 0.2), Math.round(Lw * 0.75)]) {
    b.box(hx - 2, lipH - 1, 0, hx + 2, lipH + 2, z0 + 2, lid);
    b.box(hx - 3, lipH, 0, hx + 3, lipH + 1, 1, pin);
  }
  // grip recess at the front skirt
  const gx = Math.round(Lw * rng.range(0.35, 0.65));
  b.box(gx - 3, 1, z0 + L - 1, gx + 3, 2, z0 + L, 0);
  // broken corner / crack
  if (opts.broken ?? rng.chance(0.3)) {
    const cxk = rng.chance(0.5) ? 0 : Lw - 1;
    const r = rng.int(3, 6);
    b.fill(cxk - r, 0, z0 + L - r, cxk + r + 1, lipH + 3, z0 + L + 1, (px, py, pz, x, y, z) => {
      const d = Math.abs(x - cxk) + Math.abs(z - (z0 + L - 1));
      return d < r - (vrand(x, 0, z, 9) < 0.4 ? 1 : 0) ? 0 : undefined;
    });
  }
  // sun fade + dirt on top
  const seed = rng.int(1, 1e5);
  recolor(b, [lid], (v, x, y, z, n, m) => {
    if (!(m & F_PY)) return undefined;
    if (n > 0.62) return faded;
    if (n < 0.2 && z > b.nz * 0.7) return dirt;
    return undefined;
  }, { freq: 0.06, seed, octaves: 1 });
  return b.model();
}

/**
 * Commercial front-load steel dumpster (2-4 yd³): sloped front, fork pockets, skids, black plastic lids.
 * opts: color 'brown'|'green'|'blue'|'grey' (or [r,g,b]), capacity 2|3|4, lidOpen (false|true|'left'|'right'|'both'|radians),
 *       overflow 0..1, wheels bool, rust 0..1, paint (canvas | {front,left,right,back})
 * Origin: centre of the body footprint at ground level, front (+Z) is the sloped side.
 */
export function dumpster(rng, opts = {}) {
  const vs = VS_MED;
  const cap = opts.capacity ?? rng.pick([2, 3, 3, 4]);
  const dims = { 2: [1.83, 1.04, 0.86, 1.08, 0.74], 3: [1.83, 1.2, 0.99, 1.24, 0.86], 4: [1.83, 1.34, 1.1, 1.45, 1.0] }[cap] ?? [1.83, 1.2, 0.99, 1.24, 0.86];
  const [Wm, Hbm, Hfm, Dtm, Dbm] = dims;
  const W = Math.round(Wm / vs), Hb = Math.round(Hbm / vs), Hf = Math.round(Hfm / vs), Dt = Math.round(Dtm / vs), Db = Math.round(Dbm / vs);
  const wheels = opts.wheels ?? rng.chance(0.3);
  const overflow = clamp(opts.overflow ?? 0, 0, 1);
  const rustAmt = opts.rust ?? rng.range(0.3, 0.75);
  const colorKey = Array.isArray(opts.color) ? null : opts.color ?? rng.pick(Object.keys(DUMPSTER_COLORS));
  const baseCol = Array.isArray(opts.color) ? opts.color : rgbJitter(rng, DUMPSTER_COLORS[colorKey] ?? DUMPSTER_COLORS.brown, 0.08, 0.02);

  const skid = wheels ? 6 : 3;
  const pocketOut = 4;
  const mx = pocketOut + 2;
  const zb = 2;
  const nx = W + 2 * mx, ny = skid + Hb + 3, nz = zb + Dt + 3;
  const b = new VB(nx, ny, nz, vs, 'corner');
  // origin: centre of the body's top rectangle footprint
  b.setMount([-(nx * vs) / 2, 0, -(zb + Dt / 2) * vs]);
  const P = b.P;
  const body = mat.paint(P, 'body', baseCol, { rough: 0.72, metal: 0.3, vari: 0.07, cls: opts.cls ?? MCLS.GENERIC });
  const skidM = mat.paint(P, 'skid', rgbMul(baseCol, 0.6), { rough: 0.8 });
  const steel = mat.steel(P, 'steel', [52, 48, 44]);
  const rubber = mat.rubber(P);
  const famBody = famSet(P, [body]);
  const x0 = mx, x1 = mx + W;
  const yb = skid;
  const style = rng.chance(0.65) ? 'partial' : 'full';
  const yk = style === 'full' ? yb : yb + Math.round(Hf * rng.range(0.36, 0.5));
  const zFront = zb + Dt; // exclusive
  const poly = [[zb, yb], [zb + Db, yb], [zFront, yk], [zFront, yb + Hf], [zb, yb + Hb]];
  const open = [[zFront, yb + Hf], [zFront, yk], [zb + Db, yb], [zb, yb], [zb, yb + Hb]];

  // ── body shell ──
  const shellCells = [], sideCells = [], interior = [];
  for (let y = yb; y < yb + Hb; y++)
    for (let z = zb; z < zFront; z++) {
      const pu = z + 0.5, pv = y + 0.5;
      if (!inPoly(pu, pv, poly)) continue;
      sideCells.push(z, y);
      if (distPolyline(pu, pv, open) <= 1.0) shellCells.push(z, y);
      else interior.push(z, y);
    }
  for (let i = 0; i < sideCells.length; i += 2) {
    b.set(x0, sideCells[i + 1], sideCells[i], body);
    b.set(x1 - 1, sideCells[i + 1], sideCells[i], body);
  }
  for (let x = x0 + 1; x < x1 - 1; x++) for (let i = 0; i < shellCells.length; i += 2) b.set(x, shellCells[i + 1], shellCells[i], body);
  const topAt = (z) => {
    for (let y = yb + Hb - 1; y >= yb; y--) if (b.get(x0, y, z)) return y;
    return -1;
  };
  const frontAt = (y) => {
    for (let z = zFront - 1; z >= zb; z--) if (b.get(x0, y, z)) return z;
    return zb;
  };

  // ── top rim (channel sticking out) ──
  for (let z = zb; z < zFront; z++) {
    const t = topAt(z);
    if (t < 0) continue;
    b.box(x0 - 1, t - 1, z, x0, t + 1, z + 1, body);
    b.box(x1, t - 1, z, x1 + 1, t + 1, z + 1, body);
  }
  b.box(x0 - 1, yb + Hb - 2, zb - 1, x1 + 1, yb + Hb, zb, body);
  b.box(x0 - 1, yb + Hf - 2, zFront, x1 + 1, yb + Hf, zFront + 1, body);
  // corner posts at the back
  b.box(x0 - 1, yb, zb - 1, x0 + 1, yb + Hb, zb, body);
  b.box(x1 - 1, yb, zb - 1, x1 + 1, yb + Hb, zb, body);
  // side stiffener ribs
  const ribs = rng.chance(0.5) ? [0.5] : [0.36, 0.7];
  for (const r of ribs) {
    const z = zb + Math.round(Dt * r);
    for (let zz = z; zz < z + 2; zz++) {
      const t = topAt(zz);
      for (let y = yb; y < t; y++) {
        if (b.get(x0, y, zz)) b.set(x0 - 1, y, zz, body);
        if (b.get(x1 - 1, y, zz)) b.set(x1, y, zz, body);
      }
    }
  }
  // front: horizontal stiffener at the knee
  if (style === 'partial') b.box(x0, yk, zFront, x1, yk + 2, zFront + 1, body);

  // ── fork pockets ──
  const yp0 = yb + Math.round(Hb * rng.range(0.4, 0.5)), yp1 = yp0 + 8;
  let zpe = zFront;
  for (let y = yp0; y < yp1; y++) zpe = Math.min(zpe, frontAt(y) + 1);
  const zps = zb + 1;
  for (const side of [-1, 1]) {
    const xo = side < 0 ? x0 - pocketOut : x1;
    const xi = side < 0 ? x0 : x1 + pocketOut;
    b.box(xo, yp0, zps, xi, yp0 + 1, zpe, body);
    b.box(xo, yp1 - 1, zps, xi, yp1, zpe, body);
    const xw = side < 0 ? xo : xi - 1;
    b.box(xw, yp0, zps, xw + 1, yp1, zpe, body);
    // clear the inside of the sleeve (ribs may have filled it)
    b.box(side < 0 ? xo + 1 : x1, yp0 + 1, zps, side < 0 ? x0 : xi - 1, yp1 - 1, zpe, 0);
    // gusset plates
    b.box(side < 0 ? x0 - 2 : x1, yp0 - 2, zps + 2, side < 0 ? x0 : x1 + 2, yp0, zps + 4, body);
    b.box(side < 0 ? x0 - 2 : x1, yp0 - 2, zpe - 4, side < 0 ? x0 : x1 + 2, yp0, zpe - 2, body);
  }

  // ── skids / casters ──
  if (!wheels) {
    for (const sx of [x0 + 2, x1 - 5]) b.box(sx, 0, zb + 1, sx + 3, yb, zb + Db - 1, skidM);
  } else {
    for (const sx of [x0 + 3, x1 - 4])
      for (const sz of [zb + 3, zb + Db - 4]) {
        b.box(sx - 2, yb - 1, sz - 2, sx + 3, yb, sz + 3, steel); // swivel plate
        b.box(sx - 1, 2, sz - 1, sx, yb - 1, sz + 2, steel); // fork
        b.box(sx + 1, 2, sz - 1, sx + 2, yb - 1, sz + 2, steel);
        for (let z = sz - 3; z <= sz + 3; z++)
          for (let y = 0; y <= 5; y++) {
            const dz = z + 0.5 - (sz + 0.5), dy = y + 0.5 - 3;
            if (dz * dz + dy * dy <= 9) b.box(sx, y, z, sx + 1, y + 1, z + 1, rubber);
          }
      }
  }

  // ── hinges at the back ──
  const Lw = Math.round((W + 2) / 2);
  const lidX = [x0 - 1 + Lw / 2, x0 - 1 + Lw * 1.5];
  for (const lx of lidX)
    for (const hx of [lx - Lw * 0.3, lx + Lw * 0.25]) {
      const xi = Math.round(hx);
      b.box(xi - 1, yb + Hb - 4, zb - 2, xi + 2, yb + Hb, zb - 1, steel);
    }
  // drain plug boss
  b.box(x0 - 1, yb + 1, zb + 3, x0, yb + 3, zb + 5, steel);

  // ── dents ──
  const nd = rng.int(1, 3);
  for (let i = 0; i < nd; i++) {
    const cx = rng.range(x0 + 6, x1 - 6), cy = rng.range(Math.max(yk, yb + 4) + 3, yb + Hf - 5);
    dent(b, 'z', zFront - 1, -1, cx, cy, rng.range(3, 6), rng.range(1, 2.4), { squash: rng.range(0.8, 1.6) });
  }
  for (const side of [-1, 1]) {
    if (!rng.chance(0.6)) continue;
    const cz = rng.range(zb + 5, zFront - 8), cy = rng.range(yb + 4, yp0 - 3);
    dent(b, 'x', side < 0 ? x0 : x1 - 1, -side, cy, cz, rng.range(3, 5), rng.range(1, 2));
  }

  // ── faded stencil label on the front: light panel with two lines of dark lettering ──
  if (rng.chance(0.75)) {
    const lw = rng.int(14, 20), lh = rng.int(6, 7);
    const lx0 = rng.chance(0.5) ? x0 + 4 : x1 - 4 - lw;
    const ly0 = yb + Hf - 4 - lh;
    const labelC = mat.paint(P, 'label', rgbMix(rgbJitter(rng, [190, 184, 166], 0.05), baseCol, 0.4), { rough: 0.8, cls: MCLS.GENERIC });
    const ink = mat.paint(P, 'labelInk', rgbMix([40, 38, 36], baseCol, 0.35), { rough: 0.8, cls: MCLS.GENERIC });
    const words = (len) => {
      const w = [];
      let x = 1;
      while (x < len - 2) {
        const l = rng.int(2, 5);
        for (let k = 0; k < l && x + k < len - 1; k++) w.push(x + k);
        x += l + 1;
      }
      return new Set(w);
    };
    const r1 = words(lw), r2 = words(Math.round(lw * rng.range(0.5, 0.8)));
    for (let y = ly0; y < ly0 + lh; y++)
      for (let x = lx0; x < lx0 + lw; x++) {
        const z = frontAt(y);
        if (b.get(x, y, z) !== body) continue;
        const row = y - ly0, cx = x - lx0;
        const isInk = (row === lh - 3 && r1.has(cx)) || (row === 2 && r2.has(cx));
        if (vrand(x, y, z, 3) < 0.1) continue; // worn away
        b.set(x, y, z, isInk ? ink : labelC);
      }
  }

  // ── weathering ──
  const seed = rng.int(1, 1e6);
  if (opts.weather !== false) {
    mottle(b, [body], { freq: 0.035, seed: seed + 1, k: [0.92, 1.06], sat: 0.12, cover: 0.3 });
    // a rectangle of fresher paint rolled over old graffiti
    if (rng.chance(0.45)) {
      const fresh = mat.paint(P, 'buff', rgbJitter(rng, rgbMul(baseCol, rng.range(0.9, 1.12)), 0.05), { rough: 0.6, metal: 0.25, cls: MCLS.GENERIC });
      const front = rng.chance(0.5);
      const w = rng.int(14, 30), h = rng.int(10, Hf - 8);
      const u0 = rng.int(2, (front ? W : Dt) - w - 2), v0 = rng.int(yb + 4, yb + Hf - h - 3);
      projectFace(b, front ? '+z' : rng.pick(['-x', '+x']), front ? { u0: x0 + u0, v0, u1: x0 + u0 + w, v1: v0 + h } : { u0: zb + u0, v0, u1: zb + u0 + w, v1: v0 + h }, (u, v, cur) => (famBody.has(cur) && !(vrand(Math.floor(u * 97), Math.floor(v * 89), 3) < 0.04 && (u < 0.05 || u > 0.95 || v < 0.05 || v > 0.95)) ? fresh : undefined), { depthLimit: 2 });
    }
    rust(b, [body, skidM], { amount: rustAmt, seed, bottom: 3, y0: yb, freq: 0.09 });
    streaks(b, rng, [body], { count: Math.round(5 + rustAmt * 10), len: [5, 22], yMin: yb + Hf - 4, kind: 'rust', t: 0.32 });
    streaks(b, rng, [body], { count: 3, len: [4, 10], yMin: yp0 - 2, yMax: yp0, kind: 'rust', t: 0.3 });
    // fork / truck scrapes: short horizontal bare-metal and rust strokes on the sides
    for (let i = 0, n = rng.int(1, 4); i < n; i++) {
      const side = rng.chance(0.5) ? x0 - 1 : x1;
      const y = rng.int(yb + 2, yp0 - 2), z0 = rng.int(zb + 2, zFront - 14), len = rng.int(5, 14);
      for (let z = z0; z < z0 + len; z++) {
        const x = side < x0 ? (b.get(x0 - 1, y, z) ? x0 - 1 : x0) : b.get(x1, y, z) ? x1 : x1 - 1;
        const cur = b.get(x, y, z);
        if (famBody.has(cur) && vrand(x, y, z, 5) < 0.8) b.set(x, y, z, vrand(x, y, z, 6) < 0.5 ? V.bare(P, body) : V.rust(P, body, 1.1));
      }
    }
    grime(b, [body, skidM], { h: yb + 7, amount: 0.62, seed: seed + 2, k: 0.7 });
    chips(b, rng, [body], { density: 0.0012, edgeBias: 6, kinds: ['rust', 'primer'] });
  }

  // ── user paint (graffiti) ──
  const faces = {
    front: { face: '+z', rect: { u0: x0, v0: yb, u1: x1, v1: yb + Hf }, w: W * vs, h: Hf * vs },
    left: { face: '-x', rect: { u0: zb, v0: yb, u1: zFront, v1: yb + Hb }, w: Dt * vs, h: Hb * vs },
    right: { face: '+x', rect: { u0: nz - zFront, v0: yb, u1: nz - zb, v1: yb + Hb }, w: Dt * vs, h: Hb * vs },
    back: { face: '-z', rect: { u0: nx - x1, v0: yb, u1: nx - x0, v1: yb + Hb }, w: W * vs, h: Hb * vs },
  };
  for (const [name, f] of Object.entries(faces)) {
    const src = paintFor(opts.paint, name, 'front');
    if (src) applyPaint(b, src, f.face, f.rect, { depthLimit: 6 });
  }
  if (opts.paint) chips(b, rng, null, { density: 0.0015, kinds: ['rust'] });

  // ── lids ──
  const parts = [];
  const slope = Math.atan2(Hb - Hf, Dt);
  const Ll = Math.round(Math.hypot(Dt, Hb - Hf)) + 2;
  let lidMode = opts.lidOpen;
  if (lidMode === undefined) {
    lidMode = overflow > 0.35 ? (rng.chance(0.5) ? 'propped' : rng.pick(['left', 'right', 'both'])) : rng.weighted([false, 'propped', 'left', 'right', 'both'], [4.5, 2, 1.5, 1.5, 0.8]);
  }
  const hingeY = b.my(yb + Hb), hingeZ = b.mz(zb);
  const lidOpenAngles = [0, 0];
  if (lidMode === true) lidMode = rng.pick(['left', 'right']);
  if (typeof lidMode === 'number') lidOpenAngles[rng.int(0, 1)] = lidMode;
  else if (lidMode === 'propped') {
    const k = rng.int(0, 1);
    lidOpenAngles[k] = rng.range(0.25, 0.45) + overflow * 0.35;
    if (overflow > 0.6) lidOpenAngles[1 - k] = rng.range(0.1, 0.3);
  } else if (lidMode === 'left' || lidMode === 'right' || lidMode === 'both') {
    const full = () => slope + rng.range(1.62, 1.85);
    if (lidMode !== 'right') lidOpenAngles[0] = full();
    if (lidMode !== 'left') lidOpenAngles[1] = full();
    if (overflow > 0.35) for (let k = 0; k < 2; k++) if (!lidOpenAngles[k]) lidOpenAngles[k] = rng.range(0.15, 0.4) + overflow * 0.3;
  }
  const anchors = {};
  for (let k = 0; k < 2; k++) {
    const lm = dumpsterLid(rng.fork(`lid${k}`), Lw, Ll, vs, {});
    const px = b.mx(lidX[k]);
    parts.push({ name: `lid${k}`, model: lm, position: [px, hingeY, hingeZ], rotation: [slope - lidOpenAngles[k] + rng.range(-0.01, 0.01), 0, rng.range(-0.008, 0.008)] });
    anchors[`lidHinge${k}`] = [px, hingeY, hingeZ];
  }

  // ── interior trash (only when visible: a lid open or overflowing) ──
  const anyOpen = lidOpenAngles[0] > 0.05 || lidOpenAngles[1] > 0.05;
  const fill = overflow > 0 ? overflow : anyOpen ? rng.range(0.15, 0.55) : 0;
  let surfaceAt = () => yb + 1;
  if (fill > 0) {
    const T = [
      mat.bag(P, 'tBag', [20, 20, 22]),
      mat.plastic(P, 'tWhite', [176, 176, 170], { rough: 0.45 }),
      mat.cardboard(P, 'tCard', [132, 100, 66]),
      mat.paper(P, 'tPaper', [168, 162, 148]),
    ];
    const level = yb + Hf * (0.3 + 0.62 * fill);
    const hm = new Float32Array(nx * nz);
    for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) hm[x + z * nx] = level + (fbm2(x * 0.09, z * 0.09, 2, seed + 5) - 0.5) * 8;
    surfaceAt = (x, z) => hm[Math.max(0, Math.min(nx - 1, Math.round(x))) + Math.max(0, Math.min(nz - 1, Math.round(z))) * nx];
    const pick = new Uint8Array(nx * nz);
    for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) {
      const n = valueNoise2(x * 0.08, z * 0.08, seed + 6);
      pick[x + z * nx] = n < 0.5 ? 0 : n < 0.66 ? 2 : n < 0.8 ? 1 : 3;
    }
    for (let i = 0; i < interior.length; i += 2) {
      const z = interior[i], y = interior[i + 1];
      for (let x = x0 + 1; x < x1 - 1; x++) {
        const h = hm[x + z * nx];
        if (y > h || y < h - 2) continue;
        b.set(x, y, z, T[pick[x + z * nx]]);
      }
    }
  }

  // ── overflow: bags and boxes heaped above the rim ──
  if (overflow > 0.05) {
    const nb = Math.round(overflow * rng.range(4, 7)) + (overflow > 0.3 ? 1 : 0);
    for (let i = 0; i < nb; i++) {
      const bag = trashBag(rng.fork(`bag${i}`), { vs, color: rng.weighted(['black', 'white', 'grey', 'clear', 'green'], [6, 2, 1, 0.7, 0.4]), shape: rng.weighted(['stand', 'lie', 'slump'], [2, 3, 2]) });
      const vx = rng.range(x0 + 6, x1 - 6), vz = rng.range(zb + 6, zFront - 6);
      const sy = surfaceAt(vx, vz);
      const stackUp = overflow > 0.65 && i > 2 && rng.chance(0.5) ? rng.range(0.15, 0.3) : 0;
      parts.push(...addProp([], `bag${i}`, bag, [b.mx(vx), b.my(sy) - rng.range(0.06, 0.16) + stackUp, b.mz(vz)], [rng.range(-0.25, 0.25), rng.range(0, Math.PI * 2), rng.range(-0.25, 0.25)]));
    }
    const nc = overflow > 0.45 ? rng.int(1, 2) : 0;
    for (let i = 0; i < nc; i++) {
      const sh = cardboardSheet(rng.fork(`card${i}`), { vs, w: rng.range(0.55, 0.85), d: rng.range(0.5, 0.75), curl: rng.int(0, 2) });
      const vx = rng.range(x0 + 10, x1 - 10);
      parts.push(...addProp([], `card${i}`, sh, [b.mx(vx), b.my(yb + Hb * 0.62), b.mz(zb + 3 + i * 3)], [-1.25 + rng.range(-0.15, 0.15), rng.range(-0.3, 0.3), rng.range(-0.15, 0.15)]));
    }
  }

  const footW = (W + 2 * pocketOut) * vs;
  const meta = {
    size: [nx * vs, (yb + Hb) * vs, (Dt + 2) * vs],
    footprint: [footW, (Dt + 1) * vs],
    mount: 'floor',
    kind: 'dumpster',
    color: colorKey ?? 'custom',
    capacity: cap,
    anchors,
    paintSurfaces: Object.fromEntries(Object.entries(faces).map(([k, f]) => [k, { w: +f.w.toFixed(3), h: +f.h.toFixed(3), face: f.face }])),
  };
  return { model: b.model(), parts, meta };
}

// ───────────────────────────── shared helpers ─────────────────────────────

/** Rounded-rectangle signed distance (voxel units). */
function rrect(px, pz, hw, hd, rc) {
  const qx = Math.abs(px) - hw + rc, qz = Math.abs(pz) - hd + rc;
  const ox = Math.max(qx, 0), oz = Math.max(qz, 0);
  return Math.hypot(ox, oz) + Math.min(Math.max(qx, qz), 0) - rc;
}

/**
 * Cylindrical shell around a vertical axis with an angular/height radius function
 * (dents, ribs). rad(a, y) = outer radius; voxels with rad-thick <= d < rad are set.
 */
function cylShell(b, cx, cz, y0, y1, rmax, rad, thick, val) {
  for (let y = Math.max(0, y0); y < Math.min(b.ny, y1); y++)
    for (let z = Math.floor(cz - rmax - 1); z <= Math.ceil(cz + rmax + 1); z++)
      for (let x = Math.floor(cx - rmax - 1); x <= Math.ceil(cx + rmax + 1); x++) {
        const dx = x + 0.5 - cx, dz = z + 0.5 - cz;
        const d = Math.hypot(dx, dz);
        if (d > rmax + 0.5) continue;
        const a = Math.atan2(dz, dx);
        const r = rad(a, y + 0.5);
        if (d < r && d >= r - thick) {
          const v = typeof val === 'function' ? val(x, y, z, a) : val;
          if (v !== undefined) b.set(x, y, z, v);
        }
      }
}

/** Smooth dent profile summed over dents [{a, y, r, d}] at angle a and height y. */
function dentAt(dents, a, y) {
  let s = 0;
  for (const dn of dents) {
    let da = a - dn.a;
    da = Math.atan2(Math.sin(da), Math.cos(da)) * dn.R;
    const dy = y - dn.y;
    const q = (da * da + dy * dy) / (dn.r * dn.r);
    if (q < 1) s += dn.d * (0.5 + 0.5 * Math.cos(Math.PI * Math.sqrt(q)));
  }
  return s;
}

const CART_COLORS = { black: [30, 30, 32], green: [34, 54, 40], grey: [96, 98, 98], blue: [34, 62, 112], brown: [70, 54, 40] };

/**
 * 95-gallon rolling trash cart: tapered body, rim, integrated handle and lift bar, two wheels,
 * hinged lid (part). opts: color 'black'|'green'|'grey'|'blue'|'brown', lidColor [r,g,b],
 * lid 'closed'|'ajar'|'open', bag (bool: bag sticking out under an ajar lid), number (string),
 * paint (canvas | {front, left, right}). Origin: footprint centre; handle and wheels at the back (-Z).
 */
export function trashCart(rng, opts = {}) {
  const vs = VS_MED;
  const colKey = opts.color ?? rng.weighted(['black', 'green', 'grey', 'blue'], [5, 2, 1.5, 1]);
  const base = rgbJitter(rng, CART_COLORS[colKey] ?? CART_COLORS.black, 0.06, 0.02);
  const lidBase = opts.lidColor ?? (colKey !== 'blue' && rng.chance(0.12) ? CART_COLORS.blue : base);
  const lidMode = opts.lid ?? rng.weighted(['closed', 'ajar', 'open'], [6, 3, 1]);
  const withBag = opts.bag ?? (lidMode !== 'closed' && rng.chance(0.65));

  const Wt = 23, Dt = 26, Wb = 18, Db = 21, H = 36, yb = 2, rc = 4;
  const nx = Wt + 6, nz = Dt + 7, ny = yb + H + 2;
  const b = new VB(nx, ny, nz, vs, 'floor');
  const P = b.P;
  const body = mat.plastic(P, 'body', base, { rough: 0.55, vari: 0.05 });
  const dark = mat.plastic(P, 'dark', rgbMul(base, 0.7), { rough: 0.6 });
  const rubber = mat.rubber(P, 'tire', [24, 24, 25]);
  const hub = mat.plastic(P, 'hub', [70, 70, 72], { rough: 0.5 });
  const steel = mat.steel(P, 'axle', [70, 66, 62]);
  const cx = nx / 2;
  const zBack = 4; // back wall (handle side)
  const famBody = famSet(P, [body]);

  const sizeAt = (y) => {
    const t = clamp((y - yb) / H, 0, 1);
    return [(Wb + (Wt - Wb) * t) / 2, (Db + (Dt - Db) * t) / 2];
  };
  // body shell
  for (let y = yb; y < yb + H; y++) {
    const [hw, hd] = sizeAt(y + 0.5);
    const czc = zBack + hd;
    for (let z = zBack - 1; z < zBack + 2 * hd + 2; z++)
      for (let x = 0; x < nx; x++) {
        const d = rrect(x + 0.5 - cx, z + 0.5 - czc, hw, hd, rc);
        const rim = y >= yb + H - 2;
        if (y === yb ? d < 0 : d < (rim ? 1 : 0) && d >= -1) b.set(x, y, z, body);
      }
  }
  // molded band below the rim and around the base
  for (const yy of [yb + H - 7, yb + 3]) {
    const [hw, hd] = sizeAt(yy + 0.5);
    for (let z = zBack - 1; z < zBack + 2 * hd + 2; z++)
      for (let x = 0; x < nx; x++) {
        const d = rrect(x + 0.5 - cx, z + 0.5 - (zBack + hd), hw, hd, rc);
        if (d < 1 && d >= 0) b.set(x, yy, z, body);
      }
  }
  // feet under the front
  const [hwb, hdb] = sizeAt(yb);
  for (const fx of [-hwb + 3, hwb - 4]) b.box(Math.round(cx + fx), 0, Math.round(zBack + 2 * hdb - 5), Math.round(cx + fx) + 2, yb, Math.round(zBack + 2 * hdb - 1), dark);
  // handle bar at the back top + lift (comb) bar
  const hy = yb + H - 1;
  b.box(Math.round(cx - 10), hy - 1, zBack - 4, Math.round(cx + 10), hy + 1, zBack - 2, body);
  for (const sx of [-10, 8]) b.box(Math.round(cx + sx), hy - 4, zBack - 3, Math.round(cx + sx) + 2, hy + 1, zBack, body);
  const ly = yb + Math.round(H * 0.68);
  b.box(Math.round(cx - 9), ly, zBack - 2, Math.round(cx + 9), ly + 2, zBack, dark);
  b.box(Math.round(cx - 7), ly - 3, zBack - 1, Math.round(cx + 7), ly, zBack, body);
  // wheels + axle
  const wr = 4.6, wy = 4.6, wz = zBack + 1.2;
  b.g.cylX(wy, wz, 0.8, Math.round(cx - 12), Math.round(cx + 12), steel);
  for (const side of [-1, 1]) {
    const xa = side < 0 ? Math.round(cx - 12.5) : Math.round(cx + 9.5);
    b.g.cylX(wy, wz, wr, xa, xa + 3, rubber);
    b.g.cylX(wy, wz, 2.1, side < 0 ? xa - 0 : xa + 2, side < 0 ? xa + 1 : xa + 3, hub);
    // axle housing molded into the body
    b.box(side < 0 ? xa + 3 : Math.round(cx + 8), 2, zBack - 1, side < 0 ? Math.round(cx - 8) : xa, 8, zBack + 4, body);
  }

  // weathering: scuffs, dirt, sun fade, painted house number
  const seed = rng.int(1, 1e6);
  mottle(b, [body], { freq: 0.05, seed, k: [0.9, 1.1], sat: 0.15, cover: 0.3 });
  for (let i = 0, ns = rng.int(2, 6); i < ns; i++) {
    const face = rng.pick(['+z', '-x', '+x']);
    const y = rng.int(yb + 3, yb + 20), u0 = rng.int(4, 16), len = rng.int(3, 8);
    projectFace(b, face, { u0, v0: y, u1: u0 + len, v1: y + 1 }, (u, v, cur) => (famBody.has(cur) && vrand(Math.round(u * 50), y, i, 4) < 0.85 ? V.tone(P, body, 1.35, 0.25) : undefined), { depthLimit: 2 });
  }
  grime(b, [body, dark], { h: 9, amount: 0.65, seed: seed + 1, k: 0.75 });
  const number = opts.number ?? (rng.chance(0.6) ? String(rng.int(1, 39)) + String(rng.int(0, 99)).padStart(2, '0') : null);
  if (number) {
    const paintW = mat.paint(P, 'number', rng.pick([[200, 198, 190], [196, 170, 60], [200, 200, 196]]), { rough: 0.7, metal: 0, cls: MCLS.GENERIC });
    const tw = Math.min(18, number.length * 4 + 2), th = 6;
    const mask = textMask(tw, th, [{ text: number, size: 0.95, y: 0.5 }], { ss: 6, font: 'Impact, Arial Black, sans-serif' });
    const face = rng.pick(['-x', '+x', '+z']);
    const u0 = face === '+z' ? Math.round(cx - tw / 2) : face === '-x' ? zBack + 4 : nz - (zBack + 4) - tw - 1;
    const v0 = yb + Math.round(H * 0.42);
    projectFace(b, face, { u0, v0, u1: u0 + tw, v1: v0 + th }, (u, v, cur) => {
      if (!famBody.has(cur)) return undefined;
      const m = mask[Math.min(tw - 1, Math.floor(u * tw)) + Math.min(th - 1, Math.floor(v * th)) * tw];
      return m > 0.42 ? paintW : undefined;
    }, { depthLimit: 2 });
  }
  const faces = {
    front: { face: '+z', rect: { u0: Math.round(cx - Wt / 2), v0: yb, u1: Math.round(cx + Wt / 2), v1: yb + H }, w: Wt * vs, h: H * vs },
    left: { face: '-x', rect: { u0: zBack, v0: yb, u1: zBack + Dt, v1: yb + H }, w: Dt * vs, h: H * vs },
    right: { face: '+x', rect: { u0: nz - zBack - Dt, v0: yb, u1: nz - zBack, v1: yb + H }, w: Dt * vs, h: H * vs },
  };
  for (const [name, f] of Object.entries(faces)) {
    const src = paintFor(opts.paint, name, 'front');
    if (src) applyPaint(b, src, f.face, f.rect, { depthLimit: 3 });
  }

  // lid (part), hinge along the handle
  const parts = [];
  const LW = Wt + 2, LD = Dt + 2;
  const lb = new VB(LW, 4, LD + 1, vs, [-(LW * vs) / 2, -2 * vs, -vs]);
  const lid = mat.plastic(lb.P, 'lid', rgbJitter(rng, lidBase, 0.04), { rough: 0.5, vari: 0.05 });
  lb.box(0, 2, 1, LW, 3, LD + 1, lid);
  lb.box(0, 0, LD, LW, 2, LD + 1, lid);
  lb.box(0, 1, 3, 1, 2, LD + 1, lid);
  lb.box(LW - 1, 1, 3, LW, 2, LD + 1, lid);
  lb.box(2, 3, 4, LW - 2, 4, 5, lid); // molded ridge
  lb.box(Math.round(LW / 2) - 4, 0, LD - 1, Math.round(LW / 2) + 4, 1, LD, 0); // grip notch
  mottle(lb, [lid], { freq: 0.07, seed: seed + 9, k: [0.88, 1.12], sat: 0.2, cover: 0.3 });
  let ang = 0;
  if (lidMode === 'ajar') ang = withBag ? rng.range(0.25, 0.45) : rng.range(0.06, 0.2);
  else if (lidMode === 'open') ang = rng.range(1.75, 2.0);
  const hingeY = b.my(hy + 1), hingeZ = b.mz(zBack - 2);
  parts.push({ name: 'lid', model: lb.model(), position: [b.mx(cx), hingeY, hingeZ], rotation: [-ang, 0, rng.range(-0.01, 0.01)] });
  if (withBag) {
    const bag = trashBag(rng.fork('bag'), { vs, shape: rng.pick(['slump', 'stand']), color: rng.weighted(['black', 'white', 'grey'], [4, 3, 1]), size: rng.range(0.85, 1.0) });
    const by = b.my(yb + H) - bag.meta.height * rng.range(0.6, 0.8);
    addProp(parts, 'bag', bag, [b.mx(cx + rng.range(-2, 2)), by, b.mz(zBack + Dt * 0.55)], [rng.range(-0.15, 0.15), rng.range(0, 6.28), rng.range(-0.15, 0.15)]);
  }
  return {
    model: b.model(),
    parts,
    meta: {
      size: b.sizeM(), footprint: [(Wt + 4) * vs, (Dt + 4) * vs], mount: 'floor', kind: 'trashCart', color: colKey,
      anchors: { lidHinge: [b.mx(cx), hingeY, hingeZ], handle: [b.mx(cx), b.my(hy), b.mz(zBack - 3)] },
      paintSurfaces: Object.fromEntries(Object.entries(faces).map(([k, f]) => [k, { w: +f.w.toFixed(3), h: +f.h.toFixed(3), face: f.face }])),
    },
  };
}

/** Domed can lid (galvanized or plastic). Origin: bottom centre of the rim. */
function canLid(rng, R, vs, kind, color) {
  const n = Math.ceil(R * 2 + 4);
  const b = new VB(n, 8, n, vs, 'floor');
  const P = b.P;
  const m = kind === 'galv' ? mat.galv(P, 'lid', rgbJitter(rng, color, 0.05)) : mat.plastic(P, 'lid', color, { rough: 0.55 });
  const c = n / 2;
  lathe(b, c, c, 0, 5, (y) => {
    if (y < 1) return [R + 0.6, R - 0.6];
    if (y < 2) return [R, R - 1.2];
    const t = (y - 2) / 3;
    const r = R * Math.sqrt(Math.max(0, 1 - t * t * 0.85));
    return [r, r - 1.6];
  }, m);
  lathe(b, c, c, 2, 3, () => [R - 1, -1], m);
  // handle
  const hm = kind === 'galv' ? mat.galv(P, 'handle', [126, 128, 126]) : m;
  b.box(Math.round(c - 4), 5, Math.round(c - 1), Math.round(c - 2), 7, Math.round(c + 1), hm);
  b.box(Math.round(c + 2), 5, Math.round(c - 1), Math.round(c + 4), 7, Math.round(c + 1), hm);
  b.box(Math.round(c - 4), 7, Math.round(c - 1), Math.round(c + 4), 8, Math.round(c + 1), hm);
  if (kind === 'galv') {
    const seed = rng.int(1, 1e5);
    recolor(b, [m], (v, x, y, z, nn) => (nn > 0.68 ? V.tone(P, m, 0.86, 0) : undefined), { freq: 0.08, seed });
  }
  return b.model();
}

/**
 * Galvanized steel trash can (31 gal) with corrugation ribs, side handles, dents, white rust,
 * domed lid. opts: lid 'on'|'off'|'ajar', dents (count), rust 0..1. Origin: base centre.
 */
export function metalCan(rng, opts = {}) {
  const vs = VS_FINE;
  const lidState = opts.lid ?? rng.weighted(['on', 'off', 'ajar'], [5, 3, 2]);
  const H = Math.round(rng.range(0.64, 0.7) / vs), Rt = 0.262 / vs, Rb = 0.238 / vs;
  const n = Math.ceil(Rt * 2 + 10);
  const b = new VB(n, H + 2, n, vs, 'floor');
  const P = b.P;
  const galv = mat.galv(P, 'galv', rgbJitter(rng, [148, 152, 150], 0.05));
  const zinc = mat.galv(P, 'zinc', [160, 162, 158], { metal: 0.3, rough: 0.75, cls: MCLS.GENERIC });
  const c = n / 2;
  const dents = [];
  for (let i = 0, nd = opts.dents ?? rng.int(1, 4); i < nd; i++) dents.push({ a: rng.range(-Math.PI, Math.PI), y: rng.range(4, H - 6), r: rng.range(4, 9), d: rng.range(1, 2.6), R: Rt });
  const ribs = [0.2, 0.5, 0.8].map((t) => t * H);
  const rad = (a, y) => {
    // stepped taper (keeps long vertical face runs for greedy meshing)
    let r = Rb + (Rt - Rb) * (Math.floor((y / H) * 3 + 0.5) / 3);
    for (const ry of ribs) r += Math.max(0, 1 - Math.abs(y - ry) / 1.6) * 1.0;
    return r - dentAt(dents, a, y);
  };
  const fillTop = lidState === 'on' ? H - 1 : Math.round(H - rng.range(4, 12));
  cylShell(b, c, c, 1, fillTop, Rt + 2, rad, 999, galv);
  cylShell(b, c, c, fillTop, H - 1, Rt + 2, rad, 1.3, galv);
  // bottom: recessed floor + foot ring
  lathe(b, c, c, 0, 1, () => [Rb + 0.2, Rb - 1.4], galv);
  lathe(b, c, c, 1, 2, () => [Rb - 0.5, -1], galv);
  // rolled top rim
  torusY(b, c, H - 1, c, Rt + 0.2, 1.0, galv);
  // side handles with lugs
  const hy = Math.round(H * 0.8);
  for (const s of [-1, 1]) {
    const xr = c + s * (Rt + 0.2);
    b.box(Math.round(xr - 1), hy - 2, Math.round(c - 4), Math.round(xr + 1), hy + 2, Math.round(c - 2), galv);
    b.box(Math.round(xr - 1), hy - 2, Math.round(c + 2), Math.round(xr + 1), hy + 2, Math.round(c + 4), galv);
    const hx = c + s * (Rt + 2.4);
    b.g.line(hx, hy - 1, c - 3, hx, hy - 3, c, 0.7, galv);
    b.g.line(hx, hy - 3, c, hx, hy - 1, c + 3, 0.7, galv);
  }
  // contents visible at the top when the lid is not on
  if (lidState !== 'on') {
    const T = [mat.bag(P, 'tBag'), mat.paper(P, 'tPaper', [170, 164, 150]), mat.cardboard(P, 'tCard', [130, 98, 64])];
    const seed = rng.int(1, 1e5);
    const lvl = fillTop + 1;
    for (let z = 0; z < n; z++)
      for (let x = 0; x < n; x++) {
        const d = Math.hypot(x + 0.5 - c, z + 0.5 - c);
        if (d > Rt - 1.2) continue;
        const h = Math.round(lvl + (valueNoise2(x * 0.2, z * 0.2, seed) - 0.5) * 6);
        const k = valueNoise2(x * 0.15, z * 0.15, seed + 1);
        for (let y = h - 2; y <= Math.min(h, H - 1); y++) b.set(x, y, z, T[k < 0.5 ? 0 : k < 0.75 ? 1 : 2]);
      }
  }
  // weathering: dark mottling, white rust, rust at the foot and dents
  const seed = rng.int(1, 1e6);
  const rustAmt = opts.rust ?? rng.range(0.2, 0.7);
  recolor(b, [galv], (v, x, y, z, nn) => {
    if (y < 1 + rustAmt * 3 * nn) return V.rust(P, galv, 0.85);
    if (nn > 0.7) return V.tone(P, galv, 0.86, 0);
    if (nn < 0.12 + rustAmt * 0.06 && y < H * 0.5) return zinc;
    return undefined;
  }, { freq: 0.06, seed });
  for (const dn of dents) {
    if (!rng.chance(0.5)) continue;
    const x = Math.round(c + Math.cos(dn.a) * (Rt - dn.d)), z = Math.round(c + Math.sin(dn.a) * (Rt - dn.d));
    streaks(b, rng, [galv], { sources: [[x, Math.round(dn.y), z]], len: [4, 12], kind: 'rust', t: 0.4 });
  }
  grime(b, [galv], { h: 10, amount: 0.6, seed: seed + 2, k: 0.7 });

  const parts = [];
  const lidM = canLid(rng, Rt + 1.2, vs, 'galv', [150, 154, 152]);
  const top = (H - 0.5) * vs;
  if (lidState === 'on') parts.push({ name: 'lid', model: lidM, position: [0, top, 0], rotation: [0, rng.range(0, 6.28), 0] });
  else if (lidState === 'ajar') parts.push({ name: 'lid', model: lidM, position: [rng.range(-0.05, 0.05), top + 0.02, rng.range(0.03, 0.08)], rotation: [rng.range(0.12, 0.3), rng.range(0, 6.28), rng.range(-0.1, 0.1)] });
  else {
    const a = rng.range(0, 6.28), d = Rt * vs + 0.3;
    if (rng.chance(0.5)) parts.push({ name: 'lid', model: lidM, position: [Math.cos(a) * d, 0.08, Math.sin(a) * d], rotation: [Math.PI + rng.range(-0.1, 0.1), rng.range(0, 6.28), 0] });
    else parts.push({ name: 'lid', model: lidM, position: [Math.cos(a) * (d - 0.02), 0.27, Math.sin(a) * (d - 0.02)], rotation: [0, -a + Math.PI / 2, 1.3] });
  }
  return { model: b.model(), parts, meta: { size: b.sizeM(), footprint: [Rt * 2 * vs, Rt * 2 * vs], mount: 'floor', kind: 'metalCan', lid: lidState } };
}

/**
 * Plastic trash can (32 gal, "Brute"-style): tapered, vent channels, molded handles, rim.
 * opts: color 'grey'|'green'|'black'|'blue'|'brown' or [r,g,b], lid 'on'|'off'|'ajar'. Origin: base centre.
 */
export function plasticCan(rng, opts = {}) {
  const vs = VS_FINE;
  const COLS = { grey: [104, 106, 104], green: [44, 64, 48], black: [32, 32, 34], blue: [40, 66, 110], brown: [84, 64, 46] };
  const base = Array.isArray(opts.color) ? opts.color : rgbJitter(rng, COLS[opts.color ?? rng.weighted(['grey', 'green', 'black', 'blue', 'brown'], [4, 2, 2, 1, 1])], 0.05);
  const lidState = opts.lid ?? rng.weighted(['on', 'off', 'ajar'], [3, 4, 2]);
  const H = Math.round(0.69 / vs), Rt = 0.28 / vs, Rb = 0.235 / vs;
  const n = Math.ceil(Rt * 2 + 8);
  const b = new VB(n, H + 1, n, vs, 'floor');
  const P = b.P;
  const body = mat.plastic(P, 'body', base, { rough: 0.6 });
  const c = n / 2;
  const dents = [];
  for (let i = 0, nd = rng.int(0, 2); i < nd; i++) dents.push({ a: rng.range(-Math.PI, Math.PI), y: rng.range(6, H - 8), r: rng.range(5, 9), d: rng.range(0.8, 1.6), R: Rt });
  const rad = (a, y) => {
    let r = Rb + (Rt - Rb) * (Math.floor((y / H) * 3 + 0.5) / 3);
    // vent channels: 4 vertical grooves
    const g = Math.abs(Math.sin(2 * (a + 0.4)));
    if (g < 0.1 && y < H - 6 && y > 4) r -= 1;
    return r - dentAt(dents, a, y);
  };
  const fillTop = lidState === 'on' ? H - 2 : Math.round(H - rng.range(4, 13));
  cylShell(b, c, c, 1, fillTop, Rt + 2, rad, 999, body);
  cylShell(b, c, c, fillTop, H - 2, Rt + 2, rad, 1.5, body);
  lathe(b, c, c, 0, 1, () => [Rb - 0.5, -1], body);
  // thick rim with handle lugs
  lathe(b, c, c, H - 2, H, () => [Rt + 1.2, Rt - 0.8], body);
  for (const s of [-1, 1]) {
    const x0 = Math.round(c + s * (Rt + 0.5));
    b.box(Math.min(x0, x0 + s * 3), H - 6, Math.round(c - 4), Math.max(x0, x0 + s * 3) + 1, H - 1, Math.round(c + 4), body);
    b.box(Math.min(x0, x0 + s * 3), H - 5, Math.round(c - 3), Math.max(x0, x0 + s * 3) + 1, H - 3, Math.round(c + 3), 0);
  }
  if (lidState !== 'on') {
    const T = [mat.bag(P, 'tBag'), mat.plastic(P, 'tWhite', [180, 180, 174]), mat.cardboard(P, 'tCard', [130, 98, 64])];
    const seed = rng.int(1, 1e5);
    const lvl = fillTop + 1;
    for (let z = 0; z < n; z++)
      for (let x = 0; x < n; x++) {
        if (Math.hypot(x + 0.5 - c, z + 0.5 - c) > Rt - 1.6) continue;
        const h = Math.round(lvl + (valueNoise2(x * 0.2, z * 0.2, seed) - 0.5) * 6);
        const k = valueNoise2(x * 0.15, z * 0.15, seed + 1);
        for (let y = h - 2; y <= Math.min(h, H - 2); y++) b.set(x, y, z, T[k < 0.5 ? 0 : k < 0.75 ? 1 : 2]);
      }
  }
  const seed = rng.int(1, 1e6);
  mottle(b, [body], { freq: 0.06, seed, k: [0.85, 1.12], sat: 0.2, cover: 0.3 });
  grime(b, [body], { h: 12, amount: 0.6, seed: seed + 1, k: 0.72 });
  const parts = [];
  const lidM = canLid(rng, Rt + 1.5, vs, 'plastic', rgbMul(base, rng.range(0.9, 1.05)));
  const top = H * vs;
  if (lidState === 'on') parts.push({ name: 'lid', model: lidM, position: [0, top - 0.01, 0], rotation: [0, rng.range(0, 6.28), 0] });
  else if (lidState === 'ajar') parts.push({ name: 'lid', model: lidM, position: [0.02, top + 0.02, 0.05], rotation: [rng.range(0.1, 0.25), rng.range(0, 6.28), 0] });
  else if (rng.chance(0.7)) {
    const a = rng.range(0, 6.28), d = Rt * vs + 0.32;
    parts.push({ name: 'lid', model: lidM, position: [Math.cos(a) * d, 0.09, Math.sin(a) * d], rotation: [Math.PI + rng.range(-0.08, 0.08), rng.range(0, 6.28), 0] });
  }
  return { model: b.model(), parts, meta: { size: b.sizeM(), footprint: [Rt * 2 * vs, Rt * 2 * vs], mount: 'floor', kind: 'plasticCan', lid: lidState } };
}
