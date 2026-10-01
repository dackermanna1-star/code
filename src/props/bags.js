// Trash bags (tied, lumpy, glossy) and loose plastic bags.
import { VB, mat, MCLS, VS_FINE, VS_MED, COL, fieldFill, rgbMul, rgbMix, rgbJitter, valueNoise3, fbm3, clamp, vrand, eachSurface, F_PY } from './kit.js';

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

/** Flat triangular-ish flap (bag ears, torn film) from point o along dir, spreading along perp. */
function flap(b, o, dir, perp, L, w0, w1, v, thick = 0.75) {
  const nrm = [dir[1] * perp[2] - dir[2] * perp[1], dir[2] * perp[0] - dir[0] * perp[2], dir[0] * perp[1] - dir[1] * perp[0]];
  const R = L + Math.max(w0, w1) + 2;
  b.fill(o[0] - R, o[1] - R, o[2] - R, o[0] + R, o[1] + R, o[2] + R, (px, py, pz) => {
    const dx = px - o[0], dy = py - o[1], dz = pz - o[2];
    const a = dx * dir[0] + dy * dir[1] + dz * dir[2];
    if (a < 0 || a > L) return undefined;
    const c = dx * perp[0] + dy * perp[1] + dz * perp[2];
    const t = a / L;
    // slight cupping of the flap
    const n = dx * nrm[0] + dy * nrm[1] + dz * nrm[2] - (c * c) * 0.04;
    if (Math.abs(c) > w0 + (w1 - w0) * t) return undefined;
    if (Math.abs(n) > thick) return undefined;
    return v;
  });
}

const norm3 = (v) => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

/**
 * Tied garbage bag (glossy film over lumpy contents, gathered neck with knot and ears).
 * opts: color 'black'|'white'|'clear'|'grey'|'green'|'blue', shape 'stand'|'lie'|'slump',
 *       size (scale ~0.7..1.2), torn (bool), vs (default VS_MED; VS_FINE for hero close-ups)
 * Origin: centre of the footprint at ground level.
 */
export function trashBag(rng, opts = {}) {
  const vs = opts.vs ?? VS_MED;
  const color = opts.color ?? rng.weighted(['black', 'white', 'clear', 'grey', 'green'], [6, 2.4, 0.9, 1.1, 0.5]);
  const shape = opts.shape ?? rng.weighted(['stand', 'lie', 'slump'], [4, 2.5, 2]);
  const scale = opts.size ?? (color === 'white' ? rng.range(0.78, 0.92) : rng.range(0.88, 1.15));
  const torn = opts.torn ?? rng.chance(0.15);
  const spec = BAG_COLORS[color] ?? BAG_COLORS.black;
  const glossy = spec.cls === MCLS.TRASHBAG;

  let rx, ry, rz;
  if (shape === 'stand') [rx, ry, rz] = color === 'white' ? [0.21, 0.3, 0.19] : [0.25, 0.31, 0.22];
  else if (shape === 'lie') [rx, ry, rz] = [0.37, 0.18, 0.235];
  else [rx, ry, rz] = [0.29, 0.17, 0.26];
  rx *= scale * rng.range(0.9, 1.1);
  ry *= scale * rng.range(0.9, 1.1);
  rz *= scale * rng.range(0.9, 1.1);
  const neckLen = (shape === 'stand' ? 0.04 : 0.03) * scale;
  const earLen = rng.range(0.1, 0.16) * scale * (vs > VS_FINE * 1.5 ? 1.3 : 1);

  const R = (m) => m / vs;
  const RX = R(rx), RY = R(ry), RZ = R(rz);
  const extraX = shape === 'lie' ? R(neckLen + earLen + 0.04) : R(earLen);
  const extraY = shape === 'stand' ? R(neckLen + earLen + 0.03) : R(neckLen + earLen * 0.6);
  const nx = Math.ceil(RX * 2.5 + extraX * (shape === 'lie' ? 1 : 2)) + 4;
  const ny = Math.ceil(RY * 1.95 + extraY) + 2;
  const nz = Math.ceil(RZ * 2.5 + (shape === 'lie' ? 0 : extraX)) + 4;
  const b = new VB(nx, ny, nz, vs, 'floor');
  const P = b.P;
  const base = rgbJitter(rng, spec.color, 0.06, 0.02);
  const body = P.add('bag', { color: base, rough: spec.rough, cls: spec.cls, vari: glossy ? 0.14 : 0.06 });
  const fold = P.add('bagFold', { color: rgbMul(base, glossy ? 0.75 : 0.86), rough: spec.rough + 0.08, cls: spec.cls, vari: 0.1 });
  const dirt = P.add('bagDirt', { color: rgbMix(base, [64, 56, 46], color === 'white' ? 0.4 : 0.22), rough: 0.7, cls: MCLS.PLASTIC, vari: 0.12 });
  const tieCol = color === 'white' ? rng.pick([[150, 34, 30], [196, 168, 50], [196, 196, 190], [40, 90, 150]]) : null;
  const tie = tieCol ? P.add('tie', { color: tieCol, rough: 0.45, cls: MCLS.PLASTIC, vari: 0.05 }) : body;
  const contents = CONTENT.map((c, i) => P.add(`content${i}`, { color: color === 'clear' ? rgbMix(c, base, 0.5) : c, rough: color === 'clear' ? 0.3 : 0.8, cls: color === 'clear' ? MCLS.PLASTIC : MCLS.PAPER, vari: 0.12 }));

  const cx = shape === 'lie' ? nx / 2 - extraX / 2 : nx / 2, cz = nz / 2;
  const cy = RY * 0.86;
  const seed = rng.int(1, 1e6);
  const minR = Math.min(RX, RY, RZ);
  const bumps = [];
  for (let i = 0, nb = rng.int(8, 14); i < nb; i++) {
    const th = rng.range(0, Math.PI * 2), ph = rng.range(-0.2, 1.1);
    const dir = [Math.cos(th) * Math.cos(ph), Math.sin(ph), Math.sin(th) * Math.cos(ph)];
    const sharp = rng.chance(0.22);
    bumps.push({
      x: cx + dir[0] * RX * 0.85, y: cy + dir[1] * RY * 0.8, z: cz + dir[2] * RZ * 0.85,
      r: (sharp ? rng.range(0.14, 0.2) : rng.range(0.3, 0.5)) * minR,
      a: sharp ? rng.range(0.1, 0.16) : rng.range(0.06, 0.18) * (rng.chance(0.25) ? -1 : 1),
    });
  }
  // creases: grooves along random planes near the surface
  const creases = [];
  for (let i = 0, nc = vs > VS_FINE * 1.5 ? rng.int(1, 3) : rng.int(4, 8); i < nc; i++) {
    const th = rng.range(0, Math.PI * 2), ph = rng.range(-0.3, 1.0);
    const c = [cx + Math.cos(th) * Math.cos(ph) * RX, cy + Math.sin(ph) * RY, cz + Math.sin(th) * Math.cos(ph) * RZ];
    creases.push({ c, n: norm3([rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)]), L: rng.range(0.3, 0.7) * Math.max(RX, RZ) });
  }
  // asymmetric sag / lean; one side flattened (leaning against something)
  const lean = [rng.range(-0.2, 0.2), rng.range(-0.2, 0.2)];
  const flatSide = rng.chance(0.4) ? rng.pick([[1, 0], [-1, 0], [0, 1], [0, -1]]) : null;
  const ph = shape === 'slump' ? 2.3 : rng.range(2.4, 3.0), pv = shape === 'slump' ? 2.0 : 2.4;
  const nf = rng.int(5, 8), fph = rng.range(0, 6.28);
  const neckOff = shape === 'stand' ? [rng.range(-0.15, 0.15) * RX, rng.range(-0.15, 0.15) * RZ] : [0, 0];

  const shapeFn = (px, py, pz) => {
    let dx = px - cx, dy = py - cy, dz = pz - cz;
    const t = clamp(py / (cy + RY), 0, 1);
    let sx = 1 + 0.2 * Math.pow(1 - t, 1.5), sz = sx;
    let gather = 0;
    if (shape === 'lie') {
      const tx = clamp((dx / RX + 1) / 2, 0, 1);
      sz = 1 + 0.18 * Math.pow(1 - t, 1.5);
      sx = 1;
      if (tx > 0.7) {
        const k = (tx - 0.7) / 0.3;
        const sh = 1 - 0.55 * k * k;
        dy /= sh;
        dz /= sh;
        gather = k;
      }
    } else {
      dx -= lean[0] * dy + neckOff[0] * t * t;
      dz -= lean[1] * dy + neckOff[1] * t * t;
      const g0 = shape === 'slump' ? 0.5 : 0.6;
      if (t > g0) {
        const k = (t - g0) / (1 - g0);
        sx *= 1 - 0.5 * k * k;
        sz = sx;
        gather = k;
      }
    }
    let ax = Math.abs(dx / (RX * sx)), ay = Math.abs(dy / RY), az = Math.abs(dz / (RZ * sz));
    if (flatSide) {
      // flattened where it leans: compress the outer part of one side
      const sd = flatSide[0] ? (dx / (RX * sx)) * flatSide[0] : (dz / (RZ * sz)) * flatSide[1];
      if (sd > 0.55) {
        const k = 1 + (sd - 0.55) * 0.9;
        if (flatSide[0]) ax *= k;
        else az *= k;
      }
    }
    const q = ax * ax + ay * ay + az * az;
    if (q > 2.6) return 2;
    if (q < 0.2 && gather === 0) return 0.5;
    let r = shape === 'lie'
      ? Math.pow(Math.pow(Math.pow(ay, ph) + Math.pow(az, ph), pv / ph) + Math.pow(ax, pv), 1 / pv)
      : Math.pow(Math.pow(Math.pow(ax, ph) + Math.pow(az, ph), pv / ph) + Math.pow(ay, pv), 1 / pv);
    if (gather > 0) {
      const th = shape === 'lie' ? Math.atan2(dy, dz) : Math.atan2(dz, dx);
      r += gather * 0.05 * (0.5 + 0.5 * Math.sin(nf * th + fph + gather * 2.5 + valueNoise3(px * 0.2, py * 0.2, pz * 0.2, seed + 21) * 3));
    }
    return r;
  };

  const field = (px, py, pz) => {
    let r = shapeFn(px, py, pz);
    if (r > 1.4) return r;
    for (let i = 0; i < bumps.length; i++) {
      const k = bumps[i];
      const dx = px - k.x, dy = py - k.y, dz = pz - k.z;
      r -= k.a * Math.exp(-(dx * dx + dy * dy + dz * dz) / (k.r * k.r));
    }
    return r + (valueNoise3(px * 0.1, py * 0.1, pz * 0.1, seed) - 0.5) * 0.1;
  };
  fieldFill(b, cx - RX * 1.35 - 2, 0, cz - RZ * 1.35 - 2, cx + RX * 1.35 + 2, cy + RY * 1.1 + 2, cz + RZ * 1.35 + 2, field, (x, y, z, r) => {
    let crease = false;
    if (r > 0.8) {
      const px = x + 0.5, py = y + 0.5, pz = z + 0.5;
      for (const c of creases) {
        const dx = px - c.c[0], dy = py - c.c[1], dz = pz - c.c[2];
        if (dx * dx + dy * dy + dz * dz > c.L * c.L) continue;
        if (Math.abs(dx * c.n[0] + dy * c.n[1] + dz * c.n[2]) < 0.7) {
          r += 0.045;
          crease = true;
        }
      }
    }
    if (r >= 1) return undefined;
    return crease ? fold : body;
  }, vs < VS_MED * 0.75 ? 2 : 1);

  // ── neck, knot, ears ──
  const knot = (kx, ky, kz, upish) => {
    const kr = Math.max(1.2, R(0.024 * scale));
    b.g.ellipsoid(kx, ky, kz, kr + 0.5, kr, kr + 0.5, tie);
    const ears = 2;
    const a0 = rng.range(0, Math.PI * 2);
    for (let e = 0; e < ears; e++) {
      const ang = a0 + e * Math.PI + rng.range(-0.5, 0.5);
      const up = upish ? rng.range(0.45, 1.05) : rng.range(-0.1, 0.45);
      const dir = norm3([Math.cos(ang) * Math.cos(up), Math.sin(up), Math.sin(ang) * Math.cos(up)]);
      const perp = norm3([-Math.sin(ang), rng.range(-0.3, 0.3), Math.cos(ang)]);
      const L = R(earLen) * rng.range(0.8, 1.15);
      flap(b, [kx, ky, kz], dir, perp, L, Math.max(0.8, R(0.012)), Math.max(1.4, R(0.035 * scale)), tie === body ? body : body);
    }
    if (tieCol) {
      for (let l = 0; l < 2; l++) {
        const a = rng.range(0, Math.PI * 2);
        const L = Math.max(2, R(0.05 * scale));
        b.g.line(kx, ky, kz, kx + Math.cos(a) * L, ky + Math.max(1, R(0.025)), kz + Math.sin(a) * L, 0.6, tie);
        b.g.line(kx + Math.cos(a) * L, ky + Math.max(1, R(0.025)), kz + Math.sin(a) * L, kx + Math.cos(a + 0.7) * L * 0.6, ky - 0.5, kz + Math.sin(a + 0.7) * L * 0.6, 0.6, tie);
      }
    }
  };
  if (shape === 'stand' || shape === 'slump') {
    const topY = cy + RY * (shape === 'slump' ? 0.85 : 0.97);
    const tx = cx + lean[0] * RY * 0.9 + neckOff[0], tz = cz + lean[1] * RY * 0.9 + neckOff[1];
    const tilt = shape === 'slump' ? [rng.range(-1, 1), rng.range(-1, 1)] : [rng.range(-0.35, 0.35), rng.range(-0.35, 0.35)];
    const nl = R(neckLen);
    const kx = tx + tilt[0] * nl * 0.7, ky = topY + nl * (shape === 'slump' ? 0.55 : 1), kz = tz + tilt[1] * nl * 0.7;
    b.g.line(tx, topY - 2, tz, kx, ky, kz, Math.max(1.1, R(0.03 * scale)), fold);
    knot(kx, ky, kz, shape === 'stand');
  } else {
    const ex = cx + RX * 0.95, ey = cy * 0.8;
    const nl = R(neckLen);
    const kz = cz + rng.range(-1.5, 1.5);
    b.g.line(ex - 2, ey, cz, ex + nl, ey - nl * 0.6, kz, Math.max(1.0, R(0.028 * scale)), fold);
    knot(ex + nl, Math.max(1.5, ey - nl * 0.6), kz, false);
  }

  // ── wet underside, contents of clear bags, tears ──
  const tearSeed = rng.int(1, 1e6);
  const tears = [];
  if (torn) {
    for (let i = 0, nT = rng.int(1, 2); i < nT; i++) tears.push({ x: cx + rng.range(-RX, RX) * 0.7, y: cy + rng.range(-0.4, 0.3) * RY, z: rng.chance(0.5) ? cz + RZ : cz - RZ, r: Math.max(2, R(rng.range(0.04, 0.08))) });
  }
  const set = [];
  eachSurface(b.g, (v, x, y, z) => {
    if (y === 0 && vrand(x, y, z, seed) < 0.7) set.push(x, y, z, dirt);
    if (color === 'clear') {
      const n = valueNoise3(x * 0.16, y * 0.16, z * 0.16, seed + 11);
      if (n > 0.55) set.push(x, y, z, contents[Math.floor(valueNoise3(x * 0.08, y * 0.08, z * 0.08, seed + 13) * 7) % 7]);
    }
    for (const t of tears) {
      const dx = (x + 0.5 - t.x) / t.r, dy = (y + 0.5 - t.y) / (t.r * 0.6), dz = (z + 0.5 - t.z) / t.r;
      if (dx * dx + dy * dy + dz * dz * 0.3 < 1 + (valueNoise3(x * 0.5, y * 0.5, z * 0.5, tearSeed) - 0.5)) set.push(x, y, z, contents[Math.floor(vrand(x, y, z, tearSeed) * 7)]);
    }
  });
  for (let i = 0; i < set.length; i += 4) b.g.set(set[i], set[i + 1], set[i + 2], set[i + 3]);
  for (const t of tears) {
    for (let i = 0, n = rng.int(2, 4); i < n; i++) {
      const sx = Math.round(t.x + rng.range(-3, 3)), sz = Math.round(t.z + (t.z > cz ? rng.range(1, 4) : -rng.range(1, 4)));
      b.box(sx, 0, sz, sx + rng.int(1, 2), 1, sz + rng.int(1, 2), contents[rng.int(0, 6)]);
    }
  }

  return {
    model: b.model(),
    meta: { size: b.sizeM(), footprint: [rx * 2.1, rz * 2.1], mount: 'floor', kind: 'trashBag', color, shape, height: (cy + RY) * vs },
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
  const nx = Math.ceil((variant === 3 ? L * 0.55 : L) / vs) + 4, nz = Math.ceil((variant === 3 ? Wd * 0.7 : Wd) / vs) + 4, ny = Math.ceil((variant === 3 ? 0.1 : 0.07) / vs) + 2;
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
      const r = Math.sqrt(dx * dx + dy * dy + dz * dz) + (valueNoise3(px * 0.25, py * 0.25, pz * 0.25, seed) - 0.5) * 0.5;
      if (r < 1) return valueNoise3(px * 0.3, py * 0.3, pz * 0.3, seed + 1) > 0.66 ? crease : film;
      return undefined;
    });
  } else {
    // a crumpled sheet: smooth low height field (folds), single layer, a few creases
    const amp = variant === 1 ? 2.2 : 1.4;
    for (let z = 1; z < nz - 1; z++)
      for (let x = 1; x < nx - 1; x++) {
        const u = (x + 0.5 - cx) / (nx / 2 - 1), w = (z + 0.5 - cz) / (nz / 2 - 1);
        const edge = Math.max(Math.abs(u), Math.abs(w)) + (valueNoise3(x * 0.25, 0, z * 0.25, seed) - 0.5) * 0.3;
        if (edge > 0.95) continue;
        if (u > 0.55 && Math.abs(w) < 0.3 && variant !== 2) continue; // handle opening
        const h = Math.max(0, Math.min(ny - 1, Math.round(valueNoise3(x * 0.12, 0, z * 0.12, seed + 5) * amp)));
        let m = film;
        if (Math.abs(valueNoise3(x * 0.1, 1, z * 0.1, seed + 2) - 0.5) < 0.03) m = crease;
        if (variant !== 2 && Math.abs(u) < 0.25 && Math.abs(w + 0.1) < 0.18) m = print;
        b.set(x, h, z, m);
      }
  }
  return { model: b.model(), meta: { size: b.sizeM(), footprint: [L, Wd], kind: 'plasticBag' } };
}
