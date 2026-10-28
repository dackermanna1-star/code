import { Vec3, Quat } from '../physics/math.js';
import { Body } from '../physics/body.js';
import { Shape } from '../physics/shapes.js';

/**
 * Throwable props with real masses, sizes and surface properties. Colliders match the meshes in
 * render/objectMeshes.js (origin = centre of mass). `drag` is Cd*A for quadratic air drag;
 * `breakSpeed` makes an object shatter/burst when it hits something faster than that.
 */
export const THROWABLES = {
  baseball: {
    label: 'Baseball', mass: 0.145, speed: 32, spin: [0, 0, -30], material: 'baseball',
    friction: 0.5, restitution: 0.55, drag: 0.35 * 0.00437,
    shapes: [{ type: 'sphere', r: 0.0373 }],
  },
  brick: {
    label: 'Brick', mass: 2.3, speed: 15, spin: [6, 2, 0], material: 'brick',
    friction: 0.8, restitution: 0.08, drag: 1.0 * 0.007,
    shapes: [{ type: 'box', half: [0.1075, 0.0325, 0.05125], r: 0.003 }],
  },
  bowlingBall: {
    label: 'Bowling ball', mass: 6.4, speed: 11, spin: [0, 0, 0], material: 'bowling',
    friction: 0.25, restitution: 0.2, drag: 0.47 * 0.0373,
    shapes: [{ type: 'sphere', r: 0.109 }],
  },
  bottle: {
    label: 'Glass bottle', mass: 0.6, speed: 17, spin: [9, 0, 2], material: 'glass',
    friction: 0.4, restitution: 0.25, drag: 0.8 * 0.004, breakSpeed: 5.5,
    shapes: [{ type: 'capsule', r: 0.032, hh: 0.085 }],
  },
  crate: {
    label: 'Wooden crate', mass: 9, speed: 9, spin: [2, 3, 1], material: 'wood',
    friction: 0.6, restitution: 0.12, drag: 1.05 * 0.2,
    shapes: [{ type: 'box', half: [0.215, 0.215, 0.215], r: 0.01 }],
  },
  pipe: {
    label: 'Steel pipe', mass: 2.8, speed: 15, spin: [10, 0, 0], material: 'metal',
    friction: 0.35, restitution: 0.3, drag: 1.0 * 0.048,
    shapes: [{ type: 'capsule', r: 0.024, hh: 0.5 }],
  },
  dumbbell: {
    label: 'Dumbbell (10 kg)', mass: 10, speed: 8, spin: [0, 4, 3], material: 'metal',
    friction: 0.4, restitution: 0.15, drag: 1.0 * 0.03,
    shapes: [
      { type: 'capsule', r: 0.017, hh: 0.13, axis: 'x' },
      { type: 'box', half: [0.016, 0.064, 0.064], r: 0.026, pos: [0.15, 0, 0], density: 6 },
      { type: 'box', half: [0.016, 0.064, 0.064], r: 0.026, pos: [-0.15, 0, 0], density: 6 },
    ],
  },
  watermelon: {
    label: 'Watermelon', mass: 5, speed: 11, spin: [3, 1, 0], material: 'melon',
    friction: 0.6, restitution: 0.12, drag: 0.5 * 0.053, breakSpeed: 7.5,
    shapes: [{ type: 'sphere', r: 0.13 }],
  },
  soccerBall: {
    label: 'Football', mass: 0.43, speed: 24, spin: [0, 6, 0], material: 'rubber',
    friction: 0.6, restitution: 0.72, drag: 0.25 * 0.038,
    shapes: [{ type: 'sphere', r: 0.11 }],
  },
};

export const OBJECT_GROUP = 4;

export function createThrowableBody(type) {
  const def = THROWABLES[type];
  if (!def) throw new Error(`unknown throwable ${type}`);
  const body = new Body({ name: type, linearDamping: 0.0, angularDamping: 0.05 });
  body.collisionGroup = OBJECT_GROUP;
  for (const sd of def.shapes) {
    const opts = { friction: def.friction, restitution: def.restitution, material: def.material };
    let s;
    if (sd.type === 'sphere') s = Shape.sphere(sd.r, opts);
    else if (sd.type === 'capsule') {
      s = Shape.capsule(sd.r, sd.hh, opts);
      if (sd.axis === 'x') s.localRot.setFromAxisAngle(new Vec3(0, 0, 1), Math.PI / 2);
    } else s = Shape.box(sd.half[0], sd.half[1], sd.half[2], { ...opts, radius: sd.r });
    if (sd.pos) s.localPos.set(sd.pos[0], sd.pos[1], sd.pos[2]);
    if (sd.density) s.densityScale = sd.density;
    s.tag = type;
    body.addShape(s);
  }
  body.setMassFromShapes(def.mass);
  body.userData = { throwable: true, type, def };
  return body;
}

/** Quadratic air drag, F = -1/2 rho CdA |v| v (applied as a force for the next step). */
export function applyDrag(body, def) {
  const v = body.vel;
  const sp = v.length();
  if (sp < 0.5) return;
  const k = 0.5 * 1.2 * def.drag * sp;
  body.force.addScaled(v, -k);
}

/** Launch a body from `origin` along `dir` (unit) at `speed`, with the type's natural spin. */
export function launch(body, origin, dir, speed, spinScale = 1, rng = Math.random) {
  const def = body.userData.def;
  const right = new Vec3().crossVectors(dir, new Vec3(0, 1, 0));
  if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
  right.normalize();
  const up = new Vec3().crossVectors(right, dir).normalize();
  // long objects leave the hand upright and tumble end over end; the rest start randomly oriented
  const q = new Quat();
  if (body.userData.type === 'pipe' || body.userData.type === 'bottle') q.setFromUnitVectors(new Vec3(0, 1, 0), up);
  else q.setFromEuler(rng() * 6.28, rng() * 6.28, rng() * 6.28, 'XYZ');
  body.setPose(origin, q);
  body.vel.copy(dir).scale(speed);
  // spin about axes of the throw frame (x = right, y = up, z = forward)
  const sp = def.spin;
  body.angVel.set(0, 0, 0).addScaled(right, sp[0] * spinScale).addScaled(up, sp[1] * spinScale).addScaled(dir, sp[2] * spinScale);
  body.angVel.x += (rng() - 0.5) * 2 * spinScale;
  body.angVel.z += (rng() - 0.5) * 2 * spinScale;
}
