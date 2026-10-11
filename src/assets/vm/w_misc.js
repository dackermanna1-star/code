// Knife, grenades, C4 (+ an internal hand test rig, "_hands").
// These are authored directly in view space (rig at the origin).
import * as THREE from 'three';
import { arm, GRIPS, handPose } from './hands.js';
import { DEG } from './builder.js';
import { C, hold, idle } from './kit.js';
import { Z } from './anim.js';
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
function knife(mb) {
  hold(mb, [0, 0, 0]);
  const RH = handPose([8.0, -8.0, -10.4], [0.417, 0.119, -0.9], [0.45, -0.9, 0.05]);
  const LH = handPose([-5.8, -8.8, -9.6], [0.32, 0.94, -0.05], [-0.43, -0.41, -0.79]);
  mb.node('rhand', 'rig', RH.p, RH.r);
  arm(mb, 'rhand_arm', 'rhand', 'R', { p: [0, 0, 0], fwd: [0, 0, -1], palm: [0, -1, 0], elbow: [14, -25, 0], grip: 'fist', len: 18 });
  mb.node('lhand', 'rig', LH.p, LH.r);
  arm(mb, 'lhand_arm', 'lhand', 'L', { p: [0, 0, 0], fwd: [0, 0, -1], palm: [0, -1, 0], elbow: [-8, -26, -2], grip: 'open', len: 18 });

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

  // stab: blade (hand -X) pointing into the screen
  const SF = [0.75, -0.45, -0.48], SP = [-0.6, -0.8, 0.05];
  const knifeK = (u, p, fwd, palm, e) => { const h = handPose(p, fwd, palm); return [u, h.p, h.r, e]; };
  const rest = [0, RH.p, RH.r];
  const restAt = (u, e = 'io') => [u, RH.p, RH.r, e];
  const lrest = [0, LH.p, LH.r];
  const anims = {
    idle: idle({ amp: 1 }),
    draw: { dur: 1.0, tracks: {
      rhand: { abs: true, k: [knifeK(0, [10, -20, -8], [0.2, 0.6, -0.8], [-0.4, -0.6, 0.6]), knifeK(0.45, [9.0, -9.0, -12.2], [0.45, -0.05, -0.9], [-0.15, -1, 0.05], 'out2'), restAt(0.7)] },
      lhand: { abs: true, k: [[0, [-10, -24, -10], LH.r], [0.15, [-10, -24, -10], LH.r], [0.6, LH.p, LH.r, 'out2']] },
    } },
    // right-to-left slash
    slash1: { dur: 0.6, tracks: {
      rhand: { abs: true, k: [rest,
        knifeK(0.12, [11.5, -7.5, -11.5], [0.6, 0.3, -0.75], [0.1, -1, 0.3], 'out2'),
        knifeK(0.3, [-1.0, -8.0, -15.5], [-0.3, -0.25, -0.9], [-0.3, -0.9, -0.2], 'in2'),
        knifeK(0.45, [-7.0, -12.0, -12.0], [-0.7, -0.5, -0.5], [-0.3, -0.8, 0.4], 'out2'),
        restAt(1.0)] },
      lhand: { abs: true, k: [lrest, [0.2, [LH.p[0] - 3, LH.p[1] - 7, LH.p[2] + 1], LH.r, 'out2'], [0.55, [LH.p[0] - 3, LH.p[1] - 7, LH.p[2] + 1], LH.r], [1, LH.p, LH.r]] },
    } },
    // left-to-right backhand
    slash2: { dur: 0.6, tracks: {
      rhand: { abs: true, k: [rest,
        knifeK(0.15, [1.0, -6.5, -12.5], [-0.6, 0.2, -0.75], [0.3, -0.9, -0.3], 'out2'),
        knifeK(0.33, [10.5, -9.0, -15.0], [0.7, -0.2, -0.65], [-0.3, -0.9, 0.2], 'in2'),
        knifeK(0.5, [14.0, -12.5, -11.0], [0.8, -0.4, -0.3], [-0.4, -0.8, 0.3], 'out2'),
        restAt(1.0)] },
      lhand: { abs: true, k: [lrest, [0.25, [LH.p[0] - 3, LH.p[1] - 6, LH.p[2] + 1], LH.r, 'out2'], [0.55, [LH.p[0] - 3, LH.p[1] - 6, LH.p[2] + 1], LH.r], [1, LH.p, LH.r]] },
    } },
    stab: { dur: 1.1, tracks: {
      rhand: { abs: true, k: [rest,
        knifeK(0.25, [9.5, -6.8, -8.6], SF, SP, 'io'),
        knifeK(0.33, [9.6, -6.6, -8.4], SF, SP),
        knifeK(0.45, [3.2, -4.0, -17.0], SF, SP, 'in2'),
        knifeK(0.6, [3.2, -4.2, -16.6], SF, SP),
        restAt(1.0)] },
      lhand: { abs: true, k: [lrest, [0.4, [LH.p[0] - 1, LH.p[1] - 4, LH.p[2] + 1], LH.r], [1, LH.p, LH.r]] },
    } },
    stab_miss: { dur: 1.1, tracks: {
      rhand: { abs: true, k: [rest,
        knifeK(0.25, [9.5, -6.8, -8.6], SF, SP, 'io'),
        knifeK(0.33, [9.6, -6.6, -8.4], SF, SP),
        knifeK(0.5, [2.4, -4.6, -19.0], SF, SP, 'in2'),
        knifeK(0.62, [4.5, -10.0, -17.0], [0.78, -0.7, -0.1], SP, 'out2'),
        restAt(1.0)] },
      lhand: { abs: true, k: [lrest, [0.4, [LH.p[0] - 1, LH.p[1] - 4, LH.p[2] + 1], LH.r], [1, LH.p, LH.r]] },
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
    // left hand (comes in to pull the pin)
    const LA = handPose([-9, -22, -8], [0.5, 0.6, -0.6], [0.6, -0.2, -0.7]);
    const LP = handPose([1.0, -5.7, -10.6], [0.8, 0.05, -0.6], [0.1, -0.85, -0.5]);
    // convert a view-space displacement into the grenade's local frame (rest pose)
    const gq = new THREE.Quaternion().setFromEuler(new THREE.Euler(RH.r[0] * DEG, RH.r[1] * DEG, RH.r[2] * DEG, 'YXZ'))
      .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 90 * DEG, 'YXZ'))).invert();
    const gl = (d) => { const v = new THREE.Vector3(...d).applyQuaternion(gq); return [v.x, v.y, v.z]; };
    mb.node('lhand', 'rig', LA.p, LA.r);
    arm(mb, 'lhand_arm', 'lhand', 'L', { p: [0, 0, 0], fwd: [0, 0, -1], palm: [0, -1, 0], elbow: [-12, -26, -4], grip: 'pinch', len: 18 });
    const K = (u, h, e) => [u, h.p, h.r, e];
    const off = (h, d) => ({ p: [h.p[0] + d[0], h.p[1] + d[1], h.p[2] + d[2]], r: h.r });
    const anims = {
      idle: idle({ amp: 1 }),
      draw: { dur: 0.75, tracks: { rhand: { abs: true, k: [K(0, off(RH, [2, -10, 4])), K(0.6, RH, 'out2')] } } },
      pinpull: {
        dur: 0.95,
        hold: true,
        tracks: {
          lhand: { abs: true, k: [K(0, LA), K(0.3, LP, 'out2'), K(0.42, LP), K(0.62, off(LP, [-4.5, -1.5, 1.5]), 'in2'), K(0.95, LA, 'io')] },
          pin: [[0, Z, Z], [0.42, Z, Z], [0.62, gl([-4.5, -1.5, 1.5]), [0, 0, 40], 'in2'], [0.95, gl([-10, -16, 3]), [0, 0, 60], 'io']],
          rhand: { abs: true, k: [K(0, RH), K(0.35, off(RH, [-0.8, 0.8, -0.5])), K(0.6, off(RH, [0.3, -0.2, 0])), K(1, off(RH, [0.3, -0.2, 0]))] },
        },
        vis: { pin: [[0.8, 1, false]] },
      },
      throw: {
        dur: 0.6,
        hold: true,
        tracks: {
          rhand: { abs: true, k: [K(0, off(RH, [0.3, -0.2, 0])), K(0.3, handPose([8.0, -3.0, -9.5], [0.2, 0.8, 0.5], [-0.9, 0.1, 0.3]), 'out2'),
            K(0.5, handPose([2.5, -4.5, -17], [0.1, -0.3, -1], [-0.8, -0.5, 0]), 'in2'), K(0.75, handPose([4, -15, -14], [0, -0.9, -0.4], [-0.6, -0.4, 0.6]), 'io'), K(1, handPose([5, -30, -10], [0, -0.9, -0.4], [-0.6, -0.4, 0.6]))] },
        },
        vis: { grenade: [[0.47, 1, false]], pin: [[0, 1, false]] },
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
    draw: { dur: 1.0, tracks: {
      bomb: [[0, [0, -10, 4], [-30, 0, 0]], [0.55, [0, 0.3, 0], [2, 0, 0], 'out2'], [0.75, Z, Z, 'io']],
      rhand: [[0, [0, -12, 4], Z], [0.15, [0, -12, 4], Z], [0.65, Z, Z, 'out2']],
    } },
    plant: { dur: 3.0, hold: true, tracks: {
      rhand: { abs: true, k: rk },
      bomb: [[0, Z, Z], [0.8, Z, Z], [0.86, [0, 0.4, -0.5], [3, 0, 0], 'out2'], [1, [0, -14, -2], [-20, 0, 0], 'in2']],
    } },
  };
  return { anims };
}

export const MISC = { _hands, knife, hegrenade: grenade('he'), flashbang: grenade('flash'), smokegrenade: grenade('smoke'), c4 };
