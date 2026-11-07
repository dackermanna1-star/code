// =============================================================================
// Fuselage, fin and horizontal stabiliser shapes for the 737 family.
// Shape is defined by profile curves along Z (aircraft-local):
//   top(z), bot(z): crown and keel heights, yw(z): height of maximum width,
//   w(z): half width. Upper half = ellipse (yw..top), lower half = superellipse
//   (yw..bot) that becomes boxy in the wing-to-body (belly) fairing region.
// The UV layout is the livery atlas: u = (z - Z0)/(Z1 - Z0),
//   v = 1 - (φ / 2π) * FUS_V   (φ = 0 crown, π/2 right side, π keel, 3π/2 left)
// The fin uses the lower band of the atlas (v < 1 - FUS_V).
// =============================================================================
import * as THREE from 'three';
import { AIRCRAFT } from '../../core/constants.js';
import { curve, gridGeometry, fanCap, merge, smoothSeams } from './geom.js';
import { orient } from './wing.js';
import { camber, halfThick, sstep, wingPoint, atlasU, atlasV } from './planform.js';

export const FUS_V = 0.68;          // fraction of the atlas height used by the fuselage
export const Z0 = AIRCRAFT.noseZ - 0.05, Z1 = AIRCRAFT.tailZ + 0.05;

const K = {
  top: [[-19.9, 0.30], [-19.78, 0.5], [-19.5, 0.78], [-19.0, 1.1], [-18.3, 1.46], [-17.5, 1.84], [-16.7, 2.12], [-15.8, 2.31], [-14.8, 2.41], [-13.8, 2.43], [10.5, 2.43], [12.5, 2.41], [14.5, 2.33], [16.5, 2.15], [18.0, 1.93], [19.0, 1.74], [19.57, 1.6]],
  bot: [[-19.9, 0.16], [-19.78, -0.02], [-19.5, -0.26], [-19.0, -0.55], [-18.3, -0.84], [-17.4, -1.06], [-16.4, -1.21], [-15.2, -1.3], [-14.0, -1.33], [7.6, -1.33], [9.0, -1.26], [11.0, -1.02], [13.0, -0.63], [15.0, -0.15], [17.0, 0.42], [18.5, 0.92], [19.3, 1.2], [19.57, 1.3]],
  yw: [[-19.9, 0.24], [-19.0, 0.32], [-17.5, 0.43], [-15.5, 0.53], [-14.0, 0.55], [9.0, 0.55], [12.0, 0.64], [15.0, 0.92], [17.0, 1.18], [18.5, 1.36], [19.57, 1.45]],
  w: [[-19.9, 0.05], [-19.78, 0.34], [-19.5, 0.62], [-19.0, 0.93], [-18.3, 1.25], [-17.4, 1.55], [-16.4, 1.75], [-15.3, 1.85], [-14.2, 1.88], [9.0, 1.88], [11.0, 1.85], [13.0, 1.74], [15.0, 1.5], [17.0, 1.08], [18.5, 0.66], [19.3, 0.3], [19.57, 0.17]],
};

/** Shape functions, optionally stretched (variant): returns {sec(z), z0, z1, map(z)->base z} */
export function fuselageShape(stretchFwd = 0, stretchAft = 0) {
  const top = curve(K.top), bot = curve(K.bot), yw = curve(K.yw), w = curve(K.w);
  // map actual z -> base (737-800) z: plugs inserted at z=-6 (fwd) and z=8 (aft)
  const base = (z) => {
    if (z < -6 - stretchFwd) return z + stretchFwd;
    if (z < -6) return -6;
    if (z > 8 + stretchAft) return z - stretchAft;
    if (z > 8) return 8;
    return z;
  };
  const z0 = AIRCRAFT.noseZ - stretchFwd, z1 = AIRCRAFT.tailZ + stretchAft;
  const belly = (z) => sstep(-7.2, -3.6, z) * (1 - sstep(5.2, 8.8, z));
  const sec = (z) => {
    const b = base(z);
    const e = belly(z);
    return { top: top(b), bot: bot(b) - 0.29 * e, yw: yw(b), w: w(b), wLow: w(b) + 0.17 * e, nLow: 2 + 1.7 * e, e };
  };
  return { sec, z0, z1, base, belly };
}

/** point on the section at angle φ (0 = crown, clockwise seen from behind: +π/2 = right) */
export function sectionPoint(s, phi, out) {
  const sa = Math.sin(phi), ca = Math.cos(phi);
  if (ca >= 0) {
    out.x = s.w * sa;
    out.y = s.yw + (s.top - s.yw) * ca;
  } else {
    const e = 2 / s.nLow;
    const c = -ca;
    const blend = sstep(0, 0.5, c);
    const ww = s.w + (s.wLow - s.w) * blend;
    out.x = ww * Math.sign(sa) * Math.pow(Math.abs(sa), e);
    out.y = s.yw - (s.yw - s.bot) * Math.pow(c, e);
  }
  return out;
}

/** inverse: φ on the given side (+1 right, -1 left) where the section reaches height y */
export function phiAt(s, y, side = 1) {
  let a = 0, b = Math.PI;
  const o = {};
  for (let i = 0; i < 30; i++) {
    const m = (a + b) / 2;
    sectionPoint(s, m, o);
    if (o.y > y) a = m; else b = m;
  }
  const phi = (a + b) / 2;
  return side > 0 ? phi : Math.PI * 2 - phi;
}

export const MAIN_WELL = { x: 1.445, z: AIRCRAFT.gear.mainZ, r: 0.66, depth: 0.42 };
export const NOSE_WELL = { z0: -17.22, z1: -15.28, hw: 0.36, depth: 0.55 };

/**
 * Fuselage geometry. Returns { upper, belly } (belly = wing-to-body fairing
 * region, always visible) and the shape.
 */
export function buildFuselage({ rows = 260, segs = 128, stretchFwd = 0, stretchAft = 0, wells = true, split = true } = {}) {
  const sh = fuselageShape(stretchFwd, stretchAft);
  const o = {};
  const zs = [];
  // denser at the nose & tail
  for (let i = 0; i < rows; i++) {
    const t = i / (rows - 1);
    const tt = t + 0.06 * Math.sin(t * Math.PI * 2) / (Math.PI * 2) * -1;
    zs.push(sh.z0 + (sh.z1 - sh.z0) * tt);
  }
  const zRange = (Z1 + stretchAft) - (Z0 - stretchFwd);
  const g = gridGeometry(rows, segs + 1, (i, j, p, uv) => {
    const z = zs[i];
    const s = sh.sec(z);
    const phi = (j / segs) * Math.PI * 2;
    sectionPoint(s, phi, o);
    p.x = o.x; p.y = o.y; p.z = z;
    // main wheel wells (recess in the belly fairing)
    if (wells) {
      for (const sx of [-1, 1]) {
        const dx = (p.x - sx * MAIN_WELL.x) / MAIN_WELL.r, dz = (p.z - MAIN_WELL.z) / MAIN_WELL.r;
        const d2 = dx * dx + dz * dz;
        if (d2 < 1 && p.y < -0.6) p.y += MAIN_WELL.depth * Math.pow(1 - d2, 0.25);
      }
      // nose gear well (rectangular pocket under the doors)
      if (z > NOSE_WELL.z0 && z < NOSE_WELL.z1 && Math.abs(p.x) < NOSE_WELL.hw && p.y < 0) {
        const kx = 1 - Math.pow(Math.abs(p.x) / NOSE_WELL.hw, 6), kz = Math.min(1, (z - NOSE_WELL.z0) / 0.12, (NOSE_WELL.z1 - z) / 0.12);
        p.y += NOSE_WELL.depth * kx * kz;
      }
    }
    uv.u = (z - (Z0 - stretchFwd)) / zRange;
    uv.v = 1 - (j / segs) * FUS_V;
  });
  orient(g, [0, 0, 0]);
  // make normals point outwards (check the crown vertex of the middle row)
  {
    const n = g.attributes.normal, mid = Math.floor(rows / 2) * (segs + 1);
    if (n.getY(mid) < 0) {
      const a = g.index.array;
      for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; }
      g.computeVertexNormals();
    }
  }
  smoothSeams(g, 60);
  if (!split) return { all: g, shape: sh };
  // split by parameter ranges (clean edges): belly patch = lower lobe within the fairing
  const idx = g.index.array;
  const cols = segs + 1;
  const jA = Math.round(segs * (0.25 + 0.06)), jB = Math.round(segs * (0.75 - 0.06));
  const up = [], lo = [];
  for (let t = 0; t < idx.length; t += 3) {
    const a0 = idx[t], a1 = idx[t + 1], a2 = idx[t + 2];
    const i = Math.min(Math.floor(a0 / cols), Math.floor(a1 / cols), Math.floor(a2 / cols));
    const j = Math.min(a0 % cols, a1 % cols, a2 % cols);
    const z = zs[i];
    const isBelly = j >= jA && j < jB && z > -7.6 && z < 9.6;
    (isBelly ? lo : up).push(idx[t], idx[t + 1], idx[t + 2]);
  }
  const mk = (list) => {
    const h = new THREE.BufferGeometry();
    for (const k of Object.keys(g.attributes)) h.setAttribute(k, g.attributes[k]);
    h.setIndex(list);
    return h;
  };
  return { upper: mk(up), belly: mk(lo), shape: sh };
}

// --- vertical stabiliser ------------------------------------------------------------
export const FIN = { rootY: 1.75, tipY: AIRCRAFT.tailHeight - AIRCRAFT.groundHeight, rootLE: 13.05, sweep: Math.tan(37 * Math.PI / 180), rootChord: 6.1, tipChord: 1.65, dorsalZ: 9.6 };
export function finStation(y, stretchAft = 0) {
  const h = y - FIN.rootY;
  const H = FIN.tipY - FIN.rootY;
  const t = Math.max(0, Math.min(1, h / H));
  // leading edge (with dorsal fillet near the root)
  let le = FIN.rootLE + h * FIN.sweep;
  const hd = y - 2.2;
  if (hd < 1.2) { const k = Math.max(0, 1 - Math.max(0, hd) / 1.2); le -= (FIN.rootLE + Math.max(0, hd) * FIN.sweep - FIN.dorsalZ) * k * k * (hd < 0 ? 1 : 1); }
  const te = FIN.rootLE + FIN.rootChord + h * (FIN.sweep * 0.62) + (t > 0.9 ? 0 : 0);
  let chord = THREE.MathUtils.lerp(FIN.rootChord, FIN.tipChord, t);
  const teZ = FIN.rootLE + h * FIN.sweep + chord;
  chord = teZ - le;
  const thick = Math.min(0.105 * (teZ - (FIN.rootLE + Math.max(0, h) * FIN.sweep)), 0.6);
  return { le: le + stretchAft, chord, te: teZ + stretchAft, thick };
}

/**
 * Fin (two surfaces so each side maps to its own livery region) + rudder.
 * Rudder hinge at 70% chord.
 */
export function buildFin({ rowsN = 40, colsN = 26, stretchAft = 0 } = {}) {
  const H = FIN.tipY - FIN.rootY;
  const zMin = FIN.dorsalZ - 0.2 + stretchAft, zMax = FIN.rootLE + H * FIN.sweep + FIN.tipChord + 0.2 + stretchAft;
  const ys = [];
  for (let i = 0; i < rowsN; i++) ys.push(FIN.rootY + H * i / (rowsN - 1));
  const fvBand = 1 - FUS_V;
  const uvOf = (z, y, side) => {
    const hz = (z - zMin) / (zMax - zMin), hv = (y - FIN.rootY) / H;
    // right side: nose to the viewer's right -> canvas x = 1 - hz in the right half
    const u = side > 0 ? 0.5 * (1 - hz) : 0.5 + 0.5 * hz;
    return [u, fvBand * hv];
  };
  const mkSide = (side, f0, f1) => {
    const fs = [];
    for (let j = 0; j < colsN; j++) { const t = j / (colsN - 1); fs.push(f0 + (f1 - f0) * (1 - Math.cos(t * Math.PI / 2))); }
    const g = gridGeometry(rowsN, colsN, (i, j, p, uv) => {
      const st = finStation(ys[i], stretchAft);
      const f = fs[j];
      const ht = halfThick(f, 0.1) / 0.1 * st.thick * 0.5 / 0.5 + 0.002;
      p.x = side * ht; p.y = ys[i]; p.z = st.le + f * st.chord;
      const [u, v] = uvOf(p.z, p.y, side);
      uv.u = u; uv.v = v;
    });
    return orient(g, [side, 0, 0]);
  };
  const fin = merge([mkSide(1, 0, 0.7), mkSide(-1, 0, 0.7)]);
  smoothSeams(fin, 110);
  const rud = merge([mkSide(1, 0.7, 1.0), mkSide(-1, 0.7, 1.0)]);
  // tip cap
  const capLoop = [];
  const stT = finStation(FIN.tipY, stretchAft);
  for (let k = 0; k <= 16; k++) { const f = k / 16; capLoop.push(new THREE.Vector3(halfThick(f, 0.1) / 0.1 * stT.thick, FIN.tipY, stT.le + f * stT.chord)); }
  for (let k = 16; k >= 0; k--) { const f = k / 16; capLoop.push(new THREE.Vector3(-halfThick(f, 0.1) / 0.1 * stT.thick, FIN.tipY, stT.le + f * stT.chord)); }
  const cap = orient(fanCap(capLoop, uvOf(stT.le, FIN.tipY, 1)), [0, 1, 0]);
  const hinge0 = new THREE.Vector3(0, FIN.rootY, finStation(FIN.rootY, stretchAft).le + 0.7 * finStation(FIN.rootY, stretchAft).chord);
  const hinge1 = new THREE.Vector3(0, FIN.tipY, stT.le + 0.7 * stT.chord);
  return { fin: merge([fin, cap]), rudder: rud, hinge: hinge0, axis: hinge1.clone().sub(hinge0).normalize(), zMin, zMax };
}

// --- horizontal stabiliser (right; mirrored) ----------------------------------------
export const HSTAB = { rootX: 0.0, rootY: 1.32, rootLE: 14.75, rootChord: 4.15, tipChord: 1.28, span: 7.17, sweep: Math.tan(33 * Math.PI / 180), dihedral: 7 * Math.PI / 180 };
export function buildHStab({ rows = 18, n = 16, stretchAft = 0 } = {}) {
  const S = HSTAB;
  const st = (x) => {
    const t = x / S.span;
    const le = S.rootLE + x * S.sweep + stretchAft;
    const chord = THREE.MathUtils.lerp(S.rootChord, S.tipChord, t);
    const y = S.rootY + x * Math.tan(S.dihedral);
    return { le, chord, y, tc: 0.095 };
  };
  const xs = [];
  for (let i = 0; i < rows; i++) xs.push(0.3 + (S.span - 0.3) * i / (rows - 1));
  // wrap around (upper TE -> LE -> lower TE) for chord range [f0, f1]
  const wrap = (f0, f1) => {
    const cols = [];
    for (let k = n - 1; k >= 0; k--) { const t = k / (n - 1); cols.push([f0 + (f1 - f0) * (1 - Math.cos(t * Math.PI / 2)), 1]); }
    for (let k = 1; k < n; k++) { const t = k / (n - 1); cols.push([f0 + (f1 - f0) * (1 - Math.cos(t * Math.PI / 2)), -1]); }
    return gridGeometry(xs.length, cols.length, (i, j, p, uv) => {
      const s = st(xs[i]);
      const [f, side] = cols[j];
      const ht = halfThick(f, s.tc) + 0.0015;
      p.x = xs[i]; p.y = s.y + (side * ht - 0.004 * f) * s.chord; p.z = s.le + f * s.chord;
      // reuse the wing atlas (outboard panel area) for panel lines
      const sw = 6 + 10 * (xs[i] / S.span);
      uv.u = atlasU(sw); uv.v = atlasV(f, side);
    });
  };
  const main = orient(wrap(0, 0.72), [0, 1, 0]);
  const elev = orient(wrap(0.72, 1.0), [0, 1, 0]);
  const tip = st(S.span);
  const loop = [];
  for (let k = 0; k <= 12; k++) { const f = k / 12; loop.push(new THREE.Vector3(S.span, tip.y + halfThick(f, tip.tc) * tip.chord, tip.le + f * tip.chord)); }
  for (let k = 12; k >= 0; k--) { const f = k / 12; loop.push(new THREE.Vector3(S.span, tip.y - halfThick(f, tip.tc) * tip.chord, tip.le + f * tip.chord)); }
  const cap = orient(fanCap(loop, [atlasU(16), 0.5]), [1, 0, 0]);
  const r0 = st(0.3), r1 = st(S.span);
  const h0 = new THREE.Vector3(0.3, r0.y, r0.le + 0.72 * r0.chord), h1 = new THREE.Vector3(S.span, r1.y, r1.le + 0.72 * r1.chord);
  return { stab: merge([main, cap]), elevator: elev, hinge: h0, axis: h1.clone().sub(h0).normalize(), logoLightPos: new THREE.Vector3(1.6, st(1.6).y + 0.12, st(1.6).le + 0.3) };
}

/** Small antennas, APU exhaust and pitot probes (merged, painted grey/dark). */
export function buildAntennas(stretchFwd = 0, stretchAft = 0) {
  const list = [];
  const blade = (x, y, z, h, len, up = 1, roll = 0) => {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0); shape.lineTo(len, 0); shape.lineTo(len * 0.75, h); shape.lineTo(len * 0.45, h); shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth: 0.025, bevelEnabled: false });
    g.translate(0, 0, -0.0125);
    g.rotateY(Math.PI / 2);     // length along +z... (x->-z), fix below
    g.rotateY(Math.PI);
    if (up < 0) g.rotateZ(Math.PI);
    g.rotateZ(roll);
    g.translate(x, y, z);
    list.push(g);
  };
  blade(0, 2.42, -6 - stretchFwd, 0.28, 0.42);            // VHF 1 (top)
  blade(0, 2.42, 3.0, 0.22, 0.32);                         // VHF 2 / satcom area
  blade(0, -1.6, 0.8, 0.26, 0.38, -1);                     // belly VHF 3
  blade(0, -1.28, -12.5 - stretchFwd, 0.18, 0.28, -1);     // ATC / DME
  blade(0, -1.3, -10.8 - stretchFwd, 0.12, 0.2, -1);
  return merge(list);
}
