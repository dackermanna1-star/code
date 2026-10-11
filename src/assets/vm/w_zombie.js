// Zombie survival weapons: molotov, flamethrower, RPG-7, M32 grenade launcher, medkit,
// minigun, AA-12, Barrett M82, chainsaw, tesla gun.
// Flames (the rag, the lighter, the pilot light, the flamethrower's jet) are unlit
// additive meshes added in spec.post and flickered every frame.
import * as THREE from 'three';
import { C, hold, idle, rifleRig } from './kit.js';
import { arm, handPose } from './hands.js';
import { Z } from './anim.js';
import { add, chain, rel } from './pose.js';
import { pistolGrip, triggerGuard, muzzle, ring } from './parts.js';

// ---------------------------------------------------------------- flames
let flameGeo = null, coreGeo = null;
function flameMesh(color, opacity = 0.9) {
  flameGeo ??= new THREE.ConeGeometry(1, 1, 8, 1, true).translate(0, 0.5, 0);
  return new THREE.Mesh(flameGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
}
function coreMesh(color, opacity = 0.9) {
  coreGeo ??= new THREE.SphereGeometry(1, 8, 6);
  return new THREE.Mesh(coreGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
}
/** A small flickering flame on a node: an outer orange cone, an inner yellow one, a glow. */
function addFlame(node, size, o = {}) {
  const g = new THREE.Group();
  const outer = flameMesh(o.outer ?? 0xff6a10, 0.75), inner = flameMesh(o.inner ?? 0xffe070, 0.9), glow = coreMesh(o.glow ?? 0xff8020, 0.35);
  outer.scale.set(0.5 * size, 1.6 * size, 0.5 * size);
  inner.scale.set(0.28 * size, 1.0 * size, 0.28 * size);
  glow.scale.setScalar(0.9 * size);
  g.add(outer, inner, glow);
  node.add(g);
  g.userData = { outer, inner, glow, size, seed: Math.random() * 10 };
  return g;
}
function flicker(g, t, k = 1) {
  const u = g.userData, s = u.size * k;
  const f = 1 + 0.18 * Math.sin(t * 31 + u.seed) + 0.12 * Math.sin(t * 17.3 + u.seed * 2);
  u.outer.scale.set(0.5 * s * (2 - f) * 0.9, 1.6 * s * f, 0.5 * s * (2 - f) * 0.9);
  u.inner.scale.set(0.28 * s, 1.0 * s * (0.8 + 0.3 * f), 0.28 * s);
  u.glow.scale.setScalar(0.9 * s * f);
  g.rotation.y = t * 3;
}
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;

// ---------------------------------------------------------------- molotov
function bottle(mb) {
  const g = mb.pen('grenade');
  const up = { r: [-90, 0, 0] }; // lathe axis Z -> Y
  g.lathe('flat', [0.5, 0.78, 0.36], [[0, -2.5], [1.05, -2.5], [1.25, -2.2], [1.25, 0.8], [1.0, 1.35], [0.5, 1.75], [0.42, 2.9], [0.5, 3.05], [0, 3.05]], { n: 10, ...up });
  g.lathe('flat', [0.85, 0.75, 0.52], [[1.27, -1.5], [1.27, 0.2]], { n: 10, ...up }); // paper label
  // rag stuffed in the neck, a strip hanging down the side
  g.lathe('sleeve', [0.82, 0.74, 0.6], [[0, 2.7], [0.52, 2.8], [0.62, 3.4], [0.5, 4.0], [0.2, 4.4], [0, 4.45]], { n: 7, ...up });
  g.box('sleeve', [0.75, 0.66, 0.52], 0.7, 2.4, 0.15, { p: [0.55, 2.6, 0.2], r: [0, 0, 12] });
}

function molotov(mb) {
  hold(mb, [0, 0, 0]);
  const RH = handPose([5.2, -5.3, -8.8], [0.355, -0.0835, -0.922], [-0.82, -0.5, -0.27]);
  mb.node('rhand', 'rig', RH.p, RH.r);
  arm(mb, 'rhand_arm', 'rhand', 'R', { p: [0, 0, 0], fwd: [0, 0, -1], palm: [0, -1, 0], elbow: [14, -28, -2], grip: 'hold', len: 18 });
  const G0 = { p: [-0.2, -1.75, -3.2], r: [0, 0, 90] };
  mb.node('grenade', 'rhand', G0.p, G0.r);
  bottle(mb);
  const rf = mb.node('rag_flame', 'grenade', [0, 4.3, 0]);
  rf.visible = false; rf.userData.defVisible = false;
  // left hand: parked below; comes up with a lighter to the rag
  const LA = handPose([-9, -24, -6], [0.5, 0.6, -0.6], [0.6, -0.2, -0.7]);
  mb.node('lhand', 'rig', LA.p, LA.r);
  arm(mb, 'lhand_arm', 'lhand', 'L', { p: [0, 0, 0], fwd: [0, 0, -1], palm: [0, -1, 0], elbow: [-12, -26, -4], pole: [-0.3, -1, 0.15], grip: 'hold', len: 18 });
  const lt = mb.node('lighter', 'lhand', [0.4, -0.6, -4.2], [0, 0, 0]);
  lt.visible = false; lt.userData.defVisible = false;
  const L = mb.pen('lighter');
  L.box('brushed', C.steel, 1.0, 1.7, 0.55, { p: [0, 0.4, 0] });
  L.box('brushed', C.silver, 1.0, 0.5, 0.55, { p: [0, 1.5, 0] });
  const lf = mb.node('lighter_flame', 'lighter', [0, 1.9, 0]);
  lf.visible = false; lf.userData.defVisible = false;
  const K = (u, h, e) => [u, h.p, h.r, e];
  const off = (h, d, dr = [0, 0, 0]) => ({ p: add(h.p, d), r: add(h.r, dr) });
  const RHp = off(RH, [-1.4, 1.1, -0.8], [6, 12, 14]);
  const RHc = off(RH, [1.6, 2.6, 1.2], [-24, -8, 18]);
  const RHb = off(RH, [4.5, 4.8, 3.6], [-45, -16, 30]);
  // the lighter's flame under the rag: place the hand so its flame point is just below it
  const ragAt = chain(chain(RHp, G0), { p: [0.2, 3.6, 0.2], r: [0, 0, 0] });
  const lpr = handPose([0, 0, 0], [0.75, 0.2, -0.62], [0.1, -0.9, -0.4]);
  const tip = chain(lpr, { p: [0.4, 1.3, -4.2], r: [0, 0, 0] }).p;
  const LP = { p: add(ragAt.p, [-tip[0], -tip[1] - 0.6, -tip[2]]), r: lpr.r };
  const LPout = off(LP, [-4.5, -2.0, 2.0], [0, 15, -35]);
  const anims = {
    idle: idle({ amp: 1 }),
    draw: { dur: 0.75, blend: 0.05, tracks: {
      rhand: { abs: true, k: [K(0, off(RH, [2.5, -11, 4], [40, 10, -20])), K(0.42, off(RH, [0.5, -1.5, 0.6], [6, 2, -4]), 'cr'), K(0.66, off(RH, [0, 0.35, -0.1], [-2, 0, 1]), 'cr'), K(0.86, RH, 'io')] },
      body: [[0, [0, -0.4, 0.2], [-1, 0, 0]], [0.6, Z, [0.4, 0, 0], 'out2'], [0.9, Z, Z, 'io']],
    } },
    pinpull: {
      dur: 0.95, hold: true, blend: 0.05,
      tracks: {
        rhand: { abs: true, k: [K(0, RH), K(0.25, RHp, 'io'), K(0.62, RHp), K(1, RHc, 'io')] },
        lhand: { abs: true, k: [K(0, LA), K(0.22, off(LP, [-2.5, -6, 2.5], [-10, 0, 20]), 'cr'), K(0.36, LP, 'io'), K(0.55, LP), K(0.7, LPout, 'in2'), K(1, off(LA, [0, -2, 0]), 'in2')] },
        body: [[0, Z, Z], [0.3, [0, -0.15, 0], [0.6, -1.0, 0], 'io'], [0.6, [0, 0, 0.1], [-0.3, 1.0, 0], 'out2'], [1, [0, 0.1, 0.3], [0.8, -1.2, 0], 'io']],
      },
      vis: { lighter: [[0.1, 0.85, true]], lighter_flame: [[0.38, 0.62, true]], rag_flame: [[0.5, 1, true]] },
    },
    throw: {
      dur: 0.6, hold: true, blend: 0.04,
      tracks: {
        rhand: { abs: true, k: [K(0, RHc), K(0.16, RHb, 'out2'),
          K(0.34, handPose([3.0, -3.4, -16.5], [0.05, -0.4, -0.9], [-0.7, -0.6, 0.3]), 'in2'),
          K(0.55, handPose([1.0, -13, -13], [-0.1, -0.9, -0.4], [-0.6, -0.4, 0.6]), 'out2'),
          K(1, handPose([3, -30, -9], [0, -0.9, -0.4], [-0.6, -0.4, 0.6]), 'io')] },
        lhand: { abs: true, k: [K(0, off(LA, [0, -2, 0]))] },
        body: [[0, [0, 0.1, 0.3], [0.8, -1.2, 0]], [0.16, [0, 0.25, 0.7], [1.6, -3.5, -0.5], 'out2'], [0.36, [0, -0.35, -1.4], [-3.0, 4.5, 1.0], 'in2'], [0.6, [0, -0.2, -0.6], [-1.2, 2.0, 0.4], 'out2'], [1, Z, Z, 'io']],
      },
      vis: { grenade: [[0.33, 1, false]], rag_flame: [[0, 0.33, true]] },
    },
  };
  mb.marker('muzzle', 'grenade', [0, 0, 0]);
  let fl = null;
  return {
    anims, muzzle: 'muzzle', shell: 'muzzle',
    post(vm) {
      if (!fl) fl = [addFlame(vm.nodes.rag_flame, 0.9), addFlame(vm.nodes.lighter_flame, 0.35, { outer: 0xff9a30, inner: 0xfff0a0 })];
      const t = now();
      flicker(fl[0], t);
      flicker(fl[1], t, 0.9);
    },
  };
}

// ---------------------------------------------------------------- flamethrower
function flamethrower(mb) {
  hold(mb, [7.0, -7.6, -15.2], [-1, -0.5, -10], 1.1);
  mb.node('gun', 'rig');
  const g = mb.pen('gun');
  const B = C.black, D = C.dark;
  // receiver / valve body
  g.prism('metal', D, [[-5.0, 0.0], [8.0, 0.0], [8.0, 2.6], [-4.6, 2.6], [-5.0, 2.2]], 1.7, { bev: 0.25 });
  g.span('metal', C.steel, -2.0, 5.0, 2.6, 2.9, 0.9);
  g.cyl('metal', C.red, 0.55, 0.55, 0.5, { n: 8, p: [0.95, 1.6, -2.0], r: [0, 90, 0] }); // valve knob
  // wand: heat shield over the fuel line, nozzle, igniter
  g.tube('metal', D, 8.0, 23.0, 1.6, 0.48, 0.48, { n: 8 });
  g.tube('ribbed', [0.36, 0.36, 0.37], 9.0, 18.0, 1.6, 0.95, 0.95, { n: 10 });
  g.tube('metal', B, 23.0, 25.8, 1.6, 0.62, 0.8, { n: 10 });
  ring(g, 25.6, 1.6, 0.82, 0.14, C.steel, 10);
  g.tube('metal', C.brass, 21.0, 24.6, 0.55, 0.18, 0.18, { n: 6 }); // igniter line
  g.span('metal', B, 20.6, 21.6, 0.5, 1.2, 0.5);
  // front vertical grip
  g.prism('polymer', B, [[10.6, 0.65], [12.0, 0.65], [11.7, -3.6], [10.3, -3.6]], 1.2, { bev: 0.3 });
  triggerGuard(g, -0.3, 2.4, 0.0, 1.1);
  pistolGrip(g, 'polymer', B);
  g.prism('polymer', D, [[-5.0, 2.0], [-14.6, 1.6], [-15.2, 1.2], [-15.2, -3.2], [-14.4, -3.6], [-8.0, -1.0], [-5.0, 0.2]], 1.5, { bev: 0.3 });
  // fuel tank slung under the receiver (the "magazine")
  mb.node('mag', 'gun', [0, -2.4, -2.6]);
  const m = mb.pen('mag');
  m.tube('metal', C.red, -3.0, 6.2, 0, 1.9, 1.9, { n: 12 });
  m.tube('metal', D, -3.3, -3.0, 0, 1.5, 1.5, { n: 12 });
  m.tube('metal', D, 6.2, 6.5, 0, 1.5, 1.5, { n: 12 });
  m.span('flat', [0.9, 0.8, 0.2], 0.0, 3.0, -0.6, 0.6, 3.86); // hazard band
  m.cyl('metal', C.steel, 0.35, 0.35, 1.4, { n: 6, p: [0, 1.6, -1.5] }); // feed line stub
  mb.node('pilot', 'gun', [0, 0.55, -24.9]);
  mb.node('jet', 'gun', [0, 1.6, -26.0]);
  mb.marker('muzzle', 'gun', [0, 1.6, -26.2]);
  mb.marker('shell', 'gun', [0, 1.6, -26.2]);
  const { anims } = rifleRig(mb, {
    kick: 0.25, shootDur: 0.25,
    lh: { at: [0, -1.4, 11.2], fwd: [0.1, -0.15, -1], palm: [1, 0.05, 0], grip: 'hold' },
    mag: { at: [-1.6, -2.4, 4.0], out: { p: [0, -2.6, 0.2], r: [6, 0, -8] }, ins: { p: [0, -3.6, 0.2], r: [8, 0, -6] } },
    bolt: 0,
    reload: 3.2,
  });
  let pilot = null, jet = null;
  return {
    anims, muzzle: 'muzzle', shell: 'shell',
    post(vm) {
      if (!pilot) {
        pilot = addFlame(vm.nodes.pilot, 0.5, { outer: 0x3070ff, inner: 0x9fd0ff, glow: 0x4080ff });
        pilot.rotation.x = 0;
        const j = new THREE.Group();
        j.rotation.x = -Math.PI / 2; // cone axis (+Y) along the barrel (-Z)
        vm.nodes.jet.add(j);
        jet = { group: j, a: addFlame(j, 3.2), b: addFlame(j, 2.2, { outer: 0xffa030, inner: 0xffffc0 }) };
        jet.a.position.y = 2;
        jet.b.position.y = 6;
      }
      const t = now();
      flicker(pilot, t, 0.9);
      const on = !!vm.state.flaming;
      jet.group.visible = on;
      if (on) { flicker(jet.a, t, 1.2); flicker(jet.b, t * 1.3, 1.6); jet.a.scale.y = 1.6; jet.b.scale.y = 2.4; }
    },
  };
}

// ---------------------------------------------------------------- RPG-7
function rpg(mb) {
  hold(mb, [8.4, -6.4, -14.0], [-1, -0.5, -7], 0.85);
  mb.node('gun', 'rig');
  const g = mb.pen('gun');
  const O = [0.3, 0.33, 0.24], B = C.black;
  const Y = 2.6;
  g.tube('metal', O, -20.0, 22.0, Y, 1.15, 1.15, { n: 12 });
  g.tube('metal', O, -23.5, -20.0, Y, 1.75, 1.2, { n: 12 }); // venturi flare
  g.tube('metal', C.bore, -23.6, -23.4, Y, 1.55, 1.55, { n: 12 });
  g.tube('wood', C.woodDark, -1.0, 9.0, Y, 1.5, 1.5, { n: 12 }); // wooden heat guard
  for (const f of [-1.0, 9.0]) ring(g, f, Y, 1.55, 0.25, B, 12);
  g.span('metal', C.dark, -1.8, 3.2, 0.3, 1.6, 1.0); // trigger housing under the tube
  triggerGuard(g, -0.3, 2.4, 0.0, 1.1);
  pistolGrip(g, 'polymer', B);
  g.span('metal', C.dark, 7.2, 10.2, 0.5, 1.6, 0.9);
  g.prism('wood', C.woodDark, [[7.6, 0.6], [9.0, 0.6], [8.7, -2.8], [7.4, -2.8]], 1.1, { bev: 0.3 }); // front grip
  // optical sight on the left
  g.span('metal', B, 1.0, 4.0, 3.2, 3.8, 0.5, { x: -1.4 });
  g.tube('metal', B, 0.6, 5.2, 4.4, 0.55, 0.55, { n: 8, x: -1.9 });
  g.span('metal', B, 14.0, 14.6, Y + 1.15, Y + 2.0, 0.3); // front sight
  // the warhead (PG-7): rides in the muzzle, gone after a shot
  mb.node('mag', 'gun', [0, Y, -22.0]);
  const w = mb.pen('mag');
  w.tube('metal', [0.25, 0.27, 0.2], -1.0, 1.0, 0, 0.95, 0.95, { n: 10 });
  w.tube('metal', O, 1.0, 3.6, 0, 2.15, 2.15, { n: 12 });
  w.tube('metal', O, 3.6, 6.0, 0, 2.15, 1.45, { n: 12 });
  w.tube('metal', O, 6.0, 8.2, 0, 1.45, 0.7, { n: 12 });
  w.tube('metal', C.dark, 8.2, 9.4, 0, 0.7, 0.25, { n: 8 });
  mb.marker('muzzle', 'gun', [0, Y, -24.0]);
  mb.marker('shell', 'gun', [0, Y, 23.0]);
  const r = rifleRig(mb, {
    kick: 2.6, shootDur: 0.7, shootOpts: { bodyUp: 1.2 },
    lh: { at: [0, -1.2, 8.1], fwd: [0.1, -0.2, -1], palm: [1, 0.1, 0], grip: 'hold' },
    reload: false,
  });
  // reload: hand drops out of view, comes back with a fresh warhead, pushes it in
  const LH = r.LHP;
  const M0 = { p: [0, Y, -22.0], r: [0, 0, 0] };
  const INS = handPose([-2.6, Y - 1.6, -26.5], [0.25, 0.35, -0.9], [1, 0.1, 0.2]);
  const inHand = rel(INS, M0);
  mb.clone('mag', 'mag_new', 'lhand', inHand.p, inHand.r);
  const K = (u, h, e) => [u, h.p, h.r, e];
  const off = (h, d, dr = [0, 0, 0]) => ({ p: add(h.p, d), r: add(h.r, dr) });
  const away = handPose([-10, -22, 4], [0.3, -0.2, -0.93], [1, 0.4, 0]);
  const tilt = { p: [-2.5, 2.4, 1.5], r: [6, 16, -12] };
  r.anims.reload = {
    dur: 2.4, hold: false, blend: 0.08,
    tracks: {
      rig: [[0, Z, Z], [0.15, tilt.p, tilt.r, 'io'], [0.82, tilt.p, tilt.r], [1, Z, Z, 'io']],
      lhand: { abs: true, k: [K(0, LH), K(0.16, off(LH, [-2, -6, 3], [0, 0, 20]), 'cr'), K(0.3, away, 'io'), K(0.42, away), K(0.58, off(INS, [-1, -1, -7], [0, 0, 10]), 'io'), K(0.66, off(INS, [0, 0, -5]), 'cr'), K(0.74, INS, 'in2'), K(0.8, INS), K(0.92, off(LH, [-1, -2, 1]), 'cr'), K(1, LH, 'io')] },
    },
    vis: { mag: [[0, 0.74, false], [0.74, 1, true]], mag_new: [[0.4, 0.74, true]] },
  };
  return {
    anims: r.anims, muzzle: 'muzzle', shell: 'shell',
    post(vm) {
      if (vm.currentAnimation !== 'reload' && vm.state.empty) vm.nodes.mag.visible = false;
      if (vm.currentAnimation !== 'reload' && vm.nodes.mag_new) vm.nodes.mag_new.visible = false;
    },
  };
}

// ---------------------------------------------------------------- M32
function m32(mb) {
  hold(mb, [7.0, -7.4, -14.8], [-1, -0.5, -9], 1.1);
  mb.node('gun', 'rig');
  const g = mb.pen('gun');
  const B = C.black, D = C.dark;
  const Y = 1.7;
  g.tube('metal', D, 7.6, 18.0, Y, 0.95, 0.95, { n: 10 }); // barrel
  muzzle(g, 18.0, 0.6, Y, 1.05, B, 10);
  g.span('metal', B, -1.2, 8.0, 3.3, 3.9, 1.3); // top strap
  g.span('metal', B, -1.2, 1.2, -0.2, 3.9, 1.6); // frame (rear of the drum)
  g.span('metal', B, 7.2, 8.0, -0.6, 3.9, 1.6); // frame (front)
  g.span('metal', D, 8.0, 16.0, 0.3, 0.9, 1.6); // rail
  g.prism('polymer', B, [[9.6, 0.4], [10.9, 0.4], [10.6, -3.4], [9.3, -3.4]], 1.15, { bev: 0.3 }); // foregrip
  g.span('metal', B, 2.0, 5.5, 3.9, 4.6, 0.6); // sight rail
  g.span('metal', C.steel, 4.6, 5.1, 4.6, 5.5, 0.4);
  triggerGuard(g, -0.3, 2.4, -0.6, 1.1);
  pistolGrip(g, 'polymer', B);
  g.prism('polymer', D, [[-1.2, 3.0], [-12.8, 2.0], [-13.4, 1.6], [-13.4, -2.6], [-12.6, -3.0], [-6.0, -0.6], [-1.2, 0.4]], 1.4, { bev: 0.3 });
  // the revolving drum (swapped as the "magazine")
  mb.node('mag', 'gun', [0, 0.8, -4.4]);
  const m = mb.pen('mag');
  m.tube('metal', [0.24, 0.24, 0.25], -3.2, 3.2, 0, 2.5, 2.5, { n: 12 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    m.tube('metal', C.brass, 3.15, 3.3, Math.sin(a) * 1.5, 0.55, 0.55, { n: 8, x: Math.cos(a) * 1.5 });
    m.span('metal', [0.16, 0.16, 0.17], -3.0, 3.0, Math.sin(a + 0.52) * 2.4 - 0.15, Math.sin(a + 0.52) * 2.4 + 0.15, 0.3, { x: Math.cos(a + 0.52) * 2.4 });
  }
  mb.marker('muzzle', 'gun', [0, Y, -18.8]);
  mb.marker('shell', 'gun', [0, Y, -18.8]);
  const { anims } = rifleRig(mb, {
    kick: 1.9, shootDur: 0.5, shootOpts: { bodyUp: 0.8 },
    lh: { at: [0, -1.1, 10.2], fwd: [0.1, -0.15, -1], palm: [1, 0.05, 0], grip: 'hold' },
    mag: { at: [-2.6, 0.8, 4.4], out: { p: [-3.2, -2.0, 0], r: [0, 0, -30] }, ins: { p: [-3.4, -2.6, 0], r: [0, 0, -24] } },
    bolt: 0,
    reload: 3.6,
  });
  return { anims, muzzle: 'muzzle', shell: 'shell' };
}

// ---------------------------------------------------------------- medkit
// A red first-aid pouch in the right hand; the use: the left hand comes up with an
// auto-injector from the pouch and jabs it home, the pouch dips with it.
function medkit(mb) {
  hold(mb, [0, 0, 0]);
  const RH = handPose([4.6, -4.4, -9.6], [0.355, -0.0835, -0.922], [-0.82, -0.5, -0.27]);
  mb.node('rhand', 'rig', RH.p, RH.r);
  arm(mb, 'rhand_arm', 'rhand', 'R', { p: [0, 0, 0], fwd: [0, 0, -1], palm: [0, -1, 0], elbow: [14, -28, -2], grip: 'hold', len: 18 });
  mb.node('kit', 'rhand', [-0.2, -1.9, -3.4], [0, 0, 90]);
  const k = mb.pen('kit');
  const RED = [0.74, 0.1, 0.08], WH = [0.96, 0.96, 0.92], DK = [0.2, 0.06, 0.05];
  const S = 1.8; // half size of the (square) pouch
  k.box('flat', RED, 2 * S, 2.8, 2 * S, { p: [0, 0.2, 0], t: [0.92, 0.92] }); // pouch
  k.box('flat', DK, 2 * S + 0.08, 0.14, 2 * S + 0.08, { p: [0, 1.0, 0] }); // zip all round
  k.box('flat', DK, 1.6, 0.35, 0.5, { p: [0, 1.75, 0] }); // carry strap
  for (const sg of [1, -1]) { // a white cross on every side
    k.box('flat', WH, 0.06, 1.7, 0.55, { p: [sg * (S + 0.03), 0.05, 0] });
    k.box('flat', WH, 0.06, 0.55, 1.7, { p: [sg * (S + 0.03), 0.05, 0] });
    k.box('flat', WH, 0.55, 1.7, 0.06, { p: [0, 0.05, sg * (S + 0.03)] });
    k.box('flat', WH, 1.7, 0.55, 0.06, { p: [0, 0.05, sg * (S + 0.03)] });
  }
  // left hand, parked below; the injector it brings up
  const LA = handPose([-9, -24, -6], [0.5, 0.6, -0.6], [0.6, -0.2, -0.7]);
  mb.node('lhand', 'rig', LA.p, LA.r);
  arm(mb, 'lhand_arm', 'lhand', 'L', { p: [0, 0, 0], fwd: [0, 0, -1], palm: [0, -1, 0], elbow: [-12, -26, -4], pole: [-0.3, -1, 0.15], grip: 'hold', len: 18 });
  const inj = mb.node('injector', 'lhand', [0.4, -0.4, -4.2], [0, 0, 0]);
  inj.visible = false; inj.userData.defVisible = false;
  const I = mb.pen('injector');
  I.box('flat', WH, 1.0, 4.4, 1.0, { p: [0, 0.4, 0] }); // body
  I.box('flat', [0.95, 0.75, 0.1], 1.05, 1.0, 1.05, { p: [0, 3.0, 0] }); // yellow cap
  I.box('flat', [0.3, 0.75, 0.3], 1.04, 0.5, 1.04, { p: [0, 1.6, 0] }); // green band
  I.box('brushed', C.steel, 0.25, 1.2, 0.25, { p: [0, -2.4, 0] }); // needle
  const K = (u, h, e) => [u, h.p, h.r, e];
  const off = (h, d, dr = [0, 0, 0]) => ({ p: add(h.p, d), r: add(h.r, dr) });
  // injector up in front (needle down), then the jab down out of view
  const LP = handPose([-2.2, -3.6, -11.5], [0.75, 0.2, -0.62], [0.1, -0.9, -0.4]);
  const LPin = off(LP, [-1.5, -5.5, 2.0], [-10, 0, 15]);
  const LPjab = off(LP, [0.6, -9.5, 1.2], [18, 0, -6]);
  const RHd = off(RH, [-1.2, -1.4, 0.4], [8, 6, 10]);
  const anims = {
    idle: idle({ amp: 1 }),
    draw: { dur: 0.75, blend: 0.05, tracks: {
      rhand: { abs: true, k: [K(0, off(RH, [2.5, -11, 4], [40, 10, -20])), K(0.42, off(RH, [0.5, -1.5, 0.6], [6, 2, -4]), 'cr'), K(0.66, off(RH, [0, 0.35, -0.1], [-2, 0, 1]), 'cr'), K(0.86, RH, 'io')] },
      body: [[0, [0, -0.4, 0.2], [-1, 0, 0]], [0.6, Z, [0.4, 0, 0], 'out2'], [0.9, Z, Z, 'io']],
    } },
    use: {
      dur: 1.4, blend: 0.05,
      tracks: {
        rhand: { abs: true, k: [K(0, RH), K(0.2, RHd, 'io'), K(0.75, RHd), K(1, RH, 'io')] },
        lhand: { abs: true, k: [K(0, LA), K(0.16, LPin, 'cr'), K(0.34, LP, 'io'), K(0.46, LP), K(0.53, LPjab, 'in2'), K(0.72, LPjab), K(0.92, off(LA, [0, -2, 0]), 'io'), K(1, LA)] },
        body: [[0, Z, Z], [0.46, [0, 0.1, 0], [0.4, 0, 0], 'io'], [0.54, [0, -0.5, 0.3], [-1.6, 0.5, 0], 'in2'], [0.75, [0, -0.3, 0.1], [-0.8, 0.3, 0], 'out2'], [1, Z, Z, 'io']],
      },
      vis: { injector: [[0.12, 0.9, true]] },
    },
  };
  mb.marker('muzzle', 'kit', [0, 0, 0]);
  return { anims, muzzle: 'muzzle', shell: 'muzzle' };
}

// ---------------------------------------------------------------- M134 minigun
// The barrel cluster spins with vm.state.spin (0..1, set by the game from the weapon).
function minigun(mb) {
  hold(mb, [7.6, -8.4, -16.0], [-1, -1.5, -6], 0.8);
  mb.node('gun', 'rig');
  const g = mb.pen('gun');
  const B = C.black, D = C.dark, Y = 1.4;
  g.span('metal', D, -6.0, 6.0, -1.6, 3.6, 3.8); // receiver
  g.tube('metal', [0.3, 0.3, 0.32], -10.0, -6.0, 1.0, 1.9, 1.9, { n: 10 }); // motor
  ring(g, -8.0, 1.0, 1.95, 0.4, C.steel, 10);
  g.span('metal', B, -3.0, 4.0, 3.6, 4.2, 1.0); // top rail
  g.span('metal', B, -2.4, -1.8, 4.2, 5.4, 0.5); g.span('metal', B, 2.8, 3.4, 4.2, 5.4, 0.5); g.span('metal', B, -2.4, 3.4, 5.0, 5.4, 0.5); // carry handle
  g.prism('polymer', B, [[3.4, -1.6], [4.8, -1.6], [4.5, -5.6], [3.1, -5.6]], 1.2, { bev: 0.3 }); // front handle
  triggerGuard(g, -0.3, 2.4, -1.6, 1.1);
  pistolGrip(g, 'polymer', B, { f: 0 });
  mb.node('barrels', 'gun', [0, Y, -6.0]);
  const b = mb.pen('barrels');
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; b.tube('metal', B, 0, 26, Math.sin(a) * 1.25, 0.42, 0.42, { n: 6, x: Math.cos(a) * 1.25 }); }
  b.tube('metal', D, 0, 1.0, 0, 1.9, 1.9, { n: 10 });
  for (const f of [9.0, 24.5]) b.tube('metal', [0.36, 0.36, 0.38], f, f + 1.0, 0, 2.05, 2.05, { n: 10 }); // clamps
  b.tube('metal', C.bore, 26, 26.05, 0, 0.6, 0.6, { n: 6 });
  mb.node('mag', 'gun', [-3.6, -1.2, 1.0]);
  const m = mb.pen('mag');
  m.span('metal', C.olive, -3.0, 3.0, -3.2, 2.0, 2.8); // ammo box
  m.span('metal', B, -0.9, 0.9, 2.0, 3.6, 1.0, { x: 0.8 }); // feed chute
  mb.marker('muzzle', 'gun', [0, Y, -32.5]);
  mb.marker('shell', 'gun', [1.8, 1.0, -1.0]);
  const { anims } = rifleRig(mb, {
    kick: 0.25, shootDur: 0.1,
    lh: { at: [0, -3.6, 4.0], fwd: [0.1, -0.15, -1], palm: [1, 0.05, 0], grip: 'hold' },
    mag: { at: [-3.6, -1.2, 1.0], out: { p: [-1, -3.0, 0.2], r: [6, 0, -10] }, ins: { p: [-1, -4.0, 0.2], r: [8, 0, -8] } },
    bolt: 0,
    reload: 5.0,
  });
  let ang = 0, last = now();
  return {
    anims, muzzle: 'muzzle', shell: 'shell',
    post(vm) {
      const t = now(), dt = Math.min(0.1, t - last);
      last = t;
      ang += (vm.state.spin || 0) * 30 * dt;
      vm.nodes.barrels.rotation.z = ang;
    },
  };
}

// ---------------------------------------------------------------- AA-12
function aa12(mb) {
  hold(mb, [7.0, -7.6, -15.2], [-1, -0.5, -9], 1.1);
  mb.node('gun', 'rig');
  const g = mb.pen('gun');
  const B = C.black, D = C.dark;
  g.span('metal', D, -5.0, 9.0, -0.2, 3.0, 1.9); // receiver
  g.span('metal', B, -3.0, 8.0, 3.0, 3.5, 0.9); // rail
  g.span('metal', B, -1.0, 4.5, 3.5, 4.4, 0.6); // carry handle
  g.span('metal', B, 6.6, 7.4, 3.5, 4.6, 0.3); // front sight
  g.tube('ribbed', [0.3, 0.3, 0.31], 9.0, 19.0, 1.9, 1.0, 1.0, { n: 10 }); // vented shroud
  g.tube('metal', B, 19.0, 24.0, 1.9, 0.6, 0.6, { n: 8 });
  muzzle(g, 24.0, 0.8, 1.9, 0.75, B, 8);
  triggerGuard(g, -0.3, 2.4, -0.2, 1.1);
  pistolGrip(g, 'polymer', B);
  g.prism('polymer', B, [[-5.0, 2.8], [-14.0, 2.4], [-14.6, 2.0], [-14.6, -2.6], [-13.8, -3.0], [-8.0, -0.6], [-5.0, 0.2]], 1.5, { bev: 0.3 });
  mb.node('mag', 'gun', [0, -0.2, -6.4]);
  const m = mb.pen('mag');
  m.span('metal', B, -0.9, 0.9, -1.0, 0.0, 1.4); // drum neck
  m.cyl('metal', D, 2.4, 2.4, 2.2, { n: 14, r: [0, 90, 0], p: [1.1, -3.2, 0] }); // drum
  m.cyl('metal', C.grey, 0.9, 0.9, 2.3, { n: 10, r: [0, 90, 0], p: [1.15, -3.2, 0] });
  mb.marker('muzzle', 'gun', [0, 1.9, -25.0]);
  mb.marker('shell', 'gun', [1.0, 2.0, -3.0]);
  const { anims } = rifleRig(mb, {
    kick: 1.6, shootDur: 0.22,
    lh: { at: [0, 0.4, 13.0], fwd: [0.1, -0.2, -1], palm: [1, 0.1, 0], grip: 'hold' },
    mag: { at: [-1.2, -0.2, 6.4], out: { p: [0, -4.0, 0.2], r: [10, 0, -8] }, ins: { p: [0, -5.0, 0.2], r: [12, 0, -6] } },
    bolt: 0,
    reload: 3.0,
  });
  return { anims, muzzle: 'muzzle', shell: 'shell' };
}

// ---------------------------------------------------------------- Barrett M82
function barrett(mb) {
  hold(mb, [7.4, -7.4, -15.6], [1, 3, -7], 0.85);
  mb.node('gun', 'rig');
  const g = mb.pen('gun');
  const B = C.black, D = C.dark, Y = 2.0;
  g.span('metal', D, -6.0, 12.0, 0.0, 3.2, 2.1); // receiver
  g.span('metal', B, -4.0, 10.0, 3.2, 3.6, 1.0); // rail
  g.span('metal', D, 12.0, 22.0, 0.6, 3.2, 2.0); // handguard
  g.tube('metal', B, 22.0, 36.0, Y, 0.75, 0.75, { n: 8 }); // barrel
  g.span('metal', B, 36.0, 39.6, 0.9, 3.1, 2.6); // muzzle brake
  for (const f of [36.8, 38.2]) g.span('metal', C.bore, f, f + 0.6, 1.3, 2.7, 2.65);
  g.tube('metal', B, -1.0, 8.0, 4.7, 0.62, 0.62, { n: 10 }); // scope
  g.tube('metal', B, -2.2, -1.0, 4.7, 0.85, 0.62, { n: 10 });
  g.tube('metal', B, 8.0, 9.6, 4.7, 0.62, 0.95, { n: 10 });
  g.tube('glass', [0.25, 0.45, 0.6], 9.6, 9.65, 4.7, 0.85, 0.85, { n: 10 });
  for (const f of [0.5, 6.0]) g.span('metal', B, f, f + 0.8, 3.6, 4.2, 0.7);
  for (const x of [-0.7, 0.7]) g.span('metal', B, 22.5, 32.0, -0.5, 0.0, 0.35, { x }); // folded bipod
  triggerGuard(g, -0.3, 2.4, 0.0, 1.1);
  pistolGrip(g, 'polymer', B);
  g.prism('polymer', D, [[-6.0, 3.0], [-17.0, 2.6], [-17.6, 2.0], [-17.6, -3.2], [-16.6, -3.6], [-9.0, -1.0], [-6.0, 0.2]], 1.8, { bev: 0.3 });
  mb.node('mag', 'gun', [0, -0.1, -4.5]);
  mb.pen('mag').span('metal', B, -2.0, 2.0, -4.6, 0.0, 1.6);
  mb.marker('muzzle', 'gun', [0, Y, -40.0]);
  mb.marker('shell', 'gun', [1.2, 2.0, -3.0]);
  const { anims } = rifleRig(mb, {
    kick: 3.4, shootDur: 0.5, shootOpts: { bodyUp: 1.2 },
    lh: { at: [0, 0.2, 16.0], fwd: [0.1, -0.2, -1], palm: [1, 0.1, 0], grip: 'hold' },
    mag: { at: [-1.2, -0.1, 4.5], out: { p: [0, -4.2, 0.4], r: [10, 0, -8] }, ins: { p: [0, -5.2, 0.4], r: [12, 0, -6] } },
    bolt: 0,
    reload: 3.6,
  });
  return { anims, muzzle: 'muzzle', shell: 'shell' };
}

// ---------------------------------------------------------------- chainsaw
// Shakes while it idles, shakes harder and runs its chain while it cuts (vm.state.sawing).
function chainsaw(mb) {
  hold(mb, [8.6, -10.2, -15.0], [9, 13, -8], 0.8);
  mb.node('gun', 'rig');
  const g = mb.pen('gun');
  const B = C.black, OR = [0.86, 0.38, 0.08];
  g.span('polymer', OR, -5.0, 4.0, -1.6, 3.4, 3.4); // engine housing
  g.span('metal', C.dark, -3.6, 1.6, -1.8, 0.2, 3.6); // cylinder / muffler
  g.cyl('polymer', B, 0.5, 0.5, 0.4, { n: 8, p: [1.8, 2.6, 2.0], r: [0, 90, 0] }); // fuel cap
  g.span('polymer', B, -0.5, 0.3, 3.4, 6.2, 0.7); g.span('polymer', B, -0.5, 5.0, 5.6, 6.2, 0.7); g.span('polymer', B, 4.4, 5.0, 3.4, 6.2, 0.7); // top handle
  g.prism('polymer', B, [[-5.0, 0.4], [-9.4, 0.8], [-9.9, 0.1], [-9.9, -2.2], [-9.2, -2.4], [-5.0, -1.6]], 1.1, { bev: 0.3 }); // rear handle
  g.span('metal', C.steel, 4.0, 5.0, -1.0, 2.0, 2.2); // clutch cover
  mb.node('bar', 'gun', [0, 0.5, -4.6]);
  const b = mb.pen('bar');
  b.span('metal', C.silver, 0, 24, -1.0, 1.0, 0.35); // bar
  b.tube('metal', C.silver, 23.6, 24.8, 0, 1.0, 1.0, { n: 10 }); // rounded nose
  mb.node('chain', 'bar', [0, 0, 0]);
  const c = mb.pen('chain');
  for (let f = 0.3; f < 24; f += 1.2) { c.span('metal', B, f, f + 0.7, 1.0, 1.4, 0.5); c.span('metal', B, f, f + 0.7, -1.4, -1.0, 0.5); }
  mb.node('mag', 'gun', [1.8, 2.6, -2.0]);
  mb.marker('muzzle', 'bar', [0, 0, -24.0]);
  mb.marker('shell', 'gun', [0, 0, 0]);
  const { anims } = rifleRig(mb, {
    kick: 0.15, shootDur: 0.2,
    rh: { p: [0.75, -0.6, 7.6], fwd: [0.05, -0.28, -1], palm: [-1, 0, -0.2] },
    lh: { at: [-0.4, 6.4, 7.6], fwd: [1, 0, -0.15], palm: [0, -1, 0.1], grip: 'hold' },
    mag: { at: [1.8, 2.6, 2.0], out: { p: [1.5, 1.5, 0], r: [0, 0, 20] }, ins: { p: [1.5, 0.8, 0], r: [0, 0, 10] } },
    bolt: 0,
    reload: 2.4,
  });
  let base = null, run = 0, last = now();
  return {
    anims, muzzle: 'muzzle', shell: 'shell',
    post(vm) {
      const gun = vm.nodes.gun, t = now(), dt = Math.min(0.1, t - last);
      last = t;
      if (!base) base = gun.position.clone();
      const cut = !!vm.state.sawing, a = cut ? 0.22 : 0.07;
      gun.position.set(base.x + (Math.random() - 0.5) * a, base.y + (Math.random() - 0.5) * a, base.z + (Math.random() - 0.5) * a * 0.5);
      if (cut) { run = (run + dt * 60) % 1.2; vm.nodes.chain.position.z = -run; }
    },
  };
}

// ---------------------------------------------------------------- tesla gun
// Copper coils round a glowing core; arcs crackle across the prongs as it fires (vm.state.zap).
function tesla(mb) {
  hold(mb, [7.4, -7.8, -15.6], [3, 6, -9], 0.95);
  mb.node('gun', 'rig');
  const g = mb.pen('gun');
  const B = C.black, D = C.dark, Y = 1.6;
  g.span('metal', D, -5.0, 8.0, 0.0, 2.8, 1.8); // body
  g.span('metal', B, -3.0, 6.0, 2.8, 3.3, 0.5); // fin
  g.tube('metal', C.steel, 8.0, 22.0, Y, 0.5, 0.5, { n: 8 }); // core rod
  for (let i = 0; i < 5; i++) g.tube('metal', [0.86, 0.5, 0.26], 9.0 + i * 2.6, 10.6 + i * 2.6, Y, 1.75, 1.75, { n: 12 }); // copper coils
  g.span('metal', C.steel, 21.0, 26.0, Y + 1.0, Y + 1.4, 0.5); // prongs
  g.span('metal', C.steel, 21.0, 26.0, Y - 1.4, Y - 1.0, 0.5);
  g.span('metal', D, 20.6, 21.6, Y - 1.6, Y + 1.6, 1.4);
  triggerGuard(g, -0.3, 2.4, -0.2, 1.1);
  pistolGrip(g, 'polymer', B);
  g.prism('polymer', D, [[-5.0, 3.0], [-12.5, 2.4], [-13, 1.6], [-13, -2.2], [-12, -2.6], [-7.0, -0.6], [-5.0, 0.2]], 1.6, { bev: 0.3 });
  mb.node('mag', 'gun', [0, -1.0, -3.0]);
  mb.pen('mag').tube('metal', [0.24, 0.3, 0.34], -2.0, 4.0, -0.8, 1.15, 1.15, { n: 10 }); // power cell
  mb.node('core', 'gun', [0, Y, -15.0]);
  mb.node('arc', 'gun', [0, Y, -25.6]);
  mb.marker('muzzle', 'gun', [0, Y, -26.5]);
  mb.marker('shell', 'gun', [0, Y, -26.5]);
  const { anims } = rifleRig(mb, {
    kick: 1.0, shootDur: 0.25,
    lh: { at: [0, -0.4, 13.0], fwd: [0.1, -0.2, -1], palm: [1, 0.1, 0], grip: 'hold' },
    mag: { at: [-1.2, -1.0, 3.0], out: { p: [0, -3.0, 0.2], r: [8, 0, -8] }, ins: { p: [0, -4.0, 0.2], r: [10, 0, -6] } },
    bolt: 0,
    reload: 3.0,
  });
  let core = null, arcs = null;
  return {
    anims, muzzle: 'muzzle', shell: 'shell',
    post(vm) {
      if (!core) {
        core = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, 13.5, 10, 1, true), new THREE.MeshBasicMaterial({ color: 0x5aa0ff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
        core.rotation.x = Math.PI / 2;
        vm.nodes.core.add(core);
        arcs = [];
        for (let i = 0; i < 3; i++) {
          const m = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.6, 0.12), new THREE.MeshBasicMaterial({ color: 0xcfe2ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
          vm.nodes.arc.add(m);
          arcs.push(m);
        }
      }
      const t = now(), z = vm.state.zap ?? 99, hot = z < 0.14;
      core.material.opacity = (hot ? 0.9 : 0.35) + 0.15 * Math.sin(t * 17);
      arcs.forEach((m, i) => {
        m.visible = hot && Math.random() < 0.8;
        m.position.set((Math.random() - 0.5) * 0.4, 0, (Math.random() - 0.5) * 1.5 - i * 0.4);
        m.rotation.set((Math.random() - 0.5) * 0.6, 0, (Math.random() - 0.5) * 0.9);
      });
    },
  };
}

// ---------------------------------------------------------------- claymore
// Held up by its side, curved face out; 'place' takes it down to the floor out of view.
function claymore(mb) {
  hold(mb, [0, 0, 0]);
  const RH = handPose([4.8, -5.2, -9.6], [0.355, -0.0835, -0.922], [-0.82, -0.5, -0.27]);
  mb.node('rhand', 'rig', RH.p, RH.r);
  arm(mb, 'rhand_arm', 'rhand', 'R', { p: [0, 0, 0], fwd: [0, 0, -1], palm: [0, -1, 0], elbow: [14, -28, -2], grip: 'hold', len: 18 });
  mb.node('mine', 'rhand', [-0.6, -2.0, -3.6], [0, 0, 90]);
  const m = mb.pen('mine');
  const OL = [0.36, 0.4, 0.26];
  m.box('flat', OL, 1.4, 4.2, 6.6, { p: [0, 0.6, 0] }); // body (curved face approximated)
  m.box('flat', [0.3, 0.33, 0.22], 1.6, 3.6, 5.6, { p: [0.15, 0.6, 0] });
  m.box('flat', C.black, 0.5, 0.5, 1.2, { p: [0, 2.9, 0] }); // sight
  for (const z of [-2.6, 2.6]) m.box('flat', C.black, 0.4, 1.4, 0.4, { p: [0, -2.0, z] }); // folded legs
  m.box('flat', [0.75, 0.72, 0.5], 1.62, 0.5, 4.0, { p: [0.16, 1.4, 0] }); // the lettering band
  const K = (u, h, e) => [u, h.p, h.r, e];
  const off = (h, d, dr = [0, 0, 0]) => ({ p: add(h.p, d), r: add(h.r, dr) });
  const anims = {
    idle: idle({ amp: 1 }),
    draw: { dur: 0.6, blend: 0.05, tracks: {
      rhand: { abs: true, k: [K(0, off(RH, [2.5, -11, 4], [40, 10, -20])), K(0.5, off(RH, [0.4, -1.2, 0.5], [6, 2, -4]), 'cr'), K(0.85, RH, 'io')] },
    } },
    place: { dur: 0.8, hold: true, blend: 0.05, tracks: {
      rhand: { abs: true, k: [K(0, RH), K(0.35, off(RH, [-0.5, -6, -3], [30, 0, 0]), 'io'), K(0.7, off(RH, [-1, -16, -5], [60, 0, 0]), 'in2'), K(1, off(RH, [-1, -18, -5], [60, 0, 0]))] },
      body: [[0, Z, Z], [0.5, [0, -1.0, 0.4], [3, 0, 0], 'io'], [1, [0, -1.4, 0.6], [4, 0, 0]]],
    } },
  };
  mb.marker('muzzle', 'mine', [0, 0, 0]);
  return { anims, muzzle: 'muzzle', shell: 'muzzle' };
}

// ---------------------------------------------------------------- remote C4
// A brick of C4 in the right hand (thrown like the molotov), the detonator in the left.
function remotec4(mb) {
  hold(mb, [0, 0, 0]);
  const RH = handPose([5.2, -5.3, -8.8], [0.355, -0.0835, -0.922], [-0.82, -0.5, -0.27]);
  mb.node('rhand', 'rig', RH.p, RH.r);
  arm(mb, 'rhand_arm', 'rhand', 'R', { p: [0, 0, 0], fwd: [0, 0, -1], palm: [0, -1, 0], elbow: [14, -28, -2], grip: 'hold', len: 18 });
  mb.node('grenade', 'rhand', [-0.4, -1.9, -3.2], [0, 0, 90]);
  const g = mb.pen('grenade');
  g.box('flat', [0.78, 0.72, 0.56], 1.8, 5.2, 3.2); // the brick
  g.box('flat', C.dark, 2.0, 2.2, 1.8, { p: [0, 0.6, 0] }); // receiver
  g.box('flat', [0.25, 0.65, 0.3], 2.05, 0.9, 1.0, { p: [0, 0.9, 0] }); // display
  g.box('flat', C.black, 0.25, 3.2, 0.25, { p: [0.5, 3.2, 0.6] }); // antenna
  for (const y of [-1.8, 1.8]) g.box('flat', C.black, 1.85, 0.3, 3.25, { p: [0, y, 0] }); // tape
  // left hand: the detonator, thumb on the button
  const LA = handPose([-6.5, -8.2, -10.5], [0.45, 0.35, -0.82], [0.5, -0.75, -0.3]);
  mb.node('lhand', 'rig', LA.p, LA.r);
  arm(mb, 'lhand_arm', 'lhand', 'L', { p: [0, 0, 0], fwd: [0, 0, -1], palm: [0, -1, 0], elbow: [-12, -26, -4], pole: [-0.3, -1, 0.15], grip: 'hold', len: 18 });
  mb.node('det', 'lhand', [0.4, -0.6, -3.8]);
  const d = mb.pen('det');
  d.box('flat', C.dark, 1.2, 3.4, 1.0);
  d.box('flat', [0.8, 0.12, 0.08], 0.7, 0.4, 0.7, { p: [0, 1.85, 0] }); // the button
  d.box('flat', C.black, 0.2, 1.6, 0.2, { p: [0.3, 2.6, 0] });
  const K = (u, h, e) => [u, h.p, h.r, e];
  const off = (h, dd, dr = [0, 0, 0]) => ({ p: add(h.p, dd), r: add(h.r, dr) });
  const RHc = off(RH, [1.6, 2.6, 1.2], [-24, -8, 18]);
  const RHb = off(RH, [4.5, 4.8, 3.6], [-45, -16, 30]);
  const anims = {
    idle: idle({ amp: 1 }),
    draw: { dur: 0.75, blend: 0.05, tracks: {
      rhand: { abs: true, k: [K(0, off(RH, [2.5, -11, 4], [40, 10, -20])), K(0.42, off(RH, [0.5, -1.5, 0.6], [6, 2, -4]), 'cr'), K(0.86, RH, 'io')] },
      lhand: { abs: true, k: [K(0, off(LA, [-2, -10, 3], [0, 0, 20])), K(0.6, off(LA, [0, -0.5, 0])), K(1, LA, 'io')] },
    } },
    pullpin: { dur: 0.5, hold: true, blend: 0.05, tracks: {
      rhand: { abs: true, k: [K(0, RH), K(1, RHc, 'io')] },
    } },
    throw: { dur: 0.6, hold: true, blend: 0.04, tracks: {
      rhand: { abs: true, k: [K(0, RHc), K(0.16, RHb, 'out2'),
        K(0.34, handPose([3.0, -3.4, -16.5], [0.05, -0.4, -0.9], [-0.7, -0.6, 0.3]), 'in2'),
        K(0.55, handPose([1.0, -13, -13], [-0.1, -0.9, -0.4], [-0.6, -0.4, 0.6]), 'out2'),
        K(1, handPose([3, -30, -9], [0, -0.9, -0.4], [-0.6, -0.4, 0.6]), 'io')] },
      body: [[0, Z, Z], [0.16, [0, 0.25, 0.7], [1.6, -3.5, -0.5], 'out2'], [0.36, [0, -0.35, -1.4], [-3.0, 4.5, 1.0], 'in2'], [1, Z, Z, 'io']],
    }, vis: { grenade: [[0.33, 1, false]] } },
  };
  mb.marker('muzzle', 'grenade', [0, 0, 0]);
  return { anims, muzzle: 'muzzle', shell: 'muzzle' };
}

export const ZOMBIE_WEAPONS = { molotov, flamethrower, rpg, m32, medkit, minigun, aa12, barrett, chainsaw, tesla, claymore, remotec4 };
