/**
 * M1 Abrams driving model (pure enough for node tests; no rendering).
 *
 * Body frame: origin on the ground under the hull centre, forward = -Z, right = +X, up = +Y.
 * Real data: 62 t, 1,500 hp AGT1500 gas turbine (with spool lag), 67 km/h governed top speed
 * (≈ 40 km/h in reverse), pivot steering, 7 road wheels per side on torsion bars, front idler
 * and rear drive sprocket, turret traverse ≈ 42°/s, gun -9° … +20°.
 *
 *  - Suspension: 18 sprung contacts (14 road wheels + idlers/sprockets that only touch when the
 *    ground rises in front/behind, so the tank noses onto steps). Each is a spring-damper with a
 *    bump stop; heave, pitch and roll are integrated as a rigid body. Wheel contact heights are
 *    rounded over block edges (a 0.32 m wheel rolls onto a step instead of teleporting).
 *  - Drive: turbine spool (throttle lag), power-limited tractive force capped by ground grip,
 *    rolling resistance by surface, slope gravity, brakes, governed top speed.
 *  - Steering: skid steer (yaw rate demand shrinking with speed, pivot turns at a standstill),
 *    tracks resist side slip strongly; turning scrubs speed. Squat / dive / body roll from
 *    acceleration and cornering.
 *  - Walls: hull probes above step height stop the tank (soft obstacles — leaves, logs, planks,
 *    glass, fences, plants — are crushed instead and reported to the caller).
 */
import * as THREE from 'three';
import type { World } from '../../world/world';
import { BLOCKS, T_FULL_CUBE, T_SOLID, T_LIQUID } from '../../world/blocks/registry';
import { surfaceBelow } from './heliPhysics';

export const TANK = {
  mass: 62000,
  gravity: 9.81,
  /** Hull footprint half extents (m). */
  halfLength: 3.95,
  halfWidth: 1.83,
  /** Top of the hull deck / turret roof above the ground (static). */
  deckY: 1.62,
  roofY: 2.44,
  /** Track centre lines. */
  trackX: 1.51,
  trackWidth: 0.63,
  wheelZ: [-2.31, -1.54, -0.77, 0, 0.77, 1.54, 2.31],
  wheelR: 0.32,
  idlerZ: -3.22,
  idlerY: 0.62,
  sprocketZ: 3.28,
  sprocketY: 0.74,
  /** Static spring deflection (m) and bump-stop travel above it. */
  sag: 0.1,
  travel: 0.3,
  damping: 30000,
  bumpK: 3.6e6,
  /** Centre of mass height and moments of inertia (kg m²). */
  comY: 1.05,
  Ipitch: 330000,
  Iroll: 95000,
  power: 1.12e6,
  maxFwd: 18.6,
  maxRev: 9.7,
  /** Turret / gun drives (rad/s) and gun limits. */
  turretRate: 0.73,
  turretAccel: 2.2,
  gunRate: 0.44,
  gunMin: -0.157,
  gunMax: 0.349,
  /** Turret ring centre (hull frame) and gun trunnion (turret frame). */
  turretPos: new THREE.Vector3(0, 1.62, 0.15),
  trunnion: new THREE.Vector3(0, 0.52, -0.95),
  barrelLength: 4.95,
  reload: 6,
  shellSpeed: 420,
  maxHealth: 400,
};

const WEIGHT = TANK.mass * TANK.gravity;
/** Per road wheel spring rate giving the static sag with 14 wheels loaded. */
const K = WEIGHT / (14 * TANK.sag);

export interface ContactPoint {
  x: number;
  z: number;
  /** Height above the static ground plane where this point touches (idler / sprocket > 0). */
  lift: number;
  /** Road wheel index (0..13) or -1 for idler / sprocket. */
  wheel: number;
}

export const CONTACTS: ContactPoint[] = [];
for (const s of [-1, 1]) {
  TANK.wheelZ.forEach((z, i) => CONTACTS.push({ x: s * TANK.trackX, z, lift: 0, wheel: (s < 0 ? 0 : 7) + i }));
  CONTACTS.push({ x: s * TANK.trackX, z: TANK.idlerZ, lift: TANK.idlerY - TANK.wheelR, wheel: -1 });
  CONTACTS.push({ x: s * TANK.trackX, z: TANK.sprocketZ, lift: TANK.sprocketY - TANK.wheelR, wheel: -1 });
}

/** Surface classes: traction (grip), rolling resistance. */
export function surfaceGrip(state: number): { grip: number; roll: number; soft: boolean } {
  const def = BLOCKS[state >>> 4];
  const n = def?.name ?? '';
  if (/ice/.test(n)) return { grip: 0.18, roll: 0.02, soft: false };
  if (/sand|soul_sand|gravel/.test(n)) return { grip: 0.55, roll: 0.11, soft: true };
  if (/snow|mud|farmland|clay/.test(n)) return { grip: 0.5, roll: 0.12, soft: true };
  if (/grass_block|dirt|podzol|mycelium|path|moss/.test(n)) return { grip: 0.72, roll: 0.06, soft: true };
  if (/slime|honey/.test(n)) return { grip: 0.4, roll: 0.2, soft: false };
  return { grip: 0.8, roll: 0.035, soft: false };
}

/** Blocks the hull crushes instead of stopping against. */
export function crushable(state: number): boolean {
  if (!state) return false;
  const def = BLOCKS[state >>> 4];
  if (!def || def.hardness < 0) return false;
  const n = def.name;
  if (T_LIQUID[state >>> 4]) return false;
  if (!T_SOLID[state >>> 4]) return true;
  return /leaves|log|wood|planks|glass|fence|wall_|_wall|door|trapdoor|wool|hay|melon|pumpkin|cactus|bamboo|sugar_cane|scaffolding|bed|sign|ladder|torch|lantern|flower|sapling|carpet|cobweb|vine|chest|barrel|crafting|bookshelf|composter|campfire|mushroom_block|stem|nether_wart_block|shroomlight|coral|sponge|snow|ice/.test(n) && def.hardness <= 3.5;
}

export interface TankInput {
  /** -1 … 1 (S/W). */
  throttle: number;
  /** -1 … 1 (A/D: +1 = turn right). */
  steer: number;
  brake: boolean;
  /** World-space aim the turret and gun are stabilised on. */
  aimYaw: number;
  aimPitch: number;
}

export interface TankEvents {
  /** Impacts with walls (m/s of closing speed). */
  wallHits: { speed: number; x: number; y: number; z: number }[];
  /** Blocks the hull ran over / through and should be destroyed. */
  crushed: { x: number; y: number; z: number; state: number }[];
  /** Hard landings (vertical speed m/s). */
  landing: number;
}

const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const stateBuf = [0];

export const wrapPi = (a: number) => {
  a = (a + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
};

export class TankBody {
  /** Hull origin (ground under the centre) and velocity, shared with the entity. */
  readonly pos: THREE.Vector3;
  readonly vel: THREE.Vector3;
  yaw = 0;
  pitch = 0;
  roll = 0;
  yawRate = 0;
  pitchRate = 0;
  rollRate = 0;
  readonly quat = new THREE.Quaternion();
  /** Turret yaw relative to the hull, its rate, gun elevation relative to the turret. */
  turretYaw = 0;
  turretRate = 0;
  gun = 0;
  /** Turbine spool 0..1 (N2), engine on, throttle actually applied. */
  spool = 0;
  engineOn = false;
  driven = false;
  readonly input: TankInput = { throttle: 0, steer: 0, brake: false, aimYaw: 0, aimPitch: 0 };
  /** Per contact: compression (m, + = pressed), previous compression, ground state under it. */
  readonly compression = new Float32Array(CONTACTS.length);
  private readonly prevComp = new Float32Array(CONTACTS.length);
  readonly groundState = new Int32Array(CONTACTS.length);
  /** Track travel (m) per side for the tread animation and its speed. */
  trackL = 0;
  trackR = 0;
  /** Number of contacts carrying load, total normal load (N). */
  contacts = 0;
  load = 0;
  /** Forward / lateral speed (m/s, hull frame) after the step. */
  speed = 0;
  slip = 0;
  waterDepth = 0;
  inLava = false;
  readonly events: TankEvents = { wallHits: [], crushed: [], landing: 0 };
  private crushBudget = 0;

  constructor(pos: THREE.Vector3, vel: THREE.Vector3) {
    this.pos = pos;
    this.vel = vel;
    this.updateQuat();
  }

  updateQuat() {
    _e.set(this.pitch, this.yaw, this.roll, 'YXZ');
    this.quat.setFromEuler(_e);
    return this.quat;
  }

  setHeading(yaw: number) {
    this.yaw = yaw;
    this.updateQuat();
  }

  forward(out = new THREE.Vector3()) {
    return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }
  right(out = new THREE.Vector3()) {
    return out.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
  }

  /** Hull-frame point → world. */
  toWorld(local: THREE.Vector3, out = new THREE.Vector3()) {
    return out.copy(local).applyQuaternion(this.quat).add(this.pos);
  }

  /** Ground height for a wheel at (x, z) rounded over block edges along `fx, fz`. */
  private wheelGround(world: World, x: number, z: number, top: number, fx: number, fz: number, idx: number): number {
    const r = TANK.wheelR;
    let best = -Infinity;
    let st = 0;
    for (const k of [0, 0.75, -0.75]) {
      const sx = x + fx * r * k, sz = z + fz * r * k;
      stateBuf[0] = 0;
      const g = surfaceBelow(world, sx, sz, top, 0, 6, stateBuf);
      if (g === -Infinity) continue;
      const h = g + (k === 0 ? 0 : (Math.sqrt(1 - k * k) - 1) * r);
      if (h > best) {
        best = h;
        st = stateBuf[0];
      }
    }
    if (best === -Infinity) {
      // the wheel is buried in a block (placed against a bank, terrain edited around it):
      // report the top of the solid stack so the suspension pushes it out
      const bx = Math.floor(x), bz = Math.floor(z);
      let by = Math.floor(top);
      const st0 = world.getBlock(bx, by, bz);
      if (st0 && T_SOLID[st0 >>> 4]) {
        let n = 0;
        while (n < 3 && T_SOLID[world.getBlock(bx, by + 1, bz) >>> 4]) { by++; n++; }
        best = by + 1;
        st = st0;
      }
    }
    this.groundState[idx] = st;
    return best;
  }

  /**
   * One fixed physics step. `world` answers block queries; returns this.events (cleared first).
   */
  step(world: World, dt: number): TankEvents {
    const ev = this.events;
    ev.wallHits.length = 0;
    ev.crushed.length = 0;
    ev.landing = 0;
    this.crushBudget = 6;
    this.updateEnv(world);
    // ---- engine (gas turbine spool lag)
    const inp = this.input;
    const wantPower = this.engineOn && this.driven && this.waterDepth < 1.3 ? Math.max(0.12, Math.abs(inp.throttle), Math.abs(inp.steer) * 0.7) : 0;
    const spoolRate = wantPower > this.spool ? 0.55 : 1.4;
    this.spool += (wantPower - this.spool) * (1 - Math.exp(-dt * spoolRate * 2.2));
    if (!this.engineOn) this.spool = Math.max(0, this.spool - dt * 0.12);
    // ---- suspension (two substeps: stiff bump stops)
    const sub = 2;
    const h = dt / sub;
    const vyBefore = this.vel.y;
    for (let s = 0; s < sub; s++) this.suspension(world, h);
    if (this.contacts > 0 && vyBefore < -4 && this.vel.y > vyBefore + 2) ev.landing = -vyBefore;
    // ---- drive, steering, slopes
    this.drive(world, dt);
    // ---- turret & gun
    this.turret(dt);
    this.updateQuat();
    return ev;
  }

  private updateEnv(world: World) {
    const x = Math.floor(this.pos.x), z = Math.floor(this.pos.z);
    let depth = 0;
    this.inLava = false;
    for (let y = Math.floor(this.pos.y); y < this.pos.y + 3; y++) {
      const st = world.getBlock(x, y, z);
      if (st && T_LIQUID[st >>> 4]) {
        depth = y + 1 - this.pos.y;
        if (BLOCKS[st >>> 4].name.includes('lava')) this.inLava = true;
      }
    }
    this.waterDepth = Math.max(0, depth);
  }

  private suspension(world: World, dt: number) {
    const q = this.updateQuat();
    const fwd = this.forward(_w);
    const top = this.pos.y + 1.25; // max step height the running gear can climb
    let Fy = 0, tPitch = 0, tRoll = 0, n = 0, load = 0;
    let maxOver = 0, overPitch = 0, overRoll = 0, overW = 0;
    for (let i = 0; i < CONTACTS.length; i++) {
      const c = CONTACTS[i];
      _v.set(c.x, c.lift, c.z).applyQuaternion(q).add(this.pos);
      const g = this.wheelGround(world, _v.x, _v.z, Math.max(top, _v.y + 0.6), fwd.x, fwd.z, i);
      let comp = g === -Infinity ? -1 : g - _v.y;
      // road wheels carry the static sag; idler / sprocket only touch when pushed
      const pre = c.wheel >= 0 ? TANK.sag : 0;
      let F = 0;
      if (comp + pre > 0) {
        // spring up to full travel, then a short stiff bump stop; anything deeper is resolved
        // positionally below so a wheel buried by terrain can't store energy and launch the hull
        const over = comp - TANK.travel;
        F = K * (Math.min(comp, TANK.travel) + pre);
        if (over > 0) {
          F += TANK.bumpK * Math.min(over, 0.04);
          if (over > maxOver) maxOver = over;
          overPitch += over * -c.z;
          overRoll += over * c.x;
          overW += over;
        }
        // damper on the compression rate (none on the first touch: there is no previous value)
        const prev = this.prevComp[i] + pre > 0 ? this.prevComp[i] : comp;
        const dc = Math.max(-6, Math.min(6, (comp - prev) / dt));
        F += TANK.damping * dc;
        if (F < 0) F = 0;
        n++;
      } else comp = Math.max(comp, -0.5);
      this.prevComp[i] = comp;
      this.compression[i] = comp;
      Fy += F;
      load += F;
      // lever arms in the (pitched/rolled) body: front is -z
      tPitch += F * -c.z;
      tRoll += F * c.x;
    }
    this.contacts = n;
    this.load = load;
    // buoyancy-ish drag in water (a 62 t tank sinks slowly)
    if (this.waterDepth > 0) {
      Fy += Math.min(1, this.waterDepth / 2.4) * WEIGHT * 0.35;
      this.vel.y *= Math.exp(-dt * 1.2);
    }
    this.vel.y += (Fy / TANK.mass - TANK.gravity) * dt;
    if (maxOver > 0.04) {
      // bottomed out: lift the hull out of the ground (and tip it towards the buried end)
      // without adding speed; downward motion is absorbed
      const lift = Math.min(maxOver - 0.04, 0.6) * 0.5;
      this.pos.y += lift;
      if (this.vel.y < 0) this.vel.y *= 0.2;
      this.vel.y = Math.min(this.vel.y, 2.5);
      if (overW > 0) {
        this.pitch += Math.max(-0.03, Math.min(0.03, (overPitch / overW) * 0.02 * lift));
        this.roll += Math.max(-0.03, Math.min(0.03, (overRoll / overW) * 0.05 * lift));
      }
    }
    this.pos.y += this.vel.y * dt;
    // rotational damping (track tension, shocks) + restoring torques
    this.pitchRate += (tPitch / TANK.Ipitch) * dt;
    this.rollRate += (tRoll / TANK.Iroll) * dt;
    const dampA = n > 0 ? 1.6 : 0.2;
    this.pitchRate *= Math.exp(-dt * dampA);
    this.rollRate *= Math.exp(-dt * dampA);
    if (n === 0) {
      // airborne: tip gently nose-down / level
      this.pitchRate -= this.pitch * 0.4 * dt;
      this.rollRate -= this.roll * 0.4 * dt;
    }
    this.pitch = Math.max(-1.1, Math.min(1.1, this.pitch + this.pitchRate * dt));
    this.roll = Math.max(-1.1, Math.min(1.1, this.roll + this.rollRate * dt));
  }

  private drive(world: World, dt: number) {
    const inp = this.input;
    const f = this.forward(new THREE.Vector3());
    const r = this.right(new THREE.Vector3());
    let vf = this.vel.x * f.x + this.vel.z * f.z;
    let vr = this.vel.x * r.x + this.vel.z * r.z;
    const N = this.load;
    const grounded = this.contacts >= 3;
    // surface under the tracks (most common non-air contact)
    let grip = 0, roll = 0, k = 0;
    for (let i = 0; i < CONTACTS.length; i++) {
      if (CONTACTS[i].wheel < 0 || this.compression[i] + TANK.sag <= 0) continue;
      const sg = surfaceGrip(this.groundState[i]);
      grip += sg.grip;
      roll += sg.roll;
      k++;
    }
    if (k) { grip /= k; roll /= k; } else { grip = 0.7; roll = 0.04; }
    if (this.waterDepth > 0.6) { grip *= 0.6; roll += 0.08; }
    let Fr = 0;
    const vf0 = vf;
    if (grounded) {
      const maxTraction = grip * N;
      // engine: power-limited force, governed speed; no drive force against the motion
      const thr = this.driven && this.engineOn ? inp.throttle : 0;
      const P = TANK.power * this.spool * Math.abs(thr);
      let Fe = 0;
      if (thr > 0 && vf > -0.4 && vf < TANK.maxFwd) Fe = Math.min(P / Math.max(1.5, Math.abs(vf)), maxTraction * 0.85);
      if (thr < 0 && vf < 0.4 && vf > -TANK.maxRev) Fe = -Math.min(P / Math.max(1.5, Math.abs(vf)), maxTraction * 0.6);
      // slope along the hull
      const Fs = -WEIGHT * Math.sin(this.pitch);
      vf += ((Fe + Fs) / TANK.mass) * dt;
      // brakes + rolling resistance: friction that stops the tracks but never reverses them
      let B = roll * N;
      if (inp.brake || !this.driven || !this.engineOn) B += 0.8 * N;
      else if (thr === 0) B += Math.abs(vf) < 1 ? 0.8 * N : 0.1 * N;
      else if ((thr > 0 && vf < -0.4) || (thr < 0 && vf > 0.4)) B += 0.6 * N;
      const dv = (Math.min(B, maxTraction * 1.1) / TANK.mass) * dt;
      vf = Math.abs(vf) <= dv ? 0 : vf - Math.sign(vf) * dv;
      // tracks resist side slip
      const latMax = grip * 1.1 * N;
      Fr = Math.max(-latMax, Math.min(latMax, (-vr * TANK.mass) / 0.08));
      Fr += -WEIGHT * Math.sin(this.roll) * 0.9;
    }
    const Ff = ((vf - vf0) * TANK.mass) / dt;
    // squat / dive and body roll from the horizontal forces acting below the centre of mass
    this.pitchRate += ((Ff * TANK.comY) / TANK.Ipitch) * dt * 0.6;
    this.rollRate += ((Fr * TANK.comY) / TANK.Iroll) * dt * 0.35;
    vr += (Fr / TANK.mass) * dt;
    // ---- skid steering
    const steer = this.driven && this.engineOn && this.spool > 0.1 ? inp.steer : 0;
    const wMax = 0.62 / (1 + Math.abs(vf) / 7);
    const target = grounded ? -steer * wMax * Math.min(1, 0.4 + this.spool) : this.yawRate;
    const alpha = grounded ? Math.min(1, grip / 0.6) * 1.6 : 0;
    const dw = target - this.yawRate;
    this.yawRate += Math.max(-alpha * dt, Math.min(alpha * dt, dw));
    if (grounded && Math.abs(this.yawRate) > 0.01) {
      // turning scrubs speed (track side-slip over the ground)
      const scrub = Math.min(1, Math.abs(this.yawRate) * 0.22 * grip * dt);
      vf *= 1 - scrub;
    }
    if (!grounded) this.yawRate *= Math.exp(-dt * 0.3);
    // ---- integrate the plane motion with wall checks
    const vx = f.x * vf + r.x * vr, vz = f.z * vf + r.z * vr;
    const ox = this.pos.x, oz = this.pos.z, oyaw = this.yaw;
    this.pos.x += vx * dt;
    this.pos.z += vz * dt;
    this.yaw = wrapPi(this.yaw + this.yawRate * dt);
    this.updateQuat();
    const hit = this.hullBlocked(world);
    if (hit) {
      // undo the move, kill the motion into the obstacle
      const closing = Math.max(Math.abs(vf), Math.abs(this.yawRate) * TANK.halfLength);
      this.pos.x = ox;
      this.pos.z = oz;
      this.yaw = oyaw;
      this.updateQuat();
      this.events.wallHits.push({ speed: closing, x: hit.x, y: hit.y, z: hit.z });
      // try sliding sideways along the wall a little
      vf *= -0.12;
      vr *= 0.5;
      this.yawRate *= -0.2;
    }
    this.vel.x = f.x * vf + r.x * vr;
    this.vel.z = f.z * vf + r.z * vr;
    this.speed = vf;
    this.slip = vr;
    // tread travel (left / right differ by the turn rate)
    const half = TANK.trackX;
    this.trackL += (vf - this.yawRate * half) * dt;
    this.trackR += (vf + this.yawRate * half) * dt;
  }

  /** Probe the hull sides above climbable height; crushes soft blocks, returns a hard hit. */
  private hullBlocked(world: World): { x: number; y: number; z: number } | null {
    const q = this.quat;
    const L = TANK.halfLength, W = TANK.halfWidth;
    let hard: { x: number; y: number; z: number } | null = null;
    const probe = (lx: number, ly: number, lz: number) => {
      _v.set(lx, ly, lz).applyQuaternion(q).add(this.pos);
      const bx = Math.floor(_v.x), by = Math.floor(_v.y), bz = Math.floor(_v.z);
      const st = world.getBlock(bx, by, bz);
      if (!st) return;
      if (crushable(st)) {
        if (this.crushBudget > 0 && !this.events.crushed.some((c) => c.x === bx && c.y === by && c.z === bz)) {
          this.crushBudget--;
          this.events.crushed.push({ x: bx, y: by, z: bz, state: st });
        }
        return;
      }
      if (T_SOLID[st >>> 4] && T_FULL_CUBE[st >>> 4] && !hard) hard = { x: _v.x, y: _v.y, z: _v.z };
    };
    for (const ly of [1.3, 2.1]) {
      for (let lx = -W; lx <= W + 1e-6; lx += W / 2) {
        probe(lx, ly, -L);
        probe(lx, ly, L);
      }
      for (let lz = -L + 1; lz <= L - 1 + 1e-6; lz += 1.3) {
        probe(-W, ly, lz);
        probe(W, ly, lz);
      }
    }
    // low probes only crush (plants, fences at track height)
    for (let lx = -W; lx <= W + 1e-6; lx += W) for (const lz of [-L + 0.2, L - 0.2]) {
      _v.set(lx, 0.55, lz).applyQuaternion(q).add(this.pos);
      const bx = Math.floor(_v.x), by = Math.floor(_v.y), bz = Math.floor(_v.z);
      const st = world.getBlock(bx, by, bz);
      if (st && crushable(st) && this.crushBudget > 0) {
        this.crushBudget--;
        this.events.crushed.push({ x: bx, y: by, z: bz, state: st });
      }
    }
    return hard;
  }

  /** Turret traverse and gun elevation toward the stabilised world-space aim. */
  private turret(dt: number) {
    const inp = this.input;
    if (!this.driven) {
      this.turretRate *= Math.exp(-dt * 4);
      this.turretYaw = wrapPi(this.turretYaw + this.turretRate * dt);
      return;
    }
    const powered = this.engineOn ? 1 : 0.15; // hand cranks without power
    const want = wrapPi(inp.aimYaw - this.yaw - this.turretYaw);
    // slew with acceleration limit, decelerating to stop on target
    const maxRate = TANK.turretRate * powered;
    const stopRate = Math.sqrt(2 * TANK.turretAccel * Math.abs(want)) * Math.sign(want);
    const desired = Math.max(-maxRate, Math.min(maxRate, stopRate));
    const dv = desired - this.turretRate;
    this.turretRate += Math.max(-TANK.turretAccel * dt, Math.min(TANK.turretAccel * dt, dv));
    this.turretYaw = wrapPi(this.turretYaw + this.turretRate * dt);
    // gun: stabilised against hull pitch / roll along the turret direction
    const hullPitchAlong = this.pitch * Math.cos(this.turretYaw) - this.roll * Math.sin(this.turretYaw);
    const gunWant = Math.max(TANK.gunMin, Math.min(TANK.gunMax, inp.aimPitch - hullPitchAlong));
    const dg = gunWant - this.gun;
    const gr = TANK.gunRate * powered * dt;
    this.gun += Math.max(-gr, Math.min(gr, dg));
  }

  /** World transform of the gun (muzzle position, direction). */
  muzzle(outPos: THREE.Vector3, outDir: THREE.Vector3, recoil = 0) {
    const q = this.updateQuat();
    _q.setFromAxisAngle(_w.set(0, 1, 0), this.turretYaw);
    const qt = q.clone().multiply(_q);
    const qg = qt.clone().multiply(_q.setFromAxisAngle(_w.set(1, 0, 0), this.gun));
    outDir.set(0, 0, -1).applyQuaternion(qg);
    outPos.copy(TANK.turretPos).applyQuaternion(q).add(this.pos);
    _v.copy(TANK.trunnion).applyQuaternion(qt);
    outPos.add(_v).addScaledVector(outDir, TANK.barrelLength - recoil);
    return outPos;
  }

  /** Recoil of a main gun shot: the hull rocks back against the line of fire. */
  recoil() {
    const c = Math.cos(this.turretYaw), s = Math.sin(this.turretYaw);
    this.pitchRate += 0.42 * c;
    this.rollRate += -0.42 * s;
    const f = this.forward(new THREE.Vector3());
    const r = this.right(new THREE.Vector3());
    // gun points along (-sin t) right + cos t forward in hull terms
    this.vel.addScaledVector(f, -0.35 * c).addScaledVector(r, 0.35 * s);
  }
}
