import * as THREE from 'three';
import { buildFitted } from './GarmentBuilder.js';
import { makeFabricMaterial } from './fabric.js';

const deg = Math.PI / 180;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;

/**
 * Footwear.  Each style defines its heel height / sole thickness (which the
 * locomotion uses for foot geometry and IK), an upper cut out of the foot's
 * surface, a toe shape, a heel type and the gait it induces.
 */
export const SHOE_STYLES = {
  sneakers: {
    label: 'Sneakers', materials: ['cotton', 'leather', 'suede'], color: '#f2f1ec', color2: '#fbfbf8',
    heel: 0.03, sole: 0.02, upper: 'sneaker', toe: 'round', heelType: 'flat', soleMat: 'rubber', soleColor: '#f7f7f4',
    gait: { heel: 0.03, sole: 0.02, hsAngle: 19 * deg, toeMax: 34 * deg, toAngle: 48 * deg, armSwing: 1.05 },
  },
  flats: {
    label: 'Ballet flats', materials: ['leather', 'patent', 'suede', 'silk'], color: '#111114',
    heel: 0.01, sole: 0.006, upper: 'flat', toe: 'round', heelType: 'flat', soleMat: 'leather', soleColor: '#2b211c',
    gait: { heel: 0.01, sole: 0.006, hsAngle: 14 * deg, toeMax: 38 * deg },
  },
  loafers: {
    label: 'Loafers', materials: ['leather', 'suede', 'patent'], color: '#5b3e2b',
    heel: 0.024, sole: 0.012, upper: 'loafer', toe: 'round', heelType: 'flat', soleMat: 'leather', soleColor: '#2b211c',
    gait: { heel: 0.024, sole: 0.012, hsAngle: 16 * deg, toeMax: 30 * deg },
  },
  sandals: {
    label: 'Strappy sandals', materials: ['leather', 'suede', 'metal'], color: '#c2a878',
    heel: 0.016, sole: 0.01, upper: 'sandal', toe: 'round', heelType: 'flat', soleMat: 'leather', soleColor: '#8a6a4a', open: true,
    gait: { heel: 0.016, sole: 0.01, hsAngle: 13 * deg, toeMax: 36 * deg },
  },
  pumps: {
    label: 'Mid-heel pumps', materials: ['leather', 'patent', 'suede'], color: '#7a1f2b',
    heel: 0.065, sole: 0.008, upper: 'pump', toe: 'almond', heelType: 'slim', soleMat: 'leather', soleColor: '#1a1414',
    gait: {
      heel: 0.065, sole: 0.008, hsAngle: 9 * deg, toAngle: 30 * deg, toeMax: 16 * deg, strideScale: 0.91, cadenceScale: 1.05,
      stepWidth: 0.055, toeOut: 8 * deg, pelvisRoll: 6.2 * deg, pelvisYaw: 7 * deg, lateralShift: 0.62, loadingFlex: 9 * deg,
      midFlex: 3.5 * deg, footFlatAt: 0.1, heelOffAt: 0.62, tiltBase: 5 * deg, trunkUpright: 1.5, bounce: 0.82, armSwing: 0.95,
    },
  },
  stilettos: {
    label: 'Stiletto heels', materials: ['patent', 'leather', 'suede', 'silk'], color: '#111114',
    heel: 0.1, sole: 0.008, upper: 'pump', toe: 'pointed', heelType: 'stiletto', soleMat: 'leather', soleColor: '#7a1f2b',
    gait: {
      heel: 0.1, sole: 0.008, hsAngle: 6 * deg, toAngle: 22 * deg, toeMax: 11 * deg, strideScale: 0.84, cadenceScale: 1.08,
      stepWidth: 0.025, toeOut: 9 * deg, pelvisRoll: 7.5 * deg, pelvisYaw: 8.5 * deg, lateralShift: 0.72, loadingFlex: 6 * deg,
      midFlex: 2.5 * deg, footFlatAt: 0.07, heelOffAt: 0.66, tiltBase: 7 * deg, trunkUpright: 3, bounce: 0.7, armSwing: 0.9,
      liftHeight: 0.04,
    },
  },
  boots_ankle: {
    label: 'Ankle boots', materials: ['leather', 'suede'], color: '#2b211c',
    heel: 0.048, sole: 0.012, upper: 'ankleboot', toe: 'almond', heelType: 'block', soleMat: 'rubber', soleColor: '#1a1414',
    gait: { heel: 0.048, sole: 0.012, hsAngle: 12 * deg, toAngle: 40 * deg, toeMax: 24 * deg, strideScale: 0.97, pelvisRoll: 5 * deg, tiltBase: 4 * deg },
  },
  boots_knee: {
    label: 'Knee-high boots', materials: ['leather', 'suede'], color: '#5b3e2b',
    heel: 0.065, sole: 0.012, upper: 'kneeboot', toe: 'almond', heelType: 'block', soleMat: 'rubber', soleColor: '#1a1414',
    gait: {
      heel: 0.065, sole: 0.012, hsAngle: 10 * deg, toAngle: 32 * deg, toeMax: 18 * deg, strideScale: 0.93, cadenceScale: 1.03,
      pelvisRoll: 5.8 * deg, pelvisYaw: 6.5 * deg, stepWidth: 0.07, loadingFlex: 10 * deg, footFlatAt: 0.11, tiltBase: 5 * deg, trunkUpright: 1, bounce: 0.85,
    },
  },
};

function footLocal(s, rig) {
  const side = s.x > 0 ? 'l' : 'r';
  const Lg = rig.leg[side];
  const ank = Lg.ankle;
  return { side, Lg, z: s.z - ank.z, x: s.x - ank.x, y: s.y };
}

function upperField(style, rig) {
  return (s) => {
    if (s.arm > 0.2) return 1;
    const f = footLocal(s, rig);
    const Lg = f.Lg;
    const bz = Lg.b.z;
    const L = s.L;
    if (style.upper === 'kneeboot') return s.leg < 0.5 ? 1 : s.y - (L.kneeL.y - 0.045);
    if (style.upper === 'ankleboot') return s.leg < 0.5 ? 1 : s.y - (Lg.ankle.y + 0.09);
    if (s.foot < 0.25) return 1;
    if (style.upper === 'sneaker') {
      const back = smoothstep(0.0, -0.04, f.z), front = smoothstep(0.0, 0.04, f.z);
      return s.y - mix(mix(0.058, 0.088, back), 0.105, front);
    }
    if (style.upper === 'loafer' || style.upper === 'flat' || style.upper === 'pump') {
      // smooth topline: low walls along the sides, a U-shaped vamp in front
      const vampZ = style.upper === 'loafer' ? bz - 0.055 : style.upper === 'pump' ? bz - 0.028 : bz - 0.02;
      const xc = mix(0, Lg.b.x, clamp(f.z / bz, 0, 1));
      const u = (f.x - xc) / 0.04;
      const vampLine = vampZ - 0.03 * u * u;
      const back = smoothstep(0.0, -0.04, f.z);
      const wall = style.upper === 'loafer' ? mix(0.038, 0.05, back) : mix(style.upper === 'pump' ? 0.022 : 0.026, 0.052, back);
      return -Math.max(wall - s.y, f.z - vampLine);
    }
    if (style.upper === 'sandal') {
      const toeStrap = Math.abs(f.z - (bz + 0.008)) - 0.011;
      const ankleStrap = Math.max(Math.abs(s.y - (Lg.ankle.y - 0.006)) - 0.007, f.z - 0.05);
      const heelStrap = Math.max(f.z + 0.02, s.y - (Lg.ankle.y - 0.004));
      const instep = Math.max(Math.abs(f.z - (bz - 0.04)) - 0.007, s.y - 0.08);
      return Math.min(toeStrap, ankleStrap, heelStrap, instep);
    }
    return 1;
  };
}

/** Toe-box shaping (almond / pointed) applied in rest space. */
function toeTransform(style, rig) {
  const ext = style.toe === 'pointed' ? 0.032 : style.toe === 'almond' ? 0.016 : 0.004;
  const taper = style.toe === 'pointed' ? 0.62 : style.toe === 'almond' ? 0.32 : 0.0;
  return (p, side) => {
    const Lg = rig.leg[side];
    const z0 = Lg.ankle.z + Lg.b.z - 0.005;
    const zt = Lg.ankle.z + Lg.toeTip;
    const u = clamp((p.z - z0) / (zt - z0), 0, 1.2);
    if (u <= 0) return;
    const cx = Lg.ball.x - (side === 'l' ? 0.004 : -0.004);
    p.x = cx + (p.x - cx) * (1 - taper * u * u);
    p.z += ext * u * u;
    p.y = p.y * (1 - 0.25 * taper * u);
  };
}

export function buildShoes(w, o, style) {
  const atlas = w.atlas, ch = w.character;
  const rig = w.rig || (w.rig = { leg: {} });
  // foot geometry in rest space (same conventions as Locomotion.footPose)
  for (const sd of ['l', 'r']) {
    const ankle = ch.restModel['foot_' + sd], ball = ch.restModel['ball_' + sd];
    const lm = ch.meta.landmarks['foot_' + sd];
    rig.leg[sd] = {
      ankle, ball,
      b: new THREE.Vector3(ball.x - ankle.x, 0, ball.z - ankle.z),
      h: new THREE.Vector3(0, 0, lm.heel_back_z + 0.022 - ankle.z),
      toeTip: lm.toe_tip_z - ankle.z, heelBack: lm.heel_back_z - ankle.z,
    };
  }
  const group = new THREE.Group();
  group.name = 'shoes';
  const upperMat = makeFabricMaterial({ ...o, pattern: 'solid' });
  const soleMat = makeFabricMaterial({ material: style.soleMat === 'rubber' ? 'rubber' : 'leather', color: o.color2 && style.upper === 'sneaker' ? o.color2 : style.soleColor });
  const heelMat = style.heelType === 'block' || style.heelType === 'flat' ? soleMat : upperMat;

  // ---------------------------------------------------------------- upper
  const key = 'shoe:' + o._id;
  let up = w.geomCache.get(key);
  if (!up) {
    if (style.upper === 'sandal') {
      // straps follow the foot closely: cut them out of the foot surface
      up = buildFitted(atlas, {
        field: upperField(style, rig), offset: () => 0.0025, smooth: 4, hem: 0.0015, hemSmooth: 10, coverMargin: 0.004,
      });
      up.cut = false;
    } else {
      const last = buildLasts(ch, atlas, rig, style);
      up = { geometry: last, covered: coveredBy(atlas, upperField(style, rig), 0.006), cut: true };
      if (style.upper.endsWith('boot')) {
        const topY = style.upper === 'kneeboot' ? atlas.L.kneeL.y - 0.045 : rig.leg.l.ankle.y + 0.09;
        const shaft = buildFitted(atlas, {
          field: (s) => (s.leg < 0.5 ? 1 : Math.max(s.y - topY, 0.045 - s.y)),
          offset: (s) => 0.0042 + 0.003 * smoothstep(0.12, 0.06, s.y), smooth: 10, hem: 0.004, hemSmooth: 12, coverMargin: 0.004,
        });
        up.shaft = shaft.geometry;
        for (let t = 0; t < shaft.covered.length; t++) if (shaft.covered[t]) up.covered[t] = 1;
      }
    }
    w.geomCache.set(key, up);
  }
  const upperMat2 = up.cut ? makeFabricMaterial({ ...o, pattern: 'solid', cut: true }) : upperMat;
  const upperMesh = new THREE.SkinnedMesh(up.geometry, upperMat2);
  group.add(upperMesh);
  if (up.shaft) group.add(new THREE.SkinnedMesh(up.shaft, upperMat));

  // ---------------------------------------------------------------- soles & heels
  const sg = buildSoles(ch, rig, style);
  const soleMesh = new THREE.SkinnedMesh(sg.sole, soleMat);
  group.add(soleMesh);
  if (sg.heel) group.add(new THREE.SkinnedMesh(sg.heel, heelMat));

  for (const m of group.children) {
    m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; m.renderOrder = 2;
  }
  ch.model.add(group);
  for (const m of group.children) m.bind(ch.skeleton, ch.body.bindMatrix);
  // sandals expose the toes: don't hide skin
  const covered = style.open ? null : up.covered;
  return {
    object: group, covered, material: upperMat,
    restyle: (opts) => {
      if (opts.color) { upperMat.color.set(opts.color); upperMat2.color.set(opts.color); }
    },
    dispose: () => { group.parent && group.parent.remove(group); soleMat.dispose(); },
  };
}

/**
 * A smooth "shoe last": per cross-section (along the foot) convex envelope of
 * the foot, so uppers form a rounded toe box instead of following each toe.
 */
export function footEnvelope(atlas, ch, side) {
  const ank = ch.restModel['foot_' + side];
  const P = atlas.P;
  const step = 0.005, z0 = -0.07;
  const NA = 32;
  const slices = [];
  for (let i = 0; i < atlas.count; i++) {
    if (atlas.foot[i] < 0.5) continue;
    const x = P[i * 3];
    if ((x > 0) !== (side === 'l')) continue;
    const y = P[i * 3 + 1]; if (y > 0.1) continue;
    const k = Math.round((P[i * 3 + 2] - ank.z - z0) / step);
    if (k < 0) continue;
    (slices[k] ||= []).push(i);
  }
  const data = slices.map((arr) => {
    if (!arr || arr.length < 4) return null;
    let mnx = 1e9, mxx = -1e9, mny = 1e9, mxy = -1e9;
    for (const i of arr) { mnx = Math.min(mnx, P[i * 3]); mxx = Math.max(mxx, P[i * 3]); mny = Math.min(mny, P[i * 3 + 1]); mxy = Math.max(mxy, P[i * 3 + 1]); }
    const cx = (mnx + mxx) / 2, cy = (mny + mxy) / 2;
    const r = new Float32Array(NA);
    for (let a = 0; a < NA; a++) {
      const th = (a / NA) * Math.PI * 2, c = Math.cos(th), sn = Math.sin(th);
      let best = 0;
      for (const i of arr) best = Math.max(best, (P[i * 3] - cx) * c + (P[i * 3 + 1] - cy) * sn);
      r[a] = best;
    }
    return { cx, cy, r };
  });
  const at = (k) => { for (let d = 0; d < 6; d++) { if (data[k - d]) return data[k - d]; if (data[k + d]) return data[k + d]; } return null; };
  return {
    apply(p, b, off) {
      const zl = b.z - ank.z;
      if (zl < -0.01 || b.y > 0.08) return false;
      const wgt = smoothstep(-0.01, 0.035, zl) * (1 - smoothstep(0.06, 0.08, b.y));
      if (wgt <= 0) return false;
      const kf = (zl - z0) / step;
      const k0 = Math.floor(kf), t = kf - k0;
      const A = at(k0), B = at(k0 + 1) || A;
      if (!A) return false;
      const cx = mix(A.cx, B.cx, t), cy = mix(A.cy, B.cy, t);
      const th = Math.atan2(b.y - cy, b.x - cx);
      const af = ((th / (Math.PI * 2)) * NA + NA) % NA;
      const a0 = Math.floor(af), at2 = af - a0, a1 = (a0 + 1) % NA;
      const rA = mix(A.r[a0], A.r[a1], at2), rB = mix(B.r[a0], B.r[a1], at2);
      const r = mix(rA, rB, t) + off;
      const tx = cx + Math.cos(th) * r, ty = Math.max(0.0015, cy + Math.sin(th) * r);
      p.x = mix(p.x, tx, wgt); p.y = mix(p.y, ty, wgt);
      return true;
    },
  };
}

function coveredBy(atlas, field, margin) {
  const F = new Float32Array(atlas.count);
  for (let i = 0; i < atlas.count; i++) { const sm = atlas.sample(i); sm.L = atlas.L; F[i] = field(sm); }
  const out = new Uint8Array(atlas.triCount);
  for (let t = 0; t < atlas.triCount; t++) {
    const a = atlas.T[t * 3], b = atlas.T[t * 3 + 1], c = atlas.T[t * 3 + 2];
    if (Math.max(F[a], F[b], F[c]) < -margin) out[t] = 1;
  }
  return out;
}

/** Footprint outline (plant-local x,z, CCW) with toe shaping. */
function footOutline(ch, rig, side, style, margin) {
  const Lg = rig.leg[side];
  const ankle = Lg.ankle;
  const bones = ch.skeleton.bones.map((b) => b.name);
  const fi = bones.indexOf('foot_' + side), bi = bones.indexOf('ball_' + side);
  const tt = toeTransform(style, rig);
  const pts = [];
  const P = ch.body.geometry.attributes.position;
  const si = ch.body.geometry.attributes.skinIndex, sw = ch.body.geometry.attributes.skinWeight;
  for (let i = 0; i < P.count; i++) {
    const y = P.getY(i); if (y > 0.022) continue;
    let wf = 0; for (let k = 0; k < 4; k++) { const b = si.getComponent(i, k); if (b === fi || b === bi) wf += sw.getComponent(i, k); }
    if (wf < 0.5) continue;
    const p = new THREE.Vector3(P.getX(i), 0, P.getZ(i));
    tt(p, side);
    pts.push([p.x - ankle.x, p.z - ankle.z]);
  }
  let hull = resample(convexHull(pts), 48);
  let cx = 0, cz = 0; for (const p of hull) { cx += p[0]; cz += p[1]; } cx /= hull.length; cz /= hull.length;
  hull = hull.map(([x, z]) => { const dx = x - cx, dz = z - cz, l = Math.hypot(dx, dz) || 1; return [x + (dx / l) * margin, z + (dz / l) * margin]; });
  return { hull, cx, cz };
}

/**
 * Lofted "shoe last": cross-sections along the foot whose width follows the
 * footprint outline and whose height follows the (smoothed) instep height.
 * The collar / vamp opening is cut per pixel with a `cut` attribute.
 */
function buildLasts(ch, atlas, rig, style) {
  const pos = [], idx = [], skin = [], cut = [], rest = [];
  const bones = ch.skeleton.bones.map((b) => b.name);
  const field = upperField(style, rig);
  const sneaker = style.upper === 'sneaker';
  const boot = style.upper.endsWith('boot');
  const off = sneaker ? 0.009 : boot ? 0.006 : 0.004;
  for (const sd of ['l', 'r']) {
    const Lg = rig.leg[sd], ankle = Lg.ankle;
    const fi = bones.indexOf('foot_' + sd), bi = bones.indexOf('ball_' + sd);
    const { hull } = footOutline(ch, rig, sd, style, sneaker ? 0.004 : 0.0015);
    let zmin = 1e9, zmax = -1e9;
    for (const [, z] of hull) { zmin = Math.min(zmin, z); zmax = Math.max(zmax, z); }
    // instep height profile from the real foot
    const step = 0.004, n = Math.ceil((zmax - zmin) / step) + 1;
    const Hraw = new Float32Array(n);
    const P = atlas.P;
    for (let i = 0; i < atlas.count; i++) {
      if (atlas.foot[i] < 0.35) continue;
      if ((P[i * 3] > 0) !== (sd === 'l')) continue;
      const y = P[i * 3 + 1]; if (y > 0.11) continue;
      const k = Math.round((P[i * 3 + 2] - ankle.z - zmin) / step);
      if (k >= 0 && k < n) Hraw[k] = Math.max(Hraw[k], y);
    }
    const toeZ = Lg.toeTip;
    let last = 0;
    for (let k = 0; k < n; k++) { if (Hraw[k] > 0) last = Hraw[k]; else Hraw[k] = last; }
    // beyond the real toes (pointed styles) taper the toe box down
    for (let k = 0; k < n; k++) {
      const z = zmin + k * step;
      if (z > toeZ - 0.004) Hraw[k] = Math.min(Hraw[k], mix(0.022, 0.008, smoothstep(toeZ - 0.004, zmax, z)));
    }
    const H = new Float32Array(n);
    for (let k = 0; k < n; k++) { let m = 0; for (let d = -3; d <= 3; d++) m = Math.max(m, Hraw[clamp(k + d, 0, n - 1)]); H[k] = m; }
    const H2 = new Float32Array(n);
    for (let k = 0; k < n; k++) { let a = 0, c = 0; for (let d = -3; d <= 3; d++) { a += H[clamp(k + d, 0, n - 1)]; c++; } H2[k] = a / c; }
    const Hat = (z) => { const f = clamp((z - zmin) / step, 0, n - 1); const k0 = Math.floor(f), k1 = Math.min(n - 1, k0 + 1); return mix(H2[k0], H2[k1], f - k0); };
    // width at z from the outline
    const widthAt = (z) => {
      let xl = 1e9, xr = -1e9;
      for (let i = 0; i < hull.length; i++) {
        const a = hull[i], b = hull[(i + 1) % hull.length];
        if ((a[1] - z) * (b[1] - z) > 0) continue;
        const t = Math.abs(b[1] - a[1]) < 1e-9 ? 0.5 : (z - a[1]) / (b[1] - a[1]);
        const x = a[0] + (b[0] - a[0]) * t;
        xl = Math.min(xl, x); xr = Math.max(xr, x);
      }
      if (xl > xr) { xl = xr = 0; }
      return [xl, xr];
    };
    const K = 46, M = 30;
    const base = pos.length / 3;
    for (let k = 0; k < K; k++) {
      const t = k / (K - 1);
      const tt = 0.5 - 0.5 * Math.cos(Math.PI * t);      // denser at the ends
      const z = mix(zmin + 0.0005, zmax - 0.0005, tt);
      const [xl, xr] = widthAt(z);
      const xc = (xl + xr) / 2, hw = Math.max(0.0005, (xr - xl) / 2);
      const h = Hat(z) + off * (k === 0 || k === K - 1 ? 0.3 : 1);
      const endT = Math.min(t, 1 - t);
      const endRound = Math.pow(clamp(endT / 0.06, 0, 1), 0.5);      // round off the ends
      for (let m = 0; m < M; m++) {
        const ph = (m / (M - 1)) * Math.PI;
        const c = Math.cos(ph), sn = Math.sin(ph);
        const x = xc - hw * Math.sign(c) * Math.pow(Math.abs(c), 0.8);
        const y = Math.max(0.0005, h * Math.pow(sn, 0.45) * mix(0.55, 1, endRound));
        const wx = ankle.x + x, wz = ankle.z + z;
        pos.push(wx, y, wz);
        rest.push(wx, y, wz);
        const wb = smoothstep(Lg.b.z - 0.022, Lg.b.z + 0.012, z);
        skin.push([fi, bi, wb]);
        // opening: evaluate the style's field at the matching foot surface point
        const sm = { x: wx, y, z: wz, arm: 0, leg: 1, foot: 1, L: atlas.L };
        cut.push(-field(sm));
      }
    }
    for (let k = 0; k < K - 1; k++) for (let m = 0; m < M - 1; m++) {
      const a = base + k * M + m, b = a + 1, c = a + M, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  const SI = new Uint16Array(skin.length * 4), SW = new Float32Array(skin.length * 4);
  skin.forEach(([f, b, wb], i) => { SI[i * 4] = f; SI[i * 4 + 1] = b; SW[i * 4] = 1 - wb; SW[i * 4 + 1] = wb; });
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(SI, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(SW, 4));
  g.setAttribute('restPos', new THREE.BufferAttribute(new Float32Array(rest), 3));
  g.setAttribute('cut', new THREE.BufferAttribute(new Float32Array(cut), 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.setAttribute('restNormal', new THREE.BufferAttribute(g.attributes.normal.array.slice(), 3));
  return g;
}

/**
 * Soles and heels are modelled in "pose space" (foot pitched onto its heel,
 * forefoot flat on the floor) where shapes are intuitive, then mapped back to
 * the bind pose so that skinning reproduces them exactly.
 */
function buildSoles(ch, rig, style) {
  const H = style.heel, S = style.sole;
  const bones = ch.skeleton.bones.map((b) => b.name);
  const soleVerts = [], soleIdx = [], soleSkin = [], soleRest = [];
  const heelVerts = [], heelIdx = [], heelSkin = [];
  const tt = toeTransform(style, rig);
  for (const sd of ['l', 'r']) {
    const Lg = rig.leg[sd];
    const ankle = Lg.ankle;
    const bz = Lg.b.z, hz = Lg.h.z;
    const theta = Math.asin(clamp((H - S) / (bz - hz), 0, 0.95));
    const ballJ = ch.restModel['ball_' + sd];
    const fi = bones.indexOf('foot_' + sd), bi = bones.indexOf('ball_' + sd);
    // plant-local (relative to ankle projection) <-> pose transforms
    const rot = (y, z, a, cz) => { const c = Math.cos(a), s = Math.sin(a); const zz = z - cz; return [y * c - zz * s, cz + y * s + zz * c]; };
    const footToPose = (x, y, z) => { const [py, pz] = rot(y, z, theta, bz); return [x, py + S, pz]; };
    const poseToFoot = (x, y, z) => { const [ry, rz] = rot(y - S, z, -theta, bz); return [x, ry, rz]; };
    const bjl = [ballJ.x - ankle.x, ballJ.y, ballJ.z - ankle.z];
    const bjp = footToPose(...bjl);
    const dBall = [bjp[0] - bjl[0], bjp[1] - bjl[1], bjp[2] - bjl[2]];
    const ballW = (zLocal) => smoothstep(bz - 0.022, bz + 0.012, zLocal);
    const toRest = (p, wBall) => {
      const fp = poseToFoot(p[0], p[1], p[2]);
      const bp = [p[0] - dBall[0], p[1] - dBall[1], p[2] - dBall[2]];
      return [ankle.x + mix(fp[0], bp[0], wBall), mix(fp[1], bp[1], wBall), ankle.z + mix(fp[2], bp[2], wBall)];
    };

    const margin = style.upper === 'sneaker' ? 0.007 : style.upper.endsWith('boot') ? 0.005 : 0.003;
    const { hull, cx, cz } = footOutline(ch, rig, sd, style, margin);

    // ---- sole rings in pose space: top (under foot), bevel, bottom (ground)
    const heeled = H - S > 0.03;
    const ringTop = [], ringMid = [], ringBot = [];
    const wB = [];
    for (const [x, z] of hull) {
      const wb = ballW(z);
      // pose-space point of the foot sole at this outline position
      const fp = footToPose(x, 0, z);
      const bp = [x + dBall[0], dBall[1], z + dBall[2]];
      const top = [mix(fp[0], bp[0], wb), mix(fp[1], bp[1], wb), mix(fp[2], bp[2], wb)];
      top[1] -= 0.0012;
      let bottomY;
      if (heeled) bottomY = Math.max(0, top[1] - mix(0.006, S, wb));
      else bottomY = 0;
      // arch/shank lift between heel seat and ball
      ringTop.push(top);
      ringMid.push([top[0] + (top[0] - (cx)) * 0.0, mix(top[1], bottomY, 0.5), top[2]]);
      ringBot.push([top[0], bottomY, top[2]]);
      wB.push(wb);
    }
    // the shank of a heeled shoe curves up from the forefoot to the heel seat
    const base = soleVerts.length / 3;
    const rings = [ringTop, ringMid, ringBot];
    const n = hull.length;
    // bevel: mid ring pushed outward
    for (let i = 0; i < n; i++) {
      const p = ringMid[i]; const dx = p[0] - cx, dz = p[2] - cz, l = Math.hypot(dx, dz) || 1;
      p[0] += (dx / l) * 0.0018; p[2] += (dz / l) * 0.0018;
    }
    for (let r = 0; r < 3; r++) for (let i = 0; i < n; i++) {
      const p = rings[r][i];
      const rp = toRest(p, wB[i]);
      soleVerts.push(rp[0], rp[1], rp[2]);
      soleRest.push(p[0] + ankle.x, p[1], p[2] + ankle.z);
      soleSkin.push([fi, bi, wB[i]]);
    }
    // caps
    const cTop = soleVerts.length / 3;
    { const p = [cx, 0, cz]; const wb = ballW(cz); const fp = footToPose(cx, 0, cz); const bp = [cx + dBall[0], dBall[1], cz + dBall[2]];
      const t = [mix(fp[0], bp[0], wb), mix(fp[1], bp[1], wb) - 0.0012, mix(fp[2], bp[2], wb)]; void p;
      const rp = toRest(t, wb); soleVerts.push(...rp); soleRest.push(t[0] + ankle.x, t[1], t[2] + ankle.z); soleSkin.push([fi, bi, wb]);
      const bt = [t[0], heeled ? Math.max(0, t[1] - mix(0.006, S, wb)) : 0, t[2]];
      const rb = toRest(bt, wb); soleVerts.push(...rb); soleRest.push(bt[0] + ankle.x, bt[1], bt[2] + ankle.z); soleSkin.push([fi, bi, wb]);
    }
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      // top cap faces up, bottom faces down (hull is CCW in x,z)
      soleIdx.push(cTop, base + j, base + i);
      soleIdx.push(cTop + 1, base + 2 * n + i, base + 2 * n + j);
      for (let r = 0; r < 2; r++) {
        const a = base + r * n + i, b = base + r * n + j, c = base + (r + 1) * n + i, d = base + (r + 1) * n + j;
        soleIdx.push(a, b, c, b, d, c);
      }
    }

    // ---- heel column (vertical in pose space)
    if (heeled && style.heelType !== 'flat') {
      const zSeat = hz + (style.heelType === 'block' ? 0.022 : 0.016);
      const seat = footToPose(0, 0, zSeat);
      const seatY = seat[1] - 0.006;
      const prof = style.heelType === 'stiletto' ? { r0: [0.013, 0.016], r1: [0.0042, 0.0042], back: 0.006 }
        : style.heelType === 'slim' ? { r0: [0.016, 0.019], r1: [0.007, 0.007], back: 0.004 }
          : { r0: [0.026, 0.024], r1: [0.022, 0.019], back: 0.0 };
      const seg = 20, levels = 8;
      const hb = heelVerts.length / 3;
      for (let l = 0; l <= levels; l++) {
        const t = l / levels;
        const y = mix(seatY, 0, t);
        const rx = mix(prof.r0[0], prof.r1[0], Math.pow(t, 0.7));
        const rz = mix(prof.r0[1], prof.r1[1], Math.pow(t, 0.7));
        // stilettos curve: the tip sits slightly forward of the seat's back
        const zc = seat[2] + 0.004 + prof.back * t * t - (style.heelType === 'block' ? 0 : 0.004 * Math.sin(Math.PI * t));
        for (let k = 0; k < seg; k++) {
          const a = (k / seg) * Math.PI * 2;
          const sq = style.heelType === 'block' ? 0.35 : 0;
          const ca = Math.cos(a), sa = Math.sin(a);
          const sx = Math.sign(sa) * Math.pow(Math.abs(sa), 1 - sq), sz = Math.sign(ca) * Math.pow(Math.abs(ca), 1 - sq);
          const p = [seat[0] + sx * rx, y, zc + sz * rz];
          const rp = toRest(p, 0);
          heelVerts.push(rp[0], rp[1], rp[2]);
          heelSkin.push([fi, bi, 0]);
        }
      }
      for (let l = 0; l < levels; l++) for (let k = 0; k < seg; k++) {
        const a = hb + l * seg + k, b = hb + l * seg + (k + 1) % seg, c = a + seg, d = b + seg;
        heelIdx.push(a, c, b, b, c, d);
      }
      // bottom cap (top-lift)
      const cb = heelVerts.length / 3;
      { const p = [seat[0], 0, seat[2] + 0.004 + prof.back]; const rp = toRest(p, 0); heelVerts.push(...rp); heelSkin.push([fi, bi, 0]); }
      for (let k = 0; k < seg; k++) heelIdx.push(cb, hb + levels * seg + (k + 1) % seg, hb + levels * seg + k);
    }
  }
  const mk = (verts, idx, skin, restArr) => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(verts);
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const SI = new Uint16Array(skin.length * 4), SW = new Float32Array(skin.length * 4);
    skin.forEach(([f, b, wb], i) => { SI[i * 4] = f; SI[i * 4 + 1] = b; SW[i * 4] = 1 - wb; SW[i * 4 + 1] = wb; });
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(SI, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(SW, 4));
    g.setAttribute('restPos', new THREE.BufferAttribute(new Float32Array(restArr || verts), 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    g.setAttribute('restNormal', new THREE.BufferAttribute(g.attributes.normal.array.slice(), 3));
    return g;
  };
  return {
    sole: mk(soleVerts, soleIdx, soleSkin, soleRest),
    heel: heelVerts.length ? mk(heelVerts, heelIdx, heelSkin) : null,
  };
}

function convexHull(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [], upper = [];
  for (const q of p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); }
  upper.pop(); lower.pop();
  return lower.concat(upper);
}

function resample(poly, n) {
  const segs = []; let total = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]); segs.push(l); total += l;
  }
  const out = [];
  let si = 0, acc = 0;
  for (let k = 0; k < n; k++) {
    const target = (k / n) * total;
    while (acc + segs[si] < target) { acc += segs[si]; si++; }
    const t = (target - acc) / (segs[si] || 1);
    const a = poly[si], b = poly[(si + 1) % poly.length];
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  // smooth corners (Chaikin-like averaging)
  for (let it = 0; it < 2; it++) {
    const c = out.map((p) => p.slice());
    for (let i = 0; i < n; i++) {
      const a = c[(i - 1 + n) % n], b = c[i], d = c[(i + 1) % n];
      out[i] = [(a[0] + 2 * b[0] + d[0]) / 4, (a[1] + 2 * b[1] + d[1]) / 4];
    }
  }
  return out;
}
