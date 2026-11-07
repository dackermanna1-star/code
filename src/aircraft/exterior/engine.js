// =============================================================================
// CFM56-7B nacelle (right engine; the left engine is mirrored by its parent).
// Local engine frame: origin on the nacelle axis at the inlet lip plane,
// +Z aft, +Y up, +X outboard (right). Placed at AIRCRAFT.engine.{x,y,inletZ}.
// =============================================================================
import * as THREE from 'three';
import { AIRCRAFT } from '../../core/constants.js';
import { latheZ, gridGeometry, merge, curve, loftZ } from './geom.js';
import { wingPoint, leZ, chordX, sstep } from './planform.js';
import { orient } from './wing.js';

const E = AIRCRAFT.engine;
export const FAN_Z = 0.80;          // fan face (blade leading edges) behind the lip
export const SLEEVE_Z0 = 2.55, SLEEVE_Z1 = 4.5;
export const REVERSER_TRAVEL = 0.62;

// outer nacelle radius along z (fan cowl + sleeve), used by the pylon too
export const outerR = curve([[0.0, 0.86], [0.03, 0.905], [0.1, 0.95], [0.25, 0.985], [0.5, 1.008], [0.85, 1.02], [1.3, 1.016], [1.9, 1.0], [2.55, 0.975], [3.0, 0.955], [3.6, 0.92], [4.1, 0.872], [4.5, 0.82]]);

/** "hamster pouch" – flattened lower nacelle (strong at the inlet, fading aft) */
function flatten(p, k) {
  if (p.y < 0) { const r = Math.hypot(p.x, p.y) || 1; p.y *= 1 - k * sstep(0, 0.6, -p.y / r); }
}
const flatK = (z) => 0.14 * (1 - sstep(0.4, 3.2, z));

export function buildEngineGeometry(detail = 1) {
  const lod = detail < 0;
  const segs = detail >= 2 ? 64 : detail >= 1 ? 48 : detail >= 0 ? 36 : 14;
  const st = lod ? 0.45 : 0.06;
  const out = {};

  // --- fan cowl (painted) from behind the lip to the sleeve split ------------------
  {
    const prof = [];
    for (let z = 0.075; z <= SLEEVE_Z0 + 1e-6; z += st) prof.push([outerR(z), z]);
    prof.push([outerR(SLEEVE_Z0), SLEEVE_Z0]);
    // aft face of the fan cowl (hidden by the sleeve when stowed)
    prof.push([0.9, SLEEVE_Z0 + 0.001]);
    out.cowl = latheZ(prof, segs, {
      deform: (p) => flatten(p, flatK(p.z)),
      vRange: [0.075, 0.47],
    });
    // fix the v of the last (inner) ring to stay at the seam
  }
  // --- inlet lip (bare aluminium) -------------------------------------------------
  {
    const prof = [];
    const inner = curve([[0.03, 0.835], [0.08, 0.818], [0.15, 0.808], [0.3, 0.8]]);
    for (let z = 0.3; z > 0.031; z -= lod ? 0.27 : 0.03) prof.push([inner(z), z]);
    const nk = lod ? 3 : 12;
    for (let k = 0; k <= nk; k++) {
      const ph = Math.PI * (1 - k / nk);
      prof.push([0.87 + 0.035 * Math.cos(ph), 0.03 - 0.03 * Math.sin(ph)]);
    }
    for (let z = 0.04; z <= 0.0801; z += lod ? 0.04 : 0.01) prof.push([outerR(z), z]);
    out.lip = latheZ(prof, segs, { deform: (p) => flatten(p, 0.14) });
    orientMinZ(out.lip);
  }
  // --- inlet duct + fan case (dark) + exit guide vane disc --------------------------
  {
    const prof = [[0.80, 0.3], [0.792, 0.55], [0.785, FAN_Z - 0.05], [0.785, FAN_Z + 0.3]];
    const duct = latheZ(prof, segs, { deform: (p) => flatten(p, 0.14 * (1 - sstep(0.3, 0.75, p.z))) });
    orientLathe(duct, true);
    const back = new THREE.RingGeometry(0.28, 0.79, segs, 1);
    back.rotateY(Math.PI);
    back.translate(0, 0, FAN_Z + 0.32);
    out.duct = merge([duct, back]);
  }
  // --- fan blades -----------------------------------------------------------------
  if (!lod) {
    const blades = [];
    const N = 24, nr = detail >= 1 ? 9 : 6, nc = 6;
    for (let b = 0; b < N; b++) {
      const rot = (b / N) * Math.PI * 2;
      const g = gridGeometry(nr, nc, (i, j, p, uv) => {
        const t = i / (nr - 1);
        const r = 0.29 + t * (0.778 - 0.29);
        const stagger = (32 + 30 * Math.pow(t, 0.9)) * Math.PI / 180;
        const chord = 0.2 + 0.13 * Math.sin(t * Math.PI * 0.8);
        const c = (j / (nc - 1) - 0.4) * chord;
        const camber = 0.03 * chord * (1 - Math.pow(2 * j / (nc - 1) - 1, 2));
        // section in (tangential, axial) coordinates
        const tang = Math.sin(stagger) * c + Math.cos(stagger) * camber;
        const ax = Math.cos(stagger) * c - Math.sin(stagger) * camber + 0.04 * t * t;   // slight sweep
        const a = rot + tang / r;
        p.x = Math.sin(a) * r; p.y = Math.cos(a) * r; p.z = FAN_Z + 0.1 + ax;
        uv.u = j / (nc - 1); uv.v = t;
      });
      blades.push(g);
    }
    out.blades = merge(blades);
  }
  {
    const disc = new THREE.RingGeometry(0.29, 0.785, segs, 1);
    disc.rotateY(Math.PI);  // face forward (-z)
    disc.translate(0, 0, FAN_Z + 0.06);
    // RingGeometry UVs are planar -> good for the radial blur texture
    out.blurDisc = disc;
  }
  // --- spinner -----------------------------------------------------------------------
  {
    const prof = [[0.0, 0.2], [0.05, 0.235], [0.11, 0.3], [0.17, 0.39], [0.225, 0.5], [0.265, 0.62], [0.29, 0.76], [0.3, 0.9], [0.3, FAN_Z + 0.35]];
    const g = latheZ(prof, segs, { vRange: [0, 1] });
    orientLathe(g, false);
    out.spinner = g;
  }
  // --- translating sleeve (painted) + inner nozzle wall ----------------------------
  {
    const prof = [];
    prof.push([0.9, SLEEVE_Z0]);
    for (let z = SLEEVE_Z0; z <= SLEEVE_Z1 + 1e-6; z += lod ? 0.6 : 0.08) prof.push([outerR(z), z]);
    prof.push([outerR(SLEEVE_Z1), SLEEVE_Z1]);
    prof.push([0.80, SLEEVE_Z1 + 0.01]);
    prof.push([0.835, 4.1]); prof.push([0.865, 3.5]); prof.push([0.88, 3.2]); prof.push([0.885, SLEEVE_Z0 + 0.02]);
    const g = latheZ(prof, segs, { vRange: [0.47, 1.0] });
    orientLathe(g, false);
    out.sleeve = g;
  }
  // --- cascade band (revealed when the sleeve translates aft) -----------------------
  {
    const g = new THREE.CylinderGeometry(0.905, 0.9, REVERSER_TRAVEL, segs, 1, true);
    g.rotateX(Math.PI / 2);
    g.translate(0, 0, SLEEVE_Z0 + REVERSER_TRAVEL / 2);
    out.cascade = g;
  }
  // --- core cowl, core nozzle and plug (vertex coloured soot) ----------------------
  {
    const core = latheZ([[0.62, 3.8], [0.6, 4.3], [0.57, 4.8], [0.53, 5.25], [0.49, 5.62], [0.475, 5.66], [0.44, 5.62], [0.42, 5.3]], segs);
    orientLathe(core, false);
    const plug = latheZ([[0.36, 5.4], [0.345, 5.75], [0.3, 6.05], [0.22, 6.35], [0.12, 6.6], [0.04, 6.72], [0.0, 6.74]], segs);
    orientLathe(plug, false);
    const col = (g, fn) => {
      const n = g.attributes.position.count, a = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { const z = g.attributes.position.getZ(i), y = g.attributes.position.getY(i); const c = fn(z, y); a[i * 3] = c[0]; a[i * 3 + 1] = c[1]; a[i * 3 + 2] = c[2]; }
      g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    };
    col(core, (z) => { const s = sstep(4.5, 5.62, z); return [0.58 - 0.44 * s, 0.58 - 0.45 * s, 0.6 - 0.47 * s]; });
    col(plug, (z) => { const s = sstep(5.45, 6.4, z); return [0.2 - 0.12 * s, 0.185 - 0.115 * s, 0.175 - 0.11 * s]; });
    out.core = merge([core, plug], { color: true });
  }
  // --- nacelle strake (chine) on the inboard side ------------------------------------
  {
    const ang = -52 * Math.PI / 180;          // from top, towards inboard (-x)
    const pts = [[0.9, 0.0], [1.55, 0.0], [1.65, 0.24], [1.15, 0.24]];
    const pos = [];
    const P = (z, h) => { const r = outerR(z) + h; return [Math.sin(ang) * r, Math.cos(ang) * r, z]; };
    const quad = (a, b, c, d) => pos.push(...a, ...b, ...c, ...a, ...c, ...d);
    const A = P(pts[0][0], 0), B = P(pts[1][0], 0), C = P(pts[2][0], pts[2][1]), D = P(pts[3][0], pts[3][1]);
    quad(A, B, C, D); quad(A, D, C, B);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(pos.length / 3 * 2).fill(0.2), 2));
    g.computeVertexNormals();
    out.strake = g;
  }
  return out;
}

/** Fix lathe winding so normals point away from the axis (outer=true) or towards it. */
function orientLathe(g, inward) {
  g.computeVertexNormals();
  const p = g.attributes.position, n = g.attributes.normal;
  let s = 0;
  for (let i = 0; i < p.count; i++) s += p.getX(i) * n.getX(i) + p.getY(i) * n.getY(i);
  if ((s < 0) !== inward) {
    const a = g.index.array;
    for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; }
    g.computeVertexNormals();
  }
  return g;
}
export { orientLathe };
/** orient so that the most forward vertex faces forward (-z) */
function orientMinZ(g) {
  g.computeVertexNormals();
  const p = g.attributes.position, n = g.attributes.normal;
  let k = 0;
  for (let i = 1; i < p.count; i++) if (p.getZ(i) < p.getZ(k)) k = i;
  if (n.getZ(k) > 0) {
    const a = g.index.array;
    for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; }
    g.computeVertexNormals();
  }
  return g;
}

/**
 * Pylon (strut) for the right engine, in aircraft coordinates.
 * Upper line from the nacelle top into the wing upper surface; lower line along the
 * nacelle / core cowl and the aft fairing under the wing.
 */
export function buildPylonGeometry(detail = 1) {
  const lod = detail < 0;
  const x = E.x, ey = E.y, z0n = E.inletZ;
  const wingUpper = (z) => { const f = Math.max(0, Math.min(1, (z - leZ(x)) / chordX(x))); const o = {}; wingPoint(x, f, 1, o); return o.y; };
  const wingLower = (z) => { const f = Math.max(0, Math.min(1, (z - leZ(x)) / chordX(x))); const o = {}; wingPoint(x, f, -1, o); return o.y; };
  const zStart = z0n + 2.0, zEnd = leZ(x) + 0.68 * chordX(x);
  const zLE = leZ(x);
  const nacTop = (zr) => ey + outerR(Math.min(4.5, zr)) * 0.995;
  const rows = detail >= 1 ? 40 : detail >= 0 ? 26 : 9;
  const g = loftZ(rows, lod ? 6 : 16, (t) => {
    const z = zStart + (zEnd - zStart) * t;
    const zr = z - z0n;
    // bottom line
    let bot;
    if (zr < 4.5) bot = nacTop(zr) - 0.06;
    else if (zr < 5.7) bot = THREE.MathUtils.lerp(nacTop(4.5) - 0.06, ey + 0.47, (zr - 4.5) / 1.2);
    else {
      const wl = wingLower(z);
      const k = (z - (z0n + 5.7)) / (zEnd - (z0n + 5.7));
      const fairing = THREE.MathUtils.lerp(ey + 0.47, wl - 0.42, Math.min(1, k * 1.6));
      bot = Math.min(fairing + k * k * 0.5, wl - 0.02 + (k > 0.98 ? 0.02 : 0));
      bot = THREE.MathUtils.lerp(bot, wl - 0.02, sstep(0.75, 1.0, k));
    }
    // top line
    let top;
    const front = sstep(0, 0.18, t);
    if (z < zLE - 1.6) top = nacTop(zr) + 0.045 * front;
    else if (z < zLE + 0.3) top = THREE.MathUtils.lerp(nacTop(zr) + 0.045, wingUpper(zLE + 0.3) - 0.03, sstep(zLE - 1.6, zLE + 0.3, z));
    else top = wingUpper(z) - 0.08;
    top = Math.max(top, bot + 0.03);
    const wid = (0.095 + 0.02 * sstep(zLE - 1.0, zLE + 0.5, z) - 0.01 * sstep(zLE, zEnd, z)) * Math.pow(Math.min(1, t * 6), 0.5) * Math.pow(1 - sstep(0.7, 1, t), 0.6) + 0.01;
    return { z, cx: x, cy: (top + bot) / 2, w: wid, hTop: (top - bot) / 2, hBot: (top - bot) / 2, n: 3.6 };
  }, { uvFn: (t, u, uv) => { uv.u = u; uv.v = t; } });
  return orient(g, [0, 0, 0]) && g;
}
