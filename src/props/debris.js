// Small debris for instanced scatter. Every generator accepts opts.variant (integer) to pick a
// deterministic variant; the rest of the variation comes from rng. Budgets: <= ~600 tris.
// Cans / bottles / cups / food boxes use VS_FINE; tiny items (butts, caps, shards, leaves,
// flat paper) use VS_FINE/2.
import {
  VB, mat, V, MCLS, VS_FINE, VS_XFINE, rgbMul, rgbMix, rgbJitter, valueNoise2, valueNoise3, fbm2, clamp,
  recolor, vrand, rotate90, lathe, latheX, emptyModel, rot, restPos, crop,
} from './kit.js';

const pickV = (rng, opts, n) => (opts.variant ?? rng.int(0, n - 1)) % n;

/** Finalize a debris builder: crop to content and set floor mount. */
function fin(b, meta) {
  const { b: c } = crop(b);
  c.setMount('floor');
  return { model: c.model(), meta: { size: c.sizeM(), footprint: [c.nx * c.vs, c.nz * c.vs], mount: 'floor', ...meta } };
}

// ───────────────────────────── cans ─────────────────────────────

const CAN_COLORS = {
  red: [[168, 30, 30], [220, 218, 210]],
  blue: [[30, 58, 136], [190, 192, 196]],
  silver: [[182, 184, 188], [40, 70, 150]],
  green: [[36, 104, 58], [210, 200, 120]],
  gold: [[186, 146, 58], [40, 40, 40]],
  white: [[222, 220, 212], [180, 40, 40]],
  black: [[30, 30, 32], [200, 160, 60]],
};

/**
 * 12 oz drink can. opts: variant (0 standing, 1-2 lying, 3 crushed, 4 flattened), color key.
 */
export function can(rng, opts = {}) {
  const vs = opts.vs ?? VS_FINE;
  const v = pickV(rng, opts, 5);
  const ck = opts.color ?? rng.pick(Object.keys(CAN_COLORS));
  const [c1, c2] = CAN_COLORS[ck] ?? CAN_COLORS.red;
  const s = VS_FINE / vs;
  const R = 2.45 * s, L = Math.round(9 * s);
  const b = new VB(Math.ceil(R * 2 + 3), L + 3, Math.ceil(R * 2 + 3), vs, 'corner');
  const P = b.P;
  const body = mat.generic(P, 'body', rgbJitter(rng, c1, 0.05), { rough: 0.3, metal: 0.75, vari: 0.04 });
  const band = mat.generic(P, 'band', c2, { rough: 0.3, metal: 0.7, vari: 0.04 });
  const alu = mat.generic(P, 'alu', [176, 178, 180], { rough: 0.3, metal: 0.9, vari: 0.04 });
  const c = (R * 2 + 3) / 2;
  const crushed = v === 3, flat = v === 4;
  const bandY = Math.round(L * rng.range(0.35, 0.6));
  lathe(b, c, c, 0, L, (y) => {
    let r = R;
    if (y < 1 || y > L - 1) r -= 0.5;
    if (crushed) r += Math.sin(y * 1.9 + 1) * 0.6 + 0.5;
    return [r, -1];
  }, (x, y, z, a) => (y < 0.9 || y > L - 1.1 ? alu : Math.abs(y - bandY) < 1 + Math.sin(a * 2) * 0.6 ? band : body));
  let bb = b;
  if (crushed) {
    // stepped on: squash height to about 45 %
    const h2 = Math.max(3, Math.round(L * 0.42));
    const nb = new VB(b.nx, h2 + 1, b.nz, vs, 'corner');
    nb.P = P;
    b.g.forEach((val, x, y, z) => val && nb.set(x, Math.min(h2, Math.round(y * (h2 / L) + (vrand(x, y, z, 5) - 0.5))), z, val));
    bb = rotate90(nb, 'z', rng.chance(0.5) ? 1 : 0);
  } else if (flat) {
    // run over: flat oval
    const nb = new VB(Math.ceil(R * 3.4), 2, L + 2, vs, 'corner');
    nb.P = P;
    const cx = nb.nx / 2;
    for (let z = 0; z < L; z++)
      for (let x = 0; x < nb.nx; x++) {
        const w = R * 1.55 * (0.8 + 0.2 * Math.sin((z / L) * Math.PI)) + (vrand(x, 0, z, 3) - 0.5);
        if (Math.abs(x + 0.5 - cx) < w) nb.set(x, vrand(x, 1, z, 4) < 0.25 ? 1 : 0, z + 1, z < 1 || z > L - 2 ? alu : Math.abs(z - bandY) < 1 ? band : body);
      }
    bb = nb;
  } else if (v === 1 || v === 2) bb = rotate90(b, 'z', 1);
  return fin(bb, { kind: 'can', variant: v, color: ck });
}

// ───────────────────────────── bottles ─────────────────────────────

const GLASS = { brown: [74, 42, 16], green: [32, 74, 40], clear: [176, 188, 182], blue: [40, 60, 110] };

/**
 * Glass bottle. opts: variant 0 beer (brown), 1 wine (green), 2 40oz (brown), 3 flask (clear),
 * 4 broken beer (neck gone), 5 broken wine; color override 'brown'|'green'|'clear'; standing (bool).
 */
export function bottle(rng, opts = {}) {
  const vs = VS_FINE;
  const v = pickV(rng, opts, 6);
  const kind = [0, 4].includes(v) ? 'beer' : [1, 5].includes(v) ? 'wine' : v === 2 ? '40' : 'flask';
  const broken = v >= 4;
  const gk = opts.color ?? (kind === 'wine' ? 'green' : kind === 'flask' ? 'clear' : rng.chance(0.8) ? 'brown' : rng.pick(['green', 'clear']));
  const spec = { beer: [2.2, 9, 2, 5, 1.0], wine: [2.7, 13, 3, 7, 1.0], 40: [3.1, 15, 3, 5, 1.2] }[kind];
  const b = new VB(9, 26, 9, vs, 'corner');
  const P = b.P;
  const glass = mat.glass(P, 'glass', rgbJitter(rng, GLASS[gk], 0.05));
  const label = mat.paper(P, 'label', rgbJitter(rng, rng.pick([[200, 190, 160], [190, 40, 40], [220, 220, 214], [40, 50, 90], [190, 160, 60]]), 0.05));
  const cap = mat.generic(P, 'cap', rng.pick([[180, 150, 60], [170, 172, 176], [150, 30, 30]]), { metal: 0.8, rough: 0.35 });
  const c = 4.5;
  let top;
  if (kind === 'flask') {
    b.box(1, 0, 3, 8, 11, 6, glass);
    b.box(3, 11, 4, 6, 15, 5, glass);
    b.box(3, 15, 4, 6, 16, 5, cap);
    b.box(1, 3, 6, 8, 8, 6, 0);
    if (rng.chance(0.7)) b.box(2, 3, 6, 7, 8, 7, label);
    top = 16;
  } else {
    const [R, bodyH, sh, neck, nr] = spec;
    const labelY0 = Math.round(bodyH * 0.25), labelY1 = Math.round(bodyH * 0.8);
    const hasLabel = rng.chance(0.75);
    lathe(b, c, c, 0, bodyH + sh + neck + 1, (y) => {
      if (y < bodyH) return [R, -1];
      if (y < bodyH + sh) return [R - ((y - bodyH) / sh) * (R - nr), -1];
      if (y < bodyH + sh + neck) return [nr, -1];
      return [nr + 0.4, -1];
    }, (x, y, z, a) => (hasLabel && y > labelY0 && y < labelY1 && Math.sin(a) > -0.3 ? label : y >= bodyH + sh + neck ? (broken ? glass : cap) : glass));
    top = bodyH + sh + neck + 1;
    if (broken) {
      // snapped neck: jagged break at the shoulder
      const by = bodyH + rng.int(0, sh);
      b.g.forEach((val, x, y, z) => {
        if (val && y >= by + (vrand(x, 0, z, 3) < 0.4 ? 1 : 0)) b.set(x, y, z, 0);
      });
      lathe(b, c, c, by - 1, by, () => [R - 0.6, R - 1.6], 0); // open top
      top = by;
    }
  }
  let bb = b;
  if (!(opts.standing ?? rng.chance(0.15))) bb = rotate90(b, 'z', 1);
  return fin(bb, { kind: 'bottle', variant: v, glass: gk, length: top * vs });
}

/** Small curved glass shard (brown/green/clear). opts: variant 0..3, color. */
export function glassShard(rng, opts = {}) {
  const vs = VS_XFINE;
  const v = pickV(rng, opts, 4);
  const gk = opts.color ?? rng.pick(['brown', 'brown', 'green', 'clear']);
  const n = [4, 6, 5, 3][v] + rng.int(0, 2);
  const b = new VB(n + 2, 2, n + 2, vs, 'corner');
  const glass = mat.glass(b.P, 'glass', rgbJitter(rng, GLASS[gk], 0.05));
  // random convex-ish polygon
  const pts = [];
  const k = rng.int(3, 5);
  for (let i = 0; i < k; i++) {
    const a = (i / k) * Math.PI * 2 + rng.range(-0.3, 0.3);
    const r = rng.range(0.45, 1) * n * 0.5;
    pts.push([(n + 2) / 2 + Math.cos(a) * r, (n + 2) / 2 + Math.sin(a) * r]);
  }
  const inside = (x, z) => {
    let ins = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, zi] = pts[i], [xj, zj] = pts[j];
      if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi + 1e-9) + xi) ins = !ins;
    }
    return ins;
  };
  const curl = rng.chance(0.5);
  for (let z = 0; z < n + 2; z++) for (let x = 0; x < n + 2; x++) if (inside(x + 0.5, z + 0.5)) b.set(x, curl && (x === 0 || x >= n) ? 1 : 0, z, glass);
  return fin(b, { kind: 'glassShard', variant: v });
}

// ───────────────────────────── cups ─────────────────────────────

/**
 * Disposable cup. opts: variant 0 coffee cup (sleeve, lid), 1 coffee cup crushed, 2 fountain cup
 * with lid + straw, 3 red party cup, 4 clear plastic cup crushed.
 */
export function cup(rng, opts = {}) {
  const vs = VS_FINE;
  const v = pickV(rng, opts, 5);
  const b = new VB(10, 16, 10, vs, 'corner');
  const P = b.P;
  const c = 5;
  let H, Rt, Rb, wall, lid = 0, sleeve = 0, straw = 0;
  if (v <= 1) {
    [H, Rt, Rb] = [8, 3.3, 2.3];
    wall = mat.paper(P, 'paper', rgbJitter(rng, rng.pick([[222, 218, 206], [200, 186, 160], [214, 212, 206]]), 0.04));
    sleeve = mat.cardboard(P, 'sleeve', [150, 110, 70]);
    lid = rng.chance(0.6) ? mat.plastic(P, 'lid', rng.pick([[30, 30, 32], [220, 220, 214]])) : 0;
  } else if (v === 2) {
    [H, Rt, Rb] = [11, 3.6, 2.6];
    wall = mat.paper(P, 'wax', rgbJitter(rng, rng.pick([[214, 210, 200], [190, 40, 40], [40, 80, 150]]), 0.04));
    lid = mat.plastic(P, 'lid', [210, 210, 206], { rough: 0.3 });
    straw = mat.plastic(P, 'straw', rng.pick([[200, 50, 50], [220, 220, 220], [40, 80, 160]]));
  } else if (v === 3) {
    [H, Rt, Rb] = [8, 3.5, 2.4];
    wall = mat.plastic(P, 'red', [170, 30, 34], { rough: 0.45 });
  } else {
    [H, Rt, Rb] = [8, 3.4, 2.4];
    wall = mat.plastic(P, 'clear', [180, 190, 192], { rough: 0.2 });
  }
  lathe(b, c, c, 0, H, (y) => {
    const r = Rb + (Rt - Rb) * (y / H);
    return [r, y < 1 ? -1 : r - 1];
  }, (x, y) => (sleeve && y > 2 && y < 6 ? sleeve : wall));
  if (lid) lathe(b, c, c, H, H + 1, () => [Rt + 0.4, -1], lid);
  if (straw) b.g.line(c + 1, H - 3, c, c + 2, H + 5, c + 1, 0.55, straw);
  let bb = b;
  if (v === 1 || v === 4) {
    // crushed flat-ish
    const nb = new VB(14, 5, 12, vs, 'corner');
    nb.P = P;
    b.g.forEach((val, x, y, z) => val && nb.set(Math.round(y * 0.95 + 1), Math.round(Math.abs(x - c) * 0.6 + (vrand(x, y, z, 2) < 0.3 ? 1 : 0)), z + 1, val));
    bb = nb;
  } else bb = rotate90(b, 'z', rng.chance(0.85) ? 1 : 0);
  return fin(bb, { kind: 'cup', variant: v });
}

// ───────────────────────────── food boxes ─────────────────────────────

/**
 * Takeout food packaging. opts: variant 0 styrofoam clamshell closed, 1 clamshell open with
 * food, 2 paper takeout pail, 3 pizza box (closed, greasy), 4 pizza box lid open, 5 black
 * plastic container.
 */
export function foodBox(rng, opts = {}) {
  const vs = VS_FINE;
  const v = pickV(rng, opts, 6);
  const parts = [];
  if (v === 3 || v === 4) {
    const N = 30, T = 3;
    const b = new VB(N, T, N, vs, 'floor');
    const P = b.P;
    const board = mat.cardboard(P, 'board', rgbJitter(rng, rng.pick([[176, 140, 96], [214, 208, 194]]), 0.05));
    const grease = mat.cardboard(P, 'grease', [120, 90, 56], { rough: 0.5 });
    const ink = mat.cardboard(P, 'ink', rng.pick([[160, 40, 34], [40, 70, 40], [30, 30, 30]]));
    const seed = rng.int(1, 1e5);
    b.shell(0, 0, 0, N, T, N, 1, board, v === 4 ? { py: true } : {});
    recolor(b, [board], (val, x, y, z, n) => (n > 0.68 ? grease : undefined), { freq: 0.12, seed });
    if (v === 3) for (let x = 8; x < 22; x++) for (let z = 10; z < 20; z++) if ((z === 12 || z === 15 || z === 18) && vrand(x, 0, z, 1) < 0.8) b.set(x, T - 1, z, ink);
    if (v === 4) {
      const lb = new VB(N, 1, N, vs, [-(N * vs) / 2, 0, 0]);
      const lm = lb.P.add('board', { ...P.entries[board] });
      lb.box(0, 0, 0, N, 1, N, lm);
      for (let x = 8; x < 22; x++) for (let z = 10; z < 20; z++) if ((z === 12 || z === 15) && vrand(x, 0, z, 1) < 0.8) lb.set(x, 0, z, lb.P.add('ink', { ...P.entries[ink] }));
      parts.push({ name: 'lid', model: lb.model(), position: [0, T * vs, -(N * vs) / 2], rotation: rot(['x', Math.PI], ['x', -rng.range(1.2, 1.9)]) });
      const crust = mat.organic(P, 'crust', [168, 120, 60]);
      for (let i = 0; i < 3; i++) {
        const x = rng.int(3, N - 9), z = rng.int(3, N - 9);
        b.box(x, 1, z, x + rng.int(3, 6), 2, z + rng.int(2, 4), crust);
      }
    }
    return { model: b.model(), parts, meta: { size: b.sizeM(), footprint: [N * vs, N * vs], mount: 'floor', kind: 'foodBox', variant: v } };
  }
  if (v === 2) {
    const b = new VB(10, 10, 10, vs, 'corner');
    const P = b.P;
    const paper = mat.paper(P, 'pail', [216, 212, 200]);
    const ink = mat.paper(P, 'ink', [170, 40, 34]);
    for (let y = 0; y < 8; y++) {
      const hw = 2.6 + y * 0.18;
      for (let z = 0; z < 10; z++) for (let x = 0; x < 10; x++) {
        const dx = Math.abs(x + 0.5 - 5), dz = Math.abs(z + 0.5 - 5);
        const m = Math.max(dx, dz);
        if (m < hw && (m > hw - 1 || y === 0)) b.set(x, y, z, Math.abs(y - 4) < 1 && dz > hw - 1 && dx < 1.5 ? ink : paper);
      }
    }
    const wire = mat.generic(P, 'wire', [150, 150, 150], { metal: 0.8 });
    b.g.line(1.5, 7, 5, 5, 9.5, 5, 0.5, wire);
    b.g.line(5, 9.5, 5, 8.5, 7, 5, 0.5, wire);
    return fin(rng.chance(0.6) ? rotate90(b, 'z', 1) : b, { kind: 'foodBox', variant: v });
  }
  // clamshells / plastic container
  const black = v === 5;
  const W = 17, D = 17, Hh = 3;
  const b = new VB(W + 1, Hh * 2 + 2, D * 2 + 2, vs, 'corner');
  const P = b.P;
  const foam = black ? mat.plastic(P, 'black', [28, 28, 30], { rough: 0.4 }) : mat.plastic(P, 'foam', rgbJitter(rng, [224, 222, 212], 0.03), { rough: 0.85 });
  const stain = mat.organic(P, 'sauce', rng.pick([[150, 60, 30], [120, 90, 50], [180, 140, 60]]));
  const food = mat.organic(P, 'food', rng.pick([[170, 130, 70], [120, 80, 50], [200, 180, 120]]));
  b.shell(0, 0, 0, W, Hh, D, 1, foam, { py: true });
  if (v === 0 || v === 5) b.shell(0, Hh, 0, W, Hh * 2, D, 1, foam, { ny: true });
  else {
    // open: lid lying flat behind the base (hinge at z = D)
    b.shell(0, 0, D, W, Hh, D * 2, 1, foam, { py: true });
    for (let i = 0; i < 5; i++) {
      const x = rng.int(2, W - 5), z = rng.int(2, D - 5);
      b.box(x, 1, z, x + rng.int(2, 4), 2, z + rng.int(2, 4), rng.chance(0.5) ? food : stain);
    }
  }
  recolor(b, [foam], (val, x, y, z, n) => (n > 0.72 ? stain : undefined), { freq: 0.2, seed: rng.int(1, 1e5) });
  return fin(b, { kind: 'foodBox', variant: v });
}

// ───────────────────────────── paper ─────────────────────────────

/** Paper litter. opts: variant 0 crumpled ball, 1 receipt strip, 2 flyer (wet, flat), 3 newspaper sheet, 4 napkin. */
export function paperScrap(rng, opts = {}) {
  const v = pickV(rng, opts, 5);
  if (v === 0 || v === 4) {
    const vs = VS_FINE;
    const n = v === 0 ? rng.int(4, 6) : rng.int(4, 5);
    const b = new VB(n + 2, n + 2, n + 2, vs, 'corner');
    const P = b.P;
    const col = v === 4 ? [222, 220, 212] : rng.pick([[214, 210, 198], [220, 206, 150], [200, 204, 214], [170, 168, 160]]);
    const p1 = mat.paper(P, 'paper', rgbJitter(rng, col, 0.04));
    const p2 = mat.paper(P, 'fold', rgbMul(col, 0.82));
    const seed = rng.int(1, 1e5);
    const c = (n + 2) / 2;
    b.fill(0, 0, 0, n + 2, n + 2, n + 2, (px, py, pz) => {
      const d = Math.hypot(px - c, (py - c) * (v === 4 ? 1.8 : 1.1), pz - c) / (n / 2) + (valueNoise3(px * 0.9, py * 0.9, pz * 0.9, seed) - 0.5) * 0.6;
      return d < 1 ? (valueNoise3(px * 1.3, py * 1.3, pz * 1.3, seed + 1) > 0.62 ? p2 : p1) : undefined;
    });
    return fin(b, { kind: 'paperScrap', variant: v });
  }
  const vs = v === 3 ? VS_FINE : VS_XFINE;
  const [Lm, Wm] = v === 1 ? [rng.range(0.12, 0.22), 0.08] : v === 2 ? [0.21, 0.15] : [rng.range(0.3, 0.4), rng.range(0.22, 0.3)];
  const L = Math.round(Lm / vs), W = Math.round(Wm / vs);
  const b = new VB(W + 2, 3, L + 2, vs, 'corner');
  const P = b.P;
  const base = v === 1 ? [222, 220, 210] : v === 2 ? rgbJitter(rng, rng.pick([[220, 200, 90], [210, 120, 160], [140, 190, 220], [230, 228, 220]]), 0.05) : [176, 174, 166];
  const paper = mat.paper(P, 'paper', base);
  const wet = mat.paper(P, 'wet', rgbMul(base, 0.72), { rough: 0.55 });
  const ink = mat.paper(P, 'ink', [60, 58, 56]);
  const seed = rng.int(1, 1e5);
  const curl = rng.int(0, 2);
  for (let z = 1; z <= L; z++)
    for (let x = 1; x <= W; x++) {
      if ((x === 1 || x === W) && (z === 1 || z === L) && rng.chance(0.5)) continue;
      if (v === 3 && valueNoise2(x * 0.3, z * 0.3, seed + 3) > 0.86) continue; // torn holes
      const e = Math.min(z - 1, L - z);
      const y = curl && e < 3 ? Math.min(2, curl) : 0;
      let m = paper;
      if (v === 1 && z % 3 === 0 && x > 2 && x < W - 1) m = ink;
      if (v === 3 && z % 4 === 0 && x > 1 && x < W && (Math.floor(x / 7) + z) % 3 !== 0) m = ink;
      if (v === 2 && Math.abs(z - L * 0.35) < 3 && x > 3 && x < W - 3) m = ink;
      if (fbm2(x * 0.15, z * 0.15, 2, seed) > 0.6) m = wet;
      b.set(x, y, z, m);
    }
  return fin(b, { kind: 'paperScrap', variant: v });
}

// ───────────────────────────── tiny bits ─────────────────────────────

/** Cigarette butt (filter + paper + ash). opts: variant 0 straight, 1 bent, 2 long (half smoked). */
export function cigaretteButt(rng, opts = {}) {
  const vs = VS_XFINE;
  const v = pickV(rng, opts, 3);
  const b = new VB(9, 2, 3, vs, 'corner');
  const P = b.P;
  const filt = mat.paper(P, 'filter', rgbJitter(rng, rng.chance(0.75) ? [196, 146, 84] : [220, 218, 210], 0.06));
  const paper = mat.paper(P, 'paper', [220, 216, 208]);
  const ash = mat.generic(P, 'ash', rgbJitter(rng, [70, 66, 62], 0.1), { rough: 0.95 });
  const lenP = v === 2 ? 4 : 2;
  for (let i = 0; i < 3; i++) b.set(i, 0, 1, filt);
  for (let i = 3; i < 3 + lenP; i++) b.set(i, 0, v === 1 && i > 3 ? 2 : 1, paper);
  b.set(3 + lenP, 0, v === 1 ? 2 : 1, ash);
  return fin(b, { kind: 'cigaretteButt', variant: v });
}

/** Crown bottle cap. opts: variant 0 flat, 1 bent, 2 upside down; color. */
export function bottleCap(rng, opts = {}) {
  const vs = VS_XFINE;
  const v = pickV(rng, opts, 3);
  const b = new VB(6, 2, 6, vs, 'corner');
  const P = b.P;
  const col = opts.color ?? rng.pick([[186, 150, 60], [176, 178, 182], [160, 36, 34], [40, 70, 140], [40, 100, 60], [30, 30, 30]]);
  const top = mat.generic(P, 'cap', rgbJitter(rng, col, 0.05), { metal: 0.8, rough: 0.35 });
  const liner = mat.plastic(P, 'liner', [190, 186, 170]);
  for (let z = 1; z < 5; z++) for (let x = 1; x < 5; x++) {
    const corner = (x === 1 || x === 4) && (z === 1 || z === 4);
    if (corner) continue;
    b.set(x, v === 1 && x === 4 ? 1 : 0, z, v === 2 ? (x > 1 && x < 4 && z > 1 && z < 4 ? liner : top) : top);
  }
  // crimp skirt
  for (const [x, z] of [[0, 2], [0, 3], [5, 2], [5, 3], [2, 0], [3, 0], [2, 5], [3, 5]]) if (rng.chance(0.6)) b.set(x, 0, z, top);
  return fin(b, { kind: 'bottleCap', variant: v });
}

const LEAF_COLS = [[92, 64, 38], [140, 108, 48], [150, 84, 40], [62, 46, 30], [100, 96, 52], [120, 54, 34], [168, 132, 60]];

/** Wet flat leaf, muted autumn colours. opts: variant 0 maple, 1 oak, 2 elm/oval, 3 linden (heart). */
export function leaf(rng, opts = {}) {
  const vs = VS_XFINE;
  const v = pickV(rng, opts, 4);
  const S = Math.round(rng.range(9, 16));
  const b = new VB(S + 4, 2, S + 6, vs, 'corner');
  const P = b.P;
  const col = rgbJitter(rng, rng.pick(LEAF_COLS), 0.08, 0.04);
  const leafM = mat.organic(P, 'leaf', col, { rough: 0.45, vari: 0.1 });
  const vein = mat.organic(P, 'vein', rgbMul(col, 0.72), { rough: 0.5 });
  const spot = mat.organic(P, 'spot', rgbMul(col, 0.55), { rough: 0.5 });
  const cx = (S + 4) / 2, cz = (S + 6) / 2 + 1;
  const R = S / 2;
  const inLeaf = (x, z) => {
    const dx = (x - cx) / R, dz = (z - cz) / R;
    const a = Math.atan2(dx, dz), r = Math.hypot(dx, dz);
    if (v === 0) return r < 0.62 + 0.38 * Math.pow(Math.abs(Math.cos(a * 2.5)), 0.6) && dz > -0.75;
    if (v === 1) return Math.abs(dx) < (0.42 + 0.16 * Math.sin(dz * 9)) * Math.sqrt(Math.max(0, 1 - dz * dz)) * 1.2;
    if (v === 2) return (dx * dx) / 0.32 + dz * dz < 1 && !(Math.abs(dx) > 0.5 && vrand(Math.round(x), 0, Math.round(z), 9) < 0.3);
    const hz = dz + 0.25;
    return (dx * dx + hz * hz * 1.1 < 0.85 && !(dz < -0.55 && Math.abs(dx) < 0.18)) || (Math.abs(dx) < 0.55 && hz > 0 && hz < 1.0 - Math.abs(dx) * 1.2);
  };
  const curl = rng.chance(0.5);
  for (let z = 0; z < S + 6; z++)
    for (let x = 0; x < S + 4; x++) {
      if (!inLeaf(x + 0.5, z + 0.5)) continue;
      const edge = !inLeaf(x - 0.5, z + 0.5) || !inLeaf(x + 1.5, z + 0.5);
      const y = curl && edge ? 1 : 0;
      let m = Math.abs(x + 0.5 - cx) < 0.6 ? vein : leafM;
      if (vrand(x, 0, z, 7) < 0.05) m = spot;
      b.set(x, y, z, m);
    }
  // stem
  for (let k = 0; k < 3; k++) b.set(Math.round(cx - 0.5), 0, Math.round(cz - R - 1 - k), vein);
  return fin(b, { kind: 'leaf', variant: v });
}
