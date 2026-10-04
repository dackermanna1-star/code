import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Fleet, St, Cls, CLASSES, type Ship } from '../src/game/aliens/fleet';
import { Mothership, MOTHER_HP } from '../src/game/aliens/mothership';
import { fighterGeometry, destroyerGeometry, mothershipGeometry } from '../src/game/aliens/shipDesigns';

const fakeRenderer: any = {
  lightUniforms: { u_lightDir: { value: new THREE.Vector3(0, 1, 0) }, u_lightColor: { value: new THREE.Color() }, u_sh: { value: [] }, u_cameraPos: { value: new THREE.Vector3() } },
  atmosphere: null,
};

function makeFleet(scale = 1) {
  const crashes: { s: Ship; at: THREE.Vector3 }[] = [];
  const shots: THREE.Vector3[] = [];
  const fleet = new Fleet(fakeRenderer, new THREE.Vector3(0, 64, 0), {
    ground: () => 64,
    crash: (s, at) => crashes.push({ s, at }),
    fire: (_s, from) => shots.push(from),
    destroyed: () => {},
  }, scale);
  return { fleet, crashes, shots };
}

function run(fleet: Fleet, secs: number, dt = 1 / 20) {
  const cam = new THREE.Vector3();
  for (let t = 0; t < secs; t += dt) fleet.update(dt, cam);
}

describe('alien ship designs', () => {
  it('are built with colour and glow attributes at sensible sizes', () => {
    const f = fighterGeometry();
    f.computeBoundingBox();
    const fs = f.boundingBox!.getSize(new THREE.Vector3());
    expect(fs.z).toBeGreaterThan(12);
    expect(fs.z).toBeLessThan(20);
    expect(f.attributes.glow).toBeDefined();
    const d = destroyerGeometry();
    d.computeBoundingBox();
    expect(d.boundingBox!.getSize(new THREE.Vector3()).z).toBeGreaterThan(170);
    const m = mothershipGeometry();
    m.hull.computeBoundingBox();
    expect(m.hull.boundingBox!.getSize(new THREE.Vector3()).x).toBeGreaterThan(1100);
  });
});

describe('the fleet', () => {
  it('arrives from high above and settles into its patrol orbits', () => {
    const { fleet } = makeFleet();
    expect(fleet.ships.every((s) => s.st === St.Waiting)).toBe(true);
    run(fleet, 150);
    const patrol = fleet.ships.filter((s) => s.st === St.Patrol).length;
    expect(patrol / fleet.ships.length).toBeGreaterThan(0.9);
    for (const s of fleet.ships) {
      const c = CLASSES[s.cls];
      expect(s.pos.y - 64).toBeGreaterThan(c.alt[0] - 120);
      expect(s.pos.y - 64).toBeLessThan(c.alt[1] + 200);
    }
  });

  it('ships can be shot down: they fall burning and crash on the ground', () => {
    const { fleet, crashes } = makeFleet();
    run(fleet, 120);
    const s = fleet.ships.find((x) => x.cls === Cls.Fighter && x.st === St.Patrol)!;
    // a ray straight at it
    const o = s.pos.clone().add(new THREE.Vector3(0, -200, 0));
    const hit = fleet.raycast(o, new THREE.Vector3(0, 1, 0), 400);
    expect(hit).not.toBeNull();
    const before = fleet.alive;
    expect(fleet.hit(hit!.ship, 1000)).toBe(true);
    expect(fleet.alive).toBe(before - 1);
    expect(hit!.ship.st).toBe(St.Falling);
    run(fleet, 40);
    expect(crashes.some((c) => c.s === hit!.ship)).toBe(true);
    const c = crashes.find((c) => c.s === hit!.ship)!;
    expect(c.at.y).toBeCloseTo(64, 3);
  });

  it('aim assist picks the ship nearest the crosshair within the cone', () => {
    const { fleet } = makeFleet();
    run(fleet, 120);
    const s = fleet.ships.find((x) => x.cls === Cls.Fighter && x.st === St.Patrol)!;
    const o = s.pos.clone().add(new THREE.Vector3(0, -600, 0));
    // aimed 2 degrees off the ship: the plain ray misses, the assist finds it
    const d = new THREE.Vector3(Math.sin(0.035), Math.cos(0.035), 0);
    const exact = fleet.raycast(o, d, 2000);
    expect(exact?.ship === s).toBe(false);
    const a = fleet.aimTarget(o, d, 2000, 0.075);
    expect(a).not.toBeNull();
    expect(a!.t).toBeGreaterThan(500);
    // nothing within a tight cone pointed away from everything
    expect(fleet.aimTarget(o, new THREE.Vector3(0, -1, 0), 2000, 0.075)).toBeNull();
  });

  it('fighters make attack runs and fire at the target', () => {
    const { fleet, shots } = makeFleet();
    run(fleet, 60);
    fleet.maxAttackers = 20;
    fleet.attackCenter.set(0, 64, 0);
    run(fleet, 60);
    expect(shots.length).toBeGreaterThan(0);
    // bolts come from low over the target area
    const near = shots.filter((p) => Math.hypot(p.x, p.z) < 700);
    expect(near.length).toBeGreaterThan(0);
  });
});

describe('the mothership', () => {
  it('descends, blocks the sun, has a weak core, and falls and crashes when destroyed', () => {
    const m = new Mothership(fakeRenderer, new THREE.Vector3(0, 464, 0));
    m.arrive();
    const ground = () => 64;
    for (let t = 0; t < 75; t += 0.1) m.update(0.1, ground);
    expect(m.state).toBe('hover');
    expect(m.pos.y).toBeGreaterThan(450);
    // standing under it with the sun high: in its shadow
    expect(m.occlusion(new THREE.Vector3(0, 64, 0), new THREE.Vector3(0.2, 1, 0.1).normalize())).toBeGreaterThan(0.9);
    expect(m.occlusion(new THREE.Vector3(2000, 64, 0), new THREE.Vector3(0, 1, 0))).toBe(0);
    // a ray up from below hits the hull; the core multiplies damage
    const hull = m.raycast(new THREE.Vector3(300, 64, 0), new THREE.Vector3(0, 1, 0), 1000);
    expect(hull).not.toBeNull();
    const core = m.corePos();
    const hp0 = m.hp;
    m.hit(100, new THREE.Vector3(300, 400, 0));
    expect(hp0 - m.hp).toBe(100);
    m.hit(100, core);
    expect(hp0 - 100 - m.hp).toBe(400);
    m.hit(MOTHER_HP, core);
    expect(m.state).toBe('dying');
    let crashed = false;
    for (let t = 0; t < 200 && !crashed; t += 0.1) crashed = m.update(0.1, ground) === 'crash';
    expect(crashed).toBe(true);
    expect(m.state).toBe('crashed');
  });
});
