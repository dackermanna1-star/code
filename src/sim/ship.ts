/**
 * Spacecraft: rigid body with Newtonian translation & rotation.
 *
 * - main engine (+ throttle, spool-up), RCS translation/rotation, mass & fuel
 *   (Tsiolkovsky flow, optional), gravity from every body (restricted n-body)
 * - analytic Kepler propagation when coasting under time-warp
 * - atmosphere: drag (½ρv²CdA, air co-rotating with the planet), simple lift,
 *   stagnation heating (Sutton–Graves) driving entry plasma visuals
 * - flight assist: rotation damping; hover/landing assist near surfaces
 * - autopilots: approach target, land, hold orbit-relative attitude
 * - landing/takeoff against the procedural terrain (same height function as
 *   the rendered surface), impact damage optional
 * - speculative FTL: "warp" (distance-scaled in-system cruise) and
 *   "hyperspace" jumps between stars/galaxies, both clearly fictional
 */
import { Matrix4, Quaternion, Vector3 } from 'three';
import type { Body, StarSystem } from '../astro/body';
import { FramedPosition } from './frame';
import { gravityAccel, dominantBody } from './gravity';
import { elementsFromState, orbitState, type OrbitElements } from '../astro/orbit';
import type { World } from './world';
import { UPos } from '../core/upos';
import { C_LIGHT, K_B, AMU, LY } from '../core/constants';
import { canCapture, dockGeometry, dockingGuidance, newTargetState, SHIP_PORTS, type DockGeometry, type DockPhase, type DockTarget } from './docking';

export type ShipClass = 'scout' | 'lander' | 'cruiser' | 'heavy' | 'experimental';

export interface ShipSpec {
  cls: ShipClass;
  name: string;
  description: string;
  dryMass: number;      // kg
  fuelMass: number;     // kg
  thrust: number;       // N (main engine)
  isp: number;          // s (vacuum)
  rcsThrust: number;    // N per axis
  torque: number;       // rad/s² nominal angular acceleration
  dragArea: number;     // m² × Cd
  liftArea: number;     // m² (0 = no lift)
  length: number;       // m
  gearHeight: number;   // m: hull origin above the ground when landed
  maxImpact: number;    // m/s survivable touchdown
  warpFactor: number;   // FTL capability multiplier (0 = none)
  jumpRange: number;    // ly per jump (0 = none)
  heatShield: number;   // 0..1
  spool: number;        // s engine spool-up
}

export const SHIP_SPECS: Record<ShipClass, ShipSpec> = {
  scout: { cls: 'scout', name: 'Kestrel-class scout', description: 'Agile, efficient exploration craft for surveying planetary surfaces.',
    dryMass: 18000, fuelMass: 22000, thrust: 1.2e6, isp: 380, rcsThrust: 6e4, torque: 1.4, dragArea: 6, liftArea: 40, length: 22, gearHeight: 2.6, maxImpact: 8, warpFactor: 1, jumpRange: 60, heatShield: 0.8, spool: 0.6 },
  lander: { cls: 'lander', name: 'Talus surface lander', description: 'Throttleable descent engine and wide landing legs for difficult terrain.',
    dryMass: 9000, fuelMass: 16000, thrust: 4.5e5, isp: 320, rcsThrust: 4e4, torque: 1.0, dragArea: 12, liftArea: 0, length: 9, gearHeight: 2.1, maxImpact: 12, warpFactor: 0.5, jumpRange: 20, heatShield: 1, spool: 0.4 },
  cruiser: { cls: 'cruiser', name: 'Meridian deep-space cruiser', description: 'Long-duration vessel with large tankage and advanced navigation.',
    dryMass: 2.2e5, fuelMass: 6e5, thrust: 9e6, isp: 900, rcsThrust: 6e5, torque: 0.35, dragArea: 60, liftArea: 0, length: 96, gearHeight: 7.5, maxImpact: 4, warpFactor: 4, jumpRange: 400, heatShield: 0.5, spool: 2.0 },
  heavy: { cls: 'heavy', name: 'Atlas heavy explorer', description: 'Expedition vessel: laboratories, cargo, and the endurance of a small station.',
    dryMass: 1.4e6, fuelMass: 3e6, thrust: 4e7, isp: 700, rcsThrust: 3e6, torque: 0.18, dragArea: 300, liftArea: 0, length: 210, gearHeight: 16, maxImpact: 3, warpFactor: 3, jumpRange: 800, heatShield: 0.4, spool: 3.0 },
  experimental: { cls: 'experimental', name: 'Alcubierre-ring testbed (speculative)', description: 'Fictional spacetime-metric drive. Not established physics.',
    dryMass: 60000, fuelMass: 30000, thrust: 3e6, isp: 3000, rcsThrust: 1.5e5, torque: 1.0, dragArea: 15, liftArea: 0, length: 44, gearHeight: 4.2, maxImpact: 6, warpFactor: 40, jumpRange: 1e9, heatShield: 0.6, spool: 1.0 },
};

export interface ShipOptions {
  realisticFuel: boolean;
  damage: boolean;
  ftlLimits: boolean;   // fuel cost & cooldown for jumps
  flightAssist: boolean;
}

export interface AtmosphereSample {
  density: number;   // kg/m³
  pressure: number;  // Pa
  heating: number;   // W/m² stagnation heat flux (approx)
  mach: number;
}

const _v = new Vector3(), _v2 = new Vector3(), _v3 = new Vector3(), _a = new Vector3();
const _q = new Quaternion(), _q2 = new Quaternion();
const _u = new UPos();
const _ts = newTargetState();

export class Ship {
  readonly spec: ShipSpec;
  /** position: inertial (non-rotating) frame of `frame.body`, or universe when outside systems; landed → rotating */
  readonly frame = new FramedPosition();
  /** velocity relative to frame body (world axes); for 'rotating' frames it is zero */
  readonly velocity = new Vector3();
  /** orientation (ship → world) */
  readonly orient = new Quaternion();
  readonly angVel = new Vector3(); // body axes, rad/s
  fuel: number;
  throttle = 0;
  engineLevel = 0;      // spooled thrust fraction
  rcs = new Vector3();  // -1..1 per axis input (ship axes)
  rotInput = new Vector3(); // pitch, yaw, roll input
  landed = false;
  gearDown = true;
  hoverAssist = true;
  integrity = 1;
  heatGlow = 0;
  atmo: AtmosphereSample = { density: 0, pressure: 0, heating: 0, mach: 0 };
  altitude = Infinity;
  verticalSpeed = 0;
  groundSpeed = 0;
  gForce = 0;
  /** orbit around the dominant body (null when landed/in atmosphere/escaping wildly) */
  orbit: OrbitElements | null = null;
  autopilot: { mode: 'none' | 'approach' | 'land' | 'hold' | 'dock'; target: Body | null; standoff: number } = { mode: 'none', target: null, standoff: 0 };
  /** docking port selected by the docking computer, with its live geometry */
  dock: { target: DockTarget; port: number; geo: DockGeometry | null; phase: DockPhase } | null = null;
  /** hard-docked to a port: the ship rides with the target */
  docked: { target: DockTarget; port: number } | null = null;
  /** motherships: the shuttle is in its berth */
  shuttleAboard: boolean;
  warp = { active: false, speed: 0, charge: 0 };
  jump = { phase: 'idle' as 'idle' | 'charging' | 'tunnel' | 'exit', t: 0, duration: 0, from: new UPos(), to: new UPos(), targetName: '', cooldown: 0, onArrive: null as null | (() => void) };
  lastImpact = 0;
  message = '';

  constructor(cls: ShipClass, readonly opts: ShipOptions) {
    this.spec = SHIP_SPECS[cls];
    this.fuel = this.spec.fuelMass;
    this.shuttleAboard = !!SHIP_PORTS[cls].shuttle;
  }

  get mass() {
    return this.spec.dryMass + this.fuel;
  }

  /** Thrust-to-weight ratio at a given g. */
  twr(g: number) {
    return this.spec.thrust / (this.mass * Math.max(g, 1e-6));
  }

  deltaV() {
    return this.spec.isp * 9.80665 * Math.log(this.mass / this.spec.dryMass);
  }

  /** Spawn at the camera, at rest relative to the camera's frame body. */
  spawnAt(view: FramedPosition, world: World) {
    this.frame.copy(view);
    if (this.frame.kind === 'rotating' && this.frame.body) {
      // convert to inertial with the surface velocity so the ship starts co-moving
      const b = this.frame.body;
      const off = this.frame.offsetWorld(new Vector3());
      this.frame.rebase('inertial', b);
      this.velocity.copy(this.surfaceVelocity(b, off, world));
    } else this.velocity.set(0, 0, 0);
    this.orient.copy(view.worldOrientation(new Quaternion()));
    this.angVel.set(0, 0, 0);
    this.landed = false;
  }

  /** Velocity of the rotating surface (ω × r) at a world-axes offset from the body centre. */
  surfaceVelocity(b: Body, offWorld: Vector3, world: World, out = new Vector3()): Vector3 {
    const period = b.rotation.locked && b.orbit ? 2 * Math.PI * Math.sqrt(Math.abs(b.orbit.a) ** 3 / b.orbit.mu) : b.rotation.period;
    if (!isFinite(period) || period === 0) return out.set(0, 0, 0);
    const axis = _v3.set(0, 1, 0).applyQuaternion(world.system!.bodyRotation(b, _q2));
    return out.crossVectors(axis, offWorld).multiplyScalar((2 * Math.PI) / period);
  }

  /** Atmospheric density at altitude h above a body (exponential model from planet physics). */
  atmosphereAt(b: Body, h: number): { rho: number; P: number; T: number } {
    const a = b.planet?.atmosphere;
    if (!a || a.pressure <= 0) return { rho: 0, P: 0, T: 0 };
    const T = Math.max(b.planet!.tempMean, 30);
    const P0 = a.pressure * 1e5;
    const rho0 = (P0 * a.meanMolecularMass * AMU) / (K_B * T);
    const H = a.scaleHeight || 8000;
    const f = Math.exp(-Math.max(h, 0) / H);
    return { rho: rho0 * f, P: P0 * f, T };
  }

  private lastDt = 0;
  private lastSimDt = 0;

  update(dt: number, world: World) {
    const sys = world.system;
    this.message = '';
    this.lastDt = dt;
    if (this.jump.cooldown > 0) this.jump.cooldown -= dt;
    if (this.jump.phase !== 'idle') {
      this.updateJump(dt, world);
      return;
    }
    if (this.docked) {
      this.followDock(dt, world);
      return;
    }
    // spool engine toward throttle
    const k = 1 - Math.exp(-dt / Math.max(this.spec.spool, 0.05));
    this.engineLevel += (this.throttle - this.engineLevel) * k;
    if (this.opts.realisticFuel && this.fuel <= 0) this.engineLevel = 0;

    this.updateRotation(dt);

    if (sys && !this.frame.body && !this.warp.active) {
      // arrived from interstellar space: attach to the system (velocity ≈ relative to its barycentre)
      const d = this.frame.toUPos(_u).distanceTo(sys.upos);
      if (d < 0.5 * LY) this.frame.rebase('inertial', sys.root);
    }
    if (!sys || !this.frame.body) {
      // interstellar: no gravity; move in the universe frame
      if (this.frame.kind !== 'universe') this.frame.rebase('universe', null);
      const thrustAcc = (this.spec.thrust * this.engineLevel) / this.mass;
      _a.set(this.rcs.x * this.spec.rcsThrust, this.rcs.y * this.spec.rcsThrust, -this.rcs.z * this.spec.rcsThrust).divideScalar(this.mass);
      _a.z -= thrustAcc;
      _a.applyQuaternion(this.orient);
      this.velocity.addScaledVector(_a, dt);
      if (this.warp.active) this.frame.upos.add(_v.set(0, 0, -this.warp.speed * dt).applyQuaternion(this.orient));
      else this.frame.upos.add(this.velocity, dt * world.timeScale);
      this.burnFuel(dt);
      this.altitude = Infinity;
      return;
    }

    if (this.landed) {
      this.updateLanded(dt, world);
      return;
    }

    const body = this.frame.body;
    const warpScale = world.paused ? 0 : world.timeScale;
    const simDt = dt * warpScale;
    this.lastSimDt = simDt;
    // choose frame: dominant body by SOI
    const posSys = _v.copy(this.frame.offsetWorld(_v2)).applyQuaternion(_q.copy(sys.q).invert()).add(body.posSys);
    const dom = dominantBody(sys, posSys);
    if (dom !== body) this.switchFrame(dom, world, simDt);

    const b = this.frame.body!;
    const off = this.frame.offsetWorld(new Vector3());
    const r = off.length();
    const up = _v3.copy(off).divideScalar(r);
    const ground = world.surfaceRadius(b, _v.copy(off).applyQuaternion(sys.bodyRotation(b, _q).invert()), 0.5);
    this.altitude = r - ground;
    // atmosphere relative wind
    const vSurf = this.surfaceVelocity(b, off, world);
    const vAir = _v2.copy(this.velocity).sub(vSurf);
    const atm = this.atmosphereAt(b, r - b.radius);
    const airspeed = vAir.length();
    this.atmo.density = atm.rho;
    this.atmo.pressure = atm.P;
    this.atmo.mach = atm.T > 0 ? airspeed / Math.sqrt(1.3 * 8.314 * atm.T / ((b.planet?.atmosphere?.meanMolecularMass ?? 29) / 1000)) : 0;
    this.atmo.heating = 1.83e-4 * Math.sqrt(atm.rho / 1.5) * airspeed ** 3; // Sutton–Graves, nose radius 1.5 m
    this.heatGlow = Math.min(1, this.atmo.heating / 4e6);
    this.verticalSpeed = vAir.dot(up);
    this.groundSpeed = Math.sqrt(Math.max(0, airspeed * airspeed - this.verticalSpeed ** 2));

    if (this.warp.active) {
      this.updateWarp(dt, world, b, off);
      return;
    }

    // ---- forces (world axes)
    const totalAcc = _a.set(0, 0, 0);
    // engine (−Z forward) + RCS
    const thrust = this.spec.thrust * this.engineLevel;
    const local = _v.set(this.rcs.x * this.spec.rcsThrust, this.rcs.y * this.spec.rcsThrust, -this.rcs.z * this.spec.rcsThrust - thrust);
    // hover / landing assist: RCS & main engine null gravity and drift near the surface
    const gLocal = b.mu / (r * r);
    if (this.hoverAssist && this.altitude < 20000 && this.autopilot.mode === 'none') {
      const want = new Vector3(this.rcs.x, this.rcs.y, -this.rcs.z).multiplyScalar(Math.min(300, Math.max(20, this.altitude * 0.3))).applyQuaternion(this.orient);
      const err = want.sub(vAir);
      const need = err.multiplyScalar(1.2).addScaledVector(up, gLocal);
      const maxA = (this.spec.thrust + this.spec.rcsThrust * 3) / this.mass;
      if (need.length() > maxA) need.setLength(maxA);
      totalAcc.add(need);
      this.burnFuelFor(need.length() * this.mass, dt);
    } else {
      local.applyQuaternion(this.orient).divideScalar(this.mass);
      totalAcc.add(local);
      this.burnFuel(dt);
    }
    this.autopilotAccel(totalAcc, world, b, off, up, gLocal, vAir);
    // drag & lift
    if (atm.rho > 0 && airspeed > 0.1) {
      const q = 0.5 * atm.rho * airspeed * airspeed;
      totalAcc.addScaledVector(vAir, (-q * this.spec.dragArea) / (this.mass * airspeed));
      if (this.spec.liftArea > 0) {
        const shipUp = _v.set(0, 1, 0).applyQuaternion(this.orient);
        const fwd = _v2.set(0, 0, -1).applyQuaternion(this.orient);
        const aoa = Math.asin(Math.max(-1, Math.min(1, -vAir.dot(shipUp) / airspeed)));
        const cl = 2 * Math.PI * Math.sin(aoa) * Math.cos(aoa) * 0.6;
        const liftDir = shipUp.addScaledVector(vAir, -shipUp.dot(vAir) / (airspeed * airspeed)).normalize();
        totalAcc.addScaledVector(liftDir, (q * this.spec.liftArea * cl) / this.mass);
        void fwd;
      }
    }
    this.gForce = totalAcc.length() / 9.80665;

    // ---- integrate translation (gravity via n-body field), sub-stepped
    const coasting = thrust <= 0 && this.rcs.lengthSq() === 0 && atm.rho < 1e-9 && this.autopilot.mode === 'none' && !(this.hoverAssist && this.altitude < 20000);
    if (coasting && warpScale > 50) {
      // on rails: analytic Kepler around the dominant body
      const el = elementsFromState(off, this.velocity, b.mu, world.time - simDt);
      orbitState(el, world.time, off, this.velocity);
      this.setOffset(off);
      this.orbit = el;
    } else {
      // velocity Verlet (kick–drift–kick): velocity stays synchronous with
      // position, which relative navigation (docking) depends on
      const nSub = Math.min(200, Math.max(1, Math.ceil(simDt / 0.5)));
      const h = simDt / nSub;
      const qi = _q2.copy(sys.q).invert();
      const acc = (p: Vector3, out: Vector3) => gravityAccel(sys, b, _v.copy(p).applyQuaternion(qi), out).applyQuaternion(sys.q).add(totalAcc);
      const a = acc(off, _v2);
      for (let i = 0; i < nSub; i++) {
        this.velocity.addScaledVector(a, h / 2);
        off.addScaledVector(this.velocity, h);
        acc(off, a);
        this.velocity.addScaledVector(a, h / 2);
      }
      this.setOffset(off);
      this.orbit = atm.rho < 1e-7 ? elementsFromState(off, this.velocity, b.mu, world.time) : null;
    }
    // ---- docking: soft capture when inside the envelope
    if (this.dock) {
      const g = dockGeometry(this, this.dock.target, this.dock.port, world, _ts);
      this.dock.geo = g;
      if (g && canCapture(g)) this.captureDock(world);
    }
    // ---- ground contact
    const r2 = off.length();
    const dirB = _v.copy(off).applyQuaternion(sys.bodyRotation(b, _q).invert());
    const groundR = world.surfaceRadius(b, dirB, 0.25);
    if (r2 < groundR + this.spec.gearHeight) {
      const vRel = this.velocity.clone().sub(this.surfaceVelocity(b, off, world));
      const impact = vRel.length();
      this.lastImpact = impact;
      if (impact > this.spec.maxImpact * (this.gearDown ? 1 : 0.4)) {
        if (this.opts.damage) this.integrity = Math.max(0, this.integrity - (impact - this.spec.maxImpact) / 30);
        this.message = impact > this.spec.maxImpact * 3 ? 'Hard impact!' : 'Rough landing';
      }
      this.touchDown(world, b, off.setLength(groundR + this.spec.gearHeight));
    }
  }

  /** Soft capture → hard dock: latch onto the port and ride with the target. */
  captureDock(world: World) {
    const dk = this.dock;
    if (!dk) return;
    this.docked = { target: dk.target, port: dk.port };
    this.autopilot.mode = 'none';
    this.throttle = 0;
    this.engineLevel = 0;
    this.rcs.set(0, 0, 0);
    this.angVel.set(0, 0, 0);
    this.followDock(0, world);
    this.message = `Docked · ${dk.target.name} · ${dk.target.ports[dk.port].name}`;
  }

  /** Separate from the port with a gentle push along its axis. */
  undock(world: World) {
    const d = this.docked;
    if (!d) return;
    const g = dockGeometry(this, d.target, d.port, world, _ts);
    this.docked = null;
    if (g) {
      this.velocity.copy(g.portVel).addScaledVector(g.portAxis, 0.25);
      this.dock = { target: d.target, port: d.port, geo: dockGeometry(this, d.target, d.port, world, _ts), phase: 'approach' };
    }
    this.message = `Undocked from ${d.target.name}`;
  }

  private followDock(dt: number, world: World) {
    const d = this.docked!;
    const fb = this.frame.body;
    const g = fb ? dockGeometry(this, d.target, d.port, world, _ts) : null;
    if (!g || !fb) {
      this.docked = null;
      this.message = 'Docking latch released';
      return;
    }
    if (this.frame.kind !== 'inertial') this.frame.rebase('inertial', fb);
    this.orient.copy(g.dockQ);
    this.setOffset(g.dockPos.clone());
    this.velocity.crossVectors(_ts.omega, g.dockPos.clone().sub(_ts.pos)).add(_ts.vel);
    this.angVel.set(0, 0, 0);
    this.engineLevel = 0;
    this.dock = { target: d.target, port: d.port, geo: g, phase: 'final' };
    const off = g.dockPos;
    this.altitude = off.length() - fb.radius;
    this.verticalSpeed = 0;
    this.groundSpeed = 0;
    this.gForce = 0;
    this.heatGlow = 0;
    this.atmo.density = 0; this.atmo.pressure = 0; this.atmo.heating = 0; this.atmo.mach = 0;
    this.orbit = elementsFromState(off, this.velocity, fb.mu, world.time);
    // replenish propellant and repair through the port
    this.fuel = Math.min(this.spec.fuelMass, this.fuel + this.spec.fuelMass * 0.02 * dt);
    this.integrity = Math.min(1, this.integrity + 0.02 * dt);
  }

  private setOffset(off: Vector3) {
    if (this.frame.kind === 'inertial') this.frame.local.copy(off);
    else this.frame.translateWorld(off.clone().sub(this.frame.offsetWorld(new Vector3())));
  }

  /**
   * Re-express the ship relative to another body. `lag`: the ship's state
   * still refers to `lag` seconds before the bodies' current positions, so
   * the offset between the bodies is taken back to that instant.
   */
  private switchFrame(nb: Body, world: World, lag = 0) {
    const sys = world.system!;
    const old = this.frame.body!;
    const off = this.frame.offsetWorld(new Vector3());
    // r' = r + (old − new), v' = v + (v_old − v_new)   (system → world axes)
    const dPos = _v.copy(old.posSys).sub(nb.posSys).applyQuaternion(sys.q);
    const dVel = _v2.copy(old.velSys).sub(nb.velSys).applyQuaternion(sys.q);
    if (lag > 0) {
      const dAcc = gravityAccel(sys, nb, old.posSys.clone().sub(nb.posSys), new Vector3()).applyQuaternion(sys.q);
      dPos.addScaledVector(dVel, -lag).addScaledVector(dAcc, 0.5 * lag * lag);
      dVel.addScaledVector(dAcc, -lag);
    }
    this.frame.kind = 'inertial';
    this.frame.body = nb;
    this.frame.local.copy(off.add(dPos));
    this.velocity.add(dVel);
    void world;
  }

  private touchDown(world: World, b: Body, off: Vector3) {
    this.landed = true;
    this.engineLevel = 0;
    this.throttle = 0;
    this.velocity.set(0, 0, 0);
    this.angVel.set(0, 0, 0);
    // switch to the rotating frame and stand upright
    const sys = world.system!;
    this.frame.kind = 'inertial';
    this.frame.local.copy(off);
    this.frame.orient.copy(this.orient);
    this.frame.rebase('rotating', b);
    const up = off.clone().normalize();
    const fwd = new Vector3(0, 0, -1).applyQuaternion(this.orient);
    fwd.addScaledVector(up, -fwd.dot(up));
    if (fwd.lengthSq() < 1e-6) fwd.set(1, 0, 0).addScaledVector(up, -up.x);
    fwd.normalize();
    const right = fwd.clone().cross(up);
    // basis: X = right, Y = up, Z = −forward
    this.orient.setFromRotationMatrix(new Matrix4().makeBasis(right, up, fwd.clone().negate()));
    this.message ||= `Touchdown on ${b.displayName}`;
    void sys;
  }

  private updateLanded(dt: number, world: World) {
    const sys = world.system!;
    const b = this.frame.body!;
    // orientation follows the planet's rotation while landed
    const frameQ = sys.bodyRotation(b, _q);
    if (!this.landedLocalQ) this.landedLocalQ = frameQ.clone().invert().multiply(this.orient);
    this.orient.copy(frameQ).multiply(this.landedLocalQ);
    const off = this.frame.offsetWorld(new Vector3());
    const r = off.length();
    this.altitude = this.spec.gearHeight;
    this.verticalSpeed = 0;
    this.groundSpeed = 0;
    const g = b.mu / (r * r);
    const spooled = this.spec.thrust * this.engineLevel;
    const k = 1 - Math.exp(-dt / Math.max(this.spec.spool, 0.05));
    this.engineLevel += (this.throttle - this.engineLevel) * k;
    // lift off when thrust (or vertical RCS/hover input) beats gravity
    const wantsUp = this.rcs.y > 0.5 || (spooled > this.mass * g * 1.02);
    if (wantsUp) {
      this.landed = false;
      this.landedLocalQ = null;
      const vSurf = this.surfaceVelocity(b, off, world);
      this.frame.rebase('inertial', b);
      this.velocity.copy(vSurf).addScaledVector(off.normalize(), 2);
      this.message = 'Lift-off';
    }
  }
  private landedLocalQ: Quaternion | null = null;

  private updateRotation(dt: number) {
    const s = this.spec;
    // input → angular acceleration; flight assist damps residual rotation (SAS)
    const acc = _v.copy(this.rotInput).multiplyScalar(s.torque);
    if (this.opts.flightAssist) {
      const damp = this.rotInput.lengthSq() < 1e-4 ? 3.0 : 1.2;
      acc.addScaledVector(this.angVel, -damp);
    }
    this.angVel.addScaledVector(acc, dt);
    const maxRate = 1.4;
    if (this.angVel.length() > maxRate) this.angVel.setLength(maxRate);
    const w = this.angVel.length();
    if (w > 1e-9 && !this.landed) {
      _q.setFromAxisAngle(_v2.copy(this.angVel).divideScalar(w), w * dt);
      this.orient.multiply(_q).normalize();
    }
  }

  private burnFuel(dt: number) {
    const F = this.spec.thrust * this.engineLevel + this.rcs.length() * this.spec.rcsThrust;
    this.burnFuelFor(F, dt);
  }

  private burnFuelFor(F: number, dt: number) {
    if (!this.opts.realisticFuel) return;
    this.fuel = Math.max(0, this.fuel - (F / (this.spec.isp * 9.80665)) * dt);
  }

  // ---------------------------------------------------------------- autopilot
  private autopilotAccel(acc: Vector3, world: World, b: Body, off: Vector3, up: Vector3, g: number, vAir: Vector3) {
    const ap = this.autopilot;
    if (ap.mode === 'none') return;
    if (ap.mode === 'dock') {
      const dk = this.dock;
      // the ship's state is still at the previous step: compare with the target then
      const geo = dk ? dockGeometry(this, dk.target, dk.port, world, _ts, this.lastSimDt) : null;
      if (!dk || !geo) { ap.mode = 'none'; this.message = 'Docking target lost'; return; }
      dk.geo = geo;
      dk.phase = dockingGuidance(this, geo, dk.phase, acc);
      this.burnFuelFor(acc.length() * this.mass, this.lastDt);
      // attitude: turn toward the docked orientation at a gentle rate
      this.orient.rotateTowards(geo.dockQ, Math.min(0.35, 0.05 + geo.angle) * this.lastDt);
      this.angVel.set(0, 0, 0);
      return;
    }
    const maxA = this.spec.thrust / this.mass;
    if (ap.mode === 'land') {
      // vertical descent: target sink rate proportional to altitude, null horizontal drift
      const sink = -Math.min(120, Math.max(1.2, this.altitude * 0.08));
      const hv = vAir.clone().addScaledVector(up, -vAir.dot(up));
      const want = up.clone().multiplyScalar(sink - vAir.dot(up)).multiplyScalar(1.5).addScaledVector(hv, -0.8).addScaledVector(up, g);
      if (want.length() > maxA) want.setLength(maxA);
      acc.copy(want);
      this.pointToward(up, 0.05);
      return;
    }
    if (ap.mode === 'approach' && ap.target && world.system) {
      const sys = world.system;
      const tRel = _v.copy(ap.target.posSys).sub(b.posSys).applyQuaternion(sys.q).sub(off); // ship → target
      const tVel = _v2.copy(ap.target.velSys).sub(b.velSys).applyQuaternion(sys.q);
      const d = tRel.length();
      const remaining = d - ap.standoff;
      const dir = tRel.clone().normalize();
      const vRel = this.velocity.clone().sub(tVel);
      const vClose = Math.sqrt(2 * maxA * 0.6 * Math.max(remaining, 0));
      const want = dir.multiplyScalar(Math.min(vClose, C_LIGHT * 0.01)).sub(vRel).multiplyScalar(0.8);
      // cancel gravity of the frame body
      want.addScaledVector(up, b.mu / off.lengthSq());
      if (want.length() > maxA) want.setLength(maxA);
      acc.copy(want);
      if (remaining < ap.standoff * 0.05 + 100 && vRel.length() < 5) {
        ap.mode = 'none';
        this.message = `Arrived at ${ap.target.displayName}`;
      }
    }
  }

  /** Rotate the ship so its −Z (nose) or +Y (belly-up for landing) aligns. */
  private pointToward(upWorld: Vector3, rate: number) {
    const shipUp = new Vector3(0, 1, 0).applyQuaternion(this.orient);
    const q = new Quaternion().setFromUnitVectors(shipUp, upWorld);
    const target = q.multiply(this.orient);
    this.orient.slerp(target, Math.min(1, rate * 10));
  }

  // ---------------------------------------------------------------- FTL (speculative)
  toggleWarp(world: World) {
    if (this.spec.warpFactor <= 0) { this.message = 'No warp capability'; return; }
    if (this.landed) { this.message = 'Cannot warp while landed'; return; }
    if (this.atmo.density > 1e-6) { this.message = 'Warp inhibited inside an atmosphere'; return; }
    this.warp.active = !this.warp.active;
    this.warp.speed = 0;
    this.message = this.warp.active ? 'Warp engaged (speculative drive)' : 'Warp disengaged';
    void world;
  }

  private updateWarp(dt: number, world: World, b: Body, off: Vector3) {
    // speed scales with distance to the nearest gravity well (supercruise-like), capped by the drive
    const sys = world.system!;
    let dNear = Infinity;
    const posSys = off.clone().applyQuaternion(_q.copy(sys.q).invert()).add(b.posSys);
    for (const o of sys.bodies) {
      if (o.kind === 'barycenter') continue;
      const d = posSys.distanceTo(o.posSys) - o.radius;
      if (d < dNear) dNear = d;
    }
    const target = Math.min(Math.max(dNear, 1e5) * 0.6 * this.spec.warpFactor, C_LIGHT * 2000 * this.spec.warpFactor);
    this.warp.speed += (target * Math.max(0.15, this.throttle) - this.warp.speed) * (1 - Math.exp(-dt * 1.5));
    if (dNear < 2e5 && this.warp.speed > 0) {
      this.warp.active = false;
      this.message = 'Warp dropped: gravity well';
      this.velocity.set(0, 0, 0);
      return;
    }
    const step = _v.set(0, 0, -this.warp.speed * dt).applyQuaternion(this.orient);
    off.add(step);
    this.setOffset(off);
    this.velocity.set(0, 0, 0);
    this.altitude = dNear;
    // leave the system frame when far beyond it
    const dRoot = posSys.length();
    if (dRoot > 0.5 * LY) {
      this.frame.rebase('universe', null);
    }
  }

  /** Begin a hyperspace jump to a universe position. */
  startJump(to: UPos, name: string, distanceLy: number, onArrive: () => void) {
    if (this.spec.jumpRange <= 0) { this.message = 'No jump drive'; return false; }
    if (this.opts.ftlLimits) {
      if (this.jump.cooldown > 0) { this.message = `Jump drive cooling: ${this.jump.cooldown.toFixed(0)} s`; return false; }
      if (distanceLy > this.spec.jumpRange) { this.message = `Out of jump range (${this.spec.jumpRange} ly)`; return false; }
    }
    if (this.landed || this.atmo.density > 1e-6) { this.message = 'Jump requires open space'; return false; }
    this.jump.phase = 'charging';
    this.jump.t = 0;
    this.jump.duration = 3 + Math.min(10, Math.log10(1 + distanceLy) * 2.5);
    this.frame.toUPos(this.jump.from);
    this.jump.to.copy(to);
    this.jump.targetName = name;
    this.jump.onArrive = onArrive;
    this.message = `Charging jump drive → ${name}`;
    return true;
  }

  private updateJump(dt: number, world: World) {
    const j = this.jump;
    j.t += dt;
    if (j.phase === 'charging' && j.t > 2.5) { j.phase = 'tunnel'; j.t = 0; this.frame.rebase('universe', null); }
    if (j.phase === 'tunnel') {
      const s = Math.min(1, j.t / j.duration);
      const e = s * s * (3 - 2 * s);
      // log-interpolate along the line for a sense of scale
      const d = j.to.sub(j.from, _v);
      const L = d.length();
      const along = Math.exp(Math.log(1 + L) * e) - 1;
      this.frame.upos.copy(j.from).add(d.multiplyScalar(along / Math.max(L, 1)));
      if (s >= 1) { j.phase = 'exit'; j.t = 0; j.onArrive?.(); }
    } else if (j.phase === 'exit' && j.t > 1.2) {
      j.phase = 'idle';
      j.cooldown = this.opts.ftlLimits ? 30 : 0;
      if (this.opts.ftlLimits && this.opts.realisticFuel) this.fuel = Math.max(0, this.fuel - this.spec.fuelMass * 0.1);
      this.velocity.set(0, 0, 0);
      this.message = `Arrived: ${j.targetName}`;
    }
    void world;
  }
}
