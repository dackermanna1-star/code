import * as THREE from 'three';
import type { CharacterModel } from '../characters/CharacterModel';
import { COUNTER, ROOM, TABLE_TOP_Y, SEATS } from '../world/Layout';

/**
 * Position-based (Verlet) ragdoll in the Jakobsen style: one particle per
 * joint, distance constraints for bones and a rigid torso box, range
 * constraints as joint limits, hinge fixes so knees and elbows only bend the
 * right way, and simple colliders for the floor, the order counter, table
 * tops and the room walls. The result is written back onto the character
 * rig as joint rotations, so the character's own meshes do the falling.
 */

const enum J {
  Pelvis, Chest, Neck, Head,
  ShL, ElL, HaL, ShR, ElR, HaR,
  HipL, KnL, FtL, HipR, KnR, FtR,
  COUNT,
}

interface Constraint {
  a: number;
  b: number;
  min: number;
  max: number;
}

export interface RagdollImpact {
  joint: number;
  speed: number;
  at: THREE.Vector3;
}

const GRAVITY = -9.81;
const SUB = 1 / 120;
const ITER = 7;

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpC = new THREE.Vector3();
const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();

/** tables as colliders: top discs the body can land on */
const TABLES: { x: number; z: number; r: number }[] = [];
for (const s of SEATS) if (!TABLES.some((t) => Math.hypot(t.x - s.table.x, t.z - s.table.z) < 0.2)) TABLES.push({ x: s.table.x, z: s.table.z, r: 0.42 });

export class Ragdoll {
  readonly pos = new Float32Array(J.COUNT * 3);
  private prev = new Float32Array(J.COUNT * 3);
  private invMass = new Float32Array(J.COUNT);
  private radius = new Float32Array(J.COUNT);
  private grounded = new Uint8Array(J.COUNT);
  private cons: Constraint[] = [];
  private acc = 0;
  private still = 0;
  sleeping = false;
  /** seconds since death */
  age = 0;
  /** when it was last struck (settling restarts) */
  private struckAt = 0;
  private frameStart = new Float32Array(16 * 3);
  /** reports hard landings (for thuds and blood) */
  onImpact?: (i: RagdollImpact) => void;
  private impactCooldown = new Float32Array(J.COUNT);

  constructor(private model: CharacterModel, velocity = new THREE.Vector3()) {
    const r = model.rig;
    const joints: THREE.Object3D[] = [
      r.pelvis, r.chest, r.neck, r.head,
      r.shoulderL, r.elbowL, r.handL, r.shoulderR, r.elbowR, r.handR,
      r.hipL, r.kneeL, r.footL, r.hipR, r.kneeR, r.footR,
    ];
    r.root.updateMatrixWorld(true);
    joints.forEach((o, i) => {
      o.getWorldPosition(tmpA);
      if (i === J.HaL || i === J.HaR) tmpA.add(tmpB.set(0, -0.035, 0).applyQuaternion(o.getWorldQuaternion(tmpQ)));
      this.set(i, tmpA);
    });
    // start with the body's current motion
    for (let i = 0; i < J.COUNT; i++) {
      this.prev[i * 3] = this.pos[i * 3] - velocity.x * SUB;
      this.prev[i * 3 + 1] = this.pos[i * 3 + 1] - velocity.y * SUB;
      this.prev[i * 3 + 2] = this.pos[i * 3 + 2] - velocity.z * SUB;
    }
    const d = model.dims;
    const mass: [number, number, number][] = [
      // mass, radius
      [J.Pelvis, 3.2, 0.13], [J.Chest, 3.4, 0.14], [J.Neck, 1.2, 0.07], [J.Head, 1.4, d.headR * 0.95],
      [J.ShL, 0.8, 0.06], [J.ElL, 0.6, 0.045], [J.HaL, 0.35, 0.04], [J.ShR, 0.8, 0.06], [J.ElR, 0.6, 0.045], [J.HaR, 0.35, 0.04],
      [J.HipL, 1.4, 0.075], [J.KnL, 1.0, 0.06], [J.FtL, 0.6, 0.05], [J.HipR, 1.4, 0.075], [J.KnR, 1.0, 0.06], [J.FtR, 0.6, 0.05],
    ];
    for (const [j, m, rad] of mass) {
      this.invMass[j] = 1 / m;
      this.radius[j] = rad;
    }
    const bone = (a: number, b: number, slackMin = 1, slackMax = 1) => {
      const l = this.dist(a, b);
      this.cons.push({ a, b, min: l * slackMin, max: l * slackMax });
    };
    const range = (a: number, b: number, min: number, max: number) => this.cons.push({ a, b, min, max });
    // skeleton
    bone(J.Pelvis, J.Chest);
    bone(J.Chest, J.Neck);
    bone(J.Neck, J.Head);
    bone(J.Neck, J.ShL);
    bone(J.Neck, J.ShR);
    bone(J.ShL, J.ShR);
    bone(J.ShL, J.ElL);
    bone(J.ElL, J.HaL);
    bone(J.ShR, J.ElR);
    bone(J.ElR, J.HaR);
    bone(J.Pelvis, J.HipL);
    bone(J.Pelvis, J.HipR);
    bone(J.HipL, J.HipR);
    bone(J.HipL, J.KnL);
    bone(J.KnL, J.FtL);
    bone(J.HipR, J.KnR);
    bone(J.KnR, J.FtR);
    // rigid torso box (a little give lets the spine flex)
    bone(J.Chest, J.ShL);
    bone(J.Chest, J.ShR);
    bone(J.Chest, J.HipL, 0.94, 1.03);
    bone(J.Chest, J.HipR, 0.94, 1.03);
    bone(J.ShL, J.HipL, 0.9, 1.04);
    bone(J.ShR, J.HipR, 0.9, 1.04);
    bone(J.ShL, J.HipR, 0.9, 1.04);
    bone(J.ShR, J.HipL, 0.9, 1.04);
    bone(J.Pelvis, J.Neck, 0.86, 1.02);
    // head can nod and tilt but not fold into the chest
    bone(J.Head, J.ShL, 0.82, 1.1);
    bone(J.Head, J.ShR, 0.82, 1.1);
    bone(J.Head, J.Chest, 0.85, 1.04);
    // joint limits: how far knees and elbows may fold
    const leg = d.thigh + d.shin;
    range(J.HipL, J.FtL, leg * 0.42, leg * 1.001);
    range(J.HipR, J.FtR, leg * 0.42, leg * 1.001);
    const arm = d.upperArm + d.forearm;
    range(J.ShL, J.HaL, arm * 0.3, arm * 1.001);
    range(J.ShR, J.HaR, arm * 0.3, arm * 1.001);
    // limbs stay out of the torso and out of each other
    range(J.HaL, J.Chest, 0.13, 9);
    range(J.HaR, J.Chest, 0.13, 9);
    range(J.ElL, J.Pelvis, 0.12, 9);
    range(J.ElR, J.Pelvis, 0.12, 9);
    range(J.HaL, J.Pelvis, 0.1, 9);
    range(J.HaR, J.Pelvis, 0.1, 9);
    range(J.KnL, J.KnR, 0.1, 9);
    range(J.FtL, J.FtR, 0.09, 9);
    range(J.KnL, J.Chest, 0.18, 9);
    range(J.KnR, J.Chest, 0.18, 9);
    range(J.Head, J.Pelvis, 0.3, 9);
  }

  private set(i: number, v: THREE.Vector3) {
    this.pos[i * 3] = v.x;
    this.pos[i * 3 + 1] = v.y;
    this.pos[i * 3 + 2] = v.z;
  }

  get(i: number, out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]);
  }

  private dist(a: number, b: number): number {
    const p = this.pos;
    return Math.hypot(p[a * 3] - p[b * 3], p[a * 3 + 1] - p[b * 3 + 1], p[a * 3 + 2] - p[b * 3 + 2]);
  }

  /** Add velocity to a particle (m/s) by moving its previous position. */
  private push(i: number, v: THREE.Vector3, k = 1) {
    this.prev[i * 3] -= v.x * SUB * k;
    this.prev[i * 3 + 1] -= v.y * SUB * k;
    this.prev[i * 3 + 2] -= v.z * SUB * k;
  }

  /** Nearest joint to a world point. */
  nearest(p: THREE.Vector3): number {
    let best = 0;
    let bd = Infinity;
    for (let i = 0; i < J.COUNT; i++) {
      const d = this.get(i, tmpA).distanceToSquared(p);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  }

  /**
   * A bullet strikes the body: the struck joint takes most of the impulse,
   * its neighbours some, and the knees buckle so the body drops instead of
   * toppling like a plank.
   */
  hit(point: THREE.Vector3, dir: THREE.Vector3, speed: number) {
    this.sleeping = false;
    this.still = 0;
    this.struckAt = this.age;
    const j = this.nearest(point);
    const v = dir.clone().normalize().multiplyScalar(speed);
    this.push(j, v);
    for (const c of this.cons) {
      if (c.a === j) this.push(c.b, v, 0.35);
      else if (c.b === j) this.push(c.a, v, 0.35);
    }
    const fwd = this.forward(tmpC);
    for (const k of [J.KnL, J.KnR]) this.push(k, tmpA.copy(fwd).multiplyScalar(1.1).setY(-0.4));
    this.push(J.Pelvis, tmpA.set(0, -0.9, 0));
  }

  /** Body forward (the way the chest faces). */
  forward(out: THREE.Vector3): THREE.Vector3 {
    const left = this.get(J.HipL, tmpA).sub(this.get(J.HipR, tmpB));
    const up = this.get(J.Neck, tmpB).sub(this.get(J.Pelvis, out));
    return out.crossVectors(left, up).normalize();
  }

  step(dt: number) {
    this.age += dt;
    if (this.sleeping || dt <= 0) return;
    this.acc += Math.min(dt, 1 / 20);
    this.frameStart.set(this.pos);
    while (this.acc >= SUB) {
      this.acc -= SUB;
      this.integrate();
      for (let it = 0; it < ITER; it++) {
        this.solve();
        this.collide(it === ITER - 1);
      }
      this.hinges();
    }
    for (let i = 0; i < J.COUNT; i++) this.impactCooldown[i] = Math.max(0, this.impactCooldown[i] - dt);
    // settle to sleep once the body as a whole has stopped (one twitchy joint doesn't count)
    let drift = 0;
    let total = 0;
    const p = this.pos;
    const f = this.frameStart;
    for (let i = 0; i < J.COUNT * 3; i += 3) {
      const d = Math.hypot(p[i] - f[i], p[i + 1] - f[i + 1], p[i + 2] - f[i + 2]);
      drift = Math.max(drift, d);
      total += d;
    }
    const span = Math.min(dt, 1 / 20);
    if (total / J.COUNT / span < 0.02 && drift / span < 0.12) this.still += dt;
    else this.still = 0;
    const since = this.age - this.struckAt;
    if ((this.still > 0.5 && since > 1.2) || since > 8) this.sleeping = true;
  }

  private integrate(): number {
    const p = this.pos;
    const q = this.prev;
    let maxMove = 0;
    // once the fall is over, bleed off the last tremors so the body comes to rest
    const settle = Math.min(1, Math.max(0, (this.age - this.struckAt - 1.3) / 2.2));
    for (let i = 0; i < J.COUNT; i++) {
      const o = i * 3;
      // air drag, and heavy friction for anything lying on the ground
      const damp = (this.grounded[i] ? 0.86 : 0.998) - settle * 0.25;
      const vx = (p[o] - q[o]) * damp;
      const vy = (p[o + 1] - q[o + 1]) * (0.998 - settle * 0.25);
      const vz = (p[o + 2] - q[o + 2]) * damp;
      q[o] = p[o];
      q[o + 1] = p[o + 1];
      q[o + 2] = p[o + 2];
      p[o] += vx;
      p[o + 1] += vy + GRAVITY * SUB * SUB;
      p[o + 2] += vz;
      maxMove = Math.max(maxMove, Math.abs(vx) + Math.abs(vy) + Math.abs(vz));
    }
    return maxMove;
  }

  private solve() {
    const p = this.pos;
    for (const c of this.cons) {
      const a = c.a * 3;
      const b = c.b * 3;
      const dx = p[b] - p[a];
      const dy = p[b + 1] - p[a + 1];
      const dz = p[b + 2] - p[a + 2];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
      let target = d;
      if (d < c.min) target = c.min;
      else if (d > c.max) target = c.max;
      else continue;
      const wa = this.invMass[c.a];
      const wb = this.invMass[c.b];
      const k = (d - target) / (d * (wa + wb));
      p[a] += dx * k * wa;
      p[a + 1] += dy * k * wa;
      p[a + 2] += dz * k * wa;
      p[b] -= dx * k * wb;
      p[b + 1] -= dy * k * wb;
      p[b + 2] -= dz * k * wb;
    }
  }

  private collide(report: boolean) {
    const p = this.pos;
    const q = this.prev;
    const cz0 = COUNTER.z - COUNTER.depth / 2;
    const cz1 = COUNTER.z + COUNTER.depth / 2;
    for (let i = 0; i < J.COUNT; i++) {
      const o = i * 3;
      const r = this.radius[i];
      let ground = 0;
      const vy = p[o + 1] - q[o + 1];
      // floor
      if (p[o + 1] < r) {
        p[o + 1] = r;
        ground = 1;
      }
      // table tops (land on them when coming from above)
      for (const t of TABLES) {
        const dx = p[o] - t.x;
        const dz = p[o + 2] - t.z;
        if (dx * dx + dz * dz < t.r * t.r && p[o + 1] < TABLE_TOP_Y + r && q[o + 1] >= TABLE_TOP_Y + r - 0.02) {
          p[o + 1] = TABLE_TOP_Y + r;
          ground = 1;
        }
      }
      // order counter: push out along the shallowest axis
      const x = p[o];
      const y = p[o + 1];
      const z = p[o + 2];
      if (x > COUNTER.minX - r && x < COUNTER.maxX + r && z > cz0 - r && z < cz1 + r && y < COUNTER.height + r) {
        const up = COUNTER.height + r - y;
        const front = cz1 + r - z;
        const back = z - (cz0 - r);
        const m = Math.min(up, front, back);
        if (m === up) {
          p[o + 1] = COUNTER.height + r;
          ground = 1;
        } else if (m === front) p[o + 2] = cz1 + r;
        else p[o + 2] = cz0 - r;
      }
      // walls
      if (p[o] < ROOM.minX + r) p[o] = ROOM.minX + r;
      if (p[o] > ROOM.maxX - r) p[o] = ROOM.maxX - r;
      if (p[o + 2] < ROOM.minZ + r) p[o + 2] = ROOM.minZ + r;
      this.grounded[i] = ground;
      if (report && ground && vy < -0.02 && this.impactCooldown[i] <= 0) {
        this.impactCooldown[i] = 0.25;
        this.onImpact?.({ joint: i, speed: -vy / SUB, at: this.get(i, new THREE.Vector3()) });
      }
    }
  }

  /** Knees bend forward, elbows backward: mirror joints that folded wrong. */
  private hinges() {
    const fwd = this.forward(tmpC);
    const fix = (a: number, mid: number, b: number, sign: number) => {
      const pa = this.get(a, tmpA);
      const pb = this.get(b, tmpB);
      pa.add(pb).multiplyScalar(0.5);
      const pm = this.get(mid, tmpB).sub(pa);
      const side = pm.dot(fwd) * sign;
      // elbows get a dead zone so a nearly straight arm doesn't flip-flop every substep
      if (side < (sign < 0 ? -0.012 : 0)) {
        const o = mid * 3;
        const k = 2 * side * sign;
        const ny = this.pos[o + 1] - fwd.y * k;
        // lying down, the "right" way can point into the floor (or a table top): let the surface win
        if (ny < this.radius[mid] + 0.004 || (this.grounded[mid] && ny < this.pos[o + 1])) return;
        this.pos[o] -= fwd.x * k;
        this.pos[o + 1] = ny;
        this.pos[o + 2] -= fwd.z * k;
        this.prev[o] = this.pos[o];
        this.prev[o + 1] = this.pos[o + 1];
        this.prev[o + 2] = this.pos[o + 2];
      }
    };
    fix(J.HipL, J.KnL, J.FtL, 1);
    fix(J.HipR, J.KnR, J.FtR, 1);
    fix(J.ShL, J.ElL, J.HaL, -1);
    fix(J.ShR, J.ElR, J.HaR, -1);
  }

  /** World rotation whose +Y runs along `up` and whose X stays near `side`. */
  private basis(up: THREE.Vector3, side: THREE.Vector3, out: THREE.Quaternion): THREE.Quaternion {
    const y = up.clone().normalize();
    const x = side.clone().addScaledVector(y, -side.dot(y));
    if (x.lengthSq() < 1e-8) x.set(1, 0, 0).addScaledVector(y, -y.x);
    x.normalize();
    const z = new THREE.Vector3().crossVectors(x, y);
    tmpM.makeBasis(x, y, z);
    return out.setFromRotationMatrix(tmpM);
  }

  /** Pose the character's rig from the particles. */
  apply() {
    const r = this.model.rig;
    const P = (i: number) => this.get(i, new THREE.Vector3());
    const rootQ = r.root.getWorldQuaternion(new THREE.Quaternion());
    const setLocal = (joint: THREE.Object3D, parentWorld: THREE.Quaternion, world: THREE.Quaternion) => {
      joint.quaternion.copy(parentWorld).invert().multiply(world);
    };
    const pelvis = P(J.Pelvis);
    const chest = P(J.Chest);
    const neck = P(J.Neck);
    const head = P(J.Head);
    const hipSide = P(J.HipL).sub(P(J.HipR));
    const shSide = P(J.ShL).sub(P(J.ShR));

    const qPelvis = this.basis(chest.clone().sub(pelvis), hipSide, new THREE.Quaternion());
    r.pelvis.position.copy(r.root.worldToLocal(pelvis.clone()));
    setLocal(r.pelvis, rootQ, qPelvis);
    r.spine.quaternion.identity();
    const qChest = this.basis(neck.clone().sub(chest), shSide, new THREE.Quaternion());
    setLocal(r.chest, qPelvis, qChest);
    const qNeck = this.basis(head.clone().sub(neck), shSide, new THREE.Quaternion());
    setLocal(r.neck, qChest, qNeck);
    r.head.quaternion.identity();

    const limb = (a: number, b: number, c: number, j1: THREE.Object3D, j2: THREE.Object3D, j3: THREE.Object3D, parentQ: THREE.Quaternion, side: THREE.Vector3) => {
      const pa = P(a);
      const pb = P(b);
      const pc = P(c);
      const q1 = this.basis(pa.clone().sub(pb), side, new THREE.Quaternion());
      setLocal(j1, parentQ, q1);
      const q2 = this.basis(pb.clone().sub(pc), side, new THREE.Quaternion());
      setLocal(j2, q1, q2);
      j3.quaternion.identity();
    };
    limb(J.ShL, J.ElL, J.HaL, r.shoulderL, r.elbowL, r.handL, qChest, shSide);
    limb(J.ShR, J.ElR, J.HaR, r.shoulderR, r.elbowR, r.handR, qChest, shSide);
    limb(J.HipL, J.KnL, J.FtL, r.hipL, r.kneeL, r.footL, qPelvis, hipSide);
    limb(J.HipR, J.KnR, J.FtR, r.hipR, r.kneeR, r.footR, qPelvis, hipSide);
    r.root.updateMatrixWorld(true);
  }

  /** Where blood pools once the body is down: under the head. */
  headRest(out = new THREE.Vector3()): THREE.Vector3 {
    return this.get(J.Head, out);
  }

  static readonly HEAD = J.Head;
  static readonly CHEST = J.Chest;
  static readonly PELVIS = J.Pelvis;
}
