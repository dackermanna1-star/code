/**
 * Helicopter flight model: a 6-DOF rigid body with its own integrator (no Rapier), stepped at
 * the 60 Hz physics rate by the HelicopterEntity.
 *
 * Body frame: origin = ground point under the centre of mass with the skids level (the entity
 * position), forward = -Z, right = +X, up = +Y; 1 block = 1 m. The body rotates about its centre
 * of mass `c`; the entity position (and collision AABB) follows `c - (0, com.y, 0)` so the box
 * never swings with attitude.
 *
 * Model (arcade-sim):
 *  - Turbine (N1) spools up from a starter phase, the rotor (Nr) follows through a freewheel
 *    clutch with its own inertia, droops slightly under load and coasts down when the engine is
 *    off (autorotation keeps it turning in a descent).
 *  - Main rotor thrust normal to the rotor disc: T = Tmax · Nr² · collective · groundEffect · ETL,
 *    plus heave (inflow) damping of the climb rate. The disc tilts with the cyclic relative to
 *    the mast and with the whole body, so pitching forward accelerates forward.
 *  - Body drag per body axis (linear + quadratic), weathervane yaw moment from the tail fin,
 *    main-rotor torque reaction with a lagging tail-rotor trim, aerodynamic angular damping.
 *  - Pilot assists: attitude-command cyclic (stick released = auto-level, max pitch/bank),
 *    heading hold on the pedals (Q/E or mouse X) that hands over to the fin in fast flight,
 *    turn coordination, and a vertical-speed collective (Space climb, Shift descend, released =
 *    hold altitude, landing flare near the ground). Control power scales with Nr².
 *  - Four spring-damper skid contacts with Coulomb friction (block slipperiness), a hard stop
 *    when the gear bottoms out, penalty probes on the nose / tail / stabiliser tips and a swept
 *    AABB (moveBox) for the cabin. Impacts are reported as events (the entity turns them into
 *    damage, sounds and particles).
 *  - Water: partial buoyancy (it sinks slowly), heavy drag, splash events.
 */
import * as THREE from 'three';
import { AABB, moveBox } from '../../physics/aabb';
import type { World } from '../../world/world';
import { BLOCKS, T_FULL_CUBE, T_LIQUID, T_SOLID } from '../../world/blocks/registry';
import { getCollisionBoxes } from '../../world/blocks/models';

export const HELI = {
  mass: 1150,
  /** Principal moments of inertia about body X (pitch), Y (yaw), Z (roll), kg·m². */
  inertia: new THREE.Vector3(2300, 3100, 1300),
  gravity: 12,
  /** Centre of mass, body frame (from the ground origin). */
  com: new THREE.Vector3(0, 1.15, 0),
  /** Main rotor hub, body frame. */
  hub: new THREE.Vector3(0, 2.78, 0),
  rotorRadius: 4.2,
  tailHub: new THREE.Vector3(-0.27, 1.78, 6.0),
  tailRadius: 0.62,
  /** Max rotor thrust at 100 % Nr and full collective, as a multiple of the weight. */
  thrustRatio: 2.05,
  /** Heave (inflow) damping, N per m/s of climb rate at 100 % Nr. */
  heave: 1150,
  /** Body drag per axis (x side, y vertical, z longitudinal): linear N/(m/s), quadratic N/(m/s)². */
  dragLin: new THREE.Vector3(160, 70, 45),
  dragQuad: new THREE.Vector3(14, 10, 4.2),
  /** Aerodynamic angular damping (pitch, yaw, roll) N·m/(rad/s). */
  angDamp: new THREE.Vector3(1800, 900, 1300),
  weathervane: 42,
  /** Main rotor torque coefficient (N·m at 100 % Nr per unit of (collective + 0.1)). */
  rotorTorque: 5200,
  /** Fuselage attitude limit from the cyclic; the rotor disc tilts a further `discTilt` relative to the mast. */
  maxPitch: 0.22,
  discTilt: 0.2,
  discTiltLat: 0.1,
  /** Max bank from the cyclic, and in a coordinated (pedal / mouse) turn. */
  maxBank: 0.7,
  maxBankTurn: 0.87,
  maxYawRate: 1.5,
  climbRate: 7,
  descentRate: 5.5,
  /** Attitude controller (pitch, roll): natural frequency (rad/s) and damping ratio. */
  attFreq: 3.2,
  attZeta: 0.85,
  /** Control torque limits at 100 % Nr (pitch/roll and tail rotor yaw), N·m. */
  cyclicTorque: 26000,
  tailTorque: 10500,
  /** Skid contact points (body frame): left/right × front/rear. */
  skids: [
    new THREE.Vector3(-0.95, 0, -1.2), new THREE.Vector3(0.95, 0, -1.2),
    new THREE.Vector3(-0.95, 0, 1.05), new THREE.Vector3(0.95, 0, 1.05),
  ],
  skidK: 62000,
  skidC: 5600,
  /** Suspension travel before the gear bottoms out (m). */
  skidTravel: 0.22,
  /** Collision probes (body frame): nose, tail, stabiliser tips, tail skid. */
  probes: [
    new THREE.Vector3(0, 0.95, -2.08), new THREE.Vector3(0, 1.62, 6.25),
    new THREE.Vector3(-1.02, 1.52, 4.15), new THREE.Vector3(1.02, 1.52, 4.15),
    new THREE.Vector3(0, 0.98, 5.9),
  ],
  /** Cabin collision box, relative to the entity position. */
  boxHalf: 1.15,
  boxMinY: 0.32,
  boxMaxY: 2.45,
};

export const HELI_WEIGHT = HELI.mass * HELI.gravity;
export const HELI_TMAX = HELI.thrustRatio * HELI_WEIGHT;

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export function wrapPi(a: number) {
  a = (a + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
}

/** In-ground-effect thrust multiplier (Cheeseman–Bennett), `h` = rotor height above the surface. */
export function groundEffect(h: number, R = HELI.rotorRadius): number {
  if (!(h > 0) || !Number.isFinite(h)) return 1;
  const k = R / (4 * h);
  if (k >= 0.41) return 1.2;
  return Math.min(1.2, 1 / (1 - k * k));
}

/** Effective translational lift multiplier for a horizontal airspeed (m/s). */
export function translationalLift(vh: number): number {
  return 1 + 0.12 * smoothstep(4, 12, vh);
}

/** Collective that balances the weight (rotor speed `rpm` 0..1, thrust axis vertical component `upY`). */
export function hoverCollective(rpm: number, ge = 1, etl = 1, upY = 1): number {
  const t = HELI_TMAX * rpm * rpm * ge * etl * Math.max(0.05, upY);
  return t > 1 ? HELI_WEIGHT / t : Infinity;
}

/** Hull damage for an impact speed (m/s) along the contact normal. `gear` = absorbed by the skids. */
export function impactDamage(speed: number, gear: boolean): number {
  const s0 = gear ? 4.5 : 3.5;
  if (speed <= s0) return 0;
  const e = speed - s0;
  return gear ? e * 3.2 + e * e * 0.75 : e * 4 + e * e * 1.1;
}

/** Ground friction coefficient of a block state (Minecraft slipperiness 0.6 normal, 0.98 ice). */
export function blockGrip(state: number): number {
  const slip = state ? BLOCKS[state >>> 4].friction : 0.6;
  return clamp((1 - slip) * 1.6, 0.03, 0.8);
}

const colBoxes: number[] = [];

/**
 * Top of the highest solid collision surface in the block column at (x, z) that a point at
 * `y` touches or is above, allowing the point to be up to `allowance` below that top (searching
 * `maxDown` blocks). Returns -Infinity when nothing is found or the point is deeper inside a
 * block. `stateOut[0]` receives the block state of the surface.
 */
export function surfaceBelow(world: World, x: number, z: number, y: number, allowance: number, maxDown: number, stateOut?: number[]): number {
  const bx = Math.floor(x), bz = Math.floor(z);
  const fx = x - bx, fz = z - bz;
  const yFrom = y + allowance;
  const y0 = Math.floor(yFrom);
  for (let by = y0; by >= y0 - maxDown; by--) {
    const st = world.getBlock(bx, by, bz);
    if (!st) continue;
    const id = st >>> 4;
    if (!T_SOLID[id]) continue;
    let top = -Infinity, bottom = by;
    if (T_FULL_CUBE[id]) top = by + 1;
    else {
      colBoxes.length = 0;
      getCollisionBoxes(st, (dx, dy, dz) => world.getBlock(bx + dx, by + dy, bz + dz), colBoxes);
      for (let i = 0; i < colBoxes.length; i += 6) {
        if (fx < colBoxes[i] || fx > colBoxes[i + 3] || fz < colBoxes[i + 2] || fz > colBoxes[i + 5]) continue;
        if (by + colBoxes[i + 4] > top) { top = by + colBoxes[i + 4]; bottom = by + colBoxes[i + 1]; }
      }
    }
    if (top === -Infinity) continue;
    if (top <= yFrom + 1e-6) {
      if (stateOut) stateOut[0] = st;
      return top;
    }
    if (bottom >= y) continue; // overhead (the point is below this block)
    return -Infinity; // the point is deep inside this block
  }
  return -Infinity;
}

/** Height of the first surface (solid or liquid) below a point; `liquid[0]` = 1 if it is a fluid. */
export function surfaceOrFluidBelow(world: World, x: number, z: number, yFrom: number, maxDown: number, out?: number[]): number {
  const bx = Math.floor(x), bz = Math.floor(z);
  const y0 = Math.floor(yFrom);
  for (let y = y0; y >= y0 - maxDown; y--) {
    const st = world.getBlock(bx, y, bz);
    if (!st) continue;
    const id = st >>> 4;
    if (T_LIQUID[id]) {
      if (out) { out[0] = 1; out[1] = st; }
      const above = world.getBlock(bx, y + 1, bz) >>> 4 === id;
      return y + (above ? 1 : (8 - (st & 7)) / 9);
    }
    if (T_SOLID[id]) {
      if (out) { out[0] = 0; out[1] = st; }
      return T_FULL_CUBE[id] ? y + 1 : y + 0.5;
    }
  }
  return -Infinity;
}

/** Water surface height in the column at (x, z) searched downwards from `yFrom` (−Infinity if none). */
export function waterSurface(world: World, x: number, z: number, yFrom: number, maxDown: number): number {
  const bx = Math.floor(x), bz = Math.floor(z);
  const y0 = Math.floor(yFrom);
  for (let y = y0; y >= y0 - maxDown; y--) {
    const st = world.getBlock(bx, y, bz);
    if (!st) continue;
    const id = st >>> 4;
    if (T_LIQUID[id] === 1) {
      const above = world.getBlock(bx, y + 1, bz) >>> 4 === id;
      return y + (above ? 1 : (8 - (st & 7)) / 9);
    }
    if (T_SOLID[id]) return -Infinity;
  }
  return -Infinity;
}

export interface HeliImpact {
  /** Speed into the surface (m/s). */
  speed: number;
  kind: 'skid' | 'gear' | 'body' | 'probe';
  x: number;
  y: number;
  z: number;
}

export interface HeliStepEvents {
  impacts: HeliImpact[];
  /** Downward speed when entering water (0 = no entry this step). */
  splash: number;
}

/** Raw pilot input (keys / mouse), written by the game before each physics step. */
export interface HeliInput {
  up: boolean;
  down: boolean;
  /** Cyclic forward (+1 = W, nose down) and right (+1 = D, bank right). */
  fwd: number;
  right: number;
  /** Pedals: +1 = yaw left (Q), -1 = yaw right (E). */
  pedal: number;
  /** Accumulated mouse yaw (radians, + = left) since the last step. */
  mouseYaw: number;
}

const _q = new THREE.Quaternion();
const _qInv = new THREE.Quaternion();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _back = new THREE.Vector3();
const _F = new THREE.Vector3();
const _T = new THREE.Vector3();
const _Tw = new THREE.Vector3();
const _wW = new THREE.Vector3();
const _r = new THREE.Vector3();
const _p = new THREE.Vector3();
const _vp = new THREE.Vector3();
const _f = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _Iw = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _td = new THREE.Vector3();
const _st = [0, 0];
const _probeBoxes: number[] = [];

export class HeliBody {
  /** Centre of mass (world). */
  readonly c = new THREE.Vector3();
  /** Entity position: c - (0, com.y, 0). */
  readonly pos: THREE.Vector3;
  readonly vel: THREE.Vector3;
  readonly quat = new THREE.Quaternion();
  /** Angular velocity in the body frame (rad/s): x pitch up, y yaw left, z roll left. */
  readonly angVel = new THREE.Vector3();
  readonly box: AABB;
  /** Turbine gas producer speed and rotor speed, 0..~1.05. */
  n1 = 0;
  rpm = 0;
  engineOn = false;
  collective = 0;
  /** Smoothed stick (cyclic) deflection and pedal (for animation). */
  stickX = 0;
  stickY = 0;
  /** Rotor disc tilt relative to the mast (rad, about body X / Z). */
  discX = 0;
  discZ = 0;
  pedalPos = 0;
  headingTarget = 0;
  /** A pilot is at the controls (assists active). */
  piloted = false;
  /** Tests / autopilots: fixed collective instead of the vertical-speed assist. */
  collectiveOverride: number | null = null;
  readonly input: HeliInput = { up: false, down: false, fwd: 0, right: 0, pedal: 0, mouseYaw: 0 };
  /** Per-skid suspension compression (m) and the number of loaded skid points. */
  readonly compression = [0, 0, 0, 0];
  contacts = 0;
  /** Seconds the gear has been loaded (>= 2 points). */
  groundTime = 0;
  /** Rotor hub height above the surface below (solid or fluid), and that surface. */
  agl = Infinity;
  groundY = -Infinity;
  groundState = 0;
  overWater = false;
  /** 0..1 how deep the hull is in water. */
  waterDepth = 0;
  inLava = false;
  thrust = 0;
  ge = 1;
  etl = 1;
  private tailTrim = 0;
  private yawIdle = 0;
  private vsInt = 0;
  private bottomed = [false, false, false, false];
  private probeHit = [false, false, false, false, false];
  readonly events: HeliStepEvents = { impacts: [], splash: 0 };

  /** `pos`, `vel` and `box` may be shared with an entity. */
  constructor(pos = new THREE.Vector3(), vel = new THREE.Vector3(), box = new AABB()) {
    this.pos = pos;
    this.vel = vel;
    this.box = box;
  }

  setPosition(x: number, y: number, z: number) {
    this.pos.set(x, y, z);
    this.c.set(x, y + HELI.com.y, z);
    this.updateBox();
  }

  setHeading(yaw: number) {
    this.quat.setFromAxisAngle(_axis.set(0, 1, 0), yaw);
    this.headingTarget = yaw;
  }

  updateBox() {
    const h = HELI.boxHalf;
    this.box.set(this.pos.x - h, this.pos.y + HELI.boxMinY, this.pos.z - h, this.pos.x + h, this.pos.y + HELI.boxMaxY, this.pos.z + h);
  }

  /** Heading (entity yaw convention: 0 = facing -Z, + = turning left). */
  heading(q = this.quat): number {
    _tmp.set(0, 0, -1).applyQuaternion(q);
    return Math.atan2(-_tmp.x, -_tmp.z);
  }
  /** Pitch (+ nose up) and roll (+ left bank) of the body. */
  pitchAngle(q = this.quat): number {
    _tmp.set(0, 0, -1).applyQuaternion(q);
    return Math.asin(clamp(_tmp.y, -1, 1));
  }
  rollAngle(q = this.quat): number {
    _tmp.set(1, 0, 0).applyQuaternion(q);
    return Math.asin(clamp(_tmp.y, -1, 1));
  }

  /** World position of a body-frame point. */
  toWorld(local: THREE.Vector3, out: THREE.Vector3, q = this.quat, c = this.c): THREE.Vector3 {
    return out.copy(local).sub(HELI.com).applyQuaternion(q).add(c);
  }

  // ------------------------------------------------------------------------------- engine
  private stepEngine(dt: number, upVel: number) {
    // turbine: starter crank to ~22 %, light-off, then accelerate to governed speed
    if (this.engineOn) {
      if (this.n1 < 0.22) this.n1 += 0.17 * dt;
      else this.n1 += (1.0 - this.n1) * Math.min(1, 1.3 * dt);
    } else this.n1 = Math.max(0, this.n1 - (0.03 + this.n1 * 0.55) * dt);
    // rotor: driven through the freewheel clutch, aerodynamic drag, load droop, autorotation
    // the governor holds Nr at N1 while the engine drives; otherwise aerodynamic drag slows it
    if (this.n1 >= this.rpm - 1e-4 && this.n1 > 0.05) this.rpm = Math.min(this.n1, this.rpm + 0.32 * dt);
    else {
      this.rpm -= (0.025 + 0.07 * this.rpm * this.rpm + 0.05 * this.collective * this.rpm) * dt;
      // rotor brake once parked below 50 % Nr
      if (!this.engineOn && this.contacts >= 2 && this.rpm < 0.5) this.rpm -= 0.06 * dt;
    }
    if (upVel < -1 && this.rpm > 0.05) this.rpm += Math.min(-upVel, 25) * 0.012 * (1 - this.collective) * dt;
    this.rpm = clamp(this.rpm, 0, 1.06);
  }

  // ------------------------------------------------------------------------------- step
  step(world: World, dt: number): HeliStepEvents {
    const ev = this.events;
    ev.impacts.length = 0;
    ev.splash = 0;
    const m = HELI.mass, g = HELI.gravity;
    const q = this.quat, w = this.angVel, v = this.vel;
    _right.set(1, 0, 0).applyQuaternion(q);
    _up.set(0, 1, 0).applyQuaternion(q);
    _back.set(0, 0, 1).applyQuaternion(q);
    _wW.copy(w).applyQuaternion(q);
    _qInv.copy(q).invert();
    const vh = Math.hypot(v.x, v.z);
    // ---- environment: surface below the hub, water
    this.toWorld(HELI.hub, _p);
    _st[0] = 0; _st[1] = 0;
    const sy = surfaceOrFluidBelow(world, _p.x, _p.z, _p.y, 24, _st);
    this.groundY = sy;
    this.overWater = sy > -Infinity && _st[0] === 1;
    this.groundState = sy > -Infinity ? _st[1] : 0;
    this.agl = sy > -Infinity ? _p.y - sy : Infinity;
    const ws = waterSurface(world, this.c.x, this.c.z, this.pos.y + HELI.boxMaxY, 4);
    const prevDepth = this.waterDepth;
    this.waterDepth = ws > -Infinity ? clamp((ws - (this.pos.y + 0.15)) / 2.0, 0, 1) : 0;
    if (prevDepth === 0 && this.waterDepth > 0) ev.splash = Math.max(0.5, -v.y);
    const lavaSt = world.getBlock(Math.floor(this.c.x), Math.floor(this.pos.y + 0.3), Math.floor(this.c.z));
    this.inLava = T_LIQUID[lavaSt >>> 4] === 2;
    // ---- engine and rotor
    this.stepEngine(dt, v.y);
    const rpm2 = this.rpm * this.rpm;
    this.ge = groundEffect(this.agl);
    this.etl = translationalLift(vh);
    const Teff = HELI_TMAX * rpm2 * this.ge * this.etl;
    // rotor disc normal: the mast tilted further by the cyclic
    this.discX = -this.stickY * HELI.discTilt;
    this.discZ = -this.stickX * HELI.discTiltLat;
    const cz = Math.cos(this.discZ);
    _td.set(-Math.sin(this.discZ), cz * Math.cos(this.discX), cz * Math.sin(this.discX)).applyQuaternion(q);
    const upY = Math.max(0.35, _td.y);
    // ---- controls
    const psi = this.heading(q);
    const inp = this.input;
    const vbx = v.dot(_right), vby = v.dot(_up), vbz = v.dot(_back);
    let rollTarget = 0, pitchTarget = 0, yawRateDemand = 0;
    if (this.piloted) {
      const k = 1 - Math.exp(-5 * dt);
      this.stickY += (clamp(inp.fwd, -1, 1) - this.stickY) * k;
      this.stickX += (clamp(inp.right, -1, 1) - this.stickX) * k;
      this.pedalPos += (clamp(inp.pedal + inp.mouseYaw * 8, -1, 1) - this.pedalPos) * k;
      // heading target: pedals / mouse move it, idle at speed it follows the nose (fin takes over)
      this.headingTarget += clamp(inp.pedal, -1, 1) * HELI.maxYawRate * dt + inp.mouseYaw;
      const yawActive = inp.pedal !== 0 || Math.abs(inp.mouseYaw) > 1e-5;
      this.yawIdle = yawActive ? 0 : this.yawIdle + dt;
      inp.mouseYaw = 0;
      // fast forward flight: with the pedals idle the heading target follows the nose
      const sf = smoothstep(6, 16, vh);
      const idle = smoothstep(0.2, 0.6, this.yawIdle);
      if (idle > 0 && sf > 0) this.headingTarget = psi + wrapPi(this.headingTarget - psi) * Math.exp(-sf * idle * 4 * dt);
      this.headingTarget = psi + clamp(wrapPi(this.headingTarget - psi), -0.9, 0.9);
      const rHold = clamp(wrapPi(this.headingTarget - psi) * 2.6, -HELI.maxYawRate, HELI.maxYawRate);
      // ...and the tail rotor keeps the nose in the relative wind (no sideslip), so banked turns are coordinated
      const beta = vh > 1 ? Math.atan2(vbx, Math.max(1, -vbz)) : 0;
      const rCoord = clamp(-beta * 3, -HELI.maxYawRate, HELI.maxYawRate);
      yawRateDemand = rHold + (rCoord - rHold) * sf * idle;
      pitchTarget = -this.stickY * HELI.maxPitch;
      rollTarget = -this.stickX * HELI.maxBank;
      // turn coordination: a pedal / mouse yaw demand at speed banks into the turn
      rollTarget += Math.atan((vh * rHold) / g) * smoothstep(5, 15, vh) * 0.9 * (1 - idle);
      rollTarget = clamp(rollTarget, -HELI.maxBankTurn, HELI.maxBankTurn);
      // collective: vertical-speed command with altitude hold and a landing flare
      if (this.collectiveOverride !== null) this.collective = clamp(this.collectiveOverride, 0, 1);
      else {
        const grounded = this.contacts >= 2;
        let cmd: number;
        if (grounded && !inp.up) {
          cmd = 0;
          this.vsInt = 0;
        } else {
          const skidAgl = this.agl - HELI.hub.y;
          const vyT = inp.up ? HELI.climbRate : inp.down ? -clamp(0.9 * skidAgl + 1.0, 1.0, HELI.descentRate) : 0;
          const ceq = Teff > 1 ? HELI_WEIGHT / (Teff * upY) : 1;
          // integrate only near the target (no wind-up while the lever moves)
          const err = vyT - v.y;
          if (Math.abs(err) < 1.2) this.vsInt = clamp(this.vsInt + err * dt, -3, 3);
          else this.vsInt *= Math.exp(-3 * dt);
          cmd = ceq + (HELI.heave * this.rpm * vyT + 2600 * (vyT - v.y) + 900 * this.vsInt) / Math.max(1, Teff * upY);
        }
        cmd = clamp(cmd, 0, 1);
        this.collective += clamp(cmd - this.collective, -1.2 * dt, 1.2 * dt);
      }
    } else {
      this.stickX *= Math.exp(-3 * dt);
      this.stickY *= Math.exp(-3 * dt);
      this.pedalPos *= Math.exp(-3 * dt);
      this.headingTarget = psi;
      if (this.collectiveOverride !== null) this.collective = clamp(this.collectiveOverride, 0, 1);
      else this.collective = Math.max(0, this.collective - 0.6 * dt);
      inp.mouseYaw = 0;
    }
    // ---- forces (world) and torques (body)
    _F.set(0, -m * g, 0);
    _T.set(0, 0, 0);
    // main rotor thrust along the mast + heave damping of the climb rate
    this.thrust = Teff * this.collective;
    _F.addScaledVector(_td, this.thrust);
    _F.addScaledVector(_up, -HELI.heave * (0.12 + 0.88 * this.rpm) * v.y * _up.y);
    // body drag in body axes
    const L = HELI.dragLin, Q = HELI.dragQuad;
    _F.addScaledVector(_right, -(L.x + Q.x * Math.abs(vbx)) * vbx);
    _F.addScaledVector(_up, -(L.y + Q.y * Math.abs(vby)) * vby);
    _F.addScaledVector(_back, -(L.z + Q.z * Math.abs(vbz)) * vbz);
    // weathervane: the tail fin turns the nose into the relative wind
    _T.y += -HELI.weathervane * vbx * Math.hypot(vbx, vbz);
    // aerodynamic angular damping (mostly rotor)
    const ad = 0.3 + 0.7 * this.rpm;
    _T.x -= HELI.angDamp.x * w.x * ad;
    _T.y -= HELI.angDamp.y * w.y * ad;
    _T.z -= HELI.angDamp.z * w.z * ad;
    // main rotor torque reaction (nose right) against a lagging tail-rotor trim
    const Qm = HELI.rotorTorque * rpm2 * (0.1 + this.collective);
    this.tailTrim += (Qm - this.tailTrim) * (1 - Math.exp(-dt / 0.45));
    _T.y -= Qm - this.tailTrim;
    // pilot control torques (attitude command + yaw rate), scaled by rotor speed
    if (this.piloted && this.rpm > 0.02) {
      const eff = Math.min(1, rpm2 * 1.15);
      const theta = this.pitchAngle(q), phi = this.rollAngle(q);
      const I = HELI.inertia, wn = HELI.attFreq, z = HELI.attZeta;
      const lim = HELI.cyclicTorque * eff;
      _T.x += clamp(I.x * wn * wn * (pitchTarget - theta) - 2 * z * wn * I.x * w.x, -lim, lim);
      _T.z += clamp(I.z * wn * wn * 1.2 * (rollTarget - phi) - 2 * z * wn * 1.1 * I.z * w.z, -lim, lim);
      const tl = HELI.tailTorque * eff;
      _T.y += clamp(I.y * 6 * (yawRateDemand - w.y), -tl, tl);
    }
    // ---- skid contacts (spring-damper + friction)
    let contacts = 0;
    for (let i = 0; i < 4; i++) {
      this.toWorld(HELI.skids[i], _p);
      _r.subVectors(_p, this.c);
      _vp.crossVectors(_wW, _r).add(v);
      _st[0] = 0;
      const top = surfaceBelow(world, _p.x, _p.z, _p.y, 0.45, 3, _st);
      const comp = top - _p.y;
      if (!(comp > 0) || comp > 0.6) {
        this.compression[i] = 0;
        this.bottomed[i] = false;
        continue;
      }
      contacts++;
      const vn = _vp.y;
      if (this.compression[i] === 0 && vn < -1) ev.impacts.push({ speed: -vn, kind: 'skid', x: _p.x, y: top, z: _p.z });
      this.compression[i] = comp;
      let N = HELI.skidK * comp - HELI.skidC * vn;
      if (comp > HELI.skidTravel) {
        N += HELI.skidK * 12 * (comp - HELI.skidTravel) - HELI.skidC * 3 * vn;
        if (!this.bottomed[i] && vn < -2) ev.impacts.push({ speed: -vn, kind: 'gear', x: _p.x, y: top, z: _p.z });
        this.bottomed[i] = true;
      } else this.bottomed[i] = false;
      if (N <= 0) continue;
      // Coulomb friction, limited to what stops the sliding point this step
      const vtx = _vp.x, vtz = _vp.z;
      const vt = Math.hypot(vtx, vtz);
      _f.set(0, N, 0);
      if (vt > 1e-5) {
        const ft = Math.min(blockGrip(_st[0]) * N, ((m * 0.22) * vt) / dt);
        _f.x = (-vtx / vt) * ft;
        _f.z = (-vtz / vt) * ft;
      }
      _F.add(_f);
      _Tw.crossVectors(_r, _f);
      _T.add(_Tw.applyQuaternion(_qInv));
    }
    this.contacts = contacts;
    this.groundTime = contacts >= 2 ? this.groundTime + dt : 0;
    // ---- penalty probes (nose, tail, stabiliser tips, tail skid)
    for (let i = 0; i < HELI.probes.length; i++) {
      this.toWorld(HELI.probes[i], _p);
      const pen = probePenetration(world, _p, _tmp);
      if (pen <= 0) { this.probeHit[i] = false; continue; }
      _r.subVectors(_p, this.c);
      _vp.crossVectors(_wW, _r).add(v);
      const vn = _vp.dot(_tmp);
      if (!this.probeHit[i] && vn < -1.5) ev.impacts.push({ speed: -vn, kind: 'probe', x: _p.x, y: _p.y, z: _p.z });
      this.probeHit[i] = true;
      const N = Math.max(0, 120000 * Math.min(pen, 0.4) - 3000 * vn);
      _f.copy(_tmp).multiplyScalar(N);
      // a little friction along the surface
      _vp.addScaledVector(_tmp, -vn);
      const vt = _vp.length();
      if (vt > 1e-4) _f.addScaledVector(_vp, (-0.35 * N) / vt);
      _F.add(_f);
      _Tw.crossVectors(_r, _f);
      _T.add(_Tw.applyQuaternion(_qInv));
    }
    // ---- water: partial buoyancy (sinks slowly), drag; lava burns the hull (entity)
    if (this.waterDepth > 0) {
      const d = this.waterDepth;
      _F.y += d * m * g * 0.8;
      _F.addScaledVector(v, -m * 2.4 * d);
      _T.addScaledVector(w, -6000 * d);
    }
    // ---- integrate
    v.addScaledVector(_F, dt / m);
    const I = HELI.inertia;
    _Iw.set(I.x * w.x, I.y * w.y, I.z * w.z);
    _tmp.crossVectors(w, _Iw);
    w.x += ((_T.x - _tmp.x) / I.x) * dt;
    w.y += ((_T.y - _tmp.y) / I.y) * dt;
    w.z += ((_T.z - _tmp.z) / I.z) * dt;
    const wl = w.length();
    if (wl > 8) w.multiplyScalar(8 / wl);
    if (wl > 1e-9) {
      _q.setFromAxisAngle(_axis.copy(w).divideScalar(wl), wl * dt);
      q.multiply(_q).normalize();
    }
    // ---- move the cabin box through the world
    const dx = v.x * dt, dy = v.y * dt, dz = v.z * dt;
    const r = moveBox(world, this.box, dx, dy, dz, 0, false);
    const mx = this.box.minX + HELI.boxHalf - this.pos.x;
    const my = this.box.minY - HELI.boxMinY - this.pos.y;
    const mz = this.box.minZ + HELI.boxHalf - this.pos.z;
    this.pos.x += mx; this.pos.y += my; this.pos.z += mz;
    this.c.x += mx; this.c.y += my; this.c.z += mz;
    const hitBody = (speed: number) => {
      if (speed > 1) ev.impacts.push({ speed, kind: 'body', x: this.c.x, y: this.c.y, z: this.c.z });
    };
    if (r.collidedY) {
      hitBody(Math.abs(v.y));
      v.y = Math.abs(v.y) > 3 ? -v.y * 0.15 : 0;
      v.x *= 0.85; v.z *= 0.85;
      w.multiplyScalar(0.7);
    }
    if (r.collidedX) {
      hitBody(Math.abs(v.x));
      v.x = Math.abs(v.x) > 3 ? -v.x * 0.2 : 0;
      w.multiplyScalar(0.7);
    }
    if (r.collidedZ) {
      hitBody(Math.abs(v.z));
      v.z = Math.abs(v.z) > 3 ? -v.z * 0.2 : 0;
      w.multiplyScalar(0.7);
    }
    return ev;
  }
}

/**
 * Penetration depth of a point inside a solid block's collision boxes (0 if outside) and the
 * outward normal of the nearest face (written to `n`).
 */
export function probePenetration(world: World, p: THREE.Vector3, n: THREE.Vector3): number {
  const bx = Math.floor(p.x), by = Math.floor(p.y), bz = Math.floor(p.z);
  const st = world.getBlock(bx, by, bz);
  if (!st || !T_SOLID[st >>> 4]) return 0;
  _probeBoxes.length = 0;
  if (T_FULL_CUBE[st >>> 4]) _probeBoxes.push(0, 0, 0, 1, 1, 1);
  else getCollisionBoxes(st, (dx, dy, dz) => world.getBlock(bx + dx, by + dy, bz + dz), _probeBoxes);
  const fx = p.x - bx, fy = p.y - by, fz = p.z - bz;
  let best = 0;
  for (let i = 0; i < _probeBoxes.length; i += 6) {
    const x0 = _probeBoxes[i], y0 = _probeBoxes[i + 1], z0 = _probeBoxes[i + 2];
    const x1 = _probeBoxes[i + 3], y1 = _probeBoxes[i + 4], z1 = _probeBoxes[i + 5];
    if (fx <= x0 || fx >= x1 || fy <= y0 || fy >= y1 || fz <= z0 || fz >= z1) continue;
    // nearest face; faces shared with a solid neighbour are not exits
    const cands: [number, number, number, number][] = [
      [fx - x0, -1, 0, 0], [x1 - fx, 1, 0, 0], [fy - y0, 0, -1, 0], [y1 - fy, 0, 1, 0], [fz - z0, 0, 0, -1], [z1 - fz, 0, 0, 1],
    ];
    let d = Infinity;
    for (const [dist, nx, ny, nz] of cands) {
      if (dist >= d) continue;
      const nb = world.getBlock(bx + nx, by + ny, bz + nz);
      if (nb && T_FULL_CUBE[nb >>> 4]) continue;
      d = dist;
      n.set(nx, ny, nz);
    }
    if (d === Infinity) { d = fy - y0 < y1 - fy ? fy - y0 : y1 - fy; n.set(0, fy - y0 < y1 - fy ? -1 : 1, 0); }
    if (d > best) best = d;
  }
  return best;
}
