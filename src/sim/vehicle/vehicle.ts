// Vehicle runtime: couples the soft-body chassis with wheels (unsprung-mass
// suspension + relaxation-length tires), the drivetrain, driver aids and the
// damage model (deformation zones, glass, lights, mechanical failures and
// tearing wheels off).

import type { World, SubstepController } from '../world.ts';
import { SoftBody, BEAM_BROKEN, BEAM_ATTACH } from '../softbody.ts';
import { buildVehicleStructure, type VehicleStructure, type WheelMountDef, Zone } from './structure.ts';
import type { VehicleDef } from './defs.ts';
import { TireModel, type TireOutput } from './tire.ts';
import { Drivetrain } from './drivetrain.ts';
import { makeRayHit, CF_SPIKES, type RayHit, type Collider } from '../colliders.ts';
import { SURFACES, Surface } from '../surfaces.ts';
import { clamp, extractRotation, mat3FromQuat, mat3FromYaw, quatFromMat3, Rng, valueNoise2 } from '../math.ts';

/** Wheel loads are capped at this multiple of the static wheel load (see stepWheel). */
const WHEEL_FORCE_CAP = 30;

export interface VehicleControls {
  throttle: number;
  brake: number;
  /** -1..1, positive steers left */
  steer: number;
  handbrake: number;
}

export type VehicleEvent =
  | { type: 'partDetached'; part: string; role: string }
  | { type: 'wheelDetached'; wheel: number }
  | { type: 'glass'; window: number; shattered: boolean; x: number; y: number; z: number }
  | { type: 'light'; light: number; x: number; y: number; z: number }
  | { type: 'puncture'; wheel: number }
  | { type: 'engineDamaged'; level: number }
  | { type: 'engineDead' }
  | { type: 'radiator' }
  | { type: 'shift'; gear: number };

const UP_LOCAL = [0, 1, 0];

export class WheelState {
  readonly def: WheelMountDef;
  readonly index: number;
  readonly radius: number;
  readonly width: number;
  readonly mass: number;
  readonly inertia: number;
  readonly front: boolean;
  readonly side: number;
  /** suspension axis in vehicle rest frame (from wheel center to mount) */
  readonly axisLocal = new Float64Array(3);
  readonly restD: number;
  readonly droopLen: number;
  readonly travel: number;
  readonly preload: number;
  /** rest-pose centered positions of mount nodes */
  readonly restRel: Float64Array;
  readonly restCenterLocal = new Float64Array(3);

  // frame
  readonly R = new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  readonly q = new Float64Array([0, 0, 0, 1]);
  readonly mount = new Float64Array(3);
  readonly mountVel = new Float64Array(3);
  readonly forceVel = new Float64Array(3);
  readonly up = new Float64Array([0, 1, 0]);
  readonly fwd = new Float64Array([0, 0, 1]);
  readonly axle = new Float64Array([1, 0, 0]);
  readonly center = new Float64Array(3);

  // suspension state
  d: number;
  wv = 0;
  compression = 0;
  suspForce = 0;
  // spin
  omega = 0;
  angle = 0;
  steer = 0;
  // tire deflection states
  ux = 0;
  uy = 0;
  // contact
  inContact = false;
  hasPlane = false;
  readonly cp = new Float64Array(3);
  readonly cn = new Float64Array([0, 1, 0]);
  readonly cv = new Float64Array(3);
  surface: number = Surface.ASPHALT;
  cflags = 0;
  collider: Collider | null = null;
  depth = 0;
  load = 0;
  kappa = 0;
  alphaT = 0;
  rho = 0;
  fx = 0;
  fy = 0;
  slide = 0;
  queryPhase: number;
  /** wheel center velocity (world) last substep */
  readonly vel = new Float64Array(3);
  // damage
  deflate = 0; // 0..1 target flatness
  flat = 0; // current flatness
  punctured = false;
  toeDamage = 0;
  camberDamage = 0;
  wobble = 0;
  detached = false;
  rimHit = 0;
  peakLoad = 0;
  driveTorque = 0;
  brakeTorque = 0;
  absActive = false;

  constructor(def: WheelMountDef, index: number, vdef: VehicleDef, rest: Float64Array, massSprungCorner: number) {
    this.def = def;
    this.index = index;
    this.front = def.front;
    this.side = def.side;
    const P = vdef.shape;
    this.radius = P.wheelRadius;
    this.width = P.wheelWidth;
    this.mass = vdef.unsprungMass;
    this.inertia = 0.55 * this.mass * this.radius * this.radius * 0.9;
    const susp = def.susp;
    // geometric wheel center & mount
    const cx = def.side * P.track / 2, cy = P.wheelY, cz = def.front ? P.zFrontAxle : P.zRearAxle;
    this.restCenterLocal[0] = cx;
    this.restCenterLocal[1] = cy;
    this.restCenterLocal[2] = cz;
    const mx = def.restMount[0], my = def.restMount[1], mz = def.restMount[2];
    let ax = mx - cx, ay = my - cy, az = mz - cz;
    const l = Math.hypot(ax, ay, az);
    ax /= l; ay /= l; az /= l;
    this.axisLocal[0] = ax;
    this.axisLocal[1] = ay;
    this.axisLocal[2] = az;
    this.restD = l;
    this.travel = susp.travel;
    const cStatic = susp.rideFraction * susp.travel;
    this.droopLen = l + cStatic;
    this.preload = Math.max(0, massSprungCorner * 9.81 / susp.spring - cStatic);
    this.d = l;
    this.queryPhase = index;
    // rest relative coordinates of mount nodes (centered)
    const n = def.nodes.length;
    this.restRel = new Float64Array(n * 3);
    let gx = 0, gy = 0, gz = 0;
    for (let i = 0; i < n; i++) {
      const id = def.nodes[i];
      gx += rest[id * 3];
      gy += rest[id * 3 + 1];
      gz += rest[id * 3 + 2];
    }
    gx /= n; gy /= n; gz /= n;
    for (let i = 0; i < n; i++) {
      const id = def.nodes[i];
      this.restRel[i * 3] = rest[id * 3] - gx;
      this.restRel[i * 3 + 1] = rest[id * 3 + 1] - gy;
      this.restRel[i * 3 + 2] = rest[id * 3 + 2] - gz;
    }
  }

  get effRadius(): number {
    return this.radius - this.flat * 0.075;
  }

  resetState(): void {
    this.d = this.restD;
    this.wv = 0;
    this.omega = 0;
    this.ux = this.uy = 0;
    this.inContact = false;
    this.hasPlane = false;
    this.deflate = this.flat = 0;
    this.punctured = false;
    this.toeDamage = this.camberDamage = this.wobble = 0;
    this.detached = false;
    this.rimHit = 0;
    this.peakLoad = 0;
    this.q[0] = this.q[1] = this.q[2] = 0;
    this.q[3] = 1;
  }
}

export interface DamageState {
  zones: Float64Array; // per Zone id, 0..1
  total: number;
  engine: number;
  radiator: boolean;
  coolant: number;
  temperature: number;
  fuelLeak: boolean;
  steeringOffset: number;
}

let vehicleCounter = 0;

export class Vehicle implements SubstepController {
  readonly id = ++vehicleCounter;
  readonly def: VehicleDef;
  readonly struct: VehicleStructure;
  readonly body: SoftBody;
  readonly world: World;
  readonly wheels: WheelState[];
  readonly tire: TireModel;
  readonly drivetrain: Drivetrain;

  /** Raw driver inputs. */
  readonly input: VehicleControls = { throttle: 0, brake: 0, steer: 0, handbrake: 0 };
  /** Processed controls applied to the car. */
  readonly controls: VehicleControls = { throttle: 0, brake: 0, steer: 0, handbrake: 0 };
  keyboardSteering = true;
  abs = true;
  tractionControl = true;
  /** Damage multiplier (0.25 tough .. 2 fragile) applied to yield/strength on spawn. */
  fragility = 1;
  ai = false;

  // frame (computed per render frame)
  readonly position = new Float64Array(3);
  readonly rotation = new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  readonly quat = new Float64Array([0, 0, 0, 1]);
  readonly velocity = new Float64Array(3);
  readonly angularSpeed = 0;
  speed = 0; // signed forward m/s
  readonly forward = new Float64Array([0, 0, 1]);
  readonly upDir = new Float64Array([0, 1, 0]);

  readonly damage: DamageState = {
    zones: new Float64Array(8),
    total: 0,
    engine: 0,
    radiator: false,
    coolant: 1,
    temperature: 90,
    fuelLeak: false,
    steeringOffset: 0,
  };
  /** 0 intact, 1 cracked, 2 shattered */
  windowState: Uint8Array;
  lightBroken: Uint8Array;
  readonly events: VehicleEvent[] = [];

  /** Uniform aero acceleration applied each substep. */
  private aeroAcc = new Float64Array(3);
  private rayHit: RayHit = makeRayHit();
  private tireOut: TireOutput = { fx: 0, fy: 0, rho: 0, kappa: 0, alpha: 0 };
  private wOmega = new Float64Array(4);
  private wInertia = new Float64Array(4);
  private attached = [true, true, true, true];
  private reverseTimer = 0;
  /** Traction control's throttle multiplier (1 = no intervention). */
  tcFactor = 1;
  private rng = new Rng(1234);
  private substepIndex = 0;
  private restAxleZ: number[];
  private engineRestDist = 0;
  private firewallRestDist = 0;
  private zoneNorm = new Float64Array(8);
  /** Driver/brake lights state */
  braking = false;
  reversing = false;
  headlights = false;
  /** Seconds since spawn */
  age = 0;

  constructor(def: VehicleDef, world: World) {
    this.def = def;
    this.world = world;
    this.struct = buildVehicleStructure(def);
    this.body = this.struct.body;
    this.body.owner = this;
    this.tire = new TireModel(def.tire);
    this.drivetrain = new Drivetrain(def);
    // static corner loads from mass distribution
    const P = def.shape;
    const com = this.body.restCom;
    const wf = clamp((com[2] - P.zRearAxle) / (P.zFrontAxle - P.zRearAxle), 0.2, 0.8);
    const sprung = this.body.totalMass;
    this.wheels = this.struct.wheels.map((w, i) => {
      const corner = (sprung * (w.front ? wf : 1 - wf)) / 2;
      return new WheelState(w, i, def, this.body.rest, corner);
    });
    for (let i = 0; i < 4; i++) this.wInertia[i] = this.wheels[i].inertia;
    this.windowState = new Uint8Array(this.struct.windows.length);
    this.lightBroken = new Uint8Array(this.struct.lights.length);
    this.restAxleZ = [P.zFrontAxle, P.zRearAxle];
    this.engineRestDist = this.avgDist(this.struct.radiatorNodes, this.struct.engineNodes, true);
    this.firewallRestDist = this.avgDist(this.struct.firewallNodes, this.struct.engineNodes, true);
    // zone normalization: number of beams per zone
    for (let b = 0; b < this.body.m; b++) this.zoneNorm[this.body.bZone[b]] += 1;
    for (let i = 0; i < 8; i++) this.zoneNorm[i] = Math.max(1, this.zoneNorm[i]);
  }

  private avgDist(a: number[], b: number[], rest: boolean): number {
    if (!a.length || !b.length) return 0;
    const p = rest ? this.body.rest : this.body.pos;
    let ax = 0, ay = 0, az = 0, bx = 0, by = 0, bz = 0;
    for (const i of a) {
      ax += p[i * 3]; ay += p[i * 3 + 1]; az += p[i * 3 + 2];
    }
    for (const i of b) {
      bx += p[i * 3]; by += p[i * 3 + 1]; bz += p[i * 3 + 2];
    }
    ax /= a.length; ay /= a.length; az /= a.length;
    bx /= b.length; by /= b.length; bz /= b.length;
    return Math.hypot(ax - bx, ay - by, az - bz);
  }

  // ------------------------------------------------------------------ spawn

  /** Fully repair and place the vehicle with its ground point at (x, y, z) facing yaw. */
  spawn(x: number, y: number, z: number, yaw: number, speed = 0): void {
    const body = this.body;
    body.resetStructure();
    this.applyFragility();
    const R = mat3FromYaw(yaw);
    const vx = Math.sin(yaw) * speed, vz = Math.cos(yaw) * speed;
    body.place(R, x, y + 0.03, z, vx, 0, vz);
    this.world.liftClear(body, 0.03);
    for (const w of this.wheels) {
      w.resetState();
      w.omega = speed / w.radius;
      quatFromMat3(R, w.q);
    }
    quatFromMat3(R, this.quat);
    quatFromMat3(R, body.fitQuat);
    this.drivetrain.reset();
    this.windowState.fill(0);
    this.lightBroken.fill(0);
    const d = this.damage;
    d.zones.fill(0);
    d.total = 0;
    d.engine = 0;
    d.radiator = false;
    d.coolant = 1;
    d.temperature = 90;
    d.fuelLeak = false;
    d.steeringOffset = 0;
    this.attached = [true, true, true, true];
    this.events.length = 0;
    this.age = 0;
    body.brokenBeams.length = 0;
    body.deformEnergy = 0;
    this.world.refreshCandidates(body);
    this.frameUpdate(0);
  }

  private applyFragility(): void {
    const f = this.fragility;
    if (f === 1) return;
    const b = this.body;
    for (let i = 0; i < b.m; i++) {
      b.bYC[i] = b.bYC0[i] / f;
      b.bYT[i] = b.bYT0[i] / f;
    }
    if (!this._strength0) this._strength0 = Float64Array.from(b.bStr);
    for (let i = 0; i < b.m; i++) b.bStr[i] = this._strength0[i] / f;
  }
  private _strength0: Float64Array | null = null;

  /** Repair and set upright at the current location, keeping heading. */
  resetInPlace(): void {
    const fx = this.forward[0], fz = this.forward[2];
    const yaw = Math.atan2(fx, fz);
    const x = this.position[0], z = this.position[2];
    const y = this.world.spawnHeight(x, z, this.position[1]);
    this.spawn(x, y + 0.15, z, yaw);
  }

  get attachedWheels(): boolean[] {
    return this.attached;
  }

  // ------------------------------------------------------------------ per frame

  /** Called once per render frame with the frame's (scaled) dt. */
  frameUpdate(dt: number): void {
    this.age += dt;
    const body = this.body;
    // vehicle frame from cabin floor nodes
    const T = _t3;
    body.fitRigid(this.struct.refNodes, this.rotation, T, this.quat);
    this.position[0] = T[0];
    this.position[1] = T[1];
    this.position[2] = T[2];
    body.averageVelocity(this.velocity, this.struct.refNodes);
    const R = this.rotation;
    this.forward[0] = R[2]; this.forward[1] = R[5]; this.forward[2] = R[8];
    this.upDir[0] = R[1]; this.upDir[1] = R[4]; this.upDir[2] = R[7];
    const v = this.velocity;
    this.speed = v[0] * this.forward[0] + v[1] * this.forward[1] + v[2] * this.forward[2];

    if (dt <= 0) return;
    this.processControls(dt);

    // aero
    const sp = Math.hypot(v[0], v[1], v[2]);
    const a = this.def.aero;
    const rho = 1.2;
    const dragK = (0.5 * rho * a.cd * a.area * sp) / body.totalMass;
    const liftK = (0.5 * rho * a.area * a.lift * sp * sp) / body.totalMass;
    this.aeroAcc[0] = -dragK * v[0] + this.upDir[0] * liftK;
    this.aeroAcc[1] = -dragK * v[1] + this.upDir[1] * liftK;
    this.aeroAcc[2] = -dragK * v[2] + this.upDir[2] * liftK;

    // gearbox
    const dtn = this.drivetrain;
    let wsum = 0, wn = 0;
    let sliding = false;
    for (let i = 0; i < 4; i++) {
      const w = this.wheels[i];
      if (dtn.share[i] > 0 && !w.detached) {
        wsum += w.omega;
        wn++;
        if (w.kappa > 0.3) sliding = true;
      }
    }
    const wheelRpm = wn ? Math.abs(wsum / wn) * 60 / (2 * Math.PI) : 0;
    const prevGear = dtn.gear;
    dtn.autoShift(this.controls.throttle, Math.min(wheelRpm, Math.abs(this.speed) / this.wheels[0].radius * 60 / (2 * Math.PI) * 1.15 + 50), sliding, this.controls.brake > 0.1);
    if (dtn.pendingGear !== prevGear && dtn.shiftTimer > 0 && dtn.shiftTimer === this.def.trans.shiftTime) {
      this.events.push({ type: 'shift', gear: dtn.pendingGear });
    }

    this.updateDamage(dt);
  }

  private processControls(dt: number): void {
    const inp = this.input, c = this.controls;
    const dtn = this.drivetrain;
    // steering
    const speedAbs = Math.abs(this.speed);
    let target = clamp(inp.steer, -1, 1);
    if (this.keyboardSteering) {
      const lim = 1 / (1 + speedAbs / 22);
      target *= Math.max(lim, 0.22);
      const rate = Math.abs(target) > Math.abs(c.steer) && Math.sign(target) === Math.sign(c.steer) ? 2.6 : 5.5;
      c.steer += clamp(target - c.steer, -rate * dt, rate * dt);
    } else {
      const lim = 1 / (1 + speedAbs / 60);
      c.steer = target * lim;
    }
    // auto reverse mapping
    let thr = inp.throttle, brk = inp.brake;
    if (dtn.gear >= 0) {
      if (this.speed < 0.8 && inp.brake > 0.2 && inp.throttle < 0.05) {
        this.reverseTimer += dt;
        if (this.reverseTimer > 0.3 && dtn.automatic) {
          dtn.shift(-1);
          this.reverseTimer = 0;
        }
      } else this.reverseTimer = 0;
      if (dtn.gear === 0 && dtn.automatic && inp.throttle > 0.05) dtn.shift(1);
    } else {
      // reverse: S accelerates backward, W brakes
      thr = inp.brake;
      brk = inp.throttle;
      if (this.speed > -0.8 && inp.throttle > 0.2 && inp.brake < 0.05) {
        this.reverseTimer += dt;
        if (this.reverseTimer > 0.15) {
          dtn.shift(1);
          this.reverseTimer = 0;
        }
      } else this.reverseTimer = 0;
    }
    // traction control: an integral controller holding the driven wheels just
    // past the tire's peak slip (cut fast, restore gently), instead of an
    // on/off cut that bogs the engine and lets the wheels shudder
    if (this.tractionControl && thr > 0) {
      let maxK = 0;
      for (let i = 0; i < 4; i++) if (dtn.share[i] > 0 && this.wheels[i].inContact) maxK = Math.max(maxK, this.wheels[i].kappa * Math.sign(dtn.ratio() || 1));
      const err = maxK - this.def.tire.kappaPeak * 1.3;
      if (err > 0) this.tcFactor -= Math.min(err, 0.3) * 18 * dt;
      else this.tcFactor += 1.2 * dt;
      this.tcFactor = clamp(this.tcFactor, 0.25, 1);
    } else this.tcFactor = 1;
    // the drivetrain applies it: clutch torque while pulling away, throttle after
    dtn.tcLimit = this.tcFactor;
    c.throttle = thr;
    c.brake = brk;
    c.handbrake = inp.handbrake;
    this.braking = brk > 0.05;
    this.reversing = dtn.gear < 0;
  }

  // ------------------------------------------------------------------ substep

  applyForces(dt: number): void {
    const body = this.body;
    if (!body.active || body.sleeping) return;
    this.substepIndex++;
    // aero on all nodes
    const frc = body.frc, mass = body.mass;
    const ax = this.aeroAcc[0], ay = this.aeroAcc[1], az = this.aeroAcc[2];
    if (ax !== 0 || ay !== 0 || az !== 0) {
      for (let i = 0; i < body.n; i++) {
        const m = mass[i];
        frc[i * 3] += m * ax;
        frc[i * 3 + 1] += m * ay;
        frc[i * 3 + 2] += m * az;
      }
    }
    // drivetrain uses wheel speeds from the previous substep
    for (let i = 0; i < 4; i++) {
      this.wOmega[i] = this.wheels[i].omega;
      this.attached[i] = !this.wheels[i].detached;
    }
    this.drivetrain.step(dt, this.controls.throttle, this.wOmega, this.wInertia, this.attached, this.rng.next());

    // suspension compressions for anti-roll bars
    const w = this.wheels;
    const arbF = this.def.suspFront.arb, arbR = this.def.suspRear.arb;
    const cFL = w[0].detached ? 0 : w[0].droopLen - w[0].d;
    const cFR = w[1].detached ? 0 : w[1].droopLen - w[1].d;
    const cRL = w[2].detached ? 0 : w[2].droopLen - w[2].d;
    const cRR = w[3].detached ? 0 : w[3].droopLen - w[3].d;
    const fArbF = arbF * (cFL - cFR);
    const fArbR = arbR * (cRL - cRR);
    const arb = [fArbF, -fArbF, fArbR, -fArbR];

    for (let i = 0; i < 4; i++) {
      const wh = w[i];
      if (wh.detached) continue;
      this.stepWheel(wh, dt, arb[i]);
    }
  }

  private stepWheel(wh: WheelState, dt: number, arbForce: number): void {
    const body = this.body;
    const pos = body.pos, vel = body.vel, frc = body.frc;
    const def = wh.def;
    const nodes = def.nodes;
    const nn = nodes.length;
    const mw = def.mountW, fw = def.forceW;

    // ---- mount frame (rigid fit of mount nodes) every other substep
    let mx = 0, my = 0, mz = 0, vmx = 0, vmy = 0, vmz = 0, vcx = 0, vcy = 0, vcz = 0;
    let gx = 0, gy = 0, gz = 0;
    for (let k = 0; k < nn; k++) {
      const id3 = nodes[k] * 3;
      const px = pos[id3], py = pos[id3 + 1], pz = pos[id3 + 2];
      const a = mw[k], f = fw[k];
      mx += a * px; my += a * py; mz += a * pz;
      vmx += a * vel[id3]; vmy += a * vel[id3 + 1]; vmz += a * vel[id3 + 2];
      vcx += f * vel[id3]; vcy += f * vel[id3 + 1]; vcz += f * vel[id3 + 2];
      gx += px; gy += py; gz += pz;
    }
    if ((this.substepIndex + wh.index) % 2 === 0) {
      gx /= nn; gy /= nn; gz /= nn;
      const A = _A9;
      A.fill(0);
      const rr = wh.restRel;
      for (let k = 0; k < nn; k++) {
        const id3 = nodes[k] * 3;
        const px = pos[id3] - gx, py = pos[id3 + 1] - gy, pz = pos[id3 + 2] - gz;
        const qx = rr[k * 3], qy = rr[k * 3 + 1], qz = rr[k * 3 + 2];
        A[0] += px * qx; A[1] += px * qy; A[2] += px * qz;
        A[3] += py * qx; A[4] += py * qy; A[5] += py * qz;
        A[6] += pz * qx; A[7] += pz * qy; A[8] += pz * qz;
      }
      extractRotation(A, wh.q, 2);
      mat3FromQuat(wh.q, wh.R);
    }
    const R = wh.R;
    wh.mount[0] = mx; wh.mount[1] = my; wh.mount[2] = mz;
    wh.mountVel[0] = vmx; wh.mountVel[1] = vmy; wh.mountVel[2] = vmz;
    // suspension axis
    const al = wh.axisLocal;
    const ux = R[0] * al[0] + R[1] * al[1] + R[2] * al[2];
    const uy = R[3] * al[0] + R[4] * al[1] + R[5] * al[2];
    const uz = R[6] * al[0] + R[7] * al[1] + R[8] * al[2];
    wh.up[0] = ux; wh.up[1] = uy; wh.up[2] = uz;
    // wheel heading: steer + toe + damage
    const toe = -wh.side * this.def.suspFront.toe * (wh.front ? 1 : 0) + wh.toeDamage + (wh.front ? this.damage.steeringOffset : 0);
    const wob = wh.wobble > 0 ? Math.sin(wh.angle) * wh.wobble : 0;
    const delta = wh.steer + toe + wob;
    const sd = Math.sin(delta), cd = Math.cos(delta);
    // local fwd (sd, 0, cd), axle (cd, 0, -sd)
    const fx = R[0] * sd + R[2] * cd, fy = R[3] * sd + R[5] * cd, fz = R[6] * sd + R[8] * cd;
    const axx = R[0] * cd - R[2] * sd, axy = R[3] * cd - R[5] * sd, axz = R[6] * cd - R[8] * sd;
    wh.fwd[0] = fx; wh.fwd[1] = fy; wh.fwd[2] = fz;
    wh.axle[0] = axx; wh.axle[1] = axy; wh.axle[2] = axz;

    // wheel center
    let d = wh.d;
    const cx = mx - ux * d, cy = my - uy * d, cz = mz - uz * d;
    wh.center[0] = cx; wh.center[1] = cy; wh.center[2] = cz;

    // ---- contact query
    wh.queryPhase++;
    if (wh.queryPhase % 4 === 0 || !wh.hasPlane) this.queryContact(wh, cx, cy, cz, ux, uy, uz, fx, fy, fz, axx, axy, axz);

    // ---- suspension forces
    const staticLoad = (this.body.totalMass * 9.81) / 4;
    const susp = def.susp;
    const vmu = vmx * ux + vmy * uy + vmz * uz;
    const comp = wh.droopLen - d;
    const compVel = -(vmu - wh.wv);
    let fs = susp.spring * (comp + wh.preload);
    if (fs < 0) fs = 0;
    const fd = compVel > 0 ? susp.bump * compVel : susp.rebound * compVel;
    let fbs = 0;
    const bsStart = wh.travel - 0.03;
    if (comp > bsStart) {
      const e = comp - bsStart;
      fbs = susp.spring * 8 * e + susp.spring * 300 * e * e + susp.bump * 2 * Math.max(compVel, 0);
    }
    const fSusp = fs + fd + fbs + arbForce;
    wh.compression = comp;
    wh.suspForce = fSusp;

    // ---- tire
    let ftx = 0, fty = 0, ftz = 0;
    let fn = 0;
    // perpendicular chassis velocity at wheel center + wheel's own vertical velocity
    const vcu = vcx * ux + vcy * uy + vcz * uz;
    const wvx = vcx - ux * vcu + ux * wh.wv;
    const wvy = vcy - uy * vcu + uy * wh.wv;
    const wvz = vcz - uz * vcu + uz * wh.wv;
    wh.vel[0] = wvx; wh.vel[1] = wvy; wh.vel[2] = wvz;
    const Reff = wh.effRadius;
    wh.inContact = false;
    wh.load = 0;
    if (wh.hasPlane) {
      const n0 = wh.cn[0], n1 = wh.cn[1], n2 = wh.cn[2];
      const dist = (cx - wh.cp[0]) * n0 + (cy - wh.cp[1]) * n1 + (cz - wh.cp[2]) * n2;
      const depth = Reff - dist;
      wh.depth = depth;
      if (depth > 0) {
        const rvx = wvx - wh.cv[0], rvy = wvy - wh.cv[1], rvz = wvz - wh.cv[2];
        const ddot = -(rvx * n0 + rvy * n1 + rvz * n2);
        const tdef = this.def.tire;
        const kt = tdef.stiffness * (1 - wh.flat * 0.6);
        fn = kt * depth + tdef.damping * ddot;
        const rimDepth = this.def.shape.wheelRadius * (this.def.features.tireProfile ?? 0.5) * 0.42 * (1 - wh.flat * 0.85);
        if (depth > rimDepth) {
          const e = depth - rimDepth;
          fn += kt * 12 * e + tdef.damping * 4 * Math.max(ddot, 0);
          wh.rimHit = Math.max(wh.rimHit, e);
        }
        if (fn < 0) fn = 0;
        if (fn > wh.peakLoad) wh.peakLoad = fn;
        // past this the rim and suspension bend instead of passing the load on
        if (fn > WHEEL_FORCE_CAP * staticLoad) fn = WHEEL_FORCE_CAP * staticLoad;
        // contact frame: f_c = normalize(axle x n), l_c = n x f_c
        let lfx = axy * n2 - axz * n1, lfy = axz * n0 - axx * n2, lfz = axx * n1 - axy * n0;
        const lfl = Math.hypot(lfx, lfy, lfz);
        if (fn > 0 && lfl > 1e-6) {
          wh.inContact = true;
          lfx /= lfl; lfy /= lfl; lfz /= lfl;
          const llx = n1 * lfz - n2 * lfy, lly = n2 * lfx - n0 * lfz, llz = n0 * lfy - n1 * lfx;
          const vx = rvx * lfx + rvy * lfy + rvz * lfz;
          const vy = rvx * llx + rvy * lly + rvz * llz;
          const avx = Math.abs(vx);
          const slip = wh.omega * Reff - vx;
          wh.ux += (slip - (avx * wh.ux) / tdef.relaxLong) * dt;
          wh.uy += (-vy - (avx * wh.uy) / tdef.relaxLat) * dt;
          const kap = wh.ux / tdef.relaxLong;
          const tal = wh.uy / tdef.relaxLat;
          const surf = SURFACES[wh.surface];
          const fz0 = staticLoad;
          const loadSens = clamp(1 - 0.09 * (fn / fz0 - 1), 0.7, 1.12);
          const mu = tdef.mu * surf.grip * loadSens * (1 - wh.flat * 0.5);
          const fnTire = Math.min(fn, fz0 * 6);
          const out = this.tire.forces(kap, tal, fnTire, mu, this.tireOut);
          let tfx = out.fx, tfy = out.fy;
          // low-speed damping of the contact patch spring
          const fade = clamp(1 - avx / 3, 0, 1);
          if (fade > 0) {
            const cl = fnTire * 1.2 * fade;
            tfx += cl * slip * 0.3;
            tfy -= cl * vy * 0.3;
            const lim = mu * fnTire;
            const m2 = Math.hypot(tfx, tfy);
            if (m2 > lim) {
              tfx *= lim / m2;
              tfy *= lim / m2;
            }
          }
          if (out.rho > 3.5) {
            const s = 3.5 / out.rho;
            wh.ux *= s;
            wh.uy *= s;
          }
          wh.kappa = kap;
          wh.alphaT = tal;
          wh.rho = out.rho;
          wh.fx = tfx;
          wh.fy = tfy;
          wh.slide = out.rho > 1 ? Math.hypot(slip, vy) : 0;
          wh.load = fn;
          ftx = n0 * fn + lfx * tfx + llx * tfy;
          fty = n1 * fn + lfy * tfx + lly * tfy;
          ftz = n2 * fn + lfz * tfx + llz * tfy;
          if (wh.cflags & CF_SPIKES && !wh.punctured) {
            wh.punctured = true;
            wh.deflate = 1;
            this.events.push({ type: 'puncture', wheel: wh.index });
          }
          // rolling resistance
          const rr = (tdef.rolling + surf.rolling + wh.flat * 0.05) * fn * Reff;
          wh.omega -= clamp(wh.omega * 20, -1, 1) * rr * dt / wh.inertia;
        }
      }
    }
    if (!wh.inContact) {
      wh.ux *= 1 - Math.min(1, 30 * dt);
      wh.uy *= 1 - Math.min(1, 30 * dt);
      wh.fx = wh.fy = 0;
      wh.slide = 0;
      wh.rho = 0;
    }

    // ---- unsprung mass along axis
    const ftu = ftx * ux + fty * uy + ftz * uz;
    const g = this.world.gravity;
    wh.wv += ((ftu - fSusp + wh.mass * g * uy) / wh.mass) * dt;
    let ddot = vmu - wh.wv;
    d += ddot * dt;
    let impulse = 0;
    const dMin = wh.droopLen - wh.travel;
    if (d < dMin) {
      d = dMin;
      const rel = wh.wv - vmu;
      if (rel > 0) {
        impulse = wh.mass * rel;
        wh.wv = vmu;
      }
    } else if (d > wh.droopLen) {
      d = wh.droopLen;
      const rel = wh.wv - vmu;
      if (rel < 0) {
        impulse = wh.mass * rel;
        wh.wv = vmu;
      }
    }
    ddot = 0;
    wh.d = d;

    // ---- chassis forces
    // An end-stop impulse lands on a few light mount nodes within one substep;
    // capped, the excess goes into bending the suspension instead of flinging
    // those nodes off the car.
    let fm = fSusp + impulse / dt;
    if (Math.abs(fm) > wh.peakLoad) wh.peakLoad = Math.abs(fm);
    const fCap = WHEEL_FORCE_CAP * staticLoad;
    if (fm > fCap) fm = fCap;
    else if (fm < -fCap) fm = -fCap;
    const fmx = ux * fm, fmy = uy * fm, fmz = uz * fm;
    const fpx = ftx - ux * ftu, fpy = fty - uy * ftu, fpz = ftz - uz * ftu;
    for (let k = 0; k < nn; k++) {
      const id3 = nodes[k] * 3;
      const a = mw[k], f = fw[k];
      frc[id3] += a * fmx + f * fpx;
      frc[id3 + 1] += a * fmy + f * fpy;
      frc[id3 + 2] += a * fmz + f * fpz;
    }

    // ---- spin
    const tq = this.drivetrain.wheelTorque[wh.index];
    wh.driveTorque = tq;
    let brakeT = this.controls.brake * (wh.front ? this.def.brakes.front : this.def.brakes.rear);
    if (this.abs && this.def.brakes.abs && brakeT > 0 && wh.inContact && Math.abs(this.speed) > 2) {
      const kp = this.def.tire.kappaPeak;
      const kk = wh.kappa * Math.sign(this.speed || 1);
      if (kk < -kp) {
        wh.absActive = true;
        brakeT *= clamp(1 - (-kk - kp) / (kp * 0.8), 0.1, 1);
      } else wh.absActive = false;
    } else wh.absActive = false;
    if (!wh.front) brakeT += this.controls.handbrake * this.def.brakes.handbrake;
    wh.brakeTorque = brakeT;
    const wFree = wh.omega + ((tq - wh.fx * Reff) * dt) / wh.inertia;
    const bstep = (brakeT * dt) / wh.inertia;
    if (Math.abs(wFree) <= bstep) wh.omega = 0;
    else wh.omega = wFree - Math.sign(wFree) * bstep;
    if (wh.omega > 400) wh.omega = 400;
    else if (wh.omega < -400) wh.omega = -400;
    wh.angle += wh.omega * dt;
    if (wh.angle > 1e4 || wh.angle < -1e4) wh.angle %= Math.PI * 2;
    // flat tire progression
    if (wh.flat < wh.deflate) wh.flat = Math.min(wh.deflate, wh.flat + dt * 0.6);
  }

  private queryContact(
    wh: WheelState,
    cx: number, cy: number, cz: number,
    ux: number, uy: number, uz: number,
    fx: number, fy: number, fz: number,
    axx: number, axy: number, axz: number,
  ): void {
    const R = wh.effRadius;
    const maxT = R + 0.12;
    const hit = this.rayHit;
    const cands = this.body.candidates as Collider[];
    let best = -Infinity;
    let sx = 0, sy = 0, sz = 0, wsum = 0;
    let bpx = 0, bpy = 0, bpz = 0, bsurf: number = Surface.ASPHALT, bflags = 0, bvx = 0, bvy = 0, bvz = 0;
    let bcol: Collider | null = null;
    const halfW = wh.width * 0.38;
    for (let lat = -1; lat <= 1; lat += 2) {
      const ox = cx + axx * halfW * lat, oy = cy + axy * halfW * lat, oz = cz + axz * halfW * lat;
      for (let k = 0; k < ANGLES.length; k++) {
        const s = ANGLE_S[k], c = ANGLE_C[k];
        // direction: -up*c + fwd*s
        const dx = -ux * c + fx * s, dy = -uy * c + fy * s, dz = -uz * c + fz * s;
        if (!this.world.raycast(ox, oy, oz, dx, dy, dz, maxT, hit, cands, true)) continue;
        const pen = R - hit.t;
        if (pen < -0.1) continue;
        // radial normal blended with surface normal for the near-vertical rays
        const blend = Math.abs(ANGLES[k]) < 0.01 ? 1 : 0.35;
        let nx = -dx * (1 - blend) + hit.nx * blend;
        let ny = -dy * (1 - blend) + hit.ny * blend;
        let nz = -dz * (1 - blend) + hit.nz * blend;
        const nl = Math.hypot(nx, ny, nz) || 1;
        nx /= nl; ny /= nl; nz /= nl;
        const w = Math.max(pen + 0.1, 0.001) ** 2;
        sx += nx * w; sy += ny * w; sz += nz * w;
        wsum += w;
        if (pen > best) {
          best = pen;
          bpx = ox + dx * hit.t;
          bpy = oy + dy * hit.t;
          bpz = oz + dz * hit.t;
          bsurf = hit.surface;
          bflags = hit.flags;
          bvx = hit.vx; bvy = hit.vy; bvz = hit.vz;
          bcol = hit.collider;
        }
      }
    }
    if (wsum === 0) {
      wh.hasPlane = false;
      wh.collider = null;
      return;
    }
    const nl = Math.hypot(sx, sy, sz) || 1;
    sx /= nl; sy /= nl; sz /= nl;
    // plane through the deepest hit with the combined normal
    wh.hasPlane = true;
    // project contact point so that plane distance equals R - best from the center
    const distC = R - best;
    wh.cp[0] = cx - sx * distC;
    wh.cp[1] = cy - sy * distC;
    wh.cp[2] = cz - sz * distC;
    wh.cn[0] = sx; wh.cn[1] = sy; wh.cn[2] = sz;
    wh.cv[0] = bvx; wh.cv[1] = bvy; wh.cv[2] = bvz;
    wh.surface = bsurf;
    wh.cflags = bflags;
    wh.collider = bcol;
    void bpx; void bpy; void bpz;
    // surface roughness: small bumps fixed to the ground, so a moving tire
    // feels them at a rate set by its speed and a parked car stays still
    const rough = SURFACES[bsurf].roughness;
    if (rough > 0) {
      const gx = wh.cp[0], gz = wh.cp[2];
      const n = (valueNoise2(gx * 2.7, gz * 2.7, 71) * 0.65 + valueNoise2(gx * 7.3, gz * 7.3, 72) * 0.35) * 0.5 * rough;
      wh.cp[0] += sx * n;
      wh.cp[1] += sy * n;
      wh.cp[2] += sz * n;
    }
  }

  // ------------------------------------------------------------------ damage

  private updateDamage(dt: number): void {
    const body = this.body;
    const st = this.struct;
    // zones
    const zs = _zones;
    zs.fill(0);
    const L = body.bL, L0 = body.bL0, Z = body.bZone, F = body.bFlags;
    for (let b = 0; b < body.m; b++) {
      const strain = Math.abs(L[b] - L0[b]) / L0[b];
      zs[Z[b]] += F[b] & BEAM_BROKEN ? 0.5 : Math.min(strain, 0.5);
    }
    let total = 0;
    for (let z = 1; z < 8; z++) {
      const v = clamp((zs[z] / this.zoneNorm[z]) * 6, 0, 1);
      this.damage.zones[z] = v;
      total += v;
    }
    this.damage.total = clamp(total / 3, 0, 1);

    // detached parts
    for (let p = 0; p < body.parts.length; p++) {
      const part = body.parts[p];
      if (part.detached || part.attachBeams.length === 0) continue;
      let broken = 0;
      for (const b of part.attachBeams) if (F[b] & BEAM_BROKEN) broken++;
      if (broken / part.attachBeams.length >= part.detachRatio) {
        part.detached = true;
        // break remaining attachments and disable bridging triangles
        for (const b of part.attachBeams) body.breakBeam(b);
        for (let b = 0; b < body.m; b++) {
          if (body.bPart[b] === p && body.bFlags[b] & (BEAM_ATTACH | 2)) body.breakBeam(b);
        }
        for (let t = 0; t < body.t; t++) {
          if (body.tPart[t] !== p) continue;
          const pa = body.nodePart[body.tA[t]], pb = body.nodePart[body.tB[t]], pc = body.nodePart[body.tC[t]];
          if (pa !== p || pb !== p || pc !== p) body.tEnabled[t] = 0;
        }
        this.events.push({ type: 'partDetached', part: part.name, role: part.role });
      }
    }

    // windows: break when the frame deforms plastically or a hard impact lands close by
    st.windows.forEach((w, i) => {
      if (this.windowState[i] === 2) return;
      const strain = this.maxStrain(w.beams);
      // laminated glass cracks early but holds together until the frame is badly bent
      const crackAt = w.laminated ? 0.012 : 0.022;
      const shatterAt = w.laminated ? 0.09 : 0.03;
      let impactNear = false;
      const cen = this.nodeCenter(w.nodes);
      if (body.impactSpeed > 10) {
        const dx = cen[0] - body.impactX, dy = cen[1] - body.impactY, dz = cen[2] - body.impactZ;
        impactNear = dx * dx + dy * dy + dz * dz < 0.55 * 0.55;
      }
      if (strain > shatterAt || (impactNear && body.impactSpeed > (w.laminated ? 26 : 13))) {
        this.windowState[i] = 2;
        this.events.push({ type: 'glass', window: i, shattered: true, x: cen[0], y: cen[1], z: cen[2] });
      } else if (this.windowState[i] === 0 && (strain > crackAt || impactNear)) {
        if (w.laminated) {
          this.windowState[i] = 1;
          this.events.push({ type: 'glass', window: i, shattered: false, x: cen[0], y: cen[1], z: cen[2] });
        } else if (strain > crackAt) {
          this.windowState[i] = 2;
          this.events.push({ type: 'glass', window: i, shattered: true, x: cen[0], y: cen[1], z: cen[2] });
        }
      }
    });
    // lights
    st.lights.forEach((l, i) => {
      if (this.lightBroken[i]) return;
      const strain = this.maxStrain(l.beams);
      let impactNear = false;
      const c = this.nodeCenter(l.nodes);
      if (body.impactSpeed > 7) {
        const dx = c[0] - body.impactX, dy = c[1] - body.impactY, dz = c[2] - body.impactZ;
        impactNear = dx * dx + dy * dy + dz * dz < 0.4 * 0.4;
      }
      if (strain > 0.025 || impactNear) {
        this.lightBroken[i] = 1;
        this.events.push({ type: 'light', light: i, x: c[0], y: c[1], z: c[2] });
      }
    });

    // engine / radiator intrusion
    const d = this.damage;
    if (st.radiatorNodes.length && this.engineRestDist > 0) {
      const cur = this.avgDist(st.radiatorNodes, st.engineNodes, false);
      const intrusion = this.engineRestDist - cur;
      if (intrusion > 0.09 && !d.radiator) {
        d.radiator = true;
        this.events.push({ type: 'radiator' });
      }
      const fw = this.firewallRestDist - this.avgDist(st.firewallNodes, st.engineNodes, false);
      const lvl = clamp(Math.max((intrusion - 0.18) / 0.3, (fw - 0.08) / 0.25), 0, 1);
      if (lvl > d.engine + 0.02) {
        d.engine = lvl;
        this.events.push({ type: 'engineDamaged', level: lvl });
      }
    }
    // engine mounts torn
    let mountBroken = 0, mountTotal = 0;
    const ep = st.partIds.engine;
    for (let b = 0; b < body.m; b++) {
      if (body.bPart[b] !== ep) continue;
      const pa = body.nodePart[body.bA[b]], pb = body.nodePart[body.bB[b]];
      if (pa === pb) continue;
      mountTotal++;
      if (F[b] & BEAM_BROKEN) mountBroken++;
    }
    if (mountTotal && mountBroken / mountTotal > 0.5) d.engine = Math.max(d.engine, 0.8);
    // overheating
    if (d.radiator && this.drivetrain.running) {
      d.coolant = Math.max(0, d.coolant - dt * 0.02);
      const heat = (this.drivetrain.rpm / this.def.engine.redline) * (0.6 + this.drivetrain.appliedThrottle);
      d.temperature += dt * (heat * 4 * (1.2 - d.coolant) - (d.temperature - 90) * 0.02 * d.coolant);
      if (d.temperature > 125) d.engine = Math.min(1, d.engine + dt * 0.012);
    } else {
      d.temperature += (90 - d.temperature) * dt * 0.05;
    }
    const health = 1 - d.engine;
    if (this.drivetrain.health > 0.05 && health <= 0.05) this.events.push({ type: 'engineDead' });
    this.drivetrain.health = health;

    // fuel tank
    if (!d.fuelLeak && st.fuelTankNodes.length) {
      let maxS = 0;
      for (let b = 0; b < body.m; b++) {
        if (body.bZone[b] !== Zone.REAR) continue;
        if (!st.fuelTankNodes.includes(body.bA[b]) && !st.fuelTankNodes.includes(body.bB[b])) continue;
        maxS = Math.max(maxS, Math.abs(L[b] - L0[b]) / L0[b]);
      }
      if (maxS > 0.1) d.fuelLeak = true;
    }

    // wheels: impact damage, bent suspension, detachment
    for (const wh of this.wheels) {
      if (wh.detached) continue;
      const staticLoad = (body.totalMass * 9.81) / 4;
      const peak = wh.peakLoad / staticLoad;
      if (wh.rimHit > 0.01) {
        const sev = wh.rimHit;
        wh.wobble = Math.min(0.05, wh.wobble + sev * 0.08);
        if (!wh.punctured && sev > 0.03 && this.rng.next() < 0.5) {
          wh.punctured = true;
          wh.deflate = 0.7 + this.rng.next() * 0.3;
          this.events.push({ type: 'puncture', wheel: wh.index });
        }
      }
      if (peak > 9) {
        const sev = (peak - 9) / 30;
        wh.toeDamage += (this.rng.next() - 0.5) * sev * 0.08;
        wh.camberDamage += (this.rng.next() - 0.3) * sev * 0.1;
      }
      let broken = 0;
      const mb = wh.def.mountBeams;
      for (let k = 0; k < mb.length; k++) if (F[mb[k]] & BEAM_BROKEN) broken++;
      const tornOff = (mb.length > 0 && broken / mb.length > 0.35) || peak > 75 * this.fragilityFactor();
      if (tornOff) {
        wh.detached = true;
        this.events.push({ type: 'wheelDetached', wheel: wh.index });
      }
      wh.rimHit = 0;
      wh.peakLoad = 0;
    }
    // front wheel alignment feeds steering offset
    d.steeringOffset = (this.wheels[0].toeDamage + this.wheels[1].toeDamage) * 0.3;

    body.impactSpeed = 0;
  }

  private fragilityFactor(): number {
    return 1 / Math.max(0.25, this.fragility);
  }

  /** Max plastic strain (or 1 if broken) among beams. */
  maxStrain(beams: number[]): number {
    const b = this.body;
    let m = 0;
    for (const i of beams) {
      if (b.bFlags[i] & BEAM_BROKEN) return 1;
      const s = Math.abs(b.bL[i] - b.bL0[i]) / b.bL0[i];
      if (s > m) m = s;
    }
    return m;
  }

  /** Max relative change of pairwise distances among nodes vs rest pose. */
  distortion(nodes: number[]): number {
    const p = this.body.pos, r = this.body.rest;
    let m = 0;
    for (let a = 0; a < nodes.length; a++) {
      const i = nodes[a] * 3;
      for (let c = a + 1; c < nodes.length; c++) {
        const j = nodes[c] * 3;
        const d = Math.hypot(p[i] - p[j], p[i + 1] - p[j + 1], p[i + 2] - p[j + 2]);
        const d0 = Math.hypot(r[i] - r[j], r[i + 1] - r[j + 1], r[i + 2] - r[j + 2]);
        if (d0 < 1e-6) continue;
        const s = Math.abs(d - d0) / d0;
        if (s > m) m = s;
      }
    }
    return m;
  }

  nodeCenter(nodes: number[]): [number, number, number] {
    const p = this.body.pos;
    let x = 0, y = 0, z = 0;
    for (const n of nodes) {
      x += p[n * 3]; y += p[n * 3 + 1]; z += p[n * 3 + 2];
    }
    const k = nodes.length || 1;
    return [x / k, y / k, z / k];
  }

  /** Set steering angles per wheel from processed controls (Ackermann). */
  preSubstep(): void {
    const c = this.controls;
    const maxA = this.def.steering.maxAngle;
    const a = c.steer * maxA;
    const P = this.def.shape;
    const L = P.zFrontAxle - P.zRearAxle;
    const tw = P.track;
    const ack = this.def.steering.ackermann;
    let aL = a, aR = a;
    if (Math.abs(a) > 1e-4) {
      const r = L / Math.tan(Math.abs(a));
      const inner = Math.atan(L / (r - tw / 2));
      const outer = Math.atan(L / (r + tw / 2));
      const s = Math.sign(a);
      // left turn (a>0): left wheel is inner
      const innerA = s * (Math.abs(a) + (inner - Math.abs(a)) * ack);
      const outerA = s * (Math.abs(a) + (outer - Math.abs(a)) * ack);
      if (a > 0) {
        aL = innerA;
        aR = outerA;
      } else {
        aR = innerA;
        aL = outerA;
      }
    }
    this.wheels[0].steer = aL;
    this.wheels[1].steer = aR;
    void this.restAxleZ;
  }

  /** World-space wheel transform for rendering: returns center and basis. */
  wheelTransform(i: number, outPos: Float64Array, outRot: Float64Array): void {
    const w = this.wheels[i];
    outPos.set(w.center);
    // basis: axle (X), up-ish (Y), fwd (Z) orthonormalized
    const ax = w.axle, fw = w.fwd;
    let upx = fw[1] * ax[2] - fw[2] * ax[1];
    let upy = fw[2] * ax[0] - fw[0] * ax[2];
    let upz = fw[0] * ax[1] - fw[1] * ax[0];
    const ul = Math.hypot(upx, upy, upz) || 1;
    upx /= ul; upy /= ul; upz /= ul;
    outRot[0] = ax[0]; outRot[1] = upx; outRot[2] = fw[0];
    outRot[3] = ax[1]; outRot[4] = upy; outRot[5] = fw[1];
    outRot[6] = ax[2]; outRot[7] = upz; outRot[8] = fw[2];
  }
}

const ANGLES = [-1.2, -0.75, -0.38, 0, 0.38, 0.75, 1.2];
const ANGLE_S = ANGLES.map(Math.sin);
const ANGLE_C = ANGLES.map(Math.cos);
const _A9 = new Float64Array(9);
const _t3 = new Float64Array(3);
const _zones = new Float64Array(8);
void UP_LOCAL;
