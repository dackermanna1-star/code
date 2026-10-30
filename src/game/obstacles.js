import { Vec3, Quat } from '../physics/math.js';
import { Body } from '../physics/body.js';
import { Shape } from '../physics/shapes.js';

/**
 * Fixed obstacle props for the walking tests. Every part is a static collision shape in the prop's
 * frame (y up from the floor, z = the prop's "forward"); boxes are given by size (full extents)
 * and the position of their centre. Contacts with them behave like contacts with the floor, so
 * feet can stand on top of them and bodies can lie across them.
 *
 *   curb    - 12 cm kerb: stepped over or onto
 *   log     - 22 cm round log: stepped over (its top is not a place to stand)
 *   step    - 18 cm platform: stepped up onto and down off
 *   crate   - 70 cm crate: too tall to step over, walked around
 *   plank   - 5 cm board: a trip hazard when not stepped over
 */
export const OBSTACLES = {
  curb: { label: 'Curb', note: '12 cm kerb', material: 'concrete', friction: 0.9, parts: [{ box: [2.0, 0.12, 0.22], at: [0, 0.06, 0] }] },
  log: { label: 'Log', note: '22 cm log', material: 'wood', friction: 0.7, parts: [{ cyl: 0.11, len: 2.0, at: [0, 0.11, 0] }] },
  plank: { label: 'Plank', note: '5 cm board', material: 'wood', friction: 0.75, parts: [{ box: [2.0, 0.05, 0.25], at: [0, 0.025, 0] }] },
  step: { label: 'Step', note: '18 cm platform', material: 'concrete', friction: 0.9, parts: [{ box: [2.0, 0.18, 1.2], at: [0, 0.09, 0] }] },
  crate: { label: 'Crate', note: '70 cm crate', material: 'wood', friction: 0.7, parts: [{ box: [0.7, 0.7, 0.7], at: [0, 0.35, 0] }] },
};

export const OBSTACLE_KEYS = Object.keys(OBSTACLES);

/** Static body for an obstacle at floor point `pos` turned by `yaw` about the vertical. */
export function createObstacleBody(type, pos, yaw = 0) {
  const def = OBSTACLES[type];
  if (!def) throw new Error(`unknown obstacle ${type}`);
  const body = new Body({ name: 'obstacle:' + type, isStatic: true });
  for (const p of def.parts) {
    const opts = { friction: def.friction, restitution: 0.05, material: def.material };
    let s;
    if (p.cyl) {
      // lying along the prop's x axis
      s = Shape.capsule(p.cyl, p.len / 2 - p.cyl, opts);
      s.localRot.setFromAxisAngle(new Vec3(0, 0, 1), Math.PI / 2);
    } else {
      const r = 0.004;
      s = Shape.box(p.box[0] / 2 - r, p.box[1] / 2 - r, p.box[2] / 2 - r, { ...opts, radius: r });
    }
    s.localPos.set(p.at[0], p.at[1], p.at[2]);
    s.tag = type;
    body.addShape(s);
  }
  body.makeStatic();
  body.setPose(new Vec3(pos.x, pos.y ?? 0, pos.z), new Quat().setFromAxisAngle(new Vec3(0, 1, 0), yaw));
  body.userData = { obstacle: true, type, def };
  return body;
}

/** Horizontal footprint radius of an obstacle (for spacing props and spawn spots). */
export function obstacleRadius(type) {
  let r = 0;
  for (const p of OBSTACLES[type].parts) {
    const hx = p.cyl ? p.len / 2 : p.box[0] / 2, hz = p.cyl ? p.cyl : p.box[2] / 2;
    r = Math.max(r, Math.hypot(Math.abs(p.at[0]) + hx, Math.abs(p.at[2]) + hz));
  }
  return r;
}
