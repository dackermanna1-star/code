import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { World } from '../../src/sim/world';
import { Ship } from '../../src/sim/ship';
import { Walker } from '../../src/sim/walker';
import type { Input } from '../../src/sim/input';
import { buildSolarSystem } from '../../src/astro/known/solarsystem';
import { UPos } from '../../src/core/upos';
import { gravityAccel } from '../../src/sim/gravity';

function solarWorld() {
  const w = new World();
  w.time = 0;
  w.system = buildSolarSystem(new UPos(), { x: 0, y: 0, z: 0, w: 1 });
  w.system.update(0);
  return w;
}

/** Minimal scripted input for headless physics tests. */
function scriptedInput(jumpFrames: number) {
  let frame = 0;
  return {
    input: {
      held: () => false,
      pressed: (a: string) => a === 'jump' && frame < jumpFrames,
      axis: () => 0,
      look: () => ({ yaw: 0, pitch: 0 }),
      gamepadAxes: [0, 0, 0, 0],
      wheel: 0,
    } as unknown as Input,
    tick: () => frame++,
  };
}

describe('spaceflight', () => {
  it('holds a circular lunar orbit for a full revolution', () => {
    const w = solarWorld();
    const moon = w.system!.bodies.find((b) => b.name === 'Moon')!;
    const ship = new Ship('scout', { realisticFuel: false, damage: false, ftlLimits: false, flightAssist: true });
    w.view.rebase('inertial', moon);
    const r0 = moon.radius + 100e3;
    w.view.local.set(r0, 0, 0);
    ship.spawnAt(w.view, w);
    ship.velocity.set(0, 0, Math.sqrt(moon.mu / r0));
    ship.hoverAssist = false;
    const T = 2 * Math.PI * Math.sqrt(r0 ** 3 / moon.mu);
    const dt = 1;
    let minR = Infinity, maxR = 0;
    for (let t = 0; t < T; t += dt) {
      w.time += dt;
      w.system!.update(w.time);
      ship.update(dt, w);
      const r = ship.frame.offsetWorld(new Vector3()).length();
      minR = Math.min(minR, r);
      maxR = Math.max(maxR, r);
    }
    // Earth's tide perturbs it slightly; integration drift must stay small
    expect((maxR - minR) / r0).toBeLessThan(0.01);
    expect(ship.frame.body).toBe(moon);
  });

  it('feels the right surface gravity', () => {
    const w = solarWorld();
    const earth = w.system!.bodies.find((b) => b.name === 'Earth')!;
    const a = gravityAccel(w.system!, earth, new Vector3(earth.radius, 0, 0), new Vector3());
    expect(a.length()).toBeGreaterThan(9.7);
    expect(a.length()).toBeLessThan(9.9);
  });
});

describe('walking', () => {
  function jumpHeight(bodyName: string) {
    const w = solarWorld();
    const b = w.system!.bodies.find((x) => x.name === bodyName)!;
    // a dry, fairly flat spot (Earth is mostly ocean)
    let dir = new Vector3();
    for (let i = 0; i < 500; i++) {
      dir.set(Math.sin(i * 2.4) * Math.cos(i * 0.7), Math.cos(i * 1.3) * 0.6, Math.sin(i * 0.9)).normalize();
      const gi = w.groundInfo(b, dir);
      const side = dir.clone().cross(new Vector3(0, 1, 0)).normalize().multiplyScalar(3 / b.radius).add(dir).normalize();
      if (gi.ground > gi.liquid && Math.abs(w.groundInfo(b, side).ground - gi.ground) < 0.5) break;
    }
    dir = dir.clone();
    const ground = w.surfaceRadius(b, dir);
    const wk = new Walker();
    wk.placeAt(b, dir.clone().multiplyScalar(ground), new Vector3(1, 0, 0));
    const { input, tick } = scriptedInput(0);
    // settle on the ground
    for (let i = 0; i < 120; i++) { wk.update(1 / 60, w, input); tick(); }
    const s = scriptedInput(1);
    const r0 = wk.pos.length();
    let maxR = r0;
    for (let i = 0; i < 60 * 30; i++) {
      wk.update(1 / 60, w, s.input);
      s.tick();
      maxR = Math.max(maxR, wk.pos.length());
    }
    return maxR - r0;
  }

  it('jumps higher in weaker gravity', () => {
    const earth = jumpHeight('Earth');
    const moon = jumpHeight('Moon');
    expect(earth).toBeGreaterThan(0.3);
    expect(earth).toBeLessThan(0.8);
    // v²/2g with g_moon ≈ g_earth / 6
    expect(moon / earth).toBeGreaterThan(4);
    expect(moon / earth).toBeLessThan(8);
  });
});
