// Procedural action animations for the viewmodel.
//
// Every action is sampled each frame into an AnimOut: additive pivot offsets, an optional absolute pivot pose
// (melee swings / throws / item use), part channel values, hand target overrides, held props and flags.
// Time is normalised by the action duration so every animation respects the duration the game asked for.
import * as THREE from 'three';

// ------------------------------------------------------------------------------------------ easing
export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const sm = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
export const seg = (u, a, b) => clamp01((u - a) / (b - a));
export const ramp = (u, a, b) => sm(seg(u, a, b));
/** 0 -> 1 (a..b) hold 1 (b..c) -> 0 (c..d) */
export const env = (u, a, b, c, d) => ramp(u, a, b) * (1 - ramp(u, c, d));
/** smooth bump 0 -> 1 -> 0 over a..b */
export const bump = (u, a, b) => {
  const s = seg(u, a, b);
  return s <= 0 || s >= 1 ? 0 : Math.sin(s * Math.PI);
};
export const easeOutBack = (x, k = 1.6) => {
  const c3 = k + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + k * Math.pow(x - 1, 2);
};
export const easeOutCubic = (x) => 1 - Math.pow(1 - clamp01(x), 3);

/**
 * Hermite / Catmull-Rom track. K = [[u, values[], 'h'?], ...] ('h' = hold: zero tangent at this key).
 * Endpoints always have zero tangents. Writes into `out` (array) and returns it.
 */
export function track(u, K, out) {
  const n = K.length;
  const dim = K[0][1].length;
  if (u <= K[0][0]) { for (let j = 0; j < dim; j++) out[j] = K[0][1][j]; return out; }
  if (u >= K[n - 1][0]) { for (let j = 0; j < dim; j++) out[j] = K[n - 1][1][j]; return out; }
  let i = 0;
  while (i < n - 2 && u > K[i + 1][0]) i++;
  const t0 = K[i][0], t1 = K[i + 1][0];
  const h = t1 - t0;
  const s = (u - t0) / h;
  const s2 = s * s, s3 = s2 * s;
  const h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s, h01 = -2 * s3 + 3 * s2, h11 = s3 - s2;
  for (let j = 0; j < dim; j++) {
    const m0 = tangent(K, i, j), m1 = tangent(K, i + 1, j);
    out[j] = h00 * K[i][1][j] + h10 * h * m0 + h01 * K[i + 1][1][j] + h11 * h * m1;
  }
  return out;
}
function tangent(K, i, j) {
  if (i === 0 || i === K.length - 1 || K[i][2] === 'h') return 0;
  return ((K[i + 1][1][j] - K[i - 1][1][j]) / (K[i + 1][0] - K[i - 1][0])) * 0.85;
}

/** Fire a one-shot event the first time `cond` holds during an action. */
export function once(a, key, cond) {
  if (!cond || a.fired.has(key)) return false;
  a.fired.add(key);
  return true;
}

// ------------------------------------------------------------------------------------------ output
export class AnimOut {
  constructor() {
    this.pos = new THREE.Vector3();
    this.rot = new THREE.Vector3();
    this.absPos = new THREE.Vector3();
    this.absRot = new THREE.Vector3();
    this.rigPos = new THREE.Vector3();
    this.rigRot = new THREE.Vector3();
    this.ch = {};
    this.handL = [];
    this.handR = [];
    this.reset();
  }
  reset() {
    this.pos.set(0, 0, 0);
    this.rot.set(0, 0, 0);
    this.absW = 0;
    this.rigPos.set(0, 0, 0);
    this.rigRot.set(0, 0, 0);
    for (const k in this.ch) delete this.ch[k];
    this.mag = null;
    this.handL.length = 0;
    this.handR.length = 0;
    this.shL = null;
    this.shR = null;
    this.propL = null;
    this.propR = null;
    this.hide = false;
    this.finger = null;
    this.flame = false;
    this.arrowVis = null;
    this.arrowOff = null;
    this.cock = null;
    this.draw = null;
    this.chambers = null;
  }
  /** set absolute pose from a 6-array [x,y,z, pitch,yaw,roll] */
  abs(v, w = 1) {
    this.absPos.set(v[0], v[1], v[2]);
    this.absRot.set(v[3], v[4], v[5]);
    this.absW = w;
  }
}

// Hand rest positions in rig space (metres)
const L_OFF = [-0.1, -0.52, -0.26];   // below the screen (mag pouch)
const L_POUCH = [-0.16, -0.48, -0.2];
const R_OFF = [0.2, -0.52, -0.22];
const R_QUIVER = [0.32, -0.5, -0.12];

// ------------------------------------------------------------------------------------------ reloads
function reloadMag(a, o, vm) {
  const m = vm.meta;
  const u = clamp01(a.t / a.dur);
  const pistol = m.hold === 'pistol';
  const charge = a.data.charge;
  const cs = m.reload?.charge || 'catch';
  const T = charge
    ? { rel: 0.1, gone: 0.3, back: 0.42, seat: 0.6, ins: 0.68, cg: 0.76, pull: 0.82, snap: 0.86, ret: 0.97 }
    : { rel: 0.12, gone: 0.34, back: 0.48, seat: 0.72, ins: 0.8, cg: 0.8, pull: 0.8, snap: 0.8, ret: 0.97 };
  const tilt = ramp(u, 0, 0.13) * (1 - ramp(u, T.ret - 0.15, T.ret));
  if (pistol) {
    o.rot.set(0.12, 0.35, -0.5).multiplyScalar(tilt);
    o.pos.set(-0.065, 0.09, 0.02).multiplyScalar(tilt);
  } else {
    o.rot.set(0.16, 0.24, -0.6).multiplyScalar(tilt);
    o.pos.set(-0.07, 0.045, 0.03).multiplyScalar(tilt);
  }
  const seatB = bump(u, T.ins - 0.005, T.ins + 0.07);
  o.pos.y += seatB * 0.01;
  o.rot.x += seatB * 0.05;
  // magazine (cm along the mag axis)
  let d = 0, vis = true;
  if (u >= T.rel && u < T.back) {
    const s = (u - T.rel) / (T.gone - T.rel);
    d = s * s * 48;
    vis = s < 1;
  } else if (u >= T.back && u < T.seat) d = 34 - 27 * sm(seg(u, T.back, T.seat));
  else if (u >= T.seat && u < T.ins) {
    const s = seg(u, T.seat, T.ins);
    d = 7 * (1 - s * s);
  }
  o.mag = { d, vis };
  if (once(a, 'ins', u >= T.ins)) vm.kick(0.25);
  // charging handle / slide
  if (charge) {
    const pull = ramp(u, T.cg + 0.005, T.pull) * (1 - seg(u, T.snap - 0.004, T.snap + 0.01));
    const locked = a.data.locked && u < T.snap ? 1 : 0;
    const v = Math.max(pull, locked);
    if (cs === 'rack') o.ch.slide = v;
    else if (cs === 'side' || cs === 'front') o.ch.charge = v;
    const cb = bump(u, T.pull - 0.02, T.snap + 0.08);
    o.rot.z += cb * (cs === 'side' ? 0.14 : -0.06);
    o.rot.x += cb * 0.03;
    if (once(a, 'snap', u >= T.snap)) vm.kick(0.35);
  } else if (a.data.locked) {
    o.ch.slide = 1 - seg(u, 0.88, 0.9);
    if (once(a, 'snap', u >= 0.9)) vm.kick(0.3);
  }
  // left hand
  const L = o.handL;
  const grab = m.mag?.grab;
  if (!pistol && grab) L.push({ w: env(u, 0.03, 0.11, T.gone - 0.1, T.gone - 0.02), point: grab });
  L.push({ w: ramp(u, pistol ? 0.05 : T.gone - 0.1, pistol ? 0.25 : T.gone) * (1 - ramp(u, T.back - 0.02, T.back + 0.04)), rig: L_OFF });
  if (grab) {
    L.push({
      w: ramp(u, T.back - 0.02, T.back + 0.04) * (1 - (charge ? ramp(u, T.cg - 0.001, T.cg) : ramp(u, T.ins + 0.02, T.ret - 0.02))),
      point: grab, off: [0, -0.012, 0],
    });
  }
  if (charge) {
    const cgPt = vm.model.points.chargeGrab ? 'chargeGrab' : grab;
    L.push({ w: env(u, T.ins + 0.004, T.cg, T.snap + 0.01, T.ret - 0.03), point: cgPt });
  }
}

/** Clear a jam: tilt, rack the slide / pull the charging handle / cycle the action. */
function unjamAnim(a, o, vm) {
  const m = vm.meta;
  const u = clamp01(a.t / a.dur);
  const tilt = ramp(u, 0, 0.2) * (1 - ramp(u, 0.75, 1));
  o.rot.set(0.1, 0.25, m.hold === 'pistol' ? -0.35 : 0.35).multiplyScalar(tilt);
  o.pos.set(-0.04, 0.04, 0.02).multiplyScalar(tilt);
  const pull = ramp(u, 0.3, 0.5) * (1 - ramp(u, 0.6, 0.66));
  const ch = m.channels;
  if (ch.slide) o.ch.slide = pull;
  else if (ch.charge) o.ch.charge = pull;
  else if (ch.pump) o.ch.pump = pull;
  else if (ch.boltBack) { o.ch.boltLift = ramp(u, 0.2, 0.32) * (1 - ramp(u, 0.68, 0.78)); o.ch.boltBack = pull; }
  else if (ch.breakOpen) o.ch.breakOpen = bump(u, 0.2, 0.75) * 0.8;
  const pts = vm.model.points;
  if (ch.boltBack && pts.boltGrab) o.handR.push({ w: env(u, 0.1, 0.25, 0.75, 0.9), point: 'boltGrab' });
  else {
    const grab = pts.chargeGrab ? 'chargeGrab' : null;
    if (grab) o.handL.push({ w: env(u, 0.12, 0.3, 0.66, 0.85), point: grab });
  }
  if (once(a, 'eject', u > 0.5) && vm.ejectShells && m.shell) vm.ejectAt('eject', m.shell, [1, 0.6, 0.2]);
  if (once(a, 'snap', u > 0.64)) vm.kick(0.35);
}

/** Generic fallback reload (any kind on a model without the needed parts) */
function reloadGeneric(a, o, vm) {
  const u = clamp01(a.t / a.dur);
  const tilt = ramp(u, 0, 0.15) * (1 - ramp(u, 0.82, 0.98));
  o.rot.set(0.15, 0.25, -0.5).multiplyScalar(tilt);
  o.pos.set(-0.05, 0.04, 0.03).multiplyScalar(tilt);
  o.handL.push({ w: env(u, 0.1, 0.3, 0.45, 0.62), rig: L_OFF });
  if (vm.model.points.port) o.handL.push({ w: env(u, 0.5, 0.65, 0.75, 0.88), point: 'port' });
  if (once(a, 'k', u > 0.7)) vm.kick(0.25);
}

/** Hold-type reload phases: 'enter' -> 'hold' (+ inserts) -> 'exit'. Returns {tilt, s (insert progress | -1)} */
function holdPhase(a) {
  const E = a.data.enter, X = a.data.exit;
  let tilt;
  if (a.phase === 'exit') tilt = 1 - sm(clamp01(a.pt / X));
  else tilt = sm(clamp01(a.t / E));
  const s = a.ins ? clamp01(a.it / a.idur) : -1;
  return { tilt, s, enterU: clamp01(a.t / E), exitU: a.phase === 'exit' ? clamp01(a.pt / X) : 0 };
}

function reloadShell(a, o, vm) {
  const { tilt, s } = holdPhase(a);
  o.rot.set(0.1, 0.32, -0.9).multiplyScalar(tilt);
  o.pos.set(-0.085, 0.06, 0.035).multiplyScalar(tilt);
  // left hand sits near the loading port, below it
  o.handL.push({ w: tilt, point: 'port', off: [-0.02, -0.045, 0.02] });
  if (s >= 0) {
    const away = env(s, 0.0, 0.32, 0.4, 0.68);
    o.handL.push({ w: away, rig: L_POUCH });
    const push = bump(s, 0.62, 1.0);
    o.handL.push({ w: push, point: 'port', off: [-0.005, -0.012, -0.012] });
    o.propL = s > 0.3 && s < 0.86 ? 'shell' : null;
    if (once(a, 'in' + a.insN, s > 0.84)) vm.kick(0.15);
    o.pos.y += bump(s, 0.8, 1.0) * 0.006;
  }
}

function reloadRevolver(a, o, vm) {
  const { tilt, s, enterU, exitU } = holdPhase(a);
  o.rot.set(0.85, 0.45, 0.35).multiplyScalar(tilt);
  o.pos.set(-0.06, 0.07, 0.07).multiplyScalar(tilt);
  // cylinder swings out quickly at the start, back at the start of the exit
  const out = a.phase === 'exit' ? 1 - ramp(exitU, 0.0, 0.3) : ramp(enterU, 0.25, 0.6);
  o.ch.cylinderOut = out;
  if (a.phase === 'exit') {
    o.rot.z += bump(exitU, 0.0, 0.4) * 0.35; // wrist flick
    if (once(a, 'close', exitU > 0.28)) vm.kick(0.25);
  }
  if (once(a, 'eject', enterU > 0.8) && vm.ejectShells) {
    for (let i = 0; i < 6; i++) vm.ejectAt('chamber', 'round_case', [0.2 * (Math.random() - 0.5), -0.6, 0.5]);
  }
  o.handL.push({ w: tilt, point: 'chamber', off: [-0.04, -0.03, 0.03] });
  if (enterU < 1 && a.phase !== 'exit') {
    // ejector rod push with the left palm
    o.handL.push({ w: bump(enterU, 0.55, 1.0), point: 'muzzle', off: [0, 0.0, -0.02] });
  }
  if (s >= 0) {
    o.handL.push({ w: env(s, 0.0, 0.3, 0.42, 0.66), rig: L_POUCH });
    o.handL.push({ w: bump(s, 0.6, 1.0), point: 'chamber', off: [0, 0.0, 0.035] });
    o.propL = s > 0.3 && s < 0.82 ? 'revolver' : null;
    if (once(a, 'in' + a.insN, s > 0.82)) {
      vm.state.cylRotTarget += Math.PI / 3;
      vm.kick(0.08);
    }
  }
}

function reloadBolt(a, o, vm) {
  const { tilt, s, enterU, exitU } = holdPhase(a);
  o.rot.set(0.06, 0.16, 0.38).multiplyScalar(tilt);
  o.pos.set(-0.05, 0.035, 0.03).multiplyScalar(tilt);
  let lift, back;
  if (a.phase === 'exit') {
    back = 1 - ramp(exitU, 0.05, 0.4);
    lift = 1 - ramp(exitU, 0.4, 0.62);
    o.handR.push({ w: 1 - ramp(exitU, 0.66, 1.0), point: 'boltGrab' });
    if (once(a, 'close', exitU > 0.62)) vm.kick(0.15);
  } else {
    lift = ramp(enterU, 0.3, 0.55);
    back = ramp(enterU, 0.55, 0.95);
    o.handR.push({ w: ramp(enterU, 0.0, 0.3), point: 'boltGrab' });
    if (once(a, 'eject', enterU > 0.9) && vm.ejectShells && a.data.spent) vm.ejectAt('eject', 'big_case', [1, 0.5, 0.2]);
  }
  o.ch.boltLift = lift;
  o.ch.boltBack = back;
  o.finger = false;
  o.handL.push({ w: tilt * 0.6, point: 'port', off: [-0.03, -0.03, 0.03] });
  if (s >= 0) {
    o.handL.push({ w: env(s, 0.0, 0.3, 0.42, 0.66), rig: L_POUCH });
    o.handL.push({ w: bump(s, 0.58, 1.0), point: 'port', off: [0, -0.005 + bump(s, 0.72, 0.92) * -0.012, 0] });
    o.propL = s > 0.3 && s < 0.84 ? 'big' : null;
    if (once(a, 'in' + a.insN, s > 0.84)) vm.kick(0.08);
  }
}

function reloadBreak(a, o, vm) {
  const u = clamp01(a.t / a.dur);
  const open = ramp(u, 0.03, 0.15) * (1 - ramp(u, 0.8, 0.86));
  const tilt = ramp(u, 0, 0.14) * (1 - ramp(u, 0.84, 0.98));
  o.ch.breakOpen = open;
  o.ch.lever = Math.max(env(u, 0.0, 0.04, 0.1, 0.16), env(u, 0.76, 0.79, 0.84, 0.88));
  o.rot.set(0.42, 0.3, -0.25).multiplyScalar(tilt);
  o.pos.set(-0.07, 0.065, 0.05).multiplyScalar(tilt);
  o.ch.shellEject = ramp(u, 0.17, 0.24);
  o.chambers = u < 0.24 || u > 0.62;
  if (u > 0.62) o.ch.shellEject = 0;
  if (once(a, 'eject', u > 0.2) && vm.ejectShells) {
    vm.ejectAt('chamber', 'shell_case', [0.25, 1.0, 0.9]);
    vm.ejectAt('chamber', 'shell_case', [-0.25, 1.1, 0.8]);
  }
  if (once(a, 'open', u > 0.12)) vm.kick(0.15);
  if (once(a, 'close', u > 0.86)) vm.kick(0.4);
  // left hand: forend (default) -> pouch -> chambers -> forend
  o.handL.push({ w: env(u, 0.22, 0.38, 0.44, 0.52), rig: L_POUCH });
  o.handL.push({ w: env(u, 0.44, 0.54, 0.62, 0.7), point: 'chamber', off: [0, 0.035, 0.05] });
  o.propL = u > 0.38 && u < 0.62 ? 'shell' : null;
}

function reloadCrossbow(a, o, vm) {
  const u = clamp01(a.t / a.dur);
  const tilt = ramp(u, 0, 0.12) * (1 - ramp(u, 0.86, 0.99));
  o.rot.set(-0.3, 0.3, -0.3).multiplyScalar(tilt);
  o.pos.set(-0.05, 0.03, 0.04).multiplyScalar(tilt);
  const wasCocked = a.data.wasCocked;
  o.cock = wasCocked ? 1 : ramp(u, 0.16, 0.46);
  if (!wasCocked) o.handL.push({ w: env(u, 0.04, 0.16, 0.46, 0.54), point: 'nock', off: [0, 0.01, 0.0] });
  if (once(a, 'cock', u > 0.46) && !wasCocked) vm.kick(0.25);
  o.handL.push({ w: env(u, 0.5, 0.6, 0.62, 0.7), rig: L_POUCH });
  const place = ramp(u, 0.64, 0.84);
  o.arrowVis = u > 0.64;
  o.arrowOff = [0, 18 * (1 - place), 6 * (1 - place)];
  o.handL.push({ w: env(u, 0.62, 0.7, 0.84, 0.94), point: 'arrowGrab', off: [0, 0.03, 0] });
}

function reloadBow(a, o, vm) {
  const u = clamp01(a.t / a.dur);
  const e = env(u, 0, 0.2, 0.8, 1);
  if (vm.oneHanded) {
    // the right hand keeps the bow: dip it while the new arrow slides onto the rest
    o.rot.set(-0.25, 0.1, 0.3).multiplyScalar(e);
    o.pos.set(-0.02, -0.05, 0.03).multiplyScalar(e);
  } else {
    o.rot.set(0.0, 0.08, 0.15).multiplyScalar(e);
    o.handR.push({ w: env(u, 0.05, 0.32, 0.4, 0.66), rig: R_QUIVER });
  }
  const nock = ramp(u, 0.55, 0.85);
  o.arrowVis = u > 0.5;
  o.arrowOff = [4 * (1 - nock), 9 * (1 - nock), 14 * (1 - nock)];
  o.draw = 0;
}

// ------------------------------------------------------------------------------------------ cycling
function pumpAnim(a, o, vm) {
  const u = clamp01(a.t / a.dur);
  o.ch.pump = ramp(u, 0.04, 0.38) * (1 - ramp(u, 0.52, 0.86));
  const b = bump(u, 0.0, 1.0);
  o.rot.set(-0.03, 0.05, -0.09).multiplyScalar(b);
  o.pos.set(0.0, -0.008, 0.014).multiplyScalar(b);
  if (once(a, 'eject', u > 0.36) && vm.ejectShells && vm.meta.ejectOnPump !== false) vm.ejectAt('eject', vm.meta.shell === 'shell' ? 'shell_case' : 'round_case', [1, 0.7, 0.2]);
  if (once(a, 'slam', u > 0.86)) vm.kick(0.3);
}

function boltAnim(a, o, vm) {
  const u = clamp01(a.t / a.dur);
  o.ch.boltLift = ramp(u, 0.1, 0.24) * (1 - ramp(u, 0.7, 0.82));
  o.ch.boltBack = ramp(u, 0.26, 0.42) * (1 - ramp(u, 0.5, 0.66));
  o.handR.push({ w: env(u, 0.0, 0.11, 0.84, 0.98), point: 'boltGrab' });
  o.finger = false;
  const b = env(u, 0.0, 0.14, 0.82, 1.0);
  o.rot.set(0.03, 0.06, 0.24).multiplyScalar(b);
  o.pos.set(-0.02, 0.01, 0.015).multiplyScalar(b);
  if (once(a, 'eject', u > 0.42) && vm.ejectShells) vm.ejectAt('eject', vm.meta.shell === 'shell' ? 'shell_case' : 'big_case', [1, 0.6, 0.2]);
  if (once(a, 'lock', u > 0.8)) vm.kick(0.15);
}

// ------------------------------------------------------------------------------------------ melee
// keys: [u, [x,y,z, pitch,yaw,roll], 'h'?]  absolute pivot poses in camera space; 'B' = live base pose.
// hit = normalised impact time (swing() returns hit * duration)
export const SWINGS = {
  // one-handed: forehand diagonal (upper right -> lower left) / backhand (left -> right)
  blunt1: { hit: 0.38, keys: [[0.28, [0.26, 0.0, -0.3, 0.51, 0.0, -0.41], 'h'], [0.38, [0.1, -0.12, -0.42, -0.82, 0.0, 0.85]], [0.5, [-0.08, -0.26, -0.38, -1.85, 0.0, 0.78]], [0.66, [0.0, -0.32, -0.36, -1.5, 0.1, 0.6]]] },
  blunt1b: { hit: 0.38, keys: [[0.28, [-0.06, -0.02, -0.32, 0.52, 0.0, 0.52], 'h'], [0.38, [0.12, -0.1, -0.44, -0.88, 0.0, -0.78]], [0.5, [0.28, -0.24, -0.36, -1.96, 0.0, -0.85]], [0.66, [0.26, -0.3, -0.34, -1.4, 0.1, -0.4]]] },
  heavy1: { hit: 0.46, keys: [[0.34, [0.2, 0.06, -0.28, 0.93, 0.0, -0.1], 'h'], [0.46, [0.08, -0.08, -0.46, -1.32, 0.0, 0.1]], [0.58, [0.05, -0.28, -0.4, -2.1, 0.0, 0.05]], [0.72, [0.1, -0.32, -0.38, -1.4, 0.1, 0.2]]] },
  blade1: { hit: 0.36, keys: [[0.26, [0.28, 0.02, -0.3, 0.64, 0.0, -0.58], 'h'], [0.36, [0.08, -0.1, -0.44, -0.96, 0.0, 1.02]], [0.48, [-0.12, -0.2, -0.38, -1.82, 0.0, 0.93]], [0.64, [-0.02, -0.3, -0.36, -1.4, 0.1, 0.7]]] },
  blade1b: { hit: 0.36, keys: [[0.26, [-0.06, -0.04, -0.32, 0.69, 0.0, 0.64], 'h'], [0.36, [0.12, -0.1, -0.44, -0.96, 0.0, -1.02]], [0.48, [0.3, -0.18, -0.36, -1.82, 0.0, -0.93]], [0.64, [0.26, -0.28, -0.34, -1.3, 0.1, -0.5]]] },
  stab1: { hit: 0.36, keys: [[0.25, [0.2, -0.18, -0.25, -1.27, 0.1, 0.1], 'h'], [0.36, [0.07, -0.09, -0.55, -1.42, 0.05, 0.05]], [0.48, [0.08, -0.1, -0.52, -1.4, 0.05, 0.05], 'h']] },
  // two-handed: horizontal sweep / backhand / overhead / diagonal blade
  blunt2: { hit: 0.42, keys: [[0.3, [0.27, -0.1, -0.38, 0.35, 0.0, -0.55], 'h'], [0.42, [0.08, -0.12, -0.44, -1.28, 0.0, 1.02]], [0.56, [-0.16, -0.18, -0.36, -1.74, 0.0, 0.93]], [0.72, [-0.04, -0.28, -0.38, -1.3, 0.1, 0.8]]] },
  blunt2b: { hit: 0.42, keys: [[0.3, [-0.12, -0.1, -0.4, 0.4, 0.0, 0.6], 'h'], [0.42, [0.1, -0.12, -0.44, -1.28, 0.0, -1.02]], [0.56, [0.3, -0.18, -0.36, -1.74, 0.0, -0.93]], [0.72, [0.26, -0.26, -0.38, -1.2, 0.1, -0.3]]] },
  heavy2: { hit: 0.48, keys: [[0.36, [0.13, -0.03, -0.38, 0.75, 0.0, -0.15], 'h'], [0.48, [0.05, -0.12, -0.46, -1.26, 0.0, 0.05]], [0.6, [0.03, -0.3, -0.42, -2.04, 0.0, 0.03]], [0.76, [0.1, -0.3, -0.42, -1.3, 0.1, 0.25]]] },
  blade2: { hit: 0.41, keys: [[0.3, [0.25, -0.06, -0.38, 0.35, 0.0, -0.5], 'h'], [0.41, [0.06, -0.12, -0.44, -1.06, 0.0, 0.78]], [0.54, [-0.14, -0.26, -0.38, -2.05, 0.0, 0.71]], [0.7, [-0.02, -0.3, -0.38, -1.4, 0.1, 0.6]]] },
  blade2b: { hit: 0.41, keys: [[0.3, [-0.1, -0.08, -0.4, 0.38, 0.0, 0.55], 'h'], [0.41, [0.1, -0.12, -0.44, -1.06, 0.0, -0.78]], [0.54, [0.3, -0.24, -0.36, -2.05, 0.0, -0.71]], [0.7, [0.26, -0.3, -0.38, -1.3, 0.1, -0.3]]] },
  stab2: { hit: 0.4, keys: [[0.28, [0.13, -0.15, -0.16, -1.4, 0.12, 0.12], 'h'], [0.4, [0.07, -0.12, -0.42, -1.5, 0.03, 0.05]], [0.52, [0.08, -0.13, -0.38, -1.48, 0.04, 0.06], 'h']] },
  // fists
  jabR: { hit: 0.36, keys: [[0.2, [0.18, -0.17, -0.27, 0.15, 0.3, -0.1], 'h'], [0.36, [0.05, -0.1, -0.56, 0.05, 0.05, -0.45]], [0.5, [0.06, -0.11, -0.52, 0.05, 0.05, -0.4], 'h']] },
  jabL: { hit: 0.36, keys: [[0.2, [0.19, -0.19, -0.3, 0.12, 0.25, -0.1]], [0.5, [0.19, -0.19, -0.3, 0.12, 0.25, -0.1]]],
    L: [[0.2, [-0.17, -0.17, -0.27], 'h'], [0.36, [-0.04, -0.1, -0.56]], [0.5, [-0.05, -0.11, -0.52], 'h']] },
  hook: { hit: 0.46, keys: [[0.32, [0.25, -0.13, -0.22, 0.2, -0.4, -0.3], 'h'], [0.46, [0.01, -0.09, -0.5, 0.1, 0.5, -1.2]], [0.6, [-0.12, -0.12, -0.44, 0.1, 0.8, -1.3]]] },
  // gun butt / side strike (relative to the base pose)
  gunbash: { hit: 0.4, rel: true, keys: [[0.25, [0.03, -0.02, 0.06, 0.1, -0.35, -0.4], 'h'], [0.4, [-0.07, 0.03, -0.15, -0.05, 0.7, 0.7]], [0.55, [-0.06, 0.02, -0.13, -0.05, 0.65, 0.65], 'h']] },
};

const _b6 = [0, 0, 0, 0, 0, 0];
const _o6 = [0, 0, 0, 0, 0, 0];
const _l3 = [0, 0, 0];

function swingAnim(a, o, vm) {
  const u = clamp01(a.t / a.dur);
  const S = SWINGS[a.data.style];
  vm.getBase6(_b6);
  if (!a.data.K) {
    // build the key list once (base filled per frame)
    a.data.K = [[0, _b6.slice()], ...S.keys.map((k) => [k[0], S.rel ? k[1].map((v, i) => v) : k[1], k[2]]), [1, _b6.slice()]];
  }
  const K = a.data.K;
  K[0][1] = _b6.slice();
  K[K.length - 1][1] = _b6.slice();
  if (S.rel) {
    for (let i = 1; i < K.length - 1; i++) K[i][1] = S.keys[i - 1][1].map((v, j) => v + _b6[j]);
  }
  track(u, K, _o6);
  o.abs(_o6, 1);
  if (S.L) {
    const fl = vm.freeLPos;
    const LK = [[0, fl], ...S.L, [1, fl]];
    track(u, LK, _l3);
    o.handL.push({ w: 1, rig: _l3.slice() });
  }
  // two-handed: during the windup the left elbow swings under the weapon so the forearm hangs down
  // instead of crossing the whole view
  if (vm.meta.hands.L && vm.meta.kind === 'melee' && S.keys.length > 1) {
    const wU = S.keys[0][0], hU = S.hit;
    o.shL = { w: env(u, 0.02, wU, hU + 0.02, Math.min(0.95, hU + 0.25)), rig: [0.14, -0.58, -0.22] };
  }
  // the off hand braces during big one-handed swings
  if (!vm.meta.hands.L && vm.meta.kind === 'melee') {
    o.handL.push({ w: env(u, 0.05, 0.3, 0.5, 0.8) * 0.5, rig: [-0.24, -0.3, -0.36] });
  }
  if (once(a, 'hit', u >= S.hit)) vm.kick(a.data.heavy ? 0.5 : 0.25, true);
}

function shoveAnim(a, o, vm) {
  const u = clamp01(a.t / a.dur);
  const m = vm.meta;
  if (vm.oneHanded && m.kind === 'fists') {
    // one-handed: open right-hand push in toward the middle of the screen
    const b = env(u, 0.0, 0.22, 0.5, 1.0);
    const p = bump(u, 0.12, 0.62);
    o.pos.set(-0.1 * b, 0.055 * b, 0.03 * b - 0.21 * p);
    o.rot.set(0.35 * b, 0.3 * b, -0.3 * b);
    return;
  }
  if (m.kind === 'gun' || m.twoHanded || vm.oneHanded) {
    // weapon / held item turned flat and rammed forward (the only hand drawn is holding it)
    const b = env(u, 0.0, 0.3, 0.45, 1.0);
    const p = bump(u, 0.15, 0.6);
    o.pos.set(-0.05 * b, 0.025 * b, 0.05 * b - 0.17 * p);
    o.rot.set(0.08 * b, 0.6 * b, 0.65 * b);
  } else {
    const fl = vm.freeLPos;
    const K = [[0, fl], [0.22, [-0.15, -0.16, -0.3], 'h'], [0.42, [-0.04, -0.1, -0.6]], [0.55, [-0.05, -0.1, -0.57], 'h'], [1, fl]];
    track(u, K, _l3);
    o.handL.push({ w: 1, rig: _l3.slice() });
    o.shL = { w: env(u, 0.0, 0.3, 0.6, 1.0), rig: [-0.24, -0.36, 0.0] };
    const b = env(u, 0.0, 0.25, 0.55, 1.0);
    o.pos.set(0.03 * b, -0.04 * b, 0.05 * b);
    o.rot.set(0.25 * b, -0.1 * b, -0.15 * b);
  }
}

// ------------------------------------------------------------------------------------------ use / throw
function useAnim(a, o, vm) {
  const D = a.dur;
  const u = clamp01(a.t / D);
  const kind = a.data.kind;
  const swap = !!a.data.temp;
  const sw = swap ? Math.min(0.15, 0.12 / D) : 0; // swap lowering window (normalised)
  const rin = Math.min(0.3, 0.28 / D), rout = Math.min(0.3, 0.28 / D);
  const u0 = sw * 2, u1 = 1 - sw * 2;
  // lowering for item swap
  if (swap) {
    const low = bump(u, 0, sw * 2) + bump(u, 1 - sw * 2, 1);
    o.rigPos.y -= 0.3 * low;
  }
  const raise = ramp(u, u0, u0 + rin) * (1 - ramp(u, u1 - rout, u1));
  const tt = a.t - u0 * D;
  vm.getBase6(_b6);
  const pose = _o6;
  switch (kind) {
    case 'eat': {
      const bite = Math.pow(Math.abs(Math.sin(tt * Math.PI / 0.6)), 3) * ramp(u, u0 + rin, u0 + rin + 0.05);
      pose.splice(0, 6, -0.035, -0.17 + bite * 0.015, -0.27 + bite * 0.04, 0.25 + bite * 0.25, 0.25, 0.12);
      o.rigPos.y += Math.sin(tt * Math.PI / 0.3) * 0.002 * raise;
      break;
    }
    case 'drink': {
      const gulp = Math.sin(tt * Math.PI / 0.45) * 0.004 * raise;
      pose.splice(0, 6, 0.035, -0.03 + gulp, -0.27, 2.05, 0.15, 0.1);
      break;
    }
    case 'pills': {
      const shake = bump(u, 0.35, 0.62);
      pose.splice(0, 6, -0.02, -0.15 + Math.sin(tt * 30) * 0.004 * shake, -0.26, 0.35 + shake * 0.35, 0.2, 0.15);
      break;
    }
    case 'bandage':
    case 'inject': {
      // left forearm across the bottom of the screen, right hand works around it
      o.handL.push({ w: raise, rig: [0.03, -0.215, -0.36] });
      o.shL = { w: raise, rig: [-0.5, -0.27, -0.2] };
      if (kind === 'bandage') {
        const w = tt * Math.PI * 2 * 1.5;
        pose.splice(0, 6, -0.03 + Math.cos(w) * 0.05, -0.19 + Math.sin(w) * 0.045, -0.37 + Math.sin(w) * 0.03, -0.3 + Math.sin(w) * 0.3, 0.7, 0.2 + Math.cos(w) * 0.3);
      } else {
        const stab = ramp(u, 0.38, 0.46) * (1 - ramp(u, 0.72, 0.8));
        pose.splice(0, 6, 0.06 - stab * 0.035, -0.15 - stab * 0.04, -0.37 + stab * 0.0, -0.9, 1.15, 0.6);
        o.rigPos.y -= bump(u, 0.44, 0.52) * 0.005;
      }
      break;
    }
    case 'read': {
      const flip = bump((tt % 1.6) / 1.6, 0.75, 1.0);
      pose.splice(0, 6, -0.075, -0.145, -0.28, -0.3, -0.05 + flip * 0.15, 0.04);
      o.handL.push({ w: raise, rig: [-0.12, -0.2, -0.31] });
      break;
    }
    case 'craft':
    default: {
      o.hide = raise > 0.3;
      const hammer = Math.abs(Math.sin(tt * Math.PI * 2.4));
      pose.splice(0, 6, 0.07, -0.2 + hammer * 0.035, -0.34, 0.2, 0.2, 0.2);
      o.handL.push({ w: raise, rig: [-0.07 + Math.sin(tt * 5) * 0.01, -0.22, -0.34 + Math.cos(tt * 5) * 0.01] });
      break;
    }
  }
  for (let i = 0; i < 6; i++) pose[i] = _b6[i] + (pose[i] - _b6[i]) * raise;
  o.abs(pose, 1);
}

function throwAnim(a, o, vm) {
  const u = clamp01(a.t / a.dur);
  vm.getBase6(_b6);
  const below = [_b6[0], _b6[1] - 0.3, _b6[2] + 0.05, _b6[3] - 0.6, _b6[4], _b6[5]];
  const K = [
    [0, _b6],
    // wind-up: hand back beside the head (mostly off screen, not a giant item in front of the eye)
    [0.38, [0.34, 0.03, -0.15, 0.5, -0.3, -0.4], 'h'],
    [0.5, [0.06, -0.06, -0.52, -0.5, 0.1, 0.1]],
    [0.62, [-0.05, -0.32, -0.45, -1.2, 0.15, 0.2]],
    [0.8, below, 'h'],
    [1, _b6],
  ];
  track(u, K, _o6);
  o.abs(_o6, 1);
  o.hide = u > 0.47 && (u < 0.8 || !a.data.reshow);
  o.flame = u > 0.08 && u < 0.47;
  o.handL.push({ w: env(u, 0.05, 0.3, 0.48, 0.68), rig: [-0.14, -0.06, -0.46] });
  o.shL = { w: env(u, 0.05, 0.3, 0.48, 0.68), rig: [-0.3, -0.25, 0.05] };
}

export const SAMPLERS = {
  reloadMag, reloadGeneric, unjam: unjamAnim, reloadShell, reloadRevolver, reloadBolt, reloadBreak, reloadCrossbow, reloadBow,
  pump: pumpAnim, bolt: boltAnim, swing: swingAnim, shove: shoveAnim, use: useAnim, throw: throwAnim,
};
