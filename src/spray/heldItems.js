// High-resolution twins of picked-up litter for the first-person hand. The
// world's 1.35 cm voxels are fine on the ground at arm's length but read as a
// stick of dynamite 40 cm from the eye, so the hand gets the same bottle, can
// or cup rebuilt at ~2 mm from the generator's dimensions and the world model's
// own colours, with smoothed normals, placed in exactly the frame of the
// physics body: a throw hands it back to the world without a jump.
import { buildPart, smoothNormals } from './viewmodelParts.js';
import { Palette } from '../voxel/VoxelGrid.js';
import { MCLS } from '../render/voxelMaterial.js';
import { meshModel } from '../voxel/mesher.js';
import { PROPS } from '../props/catalog.js';
import { RNG, hash3i } from '../core/rng.js';
import { VS_FINE } from '../world/units.js';

const VS = 0.0021;
const U = VS_FINE;
const { sqrt, abs, min, max, sin, cos, atan2, PI } = Math;
const rnd3 = (x, y, z, s) => hash3i(x, y, z, s) / 4294967296;
const sstep = (a, b, x) => {
  const t = min(1, max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const scale = (c, k) => c.map((v) => Math.round(v * k));

const cache = new Map();

/** The world model's palette entry of that name, if any voxel uses it. */
function used(model, name) {
  const P = model?.palette;
  const idx = P?.byName.get(name);
  if (idx === undefined) return null;
  const D = model.grid.data;
  for (let i = 0; i < D.length; i++) if (D[i] === idx) return P.entries[idx];
  return null;
}

/** Geometry for the hand, in the litter shape's own frame; null when the world mesh will do. */
export function heldTwin(shape) {
  if (cache.has(shape)) return cache.get(shape);
  let geo = null;
  try {
    if (shape.name === 'bottle') geo = bottleTwin(shape);
    else if (shape.name === 'can') geo = canTwin(shape);
    else if (shape.name === 'cup' && shape.round) geo = cupTwin(shape);
  } catch (e) {
    console.warn('held twin failed', shape.key, e);
    geo = null;
  }
  if (geo) {
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
  }
  cache.set(shape, geo);
  return geo;
}

/** Built-in-idle-time twins for every shape, so a pick-up never waits on one. */
export function prebuildTwins(shapes) {
  const list = [...shapes];
  const next = () => {
    const s = list.shift();
    if (!s) return;
    heldTwin(s);
    (window.requestIdleCallback ?? ((f) => setTimeout(f, 50)))(next, { timeout: 2000 });
  };
  setTimeout(next, 4000);
}

// ───────────────────────── bottles ─────────────────────────

const SPEC = { beer: [2.2, 9, 2, 5, 1.0], wine: [2.7, 13, 3, 7, 1.0], 40: [3.1, 15, 3, 5, 1.2] };

function bottleTwin(s) {
  const v = s.rec?.opts?.variant ?? 0;
  const model = s.model;
  const kind = [0, 4].includes(v) ? 'beer' : [1, 5].includes(v) ? 'wine' : v === 2 ? '40' : 'flask';
  const broken = v >= 4;
  const ge = used(model, 'glass'), le = used(model, 'label'), ce = used(model, 'cap');
  // clear glass: what shows is mostly the dark alley behind it and the highlights
  const gc = s.glass === 'clear' ? scale(ge?.color ?? [176, 188, 182], 0.42) : ge?.color ?? [74, 42, 16];
  const P = new Palette();
  const G = P.add('glass', { color: gc, rough: 0.06, cls: MCLS.GLASS, vari: 0.02 });
  const Gd = P.add('glassThick', { color: scale(gc, 0.72), rough: 0.08, cls: MCLS.GLASS, vari: 0.02 });
  const Gin = P.add('glassIn', { color: scale(gc, 0.4), rough: 0.12, cls: MCLS.GLASS, vari: 0.03 });
  const Lb = le ? P.add('label', { color: le.color, rough: 0.82, cls: MCLS.PAPER, vari: 0.03 }) : 0;
  const Li = le ? P.add('ink', { color: scale(le.color, 0.45), rough: 0.7, cls: MCLS.PAPER, vari: 0.03 }) : 0;
  const Lw = le ? P.add('inkLight', { color: [214, 208, 192], rough: 0.75, cls: MCLS.PAPER, vari: 0.03 }) : 0;
  const Cp = ce ? P.add('cap', { color: ce.color, rough: 0.28, metal: 0.85, cls: MCLS.GENERIC, vari: 0.03 }) : 0;
  const Cd = ce ? P.add('capDark', { color: scale(ce.color, 0.6), rough: 0.4, metal: 0.8, cls: MCLS.GENERIC, vari: 0.03 }) : 0;
  let geo;
  if (kind === 'flask') geo = flaskTwin(P, { G, Gd, Lb, Li, Cp });
  else {
    const [R, bodyH, sh, neck, nr] = SPEC[kind];
    const Rb = (R + 0.35) * U, Rn = max(0.0118, nr * U * 0.95);
    const yb = bodyH * U, ys = yb + sh * U;
    const full = (bodyH + sh + neck + 1) * U;
    // broken: the world model's top is the break
    const top = broken ? s.geo.boundingBox.max.y - s.geo.boundingBox.min.y : full;
    const yL0 = Math.round(bodyH * 0.25) * U + 0.5 * U, yL1 = Math.round(bodyH * 0.8) * U + 0.5 * U;
    const crown = top - 0.0062;
    const prof = (y) => {
      if (y < yb) return Rb - 0.0024 * (1 - sstep(0, 0.006, y));
      if (y < ys) return Rb + (Rn * 1.06 - Rb) * sstep(0, 1, (y - yb) / (ys - yb));
      if (y < crown) return Rn * (1 + 0.06 * (1 - sstep(ys, ys + 0.03, y)));
      return Rn + 0.0018;
    };
    const labelAt = (x, y, z) => Lb && y > yL0 && y < yL1 && z / max(1e-6, sqrt(x * x + z * z)) > -0.3;
    // jagged break: a few teeth around the rim
    const ph = rnd3(v, s.seed, 1, 7) * 6.28;
    const cut = (a) => top - 0.004 - 0.016 * abs(sin(1.5 * a + ph)) * (0.5 + 0.5 * abs(sin(3.7 * a + ph * 2))) - 0.004 * abs(sin(9 * a));
    const sdf = (x, y, z) => {
      const r = sqrt(x * x + z * z);
      let d = max(r - prof(y) - (labelAt(x, y, z) ? 0.0004 : 0), -y);
      if (broken) {
        d = max(d, y - cut(atan2(z, x)));
        if (y > 0.0045) d = max(d, Rb - 0.0034 - r);
      } else {
        d = max(d, y - top);
        // crown cap flutes
        if (Cp && y > crown) d -= 0.0005 * (cos(21 * atan2(z, x)) > 0 ? 1 : 0);
      }
      return d;
    };
    const mat = (x, y, z, d) => {
      const r = sqrt(x * x + z * z);
      if (!broken && Cp && y > crown - 0.0004) return y > top - 0.0012 || r > Rn + 0.0021 ? Cp : Cd;
      if (labelAt(x, y, z) && d > -0.0016) {
        const a = atan2(z, x), m = (yL0 + yL1) / 2;
        // a printed band, a logo oval and pinstripes
        if (abs(y - yL0 - 0.004) < 0.0011 || abs(y - yL1 + 0.004) < 0.0011) return Li;
        const ox = (a - PI / 2) / 0.5, oy = (y - m) / ((yL1 - yL0) * 0.28);
        if (ox * ox + oy * oy < 1) return ox * ox + oy * oy > 0.7 ? Li : Lw;
        return Lb;
      }
      if (broken && r < Rb - 0.0026 && y > 0.005) return Gin;
      if (y < 0.0045) return Gd;
      return G;
    };
    geo = buildPart(P, { vs: VS, min: [-Rb - 0.003, 0, -Rb - 0.003], max: [Rb + 0.003, top + 0.001, Rb + 0.003], sdf, mat, smooth: 0.85 });
  }
  // the world flask's label stands one voxel proud of its +z face
  return place(geo, s, kind === 'flask' && le ? -U / 2 : 0);
}

function flaskTwin(P, { G, Gd, Lb, Li, Cp }) {
  // a pocket flask: flattened rounded body, sloped shoulders, short round neck, screw cap
  const hx = 3.5 * U + 0.002, hz = 1.5 * U + 0.001, H = 11 * U, rc = 0.009;
  const rn = 0.0085, neckTop = 15 * U, capTop = 16 * U;
  const box = (x, y, z, bx, by0, by1, bz, r) => {
    const qx = abs(x) - bx + r, qz = abs(z) - bz + r;
    const qy = max(by0 - y, y - by1) + r;
    const ox = max(qx, 0), oy = max(qy, 0), oz = max(qz, 0);
    return sqrt(ox * ox + oy * oy + oz * oz) + min(max(qx, max(qy, qz)), 0) - r;
  };
  const sdf = (x, y, z) => {
    // the body narrows into the shoulder over its top fifth
    const t = sstep(H * 0.78, H, y);
    const body = box(x, y, z, hx * (1 - 0.55 * t), 0, H, hz * (1 - 0.3 * t), rc * (1 - 0.5 * t));
    const neck = max(sqrt(x * x + z * z) - (y > neckTop ? rn + 0.0015 : rn), max(H - 0.004 - y, y - capTop));
    return min(body, neck);
  };
  const mat = (x, y, z, d) => {
    if (y > neckTop) return Cp || G;
    if (Lb && z > hz - 0.003 && y > 3 * U && y < 8 * U && abs(x) < hx - 0.008) return abs(y - 5.5 * U) < 0.004 ? Li : Lb;
    if (y < 0.004 || d < -0.004) return Gd;
    return G;
  };
  return buildPart(P, { vs: VS, min: [-hx - 0.002, 0, -hz - 0.002], max: [hx + 0.002, capTop + 0.002, hz + 0.003], sdf, mat, smooth: 0.8 });
}

// ───────────────────────── cans ─────────────────────────

function canTwin(s) {
  const v = s.rec?.opts?.variant ?? 0;
  const k = 5;
  const vs = U / k;
  const res = PROPS.can(new RNG(s.seed), { ...s.rec.opts, vs });
  const geo = meshModel(res.model);
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  if (v === 0) {
    // round it off: blend in the normals of the ideal cylinder
    const cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2, R = (bb.max.x - bb.min.x) / 2;
    const y0 = bb.min.y, y1 = bb.max.y;
    smoothNormals(geo, (x, y, z) => max(sqrt((x - cx) ** 2 + (z - cz) ** 2) - R, max(y0 - y, y - y1)), 0.85, vs * 0.75);
  }
  return alignBox(geo, s);
}

// ───────────────────────── cups ─────────────────────────

const CUP = { 0: [8, 3.3, 2.3, 'paper'], 1: [8, 3.3, 2.3, 'paper'], 2: [11, 3.6, 2.6, 'wax'], 3: [8, 3.5, 2.4, 'red'], 4: [8, 3.4, 2.4, 'clear'] };

function cupTwin(s) {
  const v = s.rec?.opts?.variant ?? 0;
  const [h, rt, rb, wallName] = CUP[v];
  const model = s.model;
  const we = used(model, wallName), se = used(model, 'sleeve'), le = used(model, 'lid'), st = used(model, 'straw');
  const P = new Palette();
  const wcls = wallName === 'paper' || wallName === 'wax' ? MCLS.PAPER : MCLS.PLASTIC;
  const W = P.add('wall', { color: we?.color ?? [214, 210, 200], rough: wallName === 'wax' ? 0.5 : wcls === MCLS.PAPER ? 0.85 : 0.35, cls: wcls, vari: 0.03 });
  const Wi = P.add('wallIn', { color: scale(we?.color ?? [214, 210, 200], 0.75), rough: 0.8, cls: wcls, vari: 0.04 });
  const Sl = se ? P.add('sleeve', { color: se.color, rough: 0.92, cls: MCLS.CARDBOARD, vari: 0.06 }) : 0;
  const Ld = le ? P.add('lid', { color: le.color, rough: 0.35, cls: MCLS.PLASTIC, vari: 0.03 }) : 0;
  const Sw = st ? P.add('straw', { color: st.color, rough: 0.35, cls: MCLS.PLASTIC, vari: 0.03 }) : 0;
  const H = h * U, Rt = (rt + 0.35) * U, Rb = (rb + 0.35) * U, T = 0.0013;
  const prof = (y) => Rb + (Rt - Rb) * (y / H);
  const lidTop = H + 0.006;
  const sdf = (x, y, z) => {
    const r = sqrt(x * x + z * z);
    // tapered shell with a closed bottom and a rolled rim
    let d = max(r - prof(y), max(-y, y - H));
    d = max(d, -max(prof(y) - T - r, max(T - y, y - H - 1)));
    const rim = sqrt((r - Rt) ** 2 + (y - H + 0.0012) ** 2) - 0.0016;
    d = min(d, rim);
    if (Ld) {
      // snap-on lid: a shallow dome with a raised rim
      const lid = max(r - Rt - 0.0012, max(H - 0.003 - y, y - (lidTop - 0.003 * sstep(0, Rt, r))));
      d = min(d, lid);
    }
    if (Sw) {
      // straw through the lid, leaning out
      const ax = 0.25 * U, az = 0.25 * U;
      const t = (y - (H - 3 * U)) / (8 * U);
      const sx = U + ax * t * 4, sz = az * t * 4;
      if (t > 0 && t < 1) d = min(d, sqrt((x - sx) ** 2 + (z - sz) ** 2) - 0.0034);
    }
    return d;
  };
  const mat = (x, y, z, d) => {
    const r = sqrt(x * x + z * z);
    if (Sw && y > H - 3 * U && r < Rt * 0.7 && sqrt((x - U) ** 2 + z * z) < 0.012) return Sw;
    if (Ld && y > H - 0.003) return Ld;
    if (r < prof(y) - T * 0.5 && y > T) return Wi;
    if (Sl && y > 2.5 * U && y < 6.2 * U) return Sl;
    return W;
  };
  const geo = buildPart(P, { vs: VS, min: [-Rt - 0.004, 0, -Rt - 0.004], max: [Rt + 0.008, (Sw ? H + 5.5 * U : lidTop) + 0.002, Rt + 0.006], sdf, mat, smooth: 0.8 });
  // the world cup's mouth is at whichever end the shape found wider
  const mouthDown = !!s.grip?.flip;
  if (mouthDown) geo.rotateX(PI);
  geo.computeBoundingBox();
  const bb = geo.boundingBox, wb = s.geo.boundingBox;
  geo.translate(s.cx - (bb.min.x + bb.max.x) / 2, mouthDown ? wb.max.y - bb.max.y : wb.min.y - bb.min.y, s.cz - (bb.min.z + bb.max.z) / 2);
  return geo;
}

// ───────────────────────── placing ─────────────────────────

/** Twin built upright on its axis at x = z = 0, base at y = 0: onto the world model's axis and base. */
function place(geo, s, dz = 0) {
  const wb = s.geo.boundingBox;
  geo.translate((wb.min.x + wb.max.x) / 2, wb.min.y, (wb.min.z + wb.max.z) / 2 + dz);
  return geo;
}

/** Twin of the same model at a finer voxel size: line their boxes up. */
function alignBox(geo, s) {
  geo.computeBoundingBox();
  const a = geo.boundingBox, b = s.geo.boundingBox;
  geo.translate((b.min.x + b.max.x - a.min.x - a.max.x) / 2, (b.min.y + b.max.y - a.min.y - a.max.y) / 2, (b.min.z + b.max.z - a.min.z - a.max.z) / 2);
  return geo;
}
