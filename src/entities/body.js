// Humanoid body representation shared by infected, special infected and
// survivors: 15 world-space joints driven either by a procedural animator
// (IK legs/arms, gait cycles, reactions) or by a Verlet ragdoll. Rendered by
// deriving one transform per body part from joint pairs.
import { clamp, lerp, noise1 } from '../core/math.js';

export const J = {
  PELVIS: 0, CHEST: 1, HEAD: 2,
  LSH: 3, LEL: 4, LHA: 5,
  RSH: 6, REL: 7, RHA: 8,
  LHIP: 9, LKN: 10, LFT: 11,
  RHIP: 12, RKN: 13, RFT: 14,
};
export const NJ = 15;

// Body parts: [name, jointA, jointB, radius (for hit tests), zone]
export const PARTS = [
  ['torso', J.PELVIS, J.CHEST, 0.17, 'torso'],
  ['head', J.CHEST, J.HEAD, 0.13, 'head'],
  ['uarmL', J.LSH, J.LEL, 0.065, 'armL'],
  ['farmL', J.LEL, J.LHA, 0.055, 'armL'],
  ['uarmR', J.RSH, J.REL, 0.065, 'armR'],
  ['farmR', J.REL, J.RHA, 0.055, 'armR'],
  ['thighL', J.LHIP, J.LKN, 0.085, 'legL'],
  ['shinL', J.LKN, J.LFT, 0.065, 'legL'],
  ['thighR', J.RHIP, J.RKN, 0.085, 'legR'],
  ['shinR', J.RKN, J.RFT, 0.065, 'legR'],
];
export const PART = Object.fromEntries(PARTS.map((p, i) => [p[0], i]));
// Which parts are removed together when a limb is severed at a part
export const SEVER_CHILDREN = {
  [PART.head]: [PART.head],
  [PART.uarmL]: [PART.uarmL, PART.farmL],
  [PART.farmL]: [PART.farmL],
  [PART.uarmR]: [PART.uarmR, PART.farmR],
  [PART.farmR]: [PART.farmR],
  [PART.thighL]: [PART.thighL, PART.shinL],
  [PART.shinL]: [PART.shinL],
  [PART.thighR]: [PART.thighR, PART.shinR],
  [PART.shinR]: [PART.shinR],
};

// Default proportions (metres) for a 1.78m adult. Scaled per body.
export const PROPS = {
  hip: 0.97, chest: 1.40, head: 1.64, shW: 0.19, hipW: 0.095,
  uarm: 0.29, farm: 0.30, thigh: 0.45, shin: 0.47,
};

// ------------------------------------------------------------ 2-bone IK --
// Solve knee/elbow position given root, target, lengths and pole vector.
// Writes into out[o..o+2]. All inputs are plain numbers.
export function solveIK(rx, ry, rz, tx, ty, tz, a, b, px, py, pz, out, o) {
  let dx = tx - rx, dy = ty - ry, dz = tz - rz;
  let d = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const maxD = (a + b) * 0.999;
  if (d > maxD) { const k = maxD / d; dx *= k; dy *= k; dz *= k; d = maxD; }
  if (d < 1e-4) d = 1e-4;
  const nx = dx / d, ny = dy / d, nz = dz / d;
  // distance along root->target to the circle centre
  const x = (a * a - b * b + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, a * a - x * x));
  // pole projected perpendicular to n
  const pd = px * nx + py * ny + pz * nz;
  let ux = px - nx * pd, uy = py - ny * pd, uz = pz - nz * pd;
  let ul = Math.sqrt(ux * ux + uy * uy + uz * uz);
  if (ul < 1e-5) { ux = 0; uy = 0; uz = 1; ul = 1; }
  ux /= ul; uy /= ul; uz /= ul;
  out[o] = rx + nx * x + ux * h;
  out[o + 1] = ry + ny * x + uy * h;
  out[o + 2] = rz + nz * x + uz * h;
}

// ------------------------------------------------------------------ Body --
export class Body {
  constructor(scale = 1, build = 1) {
    this.j = new Float32Array(NJ * 3); // world joints
    this.prev = new Float32Array(NJ * 3); // last frame (for ragdoll velocity)
    this.scale = scale;
    this.build = build; // width multiplier
    this.right = [1, 0, 0]; // world right vector (for part roll)
    this.fwd = [0, 0, -1];
    this.severed = 0; // bitmask of parts removed
    this.ragdoll = null;
    this.visible = true;
    this.blend = 0; // pose blend weight from snapshot
    this.snap = new Float32Array(NJ * 3);
  }
  setJoint(i, x, y, z) {
    const o = i * 3;
    this.j[o] = x; this.j[o + 1] = y; this.j[o + 2] = z;
  }
  jx(i) { return this.j[i * 3]; }
  jy(i) { return this.j[i * 3 + 1]; }
  jz(i) { return this.j[i * 3 + 2]; }
  storePrev() { this.prev.set(this.j); }
  takeSnapshot(duration = 0.3) {
    this.snap.set(this.j);
    this.blend = 1;
    this.blendRate = 1 / duration;
  }
  applyBlend(dt) {
    if (this.blend <= 0) return;
    const w = this.blend * this.blend * (3 - 2 * this.blend);
    for (let i = 0; i < NJ * 3; i++) this.j[i] = lerp(this.j[i], this.snap[i], w);
    this.blend = Math.max(0, this.blend - dt * this.blendRate);
  }
  centerY() { return this.j[1 * 3 + 1]; }
}

// -------------------------------------------------------- local posing --
// Helper that writes joints from a local frame: origin (x,y,z), yaw.
// local coords: s = right, u = up, f = forward.
export class Poser {
  constructor() {
    this.ox = 0; this.oy = 0; this.oz = 0;
    this.rx = 1; this.rz = 0; // right
    this.fx = 0; this.fz = -1; // forward
    this.tmp = new Float32Array(3);
  }
  frame(x, y, z, yaw) {
    this.ox = x; this.oy = y; this.oz = z;
    this.rx = Math.cos(yaw); this.rz = -Math.sin(yaw);
    this.fx = -Math.sin(yaw); this.fz = -Math.cos(yaw);
  }
  // local -> world into array at offset
  w(s, u, f, out, o) {
    out[o] = this.ox + this.rx * s + this.fx * f;
    out[o + 1] = this.oy + u;
    out[o + 2] = this.oz + this.rz * s + this.fz * f;
  }
  set(body, joint, s, u, f) {
    this.w(s, u, f, body.j, joint * 3);
  }
  // world direction from local
  dir(s, u, f) {
    return [this.rx * s + this.fx * f, u, this.rz * s + this.fz * f];
  }
}

// ---------------------------------------------------- procedural animator --
// Humanoid locomotion + upper body behaviours. params:
//  speed (m/s), phase (radians, advanced externally), crouch 0..1, lean,
//  arms: 'reach'|'swing'|'attack'|'hang'|'hold'|'flail'|'climb'|'custom'
//  attackT 0..1, hitS/hitF (hit reaction offsets), twitch, stumble
const _pole = [0, 0, 0];
export function animateHumanoid(body, P, poser, a) {
  const sc = body.scale;
  const bw = body.build;
  const t = a.time || 0;
  const crouch = a.crouch || 0;
  const spd = a.speed || 0;
  const runK = clamp(spd / 4.5, 0, 1);
  const walkK = clamp(spd / 1.2, 0, 1);
  const ph = a.phase || 0;
  const strideHalf = (0.12 + 0.34 * runK) * walkK * sc;
  const lift = (0.06 + 0.14 * runK) * walkK * sc;
  const lean = (a.lean ?? 0) + runK * 0.18 * (a.runLean ?? 1);
  const hitS = a.hitS || 0, hitF = a.hitF || 0;
  const tw = a.twitch || 0;
  const sway = a.sway ?? 0.02;

  // pelvis
  const bob = Math.abs(Math.sin(ph)) * 0.05 * walkK * (0.5 + runK);
  const hipH = (P.hip - crouch * 0.42 - (a.sink || 0)) * sc - bob + 0.02 * walkK;
  const pelvisS = Math.sin(ph) * 0.03 * walkK + hitS * 0.3 + noise1(t * 0.7 + (a.seed || 0)) * sway;
  const pelvisF = -crouch * 0.1 * sc + hitF * 0.2;
  poser.set(body, J.PELVIS, pelvisS, hipH, pelvisF);
  // chest
  const chestUp = (P.chest - P.hip) * sc;
  const leanTot = lean + crouch * 0.35 + (a.hunch || 0);
  const chS = pelvisS + hitS + noise1(t * 1.3 + (a.seed || 0) * 3) * (sway + tw * 0.08);
  const chF = pelvisF + Math.sin(leanTot) * chestUp + hitF;
  const chU = hipH + Math.cos(leanTot) * chestUp;
  poser.set(body, J.CHEST, chS, chU, chF);
  // head
  const hd = (P.head - P.chest) * sc;
  const headTilt = a.headTilt ?? 0;
  const hS = chS + (a.headS || 0) + noise1(t * 2.1 + (a.seed || 0) * 7) * (0.02 + tw * 0.06) + Math.sin(headTilt) * 0.05;
  poser.set(body, J.HEAD, hS, chU + hd * Math.cos(leanTot * 0.6 + (a.headPitch || 0)), chF + hd * Math.sin(leanTot * 0.6 + (a.headPitch || 0)) + hitF * 0.4);
  // shoulders (slightly below chest top, rotate with chest sway)
  const shW = P.shW * sc * bw;
  const twist = Math.sin(ph) * 0.12 * runK + (a.twist || 0);
  const shU = chU - 0.04 * sc;
  poser.set(body, J.LSH, chS - shW * Math.cos(twist), shU, chF + shW * Math.sin(twist) - 0.02);
  poser.set(body, J.RSH, chS + shW * Math.cos(twist), shU, chF - shW * Math.sin(twist) - 0.02);
  // hips
  const hw = P.hipW * sc * bw;
  poser.set(body, J.LHIP, pelvisS - hw, hipH - 0.03, pelvisF);
  poser.set(body, J.RHIP, pelvisS + hw, hipH - 0.03, pelvisF);

  // ---- legs
  const legLen = (P.thigh + P.shin) * sc;
  for (let side = 0; side < 2; side++) {
    const sgn = side === 0 ? -1 : 1;
    const hipJ = side === 0 ? J.LHIP : J.RHIP;
    const knJ = side === 0 ? J.LKN : J.RKN;
    const ftJ = side === 0 ? J.LFT : J.RFT;
    const p = ph + (side === 0 ? 0 : Math.PI);
    let fs = sgn * (hw + 0.02 + crouch * 0.08) + (a.footS || 0) * sgn;
    let ff = Math.sin(p) * strideHalf + (a.footF || 0);
    let fu = Math.max(0, Math.cos(p)) * lift + 0.08 * sc;
    if (a.legs === 'sit') { ff = 0.45 * sc; fu = 0.08; fs = sgn * 0.18; }
    else if (a.legs === 'kneel') { ff = side === 0 ? 0.25 : -0.35; fu = side === 0 ? 0.08 : 0.12; }
    else if (a.legs === 'climb') { ff = 0.25 + Math.sin(p) * 0.15; fu = 0.4 + Math.max(0, Math.cos(p)) * 0.35; }
    else if (a.legs === 'air') { ff = 0.1 + side * -0.2; fu = hipH - legLen * 0.75; }
    else if (a.legs === 'wide') { fs = sgn * 0.28 * sc; }
    const base = ftJ * 3;
    poser.w(fs, fu, ff, body.j, base);
    const hx = body.j[hipJ * 3], hy = body.j[hipJ * 3 + 1], hz = body.j[hipJ * 3 + 2];
    const pd = poser.dir(sgn * 0.1, 0, 1);
    solveIK(hx, hy, hz, body.j[base], body.j[base + 1], body.j[base + 2], P.thigh * sc, P.shin * sc, pd[0], pd[1], pd[2], body.j, knJ * 3);
  }

  // ---- arms
  const armMode = a.arms || 'hang';
  for (let side = 0; side < 2; side++) {
    const sgn = side === 0 ? -1 : 1;
    const shJ = side === 0 ? J.LSH : J.RSH;
    const elJ = side === 0 ? J.LEL : J.REL;
    const haJ = side === 0 ? J.LHA : J.RHA;
    const p = ph + (side === 0 ? Math.PI : 0);
    const sx = body.j[shJ * 3], sy = body.j[shJ * 3 + 1], sz = body.j[shJ * 3 + 2];
    let hs, hu, hf;
    let pole = [sgn * 0.3, -1, -0.4];
    const armLen = (P.uarm + P.farm) * sc;
    const shL = poserLocal(poser, sx, sy, sz);
    switch (armMode) {
      case 'reach': {
        const n = noise1(t * 1.7 + side * 5 + (a.seed || 0)) * 0.12;
        hs = shL[0] + sgn * 0.05; hu = shL[1] - 0.05 + n + Math.sin(p) * 0.06 * runK; hf = shL[2] + armLen * 0.9;
        pole = [sgn * 0.4, -1, 0];
        break;
      }
      case 'swing': {
        const sw = Math.sin(p) * (0.15 + 0.3 * runK) * walkK;
        hs = shL[0] + sgn * 0.06; hu = shL[1] - armLen * (0.92 - runK * 0.25) + Math.abs(sw) * 0.3; hf = shL[2] + sw + runK * 0.12;
        pole = [sgn * 0.2, -0.5, -1];
        if (runK > 0.5) { hu += 0.18; pole = [sgn * 0.3, -1, -0.8]; }
        break;
      }
      case 'flail': {
        const q = t * 9 + side * 2.1;
        hs = shL[0] + sgn * (0.15 + Math.sin(q) * 0.15); hu = shL[1] + Math.sin(q * 1.3) * 0.35; hf = shL[2] + 0.2 + Math.cos(q) * 0.2;
        pole = [sgn, -0.5, 0];
        break;
      }
      case 'attack': {
        // alternate overhead claws
        const at = ((a.attackT || 0) + side * 0.5) % 1;
        const k = at < 0.45 ? at / 0.45 : 1 - (at - 0.45) / 0.55;
        const up = 1 - k;
        hs = shL[0] + sgn * (0.02 - k * 0.12); hu = shL[1] + up * 0.35 - k * 0.45; hf = shL[2] + 0.25 + k * 0.4;
        pole = [sgn * 0.6, -0.8, -0.2];
        break;
      }
      case 'climb': {
        hs = shL[0] + sgn * 0.08; hu = shL[1] + 0.35 + Math.sin(t * 6 + side * 3) * 0.12; hf = shL[2] + 0.35;
        pole = [sgn * 0.5, -0.5, -0.5];
        break;
      }
      case 'eat': {
        hs = shL[0] + sgn * 0.05 + Math.sin(t * 5 + side) * 0.04; hu = 0.12; hf = 0.55 + Math.cos(t * 4 + side) * 0.05;
        pole = [sgn * 0.6, 0, -0.5];
        break;
      }
      case 'hold': {
        // weapon hold: targets supplied in a.hand{L,R} local coords
        const h = side === 0 ? a.handL : a.handR;
        hs = h[0]; hu = h[1]; hf = h[2];
        pole = side === 0 ? [-0.8, -1, -0.2] : [0.8, -1, -0.4];
        break;
      }
      case 'up': {
        hs = shL[0] + sgn * 0.15; hu = shL[1] + armLen * 0.85; hf = shL[2] + 0.1;
        pole = [sgn, 0, -0.5];
        break;
      }
      case 'custom': {
        const h = side === 0 ? a.handL : a.handR;
        hs = h[0]; hu = h[1]; hf = h[2];
        pole = side === 0 ? (a.poleL || [-1, -1, 0]) : (a.poleR || [1, -1, 0]);
        break;
      }
      default: { // hang
        const sw = Math.sin(p) * 0.08 * walkK;
        hs = shL[0] + sgn * 0.05; hu = shL[1] - armLen * 0.95; hf = shL[2] + sw + 0.03;
        pole = [sgn * 0.2, 0, -1];
      }
    }
    if (side === 1 && a.lostR) { /* severed arm - still posed but hidden */ }
    poser.w(hs, hu, hf, body.j, haJ * 3);
    const pd = poser.dir(pole[0], pole[1], pole[2]);
    solveIK(sx, sy, sz, body.j[haJ * 3], body.j[haJ * 3 + 1], body.j[haJ * 3 + 2], P.uarm * sc, P.farm * sc, pd[0], pd[1], pd[2], body.j, elJ * 3);
  }
  body.right[0] = poser.rx; body.right[1] = 0; body.right[2] = poser.rz;
  body.fwd[0] = poser.fx; body.fwd[1] = 0; body.fwd[2] = poser.fz;
}

// World point -> local (s,u,f) of the poser frame
const _loc = [0, 0, 0];
export function poserLocal(poser, x, y, z) {
  const dx = x - poser.ox, dz = z - poser.oz;
  _loc[0] = dx * poser.rx + dz * poser.rz;
  _loc[1] = y - poser.oy;
  _loc[2] = dx * poser.fx + dz * poser.fz;
  return _loc;
}

// Lying on the ground pose (on back or front), used for idle 'lie' and knocked down.
export function poseLying(body, P, poser, onBack = true, t = 0) {
  const sc = body.scale;
  const y = 0.12;
  const set = (jn, s, u, f) => poser.set(body, jn, s, u, f);
  set(J.PELVIS, 0, y, 0);
  set(J.CHEST, 0.02, y + 0.02, 0.43 * sc);
  set(J.HEAD, 0.04 + Math.sin(t) * 0.02, y + 0.03, 0.68 * sc);
  set(J.LSH, -0.19 * sc, y, 0.4 * sc);
  set(J.RSH, 0.19 * sc, y, 0.4 * sc);
  set(J.LEL, -0.35 * sc, y - 0.04, 0.25 * sc);
  set(J.LHA, -0.42 * sc, y - 0.06, 0.02);
  set(J.REL, 0.4 * sc, y - 0.04, 0.5 * sc);
  set(J.RHA, 0.55 * sc, y - 0.06, 0.7 * sc);
  set(J.LHIP, -0.1 * sc, y, -0.03);
  set(J.RHIP, 0.1 * sc, y, -0.03);
  set(J.LKN, -0.14 * sc, y + (onBack ? 0.05 : 0), -0.47 * sc);
  set(J.LFT, -0.18 * sc, y - 0.04, -0.93 * sc);
  set(J.RKN, 0.16 * sc, y + 0.1, -0.44 * sc);
  set(J.RFT, 0.22 * sc, y - 0.04, -0.9 * sc);
  body.right[0] = poser.rx; body.right[1] = 0; body.right[2] = poser.rz;
}

// ------------------------------------------------------------- ragdoll --
const RAD = [0.14, 0.15, 0.12, 0.08, 0.06, 0.06, 0.08, 0.06, 0.06, 0.09, 0.07, 0.07, 0.09, 0.07, 0.07];
const EDGES = [
  // rigid torso
  [J.PELVIS, J.CHEST], [J.LSH, J.RSH], [J.LSH, J.CHEST], [J.RSH, J.CHEST],
  [J.LSH, J.PELVIS], [J.RSH, J.PELVIS], [J.LHIP, J.RHIP], [J.LHIP, J.PELVIS], [J.RHIP, J.PELVIS],
  [J.LHIP, J.CHEST], [J.RHIP, J.CHEST], [J.LSH, J.LHIP], [J.RSH, J.RHIP], [J.LSH, J.RHIP], [J.RSH, J.LHIP],
  // neck
  [J.CHEST, J.HEAD], [J.LSH, J.HEAD], [J.RSH, J.HEAD],
  // limbs
  [J.LSH, J.LEL], [J.LEL, J.LHA], [J.RSH, J.REL], [J.REL, J.RHA],
  [J.LHIP, J.LKN], [J.LKN, J.LFT], [J.RHIP, J.RKN], [J.RKN, J.RFT],
];
// Min-distance (inequality) constraints to limit folding
const MINC = [
  [J.LSH, J.LHA, 0.55], [J.RSH, J.RHA, 0.55], [J.LHIP, J.LFT, 0.62], [J.RHIP, J.RFT, 0.62],
  [J.HEAD, J.PELVIS, 0.9], [J.LKN, J.RKN, 0.12], [J.LFT, J.RFT, 0.1],
];

export class Ragdoll {
  constructor(body, vx = 0, vy = 0, vz = 0, dt = 1 / 60) {
    this.body = body;
    this.p = body.j; // simulate in place
    this.o = new Float32Array(NJ * 3);
    // initial velocity from last frame joints + extra
    for (let i = 0; i < NJ; i++) {
      const k = i * 3;
      const pvx = (body.j[k] - body.prev[k]);
      const pvy = (body.j[k + 1] - body.prev[k + 1]);
      const pvz = (body.j[k + 2] - body.prev[k + 2]);
      // clamp animation velocity (teleports etc.)
      const ok = pvx * pvx + pvy * pvy + pvz * pvz < 0.04;
      this.o[k] = body.j[k] - (ok ? pvx : 0) - vx * dt;
      this.o[k + 1] = body.j[k + 1] - (ok ? pvy : 0) - vy * dt;
      this.o[k + 2] = body.j[k + 2] - (ok ? pvz : 0) - vz * dt;
    }
    this.cons = [];
    const s = body.scale;
    for (const [a, b] of EDGES) {
      const dx = this.p[a * 3] - this.p[b * 3], dy = this.p[a * 3 + 1] - this.p[b * 3 + 1], dz = this.p[a * 3 + 2] - this.p[b * 3 + 2];
      this.cons.push([a, b, Math.sqrt(dx * dx + dy * dy + dz * dz)]);
    }
    this.minc = MINC.map(([a, b, f]) => [a, b, f * s * (a === J.HEAD ? 0.5 : 0.5)]);
    this.sleep = 0;
    this.asleep = false;
    this.age = 0;
    this.detached = 0; // bitmask of detached joints (severed)
    this.contact = { nx: 0, ny: 0, nz: 0 };
    this.pin = null; // optional {joint, x,y,z}
    this.rad = RAD.map((r) => r * s);
  }
  impulse(joint, ix, iy, iz, dt = 1 / 60) {
    const k = joint * 3;
    this.o[k] -= ix * dt; this.o[k + 1] -= iy * dt; this.o[k + 2] -= iz * dt;
    this.asleep = false; this.sleep = 0;
  }
  impulseAll(ix, iy, iz, dt = 1 / 60) {
    for (let i = 0; i < NJ; i++) this.impulse(i, ix, iy, iz, dt);
  }
  // Remove constraints joining a severed limb so it drops off naturally.
  sever(jointA, jointB) {
    this.cons = this.cons.filter(([a, b]) => !((a === jointA && b === jointB) || (a === jointB && b === jointA)));
  }
  step(dt, col, gravity = 18) {
    if (this.asleep) return;
    this.age += dt;
    const p = this.p, o = this.o;
    const damp = 0.992;
    const g = gravity * dt * dt;
    let energy = 0;
    for (let i = 0; i < NJ; i++) {
      const k = i * 3;
      const vx = (p[k] - o[k]) * damp, vy = (p[k + 1] - o[k + 1]) * damp, vz = (p[k + 2] - o[k + 2]) * damp;
      o[k] = p[k]; o[k + 1] = p[k + 1]; o[k + 2] = p[k + 2];
      p[k] += vx; p[k + 1] += vy - g; p[k + 2] += vz;
      energy += vx * vx + vy * vy + vz * vz;
    }
    const cons = this.cons;
    const tmp = this._tmp || (this._tmp = { x: 0, y: 0, z: 0 });
    for (let it = 0; it < 5; it++) {
      for (let c = 0; c < cons.length; c++) {
        const [a, b, len] = cons[c];
        const ka = a * 3, kb = b * 3;
        const dx = p[kb] - p[ka], dy = p[kb + 1] - p[ka + 1], dz = p[kb + 2] - p[ka + 2];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
        const diff = (d - len) / d * 0.5;
        p[ka] += dx * diff; p[ka + 1] += dy * diff; p[ka + 2] += dz * diff;
        p[kb] -= dx * diff; p[kb + 1] -= dy * diff; p[kb + 2] -= dz * diff;
      }
      for (let c = 0; c < this.minc.length; c++) {
        const [a, b, mn] = this.minc[c];
        const ka = a * 3, kb = b * 3;
        const dx = p[kb] - p[ka], dy = p[kb + 1] - p[ka + 1], dz = p[kb + 2] - p[ka + 2];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
        if (d >= mn) continue;
        const diff = (d - mn) / d * 0.5;
        p[ka] += dx * diff; p[ka + 1] += dy * diff; p[ka + 2] += dz * diff;
        p[kb] -= dx * diff; p[kb + 1] -= dy * diff; p[kb + 2] -= dz * diff;
      }
      if (this.pin) {
        const k = this.pin.joint * 3;
        p[k] = this.pin.x; p[k + 1] = this.pin.y; p[k + 2] = this.pin.z;
      }
      // collisions (only on last 2 iterations for cost)
      if (it >= 3 && col) {
        for (let i = 0; i < NJ; i++) {
          const k = i * 3;
          tmp.x = p[k]; tmp.y = p[k + 1]; tmp.z = p[k + 2];
          if (col.collideSphere(tmp, this.rad[i], this.contact)) {
            p[k] = tmp.x; p[k + 1] = tmp.y; p[k + 2] = tmp.z;
            // friction: bleed tangential velocity
            if (this.contact.ny > 0.3) {
              o[k] = lerp(o[k], p[k], 0.35);
              o[k + 2] = lerp(o[k + 2], p[k + 2], 0.35);
            } else {
              o[k] = lerp(o[k], p[k], 0.1);
              o[k + 1] = lerp(o[k + 1], p[k + 1], 0.1);
              o[k + 2] = lerp(o[k + 2], p[k + 2], 0.1);
            }
          }
        }
      }
    }
    // Safety floor
    for (let i = 0; i < NJ; i++) if (p[i * 3 + 1] < -200) p[i * 3 + 1] = -200;
    // right vector from shoulders
    const rx = p[J.RSH * 3] - p[J.LSH * 3], ry = p[J.RSH * 3 + 1] - p[J.LSH * 3 + 1], rz = p[J.RSH * 3 + 2] - p[J.LSH * 3 + 2];
    const rl = Math.sqrt(rx * rx + ry * ry + rz * rz) || 1;
    this.body.right[0] = rx / rl; this.body.right[1] = ry / rl; this.body.right[2] = rz / rl;
    if (energy < 0.00004 * NJ) {
      this.sleep += dt;
      if (this.sleep > 0.8 && this.age > 1.2) this.asleep = true;
    } else this.sleep = 0;
    if (this.age > 12) this.asleep = true;
  }
}

// ---------------------------------------------------------- part frames --
// Compute a Matrix4 (column-major array) for a body part from joints.
// Part geometry convention: local +Y from 0..1 along the segment, X = right.
export function partMatrix(body, partIndex, out, widthScale = 1, lenOverride = 0) {
  const [, a, b] = PARTS[partIndex];
  const j = body.j;
  let ax = j[a * 3], ay = j[a * 3 + 1], az = j[a * 3 + 2];
  let bx = j[b * 3], by = j[b * 3 + 1], bz = j[b * 3 + 2];
  let yx = bx - ax, yy = by - ay, yz = bz - az;
  let len = Math.sqrt(yx * yx + yy * yy + yz * yz) || 1e-4;
  yx /= len; yy /= len; yz /= len;
  if (partIndex === 1) { // head: centred on head joint, fixed size
    ax = bx - yx * 0.02; ay = by - yy * 0.02; az = bz - yz * 0.02;
    len = 1;
  }
  if (lenOverride) len = lenOverride;
  // X axis: body right orthogonalised against Y
  let xx = body.right[0], xy = body.right[1], xz = body.right[2];
  const d = xx * yx + xy * yy + xz * yz;
  xx -= yx * d; xy -= yy * d; xz -= yz * d;
  let xl = Math.sqrt(xx * xx + xy * xy + xz * xz);
  if (xl < 1e-4) { xx = 1; xy = 0; xz = 0; xl = 1; }
  xx /= xl; xy /= xl; xz /= xl;
  // Z = X cross Y
  const zx = xy * yz - xz * yy, zy = xz * yx - xx * yz, zz = xx * yy - xy * yx;
  const s = body.scale * widthScale;
  const w = s * (partIndex === 0 ? body.build : 1);
  out[0] = xx * w; out[1] = xy * w; out[2] = xz * w; out[3] = 0;
  out[4] = yx * len; out[5] = yy * len; out[6] = yz * len; out[7] = 0;
  out[8] = zx * w; out[9] = zy * w; out[10] = zz * w; out[11] = 0;
  out[12] = ax; out[13] = ay; out[14] = az; out[15] = 1;
  return out;
}

// Foot frame: origin at the ankle, Y blended from the shin direction towards
// world up (feet stay flat while standing), X = body right, scaled by body.scale.
export function footMatrix(body, side, out) {
  const j = body.j;
  const kn = side === 0 ? J.LKN : J.RKN, ft = side === 0 ? J.LFT : J.RFT;
  let yx = j[kn * 3] - j[ft * 3], yy = j[kn * 3 + 1] - j[ft * 3 + 1], yz = j[kn * 3 + 2] - j[ft * 3 + 2];
  const yl = Math.sqrt(yx * yx + yy * yy + yz * yz) || 1;
  yx /= yl; yy /= yl; yz /= yl;
  if (!body.ragdoll) { yx *= 0.3; yz *= 0.3; yy = 1; const l = Math.sqrt(yx * yx + yy * yy + yz * yz); yx /= l; yy /= l; yz /= l; }
  let xx = body.right[0], xy = body.right[1], xz = body.right[2];
  const d = xx * yx + xy * yy + xz * yz;
  xx -= yx * d; xy -= yy * d; xz -= yz * d;
  const xl = Math.sqrt(xx * xx + xy * xy + xz * xz) || 1;
  xx /= xl; xy /= xl; xz /= xl;
  const zx = xy * yz - xz * yy, zy = xz * yx - xx * yz, zz = xx * yy - xy * yx;
  const s = body.scale;
  out[0] = xx * s; out[1] = xy * s; out[2] = xz * s; out[3] = 0;
  out[4] = yx * s; out[5] = yy * s; out[6] = yz * s; out[7] = 0;
  out[8] = zx * s; out[9] = zy * s; out[10] = zz * s; out[11] = 0;
  out[12] = j[ft * 3]; out[13] = j[ft * 3 + 1]; out[14] = j[ft * 3 + 2]; out[15] = 1;
  return out;
}

// Skinning bones: the 10 body parts (PARTS order) followed by the two feet.
export const NBONES = 12;
// Write all 12 bone frames (4x4 column-major, 16 floats each) into out.
// Severed parts (and feet of severed shins) collapse to their root joint so
// blended joint vertices form a stump.
const _bm = new Float32Array(16);
export function boneMatrices(body, out, o = 0) {
  const sev = body.severed;
  for (let p = 0; p < 10; p++) {
    const k = o + p * 16;
    if (sev & (1 << p)) { collapse(out, k, body, PARTS[p][1]); continue; }
    partMatrix(body, p, _bm);
    for (let q = 0; q < 16; q++) out[k + q] = _bm[q];
  }
  for (let side = 0; side < 2; side++) {
    const k = o + (10 + side) * 16;
    const shin = side === 0 ? 7 : 9;
    if (sev & (1 << shin)) { collapse(out, k, body, side === 0 ? J.LKN : J.RKN); continue; }
    footMatrix(body, side, _bm);
    for (let q = 0; q < 16; q++) out[k + q] = _bm[q];
  }
  return out;
}
function collapse(out, k, body, joint) {
  for (let q = 0; q < 16; q++) out[k + q] = 0;
  out[k + 12] = body.j[joint * 3]; out[k + 13] = body.j[joint * 3 + 1]; out[k + 14] = body.j[joint * 3 + 2]; out[k + 15] = 1;
}

// Rest pose used to author skinned character meshes (scale 1, build 1):
// standing straight, arms hanging slightly away from the body.
export function bindPoseBody() {
  const b = new Body(1, 1);
  const P = PROPS;
  const s = (jn, x, y, z) => b.setJoint(jn, x, y, z);
  s(J.PELVIS, 0, P.hip, 0);
  s(J.CHEST, 0, P.chest, 0);
  s(J.HEAD, 0, P.head, 0);
  const shY = P.chest - 0.04;
  const ang = 0.16;
  for (const sg of [-1, 1]) {
    const sh = sg < 0 ? J.LSH : J.RSH, el = sg < 0 ? J.LEL : J.REL, ha = sg < 0 ? J.LHA : J.RHA;
    const x0 = sg * P.shW;
    s(sh, x0, shY, 0.02);
    s(el, x0 + sg * Math.sin(ang) * P.uarm, shY - Math.cos(ang) * P.uarm, 0.02);
    s(ha, x0 + sg * Math.sin(ang) * (P.uarm + P.farm), shY - Math.cos(ang) * (P.uarm + P.farm), 0.02);
    const hip = sg < 0 ? J.LHIP : J.RHIP, kn = sg < 0 ? J.LKN : J.RKN, ft = sg < 0 ? J.LFT : J.RFT;
    const hx = sg * P.hipW, hy = P.hip - 0.03;
    s(hip, hx, hy, 0);
    s(kn, hx + sg * 0.004, hy - P.thigh, 0);
    s(ft, hx + sg * 0.008, hy - P.thigh - P.shin, 0);
  }
  b.right[0] = 1; b.right[1] = 0; b.right[2] = 0;
  b.fwd[0] = 0; b.fwd[1] = 0; b.fwd[2] = -1;
  return b;
}
