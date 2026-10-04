import { describe, it, expect, afterEach } from 'vitest';
import * as THREE from 'three';
import '../src/world/blocks/blocks';
import { World } from '../src/world/world';
import { Chunk } from '../src/world/chunk';
import { S } from '../src/world/blocks/registry';
import { Player } from '../src/entity/player';
import { COLLISION_HOLES, AABB, moveBox } from '../src/physics/aabb';
import { PortalFrame, placePortal, portalFits, portalTransform, shotRaycast, crossesPortal, PORTAL_HH, PORTAL_HW, TUNNEL_DEPTH } from '../src/game/portal/portalMath';
import { transitBody } from '../src/game/portal/portalTransit';

/** A stone floor at y=63 (top 64) with two parallel walls: x = 10..11 and x = -11..-10, z -8..8, y 64..69. */
function room() {
  const w = new World('overworld', 1);
  w.lightEnabled = false;
  for (let cx = -2; cx <= 1; cx++)
    for (let cz = -2; cz <= 1; cz++) {
      const c = new Chunk(cx, cz);
      for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) for (let y = 0; y < 64; y++) c.set(x, y, z, S('stone'));
      c.status = 'ready';
      w.addChunk(c);
    }
  for (let z = -8; z <= 8; z++)
    for (let y = 64; y < 70; y++) {
      w.setBlock(10, y, z, S('stone'), 0);
      w.setBlock(-11, y, z, S('stone'), 0);
    }
  return w;
}

const shoot = (w: World, o: THREE.Vector3, d: THREE.Vector3) => shotRaycast(w, o, d.clone().normalize(), 100)!;

afterEach(() => {
  COLLISION_HOLES.holes = [];
  COLLISION_HOLES.world = null;
});

describe('portal placement', () => {
  it('opens on a wall, centred on the shot, settled onto the floor', () => {
    const w = room();
    const hit = shoot(w, new THREE.Vector3(0, 65.6, 0.3), new THREE.Vector3(1, 0.05, 0));
    expect(hit.x).toBe(10);
    const f = placePortal(w, hit, new THREE.Vector3(1, 0, 0), null)!;
    expect(f).not.toBeNull();
    expect(f.n.toArray()).toEqual([-1, 0, 0]);
    expect(f.up.toArray()).toEqual([0, 1, 0]);
    expect(f.c.x).toBe(10);
    // bottom edge on the floor (y = 64) so it can be walked into
    expect(f.c.y - PORTAL_HH).toBeCloseTo(64, 5);
    expect(Math.abs(f.c.z - 0.3)).toBeLessThan(0.07);
    expect(portalFits(w, f)).toBe(true);
  });

  it('nudges away from the wall edge and refuses unportalable surfaces', () => {
    const w = room();
    // near the end of the wall (z = 8.9 is the last cell's edge)
    const hit = shoot(w, new THREE.Vector3(0, 65.5, 8.7), new THREE.Vector3(1, 0, 0));
    const f = placePortal(w, hit, new THREE.Vector3(1, 0, 0), null)!;
    expect(f).not.toBeNull();
    expect(f.c.z + PORTAL_HW).toBeLessThanOrEqual(9 + 1e-9);
    // glass wall: fizzles
    for (let z = -2; z <= 2; z++) for (let y = 64; y < 68; y++) w.setBlock(10, y, z, S('glass'), 0);
    const g = shoot(w, new THREE.Vector3(0, 65.5, 0), new THREE.Vector3(1, 0, 0));
    expect(placePortal(w, g, new THREE.Vector3(1, 0, 0), null)?.c.z ?? 99).not.toBeCloseTo(0, 1);
  });

  it('floor portals face up with their top along the shot and do not overlap the other portal', () => {
    const w = room();
    const hit = shoot(w, new THREE.Vector3(0, 65.6, 0), new THREE.Vector3(0.3, -1, 0.05));
    const a = placePortal(w, hit, new THREE.Vector3(1, 0, 0), null)!;
    expect(a.n.toArray()).toEqual([0, 1, 0]);
    expect(a.up.toArray()).toEqual([1, 0, 0]);
    // right on top of the first one: fizzles; a couple of metres away: fits beside it
    expect(placePortal(w, hit, new THREE.Vector3(1, 0, 0), a)).toBeNull();
    const hit2 = shoot(w, new THREE.Vector3(0, 65.6, 0), new THREE.Vector3(0.3, -1, 1.1));
    const b = placePortal(w, hit2, new THREE.Vector3(1, 0, 0), a)!;
    expect(b).not.toBeNull();
    const dx = Math.abs(a.c.x - b.c.x), dz = Math.abs(a.c.z - b.c.z);
    expect(dx >= PORTAL_HH * 2 - 1e-6 || dz >= PORTAL_HW * 2 - 1e-6).toBe(true);
  });
});

describe('portal transforms', () => {
  it('maps the entry opening onto the exit, turning in through the front into out through the front', () => {
    const a = new PortalFrame(new THREE.Vector3(10, 65.12, 0), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 1, 0));
    const b = new PortalFrame(new THREE.Vector3(-10, 65.12, 3), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0));
    const m = portalTransform(a, b);
    // the centre maps to the centre
    expect(a.c.clone().applyMatrix4(m).distanceTo(b.c)).toBeLessThan(1e-9);
    // a point just behind A comes out just in front of B
    const p = new THREE.Vector3(10.05, 65.5, 0.2).applyMatrix4(m);
    expect(b.side(p)).toBeCloseTo(0.05, 6);
    // walking into A (+x) means walking out of B (+x)
    const q = new THREE.Quaternion().setFromRotationMatrix(m);
    const v = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
    expect(v.x).toBeCloseTo(1, 6);
    // your right (+z when walking +x) stays your right on the way out
    const right = new THREE.Vector3(10, 65.12, 0.4).applyMatrix4(m);
    expect(right.z).toBeCloseTo(3 + 0.4, 6);
  });

  it('crossesPortal only through the opening, front to back', () => {
    const a = new PortalFrame(new THREE.Vector3(10, 65.12, 0), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 1, 0));
    expect(crossesPortal(a, new THREE.Vector3(9.9, 65.6, 0), new THREE.Vector3(10.1, 65.6, 0))).toBe(true);
    expect(crossesPortal(a, new THREE.Vector3(10.1, 65.6, 0), new THREE.Vector3(9.9, 65.6, 0))).toBe(false);
    expect(crossesPortal(a, new THREE.Vector3(9.9, 65.6, 1.2), new THREE.Vector3(10.1, 65.6, 1.2))).toBe(false);
  });

  it('floor → wall: momentum turns from down into out of the wall, view stays upright', () => {
    const floor = new PortalFrame(new THREE.Vector3(0, 64, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0));
    const wall = new PortalFrame(new THREE.Vector3(-10, 65.12, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0));
    const body = {
      pos: new THREE.Vector3(0, 64 - 1.65, 0), prevPos: new THREE.Vector3(0, 64 - 1.55, 0), vel: new THREE.Vector3(0, -15, 0),
      yaw: -Math.PI / 2, pitch: -1.2, prevYaw: 0, prevPitch: 0, width: 0.6, height: 1.8, onGround: false, fallDistance: 9, airDragScale: 1, updateBox() {},
    };
    const r = transitBody(body, 1.62, floor, wall, 0);
    expect(body.vel.x).toBeCloseTo(15, 4);
    expect(Math.abs(body.vel.y)).toBeLessThan(1e-6);
    // facing +x while looking down → facing out of the wall (+x), looking ~level-ish, no roll
    expect(Math.abs(r.roll)).toBeLessThan(1e-6);
    expect(body.fallDistance).toBe(0);
    expect(body.airDragScale).toBeLessThan(0.1);
    // the box was slid up into the opening (feet at or above its bottom edge)
    expect(body.pos.y).toBeGreaterThanOrEqual(wall.c.y - PORTAL_HH - 1e-6);
    expect(r.shift.y).toBeGreaterThan(0);
  });
});

describe('walking through', () => {
  it('the wall behind a linked portal stops colliding only inside the opening', () => {
    const w = room();
    const a = new PortalFrame(new THREE.Vector3(10, 64 + PORTAL_HH, 0), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 1, 0));
    COLLISION_HOLES.world = w;
    COLLISION_HOLES.holes = [a.tunnel()];
    // a player box centred on the opening walks 0.8 m into the wall
    const box = AABB.fromCenter(9.6, 64, 0, 0.6, 1.8);
    const r = moveBox(w, box, 0.8, 0, 0);
    expect(r.collidedX).toBe(false);
    expect(box.maxX).toBeCloseTo(10.7, 6);
    // beside the opening it is still a wall
    const box2 = AABB.fromCenter(9.6, 64, 3, 0.6, 1.8);
    const r2 = moveBox(w, box2, 0.8, 0, 0);
    expect(r2.collidedX).toBe(true);
    expect(box2.maxX).toBeCloseTo(10, 6);
    expect(a.tunnel().maxX - a.tunnel().minX).toBeCloseTo(TUNNEL_DEPTH, 6);
  });

  it('a player walking into portal A comes out of portal B, moving on, without touching the walls', () => {
    const w = room();
    const a = new PortalFrame(new THREE.Vector3(10, 64 + PORTAL_HH, 0), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 1, 0));
    const b = new PortalFrame(new THREE.Vector3(-10, 64 + PORTAL_HH, 2), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0));
    COLLISION_HOLES.world = w;
    COLLISION_HOLES.holes = [a.tunnel(), b.tunnel()];
    const p = new Player();
    p.init({ world: w, events: { emit() {} } } as any, w);
    p.setPos(7, 64, 0.1);
    p.yaw = -Math.PI / 2; // facing +x
    p.intent.forward = 1;
    let crossed = 0;
    let minSide = Infinity;
    for (let i = 0; i < 240; i++) {
      p.physicsStep(1 / 60);
      const e0 = new THREE.Vector3(p.prevPos.x, p.prevPos.y + 1.62, p.prevPos.z);
      const e1 = new THREE.Vector3(p.pos.x, p.pos.y + 1.62, p.pos.z);
      for (const [x, y] of [[a, b], [b, a]] as const) {
        if (crossesPortal(x, e0, e1)) {
          transitBody(p as any, 1.62, x, y, 0);
          crossed++;
          break;
        }
      }
      // the eye is never behind a portal's wall
      minSide = Math.min(minSide, crossed ? b.side(p.eyePos) : a.side(p.eyePos));
      if (crossed && p.pos.x > -8) break;
    }
    expect(crossed).toBe(1);
    expect(p.pos.x).toBeGreaterThan(-8);
    expect(Math.abs(p.pos.z - 2.1)).toBeLessThan(0.25);
    expect(p.vel.x).toBeGreaterThan(2);
    expect(minSide).toBeGreaterThanOrEqual(-1e-9);
    expect(Math.cos(p.yaw + Math.PI / 2)).toBeCloseTo(1, 4); // still facing +x
  });
});
