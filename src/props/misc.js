import * as THREE from 'three';
// Misc alley clutter and storytelling props: shopping cart, buckets, paint cans, tires,
// chairs, grease bin, rubble, milk crates, mop bucket, newspaper box, bike frame, shoes on a wire.
import {
  VB, mat, V, MCLS, VS_FINE, VS_MED, VS_XFINE, COL, rgbMul, rgbMix, rgbJitter, valueNoise2, valueNoise3, fbm2, clamp,
  recolor, grime, mottle, rust, streaks, chips, vrand, emptyModel, addProp, eachSurface, F_PY, textMask, rot, restPos,
  rotate90, lathe, latheX, latheZ, torusY, torusX, torusZ, projectFace, applyPaint, paintFor, famSet, crop, dent, repivot,
} from './kit.js';
import { cardboardSheet } from './sheets.js';

const cl = (v, a, b) => Math.max(a, Math.min(b, v));

// ───────────────────────────── shopping cart ─────────────────────────────

/**
 * Wire shopping cart: tapered wire basket, folding back gate with child seat, plastic handle,
 * lower rack, four casters. opts: tipped (bool: lying on its side), handleColor [r,g,b].
 * Origin: footprint centre; handle at the back (-Z), front (+Z).
 */
export function shoppingCart(rng, opts = {}) {
  const vs = VS_FINE;
  const tipped = opts.tipped ?? rng.chance(0.3);
  const L = 68, Wb = 40, Wf = 32, y0 = 33, y1 = 63, nx = Wb + 6, nz = L + 14, ny = 76;
  const b = new VB(nx, ny, nz, vs, 'floor');
  const P = b.P;
  const wireC = rgbJitter(rng, [150, 152, 150], 0.05);
  const wire = mat.galv(P, 'wire', wireC, { rough: 0.38, cls: MCLS.WIRE, metal: 0.85 });
  const frame = mat.galv(P, 'frame', rgbMul(wireC, 0.9), { rough: 0.4, metal: 0.85 });
  const plastic = mat.plastic(P, 'handle', opts.handleColor ?? rng.pick([[150, 32, 30], [40, 70, 130], [60, 62, 64], [180, 150, 40]]), { rough: 0.45 });
  const rubber = mat.rubber(P, 'wheel', [36, 36, 38]);
  const cx = nx / 2;
  const zB = 8, zF = zB + L; // back and front of the basket
  const halfW = (z) => (Wb + (Wf - Wb) * ((z - zB) / L)) / 2;
  const sp = 4;
  // floor grid
  for (let z = zB; z <= zF; z++) {
    const hw = Math.round(halfW(z));
    for (let x = Math.round(cx - hw); x <= Math.round(cx + hw); x++) if ((x - Math.round(cx - hw)) % sp === 0 || (z - zB) % sp === 0) b.set(x, y0, z, wire);
  }
  // side panels (tapered): vertical wires + horizontal wires
  for (let z = zB; z <= zF; z++) {
    const hw = Math.round(halfW(z));
    for (const s of [-1, 1]) {
      const x = Math.round(cx + s * hw);
      for (let y = y0; y <= y1; y++) if ((z - zB) % sp === 0 || (y - y0) % 5 === 0 || y === y1) b.set(x, y, z, y === y1 ? frame : wire);
    }
  }
  // front panel (slightly lower) and back gate
  for (const [z, top, m] of [[zF, y1 - 2, wire], [zB, y1, wire]]) {
    const hw = Math.round(halfW(z));
    for (let x = Math.round(cx - hw); x <= Math.round(cx + hw); x++)
      for (let y = y0; y <= top; y++) if ((x - Math.round(cx - hw)) % sp === 0 || (y - y0) % 5 === 0 || y === top) b.set(x, y, z, y === top ? frame : m);
  }
  // child seat flap (plastic) on the back gate
  b.box(Math.round(cx - 9), y1 - 9, zB + 1, Math.round(cx + 9), y1 - 1, zB + 2, plastic);
  // handle bar behind the gate
  const hy = y1 + 6;
  b.g.cylX(hy + 0.5, zB - 5 + 0.5, 1.3, Math.round(cx - Wb / 2), Math.round(cx + Wb / 2) + 1, plastic);
  for (const s of [-1, 1]) b.g.line(cx + s * (Wb / 2 - 0.5), y1, zB, cx + s * (Wb / 2 - 0.5), hy, zB - 5, 0.8, frame);
  // chassis: legs, lower rack, casters
  const legs = [[zB + 2, -Wb / 2 + 2], [zB + 2, Wb / 2 - 2], [zF - 2, -Wf / 2 + 3], [zF - 2, Wf / 2 - 3]];
  for (const [z, ox] of legs) b.g.line(cx + ox, y0, z, cx + ox * 0.85, 8, z + (z > zB + 10 ? 1 : -1), 0.9, frame);
  const ry = 13;
  for (let z = zB + 4; z <= zF - 4; z++) {
    const hw = Math.round(halfW(z) * 0.82);
    for (let x = Math.round(cx - hw); x <= Math.round(cx + hw); x++) if ((x - Math.round(cx - hw)) % 5 === 0 || z === zB + 4 || z === zF - 4) b.set(x, ry, z, wire);
  }
  b.g.line(cx - Wb * 0.42, 8, zB + 1, cx - Wf * 0.4, 8, zF - 1, 0.9, frame);
  b.g.line(cx + Wb * 0.42, 8, zB + 1, cx + Wf * 0.4, 8, zF - 1, 0.9, frame);
  for (const [z, ox] of legs) {
    const wx = Math.round(cx + ox * 0.85), wz = z + (z > zB + 10 ? 1 : -1);
    b.box(wx - 1, 7, wz - 1, wx + 2, 9, wz + 2, frame);
    b.g.cylX(3.6, wz + 0.5, 3.6, wx - 1, wx + 1, rubber);
  }
  // bent wires / dents
  if (rng.chance(0.6)) {
    const s = rng.sign();
    const zc = rng.int(zB + 10, zF - 10), yc = rng.int(y0 + 6, y1 - 6);
    b.fill(cx + s * Wb / 2 - 4, yc - 6, zc - 6, cx + s * Wb / 2 + 4, yc + 6, zc + 6, (px, py, pz, x, y, z) => {
      const v = b.get(x, y, z);
      if (v !== wire) return undefined;
      const d = Math.hypot(py - yc, pz - zc);
      if (d < 5 && Math.abs(px - (cx + s * halfW(z))) < 1.5) {
        b.set(x - s * Math.round(2 * (1 - d / 5)), y, z, wire);
        return Math.round(2 * (1 - d / 5)) > 0 ? 0 : undefined;
      }
      return undefined;
    });
  }
  recolor(b, [wire, frame], (v, x, y, z, n) => (n > 0.66 ? V.rust(P, v, 1.0) : n < 0.25 ? V.tone(P, v, 0.75, 0) : undefined), { freq: 0.08, seed: rng.int(1, 1e5) });
  let bb = b;
  if (tipped) {
    bb = rotate90(b, 'z', rng.chance(0.5) ? 1 : 3);
    bb.setMount('floor');
  }
  return { model: bb.model(), meta: { size: bb.sizeM(), footprint: [bb.nx * vs * 0.9, bb.nz * vs * 0.9], mount: 'floor', kind: 'shoppingCart', tipped } };
}

// ───────────────────────────── bucket / paint can ─────────────────────────────

/**
 * 5-gallon plastic bucket with wire bail. opts: color 'white'|'orange'|'grey'|'black'|'blue',
 * contents 'water'|'sand'|'butts'|'empty'|'paint', pose 'up'|'side'|'down'. Origin: footprint centre.
 */
export function bucket(rng, opts = {}) {
  const vs = VS_FINE;
  const COLS = { white: [200, 198, 190], orange: [196, 98, 40], grey: [120, 122, 120], black: [34, 34, 36], blue: [44, 80, 140] };
  const ck = opts.color ?? rng.weighted(['white', 'orange', 'grey', 'black', 'blue'], [4, 2, 1.5, 1, 0.8]);
  const pose = opts.pose ?? rng.weighted(['up', 'side', 'down'], [5, 2, 2]);
  const contents = opts.contents ?? rng.weighted(['water', 'sand', 'butts', 'empty', 'paint'], [3, 1.5, 1.5, 2, 1]);
  const H = 27, Rt = 11.2, Rb = 9.6;
  const n = Math.ceil(Rt * 2 + 6);
  const b = new VB(n, H + 6, n, vs, 'floor');
  const P = b.P;
  const body = mat.plastic(P, 'body', rgbJitter(rng, COLS[ck], 0.05), { rough: 0.5 });
  const c = n / 2;
  const level = contents === 'empty' || pose !== 'up' ? 2 : rng.int(10, H - 5);
  lathe(b, c, c, 0, H, (y) => {
    const r = Rb + (Rt - Rb) * (y / H) + ((y > H - 5 && y < H - 3) || y > H - 1.5 ? 0.8 : 0);
    return y < 1.5 ? [r, -1] : y < level ? [r, -1] : [r, r - 1.2];
  }, body);
  const fillC = {
    water: mat.generic(P, 'water', [34, 36, 34], { rough: 0.05, vari: 0.02 }),
    sand: mat.concrete(P, 'sand', [150, 132, 104]),
    butts: mat.paper(P, 'butts', [186, 150, 96]),
    paint: mat.generic(P, 'paint', rgbJitter(rng, rng.pick([[200, 196, 186], [120, 130, 140], [160, 80, 50]]), 0.05), { rough: 0.4 }),
    empty: body,
  }[contents];
  if (level > 2) lathe(b, c, c, level - 1, level, (y) => [Rb + (Rt - Rb) * (y / H) - 1.1, -1], fillC);
  if (contents === 'butts' && level > 2) {
    const bt = mat.paper(P, 'butts2', [208, 204, 196]);
    for (let i = 0; i < 40; i++) {
      const a = rng.range(0, 6.28), r = rng.range(0, Rt - 2);
      b.set(Math.round(c + Math.cos(a) * r), level, Math.round(c + Math.sin(a) * r), rng.chance(0.5) ? bt : fillC);
    }
  }
  if (contents === 'paint' || rng.chance(0.3)) {
    // paint drips down the outside
    const drip = mat.generic(P, 'drip', rgbJitter(rng, [196, 194, 186], 0.08), { rough: 0.45 });
    streaks(b, rng, [body], { count: rng.int(3, 8), len: [3, 14], yMin: H - 3, kind: 'dirt', t: 0.4 });
    for (let i = 0; i < 4; i++) {
      const a = rng.range(0, 6.28);
      const x = Math.round(c + Math.cos(a) * (Rt + 0.3)), z = Math.round(c + Math.sin(a) * (Rt + 0.3));
      for (let y = H - 1; y > H - rng.int(4, 12); y--) if (b.get(x, y, z)) b.set(x, y, z, drip);
    }
  }
  // bail handle
  const wireM = mat.galv(P, 'bail', [120, 120, 118], { cls: MCLS.WIRE });
  const grip = mat.plastic(P, 'grip', [40, 40, 42]);
  const ha = pose === 'up' ? rng.range(-1.2, 1.2) : 1.4;
  let prev = null;
  for (let i = 0; i <= 20; i++) {
    const t = (i / 20) * Math.PI;
    const x = c + Math.cos(t) * (Rt + 0.6), hz = Math.sin(t) * (Rt * 0.9);
    const p = [x, H - 3 + hz * Math.cos(ha), c + hz * Math.sin(ha)];
    if (prev) b.g.line(...prev, ...p, i > 8 && i < 13 ? 0.9 : 0.55, i > 8 && i < 13 ? grip : wireM);
    prev = p;
  }
  grime(b, [body], { h: 8, amount: 0.55, seed: rng.int(1, 1e5), k: 0.7 });
  let bb = b;
  if (pose === 'side') bb = rotate90(b, 'z', 1);
  else if (pose === 'down') bb = rotate90(b, 'x', 2);
  bb.setMount('floor');
  return { model: bb.model(), meta: { size: bb.sizeM(), footprint: [bb.nx * vs, bb.nz * vs], mount: 'floor', kind: 'bucket', pose, contents } };
}

/** One-gallon paint can (label, drips, lid on/off, rust). opts: lid bool, color [r,g,b], pose 'up'|'side'. */
export function paintCan(rng, opts = {}) {
  const vs = VS_FINE;
  const pose = opts.pose ?? rng.weighted(['up', 'side'], [3, 1]);
  const lid = opts.lid ?? rng.chance(0.6);
  const H = 14, R = 6.4, n = 17;
  const b = new VB(n, H + 4, n, vs, 'floor');
  const P = b.P;
  const tin = mat.galv(P, 'tin', [168, 170, 168], { rough: 0.35 });
  const pc = opts.color ?? rgbJitter(rng, rng.pick([[200, 196, 184], [150, 40, 34], [60, 90, 140], [90, 110, 70], [200, 170, 60], [60, 60, 60]]), 0.06);
  const paint = mat.generic(P, 'paint', pc, { rough: 0.35 });
  const label = mat.paper(P, 'label', rgbJitter(rng, rng.pick([[196, 60, 40], [230, 226, 214], [40, 70, 130], [220, 190, 60]]), 0.05));
  const c = n / 2;
  lathe(b, c, c, 0, H, (y) => [R + (y > H - 1.5 || y < 1 ? 0.6 : 0), lid ? -1 : y < H - 3 ? -1 : R - 1], (x, y, z, a) => (y > 3 && y < H - 3 && !(a > 0.6 && a < 1.6) ? label : tin));
  if (lid) lathe(b, c, c, H, H + 1, () => [R - 0.5, -1], tin);
  else lathe(b, c, c, H - 3, H - 2, () => [R - 0.8, -1], paint);
  // drips over the rim and label
  for (let i = 0; i < rng.int(2, 6); i++) {
    const a = rng.range(0, 6.28);
    const x = Math.round(c + Math.cos(a) * (R + 0.3)), z = Math.round(c + Math.sin(a) * (R + 0.3));
    for (let y = H; y > H - rng.int(3, 11); y--) if (b.get(x, y, z)) b.set(x, y, z, paint);
  }
  if (lid) lathe(b, c, c, H, H + 1, () => [R - 0.5, R - 1.6], paint);
  // bail
  const wireM = mat.galv(P, 'bail', [110, 110, 108], { cls: MCLS.WIRE });
  for (let i = 0; i <= 10; i++) {
    const t = (i / 10) * Math.PI;
    b.set(Math.round(c + Math.cos(t) * (R + 0.6)), Math.round(H - 3 + Math.sin(t) * 2 * (pose === 'up' ? 0.6 : 1)), Math.round(c + 0.5), wireM);
  }
  recolor(b, [tin], (v, x, y, z, nn) => (nn > 0.62 || y < 1 ? V.rust(P, tin, 0.9) : undefined), { freq: 0.15, seed: rng.int(1, 1e5) });
  let bb = b;
  if (pose === 'side') bb = rotate90(b, 'z', 1);
  bb.setMount('floor');
  return { model: bb.model(), meta: { size: bb.sizeM(), footprint: [bb.nx * vs, bb.nz * vs], mount: 'floor', kind: 'paintCan' } };
}

// ───────────────────────────── tire ─────────────────────────────

/**
 * Worn car tire (no rim). opts: pose 'flat'|'stand'|'lean'|'stack' (stack of 2-3), bald (bool).
 * Origin: footprint centre at ground.
 */
export function tire(rng, opts = {}) {
  const vs = VS_FINE;
  const pose = opts.pose ?? rng.weighted(['flat', 'stand', 'lean', 'stack'], [3, 1, 2, 1.5]);
  const Ro = rng.range(22.5, 24.5), Ri = Ro - rng.range(7.5, 8.5), Wd = Math.round(rng.range(13, 16));
  const n = Math.ceil(Ro * 2 + 2);
  const b = new VB(n, Wd, n, vs, 'floor');
  const P = b.P;
  const rub = mat.rubber(P, 'rubber', [28, 28, 29]);
  const side = mat.rubber(P, 'sidewall', [34, 34, 35], { rough: 0.8 });
  const worn = mat.rubber(P, 'worn', [44, 43, 42], { rough: 0.9 });
  const c = n / 2;
  const bald = opts.bald ?? rng.chance(0.3);
  const nTread = Math.round(rng.range(50, 64));
  lathe(b, c, c, 0, Wd, (y) => {
    const e = Math.min(y, Wd - y) / (Wd / 2); // 0 at edges, 1 centre
    const ro = Ro - (e < 0.3 ? (0.3 - e) * 6 : 0);
    const ri = Ri + (e < 0.2 ? 0 : 1.2);
    return [ro, ri];
  }, (x, y, z, a, r) => {
    if (r > Ro - 1.2) {
      // tread blocks
      const k = Math.floor(((a + Math.PI) / (2 * Math.PI)) * nTread);
      const groove = (k % 2 === 0 && Math.abs(y - Wd / 2) > 1.5) || Math.abs(y - Wd / 2) < 0.6 || Math.abs(Math.abs(y - Wd / 2) - Wd * 0.28) < 0.55;
      if (groove && !bald) return 0;
      return bald ? worn : rub;
    }
    return r > Ri + 2 ? side : rub;
  });
  // raised lettering band on the top sidewall
  for (let a = 0; a < 6.28; a += 0.035) {
    if (valueNoise2(a * 9, 3, 7) > 0.55) continue;
    const r = (Ro + Ri) / 2 + 1;
    const x = Math.round(c + Math.cos(a) * r), z = Math.round(c + Math.sin(a) * r);
    if (vrand(x, 0, z, 9) < 0.6) b.set(x, Wd - 1, z, worn);
  }
  grime(b, null, { h: 4, amount: 0.4, seed: rng.int(1, 1e5), k: 0.85 });
  const model = b.model();
  const R = Ro * vs, W = Wd * vs;
  if (pose === 'flat') return { model, meta: { size: b.sizeM(), footprint: [2 * R, 2 * R], mount: 'floor', kind: 'tire', pose } };
  const parts = [];
  if (pose === 'stack') {
    const k = rng.int(2, 3);
    for (let i = 1; i < k; i++) {
      const t2 = tire(rng.fork(`t${i}`), { pose: 'flat' });
      addProp(parts, `tire${i}`, t2, [rng.range(-0.04, 0.04), i * W * 0.98, rng.range(-0.04, 0.04)], [rng.range(-0.03, 0.03), rng.range(0, 6.28), rng.range(-0.03, 0.03)]);
    }
    return { model, parts, meta: { size: [2 * R, k * W, 2 * R], footprint: [2 * R, 2 * R], mount: 'floor', kind: 'tire', pose } };
  }
  const tilt = pose === 'lean' ? rng.range(0.25, 0.45) : 0;
  const r = rot(['x', Math.PI / 2], ['x', -tilt], ['y', rng.range(-0.2, 0.2)]);
  parts.push({ name: 'tire', model, position: restPos(model, r, { x: 0, yMin: 0, z: 0 }), rotation: r });
  return { model: emptyModel(vs), parts, meta: { size: [2 * R, 2 * R, W + tilt * 2 * R], footprint: [2 * R, W + tilt * R], mount: 'floor', kind: 'tire', pose } };
}

// ───────────────────────────── chairs ─────────────────────────────

/**
 * Discarded chair. opts: kind 'wood'|'office', pose 'side'|'back'|'upright'. Wooden: broken leg,
 * cracked seat. Office: torn seat foam, tilted back. Origin: footprint centre.
 */
export function brokenChair(rng, opts = {}) {
  const vs = VS_FINE;
  const kind = opts.kind ?? rng.pick(['wood', 'office']);
  if (kind === 'office') return officeChair(rng, opts);
  const pose = opts.pose ?? rng.weighted(['side', 'back', 'upright'], [3, 2, 1]);
  const S = 31, SD = 29, SH = 33, BH = 34;
  const nx = S + 2, nz = SD + 4, ny = SH + BH + 2;
  const b = new VB(nx, ny, nz, vs, 'floor');
  const P = b.P;
  const base = rgbJitter(rng, rng.pick([[104, 70, 44], [70, 50, 36], [150, 120, 86], [60, 66, 60]]), 0.06);
  const wood = mat.wood(P, 'wood', base);
  const wood2 = mat.wood(P, 'wood2', rgbMul(base, 0.85));
  const paint = rng.chance(0.4) ? mat.generic(P, 'paint', rgbJitter(rng, rng.pick([[190, 186, 172], [120, 40, 34], [40, 70, 60]]), 0.05), { rough: 0.7 }) : 0;
  const top = paint || wood;
  const x0 = 1, z0 = 2;
  // seat (2 voxels thick) with a crack
  const crackX = rng.chance(0.5) ? rng.int(8, S - 8) : -1;
  b.box(x0, SH - 2, z0, x0 + S, SH, z0 + SD, top);
  if (crackX > 0) for (let z = z0; z < z0 + SD; z++) if (vrand(crackX, 0, z, 3) < 0.85) b.set(x0 + crackX + (z % 7 === 0 ? 1 : 0), SH - 1, z, 0);
  // legs 3x3, slight splay; one broken
  const broken = rng.int(0, 3);
  const legs = [[x0 + 1, z0 + 1], [x0 + S - 4, z0 + 1], [x0 + 1, z0 + SD - 4], [x0 + S - 4, z0 + SD - 4]];
  legs.forEach(([lx, lz], i) => {
    const len = i === broken ? rng.int(4, 14) : SH - 2;
    b.box(lx, SH - 2 - len, lz, lx + 3, SH - 2, lz + 3, wood2);
  });
  // stretchers between legs (some missing)
  for (const [a, c] of [[0, 1], [2, 3], [0, 2], [1, 3]]) {
    if (rng.chance(0.3) || a === broken || c === broken) continue;
    const [ax, az] = legs[a], [cx2, cz2] = legs[c];
    b.box(Math.min(ax, cx2) + 1, 10, Math.min(az, cz2) + 1, Math.max(ax, cx2) + 2, 12, Math.max(az, cz2) + 2, wood2);
  }
  // back: two posts continuing up from the back legs + 3 slats (one missing)
  for (const [lx, lz] of legs.slice(0, 2)) b.box(lx, SH, lz, lx + 3, SH + BH, lz + 2, top);
  const missingSlat = rng.int(-1, 2);
  for (let k = 0; k < 3; k++) {
    if (k === missingSlat) continue;
    const y = SH + 10 + k * 8;
    b.box(x0 + 3, y, z0 + 1, x0 + S - 3, y + 4, z0 + 2, top);
  }
  if (paint) chips(b, rng, [paint], { density: 0.06, kinds: ['bare'] });
  recolor(b, [wood, wood2], (v, x, y, z, n) => (n > 0.65 ? V.tone(P, v, 0.75, 0.3) : undefined), { freq: 0.08, seed: rng.int(1, 1e5) });
  const parts = [];
  // the broken-off leg piece on the ground
  const lp = new VB(3, 3, 18, vs, 'floor');
  lp.box(0, 0, 0, 3, 3, rng.int(10, 18), lp.P.add('leg', { ...P.entries[wood2] }));
  let model = b.model();
  if (pose === 'upright') {
    // resting tilted on the broken corner
    const r = rot(['x', broken < 2 ? 0.12 : -0.12], ['z', broken % 2 ? 0.12 : -0.12]);
    parts.push({ name: 'chair', model, position: restPos(model, r, {}), rotation: r });
    model = emptyModel(vs);
  } else {
    const r = pose === 'side' ? rot(['z', Math.PI / 2 * rng.sign()], ['y', rng.range(0, 6.28)]) : rot(['x', -Math.PI / 2 + 0.25], ['y', rng.range(0, 6.28)]);
    parts.push({ name: 'chair', model, position: restPos(model, r, {}), rotation: r });
    model = emptyModel(vs);
  }
  parts.push({ name: 'leg', model: lp.model(), position: [rng.range(-0.5, 0.5), 0, rng.range(0.35, 0.55)], rotation: [0, rng.range(0, 6.28), 0] });
  return { model, parts, meta: { size: [0.9, 0.9, 0.9], footprint: [0.8, 0.8], mount: 'floor', kind: 'brokenChair', variant: 'wood', pose } };
}

function officeChair(rng, opts) {
  const vs = VS_FINE;
  const n = 52;
  const b = new VB(n, 72, n, vs, 'floor');
  const P = b.P;
  const blk = mat.plastic(P, 'black', [30, 30, 32], { rough: 0.55 });
  const chrome = mat.steel(P, 'chrome', [120, 120, 122], { metal: 0.9, rough: 0.3 });
  const fabric = mat.fabric(P, 'fabric', rgbJitter(rng, rng.pick([[40, 40, 44], [50, 56, 74], [70, 40, 36]]), 0.05));
  const foam = mat.fabric(P, 'foam', [200, 176, 110]);
  const c = n / 2;
  // 5-star base + casters
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + 0.3;
    const ex = c + Math.cos(a) * 22, ez = c + Math.sin(a) * 22;
    b.g.line(c, 6, c, ex, 4, ez, 1.4, blk);
    if (!(k === 2 && rng.chance(0.5))) b.g.cylX(2.5, ez, 2.4, Math.round(ex - 1), Math.round(ex + 1), blk);
  }
  // gas cylinder + seat
  b.g.cylY(c, c, 2, 6, 30, chrome);
  b.g.cylY(c, c, 3, 6, 18, blk);
  const sy = 31;
  b.fill(c - 18, sy, c - 17, c + 18, sy + 8, c + 18, (px, py, pz) => {
    const dx = (px - c) / 18, dz = (pz - c) / 17, dy = (py - sy - 4) / 4.2;
    const r = Math.pow(Math.abs(dx), 4) + Math.pow(Math.abs(dz), 4) + Math.pow(Math.abs(dy), 3);
    return r < 1 ? fabric : undefined;
  });
  b.box(Math.round(c - 10), sy - 2, Math.round(c - 10), Math.round(c + 10), sy, Math.round(c + 10), blk);
  // armrests
  if (rng.chance(0.7)) for (const s2 of [-1, 1]) {
    b.g.line(c + s2 * 16, sy + 1, c - 4, c + s2 * 17, sy + 16, c - 4, 1.1, blk);
    b.box(Math.round(c + s2 * 17 - 2), sy + 15, Math.round(c - 12), Math.round(c + s2 * 17 + 2), sy + 17, Math.round(c + 6), blk);
  }
  // torn seat: foam bulging out
  const tx = c + rng.range(-8, 8), tz = c + rng.range(-8, 8);
  b.fill(tx - 8, sy + 4, tz - 6, tx + 8, sy + 11, tz + 6, (px, py, pz, x, y, z) => {
    const d = Math.hypot((px - tx) / 7, (pz - tz) / 5, (py - sy - 6) / 3) + (valueNoise3(px * 0.4, py * 0.4, pz * 0.4, 3) - 0.5) * 0.5;
    return d < 1 && b.get(x, y - 1, z) ? foam : undefined;
  });
  // back (tilted backward, possibly hanging off one bracket)
  const hasBack = rng.chance(0.85);
  if (hasBack) {
    const droop = rng.chance(0.35) ? rng.range(4, 9) : 0; // back hanging loose
    b.g.line(c, sy + 2, c - 16, c, sy + 12, c - 21, 1.5, chrome);
    b.fill(c - 18, sy + 10, c - 28, c + 18, sy + 40, c - 14, (px, py, pz) => {
      const t = (py - sy - 10) / 28;
      const zc = c - 20 - t * (4 + droop);
      const dx = (px - c) / 16, dy = (py - sy - 24) / 13;
      return Math.abs(pz - zc) < 3 && Math.pow(Math.abs(dx), 3) + Math.pow(Math.abs(dy), 3) < 1 ? fabric : undefined;
    });
  }
  recolor(b, [fabric], (v, x, y, z, nn) => (nn > 0.64 ? V.dirt(P, fabric, 0.75) : undefined), { freq: 0.1, seed: rng.int(1, 1e5) });
  const model = b.model();
  const r = rot(['x', -rng.range(0, 0.12)], ['y', rng.range(0, 6.28)]);
  return { model: emptyModel(vs), parts: [{ name: 'chair', model, position: restPos(model, r, {}), rotation: r }], meta: { size: b.sizeM(), footprint: [0.62, 0.62], mount: 'floor', kind: 'brokenChair', variant: 'office' } };
}

/** Molded monobloc plastic patio chair. opts: color, broken (bool: a snapped leg, chair tipped). */
export function plasticChair(rng, opts = {}) {
  const vs = VS_FINE;
  const col = opts.color ?? rgbJitter(rng, rng.pick([[204, 202, 194], [60, 84, 64], [190, 176, 146], [70, 70, 72]]), 0.04);
  const broken = opts.broken ?? rng.chance(0.3);
  const n = 46;
  const b = new VB(n, 64, n + 4, vs, 'floor');
  const P = b.P;
  const pl = mat.plastic(P, 'plastic', col, { rough: 0.5 });
  const c = n / 2, sy = 31;
  // seat with a rolled front lip
  b.fill(c - 20, sy - 2, c - 18, c + 20, sy + 1, c + 20, (px, py, pz) => {
    const dx = (px - c) / 20, dz = (pz - c - 1) / 19;
    if (Math.pow(Math.abs(dx), 3) + Math.pow(Math.abs(dz), 3) > 1) return undefined;
    const dish = (1 - dx * dx) * 1.2;
    return py > sy - 2 + dish * 0.5 || Math.abs(dz) > 0.9 || Math.abs(dx) > 0.9 ? pl : undefined;
  });
  // splayed legs (hollow channel look: 3 voxel bars)
  const legEnds = [[-21, -19], [21, -19], [-21, 22], [21, 22]];
  const snap = broken ? rng.int(0, 3) : -1;
  legEnds.forEach(([ex, ez], i) => {
    const top = [c + ex * 0.82, sy - 1, c + ez * 0.82];
    const bot = [c + ex, i === snap ? sy - 12 : 0.5, c + ez];
    b.g.line(...top, ...bot, 1.6, pl);
  });
  // armrests
  for (const s of [-1, 1]) {
    b.g.line(c + s * 20, sy + 1, c + 16, c + s * 21, sy + 13, c - 2, 1.2, pl);
    b.g.line(c + s * 21, sy + 13, c - 2, c + s * 19, sy + 15, c - 17, 1.2, pl);
  }
  // reclined slatted back
  for (let y = sy + 2; y < sy + 32; y++) {
    const t = (y - sy) / 32;
    const z = Math.round(c - 18 - t * 5);
    const hw = 18 - t * 2 + Math.sin(t * Math.PI) * 2;
    const slot = (y - sy) % 6 < 2 && y > sy + 8 && y < sy + 28;
    for (let x = Math.round(c - hw); x <= Math.round(c + hw); x++) {
      if (slot && Math.abs(x - c) < hw - 4) continue;
      b.set(x, y, z, pl);
      b.set(x, y, z + 1, pl);
    }
  }
  grime(b, [pl], { h: 14, amount: 0.5, seed: rng.int(1, 1e5), k: 0.7 });
  recolor(b, [pl], (v, x, y, z, nn, m) => (m & F_PY && nn > 0.55 ? V.dirt(P, pl, 0.8) : undefined), { freq: 0.12, seed: rng.int(1, 1e5) });
  const model = b.model();
  if (!broken) return { model, meta: { size: b.sizeM(), footprint: [0.56, 0.56], mount: 'floor', kind: 'plasticChair' } };
  const r = rot(['x', snap >= 2 ? 0.28 : -0.28], ['z', snap % 2 ? 0.2 : -0.2], ['y', rng.range(0, 6.28)]);
  return { model: emptyModel(vs), parts: [{ name: 'chair', model, position: restPos(model, r, {}), rotation: r }], meta: { size: b.sizeM(), footprint: [0.6, 0.6], mount: 'floor', kind: 'plasticChair', broken } };
}

// ───────────────────────────── grease bin ─────────────────────────────

/**
 * Restaurant used-cooking-oil container: steel box on legs, sloped hinged lid with hasp and
 * padlock, drain valve, grease drips and a glossy grease stain on the ground.
 * opts: color [r,g,b], paint (canvas -> front). Origin: footprint centre.
 */
export function greaseBin(rng, opts = {}) {
  const vs = VS_MED;
  const W = 40, D = 27, H = 33, legH = 3;
  const pad = 8;
  const b = new VB(W + 2 * pad, H + legH + 5, D + 2 * pad, vs, 'floor');
  const P = b.P;
  const col = opts.color ?? rgbJitter(rng, rng.pick([[44, 46, 48], [36, 54, 44], [70, 72, 74], [92, 40, 34]]), 0.06);
  const body = mat.paint(P, 'body', col, { cls: MCLS.GENERIC, rough: 0.55, metal: 0.4 });
  const steel = mat.steel(P, 'steel', [70, 68, 64]);
  const brass = mat.steel(P, 'brass', [150, 120, 60], { metal: 0.9, rough: 0.35 });
  const x0 = pad, z0 = pad, y0 = legH;
  b.shell(x0, y0, z0, x0 + W, y0 + H, z0 + D, 1, body, { py: true });
  b.box(x0, y0 + H - 1, z0, x0 + W, y0 + H, z0 + D, body);
  // corner posts + legs
  for (const [lx, lz] of [[x0, z0], [x0 + W - 2, z0], [x0, z0 + D - 2], [x0 + W - 2, z0 + D - 2]]) {
    b.box(lx - (lx === x0 ? 1 : -1) * 0, 0, lz, lx + 2, y0 + H, lz + 2, body);
  }
  // sloped lid (in grid, closed) with overhang + hinge at back
  for (let z = z0 - 1; z < z0 + D + 2; z++) {
    const t = (z - z0) / D;
    const yy = Math.round(y0 + H + 2 - t * 2);
    b.box(x0 - 1, yy, z, x0 + W + 1, yy + 1, z + 1, body);
  }
  b.box(x0 - 1, y0 + H - 1, z0 + D + 1, x0 + W + 1, y0 + H + 1, z0 + D + 2, body);
  // hasp + padlock at front centre
  const hx = Math.round(x0 + W / 2);
  b.box(hx - 1, y0 + H - 4, z0 + D, hx + 1, y0 + H, z0 + D + 1, steel);
  b.box(hx - 1, y0 + H - 7, z0 + D + 1, hx + 1, y0 + H - 4, z0 + D + 2, brass);
  // drain valve at bottom front
  b.box(x0 + 4, y0 + 2, z0 + D, x0 + 6, y0 + 4, z0 + D + 3, steel);
  b.box(x0 + 3, y0 + 4, z0 + D + 2, x0 + 7, y0 + 5, z0 + D + 3, mat.paint(P, 'valve', [170, 40, 30], { cls: MCLS.GENERIC }));
  // label
  const lab = mat.paper(P, 'label', [206, 202, 186]);
  const ink = mat.paper(P, 'ink', [150, 40, 34]);
  const lx = x0 + W - 18, ly = y0 + H - 13;
  for (let y = ly; y < ly + 7; y++) for (let x = lx; x < lx + 14; x++) b.set(x, y, z0 + D - 1, (y === ly + 4 || y === ly + 2) && x > lx && x < lx + 13 && vrand(x, y, 1, 2) < 0.7 ? ink : lab);
  // grease: drips from the lid seam and around the valve, glossy stain on the ground
  streaks(b, rng, [body], { count: rng.int(10, 18), len: [6, 30], yMin: y0 + H - 3, kind: 'grease' });
  const seed = rng.int(1, 1e5);
  recolor(b, [body], (v, x, y, z, n, m) => (m & F_PY && n > 0.5 ? V.grease(P, body) : undefined), { freq: 0.12, seed });
  grime(b, [body], { h: y0 + 6, amount: 0.6, seed: seed + 1, k: 0.6 });
  rust(b, [body], { amount: 0.4, seed: seed + 2, bottom: 2, y0 });
  const src = paintFor(opts.paint, 'front');
  if (src) applyPaint(b, src, '+z', { u0: x0, v0: y0, u1: x0 + W, v1: y0 + H }, {});
  // glossy grease stain on the ground: a thin (one extra-fine voxel) decal-like part
  const parts = [];
  if (opts.stain ?? true) {
    const sv = VS_XFINE;
    const SW = Math.round((W * vs + 0.5) / sv), SD = Math.round((D * vs + 0.6) / sv);
    const st = new VB(SW, 1, SD, sv, [-(SW * sv) / 2, 0, -(SD * sv) / 2 + 0.12]);
    const g1 = mat.generic(st.P, 'grease', [30, 24, 14], { rough: 0.1, vari: 0.06 });
    const g2 = mat.generic(st.P, 'grease2', [44, 34, 18], { rough: 0.16, vari: 0.08 });
    for (let z = 0; z < SD; z++)
      for (let x = 0; x < SW; x++) {
        const dx = (x + 0.5 - SW / 2) / (SW / 2), dz = (z + 0.5 - SD * 0.62) / (SD * 0.45);
        const r = Math.hypot(dx, dz) + (fbm2(x * 0.09, z * 0.09, 2, seed) - 0.5) * 0.7;
        if (r < 1) st.set(x, 0, z, r < 0.55 ? g1 : g2);
      }
    st.origin = [-(SW * sv) / 2, -sv * 0.85, -(SD * sv) / 2 + 0.12];
    parts.push({ name: 'stain', model: st.model(st.origin), position: [0, 0, 0], rotation: [0, 0, 0] });
  }
  return {
    model: b.model(),
    parts,
    meta: { size: [W * vs, (H + legH + 3) * vs, D * vs], footprint: [W * vs, D * vs], mount: 'floor', kind: 'greaseBin', paintSurfaces: { front: { w: W * vs, h: H * vs, face: '+z' } } },
  };
}

// ───────────────────────────── rubble ─────────────────────────────

const BRICKS = [[124, 62, 46], [110, 56, 42], [98, 50, 38], [136, 74, 54], [118, 64, 48], [150, 120, 88], [104, 60, 46]];

function brickModel(rng, kind) {
  const vs = VS_FINE;
  let w = 15, h = 4, d = 7;
  if (kind === 'half') w = rng.int(6, 9);
  if (kind === 'cmu') [w, h, d] = [29, 15, 15];
  if (kind === 'chunk') [w, h, d] = [rng.int(3, 6), rng.int(2, 4), rng.int(3, 5)];
  const b = new VB(w, h, d, vs, 'center');
  const P = b.P;
  const isCmu = kind === 'cmu';
  const c = isCmu ? mat.concrete(P, 'cmu', rgbJitter(rng, [134, 132, 126], 0.05)) : mat.brick(P, 'brick', rgbJitter(rng, rng.pick(BRICKS), 0.06));
  const mortar = mat.concrete(P, 'mortar', [150, 146, 136]);
  b.box(0, 0, 0, w, h, d, c);
  if (isCmu) {
    // two hollow cores through the height
    b.box(3, 0, 3, 13, h, d - 3, 0);
    b.box(16, 0, 3, 26, h, d - 3, 0);
  }
  // chipped corners / edges + mortar crumbs
  b.g.forEach((v, x, y, z) => {
    if (!v) return;
    const edges = (x === 0 || x === w - 1 ? 1 : 0) + (y === 0 || y === h - 1 ? 1 : 0) + (z === 0 || z === d - 1 ? 1 : 0);
    if (edges >= 2 && vrand(x, y, z, 11) < 0.35) b.set(x, y, z, 0);
    else if (edges >= 1 && !isCmu && vrand(x, y, z, 12) < 0.12) b.set(x, y, z, mortar);
  });
  return b.model();
}

/**
 * Pile of loose bricks, half bricks, a cinder block or two and mortar crumbs.
 * opts: count (pieces), radius (m). Origin: pile centre at ground.
 */
export function rubble(rng, opts = {}) {
  const vs = VS_FINE;
  const n = opts.count ?? rng.int(12, 22);
  const rad = opts.radius ?? rng.range(0.35, 0.55);
  // crumbs / dust base in one grid
  const N = Math.round((rad * 2.4) / vs);
  const b = new VB(N, 4, N, vs, 'floor');
  const P = b.P;
  const dust = mat.concrete(P, 'dust', [96, 88, 80]);
  const crumb = mat.brick(P, 'crumb', [110, 60, 46]);
  const c = N / 2;
  const seed = rng.int(1, 1e5);
  for (let z = 0; z < N; z++)
    for (let x = 0; x < N; x++) {
      const r = Math.hypot(x + 0.5 - c, z + 0.5 - c) / (N / 2.6) + (valueNoise2(x * 0.12, z * 0.12, seed + 3) - 0.5) * 0.5;
      const h = (1 - r) * 3 + (valueNoise2(x * 0.3, z * 0.3, seed) - 0.5) * 1.5;
      for (let y = 0; y < Math.min(3, Math.floor(h)); y++) b.set(x, y, z, vrand(x, y, z, seed) < 0.18 ? crumb : dust);
    }
  // heightmap for stacking pieces
  const G = 24, cell = (rad * 2.4) / G;
  const hm = new Float32Array(G * G);
  const parts = [];
  for (let i = 0; i < n; i++) {
    const kind = rng.weighted(['brick', 'half', 'cmu', 'chunk'], [6, 3, i < 2 ? 1 : 0.2, 3]);
    const m = brickModel(rng, kind);
    const a = rng.range(0, 6.28), r = Math.sqrt(rng.next()) * rad * (kind === 'cmu' ? 0.5 : 0.9);
    const px = Math.cos(a) * r, pz = Math.sin(a) * r;
    const gi = cl(Math.floor(px / cell + G / 2), 0, G - 1), gj = cl(Math.floor(pz / cell + G / 2), 0, G - 1);
    const rr = rot(['x', rng.chance(0.25) ? rng.range(-0.6, 0.6) : rng.range(-0.15, 0.15)], ['z', rng.chance(0.2) ? Math.PI / 2 : rng.range(-0.2, 0.2)], ['y', rng.range(0, 6.28)]);
    const pos = restPos(m, rr, { x: px, yMin: hm[gi + gj * G] * 0.8, z: pz });
    parts.push({ name: `${kind}${i}`, model: m, position: pos, rotation: rr });
    const top = pos[1] + 0.06;
    for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
      const ii = gi + di, jj = gj + dj;
      if (ii >= 0 && jj >= 0 && ii < G && jj < G) hm[ii + jj * G] = Math.max(hm[ii + jj * G], top * (1 - (Math.abs(di) + Math.abs(dj)) * 0.12));
    }
  }
  return { model: b.model(), parts, meta: { size: [rad * 2.4, 0.4, rad * 2.4], footprint: [rad * 2, rad * 2], mount: 'floor', kind: 'rubble' } };
}

// ───────────────────────────── milk crate / crate seat ─────────────────────────────

/**
 * Plastic dairy crate (33 x 33 x 28 cm): grid-walled sides, top band with handle slots,
 * grid bottom. opts: color [r,g,b] | 'blue'|'red'|'black'|'green'|'yellow', upsideDown (bool).
 */
export function milkCrate(rng, opts = {}) {
  const vs = VS_FINE;
  const COLS = { blue: [30, 64, 120], red: [140, 30, 28], black: [36, 36, 38], green: [40, 92, 52], yellow: [190, 150, 40], grey: [110, 112, 112] };
  const col = Array.isArray(opts.color) ? opts.color : rgbJitter(rng, COLS[opts.color ?? rng.weighted(Object.keys(COLS), [3, 2.5, 2, 1.5, 1, 1])], 0.06);
  const W = 24, D = 24, H = 21;
  const b = new VB(W, H, D, vs, 'floor');
  const P = b.P;
  const body = mat.plastic(P, 'body', col, { rough: 0.55 });
  const faded = mat.plastic(P, 'faded', rgbMix(col, [150, 150, 150], 0.3), { rough: 0.7 });
  // bottom grid
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) if (x % 4 === 0 || z % 4 === 0 || x === W - 1 || z === D - 1) b.set(x, 0, z, body);
  // walls: posts every 4, rails at fixed heights, solid top band with a handle slot
  for (let y = 1; y < H; y++)
    for (let i = 0; i < W; i++) {
      const band = y >= H - 4;
      const rail = y === 1 || y % 5 === 0;
      const post = i % 4 === 0 || i === W - 1;
      const handle = band && y === H - 3 && i > 7 && i < W - 8;
      const solid = (band && !handle) || rail || post;
      if (!solid) continue;
      b.set(i, y, 0, body);
      b.set(i, y, D - 1, body);
      if (!handle) {
        b.set(0, y, i, body);
        b.set(W - 1, y, i, body);
      } else {
        b.set(0, y, i, 0);
        b.set(W - 1, y, i, 0);
      }
    }
  // corner columns slightly thicker
  for (const [x, z] of [[0, 0], [W - 1, 0], [0, D - 1], [W - 1, D - 1]]) b.box(x === 0 ? 0 : x - 1, 0, z === 0 ? 0 : z - 1, x === 0 ? 2 : x + 1, H, z === 0 ? 2 : z + 1, body);
  recolor(b, [body], (v, x, y, z, n) => (n > 0.62 ? faded : undefined), { freq: 0.1, seed: rng.int(1, 1e5) });
  grime(b, [body, faded], { h: 6, amount: 0.5, seed: rng.int(1, 1e5), k: 0.7 });
  let bb = b;
  if (opts.upsideDown) {
    bb = rotate90(b, 'x', 2);
    bb.setMount('floor');
  }
  return { model: bb.model(), meta: { size: bb.sizeM(), footprint: [W * vs, D * vs], mount: 'floor', kind: 'milkCrate', height: H * vs } };
}

/** Upside-down milk crate used as a seat, with a folded cardboard cushion on top. */
export function crateSeat(rng, opts = {}) {
  const crate = milkCrate(rng.fork('crate'), { ...opts, upsideDown: true });
  const parts = [];
  const sheet = cardboardSheet(rng.fork('cushion'), { w: rng.range(0.34, 0.42), d: rng.range(0.3, 0.38), curl: 1, wet: rng.range(0.1, 0.6) });
  addProp(parts, 'cushion', sheet, [rng.range(-0.02, 0.02), crate.meta.height + 0.001, rng.range(-0.02, 0.02)], [0, rng.range(-0.4, 0.4), 0]);
  if (rng.chance(0.5)) addProp(parts, 'cushion2', sheet, [rng.range(-0.02, 0.02), crate.meta.height + 0.015, 0], [0, rng.range(-0.6, 0.6), 0]);
  return { model: crate.model, parts, meta: { ...crate.meta, kind: 'crateSeat', anchors: { seat: [0, crate.meta.height + 0.03, 0] } } };
}

// ───────────────────────────── mop bucket ─────────────────────────────

/** Yellow commercial mop bucket on casters with side-press wringer and a mop leaning in it. */
export function mopBucket(rng, opts = {}) {
  const vs = VS_FINE;
  const W = 30, D = 44, H = 28;
  const b = new VB(W + 4, 70, D + 4, vs, 'floor');
  const P = b.P;
  const yel = mat.plastic(P, 'yellow', rgbJitter(rng, opts.color ?? [200, 160, 36], 0.05), { rough: 0.45 });
  const grey = mat.plastic(P, 'grey', [80, 82, 84], { rough: 0.5 });
  const water = mat.generic(P, 'water', [58, 56, 44], { rough: 0.05 });
  const steel = mat.steel(P, 'steel', [130, 130, 128], { metal: 0.8, rough: 0.35 });
  const blk = mat.rubber(P, 'caster', [30, 30, 30]);
  const x0 = 2, z0 = 2, y0 = 4;
  // tapered tub with rounded corners
  for (let y = y0; y < y0 + H; y++) {
    const t = (y - y0) / H;
    const hw = (W / 2) * (0.88 + 0.12 * t), hd = (D / 2) * (0.9 + 0.1 * t);
    for (let z = 0; z < b.nz; z++)
      for (let x = 0; x < b.nx; x++) {
        const dx = Math.abs(x + 0.5 - (x0 + W / 2)) - hw + 4, dz = Math.abs(z + 0.5 - (z0 + D / 2)) - hd + 4;
        const d = Math.hypot(Math.max(dx, 0), Math.max(dz, 0)) + Math.min(Math.max(dx, dz), 0) - 4;
        if (d < 0 && (d >= -1.3 || y === y0 || y === y0 + 10)) b.set(x, y, z, y === y0 + 10 && d < -1.3 ? water : yel);
        if (y >= y0 + H - 2 && d < 1 && d >= 0) b.set(x, y, z, yel);
      }
  }
  // casters
  for (const [cx, cz] of [[x0 + 4, z0 + 4], [x0 + W - 5, z0 + 4], [x0 + 4, z0 + D - 5], [x0 + W - 5, z0 + D - 5]]) {
    b.box(cx - 1, 3, cz - 1, cx + 2, y0, cz + 2, grey);
    b.g.cylX(1.6, cz + 0.5, 1.6, cx - 1, cx + 2, blk);
  }
  // wringer on the back half: grey box frame + press lever
  const wz = z0 + 4, wy = y0 + H;
  b.box(x0 + 3, wy - 6, wz, x0 + W - 3, wy + 10, wz + 2, grey);
  b.box(x0 + 3, wy - 6, wz + 14, x0 + W - 3, wy + 10, wz + 16, grey);
  b.box(x0 + 3, wy + 8, wz, x0 + 5, wy + 10, wz + 16, grey);
  b.box(x0 + W - 5, wy + 8, wz, x0 + W - 3, wy + 10, wz + 16, grey);
  b.g.line(x0 + W - 4, wy + 9, wz + 8, x0 + W - 3, wy + 34, wz + 2, 0.9, steel);
  b.box(x0 + W - 5, wy + 33, wz, x0 + W - 1, wy + 36, wz + 4, grey);
  // a printed wet-floor pictogram block on the front
  const pict = mat.plastic(P, 'pict', [30, 30, 32], { rough: 0.5 });
  b.box(Math.round(x0 + W / 2 - 3), y0 + 12, z0 + D - 1, Math.round(x0 + W / 2 + 3), y0 + 20, z0 + D, pict);
  grime(b, [yel], { h: y0 + 10, amount: 0.6, seed: rng.int(1, 1e5), k: 0.7 });
  // mop: handle leaning against the wringer, head in the bucket
  const parts = [];
  const mb = new VB(9, 112, 9, vs, 'corner');
  const handle = mat.wood(mb.P, 'handle', rgbJitter(rng, rng.pick([[170, 140, 96], [140, 140, 138]]), 0.05));
  const strands = mat.fabric(mb.P, 'strands', rgbJitter(rng, [150, 146, 132], 0.06));
  const strandsD = mat.fabric(mb.P, 'strandsD', [96, 92, 80]);
  mb.g.cylY(4.5, 4.5, 1.2, 12, 112, handle);
  mb.box(2, 10, 2, 7, 13, 7, mat.plastic(mb.P, 'clamp', [60, 60, 62]));
  for (let i = 0; i < 26; i++) {
    const a = rng.range(0, 6.28), r = rng.range(0.5, 4.2);
    const x = 4.5 + Math.cos(a) * r, z = 4.5 + Math.sin(a) * r;
    mb.g.line(x, 11, z, x + rng.range(-1, 1), rng.range(0, 3), z + rng.range(-1, 1), 0.6, rng.chance(0.4) ? strandsD : strands);
  }
  const mopM = mb.model([-4.5 * vs, 0, -4.5 * vs]);
  parts.push({ name: 'mop', model: mopM, position: [b.mx(x0 + W / 2), b.my(y0 + 11), b.mz(z0 + D * 0.62)], rotation: rot(['x', -0.32], ['y', rng.range(-0.3, 0.3)]) });
  return { model: b.model(), parts, meta: { size: [W * vs, 1.5, D * vs], footprint: [W * vs, D * vs], mount: 'floor', kind: 'mopBucket' } };
}

// ───────────────────────────── cigarette can ─────────────────────────────

/** Coffee can ashtray (faded label, rust) heaped with cigarette butts. */
export function cigaretteCan(rng, opts = {}) {
  const vs = VS_FINE;
  const R = 5.6, H = 12;
  const n = 14;
  const b = new VB(n, H + 1, n, vs, 'floor');
  const P = b.P;
  const tin = mat.galv(P, 'tin', [150, 150, 146], { rough: 0.5 });
  const label = mat.paper(P, 'label', rgbJitter(rng, rng.pick([[150, 40, 34], [40, 60, 110], [60, 50, 40], [190, 150, 60]]), 0.06));
  const c = n / 2;
  lathe(b, c, c, 0, H, (y) => [R + (y > H - 1 ? 0.4 : 0), y < H - 2 ? -1 : R - 1], (x, y, z, a) => (y > 1 && y < H - 2 && Math.sin(a * 3) > -0.7 ? label : tin));
  recolor(b, [tin, label], (v, x, y, z, nn) => (nn > 0.6 ? V.rust(P, v, 0.9) : nn < 0.3 ? V.faded(P, v, 0.3) : undefined), { freq: 0.2, seed: rng.int(1, 1e5) });
  // heap of butts as an extra-fine part
  const hb = new VB(Math.ceil(R * 4 + 4), 8, Math.ceil(R * 4 + 4), VS_XFINE, 'floor');
  const filt = mat.paper(hb.P, 'filter', [196, 150, 92]);
  const paper = mat.paper(hb.P, 'paper', [214, 210, 202]);
  const ash = mat.generic(hb.P, 'ash', [90, 88, 86], { rough: 0.95 });
  const hc = hb.nx / 2;
  for (let i = 0; i < 70; i++) {
    const a = rng.range(0, 6.28), r = Math.sqrt(rng.next()) * (R * 2 - 1.5);
    const x = hc + Math.cos(a) * r, z = hc + Math.sin(a) * r;
    const y = Math.max(0, 4 - r * 0.3 + rng.range(-1, 2));
    const da = rng.range(0, 6.28);
    const dx = Math.cos(da), dz = Math.sin(da);
    hb.set(Math.round(x), Math.round(y), Math.round(z), filt);
    hb.set(Math.round(x + dx), Math.round(y), Math.round(z + dz), filt);
    hb.set(Math.round(x + dx * 2), Math.round(y), Math.round(z + dz * 2), paper);
    if (rng.chance(0.5)) hb.set(Math.round(x + dx * 3), Math.round(y), Math.round(z + dz * 3), rng.chance(0.5) ? ash : paper);
  }
  return { model: b.model(), parts: [{ name: 'butts', model: hb.model(), position: [0, (H - 3) * vs, 0], rotation: [0, 0, 0] }], meta: { size: b.sizeM(), footprint: [R * 2 * vs, R * 2 * vs], mount: 'floor', kind: 'cigaretteCan' } };
}

// ───────────────────────────── newspaper box ─────────────────────────────

/**
 * Street newspaper vending box on a pedestal: faded coloured body, window, coin box, chain.
 * opts: color [r,g,b], tipped (bool), paint (canvas -> front). Origin: footprint centre.
 */
export function newspaperBox(rng, opts = {}) {
  const vs = VS_FINE;
  const W = 37, D = 32, H = 46, ped = 26;
  const b = new VB(W + 2, H + ped + 4, D + 4, vs, 'floor');
  const P = b.P;
  const col = opts.color ?? rgbJitter(rng, rng.pick([[40, 70, 130], [150, 40, 34], [200, 166, 50], [40, 100, 70], [60, 60, 62]]), 0.06);
  const body = mat.paint(P, 'body', col, { cls: MCLS.GENERIC, rough: 0.55, metal: 0.3 });
  const dark = mat.steel(P, 'dark', [40, 40, 42]);
  const glass = mat.glass(P, 'glass', [60, 70, 72]);
  const paper = mat.paper(P, 'news', [180, 176, 164]);
  const ink = mat.paper(P, 'ink', [60, 58, 56]);
  const x0 = 1, z0 = 2, y0 = ped;
  // pedestal: post + base plate
  b.box(Math.round(x0 + W / 2 - 3), 0, Math.round(z0 + D / 2 - 3), Math.round(x0 + W / 2 + 3), y0, Math.round(z0 + D / 2 + 3), dark);
  b.box(x0 + 4, 0, z0 + 4, x0 + W - 4, 2, z0 + D - 4, dark);
  // body + sloped top
  b.shell(x0, y0, z0, x0 + W, y0 + H, z0 + D, 1, body);
  for (let z = z0; z < z0 + D; z++) {
    const yy = y0 + H + Math.round(((z0 + D - z) / D) * 3);
    b.box(x0, y0 + H, z, x0 + W, yy, z + 1, body);
  }
  // window on the door (front) showing a newspaper behind
  const wx0 = x0 + 4, wx1 = x0 + W - 12, wy0 = y0 + 14, wy1 = y0 + H - 6;
  for (let y = wy0; y < wy1; y++) for (let x = wx0; x < wx1; x++) {
    b.set(x, y, z0 + D - 1, glass);
    b.set(x, y, z0 + D - 3, (y - wy0) % 4 === 1 && x > wx0 + 2 && x < wx1 - 3 && vrand(x, y, 1, 4) < 0.7 ? ink : paper);
  }
  // pull handle + coin mechanism
  b.box(wx0 + 4, wy0 - 4, z0 + D, wx1 - 4, wy0 - 2, z0 + D + 2, dark);
  b.box(x0 + W - 10, y0 + H - 16, z0 + D, x0 + W - 3, y0 + H - 4, z0 + D + 2, mat.steel(P, 'coin', [120, 120, 122], { metal: 0.8 }));
  // weathering: faded top, scrapes, stickers
  mottle(b, [body], { freq: 0.05, seed: rng.int(1, 1e5), k: [0.85, 1.15], sat: 0.25, cover: 0.32 });
  chips(b, rng, [body], { density: 0.01, kinds: ['bare', 'rust'] });
  grime(b, [body, dark], { h: y0 + 6, amount: 0.5, seed: rng.int(1, 1e5) });
  const src = paintFor(opts.paint, 'front');
  if (src) applyPaint(b, src, '+z', { u0: x0, v0: y0, u1: x0 + W, v1: y0 + H }, { skip: new Set([glass]) });
  let model = b.model();
  const parts = [];
  if (opts.tipped ?? rng.chance(0.25)) {
    const r = rot(['x', -Math.PI / 2], ['y', rng.range(-0.4, 0.4)]);
    parts.push({ name: 'box', model, position: restPos(model, r, {}), rotation: r });
    model = emptyModel(vs);
  }
  return { model, parts, meta: { size: b.sizeM(), footprint: [W * vs, D * vs], mount: 'floor', kind: 'newspaperBox', paintSurfaces: { front: { w: W * vs, h: H * vs, face: '+z' } } } };
}

// ───────────────────────────── bicycle frame ─────────────────────────────

/**
 * Stripped bicycle frame U-locked to a vertical pipe, leaning against the wall: no front wheel,
 * bent rear wheel (or missing), no saddle. Origin: wall base (mount 'wall'), extends +z.
 */
export function bicycleFrame(rng, opts = {}) {
  const vs = VS_FINE;
  // frame in the XY plane (x along the bike), thickness along z
  const b = new VB(130, 80, 9, vs, 'corner');
  const P = b.P;
  const col = rgbJitter(rng, rng.pick([[40, 40, 44], [130, 30, 30], [40, 70, 120], [180, 180, 176], [60, 90, 60]]), 0.06);
  const paint = mat.paint(P, 'frame', col, { cls: MCLS.GENERIC, rough: 0.4, metal: 0.5 });
  const steel = mat.steel(P, 'steel', [120, 120, 122], { metal: 0.85, rough: 0.35 });
  const rubber = mat.rubber(P, 'tire', [30, 30, 30]);
  const zc = 4.5;
  const rearAxle = [24, 25], bb = [65, 20], seatTop = [56, 66], headTop = [102, 66], headBot = [105, 52], frontAxle = [112, 25];
  const tube = (a, c, r = 1.3, m = paint) => b.g.line(a[0], a[1], zc, c[0], c[1], zc, r, m);
  tube(bb, seatTop, 1.5);
  tube(seatTop, headTop, 1.4);
  tube(bb, headBot, 1.7);
  tube(headTop, headBot, 1.6);
  for (const dz of [-2.2, 2.2]) {
    b.g.line(bb[0], bb[1], zc, rearAxle[0], rearAxle[1], zc + dz, 1.0, paint);
    b.g.line(seatTop[0], seatTop[1] - 3, zc, rearAxle[0], rearAxle[1], zc + dz, 1.0, paint);
  }
  // fork without wheel
  for (const dz of [-2.2, 2.2]) b.g.line(headBot[0], headBot[1], zc, frontAxle[0] - 2, frontAxle[1] + 3, zc + dz, 1.0, steel);
  // handlebar stub, seatpost stub, crank
  b.g.line(headTop[0], headTop[1], zc, headTop[0] - 3, headTop[1] + 8, zc, 1.0, steel);
  b.g.line(seatTop[0], seatTop[1], zc, seatTop[0] - 2, seatTop[1] + 5, zc, 1.1, steel);
  b.g.cylZ(bb[0] + 0.5, bb[1] + 0.5, 3.2, 1, 8, steel);
  if (rng.chance(0.5)) b.g.line(bb[0], bb[1], 8, bb[0] + 10, bb[1] - 9, 8, 0.9, steel);
  // rear wheel (bent) or bare dropouts
  const parts = [];
  if (opts.wheel ?? rng.chance(0.7)) {
    const wb = new VB(68, 68, 14, vs, 'center');
    const tireM = mat.rubber(wb.P, 'tire', [30, 30, 30]);
    const rim = mat.steel(wb.P, 'rim', [150, 150, 152], { metal: 0.9, rough: 0.3 });
    const bend = rng.range(2, 5);
    wb.fill(0, 0, 0, 68, 68, 14, (px, py, pz) => {
      const dx = px - 34, dy = py - 34;
      const r = Math.hypot(dx, dy);
      const a = Math.atan2(dy, dx);
      const zoff = 7 + Math.sin(2 * a) * bend;
      if (Math.abs(pz - zoff) > 1.2) return undefined;
      if (r > 31.5 && r < 33.5) return tireM;
      if (r > 29.5 && r <= 31.5) return rim;
      return undefined;
    });
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      wb.g.line(34, 34, 7, 34 + Math.cos(a) * 30, 34 + Math.sin(a) * 30, 7 + Math.sin(2 * a) * bend, 0.5, rim);
    }
    parts.push({ name: 'wheel', model: wb.model(), _local: [rearAxle[0] * vs, rearAxle[1] * vs, zc * vs] });
  }
  void rubber;
  recolor(b, [paint], (v, x, y, z, n) => (n > 0.65 ? V.rust(P, v, 1.0) : n < 0.2 ? V.bare(P, v) : undefined), { freq: 0.12, seed: rng.int(1, 1e5) });
  // lean against the wall: frame plane rotated ~14° from vertical, rear wheel side on the ground
  const lean = rng.range(0.18, 0.3);
  const yaw = 0;
  const r = rot(['x', -lean], ['y', yaw]);
  const frameM = b.model([-65 * vs, 0, -zc * vs]);
  const pos = [rng.range(-0.2, 0.2), 0.02, Math.sin(lean) * 0.8 + 0.06];
  const out = [{ name: 'frame', model: frameM, position: pos, rotation: r }];
  for (const p of parts) {
    const lp = [p._local[0] - 65 * vs, p._local[1], p._local[2] - zc * vs];
    const added = addProp([], 'wheel', { model: p.model }, lp, [0, 0, 0]);
    out.push(...addProp([], 'wheel', { model: emptyModel(), parts: added }, pos, r));
  }
  // vertical pipe the lock is attached to + U-lock around the seat tube
  const pb = new VB(5, 90, 5, vs, 'floor');
  pb.g.cylY(2.5, 2.5, 2.2, 0, 90, mat.paint(pb.P, 'pipe', [150, 150, 140], { cls: MCLS.GENERIC, rough: 0.6 }));
  out.push({ name: 'pipe', model: pb.model(), position: [pos[0] - 0.1, 0, 0.05], rotation: [0, 0, 0] });
  const lb = new VB(12, 16, 4, vs, 'center');
  const lockM = mat.steel(lb.P, 'lock', [40, 40, 44], { metal: 0.6 });
  lb.g.line(2, 2, 2, 2, 13, 2, 1.0, lockM);
  lb.g.line(10, 2, 2, 10, 13, 2, 1.0, lockM);
  lb.g.line(2, 13, 2, 10, 13, 2, 1.0, lockM);
  lb.box(0, 0, 0, 12, 4, 4, mat.plastic(lb.P, 'lockbar', [30, 30, 32]));
  out.push({ name: 'lock', model: lb.model(), position: [pos[0] - 0.07, 0.62, 0.1], rotation: [0, 0.4, 0.2] });
  return { model: emptyModel(vs), parts: out, meta: { size: [1.75, 1.0, 0.45], footprint: [1.7, 0.4], mount: 'wall', kind: 'bicycleFrame' } };
}

// ───────────────────────────── shoes on a wire ─────────────────────────────

function sneaker(rng, vs, colors) {
  // sole along -y, toe toward +z; ~28 cm long
  const L = 21, Wd = 8, Hh = 9;
  const b = new VB(Wd + 2, Hh + 2, L + 2, vs, 'corner');
  const P = b.P;
  const sole = mat.rubber(P, 'sole', colors.sole);
  const upper = mat.fabric(P, 'upper', colors.upper, { rough: 0.7 });
  const accent = mat.fabric(P, 'accent', colors.accent, { rough: 0.6 });
  const lace = mat.fabric(P, 'lace', colors.lace);
  const dark = mat.fabric(P, 'opening', [24, 22, 22]);
  const cx = (Wd + 2) / 2;
  b.fill(0, 0, 0, Wd + 2, Hh + 2, L + 2, (px, py, pz) => {
    const t = (pz - 1) / L; // 0 heel -> 1 toe
    if (t < 0 || t > 1) return undefined;
    const hw = (Wd / 2) * (0.78 + 0.22 * Math.sin(Math.PI * clamp(t * 1.15, 0, 1)));
    if (Math.abs(px - cx) > hw) return undefined;
    // profile: high collar at the heel, sloping vamp, rounded toe
    const top = t < 0.32 ? Hh : t < 0.85 ? Hh - (t - 0.32) * Hh * 0.75 : Hh * 0.6 * Math.sqrt(Math.max(0, (1 - t) / 0.15));
    if (py < 1 || py > top + 1) return undefined;
    if (py < 2.6) return sole;
    if (t < 0.3 && py > top - 0.5 && Math.abs(px - cx) < hw - 1.2) return dark; // collar opening
    if (t > 0.32 && t < 0.72 && Math.abs(px - cx) < 1.6 && py > top - 0.6) return lace;
    if (Math.abs(py - (3.5 + t * 2)) < 0.8 && t > 0.15 && t < 0.85 && Math.abs(px - cx) > hw - 1.2) return accent; // side stripe
    return upper;
  });
  return b;
}

/**
 * Pair of sneakers tied together by the laces, hanging over an overhead wire. opts.scheme picks
 * the colourway (0 white, 1 black, 2 red, 3 blue; random by default).
 * Origin = contact point on the wire. Parts: 'shoes' (animate 'sway', pivot at the wire).
 */
export function shoesOnWire(rng, opts = {}) {
  const vs = VS_FINE;
  const schemes = [
    { upper: [210, 208, 200], accent: [30, 30, 32], sole: [220, 218, 210], lace: [214, 212, 206] },
    { upper: [30, 30, 32], accent: [200, 200, 196], sole: [230, 228, 220], lace: [40, 40, 42] },
    { upper: [150, 36, 34], accent: [214, 212, 206], sole: [220, 218, 210], lace: [210, 208, 200] },
    { upper: [60, 90, 150], accent: [220, 220, 216], sole: [40, 40, 40], lace: [220, 218, 212] },
  ];
  const scheme = opts.scheme != null ? schemes[opts.scheme % schemes.length] : rng.pick(schemes);
  const parts = [];
  const g = new VB(4, 40, 4, vs, [-2 * vs, -40 * vs + vs, -2 * vs]);
  const lace = mat.fabric(g.P, 'lace', scheme.lace);
  // lace loop over the wire + two strands
  g.box(1, 38, 1, 3, 40, 3, lace);
  const strands = [];
  for (const [i, s] of [-1, 1].entries()) {
    const drop = rng.range(0.24, 0.42);
    const sh = sneaker(rng, vs, scheme);
    const model = sh.model([-(sh.nx * vs) / 2, -(sh.ny * vs), -(4 * vs)]);
    // shoe hangs from its collar: toe down, sole facing sideways-out, slight random twist
    // Rx(+90deg): toe points down, shoe top faces +z; then turn about the vertical long axis and sway a bit
    const r = rot(['x', Math.PI / 2 + rng.range(-0.2, 0.2)], ['y', s * rng.range(0.5, 1.3) + rng.range(-0.3, 0.3)], ['z', rng.range(-0.15, 0.15)]);
    const top = [s * rng.range(0.025, 0.06), -drop, rng.range(-0.02, 0.02)];
    parts.push({ name: `shoe${i}`, model, position: top, rotation: r, animate: 'sway' });
    strands.push(top);
  }
  for (const [i, t] of strands.entries()) {
    const n = Math.max(2, Math.round(Math.hypot(t[0], t[1], t[2]) / vs));
    const sb = new VB(1, n, 1, vs, [-vs / 2, 0, -vs / 2]);
    sb.box(0, 0, 0, 1, n, 1, sb.P.add('lace', { color: scheme.lace, rough: 0.9, metal: 0, cls: MCLS.FABRIC, vari: 0.05 }));
    const dir = new THREE.Vector3(-t[0], -t[1], -t[2]).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
    parts.push({ name: `lace${i}`, model: sb.model(), position: t, rotation: [e.x, e.y, e.z], animate: 'sway' });
  }
  // every swaying part pivots about the wire contact point (the prop origin)
  for (const p of parts) repivot(p, [0, 0, 0]);
  return {
    model: g.model(),
    parts,
    meta: { size: [0.4, 0.75, 0.3], mount: 'wire', kind: 'shoesOnWire', previewY: 2.6, anchors: { wire: [0, 0, 0] }, note: 'all parts share the pivot at the wire (origin) for the sway animation' },
  };
}
