// Large structures: fire escape, utility pole, rear porch, fences, rooftop equipment.
// Diagonal members (stair stringers, braces, handrails) are separate thin parts rotated into
// place so they stay straight instead of stair-stepping across the voxel grid.
import * as THREE from 'three';
import {
  VB, mat, V, MCLS, VS_FINE, VS_MED, COL, rgbMul, rgbMix, rgbJitter, valueNoise2, valueNoise3, fbm2, clamp,
  recolor, grime, mottle, rust, streaks, chips, vrand, emptyModel, addProp, rot, restPos, lathe, latheX, latheZ,
  torusY, torusZ, TAU, applyPaint, paintFor, projectFace, famSet, variant, xform, readImage, sampleImageArea, textMask,
} from './kit.js';
import { cobraHead } from './lamps.js';

/**
 * Straight bar part between two local points (meters). Cross-section sx x sy voxels; the bar's
 * local axis is +X. Returns a part placed at a with the rotation aligning +X to (b - a).
 * `up` hints which way the cross-section's +Y faces.
 */
function barPart(name, a, b, vs, matSpec, { sx = 1, sy = 1, extend = 0, decorate = null } = {}) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const L = Math.hypot(dx, dy, dz) + extend * 2;
  const n = Math.max(1, Math.round(L / vs));
  const vb = new VB(n, sy, sx, vs, [-extend, -(sy * vs) / 2, -(sx * vs) / 2]);
  const m = vb.P.add('bar', matSpec);
  vb.box(0, 0, 0, n, sy, sx, m);
  if (decorate) decorate(vb, m);
  // rotation: +X -> direction; keep the cross-section "up" close to world up / toward +z
  const dir = new THREE.Vector3(dx, dy, dz).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir);
  const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
  return { name, model: vb.model(), position: a.slice(), rotation: [e.x, e.y, e.z] };
}

const FE_PAINT = { color: [32, 30, 30], rough: 0.72, metal: 0.3, cls: MCLS.METAL_PAINTED, vari: 0.1 };

/**
 * Chicago-style steel fire escape. opts: width (m, 4.4), platformYs (absolute deck heights,
 * default [3.5, 6.8, 10.1]), depth (m, 1.1), dropLadder (bool, true), roofLadder (bool),
 * stairWidth (m, 0.55). Origin: wall surface at ground level, platforms centred on x = 0;
 * extends toward +Z. Model is empty: every level is a part (plus rotated diagonal parts).
 * meta.platforms = [{y, x0, x1, z0, z1}], meta.clearance = lowest steel above ground.
 */
export function fireEscape(rng, opts = {}) {
  const vs = VS_MED;
  const Wm = opts.width ?? 4.4, Dm = opts.depth ?? 1.1;
  const Ys = (opts.platformYs ?? opts.levels ?? [3.5, 6.8, 10.1]).slice().sort((a, b) => a - b);
  const W = Math.round(Wm / vs), D = Math.round(Dm / vs);
  const Ws = Math.round((opts.stairWidth ?? 0.55) / vs);
  const railH = Math.round(1.0 / vs);
  const below = Math.round(0.95 / vs); // bracket depth under the deck
  const parts = [];
  const paintSpec = { ...FE_PAINT, color: rgbJitter(rng, FE_PAINT.color, 0.08) };
  const platforms = [];
  const firstStairRight = rng.chance(0.5);
  const mx = 4; // x margin (voxels) for ladders outside the platform

  for (let i = 0; i < Ys.length; i++) {
    const Y = Ys[i];
    const isTop = i === Ys.length - 1;
    const nextY = isTop ? null : Ys[i + 1];
    const rise = isTop ? 0 : nextY - Y;
    const roofLadder = isTop && (opts.roofLadder ?? true);
    const dropLadder = i === 0 && (opts.dropLadder ?? true);
    const topExtra = isTop ? railH + (roofLadder ? Math.round(1.6 / vs) : 2) : Math.round(rise / vs) + railH + 2;
    const ny = below + topExtra + 2;
    const b = new VB(W + 2 * mx, ny, D + 4, vs, 'corner');
    const P = b.P;
    const steel = P.add('steel', paintSpec);
    const deckY = below; // voxel row of the deck (top surface at deckY + 1)
    const x0 = mx, x1 = mx + W;
    // deck frame: angle iron around the platform
    b.box(x0, deckY - 1, 1, x1, deckY + 1, 2, steel); // wall side ledger
    b.box(x0, deckY - 1, D, x1, deckY + 1, D + 1, steel); // outer edge
    b.box(x0, deckY - 1, 1, x0 + 1, deckY + 1, D + 1, steel);
    b.box(x1 - 1, deckY - 1, 1, x1, deckY + 1, D + 1, steel);
    // cantilever beams (along z) under the deck at the bracket positions
    const bx = [x0 + 3, Math.round((x0 + x1) / 2), x1 - 4];
    for (const x of bx) b.box(x, deckY - 3, 0, x + 1, deckY, D + 1, steel);
    // slat deck: flat bars along x with gaps
    for (let z = 2; z < D; z += 2) b.box(x0 + 1, deckY, z, x1 - 1, deckY + 1, z + 1, steel);
    // stair geometry (from this deck up to the next)
    const stairRight = (i % 2 === 0) === firstStairRight; // stair rises toward +x if true
    let stair = null;
    if (!isTop) {
      const R = Math.round(rise / vs);
      const run = Math.min(W - 16, Math.round(R / 1.45));
      const zs1 = D - 1, zs0 = zs1 - Ws;
      const xTop = stairRight ? x1 - 6 : x0 + 6;
      const xBot = stairRight ? xTop - run : xTop + run;
      stair = { R, run, zs0, zs1, xTop, xBot };
      // treads: two flat bars per step
      const nSteps = Math.max(4, Math.round(rise / 0.2));
      for (let k = 1; k < nSteps; k++) {
        const t = k / nSteps;
        const y = Math.round(deckY + t * R);
        const x = Math.round(xBot + (xTop - xBot) * t);
        b.box(x - 2, y, zs0 + 1, x + 1, y + 1, zs1, steel);
      }
    }
    // opening in this deck where the stair from below arrives
    const prevStairRight = i > 0 ? ((i - 1) % 2 === 0) === firstStairRight : null;
    if (i > 0) {
      const xTopPrev = prevStairRight ? x1 - 6 : x0 + 6;
      const hx0 = prevStairRight ? xTopPrev - 22 : xTopPrev - 1, hx1 = prevStairRight ? xTopPrev + 1 : xTopPrev + 22;
      b.box(Math.max(x0 + 1, hx0), deckY, D - 1 - Ws, Math.min(x1 - 1, hx1), deckY + 1, D, 0);
    }
    // railing: posts, top rail, mid rail, balusters on the outer edge and both ends
    const rTop = deckY + railH;
    const postXs = [x0, x1 - 1];
    for (let x = x0 + 30; x < x1 - 20; x += 30) postXs.push(x);
    for (const x of postXs) b.box(x, deckY, D, x + 1, rTop + 1, D + 1, steel);
    for (const z of [1, D]) {
      b.box(x0, deckY, z, x0 + 1, rTop + 1, z + 1, steel);
      b.box(x1 - 1, deckY, z, x1, rTop + 1, z + 1, steel);
    }
    const railRun = (xa, xb, z) => {
      b.box(xa, rTop, z, xb, rTop + 1, z + 1, steel);
      b.box(xa, rTop - 1, z, xb, rTop, z + 2, steel); // angle flange
      b.box(xa, deckY + 14, z, xb, deckY + 15, z + 1, steel);
    };
    railRun(x0, x1, D);
    for (const x of [x0, x1 - 1]) {
      b.box(x, rTop, 1, x + 1, rTop + 1, D + 1, steel);
      b.box(x, deckY + 14, 1, x + 1, deckY + 15, D + 1, steel);
    }
    // balusters every 4 voxels (~11 cm); gap where the drop ladder passes
    const ladderX = stairRight ? x0 + 8 : x1 - 18;
    for (let x = x0 + 2; x < x1 - 1; x += 4) {
      if (dropLadder && x >= ladderX - 1 && x <= ladderX + 17) continue;
      b.box(x, deckY + 1, D, x + 1, rTop, D + 1, steel);
    }
    for (let z = 3; z < D; z += 4) {
      b.box(x0, deckY + 1, z, x0 + 1, rTop, z + 1, steel);
      b.box(x1 - 1, deckY + 1, z, x1, rTop, z + 1, steel);
    }
    // wall plates where brackets bolt to the masonry
    for (const x of bx) {
      b.box(x - 1, deckY - 2, 0, x + 2, deckY + 1, 1, steel);
      b.box(x - 1, deckY - below + 1, 0, x + 2, deckY - below + 5, 1, steel);
    }
    // drop ladder (stowed: hanging below the platform, sticking up past the railing)
    if (dropLadder) {
      const lx = ladderX, lz = D + 2;
      const lyTop = rTop + Math.round(1.1 / vs);
      for (const rx of [lx, lx + 16]) b.box(rx, 0, lz, rx + 1, Math.min(ny, lyTop), lz + 1, steel);
      for (let y = 4; y < Math.min(ny, lyTop); y += 11) b.box(lx, y, lz, lx + 17, y + 1, lz + 1, steel);
      // guides on the railing + counterweight
      for (const gy of [deckY + 4, rTop - 2]) {
        b.box(lx - 1, gy, D, lx + 2, gy + 1, lz + 2, steel);
        b.box(lx + 15, gy, D, lx + 18, gy + 1, lz + 2, steel);
      }
      b.box(lx + 5, rTop + 6, lz + 1, lx + 12, rTop + 16, lz + 4, steel);
    }
    // gooseneck roof ladder at the top platform
    if (roofLadder) {
      const lx = stairRight ? x1 - 22 : x0 + 6;
      const top = ny - 1;
      for (const rx of [lx, lx + 15]) {
        b.box(rx, deckY + 1, 2, rx + 1, top - 4, 3, steel);
        b.box(rx, top - 4, 1, rx + 1, top, 2, steel);
        b.box(rx, top - 1, 0, rx + 1, top, 1, steel);
      }
      for (let y = deckY + 12; y < top - 4; y += 11) b.box(lx, y, 2, lx + 16, y + 1, 3, steel);
    }
    // weathering: heavy rust (shader also bleeds rust through METAL_PAINTED)
    const seed = rng.int(1, 1e6);
    recolor(b, [steel], (v, x, y, z, n) => {
      const n2 = valueNoise3(x * 0.3, y * 0.3, z * 0.3, seed + 3);
      if (n > 0.64 && n2 > 0.45) return V.rust(P, steel, 0.75);
      if (n > 0.52 && n2 > 0.55) return V.rust(P, steel, 0.6);
      return undefined;
    }, { freq: 0.05, seed });
    const levelPos = [-(W / 2 + mx) * vs, Y - (deckY + 1) * vs, 0];
    parts.push({ name: `level${i}`, model: b.model([0, 0, 0]), position: levelPos });
    const L = (xv, yv, zv) => [levelPos[0] + xv * vs, levelPos[1] + yv * vs, levelPos[2] + zv * vs];
    const rustSpec = { color: [70, 40, 26], rough: 0.9, metal: 0.15, cls: MCLS.RUST, vari: 0.15 };
    const barSpec = (k) => (vrand(i, k, 3, 9) < 0.35 ? rustSpec : paintSpec);
    // diagonal knee braces from the wall up to the outer edge
    bx.forEach((x, k) => {
      parts.push(barPart(`brace${i}_${k}`, L(x + 0.5, deckY - below + 3, 0.6), L(x + 0.5, deckY - 1.5, D - 0.5), vs, barSpec(k), { sx: 1, sy: 2 }));
    });
    // stair stringers + sloped handrail
    if (stair) {
      const { R, zs0, zs1, xTop, xBot } = stair;
      const yb = deckY + 0.5, yt = deckY + R + 0.5;
      for (const [k, z] of [[0, zs0 + 0.5], [1, zs1 + 0.5]]) parts.push(barPart(`stringer${i}_${k}`, L(xBot, yb - 1, z), L(xTop, yt - 1, z), vs, barSpec(k + 5), { sx: 1, sy: 3, extend: vs * 2 }));
      parts.push(barPart(`handrail${i}`, L(xBot, yb + railH * 0.85, zs1 + 1.5), L(xTop, yt + railH * 0.85, zs1 + 1.5), vs, paintSpec, { sx: 1, sy: 1 }));
      parts.push(barPart(`handpost${i}`, L(xBot, yb, zs1 + 1.5), L(xBot, yb + railH * 0.85, zs1 + 1.5), vs, paintSpec, { sx: 1, sy: 1 }));
    }
    platforms.push({ y: Y, x0: -Wm / 2, x1: Wm / 2, z0: 0, z1: Dm });
  }
  return {
    model: emptyModel(vs),
    parts,
    meta: {
      size: [Wm + 0.25, Ys[Ys.length - 1] + 2.7, Dm + 0.15], mount: 'wall', kind: 'fireEscape', platforms,
      clearance: +(Ys[0] - 0.95).toFixed(2), anchors: { dropLadderBottom: [0, Ys[0] - 0.95, Dm + 0.06] },
    },
  };
}

// ───────────────────────────── utility pole ─────────────────────────────

const WOOD_POLE = [[104, 92, 78], [96, 86, 74], [112, 100, 84], [88, 78, 66]];

/** One vertical stave of the pole shaft (thin voxel slab), with cracks, stains, staples. */
function poleStave(rng, k, n, H, chordVox, vs, base, img, paintH) {
  const w = Math.max(2, Math.ceil(chordVox) + 1);
  const b = new VB(w, H, 1, vs, [-(w * vs) / 2, 0, -vs / 2]);
  const P = b.P;
  const wood = mat.wood(P, 'wood', rgbJitter(rng, base, 0.04), { rough: 0.88, vari: 0.12 });
  const crack = mat.wood(P, 'crack', rgbMul(base, 0.72));
  const creo = mat.wood(P, 'creosote', [52, 42, 32], { rough: 0.7 });
  const staple = mat.steel(P, 'staple', [120, 118, 112], { metal: 0.8 });
  const paper = mat.paper(P, 'paper', [200, 196, 184]);
  const seed = rng.int(1, 1e6);
  const creoH = Math.round(rng.range(1.2, 2.2) / vs);
  b.box(0, 0, 0, w, H, 1, wood);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < w; x++) {
      const u = (k + (x + 0.5) / w) / n;
      // creosote-dark butt with a ragged top edge
      if (y < creoH + valueNoise2(u * 40, 0, seed) * 14) b.set(x, y, 0, creo);
      // long vertical checks (cracks)
      const c = valueNoise2(u * 90, y * 0.012, seed + 1);
      if (c > 0.86 && x === Math.floor(w / 2) && (k % 3 === 0)) b.set(x, y, 0, crack);
      // staples and paper remnants on the lower part (flyers)
      if (y > 24 && y < 110) {
        const r = vrand(x, y, k, seed);
        if (r < 0.012) b.set(x, y, 0, staple);
        else if (r < 0.02 && valueNoise2(u * 30, y * 0.08, seed + 2) > 0.6) b.set(x, y, 0, paper);
      }
    }
  // painted graffiti wrapped around the lower part (canvas u = angle, v = height / paintH)
  if (img) {
    for (let y = 0; y < Math.min(H, paintH); y++)
      for (let x = 0; x < w; x++) {
        const u = (k + (x + 0.5) / w) / n;
        const s = sampleImageArea(img, u, (y + 0.5) / paintH, 1 / (n * w), 1 / paintH);
        if (s[3] < 0.35) continue;
        const cur = P.entries[b.get(x, y, 0)];
        const c = [0, 1, 2].map((i) => Math.round((cur.color[i] + (s[i] - cur.color[i]) * Math.min(1, s[3] * 1.2)) / 12) * 12);
        b.set(x, y, 0, P.color(c, { name: 'paint', rough: 0.6, metal: 0, cls: MCLS.GENERIC, vari: 0.05 }));
      }
  }
  return b.model();
}

/** Grey pole-mount transformer can with lid, bushings, hanger bracket. Origin: back centre at the pole surface, bottom. */
function transformerCan(rng, vs) {
  const R = 9.5, H = 30;
  const n = Math.ceil(R * 2 + 4);
  const b = new VB(n, H + 8, n + 4, vs, [-(n * vs) / 2, 0, 0]);
  const P = b.P;
  const grey = mat.paint(P, 'can', rgbJitter(rng, [118, 124, 122], 0.04), { cls: MCLS.GENERIC, rough: 0.5, metal: 0.45 });
  const porcelain = mat.generic(P, 'porcelain', rng.pick([[110, 64, 44], [150, 150, 146]]), { rough: 0.2, vari: 0.04 });
  const steel = mat.steel(P, 'bracket', [70, 70, 68]);
  const cx = n / 2, cz = 4 + R;
  lathe(b, cx, cz, 0, H, (y) => [R - (y < 1 ? 0.6 : 0), -1], grey);
  lathe(b, cx, cz, H, H + 2, () => [R + 0.6, -1], grey);
  lathe(b, cx, cz, H + 2, H + 3, () => [R - 2, -1], grey);
  // cooling ribs (colour bands)
  // hanger bracket to the pole
  b.box(Math.round(cx - 4), Math.round(H * 0.25), 0, Math.round(cx + 4), Math.round(H * 0.25) + 2, 5, steel);
  b.box(Math.round(cx - 4), Math.round(H * 0.8), 0, Math.round(cx + 4), Math.round(H * 0.8) + 2, 5, steel);
  b.box(Math.round(cx - 1), Math.round(H * 0.25), 0, Math.round(cx + 1), Math.round(H * 0.8) + 2, 2, steel);
  // bushings on the lid
  for (const dx of [-4, 4]) {
    for (let y = H + 3; y < H + 8; y++) b.g.cylY(cx + dx, cz - 2, y % 2 ? 1.6 : 1.1, y, y + 1, porcelain);
  }
  streaks(b, rng, [grey], { count: 5, len: [4, 18], kind: 'rust', t: 0.35 });
  grime(b, [grey], { h: 6, amount: 0.4, seed: 3 });
  return b.model();
}

/** Pin-type insulator stack (glass or porcelain). */
function insulator(rng, vs, kind) {
  const b = new VB(5, 5, 5, vs, [-2.5 * vs, 0, -2.5 * vs]);
  const m = kind === 'glass' ? mat.glass(b.P, 'glass', rgbJitter(rng, [110, 150, 136], 0.06)) : mat.generic(b.P, 'porc', rng.pick([[120, 66, 42], [170, 168, 160]]), { rough: 0.2 });
  b.box(2, 0, 2, 3, 2, 3, mat.steel(b.P, 'pin', [70, 70, 70]));
  lathe(b, 2.5, 2.5, 2, 5, (y) => [y < 3 ? 2.4 : 1.6, -1], m);
  return b.model();
}

/**
 * Wooden utility pole (alley). opts: height (m, 11-12), transformers (0-3), crossarms (count, 1-2),
 * streetlight null|'cobra' (with streetlightY, reach), meterBox (bool), guy (bool), paint (canvas,
 * wraps around the lower 2.6 m). Local frame: wires run along X; +Z faces the alley centre (the
 * streetlight arm points to +Z). Origin: pole base centre at ground.
 * meta.anchors: wires (list of attachment points), streetlight light + lightDir, guy attach.
 */
export function utilityPole(rng, opts = {}) {
  const vs = VS_MED;
  const Hm = opts.height ?? rng.range(11, 12);
  const H = Math.round(Hm / vs);
  const rBase = (opts.baseDia ?? 0.32) / 2, rTop = (opts.topDia ?? 0.22) / 2;
  const nSt = 12;
  const parts = [];
  const base = rng.pick(WOOD_POLE);
  const img = opts.paint ? readImage(paintFor(opts.paint, 'front') ?? opts.paint) : null;
  const paintH = Math.round(2.6 / vs);
  const taper = Math.atan2(rBase - rTop, Hm);
  for (let k = 0; k < nSt; k++) {
    const a = ((k + 0.5) / nSt) * TAU;
    const apo = ((rBase + rTop) / 2) * Math.cos(Math.PI / nSt);
    const chord = (2 * rBase * Math.sin(Math.PI / nSt)) / vs;
    const m = poleStave(rng.fork(`st${k}`), k, nSt, H, chord, vs, base, img, paintH);
    // stave faces outward along (sin a, 0, cos a); lean inward for the taper
    const r = rot(['x', -taper], ['y', a]);
    const rb = rBase * Math.cos(Math.PI / nSt) - vs / 2;
    parts.push({ name: `stave${k}`, model: m, position: [Math.sin(a) * rb, 0, Math.cos(a) * rb], rotation: r });
    void apo;
  }
  const rAt = (y) => rBase + (rTop - rBase) * (y / Hm);
  // inner core (fills the hollow shaft for the top cap and to hide gaps)
  const core = new VB(Math.ceil((rTop * 2) / vs), 2, Math.ceil((rTop * 2) / vs), vs, 'floor');
  core.box(0, 0, 0, core.nx, 2, core.nz, mat.wood(core.P, 'top', rgbMul(base, 0.8)));
  parts.push({ name: 'cap', model: core.model(), position: [0, Hm - 0.02, 0], rotation: [0, 0, 0] });

  const anchors = { wires: [] };
  const hwSpec = { color: [96, 98, 96], rough: 0.5, metal: 0.7, cls: MCLS.GENERIC, vari: 0.06 };
  // crossarms (along X, wires run along X? no: arms span X; conductors attach on top)
  const nArms = opts.crossarms ?? rng.int(1, 2);
  for (let i = 0; i < nArms; i++) {
    const y = Hm - 0.35 - i * 0.75;
    const L = rng.range(2.0, 2.45);
    const ab = new VB(Math.round(L / vs), 4, 3, vs, [-(L / 2), -2 * vs, -1.5 * vs]);
    const armWood = mat.wood(ab.P, 'arm', rgbJitter(rng, [96, 86, 74], 0.05));
    ab.box(0, 0, 0, ab.nx, 4, 3, armWood);
    recolor(ab, [armWood], (v, x, yy, z, n) => (n > 0.66 ? V.dark(ab.P, armWood, 0.7) : undefined), { freq: 0.1, seed: rng.int(1, 1e5) });
    const zOff = rAt(y) + 1.5 * vs;
    const side = i % 2 === 0 ? 1 : -1;
    parts.push({ name: `crossarm${i}`, model: ab.model(), position: [0, y, side * zOff], rotation: [0, rng.range(-0.02, 0.02), rng.range(-0.025, 0.025)] });
    // diagonal braces from the arm to the pole
    for (const sx of [-1, 1]) parts.push(barPart(`armbrace${i}${sx}`, [sx * 0.55, y - 0.04, side * (zOff)], [0, y - 0.55, side * (rAt(y) + vs / 2)], vs, hwSpec, { sx: 1, sy: 1 }));
    // insulators
    const kind = rng.pick(['glass', 'porcelain']);
    const xs = [-L / 2 + 0.12, -0.35, 0.35, L / 2 - 0.12];
    for (const [j, x] of xs.entries()) {
      if (rng.chance(0.15)) continue;
      parts.push({ name: `ins${i}_${j}`, model: insulator(rng, VS_FINE, kind), position: [x, y + 2 * vs, side * zOff], rotation: [0, 0, 0] });
      anchors.wires.push([+x.toFixed(3), +(y + 2 * vs + 4 * VS_FINE).toFixed(3), +(side * zOff).toFixed(3)]);
    }
  }
  // secondary rack: spool insulators on a vertical bracket lower down (service drops)
  const rackY = Hm - 2.2 - rng.range(0, 0.6);
  const rk = new VB(3, Math.round(0.9 / vs), 5, vs, [-1.5 * vs, 0, 0]);
  const rkM = rk.P.add('rack', hwSpec);
  const spool = mat.generic(rk.P, 'spool', [150, 146, 136], { rough: 0.25 });
  rk.box(1, 0, 0, 2, rk.ny, 1, rkM);
  for (let y = 2; y < rk.ny - 2; y += 9) {
    rk.box(0, y, 1, 3, y + 3, 4, spool);
    rk.box(1, y - 1, 0, 2, y + 4, 4, rkM);
    anchors.wires.push([0, +(rackY + (y + 1.5) * vs).toFixed(3), +(rAt(rackY) + 3 * vs).toFixed(3)]);
  }
  parts.push({ name: 'rack', model: rk.model(), position: [0, rackY, rAt(rackY)], rotation: [0, 0, 0] });
  // transformers
  const nT = clamp(opts.transformers ?? rng.int(0, 2), 0, 3);
  const tY = Hm - rng.range(2.6, 3.2);
  const tAngles = [Math.PI / 2, -Math.PI / 2, Math.PI].slice(0, nT);
  tAngles.forEach((a, i) => {
    const m = transformerCan(rng.fork(`t${i}`), vs);
    const rr = rAt(tY);
    parts.push({ name: `transformer${i}`, model: m, position: [Math.sin(a) * rr, tY - i * 0.05, Math.cos(a) * rr], rotation: [0, a, 0] });
    // cutout fuse on the arm + drop lead
    parts.push(barPart(`lead${i}`, [Math.sin(a) * (rr + 0.25), tY + 0.95, Math.cos(a) * (rr + 0.25)], [Math.sin(a) * 0.5, Hm - 0.35, 0.1], VS_FINE, { color: [30, 30, 30], rough: 0.5, metal: 0, cls: MCLS.WIRE, vari: 0.02 }, { sx: 1, sy: 1 }));
  });
  // ground wire molding running down the pole (on the -Z side, facing the wall)
  const gm = new VB(2, Math.round((Hm - 0.6) / vs), 2, vs, [-vs, 0, 0]);
  gm.box(0, 0, 0, 2, gm.ny, 2, mat.wood(gm.P, 'molding', [80, 74, 64]));
  parts.push({ name: 'groundMolding', model: gm.model(), position: [0, 0, -rBase + vs * 0.2], rotation: rot(['x', taper], ['y', Math.PI]) });
  // pole steps (alternating), from ~2.4 m up
  const stepSpec = { color: [126, 128, 124], rough: 0.4, metal: 0.8, cls: MCLS.GENERIC, vari: 0.05 };
  for (let y = rng.range(2.3, 2.6), k = 0; y < Hm - 1.2; y += 0.46, k++) {
    const a = k % 2 ? Math.PI / 2 + 0.25 : -Math.PI / 2 - 0.25;
    const r0 = rAt(y);
    parts.push(barPart(`step${k}`, [Math.sin(a) * (r0 - 0.02), y, Math.cos(a) * (r0 - 0.02)], [Math.sin(a) * (r0 + 0.15), y + 0.02, Math.cos(a) * (r0 + 0.15)], VS_FINE, stepSpec, { sx: 1, sy: 1 }));
  }
  // aluminium ID tags around 1.8 m
  const tg = new VB(6, 4, 1, VS_FINE, [-3 * VS_FINE, 0, 0]);
  const tagM = mat.galv(tg.P, 'tag', [176, 178, 176]);
  const tagInk = mat.generic(tg.P, 'ink', [40, 40, 40]);
  tg.box(0, 0, 0, 6, 4, 1, tagM);
  for (let x = 1; x < 5; x++) if (vrand(x, 2, 0, 3) < 0.7) tg.set(x, 2, 0, tagInk);
  const ta = rng.range(-0.6, 0.6);
  parts.push({ name: 'tag', model: tg.model(), position: [Math.sin(ta) * rBase, rng.range(1.7, 2.0), Math.cos(ta) * rBase], rotation: [0, ta, 0] });
  // meter box with conduit
  if (opts.meterBox) {
    const mb = new VB(10, 14, 6, vs, [-5 * vs, 0, 0]);
    const grey = mat.paint(mb.P, 'box', [120, 122, 120], { cls: MCLS.GENERIC, metal: 0.4, rough: 0.5 });
    mb.box(0, 0, 0, 10, 14, 6, grey);
    mb.box(4, 14, 1, 6, 14, 3, grey);
    streaks(mb, rng, [grey], { count: 3, len: [3, 9], kind: 'rust' });
    parts.push({ name: 'meterBox', model: mb.model(), position: [0, 1.45, rBase - 0.01], rotation: [0, 0, 0] });
    parts.push(barPart('meterConduit', [0, 1.45 + 14 * vs, rBase + 2 * vs], [0, rackY, rBase + 2 * vs], vs, { color: [150, 150, 148], rough: 0.45, metal: 0.7, cls: MCLS.GENERIC, vari: 0.05 }, { sx: 1, sy: 1 }));
  }
  // guy wire attachment (eye bolt); the guy itself goes to an anchor outside the prop
  anchors.guy = [0, +(Hm - 0.9).toFixed(3), -rTop];
  // streetlight
  if (opts.streetlight === 'cobra' || opts.streetlight === true) {
    const sy = opts.streetlightY ?? Math.min(Hm - 3.2, 7.6);
    const sl = cobraHead(rng.fork('cobra'), { reach: opts.reach ?? 1.4 });
    const pos = [0, sy, rAt(sy)];
    addProp(parts, 'cobra', sl, pos, [0, 0, 0]);
    anchors.light = [sl.meta.anchors.light[0], sl.meta.anchors.light[1] + sy, sl.meta.anchors.light[2] + rAt(sy)];
    anchors.lightDir = [0, -1, 0];
  }
  return {
    model: emptyModel(vs),
    parts,
    meta: { size: [2.5, Hm, 2.0], footprint: [rBase * 2, rBase * 2], mount: 'floor', kind: 'utilityPole', anchors, lightColor: 0xff9440, paintSurfaces: { wrap: { w: +(TAU * rBase).toFixed(3), h: 2.6, periodicX: true } } },
  };
}

// ───────────────────────────── wooden rear porch ─────────────────────────────

/** Axis-aligned board/beam part with its own palette; origin at its min corner unless given. */
function lumber(name, sx, sy, sz, vs, spec, pos, { origin = null, decorate = null, rotation = [0, 0, 0] } = {}) {
  const b = new VB(Math.max(1, Math.round(sx)), Math.max(1, Math.round(sy)), Math.max(1, Math.round(sz)), vs, origin ?? [0, 0, 0]);
  const m = b.P.add('wood', spec);
  b.box(0, 0, 0, b.nx, b.ny, b.nz, m);
  if (decorate) decorate(b, m);
  return { name, model: b.model(), position: pos, rotation };
}

/**
 * Chicago-style wooden back porch: posts, beams, joists, plank decks, railings with balusters,
 * switchback stairs between levels and down to the ground; weathered grey paint.
 * opts: width (m, 5), depth (m, 2.6), levels (deck heights, default [1.2, 4.3, 7.4]),
 * stairSide 'left'|'right'. Origin: wall surface at ground, centred on x; extends +Z.
 */
export function rearPorch(rng, opts = {}) {
  const vs = VS_MED;
  const Wm = opts.width ?? 5.0, Dm = opts.depth ?? 2.6;
  const levels = (opts.levels ?? [1.2, 4.3, 7.4]).slice().sort((a, b) => a - b);
  const W = Math.round(Wm / vs), D = Math.round(Dm / vs);
  const parts = [];
  const paintC = rgbJitter(rng, rng.pick([[150, 148, 142], [136, 134, 128], [120, 112, 100], [96, 100, 92]]), 0.04);
  const bare = [118, 108, 94];
  const spec = (k, tone = 1) => {
    const r = vrand(k, 7, 3, 11);
    const c = r < 0.25 ? rgbMix(bare, paintC, 0.3) : r < 0.32 ? [154, 138, 104] : rgbMul(paintC, tone * (0.94 + 0.12 * vrand(k, 1, 2, 3)));
    return { color: c, rough: 0.85, metal: 0, cls: MCLS.WOOD, vari: 0.1 };
  };
  const x0 = -Wm / 2;
  const railH = 0.95, postS = 4;
  const stairW = Math.round(0.95 / vs);
  const stairRightFirst = (opts.stairSide ?? rng.pick(['left', 'right'])) === 'right';
  const topY = levels[levels.length - 1] + railH + 0.1;
  // posts at the front corners + middle, full height
  const postXs = [0, W - postS];
  if (W > 140) postXs.push(Math.round(W / 2 - postS / 2));
  postXs.forEach((px, i) => parts.push(lumber(`post${i}`, postS, Math.round(topY / vs), postS, vs, spec(100 + i), [x0 + px * vs, 0, (D - postS) * vs], {
    decorate: (b, m) => {
      // rot and dirt at the bottom
      b.box(0, 0, 0, b.nx, 6, b.nz, b.P.add('rot', { color: [70, 62, 52], rough: 0.95, cls: MCLS.WOOD, vari: 0.15 }));
    },
  })));
  levels.forEach((Y, li) => {
    // beams (front + mid), ledger at the wall
    parts.push(lumber(`beam${li}`, W, 9, 3, vs, spec(200 + li, 0.9), [x0, Y - 0.27, (D - 3) * vs]));
    parts.push(lumber(`ledger${li}`, W, 8, 2, vs, spec(210 + li, 0.85), [x0, Y - 0.25, 0]));
    // joists along z
    for (let x = 2, k = 0; x < W - 2; x += 15, k++) parts.push(lumber(`joist${li}_${k}`, 2, 7, D - 3, vs, spec(300 + k, 0.88), [x0 + x * vs, Y - 0.22, 2 * vs]));
    // deck boards along x with seams; hole for the stair arriving from below
    const stairRight = (li % 2 === 0) === stairRightFirst;
    const deck = new VB(W, 1, D, vs, [0, 0, 0]);
    const boards = [];
    for (let k = 0; k < Math.ceil(D / 5); k++) boards.push(deck.P.add(`b${k}`, spec(400 + li * 50 + k)));
    const seam = deck.P.add('seam', { color: rgbMul(paintC, 0.55), rough: 0.9, cls: MCLS.WOOD, vari: 0.1 });
    for (let z = 0; z < D; z++) {
      const k = Math.floor(z / 5);
      for (let x = 0; x < W; x++) {
        if (li > 0) {
          const prevRight = ((li - 1) % 2 === 0) === stairRightFirst;
          const hx0 = prevRight ? W - stairW - 26 : 0, hx1 = prevRight ? W : stairW + 26;
          if (z >= D - stairW - 4 && z < D - 4 && x >= hx0 && x < hx1 && x >= postS && x < W - postS) continue;
        }
        if (vrand(x, k, li, 5) < 0.0015 * 5 && z % 5 === 2) continue; // missing knots
        deck.set(x, 0, z, z % 5 === 4 ? seam : boards[k]);
      }
    }
    // a missing / broken board
    if (rng.chance(0.4)) {
      const k = rng.int(1, Math.floor(D / 5) - 2), xa = rng.int(10, W - 40);
      deck.box(xa, 0, k * 5, xa + rng.int(12, 30), 1, k * 5 + 4, 0);
    }
    parts.push({ name: `deck${li}`, model: deck.model(), position: [x0, Y, 0], rotation: [0, 0, 0] });
    // railings: front + the side away from the wall stair opening
    const rail = (name, len, axis, pos) => {
      const n = Math.round(len / vs);
      const rb = axis === 'x' ? new VB(n, Math.round(railH / vs) + 1, 3, vs, [0, 0, 0]) : new VB(3, Math.round(railH / vs) + 1, n, vs, [0, 0, 0]);
      const m = rb.P.add('rail', spec(500 + li + name.length));
      const top = rb.ny - 1;
      if (axis === 'x') {
        rb.box(0, top - 1, 0, n, top + 1, 3, m);
        rb.box(0, 3, 1, n, 5, 2, m);
        for (let x = 1; x < n; x += 4) if (vrand(x, li, 1, 7) > 0.05) rb.box(x, 5, 1, x + 1, top - 1, 2, m);
      } else {
        rb.box(0, top - 1, 0, 3, top + 1, n, m);
        rb.box(1, 3, 0, 2, 5, n, m);
        for (let z = 1; z < n; z += 4) if (vrand(z, li, 2, 7) > 0.05) rb.box(1, 5, z, 2, top - 1, z + 1, m);
      }
      parts.push({ name, model: rb.model(), position: pos, rotation: [0, 0, 0] });
    };
    rail(`railF${li}`, Wm, 'x', [x0, Y + vs, (D - 2) * vs]);
    if (!(li === levels.length - 1)) {
      // side rails on both ends except where the stair leaves this deck
    }
    rail(`railL${li}`, Dm - 0.1, 'z', [x0, Y + vs, 0.05]);
    rail(`railR${li}`, Dm - 0.1, 'z', [x0 + (W - 3) * vs, Y + vs, 0.05]);
    // stair from this deck up to the next (or from the ground to the first deck)
    const flights = [];
    if (li === 0) flights.push({ y0: 0, y1: Y, right: !stairRightFirst, ground: true });
    if (li < levels.length - 1) flights.push({ y0: Y, y1: levels[li + 1], right: stairRight });
    for (const f of flights) {
      const R = f.y1 - f.y0;
      const nSteps = Math.max(2, Math.round(R / 0.19));
      const run = (nSteps - 1) * 0.25;
      const zs1 = Dm - 0.1, zs0 = zs1 - stairW * vs;
      const xTop = f.right ? Wm / 2 - postS * vs - 0.05 : -Wm / 2 + postS * vs + 0.05;
      const xBot = f.right ? xTop - run : xTop + run;
      const tread = new VB(Math.round(Math.abs(run) / vs) + 12, Math.round(R / vs) + 2, stairW, vs, [0, 0, 0]);
      const tm = tread.P.add('tread', spec(600 + li));
      const ox = Math.min(xTop, xBot) - 4 * vs;
      for (let k = 0; k < nSteps; k++) {
        const t = (k + 1) / nSteps;
        const y = Math.round((t * R) / vs) - 1;
        const x = Math.round((xBot + (xTop - xBot) * ((k + 0.5) / nSteps) - ox) / vs);
        tread.box(x - 4, y, 0, x + 5, y + 1, stairW, tm);
      }
      parts.push({ name: `treads${li}${f.ground ? 'g' : ''}`, model: tread.model(), position: [ox, f.y0, zs0], rotation: [0, 0, 0] });
      const sspec = spec(700 + li, 0.9);
      for (const [k, z] of [[0, zs0], [1, zs1 - 2 * vs]]) parts.push(barPart(`stringer${li}${f.ground ? 'g' : ''}${k}`, [xBot, f.y0 + 0.02, z + vs], [xTop, f.y1 - 0.08, z + vs], vs, sspec, { sx: 2, sy: 9, extend: vs * 3 }));
      parts.push(barPart(`handrail${li}${f.ground ? 'g' : ''}`, [xBot, f.y0 + railH * 0.9, zs1 + vs], [xTop, f.y1 + railH * 0.9, zs1 + vs], vs, spec(800 + li), { sx: 2, sy: 2 }));
    }
  });
  return {
    model: emptyModel(vs),
    parts,
    meta: { size: [Wm, topY, Dm], footprint: [Wm, Dm], mount: 'wall', kind: 'rearPorch', levels, anchors: { decks: levels.map((y) => [0, y + vs, Dm / 2]) } },
  };
}

// ───────────────────────────── fences ─────────────────────────────

/**
 * Tall wooden board fence. opts: length (m, 6), height (m, 1.9), gate (bool), paint (canvas ->
 * front face). Runs along X centred on the origin (ground); boards face +Z, rails/posts behind.
 */
export function woodFence(rng, opts = {}) {
  const vs = VS_MED;
  const Lm = opts.length ?? 6, Hm = opts.height ?? rng.range(1.8, 2.2);
  const L = Math.round(Lm / vs), H = Math.round(Hm / vs);
  const b = new VB(L, H + 3, 8, vs, 'floor');
  const P = b.P;
  const base = rgbJitter(rng, rng.pick([[118, 110, 98], [104, 96, 84], [132, 120, 100], [96, 88, 76]]), 0.05);
  const postM = mat.wood(P, 'post', rgbMul(base, 0.85));
  const railM = mat.wood(P, 'rail', rgbMul(base, 0.9));
  const boardMs = Array.from({ length: 6 }, (_, k) => mat.wood(P, `board${k}`, rgbJitter(rng, rgbMul(base, 0.9 + 0.04 * k), 0.05, 0.03)));
  const moss = mat.organic(P, 'moss', [62, 70, 44]);
  const parts = [];
  const gate = opts.gate ?? rng.chance(0.3);
  const gateX0 = gate ? Math.round(L * rng.range(0.25, 0.6)) : -1, gateW = Math.round(1.0 / vs);
  // posts every ~2.4 m
  for (let x = 0; x < L; x += Math.round(2.4 / vs)) b.box(Math.min(L - 4, x), 0, 0, Math.min(L, x + 4), H + 2, 4, postM);
  b.box(L - 4, 0, 0, L, H + 2, 4, postM);
  // rails
  for (const ry of [8, H - 10]) b.box(0, ry, 2, L, ry + 3, 5, railM);
  // boards (14 cm wide, butted), varied heights, some missing / broken
  const bw = 5;
  for (let x = 0; x < L; x += bw) {
    if (gate && x >= gateX0 && x < gateX0 + gateW) continue;
    const r = vrand(x, 0, 1, rng.int(0, 1e6));
    if (r < 0.06) continue; // missing board
    const m = boardMs[Math.floor(vrand(x, 2, 3, 4) * 6)];
    const top = H + (vrand(x, 3, 4, 5) < 0.5 ? 0 : -1) - (r < 0.1 ? rng.int(8, 30) : 0); // broken short board
    b.box(x, 1, 5, Math.min(L, x + bw - (vrand(x, 1, 1, 1) < 0.3 ? 1 : 0)), top, 6, m);
    // dog-ear top
    b.set(x, top - 1, 5, 0);
    b.set(Math.min(L - 1, x + bw - 1), top - 1, 5, 0);
  }
  // leaning board as a part
  if (rng.chance(0.5)) {
    const lb = new VB(bw, H - 4, 1, vs, [0, 0, 0]);
    lb.box(0, 0, 0, bw, H - 4, 1, lb.P.add('board', { ...P.entries[boardMs[0]] }));
    parts.push({ name: 'looseBoard', model: lb.model(), position: [b.mx(rng.int(10, L - 10)), 0, 0.2], rotation: [-0.25, 0, rng.range(-0.1, 0.1)] });
  }
  // weathering: dark wet bottom, moss, streaks
  const seed = rng.int(1, 1e5);
  recolor(b, null, (v, x, y, z, n) => {
    if (y < 4 + n * 8) return n > 0.6 && y < 4 ? moss : V.dark(P, v, 0.65);
    const s = valueNoise2(x * 0.3, y * 0.015, seed);
    if (s > 0.7) return V.dark(P, v, 0.78);
    return undefined;
  }, { freq: 0.06, seed });
  const src = paintFor(opts.paint, 'front');
  if (src) applyPaint(b, src, '+z', { u0: 0, v0: 1, u1: L, v1: H }, { depthLimit: 2 });
  if (gate) {
    const gb = new VB(gateW, H - 2, 3, vs, [0, 0, 0]);
    const gm = gb.P.add('gate', { ...P.entries[boardMs[2]] });
    const gr = gb.P.add('rail', { ...P.entries[railM] });
    const hw = mat.steel(gb.P, 'hinge', [50, 46, 42]);
    for (let x = 0; x < gateW; x += bw) gb.box(x, 0, 2, Math.min(gateW, x + bw - (x % 2 ? 1 : 0)), H - 2, 3, gm);
    gb.box(0, 6, 0, gateW, 9, 2, gr);
    gb.box(0, H - 14, 0, gateW, H - 11, 2, gr);
    gb.line(1, 8, 1, gateW - 2, H - 13, 1, 1.0, gr);
    gb.box(gateW - 3, 40, 3, gateW - 1, 44, 4, hw);
    for (const y of [8, H - 12]) gb.box(0, y, 3, 6, y + 1, 4, hw);
    const ajar = rng.chance(0.4) ? rng.range(0.2, 0.9) : 0;
    parts.push({ name: 'gate', model: gb.model(), position: [b.mx(gateX0), 0.02, 3 * vs], rotation: [0, -ajar, 0] });
  }
  return {
    model: b.model(),
    parts,
    meta: { size: [Lm, Hm, 8 * vs], footprint: [Lm, 8 * vs], mount: 'floor', kind: 'woodFence', paintSurfaces: { front: { w: Lm, h: Hm, face: '+z' } }, gate: gate ? { x0: b.mx(gateX0), x1: b.mx(gateX0 + gateW) } : null },
  };
}
