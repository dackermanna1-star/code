// People sleeping rough: one in a sleeping bag on the loading dock under the
// sodium wall pack, one under blankets on an old mattress beneath the rear
// porch, one asleep sitting up in a boarded doorway with their head on their
// arms. Each is modelled as signed distance fields (body, clothes, bedding,
// belongings) voxelized at 6-12 mm with smoothed normals and merged into one
// mesh that breathes (a slow vertex swell over the chest). Close by you can
// hear them breathing. Nothing you do wakes them.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Palette, VoxelGrid, VoxelModel } from '../voxel/VoxelGrid.js';
import { meshModel } from '../voxel/mesher.js';
import { createVoxelMaterial, MCLS } from '../render/voxelMaterial.js';
import { smin, sdRoundCone, sdEllipsoid, sdRoundBox, vnoise3, smoothNormals } from '../spray/viewmodelParts.js';
import { PROPS } from '../props/catalog.js';
import { RNG } from '../core/rng.js';
import { CV, LAYER_REFLECT } from './units.js';

const { abs, min, max, sin, cos, pow, exp, atan2, PI, hypot } = Math;
const clamp = (x, a, b) => min(b, max(a, x));
const sstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const smax = (a, b, k) => -smin(-a, -b, k);
const n3 = (x, y, z, s) => vnoise3(x, y, z, s);
const cap = (x, y, z, a, b, r1, r2 = r1) => sdRoundCone(x, y, z, a[0], a[1], a[2], b[0], b[1], b[2], r1, r2);
const norm = (v) => {
  const l = hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
/** Part frame from where its +x and +y should point (y is made orthogonal to x). */
const axesXY = (x, y) => {
  const X = norm(x);
  const d = y[0] * X[0] + y[1] * X[1] + y[2] * X[2];
  const Y = norm([y[0] - d * X[0], y[1] - d * X[1], y[2] - d * X[2]]);
  return [X, Y, cross(X, Y)];
};
/** Part frame from where its +y and +z should point (z is made orthogonal to y). */
const axesYZ = (y, z) => {
  const Y = norm(y);
  const d = z[0] * Y[0] + z[1] * Y[1] + z[2] * Y[2];
  const Z = norm([z[0] - d * Y[0], z[1] - d * Y[1], z[2] - d * Y[2]]);
  return [cross(Y, Z), Y, Z];
};

/** Ground kept clear of litter where they lie [x0, z0, x1, z1]. */
export const SLEEPER_ZONES = [
  [-3.2, -8.6, -1.85, -7.15], // doorway
  [-5.0, -40.9, -2.4, -37.7], // loading dock
  [3.55, -46.0, 5.5, -41.9], // under the porch
];
export function inSleeperZone(x, z, pad = 0) {
  for (const [x0, z0, x1, z1] of SLEEPER_ZONES) if (x > x0 - pad && x < x1 + pad && z > z0 - pad && z < z1 + pad) return true;
  return false;
}

// ───────────────────────── voxelizing ─────────────────────────

/**
 * Narrow-band voxelizer: 4^3 blocks well outside the surface are skipped, blocks
 * well inside are filled without calling mat(); only the band is evaluated per voxel.
 */
function voxelize(P, { vs, min: b0, max: b1, sdf, mat, fill, smooth = 0.8 }) {
  const nx = Math.max(1, Math.ceil((b1[0] - b0[0]) / vs));
  const ny = Math.max(1, Math.ceil((b1[1] - b0[1]) / vs));
  const nz = Math.max(1, Math.ceil((b1[2] - b0[2]) / vs));
  const g = new VoxelGrid(nx, ny, nz);
  const D = g.data;
  const B = 4, band = 1.3 * B * vs;
  for (let k0 = 0; k0 < nz; k0 += B)
    for (let j0 = 0; j0 < ny; j0 += B)
      for (let i0 = 0; i0 < nx; i0 += B) {
        const dc = sdf(b0[0] + (i0 + B / 2) * vs, b0[1] + (j0 + B / 2) * vs, b0[2] + (k0 + B / 2) * vs);
        if (dc > band) continue;
        const full = dc < -band;
        for (let k = k0; k < Math.min(nz, k0 + B); k++) {
          const z = b0[2] + (k + 0.5) * vs;
          for (let j = j0; j < Math.min(ny, j0 + B); j++) {
            const y = b0[1] + (j + 0.5) * vs;
            for (let i = i0; i < Math.min(nx, i0 + B); i++) {
              const idx = i + nx * (j + ny * k);
              if (full) {
                D[idx] = fill;
                continue;
              }
              const x = b0[0] + (i + 0.5) * vs;
              const d = sdf(x, y, z);
              if (d > 0) continue;
              const m = mat(x, y, z, d);
              if (m) D[idx] = m;
            }
          }
        }
      }
  const geo = meshModel(new VoxelModel(g, P, vs, b0));
  if (smooth > 0) smoothNormals(geo, sdf, smooth, vs * 0.75);
  return geo;
}

/** Palette helper: name -> index, with a few material presets. */
function palette() {
  const P = new Palette();
  const add = (name, color, cls, rough = 0.85, o = {}) => P.add(name, { color, cls, rough, vari: o.vari ?? 0.05, metal: o.metal ?? 0 });
  return { P, add };
}

// ───────────────────────── shared pieces ─────────────────────────

/** Flattened cardboard box: warped slab with a fold crease, tape, print and wet stains. */
function cardboard(add, seed, hx, hz, crease = 0) {
  const C = add('card' + seed, [148, 110, 70], MCLS.CARDBOARD, 0.92, { vari: 0.07 });
  const Cw = add('cardWet' + seed, [104, 76, 48], MCLS.CARDBOARD, 0.85);
  const Ct = add('cardTape' + seed, [188, 160, 112], MCLS.PLASTIC, 0.45);
  const Ci = add('cardInk' + seed, [62, 46, 32], MCLS.CARDBOARD, 0.9);
  const T = 0.006;
  const warp = (x, z) => 0.007 * (n3(x * 2.2, seed, z * 2.2, seed) - 0.5) + 0.004 * (n3(x * 6, seed, z * 6, seed + 3) - 0.5);
  const sdf = (x, y, z) => {
    const yy = y - warp(x, z);
    // frayed, slightly ragged outline
    const ragged = 0.012 * (n3(x * 14, 0, z * 14, seed + 5) - 0.5);
    let d = sdRoundBox(x, yy + T, z, hx + ragged, T, hz + ragged, 0.004);
    // fold crease across the board
    d += 0.004 * exp(-(((crease ? z : x) - 0.02) ** 2) / 0.00004);
    return d;
  };
  const mat = (x, y, z) => {
    if (abs(z - hz * 0.55) < 0.024 && abs(x) < hx * 0.9) return Ct;
    if (abs(x + hx * 0.35) < 0.07 && abs(z + hz * 0.2) < 0.05 && n3(x * 30, 0, z * 30, seed) > 0.35) return Ci;
    return n3(x * 4, 0, z * 4, seed + 9) > 0.6 ? Cw : C;
  };
  return { sdf, mat, fill: C, min: [-hx - 0.02, -0.02, -hz - 0.02], max: [hx + 0.02, 0.012, hz + 0.02] };
}

/** Plastic shopping bag stuffed with things: lumpy body, knotted handles. */
function plasticBag(add, seed, color) {
  const Pm = add('bag' + seed, color, MCLS.PLASTIC, 0.38, { vari: 0.06 });
  const Pk = add('bagCrease' + seed, color.map((c) => c * 0.82), MCLS.PLASTIC, 0.45);
  const r = new RNG(seed);
  // things inside push the film out in lumps (a box corner, a bottle, clothes)
  const lumps = [];
  for (let i = 0; i < 6; i++) lumps.push([r.range(-0.08, 0.08), r.range(0.045, 0.1), r.range(-0.07, 0.07), r.range(0.045, 0.075)]);
  const sdf = (x, y, z) => {
    let d = 1e9;
    for (const [lx, ly, lz, lr] of lumps) d = smin(d, hypot(x - lx, (y - ly) * 1.35, z - lz) - lr, 0.045);
    d = smax(d, -y, 0.015);
    // gathered neck and knotted handles
    d = smin(d, sdEllipsoid(x, y - 0.15, z, 0.035, 0.03, 0.03), 0.02);
    d = min(d, sdEllipsoid(x, y - 0.185, z, 0.022, 0.017, 0.017));
    for (const sx of [-1, 1]) d = min(d, abs(hypot(x - sx * 0.035, y - 0.19) - 0.028) - 0.005 + max(0, abs(z) - 0.01));
    // creased film
    d += 0.007 * (n3(x * 28, y * 28, z * 28, seed) - 0.5) + 0.004 * abs(sin(x * 70 + 9 * n3(x * 6, y * 6, z * 6, seed + 2)));
    return d;
  };
  const mat = (x, y, z) => (n3(x * 18, y * 18, z * 18, seed + 1) > 0.62 ? Pk : Pm);
  return { sdf, mat, fill: Pm, min: [-0.19, -0.01, -0.17], max: [0.19, 0.24, 0.17] };
}

/** Black garbage bag stuffed with clothes, neck twisted and tied in two ears. */
function garbageBag(add, seed, size = 1) {
  const G = add('trash' + seed, [22, 22, 24], MCLS.TRASHBAG, 0.25, { vari: 0.05 });
  const Gk = add('trashCrease' + seed, [36, 36, 40], MCLS.TRASHBAG, 0.32);
  const r = new RNG(seed);
  const lumps = [];
  for (let i = 0; i < 7; i++) lumps.push([r.range(-0.11, 0.11) * size, r.range(0.08, 0.2) * size, r.range(-0.1, 0.1) * size, r.range(0.08, 0.13) * size]);
  const top = 0.36 * size;
  const sdf = (x, y, z) => {
    let d = 1e9;
    for (const [lx, ly, lz, lr] of lumps) d = smin(d, hypot(x - lx, (y - ly) * 1.15, z - lz) - lr, 0.07 * size);
    d = smax(d, -y, 0.03);
    // gathered neck rising into the knot, two tie ears flopping over
    d = smin(d, cap(x, y, z, [0, top * 0.62, 0], [0.01, top, 0], 0.05 * size, 0.022), 0.05 * size);
    d = min(d, sdEllipsoid(x - 0.045, y - top - 0.005, z + 0.01, 0.045, 0.012, 0.024));
    d = min(d, sdEllipsoid(x + 0.035, y - top + 0.002, z - 0.012, 0.04, 0.012, 0.022));
    // stretched film over what is inside, crinkles where it folds
    d += 0.008 * (n3(x * 18, y * 18, z * 18, seed) - 0.5) + 0.004 * abs(sin(y * 90 + 12 * n3(x * 5, y * 5, z * 5, seed + 1)));
    return d;
  };
  const mat = (x, y, z) => (n3(x * 22, y * 22, z * 22, seed + 3) > 0.6 ? Gk : G);
  return { sdf, mat, fill: G, min: [-0.3 * size, -0.01, -0.28 * size], max: [0.3 * size, top + 0.04, 0.28 * size] };
}

/** Paper coffee cup standing, lid on. */
function paperCup(add) {
  const W = add('cupPaper', [214, 208, 194], MCLS.PAPER, 0.85);
  const L = add('cupLid', [36, 36, 38], MCLS.PLASTIC, 0.35);
  const S = add('cupSleeve', [150, 112, 74], MCLS.CARDBOARD, 0.9);
  const sdf = (x, y, z) => {
    const r = hypot(x, z);
    let d = max(r - (0.029 + 0.012 * (y / 0.11)), max(-y, y - 0.112));
    d = min(d, max(r - 0.044, abs(y - 0.116) - 0.006));
    return d;
  };
  const mat = (x, y) => (y > 0.108 ? L : y > 0.03 && y < 0.075 ? S : W);
  return { sdf, mat, fill: W, min: [-0.05, 0, -0.05], max: [0.05, 0.125, 0.05] };
}

/** Worn backpack lying on its back: body, front pocket, straps, haul loop. */
function backpack(add, color, hx, hy, hz) {
  const F = add('pack', color, MCLS.FABRIC, 0.88, { vari: 0.06 });
  const Fd = add('packDark', color.map((c) => c * 0.6), MCLS.FABRIC, 0.9);
  const Fw = add('packWorn', color.map((c) => Math.min(255, c * 1.35 + 12)), MCLS.FABRIC, 0.92);
  const Z = add('packZip', [30, 30, 32], MCLS.PLASTIC, 0.5);
  // x across, y through (front pocket at +y, straps at -y), z along (top, with the haul loop, at +z)
  const pk = (x, y, z) => sdRoundBox(x, y - hy * 2.05, z + hz * 0.2, hx * 0.62, hy * 0.42, hz * 0.52, hy * 0.35);
  const sdf = (x, y, z) => {
    let d = sdRoundBox(x, y - hy, z, hx, hy, hz, min(hx, hy, hz) * 0.75);
    d = smin(d, pk(x, y, z), 0.025);
    // haul loop at the top
    d = min(d, abs(hypot(z - hz - 0.012, y - hy * 1.1) - 0.024) - 0.006 + max(0, abs(x) - 0.018));
    // shoulder straps down the back panel
    for (const sx of [-0.065, 0.065]) d = min(d, sdRoundBox(x - sx, y + 0.006, z + 0.01, 0.022, 0.008, hz * 0.82, 0.006));
    d += 0.005 * (n3(x * 20, y * 20, z * 20, 77) - 0.5);
    return d;
  };
  const mat = (x, y, z) => {
    if (y < 0.002) return Fd;
    const p = pk(x, y, z);
    if (abs(p) < 0.006 && y > hy * 2.25) return Z;
    if (abs(z - hz * 0.86) < 0.006 && y > hy * 1.2) return Z;
    return n3(x * 12, y * 12, z * 12, 5) > 0.68 ? Fw : F;
  };
  return { sdf, mat, fill: F, min: [-hx - 0.03, -0.02, -hz - 0.03], max: [hx + 0.03, hy * 2.6 + 0.02, hz + 0.05] };
}

/** A boot or trainer: toe toward +z, sole on y = 0. */
function shoe(add, kind, seed) {
  const sneaker = kind === 'sneaker';
  const U = add('shoeUpper' + kind, sneaker ? [164, 160, 150] : [86, 58, 36], sneaker ? MCLS.FABRIC : MCLS.LEATHER, sneaker ? 0.85 : 0.5, { vari: 0.07 });
  const Ud = add('shoeScuff' + kind, sneaker ? [118, 112, 104] : [58, 40, 26], sneaker ? MCLS.FABRIC : MCLS.LEATHER, 0.7);
  const S = add('shoeSole' + kind, sneaker ? [130, 126, 118] : [28, 26, 24], MCLS.RUBBER, 0.8);
  const La = add('shoeLace' + kind, sneaker ? [70, 68, 66] : [40, 32, 24], MCLS.FABRIC, 0.9);
  const shaft = sneaker ? 0.075 : 0.13;
  const sdf = (x, y, z) => {
    let d = sdRoundBox(x, y - 0.016, z, 0.046, 0.016, 0.135, 0.012);
    d = smin(d, sdEllipsoid(x, y - 0.045, z + 0.065, 0.044, shaft * 0.62, 0.065), 0.025);
    d = smin(d, sdEllipsoid(x, y - 0.032, z - 0.06, 0.046, 0.034, 0.085), 0.025);
    d = smax(d, -sdEllipsoid(x, y - shaft - 0.012, z + 0.058, 0.03, 0.03, 0.04), 0.006);
    d += 0.003 * (n3(x * 40, y * 40, z * 40, seed) - 0.5);
    return d;
  };
  const mat = (x, y, z) => {
    if (y < 0.02) return S;
    if (z > -0.02 && z < 0.06 && abs(x) < 0.02 && y > 0.045) return La;
    return n3(x * 30, y * 30, z * 30, seed) > 0.66 ? Ud : U;
  };
  return { sdf, mat, fill: U, min: [-0.06, -0.002, -0.15], max: [0.06, shaft + 0.04, 0.15] };
}

/** Head lying or bowed: skull, face (toward +x of the head frame), knit beanie, hair, ear. */
function headPart(add, o) {
  const Sk = add('skin' + o.id, o.skin, MCLS.SKIN, 0.55, { vari: 0.03 });
  const Sd = add('skinShade' + o.id, o.skin.map((c) => c * 0.78), MCLS.SKIN, 0.6);
  const Bn = add('beanie' + o.id, o.beanie, MCLS.FABRIC, 0.95, { vari: 0.08 });
  const Bd = add('beanieRib' + o.id, o.beanie.map((c) => c * 0.7), MCLS.FABRIC, 0.95);
  const Hr = add('hair' + o.id, o.hair, MCLS.FABRIC, 0.7, { vari: 0.1 });
  const Bd2 = add('beard' + o.id, o.beard ?? o.hair, MCLS.FABRIC, 0.85, { vari: 0.12 });
  const sdf = (x, y, z) => {
    let d = sdEllipsoid(x + 0.004, y - 0.008, z, 0.088, 0.104, 0.084);
    // face: brow, cheeks, jaw and nose toward +x
    d = smin(d, sdEllipsoid(x - 0.035, y + 0.035, z, 0.06, 0.055, 0.062), 0.025);
    d = smin(d, sdEllipsoid(x - 0.085, y + 0.0, z, 0.016, 0.026, 0.011), 0.012);
    // ears
    d = smin(d, sdEllipsoid(x + 0.005, y, z - 0.083, 0.018, 0.03, 0.01), 0.008);
    d = smin(d, sdEllipsoid(x + 0.005, y, z + 0.083, 0.018, 0.03, 0.01), 0.008);
    // beanie: a slightly bigger shell over the crown and back, cuff rolled up
    const bean = sdEllipsoid(x + 0.012, y - 0.03, z, 0.098, 0.1, 0.094);
    const cut = (y - 0.012) - 0.6 * (x + 0.02);
    d = min(d, smax(bean, -cut, 0.01));
    d += 0.0025 * (n3(x * 60, y * 60, z * 60, 3) - 0.5);
    return d;
  };
  const mat = (x, y, z) => {
    const cut = (y - 0.012) - 0.6 * (x + 0.02);
    const shell = sdEllipsoid(x + 0.012, y - 0.03, z, 0.098, 0.1, 0.094);
    if (cut > -0.004 && shell < 0.006) return cut < 0.02 ? Bd : abs(sin(atan2(z, x) * 26)) > 0.75 ? Bd : Bn;
    if (o.beard && x > 0.01 && y < -0.025) return Bd2;
    if (x < 0.02 && y < 0.02) return Hr;
    return y < -0.04 ? Sd : Sk;
  };
  return { sdf, mat, fill: Sk, min: [-0.11, -0.12, -0.12], max: [0.115, 0.14, 0.12] };
}

/** A gloved hand, palm down, fingers toward +z, curled a little; finger tips bare. */
function handPart(add, o) {
  const G = add('glove' + o.id, o.glove, MCLS.FABRIC, 0.95, { vari: 0.08 });
  const Sk = add('skinHand' + o.id, o.skin, MCLS.SKIN, 0.55, { vari: 0.03 });
  const fingers = [[-0.026, 0.07], [-0.009, 0.078], [0.009, 0.075], [0.025, 0.064]];
  const sdf = (x, y, z) => {
    let d = sdRoundBox(x, y - 0.014, z - 0.02, 0.036, 0.013, 0.042, 0.012);
    for (const [fx, L] of fingers) d = smin(d, cap(x, y, z, [fx, 0.016, 0.05], [fx * 1.1, 0.004, 0.05 + L * 0.85], 0.0095, 0.008), 0.006);
    d = smin(d, cap(x, y, z, [0.034, 0.012, 0.0], [0.052, 0.008, 0.045], 0.011, 0.009), 0.008);
    return d;
  };
  const mat = (x, y, z) => (z > 0.085 || (x > 0.045 && z > 0.032) ? Sk : G);
  return { sdf, mat, fill: G, min: [-0.05, -0.01, -0.04], max: [0.07, 0.04, 0.15] };
}

// ───────────────────────── the three figures ─────────────────────────

/** In a mummy bag on cardboard, on the side facing the back wall (-x), head on a backpack (+z). */
function dockSleeper() {
  const { P, add } = palette();
  const parts = [];
  const shell = [30, 40, 62];
  const Sh = add('bagShell', shell, MCLS.PLASTIC, 0.5, { vari: 0.05 });
  const Sd = add('bagSeam', shell.map((c) => c * 0.62), MCLS.PLASTIC, 0.6);
  const Sw = add('bagWorn', shell.map((c) => c * 1.25 + 8), MCLS.PLASTIC, 0.6);
  const Sg = add('bagGrime', [34, 36, 40], MCLS.PLASTIC, 0.75);
  const Ln = add('bagLining', [112, 98, 76], MCLS.FABRIC, 0.95, { vari: 0.07 });
  const hip = [0.0, 0.18, 0.0], chest = [0.0, 0.225, 0.4], head = [-0.03, 0.235, 0.74];
  const hipL = [-0.03, 0.17, -0.04], knee = [-0.26, 0.14, -0.34], foot = [-0.12, 0.11, -0.78];
  const opening = (x, y, z) => sdEllipsoid(x - head[0] + 0.03, y - head[1] - 0.15, z - head[2] - 0.05, 0.11, 0.1, 0.11);
  const seams = (z) => pow(abs(cos((PI * (z + 0.03)) / 0.15)), 12);
  const bag = (x, y, z) => {
    let d = cap(x, y, z, hip, chest, 0.19, 0.228);
    // a dip at the waist
    d += 0.018 * exp(-(((z - 0.2) / 0.1) ** 2)) * sstep(0.1, 0.3, y);
    d = smin(d, cap(x, y, z, chest, head, 0.21, 0.155), 0.1);
    d = smin(d, cap(x, y, z, hipL, knee, 0.175, 0.145), 0.14);
    d = smin(d, cap(x, y, z, knee, foot, 0.145, 0.11), 0.1);
    // lying on it presses the underside flat; the top sags a little between shoulder and knee
    d = smax(d, -y, 0.05);
    d += 0.006 * seams(z);
    d += 0.016 * (n3(x * 6, y * 6, z * 6, 11) - 0.5);
    d = smax(d, -opening(x, y, z), 0.02);
    return d;
  };
  parts.push({
    vs: 0.013, min: [-0.5, -0.02, -0.98], max: [0.3, 0.5, 0.96], sdf: bag, fill: Sh,
    mat: (x, y, z) => {
      if (opening(x, y, z) < 0.025) return Ln;
      if (seams(z) > 0.55) return Sd;
      if (y < 0.035 + 0.03 * n3(x * 9, 0, z * 9, 2)) return Sg;
      return n3(x * 5, y * 5, z * 5, 3) > 0.64 ? Sw : Sh;
    },
  });
  // head inside the hood, face to the wall: beanie and a little hair show at the opening
  const hd = headPart(add, { id: 'A', skin: [120, 82, 62], beanie: [120, 36, 34], hair: [28, 22, 20] });
  parts.push({ ...hd, vs: 0.006, at: [head[0], head[1], head[2]], axes: axesXY([-0.95, -0.25, 0.1], [0.05, 0.3, 1]) });
  // pillow: the backpack under the head
  parts.push({ ...backpack(add, [44, 58, 46], 0.15, 0.045, 0.19), vs: 0.008, at: [0.0, 0.0, 0.8], axes: axesYZ([0, 1, 0], [0, 0, 1]) });
  // cardboard
  parts.push({ ...cardboard(add, 1, 0.37, 0.62), vs: 0.009, at: [0.0, 0, 0.42], rot: [0, 0.04, 0] });
  parts.push({ ...cardboard(add, 2, 0.34, 0.5, 1), vs: 0.009, at: [-0.03, -0.004, -0.55], rot: [0, -0.07, 0] });
  // trainers lined up by the feet; bags and a cup by the head
  parts.push({ ...shoe(add, 'sneaker', 4), vs: 0.006, at: [0.33, 0.002, -0.55], rot: [0, 0.12, 0] });
  parts.push({ ...shoe(add, 'sneaker', 5), vs: 0.006, at: [0.44, 0.002, -0.6], rot: [0, 0.2, 0] });
  parts.push({ ...garbageBag(add, 33, 0.95), vs: 0.012, at: [-0.16, 0.0, 1.28], rot: [0, -0.4, 0] });
  parts.push({ ...plasticBag(add, 31, [204, 200, 188]), vs: 0.006, at: [0.22, 0.0, 1.18], rot: [0, 0.6, 0] });
  parts.push({ ...paperCup(add), vs: 0.005, at: [0.36, 0.0, 0.9], rot: [0, 0, 0] });
  return {
    P, parts,
    // the flank and shoulder rise with each breath
    breath: (x, y, z) => exp(-(((z - 0.22) / 0.26) ** 2)) * sstep(0.08, 0.3, y),
    amp: 0.0045, period: 4.4, head: head, box: [[-0.5, 0, -0.95], [0.32, 0.48, 1.0]],
  };
}

/** On an old mattress under two blankets, on the back, head turned to +x, an arm out on top. */
function porchSleeper() {
  const { P, add } = palette();
  const parts = [];
  // mattress: quilted, stained, a split corner with foam showing
  const Mt = add('mattress', [176, 166, 146], MCLS.FABRIC, 0.9, { vari: 0.06 });
  const Ms = add('mattressStain', [136, 118, 84], MCLS.FABRIC, 0.92);
  const Mp = add('mattressPiping', [120, 112, 98], MCLS.FABRIC, 0.85);
  const Mf = add('foam', [196, 168, 92], MCLS.FABRIC, 0.95);
  const MH = 0.16, MX = 0.46, MZ = 0.98;
  parts.push({
    vs: 0.014, min: [-MX - 0.03, -MH - 0.02, -MZ - 0.03], max: [MX + 0.03, 0.02, MZ + 0.03], fill: Mt,
    sdf: (x, y, z) => {
      let d = sdRoundBox(x, y + MH / 2, z, MX, MH / 2, MZ, 0.045);
      // tufts
      const tx = ((x / 0.16) % 1 + 1.5) % 1 - 0.5, tz = ((z / 0.16) % 1 + 1.5) % 1 - 0.5;
      d += 0.006 * exp(-(tx * tx + tz * tz) / 0.012) * sstep(-0.02, 0, y);
      // the torn corner
      d = smax(d, -sdEllipsoid(x - MX, y + 0.03, z + MZ - 0.12, 0.07, 0.05, 0.11), 0.02);
      return d + 0.004 * (n3(x * 9, y * 9, z * 9, 8) - 0.5);
    },
    mat: (x, y, z) => {
      if (sdEllipsoid(x - MX, y + 0.03, z + MZ - 0.12, 0.08, 0.06, 0.12) < 0) return Mf;
      if (abs(y + 0.004) < 0.012 && (abs(abs(x) - MX) < 0.03 || abs(abs(z) - MZ) < 0.03)) return Mp;
      return n3(x * 3.5, y * 3, z * 3.5, 21) > 0.62 ? Ms : Mt;
    },
  });
  // body under the bedding (on its back, right knee drawn up)
  const body = [
    [[0, 0.085, -0.06], [0, 0.095, 0.36], 0.115, 0.125],
    [[0, 0.095, 0.36], [0.02, 0.085, 0.6], 0.125, 0.07],
    [[-0.1, 0.065, -0.14], [-0.11, 0.06, -0.56], 0.07, 0.055],
    [[-0.11, 0.06, -0.56], [-0.12, 0.055, -0.94], 0.055, 0.045],
    [[0.1, 0.07, -0.14], [0.17, 0.2, -0.5], 0.07, 0.06],
    [[0.17, 0.2, -0.5], [0.13, 0.06, -0.86], 0.06, 0.045],
  ];
  const mound = (x, z, pad, drape) => {
    let h = -1;
    for (const [a, b, r1, r2] of body) {
      const ex = b[0] - a[0], ez = b[2] - a[2];
      const t = clamp(((x - a[0]) * ex + (z - a[2]) * ez) / (ex * ex + ez * ez), 0, 1);
      const px = a[0] + ex * t, pz = a[2] + ez * t, py = a[1] + (b[1] - a[1]) * t, r = r1 + (r2 - r1) * t;
      const R = r + pad;
      const u = hypot(x - px, z - pz) / (R + drape);
      if (u < 1) h = max(h, (py + R) * pow(1 - u * u, 1.4));
    }
    return h;
  };
  // the support under a blanket: mattress top, falling off its edges to the deck
  const support = (x, z) => -MH * sstep(0, 0.07, max(abs(x) - MX, abs(z) - MZ));
  const blanket = (o) => {
    const ca = cos(o.rot), sa = sin(o.rot);
    const local = (x, z) => [ca * (x - o.cx) - sa * (z - o.cz), sa * (x - o.cx) + ca * (z - o.cz)];
    const top = (x, z) => {
      const s = support(x, z);
      let h = max(max(mound(x, z, o.pad, 0.2), 0) + o.t, s + o.t);
      // folds where it drapes, a little loft everywhere
      const [u, v] = local(x, z);
      const fold = sin(u * 11 + 3 * n3(u * 2, 0, v * 2, o.seed)) * sin(v * 5 + 1.3);
      h += o.fold * fold * (0.4 + 0.6 * sstep(0.02, 0.12, max(abs(x) - MX + 0.1, 0) + h * 0.3)) + 0.004 * (n3(x * 12, 0, z * 12, o.seed) - 0.5);
      return [h, s];
    };
    // the surface and outline only depend on (x, z): tabulate them once, look them up per voxel
    const step = 0.011, x0 = -0.95, z0 = -1.2, nx = Math.ceil(1.9 / step) + 2, nz = Math.ceil(2.0 / step) + 2;
    const H = new Float32Array(nx * nz), Sg = new Float32Array(nx * nz), Rg = new Float32Array(nx * nz);
    for (let j = 0; j < nz; j++)
      for (let i = 0; i < nx; i++) {
        const x = x0 + i * step, z = z0 + j * step;
        const [h, sv] = top(x, z);
        const [u, v] = local(x, z);
        const edge = 0.02 * (n3(u * 8, 0, v * 8, o.seed + 1) - 0.5);
        H[i + j * nx] = h;
        Sg[i + j * nx] = sv;
        Rg[i + j * nx] = max(abs(u) - o.hx - edge, abs(v) - o.hz - edge);
      }
    const look = (A, x, z) => {
      const fx = clamp((x - x0) / step, 0, nx - 1.001), fz = clamp((z - z0) / step, 0, nz - 1.001);
      const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j, k = i + j * nx;
      return (A[k] * (1 - tx) + A[k + 1] * tx) * (1 - tz) + (A[k + nx] * (1 - tx) + A[k + nx + 1] * tx) * tz;
    };
    const sdf = (x, y, z) => max(max((y - look(H, x, z)) * 0.8, look(Sg, x, z) - 0.006 - y), look(Rg, x, z));
    return { sdf, top: (x, z) => [look(H, x, z), look(Sg, x, z)] };
  };
  // wool blanket over everything, then a plaid fleece over the top half, askew
  const B1 = blanket({ cx: 0.0, cz: -0.2, hx: 0.74, hz: 0.78, rot: 0.05, pad: 0.025, t: 0.014, fold: 0.012, seed: 41 });
  const Wg = add('wool', [82, 84, 78], MCLS.FABRIC, 0.97, { vari: 0.06 });
  const Wd = add('woolStripe', [46, 48, 46], MCLS.FABRIC, 0.97);
  parts.push({
    vs: 0.011, min: [-0.82, -MH - 0.01, -1.06], max: [0.86, 0.42, 0.62], sdf: B1.sdf, fill: Wg,
    mat: (x, y, z) => (abs(z + 0.86) < 0.025 || abs(z - 0.5) < 0.02 ? Wd : Wg),
  });
  const B2 = blanket({ cx: -0.02, cz: 0.18, hx: 0.66, hz: 0.42, rot: -0.12, pad: 0.04, t: 0.026, fold: 0.016, seed: 43 });
  const Fr = add('fleeceRed', [132, 30, 32], MCLS.FABRIC, 0.95, { vari: 0.05 });
  const Fk = add('fleeceDark', [30, 22, 24], MCLS.FABRIC, 0.95);
  const Fm = add('fleeceMix', [72, 24, 26], MCLS.FABRIC, 0.95);
  parts.push({
    vs: 0.011, min: [-0.82, -MH - 0.01, -0.36], max: [0.82, 0.45, 0.66], sdf: B2.sdf, fill: Fr,
    mat: (x, y, z) => {
      // buffalo check
      const ca = cos(-0.12), sa = sin(-0.12);
      const u = ca * (x + 0.02) - sa * (z - 0.18), v = sa * (x + 0.02) + ca * (z - 0.18);
      const a = ((u / 0.1) % 1 + 1) % 1 < 0.5, b = ((v / 0.1) % 1 + 1) % 1 < 0.5;
      return a && b ? Fk : a || b ? Fm : Fr;
    },
  });
  // head on a folded jacket, turned toward the wall (+x); grey stubble
  const head = [0.035, 0.125, 0.76];
  const Jk = add('jacketPillow', [70, 54, 40], MCLS.FABRIC, 0.9, { vari: 0.07 });
  const Jd = add('jacketPillowSeam', [44, 34, 26], MCLS.FABRIC, 0.9);
  parts.push({
    vs: 0.009, min: [-0.24, -0.01, 0.6], max: [0.24, 0.13, 0.98], fill: Jk,
    sdf: (x, y, z) => smin(sdRoundBox(x, y - 0.045, z - 0.78, 0.2, 0.045, 0.13, 0.04), sdRoundBox(x + 0.02, y - 0.085, z - 0.83, 0.14, 0.03, 0.07, 0.03), 0.03) + 0.006 * (n3(x * 14, y * 14, z * 14, 51) - 0.5),
    mat: (x, y, z) => (abs(z - 0.69) < 0.01 || abs(x - 0.12) < 0.008 ? Jd : Jk),
  });
  const hd = headPart(add, { id: 'B', skin: [176, 128, 104], beanie: [52, 54, 58], hair: [96, 92, 88], beard: [128, 122, 114] });
  parts.push({ ...hd, vs: 0.0055, at: head, axes: axesXY([0.92, 0.38, 0.05], [0, -0.08, 1]) });
  // left arm out on top of the bedding, hand resting on the chest
  const top2 = (x, z) => max(B1.top(x, z)[0], B2.top(x, z)[0]);
  // a forearm out on top, resting across the chest, the hand flat by the collarbone
  const e0 = [-0.24, 0, 0.3], w0 = [-0.03, 0, 0.45];
  e0[1] = top2(e0[0], e0[2]) + 0.03;
  w0[1] = top2(w0[0], w0[2]) + 0.035;
  const Cs = add('sleeve', [92, 62, 40], MCLS.FABRIC, 0.92, { vari: 0.07 });
  const Cr = add('sleeveRib', [64, 44, 30], MCLS.FABRIC, 0.92);
  parts.push({
    vs: 0.006, min: [-0.32, min(e0[1], w0[1]) - 0.08, 0.2], max: [0.04, max(e0[1], w0[1]) + 0.08, 0.52], fill: Cs,
    sdf: (x, y, z) => {
      // sleeve: soft, a little flattened where it lies, bunched in rings toward the cuff
      const ex = w0[0] - e0[0], ey = w0[1] - e0[1], ez = w0[2] - e0[2];
      const t = clamp(((x - e0[0]) * ex + (y - e0[1]) * ey + (z - e0[2]) * ez) / (ex * ex + ey * ey + ez * ez), 0, 1);
      // a slight bow, soft folds, flattened where it lies
      const bow = 0.012 * sin(PI * t);
      let d = cap(x, (y - bow) * 1.15 - e0[1] * 0.15, z, e0, w0, 0.05, 0.043);
      d += 0.005 * (n3(t * 9, 0, (x + z) * 12, 63) - 0.5);
      return d + 0.003 * (n3(x * 30, y * 30, z * 30, 61) - 0.5);
    },
    mat: (x, y, z) => {
      const ex = w0[0] - e0[0], ez = w0[2] - e0[2];
      const t = ((x - e0[0]) * ex + (z - e0[2]) * ez) / (ex * ex + ez * ez);
      return t > 0.88 ? Cr : n3(x * 16, y * 16, z * 16, 62) > 0.62 ? Cr : Cs;
    },
  });
  const hp = handPart(add, { id: 'B', glove: [44, 44, 46], skin: [176, 128, 104] });
  {
    // palm down on the blanket, fingers on along the forearm, a little curled
    const dx = w0[0] - e0[0], dz = w0[2] - e0[2], l = hypot(dx, dz);
    const hx = w0[0] + (dx / l) * 0.025, hz = w0[2] + (dz / l) * 0.025;
    parts.push({ ...hp, vs: 0.004, at: [hx, top2(hx, hz) + 0.004, hz], rot: [0.12, atan2(dx, dz), 0.1] });
  }
  // a bag of clothes on the deck by the bed
  parts.push({ ...garbageBag(add, 35, 1.05), vs: 0.012, at: [-0.72, -MH, -0.35], rot: [0, 0.8, 0] });
  // work boots sticking out at the foot end, toes up and falling outward
  parts.push({ ...shoe(add, 'boot', 7), vs: 0.006, at: [-0.14, 0.13, -1.0], axes: axesYZ([0, 0.15, 1], [-0.35, 0.94, 0]) });
  parts.push({ ...shoe(add, 'boot', 8), vs: 0.006, at: [0.15, 0.13, -0.95], axes: axesYZ([0, 0.2, 1], [0.45, 0.89, 0]) });
  return {
    P, parts,
    breath: (x, y, z) => exp(-(((z - 0.28) / 0.24) ** 2) - (x / 0.34) ** 2) * sstep(0.08, 0.22, y),
    amp: 0.006, period: 3.9, head, box: [[-0.8, -MH, -1.05], [0.8, 0.36, 1.0]],
  };
}

/** Sitting against a door, knees up, arms folded on the knees, head down on the arms, hood up. */
function doorSitter() {
  const { P, add } = palette();
  const parts = [];
  const pel = [0.06, 0.13, 0], low = [0.02, 0.24, 0], chest = [0.13, 0.4, 0], sh = [0.19, 0.47, 0];
  const head = [0.36, 0.665, 0.0];
  const hipL = [0.08, 0.13, -0.09], hipR = [0.08, 0.13, 0.09];
  const kneeL = [0.38, 0.47, -0.105], kneeR = [0.38, 0.47, 0.105];
  const ankL = [0.52, 0.1, -0.115], ankR = [0.52, 0.1, 0.12];
  const shL = [0.17, 0.48, -0.19], shR = [0.17, 0.48, 0.19];
  const elL = [0.36, 0.545, -0.22], elR = [0.36, 0.545, 0.22];
  const wrR = [0.47, 0.585, -0.09], wrL = [0.46, 0.605, 0.1];
  // puffer parka with the hood up
  const Pk = add('parka', [58, 64, 46], MCLS.PLASTIC, 0.62, { vari: 0.05 });
  const Pd = add('parkaSeam', [36, 40, 30], MCLS.PLASTIC, 0.7);
  const Pw = add('parkaWorn', [76, 80, 62], MCLS.PLASTIC, 0.7);
  const Fu = add('fur', [104, 96, 84], MCLS.FABRIC, 0.98, { vari: 0.12 });
  const Fd = add('furDark', [64, 58, 50], MCLS.FABRIC, 0.98, { vari: 0.1 });
  const Hl = add('hoodLining', [26, 26, 28], MCLS.FABRIC, 0.95);
  const hoodC = [0.33, 0.69, 0.0];
  const hoodOpen = (x, y, z) => {
    // the face opening looks down onto the arms
    const qx = x - head[0] - 0.035, qy = y - head[1] + 0.06, qz = z - head[2];
    return sdEllipsoid(qx, qy, qz, 0.1, 0.085, 0.085);
  };
  const channel = (y) => pow(abs(cos((PI * y) / 0.085)), 10);
  const parka = (x, y, z) => {
    let d = cap(x, y, z * 0.78, low, sh, 0.18, 0.2);
    d = smin(d, cap(x, y, z, [0.06, 0.15, 0], [0.08, 0.2, 0], 0.17, 0.18), 0.08);
    d = smin(d, cap(x, y, z, shL, elL, 0.075, 0.068), 0.05);
    d = smin(d, cap(x, y, z, shR, elR, 0.075, 0.068), 0.05);
    d = smin(d, cap(x, y, z, elL, wrL, 0.066, 0.058), 0.03);
    d = smin(d, cap(x, y, z, elR, wrR, 0.066, 0.058), 0.03);
    // hood
    d = smin(d, sdEllipsoid(x - hoodC[0], y - hoodC[1], z - hoodC[2], 0.135, 0.125, 0.125), 0.06);
    d = smax(d, -hoodOpen(x, y, z), 0.015);
    // hem over the hips; channel quilting; creases
    d = smax(d, 0.07 - y, 0.03);
    d += 0.005 * channel(y) * sstep(0.2, 0.0, abs(x - 0.1) - 0.12);
    d += 0.008 * (n3(x * 9, y * 9, z * 9, 71) - 0.5);
    return d;
  };
  parts.push({
    vs: 0.0105, min: [-0.2, 0.04, -0.35], max: [0.56, 0.84, 0.35], sdf: parka, fill: Pk,
    mat: (x, y, z) => {
      const o = hoodOpen(x, y, z);
      if (o < 0.035) return o < 0.012 ? Hl : n3(x * 45, y * 45, z * 45, 72) > 0.45 ? Fu : Fd;
      if (channel(y) > 0.6 && abs(x - 0.1) < 0.2) return Pd;
      return n3(x * 6, y * 6, z * 6, 73) > 0.66 ? Pw : Pk;
    },
  });
  // a fur ruff around the hood opening
  parts.push({
    vs: 0.0075, min: [0.2, 0.5, -0.17], max: [0.52, 0.78, 0.17], fill: Fu,
    sdf: (x, y, z) => {
      const o = hoodOpen(x, y, z);
      const shellD = parka(x, y, z);
      return max(abs(o - 0.01) - 0.012 - 0.008 * n3(x * 70, y * 70, z * 70, 74), shellD - 0.016);
    },
    mat: (x, y, z) => (n3(x * 60, y * 60, z * 60, 75) > 0.5 ? Fu : Fd),
  });
  // jeans
  const Dn = add('denim', [42, 54, 76], MCLS.FABRIC, 0.9, { vari: 0.06 });
  const Dw = add('denimWorn', [74, 88, 112], MCLS.FABRIC, 0.92);
  const Ds = add('denimSeam', [96, 82, 52], MCLS.FABRIC, 0.9);
  parts.push({
    vs: 0.0095, min: [0.0, 0.0, -0.24], max: [0.5, 0.58, 0.24], fill: Dn,
    sdf: (x, y, z) => {
      let d = smin(cap(x, y, z, hipL, kneeL, 0.1, 0.078), cap(x, y, z, hipR, kneeR, 0.1, 0.078), 0.04);
      d = smin(d, smin(cap(x, y, z, kneeL, ankL, 0.074, 0.062), cap(x, y, z, kneeR, ankR, 0.074, 0.062), 0.02), 0.03);
      d = smin(d, sdRoundBox(x - 0.07, y - 0.1, z, 0.12, 0.09, 0.15, 0.08), 0.05);
      return d + 0.004 * (n3(x * 20, y * 20, z * 20, 81) - 0.5);
    },
    mat: (x, y, z) => {
      if (abs(abs(z) - 0.17) < 0.006 && y < 0.45) return Ds;
      const kn = min(hypot(x - kneeL[0], y - kneeL[1], z - kneeL[2]), hypot(x - kneeR[0], y - kneeR[1], z - kneeR[2]));
      return kn < 0.07 && n3(x * 30, y * 30, z * 30, 82) > 0.4 ? Dw : Dn;
    },
  });
  // boots, flat on the ground
  parts.push({ ...shoe(add, 'boot', 9), vs: 0.006, at: [0.6, 0.0, -0.12], rot: [0, PI / 2 - 0.12, 0] });
  parts.push({ ...shoe(add, 'boot', 10), vs: 0.006, at: [0.6, 0.0, 0.125], rot: [0, PI / 2 + 0.1, 0] });
  // one gloved hand resting on the other forearm
  const hp = handPart(add, { id: 'C', glove: [24, 24, 26], skin: [92, 62, 48] });
  parts.push({ ...hp, vs: 0.004, at: [wrL[0] + 0.005, wrL[1] + 0.03, wrL[2] - 0.05], rot: [0.2, PI, -0.15] });
  // sitting on folded cardboard; backpack against the door frame; a coffee cup
  parts.push({ ...cardboard(add, 3, 0.26, 0.24, 1), vs: 0.008, at: [0.08, 0.012, 0.0], rot: [0, 0.1, 0] });
  parts.push({ ...backpack(add, [70, 30, 32], 0.14, 0.07, 0.2), vs: 0.008, at: [-0.12, 0.215, -0.3], axes: axesYZ([1, 0.15, -0.35], [-0.2, 1, 0]) });
  parts.push({ ...paperCup(add), vs: 0.005, at: [0.74, 0.0, 0.3], rot: [0, 0, 0] });
  return {
    P, parts,
    breath: (x, y, z) => exp(-(((y - 0.43) / 0.14) ** 2) - (((x - 0.1) / 0.16) ** 2)) * (abs(z) < 0.3 ? 1 : 0),
    amp: 0.004, period: 4.8, head, box: [[-0.2, 0, -0.5], [0.78, 0.82, 0.36]],
  };
}

// ───────────────────────── in the world ─────────────────────────

export class Sleepers {
  constructor(engine) {
    this.engine = engine;
    this.world = engine.world;
    this.list = [];
    this.ms = 0;
  }

  /** Top of the facade voxels at a point (the dock platform). */
  facadeTop(id, x, z) {
    const r = this.world.facadeData?.results.find((q) => q.facade.id === id);
    if (!r) return 0;
    const f = r.facade, g = r.grid;
    const sn = f.face === '+x' || f.face === '+z' ? 1 : -1;
    const su = f.face === '-x' || f.face === '+z' ? 1 : -1;
    const along = f.face === '+x' || f.face === '-x' ? z : x, across = f.face === '+x' || f.face === '-x' ? x : z;
    const i = Math.floor((su * (along - f.start)) / CV), k = Math.floor((sn * (across - f.plane)) / CV + r.kFront);
    let j = 0;
    while (j < g.ny && g.get(i, j, k)) j++;
    return r.base + j * CV;
  }

  async build() {
    const t0 = performance.now();
    const breathe = () => new Promise((r) => setTimeout(r, 0));
    const gh = (x, z) => this.world.groundHeight(x, z);
    const dockY = this.facadeTop('L2', -4.42, -39.4);
    const spots = [
      { make: dockSleeper, pos: [-4.42, dockY + 0.012, -39.35], yaw: 0, phase: 0.3 },
      { make: porchSleeper, pos: [4.68, Math.max(0, gh(4.68, -43.3)) + 0.027 + 0.16, -43.25], yaw: 0, phase: 2.1 },
      { make: doorSitter, pos: [-2.78, gh(-2.6, -7.875), -7.875], yaw: 0, phase: 1.2 },
    ];
    for (const sp of spots) {
      try {
        this.list.push(this.make(sp));
      } catch (e) {
        console.warn('sleeper failed', e);
      }
      await breathe();
    }
    this.belongings();
    this.ms = Math.round(performance.now() - t0);
    return this;
  }

  make(sp) {
    const fig = sp.make();
    const geos = [];
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    for (const part of fig.parts) {
      const geo = voxelize(fig.P, part);
      if (part.at) {
        if (part.axes) {
          const [X, Y, Z] = part.axes;
          m.makeBasis(new THREE.Vector3(...X), new THREE.Vector3(...Y), new THREE.Vector3(...Z)).setPosition(...part.at);
        } else {
          e.set(part.rot?.[0] ?? 0, part.rot?.[1] ?? 0, part.rot?.[2] ?? 0, 'YXZ');
          m.compose(new THREE.Vector3(...part.at), q.setFromEuler(e), new THREE.Vector3(1, 1, 1));
        }
        geo.applyMatrix4(m);
      }
      geos.push(geo);
    }
    // how much each vertex swells with a breath
    for (const g of geos) {
      const p = g.attributes.position.array;
      const b = new Float32Array(p.length / 3);
      for (let i = 0; i < b.length; i++) b[i] = fig.breath(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
      g.setAttribute('breath', new THREE.BufferAttribute(b, 1));
    }
    const geo = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    geo.computeBoundingSphere();
    const mat = createVoxelMaterial({ name: 'sleeper', breathe: true });
    if (this.engine.envMap) mat.envMap = this.engine.envMap;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'sleeper';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.set(...sp.pos);
    mesh.rotation.y = sp.yaw;
    mesh.layers.enable(LAYER_REFLECT);
    mesh.updateMatrixWorld(true);
    this.engine.scene.add(mesh);
    // solid for her and for thrown things (soft: bottles bounce off, they do not break)
    const [lo, hi] = fig.box;
    const box = new THREE.Box3(new THREE.Vector3(...lo), new THREE.Vector3(...hi));
    this.engine.litter?.addBox(box, mesh.matrixWorld.clone(), true);
    const c = box.getCenter(new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);
    const s = box.getSize(new THREE.Vector3());
    if (sp.pos[1] < 0.5) this.world.collision?.addRect(c.x, c.z, s.x / 2 + 0.02, s.z / 2 + 0.02, -sp.yaw, 0.02);
    const headW = new THREE.Vector3(...fig.head).applyMatrix4(mesh.matrixWorld);
    return { mesh, mat, fig, phase: sp.phase, head: headW, lastCycle: -1, tris: geo.index.count / 3 };
  }

  /** A shopping cart of possessions and a couple of bags by the porch bed. */
  belongings() {
    const scene = this.engine.scene, mat = this.world.props?.material;
    if (!mat) return;
    const put = (name, opts, seed, pos, yaw, collide) => {
      const gen = PROPS[name];
      if (!gen) return;
      try {
        const res = gen(new RNG(seed), opts);
        const mesh = new THREE.Mesh(meshModel(res.model), mat);
        mesh.position.set(...pos);
        mesh.rotation.y = yaw;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.layers.enable(LAYER_REFLECT);
        scene.add(mesh);
        for (const p of res.parts ?? []) {
          if (p.emissive) continue;
          const pm = new THREE.Mesh(meshModel(p.model), mat);
          pm.position.fromArray(p.position ?? [0, 0, 0]);
          pm.rotation.set(...(p.rotation ?? [0, 0, 0]));
          mesh.add(pm);
        }
        mesh.updateMatrixWorld(true);
        const fp = res.meta?.footprint;
        if (collide && fp) this.world.collision?.addRect(pos[0], pos[2], fp[0] / 2, fp[1] / 2, -yaw, 0.02);
        const bb = new THREE.Box3().setFromObject(mesh);
        if (!bb.isEmpty()) {
          const lb = bb.clone().applyMatrix4(mesh.matrixWorld.clone().invert());
          this.engine.litter?.addBox(lb, mesh.matrixWorld.clone(), false);
        }
      } catch (e) {
        console.warn('belongings failed', name, e);
      }
    };
    const gh = (x, z) => Math.max(0, this.world.groundHeight(x, z));
    put('shoppingCart', { tipped: false }, 902, [4.55, gh(4.55, -45.35), -45.35], 0.35, true);
  }

  update(dt, t) {
    const cam = this.engine.camera.position;
    for (const s of this.list) {
      const P = s.fig.period;
      const ph = (t + s.phase * P) / P;
      const cyc = Math.floor(ph), u = ph - cyc;
      // in over ~40% of the cycle, a short pause, out slowly
      const b = u < 0.4 ? sstep(0, 0.4, u) : u < 0.47 ? 1 : 1 - sstep(0.47, 1, u);
      s.mat.userData.uniforms.uBreath.value = s.fig.amp * b;
      if (cyc !== s.lastCycle) {
        s.lastCycle = cyc;
        const d = cam.distanceTo(s.head);
        if (d < 7) this.engine.audio?.oneShot?.('sleepBreath', { position: s.head, strength: 0.6 });
      }
    }
  }
}
