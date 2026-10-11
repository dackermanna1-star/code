// Pistols: glock, usp, p228, deagle, elite, fiveseven.
// Gun frame: origin at the top of the grip under the rear of the slide,
// -Z forward, bore at y ~0.95.
import { C, hold, pistolRig, silencerAnim, idle } from './kit.js';
import { arm } from './hands.js';
import { Z } from './anim.js';
import { add, mul, dirIn } from './pose.js';

// two-handed: closer to the centre line and a little higher than a one-hand hold, so
// both hands show
const PISTOL_HOLD = { p: [3.6, -4.9, -14.6], r: [3, 9, -7] };

// Shared pistol grip (deeper than the rifle grip), knurled.
function grip(g, tint, o = {}) {
  const f = o.front ?? 0.85, h = o.h ?? 4.4, back = o.back ?? -1.0, rake = o.rake ?? 0.95;
  g.prism('polymer', tint, [[f, 0.05], [back, 0.05], [back - rake, -h + 0.25], [back - rake + 0.25, -h], [f - rake + 0.15, -h], [f - rake * 0.35, -1.2], [f + 0.05, -0.55]], o.w || 1.16, { bev: 0.18 });
  // grip panels
  g.prism('knurl', [0.8, 0.8, 0.82].map((v) => v * tint[0] * 3), [[f - 0.35, -0.6], [back + 0.1, -0.6], [back - rake + 0.35, -h + 0.5], [f - rake - 0.1, -h + 0.5]], (o.w || 1.16) + 0.06);
}

function slideBody(s, tint, len, h, w, o = {}) {
  const r = o.rear ?? -0.9;
  const fc = o.frontCut ?? 0.35;
  s.prism('metal', tint, [[r, 0.35], [len, 0.35], [len, 0.35 + h - fc], [len - fc, 0.35 + h], [r + 0.2, 0.35 + h], [r, 0.35 + h - 0.25]], w, { bev: o.bev ?? 0.12 });
  // rear serrations
  for (let i = 0; i < 6; i++) for (const sx of [-1, 1]) s.span('metal', [tint[0] * 0.5, tint[1] * 0.5, tint[2] * 0.5], r + 0.15 + i * 0.22, r + 0.25 + i * 0.22, 0.5, 0.35 + h - 0.2, 0.03, { x: sx * (w / 2 + 0.005) });
  // sights
  s.span('metal', C.black, r + 0.1, r + 0.55, 0.35 + h, 0.35 + h + 0.3, 0.75);
  s.span('metal', C.bore, r + 0.1, r + 0.56, 0.35 + h + 0.12, 0.35 + h + 0.31, 0.22);
  s.span('metal', C.black, len - 0.55, len - 0.3, 0.35 + h, 0.35 + h + 0.26, 0.18);
  // ejection port (right) with barrel hood
  s.span('metal', [0.6, 0.6, 0.62], 1.6, 3.2, 0.35 + h - 0.5, 0.35 + h - 0.05, 0.04, { x: w / 2 });
  // bore at the front
  s.tube('metal', C.bore, len, len + 0.02, 0.95, 0.24, 0.24, { n: 8 });
  s.tube('metal', [0.5, 0.5, 0.52], len - 0.01, len + 0.01, 0.95, 0.36, 0.36, { n: 8 });
}

function triggerGuardP(g, tint, f0 = 0.8, f1 = 3.4, sq = true) {
  g.span('polymer', tint, f0, f1, -1.05, -0.85, 0.42);
  g.prism('polymer', tint, sq ? [[f1 - 0.3, -1.05], [f1, -1.05], [f1, 0.0], [f1 - 0.3, 0.0]] : [[f1 - 0.6, -1.05], [f1, -0.7], [f1, 0.0], [f1 - 0.3, 0.0], [f1 - 0.3, -0.6], [f1 - 0.6, -0.85]], 0.42);
  g.box('metal', C.dark, 0.18, 0.7, 0.24, { p: [0, -0.4, -(f0 + 0.9)], r: [14, 0, 0] });
}

function magInGrip(mb, tint, o = {}) {
  mb.node('mag', 'gun', [0, -4.3, 0.45]);
  const m = mb.pen('mag');
  m.span('metal', tint, -0.6, 1.0, -0.2, 0.15, 1.2, { r: [0, 0, 0] });
  m.box('metal', [0.35, 0.35, 0.36], 0.9, 3.8, 1.3, { p: [0, 1.8, 0.35], r: [-12, 0, 0] });
}

function finish(mb, cfg, extra = {}) {
  const r = pistolRig(mb, cfg);
  return { anims: { ...r.anims, ...(extra.anims || {}) }, post: r.post, muzzle: 'muzzle', shell: 'shell', ...extra.spec, _r: r };
}

// ---------------------------------------------------------------- Glock 18
function glock(mb) {
  hold(mb, PISTOL_HOLD.p, PISTOL_HOLD.r);
  mb.node('gun', 'rig');
  const g = mb.pen('gun');
  const B = [0.22, 0.22, 0.23];
  // polymer frame (dust cover) + grip with finger grooves
  g.span('polymer', B, -0.5, 6.1, -0.35, 0.36, 0.95);
  grip(g, B, { front: 0.9, h: 4.3, rake: 1.0 });
  for (let i = 0; i < 3; i++) g.span('polymer', B, 0.0 - i * 0.3, 0.45 - i * 0.3, -1.6 - i * 0.9, -1.25 - i * 0.9, 1.18);
  triggerGuardP(g, B, 0.8, 3.3, true);
  mb.node('slide', 'gun');
  slideBody(mb.pen('slide'), [0.24, 0.24, 0.25], 6.6, 1.15, 1.0, { frontCut: 0.2, bev: 0.08 });
  magInGrip(mb, B);
  mb.marker('muzzle', 'gun', [0, 0.95, -6.9]);
  mb.marker('shell', 'gun', [0.6, 1.3, -2.4]);
  return finish(mb, { reload: 2.2, slide: 1.5, kick: 0.8 });
}

// ---------------------------------------------------------------- USP
function usp(mb) {
  hold(mb, PISTOL_HOLD.p, PISTOL_HOLD.r);
  mb.node('gun', 'rig');
  const g = mb.pen('gun');
  const B = [0.2, 0.2, 0.21];
  g.prism('polymer', B, [[-0.5, -0.35], [6.3, -0.35], [6.45, 0.0], [6.3, 0.36], [-0.5, 0.36]], 0.98, { bev: 0.1 });
  g.span('polymer', [0.12, 0.12, 0.12], 3.6, 6.2, -0.42, -0.3, 0.6); // rail groove
  grip(g, B, { front: 0.85, h: 4.4, rake: 1.0 });
  triggerGuardP(g, B, 0.8, 3.4, true);
  g.span('metal', B, -1.1, -0.75, 0.55, 1.3, 0.5); // hammer
  mb.node('slide', 'gun');
  slideBody(mb.pen('slide'), [0.23, 0.23, 0.24], 6.7, 1.22, 1.06, { frontCut: 0.32 });
  magInGrip(mb, B);
  mb.node('sil', 'gun');
  const s = mb.pen('sil');
  s.tube('metal', [0.2, 0.2, 0.21], 6.7, 7.1, 0.95, 0.42, 0.56, { n: 10 });
  s.tube('metal', [0.2, 0.2, 0.21], 7.1, 12.8, 0.95, 0.56, 0.56, { n: 10, cap0: false });
  s.tube('metal', C.bore, 12.8, 12.82, 0.95, 0.2, 0.2, { n: 6 });
  mb.marker('muzzle_sil', 'sil', [0, 0.95, -13.0]);
  mb.marker('muzzle', 'gun', [0, 0.95, -7.0]);
  mb.marker('shell', 'gun', [0.6, 1.3, -2.4]);
  const r = finish(mb, { reload: 2.7, slide: 1.5, kick: 0.9 }, { spec: { muzzleSil: 'muzzle_sil', silencer: 'sil' } });
  const hand = r._r.support; // the support hand starts and ends on the grip
  r.anims.attach_silencer = silencerAnim({ f: 9.8, y: 0.95, hand, dur: 3.1, tilt: { p: [-4, 3.5, 2], r: [6, 40, 8] } }, true);
  r.anims.detach_silencer = silencerAnim({ f: 9.8, y: 0.95, hand, dur: 3.1, tilt: { p: [-4, 3.5, 2], r: [6, 40, 8] } }, false);
  return r;
}

// ---------------------------------------------------------------- P228
function p228(mb) {
  hold(mb, PISTOL_HOLD.p, PISTOL_HOLD.r);
  mb.node('gun', 'rig');
  const g = mb.pen('gun');
  const B = C.black;
  g.span('metal', [0.25, 0.25, 0.26], -0.5, 5.9, -0.3, 0.36, 0.94);
  grip(g, [0.2, 0.2, 0.21], { front: 0.8, h: 4.2, rake: 0.9 });
  triggerGuardP(g, [0.25, 0.25, 0.26], 0.8, 3.2, false);
  g.span('metal', B, -1.1, -0.75, 0.55, 1.35, 0.45);
  g.box('metal', B, 0.12, 0.25, 0.9, { p: [-0.55, 0.05, -0.3], r: [0, 0, 0] }); // decocker
  mb.node('slide', 'gun');
  const s = mb.pen('slide');
  // SIG slide: rounded top front
  slideBody(s, [0.3, 0.3, 0.31], 6.3, 1.18, 1.0, { frontCut: 0.45, bev: 0.16 });
  magInGrip(mb, B);
  mb.marker('muzzle', 'gun', [0, 0.95, -6.6]);
  mb.marker('shell', 'gun', [0.6, 1.3, -2.4]);
  return finish(mb, { reload: 2.7, slide: 1.4, kick: 0.95 });
}

// ---------------------------------------------------------------- Desert Eagle
function deagle(mb) {
  hold(mb, [4.0, -5.3, -16.0], [3, 11, -7]);
  mb.node('gun', 'rig');
  const g = mb.pen('gun');
  const B = C.black;
  // black frame and big rounded trigger guard
  g.span('metal', [0.2, 0.2, 0.21], -0.7, 7.4, -0.35, 0.36, 1.12);
  grip(g, [0.16, 0.16, 0.17], { front: 0.95, h: 4.6, rake: 1.05, w: 1.28 });
  triggerGuardP(g, [0.2, 0.2, 0.21], 0.9, 3.8, false);
  g.span('metal', B, -1.3, -0.85, 0.6, 1.45, 0.55);
  mb.node('slide', 'gun');
  const s = mb.pen('slide');
  const S = C.silver;
  // massive slab slide + fixed barrel with the triangular top rib
  s.prism('brushed', S, [[-1.1, 0.35], [4.0, 0.35], [4.0, 1.95], [-0.9, 1.95], [-1.1, 1.7]], 1.26, { bev: 0.14 });
  for (let i = 0; i < 7; i++) for (const sx of [-1, 1]) s.span('metal', [0.35, 0.35, 0.36], -0.95 + i * 0.24, -0.85 + i * 0.24, 0.55, 1.8, 0.03, { x: sx * 0.635 });
  s.span('metal', C.bore, 1.2, 3.0, 1.35, 1.9, 0.04, { x: 0.64 });
  s.span('metal', B, -0.95, -0.5, 1.95, 2.3, 0.85);
  // barrel section (does not reciprocate in reality, but it's fine for the look)
  g.prism('brushed', S, [[4.0, 0.35], [8.6, 0.35], [8.6, 1.75], [8.3, 1.95], [4.0, 1.95]], 1.18, { bev: 0.1 });
  g.prism('brushed', [0.82, 0.83, 0.85], [[4.0, 1.95], [8.4, 1.95], [8.2, 2.25], [4.2, 2.25]], 0.55);
  g.span('metal', B, 8.0, 8.3, 2.2, 2.5, 0.2);
  g.tube('metal', C.bore, 8.6, 8.62, 1.05, 0.32, 0.32, { n: 8 });
  // compensator holes / barrel flats
  g.span('metal', [0.5, 0.5, 0.52], 4.4, 8.2, 0.7, 0.8, 1.2);
  magInGrip(mb, B);
  mb.marker('muzzle', 'gun', [0, 1.05, -8.9]);
  mb.marker('shell', 'gun', [0.7, 1.6, -2.1]);
  return finish(mb, { reload: 2.2, slide: 1.7, kick: 1.6, shootOpts: { bodyUp: 0.5, recT: 0.11 }, rh: { p: [1.05, -2.0, 2.65] }, magGripP: [-0.9, -7.4, 2.5] });
}

// ---------------------------------------------------------------- Five-seveN
function fiveseven(mb) {
  hold(mb, PISTOL_HOLD.p, PISTOL_HOLD.r);
  mb.node('gun', 'rig');
  const g = mb.pen('gun');
  const B = [0.24, 0.25, 0.24];
  g.prism('polymer', B, [[-0.5, -0.4], [6.4, -0.4], [6.9, 0.36], [-0.5, 0.36]], 0.98, { bev: 0.1 });
  grip(g, B, { front: 0.9, h: 4.5, rake: 0.8 });
  // squared trigger guard with the hooked front
  g.prism('polymer', B, [[0.8, -1.05], [3.8, -1.05], [3.9, -0.6], [3.6, 0.0], [3.3, 0.0], [3.4, -0.75], [0.8, -0.85]], 0.42);
  g.box('metal', C.dark, 0.18, 0.7, 0.24, { p: [0, -0.4, -1.7], r: [14, 0, 0] });
  mb.node('slide', 'gun');
  const s = mb.pen('slide');
  // angular slide front
  s.prism('metal', [0.26, 0.27, 0.26], [[-0.8, 0.35], [6.0, 0.35], [7.1, 0.9], [7.1, 1.15], [6.7, 1.55], [-0.6, 1.55], [-0.8, 1.3]], 1.0, { bev: 0.1 });
  for (let i = 0; i < 5; i++) for (const sx of [-1, 1]) s.span('metal', [0.14, 0.14, 0.14], -0.65 + i * 0.25, -0.55 + i * 0.25, 0.5, 1.4, 0.03, { x: sx * 0.505 });
  s.span('metal', C.black, -0.7, -0.25, 1.55, 1.85, 0.75);
  s.span('metal', C.black, 6.3, 6.55, 1.55, 1.8, 0.18);
  s.span('metal', [0.6, 0.6, 0.62], 1.6, 3.2, 1.05, 1.5, 0.04, { x: 0.5 });
  s.tube('metal', C.bore, 7.1, 7.12, 0.95, 0.22, 0.22, { n: 8 });
  magInGrip(mb, B);
  mb.marker('muzzle', 'gun', [0, 0.95, -7.3]);
  mb.marker('shell', 'gun', [0.6, 1.3, -2.4]);
  return finish(mb, { reload: 2.7, slide: 1.5, kick: 0.85 });
}

// ---------------------------------------------------------------- Dual Elites
function berettaBody(mb, gunNode, slideNode, magNode) {
  const g = mb.pen(gunNode);
  const B = C.black, S = C.silver;
  g.span('metal', [0.6, 0.61, 0.63], -0.5, 6.0, -0.35, 0.36, 0.96);
  grip(g, [0.18, 0.18, 0.19], { front: 0.85, h: 4.3, rake: 0.95 });
  triggerGuardP(g, [0.6, 0.61, 0.63], 0.8, 3.4, false);
  g.span('metal', B, -1.1, -0.75, 0.55, 1.3, 0.45);
  mb.node(slideNode, gunNode);
  const s = mb.pen(slideNode);
  // open-top Beretta slide: rear part + front with the exposed barrel
  s.prism('brushed', S, [[-0.9, 0.35], [6.8, 0.35], [6.8, 1.15], [6.5, 1.3], [5.2, 1.3], [4.6, 1.05], [1.6, 1.05], [1.4, 1.5], [-0.7, 1.5], [-0.9, 1.25]], 1.0, { bev: 0.1 });
  s.tube('brushed', [0.7, 0.71, 0.73], 1.4, 5.2, 1.05, 0.4, 0.4, { n: 8 });
  for (let i = 0; i < 5; i++) for (const sx of [-1, 1]) s.span('metal', [0.4, 0.4, 0.42], -0.75 + i * 0.24, -0.65 + i * 0.24, 0.5, 1.35, 0.03, { x: sx * 0.505 });
  s.span('metal', B, -0.7, -0.25, 1.5, 1.8, 0.7);
  s.span('metal', B, 6.3, 6.55, 1.3, 1.55, 0.18);
  s.tube('metal', C.bore, 6.8, 6.82, 0.95, 0.24, 0.24, { n: 8 });
  mb.node(magNode, gunNode, [0, -4.3, 0.45]);
  const m = mb.pen(magNode);
  m.span('metal', B, -0.6, 1.0, -0.2, 0.15, 1.2);
  m.box('metal', [0.35, 0.35, 0.36], 0.9, 3.8, 1.3, { p: [0, 1.8, 0.35], r: [-12, 0, 0] });
}

function elite(mb) {
  hold(mb, [0, 0, 0]);
  // right pistol
  mb.node('gunR', 'rig', [6.6, -7.0, -14.6], [5, 4, -6]);
  berettaBody(mb, 'gunR', 'slideR', 'magR');
  arm(mb, 'rhand', 'gunR', 'R', { p: [0.95, -1.9, 2.6], fwd: [0.05, -0.3, -1], palm: [-1, 0, -0.15], fore: [0.25, -0.6, 1], grip: 'trigger', len: 18 });
  // left pistol (mirrored placement, still a right-handed model held in the left hand)
  mb.node('gunL', 'rig', [-6.6, -7.0, -14.6], [5, -4, 6]);
  berettaBody(mb, 'gunL', 'slideL', 'magL');
  arm(mb, 'lhand', 'gunL', 'L', { p: [-0.95, -1.9, 2.6], fwd: [-0.05, -0.3, -1], palm: [1, 0, -0.15], fore: [-0.25, -0.6, 1], grip: 'trigger', len: 18 });
  mb.marker('muzzleR', 'gunR', [0, 0.95, -7.1]);
  mb.marker('muzzleL', 'gunL', [0, 0.95, -7.1]);
  mb.marker('shellR', 'gunR', [0.6, 1.3, -2.4]);
  mb.marker('shellL', 'gunL', [0.6, 1.3, -2.4]);
  // each pistol kicks on its own: wrist flip, slide cycle, a touch of chest
  const kick = (g, s, v) => ({
    [g]: [[0, Z, Z], [0.07, [0.1 * v, 0.35, 1.3], [7.5, -v * 1.6, v * 2.4], 'out'], [0.3, [0, 0.05, 0.2], [1.2, -v * 0.3, v * 0.5], 'io'], [0.55, [0, -0.03, -0.05], [-0.3, 0, 0], 'io'], [1, Z, Z, 'io']],
    [s]: [[0, Z, Z], [0.03, [0, 0, 1.4], Z, 'out'], [0.14, Z, Z, 'in2']],
    body: [[0, Z, Z], [0.08, Z, [0.3, 0.15 * v, 0], 'out'], [0.6, Z, Z, 'io']],
  });
  const lock = (s) => ({ [s]: [[0, Z, Z], [0.03, [0, 0, 1.4], Z, 'out'], [0.08, [0, 0, 1.3], Z, 'io'], [1, [0, 0, 1.3], Z]] });
  // reload: both guns cant inward and dump their mags, drop out of view to be
  // loaded, come back up one after the other and drop their slides
  const D = 4.5, S = (x) => x / D;
  const inR = { p: [-1.4, 1.8, 1.0], r: [18, 10, 34] }, inL = { p: [1.4, 1.8, 1.0], r: [18, -10, -34] };
  const dipR = { p: [2.0, -17, 5], r: [-60, 8, -30] }, dipL = { p: [-2.0, -17, 5], r: [-60, -8, 30] };
  const gR = dirIn(mb.nodes, 'gunR', [0, -1, 0], { gunR: inR.r }), gL = dirIn(mb.nodes, 'gunL', [0, -1, 0], { gunL: inL.r });
  const magFall = (g, t0, side) => [[0, Z, Z], [t0, Z, Z], [t0 + S(0.05), [0, -1.5, 0], Z, 'in2'], [t0 + S(0.42), add([0, -1.5, 0], mul(g, 26)), [30, 10 * side, -40 * side], 'in2'], [0.44, Z, Z, 'step']];
  const gunK = (inP, dip, t0, side) => [
    [0, Z, Z],
    [t0 + 0.06, inP.p, inP.r, 'back'],
    [t0 + 0.13, add(inP.p, [0, 0.3, 0]), add(inP.r, [2, 0, 3 * side]), 'io'],
    [t0 + 0.15, add(inP.p, [0, -0.4, 0.2]), add(inP.r, [-3, 0, -2 * side]), 'out2'],
    [t0 + 0.19, inP.p, inP.r, 'io'],
    [t0 + 0.32, dip.p, dip.r, 'in2'],
    [t0 + 0.42, dip.p, dip.r],
    [t0 + 0.55, [0, 0.8, 0.2], [6, 0, 10 * side], 'cr'],
    [t0 + 0.6, [0, 0.5, 0.1], [4, 0, 6 * side], 'cr'],
    [0.76 + t0 * 2, [0, 0.45, 0.1], [3.5, 0, 6 * side], 'io'],
    [0.79 + t0 * 2, [0, 0.2, 0.5], [-1.5, 0, 6 * side], 'io'],
    [0.82 + t0 * 2, [0, 0.7, -0.3], [5.5, 0, 6 * side], 'out'],
    [0.9 + t0, Z, Z, 'back'],
    [1, Z, Z],
  ];
  const anims = {
    idle: idle({ amp: 0.8 }),
    draw: { dur: 1.0, blend: 0.05, tracks: {
      gunR: [[0, [1.5, -16, 4], [-55, 6, -25]], [0.32, [0.4, -2.5, 0.8], [-12, 2, -8], 'cr'], [0.5, [0, 0.4, -0.1], [3, 0, 1], 'cr'], [0.68, Z, Z, 'io']],
      gunL: [[0, [-1.5, -16, 4], [-55, -6, 25]], [0.1, [-1.5, -16, 4], [-55, -6, 25]], [0.42, [-0.4, -2.5, 0.8], [-12, -2, 8], 'cr'], [0.6, [0, 0.4, -0.1], [3, 0, -1], 'cr'], [0.78, Z, Z, 'io']],
      body: [[0, [0, -0.5, 0.2], [-1.5, 0, 0]], [0.55, Z, [0.5, 0, 0], 'out2'], [0.9, Z, Z, 'io']],
    } },
    shoot1: { dur: 0.4, blend: 0.025, tracks: kick('gunR', 'slideR', 1) },
    shoot2: { dur: 0.4, blend: 0.025, tracks: kick('gunL', 'slideL', -1) },
    shoot_empty: { dur: 0.4, blend: 0.025, tracks: { ...kick('gunR', 'slideR', 1), ...lock('slideR') }, end: (vm) => { vm.state.slideLocked = true; } },
    reload: {
      dur: D, blend: 0.1,
      tracks: {
        gunR: gunK(inR, dipR, 0, 1),
        gunL: gunK(inL, dipL, 0.03, -1),
        magR: magFall(gR, 0.135, 1),
        magL: magFall(gL, 0.165, -1),
        // the slides are locked back while the guns are loaded, then dropped
        slideR: [[0, Z, Z], [0.2, Z, Z], [0.24, [0, 0, 1.3], Z, 'out2'], [0.79, [0, 0, 1.3], Z], [0.8, Z, Z, 'in2']],
        slideL: [[0, Z, Z], [0.23, Z, Z], [0.27, [0, 0, 1.3], Z, 'out2'], [0.85, [0, 0, 1.3], Z], [0.86, Z, Z, 'in2']],
        body: [[0, Z, Z], [0.1, [0, -0.3, 0.3], [1.2, 0, 0], 'io'], [0.35, [0, -0.6, 0.4], [-1.0, 0, 0], 'io'], [0.62, [0, -0.2, 0.2], [0.8, 0, 0], 'io'], [1, Z, Z, 'io']],
      },
      vis: { magR: [[0.135 + S(0.42), 0.44, false]], magL: [[0.165 + S(0.42), 0.44, false]] },
      end: (vm) => { vm.state.slideLocked = false; },
    },
  };
  anims.shoot_left = anims.shoot2;
  anims.shoot_right = anims.shoot1;
  return {
    anims,
    muzzle: 'muzzleR',
    shell: 'shellR',
    alternate: ['shoot1', 'shoot2'],
    markers: { shoot1: ['muzzleR', 'shellR'], shoot2: ['muzzleL', 'shellL'], shoot_left: ['muzzleL', 'shellL'], shoot_right: ['muzzleR', 'shellR'] },
    post(vm) {
      const c = vm.currentAnimation;
      if (vm.state.slideLocked && c !== 'shoot_empty' && c !== 'reload') vm.nodes.slideR.position.z += 1.4;
    },
  };
}

export const PISTOLS = { glock, usp, p228, deagle, elite, fiveseven };
