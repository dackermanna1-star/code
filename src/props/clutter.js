// Alley clutter: cardboard boxes, flattened cardboard, pallets, mattresses.
import {
  VB, mat, V, MCLS, VS_FINE, VS_MED, COL, rgbMul, rgbMix, rgbJitter, valueNoise2, valueNoise3, fbm2, clamp,
  recolor, grime, mottle, vrand, emptyModel, addProp, xform, eachSurface, F_PY, textMask, rot, restPos, rotatedBounds,
} from './kit.js';
import { cardboardSheet } from './sheets.js';

// ───────────────────────────── cardboard ─────────────────────────────

const BOX_SIZES = {
  small: [0.3, 0.22, 0.25],
  medium: [0.46, 0.33, 0.36],
  large: [0.6, 0.45, 0.46],
  long: [0.92, 0.26, 0.36],
  produce: [0.5, 0.25, 0.38],
};

/** Flat flap plate (part). Hinge along x at origin; extends +z; thickness +y. */
function flapModel(w, l, vs, colorMat) {
  const b = new VB(Math.max(1, Math.round(w / vs)), 1, Math.max(1, Math.round(l / vs)), vs, [-(Math.round(w / vs) * vs) / 2, 0, 0]);
  const m = b.P.add('flap', colorMat);
  b.box(0, 0, 0, b.nx, 1, b.nz, m);
  // ragged far edge
  for (let x = 0; x < b.nx; x++) if (vrand(x, 0, 0, 77) < 0.25) b.set(x, 0, b.nz - 1, 0);
  return b.model();
}

/**
 * Corrugated cardboard box. opts: size 'small'|'medium'|'large'|'long'|'produce' or [w,h,d],
 * flaps 'closed'|'open'|'torn', wet 0..1, collapsed 0..1 (sag / bulge / shear), print bool.
 * Origin: footprint centre at ground.
 */
export function cardboardBox(rng, opts = {}) {
  const vs = opts.vs ?? VS_FINE;
  const sz = Array.isArray(opts.size) ? opts.size : BOX_SIZES[opts.size ?? rng.weighted(['small', 'medium', 'large', 'long', 'produce'], [2, 4, 2, 1, 1])];
  const [Wm, Hm, Dm] = sz.map((v) => v * rng.range(0.92, 1.08));
  const flaps = opts.flaps ?? rng.weighted(['closed', 'open', 'torn'], [3, 4, 1.5]);
  const collapsed = opts.collapsed ?? (rng.chance(0.3) ? rng.range(0.3, 1) : 0);
  const wet = opts.wet ?? (collapsed > 0.4 ? rng.range(0.4, 1) : rng.range(0, 0.5));
  const W = Math.round(Wm / vs), H = Math.round(Hm / vs), D = Math.round(Dm / vs);
  const bulge = collapsed * Math.min(W, D) * 0.07, shear = collapsed * rng.range(-0.15, 0.15) * H, sag = collapsed * H * 0.35;
  const pad = Math.ceil(bulge + Math.abs(shear)) + 2;
  const b = new VB(W + 2 * pad, H + 2, D + 2 * pad, vs, 'floor');
  const P = b.P;
  const kraft = opts.color ?? (rng.chance(0.12) ? [190, 182, 160] : rgbJitter(rng, COL.cardboard, 0.08, 0.02));
  const board = mat.cardboard(P, 'board', kraft);
  const edge = mat.cardboard(P, 'edge', rgbMul(kraft, 0.82));
  const wetC = mat.cardboard(P, 'wet', rgbMul(rgbMix(kraft, [92, 66, 44], 0.45), 0.82), { rough: 0.62 });
  const tapeC = mat.plastic(P, 'tape', rng.pick([[170, 132, 84], [190, 186, 176], [160, 120, 70]]), { rough: 0.3 });
  const inkC = mat.cardboard(P, 'ink', rng.pick([[40, 40, 44], [118, 40, 34], [36, 60, 104], [60, 92, 50]]), { vari: 0.05 });
  const labelC = mat.paper(P, 'label', [214, 210, 198]);
  const x0 = pad, z0 = pad;
  const seed = rng.int(1, 1e6);
  const crush = collapsed > 0.5 ? (collapsed - 0.5) * 2 : 0;
  const cdir = [rng.sign(), rng.sign()];
  const yTop = (x, z) => {
    if (!sag) return H;
    const u = (x + 0.5 - x0) / W * 2 - 1, w = (z + 0.5 - z0) / D * 2 - 1;
    // crushed corner: the top drops toward one corner
    const c = Math.max(0, (u * cdir[0] + w * cdir[1]) * 0.5 + 0.2);
    return H - (closed ? sag * (1 - u * u) * (1 - w * w) : 0) - crush * H * 0.42 * c - (fbm2(x * 0.1, z * 0.1, 2, seed) - 0.5) * collapsed * 3;
  };
  const off = (y) => {
    const t = y / H;
    return [shear * t, bulge * Math.sin(Math.PI * t)];
  };
  const closed = flaps === 'closed';
  for (let y = 0; y < H; y++) {
    const [sh, bu] = off(y + 0.5);
    const xl = x0 - bu + sh, xr = x0 + W + bu + sh, zl = z0 - bu, zr = z0 + D + bu;
    for (let z = Math.floor(zl); z < Math.ceil(zr); z++)
      for (let x = Math.floor(xl); x < Math.ceil(xr); x++) {
        const px = x + 0.5, pz = z + 0.5;
        if (px < xl || px > xr || pz < zl || pz > zr) continue;
        const top = yTop(x, z);
        if (y + 0.5 > top) continue;
        const wall = px < xl + 1 || px > xr - 1 || pz < zl + 1 || pz > zr - 1;
        const isTop = closed && y + 0.5 > top - 1;
        if (y === 0 || wall || isTop) b.set(x, y, z, wall && (px < xl + 1 || px > xr - 1) && (pz < zl + 1 || pz > zr - 1) ? edge : board);
      }
  }
  // closed: tape along the seam over the top and down the ends
  if (closed && rng.chance(0.75)) {
    const zc = Math.round(z0 + D / 2);
    for (let x = 0; x < b.nx; x++)
      for (let y = b.ny - 1; y >= 0; y--) {
        if (b.get(x, y, zc)) {
          b.set(x, y, zc, tapeC);
          b.set(x, y, zc - 1, tapeC);
          break;
        }
      }
  }
  // print marks and a shipping label on the sides
  if (opts.print ?? rng.chance(0.7)) {
    const pz = z0 + D - 1 + Math.ceil(bulge);
    const pw = Math.round(W * rng.range(0.3, 0.6)), ph = Math.max(2, Math.round(H * rng.range(0.15, 0.3)));
    const px0 = x0 + rng.int(1, Math.max(1, W - pw - 1)), py0 = rng.int(2, Math.max(2, H - ph - 2));
    const mask = textMask(pw, ph, [{ text: rng.pick(['FRAGILE', 'THIS SIDE UP', 'PRODUCE', '12 x 1 L', 'KEEP DRY', 'NET WT 40 LB', 'HANDLE WITH CARE']), size: 0.7, y: 0.5 }], { ss: 4 });
    for (let y = py0; y < py0 + ph; y++)
      for (let x = px0; x < px0 + pw; x++) {
        if (mask[(x - px0) + (y - py0) * pw] < 0.4) continue;
        for (let z = b.nz - 1; z >= 0; z--) if (b.get(x, y, z)) {
          b.set(x, y, z, inkC);
          break;
        }
      }
    if (rng.chance(0.5)) {
      const lw = Math.min(W - 2, rng.int(6, 10)), lh = Math.min(H - 3, rng.int(5, 7));
      const lx = x0 + rng.int(1, Math.max(1, W - lw - 1)), ly = rng.int(1, Math.max(1, H - lh - 1));
      for (let y = ly; y < ly + lh; y++)
        for (let z = z0 + 1; z < z0 + 1 + lw && z < z0 + D - 1; z++) {
          for (let x = 0; x < b.nx; x++) if (b.get(x, y, z)) {
            b.set(x, y, z, (y === ly + lh - 2 || y === ly + 2) && vrand(x, y, z, 5) < 0.6 ? inkC : labelC);
            break;
          }
        }
    }
  }
  // wet wicking from the bottom + water stains
  recolor(b, [board, edge], (v, x, y, z, n) => {
    const wl = wet * H * (0.25 + 0.6 * n);
    if (y < wl) return wetC;
    if (n > 1.05 - wet * 0.4) return wetC;
    return undefined;
  }, { freq: 0.09, seed: seed + 2 });
  // torn: chunk missing from a corner / side
  if (flaps === 'torn' || (collapsed > 0.5 && rng.chance(0.5))) {
    const cx = rng.chance(0.5) ? x0 : x0 + W, cz = rng.chance(0.5) ? z0 : z0 + D;
    const r = rng.range(0.25, 0.45) * Math.min(W, H);
    const cy = rng.range(0.5, 1) * H;
    b.fill(cx - r - 2, cy - r - 2, cz - r - 2, cx + r + 2, cy + r + 2, cz + r + 2, (px, py, pz) => {
      const d = Math.hypot(px - cx, (py - cy) * 1.3, pz - cz) + (valueNoise3(px * 0.4, py * 0.4, pz * 0.4, seed + 5) - 0.5) * 4;
      return d < r ? 0 : undefined;
    });
  }

  // open flaps as parts
  const parts = [];
  if (flaps !== 'closed') {
    const fm = { color: kraft, rough: 0.92, cls: MCLS.CARDBOARD, vari: 0.08 };
    const topY = (H - (collapsed > 0.5 ? sag * 0.5 : 0)) * vs;
    const hx = (W * vs) / 2, hz = (D * vs) / 2;
    const [shx] = off(H);
    const sx = shx * vs;
    const defs = [
      { w: W * vs, l: (D * vs) / 2, pos: [sx, topY, hz], yaw: 0 },
      { w: W * vs, l: (D * vs) / 2, pos: [sx, topY, -hz], yaw: Math.PI },
      { w: D * vs, l: (W * vs) / 2 * 0.8, pos: [sx + hx, topY, 0], yaw: Math.PI / 2 },
      { w: D * vs, l: (W * vs) / 2 * 0.8, pos: [sx - hx, topY, 0], yaw: -Math.PI / 2 },
    ];
    for (const [i, f] of defs.entries()) {
      if (flaps === 'torn' && rng.chance(0.45)) continue;
      // a: 0 = closed (lying flat, pointing to the box centre), PI = folded flat outward, >PI hangs down the side
      const a = rng.chance(0.15) ? rng.range(0.15, 0.6) : rng.range(1.6, 3.6);
      const fmodel = flapModel(f.w, f.l * (flaps === 'torn' ? rng.range(0.4, 1) : 1), vs, fm);
      parts.push({ name: `flap${i}`, model: fmodel, position: f.pos, rotation: rot(['x', Math.PI + a], ['y', f.yaw]) });
    }
  }
  return {
    model: b.model(),
    parts,
    meta: { size: [W * vs, H * vs, D * vs], footprint: [W * vs + bulge * 2 * vs, D * vs + bulge * 2 * vs], mount: 'floor', kind: 'cardboardBox', flaps, collapsed },
  };
}

/**
 * Pile of flattened cardboard boxes (3-8 sheets), slightly fanned, some curled and wet.
 * opts: count, lean (bool: sheets leaning against a wall; origin at wall base, extends +z).
 */
export function flatCardboard(rng, opts = {}) {
  const vs = opts.vs ?? VS_FINE;
  const n = opts.count ?? rng.int(3, 8);
  const lean = opts.lean ?? false;
  const parts = [];
  let y = 0;
  let maxW = 0, maxD = 0;
  for (let i = 0; i < n; i++) {
    const w = rng.range(0.55, 1.1), d = rng.range(0.4, 0.75);
    maxW = Math.max(maxW, w);
    maxD = Math.max(maxD, d);
    const sh = cardboardSheet(rng.fork(`s${i}`), { vs, w, d, curl: i === n - 1 ? rng.int(1, 4) : rng.int(0, 2), wet: rng.range(0.1, 0.9) });
    if (lean) {
      const ang = rng.range(0.15, 0.32) - i * 0.015;
      const r = rot(['x', -Math.PI / 2], ['x', -ang], ['y', rng.range(-0.05, 0.05)]);
      const pos = restPos(sh.model, r, { x: rng.range(-0.12, 0.12), yMin: 0, zMin: 0.01 + i * 0.018 });
      addProp(parts, `sheet${i}`, sh, pos, r);
    } else {
      addProp(parts, `sheet${i}`, sh, [rng.range(-0.08, 0.08), y, rng.range(-0.06, 0.06)], [rng.range(-0.02, 0.02), rng.range(-0.5, 0.5), rng.range(-0.02, 0.02)]);
      y += vs * (1 + (rng.chance(0.4) ? 1 : 0));
    }
  }
  return {
    model: emptyModel(vs),
    parts,
    meta: { size: [maxW, lean ? maxD : y + vs * 3, lean ? 0.35 : maxD], footprint: lean ? [maxW, 0.35] : [maxW, maxD], mount: lean ? 'wall' : 'floor', kind: 'flatCardboard' },
  };
}

// ───────────────────────────── pallets ─────────────────────────────

const WOOD_TONES = [
  [150, 122, 86], [138, 112, 78], [160, 134, 96], [120, 104, 84], [112, 100, 86], [96, 82, 64], [166, 140, 104], [128, 116, 98],
];

/**
 * Wooden GMA pallet (1.22 x 1.02 m): 3 notched stringers, 7 top / 5 bottom deck boards,
 * nails, per-board weathering. opts: broken (bool), tone 'fresh'|'grey'|'mixed'.
 * Origin: footprint centre, stringers run along X.
 */
export function pallet(rng, opts = {}) {
  const vs = VS_FINE;
  const broken = opts.broken ?? rng.chance(0.25);
  const tone = opts.tone ?? rng.weighted(['fresh', 'grey', 'mixed'], [1, 2, 3]);
  const L = Math.round(1.22 / vs), Wd = Math.round(1.02 / vs);
  const sH = 7, sW = 3, tb = 1; // stringer height / width, board thickness
  const b = new VB(L, tb + sH + tb + 1, Wd, vs, 'floor');
  const P = b.P;
  const woodMat = (i) => {
    let c = WOOD_TONES[i % WOOD_TONES.length];
    if (tone === 'fresh') c = rgbMix(c, [168, 140, 100], 0.5);
    else if (tone === 'grey') c = rgbMix(desat3(c), [116, 110, 100], 0.5);
    else if (vrand(i, 1, 2, 3) < 0.5) c = rgbMix(desat3(c), [110, 104, 94], 0.4);
    return mat.wood(P, `wood${i}`, rgbJitter(rng, c, 0.07, 0.02), { rough: 0.9, vari: 0.12 });
  };
  const nail = mat.steel(P, 'nail', [58, 52, 46], { rough: 0.7 });
  const knot = mat.wood(P, 'knot', [62, 48, 34]);
  const stamp = mat.wood(P, 'stamp', [44, 40, 38]);
  const paintEnd = rng.chance(0.25) ? mat.paint(P, 'endpaint', rng.pick([[40, 74, 130], [150, 44, 36], [200, 200, 196]]), { cls: MCLS.GENERIC, rough: 0.8 }) : 0;
  let mi = 0;
  // stringers (along x) at z edges + centre, with forklift notches
  const sz = [0, Math.round(Wd / 2 - sW / 2), Wd - sW];
  const notch = [[Math.round(L * 0.17), Math.round(L * 0.39)], [Math.round(L * 0.61), Math.round(L * 0.83)]];
  for (const z of sz) {
    const m = woodMat(mi++);
    b.box(0, tb, z, L, tb + sH, z + sW, m);
    for (const [a, c] of notch) b.box(a, tb, z, c, tb + 3, z + sW, 0);
    if (rng.chance(0.4)) b.box(rng.int(2, L - 6), tb + sH - 1, z, rng.int(8, L - 2), tb + sH, z + 1, stamp);
  }
  // top deck: 7 boards spanning z
  const topY = tb + sH;
  const topBoards = [];
  const nTop = 7;
  for (let i = 0; i < nTop; i++) {
    const w = i === 0 || i === nTop - 1 ? 10 : 7;
    const cx = Math.round((i / (nTop - 1)) * (L - w));
    topBoards.push([cx + rng.int(-1, 1), w]);
  }
  topBoards[0][0] = 0;
  topBoards[nTop - 1][0] = L - topBoards[nTop - 1][1];
  const pried = broken ? rng.int(1, nTop - 2) : -1;
  const missing = new Set();
  if (broken) for (let k = 0, nm = rng.int(1, 2); k < nm; k++) missing.add(rng.int(0, nTop - 1));
  const parts = [];
  for (const [i, [x, w]] of topBoards.entries()) {
    const m = woodMat(mi++);
    if (missing.has(i) && i !== pried) continue;
    if (i === pried) {
      // pried-up board as a tilted part
      const pb = new VB(w, 1, Wd, vs, [-(w * vs) / 2, 0, 0]);
      const pm = pb.P.add('board', { ...P.entries[m] });
      pb.box(0, 0, 0, w, 1, Wd - rng.int(0, 20), pm);
      parts.push({ name: 'pried', model: pb.model(), position: [b.mx(x + w / 2), (topY) * vs, b.mz(0)], rotation: [-rng.range(0.12, 0.35), rng.range(-0.05, 0.05), 0] });
      continue;
    }
    let zA = 0, zB = Wd;
    if (broken && rng.chance(0.3)) {
      // split board: a gap and a sagging end
      const cut = rng.int(Math.round(Wd * 0.3), Math.round(Wd * 0.7));
      b.box(x, topY, 0, x + w, topY + 1, cut - 1, m);
      b.box(x, topY - 1, cut + 1, x + w, topY, Wd, m);
      continue;
    }
    b.box(x, topY, zA, x + w, topY + 1, zB, m);
    if (paintEnd && (i === 0 || i === nTop - 1)) b.box(x, topY, 0, x + w, topY + 1, 2, paintEnd);
    if (vrand(i, 2, 3, mi) < 0.5) b.set(x + rng.int(1, w - 2), topY, rng.int(5, Wd - 5), knot);
    for (const z of sz) {
      b.set(x + 1, topY, z + 1, nail);
      b.set(x + w - 2, topY, z + 1, nail);
    }
  }
  // bottom deck: 5 boards
  for (let i = 0; i < 5; i++) {
    const w = i === 0 || i === 4 ? 10 : 7;
    const x = Math.round((i / 4) * (L - w));
    if (broken && rng.chance(0.15)) continue;
    b.box(x, 0, 0, x + w, tb, Wd, woodMat(mi++));
  }
  // grime: darker bottom, dirt
  grime(b, null, { h: 4, amount: 0.5, seed: rng.int(1, 1e5), k: 0.75 });
  return {
    model: b.model(),
    parts,
    meta: { size: b.sizeM(), footprint: [L * vs, Wd * vs], mount: 'floor', kind: 'pallet', broken, height: (topY + 1) * vs },
  };
}

function desat3(c) {
  const l = (c[0] + c[1] + c[2]) / 3;
  return c.map((v) => Math.round(v * 0.5 + l * 0.5));
}

/**
 * Stack of 2-6 pallets, slightly misaligned. opts: count, leaning (bool: one extra pallet
 * standing on its long edge leaning against the wall behind the stack).
 */
export function palletStack(rng, opts = {}) {
  const n = opts.count ?? rng.int(2, 6);
  const parts = [];
  let y = 0;
  let base = null;
  for (let i = 0; i < n; i++) {
    const p = pallet(rng.fork(`p${i}`), { broken: i === n - 1 ? rng.chance(0.4) : rng.chance(0.1) });
    if (i === 0) {
      base = p;
      for (const sp of p.parts ?? []) parts.push(sp);
    } else addProp(parts, `pallet${i}`, p, [rng.range(-0.04, 0.04), y, rng.range(-0.04, 0.04)], [0, rng.range(-0.06, 0.06) + (rng.chance(0.15) ? Math.PI / 2 * 0 : 0), 0]);
    y += p.meta.height + 0.002;
  }
  if (opts.leaning) {
    const p = pallet(rng.fork('lean'), {});
    const ang = rng.range(0.15, 0.3);
    // stand on its long edge (rotate about X so +z points up), lean back toward -z
    const r = rot(['x', -Math.PI / 2], ['x', -ang]);
    const pos = restPos(p.model, r, { x: rng.range(-0.1, 0.1), yMin: 0, zMin: -0.53 - 1.02 * Math.sin(ang) - 0.16 });
    addProp(parts, 'leaning', p, pos, r);
  }
  return {
    model: base.model,
    parts,
    meta: { size: [1.25, y + (opts.leaning ? 1.0 : 0), 1.05 + (opts.leaning ? 0.4 : 0)], footprint: [1.25, 1.05], mount: 'floor', kind: 'palletStack', count: n, height: y },
  };
}

// ───────────────────────────── mattress ─────────────────────────────

/**
 * Old stained mattress. opts: size 'twin'|'full', lean (bool: leaning against a wall; origin at
 * the wall base, extends +z), color. Flat: origin footprint centre, length along Z.
 */
export function mattress(rng, opts = {}) {
  const vs = VS_FINE;
  const size = opts.size ?? rng.pick(['twin', 'full', 'full']);
  const Wm = size === 'twin' ? 0.99 : 1.37, Lm = 1.9, Tm = rng.range(0.18, 0.24);
  const lean = opts.lean ?? rng.chance(0.6);
  const W = Math.round(Wm / vs), L = Math.round(Lm / vs), T = Math.round(Tm / vs);
  const bow = lean ? rng.range(2, 5) : rng.range(0, 2);
  const b = new VB(W + 2, T + Math.ceil(bow) + 3, L + 2, vs, [-(W + 2) * vs / 2, 0, 0]);
  const P = b.P;
  const ticking = opts.color ?? rng.pick([[204, 198, 184], [196, 190, 176], [182, 176, 164], [200, 196, 190]]);
  const top = mat.fabric(P, 'top', rgbJitter(rng, ticking, 0.04));
  const quilt = mat.fabric(P, 'quilt', rgbMul(ticking, 0.86));
  const border = mat.fabric(P, 'border', rgbJitter(rng, rng.pick([[120, 140, 168], [186, 180, 168], [150, 130, 120]]), 0.05));
  const piping = mat.fabric(P, 'piping', rgbMul(ticking, 0.7));
  const stain = mat.fabric(P, 'stain', rgbMix(ticking, [150, 118, 70], 0.45));
  const stainD = mat.fabric(P, 'stainD', rgbMix(ticking, [112, 84, 52], 0.55));
  const dirt = mat.fabric(P, 'dirt', rgbMix(ticking, [92, 84, 72], 0.6));
  const grey = mat.fabric(P, 'grey', rgbMix(ticking, [120, 116, 108], 0.35));
  const seed = rng.int(1, 1e6);
  const cx = (W + 2) / 2;
  const bend = (z) => bow * Math.sin(Math.PI * clamp((z + 0.5 - 1) / L, 0, 1));
  for (let z = 1; z < L + 1; z++) {
    const off = Math.round(bend(z));
    for (let x = 1; x < W + 1; x++) {
      // rounded corners in plan
      const ex = Math.min(x - 1, W - x), ez = Math.min(z - 1, L - z);
      if (ex + ez < 2) continue;
      for (let y = 0; y < T; y++) {
        const edgeRound = (y === 0 || y === T - 1) && (ex === 0 || ez === 0);
        if (edgeRound) continue;
        let v = border;
        if (y === T - 1 || y === 0) v = top;
        if ((y === T - 2 || y === 1) && (ex === 0 || ez === 0)) v = piping;
        b.set(x, y + off + 1, z, v);
      }
      // quilting: tufts / stitch dimples on the top face
      const qx = (x - 1) % 12, qz = (z - 1) % 12;
      if (qx === 6 && qz === 6 && ex > 3 && ez > 3) {
        b.set(x, T + off, z, 0);
        b.set(x, T - 1 + off, z, quilt);
      }
    }
  }
  // stains, dirt, wet bottom
  recolor(b, [top, quilt, border, piping], (v, x, y, z, n) => {
    // water / urine stains: light body with a darker tide-line rim
    if (n > 0.63 && n < 0.67) return stainD;
    if (n >= 0.67) return stain;
    const fromBottom = lean ? z / L : 1;
    if (lean && fromBottom < 0.1 + 0.12 * n) return dirt;
    if (n < 0.3) return grey;
    return undefined;
  }, { freq: 0.045, seed, octaves: 2 });
  // a tear with foam showing
  if (rng.chance(0.5)) {
    const foam = mat.fabric(P, 'foam', [196, 180, 120]);
    const tx = rng.int(8, W - 8), tz = rng.int(10, L - 10);
    for (let k = -5; k <= 5; k++) {
      const x = tx + k, z = tz + Math.round(k * 0.4);
      for (let y = b.ny - 1; y >= 0; y--) if (b.get(x, y, z)) {
        b.set(x, y, z, foam);
        break;
      }
    }
  }
  const model = b.model();
  if (!lean) {
    const flat = new VB(1, 1, 1, vs, 'floor');
    void flat;
    // flat on the ground: origin at footprint centre
    model.origin = [-(W + 2) * vs / 2, -vs, -(L + 2) * vs / 2];
    return { model, meta: { size: [W * vs, T * vs, L * vs], footprint: [W * vs, L * vs], mount: 'floor', kind: 'mattress' } };
  }
  // leaning: stand on the short edge, back against the wall (z = 0), bottom edge out at +z
  const ang = rng.range(0.2, 0.32);
  const Lr = L * vs;
  const parts = [];
  const r = rot(['x', -Math.PI / 2], ['y', Math.PI], ['x', -ang]);
  const pos = restPos(model, r, { x: 0, yMin: 0, zMin: 0.01 });
  parts.push({ name: 'mattress', model, position: pos, rotation: r });
  return {
    model: emptyModel(vs),
    parts,
    meta: { size: [W * vs, Math.cos(ang) * Lr, Math.sin(ang) * Lr + T * vs], footprint: [W * vs, Math.sin(ang) * Lr + T * vs], mount: 'wall', kind: 'mattress', lean: true },
  };
}
