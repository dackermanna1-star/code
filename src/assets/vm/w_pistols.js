// Pistols: glock, usp, p228, deagle, elite, fiveseven.
// Gun frame: origin at the top of the grip under the rear of the slide,
// -Z forward, bore at y ~0.95.
import { C, hold, pistolRig, silencerAnim, idle } from './kit.js';
import { arm } from './hands.js';
import { Z } from './anim.js';

const PISTOL_HOLD = { p: [6.1, -6.9, -13.4], r: [5, 0, -4] };

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
  return finish(mb, { reload: 2.2, slide: 1.5 });
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
  const r = finish(mb, { reload: 2.7, slide: 1.5 }, { spec: { muzzleSil: 'muzzle_sil', silencer: 'sil' } });
  const hand = r._r.away;
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
  return finish(mb, { reload: 2.7, slide: 1.4 });
}

// ---------------------------------------------------------------- Desert Eagle
function deagle(mb) {
  hold(mb, [6.5, -7.3, -14.8], [5, 2, -4]);
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
  return finish(mb, { reload: 2.2, slide: 1.7, kick: 1.5, rh: { p: [1.05, -2.0, 2.65] }, magGripP: [-0.9, -7.4, 2.5] });
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
  return finish(mb, { reload: 2.7, slide: 1.5 });
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
  const kick = (g, s, v) => ({
    [g]: [[0, Z, Z], [0.1, [0, 0.3, 1.3], [7, -v * 1.5, v * 2], 'out'], [0.5, Z, [0.4, 0, 0], 'io'], [1, Z, Z, 'io']],
    [s]: [[0, Z, Z], [0.05, [0, 0, 1.4], Z, 'out'], [0.16, Z, Z, 'in2']],
  });
  const lock = (s) => ({ [s]: [[0, Z, Z], [0.05, [0, 0, 1.4], Z, 'out'], [1, [0, 0, 1.4], Z]] });
  const dip = { p: [0, -16, 4], r: [-50, 0, 0] };
  const anims = {
    idle: idle({ amp: 0.8 }),
    draw: { dur: 1.0, tracks: {
      gunR: [[0, dip.p, [-50, 0, -20]], [0.45, [0, 0.3, 0], [3, 0, 0], 'out2'], [0.65, Z, Z, 'io']],
      gunL: [[0, dip.p, [-50, 0, 20]], [0.1, dip.p, [-50, 0, 20]], [0.55, [0, 0.3, 0], [3, 0, 0], 'out2'], [0.75, Z, Z, 'io']],
    } },
    shoot1: { dur: 0.4, tracks: kick('gunR', 'slideR', 1) },
    shoot2: { dur: 0.4, tracks: kick('gunL', 'slideL', -1) },
    shoot_empty: { dur: 0.4, tracks: { ...kick('gunR', 'slideR', 1), ...lock('slideR') } },
    // both pistols drop, mags fall, come back loaded
    reload: { dur: 4.5, tracks: {
      gunR: [[0, Z, Z], [0.08, [-1, 1.5, 1], [10, 6, 30], 'io'], [0.16, [-1, 1.5, 1], [10, 6, 30]], [0.3, dip.p, [-40, 0, 20], 'in2'], [0.62, dip.p, [-40, 0, 20]], [0.78, [0, 0.4, 0], [4, 0, 0], 'out2'], [0.86, Z, Z, 'io']],
      gunL: [[0, Z, Z], [0.12, [1, 1.5, 1], [10, -6, -30], 'io'], [0.2, [1, 1.5, 1], [10, -6, -30]], [0.34, dip.p, [-40, 0, -20], 'in2'], [0.66, dip.p, [-40, 0, -20]], [0.84, [0, 0.4, 0], [4, 0, 0], 'out2'], [0.92, Z, Z, 'io']],
      magR: [[0, Z, Z], [0.13, Z, Z], [0.2, [0, -14, 0], Z, 'in2'], [0.3, [0, -14, 0], Z], [0.31, Z, Z]],
      magL: [[0, Z, Z], [0.17, Z, Z], [0.24, [0, -14, 0], Z, 'in2'], [0.34, [0, -14, 0], Z], [0.35, Z, Z]],
    }, end: (vm) => { vm.state.slideLocked = false; } },
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
