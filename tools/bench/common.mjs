// Shared helpers for the headless benchmarks (node tools/bench/<name>.mjs).
import { Vec3, makeRng } from '../../src/physics/math.js';
import { World } from '../../src/physics/world.js';
import { Ragdoll } from '../../src/human/ragdoll.js';
import { BodyShape } from '../../src/human/bodyShape.js';
import { Sandbox } from '../../src/game/sandbox.js';

let shapeCache = null;
/** BodyShape (skin SDF) needed for ballistics; cheap to build, cached. */
export function bodyShape() {
  if (!shapeCache) shapeCache = new BodyShape(new Ragdoll(new World()).segList.map((s) => s.name));
  return shapeCache;
}

/** A sandbox with one dummy at the origin facing +Z, settled for `settle` seconds. */
export function scene(seed = 1, { shape = false, settle = 1 } = {}) {
  const sb = new Sandbox({ shape: shape ? bodyShape() : null, rng: makeRng(seed) });
  const person = sb.spawnPerson(new Vec3(0, 0, 0), 0);
  run(sb, settle);
  return { sb, person };
}

/** Advance `seconds` of simulation; optional per-frame callback (frame index, time). */
export function run(sb, seconds, cb) {
  const n = Math.round(seconds * 60);
  for (let i = 0; i < n; i++) {
    sb.step(1 / 60);
    sb.drainFx();
    if (cb && cb(i, i / 60) === false) return i / 60;
  }
  return seconds;
}

export function finite(person) {
  return person.rd.allBodies().every((b) => b.pos.isFinite() && b.vel.isFinite() && b.rot.isFinite());
}

/** Aim a weapon from `from` (offset relative to the target) at a world point. */
export function fireAt(sb, weapon, target, from) {
  const o = new Vec3(target.x + from[0], target.y + from[1], target.z + from[2]);
  return sb.fire(weapon, o, target.clone().sub(o).normalize());
}

export function segPos(person, seg) {
  return person.rd.segments[seg].body.pos.clone();
}

export function report(name, result) {
  console.log(`RESULT ${name} ${JSON.stringify(result)}`);
}

export { Vec3, makeRng };
