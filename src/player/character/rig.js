// The walker's skeleton in its bind pose (metres, standing in her boots, facing
// -z, her right toward +x). Every bone has an identity rotation in the bind pose,
// so a bone's local position is its joint minus its parent's joint, and posing is
// a matter of rotations. Arms hang in a slight A-pose (ARM_A from vertical).
import { sin, cos, PI } from './sdf.js';

export const ARM_A = (32 * PI) / 180;
const CA = cos(ARM_A), SA = sin(ARM_A);

export const J = {
  hips: [0, 0.93, 0.005],
  spine1: [0, 1.045, 0.01],
  spine2: [0, 1.19, 0.005],
  neck: [0, 1.405, 0.012],
  head: [0, 1.505, 0.0],
  shoulder: [0.162, 1.358, 0.012], // right; mirrored for the left
  clav: [0.03, 1.36, 0.0],
  hip: [0.085, 0.905, 0.0],
  knee: [0.077, 0.515, 0.012],
  ankle: [0.071, 0.118, 0.028],
};
export const ARM = { upper: 0.28, fore: 0.24, palm: 0.088 };

/** Right-arm frame (shoulder at the origin, arm down -Y, palm toward -X, front -Z) to bind-pose world, side -1 left / +1 right. */
export function armToWorld(p, s) {
  const x = CA * p[0] - SA * p[1], y = SA * p[0] + CA * p[1];
  return [s * (J.shoulder[0] + x), J.shoulder[1] + y, J.shoulder[2] + p[2]];
}
/** Bind-pose world point to the right-arm frame of side s (the left side is mirrored onto the right). */
export function worldToArm(x, y, z, s) {
  const ax = s * x - J.shoulder[0], ay = y - J.shoulder[1], az = z - J.shoulder[2];
  return [CA * ax + SA * ay, -SA * ax + CA * ay, az];
}
/** Bind-pose world point to head-local (origin at the head joint). */
export const toHead = (x, y, z) => [x - J.head[0], y - J.head[1], z - J.head[2]];

// fingers in the arm frame: knuckle (MCP) z, segment lengths, relaxed curl (rad) at MCP and PIP
export const FINGERS = [
  { name: 'i', z: -0.026, len: [0.043, 0.046], r: 0.0088, curl: [0.18, 0.32] },
  { name: 'm', z: -0.009, len: [0.047, 0.05], r: 0.0092, curl: [0.2, 0.34] },
  { name: 'r', z: 0.008, len: [0.044, 0.047], r: 0.0086, curl: [0.22, 0.36] },
  { name: 'p', z: 0.023, len: [0.034, 0.037], r: 0.0074, curl: [0.26, 0.4] },
];
export const KNUCKLE_Y = -(ARM.upper + ARM.fore + ARM.palm);
export const WRIST_Y = -(ARM.upper + ARM.fore);
export const THUMB = { cmc: [-0.012, WRIST_Y - 0.026, -0.027], dir0: [-0.33, -0.6, -0.72], len: [0.045, 0.05], r: 0.0105 };

/** Finger joints in the arm frame: [mcp, pip, tip] for finger f. */
export function fingerJoints(f) {
  const c0 = f.curl[0], c1 = f.curl[0] + f.curl[1];
  const mcp = [-0.002, KNUCKLE_Y, f.z];
  const pip = [mcp[0] - sin(c0) * f.len[0], mcp[1] - cos(c0) * f.len[0], f.z];
  const tip = [pip[0] - sin(c1) * f.len[1], pip[1] - cos(c1) * f.len[1], f.z];
  return [mcp, pip, tip];
}
export function thumbJoints() {
  const d = THUMB.dir0, l = Math.hypot(d[0], d[1], d[2]);
  const u = [d[0] / l, d[1] / l, d[2] / l];
  const a = THUMB.cmc;
  const b = [a[0] + u[0] * THUMB.len[0], a[1] + u[1] * THUMB.len[0], a[2] + u[2] * THUMB.len[0]];
  // the tip segment bends a little further toward the palm
  const v = [u[0] - 0.25, u[1] + 0.1, u[2] + 0.15];
  const lv = Math.hypot(v[0], v[1], v[2]);
  const c = [b[0] + (v[0] / lv) * THUMB.len[1], b[1] + (v[1] / lv) * THUMB.len[1], b[2] + (v[2] / lv) * THUMB.len[1]];
  return [a, b, c];
}

// ponytail chain hanging down her back (bind pose, world)
export const PONY = [
  [0, 1.662, 0.09],
  [0, 1.626, 0.135],
  [0, 1.55, 0.158],
  [0, 1.465, 0.164],
  [0, 1.38, 0.158],
  [0, 1.3, 0.148],
  [0, 1.235, 0.14],
];

/** Every bone: [name, parent, bind position (world)]. */
export function boneList() {
  const B = [];
  const add = (name, parent, p) => B.push([name, parent, p]);
  add('root', null, [0, 0, 0]);
  add('hips', 'root', J.hips);
  add('spine1', 'hips', J.spine1);
  add('spine2', 'spine1', J.spine2);
  add('neck', 'spine2', J.neck);
  add('head', 'neck', J.head);
  add('eyeL', 'head', [-0.031, 1.59, -0.069]);
  add('eyeR', 'head', [0.031, 1.59, -0.069]);
  add('lidL', 'head', [-0.031, 1.59, -0.069]);
  add('lidR', 'head', [0.031, 1.59, -0.069]);
  for (let i = 0; i < PONY.length - 1; i++) add(`pony${i}`, i === 0 ? 'head' : `pony${i - 1}`, PONY[i]);
  for (const [S, s] of [['L', -1], ['R', 1]]) {
    add(`clav${S}`, 'spine2', [s * J.clav[0], J.clav[1], J.clav[2]]);
    add(`arm${S}`, `clav${S}`, armToWorld([0, 0, 0], s));
    add(`fore${S}`, `arm${S}`, armToWorld([0, -ARM.upper, 0], s));
    add(`hand${S}`, `fore${S}`, armToWorld([0, WRIST_Y, 0], s));
    for (const f of FINGERS) {
      const [mcp, pip] = fingerJoints(f);
      add(`${f.name}0${S}`, `hand${S}`, armToWorld(mcp, s));
      add(`${f.name}1${S}`, `${f.name}0${S}`, armToWorld(pip, s));
    }
    const [cmc, ip] = thumbJoints();
    add(`t0${S}`, `hand${S}`, armToWorld(cmc, s));
    add(`t1${S}`, `t0${S}`, armToWorld(ip, s));
    add(`thigh${S}`, 'hips', [s * J.hip[0], J.hip[1], J.hip[2]]);
    add(`shin${S}`, `thigh${S}`, [s * J.knee[0], J.knee[1], J.knee[2]]);
    add(`foot${S}`, `shin${S}`, [s * J.ankle[0], J.ankle[1], J.ankle[2]]);
  }
  return B;
}
