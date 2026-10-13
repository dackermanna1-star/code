// Zombie survival arsenal (Milestone 3): machete, fire axe, katana, crossbow, pipe bomb, cryo
// grenade. The blades are authored like the knife (w_misc.js): the right fist drives every
// swing (a pose from where the blade points and where the palm faces) and the blade rides in
// it; the two-handed ones carry the left hand on their grip, so it follows the swing. The
// crossbow is a rifle rig with its own crank-and-load; the throwables are grenade rigs. The
// pipe bomb's LED, the cryo canister's window and the crossbow's string / bolt are driven in
// spec.post (vm.state.empty: the game's "clip is empty").
import * as THREE from 'three';
import { arm, handPose } from './hands.js';
import { DEG } from './builder.js';
import { C, hold, idle, rifleRig, scope } from './kit.js';
import { Z } from './anim.js';
import { add, sub, chain, rel } from './pose.js';
import { pistolGrip, triggerGuard, ring } from './parts.js';

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;

/**
 * Pose for a blade hand (rig = view space) from where the blade points and which way its edge
 * faces (the knife's frame: hand-local blade along -X, edge -Y, fingers -Z).
 */
function bladeHand(p, blade, edge) {
  const x = new THREE.Vector3(...blade).normalize().negate();
  const y = new THREE.Vector3(...edge).negate();
  y.addScaledVector(x, -y.dot(x)).normalize();
  const z = new THREE.Vector3().crossVectors(x, y);
  const e = new THREE.Euler().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z), 'YXZ');
  return { p, r: [e.x / DEG, e.y / DEG, e.z / DEG] };
}
/** Pose for a hand on a haft from where the haft points (to the head) and where the axe's bit faces (the fingers' way). */
function gripHand(p, haft, bit) {
  const x = new THREE.Vector3(...haft).normalize().negate();
  const z = new THREE.Vector3(...bit).negate();
  z.addScaledVector(x, -z.dot(x)).normalize();
  const y = new THREE.Vector3().crossVectors(z, x);
  const e = new THREE.Euler().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z), 'YXZ');
  return { p, r: [e.x / DEG, e.y / DEG, e.z / DEG] };
}
const KH = (u, h, e) => [u, h.p, h.r, e];
const kh = (u, p, blade, edge, e) => KH(u, bladeHand(p, blade, edge), e);
const kg = (u, p, haft, bit, e) => KH(u, gripHand(p, haft, bit), e);
// body: the chest turns into a cut (camera-relative weight)
const twist = (u0, u1, u2, yaw, pitch = 0, fwd = 0) => [[0, Z, Z], [u0, [0, 0, 0], [0.4, -yaw * 0.3, 0], 'io'], [u1, [0, -0.2, -fwd], [pitch, yaw, yaw * 0.15], 'io'], [u2, Z, Z, 'io'], [1, Z, Z]];

/**
 * The right fist and the blade node in it (knife frame: the blade's profile runs along the
 * node's -Z = the hand's -X, its y up the hand's Y).
 */
function bladeRig(mb, RH, node, { grip = 'fist', at = [0, -1.2, -2.75] } = {}) {
  hold(mb, [0, 0, 0]);
  mb.node('rhand', 'rig', RH.p, RH.r);
  arm(mb, 'rhand_arm', 'rhand', 'R', { p: [0, 0, 0], fwd: [0, 0, -1], palm: [0, -1, 0], elbow: [14, -25, 2], grip, len: 18 });
  mb.node(node, 'rhand', at, [0, 90, 0]);
  return mb.pen(node);
}
/** The left hand on a two-handed grip, f units down the handle from the blade node's origin (toward the butt: +f). */
function leftOnGrip(mb, node, f, o = {}) {
  // the same fist as the right, mirrored: wrist off the grip's -X side, the palm the other way
  arm(mb, 'lhand', node, 'L', { p: [-2.75, -1.2, f], fwd: [1, 0, 0], palm: [0, 1, 0], fore: [-1, -0.2, 0.4], grip: 'fist', len: 18, ...o });
}
/** The left hand parked out of view below (one-handed blades). */
function parkLeft(mb) {
  const LH = handPose([-11, -30, -4], [0.32, 0.94, -0.05], [-0.43, -0.41, -0.79]);
  mb.node('lhand', 'rig', LH.p, LH.r);
  arm(mb, 'lhand_arm', 'lhand', 'L', { p: [0, 0, 0], fwd: [0, 0, -1], palm: [0, -1, 0], elbow: [-8, -36, 4], grip: 'open', len: 18 });
  return { lhand: { abs: true, k: [KH(0, LH)] } };
}

// ---------------------------------------------------------------- machete
// A long, broad blade with a riveted wooden grip, its flat to you at rest. Quick slashes,
// forehand and backhand, the edge leading.
function machete(mb) {
  const RH = bladeHand([8.4, -8.6, -12.6], [-0.1, 0.6, -0.8], [-0.65, -0.37, -0.19]);
  const g = bladeRig(mb, RH, 'blade');
  const park = parkLeft(mb);
  // grip: hardwood scales, brass rivets, a lanyard hole
  const WD = [0.62, 0.42, 0.3];
  g.prism('wood', WD, [[-4.4, -0.5], [1.4, -0.58], [1.4, 0.58], [-4.4, 0.62], [-4.9, 0.1]], 0.95, { bev: 0.2 });
  for (const f of [-3.0, -0.6]) g.cyl('metal', C.brass, 0.2, 0.2, 1.08, { n: 6, p: [0.54, 0.02, -f], r: [0, 90, 0] });
  g.cyl('metal', C.bore, 0.16, 0.16, 1.1, { n: 6, p: [0.55, 0.15, 4.2], r: [0, 90, 0] });
  g.span('metal', C.dark, 1.4, 1.9, -0.72, 0.72, 0.62); // tang bolster
  // the blade: straight spine, a belly toward a clipped point, edge down; dull carbon steel, a bright honed edge
  g.prism('brushed', [0.58, 0.59, 0.58], [[1.9, 0.806], [15.5, 1.066], [19, 1.43], [21, 0.975], [21.9, 0], [20.4, -1.3], [15, -2.015], [8, -1.69], [1.9, -1.066]], 0.2, { wt: 0.12 });
  g.prism('brushed', [0.92, 0.93, 0.95], [[2.4, -1.066], [8, -1.69], [15, -2.015], [20.4, -1.3], [21.9, 0], [21.6, -0.026], [20.1, -1.04], [15, -1.69], [8, -1.378], [2.4, -0.78]], 0.13);
  g.prism('metal', [0.3, 0.3, 0.29], [[1.9, 0.806], [15.5, 1.066], [15.5, 0.676], [1.9, 0.468]], 0.24); // dark spine
  mb.marker('tip', 'blade', [0, 0, -21.5]);
  const rest = (u, e = 'io') => KH(u, RH, e);
  const anims = {
    idle: idle({ amp: 1.1, fn(u, t, vm) { vm.nodes.rhand.rotation.z += 2 * DEG * Math.sin(u * Math.PI * 4 + 0.5); } }),
    draw: { dur: 0.7, blend: 0.05, tracks: {
      rhand: { abs: true, k: [
        kh(0, [12, -22, -6], [0.35, -0.7, -0.6], [-0.4, -0.4, 0.8]),
        kh(0.35, [10.5, -12, -11], [0.25, 0.3, -0.92], [-0.8, -0.55, 0.1], 'cr'),
        kh(0.6, [8.2, -8.0, -13.0], [-0.16, 0.66, -0.73], [-0.65, -0.37, -0.19], 'cr'),
        kh(0.78, [8.5, -8.9, -12.4], [-0.08, 0.56, -0.82], [-0.65, -0.37, -0.19], 'io'),
        rest(1)] },
      body: [[0, [0, -0.4, 0.2], [-1.2, 0, 0]], [0.5, Z, [0.4, 0, 0], 'out2'], [0.85, Z, Z, 'io']],
      ...park,
    } },
    // forehand: cocked out to the right, whipped right-to-left through the middle, the edge leading
    slash1: { dur: 0.44, blend: 0.03, tracks: {
      rhand: { abs: true, k: [rest(0),
        kh(0.16, [12.5, -4.0, -10.0], [0.55, 0.45, -0.7], [-0.95, 0.05, -0.3], 'out2'),
        kh(0.27, [5.0, -6.0, -17.0], [-0.35, 0.08, -0.93], [-0.95, 0, 0.3], 'in2'),
        kh(0.37, [-4.0, -8.0, -15.0], [-0.96, -0.05, -0.27], [-0.25, -0.2, 0.95], 'cr'),
        kh(0.5, [-8.0, -12.5, -10.5], [-0.7, -0.5, -0.3], [-0.3, -0.6, 0.75], 'out2'),
        kh(0.76, [4.0, -10.5, -11.5], [-0.25, 0.45, -0.86], [-0.65, -0.37, -0.19], 'cr'),
        rest(1, 'cr')] },
      body: twist(0.16, 0.4, 0.85, 6, -1.4),
      ...park,
    } },
    // backhand: wound up across the body, whipped back left-to-right and down
    slash2: { dur: 0.44, blend: 0.03, tracks: {
      rhand: { abs: true, k: [rest(0),
        kh(0.18, [0.5, -3.5, -11.5], [-0.8, 0.5, -0.35], [0.9, 0.1, -0.4], 'out2'),
        kh(0.3, [6.5, -5.5, -17.0], [0.4, 0.12, -0.9], [0.95, 0, 0.3], 'in2'),
        kh(0.4, [11.5, -8.6, -14.0], [0.92, -0.18, -0.35], [0.3, -0.3, 0.9], 'cr'),
        kh(0.52, [13.5, -12.5, -10.0], [0.7, -0.62, -0.2], [0.2, -0.5, 0.85], 'out2'),
        kh(0.78, [9.2, -9.4, -12.0], [-0.12, 0.55, -0.82], [-0.65, -0.37, -0.19], 'cr'),
        rest(1, 'cr')] },
      body: twist(0.18, 0.42, 0.85, -6, -1.2),
      ...park,
    } },
  };
  anims.attack = anims.slash1;
  return { anims, muzzle: 'tip', shell: 'tip' };
}

// ---------------------------------------------------------------- fire axe
// Red head, steel bit, a pick on the back, a long hickory haft held low in both fists,
// the head up at the right. The chop: up over the shoulder, down through the middle.
function fireaxe(mb) {
  const RH = gripHand([9.8, -13.0, -10.6], [-0.18, 0.8, -0.57], [-0.75, -0.05, -0.65]);
  const g = bladeRig(mb, RH, 'axe');
  leftOnGrip(mb, 'axe', 3.0, { fore: [-1, -0.5, 0.5] });
  // the haft (along -Z: toward the head), its end knob, a rubber grip
  const HW = [0.86, 0.66, 0.46];
  g.tube('wood', HW, -4.6, 21.0, 0, 0.62, 0.55, { n: 8 });
  g.tube('wood', HW, -5.4, -4.6, 0, 0.8, 0.66, { n: 8 });
  g.tube('polymer', C.black, -4.4, 1.8, 0, 0.7, 0.7, { n: 8 });
  // the head: the eye round the haft, the bit (+X: the way the fingers point, leading a chop), the pick (-X)
  const R = [0.78, 0.12, 0.08];
  g.box('flat', R, 2.6, 1.5, 3.4, { p: [0, 0, -22.0] });
  g.hexa('flat', R, [[1.3, -0.62, -20.5], [6.0, -0.2, -19.2], [1.3, 0.62, -20.5], [6.0, 0.2, -19.2], [1.3, -0.62, -23.5], [6.0, -0.2, -25.0], [1.3, 0.62, -23.5], [6.0, 0.2, -25.0]]);
  g.hexa('brushed', C.silver, [[5.4, -0.24, -19.3], [7.0, -0.04, -18.6], [5.4, 0.24, -19.3], [7.0, 0.04, -18.6], [5.4, -0.24, -24.9], [7.0, -0.04, -25.6], [5.4, 0.24, -24.9], [7.0, 0.04, -25.6]]); // the bit
  g.hexa('flat', R, [[-6.2, -0.14, -21.8], [-1.3, -0.6, -21.0], [-6.2, 0.14, -21.8], [-1.3, 0.6, -21.0], [-6.2, -0.14, -22.2], [-1.3, -0.6, -23.0], [-6.2, 0.14, -22.2], [-1.3, 0.6, -23.0]]); // the pick
  g.box('flat', [0.95, 0.9, 0.82], 2.2, 0.08, 0.5, { p: [2.2, 0.66, -22.0] }); // a white stencil band each side
  g.box('flat', [0.95, 0.9, 0.82], 2.2, 0.08, 0.5, { p: [2.2, -0.66, -22.0] });
  mb.marker('tip', 'axe', [7, 0, -22]);
  const rest = (u, e = 'io') => KH(u, RH, e);
  const anims = {
    idle: idle({ amp: 1.2, fn(u, t, vm) { vm.nodes.rhand.rotation.x += 1.2 * DEG * Math.sin(u * Math.PI * 2 + 1.1); } }),
    draw: { dur: 0.85, blend: 0.05, tracks: {
      rhand: { abs: true, k: [
        kg(0, [12, -27, -3], [0.2, -0.3, -0.93], [-0.4, -0.8, 0.4]),
        kg(0.4, [11, -16, -9], [-0.05, 0.55, -0.83], [-0.7, -0.4, -0.55], 'cr'),
        kg(0.65, [9.6, -12.0, -11.0], [-0.22, 0.84, -0.5], [-0.75, -0.05, -0.65], 'cr'),
        rest(1, 'io')] },
      body: [[0, [0, -0.6, 0.3], [-1.6, 0, 0]], [0.55, [0, 0.1, 0], [0.6, 0, 0], 'out2'], [0.9, Z, Z, 'io']],
    } },
    chop: { dur: 1.0, blend: 0.04, tracks: {
      rhand: { abs: true, k: [rest(0),
        kg(0.2, [12.0, -4.5, -9.0], [0.1, 0.62, 0.78], [0, 0.78, -0.62], 'out2'),
        kg(0.25, [12.2, -4.0, -8.6], [0.1, 0.66, 0.74], [0, 0.74, -0.66], 'io'),
        kg(0.31, [5.0, -5.0, -16.5], [-0.34, -0.18, -0.92], [0, -0.98, 0.18], 'in2'),
        kg(0.4, [2.5, -11.5, -13.5], [-0.2, -0.62, -0.76], [0, -0.76, 0.62], 'out2'),
        kg(0.55, [2.6, -13.0, -12.5], [-0.2, -0.76, -0.62], [0, -0.62, 0.78], 'io'),
        rest(1, 'io')] },
      body: [[0, Z, Z], [0.2, [0, 0.4, 0.8], [3.0, -2.0, 0.5], 'out2'], [0.31, [0, -0.8, -1.6], [-4.5, 1.5, -0.5], 'in2'], [0.45, [0, -0.6, -1.0], [-2.5, 1.0, 0], 'out2'], [1, Z, Z, 'io']],
    } },
  };
  anims.chop_miss = anims.chop;
  anims.attack = anims.chop;
  return { anims, muzzle: 'tip', shell: 'tip' };
}

// ---------------------------------------------------------------- katana
// Black-wrapped tsuka, round tsuba, a gently curved bright blade. Two hands on the grip;
// sweeping slashes right-to-left and back, then a downward finisher.
function katana(mb) {
  const RH = bladeHand([9.2, -10.6, -13.6], [-0.08, 0.74, -0.67], [-0.7, -0.3, -0.24]);
  const g = bladeRig(mb, RH, 'katana');
  leftOnGrip(mb, 'katana', 5.6);
  // the tsuka: wrapped grip with diamond windows, the kashira cap
  g.tube('polymer', C.black, -8.6, 1.0, 0, 0.62, 0.66, { n: 8 });
  for (let f = -7.6; f < 0.4; f += 1.15) g.tube('flat', [0.85, 0.8, 0.7], f, f + 0.32, 0, 0.67, 0.67, { n: 4, a0: 45 });
  g.tube('metal', C.brass, -9.2, -8.6, 0, 0.7, 0.62, { n: 8 });
  // the tsuba and habaki
  g.tube('metal', C.dark, 1.0, 1.35, 0, 1.75, 1.75, { n: 12 });
  g.tube('metal', C.brass, 1.35, 2.3, 0, 0.55, 0.5, { n: 6 });
  // the blade: a slow curve toward the spine (+y) on the way to the point, the hamon along the edge
  const blade = [[2.3, 0.55], [9, 0.66], [16, 0.9], [22, 1.24], [27, 1.7], [28.8, 2.0], [27.6, 1.38], [22, 0.3], [16, -0.12], [9, -0.36], [2.3, -0.5]];
  g.prism('brushed', [0.8, 0.82, 0.86], blade, 0.2, { wt: 0.1 });
  g.prism('brushed', [1, 1, 1], [[2.6, -0.5], [9, -0.36], [16, -0.12], [22, 0.3], [27.6, 1.38], [28.8, 2.0], [28.5, 1.92], [27.4, 1.5], [22, 0.48], [16, 0.08], [9, -0.16], [2.6, -0.32]], 0.12); // hamon
  g.prism('metal', [0.42, 0.43, 0.45], [[2.6, 0.55], [9, 0.66], [16, 0.9], [22, 1.24], [22, 1.08], [16, 0.76], [9, 0.52], [2.6, 0.41]], 0.22); // the shinogi (ridge line)
  mb.marker('tip', 'katana', [0, 1.5, -28.5]);
  const rest = (u, e = 'io') => KH(u, RH, e);
  const anims = {
    idle: idle({ amp: 1.0, fn(u, t, vm) { vm.nodes.rhand.rotation.z += 1.2 * DEG * Math.sin(u * Math.PI * 2 + 0.3); } }),
    draw: { dur: 0.9, blend: 0.05, tracks: {
      rhand: { abs: true, k: [
        kh(0, [3, -25, -7], [-0.9, -0.3, -0.3], [-0.2, -0.9, 0.4]),
        kh(0.35, [9.5, -15, -12], [0.2, 0.2, -0.96], [-0.5, -0.8, 0.3], 'cr'),
        kh(0.6, [8.8, -9.8, -14.0], [-0.14, 0.8, -0.58], [-0.7, -0.3, -0.24], 'cr'),
        rest(0.85, 'io'), rest(1)] },
      body: [[0, [0, -0.5, 0.2], [-1.2, 0.8, 0]], [0.55, Z, [0.5, 0, 0], 'out2'], [0.9, Z, Z, 'io']],
    } },
    // a flat sweep right-to-left at chest height (two bodies at once), the edge leading
    slash1: { dur: 0.46, blend: 0.03, tracks: {
      rhand: { abs: true, k: [rest(0),
        kh(0.18, [13, -6.5, -10.5], [0.6, 0.3, -0.74], [-0.9, 0.1, -0.4], 'out2'),
        kh(0.28, [6.0, -7.0, -17.0], [-0.35, 0.02, -0.94], [-0.94, 0, 0.35], 'in2'),
        kh(0.38, [-3.5, -8.0, -15.5], [-0.98, -0.02, -0.2], [-0.2, -0.1, 0.97], 'cr'),
        kh(0.5, [-7.0, -11.5, -11.0], [-0.75, -0.25, 0.6], [0.5, -0.3, 0.8], 'out2'),
        kh(0.8, [5.0, -11.5, -12.5], [-0.25, 0.6, -0.76], [-0.7, -0.3, -0.24], 'cr'),
        rest(1, 'cr')] },
      body: twist(0.18, 0.42, 0.85, 8, -1.0),
    } },
    // and back, left-to-right, a little higher
    slash2: { dur: 0.46, blend: 0.03, tracks: {
      rhand: { abs: true, k: [rest(0),
        kh(0.18, [-2.5, -6.0, -12.0], [-0.82, 0.35, -0.45], [0.9, 0.1, -0.4], 'out2'),
        kh(0.3, [4.5, -6.0, -17.5], [0.3, 0.12, -0.95], [0.95, 0, 0.3], 'in2'),
        kh(0.4, [12.5, -7.5, -14.0], [0.98, 0.05, -0.2], [0.2, -0.1, 0.97], 'cr'),
        kh(0.52, [14.0, -10.5, -10.0], [0.7, -0.2, 0.68], [-0.6, -0.3, 0.75], 'out2'),
        kh(0.8, [9.8, -10.5, -13.0], [-0.1, 0.72, -0.68], [-0.7, -0.3, -0.24], 'cr'),
        rest(1, 'cr')] },
      body: twist(0.18, 0.42, 0.85, -8, -1.0),
    } },
    // the finisher: raised high at the right, brought straight down through the middle
    slash3: { dur: 0.78, blend: 0.03, tracks: {
      rhand: { abs: true, k: [rest(0),
        kh(0.2, [9.0, -2.5, -11.0], [-0.05, 0.75, 0.66], [0, 0.66, -0.75], 'out2'),
        kh(0.26, [9.2, -2.2, -10.8], [-0.05, 0.8, 0.6], [0, 0.6, -0.8], 'io'),
        kh(0.34, [3.5, -7.5, -17.0], [-0.08, -0.25, -0.96], [0, -0.96, 0.25], 'in2'),
        kh(0.46, [2.5, -13.5, -13.0], [-0.1, -0.8, -0.58], [0, -0.58, 0.8], 'out2'),
        kh(0.62, [3.0, -13.5, -13.0], [-0.1, -0.78, -0.6], [0, -0.6, 0.78], 'io'),
        rest(1, 'io')] },
      body: [[0, Z, Z], [0.22, [0, 0.4, 0.7], [2.4, -1.0, 0], 'out2'], [0.34, [0, -0.8, -1.5], [-4.0, 0.8, 0], 'in2'], [0.5, [0, -0.6, -1.0], [-2.4, 0.5, 0], 'out2'], [1, Z, Z, 'io']],
    } },
  };
  anims.attack = anims.slash1;
  return { anims, muzzle: 'tip', shell: 'tip' };
}

// ---------------------------------------------------------------- crossbow
// A hunting crossbow: wooden stock, a rail with a bolt on it, recurve limbs, a scope. The
// reload: the left hand hauls the string back to the latch, then fetches a bolt and lays it
// on the rail (string / bolt shown from vm.state.empty in post).
function crossbow(mb) {
  hold(mb, [7.0, -7.6, -15.0], [-0.5, -0.5, -7], 1.0);
  mb.node('gun', 'rig');
  const g = mb.pen('gun');
  const WD = [0.5, 0.36, 0.27], B = C.black, D = C.dark;
  // stock and fore-end
  g.prism('wood', WD, [[-2.0, 2.0], [-14.0, 1.4], [-14.6, 0.9], [-14.6, -3.4], [-13.6, -3.8], [-8.0, -1.2], [-2.0, -0.4]], 1.6, { bev: 0.3 });
  g.span('polymer', B, -14.9, -14.6, -3.4, 0.9, 1.65);
  g.prism('wood', WD, [[-2.0, 1.0], [11.0, 1.0], [12.0, 0.4], [11.0, -0.8], [-2.0, -0.6]], 1.7, { bev: 0.25 });
  // the rail and its groove, the latch box at the back
  g.span('metal', D, -2.5, 15.0, 1.0, 1.9, 0.9);
  g.span('metal', C.bore, -2.0, 14.5, 1.85, 1.95, 0.25);
  g.span('metal', D, -3.8, 0.5, 0.8, 2.9, 1.5);
  triggerGuard(g, -0.3, 2.4, -0.4, 1.1);
  pistolGrip(g, 'wood', WD);
  // the riser and the stirrup at the front
  g.span('metal', B, 13.6, 15.8, 0.2, 3.0, 2.6);
  g.prism('metal', B, [[15.6, 0.6], [18.6, 0.2], [18.6, -2.8], [17.8, -2.8], [17.8, -0.4], [15.6, -0.1]], 2.8);
  // the limbs: tall and thin like real ones (they read from behind), swept back from the riser; a cam at each tip
  const LX = 11.0, LF = 10.6;
  for (const s of [-1, 1]) {
    const q = [[1.2, 0.2, -15.0], [LX, 0.7, -LF], [1.2, 3.2, -15.0], [LX, 2.7, -LF], [1.2, 0.2, -15.8], [LX, 0.7, -LF - 0.7], [1.2, 3.2, -15.8], [LX, 2.7, -LF - 0.7]];
    g.hexa('polymer', B, s > 0 ? q : [q[1], q[0], q[3], q[2], q[5], q[4], q[7], q[6]].map(([x, y, z]) => [-x, y, z]));
    g.cyl('metal', C.steel, 0.65, 0.65, 2.3, { n: 8, p: [s * LX, 0.55, -LF - 0.35], r: [-90, 0, 0] });
  }
  // the string: cocked (back to the latch) / loose (straight across the limb tips)
  mb.node('string_c', 'gun');
  mb.node('string_r', 'gun');
  const sc = mb.pen('string_c'), sr = mb.pen('string_r');
  const SW = [0.85, 0.82, 0.74];
  for (const s of [-1, 1]) {
    const a = [s * LX, 1.7, -LF - 0.35], b = [s * 0.4, 1.7, -0.6];
    const d = sub(b, a), len = Math.hypot(...d);
    sc.box('flat', SW, 0.14, 0.14, len, { p: [(a[0] + b[0]) / 2, 1.7, (a[2] + b[2]) / 2], r: [0, Math.atan2(-d[0], -d[2]) / DEG + 180, 0] });
  }
  sr.box('flat', SW, LX * 2, 0.14, 0.14, { p: [0, 1.7, -LF - 0.35] });
  // the bolt on the rail (and the one the hand brings)
  mb.node('bolt', 'gun', [0, 2.15, 0]);
  const bl = mb.pen('bolt');
  bl.tube('flat', [0.25, 0.22, 0.2], 0.0, 14.5, 0, 0.17, 0.17, { n: 5 });
  bl.prism('metal', C.silver, [[14.5, 0.55], [16.8, 0.0], [14.5, -0.55]], 0.08); // broadhead, upright
  bl.prism('metal', C.silver, [[14.5, 0.55], [16.8, 0.0], [14.5, -0.55]], 0.08, { r: [0, 0, 90] });
  bl.prism('flat', C.red, [[0.2, 0.0], [2.6, 0.0], [2.0, 0.75], [0.3, 0.75]], 0.05); // fletching
  bl.prism('flat', [0.92, 0.9, 0.85], [[0.2, 0.0], [2.6, 0.0], [2.0, 0.75], [0.3, 0.75]], 0.05, { r: [0, 0, 120] });
  bl.prism('flat', C.red, [[0.2, 0.0], [2.6, 0.0], [2.0, 0.75], [0.3, 0.75]], 0.05, { r: [0, 0, -120] });
  // a hunting scope
  scope(g, -1.0, 7.0, 4.2, { r: 0.55, rb: 0.8, rf: 0.95, base: 1.9 });
  mb.marker('muzzle', 'gun', [0, 2.2, -17.0]);
  mb.marker('shell', 'gun', [0, 2.2, -2.0]);
  const { anims, LHP } = rifleRig(mb, {
    kick: 0.7, shootDur: 0.32, reload: false,
    lh: { at: [0, -0.8, 9.5], fwd: [0.1, -0.2, -1], palm: [1, 0.1, 0], grip: 'cup' },
    rh: { p: [0.85, -1.5, 2.55] },
  });
  // the reload: the gun tips nose-down and left; the hand hauls the string back, fetches a bolt, lays it in
  mb.clone('bolt', 'bolt_new', 'lhand', [0, 0, 0], [0, 0, 0], false);
  const K = (u, h, e) => [u, h.p, h.r, e];
  const STR = handPose([-1.2, 2.8, -12.0], [0.95, 0.0, 0.3], [0, -0.6, 0.8]);
  const PULL = handPose([-1.0, 2.8, -2.0], [0.95, 0.0, 0.3], [0, -0.6, 0.8]);
  const AWAY = handPose([-7, -16, -1], [0.3, -0.2, -0.93], [1, 0.4, 0]);
  const LAY = handPose([-0.6, 3.6, -9.0], [0.2, -0.3, -0.93], [0.6, -0.8, 0]);
  const boltIn = rel(LAY, { p: [0, 2.15, 0], r: [0, 0, 0] }); // the bolt in the hand, as it lies on the rail when the hand is at LAY
  mb.nodes.bolt_new.position.set(...boltIn.p);
  mb.nodes.bolt_new.rotation.set(boltIn.r[0] * DEG, boltIn.r[1] * DEG, boltIn.r[2] * DEG, 'YXZ');
  mb.nodes.bolt_new.userData.rest = { p: boltIn.p, r: boltIn.r };
  anims.reload = {
    dur: 1.6, blend: 0.08,
    tracks: {
      rig: [[0, Z, Z], [0.14, [-1.6, 1.2, 1.4], [-14, 12, -10], 'io'], [0.5, [-1.8, 1.0, 1.6], [-16, 14, -12]], [0.62, [-1.2, 1.6, 1.0], [-6, 14, -16], 'io'], [0.86, [-1.0, 1.4, 0.8], [-5, 12, -14]], [1, Z, Z, 'io']],
      lhand: { abs: true, k: [K(0, LHP), K(0.14, { p: add(STR.p, [0, 1.6, -1]), r: STR.r }, 'cr'), K(0.2, STR, 'io'), K(0.24, STR), K(0.44, PULL, 'io3'), K(0.48, PULL),
        K(0.6, AWAY, 'in2'), K(0.66, AWAY), K(0.76, { p: add(LAY.p, [0, 3, 2]), r: LAY.r }, 'cr'), K(0.82, LAY, 'io'), K(0.86, LAY), K(0.98, LHP, 'io'), K(1, LHP)] },
      body: [[0, Z, Z], [0.2, [0, -0.2, 0.2], [0.8, 0.6, 0], 'io'], [0.44, [0, -0.5, 0.6], [1.6, -1.2, 0.4], 'io'], [0.86, [0, -0.2, 0.2], [0.6, 0.4, 0], 'io'], [1, Z, Z, 'io']],
    },
    vis: { bolt_new: [[0.66, 0.84, true]] },
  };
  return {
    anims, muzzle: 'muzzle', shell: 'shell',
    post(vm, u) {
      // loaded or not: the string cocked and a bolt on the rail; the reload shows them arrive
      const n = vm.currentAnimation;
      let cocked = !vm.state.empty, bolt = !vm.state.empty;
      if (n === 'reload') { cocked = u >= 0.44; bolt = u >= 0.84; }
      else if (n === 'shoot1' || n === 'shoot2' || n === 'shoot3') { cocked = u < 0.04; bolt = u < 0.02; }
      vm.nodes.string_c.visible = cocked;
      vm.nodes.string_r.visible = !cocked;
      vm.nodes.bolt.visible = bolt;
    },
  };
}

// ---------------------------------------------------------------- throwables
function throwRig(mb) {
  hold(mb, [0, 0, 0]);
  const RH = handPose([5.2, -5.3, -8.8], [0.355, -0.0835, -0.922], [-0.82, -0.5, -0.27]);
  mb.node('rhand', 'rig', RH.p, RH.r);
  arm(mb, 'rhand_arm', 'rhand', 'R', { p: [0, 0, 0], fwd: [0, 0, -1], palm: [0, -1, 0], elbow: [14, -28, -2], grip: 'hold', len: 18 });
  const LA = handPose([-9, -24, -6], [0.5, 0.6, -0.6], [0.6, -0.2, -0.7]);
  mb.node('lhand', 'rig', LA.p, LA.r);
  return { RH, LA };
}
const K = (u, h, e) => [u, h.p, h.r, e];
const off = (h, d, dr = [0, 0, 0]) => ({ p: add(h.p, d), r: add(h.r, dr) });
function throwAnims(RH, LA, extra = {}) {
  const RHc = off(RH, [1.6, 2.6, 1.2], [-24, -8, 18]);
  const RHb = off(RH, [4.5, 4.8, 3.6], [-45, -16, 30]);
  return {
    idle: idle({ amp: 1 }),
    draw: { dur: 0.75, blend: 0.05, tracks: {
      rhand: { abs: true, k: [K(0, off(RH, [2.5, -11, 4], [40, 10, -20])), K(0.42, off(RH, [0.5, -1.5, 0.6], [6, 2, -4]), 'cr'), K(0.66, off(RH, [0, 0.35, -0.1], [-2, 0, 1]), 'cr'), K(0.86, RH, 'io')] },
      body: [[0, [0, -0.4, 0.2], [-1, 0, 0]], [0.6, Z, [0.4, 0, 0], 'out2'], [0.9, Z, Z, 'io']],
    } },
    throw: { dur: 0.6, hold: true, blend: 0.04, tracks: {
      rhand: { abs: true, k: [K(0, RHc), K(0.16, RHb, 'out2'),
        K(0.34, handPose([3.0, -3.4, -16.5], [0.05, -0.4, -0.9], [-0.7, -0.6, 0.3]), 'in2'),
        K(0.55, handPose([1.0, -13, -13], [-0.1, -0.9, -0.4], [-0.6, -0.4, 0.6]), 'out2'),
        K(1, handPose([3, -30, -9], [0, -0.9, -0.4], [-0.6, -0.4, 0.6]), 'io')] },
      lhand: { abs: true, k: [K(0, off(LA, [0, -2, 0]))] },
      body: [[0, [0, 0.1, 0.3], [0.8, -1.2, 0]], [0.16, [0, 0.25, 0.7], [1.6, -3.5, -0.5], 'out2'], [0.36, [0, -0.35, -1.4], [-3.0, 4.5, 1.0], 'in2'], [0.6, [0, -0.2, -0.6], [-1.2, 2.0, 0.4], 'out2'], [1, Z, Z, 'io']],
    }, vis: { grenade: [[0.33, 1, false]], ...(extra.throwVis || {}) } },
    RHc,
  };
}

// The pipe bomb: a capped steel pipe, taped, a timer box with an LED and a wire. The "pin":
// the left thumb flicks its switch and the LED starts blinking.
function pipebomb(mb) {
  const { RH, LA } = throwRig(mb);
  arm(mb, 'lhand_arm', 'lhand', 'L', { p: [0, 0, 0], fwd: [0, 0, -1], palm: [0, -1, 0], elbow: [-12, -26, -4], pole: [-0.3, -1, 0.15], grip: 'point', len: 18 });
  mb.node('grenade', 'rhand', [-0.2, -1.9, -3.3], [-90, 0, 45]); // (the pipe across the fist, up and forward)
  const g = mb.pen('grenade');
  const up = { r: [-90, 0, 0] }; // lathe axis Z -> Y
  g.lathe('metal', [0.5, 0.5, 0.52], [[0, -3.1], [1.05, -3.1], [1.05, 3.1], [0, 3.1]], { n: 10, ...up }); // the pipe
  for (const y of [-3.6, 3.1]) g.lathe('metal', C.dark, [[0, y], [1.25, y], [1.25, y + 0.55], [0, y + 0.55]], { n: 6, ...up }); // end caps
  for (const y of [-2.0, 1.2]) g.lathe('flat', [0.16, 0.16, 0.17], [[1.07, y], [1.07, y + 0.8]], { n: 10, ...up }); // tape
  g.box('polymer', C.black, 1.0, 2.2, 1.5, { p: [1.3, 0, 0] }); // the timer, strapped on the side
  g.box('flat', [0.25, 0.32, 0.22], 0.05, 1.2, 0.8, { p: [1.82, 0.3, 0] }); // its display
  g.box('flat', C.red, 0.15, 0.15, 1.6, { p: [1.0, 1.2, 0.5], r: [30, 0, 0] }); // the wire
  g.box('flat', [0.85, 0.75, 0.1], 0.15, 0.15, 1.6, { p: [1.0, 1.25, -0.4], r: [-30, 0, 0] });
  mb.node('led', 'grenade', [1.85, -0.55, 0]);
  const LP = handPose([-1.6, -3.0, -9.6], [0.75, 0.2, -0.62], [0.1, -0.9, -0.4]);
  const anims = throwAnims(RH, LA);
  anims.pinpull = { dur: 0.7, hold: true, blend: 0.05, tracks: {
    rhand: { abs: true, k: [K(0, RH), K(0.3, off(RH, [-1.0, 1.0, -0.6], [4, 10, 12]), 'io'), K(0.6, off(RH, [-1.0, 1.0, -0.6], [4, 10, 12])), K(1, anims.RHc, 'io')] },
    lhand: { abs: true, k: [K(0, LA), K(0.3, LP, 'cr'), K(0.42, off(LP, [0.3, -0.4, -0.3], [-8, 0, 0]), 'in2'), K(0.5, LP, 'out2'), K(0.8, off(LA, [0, -2, 0]), 'in2'), K(1, off(LA, [0, -2, 0]))] },
    body: [[0, Z, Z], [0.4, [0, -0.15, 0], [0.6, -0.8, 0], 'io'], [1, [0, 0.1, 0.3], [0.8, -1.2, 0], 'io']],
  } };
  delete anims.RHc;
  mb.marker('muzzle', 'grenade', [0, 0, 0]);
  let led = null;
  return {
    anims, muzzle: 'muzzle', shell: 'muzzle',
    post(vm, u) {
      if (!led) {
        led = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), new THREE.MeshBasicMaterial({ color: 0x401010, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
        vm.nodes.led.add(led);
      }
      // armed once the switch is flicked: blinking, faster as the throw comes
      const n = vm.currentAnimation, armed = (n === 'pinpull' && u > 0.42) || n === 'throw';
      const on = armed && (now() * (n === 'throw' ? 9 : 5)) % 1 < 0.45;
      led.material.color.setHex(on ? 0xff3020 : 0x401010);
      led.scale.setScalar(on ? 1.5 : 1);
    },
  };
}

// The cryo grenade: a white pressure canister with blue bands, a frosted window glowing
// cold, a fuze, spoon and pin (the left hand pulls it, like the HE).
function cryogrenade(mb) {
  const { RH, LA } = throwRig(mb);
  arm(mb, 'lhand_arm', 'lhand', 'L', { p: [0, 0, 0], fwd: [0, 0, -1], palm: [0, -1, 0], elbow: [-12, -26, -4], pole: [-0.3, -1, 0.15], grip: 'pinch', len: 18 });
  const G0 = { p: [-0.2, -1.75, -3.2], r: [0, 0, 90] };
  mb.node('grenade', 'rhand', G0.p, G0.r);
  const g = mb.pen('grenade');
  const up = { r: [-90, 0, 0] };
  g.lathe('metal', [0.9, 0.92, 0.94], [[0, -1.9], [0.88, -1.9], [1.02, -1.7], [1.02, 0.95], [0.86, 1.15], [0, 1.15]], { n: 10, ...up });
  for (const y of [-1.45, 0.45]) g.lathe('flat', [0.22, 0.42, 0.75], [[1.04, y], [1.04, y + 0.32]], { n: 10, ...up }); // blue bands
  g.box('flat', C.white, 0.05, 0.55, 0.9, { p: [1.03, -0.45, 0] }); // the label
  const top = 1.15;
  g.cyl('metal', [0.55, 0.56, 0.55], 0.42, 0.38, 0.55, { n: 8, p: [0, top, 0], r: [-90, 0, 0] });
  g.box('metal', [0.6, 0.6, 0.58], 0.5, 0.12, 1.1, { p: [0, top + 0.5, 0.45], r: [-8, 0, 0] });
  g.box('metal', [0.6, 0.6, 0.58], 0.5, 1.9, 0.12, { p: [0, top - 0.5, 1.12], r: [-6, 0, 0] });
  mb.node('pin', 'grenade', [0, top + 0.3, -0.45]);
  const p = mb.pen('pin');
  p.cyl('metal', [0.75, 0.75, 0.72], 0.06, 0.06, 0.9, { n: 4, p: [0.45, 0, 0], r: [0, 90, 0] });
  p.at([-0.85, 0, 0], [0, 20, 0]);
  ring(p, 0, 0, 0.42, 0.09, [0.78, 0.78, 0.74], 8);
  mb.node('window', 'grenade', [0, -0.5, 0]);
  // the left index hooks the ring (as the HE's)
  const RHp = off(RH, [-1.4, 1.1, -0.8], [6, 12, 14]);
  const PIN = { p: [0, top + 0.3, -0.45], r: [0, 0, 0] };
  const rng = chain(chain(chain(RHp, G0), PIN), { p: [-0.85, 0, 0], r: [0, 0, 0] });
  const lpr = handPose([0, 0, 0], [0.75, 0.2, -0.62], [0.1, -0.9, -0.4]);
  const tip = chain(lpr, { p: [1.15, -1.0, -5.0], r: [0, 0, 0] }).p;
  const LP = { p: sub(rng.p, tip), r: lpr.r };
  const pinRel = rel(LP, chain(chain(RHp, G0), PIN));
  mb.clone('pin', 'pin_hand', 'lhand', pinRel.p, pinRel.r);
  const LPout = off(LP, [-4.5, -2.0, 2.0], [0, 15, -35]);
  const anims = throwAnims(RH, LA, { throwVis: { pin: [[0, 1, false]] } });
  anims.pinpull = { dur: 0.95, hold: true, blend: 0.05, tracks: {
    rhand: { abs: true, k: [K(0, RH), K(0.28, RHp, 'io'), K(0.47, RHp), K(0.56, off(RHp, [0.3, -0.3, 0.2], [0, 0, -6]), 'out2'), K(1, anims.RHc, 'io')] },
    lhand: { abs: true, k: [K(0, LA), K(0.2, off(LP, [-2.5, -6, 2.5], [-10, 0, 20]), 'cr'), K(0.34, off(LP, [-0.4, -0.6, 0.4]), 'cr'), K(0.4, LP, 'io'), K(0.47, LP), K(0.62, LPout, 'in2'), K(0.72, off(LPout, [-1.0, -1.6, 0.6], [0, 0, -10]), 'out2'), K(1, off(LA, [0, -2, 0]), 'in2')] },
    body: [[0, Z, Z], [0.3, [0, -0.15, 0], [0.6, -1.0, 0], 'io'], [0.6, [0, 0, 0.1], [-0.3, 1.0, 0], 'out2'], [1, [0, 0.1, 0.3], [0.8, -1.2, 0], 'io']],
  }, vis: { pin: [[0.47, 1, false]], pin_hand: [[0.47, 1, true]] } };
  delete anims.RHc;
  mb.marker('muzzle', 'grenade', [0, 0, 0]);
  let glow = null;
  return {
    anims, muzzle: 'muzzle', shell: 'muzzle',
    post(vm) {
      if (!glow) {
        glow = new THREE.Mesh(new THREE.CylinderGeometry(1.06, 1.06, 0.8, 10, 1, true), new THREE.MeshBasicMaterial({ color: 0x5ab0ff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
        vm.nodes.window.add(glow);
      }
      const t = now();
      glow.material.opacity = 0.32 + 0.14 * Math.sin(t * 3.1) + (vm.currentAnimation === 'pinpull' ? 0.2 : 0);
    },
  };
}

export const ARSENAL_WEAPONS = { machete, fireaxe, katana, crossbow, pipebomb, cryogrenade };
