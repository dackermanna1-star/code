// Retargets a Quaternius source pose onto the ragdoll's 17 segments.
//
// The two skeletons have different rest poses (the source is a T-pose, the ragdoll stands with its
// arms hanging), different proportions and different joint sets, so the mapping is anatomical:
//  - trunk (pelvis, abdomen, chest, neck, head): both rests stand upright facing +Z, so each segment
//    takes its source bone's world rotation relative to that bone's rest;
//  - upper limbs and legs: each bone's DIRECTION (joint -> child joint) is matched, and the twist
//    about it comes from the hinge of the middle joint (elbow / knee) - the bend plane when the joint
//    is bent, the source bone frame's hinge axis when it is straight - so our elbows and knees stay
//    pure hinges while the limb points exactly where the source limb points;
//  - feet: ankle -> toe tip direction (our foot is one rigid box, so it follows the toes on the
//    ground) with the source foot's lateral axis;
//  - hands: an anatomical frame (hand direction, thumb side) mapped between the two rests.
// The pelvis (hip centre) position is scaled by the hip-height ratio; joints are then clamped into
// the ragdoll's limits by the caller.
import { SK, N, newPose, setQ, LM } from './target.mjs';
import { qmul, qconj, qrot, vsub, vadd, vscale, vdot, vcross, vlen, vnorm, basisYZ } from './rig.mjs';

const FWD = [0, 0, 1];
const I = SK.index;

/** boneRotation (see src/human/ik.js) on arrays: maps bind (dir0, axis0) onto (dir, axis). */
export function boneRot(dir0, axis0, dir, axis) {
  const qb = basisYZ(dir0, axis0); // Y = dir, Z = axis (orthogonalised)
  let a = vsub(axis, vscale(vnorm(dir), vdot(axis, vnorm(dir))));
  if (vlen(a) < 1e-8) a = Math.abs(dir[0]) < 0.9 ? vcross(dir, [1, 0, 0]) : vcross(dir, [0, 1, 0]);
  const qn = basisYZ(dir, a);
  return qmul(qn, qconj(qb));
}

const smooth = (a, b, x) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

export class Retargeter {
  constructor(rig) {
    this.rig = rig;
    const R = rig.restWorld;
    const P = (j) => rig.P(R, j), Q = (j) => rig.Q(R, j);
    // our bind geometry
    const hipC = vscale(vadd(LM('hipL'), LM('hipR')), 0.5);
    this.hipC0 = hipC;
    this.pelvisOff = vsub([SK.bind[0], SK.bind[1], SK.bind[2]], hipC); // pelvis COM - hip centre (bind)
    const srcHip = vscale(vadd(P('thighL'), P('thighR')), 0.5);
    this.scale = hipC[1] / srcHip[1];
    this.trunk = [['pelvis', 'pelvis'], ['abdomen', 'spine1'], ['chest', 'spine3'], ['neck', 'neck'], ['head', 'head']].map(([ours, src]) => ({ i: I[ours], src, restInv: qconj(Q(src)) }));
    this.arms = {};
    this.legs = {};
    for (const s of ['L', 'R']) {
      // --- arm: shoulder -> elbow -> wrist, elbow flexion axis = cross(upper, FWD) in both rests
      const u0 = vnorm(vsub(LM('elbow' + s), LM('shoulder' + s)));
      const f0 = vnorm(vsub(LM('wrist' + s), LM('elbow' + s)));
      const h0 = vnorm(vcross(u0, FWD));
      const uS = vnorm(vsub(P('lowerarm' + s), P('upperarm' + s)));
      const hS = vnorm(vcross(uS, FWD));
      const hingeLocal = qrot(qconj(Q('upperarm' + s)), hS);
      // hand frame: Y = hand direction, Z = toward the thumb
      const handDir0 = f0;
      const thumb0 = vsub(FWD, vscale(f0, vdot(FWD, f0)));
      const A0 = basisYZ(handDir0, thumb0);
      const handDirS = vnorm(vsub(P('middle' + s), P('hand' + s)));
      const thumbS = vsub(P('index' + s), P('pinky' + s));
      const AS = basisYZ(handDirS, thumbS);
      const Khand = qmul(qmul(qconj(Q('hand' + s)), AS), qconj(A0));
      this.arms[s] = { u0, f0, h0, hingeLocal, Khand, up: I['upperArm' + s], fo: I['forearm' + s], ha: I['hand' + s] };
      // --- leg: hip -> knee -> ankle, knee flexion axis = cross(thigh, -FWD)
      const t0 = vnorm(vsub(LM('knee' + s), LM('hip' + s)));
      const s0 = vnorm(vsub(LM('ankle' + s), LM('knee' + s)));
      const k0 = vnorm(vcross(t0, [0, 0, -1]));
      const tS = vnorm(vsub(P('calf' + s), P('thigh' + s)));
      const kS = vnorm(vcross(tS, [0, 0, -1]));
      const kneeLocal = qrot(qconj(Q('thigh' + s)), kS);
      // foot: ankle -> toe point, lateral axis +X
      const sx = s === 'L' ? 1 : -1;
      const ankle0 = LM('ankle' + s);
      const toe0 = [0.105 * sx, 0.015, 0.165];
      const d0 = vnorm(vsub(toe0, ankle0));
      const latLocal = qrot(qconj(Q('foot' + s)), [1, 0, 0]);
      this.legs[s] = { t0, s0, k0, kneeLocal, d0, latLocal, th: I['thigh' + s], sh: I['shin' + s], ft: I['foot' + s] };
    }
  }

  /** Source pose (SourceRig.pose) -> our pose (root-relative). Also returns the root position. */
  retarget(src, out = newPose()) {
    const rig = this.rig;
    const P = (j) => rig.P(src, j), Q = (j) => rig.Q(src, j);
    const root = P('root');
    for (const t of this.trunk) setQ(out, t.i, qmul(Q(t.src), t.restInv));
    for (const s of ['L', 'R']) {
      const a = this.arms[s];
      const sh = P('upperarm' + s), el = P('lowerarm' + s), wr = P('hand' + s);
      const u = vnorm(vsub(el, sh)), f = vnorm(vsub(wr, el));
      const hinge = this.hingeAxis(u, f, qrot(Q('upperarm' + s), a.hingeLocal));
      setQ(out, a.up, boneRot(a.u0, a.h0, u, hinge));
      setQ(out, a.fo, boneRot(a.f0, a.h0, f, hinge));
      setQ(out, a.ha, qmul(Q('hand' + s), a.Khand));
      const l = this.legs[s];
      const hp = P('thigh' + s), kn = P('calf' + s), an = P('foot' + s);
      const tdir = vnorm(vsub(kn, hp)), sdir = vnorm(vsub(an, kn));
      const kax = this.hingeAxis(tdir, sdir, qrot(Q('thigh' + s), l.kneeLocal));
      setQ(out, l.th, boneRot(l.t0, l.k0, tdir, kax));
      setQ(out, l.sh, boneRot(l.s0, l.k0, sdir, kax));
      const toe = rig.toe(src, s);
      setQ(out, l.ft, boneRot(l.d0, [1, 0, 0], vnorm(vsub(toe, an)), qrot(Q('foot' + s), l.latLocal)));
    }
    // pelvis body position from the (scaled) hip centre
    const hipC = vscale(vsub(vscale(vadd(P('thighL'), P('thighR')), 0.5), root), this.scale);
    const off = qrot(out.rot.subarray(0, 4), this.pelvisOff);
    out.pelvis = vadd(hipC, off);
    out.root = vscale(root, this.scale);
    return out;
  }

  /** Flexion axis of a two-bone chain: the bend plane when bent, the bone frame's hinge when straight. */
  hingeAxis(u, f, frameAxis) {
    const c = vcross(u, f);
    const s = vlen(c);
    const w = smooth(0.12, 0.35, s) * (vdot(c, frameAxis) > 0 ? 1 : 0);
    if (w <= 0) return frameAxis;
    const cb = vscale(c, 1 / s);
    return vnorm(vadd(vscale(frameAxis, 1 - w), vscale(cb, w)));
  }
}

export { N };
