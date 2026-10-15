// Character body (Rapier KCC) integration tests: low steps that the stock autostep misses, walls, ramps.
import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { RAPIER, Layer, Mask, groups, type Physics } from '../src/core/Physics';
import { CharacterBody } from '../src/characters/movement/CharacterBody';
import { GRAVITY } from '../src/characters/constants';

let world: RAPIER.World;

function makePhysics(): Physics {
  world = new RAPIER.World({ x: 0, y: -GRAVITY, z: 0 });
  const p = { world, tag: () => {}, removeCollider: (c: RAPIER.Collider) => world.removeCollider(c, false) };
  return p as unknown as Physics;
}

function addBox(cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, rotX = 0): void {
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), rotX);
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(hx, hy, hz)
      .setTranslation(cx, cy, cz)
      .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
      .setCollisionGroups(groups(Layer.Static, Mask.All)),
  );
}

/** Walk toward -Z at `speed` for `seconds` with the same grounded rules as GroundMotor. */
function walk(body: CharacterBody, feet: THREE.Vector3, speed: number, seconds: number): { maxY: number } {
  world.step();
  const dt = 1 / 60;
  let grounded = true;
  let vy = 0;
  let maxY = feet.y;
  const d = new THREE.Vector3();
  for (let i = 0; i < seconds * 60; i++) {
    vy -= GRAVITY * dt;
    d.set(0, grounded ? 0 : vy * dt, -speed * dt);
    const res = body.move(feet, d, { autostep: grounded, snap: grounded, withCharacters: false, stepUp: grounded });
    grounded = res.grounded;
    if (grounded) vy = 0;
    maxY = Math.max(maxY, feet.y);
  }
  return { maxY };
}

describe('CharacterBody step-up', () => {
  beforeAll(async () => {
    await RAPIER.init();
  });

  for (const rise of [0.18, 0.25, 0.35, 0.44]) {
    it(`climbs ${rise} m stairs at run speed`, () => {
      const physics = makePhysics();
      addBox(0, -0.5, 0, 20, 0.5, 20);
      const run = 0.3;
      for (let i = 0; i < 6; i++) {
        const h = (i + 1) * rise;
        addBox(0, h / 2, -2 - i * run, 1.25, h / 2, run / 2);
      }
      const top = 6 * rise;
      // 4 m landing; the walk (1.4 s) ends on it
      addBox(0, top / 2, -2 - 6 * run - 2 + run / 2, 1.25, top / 2, 2);
      const feet = new THREE.Vector3(0, 0.02, 0);
      const body = new CharacterBody(physics, null, feet);
      const { maxY } = walk(body, feet, 4.7, 1.4);
      expect(maxY).toBeLessThan(top + 0.1);
      expect(feet.y).toBeGreaterThan(top - 0.05);
      expect(feet.y).toBeLessThan(top + 0.1);
      expect(feet.z).toBeLessThan(-2 - 6 * run);
    });
  }

  it('does not step onto a 0.6 m ledge (vault height) and stops at the wall', () => {
    const physics = makePhysics();
    addBox(0, -0.5, 0, 20, 0.5, 20);
    addBox(0, 0.3, -2.5, 2, 0.3, 0.5);
    const feet = new THREE.Vector3(0, 0.02, 0);
    const body = new CharacterBody(physics, null, feet);
    const { maxY } = walk(body, feet, 4.7, 1.5);
    expect(maxY).toBeLessThan(0.1);
    expect(feet.z).toBeGreaterThan(-2 + 0.3);
  });

  it('does not step up into a gap without headroom', () => {
    const physics = makePhysics();
    addBox(0, -0.5, 0, 20, 0.5, 20);
    // 0.3 m step with a ceiling 1.9 m above the floor over it: the standing capsule (1.8 m) cannot rise 0.3 m.
    addBox(0, 0.15, -3, 2, 0.15, 1);
    addBox(0, 1.9 + 0.1, -3, 2, 0.1, 1);
    const feet = new THREE.Vector3(0, 0.02, 0);
    const body = new CharacterBody(physics, null, feet);
    const { maxY } = walk(body, feet, 4.7, 1.5);
    expect(maxY).toBeLessThan(0.1);
  });
  it('walks down 0.25 m stairs staying grounded (snap)', () => {
    const physics = makePhysics();
    addBox(0, -0.5, 0, 20, 0.5, 20);
    const rise = 0.25, run = 0.3;
    // Stairs descending toward -Z from a 1.5 m platform.
    addBox(0, 0.75, 1.5, 1.25, 0.75, 1.5);
    for (let i = 0; i < 5; i++) {
      const h = 1.5 - (i + 1) * rise;
      addBox(0, h / 2, -i * run - run / 2, 1.25, h / 2, run / 2);
    }
    const feet = new THREE.Vector3(0, 1.52, 2.5);
    const body = new CharacterBody(physics, null, feet);
    world.step();
    const dt = 1 / 60;
    let airTicks = 0;
    let grounded = true;
    for (let i = 0; i < 70; i++) {
      const res = body.move(feet, new THREE.Vector3(0, 0, -4.7 * dt), { autostep: true, snap: true, withCharacters: false, stepUp: true });
      if (!res.grounded) airTicks++;
      grounded = res.grounded;
    }
    expect(feet.y).toBeLessThan(0.1);
    expect(grounded).toBe(true);
    expect(airTicks).toBeLessThan(4);
  });
});
