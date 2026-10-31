import * as THREE from 'three';
import { B, PARENT as PARENT_, SkeletonDef } from './skeleton';
import { Pose } from './pose';
import { alignAxes, clamp, DEG } from '../core/math';

export interface HandParams {
  pos: THREE.Vector3; // wrist target (root space)
  pole: THREE.Vector3; // elbow direction hint (root space, need not be normalized)
  roll: number; // degrees: 0 = thumb up, 90 = palm down
  /** Optional finger direction override (root space). */
  dir?: THREE.Vector3 | null;
  dirW: number; // weight of the finger dir override
}
export interface FootParams {
  pos: THREE.Vector3; // ankle target (root space)
  pole: THREE.Vector3; // knee direction hint (root space)
  rot: THREE.Quaternion; // foot orientation (root space)
  toe: number; // toe bend degrees (positive = toes bent up relative to foot)
}
export interface PoseParams {
  hipsPos: THREE.Vector3;
  hipsRot: THREE.Quaternion;
  spine: THREE.Quaternion;
  chest: THREE.Quaternion;
  neck: THREE.Quaternion;
  head: THREE.Quaternion;
  hands: [HandParams, HandParams]; // [L, R]
  feet: [FootParams, FootParams]; // [L, R]
  shrug: [number, number]; // extra clavicle raise (deg)
  autoHipDrop: boolean;
}

export function makeParams(): PoseParams {
  const hand = (): HandParams => ({ pos: new THREE.Vector3(), pole: new THREE.Vector3(0, -1, -0.3), roll: 0, dir: null, dirW: 0 });
  const foot = (): FootParams => ({ pos: new THREE.Vector3(), pole: new THREE.Vector3(0, 0, 1), rot: new THREE.Quaternion(), toe: 0 });
  return {
    hipsPos: new THREE.Vector3(),
    hipsRot: new THREE.Quaternion(),
    spine: new THREE.Quaternion(),
    chest: new THREE.Quaternion(),
    neck: new THREE.Quaternion(),
    head: new THREE.Quaternion(),
    hands: [hand(), hand()],
    feet: [foot(), foot()],
    shrug: [0, 0],
    autoHipDrop: true,
  };
}

export function copyParams(dst: PoseParams, src: PoseParams) {
  dst.hipsPos.copy(src.hipsPos);
  dst.hipsRot.copy(src.hipsRot);
  dst.spine.copy(src.spine);
  dst.chest.copy(src.chest);
  dst.neck.copy(src.neck);
  dst.head.copy(src.head);
  for (let i = 0; i < 2; i++) {
    const a = dst.hands[i], b = src.hands[i];
    a.pos.copy(b.pos);
    a.pole.copy(b.pole);
    a.roll = b.roll;
    a.dirW = b.dirW;
    if (b.dir) a.dir = (a.dir ?? new THREE.Vector3()).copy(b.dir);
    else a.dir = null;
    const f = dst.feet[i], g = src.feet[i];
    f.pos.copy(g.pos);
    f.pole.copy(g.pole);
    f.rot.copy(g.rot);
    f.toe = g.toe;
  }
  dst.shrug[0] = src.shrug[0];
  dst.shrug[1] = src.shrug[1];
  dst.autoHipDrop = src.autoHipDrop;
}

/** Blend params a->b by t into out (positions lerp, rotations slerp). */
export function blendParams(out: PoseParams, a: PoseParams, b: PoseParams, t: number) {
  out.hipsPos.lerpVectors(a.hipsPos, b.hipsPos, t);
  out.hipsRot.slerpQuaternions(a.hipsRot, b.hipsRot, t);
  out.spine.slerpQuaternions(a.spine, b.spine, t);
  out.chest.slerpQuaternions(a.chest, b.chest, t);
  out.neck.slerpQuaternions(a.neck, b.neck, t);
  out.head.slerpQuaternions(a.head, b.head, t);
  for (let i = 0; i < 2; i++) {
    const o = out.hands[i], x = a.hands[i], y = b.hands[i];
    o.pos.lerpVectors(x.pos, y.pos, t);
    o.pole.lerpVectors(x.pole, y.pole, t);
    o.roll = x.roll + (y.roll - x.roll) * t;
    o.dirW = x.dirW + (y.dirW - x.dirW) * t;
    if (x.dir || y.dir) {
      o.dir = o.dir ?? new THREE.Vector3();
      if (x.dir && y.dir) o.dir.lerpVectors(x.dir, y.dir, t);
      else o.dir.copy((x.dir ?? y.dir)!);
    } else o.dir = null;
    const f = out.feet[i], g = a.feet[i], h = b.feet[i];
    f.pos.lerpVectors(g.pos, h.pos, t);
    f.pole.lerpVectors(g.pole, h.pole, t);
    f.rot.slerpQuaternions(g.rot, h.rot, t);
    f.toe = g.toe + (h.toe - g.toe) * t;
  }
  out.shrug[0] = a.shrug[0] + (b.shrug[0] - a.shrug[0]) * t;
  out.shrug[1] = a.shrug[1] + (b.shrug[1] - a.shrug[1]) * t;
}

// ---------------------------------------------------------------- solver
const W: THREE.Quaternion[] = Array.from({ length: 22 }, () => new THREE.Quaternion());
const P: THREE.Vector3[] = Array.from({ length: 22 }, () => new THREE.Vector3());
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();
const _e = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _inv = new THREE.Quaternion();
const _xAxis = new THREE.Vector3(1, 0, 0);

/** Two-bone IK. Returns elbow/knee position in `outMid`, effective end in `outEnd`. */
export function twoBoneIK(
  root: THREE.Vector3,
  target: THREE.Vector3,
  pole: THREE.Vector3,
  l1: number,
  l2: number,
  outMid: THREE.Vector3,
  outEnd: THREE.Vector3,
  outBendDir: THREE.Vector3,
) {
  _a.subVectors(target, root);
  let d = _a.length();
  const maxD = (l1 + l2) * 0.9995;
  const minD = Math.abs(l1 - l2) + 1e-3;
  if (d < 1e-6) {
    _a.set(0, -1, 0);
    d = minD;
  }
  _a.multiplyScalar(1 / d);
  d = clamp(d, minD, maxD);
  // bend direction = pole projected perpendicular to axis
  outBendDir.copy(pole).addScaledVector(_a, -pole.dot(_a));
  if (outBendDir.lengthSq() < 1e-8) {
    outBendDir.set(0, 0, 1).addScaledVector(_a, -_a.z);
    if (outBendDir.lengthSq() < 1e-8) outBendDir.set(1, 0, 0);
  }
  outBendDir.normalize();
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  outMid.copy(root).addScaledVector(_a, a).addScaledVector(outBendDir, h);
  outEnd.copy(root).addScaledVector(_a, d);
}

const _mid = new THREE.Vector3();
const _end = new THREE.Vector3();
const _bend = new THREE.Vector3();
const _dir1 = new THREE.Vector3();
const _dir2 = new THREE.Vector3();
const _fing = new THREE.Vector3();
const _back = new THREE.Vector3();
const _out = new THREE.Vector3();
const _tw = new THREE.Vector3();

/**
 * Solve full-body pose from effector-level params. Writes joint-space `out`.
 * Optional `fkOut` receives root-space positions of all joints.
 */
export function solvePose(def: SkeletonDef, prm: PoseParams, out: Pose, fkOut?: { pos: THREE.Vector3[]; rot: THREE.Quaternion[] }) {
  const off = def.offsets;
  // ---- hips & spine FK
  W[B.root].identity();
  P[B.root].set(0, 0, 0);
  P[B.hips].copy(prm.hipsPos);
  W[B.hips].copy(prm.hipsRot);

  // auto hip drop so legs can reach their targets
  if (prm.autoHipDrop) {
    let drop = 0;
    for (let i = 0; i < 2; i++) {
      const th = i === 0 ? B.thighL : B.thighR;
      const hipJ = _b.copy(off[th]).applyQuaternion(W[B.hips]).add(P[B.hips]);
      const tgt = prm.feet[i].pos;
      const L = (def.lenThigh + def.lenShin) * 0.985;
      const dx = tgt.x - hipJ.x, dz = tgt.z - hipJ.z, dy = tgt.y - hipJ.y;
      const h2 = L * L - dx * dx - dz * dz;
      if (h2 > 0) {
        const need = -Math.sqrt(h2) - dy; // negative => lower hips
        if (need < drop) drop = need;
      }
    }
    if (drop < 0) P[B.hips].y += Math.max(drop, -0.35 * def.scale);
  }

  const chain = [B.spine, B.chest, B.neck, B.head];
  const locals = [prm.spine, prm.chest, prm.neck, prm.head];
  for (let k = 0; k < 4; k++) {
    const i = chain[k];
    const p = k === 0 ? B.hips : chain[k - 1];
    P[i].copy(off[i]).applyQuaternion(W[p]).add(P[p]);
    W[i].copy(W[p]).multiply(locals[k]);
  }

  // ---- arms
  for (let side = 0; side < 2; side++) {
    const cl = side === 0 ? B.clavL : B.clavR;
    const ua = side === 0 ? B.uarmL : B.uarmR;
    const fa = side === 0 ? B.farmL : B.farmR;
    const ha = side === 0 ? B.handL : B.handR;
    const sgn = side === 0 ? 1 : -1;
    const hp = prm.hands[side];
    P[cl].copy(off[cl]).applyQuaternion(W[B.chest]).add(P[B.chest]);
    // auto clavicle: rotate towards target when reaching far/up
    const restShoulder = _c.copy(off[ua]).applyQuaternion(W[B.chest]).add(P[cl]);
    const toT = _d.subVectors(hp.pos, restShoulder);
    const reach = toT.length() / (def.lenUpperArm + def.lenForeArm);
    // chest-local direction to target
    _inv.copy(W[B.chest]).invert();
    _e.copy(toT).applyQuaternion(_inv).normalize();
    const fwd = clamp(_e.z, -1, 1);
    const up = clamp(_e.y, -1, 1);
    const k = clamp((reach - 0.55) * 1.6, 0, 1);
    const raise = (clamp(up, 0, 1) * 18 * (0.4 + k) + prm.shrug[side]) * DEG;
    const prot = clamp(fwd, -0.3, 1) * 16 * k * DEG;
    // local clavicle rotation: raise = rotate around chest forward (Z) so shoulder goes up; protraction = around Y
    _q.setFromAxisAngle(_tw.set(0, 0, 1), sgn * raise);
    _q2.setFromAxisAngle(_tw.set(0, 1, 0), -sgn * prot);
    const clavLocal = _q2.multiply(_q);
    W[cl].copy(W[B.chest]).multiply(clavLocal);
    P[ua].copy(off[ua]).applyQuaternion(W[cl]).add(P[cl]);
    // IK
    const l1 = def.lenUpperArm, l2 = def.lenForeArm;
    twoBoneIK(P[ua], hp.pos, hp.pole, l1, l2, _mid, _end, _bend);
    _dir1.subVectors(_mid, P[ua]).normalize();
    _dir2.subVectors(_end, _mid).normalize();
    alignAxes(def.restDir[ua], def.restUp[ua], _dir1, _bend, W[ua]);
    alignAxes(def.restDir[fa], def.restUp[fa], _dir2, _bend, W[fa]);
    P[fa].copy(_mid);
    P[ha].copy(_end);
    // hand orientation
    _fing.copy(_dir2);
    if (hp.dir && hp.dirW > 0) _fing.lerp(_tw.copy(hp.dir).normalize(), hp.dirW).normalize();
    // outward reference (chest x axis * side) projected perpendicular to fingers
    _out.set(sgn, 0, 0).applyQuaternion(W[B.chest]);
    _out.addScaledVector(_fing, -_out.dot(_fing));
    if (_out.lengthSq() < 1e-6) _out.set(0, 1, 0).addScaledVector(_fing, -_fing.y);
    _out.normalize();
    _q.setFromAxisAngle(_fing, sgn * hp.roll * DEG);
    _back.copy(_out).applyQuaternion(_q);
    alignAxes(def.restDir[ha], def.restUp[ha], _fing, _back, W[ha]);
    // distribute twist to forearm (half)
    {
      const restBackFromFa = _tw.copy(def.restUp[ha]).applyQuaternion(_q.copy(W[fa]));
      // signed angle around forearm axis between restBackFromFa and _back
      const ax = _dir2;
      const v1 = restBackFromFa.addScaledVector(ax, -restBackFromFa.dot(ax)).normalize();
      const v2 = _e.copy(_back).addScaledVector(ax, -_back.dot(ax)).normalize();
      const ang = Math.atan2(_c.crossVectors(v1, v2).dot(ax), v1.dot(v2));
      _q.setFromAxisAngle(ax, ang * 0.5);
      W[fa].premultiply(_q);
    }
  }

  // ---- legs
  for (let side = 0; side < 2; side++) {
    const th = side === 0 ? B.thighL : B.thighR;
    const sh = side === 0 ? B.shinL : B.shinR;
    const ft = side === 0 ? B.footL : B.footR;
    const to = side === 0 ? B.toeL : B.toeR;
    const fp = prm.feet[side];
    P[th].copy(off[th]).applyQuaternion(W[B.hips]).add(P[B.hips]);
    const tgt = _c.copy(fp.pos);
    if (tgt.y < def.ankleHeight * 0.8) tgt.y = def.ankleHeight * 0.8;
    twoBoneIK(P[th], tgt, fp.pole, def.lenThigh, def.lenShin, _mid, _end, _bend);
    _dir1.subVectors(_mid, P[th]).normalize();
    _dir2.subVectors(_end, _mid).normalize();
    alignAxes(def.restDir[th], def.restUp[th], _dir1, _bend, W[th]);
    alignAxes(def.restDir[sh], def.restUp[sh], _dir2, _bend, W[sh]);
    P[sh].copy(_mid);
    P[ft].copy(_end);
    W[ft].copy(fp.rot);
    _q.setFromAxisAngle(_xAxis, -fp.toe * DEG);
    W[to].copy(W[ft]).multiply(_q);
    P[to].copy(off[to]).applyQuaternion(W[ft]).add(P[ft]);
  }

  // ---- to local
  out.hips.copy(P[B.hips]);
  out.q[B.root].identity();
  out.q[B.hips].copy(W[B.hips]);
  for (let i = 2; i < 22; i++) {
    const p = PARENT_[i];
    _inv.copy(W[p]).invert();
    out.q[i].copy(_inv).multiply(W[i]);
  }
  if (fkOut) {
    for (let i = 0; i < 22; i++) {
      fkOut.pos[i].copy(P[i]);
      fkOut.rot[i].copy(W[i]);
    }
  }
  return out;
}
