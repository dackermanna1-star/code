// Body proportions and skeleton rest offsets (engine-free; shared by the rig and the IK).
import { BONES } from './poses.js';

export function rigDims(app) {
  const H = app.build.height, g = app.build.girth, m = app.build.muscle, f = app.female;
  const d = {
    H, g, m, f,
    footH: 0.075 * H, shin: 0.42 * H, thigh: 0.44 * H, spine: 0.19 * H, chest: 0.3 * H, neck: 0.085 * H,
    shoulderW: (f ? 0.162 : 0.182) * g * (1 + 0.05 * m), hipW: (f ? 0.092 : 0.084) * g,
    upperArm: 0.29 * H, foreArm: 0.255 * H, hand: 0.085 * H,
    head: app.headScale,
  };
  d.hipH = d.footH + d.shin + d.thigh;
  d.headR = [0.082 * d.head, 0.12 * d.head, 0.1 * d.head];
  const rest = {
    hips: [0, d.hipH, 0], spine: [0, 0.05 * H, 0], chest: [0, d.spine, 0], neck: [0, d.chest, 0], head: [0, d.neck, 0],
    armL: [-d.shoulderW, d.chest - 0.045 * H, -0.005], foreL: [0, -d.upperArm, 0], handL: [0, -d.foreArm, 0],
    armR: [d.shoulderW, d.chest - 0.045 * H, -0.005], foreR: [0, -d.upperArm, 0], handR: [0, -d.foreArm, 0],
    thighL: [-d.hipW, -0.03 * H, 0], shinL: [0, -d.thigh, 0], footL: [0, -d.shin, 0],
    thighR: [d.hipW, -0.03 * H, 0], shinR: [0, -d.thigh, 0], footR: [0, -d.shin, 0],
  };
  d.rest = BONES.map((n) => rest[n]);
  d.legLen = d.thigh + d.shin;
  d.armLen = d.upperArm + d.foreArm;
  return d;
}
