import * as THREE from 'three';
import { B, PARENT as PARENT_, SkeletonDef } from './skeleton';
import { Pose } from './pose';
import { alignAxes, clamp, DEG, smoothstep } from '../core/math';

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
  /** Swinging foot: ignored by the automatic hip drop (the swing leg folds instead). */
  swing?: boolean;
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
    f.swing = g.swing;
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

/**
 * Per-character solver memory. The IK has a few singular configurations (a pole along the limb, a
 * hand reference along the fingers, a wrist twist of half a turn) where the pure geometric answer
 * flips from one frame to the next. With a state, those choices stay continuous: near a
 * singularity the previous answer wins, and the bend plane / hand roll can only turn so far per
 * solve, so a flip becomes a quick swing instead of a one-frame pop.
 */
export interface LimbState {
  bend: THREE.Vector3;
  back: THREE.Vector3;
  twist: number;
  valid: boolean;
  /** Last roll references of the two bones (kept continuous, see rollSteady). */
  up1: THREE.Vector3;
  up2: THREE.Vector3;
  upValid: boolean;
}
export class SolveState {
  arms: LimbState[] = [mkLimb(), mkLimb()];
  legs: LimbState[] = [mkLimb(), mkLimb()];
  hipDrop = 0;
  reset() {
    this.hipDrop = 0;
    for (const l of this.arms) l.valid = l.upValid = false;
    for (const l of this.legs) l.valid = l.upValid = false;
  }
}
function mkLimb(): LimbState {
  return { bend: new THREE.Vector3(), back: new THREE.Vector3(), twist: 0, valid: false, up1: new THREE.Vector3(), up2: new THREE.Vector3(), upValid: false };
}
/** Largest turn (rad) of a limb's bend plane or a hand's roll in one solve. */
const MAX_TURN = 0.42;
/** Largest roll (rad) of an upper / lower limb bone about its own length in one solve. */
const MAX_ROLL = 0.26;
const _pb = new THREE.Vector3();
const _cr = new THREE.Vector3();

/**
 * Keep unit vector `v` (perpendicular to unit `axis`) continuous with `prev`: prefer `prev` when the
 * fresh answer is ill-conditioned (`quality` near 0), and limit the turn about `axis`.
 */
function steady(v: THREE.Vector3, axis: THREE.Vector3, prev: THREE.Vector3, quality: number, maxTurn = MAX_TURN) {
  _pb.copy(prev).addScaledVector(axis, -prev.dot(axis));
  const pl = _pb.length();
  if (pl < 1e-6) return;
  _pb.multiplyScalar(1 / pl);
  const wPrev = 1 - smoothstep(0.12, 0.4, quality);
  if (wPrev > 0) {
    v.lerp(_pb, wPrev);
    if (v.lengthSq() < 1e-10) v.copy(_pb);
    v.normalize();
  }
  const ang = Math.acos(clamp(v.dot(_pb), -1, 1));
  if (ang > maxTurn) {
    const sg = _cr.crossVectors(_pb, v).dot(axis) >= 0 ? 1 : -1;
    v.copy(_pb).applyAxisAngle(axis, sg * maxTurn);
  }
}

/**
 * The bones' roll comes from the limb's hinge axis (limb axis x bend). Folded tight - a knee
 * chambered to the chest for a kick, a fist pulled back to the shoulder - the limb axis is short
 * and swings round with any small move of the hand or foot, and the hinge (so the roll of both
 * bones) with it: the thigh spun a third of a turn in one frame. Each bone's roll is kept
 * continuous instead: the previous one wins while the limb is folded, and it only turns so far
 * per solve.
 */
function rollSteady(st: LimbState | undefined, fold: number) {
  if (!st) return;
  if (st.upValid) {
    const q = smoothstep(0.1, 0.45, fold);
    steady(_up1, _dir1, st.up1, q, MAX_ROLL);
    steady(_up2, _dir2, st.up2, q, MAX_ROLL);
  }
  st.up1.copy(_up1);
  st.up2.copy(_up2);
  st.upValid = true;
}

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
  st?: LimbState,
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
  const pl = pole.length();
  const quality = pl > 1e-9 ? outBendDir.length() / pl : 0; // sine of the pole-axis angle
  if (outBendDir.lengthSq() < 1e-8) {
    if (st && st.valid) outBendDir.copy(st.bend).addScaledVector(_a, -st.bend.dot(_a));
    if (outBendDir.lengthSq() < 1e-8) outBendDir.set(0, 0, 1).addScaledVector(_a, -_a.z);
    if (outBendDir.lengthSq() < 1e-8) outBendDir.set(1, 0, 0);
  }
  outBendDir.normalize();
  if (st) {
    if (st.valid) steady(outBendDir, _a, st.bend, quality);
    st.bend.copy(outBendDir);
    st.valid = true;
  }
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  outMid.copy(root).addScaledVector(_a, a).addScaledVector(outBendDir, h);
  outEnd.copy(root).addScaledVector(_a, d);
}

const _up1 = new THREE.Vector3();
const _up2 = new THREE.Vector3();
const _hn = new THREE.Vector3();
/**
 * Roll references for the two bones of a limb, from the hinge axis (normal of the limb plane).
 * Projecting the bend direction onto each bone instead (the old way) passes through zero and flips
 * half a turn when the limb folds tight - a fist pulled to the chin, a knee driven up to the chest.
 */
function limbUps(root: THREE.Vector3, end: THREE.Vector3, bend: THREE.Vector3, dir1: THREE.Vector3, dir2: THREE.Vector3) {
  _hn.subVectors(end, root);
  if (_hn.lengthSq() < 1e-12) _hn.copy(dir1);
  _hn.normalize().cross(bend);
  if (_hn.lengthSq() < 1e-10) {
    _up1.copy(bend);
    _up2.copy(bend);
    return;
  }
  _hn.normalize();
  _up1.crossVectors(_hn, dir1);
  _up2.crossVectors(_hn, dir2);
}

/** Debug capture of the arm solve (animation probe). */
export const solverDebug: { on: boolean; arms: Record<string, number[]>[] } = { on: false, arms: [{}, {}] };

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
export function solvePose(def: SkeletonDef, prm: PoseParams, out: Pose, fkOut?: { pos: THREE.Vector3[]; rot: THREE.Quaternion[] } | null, state?: SolveState) {
  const off = def.offsets;
  // ---- hips & spine FK
  W[B.root].identity();
  P[B.root].set(0, 0, 0);
  P[B.hips].copy(prm.hipsPos);
  W[B.hips].copy(prm.hipsRot);

  // auto hip drop so legs can reach their targets. Only feet on (or near) the floor count, the
  // drop is continuous as a foot crosses the leg's reach (it used to switch off there), and with a
  // solver state it is eased so the hips never jump in one frame.
  if (prm.autoHipDrop) {
    let drop = 0;
    const L = (def.lenThigh + def.lenShin) * 0.985;
    for (let i = 0; i < 2; i++) {
      if (prm.feet[i].swing) continue;
      const th = i === 0 ? B.thighL : B.thighR;
      const hipJ = _b.copy(off[th]).applyQuaternion(W[B.hips]).add(P[B.hips]);
      const tgt = prm.feet[i].pos;
      const grounded = 1 - smoothstep(def.ankleHeight + 0.05 * def.scale, def.ankleHeight + 0.2 * def.scale, tgt.y);
      if (grounded <= 0) continue;
      const dx = tgt.x - hipJ.x, dz = tgt.z - hipJ.z, dy = tgt.y - hipJ.y;
      const h2 = L * L - dx * dx - dz * dz;
      // hip height at which this leg is exactly extended is tgt.y + sqrt(h2);
      // if the hip joint is above that, lower the hips by the difference (negative = lower)
      const need = (dy + Math.sqrt(Math.max(0, h2))) * grounded;
      if (need < drop) drop = need;
    }
    drop = Math.max(drop, -0.24 * def.scale);
    if (state) {
      const step = 0.022 * def.scale;
      drop = state.hipDrop + clamp(drop - state.hipDrop, -step, step);
      state.hipDrop = drop;
    }
    if (drop < 0) P[B.hips].y += drop;
  } else if (state) state.hipDrop = 0;

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
    const ast = state?.arms[side];
    twoBoneIK(P[ua], hp.pos, hp.pole, l1, l2, _mid, _end, _bend, ast);
    _dir1.subVectors(_mid, P[ua]).normalize();
    _dir2.subVectors(_end, _mid).normalize();
    limbUps(P[ua], _end, _bend, _dir1, _dir2);
    rollSteady(ast, _end.distanceTo(P[ua]) / (l1 + l2));
    alignAxes(def.restDir[ua], def.restUp[ua], _dir1, _up1, W[ua]);
    alignAxes(def.restDir[fa], def.restUp[fa], _dir2, _up2, W[fa]);
    if (solverDebug.on) solverDebug.arms[side] = { pos: hp.pos.toArray(), pole: hp.pole.toArray(), sh: P[ua].toArray(), bend: _bend.toArray(), dir1: _dir1.toArray(), dir2: _dir2.toArray(), ua: W[ua].toArray(), cl: W[cl].toArray() };
    P[fa].copy(_mid);
    P[ha].copy(_end);
    // hand orientation
    _fing.copy(_dir2);
    if (hp.dir && hp.dirW > 0) _fing.lerp(_tw.copy(hp.dir).normalize(), hp.dirW).normalize();
    // outward reference (chest x axis * side) projected perpendicular to fingers
    _out.set(sgn, 0, 0).applyQuaternion(W[B.chest]);
    _out.addScaledVector(_fing, -_out.dot(_fing));
    const outQ = _out.length(); // ill-conditioned when the fingers point along the shoulders
    if (_out.lengthSq() < 1e-6) {
      if (ast && ast.valid) _out.copy(ast.back).addScaledVector(_fing, -ast.back.dot(_fing));
      if (_out.lengthSq() < 1e-6) _out.set(0, 1, 0).addScaledVector(_fing, -_fing.y);
    }
    _out.normalize();
    if (ast) {
      if (ast.twist !== 0 || ast.back.lengthSq() > 0) steady(_out, _fing, ast.back, outQ);
      ast.back.copy(_out);
    }
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
      let ang = Math.atan2(_c.crossVectors(v1, v2).dot(ax), v1.dot(v2));
      if (ast) {
        // unwrap: a wrist turned half a turn must not flip which way the forearm shares the twist
        const prevT = ast.twist;
        while (ang - prevT > Math.PI) ang -= Math.PI * 2;
        while (ang - prevT < -Math.PI) ang += Math.PI * 2;
        ang = clamp(ang, -Math.PI * 1.3, Math.PI * 1.3);
        // and the forearm's share turns smoothly (a wrist swinging past half a turn, or the
        // clamp above, otherwise jumped the forearm's roll a whole radian in one frame)
        if (ast.valid && ast.twist !== 0) ang = prevT + clamp(ang - prevT, -2 * MAX_ROLL, 2 * MAX_ROLL);
        ast.twist = ang;
      }
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
    twoBoneIK(P[th], tgt, fp.pole, def.lenThigh, def.lenShin, _mid, _end, _bend, state?.legs[side]);
    _dir1.subVectors(_mid, P[th]).normalize();
    _dir2.subVectors(_end, _mid).normalize();
    limbUps(P[th], _end, _bend, _dir1, _dir2);
    rollSteady(state?.legs[side], _end.distanceTo(P[th]) / (def.lenThigh + def.lenShin));
    alignAxes(def.restDir[th], def.restUp[th], _dir1, _up1, W[th]);
    alignAxes(def.restDir[sh], def.restUp[sh], _dir2, _up2, W[sh]);
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

const _pivot: [number, number] = [0, 0];
/**
 * Ankle offset (up, along the foot) that keeps the foot's contact point fixed when the foot is
 * pitched by `pitchDeg`: the ball of the foot when the heel is raised, the heel when the toes are.
 */
export function pivotOffset(def: SkeletonDef, pitchDeg: number): [number, number] {
  const p = pitchDeg * DEG;
  let ty: number, tz: number;
  if (p >= 0) {
    ty = def.offsets[B.toeL].y;
    tz = def.offsets[B.toeL].z;
  } else {
    ty = -def.ankleHeight;
    tz = -0.035 * def.scale;
  }
  const c = Math.cos(p), sn = Math.sin(p);
  _pivot[0] = ty * (1 - c) + tz * sn;
  _pivot[1] = tz * (1 - c) - ty * sn;
  return _pivot;
}
