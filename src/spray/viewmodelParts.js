// Voxel parts for the first-person spray-paint viewmodel: the 400 ml aerosol
// can, its four actuator ("cap") variants, a woman's right hand (palm + 15
// finger/thumb segments for a small rig) and the leather jacket sleeve.
//
// Every part is voxelized from a signed distance field in its own local frame
// (meters), meshed with the game's greedy mesher (baked AO), and then the SDF
// gradient is blended into the flat face normals. Silhouettes keep their voxel
// steps, while fingers, nails, the can body and the leather folds shade as
// round forms instead of boxes.
import { VoxelGrid, Palette, VoxelModel } from '../voxel/VoxelGrid.js';
import { meshModel } from '../voxel/mesher.js';
import { MCLS } from '../render/voxelMaterial.js';
import { hash3i } from '../core/rng.js';

const { sqrt, abs, min, max, floor, sin, cos, atan2, exp, PI } = Math;
const TAU = PI * 2;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const mix = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const rnd3 = (x, y, z, s) => hash3i(x, y, z, s) / 4294967296;

// ───────────────────────────── SDF primitives ─────────────────────────────

/** Polynomial smooth minimum (blend radius k). */
export function smin(a, b, k) {
  const h = max(k - abs(a - b), 0) / k;
  return min(a, b) - h * h * k * 0.25;
}

/** Round cone along +Y: sphere r1 at y=0, sphere r2 at y=h. */
function sdRoundConeY(x, y, z, r1, r2, h) {
  const b = (r1 - r2) / h;
  const a = sqrt(1 - b * b);
  const qx = sqrt(x * x + z * z);
  const k = -b * qx + a * y;
  if (k < 0) return sqrt(qx * qx + y * y) - r1;
  if (k > a * h) return sqrt(qx * qx + (y - h) * (y - h)) - r2;
  return qx * a + y * b - r1;
}

/** Round cone between arbitrary points a (radius r1) and b (radius r2). */
function sdRoundCone(px, py, pz, ax, ay, az, bx, by, bz, r1, r2) {
  const bax = bx - ax, bay = by - ay, baz = bz - az;
  const l2 = bax * bax + bay * bay + baz * baz;
  const rr = r1 - r2;
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;
  const pax = px - ax, pay = py - ay, paz = pz - az;
  const y = pax * bax + pay * bay + paz * baz;
  const z = y - l2;
  const qx = pax * l2 - bax * y, qy = pay * l2 - bay * y, qz = paz * l2 - baz * y;
  const x2 = qx * qx + qy * qy + qz * qz;
  const y2 = y * y * l2;
  const z2 = z * z * l2;
  const k = Math.sign(rr) * rr * rr * x2;
  if (Math.sign(z) * a2 * z2 > k) return sqrt(x2 + z2) * il2 - r2;
  if (Math.sign(y) * a2 * y2 < k) return sqrt(x2 + y2) * il2 - r1;
  return (sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
}

/** Approximate ellipsoid distance (axis aligned, centered at the origin). */
function sdEllipsoid(x, y, z, rx, ry, rz) {
  const k0 = sqrt((x / rx) ** 2 + (y / ry) ** 2 + (z / rz) ** 2);
  const k1 = sqrt((x / (rx * rx)) ** 2 + (y / (ry * ry)) ** 2 + (z / (rz * rz)) ** 2);
  return k1 > 0 ? (k0 * (k0 - 1)) / k1 : -min(rx, ry, rz);
}

/** Rounded box (half extents hx,hy,hz, corner radius r), centered at the origin. */
function sdRoundBox(x, y, z, hx, hy, hz, r) {
  const qx = abs(x) - hx + r, qy = abs(y) - hy + r, qz = abs(z) - hz + r;
  const ox = max(qx, 0), oy = max(qy, 0), oz = max(qz, 0);
  return sqrt(ox * ox + oy * oy + oz * oz) + min(max(qx, max(qy, qz)), 0) - r;
}

/** 2D rounded box (profile space). */
function sdRoundBox2(x, y, hx, hy, r) {
  const qx = abs(x) - hx + r, qy = abs(y) - hy + r;
  const ox = max(qx, 0), oy = max(qy, 0);
  return sqrt(ox * ox + oy * oy) + min(max(qx, qy), 0) - r;
}

/** 2D ellipse distance approximation. */
function sdEllipse2(x, y, rx, ry) {
  const k0 = sqrt((x / rx) ** 2 + (y / ry) ** 2);
  const k1 = sqrt((x / (rx * rx)) ** 2 + (y / (ry * ry)) ** 2);
  return k1 > 0 ? (k0 * (k0 - 1)) / k1 : -min(rx, ry);
}

/** Smooth 3D value noise in [0,1] (lattice spacing 1). */
function vnoise3(x, y, z, seed) {
  const xi = floor(x), yi = floor(y), zi = floor(z);
  let u = x - xi, v = y - yi, w = z - zi;
  u = u * u * (3 - 2 * u);
  v = v * v * (3 - 2 * v);
  w = w * w * (3 - 2 * w);
  const a = rnd3(xi, yi, zi, seed), b = rnd3(xi + 1, yi, zi, seed);
  const c = rnd3(xi, yi + 1, zi, seed), d = rnd3(xi + 1, yi + 1, zi, seed);
  const e = rnd3(xi, yi, zi + 1, seed), f = rnd3(xi + 1, yi, zi + 1, seed);
  const g = rnd3(xi, yi + 1, zi + 1, seed), h = rnd3(xi + 1, yi + 1, zi + 1, seed);
  const x0 = a + (b - a) * u, x1 = c + (d - c) * u, x2 = e + (f - e) * u, x3 = g + (h - g) * u;
  const y0 = x0 + (x1 - x0) * v, y1 = x2 + (x3 - x2) * v;
  return y0 + (y1 - y0) * w;
}

// ───────────────────────────── voxelize + mesh ─────────────────────────────

/**
 * Voxelizes sdf (<= 0 inside) over [bmin, bmax) at voxel size vs, assigns
 * palette indices with mat(x,y,z,d,i,j,k) (0 leaves the voxel empty), meshes it
 * and blends the SDF gradient into the face normals (smooth 0..1).
 */
export function buildPart(P, { vs, min: bmin, max: bmax, sdf, mat, deep = 0, smooth = 0.7, normalSdf = null }) {
  const nx = Math.max(1, Math.ceil((bmax[0] - bmin[0]) / vs - 1e-6));
  const ny = Math.max(1, Math.ceil((bmax[1] - bmin[1]) / vs - 1e-6));
  const nz = Math.max(1, Math.ceil((bmax[2] - bmin[2]) / vs - 1e-6));
  const g = new VoxelGrid(nx, ny, nz);
  const data = g.data;
  const deepD = -1.6 * vs;
  let n = 0;
  let idx = 0;
  for (let k = 0; k < nz; k++) {
    const z = bmin[2] + (k + 0.5) * vs;
    for (let j = 0; j < ny; j++) {
      const y = bmin[1] + (j + 0.5) * vs;
      for (let i = 0; i < nx; i++, idx++) {
        const x = bmin[0] + (i + 0.5) * vs;
        const d = sdf(x, y, z);
        if (d > 0) continue;
        const m = deep && d < deepD ? deep : mat(x, y, z, d, i, j, k);
        if (m) {
          data[idx] = m;
          n++;
        }
      }
    }
  }
  const geo = meshModel(new VoxelModel(g, P, vs, bmin));
  if (smooth > 0) smoothNormals(geo, normalSdf ?? sdf, smooth, vs * 0.75);
  geo.userData.voxels = n;
  return geo;
}

/** Blend the SDF gradient into the mesher's flat normals (Int8 attribute). */
export function smoothNormals(geo, sdf, k, eps) {
  const pa = geo.attributes.position.array;
  const na = geo.attributes.normal.array;
  const nv = pa.length / 3;
  for (let i = 0; i < nv; i++) {
    const x = pa[i * 3], y = pa[i * 3 + 1], z = pa[i * 3 + 2];
    const fx = na[i * 3] / 127, fy = na[i * 3 + 1] / 127, fz = na[i * 3 + 2] / 127;
    const f1 = sdf(x + eps, y - eps, z - eps);
    const f2 = sdf(x - eps, y - eps, z + eps);
    const f3 = sdf(x - eps, y + eps, z - eps);
    const f4 = sdf(x + eps, y + eps, z + eps);
    let gx = f1 - f2 - f3 + f4, gy = -f1 - f2 + f3 + f4, gz = -f1 + f2 - f3 + f4;
    const gl = sqrt(gx * gx + gy * gy + gz * gz);
    if (!(gl > 1e-12)) continue;
    gx /= gl;
    gy /= gl;
    gz /= gl;
    const dt = gx * fx + gy * fy + gz * fz;
    if (dt < 0.05) continue; // gradient disagrees with the face (thin feature): keep it flat
    const kk = k * sstep(0.05, 0.45, dt);
    let ox = fx * (1 - kk) + gx * kk, oy = fy * (1 - kk) + gy * kk, oz = fz * (1 - kk) + gz * kk;
    const ol = sqrt(ox * ox + oy * oy + oz * oz) || 1;
    ox /= ol;
    oy /= ol;
    oz /= ol;
    na[i * 3] = Math.round(ox * 127);
    na[i * 3 + 1] = Math.round(oy * 127);
    na[i * 3 + 2] = Math.round(oz * 127);
  }
  geo.attributes.normal.needsUpdate = true;
}

// ───────────────────────────── palette ─────────────────────────────

/** Paint shades for TINT voxels: grey 128 = the current paint colour. */
export const TINT_SHADES = [56, 80, 104, 128, 152, 176, 200];

export function createPalette() {
  const P = new Palette();
  const S = MCLS.SKIN;
  // skin (Body.js skin [196,150,128]) with a few anatomical shade shifts
  P.add('skin', { color: [196, 150, 128], rough: 0.55, cls: S, vari: 0.03 });
  P.add('skinDorsal', { color: [192, 144, 122], rough: 0.5, cls: S, vari: 0.035 });
  P.add('skinKnuckle', { color: [189, 133, 116], rough: 0.52, cls: S, vari: 0.04 });
  P.add('skinPalm', { color: [206, 160, 140], rough: 0.6, cls: S, vari: 0.03 });
  P.add('skinCrease', { color: [150, 100, 86], rough: 0.65, cls: S, vari: 0.03 });
  P.add('skinTip', { color: [204, 146, 128], rough: 0.5, cls: S, vari: 0.03 });
  // dark red glossy nail polish, worn at the free edge
  P.add('nail', { color: [92, 24, 30], rough: 0.25, cls: MCLS.GENERIC, vari: 0.02 });
  P.add('nailHi', { color: [104, 28, 34], rough: 0.2, cls: MCLS.GENERIC, vari: 0.02 });
  P.add('nailWorn', { color: [206, 176, 164], rough: 0.4, cls: MCLS.GENERIC, vari: 0.04 });
  P.add('ring', { color: [206, 206, 210], rough: 0.18, metal: 1, cls: MCLS.GENERIC, vari: 0.0 });
  // black leather jacket (Body.js values)
  P.add('leather', { color: [27, 25, 26], rough: 0.32, cls: MCLS.LEATHER, vari: 0.08 });
  P.add('leatherCrease', { color: [14, 13, 14], rough: 0.45, cls: MCLS.LEATHER, vari: 0.05 });
  P.add('leatherEdge', { color: [36, 33, 33], rough: 0.36, cls: MCLS.LEATHER, vari: 0.06 });
  P.add('lining', { color: [9, 9, 11], rough: 0.92, cls: MCLS.FABRIC, vari: 0.05 });
  P.add('stitch', { color: [44, 42, 42], rough: 0.7, cls: MCLS.FABRIC, vari: 0.05 });
  P.add('zip', { color: [120, 116, 108], rough: 0.3, metal: 0.9, cls: MCLS.GENERIC, vari: 0.05 });
  P.add('zipDark', { color: [66, 64, 60], rough: 0.38, metal: 0.85, cls: MCLS.GENERIC, vari: 0.05 });
  // can: tinplate + printed label
  P.add('tin', { color: [178, 178, 172], rough: 0.24, metal: 0.95, cls: MCLS.GENERIC, vari: 0.03 });
  P.add('tinDark', { color: [118, 118, 114], rough: 0.34, metal: 0.92, cls: MCLS.GENERIC, vari: 0.04 });
  P.add('tinScratch', { color: [206, 206, 200], rough: 0.32, metal: 0.95, cls: MCLS.GENERIC, vari: 0.05 });
  P.add('printBlack', { color: [17, 17, 19], rough: 0.36, cls: MCLS.GENERIC, vari: 0.02 });
  P.add('printWhite', { color: [214, 212, 204], rough: 0.36, cls: MCLS.GENERIC, vari: 0.015 });
  P.add('printGrey', { color: [112, 112, 110], rough: 0.38, cls: MCLS.GENERIC, vari: 0.02 });
  P.add('printYellow', { color: [226, 190, 40], rough: 0.36, cls: MCLS.GENERIC, vari: 0.02 });
  for (const g of TINT_SHADES) P.add(`t${g}`, { color: [g, g, g], rough: 0.32, cls: MCLS.TINT, vari: 0.025 });
  // dried drips of other colours (old fills)
  P.add('dryBlue', { color: [36, 74, 156], rough: 0.5, cls: MCLS.GENERIC, vari: 0.06 });
  P.add('dryWhite', { color: [214, 212, 202], rough: 0.5, cls: MCLS.GENERIC, vari: 0.05 });
  P.add('dryOrange', { color: [214, 104, 30], rough: 0.5, cls: MCLS.GENERIC, vari: 0.06 });
  P.add('dryGreen', { color: [38, 136, 84], rough: 0.5, cls: MCLS.GENERIC, vari: 0.06 });
  P.add('dryBlack', { color: [22, 22, 24], rough: 0.5, cls: MCLS.GENERIC, vari: 0.05 });
  // actuators
  P.add('capWhite', { color: [224, 222, 216], rough: 0.42, cls: MCLS.PLASTIC, vari: 0.015 });
  P.add('capCream', { color: [222, 210, 182], rough: 0.42, cls: MCLS.PLASTIC, vari: 0.015 });
  P.add('capBlack', { color: [19, 19, 21], rough: 0.38, cls: MCLS.PLASTIC, vari: 0.03 });
  P.add('capGrey', { color: [96, 98, 102], rough: 0.4, cls: MCLS.PLASTIC, vari: 0.02 });
  P.add('capLight', { color: [168, 170, 172], rough: 0.4, cls: MCLS.PLASTIC, vari: 0.02 });
  P.add('capPink', { color: [238, 92, 152], rough: 0.36, cls: MCLS.PLASTIC, vari: 0.02 });
  P.add('orifice', { color: [5, 5, 6], rough: 0.85, cls: MCLS.GENERIC, vari: 0.0 });
  P.add('stem', { color: [206, 204, 198], rough: 0.45, cls: MCLS.PLASTIC, vari: 0.02 });
  return P;
}

// ───────────────────────────── the can ─────────────────────────────
// Can frame: origin at the bottom centre, +Y along the axis, the nozzle sprays
// toward -Z. Label angle u in [0,1): u = 0 at +Z (back), 0.25 at -X (left),
// 0.5 at -Z (front, nozzle side), 0.75 at +X (right).

export const CAN = {
  vs: 0.002,
  R: 0.0325,
  bodyY0: 0.0045,
  bodyY1: 0.1845,
  seamY: 0.186,
  domeY: 0.1865,
  curlR: 0.0136,
  curlY: 0.2062,
  stemTop: 0.2125,
  seat: 0.2112, // actuator bottom at rest
  travel: 0.0025, // actuator travel at full press
};

function canProfile(r, y) {
  // body
  let d = sdRoundBox2(r, y - 0.0945, 0.0325, 0.09, 0.001);
  // bottom chime and top double seam (one voxel proud)
  d = min(d, sdRoundBox2(r, y - 0.0022, 0.0339, 0.0021, 0.0012));
  d = min(d, sdRoundBox2(r, y - CAN.seamY, 0.0342, 0.0024, 0.0012));
  // domed shoulder up to the valve cup opening
  if (y > CAN.domeY - 0.002) {
    let dd = sdEllipse2(r, y - CAN.domeY, 0.0319, 0.0215);
    dd = max(dd, CAN.domeY - 0.002 - y);
    dd = max(dd, CAN.curlR - 0.0005 - r);
    d = min(d, dd);
  }
  // valve cup: rolled curl, recessed dish, crimped pedestal, stem
  d = min(d, sqrt((r - CAN.curlR) ** 2 + (y - CAN.curlY) ** 2) - 0.0024);
  d = min(d, sdRoundBox2(r, y - 0.2025, 0.0122, 0.0022, 0.0008));
  d = min(d, sdRoundBox2(r, y - 0.2045, 0.0064, 0.0037, 0.0016));
  d = min(d, sdRoundBox2(r, y - 0.2092, 0.0019, 0.0034, 0.0004));
  return d;
}

// tiny pixel font for label "text" (3x5 digits)
const DIGITS = {
  0: ['111', '101', '101', '101', '111'],
  1: ['010', '110', '010', '010', '111'],
  2: ['111', '001', '111', '100', '111'],
  3: ['111', '001', '011', '001', '111'],
  4: ['101', '101', '111', '001', '001'],
  5: ['111', '100', '111', '001', '111'],
  6: ['111', '100', '111', '101', '111'],
  7: ['111', '001', '010', '010', '010'],
  8: ['111', '101', '111', '101', '111'],
  9: ['111', '101', '111', '001', '111'],
};

/** Paint-coloured label with neutral print. u around the can (see above), y in meters. */
function makeLabel(P) {
  const M = (n) => P.get(n);
  const T = (g) => P.get(`t${g}`);
  const C = TAU * CAN.R; // circumference
  const black = M('printBlack'), white = M('printWhite'), grey = M('printGrey'), yellow = M('printYellow');
  // text: rows of short "words" (random gaps) in 2 mm columns
  const dash = (col, row, seed, density = 0.75) => rnd3(col, row, seed, 91) < density && rnd3(floor(col / 4), row, seed, 77) > 0.1;
  return (u, y) => {
    const mm = y * 1000;
    const su = ((u + 0.5) % 1) - 0.5; // -0.5..0.5, 0 = back (facing the viewer at rest)
    const au = abs(su);
    const col = floor(u * C / 0.002); // ~2 mm columns around
    const row = floor(mm / 2);
    // ── top band: black with white "name" dashes and a thin tint pinstripe
    if (mm >= 166) {
      if (mm >= 178) return black;
      if (mm >= 174 && mm < 176) return au < 0.3 ? T(128) : black;
      if (mm >= 168 && mm < 172 && au > 0.06 && au < 0.27) return dash(col, row, 3, 0.8) ? white : black;
      return black;
    }
    if (mm >= 162) return T(56);
    if (mm >= 160) return white;
    // ── bottom band
    if (mm < 24) {
      if (mm < 10) return black;
      if (mm >= 18 && mm < 20) return T(128);
      if (mm >= 12 && mm < 14 && (au < 0.22 || au > 0.3)) return dash(col, row, 5, 0.75) ? white : black;
      return black;
    }
    if (mm < 26) return white;
    // ── info panel on the hand side (white, black text, barcode, pictograms)
    const ip = su < -0.21 && su > -0.47; // right-front quadrant, under the palm
    if (ip) {
      const lu = (-0.21 - su) / 0.26; // 0..1 across the panel
      if (lu < 0.04 || lu > 0.96) return black;
      if (mm > 30 && mm < 50 && lu > 0.12 && lu < 0.5) {
        // barcode
        const b = floor(lu * C * 0.26 / 0.002 * 1.0);
        return rnd3(b, 0, 0, 13) > 0.45 ? black : white;
      }
      if (mm > 56 && mm < 66 && lu > 0.12 && lu < 0.85) {
        // warning pictograms: three small framed squares
        const cell = floor((lu - 0.12) / 0.25);
        const cu = ((lu - 0.12) / 0.25) % 1;
        const cv = (mm - 56) / 10;
        if (cell > 2) return white;
        if (cu > 0.72) return white;
        const edge = cu < 0.14 || cu > 0.58 || cv < 0.2 || cv > 0.8;
        if (edge) return cell === 1 ? yellow : black;
        return cell === 1 ? black : (rnd3(cell, floor(cv * 4), floor(cu * 4), 5) > 0.5 ? black : white);
      }
      if (mm > 72 && mm < 150 && lu > 0.1 && lu < 0.9) {
        // paragraphs of small text
        if (row % 2 === 1) return white;
        if (mm > 108 && mm < 114) return white;
        return dash(col, row, 9, 0.84) ? black : white;
      }
      return white;
    }
    // vertical black dividers either side of the info panel
    if (abs(su + 0.205) < 0.012 || abs(su + 0.475) < 0.012) return black;
    // ── colour field: the big swatch (back, facing the viewer) wraps the rest
    // diagonal speed stripes across the lower part
    if (mm < 56) {
      const s = (u * C * 1000 + mm * 1.0) % 18;
      if (s < 5) return T(80);
      if (s < 7) return T(176);
      return T(128);
    }
    if (mm < 58) return black;
    // code block: black tag with blocky white digits on the swatch
    if (mm >= 128 && mm < 152 && su > -0.17 && su < 0.11) {
      const lu = (0.11 - su) / 0.28; // 0..1, left to right as seen from behind
      const cx = floor(lu * 0.28 * C / 0.002); // voxel column inside the tag
      const cyy = floor((152 - mm) / 2); // row from the top
      const digitsStr = '470';
      const gx = cx - 2, gy = cyy - 1;
      if (gy >= 0 && gy < 10 && gx >= 0) {
        const di = floor(gx / 8);
        const px = floor((gx % 8) / 2), py = floor(gy / 2);
        if (di < digitsStr.length && px < 3 && DIGITS[digitsStr[di]][py][px] === '1') return white;
      }
      return black;
    }
    // vertical gloss stripe and a fine dark pinstripe on the swatch
    if (su > 0.08 && su < 0.115) return T(176);
    if (su > 0.125 && su < 0.135) return T(200);
    if (su < -0.3 && su > -0.315) return T(56);
    // round colour dot with white ring under the code tag
    {
      const du = (su + 0.03) * C * 1000, dv = mm - 112;
      const rr = sqrt(du * du + dv * dv);
      if (rr < 7) return T(152);
      if (rr < 9.5) return white;
    }
    // soft vertical shading in the print (lighter toward the shoulder)
    if (mm > 132) return T(152);
    return T(128);
  };
}

/** Builds the can body (no actuator). Returns { geometry, info }. */
export function buildCan(P, opts = {}) {
  const M = (n) => P.get(n);
  const label = makeLabel(P);
  const tin = M('tin'), tinDark = M('tinDark'), scratch = M('tinScratch'), stem = M('stem');
  const dry = ['dryBlue', 'dryWhite', 'dryOrange', 'dryGreen', 'dryBlack'].map(M);
  const R = CAN.R;
  // dried drips (other colours) running down from the shoulder seam: [u, yEnd(mm), colour]
  const drips = [
    [0.035, 158, 1], [0.11, 171, 2], [0.62, 149, 0], [0.9, 164, 3], [0.97, 176, 2], [0.4, 168, 4],
  ];
  // overspray of the current colour, densest just below the nozzle (front, u=0.5)
  const sdf = (x, y, z) => canProfile(sqrt(x * x + z * z), y);
  const mat = (x, y, z, d, i, j, k) => {
    const r = sqrt(x * x + z * z);
    const u = (atan2(-x, z) / TAU + 1) % 1;
    const mm = y * 1000;
    const h = rnd3(i, j, k, 31);
    // stem (white plastic)
    if (r < 0.0024 && y > 0.207) return stem;
    // wear: dried paint drips and crust (on body, seam and dome)
    for (const [du, yEnd, c] of drips) {
      const dd = abs(((u - du + 1.5) % 1) - 0.5) * TAU * R * 1000; // mm along the circumference
      const bulb = mm > yEnd - 2.5 && mm < yEnd + 1 && dd < 2.4;
      if ((dd < 1.2 && mm > yEnd && mm < 197) || bulb) {
        if (r > R - 0.002 || y > CAN.bodyY1) return dry[c];
      }
    }
    // dome / seam / cup: tinplate with dried crust ring and fresh overspray at the front
    if (y > CAN.bodyY1 - 0.0005) {
      const front = abs(u - 0.5); // 0 at the nozzle side
      const fresh = exp(-front * 7) * sstep(0.188, 0.207, y) * 0.75;
      if (h < fresh * 0.6) return M(`t${[104, 128, 152, 128][floor(h * 97) % 4]}`);
      if (r < CAN.curlR + 0.004 && r > CAN.curlR - 0.0035 && y > 0.203) {
        // crust of old colours around the cup curl
        const c = rnd3(floor(u * 40), 0, 0, 51);
        if (c < 0.35) return dry[floor(c * 14) % 5];
      }
      if (y < CAN.seamY + 0.0026 && y > CAN.seamY - 0.0026 && r > 0.0328) return h < 0.08 ? scratch : tin;
      if (r < 0.0125 && y < 0.2042) return tinDark;
      return h < 0.04 ? scratch : tin;
    }
    // bottom chime
    if (y < CAN.bodyY0 + 0.0005) return h < 0.18 ? scratch : tinDark;
    if (r < R - 0.0022) return tinDark; // interior (hidden)
    // unprinted bands next to the seams
    if (mm < 8 || mm > 180) return h < 0.05 ? scratch : tin;
    // scuffs: print worn to bare metal, concentrated near the bottom and on the
    // edge that rubs in a bag; a few thin vertical scratches
    const wearN = vnoise3(u * 30, mm * 0.11, 0, 7);
    const wearBias = sstep(40, 10, mm) * 0.35 + sstep(0.3, 0.0, abs(((u - 0.82 + 1.5) % 1) - 0.5)) * 0.12;
    if (wearN + wearBias > 0.9 || (h < 0.02 && wearN > 0.55)) return scratch;
    const sc = rnd3(floor(u * 160), floor(mm / 9), 0, 23);
    if (sc < 0.012) return scratch;
    return label(u, y);
  };
  const geometry = buildPart(P, {
    vs: CAN.vs,
    min: [-0.036, 0, -0.036],
    max: [0.036, 0.2132, 0.036],
    sdf,
    mat,
    deep: tinDark,
    smooth: opts.smooth ?? 0.62,
  });
  return { geometry, sdf };
}

// ───────────────────────────── actuators ─────────────────────────────
// Actuator frame: origin at the bottom centre (sits on the valve stem), +Y up,
// nozzle orifice facing -Z (perpendicular to the can axis).

export const CAPS = {
  skinny: { h: 0.0115, tip: [0, 0.0072, -0.0064], radius: 0.0055 },
  standard: { h: 0.0128, tip: [0, 0.0084, -0.0084], radius: 0.0066 },
  fat: { h: 0.012, tip: [0, 0.007, -0.0091], radius: 0.0085 },
  calligraphy: { h: 0.0084, tip: [0, 0.0044, -0.0068], radius: 0.0075 },
};
export const CAP_TYPES = Object.keys(CAPS);
const CAP_VS = 0.001;

export function buildCap(P, type) {
  const M = (n) => P.get(n);
  const c = CAPS[type];
  const orifice = M('orifice');
  let sdf, body, accent;
  if (type === 'skinny') {
    body = M('capWhite');
    accent = M('capPink');
    sdf = (x, y, z) => {
      const r = sqrt(x * x + z * z);
      let d = sdRoundBox2(r, y - 0.00575, 0.0055, 0.00575, 0.0018);
      d = max(d, -(sqrt(x * x + (y - 0.0207) ** 2 + z * z) - 0.0096)); // finger dimple
      // pink nozzle insert proud of the front face
      d = min(d, sdRoundBox(x, y - 0.0072, z + 0.0053, 0.0019, 0.0019, 0.0011, 0.0008));
      return d;
    };
  } else if (type === 'standard') {
    body = M('capBlack');
    accent = M('capLight');
    sdf = (x, y, z) => {
      const r = sqrt(x * x + z * z);
      let d = sdRoundBox2(r, y - 0.0064, 0.0066, 0.0064, 0.002);
      d = max(d, -(sqrt(x * x + (y - 0.0215) ** 2 + z * z) - 0.0092));
      // ribbed grip ring near the base
      d = max(d, -sdRoundBox2(r - 0.0067, y - 0.0024, 0.0006, 0.0006, 0.0002));
      // moulded nozzle boss
      d = min(d, sdRoundCone(x, y, z, 0, 0.0084, -0.004, 0, 0.0084, -0.0062, 0.0024, 0.0022));
      return d;
    };
  } else if (type === 'fat') {
    body = M('capWhite');
    accent = M('capCream');
    sdf = (x, y, z) => {
      const r = sqrt(x * x + z * z);
      const taper = 0.0085 - (y / 0.012) * 0.0006;
      let d = sdRoundBox2(r - (taper - 0.0085), y - 0.006, 0.0085, 0.006, 0.0022);
      d = max(d, -(sqrt(x * x + (y - 0.0245) ** 2 + z * z) - 0.0128));
      d = min(d, sdRoundBox(x, y - 0.007, z + 0.0079, 0.0029, 0.0029, 0.0012, 0.0012));
      return d;
    };
  } else {
    body = M('capGrey');
    accent = M('capLight');
    sdf = (x, y, z) => {
      let d = sdRoundBox(x, y - 0.0042, z, 0.0075, 0.0042, 0.0068, 0.0022);
      // horizontal slit nozzle on the front face
      d = max(d, -sdRoundBox(x, y - 0.0044, z + 0.0072, 0.0046, 0.0006, 0.0013, 0.0002));
      return d;
    };
  }
  const tip = c.tip;
  const mat = (x, y, z, d, i, j, k) => {
    const h = rnd3(i, j, k, 61 + type.length);
    const dx = x - tip[0], dy = y - tip[1];
    const front = z < tip[2] + 0.0028;
    // orifice
    if (type === 'calligraphy') {
      if (front && abs(dx) < 0.0048 && abs(dy) < 0.0011 && z < tip[2] + 0.002) return orifice;
    } else {
      const hole = type === 'fat' ? 0.0011 : 0.0006;
      if (front && abs(dx) < hole + 0.0002 && abs(dy) < hole + 0.0002) return orifice;
      if (front && abs(dx) < 0.0021 && abs(dy) < 0.0021 && type !== 'standard') return accent;
      if (front && type === 'standard' && sqrt(dx * dx + dy * dy) < 0.0017) return accent;
    }
    // fresh overspray of the current colour around the nozzle and on the top front edge
    const rr = sqrt(dx * dx + dy * dy * 1.6);
    const spray = (front ? exp(-rr / 0.0024) * 0.85 : 0) + (z < -0.002 && y > c.h - 0.0025 ? 0.18 : 0);
    if (h < spray * 0.55) return P.get(`t${[104, 128, 152, 128, 80][floor(h * 131) % 5]}`);
    if (type === 'skinny' && y > c.h - 0.0012 && x * x + z * z < 0.0016 ** 2) return accent; // pink dot on top
    return body;
  };
  const geometry = buildPart(P, {
    vs: CAP_VS,
    min: [-0.012, 0, -0.012],
    max: [0.012, 0.0146, 0.012],
    sdf,
    mat,
    smooth: 0.55,
  });
  return { geometry, info: c };
}

// ───────────────────────────── the hand ─────────────────────────────
// Hand frame (right hand): origin at the wrist joint centre, +Y distal (toward
// the middle fingertip), +Z dorsal (back of the hand), +X ulnar (little-finger
// side). Wrist to middle fingertip ≈ 17.6 cm, palm ≈ 7.5 cm wide.
//
// Finger segment frames: origin at the proximal joint, +Y along the bone, +Z
// dorsal (nail side), +X ulnar. Flexion = rotation about -X.

export const HAND_VS = 0.002;

export const HAND = {
  fingers: {
    index: { mcp: [-0.0252, 0.0838, 0.0012], splay: 0.06, len: [0.0405, 0.024, 0.0205], w: [0.0081, 0.0073, 0.0065, 0.0055] },
    middle: { mcp: [-0.0083, 0.0872, 0.0012], splay: 0.0, len: [0.0435, 0.0265, 0.0205], w: [0.0083, 0.0075, 0.0066, 0.0056] },
    ring: { mcp: [0.0086, 0.0832, -0.0008], splay: -0.05, len: [0.041, 0.0258, 0.0198], w: [0.0078, 0.0071, 0.0063, 0.0053] },
    little: { mcp: [0.0236, 0.0745, -0.0042], splay: -0.12, len: [0.032, 0.0192, 0.0182], w: [0.0069, 0.0063, 0.0057, 0.0049] },
  },
  // thumb: metacarpal (CMC -> MCP), proximal, distal
  thumb: { cmc: [-0.0195, 0.0145, -0.0085], len: [0.040, 0.0295, 0.0255], w: [0.0118, 0.0095, 0.0086, 0.0071, 0.006] },
  thickness: 0.87, // dorsal-palmar thickness / width of the fingers
  ringFinger: 'index', // thin silver ring (proximal phalanx)
};

/** Segment shape: finger/thumb phalanx along +Y with an elliptical section. */
function phalanxSdf(L, w0, w1, kind) {
  const s = 1 / HAND.thickness; // z scale (flatter dorsal-palmar)
  const r0 = kind === 'prox' || kind === 'meta' ? w0 * 0.97 : w0 * 0.93; // seat inside the parent's knuckle
  const tip = kind === 'dist' || kind === 'tdist';
  const h = tip ? L - w1 : L;
  return (x, y, z) => {
    const zz = z * s;
    let d = sdRoundConeY(x, y, zz, r0, w1, h);
    // slender waist between the joints (dorsal side), fuller pads on the palmar side
    const t = clamp(y / h, 0, 1);
    const pad = sin(PI * t) * (z < 0 ? -0.0011 * min(1, -zz / w0 * 1.4) : 0.00045);
    d += pad;
    if (tip) {
      // fingertip pad: the palmar side bulges just behind the tip
      const tp = sdEllipsoid(x, y - (L - w1 * 1.25), z + w1 * 0.28, w1 * 0.92, w1 * 1.25, w1 * 0.72);
      d = smin(d, tp, 0.002);
    }
    return d;
  };
}

/**
 * Builds one finger/thumb segment.
 * spec: { L, w0, w1, kind: 'meta'|'prox'|'mid'|'dist'|'tdist', finger, ring, specks }
 */
export function buildSegment(P, spec) {
  const M = (n) => P.get(n);
  const { L, w0, w1, kind } = spec;
  const base = phalanxSdf(L, w0, w1, kind);
  const tip = kind === 'dist' || kind === 'tdist';
  const t1 = w1 * HAND.thickness;
  // nail: almond plate on the dorsal side of the distal segment, free edge past the tip
  const nailY0 = L * (kind === 'tdist' ? 0.4 : 0.42);
  const nailSdf = (x, y, z) => sdRoundBox(x, y - (L - (L - nailY0) * 0.5 + 0.0007), z - t1 * 0.62, w1 * 0.66, (L - nailY0) * 0.5 + 0.0007, t1 * 0.24, 0.0022);
  const ringY = spec.ring ? L * 0.5 : -1;
  const sdf = (x, y, z) => {
    let d = base(x, y, z);
    if (tip) d = min(d, nailSdf(x, y, z));
    if (spec.ring && abs(y - ringY) < 0.0013) {
      const wr = mix(w0, w1, ringY / L);
      d = min(d, sqrt(x * x + (z / HAND.thickness) ** 2) - (wr + 0.0011));
    }
    return d;
  };
  const skin = M('skin'), dors = M('skinDorsal'), palm = M('skinPalm'), crease = M('skinCrease'), knuckle = M('skinKnuckle');
  const nail = M('nail'), nailHi = M('nailHi'), worn = M('nailWorn'), ring = M('ring');
  const tints = TINT_SHADES.slice(2, 6).map((g) => M(`t${g}`));
  const mat = (x, y, z, d, i, j, k) => {
    const wl = mix(w0, w1, clamp(y / L, 0, 1));
    const tl = wl * HAND.thickness;
    const zn = z / tl; // -1 palmar .. +1 dorsal
    const h = rnd3(i, j, k, spec.seed ?? 3);
    if (spec.ring && abs(y - ringY) < 0.0012 && sqrt(x * x + (z / HAND.thickness) ** 2) > wl - 0.0008) return ring;
    if (tip && y > nailY0 - 0.0004 && zn > 0.18) {
      const ny = (y - nailY0) / (L - nailY0); // 0 cuticle .. 1 tip
      const half = wl * 0.74 * sqrt(clamp(ny * 3.2, 0, 1)) * (1 - 0.25 * sstep(0.85, 1.12, ny));
      if (abs(x) < half + 0.0002) {
        // overspray specks on the index fingertip, worn polish at the free edge
        if (spec.specks && ny > 0.35 && h < 0.16) return tints[floor(h * 100) % tints.length];
        if (ny > 0.93 && h < 0.45) return worn;
        return abs(x) < half * 0.45 && ny > 0.25 && ny < 0.75 ? nailHi : nail;
      }
    }
    if (spec.specks && tip && y > L * 0.55 && zn > -0.35 && h < 0.07) return tints[floor(h * 300) % tints.length];
    // dorsal knuckle creases over the joint at the base of mid/distal segments
    if ((kind === 'mid' || kind === 'dist' || kind === 'tdist') && zn > 0.35 && abs(x) < wl * 0.62) {
      const yy = y / 0.002;
      if (yy > -0.2 && yy < 2.2) return floor(yy) === 0 ? crease : h < 0.5 ? crease : knuckle;
    }
    if ((kind === 'prox' || kind === 'meta') && zn > 0.3 && y > L - 0.0055) return y > L - 0.0025 && abs(x) < wl * 0.5 && h < 0.35 ? crease : knuckle;
    // palmar flexion creases at the joints
    if (zn < -0.45 && (y < 0.0012 || (y > L - 0.0012 && !tip))) return crease;
    if (tip && y > L - 0.006 && zn < 0.2) return M('skinTip');
    if (zn > 0.38) return dors;
    if (zn < -0.4) return palm;
    return skin;
  };
  const rmax = Math.max(w0, w1) + 0.0035;
  const geometry = buildPart(P, {
    vs: HAND_VS,
    min: [-rmax, -w0 - 0.002, -rmax],
    max: [rmax, L + 0.004, rmax],
    sdf,
    mat,
    smooth: 0.78,
  });
  return geometry;
}

/** Palm (with wrist stub, thenar/hypothenar eminences and MCP knuckles), hand frame. */
export function buildPalm(P) {
  const M = (n) => P.get(n);
  const F = HAND.fingers;
  const bases = {
    index: [-0.0125, 0.012, 0.002],
    middle: [-0.0035, 0.011, 0.0025],
    ring: [0.0055, 0.012, 0.0015],
    little: [0.0135, 0.0145, -0.001],
  };
  const mc = Object.keys(F).map((k) => [...bases[k], ...F[k].mcp, F[k].w[0] + 0.0012]);
  const th = HAND.thumb.cmc;
  const sdf = (x, y, z) => {
    // wrist stub (disappears into the cuff)
    let d = sdRoundCone(x, y, z * 1.42, 0, -0.05, 0, 0, 0.012, 0, 0.0262, 0.0262);
    // metacarpals with their heads (knuckles), slightly flattened
    for (let i = 0; i < 4; i++) {
      const m = mc[i];
      d = smin(d, sdRoundCone(x, y, z * 1.15, m[0], m[1], m[2] * 1.15, m[3], m[4], m[5] * 1.15, 0.0085, m[6]), 0.009);
    }
    // palm slab (palmar soft tissue), widening toward the knuckles
    {
      const t = clamp((y - 0.005) / 0.075, 0, 1);
      const hw = mix(0.0235, 0.0305, t);
      const cx = mix(0.0005, -0.0005, t);
      d = smin(d, sdRoundBox(x - cx, y - 0.044, z + 0.0042, hw, 0.036, 0.0088, 0.0075), 0.008);
    }
    // thenar eminence (along the thumb metacarpal) and hypothenar
    {
      const ax = x - (th[0] - 0.0015), ay = y - 0.033, az = z - (th[2] - 0.0025);
      const ca = cos(0.42), sa = sin(0.42);
      const rx = ax * ca + ay * sa, ry = -ax * sa + ay * ca;
      d = smin(d, sdEllipsoid(rx, ry, az, 0.0122, 0.0245, 0.0118), 0.008);
    }
    d = smin(d, sdEllipsoid(x - 0.0222, y - 0.038, z + 0.0082, 0.0096, 0.031, 0.0098), 0.008);
    // pads under the finger roots
    d = smin(d, sdRoundCone(x, y, z, -0.0245, 0.0772, -0.0078, 0.0225, 0.0695, -0.0098, 0.0076, 0.0068), 0.007);
    // first dorsal interosseous (web between thumb and index metacarpals)
    d = smin(d, sdEllipsoid(x + 0.0225, y - 0.047, z + 0.0005, 0.0068, 0.02, 0.0078), 0.008);
    return d;
  };
  const skin = M('skin'), dors = M('skinDorsal'), palm = M('skinPalm'), knuckle = M('skinKnuckle'), crease = M('skinCrease');
  const mat = (x, y, z, d, i, j, k) => {
    const h = rnd3(i, j, k, 17);
    // knuckle tops (MCP heads, dorsal) a little redder, with fine creases
    for (let f = 0; f < 4; f++) {
      const m = mc[f];
      const dx = x - m[3], dy = y - m[4], dz = z - m[5];
      if (dz > 0.002 && dx * dx + dy * dy < 0.0072 ** 2) return h < 0.22 ? crease : knuckle;
    }
    if (z < -0.0105 && y > 0.06 && y < 0.07 && abs(x) < 0.025 && h < 0.5) return crease; // distal palmar crease
    if (z > 0.0045) return dors;
    if (z < -0.007) return palm;
    return skin;
  };
  return buildPart(P, {
    vs: HAND_VS,
    min: [-0.046, -0.05, -0.03],
    max: [0.042, 0.098, 0.024],
    sdf,
    mat,
    smooth: 0.75,
  });
}

// ───────────────────────────── the sleeve ─────────────────────────────
// Sleeve frame = forearm frame: origin at the wrist joint, +Y toward the hand,
// +Z dorsal, +X ulnar. The cuff ends just past the wrist; the sleeve runs back
// toward the elbow (-Y).

export const SLEEVE = { vs: 0.0025, len: 0.22, cuffY: 0.003, zipTheta: 0.95 };

export function buildSleeve(P) {
  const M = (n) => P.get(n);
  const L = SLEEVE.len;
  const yEnd = SLEEVE.cuffY;
  const zipT = SLEEVE.zipTheta;
  const halfAxes = (y) => {
    const t = clamp(-y / L, 0, 1);
    return [mix(0.0405, 0.054, sstep(0, 1, t)), mix(0.0345, 0.0485, sstep(0, 1, t))];
  };
  // displacement: leather bunching above the cuff, slow wrinkles, raised cuff band and zip
  const disp = (x, y, z, th) => {
    let s = 0;
    const fold = sin((y + 0.004 * sin(th * 2 + 1) + 0.002 * sin(th * 5)) * (TAU / 0.019));
    s += 0.0016 * fold * sstep(-0.13, -0.085, y) * sstep(-0.035, -0.06, y);
    s += 0.0011 * (0.5 * sin(th * 3 + y * 170 + 1.3) + 0.3 * sin(th * 7 - y * 95 + 0.4) + 0.2 * sin(th * 2 + y * 310));
    s += 0.0005 * sin(th * 11 + y * 420 + 2.1) * sin(th * 4 - y * 260);
    if (y > -0.044) s += 0.0018; // cuff panel
    const dzip = abs(((th - zipT + PI * 3) % TAU) - PI);
    if (y > -0.078 && dzip < 0.07) s += 0.0012; // zip tape ridge
    return s;
  };
  const shell = (x, y, z) => {
    const [hw, ht] = halfAxes(y);
    const th = atan2(x / hw, z / ht);
    const e = sqrt((x / hw) ** 2 + (z / ht) ** 2);
    let d = (e - 1) * min(hw, ht) - disp(x, y, z, th);
    // rounded cuff edge and the cut far end
    d = -smin(-d, yEnd - y, 0.004);
    d = max(d, -L - y);
    return d;
  };
  const sdf = (x, y, z) => {
    let d = shell(x, y, z);
    // hollow opening at the cuff (dark lining shows around the wrist)
    if (y > -0.03) {
      const [hw, ht] = halfAxes(y);
      const ein = sqrt((x / (hw - 0.0042)) ** 2 + (z / (ht - 0.0042)) ** 2);
      d = max(d, -(ein - 1) * min(hw, ht));
    }
    // zip slider + pull tab near the cuff edge
    {
      const [hw, ht] = halfAxes(-0.01);
      const sx = sin(zipT) * (hw + 0.0035), sz = cos(zipT) * (ht + 0.0035);
      const ca = cos(zipT), sa = sin(zipT);
      const lx = x - sx, lz = z - sz;
      const ux = lx * ca - lz * sa, uz = lx * sa + lz * ca; // ux tangential, uz outward
      d = min(d, sdRoundBox(ux, y + 0.0105, uz + 0.0005, 0.0026, 0.0048, 0.0022, 0.001));
      d = min(d, sdRoundBox(ux, y + 0.0205, uz + 0.0004, 0.0021, 0.0058, 0.0009, 0.0006));
    }
    return d;
  };
  const leather = M('leather'), crease = M('leatherCrease'), edge = M('leatherEdge'), lining = M('lining');
  const zip = M('zip'), zipDark = M('zipDark'), stitch = M('stitch');
  const mat = (x, y, z, d, i, j, k) => {
    const [hw, ht] = halfAxes(y);
    const th = atan2(x / hw, z / ht);
    const e = sqrt((x / hw) ** 2 + (z / ht) ** 2);
    const h = rnd3(i, j, k, 41);
    if (y > -0.03 && e < 0.93) return lining;
    const dzip = abs(((th - zipT + PI * 3) % TAU) - PI);
    // zip slider and pull
    if (e > 1.02 && dzip < 0.16 && y > -0.027 && y < -0.004) return y > -0.016 ? zip : (h < 0.5 ? zip : zipDark);
    if (y > -0.078 && y < 0.0 && dzip < 0.075) {
      if (dzip < 0.035) return (j & 1) === 0 ? zip : zipDark;
      return crease;
    }
    if (y > -0.079 && y < -0.075 && dzip < 0.1) return zipDark; // bottom stop
    // cuff seam with stitching, cuff edge
    if (abs(y + 0.0445) < 0.0013) return crease;
    if (abs(y + 0.0405) < 0.0013) return (i + k) % 2 === 0 ? stitch : leather;
    if (y > yEnd - 0.0026) return edge;
    // folds: valleys are darker
    const fold = sin((y + 0.004 * sin(th * 2 + 1) + 0.002 * sin(th * 5)) * (TAU / 0.019));
    if (y < -0.085 && y > -0.13 && fold < -0.72) return crease;
    // underside seam
    if (abs(((th - PI + PI * 3) % TAU) - PI) < 0.03) return crease;
    if (h < 0.035) return crease;
    return leather;
  };
  return buildPart(P, {
    vs: SLEEVE.vs,
    min: [-0.06, -L - 0.0025, -0.056],
    max: [0.061, yEnd + 0.0025, 0.056],
    sdf,
    mat,
    deep: lining,
    smooth: 0.72,
    normalSdf: shell,
  });
}
