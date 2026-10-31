// Source rig access for the retargeter: canonical joint names for both Quaternius skeletons
// (UAL1's Rigify "DEF-" bones and UAL2's UE-mannequin bones share one rest pose), forward kinematics
// over the glTF node tree, and pose sampling.
import { sampleTrack } from './glb.mjs';

// canonical joint -> [UAL2 name, UAL1 name]
const NAMES = {
  root: ['root', 'root'],
  pelvis: ['pelvis', 'DEF-hips'],
  spine1: ['spine_01', 'DEF-spine.001'],
  spine2: ['spine_02', 'DEF-spine.002'],
  spine3: ['spine_03', 'DEF-spine.003'],
  neck: ['neck_01', 'DEF-neck'],
  head: ['Head', 'DEF-head'],
};
for (const [s, u1] of [['l', 'L'], ['r', 'R']]) {
  const S = s.toUpperCase();
  Object.assign(NAMES, {
    ['clav' + S]: ['clavicle_' + s, 'DEF-shoulder.' + u1],
    ['upperarm' + S]: ['upperarm_' + s, 'DEF-upper_arm.' + u1],
    ['lowerarm' + S]: ['lowerarm_' + s, 'DEF-forearm.' + u1],
    ['hand' + S]: ['hand_' + s, 'DEF-hand.' + u1],
    ['index' + S]: ['index_01_' + s, 'DEF-f_index.01.' + u1],
    ['middle' + S]: ['middle_01_' + s, 'DEF-f_middle.01.' + u1],
    ['ring' + S]: ['ring_01_' + s, 'DEF-f_ring.01.' + u1],
    ['pinky' + S]: ['pinky_01_' + s, 'DEF-f_pinky.01.' + u1],
    ['thumb' + S]: ['thumb_01_' + s, 'DEF-thumb.01.' + u1],
    ['thigh' + S]: ['thigh_' + s, 'DEF-thigh.' + u1],
    ['calf' + S]: ['calf_' + s, 'DEF-shin.' + u1],
    ['foot' + S]: ['foot_' + s, 'DEF-foot.' + u1],
    ['ball' + S]: ['ball_' + s, 'DEF-toe.' + u1],
  });
}
export const JOINTS = Object.keys(NAMES);

// --- tiny quaternion / vector helpers on plain arrays (x, y, z, w) ---
export const qmul = (a, b, o = [0, 0, 0, 1]) => {
  const ax = a[0], ay = a[1], az = a[2], aw = a[3], bx = b[0], by = b[1], bz = b[2], bw = b[3];
  o[0] = aw * bx + ax * bw + ay * bz - az * by;
  o[1] = aw * by - ax * bz + ay * bw + az * bx;
  o[2] = aw * bz + ax * by - ay * bx + az * bw;
  o[3] = aw * bw - ax * bx - ay * by - az * bz;
  return o;
};
export const qconj = (a) => [-a[0], -a[1], -a[2], a[3]];
export const qrot = (q, v, o = [0, 0, 0]) => {
  const x = v[0], y = v[1], z = v[2], qx = q[0], qy = q[1], qz = q[2], qw = q[3];
  const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
  o[0] = x + qw * tx + (qy * tz - qz * ty);
  o[1] = y + qw * ty + (qz * tx - qx * tz);
  o[2] = z + qw * tz + (qx * ty - qy * tx);
  return o;
};
export const qnorm = (q) => {
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  q[0] /= l; q[1] /= l; q[2] /= l; q[3] /= l;
  return q;
};
export const vsub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const vadd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const vscale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const vdot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const vcross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const vlen = (a) => Math.hypot(a[0], a[1], a[2]);
export const vnorm = (a) => vscale(a, 1 / (vlen(a) || 1));
/** Rotation (quaternion) whose columns are the orthonormal basis built from primary y and hint z. */
export function basisYZ(y, zHint) {
  const Y = vnorm(y);
  const Z = vnorm(vsub(zHint, vscale(Y, vdot(zHint, Y))));
  const X = vcross(Y, Z);
  return quatFromBasis(X, Y, Z);
}
export function quatFromBasis(X, Y, Z) {
  const m11 = X[0], m12 = Y[0], m13 = Z[0], m21 = X[1], m22 = Y[1], m23 = Z[1], m31 = X[2], m32 = Y[2], m33 = Z[2];
  const tr = m11 + m22 + m33;
  let x, y, z, w;
  if (tr > 0) {
    const s = 0.5 / Math.sqrt(tr + 1);
    w = 0.25 / s; x = (m32 - m23) * s; y = (m13 - m31) * s; z = (m21 - m12) * s;
  } else if (m11 > m22 && m11 > m33) {
    const s = 2 * Math.sqrt(1 + m11 - m22 - m33);
    w = (m32 - m23) / s; x = 0.25 * s; y = (m12 + m21) / s; z = (m13 + m31) / s;
  } else if (m22 > m33) {
    const s = 2 * Math.sqrt(1 + m22 - m11 - m33);
    w = (m13 - m31) / s; x = (m12 + m21) / s; y = 0.25 * s; z = (m23 + m32) / s;
  } else {
    const s = 2 * Math.sqrt(1 + m33 - m11 - m22);
    w = (m21 - m12) / s; x = (m13 + m31) / s; y = (m23 + m32) / s; z = 0.25 * s;
  }
  return qnorm([x, y, z, w]);
}

/** A source rig (one glb) with canonical joint names. */
export class SourceRig {
  constructor(gltf) {
    this.g = gltf;
    this.idx = {};
    for (const j of JOINTS) {
      let i = gltf.nodeIndex(NAMES[j][0]);
      if (i < 0) i = gltf.nodeIndex(NAMES[j][1]);
      if (i < 0) throw new Error('missing joint ' + j);
      this.idx[j] = i;
    }
    // evaluation order: every node with its ancestors first
    const n = gltf.nodes.length;
    const order = [], seen = new Uint8Array(n);
    const visit = (i) => {
      if (seen[i]) return;
      if (gltf.parentOf[i] >= 0) visit(gltf.parentOf[i]);
      seen[i] = 1;
      order.push(i);
    };
    for (let i = 0; i < n; i++) visit(i);
    this.order = order;
    this.rest = gltf.nodes.map((_, i) => gltf.restLocal(i));
    this.restWorld = this.pose(null, 0);
  }

  /**
   * World transforms of every node: { p: [[x,y,z]...], q: [[x,y,z,w]...] } for animation `anim`
   * (from Gltf.animation) at time t, or the rest pose when anim is null.
   */
  pose(anim, t) {
    const g = this.g, n = g.nodes.length;
    const P = new Array(n), Q = new Array(n);
    const tmp = [0, 0, 0, 0];
    for (const i of this.order) {
      const r = this.rest[i];
      let lt = r.t, lr = r.r;
      const tr = anim && anim.tracks.get(i);
      if (tr) {
        if (tr.translation) lt = sampleTrack(tr.translation, t, [0, 0, 0]);
        if (tr.rotation) lr = qnorm(sampleTrack(tr.rotation, t, tmp).slice());
      }
      const pi = g.parentOf[i];
      if (pi < 0) {
        P[i] = lt.slice();
        Q[i] = lr.slice();
      } else {
        Q[i] = qnorm(qmul(Q[pi], lr));
        P[i] = vadd(P[pi], qrot(Q[pi], lt));
      }
    }
    return { p: P, q: Q };
  }

  /** Joint position / rotation by canonical name from a pose. */
  P(pose, j) {
    return pose.p[this.idx[j]];
  }

  Q(pose, j) {
    return pose.q[this.idx[j]];
  }

  /** Tip of the toe (end of the ball bone): ball + its local Y * 0.0789 (the UAL2 leaf offset). */
  toe(pose, side) {
    const i = this.idx['ball' + side];
    return vadd(pose.p[i], qrot(pose.q[i], [0, 0.0789, 0]));
  }

  /** Top of the head: head joint + local Y * 0.2 (approx crown). */
  crown(pose) {
    const i = this.idx.head;
    return vadd(pose.p[i], qrot(pose.q[i], [0, 0.2, 0]));
  }
}
