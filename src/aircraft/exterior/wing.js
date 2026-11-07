// =============================================================================
// Wing geometry (right wing; the left wing is the same set under a group with
// scale.x = -1). Built from planform.js so every part (fixed box, spoilers,
// double-slotted flaps, canoes, slats, Krueger flaps, aileron, winglet) lines up
// with the atlas UVs of the procedural wing textures.
// =============================================================================
import * as THREE from 'three';
import {
  S0, TIP_S, S_END, KINK_X, LAYOUT as L, station, section2D, toWorld, wingPoint, atlasU, atlasV,
  camber, halfThick, SWATCH, leZ, teZ, chordX, y0, clamp01, sstep, COS_D, SIN_D, WL_ARC_END,
} from './planform.js';
import { gridGeometry, span, cosSpace, merge, fanCap } from './geom.js';

const _st = {}, _s2 = {}, _p = { x: 0, y: 0, z: 0 };
const V3 = (o) => new THREE.Vector3(o.x, o.y, o.z);

/** Flip a geometry's winding if its mean normal points against `hint`. */
export function orient(g, hint) {
  g.computeVertexNormals();
  const n = g.attributes.normal;
  let sx = 0, sy = 0, sz = 0;
  for (let i = 0; i < n.count; i++) { sx += n.getX(i); sy += n.getY(i); sz += n.getZ(i); }
  if (sx * hint[0] + sy * hint[1] + sz * hint[2] < 0) {
    const a = g.index.array;
    for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; }
    g.computeVertexNormals();
  }
  return g;
}

/** Stations from a list of [a, b, step] ranges, merged & sorted, always including ends. */
function stations(ranges) {
  const set = [];
  for (const [a, b, step] of ranges) for (const v of span(a, b, step)) set.push(v);
  set.sort((p, q) => p - q);
  const out = [];
  for (const v of set) if (!out.length || v - out[out.length - 1] > 1e-4) out.push(v);
  return out;
}

/** wrap ordering helper: returns [f, side] for wrap column j of (nU + nL - 1) columns */
function wrapCols(fU, fL, nU, nL) {
  const cols = [];
  const up = cosSpace(0, 1, nU, true);   // clustered at 0 (= LE)
  for (let k = nU - 1; k >= 0; k--) cols.push([up[k] * fU, 1]);
  const lo = cosSpace(0, 1, nL, true);
  for (let k = 1; k < nL; k++) cols.push([lo[k] * fL, -1]);
  return cols;
}

/** Wrapped (upper TE -> LE -> lower TE) surface between stations. */
function wrapSurface(sList, fU, fL, nU = 22, nL = 20, offset = 0) {
  const cols = wrapCols(fU, fL, nU, nL);
  return gridGeometry(sList.length, cols.length, (i, j, p, uv) => {
    const s = sList[i];
    const [f, side] = cols[j];
    wingPoint(s, f, side, p, offset);
    uv.u = atlasU(s); uv.v = atlasV(f, side);
  });
}

/** Cove (back wall) from the lower skin end fL up to the upper skin end fU. */
function coveSurface(sList, fU, fL, n = 5) {
  const pa = {}, pb = {};
  return orient(gridGeometry(sList.length, n, (i, j, p, uv) => {
    const s = sList[i];
    wingPoint(s, fL, -1, pa); wingPoint(s, fU, 1, pb);
    const t = j / (n - 1);
    // slightly concave wall
    station(s, _st);
    const bulge = Math.sin(t * Math.PI) * 0.045 * _st.chord;
    p.x = pa.x + (pb.x - pa.x) * t;
    p.y = pa.y + (pb.y - pa.y) * t;
    p.z = pa.z + (pb.z - pa.z) * t - bulge;
    uv.u = SWATCH.cove[0]; uv.v = SWATCH.cove[1];     // dark cove strip in the atlas
  }), [0, 0, 1]);
}

/** Cap polygon at station s for chord range: upper f0..f1, lower f1..f2 (closed loop). */
function ribCap(s, pts, hint) {
  const loop = pts.map(([f, side]) => { const o = {}; wingPoint(s, f, side, o); return V3(o); });
  const g = fanCap(loop, SWATCH.cove);
  return orient(g, hint);
}

/**
 * Thin slab on the upper surface (spoiler panels / fillers), f0 = hinge, f1 = TE.
 * Returns geometry in aircraft coordinates.
 */
function upperSlab(sa, sb, f0, f1, thick = 0.022, lift = 0.0015, ns = 0.25, nf = 6) {
  const sList = span(sa, sb, ns);
  const fs = span(f0, f1, (f1 - f0) / (nf - 1));
  const top = gridGeometry(sList.length, fs.length, (i, j, p, uv) => {
    const s = sList[i], f = fs[j];
    wingPoint(s, f, 1, p, lift);
    uv.u = atlasU(s); uv.v = atlasV(f, 1);
  });
  const bot = gridGeometry(sList.length, fs.length, (i, j, p, uv) => {
    const s = sList[i], f = fs[j];
    const taper = 1 - 0.7 * clamp01((f - f0) / (f1 - f0));   // thinner towards the TE
    wingPoint(s, f, 1, p, lift - thick * taper);
    uv.u = SWATCH.under[0]; uv.v = SWATCH.under[1];
  });
  const edge = (fixedS, fixedF) => {
    if (fixedS !== null) {
      return gridGeometry(fs.length, 2, (i, j, p, uv) => {
        const f = fs[i], taper = 1 - 0.7 * clamp01((f - f0) / (f1 - f0));
        wingPoint(fixedS, f, 1, p, j === 0 ? lift : lift - thick * taper);
        uv.u = SWATCH.under[0]; uv.v = SWATCH.under[1];
      });
    }
    return gridGeometry(sList.length, 2, (i, j, p, uv) => {
      const f = fixedF, taper = 1 - 0.7 * clamp01((f - f0) / (f1 - f0));
      wingPoint(sList[i], f, 1, p, j === 0 ? lift : lift - thick * taper);
      uv.u = SWATCH.under[0]; uv.v = SWATCH.under[1];
    });
  };
  orient(top, [0, 1, 0]); orient(bot, [0, -1, 0]);
  const e1 = orient(edge(sa, null), [-1, 0, 0]), e2 = orient(edge(sb, null), [1, 0, 0]);
  const e3 = orient(edge(null, f0), [0, 0, -1]), e4 = orient(edge(null, f1), [0, 0, 1]);
  return merge([top, bot, e1, e2, e3, e4]);
}

// --- movable trailing-edge sections -------------------------------------------
/**
 * Flap-like section wrap (nose rounded) between chord fractions fa..fb.
 * thickK scales the wing half-thickness; drop moves it down (fraction of chord);
 * sharpTe tapers the TE.
 */
function sectionWrap(sList, fa, fb, { thickK = 0.75, drop = 0.004, sharpTe = 0.75, n = 16 } = {}) {
  const gs = cosSpace(0, 1, n, true);
  const cols = [];
  for (let k = n - 1; k >= 0; k--) cols.push([gs[k], 1]);
  for (let k = 1; k < n; k++) cols.push([gs[k], -1]);
  const geo = gridGeometry(sList.length, cols.length, (i, j, p, uv) => {
    const s = sList[i];
    const [g, side] = cols[j];
    station(s, _st);
    const f = fa + (fb - fa) * g;
    const nose = Math.sqrt(Math.min(1, g / 0.16));
    const te = 1 - sharpTe * sstep(0.65, 1.0, g);
    const ht = halfThick(f, _st.t) * thickK * nose * te + 0.0008;
    const a = f * _st.chord;
    const b = (camber(f) + side * ht - drop) * _st.chord;
    toWorld(_st, a, b, p);
    uv.u = atlasU(s); uv.v = atlasV(f, side);
  });
  // close the ends (fan caps of the section loop)
  const caps = [];
  for (const [s, hint] of [[sList[0], [-1, 0, 0]], [sList[sList.length - 1], [1, 0, 0]]]) {
    const loop = [];
    station(s, _st);
    for (const [g, side] of cols) {
      const f = fa + (fb - fa) * g;
      const nose = Math.sqrt(Math.min(1, g / 0.16));
      const te = 1 - sharpTe * sstep(0.65, 1.0, g);
      const ht = halfThick(f, _st.t) * thickK * nose * te + 0.0008;
      const o = {};
      toWorld(_st, f * _st.chord, (camber(f) + side * ht - drop) * _st.chord, o);
      loop.push(V3(o));
    }
    caps.push(orient(fanCap(loop, SWATCH.under), hint));
  }
  return merge([geo, ...caps]);
}

/** Point on a section's camber line (+ optional drop), used for hinge lines. */
function camberPoint(s, f, drop = 0) {
  station(s, _st);
  const o = {};
  toWorld(_st, f * _st.chord, (camber(f) - drop) * _st.chord, o);
  return V3(o);
}

// --- flap track fairings ("canoes") -------------------------------------------
function lowerY(x, z) {
  const c = chordX(x), f = clamp01((z - leZ(x)) / c);
  const o = {};
  wingPoint(x, f, -1, o);
  return o.y;
}
/** Canoe body at lateral x; returns {front, aft, splitZ}. */
function canoe(x, lod = false) {
  const c = chordX(x);
  const z0 = leZ(x) + 0.42 * c;
  const zTE = teZ(x);
  const z1 = zTE + 0.55 + 0.12 * c;
  const zs = leZ(x) + L.coveLowerF * c + 0.05;
  const depthMax = 0.30 + 0.025 * c;
  const width = 0.15 + 0.012 * c;
  const yTE = lowerY(x, zTE - 0.01);
  const sec = (z) => {
    const t = (z - z0) / (z1 - z0);
    const depth = depthMax * Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.985 + 0.01)), 0.6) * (1 - 0.2 * t) + 0.01;
    const yRef = z < zTE ? lowerY(x, z) : yTE + (z - zTE) * 0.04;
    const past = Math.max(0, z - zTE);
    const top = yRef + (z < zTE ? 0.1 : 0.1 - Math.min(0.09, past * 0.3));
    const bot = yRef - depth;
    const wdt = width * Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.985 + 0.01)), 0.5);
    return { z, cx: x, cy: (top + bot) / 2, w: Math.max(0.012, wdt), hTop: (top - bot) / 2, hBot: (top - bot) / 2, n: 2.1 };
  };
  const SEG = lod ? 6 : 14;
  const build = (za, zb, rows) => {
    const g = gridGeometry(lod ? 3 : rows, SEG + 1, (i, j, p, uv) => {
      const z = za + (zb - za) * i / ((lod ? 3 : rows) - 1);
      const s = sec(z);
      const a = (j / SEG) * Math.PI * 2;
      const sa = Math.sin(a), ca = Math.cos(a);
      const e = 2 / s.n;
      p.x = s.cx + s.w * Math.sign(sa) * Math.pow(Math.abs(sa), e);
      p.y = s.cy + (ca >= 0 ? s.hTop : s.hBot) * Math.sign(ca) * Math.pow(Math.abs(ca), e);
      p.z = z;
      uv.u = SWATCH.canoe[0]; uv.v = SWATCH.canoe[1] + 0.1 * (1 - j / SEG);
    });
    return orient(g, [0, -1, 0]);
  };
  const front = build(z0, zs, 8);
  const aft = build(zs, z1, 12);
  // tail cap
  const tail = sec(z1 - 1e-3);
  const loop = [];
  for (let j = 0; j <= SEG; j++) {
    const a = (j / SEG) * Math.PI * 2;
    loop.push(new THREE.Vector3(tail.cx + tail.w * Math.sin(a), tail.cy + (Math.cos(a) >= 0 ? tail.hTop : tail.hBot) * Math.cos(a), z1));
  }
  const cap = orient(fanCap(loop, SWATCH.canoe), [0, 0, 1]);
  return { front, aft: merge([aft, cap]), splitZ: zs };
}

// --- vortex generators ------------------------------------------------------------
function vortexGenerators() {
  const list = [];
  const h = 0.032, len = 0.07;
  for (let x = 9.2; x < 15.6; x += 0.32) {
    for (const sgn of [-1, 1]) {
      const xs = x + sgn * 0.035;
      const c = chordX(xs);
      const f = 0.2;
      const base = {}; wingPoint(xs, f, 1, base);
      const tip = {}; wingPoint(xs, f + len / c, 1, tip);
      const yaw = sgn * 0.28;
      const dx = Math.sin(yaw) * len;
      // little triangular blade (two-sided via two triangles)
      const pA = [base.x, base.y, base.z];
      const pB = [tip.x + dx, tip.y, tip.z];
      const pC = [base.x + dx * 0.3, base.y + h * COS_D, base.z + len * 0.25];
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([...pA, ...pB, ...pC, ...pA, ...pC, ...pB], 3));
      const [u, v] = SWATCH.vg;
      g.setAttribute('uv', new THREE.Float32BufferAttribute([u, v, u, v, u, v, u, v, u, v, u, v], 2));
      g.computeVertexNormals();
      list.push(g);
    }
  }
  return merge(list);
}

/** Static discharger wicks on a trailing edge (thin rods). */
function dischargers(points) {
  const list = [];
  for (const [s, f] of points) {
    const p = {}; wingPoint(s, f, 1, p);
    const g = new THREE.CylinderGeometry(0.006, 0.004, 0.17, 5, 1);
    g.rotateX(Math.PI / 2);
    g.translate(p.x, p.y - 0.01, p.z + 0.07);
    const n = g.attributes.uv.count;
    for (let i = 0; i < n; i++) g.attributes.uv.setXY(i, SWATCH.wick[0], SWATCH.wick[1]);
    list.push(g);
  }
  return list;
}

/**
 * Build all wing geometries. Returns parts with their pivot axes (aircraft coords).
 */
export function buildWingGeometry(detail = 1) {
  const lod = detail < 0;
  const step = detail >= 2 ? 0.16 : detail >= 1 ? 0.22 : detail >= 0 ? 0.3 : 0.9;
  const nU = detail >= 2 ? 28 : detail >= 1 ? 22 : detail >= 0 ? 16 : 7;
  const nL = detail >= 2 ? 22 : detail >= 1 ? 18 : detail >= 0 ? 13 : 6;

  // --- fixed structure ---------------------------------------------------------
  const bayA = lod ? stations([[S0, 11.62, step], [KINK_X, KINK_X, 1]]) : stations([[S0, 11.62, step], [1.85, 2.0, 0.05], [KINK_X - 0.1, KINK_X + 0.1, 0.1]]);
  const bayB = stations([[11.62, 15.22, step]]);
  const bayC = stations([[15.22, TIP_S, step * 0.8], [TIP_S, WL_ARC_END, lod ? 0.15 : 0.045], [WL_ARC_END, S_END, lod ? 0.6 : 0.14]]);
  const fixed = [];
  fixed.push(wrapSurface(bayA, L.spoilerHingeF, L.coveLowerF, nU, nL));
  fixed.push(coveSurface(bayA, L.spoilerHingeF, L.coveLowerF, lod ? 2 : 5));
  fixed.push(wrapSurface(bayB, L.aileronCoveF, L.aileronCoveF, nU, nL));
  fixed.push(coveSurface(bayB, L.aileronCoveF, L.aileronCoveF, lod ? 2 : 4));
  fixed.push(wrapSurface(bayC, 1.0, 1.0, nU + (lod ? 1 : 4), nL + (lod ? 1 : 2)));
  // rib caps where the skin extents change
  fixed.push(ribCap(11.62, [[L.spoilerHingeF, 1], [0.7, 1], [L.aileronCoveF, 1], [L.aileronCoveF, -1], [L.coveLowerF, -1]], [-1, 0, 0]));
  fixed.push(ribCap(15.22, [[L.aileronCoveF, 1], [0.9, 1], [1.0, 1], [1.0, -1], [0.9, -1], [L.aileronCoveF, -1]], [-1, 0, 0]));
  // winglet tip cap
  {
    const loop = [];
    for (const [f, side] of wrapCols(1, 1, 10, 10)) { const o = {}; wingPoint(S_END, f, side, o); loop.push(V3(o)); }
    fixed.push(orient(fanCap(loop, SWATCH.under), [1, 0.15, 0]));
  }
  // spoiler gap fillers
  for (const [a, b] of L.fixedSpoilerFill) fixed.push(upperSlab(a, b, L.spoilerHingeF, L.spoilerTeF, 0.03, 0, lod ? 2 : 0.25, lod ? 2 : 6));
  // canoe fronts
  const canoes = L.canoes.map((x) => canoe(x, lod));
  for (const c of canoes) fixed.push(c.front);
  if (detail >= 1) fixed.push(vortexGenerators());
  if (!lod) fixed.push(...dischargers([[16.4, 0.98], [16.85, 0.98]]));
  const fixedGeo = merge(fixed);

  // --- spoilers ------------------------------------------------------------------
  const mkSpoilerGroup = (ranges) => {
    const geos = ranges.map(([a, b]) => upperSlab(a + 0.015, b - 0.015, L.spoilerHingeF, L.spoilerTeF, 0.022, 0.0015, lod ? 5 : 0.25, lod ? 2 : 6));
    const p0 = {}, p1 = {};
    wingPoint(ranges[0][0], L.spoilerHingeF, 1, p0);
    wingPoint(ranges[ranges.length - 1][1], L.spoilerHingeF, 1, p1);
    return { geo: merge(geos), pivot: V3(p0), axis: V3(p1).sub(V3(p0)).normalize() };
  };
  const groundSpoilers = mkSpoilerGroup(L.groundSpoilers);
  const flightSpoilers = mkSpoilerGroup(L.flightSpoilers);

  // --- flaps -----------------------------------------------------------------------
  const mkFlap = ([a, b], canoeIdx) => {
    const sList = stations([[a, b, step]]);
    const main = sectionWrap(sList, L.flapNoseF, L.flapMainTeF, { thickK: 0.74, drop: 0.004, sharpTe: 0.8, n: lod ? 5 : 16 });
    const aft = sectionWrap(sList, L.aftFlapNoseF, 1.0, { thickK: 0.55, drop: 0.016, sharpTe: 0.35, n: lod ? 4 : 16 });
    const extra = canoeIdx.map((k) => canoes[k].aft);
    const pivotA = camberPoint(a, L.flapNoseF + 0.02, 0.004), pivotB = camberPoint(b, L.flapNoseF + 0.02, 0.004);
    const aPivA = camberPoint(a, L.aftFlapNoseF + 0.015, 0.016), aPivB = camberPoint(b, L.aftFlapNoseF + 0.015, 0.016);
    const meanChord = (chordX(a) + chordX(b)) / 2 * (1 - L.flapNoseF);
    return {
      main: { geo: merge([main, ...extra]), pivot: pivotA, axis: pivotB.clone().sub(pivotA).normalize() },
      aft: { geo: aft, pivot: aPivA, axis: aPivB.clone().sub(aPivA).normalize() },
      chord: meanChord,
    };
  };
  const inboardFlap = mkFlap(L.inboardFlap, [0]);
  const outboardFlap = mkFlap(L.outboardFlap, [1, 2, 3]);

  // --- aileron ----------------------------------------------------------------------
  const aSList = stations([[L.aileron[0], L.aileron[1], step]]);
  const ailGeo = merge([
    sectionWrap(aSList, L.aileronNoseF, 1.0, { thickK: 0.95, drop: 0, sharpTe: 0.2, n: lod ? 5 : 16 }),
    ...(lod ? [] : dischargers([[12.6, 1.0], [13.6, 1.0], [14.6, 1.0]])),
  ]);
  const aPa = camberPoint(L.aileron[0], 0.79), aPb = camberPoint(L.aileron[1], 0.79);
  const aileron = { geo: ailGeo, pivot: aPa, axis: aPb.clone().sub(aPa).normalize() };

  // --- slats (one rigid group rotating about an axis below/behind the straight LE) ---
  const slatGeos = [];
  const sf = L.slatChordF;
  for (const [a, b] of L.slats) {
    const sList = stations([[a + 0.02, b - 0.02, step]]);
    const outer = [], inner = [];
    const nn = 14;
    for (let k = 0; k < nn; k++) { const t = 1 - k / (nn - 1); outer.push([sf * (1 - Math.cos(t * Math.PI / 2)), 1]); }
    for (let k = 1; k < 8; k++) { const t = k / 7; outer.push([0.055 * (1 - Math.cos(t * Math.PI / 2)), -1]); }
    for (let k = outer.length - 1; k >= 0; k--) inner.push(outer[k]);
    const loop = [...outer.map((o) => [...o, 0.013]), ...inner.map((o) => [...o, 0.0035])];
    const g = gridGeometry(sList.length, loop.length, (i, j, p, uv) => {
      const [f, side, off] = loop[j];
      wingPoint(sList[i], f, side, p, off);
      uv.u = atlasU(sList[i]); uv.v = atlasV(f, side);
    });
    orient(g, [0, 0, -1]);
    slatGeos.push(g);
    // end strips (outer <-> inner)
    for (const [s, hint] of [[sList[0], [-1, 0, 0]], [sList[sList.length - 1], [1, 0, 0]]]) {
      const e = gridGeometry(outer.length, 2, (i, j, p, uv) => {
        const [f, side] = outer[i];
        wingPoint(s, f, side, p, j === 0 ? 0.013 : 0.0035);
        uv.u = atlasU(s); uv.v = atlasV(f, side);
      });
      slatGeos.push(orient(e, hint));
    }
  }
  const leA = {}, leB = {};
  station(L.slats[0][0], _st);
  const slatAxisA = new THREE.Vector3(), slatAxisB = new THREE.Vector3();
  {
    const st = station(L.slats[0][0], {});
    toWorld(st, 0.65, -0.7, leA);
    const st2 = station(L.slats[3][1], {});
    toWorld(st2, 0.65, -0.7, leB);
    slatAxisA.set(leA.x, leA.y, leA.z); slatAxisB.set(leB.x, leB.y, leB.z);
  }
  const slats = { geo: merge(slatGeos), pivot: slatAxisA, axis: slatAxisB.clone().sub(slatAxisA).normalize() };

  // --- Krueger flaps (inboard LE, hinged at the forward lower surface) -----------------
  const kGeos = [];
  for (const [a, b] of L.kruegers) {
    const sList = stations([[a, b, step]]);
    const fs = span(0.02, 0.13, 0.011);
    const outerG = gridGeometry(sList.length, fs.length, (i, j, p, uv) => { wingPoint(sList[i], fs[j], -1, p, 0.006); uv.u = atlasU(sList[i]); uv.v = atlasV(fs[j], -1); });
    const innerG = gridGeometry(sList.length, fs.length, (i, j, p, uv) => { wingPoint(sList[i], fs[j], -1, p, -0.022); uv.u = SWATCH.under[0]; uv.v = SWATCH.under[1]; });
    kGeos.push(orient(outerG, [0, -1, 0]), orient(innerG, [0, 1, 0]));
    for (const [s, hint] of [[a, [-1, 0, 0]], [b, [1, 0, 0]]]) {
      kGeos.push(orient(gridGeometry(fs.length, 2, (i, j, p, uv) => { wingPoint(s, fs[i], -1, p, j ? 0.006 : -0.022); uv.u = SWATCH.under[0]; uv.v = SWATCH.under[1]; }), hint));
    }
    for (const [f, hint] of [[0.02, [0, 0, -1]], [0.13, [0, 0, 1]]]) {
      kGeos.push(orient(gridGeometry(sList.length, 2, (i, j, p, uv) => { wingPoint(sList[i], f, -1, p, j ? 0.006 : -0.022); uv.u = SWATCH.under[0]; uv.v = SWATCH.under[1]; }), hint));
    }
  }
  const kA = {}, kB = {};
  wingPoint(L.kruegers[0][0], 0.02, -1, kA, -0.008);
  wingPoint(L.kruegers[1][1], 0.02, -1, kB, -0.008);
  const kruegers = { geo: merge(kGeos), pivot: V3(kA), axis: V3(kB).sub(V3(kA)).normalize() };

  return { fixed: fixedGeo, groundSpoilers, flightSpoilers, inboardFlap, outboardFlap, aileron, slats, kruegers };
}

/** Light anchor points on the wing (right side, before flex). */
export function wingAnchors() {
  const tipLE = {}; wingPoint(TIP_S - 0.05, 0.0, 1, tipLE, 0.03);
  const tipTE = {}; wingPoint(TIP_S - 0.12, 1.0, 1, tipTE, 0.0);
  const rootLE = {}; wingPoint(2.25, 0.02, -1, rootLE, 0.02);
  return { navPos: V3(tipLE), aftPos: V3(tipTE).add(new THREE.Vector3(0, 0, 0.05)), landingPos: V3(rootLE) };
}
