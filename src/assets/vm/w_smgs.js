// Sub-machine guns: mp5, ump45, p90, mac10, tmp.
import { C, hold, rifleRig } from './kit.js';
import { pistolGrip, triggerGuard, muzzle, curvedMag, ring } from './parts.js';
import { handPose } from './hands.js';

const SMG_HOLD = { p: [7.0, -7.2, -14.4], r: [-1, -0.5, -10], s: 1.1 };

// Magazine housed in the pistol grip: the left hand pulls it from below.
const GRIP_MAG = {
  pose: handPose([-1.0, -9.25, 2.5], [0.35, 0.1, -0.93], [0.1, 1, 0.2]),
  style: 'drop',
  slap: true,
  out: { p: [0, -1.8, 0], r: [0, 0, 0] },
  ins: { p: [0, -4.2, 0.3], r: [-6, 0, 4] },
  away: handPose([-7, -22, 4], [0.3, 0.4, -0.85], [0.2, 1, 0.2]),
};

// ---------------------------------------------------------------- MP5
function mp5(mb) {
  hold(mb, SMG_HOLD.p, SMG_HOLD.r, SMG_HOLD.s);
  mb.node('gun', 'rig');
  const g = mb.pen('gun');
  const B = C.black, D = C.dark;
  // stamped receiver with a rounded top
  g.prism('metal', D, [[-4.2, 0.3], [5.4, 0.3], [5.4, 1.75], [5.0, 2.2], [-3.9, 2.2], [-4.2, 1.9]], 1.15, { bev: 0.3 });
  g.span('metal', [0.17, 0.17, 0.18], -3.6, 4.6, 1.05, 1.25, 1.2); // side rib
  g.span('metal', C.bore, 0.6, 2.6, 1.3, 1.85, 0.04, { x: 0.58 });
  // cocking tube with the front sight ring
  g.tube('metal', D, 3.0, 11.3, 2.2, 0.48, 0.48, { n: 8 });
  g.span('metal', D, 10.2, 11.0, 2.2, 3.0, 0.5);
  ring(g, 10.6, 3.15, 0.42, 0.12, D, 8);
  g.span('metal', D, 10.5, 10.7, 2.6, 3.2, 0.1);
  // rear drum sight
  g.cyl('metal', D, 0.5, 0.5, 1.0, { n: 8, p: [-0.5, 2.55, 3.0], r: [0, -90, 0] });
  // wide "tropical" handguard
  g.prism('polymer', B, [[5.4, -0.2], [10.3, 0.1], [10.7, 0.6], [10.7, 1.8], [5.4, 1.8]], 1.75, { bev: 0.32 });
  for (const f of [6.4, 7.6, 8.8]) g.span('polymer', [0.12, 0.12, 0.12], f, f + 0.55, 0.1, 1.3, 1.78);
  // barrel with locking lugs
  g.tube('metal', D, 10.7, 13.2, 1.05, 0.3, 0.3, { n: 8 });
  for (let i = 0; i < 3; i++) g.span('metal', D, 12.5, 12.85, 1.0, 1.55, 0.14, { r: [0, 0, i * 120] });
  muzzle(g, 13.2, 0.3, 1.05, 0.36, D);
  // polymer trigger group + grip
  g.prism('polymer', B, [[-2.2, 0.35], [2.2, 0.35], [2.2, -0.15], [-2.0, -0.15]], 1.05);
  triggerGuard(g, -0.2, 2.1, -0.1, 1.05);
  pistolGrip(g, 'polymer', B);
  // mag well
  g.span('metal', D, 2.0, 3.8, -0.9, 0.35, 1.05);
  // retractable stock (rails + butt)
  for (const x of [-0.5, 0.5]) g.tube('metal', D, -4.2, -11.6, 1.45, 0.16, 0.16, { n: 5, x });
  g.prism('polymer', B, [[-11.4, 2.3], [-12.2, 2.3], [-12.2, -2.4], [-11.4, -2.4], [-11.1, 0.0]], 1.4, { bev: 0.15 });

  // cocking handle (left side, front of the tube)
  mb.node('bolt', 'gun');
  const b = mb.pen('bolt');
  b.span('metal', D, 9.1, 9.5, 2.0, 2.3, 0.9, { x: -0.6 });
  b.cyl('metal', D, 0.22, 0.2, 0.35, { n: 6, p: [-1.0, 2.15, -9.3], r: [0, 90, 0] });

  mb.node('mag', 'gun', [0, -0.6, -2.85]);
  mb.pen('mag').prism('metal', [0.27, 0.27, 0.28], curvedMag(7.2, 1.6, 1.7, 2.0, 0.8), 0.86, { bev: 0.1 });

  mb.marker('muzzle', 'gun', [0, 1.05, -13.6]);
  mb.marker('shell', 'gun', [0.6, 1.6, -1.6]);
  const { anims } = rifleRig(mb, {
    kick: 0.75,
    lh: { at: [0, -0.2, 8.4] },
    mag: { at: [-0.5, -2.4, 3.8] },
    charge: { at: [-1.0, 2.15, 9.3], side: 'hk', pull: 2.4 },
    bolt: 0,
    reload: 2.63,
  });
  return { anims, muzzle: 'muzzle', shell: 'shell' };
}

// ---------------------------------------------------------------- UMP45
function ump45(mb) {
  hold(mb, SMG_HOLD.p, SMG_HOLD.r, SMG_HOLD.s);
  mb.node('gun', 'rig');
  const g = mb.pen('gun');
  const B = [0.22, 0.22, 0.23];
  // boxy polymer receiver
  g.prism('polymer', B, [[-4.4, -0.1], [9.0, 0.4], [9.4, 0.9], [9.4, 2.2], [8.8, 2.4], [-4.0, 2.4], [-4.4, 2.0]], 1.32, { bev: 0.22 });
  g.span('metal', C.bore, 0.3, 2.6, 1.3, 1.9, 0.04, { x: 0.67 });
  // top rail with sights
  g.span('metal', C.black, -3.4, 6.6, 2.4, 2.65, 0.75);
  for (let f = -3; f < 6.5; f += 0.8) g.span('metal', C.black, f, f + 0.35, 2.65, 2.78, 0.75);
  g.prism('metal', C.black, [[-3.4, 2.6], [-2.2, 2.6], [-2.4, 3.5], [-3.2, 3.5]], 0.9);
  g.prism('metal', C.black, [[7.4, 2.4], [8.6, 2.4], [8.4, 3.4], [7.6, 3.4]], 0.9);
  // side rails at the front
  for (const x of [-0.75, 0.75]) g.span('metal', C.black, 5.6, 8.8, 0.8, 1.2, 0.25, { x });
  // barrel / muzzle
  g.tube('metal', C.dark, 9.4, 11.2, 1.2, 0.38, 0.38, { n: 8 });
  muzzle(g, 11.2, 0.6, 1.2, 0.45, C.black);
  // integrated trigger guard + grip
  g.prism('polymer', B, [[-0.4, -0.05], [2.6, -0.05], [2.6, -1.3], [-0.2, -1.3], [-0.2, -1.05], [2.3, -1.05], [2.3, -0.3], [-0.4, -0.3]], 0.5);
  g.box('metal', C.dark, 0.18, 0.72, 0.22, { p: [0, -0.5, -1.1], r: [12, 0, 0] });
  pistolGrip(g, 'polymer', B);
  g.span('polymer', B, 2.6, 4.9, -1.1, 0.1, 1.2);
  // folding skeleton stock (extended)
  g.prism('polymer', B, [[-4.4, 2.0], [-12.6, 1.8], [-12.6, -2.6], [-11.8, -2.6], [-11.8, 1.0], [-4.4, 0.8]], 0.7);
  g.span('polymer', B, -13.0, -12.5, -2.7, 2.0, 1.3);
  // cocking handle (left front)
  mb.node('bolt', 'gun');
  mb.pen('bolt').span('metal', C.black, 6.4, 6.9, 1.6, 2.0, 1.0, { x: -0.85 });
  // straight .45 mag
  mb.node('mag', 'gun', [0, -1.0, -3.75]);
  mb.pen('mag').prism('polymer', [0.2, 0.2, 0.21], curvedMag(6.4, 2.1, 2.2, 0.45, 1.0), 1.0, { bev: 0.12 });
  mb.marker('muzzle', 'gun', [0, 1.2, -12.0]);
  mb.marker('shell', 'gun', [0.7, 1.6, -1.4]);
  const { anims } = rifleRig(mb, {
    kick: 0.9,
    lh: { at: [0, 0.4, 7.4] },
    mag: { at: [-0.6, -3.0, 4.2], style: 'drop', slap: true },
    charge: { at: [-1.2, 1.8, 6.6], side: 'L', pull: 2.2 },
    bolt: 0,
    reload: 3.5,
  });
  return { anims, muzzle: 'muzzle', shell: 'shell' };
}

// ---------------------------------------------------------------- P90
function p90(mb) {
  hold(mb, [6.9, -7.3, -15.2], [-1, 1.5, -10], 1.1);
  mb.node('gun', 'rig');
  const g = mb.pen('gun');
  const B = [0.2, 0.2, 0.21];
  // main body: smooth bullpup with the butt behind the grip
  g.prism('polymer', B, [
    [-9.4, -2.6], [-9.4, 1.6], [-8.6, 2.1], [6.6, 2.1], [8.2, 1.7], [8.8, 0.9], [8.6, 0.0], [6.4, -0.4],
    [3.6, -0.5], [1.2, -0.3], [-1.6, -0.3], [-2.6, -1.0], [-5.2, -1.3], [-9.0, -2.8],
  ], 2.05, { bev: 0.5 });
  // front grip loop (thumbhole) for the left hand
  g.prism('polymer', B, [[6.4, -0.3], [7.6, -0.3], [7.0, -3.6], [5.8, -3.6]], 1.5, { bev: 0.3 });
  g.prism('polymer', B, [[1.6, -0.4], [6.0, -0.4], [6.0, -3.6], [5.4, -3.6], [5.4, -1.0], [1.6, -1.0]], 0.6);
  pistolGrip(g, 'polymer', B);
  g.box('metal', C.dark, 0.18, 0.72, 0.22, { p: [0, -0.6, -1.0], r: [12, 0, 0] });
  // reflex sight
  g.prism('polymer', C.black, [[1.6, 2.6], [4.6, 2.6], [4.4, 3.9], [2.0, 3.9]], 1.0, { bev: 0.15 });
  g.quad('lens', C.glass, 0.7, 0.9, { p: [0, 3.3, -1.55], r: [90, 0, 0] });
  // barrel
  g.tube('metal', C.dark, 8.6, 10.6, 0.8, 0.34, 0.34, { n: 8 });
  muzzle(g, 10.6, 0.5, 0.8, 0.4, C.black);
  // charging handles (both sides)
  mb.node('bolt', 'gun');
  for (const x of [-1.15, 1.15]) mb.pen('bolt').span('metal', C.black, 5.4, 6.0, 0.9, 1.3, 0.3, { x });
  // top-mounted translucent magazine
  mb.node('mag', 'gun', [0, 2.1, 0]);
  mb.pen('mag').prism('polymer', [0.36, 0.32, 0.26], [[-6.2, 0.0], [5.2, 0.0], [5.6, 0.5], [5.2, 0.9], [-6.0, 0.9], [-6.4, 0.5]], 1.9, { bev: 0.18 });
  mb.pen('mag').span('polymer', [0.6, 0.48, 0.25], -5.6, 4.6, 0.1, 0.8, 1.96);
  mb.marker('muzzle', 'gun', [0, 0.8, -11.3]);
  mb.marker('shell', 'gun', [0, -0.6, 2.4]);
  const { anims } = rifleRig(mb, {
    kick: 0.7,
    lh: { p: [-1.5, -1.6, -4.3], fwd: [0.3, -0.25, -0.92], palm: [1, 0, 0.1], grip: 'grip' },
    mag: {
      at: [-1.4, 3.4, -0.4], fwd: [0.6, -0.5, -0.6], palm: [0.6, -1, 0],
      out: { p: [0, 0.9, 1.4], r: [-6, 0, 0] }, toss: { p: [-1.6, 3.0, 1.8], r: [-14, 6, 18] },
      ins: { p: [0, 1.4, -1.6], r: [-9, 0, 0] }, preGrip: [-0.8, 1.2, 1.0],
      away: handPose([-9, -18, 1], [0.4, 0.2, -0.9], [0.8, -0.5, 0]),
    },
    charge: { at: [-1.2, 1.1, 5.7], side: 'L', pull: 2.0 },
    bolt: 0,
    reload: 3.4,
    tilt: { p: [-4, 2.5, 1], r: [6, 16, -14] },
  });
  return { anims, muzzle: 'muzzle', shell: 'shell' };
}

// ---------------------------------------------------------------- MAC-10
function mac10(mb) {
  hold(mb, [6.6, -6.4, -13.2], [-1, 1.5, -10], 1.1);
  mb.node('gun', 'rig');
  const g = mb.pen('gun');
  const B = [0.2, 0.2, 0.21];
  // boxy stamped receiver
  g.prism('metal', B, [[-3.0, 0.0], [6.0, 0.0], [6.0, 2.4], [-2.8, 2.4], [-3.0, 2.2]], 1.3, { bev: 0.12 });
  g.span('metal', C.bore, 1.0, 3.2, 1.0, 1.7, 0.04, { x: 0.66 });
  // sights
  g.prism('metal', B, [[-2.8, 2.4], [-1.6, 2.4], [-1.7, 3.0], [-2.7, 3.0]], 0.8);
  g.span('metal', B, 5.0, 5.8, 2.4, 2.95, 0.5);
  // slot for the cocking knob
  g.span('metal', C.bore, 0.6, 4.2, 2.4, 2.43, 0.2);
  // threaded barrel
  g.tube('ribbed', C.dark, 6.0, 8.6, 1.3, 0.42, 0.42, { n: 8 });
  g.tube('metal', C.bore, 8.6, 8.62, 1.3, 0.22, 0.22, { n: 6 });
  // grip (mag well) and trigger guard
  pistolGrip(g, 'polymer', B);
  triggerGuard(g, 0.4, 3.0, 0.0, 1.1, B);
  // front strap loop under the front
  g.span('metal', B, 3.8, 5.6, -0.6, -0.4, 0.3);
  g.span('metal', B, 5.4, 5.6, -0.6, 0.0, 0.3);
  // cocking knob on top (reciprocates)
  mb.node('bolt', 'gun');
  mb.pen('bolt').cyl('metal', C.dark, 0.32, 0.3, 0.5, { n: 6, p: [0, 2.4, -3.8], r: [-90, 0, 0] });
  // straight mag out of the grip
  mb.node('mag', 'gun', [0, -3.6, 1.0]);
  mb.pen('mag').span('metal', [0.26, 0.26, 0.27], -0.6, 0.6, -4.2, 0.0, 0.8);
  mb.pen('mag').span('metal', [0.2, 0.2, 0.21], -0.7, 0.7, -4.4, -4.0, 0.9);
  mb.marker('muzzle', 'gun', [0, 1.3, -8.9]);
  mb.marker('shell', 'gun', [0.7, 1.4, -2.1]);
  const { anims } = rifleRig(mb, {
    kick: 0.85,
    lh: { p: [-1.6, -2.4, -3.6], fwd: [0.35, 0.4, -0.85], palm: [0.5, 1, 0], grip: 'cup' },
    mag: GRIP_MAG,
    charge: { at: [0, 2.4, 3.8], side: 'top', pull: 2.6 },
    bolt: 2.6,
    reload: 3.15,
    tilt: { p: [-3, 3.5, 2], r: [18, 14, -28] },
  });
  return { anims, muzzle: 'muzzle', shell: 'shell' };
}

// ---------------------------------------------------------------- TMP
function tmp(mb) {
  hold(mb, [6.6, -6.6, -13.6], [-1, 1.5, -10], 1.1);
  mb.node('gun', 'rig');
  const g = mb.pen('gun');
  const B = [0.22, 0.22, 0.23];
  // polymer receiver, rounded top
  g.prism('polymer', B, [[-3.0, -0.1], [5.6, -0.1], [5.6, 1.9], [5.0, 2.4], [-2.6, 2.4], [-3.0, 2.0]], 1.25, { bev: 0.32 });
  g.span('metal', C.bore, 0.4, 2.4, 1.2, 1.8, 0.04, { x: 0.63 });
  g.prism('polymer', C.black, [[-2.6, 2.3], [-1.4, 2.3], [-1.6, 3.0], [-2.4, 3.0]], 0.8);
  g.span('polymer', C.black, 4.2, 4.9, 2.3, 2.95, 0.4);
  // vertical foregrip
  g.prism('polymer', B, [[3.6, 0.0], [5.0, 0.0], [5.0, -3.8], [3.8, -3.8]], 1.05, { bev: 0.25 });
  triggerGuard(g, 0.3, 2.9, -0.1, 1.0, B);
  pistolGrip(g, 'polymer', B);
  // integral suppressor
  g.tube('metal', [0.2, 0.2, 0.21], 5.6, 12.6, 1.2, 0.66, 0.66, { n: 10 });
  g.tube('metal', C.bore, 12.6, 12.62, 1.2, 0.22, 0.22, { n: 6 });
  // cocking handle (rear)
  mb.node('bolt', 'gun');
  mb.pen('bolt').span('polymer', C.black, -3.5, -2.9, 1.5, 2.1, 1.6);
  mb.node('mag', 'gun', [0, -3.6, 1.0]);
  mb.pen('mag').span('metal', [0.26, 0.26, 0.27], -0.6, 0.6, -3.8, 0.0, 0.8);
  mb.pen('mag').span('polymer', C.black, -0.7, 0.7, -4.0, -3.6, 0.9);
  mb.marker('muzzle', 'gun', [0, 1.2, -12.9]);
  mb.marker('shell', 'gun', [0.7, 1.5, -1.4]);
  const { anims } = rifleRig(mb, {
    kick: 0.7,
    lh: { p: [-1.45, -1.3, -2.8], fwd: [0.2, -0.3, -0.93], palm: [1, 0, 0.1], grip: 'grip' },
    mag: GRIP_MAG,
    // the rear charging handle sits against the cheek: no reach for it, the gun
    // just jolts as the bolt is released
    reloadRig: [[0.83, [-3, 3.5, 2], [18, 14, -28], 'io'], [0.85, [-3, 3.75, 1.7], [20, 14, -27.5], 'out'], [0.9, [-3, 3.5, 2], [18, 14, -28], 'settle']],
    bolt: 0,
    reload: 2.12,
    tilt: { p: [-3, 3.5, 2], r: [18, 14, -28] },
  });
  return { anims, muzzle: 'muzzle', shell: 'shell' };
}

export const SMGS = { mp5, ump45, p90, mac10, tmp };
