// Aircraft: helicopters, jets, transports and drones for both factions.
// Body space: origin at the airframe origin of src/sim/specs.js, +Y up,
// +Z forward, +X left. Rotor parts are built around their own hubs.

import { AIRCRAFT_SPECS } from '../../sim/specs.js';
import { Part, Piece, cyl, lathe, sphere, loft, TAU } from './geom.js';
import { tyrePiece } from './ground.js';

const PI = Math.PI;

// ---------------------------------------------------------------------------
// Shared airframe helpers

// Superellipse cross-section: {z, w (half width), yb, yt, e (2 = ellipse), x}.
function sectionRing(s, n) {
  const e = s.e ?? 2.5;
  const mid = (s.yb + s.yt) / 2, h = (s.yt - s.yb) / 2;
  const out = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * TAU;
    const c = Math.cos(a), sn = Math.sin(a);
    out.push([
      (s.x ?? 0) + s.w * Math.sign(c) * Math.pow(Math.abs(c), 2 / e),
      mid + h * Math.sign(sn) * Math.pow(Math.abs(sn), 2 / e),
      s.z,
    ]);
  }
  return out;
}

// wallMat helper: glass on [band, j0, j1] ranges of a fuselage loft.
function glazing(rules, glassMat = 'glass') {
  return (i, j) => (rules.some(([b, j0, j1]) => i === b && j >= j0 && j <= j1) ? glassMat : undefined);
}

function fuselage(part, sections, o = {}) {
  const n = o.n ?? 14;
  return part.loft(sections.map((s) => sectionRing(o.e && s.e === undefined ? { ...s, e: o.e } : s, n)), {
    smooth: o.smooth ?? 55, c: o.c, wallMat: o.wallMat,
  });
}

const THIN = [[0, 0], [0.35, 1], [1, 0], [0.35, -1]];
const AIRFOIL = [[0, 0], [0.08, 0.75], [0.3, 1], [0.65, 0.6], [1, 0.04], [1, -0.04], [0.65, -0.3], [0.3, -0.45], [0.08, -0.4]];

// Lifting surface spanning X. Stations: [x, y, zLE, chord, thickness].
function wing(part, stations, o = {}) {
  const prof = o.profile ?? AIRFOIL;
  const rings = stations.map(([x, y, zl, ch, th]) => prof.map(([u, t]) => [x, y + (t * th) / 2, zl - u * ch]));
  return part.loft(rings, { smooth: o.smooth ?? 40, c: o.c, wallMat: o.wallMat });
}

// Vertical surface spanning Y. Stations: [y, x, zLE, chord, thickness].
function fin(part, stations, o = {}) {
  const prof = o.profile ?? AIRFOIL.map(([u, t]) => [u, t > 0 ? Math.max(t, 0.5) : Math.min(t, -0.5)]);
  const rings = stations.map(([y, x, zl, ch, th]) => prof.map(([u, t]) => [x + (t * th) / 2, y, zl - u * ch]));
  return part.loft(rings, { smooth: o.smooth ?? 40, c: o.c });
}

// Missile along +Z centred at `at` (nose forward) with cruciform fins.
function missile(part, at, len, r, o = {}) {
  const h = len / 2;
  const prof = [[0, -h], [r * 0.9, -h + 0.005], [r, -h + 0.04], [r, h - r * 3.2], [r * 0.55, h - r * 1.1], [0, h]];
  part.add(lathe(prof, o.seg ?? 8, { axis: 'z', crease: 55, mats: [o.c ?? 'missile', o.c ?? 'missile', o.c ?? 'missile', o.c ?? 'missile', o.nose ?? 'missile'] }), { at });
  if (o.band) part.add(cyl(r * 1.02, r * 0.8, o.seg ?? 8, { axis: 'z', caps: 'none' }), { at: [at[0], at[1], at[2] + h * 0.35], c: o.band });
  const fins = o.fins ?? 4;
  for (let k = 0; k < fins; k++) {
    const a = (k / fins) * TAU + PI / 4;
    for (const [zc, sz] of o.finSets ?? [[-h + r * 1.8, 1]]) {
      part.box(0.006, r * 1.6 * sz, r * 2.8 * sz, {
        at: [at[0] + Math.cos(a) * r * 1.7 * sz, at[1] + Math.sin(a) * r * 1.7 * sz, at[2] + zc], rot: [0, 0, a - PI / 2], c: o.c ?? 'missile',
      });
    }
  }
}

// Rocket pod along +Z centred at `at`.
function rocketPod(part, at, len, r, o = {}) {
  const h = len / 2;
  part.add(lathe([[r * 0.7, -h], [r, -h + 0.12], [r, h - 0.1], [r * 0.9, h], [r * 0.72, h], [r * 0.72, h - 0.04], [0, h - 0.04]], o.seg ?? 10, {
    axis: 'z', crease: 45, mats: [o.c ?? 'pod', o.c ?? 'pod', o.c ?? 'pod', 'black', 'black', 'black'],
  }), { at });
  part.add(cyl(r * 1.02, 0.06, o.seg ?? 10, { axis: 'z', caps: 'none' }), { at: [at[0], at[1], at[2] + h * 0.3], c: 'paintDark' });
}

function pylon(part, top, bottom, chord, o = {}) {
  const h = top[1] - bottom[1];
  part.box(0.07, h, chord, { at: [top[0], (top[1] + bottom[1]) / 2, top[2]], c: o.c ?? 'paintS' });
}

function wheel(part, at, r, w, side = 1) {
  part.add(tyrePiece(r, w, 10, { rim: 0.6, hubMat: 'lightGrey', lugs: false }), { at, s: [side, 1, 1] });
}

function strut(part, a, b, r = 0.04, c = 'darkSteel') {
  part.tube(a, b, r, r, 6, { c });
}

// Pane quad pushed slightly out along `n` (glass).
function pane(part, a, b, c, d, n, mat = 'glass', off = 0.01) {
  const p = (q) => [q[0] + n[0] * off, q[1] + n[1] * off, q[2] + n[2] * off];
  part.add(new Piece().quadF(p(a), p(b), p(c), p(d), n), { c: mat });
}

function navLights(em, left, right, tail, o = {}) {
  const s = o.size ?? 0.07;
  if (left) em.box(s, s, s * 1.6, { at: left, c: 0xff2416 });
  if (right) em.box(s, s, s * 1.6, { at: right, c: 0x22ff55 });
  if (tail) em.box(s, s, s, { at: tail, c: 0xffffff });
}

// ---------------------------------------------------------------------------
// Rotors

function bladePiece(r0, R, chord, th) {
  const prof = [[chord * 0.5, 0], [chord * 0.25, th * 0.5], [-chord * 0.5, th * 0.08], [-chord * 0.5, -th * 0.08], [chord * 0.25, -th * 0.5]];
  const P = new Piece();
  const body = loft([prof.map(([z, y]) => [r0, y, z]), prof.map(([z, y]) => [R * 0.95, y, z])], { caps: 'start' });
  body.setMat('rotor');
  const tip = loft([prof.map(([z, y]) => [R * 0.95, y, z]), prof.map(([z, y]) => [R, y * 0.7, z * 0.85 - chord * 0.05])], { caps: 'end' });
  tip.setMat('tip');
  return P.append(body).append(tip);
}

// Main rotor: hub at origin, blades in the XZ plane.
function mainRotor(part, R, n, o = {}) {
  const chord = o.chord ?? 0.53;
  part.lathe([[0.1, -0.55], [0.12, -0.2], [0.3, -0.18], [0.34, -0.06], [0.3, 0.08], [0.16, 0.14], [0, 0.16]], 10, { c: 'darkSteel', crease: 40 });
  const blade = bladePiece(o.r0 ?? 0.75, R, chord, o.th ?? 0.07);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + (o.phase ?? 0);
    part.group({ rot: [0, a, 0] }, () => {
      part.box(0.55, 0.12, 0.2, { at: [0.5, 0, 0], c: 'darkSteel' });
      part.add(cyl(0.07, 0.3, 6, { axis: 'x', caps: 'end' }), { at: [0.3, 0, 0], c: 'steel' });
      part.add(blade, { rot: [0.05, 0, 0] });
      part.tube([0.25, -0.18, 0.12], [0.45, -0.02, 0.12], 0.02, 0.02, 4, { c: 'steel' });
    });
  }
}

// Blur disc in the XZ plane (normal +Y): radial vertex-colour bands.
function blurDisc(r0, R, seg, stops) {
  // stops: [[t (0..1 from r0 to R), hex], ...]
  const P = new Piece();
  for (let i = 0; i < stops.length - 1; i++) {
    const [t0, c0] = stops[i], [t1, c1] = stops[i + 1];
    const ra = r0 + (R - r0) * t0, rb = r0 + (R - r0) * t1;
    for (let k = 0; k < seg; k++) {
      const a0 = (k / seg) * TAU, a1 = ((k + 1) / seg) * TAU;
      const A = [Math.cos(a0) * ra, 0, Math.sin(a0) * ra], B = [Math.cos(a1) * ra, 0, Math.sin(a1) * ra];
      const C = [Math.cos(a1) * rb, 0, Math.sin(a1) * rb], D = [Math.cos(a0) * rb, 0, Math.sin(a0) * rb];
      // wound to face +Y
      P.tri(A, D, C, [c0, c1, c1]);
      P.tri(A, C, B, [c0, c1, c0]);
    }
  }
  return P;
}

const ROTOR_STOPS = [[0, 0x6a6a68], [0.45, 0x585856], [0.8, 0x3a3a39], [0.93, 0x1c1c1c], [0.985, 0x2a2a2a], [1, 0x6e6e6a]];
const TAIL_STOPS = [[0, 0x5e5e5c], [0.7, 0x3a3a3a], [0.9, 0x1e1e1e], [1, 0x5a5a58]];
const PROP_STOPS = [[0, 0x55565a], [0.6, 0x3c3d40], [0.88, 0x1f2022], [1, 0x6a6a66]];

function rotorParts(spec, o = {}) {
  const rotor = new Part('rotor');
  mainRotor(rotor, spec.rotorRadius, spec.rotorBlades, o);
  const rotorBlur = new Part();
  rotorBlur.add(blurDisc(0.35, spec.rotorRadius, 40, ROTOR_STOPS), { at: [0, 0.02, 0] });
  const tailRotor = new Part('rotor');
  tailRotor.add(cyl(0.11, 0.3, 8, { axis: 'x' }), { c: 'darkSteel' });
  const tb = bladePiece(0.12, spec.tailRotorRadius, o.tailChord ?? 0.24, 0.035);
  for (const a of o.tailAngles ?? [0, PI / 2, PI, 1.5 * PI]) {
    // blade piece spans +X; rotate it onto +Y (about Z), then around the X axis
    tailRotor.group({ rot: [a, 0, 0], order: 'XYZ' }, () => tailRotor.add(tb, { rot: [0, 0, PI / 2], order: 'XYZ', at: [0.05, 0, 0] }));
  }
  const tailRotorBlur = new Part();
  tailRotorBlur.add(blurDisc(0.12, spec.tailRotorRadius, 24, TAIL_STOPS), { rot: [0, 0, PI / 2], order: 'XYZ', at: [0.06, 0, 0] });
  return { rotor, rotorBlur, tailRotor, tailRotorBlur };
}

// ---------------------------------------------------------------------------
// Attack helicopter

function attackCoalition(spec) {
  const body = new Part(), em = new Part();
  // fuselage and tail boom
  fuselage(body, [
    { z: 5.62, w: 0.12, yb: 1.2, yt: 1.42 },
    { z: 5.05, w: 0.42, yb: 0.98, yt: 1.78 },
    { z: 4.2, w: 0.5, yb: 0.84, yt: 1.95 },
    { z: 3.1, w: 0.56, yb: 0.76, yt: 2.06 },
    { z: 1.9, w: 0.62, yb: 0.74, yt: 2.36 },
    { z: 0.6, w: 0.62, yb: 0.76, yt: 2.45 },
    { z: -0.7, w: 0.58, yb: 0.88, yt: 2.45 },
    { z: -1.7, w: 0.42, yb: 1.32, yt: 2.42 },
    { z: -3.6, w: 0.3, yb: 1.62, yt: 2.38 },
    { z: -6.2, w: 0.24, yb: 1.72, yt: 2.38 },
    { z: -7.7, w: 0.2, yb: 1.76, yt: 2.42 },
    { z: -8.45, w: 0.12, yb: 1.85, yt: 2.42 },
  ], { n: 14, e: 2.6 });
  // stepped tandem canopy (faceted glass)
  const cs = (z, wS, yS, wT, yT) => [[wS, yS, z], [wS * 0.88, (yS + yT) / 2 + 0.06, z], [wT, yT, z], [-wT, yT, z], [-wS * 0.88, (yS + yT) / 2 + 0.06, z], [-wS, yS, z]];
  body.loft([
    cs(5.12, 0.4, 1.74, 0.1, 1.79), cs(4.45, 0.5, 1.9, 0.27, 2.36), cs(3.58, 0.53, 1.98, 0.3, 2.42),
    cs(3.3, 0.55, 2.0, 0.3, 2.5), cs(2.85, 0.58, 2.06, 0.31, 2.8), cs(2.05, 0.6, 2.2, 0.31, 2.78), cs(1.45, 0.6, 2.4, 0.28, 2.5),
  ], { wallMat: (i) => (i === 2 ? 'frame' : i === 5 ? 'paint' : 'glass') });
  // avionics sponsons along the sides
  body.mirrorX(() => body.loft([
    [[0.48, 1.08, 4.1], [0.62, 1.1, 4.1], [0.6, 1.72, 4.1], [0.48, 1.8, 4.1]],
    [[0.5, 1.02, 3.4], [0.98, 1.12, 3.4], [0.93, 1.85, 3.4], [0.5, 1.98, 3.4]],
    [[0.5, 1.02, -0.6], [0.98, 1.12, -0.6], [0.93, 1.85, -0.6], [0.5, 1.98, -0.6]],
    [[0.4, 1.3, -1.6], [0.55, 1.35, -1.6], [0.55, 1.85, -1.6], [0.4, 1.9, -1.6]],
  ]));
  // engine nacelles with intakes and turned-out exhausts
  body.mirrorX(() => {
    fuselage(body, [
      { z: 1.35, w: 0.22, yb: 2.3, yt: 2.72, x: 0.74 },
      { z: 1.1, w: 0.3, yb: 2.22, yt: 2.86, x: 0.76 },
      { z: -1.2, w: 0.3, yb: 2.22, yt: 2.86, x: 0.76 },
      { z: -1.55, w: 0.22, yb: 2.3, yt: 2.74, x: 0.74 },
    ], { n: 10 });
    body.add(cyl(0.2, 0.04, 10, { axis: 'z', caps: 'end', capMat: 'intake' }), { at: [0.74, 2.51, 1.36], c: 'intake' });
    body.group({ at: [0.9, 2.55, -1.55], rot: [0, 0.9, 0] }, () => {
      body.box(0.34, 0.36, 0.5, { c: 'exhaust' });
      body.box(0.26, 0.28, 0.02, { at: [0, 0, 0.26], c: 'black' });
    });
  });
  // mast fairing
  body.lathe([[0.42, 2.4], [0.36, 2.9], [0.24, 3.45], [0.14, 3.62], [0, 3.64]], 10, { at: [0, 0, spec.rotorPivot[2]], c: 'paint' });
  // stub wings with pylons, rocket pods and missile launchers
  body.mirrorX(() => {
    wing(body, [[0.55, 1.98, 1.18, 1.3, 0.2], [2.5, 1.92, 1.05, 1.1, 0.14]]);
    const [px, py, pz] = spec.rocketPods[0];
    pylon(body, [px, 1.88, pz + 0.1], [px, py + 0.2, pz], 0.6);
    rocketPod(body, [px, py, pz], 1.55, 0.2, { c: 'pod' });
    const [mx, my, mz] = spec.missileRails[0];
    pylon(body, [mx - 0.05, 1.86, mz + 0.1], [mx - 0.05, my + 0.25, mz], 0.5);
    body.box(0.08, 0.6, 1.3, { at: [mx, my, mz], c: 'paintS' });
    for (const [dx, dy] of [[0.13, 0.17], [-0.13, 0.17], [0.13, -0.17], [-0.13, -0.17]]) {
      missile(body, [mx + dx, my + dy, mz + 0.1], 1.6, 0.085, { c: 'missileOlive', nose: 'black' });
    }
  });
  // nose sensors (TADS/PNVS), chin gun
  body.bbox(0.62, 0.5, 0.52, 0.08, { at: [0, 1.12, 5.6], c: 'paintS' });
  body.box(0.42, 0.22, 0.02, { at: [0, 1.15, 5.87], c: 'glass' });
  body.mirrorX(() => body.add(cyl(0.2, 0.2, 10, { axis: 'x' }), { at: [0.38, 1.12, 5.6], c: 'paintS' }));
  body.add(cyl(0.15, 0.24, 10, { caps: 'both' }), { at: [0, 1.6, 5.55], c: 'paintS' });
  body.box(0.18, 0.12, 0.02, { at: [0, 1.6, 5.7], c: 'glass' });
  const [gx, gy, gz] = spec.gunPivot;
  body.add(sphere(0.2, 10, 6), { at: [gx, gy + 0.08, gz], c: 'darkSteel' });
  body.box(0.18, 0.18, 0.6, { at: [gx, gy, gz + 0.2], c: 'gunmetal' });
  body.add(cyl(0.035, 1.1, 6, { axis: 'z', caps: 'end', capMat: 'black' }), { at: [gx, gy, gz + 1.05], c: 'gunmetal' });
  // tail fin, stabilator, tail wheel
  fin(body, [[1.55, 0, -7.25, 1.55, 0.16], [2.45, 0, -7.45, 1.55, 0.16], [4.25, 0, -8.3, 0.95, 0.12]]);
  body.mirrorX(() => wing(body, [[0.08, 2.05, -8.15, 0.8, 0.08], [1.68, 2.05, -8.35, 0.62, 0.06]]));
  body.add(cyl(0.16, 0.5, 8, { axis: 'x' }), { at: [-0.18, spec.tailRotorPivot[1], spec.tailRotorPivot[2]], c: 'paintS' });
  strut(body, [0, 1.6, -7.85], [0, 0.22, -7.9], 0.05);
  wheel(body, [0.07, 0.2, -7.9], 0.2, 0.12);
  // main gear
  body.mirrorX(() => {
    strut(body, [0.9, 1.15, 2.5], [1.0, 0.33, 2.75], 0.06);
    strut(body, [0.62, 1.0, 2.0], [0.98, 0.35, 2.7], 0.04);
    wheel(body, [1.06, 0.33, 2.75], 0.33, 0.2);
  });
  // wire cutters, antennas
  body.box(0.05, 0.4, 0.06, { at: [0, 2.6, 2.95], rot: [-0.3, 0, 0], c: 'darkSteel' });
  body.box(0.05, 0.35, 0.06, { at: [0, 0.6, 3.6], rot: [0.4, 0, 0], c: 'darkSteel' });
  body.tube([0, 2.4, -2.5], [0, 3.0, -3.0], 0.015, 0.008, 3, { c: 'black' });
  navLights(em, [2.52, 1.95, 0.6], [-2.52, 1.95, 0.6], [0, 4.2, -8.85], { size: 0.08 });
  em.box(0.08, 0.08, 0.08, { at: [0, 3.66, 0.4], c: 0xff3020 });
  em.mirrorX(() => em.box(0.02, 0.05, 0.5, { at: [0.25, 2.2, -4.5], c: 0x7dff9a }));
  return { body, emissive: em, ...rotorParts(spec, { chord: 0.53, tailAngles: [0, 0.96, PI, PI + 0.96] }) };
}

function attackFederation(spec) {
  const body = new Part(), em = new Part();
  fuselage(body, [
    { z: 5.75, w: 0.1, yb: 1.25, yt: 1.4 },
    { z: 5.35, w: 0.42, yb: 1.0, yt: 1.75 },
    { z: 4.5, w: 0.56, yb: 0.85, yt: 1.98 },
    { z: 3.3, w: 0.64, yb: 0.78, yt: 2.1 },
    { z: 1.9, w: 0.72, yb: 0.76, yt: 2.4 },
    { z: 0.4, w: 0.74, yb: 0.8, yt: 2.5 },
    { z: -0.9, w: 0.66, yb: 0.95, yt: 2.5 },
    { z: -1.9, w: 0.42, yb: 1.45, yt: 2.45 },
    { z: -4.0, w: 0.3, yb: 1.75, yt: 2.42 },
    { z: -6.6, w: 0.25, yb: 1.92, yt: 2.5 },
    { z: -7.8, w: 0.21, yb: 2.1, yt: 2.62 },
    { z: -8.5, w: 0.12, yb: 2.25, yt: 2.62 },
  ], { n: 14, e: 2.8 });
  // radome nose
  body.lathe([[0.42, 0], [0.38, 0.25], [0.24, 0.48], [0, 0.6]], 10, { axis: 'z', at: [0, 1.38, 5.3], c: 'radome' });
  // armoured stepped canopy with flat panes and heavy frames
  const cs = (z, wS, yS, wT, yT) => [[wS, yS, z], [wS * 0.9, (yS + yT) / 2 + 0.05, z], [wT, yT, z], [-wT, yT, z], [-wS * 0.9, (yS + yT) / 2 + 0.05, z], [-wS, yS, z]];
  body.loft([
    cs(5.22, 0.44, 1.76, 0.14, 1.8), cs(4.55, 0.54, 1.95, 0.3, 2.34), cs(3.7, 0.58, 2.02, 0.32, 2.4),
    cs(3.45, 0.6, 2.05, 0.33, 2.5), cs(2.95, 0.64, 2.12, 0.34, 2.86), cs(2.15, 0.68, 2.25, 0.34, 2.84), cs(1.55, 0.68, 2.42, 0.3, 2.56),
  ], { wallMat: (i) => (i === 2 ? 'frame' : i === 5 ? 'paint' : 'glass') });
  for (const z of [4.95, 4.1, 2.55]) body.box(1.25, 0.05, 0.05, { at: [0, 2.12 + (5 - z) * 0.18, z], c: 'frame' });
  // engines with down-turned exhausts
  body.mirrorX(() => {
    fuselage(body, [
      { z: 1.7, w: 0.24, yb: 2.4, yt: 2.82, x: 0.85 },
      { z: 1.35, w: 0.34, yb: 2.3, yt: 3.0, x: 0.88 },
      { z: -1.0, w: 0.34, yb: 2.3, yt: 3.0, x: 0.88 },
      { z: -1.45, w: 0.26, yb: 2.38, yt: 2.86, x: 0.86 },
    ], { n: 10 });
    body.add(cyl(0.22, 0.04, 10, { axis: 'z', caps: 'end', capMat: 'intake' }), { at: [0.85, 2.61, 1.72], c: 'intake' });
    body.group({ at: [1.1, 2.4, -1.2], rot: [0.5, 0, -0.6] }, () => body.add(cyl(0.2, 0.7, 8, { caps: 'end', capMat: 'black' }), { c: 'exhaust' }));
  });
  body.lathe([[0.46, 2.45], [0.4, 3.0], [0.26, 3.5], [0.14, 3.62], [0, 3.64]], 10, { at: [0, 0, spec.rotorPivot[2]], c: 'paint' });
  // stub wings with B-8 pods and Ataka tube packs
  body.mirrorX(() => {
    wing(body, [[0.65, 2.02, 1.25, 1.4, 0.22], [2.55, 1.86, 1.1, 1.15, 0.16]]);
    const [px, py, pz] = spec.rocketPods[0];
    pylon(body, [px, 1.88, pz + 0.1], [px, py + 0.24, pz], 0.6);
    rocketPod(body, [px, py, pz], 1.9, 0.26, { c: 'pod' });
    const [mx, my, mz] = spec.missileRails[0];
    pylon(body, [mx - 0.08, 1.8, mz + 0.1], [mx - 0.08, my + 0.2, mz], 0.5);
    for (const [dx, dy] of [[0.1, 0.1], [-0.1, 0.1], [0.1, -0.1], [-0.1, -0.1]]) {
      body.add(cyl(0.085, 1.9, 8, { axis: 'z', caps: 'both', capMat: 'paintDark' }), { at: [mx + dx, my + dy, mz + 0.1], c: 'pod' });
    }
    body.box(0.42, 0.42, 0.08, { at: [mx, my, mz + 0.6], c: 'paintS' });
    body.box(0.42, 0.42, 0.08, { at: [mx, my, mz - 0.4], c: 'paintS' });
  });
  // chin gun turret with long 30 mm barrel, sensor ball
  const [gx, gy, gz] = spec.gunPivot;
  body.add(cyl(0.26, 0.24, 12), { at: [gx, gy + 0.2, gz], c: 'paintS' });
  body.box(0.26, 0.26, 0.9, { at: [gx, gy, gz + 0.25], c: 'gunmetal' });
  body.add(cyl(0.05, 1.5, 8, { axis: 'z', caps: 'end', capMat: 'black' }), { at: [gx, gy, gz + 1.4], c: 'gunmetal' });
  body.add(cyl(0.07, 0.18, 8, { axis: 'z', caps: 'end', capMat: 'black' }), { at: [gx, gy, gz + 2.1], c: 'gunmetal' });
  body.add(sphere(0.2, 10, 6), { at: [0, 0.98, 5.05], c: 'paintS' });
  body.box(0.18, 0.14, 0.03, { at: [0, 0.98, 5.24], c: 'glass' });
  // tail: fin with stabiliser, tail wheel, fixed main gear
  fin(body, [[2.2, 0, -7.4, 1.6, 0.18], [4.35, 0, -8.45, 1.0, 0.13]]);
  body.mirrorX(() => wing(body, [[0.1, 3.0, -8.1, 0.9, 0.09], [1.9, 3.0, -8.3, 0.7, 0.07]]));
  body.add(cyl(0.17, 0.5, 8, { axis: 'x' }), { at: [-0.18, spec.tailRotorPivot[1], spec.tailRotorPivot[2]], c: 'paintS' });
  strut(body, [0, 2.15, -7.4], [0, 0.22, -7.5], 0.06);
  wheel(body, [0.07, 0.22, -7.5], 0.22, 0.14);
  body.mirrorX(() => {
    strut(body, [0.62, 1.0, 2.3], [1.18, 0.38, 2.4], 0.06);
    strut(body, [0.62, 1.05, 1.5], [1.18, 0.38, 2.35], 0.05);
    strut(body, [0.8, 1.8, 1.9], [1.16, 0.45, 2.38], 0.05);
    wheel(body, [1.25, 0.38, 2.4], 0.38, 0.22);
  });
  body.tube([0, 2.5, -2.4], [0, 3.1, -2.9], 0.015, 0.008, 3, { c: 'black' });
  navLights(em, [2.6, 1.88, 0.6], [-2.6, 1.88, 0.6], [0, 4.33, -9.0], { size: 0.08 });
  em.box(0.08, 0.08, 0.08, { at: [0, 3.66, 0.4], c: 0xff3020 });
  return { body, emissive: em, ...rotorParts(spec, { chord: 0.6, tailAngles: [0, 0.68, PI, PI + 0.68] }) };
}

// ---------------------------------------------------------------------------
// Transport helicopter

function doorGun(part, at, side) {
  part.group({ at, rot: [0, side * 0.9, 0] }, () => {
    part.box(0.1, 0.13, 0.5, { at: [0, 0, 0.05], c: 'gunmetal' });
    part.add(cyl(0.02, 0.7, 6, { axis: 'z', caps: 'end', capMat: 'black' }), { at: [0, 0.01, 0.6], c: 'gunmetal' });
    part.box(0.1, 0.12, 0.16, { at: [side * 0.1, -0.04, 0.02], c: 'olive' });
    part.add(cyl(0.025, 0.4, 6, { caps: 'none' }), { at: [0, -0.22, -0.05], c: 'darkSteel' });
  });
}

function transportCoalition(spec) {
  const body = new Part(), em = new Part();
  fuselage(body, [
    { z: 7.9, w: 0.14, yb: 0.42, yt: 0.66 },
    { z: 7.45, w: 0.62, yb: 0.02, yt: 1.02 },
    { z: 6.75, w: 0.98, yb: -0.26, yt: 1.3 },
    { z: 6.0, w: 1.1, yb: -0.38, yt: 2.04 },
    { z: 5.0, w: 1.17, yb: -0.44, yt: 2.34 },
    { z: 4.4, w: 1.2, yb: -0.46, yt: 2.38 },
    { z: 0.8, w: 1.25, yb: -0.46, yt: 2.4 },
    { z: -1.0, w: 1.2, yb: -0.36, yt: 2.4 },
    { z: -2.6, w: 0.9, yb: 0.32, yt: 2.32 },
    { z: -4.6, w: 0.44, yb: 1.18, yt: 2.16 },
    { z: -8.6, w: 0.3, yb: 1.5, yt: 2.12 },
    { z: -9.9, w: 0.27, yb: 1.58, yt: 2.2 },
    { z: -10.4, w: 0.16, yb: 1.7, yt: 2.2 },
  ], { n: 16, e: 3.2, wallMat: glazing([[1, 13, 14], [1, 9, 10], [2, 2, 5], [3, 0, 1], [3, 6, 7]]) });
  // windscreen centre post and frames
  body.box(0.06, 0.8, 0.06, { at: [0, 1.62, 6.42], rot: [-0.85, 0, 0], c: 'frame' });
  for (const sx of [1, -1]) {
    const side = (y, z) => [sx * 1.2, y, z];
    // cabin windows, door gun window and cabin door outline
    pane(body, side(0.75, 4.3), side(0.75, 3.1), side(1.75, 3.1), side(1.75, 4.3), [sx, 0, 0]);
    pane(body, side(0.85, 2.6), side(0.85, 1.6), side(1.95, 1.6), side(1.95, 2.6), [sx, 0, 0]);
    pane(body, side(0.85, 1.4), side(0.85, -0.1), side(1.8, -0.1), side(1.8, 1.4), [sx, 0, 0], 'glass', 0.02);
    pane(body, side(-0.3, 1.55), side(-0.3, -0.25), side(2.1, -0.25), side(2.1, 1.55), [sx, 0, 0], 'paintDark', 0.012);
  }
  // engines, transmission fairing, exhausts
  body.mirrorX(() => {
    fuselage(body, [
      { z: 2.4, w: 0.24, yb: 2.4, yt: 2.82, x: 0.66 },
      { z: 2.1, w: 0.34, yb: 2.32, yt: 3.0, x: 0.68 },
      { z: -0.6, w: 0.34, yb: 2.32, yt: 3.0, x: 0.68 },
      { z: -1.0, w: 0.24, yb: 2.4, yt: 2.86, x: 0.66 },
    ], { n: 10 });
    body.add(cyl(0.22, 0.04, 10, { axis: 'z', caps: 'end', capMat: 'intake' }), { at: [0.66, 2.62, 2.42], c: 'intake' });
    body.group({ at: [0.98, 2.62, -0.95], rot: [0, 0.75, 0] }, () => body.box(0.3, 0.34, 0.6, { c: 'exhaust' }));
  });
  fuselage(body, [
    { z: 2.0, w: 0.3, yb: 2.38, yt: 2.9 },
    { z: 1.4, w: 0.5, yb: 2.38, yt: 3.35 },
    { z: -0.6, w: 0.5, yb: 2.38, yt: 3.35 },
    { z: -1.8, w: 0.25, yb: 2.38, yt: 2.85 },
  ], { n: 12 });
  body.add(cyl(0.16, 1.1, 8, { caps: 'none' }), { at: [0, 3.8, spec.rotorPivot[2]], c: 'darkSteel' });
  // tail pylon with stabilator
  fin(body, [[1.7, 0, -9.55, 1.7, 0.3], [4.6, 0, -10.75, 0.95, 0.2]]);
  body.mirrorX(() => wing(body, [[0.15, 1.95, -10.05, 1.0, 0.1], [2.2, 1.95, -10.2, 0.85, 0.08]]));
  body.add(cyl(0.16, 0.4, 8, { axis: 'x' }), { at: [-0.22, spec.tailRotorPivot[1], spec.tailRotorPivot[2]], c: 'paintS' });
  // landing gear (wheels touch y = -skidHeight)
  const gy = -spec.skidHeight;
  body.mirrorX(() => {
    strut(body, [1.0, -0.25, 3.7], [1.42, gy + 0.36, 3.75], 0.07);
    strut(body, [0.9, 0.3, 3.0], [1.4, gy + 0.4, 3.72], 0.05);
    wheel(body, [1.5, gy + 0.36, 3.75], 0.36, 0.22);
  });
  strut(body, [0, 1.2, -6.0], [0, gy + 0.25, -6.1], 0.06);
  wheel(body, [0.07, gy + 0.25, -6.1], 0.25, 0.14);
  // door guns on the gunner's windows
  for (const p of spec.doorGuns) doorGun(body, [p[0] + Math.sign(p[0]) * 0.12, p[1], p[2]], Math.sign(p[0]));
  body.box(0.05, 0.3, 0.06, { at: [0, 2.5, 5.0], rot: [-0.3, 0, 0], c: 'darkSteel' });
  body.tube([0, 2.4, -3.0], [0, 3.0, -3.5], 0.015, 0.008, 3, { c: 'black' });
  navLights(em, [1.0, 2.42, 1.0], [-1.0, 2.42, 1.0], [0, 4.55, -11.2], { size: 0.08 });
  em.box(0.09, 0.09, 0.09, { at: [0, -0.5, 0.5], c: 0xff3020 });
  em.mirrorX(() => em.box(0.02, 0.05, 0.6, { at: [0.3, 2.0, -6.5], c: 0x7dff9a }));
  return { body, emissive: em, ...rotorParts(spec, { chord: 0.53, r0: 0.8 }) };
}

function transportFederation(spec) {
  const body = new Part(), em = new Part();
  fuselage(body, [
    { z: 7.7, w: 0.2, yb: 0.35, yt: 0.75, e: 2 },
    { z: 7.25, w: 0.78, yb: -0.12, yt: 1.45, e: 2 },
    { z: 6.3, w: 1.08, yb: -0.4, yt: 2.05, e: 2.2 },
    { z: 5.2, w: 1.22, yb: -0.5, yt: 2.3, e: 2.6 },
    { z: 0.5, w: 1.28, yb: -0.52, yt: 2.38, e: 2.8 },
    { z: -2.0, w: 1.22, yb: -0.45, yt: 2.38, e: 2.8 },
    { z: -2.9, w: 1.05, yb: 0.0, yt: 2.35, e: 2.6 },
    { z: -3.6, w: 0.55, yb: 1.25, yt: 2.25, e: 2.4 },
    { z: -9.0, w: 0.28, yb: 1.6, yt: 2.15, e: 2.2 },
    { z: -10.2, w: 0.24, yb: 1.75, yt: 2.3, e: 2.2 },
    { z: -10.6, w: 0.14, yb: 1.85, yt: 2.3, e: 2.2 },
  ], { n: 16 });
  // glazed nose panes and cockpit windows
  for (const [y0, y1] of [[0.35, 0.9], [0.95, 1.45]]) {
    for (const sx of [1, -1]) {
      pane(body, [sx * 0.08, y0, 7.45], [sx * 0.7, y0, 7.05], [sx * 0.75, y1, 6.85], [sx * 0.08, y1, 7.3], [sx * 0.3, 0.1, 0.95]);
    }
  }
  for (const sx of [1, -1]) pane(body, [sx * 0.15, 1.55, 7.1], [sx * 0.85, 1.55, 6.7], [sx * 0.8, 2.0, 6.2], [sx * 0.15, 2.0, 6.55], [sx * 0.3, 0.6, 0.75]);
  for (const sx of [1, -1]) {
    const side = (y, z) => [sx * 1.2, y, z];
    pane(body, side(0.6, 6.2), side(0.6, 5.2), side(1.75, 5.2), side(1.75, 6.0), [sx, 0.05, 0.1]);
    // round portholes along the cabin
    for (const z of [1.6, 0.6, -0.4, -1.4]) body.add(cyl(0.2, 0.02, 8, { axis: 'x', caps: 'end', capMat: 'glass' }), { at: [sx * 1.28, 1.2, z], c: 'glass' });
    // sliding door (left) / window panel (right) at the door gun station
    pane(body, side(-0.3, 3.6), side(-0.3, 2.2), side(1.95, 2.2), side(1.95, 3.6), [sx, 0, 0], 'paintDark', 0.004);
    pane(body, side(1.1, 3.4), side(1.1, 2.5), side(1.75, 2.5), side(1.75, 3.4), [sx, 0, 0]);
  }
  // external fuel tanks
  body.mirrorX(() => {
    body.add(lathe([[0, -1.6], [0.36, -1.35], [0.46, -0.9], [0.46, 1.0], [0.38, 1.45], [0, 1.65]], 10, { axis: 'z', crease: 40 }), { at: [1.62, 0.05, 1.0], c: 'paint' });
    strut(body, [1.25, 0.2, 1.8], [1.5, 0.15, 1.8], 0.04);
    strut(body, [1.25, 0.2, 0.2], [1.5, 0.15, 0.2], 0.04);
  });
  // engine cowling with twin intakes over the cockpit, exhausts
  fuselage(body, [
    { z: 5.6, w: 0.5, yb: 2.1, yt: 2.5, e: 2.4 },
    { z: 5.2, w: 0.82, yb: 2.15, yt: 3.0, e: 2.6 },
    { z: 0.6, w: 0.85, yb: 2.2, yt: 3.15, e: 2.8 },
    { z: -1.4, w: 0.6, yb: 2.25, yt: 2.95, e: 2.6 },
    { z: -2.2, w: 0.3, yb: 2.25, yt: 2.6, e: 2.4 },
  ], { n: 14 });
  body.mirrorX(() => {
    body.add(cyl(0.28, 0.05, 10, { axis: 'z', caps: 'end', capMat: 'intake' }), { at: [0.38, 2.6, 5.62], c: 'intake' });
    body.group({ at: [0.92, 2.5, 0.2], rot: [0, 0.35, 0] }, () => body.add(cyl(0.22, 0.7, 8, { axis: 'z', caps: 'end', capMat: 'black' }), { c: 'exhaust' }));
  });
  body.add(cyl(0.18, 1.2, 8, { caps: 'none' }), { at: [0, 3.65, spec.rotorPivot[2]], c: 'darkSteel' });
  // rear clamshell doors outline
  body.box(1.6, 1.6, 0.02, { at: [0, 0.9, -3.0], rot: [0.5, 0, 0], c: 'paintDark' });
  // tail fin, stabiliser
  fin(body, [[2.0, 0, -9.8, 1.4, 0.24], [4.4, 0, -10.6, 0.9, 0.18]]);
  body.mirrorX(() => wing(body, [[0.15, 1.9, -8.3, 0.9, 0.09], [1.9, 1.9, -8.45, 0.75, 0.07]]));
  body.add(cyl(0.17, 0.4, 8, { axis: 'x' }), { at: [-0.2, spec.tailRotorPivot[1], spec.tailRotorPivot[2]], c: 'paintS' });
  // fixed tricycle gear
  const gy = -spec.skidHeight;
  strut(body, [0, -0.35, 6.2], [0, gy + 0.3, 6.3], 0.07);
  body.mirrorX(() => wheel(body, [0.14, gy + 0.3, 6.3], 0.3, 0.16));
  body.mirrorX(() => {
    strut(body, [1.0, -0.4, 0.3], [1.65, gy + 0.4, 0.1], 0.08);
    strut(body, [1.0, -0.4, -0.9], [1.65, gy + 0.4, 0.05], 0.06);
    strut(body, [1.2, 0.8, 0.1], [1.65, gy + 0.45, 0.08], 0.07);
    wheel(body, [1.75, gy + 0.4, 0.08], 0.4, 0.25);
  });
  strut(body, [0, 1.6, -8.9], [0, 1.1, -9.0], 0.05);
  for (const p of spec.doorGuns) doorGun(body, [p[0] + Math.sign(p[0]) * 0.1, p[1], p[2] + 0.8], Math.sign(p[0]));
  body.tube([0, 2.3, -3.8], [0, 2.9, -4.3], 0.015, 0.008, 3, { c: 'black' });
  navLights(em, [1.25, 2.0, 2.6], [-1.25, 2.0, 2.6], [0, 2.25, -10.6], { size: 0.09 });
  em.box(0.1, 0.1, 0.1, { at: [0, 3.2, -1.5], c: 0xff3020 });
  return { body, emissive: em, ...rotorParts(spec, { chord: 0.52, r0: 0.85, tailAngles: [0, 2.09, 4.19] }) };
}

// ---------------------------------------------------------------------------
// Strike jet

function bomb(part, at, len, r, o = {}) {
  const h = len / 2;
  part.add(lathe([[0, -h], [r * 0.55, -h + r * 0.4], [r, -h + len * 0.3], [r, h - len * 0.25], [r * 0.6, h - len * 0.06], [0, h]], 8, {
    axis: 'z', crease: 55,
  }), { at, c: o.c ?? 'bomb' });
  part.add(cyl(r * 1.03, len * 0.04, 8, { axis: 'z', caps: 'none' }), { at: [at[0], at[1], at[2] + h * 0.45], c: 'yellow' });
  // cruciform tail fins as two crossed plates
  for (const a of [PI / 4, -PI / 4]) part.box(0.006, r * 3.2, r * 2.2, { at: [at[0], at[1], at[2] - h + r * 1.2], rot: [0, 0, a], c: o.c ?? 'bomb' });
}

function jetCoalition(spec) {
  const body = new Part(), em = new Part();
  fuselage(body, [
    { z: 7.55, w: 0.05, yb: 0.32, yt: 0.4, e: 2 },
    { z: 6.8, w: 0.33, yb: 0.04, yt: 0.66, e: 2 },
    { z: 5.8, w: 0.48, yb: -0.16, yt: 0.86, e: 2.2 },
    { z: 4.6, w: 0.57, yb: -0.3, yt: 0.95, e: 2.4 },
    { z: 3.4, w: 0.64, yb: -0.4, yt: 0.96, e: 2.6 },
    { z: 1.8, w: 0.72, yb: -0.48, yt: 0.96, e: 2.8 },
    { z: -0.2, w: 0.76, yb: -0.52, yt: 0.9, e: 2.8 },
    { z: -2.6, w: 0.76, yb: -0.5, yt: 0.82, e: 2.8 },
    { z: -4.8, w: 0.7, yb: -0.42, yt: 0.74, e: 2.6 },
    { z: -6.5, w: 0.6, yb: -0.36, yt: 0.66, e: 2.3 },
    { z: -6.95, w: 0.56, yb: -0.33, yt: 0.63, e: 2.1 },
  ], { n: 16, wallMat: (i) => (i === 0 ? 'radome' : undefined) });
  body.lathe([[0, 7.95], [0.012, 7.9], [0.012, 7.5]], 4, { axis: 'z', at: [0, 0.36, 0], c: 'darkSteel' });
  // nozzle
  const [, ny, nz] = spec.nozzle;
  const nr = spec.nozzleRadius;
  body.lathe([[0.58, -6.95], [0.6, -7.05], [nr, nz], [nr * 0.82, nz], [nr * 0.78, nz + 0.25], [0, nz + 0.3]], 12, {
    axis: 'z', at: [0, ny, 0], mats: ['nozzle', 'nozzle', 'exhaust', 'black', 'black'], crease: 45,
  });
  // chin intake
  fuselage(body, [
    { z: 3.75, w: 0.5, yb: -1.08, yt: -0.42, e: 2.4 },
    { z: 2.4, w: 0.52, yb: -1.0, yt: -0.3, e: 2.4 },
    { z: 0.0, w: 0.56, yb: -0.85, yt: -0.2, e: 2.4 },
    { z: -1.8, w: 0.5, yb: -0.62, yt: -0.2, e: 2.4 },
  ], { n: 12 });
  body.add(sphere(1, 8, 4).transform({ s: [0.4, 0.26, 0.04] }), { at: [0, -0.75, 3.76], c: 'intake' });
  // bubble canopy
  fuselage(body, [
    { z: 5.45, w: 0.28, yb: 0.78, yt: 0.94, e: 2 },
    { z: 4.7, w: 0.42, yb: 0.78, yt: 1.34, e: 2 },
    { z: 3.7, w: 0.44, yb: 0.8, yt: 1.43, e: 2 },
    { z: 2.7, w: 0.38, yb: 0.82, yt: 1.3, e: 2 },
    { z: 2.0, w: 0.26, yb: 0.85, yt: 1.04, e: 2 },
  ], { n: 12, c: 'glass', smooth: 80 });
  body.box(0.86, 0.06, 0.06, { at: [0, 1.18, 2.55], rot: [0.2, 0, 0], c: 'frame' });
  // wings with LERX, wingtip rails and AIM-9s
  body.mirrorX(() => {
    wing(body, [[0.55, 0.02, 3.7, 7.25, 0.16], [1.1, 0.0, 0.95, 4.55, 0.22], [4.62, -0.02, -2.08, 1.25, 0.08]]);
    body.box(0.07, 0.1, 2.7, { at: [4.72, -0.02, -2.4], c: 'paintS' });
    missile(body, [4.82, -0.02, -1.9], 2.85, 0.064, { finSets: [[-1.2, 1], [1.0, 0.7]] });
    // stabilators and ventral fins
    wing(body, [[0.62, 0.05, -4.9, 2.4, 0.14], [2.85, -0.28, -6.2, 1.05, 0.06]]);
    body.box(0.05, 0.45, 1.0, { at: [0.48, -0.58, -5.1], rot: [0, 0, 0.35], c: 'paint' });
    // pylons and stores
    const [ix, iy, iz] = spec.pylons[0];
    pylon(body, [ix, -0.06, iz + 0.15], [ix, iy + 0.12, iz], 1.3);
    bomb(body, [ix, iy - 0.08, iz], 2.25, 0.14);
    const [ox, oy, oz] = spec.pylons[2];
    pylon(body, [ox, -0.06, oz + 0.15], [ox, oy + 0.08, oz], 1.1);
    missile(body, [ox, oy - 0.04, oz], 3.6, 0.09, { finSets: [[-1.55, 1], [0.3, 0.8]] });
  });
  // vertical fin with rudder line and beacon housing
  fin(body, [[0.75, 0, -3.65, 3.5, 0.2], [2.6, 0, -6.15, 1.35, 0.1]]);
  body.box(0.11, 1.6, 0.04, { at: [0, 1.65, -6.25], rot: [-0.3, 0, 0], c: 'paintDark' });
  // gun port, airbrake panels, IFF blades, refuelling receptacle
  body.box(0.03, 0.06, 0.22, { at: [spec.gun[0] + 0.01, spec.gun[1], spec.gun[2]], c: 'black' });
  body.mirrorX(() => body.box(0.5, 0.06, 1.1, { at: [0.55, 0.3, -6.6], c: 'paintS' }));
  for (const sx of [1, -1]) body.box(0.02, 0.14, 0.12, { at: [sx * 0.18, 0.92, 5.6], c: 'darkSteel' });
  body.box(0.18, 0.02, 0.4, { at: [0, 0.97, 0.8], c: 'paintDark' });
  // lights
  navLights(em, [0.62, 0.0, 2.9], [-0.62, 0.0, 2.9], [0, 2.4, -6.3], { size: 0.08 });
  em.mirrorX(() => {
    em.box(0.02, 0.05, 0.55, { at: [0.6, 0.55, 4.2], c: 0x7dff9a });
    em.box(0.02, 0.05, 0.6, { at: [0.12, 1.6, -5.2], c: 0x7dff9a });
  });
  return { body, emissive: em };
}

function jetFederation(spec) {
  const body = new Part(), em = new Part();
  fuselage(body, [
    { z: 7.6, w: 0.04, yb: 0.15, yt: 0.24, e: 2 },
    { z: 6.85, w: 0.3, yb: -0.12, yt: 0.52, e: 2 },
    { z: 5.6, w: 0.46, yb: -0.4, yt: 0.82, e: 2.2 },
    { z: 4.3, w: 0.56, yb: -0.5, yt: 0.92, e: 2.5 },
    { z: 2.9, w: 0.6, yb: -0.55, yt: 0.95, e: 2.6 },
    { z: 0.4, w: 0.56, yb: -0.55, yt: 0.86, e: 2.6 },
    { z: -3.0, w: 0.44, yb: -0.38, yt: 0.76, e: 2.4 },
    { z: -5.6, w: 0.32, yb: -0.12, yt: 0.66, e: 2.2 },
    { z: -7.3, w: 0.18, yb: 0.08, yt: 0.56, e: 2 },
    { z: -7.55, w: 0.07, yb: 0.22, yt: 0.42, e: 2 },
  ], { n: 14 });
  // nose laser window and pitot
  body.box(0.16, 0.2, 0.02, { at: [0, 0.2, 7.36], rot: [-0.6, 0, 0], c: 'glass' });
  body.lathe([[0, 8.0], [0.012, 7.95], [0.012, 7.45]], 4, { axis: 'z', at: [0, 0.19, -0.05], c: 'darkSteel' });
  // engine nacelles converging on the tail, twin nozzles inside the spec exhaust circle
  body.mirrorX(() => {
    fuselage(body, [
      { z: 2.75, w: 0.3, yb: -0.48, yt: 0.22, x: 0.8, e: 2.4 },
      { z: 2.2, w: 0.36, yb: -0.56, yt: 0.32, x: 0.82, e: 2.6 },
      { z: -1.5, w: 0.36, yb: -0.5, yt: 0.32, x: 0.76, e: 2.6 },
      { z: -5.0, w: 0.33, yb: -0.32, yt: 0.36, x: 0.56, e: 2.4 },
      { z: -6.85, w: 0.3, yb: -0.2, yt: 0.4, x: 0.42, e: 2.2 },
    ], { n: 10 });
    body.add(sphere(1, 8, 4).transform({ s: [0.28, 0.33, 0.04] }), { at: [0.8, -0.13, 2.77], c: 'intake' });
    body.lathe([[0.3, -6.85], [0.29, -7.1], [0.22, -7.1], [0.2, -6.95], [0, -6.95]], 10, { axis: 'z', at: [0.42, 0.1, 0], mats: ['nozzle', 'exhaust', 'black', 'black'] });
  });
  // framed canopy
  fuselage(body, [
    { z: 5.25, w: 0.3, yb: 0.76, yt: 0.9, e: 2.4 },
    { z: 4.75, w: 0.42, yb: 0.78, yt: 1.28, e: 2.4 },
    { z: 3.7, w: 0.44, yb: 0.8, yt: 1.35, e: 2.4 },
    { z: 3.1, w: 0.38, yb: 0.84, yt: 1.12, e: 2.4 },
  ], { n: 10, c: 'glass', smooth: 70 });
  for (const z of [4.75, 4.1]) body.box(0.9, 0.06, 0.06, { at: [0, 1.15, z], c: 'frame' });
  body.box(0.06, 0.06, 1.6, { at: [0, 1.34, 3.95], c: 'frame' });
  // shoulder wings with wingtip airbrake pods
  body.mirrorX(() => {
    wing(body, [[0.5, 0.48, 1.7, 3.2, 0.3], [4.75, 0.3, -0.05, 1.45, 0.12]]);
    fuselage(body, [
      { z: 0.45, w: 0.04, yb: 0.28, yt: 0.34, x: 4.92, e: 2 },
      { z: 0.1, w: 0.12, yb: 0.18, yt: 0.44, x: 4.92, e: 2 },
      { z: -1.35, w: 0.12, yb: 0.18, yt: 0.44, x: 4.92, e: 2 },
      { z: -1.6, w: 0.06, yb: 0.28, yt: 0.36, x: 4.92, e: 2 },
    ], { n: 6, c: 'paintS' });
    wing(body, [[0.25, 0.48, -5.55, 1.95, 0.12], [2.45, 0.78, -6.45, 1.0, 0.06]]);
    const [ix, iy, iz] = spec.pylons[0];
    pylon(body, [ix, 0.3, iz + 0.2], [ix, iy + 0.22, iz], 1.4);
    rocketPod(body, [ix, iy - 0.05, iz], 2.5, 0.26, { c: 'pod', seg: 8 });
    const [ox, oy, oz] = spec.pylons[2];
    pylon(body, [ox, 0.28, oz + 0.1], [ox, oy + 0.16, oz], 1.0);
    bomb(body, [ox, oy - 0.04, oz], 1.95, 0.17);
  });
  fin(body, [[0.62, 0, -4.15, 3.05, 0.22], [2.75, 0, -6.55, 1.35, 0.1]]);
  body.box(0.12, 0.3, 0.6, { at: [0, 2.82, -7.1], c: 'paintS' });
  // gun fairing (spec gun point), antennas
  body.add(cyl(0.05, 0.3, 6, { axis: 'z', caps: 'end', capMat: 'black' }), { at: spec.gun, c: 'gunmetal' });
  body.box(0.12, 0.14, 0.9, { at: [spec.gun[0] - 0.06, spec.gun[1], spec.gun[2] - 0.5], c: 'paintS' });
  body.tube([0, 0.9, 1.8], [0, 1.25, 1.5], 0.012, 0.006, 3, { c: 'black' });
  navLights(em, [5.0, 0.32, 0.3], [-5.0, 0.32, 0.3], [0, 0.32, -7.6], { size: 0.09 });
  em.box(0.07, 0.07, 0.07, { at: [0, 2.9, -6.8], c: 0xff3020 });
  return { body, emissive: em };
}

// ---------------------------------------------------------------------------
// Four-engine turboprop transport

function propBlurPart(pivots, R, axis) {
  const P = new Part();
  const disc = blurDisc(R * 0.18, R, 28, PROP_STOPS);
  for (const p of pivots) {
    if (axis === 'z') P.add(disc, { at: p, rot: [PI / 2, 0, 0], order: 'XYZ' });
    else P.add(disc, { at: p });
  }
  return P;
}

function transportPlane(spec, f) {
  const body = new Part(), em = new Part();
  const fed = f === 1;
  // fuselage with upswept tail
  fuselage(body, [
    { z: 14.35, w: fed ? 0.25 : 0.4, yb: fed ? -0.5 : -0.45, yt: fed ? 0.1 : 0.3, e: 2 },
    { z: 13.5, w: 1.4, yb: -1.45, yt: 1.05, e: 2.1 },
    { z: 12.2, w: 1.98, yb: -1.9, yt: 2.0, e: 2.3 },
    { z: 10.4, w: 2.15, yb: -2.05, yt: 2.15, e: 2.4 },
    { z: -5.6, w: 2.15, yb: -2.05, yt: 2.15, e: 2.4 },
    { z: -5.75, w: 2.145, yb: -2.0, yt: 2.15, e: 2.4 },
    { z: -6.65, w: 2.117, yb: -1.72, yt: 2.15, e: 2.4 },
    { z: -7.2, w: 2.1, yb: -1.55, yt: 2.15, e: 2.4 },
    { z: -10.2, w: 1.75, yb: -0.15, yt: 2.18, e: 2.3 },
    { z: -13.2, w: 1.05, yb: 0.95, yt: 2.25, e: 2.1 },
    { z: -15.4, w: fed ? 0.55 : 0.32, yb: fed ? 1.25 : 1.6, yt: 2.25, e: 2 },
  ], {
    n: 18,
    // paratroop doors (band 5) and the cargo ramp panel under the tail (band 7)
    wallMat: (i, j) => (i === 5 && (j >= 16 || j === 0 || (j >= 8 && j <= 10)) ? 'paintDark' : i === 7 && j >= 11 && j <= 16 ? 'panel' : undefined),
  });
  // flight deck windows
  for (const sx of [1, -1]) {
    pane(body, [sx * 0.08, 0.95, 13.45], [sx * 0.85, 0.95, 13.2], [sx * 0.95, 1.6, 12.8], [sx * 0.08, 1.7, 13.0], [sx * 0.2, 0.55, 0.8]);
    pane(body, [sx * 0.95, 0.95, 13.15], [sx * 1.6, 0.95, 12.6], [sx * 1.6, 1.55, 12.35], [sx * 1.0, 1.62, 12.75], [sx * 0.7, 0.4, 0.55]);
    pane(body, [sx * 1.85, 0.7, 12.4], [sx * 2.0, 0.7, 11.4], [sx * 2.0, 1.3, 11.4], [sx * 1.85, 1.35, 12.3], [sx, 0.1, 0.1]);
    if (!fed) pane(body, [sx * 0.6, -0.35, 13.75], [sx * 1.1, -0.4, 13.45], [sx * 1.15, 0.2, 13.4], [sx * 0.6, 0.25, 13.7], [sx * 0.5, -0.2, 0.8]);
  }
  if (fed) {
    // glazed navigator's nose
    for (const [y0, y1] of [[-1.15, -0.55], [-0.5, 0.15]]) {
      for (const sx of [1, -1]) pane(body, [sx * 0.05, y0, 14.2 - (y0 + 1.2) * 0.4], [sx * 1.15, y0, 13.6], [sx * 1.1, y1, 13.65], [sx * 0.05, y1, 14.25 - (y1 + 1.2) * 0.3], [sx * 0.3, -0.1, 0.95]);
    }
  } else {
    body.lathe([[0.95, 13.6], [0.8, 14.0], [0.4, 14.32], [0, 14.4]], 12, { axis: 'z', at: [0, -0.25, 0], c: 'radome' });
  }
  // high wing, engine nacelles, spinners, external tanks
  body.mirrorX(() => {
    wing(body, [[0.0, 2.3, 2.45, 4.95, 0.78], [10.4, 2.45, 2.05, 4.05, 0.5], [20.2, fed ? 2.2 : 2.65, 1.0, 2.3, 0.24]], { smooth: 30 });
    for (const p of spec.propPivots.filter((q) => q[0] > 0)) {
      const [px, py, pz] = p;
      fuselage(body, [
        { z: pz - 0.05, w: 0.42, yb: py - 0.4, yt: py + 0.4, x: px, e: 2 },
        { z: pz - 0.8, w: 0.66, yb: py - 0.78, yt: py + 0.62, x: px, e: 2.2 },
        { z: pz - 3.6, w: 0.62, yb: py - 0.62, yt: py + 0.66, x: px, e: 2.2 },
        { z: pz - (fed ? 7.4 : 6.4), w: 0.25, yb: py + 0.1, yt: py + 0.55, x: px, e: 2 },
      ], { n: 12 });
      body.add(sphere(1, 8, 4).transform({ s: [0.3, 0.14, 0.05] }), { at: [px, py - 0.6, pz - 0.82], c: 'intake' });
      body.lathe([[0.44, -0.08], [0.4, 0.25], [0.24, 0.6], [0, 0.82]], 10, { axis: 'z', at: [px, py, pz], c: fed ? 'paintPlain' : 'radome', crease: 60 });
      body.box(0.18, 0.28, 0.4, { at: [px - 0.45, py + 0.15, pz - 2.4], c: 'exhaust' });
    }
    if (!fed) {
      body.add(lathe([[0, -3.8], [0.32, -3.2], [0.55, -1.8], [0.55, 1.8], [0.3, 3.0], [0, 3.4]], 10, { axis: 'z', crease: 40 }), { at: [7.8, 1.25, -0.4], c: 'paint' });
      pylon(body, [7.8, 2.2, -0.4], [7.8, 1.7, -0.4], 2.0);
    }
    // main gear sponson
    fuselage(body, [
      { z: 2.4, w: 0.3, yb: -1.9, yt: -0.9, x: 2.1, e: 2 },
      { z: 1.6, w: 0.5, yb: -2.1, yt: -0.6, x: 2.15, e: 2.4 },
      { z: -3.2, w: 0.5, yb: -2.1, yt: -0.6, x: 2.15, e: 2.4 },
      { z: -4.4, w: 0.25, yb: -1.9, yt: -0.9, x: 2.1, e: 2 },
    ], { n: 10 });
    // horizontal tail
    wing(body, [[0.4, 2.35, -11.2, 4.4, 0.42], [6.6, 2.5, -12.7, 2.2, 0.18]], { smooth: 30 });
  });
  // fin with dorsal fillet
  fin(body, [[2.1, 0, -6.0, 9.2, 0.5], [3.6, 0, -9.2, 6.0, 0.5], [fed ? 9.0 : 8.7, 0, fed ? -13.0 : -13.3, fed ? 3.0 : 2.8, 0.26]], { smooth: 30 });
  if (fed) {
    // tail gunner's turret
    fuselage(body, [
      { z: -15.0, w: 0.55, yb: 1.25, yt: 2.25, e: 2 },
      { z: -15.6, w: 0.45, yb: 1.35, yt: 2.15, e: 2 },
      { z: -16.0, w: 0.15, yb: 1.6, yt: 1.9, e: 2 },
    ], { n: 10, c: 'glass' });
    for (const sx of [0.12, -0.12]) body.add(cyl(0.03, 0.8, 6, { axis: 'z', caps: 'end', capMat: 'black' }), { at: [sx, 1.4, -16.1], c: 'gunmetal' });
  }
  body.tube([0, 2.15, 6.0], [0, 2.65, 5.6], 0.02, 0.01, 3, { c: 'black' });
  // lights: nav, tail, beacons, jump lights
  navLights(em, [20.15, 2.6, 0.2], [-20.15, 2.6, 0.2], [0, fed ? 1.7 : 2.0, fed ? -16.05 : -15.45], { size: 0.16 });
  em.box(0.16, 0.12, 0.16, { at: [0, 2.2, 1.0], c: 0xff3020 });
  em.box(0.16, 0.12, 0.16, { at: [0, -2.07, 0.0], c: 0xff3020 });
  em.mirrorX(() => {
    em.box(0.03, 0.1, 0.1, { at: [2.18, 0.65, spec.jumpDoors[0][2] + 0.6], c: 0x22ff55 });
    em.box(0.03, 0.1, 0.1, { at: [2.18, 0.85, spec.jumpDoors[0][2] + 0.6], c: 0xff2416 });
  });
  return { body, emissive: em, propBlur: propBlurPart(spec.propPivots, spec.propRadius, 'z') };
}

// ---------------------------------------------------------------------------
// FPV kamikaze quadcopter with an RPG warhead

function fpvDrone(spec, f) {
  const body = new Part('carbon'), em = new Part();
  const [px, , pz] = spec.propPivots[0];
  // carbon X-frame: bottom plate, top plate and four arms to the motors
  body.box(0.07, 0.006, 0.13, { at: [0, -0.004, 0], c: 'carbon' });
  body.box(0.055, 0.004, 0.1, { at: [0, 0.028, 0], c: 'carbon', noBottom: true });
  const motor = cyl(0.014, 0.018, 6, { caps: 'end', capMat: 'darkSteel' });
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const a = [sx * 0.02, -0.004, sz * 0.03], b = [sx * px, -0.004, sz * pz];
    const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
    const yaw = Math.atan2(b[0] - a[0], b[2] - a[2]);
    body.box(0.016, 0.005, len, { at: [(a[0] + b[0]) / 2, a[1], (a[2] + b[2]) / 2], rot: [0, yaw, 0], c: 'carbon' });
    body.add(motor, { at: [sx * px, 0.011, sz * pz], c: 'black' });
    body.box(0.007, 0.008, 0.007, { at: [sx * px, 0.024, sz * pz], c: 'steel', noBottom: true });
  }
  // standoffs, flight stack, battery strapped on top with its lead
  for (const [x, z] of [[0.024, 0.042], [-0.024, -0.042]]) body.box(0.004, 0.03, 0.004, { at: [x, 0.012, z], c: 'copper', noBottom: true, noTop: true });
  body.box(0.03, 0.012, 0.03, { at: [0, 0.012, -0.01], c: 'darkSteel', noBottom: true });
  body.box(0.038, 0.032, 0.085, { at: [0, 0.047, -0.005], c: 'battery', noBottom: true });
  body.box(0.041, 0.034, 0.008, { at: [0, 0.047, 0.02], c: 'black', noBottom: true });
  body.box(0.02, 0.006, 0.05, { at: [0, 0.047, -0.07], c: 'yellow', noBottom: true });
  // FPV camera at the spec point, VTX antenna at the rear
  const [cx, cy, cz] = spec.camera;
  body.box(0.022, 0.022, 0.02, { at: [cx, cy - 0.012, cz - 0.04], c: 'black' });
  body.box(0.012, 0.012, 0.006, { at: [cx, cy - 0.012, cz - 0.028], c: 'glass' });
  body.tube([0, 0.02, -0.06], [0, 0.058, -0.095], 0.003, 0.003, 3, { c: 'black' });
  body.box(0.012, 0.012, 0.012, { at: [0, 0.06, -0.097], c: 'black' });
  // RPG-7 HEAT warhead slung underneath, nose forward with the fuze probe
  body.add(lathe([[0.02, -0.1], [0.02, -0.035], [0.042, -0.02], [0.042, 0.06], [0.034, 0.1], [0.011, 0.18], [0.007, 0.2], [0, 0.205]], 8, {
    axis: 'z', crease: 40, mats: ['warhead', 'warhead', 'warhead', 'warhead', 'warhead', 'darkSteel', 'darkSteel'],
  }), { at: [0, -0.045, 0.02] });
  body.add(cyl(0.043, 0.006, 6, { axis: 'z', caps: 'none' }), { at: [0, -0.045, 0.0], c: 'black' });
  body.box(0.012, 0.022, 0.012, { at: [0, -0.016, 0.0], c: 'black', noTop: true, noBottom: true });
  // LEDs
  em.box(0.006, 0.004, 0.012, { at: [px * 0.9, -0.009, -pz * 0.9], c: f ? 0xff2416 : 0x3fa0ff });
  em.box(0.006, 0.004, 0.012, { at: [-px * 0.9, -0.009, -pz * 0.9], c: f ? 0xff2416 : 0x3fa0ff });
  em.box(0.004, 0.003, 0.004, { at: [0, 0.019, -0.02], c: 0x22ff55 });
  const propBlur = new Part();
  const disc = blurDisc(0.008, spec.propRadius, 12, [[0, 0x4a4b4e], [0.8, 0x2a2b2d], [1, 0x5a5a58]]);
  for (const p of spec.propPivots) propBlur.add(disc, { at: p });
  return { body, emissive: em, propBlur };
}

// ---------------------------------------------------------------------------
// Fixed-wing reconnaissance UAV with pusher prop

function reconUav(spec, f) {
  const body = new Part(), em = new Part();
  const [, ppy, ppz] = spec.propPivot;
  if (!f) {
    // twin-boom layout: pod fuselage, high wing, booms to an inverted-V tail
    fuselage(body, [
      { z: 1.78, w: 0.02, yb: 0.02, yt: 0.06, e: 2 },
      { z: 1.5, w: 0.13, yb: -0.12, yt: 0.18, e: 2.2 },
      { z: 0.8, w: 0.17, yb: -0.17, yt: 0.24, e: 2.6 },
      { z: -0.9, w: 0.17, yb: -0.12, yt: 0.24, e: 2.6 },
      { z: -1.6, w: 0.1, yb: 0.02, yt: 0.18, e: 2.2 },
      { z: ppz + 0.05, w: 0.05, yb: 0.08, yt: 0.12, e: 2 },
    ], { n: 12 });
    body.mirrorX(() => {
      wing(body, [[0.15, 0.27, 0.32, 0.5, 0.06], [2.7, 0.3, 0.22, 0.34, 0.035]]);
      fuselage(body, [
        { z: 0.45, w: 0.02, yb: 0.24, yt: 0.27, x: 0.55, e: 2 },
        { z: 0.2, w: 0.035, yb: 0.22, yt: 0.29, x: 0.55, e: 2 },
        { z: -1.55, w: 0.03, yb: 0.23, yt: 0.28, x: 0.55, e: 2 },
        { z: -1.7, w: 0.015, yb: 0.245, yt: 0.265, x: 0.55, e: 2 },
      ], { n: 6 });
      // inverted-V tail half from the boom end down to the centre
      wing(body, [[0.55, 0.26, -1.24, 0.42, 0.03], [0.02, 0.02, -1.3, 0.36, 0.025]], { profile: THIN });
    });
    body.box(0.06, 0.03, 0.08, { at: [0, -0.15, 0.4], c: 'black' });
  } else {
    // Orlan-style: slim fuselage, high wing, V-tail ahead of the pusher prop
    fuselage(body, [
      { z: 1.8, w: 0.03, yb: 0.02, yt: 0.07, e: 2 },
      { z: 1.45, w: 0.12, yb: -0.12, yt: 0.18, e: 2.2 },
      { z: 0.5, w: 0.15, yb: -0.16, yt: 0.22, e: 2.6 },
      { z: -0.6, w: 0.13, yb: -0.1, yt: 0.2, e: 2.4 },
      { z: -1.5, w: 0.07, yb: 0.02, yt: 0.15, e: 2.2 },
      { z: ppz + 0.06, w: 0.06, yb: 0.06, yt: 0.13, e: 2 },
    ], { n: 12 });
    body.mirrorX(() => {
      wing(body, [[0.12, 0.25, 0.4, 0.46, 0.055], [2.7, 0.3, 0.28, 0.3, 0.03]]);
      wing(body, [[0.05, 0.12, -1.18, 0.32, 0.03], [0.62, 0.48, -1.38, 0.18, 0.02]], { profile: THIN });
    });
    body.box(0.18, 0.05, 0.3, { at: [0, 0.24, 0.1], c: 'paintS' });
  }
  // pusher engine and spinner, camera gimbal at the spec point, antennas
  body.lathe([[0.06, -0.12], [0.07, 0], [0.05, 0.05], [0, 0.08]].map(([r, z]) => [r, z]), 8, { axis: 'z', at: [0, ppy, ppz + 0.05], c: 'darkSteel' });
  body.lathe([[0.045, 0.0], [0.03, -0.05], [0, -0.08]], 8, { axis: 'z', at: [0, ppy, ppz], c: 'black' });
  const [cx, cy, cz] = spec.camera;
  body.add(cyl(0.035, 0.08, 8, { caps: 'none' }), { at: [cx, cy + 0.1, cz], c: 'black' });
  body.add(sphere(0.085, 10, 6), { at: [cx, cy, cz], c: f ? 'darkSteel' : 'lightGrey' });
  body.box(0.07, 0.05, 0.02, { at: [cx, cy - 0.01, cz + 0.078], c: 'glass' });
  body.tube([0, 0.22, -0.3], [0, 0.4, -0.38], 0.006, 0.004, 3, { c: 'black' });
  navLights(em, [2.68, 0.3, 0.2], [-2.68, 0.3, 0.2], [0, 0.18, -1.55], { size: 0.03 });
  em.box(0.025, 0.02, 0.025, { at: [0, -0.15, -0.3], c: 0xff5050 });
  const propBlur = new Part();
  propBlur.add(blurDisc(0.05, spec.propRadius, 18, [[0, 0x4a4b4e], [0.82, 0x2a2b2d], [1, 0x5a5a58]]), { at: spec.propPivot, rot: [PI / 2, 0, 0], order: 'XYZ' });
  return { body, emissive: em, propBlur };
}

const BUILDERS = {
  attack_heli: [attackCoalition, attackFederation],
  transport_heli: [transportCoalition, transportFederation],
  jet: [jetCoalition, jetFederation],
  transport_plane: [(s) => transportPlane(s, 0), (s) => transportPlane(s, 1)],
  fpv_drone: [(s) => fpvDrone(s, 0), (s) => fpvDrone(s, 1)],
  recon_uav: [(s) => reconUav(s, 0), (s) => reconUav(s, 1)],
};

export function buildAirParts(type, faction) {
  const spec = AIRCRAFT_SPECS[type];
  if (!spec) throw new Error(`models: unknown aircraft type '${type}'`);
  const b = BUILDERS[type];
  if (!b) {
    const body = new Part();
    body.box(spec.width * 0.2, spec.height * 0.5, spec.length, {});
    return { body };
  }
  return b[faction ? 1 : 0](spec);
}

export const AIR_TYPES = Object.keys(AIRCRAFT_SPECS);
