// Knife, grenades, C4 (+ an internal hand test rig, "_hands").
// These are authored directly in view space (rig at the origin).
import * as THREE from 'three';
import { arm, GRIPS, handPose } from './hands.js';
import { DEG } from './builder.js';
import { C, hold, idle } from './kit.js';
import { Z } from './anim.js';
import { add, sub, chain, rel } from './pose.js';
import { ring } from './parts.js';

function _hands(mb) {
  hold(mb, [0, 0, -22]);
  const keys = Object.keys(GRIPS);
  keys.forEach((k, i) => {
    mb.node('g' + i, 'rig', [(i - keys.length / 2) * 5.5 + 2.5, 3, 0]);
    arm(mb, 'h' + i, 'g' + i, 'R', { p: [0, 0, 0], fwd: [0, 1, 0], palm: [0, 0, -1], fore: [0, -1, 0], grip: k, len: 4 });
    mb.node('l' + i, 'rig', [(i - keys.length / 2) * 5.5 + 2.5, -7, 0]);
    arm(mb, 'k' + i, 'l' + i, 'R', { p: [0, 0, 0], fwd: [0, 1, 0], palm: [-1, 0, 0], fore: [0, -1, 0], grip: k, len: 4 });
  });
  return { anims: { idle: idle({ amp: 0 }) } };
}

// ---------------------------------------------------------------- knife
// Right fist holds the knife with the blade toward the hand's index side
// (hand-local -X), the blade flat in the hand's X-Y plane.
// Pose for the knife hand from where the blade points and where the palm faces
// (rig = view space). Hand-local: blade along -X, palm -Y, fingers -Z.
function knifeHand(p, blade, palm) {
  const x = new THREE.Vector3(...blade).normalize().negate();
  const y = new THREE.Vector3(...palm).negate();
  y.addScaledVector(x, -y.dot(x)).normalize();
  const z = new THREE.Vector3().crossVectors(x, y);
  const e = new THREE.Euler().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z), 'YXZ');
  return { p, r: [e.x / DEG, e.y / DEG, e.z / DEG] };
}

function knife(mb) {
  hold(mb, [0, 0, 0]);
  // CS 1.6 style: only the right fist is in view, blade angled up and in
  const RH = knifeHand([7.6, -6.4, -12.0], [-0.52, 0.6, -0.6], [-0.85, -0.1, 0.45]);
  const LH = handPose([-11, -30, -4], [0.32, 0.94, -0.05], [-0.43, -0.41, -0.79]); // parked
  mb.node('rhand', 'rig', RH.p, RH.r);
  arm(mb, 'rhand_arm', 'rhand', 'R', { p: [0, 0, 0], fwd: [0, 0, -1], palm: [0, -1, 0], elbow: [14, -25, 2], grip: 'fist', len: 18 });
  mb.node('lhand', 'rig', LH.p, LH.r);
  arm(mb, 'lhand_arm', 'lhand', 'L', { p: [0, 0, 0], fwd: [0, 0, -1], palm: [0, -1, 0], elbow: [-8, -36, 4], grip: 'open', len: 18 });

  // knife in the right fist (hand-local frame)
  mb.node('knife', 'rhand', [0, -1.2, -2.75], [0, 90, 0]);
  const k = mb.pen('knife');
  // after the +90 yaw: profile forward (f) -> hand -X (blade direction), y -> up
  const H = [0.12, 0.12, 0.13];
  k.prism('polymer', H, [[-2.4, -0.42], [1.8, -0.42], [1.8, 0.42], [-2.4, 0.42], [-2.6, 0.0]], 0.8, { bev: 0.18 });
  for (let i = 0; i < 4; i++) k.span('polymer', [0.08, 0.08, 0.08], -1.9 + i * 0.85, -1.6 + i * 0.85, -0.46, 0.46, 0.84);
  k.span('metal', [0.3, 0.3, 0.32], -2.75, -2.4, -0.5, 0.5, 0.9); // pommel
  k.prism('metal', [0.22, 0.22, 0.23], [[1.8, -1.25], [2.15, -1.25], [2.15, 1.05], [1.8, 1.05]], 0.5, { bev: 0.06 }); // guard
  // blade with clip point, edge down
  k.prism('blade', C.white, [[2.1, 0.62], [8.6, 0.62], [10.4, 0.42], [11.6, 0.0], [10.2, -0.42], [7.4, -0.78], [2.1, -0.8]], 0.2, { wt: 0.14 });
  k.prism('metal', [0.75, 0.78, 0.72], [[2.6, -0.8], [7.4, -0.78], [10.2, -0.42], [11.6, 0.0], [11.3, -0.02], [10.0, -0.36], [7.3, -0.66], [2.6, -0.68]], 0.12);
  for (let i = 0; i < 6; i++) k.prism('metal', [0.35, 0.36, 0.34], [[2.6 + i * 0.42, 0.6], [2.95 + i * 0.42, 0.6], [2.77 + i * 0.42, 0.78]], 0.12);

  const KH = (u, h, e) => [u, h.p, h.r, e];
  const kh = (u, p, blade, palm, e) => KH(u, knifeHand(p, blade, palm), e);
  const rest = (u, e = 'io') => KH(u, RH, e);
  const park = { lhand: { abs: true, k: [KH(0, LH)] } };
  // body: chest turns into the cut / leans into the stab (camera-relative weight)
  const twist = (u0, u1, u2, yaw, pitch = 0, fwd = 0) => [[0, Z, Z], [u0, [0, 0, 0], [0.4, -yaw * 0.3, 0], 'io'], [u1, [0, -0.2, -fwd], [pitch, yaw, yaw * 0.15], 'io'], [u2, Z, Z, 'io'], [1, Z, Z]];
  const anims = {
    idle: idle({ amp: 1.1, fn(u, t, vm) {
      // the wrist idly rolls the blade a little
      vm.nodes.rhand.rotation.z += 2.5 * DEG * Math.sin(u * Math.PI * 4 + 0.5);
    } }),
    draw: { dur: 1.0, blend: 0.05, tracks: {
      rhand: { abs: true, k: [
        kh(0, [11, -21, -7], [0.3, -0.75, -0.6], [-0.4, -0.4, 0.8]),
        kh(0.3, [9.5, -11.5, -10.5], [0.1, 0.2, -0.98], [-0.7, -0.6, 0.3], 'cr'),
        kh(0.5, [7.8, -5.9, -12.2], [-0.56, 0.66, -0.5], [-0.85, -0.15, 0.45], 'cr'),
        kh(0.66, [7.6, -6.55, -11.9], [-0.5, 0.58, -0.62], [-0.85, -0.1, 0.45], 'io'),
        rest(0.85)] },
      body: [[0, [0, -0.4, 0.2], [-1.2, 0, 0]], [0.5, Z, [0.4, 0, 0], 'out2'], [0.85, Z, Z, 'io']],
      ...park,
    } },
    // forehand: wind up to the right, cut right-to-left through the centre
    slash1: { dur: 0.6, blend: 0.04, tracks: {
      rhand: { abs: true, k: [rest(0),
        kh(0.14, [10.8, -3.6, -10.5], [0.2, 0.55, -0.8], [-0.2, -0.95, 0.25], 'out2'),
        kh(0.26, [5.0, -4.4, -15.5], [-0.55, 0.2, -0.8], [-0.1, -0.98, -0.1], 'in2'),
        kh(0.36, [-2.5, -6.5, -15.0], [-0.9, 0.0, -0.45], [-0.25, -0.95, 0.15], 'cr'),
        kh(0.46, [-6.5, -10.5, -11.5], [-0.75, -0.45, -0.25], [-0.35, -0.8, 0.45], 'out2'),
        kh(0.72, [3.5, -10.0, -11.0], [-0.35, 0.4, -0.85], [-0.7, -0.4, 0.5], 'cr'),
        rest(1.0, 'cr')] },
      body: twist(0.14, 0.4, 0.85, 5, -1.2),
      ...park,
    } },
    // backhand: wind up across the body, cut left-to-right and down
    slash2: { dur: 0.6, blend: 0.04, tracks: {
      rhand: { abs: true, k: [rest(0),
        kh(0.16, [1.0, -3.4, -12.0], [-0.75, 0.5, -0.45], [0.2, -0.95, -0.2], 'out2'),
        kh(0.3, [6.0, -5.0, -16.0], [0.35, 0.15, -0.92], [0.05, -1, 0.05], 'in2'),
        kh(0.4, [10.5, -7.8, -14.0], [0.85, -0.15, -0.5], [0.1, -0.9, 0.4], 'cr'),
        kh(0.52, [12.5, -11.0, -10.5], [0.7, -0.6, -0.25], [-0.1, -0.7, 0.7], 'out2'),
        kh(0.78, [9.0, -7.5, -11.5], [-0.25, 0.6, -0.75], [-0.85, -0.2, 0.4], 'cr'),
        rest(1.0, 'cr')] },
      body: twist(0.16, 0.42, 0.85, -5, -1.0),
      ...park,
    } },
    // stab: draw back high, drive the point into the centre, wrench it back
    stab: { dur: 1.1, blend: 0.05, tracks: {
      rhand: { abs: true, k: [rest(0),
        kh(0.24, [9.0, -2.6, -8.5], [-0.35, 0.45, -0.82], [-0.75, -0.6, 0.1], 'io'),
        kh(0.32, [9.4, -2.0, -8.0], [-0.33, 0.5, -0.8], [-0.75, -0.6, 0.1], 'io'),
        kh(0.42, [3.4, -4.6, -17.5], [-0.42, -0.12, -0.9], [-0.65, -0.75, 0.1], 'in2'),
        kh(0.5, [3.5, -4.7, -17.1], [-0.42, -0.14, -0.9], [-0.65, -0.75, 0.1], 'out'),
        kh(0.6, [4.0, -5.0, -16.0], [-0.42, -0.02, -0.9], [-0.65, -0.75, 0.1], 'io'),
        kh(0.82, [8.0, -8.0, -11.5], [-0.45, 0.5, -0.75], [-0.85, -0.2, 0.45], 'cr'),
        rest(1.0, 'cr')] },
      body: [[0, Z, Z], [0.3, [0, 0.2, 0.6], [1.2, -1.5, 0], 'io'], [0.43, [0, -0.3, -1.4], [-2.0, 2.0, 0.5], 'in2'], [0.5, [0, -0.25, -1.2], [-1.6, 2.0, 0.5], 'out'], [0.9, Z, Z, 'io'], [1, Z, Z]],
      ...park,
    } },
    stab_miss: { dur: 1.1, blend: 0.05, tracks: {
      rhand: { abs: true, k: [rest(0),
        kh(0.24, [9.0, -2.6, -8.5], [-0.35, 0.45, -0.82], [-0.75, -0.6, 0.1], 'io'),
        kh(0.32, [9.4, -2.0, -8.0], [-0.33, 0.5, -0.8], [-0.75, -0.6, 0.1], 'io'),
        kh(0.46, [2.6, -5.4, -20.0], [-0.42, -0.25, -0.87], [-0.65, -0.75, 0.1], 'in2'),
        kh(0.6, [4.0, -9.5, -17.5], [-0.25, -0.65, -0.7], [-0.6, -0.6, 0.5], 'out2'),
        kh(0.82, [8.0, -8.5, -11.5], [-0.45, 0.45, -0.75], [-0.85, -0.2, 0.45], 'cr'),
        rest(1.0, 'cr')] },
      body: [[0, Z, Z], [0.3, [0, 0.2, 0.6], [1.2, -1.5, 0], 'io'], [0.47, [0, -0.5, -2.0], [-3.0, 2.5, 0.5], 'in2'], [0.62, [0, -0.6, -1.6], [-2.5, 2.0, 0.5], 'out2'], [0.95, Z, Z, 'io'], [1, Z, Z]],
      ...park,
    } },
  };
  anims.attack = anims.slash1;
  mb.marker('tip', 'knife', [0, 0, -11.6]);
  return { anims, muzzle: 'tip', shell: 'tip' };
}

// ---------------------------------------------------------------- grenades
function grenadeBody(mb, type) {
  const g = mb.pen('grenade');
  const up = { r: [-90, 0, 0] }; // lathe axis Z -> Y
  if (type === 'he') {
    g.lathe('metal', C.odGreen, [[0, -1.4], [0.7, -1.32], [1.1, -0.95], [1.28, -0.2], [1.22, 0.45], [0.95, 0.95], [0.55, 1.18], [0, 1.2]].map(([r, y]) => [r, y]), { n: 10, ...up });
    g.lathe('metal', [0.75, 0.62, 0.12], [[1.29, -0.35], [1.3, -0.1], [1.27, 0.1]], { n: 10, ...up });
  } else if (type === 'flash') {
    g.lathe('metal', [0.72, 0.73, 0.74], [[0, -1.7], [0.82, -1.7], [0.9, -1.55], [0.9, 0.95], [0.8, 1.1], [0, 1.1]], { n: 10, ...up });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      for (const y of [-0.9, 0.2]) g.box('metal', [0.15, 0.15, 0.15], 0.08, 0.5, 0.32, { p: [Math.cos(a) * 0.88, y, Math.sin(a) * 0.88], r: [0, -(a * 180) / Math.PI, 0] });
    }
  } else {
    g.lathe('metal', [0.36, 0.4, 0.34], [[0, -1.8], [0.95, -1.8], [1.0, -1.65], [1.0, 1.0], [0.88, 1.15], [0, 1.15]], { n: 10, ...up });
    g.lathe('metal', [0.85, 0.85, 0.8], [[1.01, -0.6], [1.01, 0.3]], { n: 10, ...up });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      g.cyl('metal', C.bore, 0.16, 0.16, 0.05, { n: 6, p: [Math.cos(a) * 0.55, 1.18, Math.sin(a) * 0.55], r: [90, 0, 0] });
    }
  }
  const top = type === 'he' ? 1.1 : type === 'flash' ? 1.05 : 1.1;
  // fuze + spoon (lever) running down one side
  g.cyl('metal', [0.55, 0.56, 0.55], 0.42, 0.38, 0.55, { n: 8, p: [0, top, 0], r: [-90, 0, 0] });
  g.box('metal', [0.6, 0.6, 0.58], 0.5, 0.12, 1.1, { p: [0, top + 0.5, 0.45], r: [-8, 0, 0] });
  g.box('metal', [0.6, 0.6, 0.58], 0.5, 1.9, 0.12, { p: [0, top - 0.5, 1.12], r: [-6, 0, 0] });
  // pin + ring
  mb.node('pin', 'grenade', [0, top + 0.3, -0.45]);
  const p = mb.pen('pin');
  p.cyl('metal', [0.75, 0.75, 0.72], 0.06, 0.06, 0.9, { n: 4, p: [0.45, 0, 0], r: [0, 90, 0] });
  p.at([-0.85, 0, 0], [0, 20, 0]);
  ring(p, 0, 0, 0.42, 0.09, [0.78, 0.78, 0.74], 8);
}

function grenade(type) {
  return (mb) => {
    hold(mb, [0, 0, 0]);
    const RH = handPose([5.2, -5.3, -8.8], [0.355, -0.0835, -0.922], [-0.82, -0.5, -0.27]);
    mb.node('rhand', 'rig', RH.p, RH.r);
    arm(mb, 'rhand_arm', 'rhand', 'R', { p: [0, 0, 0], fwd: [0, 0, -1], palm: [0, -1, 0], elbow: [14, -28, -2], grip: 'hold', len: 18 });
    mb.node('grenade', 'rhand', [-0.2, -1.75, -3.2], [0, 0, 90]);
    grenadeBody(mb, type);
    // left hand: parked below, comes in to pull the pin
    const LA = handPose([-9, -24, -6], [0.5, 0.6, -0.6], [0.6, -0.2, -0.7]);
    mb.node('lhand', 'rig', LA.p, LA.r);
    arm(mb, 'lhand_arm', 'lhand', 'L', { p: [0, 0, 0], fwd: [0, 0, -1], palm: [0, -1, 0], elbow: [-12, -26, -4], pole: [-0.3, -1, 0.15], grip: 'pinch', len: 18 });
    const K = (u, h, e) => [u, h.p, h.r, e];
    const off = (h, d, dr = [0, 0, 0]) => ({ p: add(h.p, d), r: add(h.r, dr) });
    const top = type === 'he' ? 1.1 : type === 'flash' ? 1.05 : 1.1;
    const G0 = { p: [-0.2, -1.75, -3.2], r: [0, 0, 90] };
    const PIN = { p: [0, top + 0.3, -0.45], r: [0, 0, 0] };
    // right hand: rest, turned to offer the ring, cocked back ready to throw
    const RHp = off(RH, [-1.4, 1.1, -0.8], [6, 12, 14]);
    const RHc = off(RH, [1.6, 2.6, 1.2], [-24, -8, 18]);
    const RHb = off(RH, [4.5, 4.8, 3.6], [-45, -16, 30]);
    // the left index hooks the ring: place the hand so its fingertip is on it
    const ring = chain(chain(chain(RHp, G0), PIN), { p: [-0.85, 0, 0], r: [0, 0, 0] });
    const lpr = handPose([0, 0, 0], [0.75, 0.2, -0.62], [0.1, -0.9, -0.4]);
    const tip = chain(lpr, { p: [1.15, -1.0, -5.0], r: [0, 0, 0] }).p;
    const LP = { p: sub(ring.p, tip), r: lpr.r };
    const pinRel = rel(LP, chain(chain(RHp, G0), PIN));
    mb.clone('pin', 'pin_hand', 'lhand', pinRel.p, pinRel.r);
    const LPout = off(LP, [-4.5, -2.0, 2.0], [0, 15, -35]);
    const anims = {
      idle: idle({ amp: 1 }),
      draw: { dur: 0.75, blend: 0.05, tracks: {
        rhand: { abs: true, k: [K(0, off(RH, [2.5, -11, 4], [40, 10, -20])), K(0.42, off(RH, [0.5, -1.5, 0.6], [6, 2, -4]), 'cr'), K(0.66, off(RH, [0, 0.35, -0.1], [-2, 0, 1]), 'cr'), K(0.86, RH, 'io')] },
        body: [[0, [0, -0.4, 0.2], [-1, 0, 0]], [0.6, Z, [0.4, 0, 0], 'out2'], [0.9, Z, Z, 'io']],
      } },
      pinpull: {
        dur: 0.95,
        hold: true,
        blend: 0.05,
        tracks: {
          rhand: { abs: true, k: [K(0, RH), K(0.28, RHp, 'io'), K(0.47, RHp), K(0.56, off(RHp, [0.3, -0.3, 0.2], [0, 0, -6]), 'out2'), K(1, RHc, 'io')] },
          lhand: { abs: true, k: [K(0, LA), K(0.2, off(LP, [-2.5, -6, 2.5], [-10, 0, 20]), 'cr'), K(0.34, off(LP, [-0.4, -0.6, 0.4]), 'cr'), K(0.4, LP, 'io'), K(0.47, LP), K(0.62, LPout, 'in2'), K(0.72, off(LPout, [-1.0, -1.6, 0.6], [0, 0, -10]), 'out2'), K(1, off(LA, [0, -2, 0]), 'in2')] },
          body: [[0, Z, Z], [0.3, [0, -0.15, 0], [0.6, -1.0, 0], 'io'], [0.6, [0, 0, 0.1], [-0.3, 1.0, 0], 'out2'], [1, [0, 0.1, 0.3], [0.8, -1.2, 0], 'io']],
        },
        vis: { pin: [[0.47, 1, false]], pin_hand: [[0.47, 1, true]] },
      },
      throw: {
        dur: 0.6,
        hold: true,
        blend: 0.04,
        tracks: {
          rhand: { abs: true, k: [K(0, RHc), K(0.16, RHb, 'out2'),
            K(0.34, handPose([3.0, -3.4, -16.5], [0.05, -0.4, -0.9], [-0.7, -0.6, 0.3]), 'in2'),
            K(0.55, handPose([1.0, -13, -13], [-0.1, -0.9, -0.4], [-0.6, -0.4, 0.6]), 'out2'),
            K(1, handPose([3, -30, -9], [0, -0.9, -0.4], [-0.6, -0.4, 0.6]), 'io')] },
          lhand: { abs: true, k: [K(0, off(LA, [0, -2, 0]))] },
          body: [[0, [0, 0.1, 0.3], [0.8, -1.2, 0]], [0.16, [0, 0.25, 0.7], [1.6, -3.5, -0.5], 'out2'], [0.36, [0, -0.35, -1.4], [-3.0, 4.5, 1.0], 'in2'], [0.6, [0, -0.2, -0.6], [-1.2, 2.0, 0.4], 'out2'], [1, Z, Z, 'io']],
        },
        vis: { grenade: [[0.33, 1, false]], pin: [[0, 1, false]] },
      },
    };
    mb.marker('muzzle', 'grenade', [0, 0, 0]);
    return { anims, muzzle: 'muzzle', shell: 'muzzle' };
  };
}

// ---------------------------------------------------------------- C4
function c4(mb) {
  hold(mb, [0, 0, 0]);
  mb.node('bomb', 'rig', [0.6, -7.0, -15.2], [0, 96, 52]);
  const b = mb.pen('bomb');
  // four explosive bricks taped together
  for (const [x, y] of [[-1.6, 0], [1.6, 0], [-1.6, -1.25], [1.6, -1.25]]) b.box('c4brick', C.white, 3.1, 1.2, 7.6, { p: [x, y - 0.6, 0] });
  for (const z of [-2.6, 2.6]) b.box('flat', [0.18, 0.18, 0.16], 6.6, 2.65, 0.9, { p: [0, -1.25, z] });
  // control box with keypad + LCD on top
  b.box('polymer', [0.17, 0.17, 0.18], 4.6, 1.0, 5.0, { p: [0, 0.5, 0.6] });
  b.quad('keypad', C.white, 4.2, 4.6, { p: [0, 1.01, 0.6], r: [0, 0, 0] });
  // wires
  const wire = (x, col, z0, z1) => b.box('flat', col, 0.18, 0.18, Math.abs(z1 - z0), { p: [x, 0.3, (z0 + z1) / 2] });
  wire(-2.4, [0.75, 0.1, 0.08], -3.6, 1.0);
  wire(2.4, [0.15, 0.25, 0.7], -3.0, 2.0);
  wire(2.5, [0.8, 0.7, 0.1], -2.0, 3.0);
  b.box('metal', [0.3, 0.3, 0.3], 1.4, 0.6, 0.9, { p: [0, 0.3, -3.3] });
  // left hand under the bomb, right hand typing
  arm(mb, 'lhand', 'bomb', 'L', { p: [0.6, -3.0, -3.4], fwd: [-0.2, 0.15, 1], palm: [0, 1, 0], elbow: [-10, -26, -4], grip: 'cup', len: 18 });
  const RH = handPose([6.4, -3.8, -12.0], [-0.75, -0.42, -0.5], [-0.2, -0.75, 0.6]);
  mb.node('rhand', 'rig', RH.p, RH.r);
  arm(mb, 'rhand_arm', 'rhand', 'R', { p: [0, 0, 0], fwd: [0, 0, -1], palm: [0, -1, 0], elbow: [12, -22, 0], grip: 'point', len: 18 });
  const off = (d) => [RH.p[0] + d[0], RH.p[1] + d[1], RH.p[2] + d[2]];
  // keypad presses: alternate key positions, dip toward the pad
  const keys = [[0, 0, 0], [0.8, 0.1, -0.2], [-0.6, -0.3, 0.4], [0.3, -0.5, 0.6], [-0.9, 0.2, -0.1], [0.6, -0.2, 0.3], [-0.3, 0.3, -0.3]];
  const rk = [[0, RH.p, RH.r]];
  keys.forEach((kk, i) => {
    const u0 = 0.06 + i * 0.1;
    rk.push([u0, off([kk[0], kk[1] + 0.6, kk[2]]), RH.r, 'io']);
    rk.push([u0 + 0.04, off([kk[0], kk[1] - 0.5, kk[2] - 0.3]), RH.r, 'in2']);
    rk.push([u0 + 0.07, off([kk[0], kk[1] + 0.4, kk[2]]), RH.r, 'out2']);
  });
  rk.push([0.82, RH.p, RH.r, 'io']);
  rk.push([1.0, off([0, -14, 4]), RH.r, 'in2']);
  const anims = {
    idle: idle({ amp: 1 }),
    draw: { dur: 1.0, blend: 0.05, tracks: {
      bomb: [[0, [0, -10, 4], [-30, 0, 0]], [0.5, [0, 0.3, 0], [2, 0, 0], 'cr'], [0.72, Z, Z, 'io']],
      rhand: [[0, [0, -12, 4], Z], [0.15, [0, -12, 4], Z], [0.65, Z, Z, 'out2']],
    } },
    plant: { dur: 3.0, hold: true, blend: 0.1, tracks: {
      rhand: { abs: true, k: rk },
      // lean over the bomb while typing, a nod with every key press
      body: [[0, Z, Z], [0.05, [0, -0.4, -0.3], [-2.0, 0, 0], 'io'],
        ...keys.flatMap((kk, i) => { const u0 = 0.06 + i * 0.1; return [[u0 + 0.04, [0, -0.55, -0.35], [-2.5, 0, 0], 'in2'], [u0 + 0.08, [0, -0.4, -0.3], [-2.0, 0, 0], 'out2']]; }),
        [0.82, [0, -0.4, -0.3], [-2.0, 0, 0]], [1, [0, -1.2, 0.2], [-5, 0, 0], 'in2']],
      bomb: [[0, Z, Z], [0.8, Z, Z], [0.86, [0, 0.4, -0.5], [3, 0, 0], 'out2'], [1, [0, -14, -2], [-20, 0, 0], 'in2']],
    } },
  };
  return { anims };
}

export const MISC = { _hands, knife, hegrenade: grenade('he'), flashbang: grenade('flash'), smokegrenade: grenade('smoke'), c4 };
