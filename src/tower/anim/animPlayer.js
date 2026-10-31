// LAST LOOKOUT — AnimPlayer: plays the baked zombie clips on a ragdoll's own segment bodies.
//
// While a zombie is unhurt its 17 bodies are posed kinematically from the clips every frame (they
// are not in the physics world): body.framePos/frameRot get the previous pose, body.pos/rot the new
// one, body.vel/angVel the finite-difference velocities, so the moment it is shot the physics takes
// over from exactly what was on screen, moving as it was moving. blendFromPhysics() goes the other
// way: it captures the bodies as the physics left them and eases them back into a clip.
//
// Per frame: sample the clip(s) (nlerp between 30 fps keys, cross-fades), per-zombie variation
// (from a seed: phase, rate, mirrored gait, lean, arm reach and lift, asymmetry, head tilt and loll),
// root transform, forward kinematics over the bind-pose joint landmarks, then foot IK for ground
// clips: stance feet are locked where they touched down (no skating whatever speed the root moves
// at), soles are kept on the ground (y = root.pos.y) and out of it during the swing.
// Allocation free after construction; no THREE, no DOM.
import { CLIPS, SEGMENTS, Q_ROT, Q_POS } from './clips.js';
import { skeleton, fk, basisYZ, rotAt, rotInvAt } from './skeleton.js';

// ------------------------------------------------------------------------------------------------
// clip decoding (once, at import)

function b64(s) {
  if (typeof atob === 'function') {
    const bin = atob(s);
    const u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
  }
  return new Uint8Array(Buffer.from(s, 'base64'));
}

/** How strongly the per-zombie variation (lean, arms, head) applies on each clip. */
const VARY = {
  walk: { arms: 1, lean: 1, head: 1, mirror: true },
  walk2: { arms: 1, lean: 1, head: 1, mirror: true },
  idle: { arms: 1, lean: 1, head: 1, mirror: true },
  attack: { arms: 0.25, lean: 0.5, head: 1, mirror: true },
  push: { arms: 0, lean: 0.5, head: 1, mirror: true },
  jog: { arms: 0.6, lean: 0.7, head: 1, mirror: true },
  sprint: { arms: 0.5, lean: 0.6, head: 1, mirror: true },
  vault: { arms: 0, lean: 0, head: 0.5, mirror: true },
  getup: { arms: 0, lean: 0, head: 0.5, mirror: true },
  crawl: { arms: 0, lean: 0, head: 1, mirror: true },
  climb: { arms: 0, lean: 0, head: 0.6, mirror: true },
  limpL: { arms: 1, lean: 0.6, head: 1, mirror: false },
  limpR: { arms: 1, lean: 0.6, head: 1, mirror: false },
};
const VARY_DEFAULT = { arms: 0.5, lean: 0.5, head: 1, mirror: false };

const NSEG = SEGMENTS.length;
const DEC = {};
export const CLIP_INFO = {};
for (const [name, c] of Object.entries(CLIPS)) {
  const raw = b64(c.data);
  const a = new Int16Array(raw.buffer, raw.byteOffset, raw.byteLength >> 1);
  const F = c.frames;
  const hasRoot = !!c.rootMotion;
  const stride = NSEG * 4 + 3 + (hasRoot ? 3 : 0);
  const rot = new Float32Array(F * NSEG * 4);
  const pel = new Float32Array(F * 3);
  const root = hasRoot ? new Float32Array(F * 3) : null;
  for (let f = 0; f < F; f++) {
    let o = f * stride;
    for (let k = 0; k < NSEG * 4; k++) rot[f * NSEG * 4 + k] = a[o++] / Q_ROT;
    for (let k = 0; k < 3; k++) pel[f * 3 + k] = a[o++] / Q_POS;
    if (hasRoot) for (let k = 0; k < 3; k++) root[f * 3 + k] = a[o++] / Q_POS;
  }
  const ct = b64(c.contact);
  const contact = new Float32Array(F * 2);
  for (let k = 0; k < F * 2; k++) contact[k] = ct[k] / 255;
  const events = (c.events || []).map((e) => ({ ...e }));
  DEC[name] = {
    name, F, fps: c.fps, loop: c.loop, duration: c.loop ? F / c.fps : (F - 1) / c.fps, speed: c.speed, ground: c.ground,
    rootMotion: c.rootMotion, rot, pel, root, contact, events, vary: VARY[name] || VARY_DEFAULT,
  };
  CLIP_INFO[name] = {
    speed: c.speed, duration: DEC[name].duration, loop: c.loop, rootMotion: c.rootMotion, ground: c.ground,
    frames: F, events: events.map((e) => ({ ...e })),
  };
}

// ------------------------------------------------------------------------------------------------
// small allocation-free quaternion helpers on typed arrays

// out[o] = a[ao] * b[bo]
function qmulTo(a, ao, b, bo, out, o) {
  const ax = a[ao], ay = a[ao + 1], az = a[ao + 2], aw = a[ao + 3];
  const bx = b[bo], by = b[bo + 1], bz = b[bo + 2], bw = b[bo + 3];
  out[o] = aw * bx + ax * bw + ay * bz - az * by;
  out[o + 1] = aw * by - ax * bz + ay * bw + az * bx;
  out[o + 2] = aw * bz + ax * by - ay * bx + az * bw;
  out[o + 3] = aw * bw - ax * bx - ay * by - az * bz;
}

function qnormAt(q, o) {
  const l = Math.sqrt(q[o] * q[o] + q[o + 1] * q[o + 1] + q[o + 2] * q[o + 2] + q[o + 3] * q[o + 3]) || 1;
  q[o] /= l;
  q[o + 1] /= l;
  q[o + 2] /= l;
  q[o + 3] /= l;
}

const MAX_LOCK = 0.45; // a planted foot slides once the clip wants it further away than this (m)
const MAX_HIP_EXT = 0.42; // hip extension (rad) past which a planted foot comes off the ground
const MAX_DORSI = 0.3; // ankle dorsiflexion (rad) past which a planted foot comes off the ground
const MAX_DROP = 0.15; // the most the pelvis comes down to let a leg reach its planted foot (m)
const MAX_TWIST = 0.35; // a planted foot pivots round with a body turning further than this (rad)
const smooth01 = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

function rng(seed) {
  let s = (seed * 2654435761 + 0x9e3779b9) >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// scratch shared by all players (single-threaded, never held across calls)
const _q = new Float64Array(16);
const _v = new Float64Array(16);

/** One clip layer: which clip, its time and per-layer playback state. */
class Layer {
  constructor() {
    this.clip = null;
    this.t = 0;
    this.mirror = false;
    this.prevT = 0;
    this.done = false;
    this.rootPrevX = 0;
    this.rootPrevY = 0;
    this.rootPrevZ = 0;
  }
}

export class AnimPlayer {
  /**
   * @param ragdoll the zombie's Ragdoll (its segment bodies are posed)
   * @param opts { seed, mirror (force), groundY }
   */
  constructor(ragdoll, opts = {}) {
    this.rd = ragdoll;
    this.sk = skeleton(ragdoll);
    const n = this.sk.n;
    this.n = n;
    // clip segment order -> ragdoll segment order
    this.map = new Int8Array(n);
    for (let i = 0; i < n; i++) this.map[i] = SEGMENTS.indexOf(this.sk.names[i]);
    this.bodies = ragdoll.segList.map((s) => s.body);
    this.segs = ragdoll.segList;
    this.bindPos = new Float64Array(n * 3);
    // per-zombie variation
    const r = rng((opts.seed ?? 1) | 0);
    this.seed = opts.seed ?? 1;
    this.var = {
      phase: r(),
      rate: 0.9 + 0.2 * r(),
      mirror: opts.mirror ?? r() < 0.5,
      lean: 0.03 + 0.11 * r(),
      reach: -0.12 + 0.42 * r(), // shoulder elevation added (rad)
      asym: (r() - 0.5) * 0.36, // one arm higher than the other
      spread: (r() - 0.5) * 0.2, // arms apart / together
      tilt: (r() - 0.5) * 0.42, // head roll
      nod: -0.05 + 0.2 * r(), // head pitched forward
      loll: 0.04 + 0.08 * r(), // head bob amplitude
      lollPhase: r() * 6.283,
      sway: (r() - 0.5) * 0.12, // trunk lateral bend
    };
    this.layers = [new Layer(), new Layer()]; // [current, fading-out]
    this.fade = 0; // weight of the fading-out layer (1 -> 0)
    this.fadeDur = 0.25;
    this.snapshot = false; // fading out of a frozen pose (play() during a fade)
    this.snapRot = new Float64Array(n * 4);
    this.snapPel = new Float64Array(3);
    this.rate = 1;
    // output pose (root relative) and world pose
    this.rot = new Float64Array(n * 4);
    this.pel = new Float64Array(3);
    this.tmpRot = new Float64Array(n * 4);
    this.baseRot = new Float64Array(n * 4);
    this.basePel = new Float64Array(3);
    this.tmpPel = new Float64Array(3);
    this.wrot = new Float64Array(n * 4);
    this.joint = new Float64Array(n * 3);
    this.pos = new Float64Array(n * 3);
    this.contact = new Float64Array(2);
    // physics hand-back blend
    this.phys = 0;
    this.physDur = 0;
    this.physRot = new Float64Array(n * 4);
    this.physPel = new Float64Array(3);
    // foot locks
    this.feet = ['L', 'R'].map((s, k) => ({
      side: s, k, locked: false, blocked: false, lx: 0, lz: 0, ox: 0, oz: 0, release: 0, releaseDur: 0.2, lift: 0,
      c: 0, lowY: 0, yaw: 0,
    }));
    this.pelvisDrop = 0;
    this.groundY = opts.groundY ?? 0;
    this.first = true;
    this.events = [];
    this._evPool = [];
    for (let i = 0; i < 8; i++) this._evPool.push({ type: '', foot: '', hand: '', clip: '' });
    this.lastRootX = 0;
    this.lastRootY = 0;
    this.lastRootZ = 0;
    this.lastRootYaw = 0;
    this.play('idle', { fade: 0 });
  }

  get clip() {
    return this.layers[0].clip ? this.layers[0].clip.name : null;
  }

  get time() {
    return this.layers[0].t;
  }

  /** True once a one-shot clip (vault, getup) has reached its end. */
  get finished() {
    return this.layers[0].done;
  }

  /**
   * Ground speed (m/s) the current clip covers at the current playback rate, this zombie's own rate
   * variation included: move the root at this and the feet match the ground exactly (any other
   * speed works too - the planted feet hold - but strides then look long or short).
   */
  get groundSpeed() {
    const c = this.layers[0].clip;
    return c ? c.speed * this.rate * this.var.rate : 0;
  }

  /**
   * How the bodies lie right now (for choosing the clip to blend into after a fall):
   * 'up' (on the back: getup), 'down' (on the front: crawl), 'side', or 'upright'.
   */
  bodyFacing() {
    // the pelvis: a hunched zombie's chest faces the ground, its pelvis does not
    const p = this.rd.segments.pelvis.body.rot;
    const upY = 1 - 2 * (p.x * p.x + p.z * p.z); // body +Y, world y
    const frontY = 2 * (p.y * p.z - p.w * p.x); // body +Z, world y
    if (upY > 0.55) return 'upright';
    if (frontY > 0.4) return 'up';
    if (frontY < -0.4) return 'down';
    return 'side';
  }

  /**
   * Cross-fade to clip `name`. opts: fade (s, default 0.25), rate (default keeps the current),
   * phase (0..1 of the cycle; default: the zombie's own phase for loops, 0 for one-shots),
   * mirror (default: the zombie's own handedness where the clip allows it).
   */
  play(name, opts = {}) {
    const c = DEC[name];
    if (!c) throw new Error(`AnimPlayer: unknown clip ${name}`);
    const fade = opts.fade ?? 0.25;
    const cur = this.layers[0];
    if (cur.clip === c && !opts.restart && opts.phase === undefined) {
      if (opts.rate !== undefined) this.rate = opts.rate;
      return this;
    }
    if (cur.clip && fade > 0) {
      if (this.fade > 0.02) {
        // interrupting a fade: fade out of the pose on screen instead
        this.snapRot.set(this.baseRot);
        this.snapPel.set(this.basePel);
        this.snapshot = true;
      } else {
        this.snapshot = false;
        const old = this.layers[1];
        this.layers[1] = cur;
        this.layers[0] = old;
      }
      this.fade = 1;
      this.fadeDur = fade;
    } else {
      this.fade = 0;
      this.snapshot = false;
    }
    const L = this.layers[0];
    L.clip = c;
    L.done = false;
    L.mirror = opts.mirror ?? (c.vary.mirror && this.var.mirror);
    const phase = opts.phase ?? (c.loop ? this.var.phase : 0);
    L.t = phase * c.duration;
    L.prevT = L.t;
    if (opts.rate !== undefined) this.rate = opts.rate;
    L.rootPrevX = 0;
    L.rootPrevY = 0;
    L.rootPrevZ = 0;
    if (c.root) this.sampleRoot(L, _v, 0);
    if (c.root) {
      L.rootPrevX = _v[0];
      L.rootPrevY = _v[1];
      L.rootPrevZ = _v[2];
    }
    return this;
  }

  setRate(r) {
    this.rate = r;
  }

  /** Playback rate that makes clip `name` cover `speed` m/s (the zombie's own rate variation aside). */
  rateFor(name, speed) {
    const c = DEC[name];
    return c && c.speed > 0 ? speed / c.speed : 1;
  }

  // ----------------------------------------------------------------------------------------------
  /** Sample layer L into rot/pel (root-relative, ragdoll order). */
  sampleLayer(L, rot, pel, contact) {
    const c = L.clip;
    const fps = c.fps, F = c.F;
    let x = L.t * fps;
    let f0 = Math.floor(x);
    let u = x - f0;
    let f1;
    if (c.loop) {
      f0 = ((f0 % F) + F) % F;
      f1 = (f0 + 1) % F;
    } else {
      if (f0 >= F - 1) {
        f0 = F - 1;
        u = 0;
      }
      if (f0 < 0) {
        f0 = 0;
        u = 0;
      }
      f1 = Math.min(f0 + 1, F - 1);
    }
    const n = this.n, map = this.map, mirror = L.mirror, sk = this.sk;
    const A = c.rot, a0 = f0 * NSEG * 4, a1 = f1 * NSEG * 4;
    for (let i = 0; i < n; i++) {
      const src = mirror ? map[sk.mirror[i]] : map[i];
      const o0 = a0 + src * 4, o1 = a1 + src * 4;
      let bx = A[o1], by = A[o1 + 1], bz = A[o1 + 2], bw = A[o1 + 3];
      const ax = A[o0], ay = A[o0 + 1], az = A[o0 + 2], aw = A[o0 + 3];
      if (ax * bx + ay * by + az * bz + aw * bw < 0) {
        bx = -bx; by = -by; bz = -bz; bw = -bw;
      }
      let qx = ax + (bx - ax) * u, qy = ay + (by - ay) * u, qz = az + (bz - az) * u, qw = aw + (bw - aw) * u;
      const l = 1 / (Math.sqrt(qx * qx + qy * qy + qz * qz + qw * qw) || 1);
      qx *= l; qy *= l; qz *= l; qw *= l;
      if (mirror) {
        // reflect across the sagittal plane (x -> -x): (x, y, z, w) -> (x, -y, -z, w)
        qy = -qy;
        qz = -qz;
      }
      const o = i * 4;
      rot[o] = qx; rot[o + 1] = qy; rot[o + 2] = qz; rot[o + 3] = qw;
    }
    const P = c.pel;
    pel[0] = P[f0 * 3] + (P[f1 * 3] - P[f0 * 3]) * u;
    pel[1] = P[f0 * 3 + 1] + (P[f1 * 3 + 1] - P[f0 * 3 + 1]) * u;
    pel[2] = P[f0 * 3 + 2] + (P[f1 * 3 + 2] - P[f0 * 3 + 2]) * u;
    if (mirror) pel[0] = -pel[0];
    if (contact) {
      const C = c.contact;
      const l0 = C[f0 * 2] + (C[f1 * 2] - C[f0 * 2]) * u;
      const r0 = C[f0 * 2 + 1] + (C[f1 * 2 + 1] - C[f0 * 2 + 1]) * u;
      contact[0] = mirror ? r0 : l0;
      contact[1] = mirror ? l0 : r0;
    }
  }

  /** Root-motion track of layer L at its time (clip space) into out[0..2]. */
  sampleRoot(L, out, o) {
    const c = L.clip;
    const x = Math.min(Math.max(L.t * c.fps, 0), c.F - 1);
    const f0 = Math.floor(x), f1 = Math.min(f0 + 1, c.F - 1), u = x - f0;
    const R = c.root;
    out[o] = R[f0 * 3] + (R[f1 * 3] - R[f0 * 3]) * u;
    out[o + 1] = R[f0 * 3 + 1] + (R[f1 * 3 + 1] - R[f0 * 3 + 1]) * u;
    out[o + 2] = R[f0 * 3 + 2] + (R[f1 * 3 + 2] - R[f0 * 3 + 2]) * u;
    if (L.mirror) out[o] = -out[o];
  }

  /** Advance a layer's clock; emits events of the main layer. */
  advance(L, dtc, emit) {
    const c = L.clip;
    L.prevT = L.t;
    L.t += dtc;
    if (c.loop) {
      if (emit && c.events.length) this.emitBetween(c, L.prevT, L.t, L.mirror);
      if (L.t >= c.duration || L.t < 0) L.t = ((L.t % c.duration) + c.duration) % c.duration;
    } else {
      if (emit && c.events.length) this.emitBetween(c, L.prevT, Math.min(L.t, c.duration), L.mirror);
      if (L.t >= c.duration) {
        L.t = c.duration;
        L.done = true;
      }
    }
  }

  emitBetween(c, t0, t1, mirror) {
    if (t1 <= t0) return;
    const D = c.duration;
    for (const e of c.events) {
      // event times inside (t0, t1], allowing for wrap-around of looping clips
      let hit = false;
      if (c.loop) {
        const k0 = Math.floor((t0 - e.t) / D), k1 = Math.floor((t1 - e.t) / D);
        hit = k1 > k0;
      } else hit = e.t > t0 && e.t <= t1;
      if (!hit || this.events.length >= this._evPool.length) continue;
      const ev = this._evPool[this.events.length];
      ev.type = e.type;
      ev.clip = c.name;
      ev.foot = e.foot ? (mirror ? (e.foot === 'L' ? 'R' : 'L') : e.foot) : '';
      ev.hand = e.hand ? (mirror ? (e.hand === 'L' ? 'R' : 'L') : e.hand) : '';
      this.events.push(ev);
    }
  }

  // ----------------------------------------------------------------------------------------------
  /**
   * Pose the bodies for this frame. root = { pos: {x,y,z} (ground point under the pelvis; for
   * 'climb' the point on the leg at the feet's height), yaw (rad, 0 faces +Z) }. For root-motion
   * clips (vault) the player moves root.pos itself along the clip's root track.
   */
  update(dt, root) {
    if (!(dt > 0)) dt = 0;
    this.events.length = 0;
    // a root that jumped (spawned, moved by the game) starts afresh: no velocity spike, feet free
    if (!this.first) {
      const jx = root.pos.x - this.lastRootX, jz = root.pos.z - this.lastRootZ;
      const jy = root.pos.y - this.lastRootY;
      const maxJump = 1 + 50 * dt; // faster than anything walks or is carried by root motion
      if (jx * jx + jz * jz + jy * jy > maxJump * maxJump) {
        this.first = true;
        this.releaseFeet();
      }
    }
    const n = this.n;
    const L0 = this.layers[0], L1 = this.layers[1];
    const rate = this.rate * this.var.rate;
    const dtc = dt * rate;
    // root motion of the main layer: advance the root by the track's delta (rotated by yaw)
    this.advance(L0, dtc, true);
    const c0 = L0.clip;
    if (c0.root) {
      this.sampleRoot(L0, _v, 0);
      const dx = _v[0] - L0.rootPrevX, dy = _v[1] - L0.rootPrevY, dz = _v[2] - L0.rootPrevZ;
      L0.rootPrevX = _v[0];
      L0.rootPrevY = _v[1];
      L0.rootPrevZ = _v[2];
      const cy = Math.cos(root.yaw), sy = Math.sin(root.yaw);
      root.pos.x += dx * cy + dz * sy;
      root.pos.y += dy;
      root.pos.z += -dx * sy + dz * cy;
    }
    // sample (and cross-fade)
    this.sampleLayer(L0, this.rot, this.pel, this.contact);
    let ground = c0.ground ? 1 : 0;
    if (this.fade > 0) {
      this.fade = this.fadeDur > 0 ? Math.max(0, this.fade - dt / this.fadeDur) : 0;
      const w = smooth01(this.fade);
      if (this.snapshot) {
        this.blendInto(this.rot, this.pel, this.snapRot, this.snapPel, w);
      } else if (L1.clip) {
        this.advance(L1, dtc, false);
        this.sampleLayer(L1, this.tmpRot, this.tmpPel, _v);
        this.blendInto(this.rot, this.pel, this.tmpRot, this.tmpPel, w);
        this.contact[0] = this.contact[0] * (1 - w) + _v[0] * w;
        this.contact[1] = this.contact[1] * (1 - w) + _v[1] * w;
        ground = ground * (1 - w) + (L1.clip.ground ? w : 0);
      }
    }
    this.baseRot.set(this.rot);
    this.basePel.set(this.pel);
    this.applyVariation(c0);
    // world transform
    const yaw = root.yaw, cy = Math.cos(yaw * 0.5), sy = Math.sin(yaw * 0.5);
    const rot = this.rot, wrot = this.wrot;
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      const x = rot[o], y = rot[o + 1], z = rot[o + 2], w = rot[o + 3];
      // (0, sy, 0, cy) * q
      wrot[o] = cy * x + sy * z;
      wrot[o + 1] = cy * y + sy * w;
      wrot[o + 2] = cy * z - sy * x;
      wrot[o + 3] = cy * w - sy * y;
    }
    const cyaw = Math.cos(yaw), syaw = Math.sin(yaw);
    let px = root.pos.x + this.pel[0] * cyaw + this.pel[2] * syaw;
    let py = root.pos.y + this.pel[1];
    let pz = root.pos.z - this.pel[0] * syaw + this.pel[2] * cyaw;
    // easing back from a physical pose
    if (this.phys > 0) {
      this.phys = this.physDur > 0 ? Math.max(0, this.phys - dt / this.physDur) : 0;
      const w = smooth01(this.phys);
      const P = this.physRot;
      for (let i = 0; i < n; i++) {
        const o = i * 4;
        let bx = P[o], by = P[o + 1], bz = P[o + 2], bw = P[o + 3];
        if (bx * wrot[o] + by * wrot[o + 1] + bz * wrot[o + 2] + bw * wrot[o + 3] < 0) {
          bx = -bx; by = -by; bz = -bz; bw = -bw;
        }
        wrot[o] += (bx - wrot[o]) * w;
        wrot[o + 1] += (by - wrot[o + 1]) * w;
        wrot[o + 2] += (bz - wrot[o + 2]) * w;
        wrot[o + 3] += (bw - wrot[o + 3]) * w;
        qnormAt(wrot, o);
      }
      px += (this.physPel[0] - px) * w;
      py += (this.physPel[1] - py) * w;
      pz += (this.physPel[2] - pz) * w;
      ground *= 1 - w;
    }
    // live bind positions (a fractured segment's body is re-centred on its fragment)
    const segs = this.segs, bp = this.bindPos;
    for (let i = 0; i < n; i++) {
      const b = segs[i].bindPos;
      bp[i * 3] = b.x;
      bp[i * 3 + 1] = b.y;
      bp[i * 3 + 2] = b.z;
    }
    fk(this.sk, wrot, px, py, pz, bp, this.joint, this.pos);
    if (ground > 0.01) this.footIK(dt, root, ground);
    else this.releaseFeet();
    this.writeBodies(dt);
    this.first = false;
    this.lastRootX = root.pos.x;
    this.lastRootY = root.pos.y;
    this.lastRootZ = root.pos.z;
    this.lastRootYaw = root.yaw;
  }

  /** rot/pel <- blend toward (rotB, pelB) by weight w (w = 1 gives B). */
  blendInto(rot, pel, rotB, pelB, w) {
    if (w <= 0) return;
    for (let i = 0; i < this.n; i++) {
      const o = i * 4;
      let bx = rotB[o], by = rotB[o + 1], bz = rotB[o + 2], bw = rotB[o + 3];
      if (bx * rot[o] + by * rot[o + 1] + bz * rot[o + 2] + bw * rot[o + 3] < 0) {
        bx = -bx; by = -by; bz = -bz; bw = -bw;
      }
      rot[o] += (bx - rot[o]) * w;
      rot[o + 1] += (by - rot[o + 1]) * w;
      rot[o + 2] += (bz - rot[o + 2]) * w;
      rot[o + 3] += (bw - rot[o + 3]) * w;
      qnormAt(rot, o);
    }
    pel[0] += (pelB[0] - pel[0]) * w;
    pel[1] += (pelB[1] - pel[1]) * w;
    pel[2] += (pelB[2] - pel[2]) * w;
  }

  // ----------------------------------------------------------------------------------------------
  /**
   * Rotate the subtree of segment `seg` (root-relative pose) by angle about an axis given in the
   * frame of its parent segment. Allocation free.
   */
  turnJoint(seg, ax, ay, az, angle) {
    if (angle === 0) return;
    const sk = this.sk, rot = this.rot, n = this.n;
    const p = sk.parent[seg];
    // world axis = R_parent * axis
    const o = p * 4;
    const qx = rot[o], qy = rot[o + 1], qz = rot[o + 2], qw = rot[o + 3];
    const tx = 2 * (qy * az - qz * ay), ty = 2 * (qz * ax - qx * az), tz = 2 * (qx * ay - qy * ax);
    const wx = ax + qw * tx + (qy * tz - qz * ty);
    const wy = ay + qw * ty + (qz * tx - qx * tz);
    const wz = az + qw * tz + (qx * ty - qy * tx);
    const s = Math.sin(angle * 0.5);
    _q[0] = wx * s; _q[1] = wy * s; _q[2] = wz * s; _q[3] = Math.cos(angle * 0.5);
    for (let k = seg; k < n; k++) {
      // subtree members follow their root in segment order; test ancestry
      let a = k;
      while (a > seg) a = sk.parent[a];
      if (a !== seg) continue;
      qmulTo(_q, 0, rot, k * 4, _q, 4);
      rot[k * 4] = _q[4]; rot[k * 4 + 1] = _q[5]; rot[k * 4 + 2] = _q[6]; rot[k * 4 + 3] = _q[7];
    }
  }

  /** Per-zombie styling on top of the clip (root-relative pose). */
  applyVariation(c) {
    const V = this.var, m = c.vary, I = this.sk.index;
    const lean = V.lean * m.lean;
    if (lean) {
      this.turnJoint(I.abdomen, 1, 0, 0, lean * 0.45);
      this.turnJoint(I.chest, 1, 0, 0, lean * 0.55);
    }
    if (V.sway * m.lean) this.turnJoint(I.chest, 0, 0, 1, V.sway * m.lean);
    const arms = m.arms;
    if (arms) {
      // shoulder elevation forward = negative rotation about the chest's lateral (+X) axis
      this.turnJoint(I.upperArmL, 1, 0, 0, -(V.reach + V.asym) * arms);
      this.turnJoint(I.upperArmR, 1, 0, 0, -(V.reach - V.asym) * arms);
      this.turnJoint(I.upperArmL, 0, 1, 0, V.spread * arms);
      this.turnJoint(I.upperArmR, 0, 1, 0, -V.spread * arms);
    }
    const head = m.head;
    if (head) {
      const L = this.layers[0];
      const ph = (L.t / L.clip.duration) * 6.283 * (L.clip.loop ? 2 : 1) + V.lollPhase;
      const loll = Math.sin(ph) * V.loll * head;
      // mostly at the base of the neck: the upper neck joint has little range left in most clips
      const nod = (V.nod + Math.cos(ph) * V.loll * 0.5) * head;
      this.turnJoint(I.neck, 0, 0, 1, (V.tilt + loll) * 0.85 * head);
      this.turnJoint(I.head, 0, 0, 1, (V.tilt + loll) * 0.15 * head);
      this.turnJoint(I.neck, 1, 0, 0, nod * 0.7);
      this.turnJoint(I.head, 1, 0, 0, nod * 0.3);
    }
  }

  // ----------------------------------------------------------------------------------------------
  releaseFeet() {
    for (const f of this.feet) {
      f.locked = false;
      f.ox = f.oz = 0;
      f.release = 0;
    }
    this.pelvisDrop = 0;
  }

  /**
   * Ground clips: lock stance feet where they touched down, keep soles on the ground, drop the
   * pelvis when a planted foot is out of the leg's reach. Works on the world pose (wrot / joint /
   * pos), re-solving the legs with a two-bone IK.
   */
  footIK(dt, root, ground) {
    const sk = this.sk, J = this.joint, gy = root.pos.y;
    // 1. locks: touchdown, lift-off, slide when dragged too far from where the clip has the foot
    let need = 0;
    for (const f of this.feet) {
      const leg = sk.legs[f.side];
      const c = this.contact[f.k] * ground;
      f.c = c;
      const ai = leg.foot * 3;
      const ax = J[ai], az = J[ai + 2];
      f.lowY = this.soleLow(leg, f.side);
      const stance = c > 0.5;
      if (!stance) f.blocked = false;
      if (stance && !f.locked && !f.blocked) {
        f.locked = true;
        const w = smooth01(f.release);
        f.lx = ax + f.ox * w;
        f.lz = az + f.oz * w;
        f.release = 0;
        f.yaw = root.yaw;
      } else if (f.locked && !stance) {
        this.liftOff(f, ax, az);
      }
      if (f.locked) {
        const ox = f.lx - ax, oz = f.lz - az;
        const d = Math.sqrt(ox * ox + oz * oz);
        if (d > MAX_LOCK) {
          // the root and the clip disagree too much (pushed back, dragged on): slide
          const k = MAX_LOCK / d;
          f.lx = ax + ox * k;
          f.lz = az + oz * k;
        }
        // turning on a planted foot: past ~20 degrees the foot pivots round with the body
        let dyaw = root.yaw - f.yaw;
        dyaw -= Math.round(dyaw / 6.283185307) * 6.283185307;
        if (dyaw > MAX_TWIST || dyaw < -MAX_TWIST) {
          const k = Math.min(1, dt * 6);
          f.lx += (ax - f.lx) * k;
          f.lz += (az - f.lz) * k;
          f.yaw += dyaw * k;
        }
        // how far the pelvis must come down for this leg to reach its planted foot
        const hi = leg.thigh * 3;
        const dx = f.lx - J[hi], dz = f.lz - J[hi + 2];
        const dy = gy - f.lowY - J[hi + 1];
        const R = leg.L1 + leg.L2 - 0.012;
        const h2 = dx * dx + dz * dz;
        if (h2 < R * R) {
          const drop = -Math.sqrt(R * R - h2) - dy;
          if (drop > need) need = drop * Math.min(1, c * 1.5);
        }
      }
    }
    // 2. pelvis drop (smoothed: quick down, slow back up), the whole body moves with it
    if (need > MAX_DROP) need = MAX_DROP;
    const pd = this.pelvisDrop;
    this.pelvisDrop = need > pd ? Math.min(need, pd + 1.5 * dt) : Math.max(need, pd - 0.4 * dt);
    if (this.pelvisDrop > 1e-5) {
      const P = this.pos, d = this.pelvisDrop;
      for (let i = 1; i < J.length; i += 3) {
        J[i] -= d;
        P[i] -= d;
      }
    }
    // 3. targets and leg IK
    for (const f of this.feet) {
      const leg = sk.legs[f.side];
      const ai = leg.foot * 3;
      const ax = J[ai], ay = J[ai + 1], az = J[ai + 2];
      let tx = ax, tz = az;
      if (f.locked) {
        tx = f.lx;
        tz = f.lz;
      } else if (f.release > 0) {
        f.release = Math.max(0, f.release - dt / f.releaseDur);
        const w = smooth01(f.release);
        tx = ax + f.ox * w;
        tz = az + f.oz * w;
      }
      // height: stance soles on the ground, swing soles above it
      const want = gy - (ay + f.lowY); // shift that puts the lowest corner on the ground
      const ty = want > 0 ? ay + want : ay + want * smooth01((f.c - 0.3) / 0.4);
      f.lift = ty - ay;
      if (Math.abs(tx - ax) + Math.abs(ty - ay) + Math.abs(tz - az) > 1e-5) this.legIK(f.side, tx, ty, tz);
      // a planted foot the body has run past (hip over-extended, or the shin leaning so far over
      // it the ankle would break): it comes off the ground early, as a foot does at toe-off
      if (f.locked && (this.hipExtension(leg) > MAX_HIP_EXT || this.dorsiflexion(leg) > MAX_DORSI)) {
        this.liftOff(f, ax, az);
        f.blocked = true; // no new plant until this stance is over
      }
    }
  }

  /** Lift a planted foot: keep its offset from the clip's foot and let it decay over the swing. */
  liftOff(f, ax, az) {
    f.locked = false;
    f.ox = f.lx - ax;
    f.oz = f.lz - az;
    f.release = 1;
    f.releaseDur = 0.22;
  }

  /** Ankle dorsiflexion past the bind pose (rad): shin leaning forward over the foot. */
  dorsiflexion(leg) {
    const J = this.joint, w = this.wrot;
    const ki = leg.shin * 3, ai = leg.foot * 3;
    let ux = J[ki] - J[ai], uy = J[ki + 1] - J[ai + 1], uz = J[ki + 2] - J[ai + 2];
    const ul = Math.sqrt(ux * ux + uy * uy + uz * uz) || 1;
    // foot forward = R_foot * (0, 0, 1)
    const o = leg.foot * 4;
    const qx = w[o], qy = w[o + 1], qz = w[o + 2], qw = w[o + 3];
    const fx = 2 * (qx * qz + qw * qy), fy = 2 * (qy * qz - qw * qx), fz = 1 - 2 * (qx * qx + qy * qy);
    const c = (ux * fx + uy * fy + uz * fz) / ul;
    return leg.ankleAngle - Math.acos(c < -1 ? -1 : c > 1 ? 1 : c);
  }

  /** Extension of a hip (rad, + = thigh behind the pelvis) from the posed thigh and pelvis. */
  hipExtension(leg) {
    const J = this.joint, w = this.wrot;
    const hi = leg.thigh * 3, ki = leg.shin * 3;
    // thigh direction in the pelvis frame
    rotInvAt(w, 0, J[ki] - J[hi], J[ki + 1] - J[hi + 1], J[ki + 2] - J[hi + 2], _v, 4);
    return Math.atan2(-_v[6], -_v[5]);
  }

  /** Lowest sole corner's height relative to the ankle joint for the current foot rotation. */
  soleLow(leg, side) {
    const o = leg.foot * 4, q = this.wrot;
    const qx = q[o], qy = q[o + 1], qz = q[o + 2], qw = q[o + 3];
    const A = leg.ankle;
    let low = Infinity;
    for (let k = 0; k < 4; k++) {
      const c = leg.sole[k];
      const vx = c[0] - A[0], vy = c[1] - A[1], vz = c[2] - A[2];
      const tx = 2 * (qy * vz - qz * vy), ty = 2 * (qz * vx - qx * vz), tz = 2 * (qx * vy - qy * vx);
      const y = vy + qw * ty + (qz * tx - qx * tz);
      if (y < low) low = y;
    }
    return low;
  }

  /**
   * Two-bone IK of one leg toward ankle target (tx,ty,tz), knee kept in the plane of its current
   * flexion axis; thigh and shin get hinge-consistent rotations, the foot keeps its world rotation.
   */
  legIK(side, tx, ty, tz) {
    const sk = this.sk, leg = sk.legs[side], J = this.joint, rot = this.wrot;
    const hi = leg.thigh * 3;
    const hx = J[hi], hy = J[hi + 1], hz = J[hi + 2];
    // knee flexion axis = R_thigh * bind knee axis
    rotAt(rot, leg.thigh * 4, leg.kAxis[0], leg.kAxis[1], leg.kAxis[2], _v, 0);
    const kx = _v[0], ky = _v[1], kz = _v[2];
    let dx = tx - hx, dy = ty - hy, dz = tz - hz;
    let D = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (D < 1e-6) return;
    dx /= D; dy /= D; dz /= D;
    const L1 = leg.L1, L2 = leg.L2;
    const maxD = L1 + L2 - 0.002;
    if (D > maxD) D = maxD;
    if (D < 0.15) D = 0.15;
    // pole (knee direction) = legDir x kneeAxis, then orthogonalise
    let nx = dy * kz - dz * ky, ny = dz * kx - dx * kz, nz = dx * ky - dy * kx;
    let nl = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (nl < 1e-6) return;
    nx /= nl; ny /= nl; nz /= nl;
    const ca = Math.min(1, Math.max(-1, (L1 * L1 + D * D - L2 * L2) / (2 * L1 * D)));
    const sa = Math.sqrt(1 - ca * ca);
    // knee position, bone directions
    const mx = hx + (dx * ca + nx * sa) * L1, my = hy + (dy * ca + ny * sa) * L1, mz = hz + (dz * ca + nz * sa) * L1;
    const ex = hx + dx * D, ey = hy + dy * D, ez = hz + dz * D;
    let d1x = (mx - hx) / L1, d1y = (my - hy) / L1, d1z = (mz - hz) / L1;
    let d2x = ex - mx, d2y = ey - my, d2z = ez - mz;
    const l2 = Math.sqrt(d2x * d2x + d2y * d2y + d2z * d2z) || 1;
    d2x /= l2; d2y /= l2; d2z /= l2;
    // flexion axis = d1 x d2 when bent enough, else the old axis
    let ax = d1y * d2z - d1z * d2y, ay = d1z * d2x - d1x * d2z, az = d1x * d2y - d1y * d2x;
    const al = Math.sqrt(ax * ax + ay * ay + az * az);
    const wb = smooth01((al - 0.04) / 0.12);
    if (al > 1e-6) {
      ax /= al; ay /= al; az /= al;
      if (ax * kx + ay * ky + az * kz < 0) {
        ax = -ax; ay = -ay; az = -az;
      }
    }
    ax = ax * wb + kx * (1 - wb);
    ay = ay * wb + ky * (1 - wb);
    az = az * wb + kz * (1 - wb);
    this.setBone(leg.thigh, leg.thighBindInv, d1x, d1y, d1z, ax, ay, az);
    this.setBone(leg.shin, leg.shinBindInv, d2x, d2y, d2z, ax, ay, az);
    // joints / bodies of thigh, shin, foot
    const bp = this.bindPos, Jb = sk.J, P = this.pos;
    J[leg.shin * 3] = mx; J[leg.shin * 3 + 1] = my; J[leg.shin * 3 + 2] = mz;
    J[leg.foot * 3] = ex; J[leg.foot * 3 + 1] = ey; J[leg.foot * 3 + 2] = ez;
    for (let k = 0; k < 3; k++) {
      const s = k === 0 ? leg.thigh : k === 1 ? leg.shin : leg.foot;
      const s3 = s * 3, s4 = s * 4;
      const vx = bp[s3] - Jb[s3], vy = bp[s3 + 1] - Jb[s3 + 1], vz = bp[s3 + 2] - Jb[s3 + 2];
      const rx = rot[s4], ry = rot[s4 + 1], rz = rot[s4 + 2], rw = rot[s4 + 3];
      const tx2 = 2 * (ry * vz - rz * vy), ty2 = 2 * (rz * vx - rx * vz), tz2 = 2 * (rx * vy - ry * vx);
      P[s3] = J[s3] + vx + rw * tx2 + (ry * tz2 - rz * ty2);
      P[s3 + 1] = J[s3 + 1] + vy + rw * ty2 + (rz * tx2 - rx * tz2);
      P[s3 + 2] = J[s3 + 2] + vz + rw * tz2 + (rx * ty2 - ry * tx2);
    }
  }

  /**
   * Segment rotation mapping its bind bone direction and bind knee axis onto (d, a):
   * R = basis(d, a) * basis(bindDir, bindAxis)^-1 (boneRotation in src/human/ik.js).
   */
  setBone(seg, bindInv, dx, dy, dz, ax, ay, az) {
    basisYZ(dx, dy, dz, ax, ay, az, _q, 8);
    qmulTo(_q, 8, bindInv, 0, this.wrot, seg * 4);
    qnormAt(this.wrot, seg * 4);
  }

  // ----------------------------------------------------------------------------------------------
  writeBodies(dt) {
    const n = this.n, P = this.pos, R = this.wrot, bodies = this.bodies;
    const inv = dt > 1e-6 ? 1 / dt : 0;
    for (let i = 0; i < n; i++) {
      const b = bodies[i];
      const i3 = i * 3, i4 = i * 4;
      const x = P[i3], y = P[i3 + 1], z = P[i3 + 2];
      let qx = R[i4], qy = R[i4 + 1], qz = R[i4 + 2], qw = R[i4 + 3];
      if (this.first) {
        b.framePos.set(x, y, z);
        b.frameRot.set(qx, qy, qz, qw);
        b.vel.set(0, 0, 0);
        b.angVel.set(0, 0, 0);
      } else {
        const op = b.pos, or = b.rot;
        b.framePos.copy(op);
        b.frameRot.copy(or);
        if (inv > 0) {
          let vx = (x - op.x) * inv, vy = (y - op.y) * inv, vz = (z - op.z) * inv;
          const sp = Math.sqrt(vx * vx + vy * vy + vz * vz);
          if (sp > 25) {
            const s = 25 / sp;
            vx *= s; vy *= s; vz *= s;
          }
          b.vel.set(vx, vy, vz);
          // dq = q * conj(qOld) -> rotation vector / dt
          if (qx * or.x + qy * or.y + qz * or.z + qw * or.w < 0) {
            qx = -qx; qy = -qy; qz = -qz; qw = -qw;
          }
          const ox = -or.x, oy = -or.y, oz = -or.z, ow = or.w;
          const dxq = qw * ox + qx * ow + qy * oz - qz * oy;
          const dyq = qw * oy - qx * oz + qy * ow + qz * ox;
          const dzq = qw * oz + qx * oy - qy * ox + qz * ow;
          const dwq = qw * ow - qx * ox - qy * oy - qz * oz;
          const s = Math.sqrt(dxq * dxq + dyq * dyq + dzq * dzq);
          let wx = 0, wy = 0, wz = 0;
          if (s > 1e-9) {
            const ang = 2 * Math.atan2(s, Math.abs(dwq)) * (dwq < 0 ? -1 : 1);
            const k = (ang / s) * inv;
            wx = dxq * k; wy = dyq * k; wz = dzq * k;
          }
          const wl = Math.sqrt(wx * wx + wy * wy + wz * wz);
          if (wl > 40) {
            const k = 40 / wl;
            wx *= k; wy *= k; wz *= k;
          }
          b.angVel.set(wx, wy, wz);
        }
      }
      b.pos.set(x, y, z);
      b.rot.set(R[i4], R[i4 + 1], R[i4 + 2], R[i4 + 3]);
      b.prevPos.set(x, y, z);
      b.prevRot.set(R[i4], R[i4 + 1], R[i4 + 2], R[i4 + 3]);
    }
  }

  // ----------------------------------------------------------------------------------------------
  /**
   * Capture the bodies as they are now (the physics' pose) and ease from it into the animation over
   * `duration` seconds. Call rootFromBodies() first so the clip starts where the body lies.
   */
  blendFromPhysics(duration = 0.5) {
    const n = this.n;
    for (let i = 0; i < n; i++) {
      const r = this.bodies[i].rot;
      this.physRot[i * 4] = r.x;
      this.physRot[i * 4 + 1] = r.y;
      this.physRot[i * 4 + 2] = r.z;
      this.physRot[i * 4 + 3] = r.w;
    }
    const p = this.bodies[0].pos;
    this.physPel[0] = p.x;
    this.physPel[1] = p.y;
    this.physPel[2] = p.z;
    this.phys = 1;
    this.physDur = duration;
    this.first = false;
    for (const f of this.feet) {
      f.locked = false;
      f.release = 0;
      f.ox = f.oz = 0;
    }
  }

  /**
   * Root (ground point and heading) that best fits the bodies' current pose to clip `clip` (default:
   * the current clip at its current time): a 2-D least-squares fit of the clip pose's key points onto
   * the bodies' (works lying, crawling or standing). out = { pos: {x,y,z}, yaw }.
   */
  rootFromBodies(out, clip = null) {
    const n = this.n;
    let L = this.layers[0];
    if (clip && DEC[clip] && DEC[clip] !== L.clip) {
      // sample the requested clip at its start (or the zombie's phase for loops)
      const tmp = this._tmpLayer || (this._tmpLayer = new Layer());
      const c = DEC[clip];
      tmp.clip = c;
      tmp.mirror = c.vary.mirror && this.var.mirror;
      tmp.t = c.loop ? this.var.phase * c.duration : 0;
      L = tmp;
    }
    this.sampleLayer(L, this.tmpRot, this.tmpPel, null);
    const bp = this.bindPos;
    for (let i = 0; i < n; i++) {
      const b = this.segs[i].bindPos;
      bp[i * 3] = b.x;
      bp[i * 3 + 1] = b.y;
      bp[i * 3 + 2] = b.z;
    }
    const J = this._fitJ || (this._fitJ = new Float64Array(n * 3));
    const P = this._fitP || (this._fitP = new Float64Array(n * 3));
    fk(this.sk, this.tmpRot, this.tmpPel[0], this.tmpPel[1], this.tmpPel[2], bp, J, P);
    // weighted centroids (clip: P, bodies: world)
    let cx = 0, cz = 0, wx = 0, wz = 0, m = 0;
    for (let i = 0; i < n; i++) {
      const b = this.bodies[i], w = b.mass;
      cx += P[i * 3] * w;
      cz += P[i * 3 + 2] * w;
      wx += b.pos.x * w;
      wz += b.pos.z * w;
      m += w;
    }
    cx /= m; cz /= m; wx /= m; wz /= m;
    let sdot = 0, scross = 0;
    for (let i = 0; i < n; i++) {
      const b = this.bodies[i], w = b.mass;
      const ax = P[i * 3] - cx, az = P[i * 3 + 2] - cz;
      const bx = b.pos.x - wx, bz = b.pos.z - wz;
      // rotation about +Y by yaw maps (x, z) -> (x cos + z sin, -x sin + z cos)
      sdot += w * (ax * bx + az * bz);
      scross += w * (az * bx - ax * bz);
    }
    const yaw = Math.atan2(scross, sdot);
    const c = Math.cos(yaw), s = Math.sin(yaw);
    out.yaw = yaw;
    out.pos.x = wx - (cx * c + cz * s);
    out.pos.z = wz - (-cx * s + cz * c);
    out.pos.y = this.groundY;
    return out;
  }

  /** Root-relative pose sample of a clip for tools: fills rot (n*4, ragdoll order) and pel (3). */
  sampleClip(name, t, rot, pel, mirror = false) {
    const tmp = this._tmpLayer || (this._tmpLayer = new Layer());
    tmp.clip = DEC[name];
    tmp.mirror = mirror;
    tmp.t = t;
    this.sampleLayer(tmp, rot, pel, null);
  }
}

export { DEC as _clipData };
