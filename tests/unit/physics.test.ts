import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { World } from '../../src/sim/world';
import { Ship } from '../../src/sim/ship';
import { Walker } from '../../src/sim/walker';
import type { Input } from '../../src/sim/input';
import { buildSolarSystem } from '../../src/astro/known/solarsystem';
import { UPos } from '../../src/core/upos';
import { gravityAccel } from '../../src/sim/gravity';
import { orbitalPeriod } from '../../src/astro/orbit';
import { dockGeometry, newTargetState, type DockTarget } from '../../src/sim/docking';
import { Player } from '../../src/sim/player';
import { SpectatorController } from '../../src/sim/spectator';

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

describe('stations and docking', () => {
  it('a mothership launches its shuttle, which docks back and is stowed', () => {
    const w = solarWorld();
    const sys = w.system!;
    const earth = sys.bodies.find((b) => b.name === 'Earth')!;
    const { input } = scriptedInput(0);
    const pl = new Player(w, input, new SpectatorController(w, input));
    w.view.rebase('inertial', earth);
    w.view.local.set(earth.radius + 500e3, 0, 0);
    pl.spawnShip('heavy');
    const mother = pl.ship!;
    expect(mother.shuttleAboard).toBe(true);
    pl.shuttleAction();
    const shuttle = pl.ship!;
    expect(shuttle).not.toBe(mother);
    expect(shuttle.spec.cls).toBe('lander');
    expect(shuttle.docked?.target.ship).toBe(mother);
    expect(pl.fleet).toContain(mother);
    const step = (n: number, dt = 0.1) => { for (let k = 0; k < n; k++) { w.time += dt; sys.update(w.time); pl.update(dt); } };
    step(5);
    pl.toggleDock(); // undock
    expect(shuttle.docked).toBeNull();
    step(200); // drift ~5 m out
    pl.toggleDock(); // auto-dock with the nearest port: the mothership's berth
    expect(shuttle.autopilot.mode).toBe('dock');
    expect(shuttle.dock?.target.ship).toBe(mother);
    for (let k = 0; k < 6000 && !shuttle.docked; k++) step(1);
    expect(shuttle.docked?.target.ship).toBe(mother);
    pl.shuttleAction(); // stow and take command of the mothership
    expect(pl.ship).toBe(mother);
    expect(mother.shuttleAboard).toBe(true);
    expect(pl.fleet).toHaveLength(0);
  });

  const opts = { realisticFuel: false, damage: false, ftlLimits: false, flightAssist: true };

  it('the ISS flies its real orbit in LVLH attitude', () => {
    const w = solarWorld();
    const sys = w.system!;
    const earth = sys.bodies.find((b) => b.name === 'Earth')!;
    const iss = sys.bodies.find((b) => b.station?.model === 'iss')!;
    expect(iss.parent).toBe(earth);
    expect(orbitalPeriod(iss.orbit!) / 60).toBeGreaterThan(92);
    expect(orbitalPeriod(iss.orbit!) / 60).toBeLessThan(93.5);
    const r = sys.relative(earth, iss, new Vector3());
    expect(r.length() - earth.radius).toBeGreaterThan(410e3);
    expect(r.length() - earth.radius).toBeLessThan(425e3);
    // inclination to Earth's equator
    const v = iss.velSys.clone().sub(earth.velSys);
    const h = new Vector3().crossVectors(iss.posSys.clone().sub(earth.posSys), v).normalize();
    const pole = new Vector3(0, 1, 0).applyQuaternion(earth.poleQ);
    expect(Math.acos(h.dot(pole)) * 180 / Math.PI).toBeCloseTo(51.64, 1);
    // LVLH: +Y zenith, +X along track
    const q = sys.bodyRotation(iss);
    expect(new Vector3(0, 1, 0).applyQuaternion(q).dot(r.clone().normalize())).toBeGreaterThan(0.9999);
    expect(new Vector3(1, 0, 0).applyQuaternion(q).dot(v.applyQuaternion(sys.q).normalize())).toBeGreaterThan(0.999);
  });

  it('auto-docks with the ISS from 120 m and rides along once captured', () => {
    const w = solarWorld();
    const sys = w.system!;
    const earth = sys.bodies.find((b) => b.name === 'Earth')!;
    const iss = sys.bodies.find((b) => b.station?.model === 'iss')!;
    const target: DockTarget = { id: iss.id, name: iss.name, ports: iss.station!.ports, radius: 60, station: iss };
    const ship = new Ship('scout', opts);
    // start 120 m below and 80 m behind the station, co-moving
    const q = sys.bodyRotation(iss);
    const off = sys.relative(earth, iss, new Vector3()).add(new Vector3(-80, -120, 30).applyQuaternion(q));
    w.view.rebase('inertial', earth);
    w.view.local.copy(off);
    ship.spawnAt(w.view, w);
    ship.velocity.copy(iss.velSys).sub(earth.velSys).applyQuaternion(sys.q);
    ship.hoverAssist = false;
    ship.dock = { target, port: 0, geo: null, phase: 'approach' };
    ship.autopilot.mode = 'dock';
    const dt = 0.1;
    let t = 0;
    let minClear = Infinity;
    const ts = newTargetState();
    for (; t < 900 && !ship.docked; t += dt) {
      w.time += dt;
      sys.update(w.time);
      ship.update(dt, w);
      const g = dockGeometry(ship, target, 0, w, ts)!;
      minClear = Math.min(minClear, ship.frame.offsetWorld(new Vector3()).distanceTo(g.centre));
    }
    expect(ship.docked).not.toBeNull();
    // never flew through the station's core
    expect(minClear).toBeGreaterThan(15);
    // stays latched for a few minutes of orbit
    for (let k = 0; k < 600; k++) {
      w.time += 0.5;
      sys.update(w.time);
      ship.update(0.5, w);
    }
    const g = dockGeometry(ship, target, 0, w, ts)!;
    expect(g.range).toBeLessThan(0.05);
    expect(g.angle).toBeLessThan(0.01);
    // the ship's centre co-rotates with the LVLH station about the port
    expect(g.relVel.clone().sub(new Vector3().crossVectors(g.omega, g.dockPos.clone().sub(g.portPos))).length()).toBeLessThan(1e-3);
    // undock: drifts away along the port axis
    ship.undock(w);
    for (let k = 0; k < 100; k++) {
      w.time += 0.1;
      sys.update(w.time);
      ship.update(0.1, w);
    }
    const g2 = dockGeometry(ship, target, 0, w, ts)!;
    expect(ship.docked).toBeNull();
    expect(g2.axial).toBeGreaterThan(1.5);
  });
});
