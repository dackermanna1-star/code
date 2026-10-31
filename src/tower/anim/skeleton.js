// LAST LOOKOUT — the ragdoll's skeleton as the animation code sees it: segment order, parents,
// joint landmarks of the bind pose, leg geometry, and allocation-free forward kinematics.
// A pose is root-relative: one world rotation per segment (bind rotations are identity, so a
// segment's rotation is simply its orientation) plus the pelvis body position. Plain math, no THREE.
import { landmark, buildSegmentList } from '../../human/anatomy.js';

let SK = null;

/**
 * Static skeleton description (identical for every ragdoll: same anatomy). `rd` is any Ragdoll; its
 * segment bind positions (body centres of mass) are read from it once. Live segment bind positions
 * (they change when a long bone fractures) are passed to fk() separately.
 */
export function skeleton(rd) {
  if (SK) return SK;
  const defs = buildSegmentList();
  const names = rd ? rd.segList.map((s) => s.name) : defs.map((d) => d.name);
  const n = names.length;
  const index = {};
  names.forEach((nm, i) => (index[nm] = i));
  const parent = new Int8Array(n).fill(-1);
  const joint = new Array(n).fill(null);
  const J = new Float64Array(n * 3); // proximal joint landmark (pelvis: its centre of mass)
  const bind = new Float64Array(n * 3); // body centre of mass in the bind pose
  for (let i = 0; i < n; i++) {
    const def = defs.find((d) => d.name === names[i]);
    const seg = rd ? rd.segList[i] : null;
    if (seg) bind.set([seg.bindPos.x, seg.bindPos.y, seg.bindPos.z], i * 3);
    if (def.parent) {
      parent[i] = index[def.parent];
      joint[i] = def.joint;
      const L = landmark(def.joint);
      J.set([L.x, L.y, L.z], i * 3);
    }
  }
  const p = index.pelvis;
  J.set([bind[p * 3], bind[p * 3 + 1], bind[p * 3 + 2]], p * 3);
  // mirror map (L <-> R) for mirrored playback
  const mirror = new Int8Array(n);
  for (let i = 0; i < n; i++) {
    const nm = names[i];
    const m = nm.endsWith('L') ? nm.slice(0, -1) + 'R' : nm.endsWith('R') ? nm.slice(0, -1) + 'L' : nm;
    mirror[i] = index[m];
  }
  const legs = {};
  for (const s of ['L', 'R']) {
    const hip = landmark('hip' + s), knee = landmark('knee' + s), ankle = landmark('ankle' + s);
    const thighDir = [knee.x - hip.x, knee.y - hip.y, knee.z - hip.z].map((v) => v / hip.distanceTo(knee));
    const shinDir = [ankle.x - knee.x, ankle.y - knee.y, ankle.z - knee.z].map((v) => v / knee.distanceTo(ankle));
    // knee flexion axis in the bind pose: thigh x backward (+X for both legs)
    const kl = Math.hypot(thighDir[1], thighDir[0]);
    const kAxis = [-thighDir[1] / kl, thighDir[0] / kl, 0];
    legs[s] = {
      thigh: index['thigh' + s], shin: index['shin' + s], foot: index['foot' + s],
      L1: hip.distanceTo(knee), L2: knee.distanceTo(ankle),
      thighDir, shinDir, kAxis,
      thighBindInv: bindBasisInv(thighDir, kAxis),
      shinBindInv: bindBasisInv(shinDir, kAxis),
      ankle: [ankle.x, ankle.y, ankle.z],
      // bind angle between the shin (ankle -> knee) and the foot's forward axis (+Z)
      ankleAngle: Math.acos(-shinDir[2]),
    };
  }
  // sole of the foot box (bind, world): the four bottom corners of the rounded box
  // (anatomy: centre [±0.105, 0.03, 0.05], half [0.042, 0.02, 0.112], rounding 0.01)
  for (const s of ['L', 'R']) {
    const sx = s === 'L' ? 1 : -1;
    const c = [0.105 * sx, 0.0, 0.05];
    legs[s].sole = [
      [c[0] - 0.045, 0.0, -0.065], [c[0] + 0.045, 0.0, -0.065],
      [c[0] - 0.045, 0.0, 0.168], [c[0] + 0.045, 0.0, 0.168],
    ];
  }
  SK = { n, names, index, parent, joint, J, bind, mirror, legs };
  return SK;
}

/**
 * Forward kinematics. rot: Float64Array(n*4) segment rotations (x,y,z,w), pelvis: [x,y,z] pelvis body
 * position, bindPos: Float64Array(n*3) live segment centres of mass (bind). Writes jointOut (n*3, world
 * position of each segment's proximal joint) and posOut (n*3, body positions). Allocation free.
 */
export function fk(sk, rot, px, py, pz, bindPos, jointOut, posOut) {
  const n = sk.n, par = sk.parent, J = sk.J;
  for (let i = 0; i < n; i++) {
    const i3 = i * 3, i4 = i * 4;
    let jx, jy, jz;
    const p = par[i];
    if (p < 0) {
      jx = px; jy = py; jz = pz;
    } else {
      // joint = parent's joint + R_parent * (J_i - J_parent)
      const p3 = p * 3, p4 = p * 4;
      const vx = J[i3] - J[p3], vy = J[i3 + 1] - J[p3 + 1], vz = J[i3 + 2] - J[p3 + 2];
      const qx = rot[p4], qy = rot[p4 + 1], qz = rot[p4 + 2], qw = rot[p4 + 3];
      const tx = 2 * (qy * vz - qz * vy), ty = 2 * (qz * vx - qx * vz), tz = 2 * (qx * vy - qy * vx);
      jx = jointOut[p3] + vx + qw * tx + (qy * tz - qz * ty);
      jy = jointOut[p3 + 1] + vy + qw * ty + (qz * tx - qx * tz);
      jz = jointOut[p3 + 2] + vz + qw * tz + (qx * ty - qy * tx);
    }
    jointOut[i3] = jx;
    jointOut[i3 + 1] = jy;
    jointOut[i3 + 2] = jz;
    // body = joint + R_i * (bindPos_i - J_i)
    const vx = bindPos[i3] - J[i3], vy = bindPos[i3 + 1] - J[i3 + 1], vz = bindPos[i3 + 2] - J[i3 + 2];
    const qx = rot[i4], qy = rot[i4 + 1], qz = rot[i4 + 2], qw = rot[i4 + 3];
    const tx = 2 * (qy * vz - qz * vy), ty = 2 * (qz * vx - qx * vz), tz = 2 * (qx * vy - qy * vx);
    posOut[i3] = jx + vx + qw * tx + (qy * tz - qz * ty);
    posOut[i3 + 1] = jy + vy + qw * ty + (qz * tx - qx * tz);
    posOut[i3 + 2] = jz + vz + qw * tz + (qx * ty - qy * tx);
  }
}

/**
 * Quaternion (x,y,z,w) of the orthonormal basis with Y = dir and Z = axis (orthogonalised), X = Y x Z.
 * Writes out[o..o+3].
 */
export function basisYZ(dx, dy, dz, ax, ay, az, out, o = 0) {
  const k = ax * dx + ay * dy + az * dz;
  let zx = ax - dx * k, zy = ay - dy * k, zz = az - dz * k;
  const zl = Math.sqrt(zx * zx + zy * zy + zz * zz) || 1;
  zx /= zl;
  zy /= zl;
  zz /= zl;
  const xx = dy * zz - dz * zy, xy = dz * zx - dx * zz, xz = dx * zy - dy * zx;
  // columns X, Y=d, Z -> quaternion
  const tr = xx + dy + zz;
  let x, y, z, w;
  if (tr > 0) {
    const s = 0.5 / Math.sqrt(tr + 1);
    w = 0.25 / s; x = (dz - zy) * s; y = (zx - xz) * s; z = (xy - dx) * s;
  } else if (xx > dy && xx > zz) {
    const s = 2 * Math.sqrt(1 + xx - dy - zz);
    w = (dz - zy) / s; x = 0.25 * s; y = (dx + xy) / s; z = (zx + xz) / s;
  } else if (dy > zz) {
    const s = 2 * Math.sqrt(1 + dy - xx - zz);
    w = (zx - xz) / s; x = (dx + xy) / s; y = 0.25 * s; z = (zy + dz) / s;
  } else {
    const s = 2 * Math.sqrt(1 + zz - xx - dy);
    w = (xy - dx) / s; x = (zx + xz) / s; y = (zy + dz) / s; z = 0.25 * s;
  }
  const l = Math.sqrt(x * x + y * y + z * z + w * w) || 1;
  out[o] = x / l;
  out[o + 1] = y / l;
  out[o + 2] = z / l;
  out[o + 3] = w / l;
  return out;
}

function bindBasisInv(dir, axis) {
  const q = basisYZ(dir[0], dir[1], dir[2], axis[0], axis[1], axis[2], [0, 0, 0, 1]);
  return [-q[0], -q[1], -q[2], q[3]];
}

/** Rotate vector (vx,vy,vz) by quaternion at q[o..o+3]; writes out[k..k+2]. */
export function rotAt(q, o, vx, vy, vz, out, k) {
  const qx = q[o], qy = q[o + 1], qz = q[o + 2], qw = q[o + 3];
  const tx = 2 * (qy * vz - qz * vy), ty = 2 * (qz * vx - qx * vz), tz = 2 * (qx * vy - qy * vx);
  out[k] = vx + qw * tx + (qy * tz - qz * ty);
  out[k + 1] = vy + qw * ty + (qz * tx - qx * tz);
  out[k + 2] = vz + qw * tz + (qx * ty - qy * tx);
  return out;
}

/** Rotate vector (vx,vy,vz) by the inverse of quaternion q[o..o+3]; writes out[k..k+2]. */
export function rotInvAt(q, o, vx, vy, vz, out, k) {
  const qx = -q[o], qy = -q[o + 1], qz = -q[o + 2], qw = q[o + 3];
  const tx = 2 * (qy * vz - qz * vy), ty = 2 * (qz * vx - qx * vz), tz = 2 * (qx * vy - qy * vx);
  out[k] = vx + qw * tx + (qy * tz - qz * ty);
  out[k + 1] = vy + qw * ty + (qz * tx - qx * tz);
  out[k + 2] = vz + qw * tz + (qx * ty - qy * tx);
  return out;
}
