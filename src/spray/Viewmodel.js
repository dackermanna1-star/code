// First-person spray-paint viewmodel: a woman's right hand in a black leather
// sleeve holding a 400 ml aerosol can, index finger on the actuator.
//
// Rig (all in camera space, -Z forward, metres):
//   group ─ rig (pivot on the can axis at grip height; procedural motion)
//             ├─ can (body mesh) ─ actuator (press travel) ─ 4 cap variants + nozzle tips
//             └─ hand (wrist frame, fixed grip) ─ palm, 4 fingers x 3 phalanges, thumb x 3
//         ─ forearm (sleeve; follows the wrist, aimed at a moving elbow anchor)
//
// The grip is solved once at construction: middle/ring/little fingers and the
// thumb flex joint by joint until each segment rests on the can surface, and
// the index finger is solved (per cap, pressed and released) so its pad sits on
// the actuator. update() only blends precomputed joint angles and composes
// spring-damped offsets: no allocations per frame.
import * as THREE from 'three';
import { createVoxelMaterial } from '../render/voxelMaterial.js';
import {
  createPalette, buildCan, buildCap, buildPalm, buildSegment, buildSleeve,
  CAN, CAPS, CAP_TYPES, HAND, SLEEVE,
} from './viewmodelParts.js';

const FINGERS = ['index', 'middle', 'ring', 'little'];
const TAU = Math.PI * 2;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** How the hand sits on the can (can frame: origin at the bottom centre, +Y up, nozzle toward -Z). */
export const GRIP = {
  pivotY: 0.165, // rig pivot on the can axis
  palmAngle: -0.3, // palm contact direction around the can (rad from +X toward -Z, the nozzle side): back-right, so the dorsum faces the eye
  palmY: 0.155, // palm contact height
  knuckleTilt: 0.16, // knuckle line tilted from the can axis (power grip runs obliquely across the palm)
  palmLean: 0.05, // palm normal tilted (rad, + tips the dorsum up)
  palmContact: [0.004, 0.05, -0.0128], // hand-frame point of the palmar skin that touches the can
  squash: 0.0012, // soft tissue compression at contacts
  thumb: { angle: -1.3, y: 0.176, out: 0.0118 }, // thumb MCP target around the can
  indexDip: 0.42, // DIP/PIP coupling for the index on the actuator
};

/** Rest framing (camera space) for 16:9; x moves toward the centre on tall screens. */
export const REST = {
  nozzle: [0.112, -0.058, -0.4],
  narrowX: 0.058,
  pitch: 0.06, // + tips the can top toward the camera
  yaw: 0.09, // + turns the nozzle left (toward the view axis)
  roll: 0.1, // + leans the can top left (toward the screen centre)
  elbowDir: [0.3, -0.84, 0.45], // from the wrist toward the elbow: the forearm rises from below
  forearm: 0.26,
};

// scalar spring (semi-implicit Euler, sub-stepped for stiffness)
class Spring {
  constructor(x = 0, w = 10, z = 1) {
    this.x = x;
    this.v = 0;
    this.w = w;
    this.z = z;
  }
  step(target, dt) {
    const n = Math.max(1, Math.ceil(dt * 240));
    const h = dt / n;
    const w = this.w, z = this.z;
    for (let i = 0; i < n; i++) {
      this.v += (w * w * (target - this.x) - 2 * z * w * this.v) * h;
      this.x += this.v * h;
    }
    return this.x;
  }
}

const _X = new THREE.Vector3(1, 0, 0);
const _Y = new THREE.Vector3(0, 1, 0);
const _Z = new THREE.Vector3(0, 0, 1);

export class Viewmodel {
  constructor(engine) {
    const t0 = performance.now();
    this.engine = engine;
    this.camera = engine.camera;
    this.group = new THREE.Group();
    this.group.name = 'viewmodel';
    const mat = (this.material = createVoxelMaterial({ name: 'viewmodel', viewmodel: true, wetScale: 0.2 }));
    if (engine.envMap) {
      mat.envMap = engine.envMap;
      mat.envMapIntensity = 1;
    }
    this.setColor(0xd8263a);
    this.setFinish({ metal: 0, rough: 0.42 });
    const P = (this.palette = createPalette());
    this.meshes = [];
    const mesh = (geo, name) => {
      const m = new THREE.Mesh(geo, mat);
      m.name = name;
      m.castShadow = false;
      m.receiveShadow = true;
      m.frustumCulled = false;
      this.meshes.push(m);
      return m;
    };

    // ── rig skeleton ──
    this.rig = new THREE.Group();
    this.group.add(this.rig);
    this.can = new THREE.Group();
    this.can.position.set(0, -GRIP.pivotY, 0);
    this.rig.add(this.can);
    const canPart = buildCan(P);
    this.canSdf = canPart.sdf;
    this.can.add(mesh(canPart.geometry, 'can'));
    this.actuator = new THREE.Group();
    this.actuator.position.set(0, CAN.seat, 0);
    this.can.add(this.actuator);
    this.caps = {};
    for (const type of CAP_TYPES) {
      const { geometry, info } = buildCap(P, type);
      const m = mesh(geometry, `cap-${type}`);
      m.visible = false;
      this.actuator.add(m);
      const tip = new THREE.Object3D();
      tip.position.fromArray(info.tip);
      this.actuator.add(tip);
      this.caps[type] = { mesh: m, tip, info };
    }

    // hand: palm + fingers (3 phalanges each) + thumb (metacarpal, proximal, distal)
    this.hand = new THREE.Group();
    this.rig.add(this.hand);
    this.hand.add(mesh(buildPalm(P), 'palm'));
    this.fingers = {};
    let seed = 1;
    for (const f of FINGERS) {
      const d = HAND.fingers[f];
      const joints = [];
      let parent = this.hand;
      for (let s = 0; s < 3; s++) {
        const j = new THREE.Group();
        if (s === 0) j.position.fromArray(d.mcp);
        else j.position.set(0, d.len[s - 1], 0);
        parent.add(j);
        const kind = s === 0 ? 'prox' : s === 1 ? 'mid' : 'dist';
        const geo = buildSegment(P, {
          L: d.len[s], w0: d.w[s], w1: d.w[s + 1], kind,
          ring: s === 0 && HAND.ringFinger === f,
          specks: f === 'index' && s === 2,
          seed: seed++,
        });
        j.add(mesh(geo, `${f}${s}`));
        joints.push(j);
        parent = j;
      }
      this.fingers[f] = { joints, def: d, base: new THREE.Quaternion().setFromAxisAngle(_Z, d.splay) };
    }
    {
      const d = HAND.thumb;
      const joints = [];
      let parent = this.hand;
      for (let s = 0; s < 3; s++) {
        const j = new THREE.Group();
        if (s === 0) j.position.fromArray(d.cmc);
        else j.position.set(0, d.len[s - 1], 0);
        parent.add(j);
        const kind = s === 0 ? 'meta' : s === 1 ? 'prox' : 'tdist';
        j.add(mesh(buildSegment(P, { L: d.len[s], w0: d.w[s], w1: d.w[s + 1], kind, seed: seed++ }), `thumb${s}`));
        joints.push(j);
        parent = j;
      }
      this.thumb = { joints, def: d, rest: [new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion()] };
    }

    // sleeve on the forearm
    this.forearm = new THREE.Group();
    this.forearm.add(mesh(buildSleeve(P), 'sleeve'));
    this.group.add(this.forearm);
    this.buildMs = performance.now() - t0;

    // scratch (no per-frame allocations); the grip solve below uses it too
    this._q = new THREE.Quaternion();
    this._q2 = new THREE.Quaternion();
    this._qf = new THREE.Quaternion();
    this._e = new THREE.Euler(0, 0, 0, 'YXZ');
    this._v = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this._v3 = new THREE.Vector3();
    this._sv = new THREE.Vector3();
    this._m = new THREE.Matrix4();
    this._dir = new THREE.Vector3();
    this.elbow = new THREE.Vector3();

    // ── grip solve (can frame), then rest framing ──
    const t1 = performance.now();
    this.solveGrip();
    this.solveMs = performance.now() - t1;
    this.setupRest();

    // ── state ──
    this.capType = 'standard';
    this.prevCap = 'standard';
    this.capBlend = 1;
    this.setCap('standard');
    this.sEquip = new Spring(0, 11.5, 0.62);
    this.sPress = new Spring(0, 38, 0.95);
    this.sRecoil = new Spring(0, 20, 0.42);
    this.sShake = new Spring(0, 16, 0.85);
    this.sLift = new Spring(0, 13, 0.9);
    this.sReach = new Spring(1, 9, 1);
    this.sMenu = new Spring(0, 8.5, 0.8);
    this.sWalk = new Spring(0, 6, 1);
    this.sLookX = new Spring(0, 11, 0.72);
    this.sLookY = new Spring(0, 11, 0.72);
    this.sAimYaw = new Spring(0, 12, 0.9);
    this.sAimPitch = new Spring(0, 12, 0.9);
    this.sAspect = new Spring(1, 6, 1);
    this.shakePhase = 0;
    this.shakeCount = 0;
    this.wasSpraying = false;
    this.clickCbs = [];
    this.pending = Array.from({ length: 8 }, () => ({ t: -1, s: 0 }));
    this.rand = 0x2f6b9a31;
    this.time = 0;
    this._hidden = true;
    this.group.visible = false;

    this.update(0, { equipped: false });
  }

  // ───────────────────────────── public API ─────────────────────────────

  /** Paint colour: THREE.Color in linear space, or a number = sRGB hex. */
  setColor(color) {
    const u = this.material.userData.uniforms.uTint.value;
    if (typeof color === 'number') u.setHex(color);
    else if (color && color.isColor) u.copy(color);
  }

  /** Paint finish for the TINT voxels (chrome paint: metal 0.95, rough 0.3). */
  setFinish({ metal = 0, rough = 0.45 } = {}) {
    this.material.userData.uniforms.uTintFinish.value.set(metal, rough);
  }

  /** 'skinny' | 'standard' | 'fat' | 'calligraphy' */
  setCap(type) {
    if (!this.caps[type]) return;
    if (type !== this.capType) {
      this.prevCap = this.capType;
      this.capBlend = 0;
    }
    this.capType = type;
    for (const k of CAP_TYPES) this.caps[k].mesh.visible = k === type;
  }

  onShakeClick(cb) {
    this.clickCbs.push(cb);
  }

  get visible() {
    return !this._hidden;
  }

  /** World-space nozzle tip and spray direction after the latest update. */
  nozzle(outPos, outDir) {
    const tip = this.caps[this.capType].tip;
    tip.updateWorldMatrix(true, false);
    outPos.setFromMatrixPosition(tip.matrixWorld);
    if (outDir) outDir.set(0, 0, -1).transformDirection(tip.matrixWorld);
    return outPos;
  }

  /** Total triangles of the meshes visible at once (one cap). */
  triangleCount() {
    let n = 0;
    for (const m of this.meshes) if (!m.name.startsWith('cap-') || m.name === `cap-${this.capType}`) n += m.geometry.index.count / 3;
    return n;
  }

  // ───────────────────────────── grip solve ─────────────────────────────

  /** Joint quaternion: base * Rz(abd) * Rx(-flex). */
  jointQ(out, base, abd, flex) {
    out.setFromAxisAngle(_Z, abd);
    if (base) out.premultiply(base);
    return out.multiply(this._qf.setFromAxisAngle(_X, -flex));
  }

  /** Distance from the can's surface to the capsule core at local point p of joint obj. */
  segPen(obj, len, r0, r1, n = 7) {
    // minimum over samples of (canSdf - radius); obj world matrices are in the can frame
    let best = 1;
    const v = this._sv;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      v.set(0, len * t, 0).applyMatrix4(obj.matrixWorld);
      const d = this.canSdf(v.x, v.y, v.z) - lerp(r0, r1, t) * 0.94;
      if (d < best) best = d;
    }
    return best;
  }

  solveGrip() {
    this._qf = new THREE.Quaternion();
    this._sv = new THREE.Vector3();
    const R = CAN.R;
    // the hand is solved in the can frame
    const frame = new THREE.Group();
    frame.add(this.hand);
    // ── palm placement ──
    const phi = GRIP.palmAngle;
    const n = new THREE.Vector3(Math.cos(phi), 0, -Math.sin(phi)); // outward at the contact
    const tan = new THREE.Vector3().crossVectors(_Y, n).normalize();
    const Zh = n.clone().applyAxisAngle(tan, -GRIP.palmLean);
    const Xh = _Y.clone().negate().applyAxisAngle(Zh, GRIP.knuckleTilt);
    Xh.addScaledVector(Zh, -Xh.dot(Zh)).normalize();
    const Yh = new THREE.Vector3().crossVectors(Zh, Xh).normalize();
    const qh = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(Xh, Yh, Zh));
    const S = new THREE.Vector3(n.x * (R - GRIP.squash), GRIP.palmY, n.z * (R - GRIP.squash));
    const Cp = new THREE.Vector3().fromArray(GRIP.palmContact).applyQuaternion(qh);
    this.hand.position.copy(S).sub(Cp);
    this.hand.quaternion.copy(qh);
    frame.updateMatrixWorld(true);
    const handQInv = qh.clone().invert();

    // ── wrapping fingers ──
    const wrap = (joints, lens, w, start, maxFlex, base, abd) => {
      const flex = [0, 0, 0];
      for (let s = 0; s < 3; s++) {
        const j = joints[s];
        const L = s === 2 ? lens[s] - w[3] : lens[s];
        const set = (th) => {
          flex[s] = th;
          this.jointQ(j.quaternion, s === 0 ? base : null, s === 0 ? abd : 0, th);
          j.updateMatrixWorld(true);
        };
        let lo = start[s];
        set(lo);
        if (this.segPen(j, L, w[s], w[s + 1]) <= -GRIP.squash) continue; // already touching
        let hi = -1;
        for (let th = lo; th <= maxFlex[s]; th += 0.03) {
          set(th);
          if (this.segPen(j, L, w[s], w[s + 1]) <= -GRIP.squash) {
            hi = th;
            break;
          }
          lo = th;
        }
        if (hi < 0) {
          set(maxFlex[s]);
          continue;
        }
        for (let it = 0; it < 10; it++) {
          const mid = (lo + hi) / 2;
          set(mid);
          if (this.segPen(j, L, w[s], w[s + 1]) <= -GRIP.squash) hi = mid;
          else lo = mid;
        }
        set(lo);
      }
      return flex;
    };
    // abduction that lines a finger's flexion axis up with the can axis
    const alignAbd = (f) => {
      let best = 0, bestDot = -2;
      for (let a = -0.45; a <= 0.45; a += 0.01) {
        this.jointQ(this._q, f.base, a, 0);
        const ax = this._v.copy(_X).applyQuaternion(this._q).applyQuaternion(qh);
        const d = -ax.y; // want +X (ulnar) pointing down the can
        if (d > bestDot) {
          bestDot = d;
          best = a;
        }
      }
      return clamp(best, -0.3, 0.3);
    };
    this.pose = {};
    for (const name of ['middle', 'ring', 'little']) {
      const f = this.fingers[name];
      const abd = alignAbd(f);
      const flex = wrap(f.joints, f.def.len, f.def.w, [0.05, 0.1, 0.05], [1.45, 1.75, 1.2], f.base, abd);
      this.pose[name] = { abd, flex };
    }
    // index wrapped around the shoulder (used while shaking / in the menu)
    {
      const f = this.fingers.index;
      const abd = alignAbd(f) - 0.05;
      const flex = wrap(f.joints, f.def.len, f.def.w, [0.05, 0.1, 0.05], [1.3, 1.6, 1.0], f.base, abd);
      this.indexWrap = { abd, flex };
    }

    // ── thumb: metacarpal aimed around the can, phalanges wrap the other way ──
    {
      const T = this.thumb;
      const d = T.def;
      const cmc = new THREE.Vector3().fromArray(d.cmc).applyMatrix4(this.hand.matrixWorld);
      const ta = GRIP.thumb.angle;
      const rT = R + GRIP.thumb.out;
      const target = new THREE.Vector3(Math.cos(ta) * rT, GRIP.thumb.y, -Math.sin(ta) * rT);
      const Yt = target.clone().sub(cmc).normalize();
      const mid = cmc.clone().addScaledVector(Yt, d.len[0] * 0.5);
      const out = new THREE.Vector3(mid.x, 0, mid.z).normalize();
      const Zt = out.clone().addScaledVector(Yt, -out.dot(Yt)).normalize();
      const Xt = new THREE.Vector3().crossVectors(Yt, Zt).normalize();
      const qMeta = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(Xt, Yt, Zt));
      T.joints[0].quaternion.copy(handQInv).multiply(qMeta);
      T.rest[0].copy(T.joints[0].quaternion);
      frame.updateMatrixWorld(true);
      // proximal phalanx frame: tangent around the can (toward the back), dorsal outward
      const pm = new THREE.Vector3().setFromMatrixPosition(T.joints[1].matrixWorld);
      const o = new THREE.Vector3(pm.x, 0, pm.z).normalize();
      const phiM = Math.atan2(-o.z, o.x);
      const tdir = new THREE.Vector3(Math.sin(phiM), 0, Math.cos(phiM)); // decreasing phi
      // keep a little of the metacarpal's vertical slope so the thumb doesn't kink
      tdir.addScaledVector(_Y, Yt.y * 0.35).normalize();
      const Zp = o.clone().addScaledVector(tdir, -o.dot(tdir)).normalize();
      const Xp = new THREE.Vector3().crossVectors(tdir, Zp).normalize();
      const qProx = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(Xp, tdir, Zp));
      T.rest[1].copy(qMeta).invert().multiply(qProx);
      // wrap: flex about each segment's own -X
      const flex = [0, 0, 0];
      for (let s = 1; s < 3; s++) {
        const j = T.joints[s];
        const L = s === 2 ? d.len[2] - d.w[3] : d.len[s];
        const set = (th) => {
          flex[s] = th;
          j.quaternion.copy(T.rest[s]).multiply(this._qf.setFromAxisAngle(_X, -th));
          j.updateMatrixWorld(true);
        };
        let lo = -0.4, hi = -1;
        for (let th = -0.4; th <= 1.4; th += 0.03) {
          set(th);
          if (this.segPen(j, L, d.w[s], d.w[s + 1]) <= -GRIP.squash) {
            hi = th;
            break;
          }
          lo = th;
        }
        if (hi < 0) {
          set(0.9);
          continue;
        }
        for (let it = 0; it < 10; it++) {
          const m = (lo + hi) / 2;
          set(m);
          if (this.segPen(j, L, d.w[s], d.w[s + 1]) <= -GRIP.squash) hi = m;
          else lo = m;
        }
        set(lo);
      }
      this.pose.thumb = flex;
    }

    // ── index on the actuator: per cap, released and pressed ──
    this.indexSol = {};
    for (const type of CAP_TYPES) {
      const c = CAPS[type];
      this.indexSol[type] = [0, 1].map((press) => this.solveIndex(c, press, frame));
    }
    // leave the rig in a valid pose; move the hand to the pivot frame
    this.applyIndex(this.indexSol.standard[0]);
    frame.remove(this.hand);
    this.hand.position.y -= GRIP.pivotY;
    this.rig.add(this.hand);
  }

  /** Index finger pad on the actuator top (can frame). Grid search + refine in the finger plane. */
  solveIndex(cap, press, frame) {
    const f = this.fingers.index;
    const d = f.def;
    const capTop = CAN.seat - CAN.travel * press + cap.h;
    const w3 = d.w[3];
    const padR = w3 * HAND.thickness * 0.95;
    // pad centre target: over the cap, slightly behind the orifice
    const target = new THREE.Vector3(0.0006, capTop + padR - GRIP.squash * 0.6, 0.0018);
    // abduction: put the target in the finger's flexion plane
    const mcp = f.joints[0];
    this.jointQ(mcp.quaternion, f.base, 0, 0);
    frame.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(mcp.matrixWorld).invert();
    const tl = target.clone().applyMatrix4(inv);
    const abd = clamp(Math.atan2(-tl.x, tl.y), -0.5, 0.5);
    this.jointQ(mcp.quaternion, f.base, abd, 0);
    frame.updateMatrixWorld(true);
    const M = mcp.matrixWorld.clone();
    const tp = target.clone().applyMatrix4(M.clone().invert()); // (x≈0, u=y, v=z) in the finger plane
    const [L1, L2, L3] = d.len;
    const k = GRIP.indexDip;
    const pt = new THREE.Vector3();
    const capR = cap.radius;
    const pen = (u, v, r) => {
      pt.set(0, u, v).applyMatrix4(M);
      let s = this.canSdf(pt.x, pt.y, pt.z) - r;
      // actuator as a cylinder
      const rr = Math.hypot(pt.x, pt.z) - capR;
      const yy = Math.max(CAN.seat - pt.y, pt.y - capTop);
      const dc = Math.hypot(Math.max(rr, 0), Math.max(yy, 0)) + Math.min(Math.max(rr, yy), 0);
      s = Math.min(s, dc - r);
      return s < 0 ? s : 0;
    };
    const cost = (a1, a2) => {
      const a3 = a2 * k;
      const c1 = Math.cos(a1), s1 = Math.sin(a1);
      const c12 = Math.cos(a1 + a2), s12 = Math.sin(a1 + a2);
      const c123 = Math.cos(a1 + a2 + a3), s123 = Math.sin(a1 + a2 + a3);
      // flexion turns +Y (u) toward -Z (v)
      const pu = L1 * c1, pv = -L1 * s1;
      const qu = pu + L2 * c12, qv = pv - L2 * s12;
      const along = L3 - w3 * 1.25;
      const padU = qu + along * c123 - w3 * 0.22 * s123;
      const padV = qv - along * s123 - w3 * 0.22 * c123;
      let e = (padU - tp.y) ** 2 + (padV - tp.z) ** 2;
      // stay out of the can and the actuator (joints and segment midpoints)
      let p = 0;
      p += pen(pu * 0.5, pv * 0.5, d.w[0] * 0.95);
      p += pen(pu, pv, d.w[1]);
      p += pen((pu + qu) * 0.5, (pv + qv) * 0.5, d.w[1] * 0.95);
      p += pen(qu, qv, d.w[2]);
      p += pen(qu + (L3 - w3) * 0.45 * c123, qv - (L3 - w3) * 0.45 * s123, d.w[2] * 0.9);
      e += p * p * 40;
      // prefer a natural curl: distal pad pressing down onto the cap
      e += 1e-6 * (a1 - 0.5) ** 2;
      return e;
    };
    let b1 = 0.4, b2 = 0.8, be = Infinity;
    for (let a1 = -0.3; a1 <= 1.5; a1 += 0.03)
      for (let a2 = 0; a2 <= 1.9; a2 += 0.03) {
        const e = cost(a1, a2);
        if (e < be) {
          be = e;
          b1 = a1;
          b2 = a2;
        }
      }
    for (let step = 0.015; step > 0.0005; step *= 0.5)
      for (let it = 0; it < 6; it++) {
        for (const [d1, d2] of [[step, 0], [-step, 0], [0, step], [0, -step], [step, step], [-step, -step], [step, -step], [-step, step]]) {
          const e = cost(b1 + d1, b2 + d2);
          if (e < be) {
            be = e;
            b1 += d1;
            b2 += d2;
          }
        }
      }
    return { abd, flex: [b1, b2, b2 * k], err: Math.sqrt(be) };
  }

  applyIndex(sol) {
    const f = this.fingers.index;
    this.jointQ(f.joints[0].quaternion, f.base, sol.abd, sol.flex[0]);
    this.jointQ(f.joints[1].quaternion, null, 0, sol.flex[1]);
    this.jointQ(f.joints[2].quaternion, null, 0, sol.flex[2]);
  }

  setupRest() {
    // apply the static finger poses
    for (const name of ['middle', 'ring', 'little']) {
      const f = this.fingers[name];
      const p = this.pose[name];
      for (let s = 0; s < 3; s++) this.jointQ(f.joints[s].quaternion, s === 0 ? f.base : null, s === 0 ? p.abd : 0, p.flex[s]);
    }
    const T = this.thumb;
    for (let s = 1; s < 3; s++) T.joints[s].quaternion.copy(T.rest[s]).multiply(this._qf.setFromAxisAngle(_X, -this.pose.thumb[s]));
    // rest orientation and pivot position (camera space)
    this.restQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(REST.pitch, REST.yaw, REST.roll, 'YXZ'));
    this.restDir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.restQ);
    this.restYaw = Math.atan2(-this.restDir.x, -this.restDir.z);
    this.restPitch = Math.asin(clamp(this.restDir.y, -1, 1));
    const tip = new THREE.Vector3().fromArray(CAPS.standard.tip);
    tip.y += CAN.seat - GRIP.pivotY;
    tip.applyQuaternion(this.restQ);
    this.restPivot = new THREE.Vector3().fromArray(REST.nozzle).sub(tip);
    this.restNarrowDX = REST.narrowX - REST.nozzle[0];
    // wrist and elbow anchor at rest
    this.rig.position.copy(this.restPivot);
    this.rig.quaternion.copy(this.restQ);
    this.rig.updateMatrix();
    this.hand.updateMatrix();
    const wrist = new THREE.Vector3().applyMatrix4(this.hand.matrix).applyMatrix4(this.rig.matrix);
    this.restWrist = wrist;
    this.restElbow = wrist.clone().addScaledVector(new THREE.Vector3().fromArray(REST.elbowDir).normalize(), REST.forearm);
  }

  // ───────────────────────────── animation ─────────────────────────────

  rnd() {
    let t = (this.rand = (this.rand + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  queueClick(delay, strength) {
    for (const p of this.pending)
      if (p.t < 0) {
        p.t = delay;
        p.s = strength;
        return;
      }
  }

  update(dt, s = {}) {
    dt = clamp(dt || 0, 0, 0.05);
    this.time = s.time ?? this.time + dt;
    const t = this.time;
    const equipped = !!s.equipped;
    const spraying = !!s.spraying && equipped;
    const shaking = !!s.shaking && equipped;
    const menu = !!s.menuOpen && equipped;

    // ── springs ──
    const eq = this.sEquip;
    if (equipped) {
      eq.w = 11.5;
      eq.z = 0.62;
    } else {
      eq.w = 13;
      eq.z = 1;
    }
    eq.step(equipped ? 1 : 0, dt);
    const press = this.sPress.step(spraying ? clamp(s.pressure ?? 1, 0, 1) : 0, dt);
    if (spraying && !this.wasSpraying) this.sRecoil.v += 5.5;
    this.wasSpraying = spraying;
    const recoil = this.sRecoil.step(0, dt);
    const A = this.sShake.step(shaking ? 1 : 0, dt);
    const lift = clamp(this.sLift.step(shaking || menu ? 1 : !equipped ? 0.5 : 0, dt), 0, 1);
    const reach = this.sReach.step(clamp(s.reach ?? 1, 0, 1), dt);
    const m = this.sMenu.step(menu ? 1 : 0, dt);
    const wa = this.sWalk.step(clamp(s.walkAmp ?? 0, 0, 1), dt);
    const lv = s.lookVel;
    const lx = this.sLookX.step(Math.tanh((lv?.x ?? 0) * 0.32), dt);
    const ly = this.sLookY.step(Math.tanh((lv?.y ?? 0) * 0.32), dt);
    const aspect = this.sAspect.step(this.camera?.aspect ?? 16 / 9, dt * 4);

    // aim: yaw/pitch of the requested spray direction relative to the rest direction, soft-clamped
    let dyT = 0, dpT = 0;
    const aim = s.aim;
    if (aim && aim.lengthSq() > 1e-6) {
      const len = Math.sqrt(aim.lengthSq());
      dyT = wrapPi(Math.atan2(-aim.x, -aim.z) - this.restYaw);
      dpT = Math.asin(clamp(aim.y / len, -1, 1)) - this.restPitch;
      dyT = 0.55 * Math.tanh(dyT / 0.55);
      dpT = dpT > 0 ? 0.32 * Math.tanh(dpT / 0.32) : 0.5 * Math.tanh(dpT / 0.5);
    }
    const ay = this.sAimYaw.step(dyT * (1 - m), dt);
    const ap = this.sAimPitch.step(dpT * (1 - m), dt);

    // ── offsets (camera space) ──
    let px = 0, py = 0, pz = 0, rx = 0, ry = 0, rz = 0;
    const steady = 1 - 0.65 * press;
    // idle breathing + micro sway
    const br = Math.sin(TAU * 0.23 * t);
    py += 0.0017 * br * steady;
    rx += 0.0045 * Math.sin(TAU * 0.23 * t - 0.7) * steady;
    px += 0.0008 * (Math.sin(0.71 * t) + 0.7 * Math.sin(1.93 * t + 1.1)) * steady;
    py += 0.0005 * Math.sin(1.37 * t + 2.0) * steady;
    rz += (0.004 * Math.sin(0.53 * t + 0.3) + 0.0018 * Math.sin(1.61 * t)) * steady;
    ry += 0.003 * Math.sin(0.47 * t + 1.7) * steady;
    // walking: figure-eight bob, dip just after each heel strike (integer phase)
    if (wa > 1e-4) {
      const ph = s.walkPhase ?? 0;
      const k = wa * (1 - 0.55 * press);
      const sp = Math.sin(Math.PI * ph);
      const dip = 0.5 + 0.5 * Math.cos(TAU * (ph - 0.16));
      px += 0.0055 * k * sp;
      py += -0.0048 * k * dip + 0.0012 * k;
      pz += 0.0018 * k * Math.cos(TAU * (ph - 0.1));
      rz += 0.018 * k * Math.sin(Math.PI * ph + 0.35);
      ry += 0.011 * k * sp;
      rx += -0.012 * k * dip + 0.004 * k;
    }
    // look lag: the hand trails the camera's rotation
    px += 0.016 * lx;
    ry += -0.07 * lx;
    rz += 0.035 * lx;
    py += -0.013 * ly;
    rx += -0.06 * ly;
    // shake: ~6 Hz strokes with a wrist twist; the mixing ball clacks at reversals
    if (A > 1e-4 || shaking) {
      const f = 6.1 * (1 + 0.05 * Math.sin(0.83 * t));
      this.shakePhase += TAU * f * dt;
      const ph = this.shakePhase;
      const cnt = Math.floor((ph + Math.PI / 2) / Math.PI);
      if (cnt !== this.shakeCount) {
        this.shakeCount = cnt;
        if (A > 0.3 && shaking) {
          const st = clamp(A * (0.78 + 0.22 * this.rnd()), 0, 1);
          this.queueClick(0.012 + 0.01 * this.rnd(), st);
          if (this.rnd() < 0.38) this.queueClick(0.04 + 0.018 * this.rnd(), st * (0.35 + 0.2 * this.rnd()));
        }
      }
      const sn = Math.sin(ph);
      py += 0.033 * A * sn - 0.024 * A;
      pz += 0.009 * A * Math.sin(ph + 0.7) + 0.01 * A;
      px += -0.003 * A * sn - 0.01 * A;
      rx += 0.13 * A * Math.sin(ph - 0.55);
      rz += 0.2 * A * Math.sin(ph - 0.9) + 0.05 * A;
      ry += 0.05 * A * Math.sin(ph + 0.3);
    } else {
      this.shakePhase = 0;
      this.shakeCount = 0;
    }
    // pending clacks
    for (const p of this.pending) {
      if (p.t < 0) continue;
      p.t -= dt;
      if (p.t <= 0) {
        p.t = -1;
        for (const cb of this.clickCbs) cb(p.s);
      }
    }
    // spray: tiny recoil at onset, fine vibration while the valve is open
    pz += 0.0035 * recoil;
    py += 0.0012 * recoil;
    rx += 0.025 * recoil;
    if (press > 1e-3) {
      const vib = press * 0.00022;
      px += vib * Math.sin(t * 197 + 1.3) * Math.sin(t * 23);
      py += vib * Math.sin(t * 241 + 0.4);
      rz += press * 0.0016 * Math.sin(t * 173 + 2.1);
    }
    // reach: pulled back toward the camera and down when a wall is close
    const ur = 1 - reach;
    pz += 0.15 * ur;
    py += -0.05 * ur;
    px += -0.012 * ur;
    rx += 0.12 * ur;
    // menu: lower, toward the centre, label turned to the camera
    py += -0.042 * m;
    px += -0.03 * m;
    pz += 0.025 * m;
    rx += 0.2 * m;
    ry += -0.1 * m;
    // aim: small arm translation toward where the can points
    px += -0.05 * ay;
    py += 0.035 * ap;
    // equip: rise from below the screen with a slight overshoot
    const ue = 1 - eq.x;
    px += 0.04 * ue;
    py += -0.3 * ue;
    pz += 0.05 * ue;
    rx += -0.5 * ue;
    rz += -0.3 * ue;
    // tall screens: move toward the centre so the can stays in frame
    const narrow = 1 - sstep(0.62, 1.25, aspect);
    px += this.restNarrowDX * narrow;
    // ultrawide: keep the can out toward the right instead of drifting to the centre
    px += Math.min(0.045, Math.max(0, (aspect - 1.78) * 0.06));

    // ── compose ──
    const rig = this.rig;
    rig.position.set(this.restPivot.x + px, this.restPivot.y + py, this.restPivot.z + pz);
    // aim rotation: shortest arc from the rest spray direction to the smoothed target
    const cy = this.restYaw + ay, cp = this.restPitch + ap;
    this._dir.set(-Math.sin(cy) * Math.cos(cp), Math.sin(cp), -Math.cos(cy) * Math.cos(cp));
    const qa = this._q.setFromUnitVectors(this.restDir, this._dir);
    this._e.set(rx, ry, rz, 'YXZ');
    rig.quaternion.setFromEuler(this._e).multiply(qa).multiply(this.restQ);
    // menu: turn the can about its own axis so the swatch faces the camera
    if (m > 1e-4) rig.quaternion.multiply(this._q2.setFromAxisAngle(_Y, 0.42 * m));

    // ── index finger: actuator press, cap switch blend, lift while shaking/menu ──
    this.capBlend = Math.min(1, this.capBlend + dt / 0.18);
    const cb = sstep(0, 1, this.capBlend);
    const sa = this.indexSol[this.prevCap], sb = this.indexSol[this.capType];
    const W = this.indexWrap;
    const fj = this.fingers.index;
    const pr = clamp(press, 0, 1.1);
    const mixSol = (k) => {
      const a = lerp(lerp(sa[0].flex[k], sa[1].flex[k], pr), lerp(sb[0].flex[k], sb[1].flex[k], pr), cb);
      return lerp(a, W.flex[k], lift);
    };
    const abd = lerp(lerp(sa[0].abd, sb[0].abd, cb), W.abd, lift);
    this.jointQ(fj.joints[0].quaternion, fj.base, abd, mixSol(0));
    this.jointQ(fj.joints[1].quaternion, null, 0, mixSol(1));
    this.jointQ(fj.joints[2].quaternion, null, 0, mixSol(2));
    this.actuator.position.y = CAN.seat - CAN.travel * clamp(press, 0, 1) * (1 - lift);

    // ── forearm: from the elbow anchor (moves with the arm) to the wrist ──
    rig.updateMatrix();
    this.hand.updateMatrix();
    const wrist = this._v.set(0, 0, 0).applyMatrix4(this.hand.matrix).applyMatrix4(rig.matrix);
    const elbow = this.elbow.copy(this.restElbow);
    elbow.x += px * 0.75 + 0.02 * A;
    elbow.y += py * 0.6 - 0.06 * ue;
    elbow.z += pz * 0.7;
    const Yf = this._v2.subVectors(wrist, elbow).normalize();
    // dorsal reference from the hand, orthogonalised against the forearm axis
    const Zf = this._v3.set(0, 0, 1).applyQuaternion(this._q2.copy(rig.quaternion).multiply(this.hand.quaternion));
    Zf.addScaledVector(Yf, -Zf.dot(Yf)).normalize();
    const Xf = this._dir.crossVectors(Yf, Zf);
    this._m.makeBasis(Xf, Yf, Zf);
    this.forearm.quaternion.setFromRotationMatrix(this._m);
    this.forearm.position.copy(wrist);

    // ── visibility ──
    const hidden = !equipped && eq.x < 0.02 && Math.abs(eq.v) < 0.2;
    this._hidden = hidden;
    this.group.visible = !hidden;
  }
}
