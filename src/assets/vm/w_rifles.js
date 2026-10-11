// Assault rifles: ak47, m4a1, galil, famas, sg552, aug.
// Gun frame: origin at the top of the pistol grip (bottom of the receiver),
// -Z forward along the bore, +Y up, units ~ inches.

import { C, hold, scope, rifleRig, silencerAnim } from './kit.js';
import { pistolGrip, triggerGuard, flashHider, muzzle, curvedMag, ring } from './parts.js';

// Standard rifle placement in view space (fitted to the CS 1.6 Galil shot).
export const RIFLE_HOLD = { p: [7.0, -7.4, -15.0], r: [-1, -0.5, -10], s: 1.1 };

// ---------------------------------------------------------------- AK-47
function ak47(mb) {
  hold(mb, RIFLE_HOLD.p, RIFLE_HOLD.r, RIFLE_HOLD.s);
  mb.node('gun', 'rig');
  const g = mb.pen('gun');
  // receiver + dust cover
  g.span('metal', C.black, -4.9, 5.0, 0.1, 1.62, 1.2);
  g.prism('metal', C.dark, [[-4.8, 1.6], [4.7, 1.6], [4.7, 2.02], [4.3, 2.2], [-4.3, 2.2], [-4.8, 2.0]], 1.12, { bev: 0.2 });
  g.cyl('metal', C.dark, 0.22, 0.22, 0.3, { n: 6, p: [0, 2.12, 4.95] });
  g.span('metal', C.black, -5.5, -4.8, 0.2, 1.95, 1.24);
  // stamped mag-well dimple and trunnion details (left side)
  g.span('metal', [0.15, 0.15, 0.16], 2.9, 4.6, 0.35, 0.95, 0.04, { x: -0.61 });
  for (const f of [-3.6, -2.4, 3.2, 4.4]) g.cyl('metal', C.steel, 0.1, 0.1, 0.04, { n: 5, p: [-0.61, 0.45, -f], r: [0, 90, 0] });
  // ejection port + selector lever (right side)
  g.span('metal', C.bore, 0.6, 3.7, 0.95, 1.55, 0.04, { x: 0.61 });
  g.box('metal', C.dark, 0.1, 0.34, 6.2, { p: [0.65, 1.36, 1.1], r: [-5, 0, 0] });
  g.box('metal', C.dark, 0.12, 0.5, 0.7, { p: [0.66, 1.15, -1.9], r: [-20, 0, 0] });
  // rear sight block + leaf
  g.prism('metal', C.black, [[5.0, 0.9], [7.4, 0.9], [7.4, 2.0], [6.8, 2.38], [5.0, 2.38]], 1.02, { bev: 0.12 });
  g.span('metal', C.dark, 5.3, 6.9, 2.38, 2.55, 0.62);
  // lower handguard (wood) with metal ferrule
  g.prism('wood', C.wood, [[7.4, 0.3], [13.4, 0.42], [14.2, 0.66], [14.2, 1.95], [7.4, 1.95]], 1.92, { bev: 0.34 });
  g.span('metal', C.black, 14.2, 14.6, 0.72, 1.95, 1.4);
  // upper handguard (wood) over the gas tube
  g.prism('wood', C.wood, [[7.6, 1.95], [13.4, 1.95], [13.4, 2.42], [13.0, 2.8], [8.0, 2.8], [7.6, 2.42]], 1.34, { wt: 1.0, bev: 0.18 });
  g.tube('metal', C.dark, 13.3, 14.9, 2.36, 0.36, 0.36, { n: 8 });
  // gas block
  g.prism('metal', C.black, [[14.8, 0.95], [15.6, 0.95], [15.85, 1.3], [15.85, 2.3], [15.4, 2.78], [14.8, 2.78]], 1.0, { bev: 0.1 });
  // barrel, cleaning rod, front sight, muzzle
  g.tube('metal', C.dark, 14.2, 21.6, 1.5, 0.34, 0.32, { n: 8 });
  g.tube('metal', C.grey, 15.6, 20.6, 0.95, 0.11, 0.11, { n: 5 });
  g.span('metal', C.black, 19.6, 20.7, 1.08, 2.15, 0.82);
  g.span('metal', C.black, 19.9, 20.5, 0.72, 1.1, 0.5);
  for (const x of [-0.33, 0.33]) g.span('metal', C.black, 19.85, 20.45, 2.1, 3.15, 0.12, { x });
  g.span('metal', C.black, 20.05, 20.25, 2.1, 2.92, 0.1);
  muzzle(g, 21.6, 1.15, 1.5, 0.43);
  triggerGuard(g, -0.4, 2.75, 0.1);
  pistolGrip(g, 'wood', C.woodDark);
  // stock
  g.prism('wood', C.wood, [[-5.4, 1.9], [-15.4, -0.35], [-15.6, -0.55], [-15.6, -4.5], [-15.35, -4.72], [-11.6, -3.05], [-7.2, -1.0], [-5.4, 0.3]], 1.36, { bev: 0.28 });
  g.span('metal', C.black, -15.9, -15.58, -4.72, -0.42, 1.42);

  // charging handle (reciprocates)
  mb.node('bolt', 'gun');
  const b = mb.pen('bolt');
  b.box('metal', C.dark, 0.62, 0.22, 0.34, { p: [0.9, 1.4, -4.1] });
  b.cyl('metal', C.dark, 0.24, 0.22, 0.42, { n: 6, p: [1.14, 1.4, -4.1], r: [0, -90, 0] });
  b.span('metal', C.steel, 0.7, 3.6, 1.05, 1.45, 0.04, { x: 0.58 });

  // magazine (pivot at the well)
  mb.node('mag', 'gun', [0, 0.12, -3.85]);
  const m = mb.pen('mag');
  m.prism('metal', [0.3, 0.27, 0.24], [
    [-1.1, 0.5], [1.15, 0.5], [1.18, -0.2], [1.55, -2.0], [2.35, -4.1], [3.35, -6.0], [4.45, -7.65],
    [2.3, -8.65], [1.35, -6.8], [0.35, -4.7], [-0.42, -2.4], [-0.95, -0.25],
  ], 1.0, { bev: 0.14 });
  m.prism('metal', [0.36, 0.33, 0.3], [[-1.05, -0.2], [-0.62, -0.2], [-0.62, -0.75], [-1.0, -0.65]], 1.06);
  // side ribs
  m.prism('metal', [0.27, 0.24, 0.22], [[0.0, -1.0], [0.9, -1.0], [1.9, -4.6], [3.2, -7.3], [2.6, -7.6], [1.2, -4.8], [0.2, -1.6]], 1.08);

  mb.marker('muzzle', 'gun', [0, 1.5, -23.2]);
  mb.marker('shell', 'gun', [0.7, 1.3, -2.2]);

  const { anims } = rifleRig(mb, {
    kick: 1.35, shootOpts: { bodyUp: 0.5 },
    lh: { at: [0, 0.3, 10.4] },
    charge: { at: [1.1, 1.4, 4.1], side: 'over', pull: 3.0 },
    mag: { at: [-0.6, -2.7, 5.0], rockOut: 16, rockIn: 18, pivot: [0, 0.4, -1.1] },
    bolt: 3.3,
    reload: 2.45,
  });
  return { anims, muzzle: 'muzzle', shell: 'shell' };
}

// ---------------------------------------------------------------- M4A1
function m4a1(mb) {
  hold(mb, [8.1, -7.4, -14.6], [1.8, 2.3, -5]);
  mb.node('gun', 'rig');
  const g = mb.pen('gun');
  const B = C.black, D = C.dark;
  // lower receiver + flared mag well
  g.prism('metal', D, [[-3.4, 0.95], [4.9, 0.95], [4.9, -0.2], [5.1, -1.55], [2.2, -1.55], [2.2, -0.25], [-0.2, -0.25], [-2.5, 0.2], [-3.4, 0.2]], 1.08, { bev: 0.12 });
  // upper receiver
  g.prism('metal', D, [[-3.4, 0.95], [5.4, 0.95], [5.4, 2.05], [-3.2, 2.05], [-3.4, 1.9]], 1.0, { bev: 0.14 });
  g.span('metal', C.bore, 0.6, 3.2, 1.15, 1.7, 0.04, { x: 0.5 });
  g.cyl('metal', D, 0.28, 0.24, 0.5, { n: 6, p: [0.62, 1.75, 1.8], r: [0, -40, 0] }); // forward assist
  g.box('metal', D, 0.12, 0.5, 0.9, { p: [-0.58, 0.5, -2.6] }); // bolt catch
  g.box('metal', D, 0.1, 0.3, 0.45, { p: [-0.57, 0.6, 0.6], r: [-30, 0, 0] }); // selector
  // carry handle with the rear sight tower
  g.span('metal', B, -2.0, 3.4, 2.72, 3.12, 0.62);
  g.span('metal', B, 2.6, 3.6, 2.05, 2.8, 0.62);
  g.span('metal', B, -2.9, -1.2, 2.05, 2.85, 0.62);
  g.prism('metal', B, [[-2.9, 2.8], [-1.6, 2.8], [-1.75, 3.62], [-2.85, 3.62]], 0.66);
  g.span('metal', C.bore, -2.5, -2.1, 3.25, 3.45, 0.7);
  // handguard (round, ribbed) + delta ring
  g.tube('metal', D, 5.3, 5.85, 1.45, 1.25, 1.25, { n: 10 });
  g.tube('ribbed', [0.32, 0.32, 0.33], 5.85, 12.2, 1.45, 1.1, 1.0, { n: 10 });
  g.tube('metal', D, 12.2, 12.5, 1.45, 1.02, 1.02, { n: 10 });
  // front sight base (triangle) + post + protective ears
  g.prism('metal', B, [[12.5, 0.85], [13.4, 0.85], [13.4, 1.95], [13.15, 3.3], [12.8, 3.3], [12.5, 1.95]], 0.58, { bev: 0.06 });
  g.span('metal', B, 12.75, 13.15, 3.3, 3.75, 0.16);
  for (const x of [-0.24, 0.24]) g.span('metal', B, 12.7, 13.2, 3.25, 3.85, 0.08, { x });
  g.tube('metal', D, 12.5, 18.2, 1.45, 0.3, 0.28, { n: 8 });
  flashHider(g, 18.2, 1.9, 1.45, 0.4);
  triggerGuard(g, -0.25, 2.2, -0.2, 1.0);
  pistolGrip(g, 'polymer', B);
  // buffer tube + collapsible stock
  g.tube('metal', D, -3.4, -11.8, 1.35, 0.6, 0.6, { n: 8 });
  g.prism('polymer', B, [[-8.1, 2.15], [-12.7, 2.15], [-12.9, 1.9], [-12.9, -2.6], [-12.4, -2.9], [-10.8, -0.7], [-8.6, 0.55], [-8.1, 0.65]], 1.3, { bev: 0.2 });
  g.span('polymer', C.black, -13.2, -12.85, -2.9, 2.1, 1.38);

  // charging handle (T at the rear top)
  mb.node('bolt', 'gun');
  mb.pen('bolt').span('metal', B, -3.95, -3.35, 1.75, 2.05, 0.95);

  // magazine
  mb.node('mag', 'gun', [0, -0.6, -3.65]);
  mb.pen('mag').prism('metal', [0.42, 0.42, 0.43], curvedMag(5.7, 2.1, 2.2, 0.9, 1.1), 0.88, { bev: 0.12 });
  mb.pen('mag').span('metal', [0.3, 0.3, 0.31], -1.15, 1.95, -6.0, -5.55, 1.0);

  // silencer
  mb.node('sil', 'gun');
  const s = mb.pen('sil');
  s.tube('metal', [0.22, 0.22, 0.23], 18.0, 18.6, 1.45, 0.55, 0.62, { n: 10 });
  s.tube('metal', [0.22, 0.22, 0.23], 18.6, 25.8, 1.45, 0.62, 0.62, { n: 10, cap0: false });
  s.tube('metal', C.bore, 25.8, 25.82, 1.45, 0.22, 0.22, { n: 6 });
  mb.marker('muzzle_sil', 'sil', [0, 1.45, -26.0]);

  mb.marker('muzzle', 'gun', [0, 1.45, -20.3]);
  mb.marker('shell', 'gun', [0.6, 1.45, -1.9]);

  const r = rifleRig(mb, {
    kick: 0.9,
    lh: { at: [0, 0.35, 9.4] },
    charge: { at: [-0.58, 0.5, 2.6], side: 'catch' },
    mag: { at: [-0.5, -2.6, 4.2], style: 'drop', slap: true },
    bolt: 0,
    reload: 3.05,
    draw: 1.1,
  });
  r.anims.attach_silencer = silencerAnim({ f: 21.9, y: 1.45, hand: r.LHP, dur: 2.0 }, true);
  r.anims.detach_silencer = silencerAnim({ f: 21.9, y: 1.45, hand: r.LHP, dur: 2.0 }, false);
  return { anims: r.anims, muzzle: 'muzzle', muzzleSil: 'muzzle_sil', shell: 'shell', silencer: 'sil' };
}

// ---------------------------------------------------------------- Galil
function galil(mb) {
  hold(mb, [5.39, -7.78, -14.96], [-4.34, -4.69, -15], 1.24);
  mb.node('gun', 'rig');
  const g = mb.pen('gun');
  const O = C.olive, OD = [0.25, 0.28, 0.21];
  // receiver (long, tall) + top cover
  g.prism('metal', O, [[-5.6, 0.0], [6.6, 0.0], [6.6, 2.35], [-5.4, 2.35], [-5.6, 2.1]], 1.32, { bev: 0.16 });
  g.prism('metal', OD, [[-5.4, 2.3], [6.3, 2.3], [6.3, 2.62], [5.8, 2.8], [-5.0, 2.8], [-5.4, 2.6]], 1.18, { bev: 0.2 });
  // left-side details: selector, stamped panel, rivets
  g.box('metal', OD, 0.12, 0.4, 3.4, { p: [-0.7, 1.35, 1.4], r: [-4, 0, 0] });
  g.span('metal', [0.2, 0.22, 0.17], 1.0, 5.6, 0.45, 1.85, 0.04, { x: -0.68 });
  for (const f of [-4.5, -3.2, 5.6]) g.cyl('metal', C.steel, 0.1, 0.1, 0.04, { n: 5, p: [-0.68, 0.5, -f], r: [0, 90, 0] });
  // rear sight: block with two ears (at the back of the top cover)
  g.prism('metal', O, [[-5.5, 2.6], [-3.6, 2.6], [-3.8, 3.3], [-5.3, 3.3]], 1.5, { bev: 0.12 });
  for (const x of [-0.5, 0.5]) g.prism('metal', O, [[-5.0, 3.25], [-4.1, 3.25], [-4.3, 3.95], [-4.85, 3.95]], 0.26, { p: [x, 0, 0] });
  // wood handguard + metal top / gas cover
  g.prism('wood', [1.08, 1.08, 1.0], [[6.6, 0.15], [12.4, 0.35], [12.6, 0.7], [12.6, 2.3], [6.6, 2.3]], 1.85, { bev: 0.3 });
  for (const f of [8.4, 10.6]) g.span('metal', C.bore, f, f + 0.9, 0.9, 1.6, 0.04, { x: -0.93 });
  g.prism('metal', OD, [[6.6, 2.25], [12.6, 2.25], [12.6, 2.75], [6.9, 2.75]], 1.25, { bev: 0.14 });
  // gas block / front sight with tall post and protective ring
  g.prism('metal', O, [[12.6, 0.6], [13.8, 0.6], [14.0, 1.0], [14.0, 2.9], [12.6, 2.9]], 1.2, { bev: 0.12 });
  g.span('metal', O, 13.0, 13.6, 2.9, 4.5, 0.2);
  ring(g, 13.3, 4.7, 0.42, 0.12, O, 8);
  // folded bipod legs under the handguard
  for (const x of [-0.45, 0.45]) g.tube('metal', OD, 7.0, 13.4, 0.0, 0.16, 0.16, { n: 5, x });
  // barrel + flash hider
  g.tube('metal', C.dark, 14.0, 19.6, 1.5, 0.34, 0.32, { n: 8 });
  flashHider(g, 19.6, 1.6, 1.5, 0.44, OD);
  triggerGuard(g, -0.3, 2.9, 0.05, 1.1, O);
  pistolGrip(g, 'polymer', C.black);
  // folded stock along the right side
  g.span('metal', OD, -5.8, 4.0, 0.6, 1.0, 0.3, { x: 0.85 });
  g.span('metal', OD, -5.8, 4.0, 1.8, 2.15, 0.3, { x: 0.85 });
  g.span('metal', OD, 3.6, 4.4, 0.6, 2.15, 0.34, { x: 0.85 });

  // charging handle: right side, bent upwards
  mb.node('bolt', 'gun');
  const b = mb.pen('bolt');
  b.span('metal', OD, 5.6, 6.2, 1.85, 2.15, 0.7, { x: 0.95 });
  b.span('metal', OD, 5.6, 6.2, 2.0, 3.25, 0.3, { x: 1.2 });

  mb.node('mag', 'gun', [0, 0.05, -4.4]);
  mb.pen('mag').prism('ribbedH', [0.3, 0.31, 0.26], curvedMag(8.6, 2.2, 2.3, 2.4, 0.5), 1.05, { bev: 0.14 });

  mb.marker('muzzle', 'gun', [0, 1.5, -21.3]);
  mb.marker('shell', 'gun', [0.7, 1.6, -2.6]);

  const { anims } = rifleRig(mb, {
    kick: 1.1,
    lh: { at: [0, 0.2, 8.4], fore: [0.1, -0.75, 0.65] },
    mag: { at: [-0.6, -2.7, 5.4], rockOut: 14, rockIn: 16, pivot: [0, 0.4, -1.1] },
    charge: { at: [1.2, 2.1, 5.9], side: 'over', pull: 3.2 },
    bolt: 3.4,
    reload: 2.45,
  });
  return { anims, muzzle: 'muzzle', shell: 'shell' };
}

// ---------------------------------------------------------------- FAMAS
function famas(mb) {
  hold(mb, [8.0, -7.4, -16.0], [2.0, 3.5, -5]);
  mb.node('gun', 'rig');
  const g = mb.pen('gun');
  const D = [0.3, 0.3, 0.31], B = C.black;
  // main body (bullpup): stock behind the grip, receiver forward
  g.prism('polymer', D, [
    [-12.5, -3.2], [-12.5, 2.1], [-11.6, 2.4], [8.6, 2.4], [9.4, 1.9], [9.4, 0.5], [4.2, 0.15], [3.2, -0.3],
    [-0.6, -0.3], [-1.2, 0.2], [-4.2, 0.2], [-6.0, -0.8], [-9.0, -2.0], [-12.0, -3.4],
  ], 1.6, { bev: 0.28 });
  g.span('polymer', B, -12.8, -12.45, -3.4, 2.2, 1.65);
  // full-length carry handle
  g.span('polymer', B, -6.6, 6.6, 3.55, 4.5, 0.95, { bev: 0.1 });
  g.prism('polymer', B, [[-8.6, 2.35], [-7.0, 2.35], [-6.0, 3.6], [-6.9, 4.5], [-8.4, 3.3]], 0.95, { bev: 0.14 });
  g.prism('polymer', B, [[6.4, 3.6], [7.4, 2.35], [8.6, 2.35], [8.4, 3.0], [7.2, 4.5]], 0.95, { bev: 0.14 });
  g.span('polymer', [0.12, 0.12, 0.12], -6.2, 6.4, 3.45, 3.6, 0.7);
  // sights on the handle
  g.span('polymer', B, 6.0, 6.6, 4.5, 5.2, 0.32);
  g.span('polymer', B, -6.6, -5.8, 4.5, 5.0, 0.5);
  // ejection port windows on both sides (ambidextrous)
  for (const x of [-0.81, 0.81]) g.span('metal', C.bore, -7.0, -4.6, 0.6, 1.5, 0.04, { x });
  // folded bipod legs along the sides
  for (const x of [-0.95, 0.95]) {
    g.tube('metal', C.dark, 3.0, 11.6, 1.3, 0.14, 0.14, { n: 5, x });
    g.span('metal', C.dark, 2.8, 3.4, 1.0, 1.7, 0.2, { x });
  }
  // barrel + grenade-launcher muzzle
  g.tube('metal', C.dark, 9.4, 13.4, 1.25, 0.34, 0.32, { n: 8 });
  muzzle(g, 13.4, 1.6, 1.25, 0.55, B, 10);
  // grip with full-length trigger guard
  pistolGrip(g, 'polymer', B);
  g.prism('polymer', B, [[3.0, -0.3], [3.6, -0.3], [1.0, -4.2], [-0.8, -4.2], [-0.8, -3.85], [0.6, -3.85]], 0.42);
  g.box('metal', C.dark, 0.18, 0.72, 0.22, { p: [0, -0.7, -1.1], r: [12, 0, 0] });

  // charging handle (inside the carry handle)
  mb.node('bolt', 'gun');
  mb.pen('bolt').span('polymer', [0.15, 0.15, 0.15], 4.6, 5.2, 2.5, 3.45, 0.3);

  // magazine behind the grip
  mb.node('mag', 'gun', [0, -0.2, 3.0]);
  mb.pen('mag').prism('metal', [0.3, 0.3, 0.31], curvedMag(4.6, 1.95, 2.0, 0.5, 0.6), 0.86, { bev: 0.1 });

  mb.marker('muzzle', 'gun', [0, 1.25, -15.2]);
  mb.marker('shell', 'gun', [0.9, 1.0, 5.8]);

  const { anims } = rifleRig(mb, {
    kick: 0.95,
    lh: { at: [0, 0.6, 7.6] },
    mag: { at: [-0.5, -2.2, -3.0], style: 'drop', slap: true },
    charge: { at: [0, 3.0, 4.9], side: 'hook', pull: 2.6 },
    bolt: 2.4,
    reload: 3.3,
    tilt: { p: [-5, 4.5, 1], r: [12, 18, -30] },
  });
  return { anims, muzzle: 'muzzle', shell: 'shell' };
}

// ---------------------------------------------------------------- SG 552
function sg552(mb) {
  hold(mb, [8.1, -7.6, -14.6], [1.8, 2.3, -5]);
  mb.node('gun', 'rig');
  const g = mb.pen('gun');
  const D = [0.24, 0.24, 0.25], B = C.black;
  // receiver
  g.prism('metal', D, [[-4.3, 0.1], [5.6, 0.1], [5.6, 2.15], [-4.0, 2.15], [-4.3, 1.8]], 1.15, { bev: 0.16 });
  g.span('metal', B, -3.6, 5.2, 2.15, 2.4, 0.8);
  g.span('metal', C.bore, 0.4, 3.0, 1.05, 1.6, 0.04, { x: 0.58 });
  // polymer handguard with vent slots
  g.prism('polymer', B, [[5.6, 0.25], [11.2, 0.45], [11.6, 0.8], [11.6, 2.25], [5.6, 2.25]], 1.75, { bev: 0.3 });
  for (const f of [7.0, 8.4, 9.8]) g.span('metal', C.bore, f, f + 0.7, 0.9, 1.7, 0.04, { x: -0.88 });
  // gas tube + front sight hood
  g.tube('metal', D, 11.6, 13.0, 2.0, 0.34, 0.34, { n: 6 });
  g.prism('metal', B, [[12.6, 1.0], [13.6, 1.0], [13.6, 2.6], [12.6, 2.6]], 0.75);
  ring(g, 13.1, 3.0, 0.42, 0.1, B, 6);
  g.tube('metal', C.dark, 11.6, 16.5, 1.4, 0.33, 0.3, { n: 8 });
  flashHider(g, 16.5, 1.4, 1.4, 0.42);
  triggerGuard(g, -0.3, 2.4, 0.1, 1.15);
  pistolGrip(g, 'polymer', B);
  // skeleton stock
  g.span('metal', D, -12.5, -4.3, 1.3, 1.75, 0.8);
  g.prism('polymer', B, [[-12.5, 2.1], [-13.2, 2.1], [-13.2, -2.8], [-12.5, -2.8], [-9.0, -0.2], [-9.0, 0.4], [-12.5, -1.5]], 0.9);
  // scope (the 552 in CS has a short scope)
  scope(g, -2.6, 4.6, 3.55, { r: 0.55, rb: 0.75, rf: 0.85, base: 2.3 });
  // cocking handle (right side)
  mb.node('bolt', 'gun');
  mb.pen('bolt').span('metal', B, 3.2, 3.8, 1.25, 1.65, 1.0, { x: 0.9 });
  mb.pen('bolt').cyl('metal', B, 0.26, 0.26, 0.4, { n: 6, p: [1.35, 1.45, -3.5], r: [0, -90, 0] });
  // amber (translucent-looking) mag
  mb.node('mag', 'gun', [0, 0.1, -3.6]);
  mb.pen('mag').prism('polymer', [0.55, 0.36, 0.16], curvedMag(6.6, 2.1, 2.2, 1.9, 0.5), 0.95, { bev: 0.12 });
  mb.marker('muzzle', 'gun', [0, 1.4, -18.1]);
  mb.marker('shell', 'gun', [0.6, 1.3, -1.7]);
  const { anims } = rifleRig(mb, {
    lh: { at: [0, 0.35, 9.0] },
    mag: { at: [-0.6, -2.7, 4.6] },
    charge: { at: [1.3, 1.45, 3.5], side: 'over', pull: 2.6 },
    bolt: 2.6,
    reload: 3.0,
  });
  return { anims, muzzle: 'muzzle', shell: 'shell' };
}

// ---------------------------------------------------------------- AUG
function aug(mb) {
  hold(mb, [8.2, -7.6, -16.0], [2.0, 3.5, -5]);
  mb.node('gun', 'rig');
  const g = mb.pen('gun');
  const G = C.green, B = C.black;
  // stock / body (olive polymer bullpup)
  g.prism('polymer', G, [
    [-12.0, -3.0], [-12.0, 1.6], [-10.8, 2.0], [3.4, 2.0], [4.6, 1.6], [4.6, 0.4], [3.6, -0.1],
    [-1.0, -0.1], [-3.6, 0.0], [-6.5, -0.6], [-9.5, -2.0], [-11.5, -3.2],
  ], 1.9, { bev: 0.4 });
  g.span('polymer', [0.2, 0.22, 0.17], -12.3, -11.95, -3.2, 1.7, 1.8);
  // large trigger guard enclosing the grip
  g.prism('polymer', G, [[4.2, 0.0], [4.6, -0.6], [3.4, -4.4], [-1.6, -4.4], [-1.6, -3.9], [2.9, -3.9], [3.7, -0.4]], 0.5);
  pistolGrip(g, 'polymer', G);
  g.box('metal', C.dark, 0.18, 0.72, 0.22, { p: [0, -0.5, -1.2], r: [12, 0, 0] });
  // barrel housing + barrel, folded foregrip
  g.tube('metal', C.dark, 4.6, 8.0, 1.1, 0.62, 0.56, { n: 8 });
  g.tube('metal', C.dark, 8.0, 15.8, 1.1, 0.36, 0.32, { n: 8 });
  flashHider(g, 15.8, 1.5, 1.1, 0.45);
  g.prism('polymer', G, [[6.2, 0.6], [7.6, 0.6], [7.4, -3.2], [6.3, -3.2]], 0.9, { bev: 0.15 });
  // integrated scope / carry handle
  g.prism('polymer', G, [[-4.6, 1.95], [-3.4, 1.95], [-2.6, 2.9], [2.4, 2.9], [3.2, 1.95], [4.2, 1.95], [3.6, 3.4], [-4.0, 3.4]], 1.0, { bev: 0.2 });
  scope(g, -4.4, 4.4, 3.95, { r: 0.6, rb: 0.72, rf: 0.8, tint: G, mount: false, n: 10 });
  g.span('metal', C.bore, -4.0, -2.4, 0.4, 1.4, 0.04, { x: 0.96 });
  // charging handle (left side, slides along)
  mb.node('bolt', 'gun');
  mb.pen('bolt').span('metal', B, 2.4, 3.0, 1.3, 1.7, 0.8, { x: -1.15 });
  // translucent mag behind the grip
  mb.node('mag', 'gun', [0, 0.0, 2.9]);
  mb.pen('mag').prism('polymer', [0.45, 0.48, 0.42], curvedMag(5.6, 1.9, 2.0, 1.2, 0.6), 0.9, { bev: 0.12 });
  mb.marker('muzzle', 'gun', [0, 1.1, -17.5]);
  mb.marker('shell', 'gun', [1.0, 0.9, 3.2]);
  const { anims } = rifleRig(mb, {
    kick: 0.95,
    lh: { at: [0, -0.4, 6.8], fwd: [0.2, -0.25, -0.95], palm: [1, 0, 0.1], grip: 'grip', p: [-1.45, -1.4, -4.2] },
    mag: { at: [-0.5, -2.2, -2.8] },
    charge: { at: [-1.2, 1.5, 2.7], side: 'L', pull: 2.5 },
    bolt: 0,
    reload: 3.3,
    tilt: { p: [-5, 4.5, 1], r: [12, 18, -30] },
  });
  return { anims, muzzle: 'muzzle', shell: 'shell' };
}

export const RIFLES = { ak47, m4a1, galil, famas, sg552, aug };
