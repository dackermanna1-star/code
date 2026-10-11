// Scoped rifles: awp, scout (bolt action), g3sg1, sg550 (semi-auto).
import { C, hold, scope, rifleRig, boltCycle } from './kit.js';
import { pistolGrip, triggerGuard, flashHider, muzzle, curvedMag, ring } from './parts.js';
import { Z } from './anim.js';

const SNIPER_HOLD = { p: [7.0, -7.9, -15.0], r: [-1, -0.5, -10], s: 1.1 };

// Bolt with a handle on the right side; pivot on the bore axis at forward f.
function boltNode(mb, y, f, o = {}) {
  mb.node('bolt', 'gun', [0, y, -f]);
  const b = mb.pen('bolt');
  b.tube('metal', o.bodyTint || [0.6, 0.6, 0.62], -2.2, 1.6, 0, 0.42, 0.42, { n: 8 });
  // handle stem angled down to the right, knob
  b.box('metal', C.dark, 1.6, 0.26, 0.3, { p: [0.95, -0.25, 0], r: [0, 0, -18] });
  if (o.flat) b.box('metal', C.dark, 0.9, 0.35, 0.7, { p: [1.85, -0.55, 0] });
  else b.lathe('metal', C.black, [[0, -0.42], [0.3, -0.36], [0.42, -0.1], [0.42, 0.1], [0.3, 0.36], [0, 0.42]], { n: 8, p: [1.85, -0.55, 0] });
  return [1.85, y - 0.55, f];
}

// Merge a bolt cycle into the shoot and reload animations (rig tilt appended
// after the recoil keys / before the reload's final settle).
function addCycle(anims, cyc, s0, s1, r0, r1) {
  for (const k of ['shoot1', 'shoot2', 'shoot3']) {
    const { rigTilt, ...t } = cyc(s0, s1);
    Object.assign(anims[k].tracks, t);
    const rig = anims[k].tracks.rig.filter((key) => key[0] < rigTilt[0][0]);
    anims[k].tracks.rig = [...rig, ...rigTilt, [1, Z, Z]];
  }
  const { rigTilt, ...t } = cyc(r0, r1);
  Object.assign(anims.reload.tracks, t);
}

// ---------------------------------------------------------------- AWP
function awp(mb) {
  hold(mb, SNIPER_HOLD.p, SNIPER_HOLD.r, SNIPER_HOLD.s);
  mb.node('gun', 'rig');
  const g = mb.pen('gun');
  const G = C.green, B = C.black;
  // fore-end + action bedding
  g.prism('polymer', G, [[-4.2, 0.0], [3.6, 0.0], [4.6, 0.3], [13.2, 0.5], [13.4, 0.9], [13.4, 1.8], [-4.2, 1.8]], 1.75, { bev: 0.32 });
  // thumbhole butt + lower bar
  g.prism('polymer', G, [[-4.2, 0.0], [-4.2, 2.5], [-6.0, 3.0], [-15.8, 3.0], [-16.6, 2.6], [-16.6, -3.6], [-15.8, -4.1], [-11.5, -3.8], [-6.5, -1.6], [-5.0, -1.2]], 1.6, { bev: 0.32 });
  g.prism('polymer', G, [[-1.3, -3.5], [-6.2, -1.8], [-6.7, -2.6], [-1.6, -4.3]], 1.3, { bev: 0.2 });
  g.span('polymer', [0.15, 0.15, 0.15], -17.0, -16.55, -3.7, 2.7, 1.62);
  pistolGrip(g, 'polymer', G);
  triggerGuard(g, -0.3, 1.9, 0.0, 1.05);
  // round receiver, bolt shroud
  g.tube('metal', B, -4.6, 4.6, 2.0, 0.78, 0.78, { n: 10 });
  g.span('metal', C.bore, -2.2, 0.6, 1.9, 2.55, 0.04, { x: 0.78 });
  // heavy barrel + muzzle brake
  g.tube('metal', B, 4.6, 27.0, 2.0, 0.5, 0.42, { n: 8 });
  g.tube('ribbed', B, 27.0, 29.4, 2.0, 0.64, 0.64, { n: 8 });
  g.tube('metal', C.bore, 29.4, 29.42, 2.0, 0.24, 0.24, { n: 6 });
  // big scope
  scope(g, -3.6, 8.8, 4.75, { r: 0.64, rb: 1.0, rf: 1.4, base: 2.65, n: 12 });
  const knob = boltNode(mb, 2.0, -1.4);
  // detachable box magazine
  mb.node('mag', 'gun', [0, 0.0, -3.0]);
  mb.pen('mag').span('metal', [0.22, 0.22, 0.23], -1.1, 1.1, -2.4, 0.2, 1.0);
  mb.pen('mag').span('metal', B, -1.2, 1.2, -2.6, -2.3, 1.08);
  mb.marker('muzzle', 'gun', [0, 2.0, -29.8]);
  mb.marker('shell', 'gun', [0.9, 2.3, 0.8]);
  const r = rifleRig(mb, {
    lh: { at: [0, 0.4, 9.5] },
    mag: { at: [-0.5, -1.2, 3.0] },
    bolt: 0,
    reload: 2.9,
    draw: 1.45,
    kick: 1.5,
    shootDur: 1.45,
    shootOpts: { peak: 0.05, rec: 0.25 },
    reloadTimes: { reach: 0.1, grab: 0.14, out: 0.22, gone: 0.3, back: 0.42, under: 0.5, ins: 0.56 },
  });
  const cyc = (a, b) => boltCycle(a, b, { knob, pivot: [2.0, -1.4], lift: 62, travel: 3.6, rh: r.RH });
  addCycle(r.anims, cyc, 0.22, 0.95, 0.64, 0.98);
  return { anims: r.anims, muzzle: 'muzzle', shell: 'shell' };
}

// ---------------------------------------------------------------- Scout
function scout(mb) {
  hold(mb, SNIPER_HOLD.p, SNIPER_HOLD.r, SNIPER_HOLD.s);
  mb.node('gun', 'rig');
  const g = mb.pen('gun');
  const P = [0.3, 0.31, 0.3], B = C.black;
  // slim polymer stock
  g.prism('polymer', P, [[-4.0, 0.2], [3.4, 0.2], [4.4, 0.5], [12.6, 0.8], [12.8, 1.2], [12.8, 1.75], [-4.0, 1.75]], 1.4, { bev: 0.3 });
  g.prism('polymer', P, [[-4.0, 0.1], [-4.0, 2.2], [-6.0, 2.5], [-15.6, 2.4], [-16.2, 2.0], [-16.2, -3.4], [-15.4, -3.8], [-9.0, -1.6], [-5.6, -1.0], [-2.4, -0.4]], 1.4, { bev: 0.3 });
  g.span('polymer', [0.12, 0.12, 0.12], -16.6, -16.15, -3.5, 2.2, 1.45);
  pistolGrip(g, 'polymer', P);
  triggerGuard(g, -0.3, 1.9, 0.1, 1.05);
  // folded bipod under the fore-end
  for (const x of [-0.3, 0.3]) g.tube('metal', B, 6.0, 12.2, 0.1, 0.14, 0.14, { n: 5, x });
  g.tube('metal', B, -4.4, 3.8, 1.85, 0.62, 0.62, { n: 10 });
  g.tube('metal', [0.26, 0.26, 0.27], 3.8, 25.0, 1.85, 0.38, 0.3, { n: 8 });
  muzzle(g, 25.0, 0.4, 1.85, 0.34, B);
  // small scope with low rings
  scope(g, -2.6, 7.4, 3.9, { r: 0.48, rb: 0.75, rf: 0.92, base: 2.3 });
  const knob = boltNode(mb, 1.85, -1.4, { flat: true });
  mb.node('mag', 'gun', [0, 0.2, -2.6]);
  mb.pen('mag').span('polymer', [0.2, 0.2, 0.21], -0.9, 0.9, -1.4, 0.1, 0.95);
  mb.marker('muzzle', 'gun', [0, 1.85, -25.6]);
  mb.marker('shell', 'gun', [0.8, 2.1, 0.8]);
  const r = rifleRig(mb, {
    lh: { at: [0, 0.6, 9.0] },
    mag: { at: [-0.5, -0.8, 2.6] },
    bolt: 0,
    reload: 2.0,
    draw: 1.2,
    kick: 1.2,
    shootDur: 1.25,
    shootOpts: { peak: 0.06, rec: 0.28 },
  });
  const cyc = (a, b) => boltCycle(a, b, { knob, pivot: [1.85, -1.4], lift: 60, travel: 3.0, rh: r.RH });
  addCycle(r.anims, cyc, 0.24, 0.95, 0.66, 0.98);
  return { anims: r.anims, muzzle: 'muzzle', shell: 'shell' };
}

// ---------------------------------------------------------------- G3SG/1
function g3sg1(mb) {
  hold(mb, SNIPER_HOLD.p, SNIPER_HOLD.r, SNIPER_HOLD.s);
  mb.node('gun', 'rig');
  const g = mb.pen('gun');
  const D = C.dark, B = C.black;
  // long stamped receiver + cocking tube
  g.prism('metal', D, [[-5.2, 0.3], [7.4, 0.3], [7.4, 1.9], [7.0, 2.4], [-4.9, 2.4], [-5.2, 2.1]], 1.25, { bev: 0.3 });
  g.span('metal', [0.17, 0.17, 0.18], -4.6, 6.6, 1.15, 1.35, 1.3);
  g.span('metal', C.bore, 0.4, 3.0, 1.35, 1.95, 0.04, { x: 0.63 });
  g.tube('metal', D, 6.0, 15.2, 2.35, 0.5, 0.5, { n: 8 });
  // wide handguard
  g.prism('polymer', B, [[7.4, -0.2], [14.6, 0.1], [15.0, 0.6], [15.0, 1.95], [7.4, 1.95]], 1.85, { bev: 0.35 });
  for (const f of [8.6, 10.2, 11.8, 13.4]) g.span('polymer', [0.12, 0.12, 0.12], f, f + 0.6, 0.1, 1.5, 1.88);
  // barrel, front sight, flash hider
  g.tube('metal', D, 15.0, 24.0, 1.1, 0.38, 0.34, { n: 8 });
  g.span('metal', D, 14.6, 15.4, 2.3, 3.2, 0.5);
  ring(g, 15.0, 3.3, 0.4, 0.1, D, 8);
  flashHider(g, 24.0, 1.6, 1.1, 0.46);
  // trigger group / grip
  g.prism('polymer', B, [[-2.3, 0.35], [2.6, 0.35], [2.6, -0.15], [-2.0, -0.15]], 1.1);
  triggerGuard(g, -0.2, 2.4, -0.1, 1.05);
  pistolGrip(g, 'polymer', B);
  g.span('metal', D, 2.4, 5.0, -0.9, 0.35, 1.1);
  // stock with cheek pad
  g.prism('polymer', B, [[-5.2, 2.2], [-15.8, 2.0], [-16.4, 1.6], [-16.4, -3.4], [-15.6, -3.8], [-9.0, -1.4], [-5.2, -0.2]], 1.5, { bev: 0.3 });
  g.prism('polymer', [0.15, 0.15, 0.15], [[-8.0, 2.0], [-14.8, 2.0], [-14.8, 3.0], [-8.4, 3.0]], 1.3, { bev: 0.25 });
  // scope on a claw mount
  scope(g, -3.6, 8.0, 4.6, { r: 0.6, rb: 0.95, rf: 1.2, base: 2.4, n: 12 });
  mb.node('bolt', 'gun');
  mb.pen('bolt').span('metal', D, 12.8, 13.2, 2.15, 2.45, 0.9, { x: -0.6 });
  mb.pen('bolt').cyl('metal', D, 0.22, 0.2, 0.35, { n: 6, p: [-1.0, 2.3, -13.0], r: [0, 90, 0] });
  mb.node('mag', 'gun', [0, -0.6, -3.7]);
  mb.pen('mag').prism('metal', [0.2, 0.2, 0.21], curvedMag(5.6, 2.3, 2.4, 0.6, 0.9), 1.0, { bev: 0.12 });
  mb.marker('muzzle', 'gun', [0, 1.1, -25.8]);
  mb.marker('shell', 'gun', [0.7, 1.6, -1.7]);
  const r = rifleRig(mb, {
    lh: { at: [0, -0.2, 11.0] },
    mag: { at: [-0.6, -2.6, 4.6] },
    charge: { at: [-1.0, 2.3, 13.0], side: 'L', pull: 2.4 },
    bolt: 0,
    reload: 4.6,
    draw: 1.2,
    kick: 1.3,
    shootDur: 0.4,
  });
  return { anims: r.anims, muzzle: 'muzzle', shell: 'shell' };
}

// ---------------------------------------------------------------- SG 550 Sniper
function sg550(mb) {
  hold(mb, SNIPER_HOLD.p, SNIPER_HOLD.r, SNIPER_HOLD.s);
  mb.node('gun', 'rig');
  const g = mb.pen('gun');
  const O = [0.26, 0.28, 0.24], B = C.black;
  g.prism('metal', O, [[-4.6, 0.1], [6.2, 0.1], [6.2, 2.2], [-4.3, 2.2], [-4.6, 1.8]], 1.2, { bev: 0.16 });
  g.span('metal', B, -3.8, 6.0, 2.2, 2.45, 0.85);
  g.span('metal', C.bore, 0.4, 3.0, 1.05, 1.6, 0.04, { x: 0.6 });
  // long vented handguard with folded bipod
  g.prism('polymer', O, [[6.2, 0.2], [14.0, 0.45], [14.4, 0.8], [14.4, 2.3], [6.2, 2.3]], 1.8, { bev: 0.32 });
  for (const f of [7.4, 9.0, 10.6, 12.2]) g.span('metal', C.bore, f, f + 0.8, 0.9, 1.7, 0.04, { x: -0.91 });
  for (const x of [-0.95, 0.95]) g.tube('metal', B, 7.0, 14.0, 1.3, 0.14, 0.14, { n: 5, x });
  g.tube('metal', C.dark, 14.4, 24.5, 1.4, 0.45, 0.4, { n: 8 });
  flashHider(g, 24.5, 1.5, 1.4, 0.46);
  triggerGuard(g, -0.3, 2.5, 0.1, 1.15);
  pistolGrip(g, 'polymer', B);
  g.span('polymer', B, -1.6, 0.0, -4.2, -3.9, 1.6); // palm shelf
  // adjustable stock + cheek rest
  g.prism('polymer', O, [[-4.6, 2.0], [-15.6, 2.0], [-16.2, 1.6], [-16.2, -3.6], [-15.4, -4.0], [-11.0, -1.0], [-4.6, 0.2]], 1.4, { bev: 0.3 });
  g.prism('polymer', B, [[-7.6, 2.0], [-14.4, 2.0], [-14.4, 3.2], [-7.9, 3.2]], 1.2, { bev: 0.22 });
  scope(g, -2.8, 8.2, 4.1, { r: 0.58, rb: 0.92, rf: 1.15, base: 2.45, n: 12 });
  mb.node('bolt', 'gun');
  mb.pen('bolt').span('metal', B, 3.2, 3.8, 1.25, 1.65, 1.0, { x: 0.9 });
  mb.pen('bolt').cyl('metal', B, 0.26, 0.26, 0.4, { n: 6, p: [1.35, 1.45, -3.5], r: [0, -90, 0] });
  mb.node('mag', 'gun', [0, 0.1, -3.7]);
  mb.pen('mag').prism('polymer', [0.25, 0.25, 0.24], curvedMag(5.4, 2.1, 2.2, 1.2, 0.5), 0.95, { bev: 0.12 });
  mb.marker('muzzle', 'gun', [0, 1.4, -26.2]);
  mb.marker('shell', 'gun', [0.6, 1.3, -1.7]);
  const r = rifleRig(mb, {
    lh: { at: [0, 0.4, 10.5] },
    mag: { at: [-0.6, -2.6, 4.6] },
    charge: { at: [1.3, 1.45, 3.5], side: 'R', pull: 2.6 },
    bolt: 2.6,
    reload: 3.35,
    draw: 1.2,
    kick: 1.2,
  });
  return { anims: r.anims, muzzle: 'muzzle', shell: 'shell' };
}

export const SNIPERS = { awp, scout, g3sg1, sg550 };
