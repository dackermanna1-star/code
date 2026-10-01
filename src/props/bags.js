// Trash bags (tied, lumpy, glossy) and loose plastic bags.
import { VB, mat, MCLS, VS_FINE, COL, rgbMul, rgbMix, rgbJitter, valueNoise3, fbm3, clamp, vrand, eachSurface, F_PY } from './kit.js';

const BAG_COLORS = {
  black: { color: COL.bagBlack, cls: MCLS.TRASHBAG, rough: 0.28 },
  grey: { color: [58, 60, 62], cls: MCLS.TRASHBAG, rough: 0.36 },
  green: { color: [34, 52, 38], cls: MCLS.TRASHBAG, rough: 0.32 },
  white: { color: [192, 192, 186], cls: MCLS.PLASTIC, rough: 0.42 },
  clear: { color: [128, 140, 146], cls: MCLS.PLASTIC, rough: 0.22 },
  blue: { color: [52, 78, 116], cls: MCLS.PLASTIC, rough: 0.36 },
};

const CONTENT = [
  [176, 170, 152], // paper
  [128, 98, 62], // cardboard
  [122, 38, 34], // red can / packaging
  [58, 78, 120], // blue packaging
  [64, 84, 58], // green bottle
  [190, 180, 120], // yellowed food packaging
  [92, 74, 52], // food waste
];

/**
 * Tied garbage bag.
 * opts: color 'black'|'white'|'clear'|'grey'|'green'|'blue', shape 'stand'|'lie'|'slump',
 *       size (scale, ~0.7..1.2), torn (bool), vs (voxel size, default VS_FINE)
 */
export function trashBag(rng, opts = {}) {
  const vs = opts.vs ?? VS_FINE;
  const color = opts.color ?? rng.weighted(['black', 'white', 'clear', 'grey', 'green'], [6, 2.4, 0.9, 1.1, 0.5]);
  const shape = opts.shape ?? rng.weighted(['stand', 'lie', 'slump'], [4, 2.5, 2]);
  const scale = opts.size ?? (color === 'white' ? rng.range(0.68, 0.85) : rng.range(0.85, 1.15));
  const torn = opts.torn ?? rng.chance(0.15);
  const spec = BAG_COLORS[color] ?? BAG_COLORS.black;

  // body radii in meters
  let rx, ry, rz;
  if (shape === 'stand') [rx, ry, rz] = [0.25, 0.3, 0.215];
  else if (shape === 'lie') [rx, ry, rz] = [0.38, 0.185, 0.235];
  else [rx, ry, rz] = [0.3, 0.17, 0.27];
  rx *= scale * rng.range(0.9, 1.1);
  ry *= scale * rng.range(0.9, 1.1);
  rz *= scale * rng.range(0.9, 1.1);
  const neckLen = (shape === 'stand' ? 0.1 : 0.07) * scale;
  const earLen = rng.range(0.07, 0.12) * scale;

  const R = (m) => m / vs;
  const RX = R(rx), RY = R(ry), RZ = R(rz);
  const extraX = shape === 'lie' ? R(neckLen + earLen + 0.05) : R(0.06);
  const extraY = shape === 'stand' ? R(neckLen + earLen + 0.04) : shape === 'slump' ? R(neckLen + earLen) : R(0.05);
  const nx = Math.ceil(RX * 2 * 1.25 + extraX * 2) + 4;
  const ny = Math.ceil(RY * 2 * 1.05 + extraY) + 3;
  const nz = Math.ceil(RZ * 2 * 1.25) + 4;
  const b = new VB(nx, ny, nz, vs, 'floor');
  const P = b.P;
  const base = rgbJitter(rng, spec.color, 0.06, 0.02);
  const body = P.add('bag', { color: base, rough: spec.rough, cls: spec.cls, vari: spec.cls === MCLS.TRASHBAG ? 0.14 : 0.06 });
  const fold = P.add('bagFold', { color: rgbMul(base, spec.cls === MCLS.TRASHBAG ? 0.7 : 0.82), rough: spec.rough + 0.08, cls: spec.cls, vari: 0.1 });
  const hi = P.add('bagHi', { color: rgbMul(base, spec.cls === MCLS.TRASHBAG ? 1.5 : 1.06), rough: spec.rough * 0.8, cls: spec.cls, vari: 0.1 });
  const dirt = P.add('bagDirt', { color: rgbMix(base, [70, 62, 52], color === 'white' ? 0.45 : 0.35), rough: 0.75, cls: MCLS.PLASTIC, vari: 0.12 });
  const tieCol = color === 'white' ? rng.pick([[150, 34, 30], [196, 168, 50], [196, 196, 190], [40, 90, 150]]) : base;
  const tie = P.add('tie', { color: tieCol, rough: 0.45, cls: MCLS.PLASTIC, vari: 0.05 });
  const contents = CONTENT.map((c, i) => P.add(`content${i}`, { color: color === 'clear' ? rgbMix(c, base, 0.5) : c, rough: color === 'clear' ? 0.3 : 0.8, cls: color === 'clear' ? MCLS.PLASTIC : MCLS.PAPER, vari: 0.12 }));

  const cx = nx / 2, cz = nz / 2;
  // body centre: bags settle, so the centre sits low and the bottom is flattened by the ground
  const cy = RY * 0.92;
  const seed = rng.int(1, 1e6);
  // lumps: contents pushing against the film
  const bumps = [];
  const nb = rng.int(7, 13);
  for (let i = 0; i < nb; i++) {
    const th = rng.range(0, Math.PI * 2), ph = rng.range(-0.3, 1.2);
    const dir = [Math.cos(th) * Math.cos(ph), Math.sin(ph), Math.sin(th) * Math.cos(ph)];
    const rr = rng.range(0.22, 0.42) * Math.min(RX, RY, RZ);
    bumps.push({ x: cx + dir[0] * RX * 0.8, y: cy + dir[1] * RY * 0.75, z: cz + dir[2] * RZ * 0.8, r: rr, a: rng.range(0.06, 0.16) * (rng.chance(0.2) ? -1 : 1) });
  }
  const lean = [rng.range(-0.15, 0.15), rng.range(-0.15, 0.15)];
  const pw = shape === 'slump' ? 2.2 : 2.5;

  const shapeFn = (px, py, pz) => {
    let dx = px - cx, dy = py - cy, dz = pz - cz;
    const t = clamp(py / (cy + RY), 0, 1);
    // sag: wider low, gathered toward the neck
    let sx = 1 + 0.16 * (1 - t), sz = sx;
    if (shape === 'stand' && t > 0.7) {
      const k = (t - 0.7) / 0.3;
      sx *= 1 - 0.55 * k * k;
      sz = sx;
    }
    if (shape === 'lie') {
      // taper toward the tied end (+x)
      const tx = clamp((dx / RX + 1) / 2, 0, 1);
      if (tx > 0.72) {
        const k = (tx - 0.72) / 0.28;
        const s = 1 - 0.5 * k * k;
        dy /= s;
        dz /= s;
      }
      dy -= lean[0] * dx * 0.2;
    } else {
      dx -= lean[0] * dy;
      dz -= lean[1] * dy;
    }
    const ax = Math.abs(dx / (RX * sx)), ay = Math.abs(dy / RY), az = Math.abs(dz / (RZ * sz));
    let r = Math.pow(Math.pow(ax, pw) + Math.pow(ay, pw) + Math.pow(az, pw), 1 / pw);
    // vertical gathering creases toward the neck
    if (shape !== 'lie') r += (valueNoise3(px * 0.32, py * 0.06, pz * 0.32, seed + 7) - 0.5) * 0.08 * t;
    else r += (valueNoise3(px * 0.06, py * 0.3, pz * 0.3, seed + 7) - 0.5) * 0.07;
    return r;
  };

  // fill
  const [bx0, bx1] = [cx - RX * 1.3 - 2, cx + RX * 1.3 + 2];
  b.fill(bx0, 0, cz - RZ * 1.3 - 2, bx1, cy + RY * 1.1 + 2, cz + RZ * 1.3 + 2, (px, py, pz, x, y, z) => {
    let r = shapeFn(px, py, pz);
    if (r > 1.5) return undefined;
    for (let i = 0; i < bumps.length; i++) {
      const k = bumps[i];
      const dx = px - k.x, dy = py - k.y, dz = pz - k.z;
      r -= k.a * Math.exp(-(dx * dx + dy * dy + dz * dz) / (k.r * k.r));
    }
    r += (valueNoise3(px * 0.22, py * 0.22, pz * 0.22, seed) - 0.5) * 0.09;
    if (r >= 1) return undefined;
    // fold shading: thin bands where the film creases
    const f = valueNoise3(px * 0.28, py * 0.12, pz * 0.28, seed + 3);
    if (f > 0.7) return fold;
    if (f < 0.16 && spec.cls === MCLS.TRASHBAG) return hi;
    return body;
  });

  // neck + knot + ears
  const knot = (kx, ky, kz, dir) => {
    b.g.ellipsoid(kx, ky, kz, R(0.026 * scale) + 0.6, R(0.024 * scale) + 0.6, R(0.026 * scale) + 0.6, tie === body ? body : tie);
    const ears = rng.int(2, 3);
    for (let e = 0; e < ears; e++) {
      const ang = rng.range(0, Math.PI * 2);
      const up = dir === 'up' ? rng.range(0.25, 0.9) : rng.range(-0.3, 0.5);
      const L = R(earLen) * rng.range(0.7, 1.15);
      let ex = Math.cos(ang) * Math.cos(up), ey = Math.sin(up), ez = Math.sin(ang) * Math.cos(up);
      if (dir === 'side') ex = Math.abs(ex) + 0.4;
      const wv = R(0.025 * scale) + 1;
      // flat fan: several capsules spreading from the knot
      const px = -ez, pz = ex;
      for (let k = -1; k <= 1; k++) {
        const ox = px * k * wv * 0.6, oz = pz * k * wv * 0.6;
        b.g.line(kx, ky, kz, kx + ex * L + ox, ky + ey * L - Math.abs(k) * 0.8, kz + ez * L + oz, 0.75, color === 'white' ? body : body);
      }
    }
    if (color === 'white') {
      // drawstring loops
      for (let l = 0; l < 2; l++) {
        const a = rng.range(0, Math.PI * 2);
        const L = R(0.05 * scale);
        b.g.line(kx, ky, kz, kx + Math.cos(a) * L, ky + R(0.03), kz + Math.sin(a) * L, 0.7, tie);
        b.g.line(kx + Math.cos(a) * L, ky + R(0.03), kz + Math.sin(a) * L, kx + Math.cos(a + 0.6) * L * 0.7, ky - 1, kz + Math.sin(a + 0.6) * L * 0.7, 0.7, tie);
      }
    }
  };
  if (shape === 'stand' || shape === 'slump') {
    const topY = cy + RY * (shape === 'slump' ? 0.85 : 0.97);
    const tx = cx + lean[0] * RY * 0.9, tz = cz + lean[1] * RY * 0.9;
    const tilt = shape === 'slump' ? [rng.range(-1, 1), rng.range(-1, 1)] : [rng.range(-0.3, 0.3), rng.range(-0.3, 0.3)];
    const nl = R(neckLen);
    const kx = tx + tilt[0] * nl * 0.6, ky = topY + nl * (shape === 'slump' ? 0.5 : 1), kz = tz + tilt[1] * nl * 0.6;
    // gathered neck: tapering capsule
    b.g.line(tx, topY - 2, tz, kx, ky, kz, R(0.03 * scale) + 0.8, fold);
    b.g.line(tx, topY - 2, tz, (tx + kx) / 2, (topY + ky) / 2, (tz + kz) / 2, R(0.045 * scale) + 0.8, body);
    knot(kx, ky, kz, shape === 'slump' ? 'side' : 'up');
  } else {
    const ex = cx + RX * 0.98, ey = cy * 0.95;
    const nl = R(neckLen);
    b.g.line(ex - 2, ey, cz, ex + nl, ey - nl * 0.3, cz + rng.range(-2, 2), R(0.03 * scale) + 0.8, fold);
    knot(ex + nl, ey - nl * 0.3, cz, 'side');
  }

  // dirty / wet bottom and torn openings
  const tearSeed = rng.int(1, 1e6);
  const tears = [];
  if (torn) {
    const nT = rng.int(1, 2);
    for (let i = 0; i < nT; i++) tears.push({ x: cx + rng.range(-RX, RX) * 0.8, y: cy + rng.range(-0.5, 0.3) * RY, z: rng.chance(0.5) ? cz + RZ : cz - RZ, r: R(rng.range(0.04, 0.09)) });
  }
  const set = [];
  eachSurface(b.g, (v, x, y, z, m) => {
    if (y < 3 && rng.chance(0.75)) set.push(x, y, z, dirt);
    else if (y < 6 && vrand(x, y, z, seed) < 0.3) set.push(x, y, z, dirt);
    if (color === 'clear') {
      const n = valueNoise3(x * 0.2, y * 0.2, z * 0.2, seed + 11);
      if (n > 0.55) set.push(x, y, z, contents[Math.floor(valueNoise3(x * 0.1, y * 0.1, z * 0.1, seed + 13) * 7) % 7]);
    }
    for (const t of tears) {
      const dx = (x + 0.5 - t.x) / t.r, dy = (y + 0.5 - t.y) / (t.r * 0.6), dz = (z + 0.5 - t.z) / t.r;
      const d = dx * dx + dy * dy + dz * dz * 0.3;
      if (d < 1 + (valueNoise3(x * 0.5, y * 0.5, z * 0.5, tearSeed) - 0.5)) set.push(x, y, z, contents[Math.floor(vrand(x, y, z, tearSeed) * 7)]);
    }
  });
  for (let i = 0; i < set.length; i += 4) b.g.set(set[i], set[i + 1], set[i + 2], set[i + 3]);
  // spill a few chunks out of tears
  for (const t of tears) {
    const n = rng.int(2, 5);
    for (let i = 0; i < n; i++) {
      const sx = Math.round(t.x + rng.range(-3, 3)), sz = Math.round(t.z + (t.z > cz ? rng.range(1, 6) : -rng.range(1, 6)));
      const s = rng.int(1, 2);
      b.box(sx, 0, sz, sx + s + 1, s, sz + s, contents[rng.int(0, 6)]);
    }
  }

  const size = b.sizeM();
  return {
    model: b.model(),
    meta: { size, footprint: [rx * 2.1, rz * 2.1], kind: 'trashBag', color, shape, height: (cy + RY) * vs },
  };
}

/**
 * Loose crumpled plastic grocery bag (low voxel count, lies flat-ish).
 * opts: color 'white'|'grey'|'black'|'blue'|'yellow', variant 0..3
 */
export function plasticBag(rng, opts = {}) {
  const vs = opts.vs ?? VS_FINE;
  const color = opts.color ?? rng.weighted(['white', 'grey', 'black', 'blue', 'yellow'], [4, 2, 2, 1, 0.6]);
  const cols = { white: [200, 200, 194], grey: [150, 150, 146], black: [26, 26, 28], blue: [60, 90, 140], yellow: [196, 170, 70] };
  const variant = opts.variant ?? rng.int(0, 3);
  const L = rng.range(0.22, 0.34), Wd = rng.range(0.16, 0.24);
  const nx = Math.ceil(L / vs) + 4, nz = Math.ceil(Wd / vs) + 4, ny = Math.ceil((variant === 3 ? 0.12 : 0.07) / vs) + 2;
  const b = new VB(nx, ny, nz, vs, 'floor');
  const base = rgbJitter(rng, cols[color], 0.05);
  const film = mat.plastic(b.P, 'film', base, { rough: 0.38, vari: 0.1, cls: color === 'black' ? MCLS.TRASHBAG : MCLS.PLASTIC });
  const crease = mat.plastic(b.P, 'crease', rgbMul(base, 0.78), { rough: 0.5 });
  const print = mat.plastic(b.P, 'print', rng.pick([[150, 40, 36], [40, 60, 120], [30, 30, 30]]), { rough: 0.45 });
  const seed = rng.int(1, 1e6);
  const cx = nx / 2, cz = nz / 2;
  // a crumpled sheet: height field with folds, a crumpled ball for variant 3
  if (variant === 3) {
    b.fill(0, 0, 0, nx, ny, nz, (px, py, pz) => {
      const dx = (px - cx) / (nx * 0.32), dy = (py - ny * 0.4) / (ny * 0.45), dz = (pz - cz) / (nz * 0.38);
      const r = Math.sqrt(dx * dx + dy * dy + dz * dz) + (valueNoise3(px * 0.4, py * 0.4, pz * 0.4, seed) - 0.5) * 0.6;
      if (r < 1 && r > 0.55) return valueNoise3(px * 0.6, py * 0.6, pz * 0.6, seed + 1) > 0.62 ? crease : film;
      return undefined;
    });
  } else {
    for (let z = 1; z < nz - 1; z++)
      for (let x = 1; x < nx - 1; x++) {
        const u = (x + 0.5 - cx) / (nx / 2 - 1), w = (z + 0.5 - cz) / (nz / 2 - 1);
        // outline: rounded rectangle with ragged edge and handle notches at one end
        const edge = Math.max(Math.abs(u), Math.abs(w)) + (valueNoise3(x * 0.35, 0, z * 0.35, seed) - 0.5) * 0.35;
        if (edge > 0.95) continue;
        if (u > 0.55 && Math.abs(w) < 0.3 && variant !== 2) continue; // handle opening
        const hgt = Math.floor(fbm3(x * 0.25, 0, z * 0.25, 2, seed + 5) * (ny - 1) * (variant === 1 ? 1.4 : 0.9));
        const h = Math.max(0, Math.min(ny - 1, hgt));
        b.set(x, h, z, valueNoise3(x * 0.5, 3, z * 0.5, seed + 2) > 0.66 ? crease : film);
        if (h > 0 && vrand(x, h, z, seed) < 0.5) b.set(x, h - 1, z, film);
        if (variant !== 2 && Math.abs(u) < 0.25 && Math.abs(w + 0.1) < 0.18 && vrand(x, 0, z, seed + 3) < 0.7) b.set(x, h, z, print);
      }
  }
  return { model: b.model(), meta: { size: b.sizeM(), footprint: [L, Wd], kind: 'plasticBag' } };
}
