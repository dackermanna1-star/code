/**
 * The player's car: a custom Havok raycast vehicle.
 *
 *  - Chassis: one dynamic body with a compound box shape (layer CAR), mass
 *    from the car def, center of mass dropped low and inertia set by hand.
 *  - Wheels: 4 rays cast from the suspension mounts along -up (WORLD|DEBRIS
 *    only). Spring + damper + bump stop produce the load; tire forces are a
 *    simple arcade model: drive / brake / coast along the wheel heading and an
 *    impulse-style lateral grip clamped by load * mu with a slip curve, so it
 *    holds a line but can drift (more with the handbrake).
 *  - Air: no wheel or body contact for > 0.1 s. Pitch/roll control steer the
 *    angular velocity toward a target rate. Flips are counted by integrating
 *    the body-axis angular velocity while airborne.
 *  - Damage: collision callbacks measure the pre-step normal speed of each
 *    impact; hard hits hurt, emit events, dent the model and knock panels off
 *    as real debris bodies.
 *
 * Forces are applied in update(), called from scene.onBeforePhysicsObservable
 * by Run (or the sandbox). Public state is refreshed after each physics step.
 */
import {
  Mesh,
  PhysicsAggregate,
  PhysicsBody,
  PhysicsMotionType,
  PhysicsRaycastResult,
  PhysicsShapeBox,
  PhysicsShapeContainer,
  PhysicsShapeType,
  Quaternion,
  Vector3,
  type IPhysicsCollisionEvent,
  type Observer,
  type PhysicsEngineV2,
  type AbstractMesh,
  type TransformNode,
  type Scene,
} from "@babylonjs/core";
import { Debug } from "../core/Debug";
import type { GameContext, IVehicle, VehicleAnchors, WheelState } from "../core/types";
import type { CarDef } from "../data/cars";
import type { CarStats, Loadout } from "../data/parts";
import { Shadows } from "../fx/Shadows";
import { CollideWith, Layer, WHEEL_RAY_MASK } from "../physics/Layers";
import type { WheelGeometry } from "./CarGeometry";
import { buildCarModel, type CarModel } from "./CarModel";
import { registerTuning, Tuning } from "./Tuning";

const G = 9.81;
/** Gear upshift points as fractions of top speed (5 gears). */
const GEARS = [0, 0.16, 0.34, 0.54, 0.76, 1.08];
const TWO_PI = Math.PI * 2;
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

interface WheelSim {
  mountLocal: Vector3;
  mountWorld: Vector3;
  contact: Vector3;
  normal: Vector3;
  pointVel: Vector3;
  hitBody: PhysicsBody | null;
  grounded: boolean;
  length: number; // current suspension length
  load: number; // N
  cushion: number; // N, pre-touchdown landing softener
  spin: number; // rad
  spinRate: number; // rad/s
  front: boolean;
  left: boolean;
}

interface Debris {
  mesh: AbstractMesh;
  agg: PhysicsAggregate;
  age: number;
}

export class Vehicle implements IVehicle {
  readonly chassis: Mesh;
  readonly model: CarModel;
  readonly body: PhysicsBody;
  fuel: number;
  boost: number;
  health: number;
  readonly position = new Vector3();
  readonly velocity = new Vector3();
  readonly forward = new Vector3(0, 0, 1);
  readonly up = new Vector3(0, 1, 0);
  /** World right axis of the chassis. */
  readonly right = new Vector3(1, 0, 0);
  /** World angular velocity (rad/s). */
  readonly angularVelocity = new Vector3();
  forwardSpeed = 0;
  airborne = false;
  wrecked = false;
  damageLevel = 0;
  readonly anchors: VehicleAnchors;
  readonly wheels: WheelState[] = [];
  throttle = 0;
  boosting = false;
  rpm = 0;
  /** 1..5 simulated gear. */
  gear = 1;
  /** Current front wheel steer angle (rad). */
  steerAngle = 0;
  /** Seconds in the air for the current jump. */
  airTime = 0;
  /** Number of wheels touching the ground. */
  groundedCount = 0;

  private shape: PhysicsShapeContainer;
  private geo: WheelGeometry;
  private sim: WheelSim[] = [];
  private mass: number;
  private inertia = new Vector3();
  private pe: PhysicsEngineV2;
  private ray = new PhysicsRaycastResult();
  private rayQuery: { membership: number; collideWith: number; ignoreBody?: PhysicsBody };
  private collisionObs: Observer<IPhysicsCollisionEvent> | null = null;
  private afterPhysicsObs: Observer<Scene> | null = null;
  private disposed = false;

  // control / sim state
  private steerInput = 0;
  private shiftCut = 0;
  private noGroundTime = 0;
  private bodyContact = 0;
  private flipPitch = 0;
  private flipRoll = 0;
  private flipYaw = 0;
  private stuckTime = 0;
  /** Seconds since touchdown while a landing is being judged, -1 otherwise. */
  private touchdown = -1;
  private landMaxWheels = 0;
  private landDirty = false;
  private scrapeCooldown = 0;
  private impactCooldown = 0;
  private pending = { v: 0, mass: 1, point: new Vector3(), normal: new Vector3() };
  private debris: Debris[] = [];
  private maxDebris: number;
  /** Vertical distance from the COM down to the bottom of a fully extended wheel. */
  private comToWheelBottom: number;
  private lastImpact = 0;
  /** Down-probe length from the chassis center that counts as touching the ground. */
  private contactProbe: number;

  // pre-step snapshot used by collision callbacks
  private prevVel = new Vector3();
  private prevAng = new Vector3();
  private com = new Vector3();
  private prevCom = new Vector3();

  // temps (no per-frame allocation)
  private t0 = new Vector3();
  private t1 = new Vector3();
  private t2 = new Vector3();
  private t3 = new Vector3();
  private fwdW = new Vector3();
  private sideW = new Vector3();
  private force = new Vector3();
  private applyAt = new Vector3();
  private torque = new Vector3();

  constructor(
    private ctx: GameContext,
    readonly def: CarDef,
    loadout: Loadout,
    readonly stats: CarStats,
    spawn: { position: Vector3; yaw: number },
  ) {
    const scene = ctx.scene;
    this.pe = scene.getPhysicsEngine() as PhysicsEngineV2;
    this.mass = def.mass * (1 + loadout.armor * 0.04);
    registerTuning();

    // --- visuals ---------------------------------------------------------------
    this.model = buildCarModel(scene, def, loadout, stats);
    this.geo = this.model.geometry;

    // --- chassis + spawn on the ground ---------------------------------------------
    this.chassis = new Mesh("chassis", scene);
    this.chassis.isPickable = false;
    this.chassis.rotationQuaternion = Quaternion.FromEulerAngles(0, spawn.yaw, 0);
    const from = spawn.position.add(new Vector3(0, 8, 0));
    const to = spawn.position.add(new Vector3(0, -30, 0));
    this.pe.raycastToRef(from, to, this.ray, { collideWith: WHEEL_RAY_MASK });
    const groundY = this.ray.hasHit ? this.ray.hitPointWorld.y : spawn.position.y - 1;
    this.chassis.position.set(spawn.position.x, Math.max(spawn.position.y, groundY - this.geo.groundY + 0.05), spawn.position.z);
    this.model.root.parent = this.chassis;

    // --- physics body -----------------------------------------------------------------
    this.shape = new PhysicsShapeContainer(scene);
    const lo = new Vector3(Infinity, Infinity, Infinity);
    const hi = new Vector3(-Infinity, -Infinity, -Infinity);
    for (const b of this.model.collision) {
      const c = new Vector3(...b.center);
      const s = new Vector3(...b.size);
      const box = new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), s, scene);
      box.filterMembershipMask = Layer.CAR;
      box.filterCollideMask = CollideWith.CAR;
      box.material = { friction: 0.35, restitution: 0.08 };
      this.shape.addChild(box, c);
      lo.minimizeInPlace(c.subtract(s.scale(0.5)));
      hi.maximizeInPlace(c.add(s.scale(0.5)));
    }
    this.shape.filterMembershipMask = Layer.CAR;
    this.shape.filterCollideMask = CollideWith.CAR;
    this.body = new PhysicsBody(this.chassis, PhysicsMotionType.DYNAMIC, false, scene);
    this.body.shape = this.shape;
    const ext = hi.subtract(lo);
    this.contactProbe = Math.max(-lo.y, hi.y, ext.x / 2) + 0.25;
    const k = (this.mass / 12) * Tuning.inertia;
    this.inertia.set(k * (ext.y * ext.y + ext.z * ext.z), k * (ext.x * ext.x + ext.z * ext.z), k * (ext.x * ext.x + ext.y * ext.y) * 1.3);
    // NB: Havok takes the inertia *per unit mass* (see computeMassProperties()).
    const comY = -def.size.height / 2 + 0.08;
    this.comToWheelBottom = comY - (this.geo.mountY - this.geo.rideHeight - this.geo.radius);
    this.body.setMassProperties({
      mass: this.mass,
      centerOfMass: new Vector3(0, comY, 0),
      inertia: this.inertia.scale(1 / this.mass),
      inertiaOrientation: Quaternion.Identity(),
    });
    this.body.setLinearDamping(0.01);
    this.body.setAngularDamping(0.12);
    this.body.setCollisionCallbackEnabled(true);
    this.collisionObs = this.body.getCollisionObservable().add((e) => this.onCollision(e));
    this.rayQuery = { membership: Layer.CAR, collideWith: WHEEL_RAY_MASK, ignoreBody: this.body };

    // --- wheels -----------------------------------------------------------------------
    for (let i = 0; i < 4; i++) {
      this.sim.push({
        mountLocal: this.geo.mounts[i].clone(),
        mountWorld: new Vector3(),
        contact: new Vector3(),
        normal: new Vector3(0, 1, 0),
        pointVel: new Vector3(),
        hitBody: null,
        grounded: false,
        length: this.geo.restLength,
        load: 0,
        cushion: 0,
        spin: 0,
        spinRate: 0,
        front: i < 2,
        left: i % 2 === 0,
      });
      this.wheels.push({ grounded: false, contact: new Vector3(), slip: 0, compression: 0 });
    }

    const a = this.model.anchors;
    this.anchors = { smoke: a.smoke, boost: a.boost, weapon: a.weapon, exhaust: a.exhaust, wheels: this.model.wheels };
    this.fuel = stats.fuel;
    this.boost = stats.boostCapacity;
    this.health = stats.health;
    const q = ctx.save.data.settings.quality;
    this.maxDebris = q === "low" ? 4 : q === "medium" ? 8 : 12;

    Shadows.cast(this.chassis, true);
    this.afterPhysicsObs = scene.onAfterPhysicsObservable.add(() => this.afterStep());
    this.readState();
    this.afterStep();
  }

  // ---------------------------------------------------------------------------
  // Per-step simulation

  update(dt: number): void {
    if (dt <= 0 || this.disposed) return;
    const body = this.body;
    const inp = this.ctx.input.state;
    const st = this.stats;
    const geo = this.geo;
    const T = Tuning;
    this.readState();

    const live = !this.wrecked;
    const throttleIn = live ? inp.throttle : 0;
    const brakeIn = live ? inp.brake : 0;
    const steerIn = live ? inp.steer : 0;
    const handbrake = live && inp.handbrake;
    const hasFuel = this.fuel > 0;

    // --- steering (speed sensitive, slewed) ------------------------------------
    const rate = Math.abs(steerIn) > Math.abs(this.steerInput) && Math.sign(steerIn) === Math.sign(this.steerInput) ? T.steerRate : T.steerReturn;
    this.steerInput += clamp(steerIn - this.steerInput, -rate * dt, rate * dt);
    const speedFrac = clamp(Math.abs(this.forwardSpeed) / st.topSpeed, 0, 1);
    // Speed-sensitive lock: never ask for (much) more cornering than the tires
    // can give, so full steer at speed carves instead of scrubbing / spinning.
    const v2 = Math.max(1, this.forwardSpeed * this.forwardSpeed);
    const gripLock = Math.atan((T.steerGripRatio * T.grip * st.grip * G * this.def.wheelBase) / v2);
    const maxSteer = clamp(gripLock, T.steerHigh, T.steerLow);
    this.steerAngle = this.steerInput * maxSteer;

    // --- engine / brakes ------------------------------------------------------------
    const fwd = this.forwardSpeed;
    let drive = 0;
    let brakeDecel = 0;
    let appliedThrottle = 0;
    if (throttleIn > 0) {
      if (fwd < -0.8) brakeDecel = T.brakeDecel * throttleIn;
      else if (hasFuel) {
        const s = clamp(fwd / st.topSpeed, 0, 1.2);
        drive = st.enginePower * T.power * throttleIn * Math.max(0, 1 - Math.pow(s, 2.4));
        appliedThrottle = throttleIn;
      }
    }
    if (brakeIn > 0) {
      if (fwd > 0.8) brakeDecel = Math.max(brakeDecel, T.brakeDecel * brakeIn);
      else if (throttleIn <= 0 && hasFuel) {
        drive = -st.enginePower * T.power * T.reversePower * brakeIn * Math.max(0, 1 - Math.abs(fwd) / T.reverseSpeed);
        appliedThrottle = brakeIn;
      }
    }
    // simulated gearbox: brief torque cut on upshift
    const sAbs = Math.abs(fwd) / st.topSpeed;
    let gear = 1;
    while (gear < 5 && sAbs > GEARS[gear]) gear++;
    if (gear > this.gear && appliedThrottle > 0) this.shiftCut = 0.12;
    this.gear = gear;
    if (this.shiftCut > 0) {
      this.shiftCut -= dt;
      drive *= 0.4;
    }
    this.throttle = appliedThrottle;

    // --- pass 1: suspension rays + springs ---------------------------------------------------
    const mPerWheel = this.mass / 4;
    const kSpring = def_k(this.def.suspensionStiffness * T.stiffness, mPerWheel);
    const cDamp = def_k(this.def.suspensionDamping * T.damping, mPerWheel);
    const rayLen = geo.rideHeight + geo.radius;
    const maxSusp = this.mass * G * 3.5; // per wheel clamp (keeps landings sane)
    const maxCushion = this.mass * G * 1.6;
    // Look ahead by the distance the car will drop this step, so a fast landing
    // is caught by the springs instead of the chassis slamming into the ground
    // (one physics step per frame can be 0.5 m of travel at low frame rates).
    const sink = Math.max(0, -Vector3.Dot(this.velocity, this.up)) * dt * 1.5;
    let grounded = 0;
    let sumLoad = 0;
    for (let i = 0; i < 4; i++) {
      const w = this.sim[i];
      Vector3.TransformCoordinatesToRef(w.mountLocal, this.chassis.getWorldMatrix(), w.mountWorld);
      this.up.scaleToRef(-(rayLen + sink), this.t0);
      w.mountWorld.addToRef(this.t0, this.t1);
      this.ray.reset();
      this.pe.raycastToRef(w.mountWorld, this.t1, this.ray, this.rayQuery);
      w.load = 0;
      w.cushion = 0;
      const dist = this.ray.hasHit ? Vector3.Distance(w.mountWorld, this.ray.hitPointWorld) : Infinity;
      const wasGrounded = w.grounded;
      w.grounded = dist <= rayLen;
      if (!w.grounded) {
        w.hitBody = null;
        w.length = Math.min(geo.rideHeight, w.length + dt * 4);
        if (dist < Infinity) {
          // about to touch down: soften the approach over the remaining gap + travel
          this.pointVelocity(this.ray.hitPointWorld, w.pointVel);
          const vIn = -Vector3.Dot(w.pointVel, this.up);
          const room = dist - geo.radius;
          if (vIn > 2) w.cushion = Math.min(maxCushion, (mPerWheel * vIn * vIn) / (2 * Math.max(0.1, room)) * 0.35);
        }
        continue;
      }
      grounded++;
      w.length = clamp(dist - geo.radius, 0, geo.rideHeight);
      w.contact.copyFrom(this.ray.hitPointWorld);
      w.normal.copyFrom(this.ray.hitNormalWorld);
      w.hitBody = this.ray.body ?? null;
      this.pointVelocity(w.contact, w.pointVel);
      const comp = 1 - w.length / geo.rideHeight;
      const vIn = -Vector3.Dot(w.pointVel, this.up); // >0 compressing
      let f = kSpring * (geo.rideHeight - w.length);
      if (comp > 0.75) f += kSpring * T.bumpStop * (comp - 0.75) * geo.rideHeight * 4;
      f += cDamp * vIn;
      // predictive bump stop: never run out of travel on a hard landing
      if (vIn > 2 && (!wasGrounded || comp > 0.85)) f = Math.max(f, (mPerWheel * vIn * vIn) / (2 * Math.max(0.06, w.length + 0.05)) + mPerWheel * G);
      f = clamp(f, 0, maxSusp);
      w.load = f;
    }
    // anti-roll bars
    for (let a = 0; a < 4; a += 2) {
      const L = this.sim[a];
      const R = this.sim[a + 1];
      if (!L.grounded || !R.grounded) continue;
      const diff = (R.length - L.length) / geo.rideHeight; // >0: left more compressed
      const f = T.antiRoll * kSpring * geo.rideHeight * diff;
      L.load = Math.max(0, L.load + f);
      R.load = Math.max(0, R.load - f);
    }
    for (let i = 0; i < 4; i++) {
      const w = this.sim[i];
      if (w.cushion > 0) {
        this.up.scaleToRef(w.cushion, this.force);
        body.applyForce(this.force, w.mountWorld);
      }
      if (!w.grounded || w.load <= 0) continue;
      sumLoad += w.load;
      this.up.scaleToRef(w.load, this.force);
      body.applyForce(this.force, w.mountWorld);
      this.pushHitBody(w, this.force);
    }

    // --- pass 2: tires ------------------------------------------------------------------------
    const mu = T.grip * st.grip;
    const cosS = Math.cos(this.steerAngle);
    const sinS = Math.sin(this.steerAngle);
    const staticLoad = this.mass * G * 0.25;
    for (let i = 0; i < 4; i++) {
      const w = this.sim[i];
      const ws = this.wheels[i];
      const comp = w.grounded ? 1 - w.length / geo.rideHeight : 0;
      ws.grounded = w.grounded;
      ws.compression = comp;
      if (!w.grounded || w.load <= 0 || sumLoad <= 0) {
        ws.slip = 0;
        // free wheels: spin up with throttle, slowly spin down
        const target = (drive !== 0 ? Math.sign(drive) * 40 : 0) * (w.front ? 0 : 1);
        w.spinRate += (target - w.spinRate) * Math.min(1, dt * (target ? 2 : 0.6));
        continue;
      }
      ws.contact.copyFrom(w.contact);
      // wheel heading projected on the ground plane
      const n = w.normal;
      if (w.front) {
        this.forward.scaleToRef(cosS, this.fwdW);
        this.right.scaleToRef(sinS, this.t0);
        this.fwdW.addInPlace(this.t0);
      } else this.fwdW.copyFrom(this.forward);
      n.scaleToRef(Vector3.Dot(this.fwdW, n), this.t0);
      this.fwdW.subtractInPlace(this.t0).normalize();
      Vector3.CrossToRef(n, this.fwdW, this.sideW); // n x fwd = right-hand side in Babylon's LH frame
      this.sideW.normalize();
      if (Vector3.Dot(this.sideW, this.right) < 0) this.sideW.scaleInPlace(-1);

      const vLong = Vector3.Dot(w.pointVel, this.fwdW);
      const vLat = Vector3.Dot(w.pointVel, this.sideW);
      const share = w.load / sumLoad;
      const mShare = this.mass * share;
      const load = Math.min(w.load, staticLoad * 1.8);
      const rearHb = handbrake && !w.front;

      // longitudinal
      let fLong = drive * share;
      let decel = brakeDecel;
      if (rearHb) decel = Math.max(decel, T.brakeDecel * 1.2);
      if (fLong === 0 && decel === 0) decel = Math.abs(fwd) < 0.4 && throttleIn === 0 ? T.brakeDecel : T.coastDecel;
      if (decel > 0) {
        const fb = Math.min(decel * mShare, (mShare * Math.abs(vLong)) / dt);
        fLong -= Math.sign(vLong) * fb;
      }
      // lateral: kill a fraction of the slip velocity, clamped by grip & slip curve
      const slipAngle = Math.atan2(Math.abs(vLat), Math.max(Math.abs(vLong), 2));
      const curve = slipAngle < 0.14 ? 1 : Math.max(0.7, 1 - (slipAngle - 0.14) * 0.8);
      const gripLat = load * mu * curve * (rearHb ? T.handbrakeGrip : 1);
      const want = (-vLat * mPerWheel * T.lateralStiffness) / dt;
      let fLat = clamp(want, -gripLat, gripLat);
      // friction circle
      const maxF = load * mu * (rearHb ? 0.7 : 1.05);
      const mag = Math.hypot(fLong, fLat);
      let slip = 0;
      if (mag > maxF && mag > 0) {
        const k = maxF / mag;
        fLong *= k;
        fLat *= k;
        slip = clamp((mag - maxF) / maxF, 0, 1);
      }
      slip = Math.max(slip, clamp((Math.abs(want) - gripLat) / (gripLat + 1), 0, 1), rearHb ? clamp(Math.abs(vLong) / 10, 0, 1) : 0);
      ws.slip = slip;

      this.fwdW.scaleToRef(fLong, this.force);
      this.sideW.scaleToRef(fLat, this.t0);
      this.force.addInPlace(this.t0);
      // apply lifted toward the COM so tire forces roll the body less
      this.com.subtractToRef(w.contact, this.t1);
      const h = Vector3.Dot(this.t1, this.up);
      this.up.scaleToRef(h * T.forceLift, this.t1);
      w.contact.addToRef(this.t1, this.applyAt);
      body.applyForce(this.force, this.applyAt);
      this.pushHitBody(w, this.force);

      // wheel spin: roll with the ground, spin up when driving hard / lock with handbrake
      let rateTarget = vLong / geo.radius;
      if (rearHb) rateTarget = 0;
      else if (slip > 0.3 && drive !== 0) rateTarget += Math.sign(drive) * slip * 20;
      w.spinRate = rateTarget;
    }
    this.groundedCount = grounded;

    // --- yaw stability: steer the yaw rate toward what the wheels ask for ------------
    // (keeps landings and bumps from spinning the car; weaker with the handbrake
    // so it can still be thrown into a drift)
    if (grounded >= 2) {
      const yawRate = Vector3.Dot(this.angularVelocity, this.up);
      const yawCap = (T.grip * st.grip * G * 1.1) / Math.max(2, Math.abs(fwd));
      const want = clamp((fwd * Math.tan(this.steerAngle)) / this.def.wheelBase, -yawCap, yawCap);
      const gain = T.yawStability * (handbrake ? 0.15 : 1) * (grounded / 4);
      const acc = clamp((want - yawRate) * gain, -5, 5);
      this.up.scaleToRef(acc * this.inertia.y, this.torque);
      body.applyTorque(this.torque);
    }

    // --- downforce + aero drag --------------------------------------------------------------------
    if (grounded >= 2) {
      const df = this.mass * G * T.downforce * speedFrac * speedFrac;
      this.up.scaleToRef(-df, this.force);
      body.applyForce(this.force, this.com);
    }
    const sp = this.velocity.length();
    if (sp > 0.5) {
      this.velocity.scaleToRef(-T.airDrag * this.mass * sp, this.force);
      body.applyForce(this.force, this.com);
    }

    // --- air state + air control ----------------------------------------------------------------
    if (this.bodyContact > 0) this.bodyContact -= dt;
    if (grounded === 0 && this.bodyContact <= 0 && this.up.y < 0.5) {
      // Resting bodies can fall asleep and stop reporting contacts (car on its
      // roof): probe straight down from the chassis center as a backup.
      this.t1.copyFrom(this.position);
      this.t1.y -= this.contactProbe;
      this.ray.reset();
      this.pe.raycastToRef(this.position, this.t1, this.ray, this.rayQuery);
      if (this.ray.hasHit) this.bodyContact = 0.05;
    }
    if (grounded === 0 && this.bodyContact <= 0) this.noGroundTime += dt;
    else this.noGroundTime = 0;
    const nowAir = this.noGroundTime > 0.1;
    if (nowAir && !this.airborne) this.takeOff();
    else if (!nowAir && this.airborne) this.land();
    this.airborne = nowAir;
    this.updateTouchdown(dt, grounded);
    if (nowAir) {
      this.airTime += dt;
      const wp = Vector3.Dot(this.angularVelocity, this.right);
      const wr = Vector3.Dot(this.angularVelocity, this.forward);
      const wy = Vector3.Dot(this.angularVelocity, this.up);
      this.flipPitch += wp * dt;
      this.flipRoll += wr * dt;
      this.flipYaw += wy * dt;
      if (live) {
        // landing assist: shortly before touchdown, ease the chassis parallel
        // to the ground (only when roughly upright, so flips still count)
        let assist = 0;
        if (this.up.y > 0.35) {
          this.t1.copyFrom(this.com);
          this.t1.y -= 30;
          this.ray.reset();
          this.pe.raycastToRef(this.com, this.t1, this.ray, this.rayQuery);
          if (this.ray.hasHit) {
            const h = this.com.y - this.ray.hitPointWorld.y - this.comToWheelBottom; // gap under the wheels
            const vDown = Math.max(1.5, -this.velocity.y);
            const tHit = Math.max(0, h) / vDown;
            assist = clamp(1 - (tHit - 0.12) / 0.38, 0, 1) * T.landingAssist;
            if (assist > 0) {
              Vector3.CrossToRef(this.up, this.ray.hitNormalWorld, this.t0); // axis * sin(err)
              this.t0.scaleInPlace(5); // target angular velocity
              this.t0.subtractInPlace(this.angularVelocity);
              const ap = clamp(Vector3.Dot(this.t0, this.right) * 6, -14, 14) * assist;
              const ar = clamp(Vector3.Dot(this.t0, this.forward) * 6, -14, 14) * assist;
              this.right.scaleToRef(ap * this.inertia.x, this.torque);
              this.forward.scaleToRef(ar * this.inertia.z, this.t0);
              this.torque.addInPlace(this.t0);
              body.applyTorque(this.torque);
            }
          }
        }
        const auth = clamp((this.airTime - 0.12) / 0.45, 0, 1) * st.airControl * (1 - assist * 0.8);
        const maxAcc = 7;
        // Conventions: nose up = rotation about -right, roll right = about -forward.
        // Pitch: S (nose down) is a free rotation rate -> front flips. W doubles as
        // the throttle, so while it is held it only holds a modest nose-up
        // attitude instead of looping the car onto its roof; with no input the
        // car levels itself. A pitch-up without throttle (gamepad stick) is free.
        const pitchIn = inp.pitch;
        const pitchFree = pitchIn < 0 || (pitchIn > 0 && inp.throttle <= 0);
        const rollFree = inp.roll !== 0;
        // attitude to hold: level, nose up while W is held, leaning with steer
        const hold = this.airHoldRate(pitchFree ? 0 : pitchIn * T.airNoseUp, inp.steer * T.airLean);
        const wpTarget = pitchFree ? -pitchIn * T.airPitchRate : clamp(Vector3.Dot(hold, this.right), -T.airPitchRate, T.airPitchRate);
        const wrTarget = rollFree
          ? -clamp(inp.roll + inp.steer, -1, 1) * T.airRollRate
          : clamp(Vector3.Dot(hold, this.forward), -T.airRollRate, T.airRollRate);
        const aP = clamp((wpTarget - wp) * T.airGain, -maxAcc, maxAcc) * auth;
        const aR = clamp((wrTarget - wr) * T.airGain, -maxAcc, maxAcc) * auth;
        const aY = -wy * T.airYawDamp;
        this.right.scaleToRef(aP * this.inertia.x, this.torque);
        this.forward.scaleToRef(aR * this.inertia.z, this.t0);
        this.torque.addInPlace(this.t0);
        this.up.scaleToRef(aY * this.inertia.y, this.t0);
        this.torque.addInPlace(this.t0);
        body.applyTorque(this.torque);
      }
    } else if (grounded > 0 && grounded < 4 && this.up.y > 0.5) {
      // two-wheeling: a gentle self-righting nudge about the roll axis only
      Vector3.CrossToRef(this.up, Vector3.UpReadOnly, this.t0);
      const rollErr = Vector3.Dot(this.t0, this.forward);
      const rollRate = Vector3.Dot(this.angularVelocity, this.forward);
      this.forward.scaleToRef((rollErr * 3 - rollRate * 0.6) * this.inertia.z, this.t0);
      body.applyTorque(this.t0);
    }

    // --- boost (works in the air too) ---------------------------------------------------------------
    this.boosting = false;
    if (live && inp.boost && this.boost > 0 && st.boostForce > 0) {
      this.boost = Math.max(0, this.boost - dt);
      this.forward.scaleToRef(st.boostForce, this.force);
      body.applyForce(this.force, this.com);
      this.boosting = true;
    }

    // --- fuel ----------------------------------------------------------------------------------------------
    if (hasFuel && live) this.fuel = Math.max(0, this.fuel - st.fuelPerSecond * (Math.abs(appliedThrottle) + 0.06) * dt);

    // --- rpm ------------------------------------------------------------------------------------------------
    let rpmTarget: number;
    if (nowAir || (grounded > 0 && this.wheels[2].slip > 0.5)) rpmTarget = appliedThrottle > 0 ? 0.95 : 0.25;
    else {
      const g0 = GEARS[gear - 1];
      const g1 = GEARS[gear];
      const inGear = clamp((sAbs - g0) / (g1 - g0), 0, 1);
      rpmTarget = gear === 1 ? 0.15 + inGear * 0.8 : 0.42 + inGear * 0.55;
      if (appliedThrottle > 0) rpmTarget = Math.max(rpmTarget, 0.3);
      else rpmTarget *= 0.85;
    }
    this.rpm += (rpmTarget - this.rpm) * Math.min(1, dt * (this.shiftCut > 0 ? 18 : 8));

    // --- wreck checks ----------------------------------------------------------------------------------
    if (!this.wrecked) {
      if (this.up.y < 0.3 && sp < 3 && !nowAir) this.stuckTime += dt;
      else this.stuckTime = Math.max(0, this.stuckTime - dt);
      if (this.stuckTime > 2.5) this.setWrecked();
    }

    // --- impacts recorded during the last step ------------------------------------------------------------
    if (this.impactCooldown > 0) this.impactCooldown -= dt;
    if (this.scrapeCooldown > 0) this.scrapeCooldown -= dt;
    if (this.pending.v > 0) {
      this.processImpact();
      this.pending.v = 0;
    }

    this.updateDebris(dt);

    // snapshot for collision callbacks during the coming step
    this.prevVel.copyFrom(this.velocity);
    this.prevAng.copyFrom(this.angularVelocity);
    this.prevCom.copyFrom(this.com);

    for (const w of this.sim) w.spin = (w.spin + w.spinRate * dt) % TWO_PI;
  }

  // ---------------------------------------------------------------------------
  // IVehicle API

  damage(amount: number, at?: Vector3): void {
    void at;
    if (this.wrecked || amount <= 0) return;
    this.health = Math.max(0, this.health - amount);
    this.damageLevel = 1 - this.health / this.stats.health;
    this.model.setDamage(this.damageLevel);
    for (let p = this.model.detachPanel(); p; p = this.model.detachPanel()) this.spawnDebris(p);
    if (this.health <= 0) this.setWrecked();
  }

  applyDrag(fraction: number): void {
    const f = clamp(fraction, 0, 1);
    this.body.getLinearVelocityToRef(this.t3);
    const along = Vector3.Dot(this.t3, this.forward);
    this.forward.scaleToRef(along * f, this.t2);
    this.t3.subtractInPlace(this.t2);
    this.body.setLinearVelocity(this.t3);
  }

  applyImpulse(impulse: Vector3, at: Vector3): void {
    this.body.applyImpulse(impulse, at);
  }

  attach(node: TransformNode): void {
    node.parent = this.chassis;
  }

  /** Refill everything (sandbox / debug). */
  repair(): void {
    this.health = this.stats.health;
    this.fuel = this.stats.fuel;
    this.boost = this.stats.boostCapacity;
    this.damageLevel = 0;
    this.wrecked = false;
    this.stuckTime = 0;
    this.model.setDamage(0);
  }

  /** Teleport (keeps orientation yaw only) and stop. */
  teleport(pos: Vector3, yaw = 0): void {
    this.chassis.position.copyFrom(pos);
    this.chassis.rotationQuaternion = Quaternion.FromEulerAngles(0, yaw, 0);
    this.body.disablePreStep = false;
    this.body.setLinearVelocity(Vector3.ZeroReadOnly as Vector3);
    this.body.setAngularVelocity(Vector3.ZeroReadOnly as Vector3);
    this.ctx.scene.onAfterPhysicsObservable.addOnce(() => (this.body.disablePreStep = true));
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.collisionObs) this.body.getCollisionObservable().remove(this.collisionObs);
    if (this.afterPhysicsObs) this.ctx.scene.onAfterPhysicsObservable.remove(this.afterPhysicsObs);
    for (const d of this.debris) {
      d.agg.dispose();
      d.mesh.dispose();
    }
    this.debris.length = 0;
    this.model.dispose();
    this.body.dispose();
    this.shape.dispose();
    this.chassis.dispose();
  }

  // ---------------------------------------------------------------------------
  // internals

  /** Read the chassis transform / velocities into the public state. */
  private readState(): void {
    const m = this.chassis.computeWorldMatrix(true);
    this.position.copyFrom(this.chassis.position);
    Vector3.TransformNormalToRef(Vector3.LeftHandedForwardReadOnly, m, this.forward);
    this.forward.normalize();
    Vector3.TransformNormalToRef(Vector3.UpReadOnly, m, this.up);
    this.up.normalize();
    Vector3.TransformNormalToRef(Vector3.RightReadOnly, m, this.right);
    this.right.normalize();
    this.body.getLinearVelocityToRef(this.velocity);
    this.body.getAngularVelocityToRef(this.angularVelocity);
    this.body.getObjectCenterWorldToRef(this.com);
    this.forwardSpeed = Vector3.Dot(this.velocity, this.forward);
  }

  /** After each physics step: refresh state + pose the wheels. */
  private afterStep(): void {
    if (this.disposed) return;
    this.readState();
    const steer = this.steerAngle;
    for (let i = 0; i < 4; i++) {
      const w = this.sim[i];
      this.model.setWheel(i, w.length, w.front ? steer : 0, w.spin);
    }
    if (Debug.visible) {
      Debug.watch("car km/h", this.forwardSpeed * 3.6);
      Debug.watch("car gear/rpm", `${this.gear} / ${this.rpm.toFixed(2)}`);
      Debug.watch("car grounded", `${this.groundedCount} air=${this.airborne} t=${this.airTime.toFixed(2)}`);
      Debug.watch("car comp", this.wheels.map((w) => w.compression.toFixed(2)).join(" "));
      Debug.watch("car slip", this.wheels.map((w) => w.slip.toFixed(2)).join(" "));
      Debug.watch("car health", `${this.health.toFixed(0)} dmg=${this.damageLevel.toFixed(2)}`);
      Debug.watch("car boost/fuel", `${this.boost.toFixed(1)} / ${this.fuel.toFixed(1)}`);
    }
  }

  private holdUp = new Vector3();
  private holdAxis = new Vector3();
  private fwdH = new Vector3();

  /**
   * Angular velocity (world) that rotates the chassis toward an attitude:
   * level, pitched nose-up by `pitch` and leaned right by `lean` (radians).
   * Vector based, so it stays well-defined mid-flip.
   */
  private airHoldRate(pitch: number, lean: number): Vector3 {
    const f = this.fwdH.set(this.forward.x, 0, this.forward.z);
    if (f.lengthSquared() < 0.04) f.set(this.velocity.x, 0, this.velocity.z);
    if (f.lengthSquared() < 1e-6) f.set(0, 0, 1);
    f.normalize();
    // right-hand horizontal = Y x f in Babylon's left-handed frame -> (f.z, 0, -f.x)
    const cp = Math.cos(pitch);
    const u = this.holdUp.set(f.z * Math.sin(lean), cp * Math.cos(lean), -f.x * Math.sin(lean));
    u.addInPlace(f.scaleInPlace(-Math.sin(pitch) * Math.cos(lean))).normalize();
    const axis = Vector3.CrossToRef(this.up, u, this.holdAxis);
    const sinA = axis.length();
    const cosA = Vector3.Dot(this.up, u);
    if (sinA < 1e-4) {
      if (cosA > 0) return axis.setAll(0);
      axis.copyFrom(this.right); // upside down: pick the pitch axis
    } else axis.scaleInPlace(1 / sinA);
    return axis.scaleInPlace(Math.atan2(sinA, cosA) * Tuning.airLevel);
  }

  /** Velocity of a world point on the chassis. */
  private pointVelocity(p: Vector3, out: Vector3): void {
    p.subtractToRef(this.com, this.t2);
    Vector3.CrossToRef(this.angularVelocity, this.t2, out);
    out.addInPlace(this.velocity);
  }

  /** Newton's third law for dynamic things under the wheels (debris boxes). */
  private pushHitBody(w: WheelSim, f: Vector3): void {
    const hb = w.hitBody;
    if (!hb || hb.getMotionType() !== PhysicsMotionType.DYNAMIC) return;
    f.scaleToRef(-1, this.t3);
    hb.applyForce(this.t3, w.contact);
  }

  /**
   * Jump bookkeeping. A landing is judged over a short touchdown window so a
   * bounce continues the same jump and "clean" means it actually settled on
   * its wheels without crashing.
   */
  private takeOff(): void {
    if (this.touchdown >= 0) {
      // bounced: resume the current jump
      this.touchdown = -1;
      return;
    }
    this.airTime = this.noGroundTime;
    this.flipPitch = this.flipRoll = this.flipYaw = 0;
    this.landDirty = false;
    this.ctx.events.emit("airborne", { position: this.position.clone() });
  }

  private land(): void {
    this.touchdown = 0;
    this.landMaxWheels = 0;
    const vy = -this.prevVel.y;
    if (vy > 8) this.ctx.events.emit("shake", { intensity: clamp((vy - 6) / 16, 0.1, 0.8) });
  }

  private updateTouchdown(dt: number, grounded: number): void {
    if (this.touchdown < 0) return;
    this.touchdown += dt;
    this.landMaxWheels = Math.max(this.landMaxWheels, grounded);
    if (this.touchdown < 0.3) return;
    this.touchdown = -1;
    const count = (a: number) => Math.floor((Math.abs(a) + 0.7) / TWO_PI);
    const flips = count(this.flipPitch) + count(this.flipRoll) + count(this.flipYaw);
    const clean = this.landMaxWheels >= 3 && this.up.y > 0.75 && !this.landDirty && !this.wrecked;
    this.ctx.events.emit("landed", { position: this.position.clone(), airTime: this.airTime, clean, flips });
  }

  private setWrecked(): void {
    if (this.wrecked) return;
    this.wrecked = true;
    this.throttle = 0;
    this.boosting = false;
    this.ctx.events.emit("shake", { intensity: 0.5 });
  }

  private onCollision(e: IPhysicsCollisionEvent): void {
    if (this.disposed || e.type === "COLLISION_FINISHED") return;
    const other = e.collider === this.body ? e.collidedAgainst : e.collider;
    const mask = other.shape ? other.shape.filterMembershipMask : Layer.WORLD;
    if ((mask & (Layer.WORLD | Layer.DEBRIS)) === 0) return;
    this.bodyContact = 0.15;
    if (!e.point || !e.normal) return;
    // pre-step velocity of the contact point relative to the other body
    e.point.subtractToRef(this.prevCom, this.t2);
    Vector3.CrossToRef(this.prevAng, this.t2, this.t3);
    this.t3.addInPlace(this.prevVel);
    const dynamic = other.getMotionType() === PhysicsMotionType.DYNAMIC;
    if (dynamic) {
      other.getLinearVelocityToRef(this.t2);
      this.t3.subtractInPlace(this.t2);
    }
    const vn = Math.abs(Vector3.Dot(this.t3, e.normal));
    if (vn > 5 && vn > this.pending.v) {
      this.pending.v = vn;
      this.pending.mass = dynamic ? clamp(other.getMassProperties().mass! / (this.mass * 0.6), 0.03, 1) : 1;
      this.pending.point.copyFrom(e.point);
      this.pending.normal.copyFrom(e.normal);
    } else if (vn < 3 && this.scrapeCooldown <= 0 && !dynamic) {
      // grinding: tangential speed along the surface
      const tang = Math.sqrt(Math.max(0, this.t3.lengthSquared() - vn * vn));
      if (tang > 4) {
        this.scrapeCooldown = 0.07;
        this.ctx.events.emit("carScrape", { position: e.point.clone(), velocity: this.t3.clone() });
      }
    }
  }

  private processImpact(): void {
    const p = this.pending;
    const v = p.v * Math.sqrt(p.mass);
    // One crash produces contacts over several steps: within the cooldown only a
    // clearly harder hit counts again (and only for the difference).
    let prior = 0;
    if (this.impactCooldown > 0) {
      if (v < this.lastImpact * 1.25) return;
      prior = this.lastImpact;
    }
    this.impactCooldown = 0.3;
    this.lastImpact = v;
    // Belly-flop on the ground while upright = a botched landing, not a wall:
    // it hurts much less (big jumps are the point of the game).
    p.point.subtractToRef(this.com, this.t0);
    const belly = this.up.y > 0.6 && Vector3.Dot(this.t0, this.up) < 0 && Math.abs(Vector3.Dot(p.normal, this.up)) > 0.7;
    if (this.airborne || this.touchdown >= 0) this.landDirty ||= !belly || v > 11;
    this.ctx.events.emit("carImpact", { position: p.point.clone(), force: v, normal: p.normal.clone() });
    const thr = Tuning.damageThreshold + (belly ? 4 : 0);
    const dmg = (x: number) => Math.pow(Math.max(0, x - thr), 1.5);
    const amount = (dmg(v) - dmg(prior)) * Tuning.damageScale * p.mass * (belly ? 0.35 : 1);
    if (amount > 0) this.damage(amount, p.point);
    if (v > 11) this.ctx.events.emit("shake", { intensity: clamp((v - 9) / 18, 0.12, 1) });
  }

  private spawnDebris(mesh: AbstractMesh): void {
    const scene = this.ctx.scene;
    const panelMass = clamp(this.mass * 0.012, 8, 60);
    const agg = new PhysicsAggregate(mesh, PhysicsShapeType.BOX, { mass: panelMass, friction: 0.6, restitution: 0.25 }, scene);
    agg.shape.filterMembershipMask = Layer.DEBRIS;
    // Not CAR: freshly detached panels must not snag on the car that shed them.
    agg.shape.filterCollideMask = Layer.WORLD | Layer.DEBRIS | Layer.RAGDOLL;
    mesh.getAbsolutePosition().subtractToRef(this.position, this.t0);
    this.t0.y = Math.max(0.3, this.t0.y);
    this.t0.normalize().scaleInPlace(4 + Math.random() * 3);
    this.t0.addInPlace(this.velocity.scale(0.85));
    this.t0.y += 2.5;
    agg.body.setLinearVelocity(this.t0);
    agg.body.setAngularVelocity(new Vector3((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 12));
    this.debris.push({ mesh, agg, age: 0 });
    while (this.debris.length > this.maxDebris) this.removeDebris(0);
  }

  private updateDebris(dt: number): void {
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.age += dt;
      if (d.age > 20 || d.mesh.position.z < this.position.z - 80 || d.mesh.position.y < -40) this.removeDebris(i);
    }
  }

  private removeDebris(i: number): void {
    const d = this.debris[i];
    d.agg.dispose();
    d.mesh.dispose();
    this.debris.splice(i, 1);
  }
}

/** Spring/damper constants: car data is "per unit mass per wheel". */
function def_k(perUnitMass: number, massPerWheel: number): number {
  return perUnitMass * massPerWheel;
}
