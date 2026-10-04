/**
 * The invasion fleet: thousands of ships (fighters, bombers, destroyers), simulated on the CPU
 * and drawn with instanced meshes.
 *
 * Life of a ship: hidden until its arrival time → atmospheric entry (falls from 2-3 km at
 * hypersonic speed wrapped in a plasma streak, braking hard) → patrol (a slot on a slowly
 * turning orbit around the invasion centre; steering with banking) → optionally an attack run
 * (fighters dive at a ground target near the player and strafe it with plasma bolts) → when
 * destroyed: a fireball, then the burning hulk tumbles down trailing smoke and fire and crashes,
 * blowing a crater and leaving wreckage. Ships can also be ordered to retreat (climb away).
 */
import * as THREE from 'three';
import { fighterGeometry, bomberGeometry, bomberRingGeometry, destroyerGeometry } from './shipDesigns';
import { hullMaterial, BillboardPool, BB_GLOW, BB_STREAK, BB_FIRE, BB_SMOKE } from './alienRender';
import type { Renderer } from '../../render/renderer';

export const enum Cls { Fighter = 0, Bomber = 1, Destroyer = 2 }

export interface ClassSpec {
  name: string;
  count: number;
  radius: number;
  hp: number;
  speed: number;
  agility: number;
  alt: [number, number];
  orbit: [number, number];
  glow: [number, number, number];
  glowSize: number;
  /** engine glow offset behind the centre (m) */
  tail: number;
}

export const CLASSES: ClassSpec[] = [
  { name: 'fighter', count: 2200, radius: 10, hp: 30, speed: 75, agility: 1.6, alt: [140, 520], orbit: [250, 2600], glow: [0.35, 0.95, 1.0], glowSize: 1.8, tail: 7 },
  { name: 'bomber', count: 340, radius: 20, hp: 120, speed: 48, agility: 0.8, alt: [380, 820], orbit: [400, 2800], glow: [0.25, 1.0, 0.75], glowSize: 3.6, tail: 16 },
  { name: 'destroyer', count: 38, radius: 70, hp: 1800, speed: 24, agility: 0.25, alt: [520, 950], orbit: [700, 3000], glow: [0.35, 0.95, 1.0], glowSize: 14, tail: 92 },
];

export const enum St { Waiting = 0, Entry = 1, Patrol = 2, Attack = 3, Falling = 4, Gone = 5, Retreat = 6 }

export interface Ship {
  cls: Cls;
  idx: number;
  st: St;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  quat: THREE.Quaternion;
  hp: number;
  /** arrival time (s) */
  arrive: number;
  /** patrol orbit: radius, angle, angular speed, altitude, phase */
  orR: number;
  orA: number;
  orW: number;
  orY: number;
  seed: number;
  roll: number;
  dmg: number;
  /** falling: angular velocity, smoke timer */
  spin: THREE.Vector3;
  smokeT: number;
  /** attack run: target point, time left, fire timer */
  tgt: THREE.Vector3;
  atkT: number;
  fireT: number;
  heading: number;
}

export interface FleetHooks {
  /** Terrain surface height at x,z (or null when unknown / unloaded). */
  ground(x: number, z: number): number | null;
  /** A hulk hit the ground. */
  crash(s: Ship, at: THREE.Vector3): void;
  /** A ship fired a bolt (from → dir). */
  fire(s: Ship, from: THREE.Vector3, dir: THREE.Vector3): void;
  /** A ship was destroyed in the air. */
  destroyed(s: Ship): void;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _f = new THREE.Vector3();
const _up = new THREE.Vector3();
const _r = new THREE.Vector3();
const _s1 = new THREE.Vector3(1, 1, 1);
const _s0 = new THREE.Vector3(0, 0, 0);
const _basis = new THREE.Matrix4();
const rnd = Math.random;

interface Fire {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  size: number;
  age: number;
  life: number;
  seed: number;
  kind: number;
  r: number;
  g: number;
  b: number;
  a: number;
}

export class Fleet {
  readonly ships: Ship[] = [];
  readonly group = new THREE.Group();
  private meshes: THREE.InstancedMesh[] = [];
  private states: Float32Array[] = [];
  private ring: THREE.InstancedMesh;
  private ringState: Float32Array;
  readonly glows: BillboardPool;
  readonly streaks: BillboardPool;
  readonly fires: BillboardPool;
  readonly smoke: BillboardPool;
  private puffs: Fire[] = [];
  readonly center = new THREE.Vector3();
  time = 0;
  /** world-space target the attack runs pick from */
  readonly attackCenter = new THREE.Vector3();
  attackers = 0;
  maxAttackers = 0;
  alive = 0;

  constructor(r: Renderer, center: THREE.Vector3, private hooks: FleetHooks, scale = 1) {
    this.center.copy(center);
    this.attackCenter.copy(center);
    const geos = [fighterGeometry(), bomberGeometry(), destroyerGeometry()];
    CLASSES.forEach((c, ci) => {
      const n = Math.max(1, Math.round(c.count * scale));
      const mesh = new THREE.InstancedMesh(geos[ci], hullMaterial(r, true, 6), n);
      const st = new Float32Array(n * 4);
      mesh.geometry.setAttribute('a_state', new THREE.InstancedBufferAttribute(st, 4).setUsage(THREE.DynamicDrawUsage));
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      this.meshes.push(mesh);
      this.states.push(st);
      this.group.add(mesh);
      for (let i = 0; i < n; i++) this.ships.push(this.makeShip(ci as Cls, i));
    });
    const nb = this.meshes[Cls.Bomber].count;
    this.ring = new THREE.InstancedMesh(bomberRingGeometry(), hullMaterial(r, true, 6), nb);
    this.ringState = new Float32Array(nb * 4);
    this.ring.geometry.setAttribute('a_state', new THREE.InstancedBufferAttribute(this.ringState, 4).setUsage(THREE.DynamicDrawUsage));
    this.ring.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.ring.frustumCulled = false;
    this.group.add(this.ring);
    this.glows = new BillboardPool(r, this.ships.length + 400, false, 2.2);
    this.streaks = new BillboardPool(r, this.ships.length + 600, false, 1.5);
    this.fires = new BillboardPool(r, 1500, false, 1.2);
    this.smoke = new BillboardPool(r, 2500, true, 1.0);
    this.group.add(this.smoke.mesh, this.fires.mesh, this.glows.mesh, this.streaks.mesh);
    this.alive = this.ships.length;
  }

  private makeShip(cls: Cls, idx: number): Ship {
    const c = CLASSES[cls];
    const orR = c.orbit[0] + Math.sqrt(rnd()) * (c.orbit[1] - c.orbit[0]);
    const orA = rnd() * Math.PI * 2;
    const orY = c.alt[0] + rnd() * (c.alt[1] - c.alt[0]);
    // the fleet comes in from one side of the sky, in waves
    const wave = Math.floor(rnd() * 4);
    const arrive = 2 + wave * 9 + rnd() * 9 + (cls === Cls.Destroyer ? 6 : 0);
    const ang = orA + (rnd() - 0.5) * 0.6;
    const pos = new THREE.Vector3(this.center.x + Math.cos(ang) * (orR + 1500), this.center.y + 1800 + rnd() * 1400, this.center.z + Math.sin(ang) * (orR + 1500));
    return {
      cls, idx, st: St.Waiting, pos, vel: new THREE.Vector3(), quat: new THREE.Quaternion(), hp: c.hp, arrive,
      orR, orA, orW: (rnd() < 0.5 ? 1 : -1) * (0.012 + rnd() * 0.02) * (cls === Cls.Destroyer ? 0.3 : 1), orY, seed: rnd(), roll: 0, dmg: 0,
      spin: new THREE.Vector3(), smokeT: 0, tgt: new THREE.Vector3(), atkT: 0, fireT: 0, heading: NaN,
    };
  }

  /** Where the ship's patrol slot is now. */
  private slot(s: Ship, out: THREE.Vector3) {
    const a = s.orA + s.orW * this.time;
    const wob = Math.sin(this.time * 0.3 + s.seed * 20) * 30;
    return out.set(this.center.x + Math.cos(a) * (s.orR + wob), this.center.y + s.orY + Math.sin(this.time * 0.5 + s.seed * 9) * 12, this.center.z + Math.sin(a) * (s.orR + wob));
  }

  /** Damage a ship; returns true if this destroyed it. */
  hit(s: Ship, dmg: number, dir?: THREE.Vector3): boolean {
    if (s.st === St.Falling || s.st === St.Gone || s.st === St.Waiting) return false;
    s.hp -= dmg;
    s.dmg = Math.min(1, Math.max(s.dmg, 1 - s.hp / CLASSES[s.cls].hp));
    if (s.hp > 0) return false;
    this.kill(s, dir);
    return true;
  }

  kill(s: Ship, dir?: THREE.Vector3) {
    if (s.st === St.Attack) this.attackers--;
    s.st = St.Falling;
    s.dmg = 1;
    const c = CLASSES[s.cls];
    if (dir) s.vel.addScaledVector(dir, 25);
    s.vel.y += 8;
    s.spin.set((rnd() - 0.5) * 2.5, (rnd() - 0.5) * 2.5, (rnd() - 0.5) * 4).multiplyScalar(s.cls === Cls.Destroyer ? 0.15 : 1);
    // the blast
    const n = s.cls === Cls.Destroyer ? 14 : s.cls === Cls.Bomber ? 5 : 3;
    for (let i = 0; i < n; i++) {
      _v.set(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(c.radius * 0.9);
      this.addPuff(s.pos.x + _v.x, s.pos.y + _v.y, s.pos.z + _v.z, _v.x * 0.6, _v.y * 0.6 + 3, _v.z * 0.6, c.radius * (1.2 + rnd() * 0.8), 0.9 + rnd() * 0.8, BB_FIRE, 1, 1, 1, 1.4);
    }
    for (let i = 0; i < n; i++) this.addPuff(s.pos.x, s.pos.y, s.pos.z, (rnd() - 0.5) * 12, rnd() * 6, (rnd() - 0.5) * 12, c.radius * (1.5 + rnd()), 4 + rnd() * 3, BB_SMOKE, 0.09, 0.085, 0.08, 0.85);
    this.alive--;
    this.hooks.destroyed(s);
  }

  /** Order every ship still flying to climb away. */
  retreat() {
    for (const s of this.ships) if (s.st === St.Patrol || s.st === St.Attack || s.st === St.Entry) {
      if (s.st === St.Attack) this.attackers--;
      s.st = St.Retreat;
    }
  }

  addPuff(x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number, life: number, kind: number, r: number, g: number, b: number, a: number) {
    if (this.puffs.length > 2400) return;
    this.puffs.push({ pos: new THREE.Vector3(x, y, z), vel: new THREE.Vector3(vx, vy, vz), size, age: 0, life, seed: rnd(), kind, r, g, b, a });
  }

  /** Per frame. `cam` = camera position (for LOD / sounds). */
  update(dt: number, cam: THREE.Vector3) {
    this.time += dt;
    const t = this.time;
    this.glows.begin();
    this.streaks.begin();
    const counts = [0, 0, 0];
    for (const s of this.ships) {
      const c = CLASSES[s.cls];
      this.step(s, c, dt);
      counts[s.cls]++;
      // instance transform
      const st = this.states[s.cls];
      const k = s.idx * 4;
      if (s.st === St.Waiting || s.st === St.Gone) {
        _m.compose(s.pos, s.quat, _s0);
        this.meshes[s.cls].setMatrixAt(s.idx, _m);
        if (s.cls === Cls.Bomber) this.ring.setMatrixAt(s.idx, _m);
        continue;
      }
      _m.compose(s.pos, s.quat, _s1);
      this.meshes[s.cls].setMatrixAt(s.idx, _m);
      st[k] = s.dmg;
      st[k + 1] = s.st === St.Falling ? 0.15 : 1;
      st[k + 2] = s.seed;
      st[k + 3] = s.st === St.Falling ? 1 : 0;
      if (s.cls === Cls.Bomber) {
        _q.setFromAxisAngle(_v.set(0, 0, 1), t * (1.2 + s.seed) * (s.st === St.Falling ? 0.2 : 1));
        _m.compose(s.pos, _q2.copy(s.quat).multiply(_q), _s1);
        this.ring.setMatrixAt(s.idx, _m);
        this.ringState.set(st.subarray(k, k + 4), k);
      }
      // engine glow (a light even when the ship is a dot kilometres away)
      if (s.st !== St.Falling) {
        _f.set(0, 0, c.tail).applyQuaternion(s.quat).add(s.pos);
        const gl = c.glow;
        const sp = s.vel.length();
        const I = 6 + Math.min(10, sp * 0.05);
        this.glows.push(_f.x, _f.y, _f.z, c.glowSize, c.glowSize, gl[0] * I, gl[1] * I, gl[2] * I, 1, BB_GLOW, s.seed);
        // plasma sheath on entry
        if (s.st === St.Entry && sp > 110) {
          const heat = Math.min(1, (sp - 110) / 300);
          _w.copy(s.vel).normalize();
          const len = c.radius * (2 + heat * 10);
          this.streaks.push(s.pos.x - _w.x * len * 0.8, s.pos.y - _w.y * len * 0.8, s.pos.z - _w.z * len * 0.8, c.radius * 1.3, len, 9 * heat, 4.2 * heat, 1.4 * heat, 1, BB_STREAK, s.seed, 0, _w.x, _w.y, _w.z);
        }
      }
    }
    for (const m of this.meshes) {
      m.instanceMatrix.needsUpdate = true;
      (m.geometry.attributes.a_state as THREE.InstancedBufferAttribute).needsUpdate = true;
    }
    this.ring.instanceMatrix.needsUpdate = true;
    (this.ring.geometry.attributes.a_state as THREE.InstancedBufferAttribute).needsUpdate = true;
    // puffs: fire additive, smoke alpha
    this.fires.begin();
    this.smoke.begin();
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      p.age += dt;
      if (p.age >= p.life) { this.puffs[i] = this.puffs[this.puffs.length - 1]; this.puffs.pop(); continue; }
      p.vel.multiplyScalar(Math.exp(-dt * 0.8));
      if (p.kind === BB_SMOKE) p.vel.y += dt * 1.5;
      p.pos.addScaledVector(p.vel, dt);
      const u = p.age / p.life;
      if (p.kind === BB_FIRE) {
        const sz = p.size * (0.4 + 0.8 * Math.sqrt(u));
        this.fires.push(p.pos.x, p.pos.y, p.pos.z, sz, sz, p.r * 6, p.g * 6, p.b * 6, p.a, BB_FIRE, p.seed, u);
      } else {
        const sz = p.size * (0.5 + 1.2 * Math.sqrt(u));
        this.smoke.push(p.pos.x, p.pos.y, p.pos.z, sz, sz, p.r, p.g, p.b, p.a * (1 - u) * Math.min(1, u * 8), BB_SMOKE, p.seed, u);
      }
    }
    this.glows.commit();
    this.streaks.commit();
    this.fires.commit();
    this.smoke.commit();
    void cam;
    void counts;
  }

  private step(s: Ship, c: ClassSpec, dt: number) {
    const t = this.time;
    switch (s.st) {
      case St.Waiting: {
        if (t >= s.arrive) {
          s.st = St.Entry;
          // hypersonic, steep entry toward the slot
          this.slot(s, _v);
          s.vel.copy(_v).sub(s.pos).normalize().multiplyScalar(420 + rnd() * 160);
        }
        return;
      }
      case St.Entry: {
        this.slot(s, _v);
        _w.copy(_v).sub(s.pos);
        const d = _w.length();
        // brake hard as the slot approaches
        const want = Math.min(520, Math.max(c.speed, d * 0.6));
        _w.normalize().multiplyScalar(want);
        s.vel.lerp(_w, 1 - Math.exp(-dt * 0.9));
        if (d < 120 || s.vel.length() < c.speed * 1.3) s.st = St.Patrol;
        break;
      }
      case St.Patrol: {
        this.slot(s, _v);
        _w.copy(_v).sub(s.pos);
        const d = _w.length();
        const want = Math.min(c.speed * 1.8, Math.max(c.speed * 0.6, d * 0.25));
        _w.normalize().multiplyScalar(want);
        s.vel.lerp(_w, 1 - Math.exp(-dt * c.agility));
        // attack runs
        if (s.cls === Cls.Fighter && this.attackers < this.maxAttackers && rnd() < dt * 0.02) {
          s.st = St.Attack;
          this.attackers++;
          const a = rnd() * Math.PI * 2, r = 20 + rnd() * 110;
          s.tgt.set(this.attackCenter.x + Math.cos(a) * r, this.attackCenter.y, this.attackCenter.z + Math.sin(a) * r);
          s.atkT = 14;
          s.fireT = 0;
        }
        break;
      }
      case St.Attack: {
        s.atkT -= dt;
        const gy = this.hooks.ground(s.tgt.x, s.tgt.z) ?? s.tgt.y;
        s.tgt.y = gy;
        // approach from altitude, strafe low over the target, then climb back out
        _v.set(s.tgt.x - s.pos.x, 0, s.tgt.z - s.pos.z);
        const hd = _v.length();
        const runY = gy + 55 + Math.min(200, hd * 0.25);
        _w.set(s.tgt.x, runY, s.tgt.z).sub(s.pos);
        if (hd < 60) _w.copy(s.vel).setY(Math.max(0, s.vel.y));
        _w.normalize().multiplyScalar(c.speed * 1.5);
        s.vel.lerp(_w, 1 - Math.exp(-dt * 1.4));
        // fire at the target when lined up
        _f.copy(s.vel).normalize();
        _r.set(s.tgt.x, gy, s.tgt.z).sub(s.pos);
        const dist = _r.length();
        _r.divideScalar(dist);
        s.fireT -= dt;
        if (dist < 420 && _f.dot(_r) > 0.82 && s.fireT <= 0) {
          s.fireT = 0.22 + rnd() * 0.12;
          _v.set(0, -0.3, -9).applyQuaternion(s.quat).add(s.pos);
          _r.x += (rnd() - 0.5) * 0.05; _r.z += (rnd() - 0.5) * 0.05;
          this.hooks.fire(s, _v.clone(), _r.clone().normalize());
        }
        if (s.atkT <= 0 || (hd < 40 && s.pos.y < runY + 20)) {
          s.st = St.Patrol;
          this.attackers--;
          s.vel.y += 20;
        }
        break;
      }
      case St.Retreat: {
        _w.set(s.pos.x - this.center.x, 0, s.pos.z - this.center.z).normalize().multiplyScalar(0.4);
        _w.y = 1;
        _w.normalize().multiplyScalar(260);
        s.vel.lerp(_w, 1 - Math.exp(-dt * 0.5));
        if (s.pos.y > this.center.y + 3600) s.st = St.Gone;
        break;
      }
      case St.Falling: {
        s.vel.y -= 13 * dt;
        s.vel.multiplyScalar(Math.exp(-dt * 0.05));
        _q.setFromEuler(new THREE.Euler(s.spin.x * dt, s.spin.y * dt, s.spin.z * dt));
        s.quat.multiply(_q);
        s.pos.addScaledVector(s.vel, dt);
        // smoke + fire trail
        s.smokeT -= dt;
        const R = c.radius;
        while (s.smokeT <= 0) {
          s.smokeT += s.cls === Cls.Destroyer ? 0.03 : 0.07;
          this.addPuff(s.pos.x, s.pos.y, s.pos.z, (rnd() - 0.5) * 3, rnd() * 2, (rnd() - 0.5) * 3, R * (0.9 + rnd() * 0.6), 5 + rnd() * 4, BB_SMOKE, 0.07, 0.065, 0.06, 0.8);
          this.addPuff(s.pos.x, s.pos.y, s.pos.z, (rnd() - 0.5) * 4, rnd() * 2, (rnd() - 0.5) * 4, R * (0.5 + rnd() * 0.5), 0.5 + rnd() * 0.4, BB_FIRE, 1, 0.9, 0.8, 1);
        }
        const gy = this.hooks.ground(s.pos.x, s.pos.z);
        if ((gy !== null && s.pos.y <= gy + R * 0.2) || s.pos.y < this.center.y - 200) {
          s.st = St.Gone;
          if (gy !== null) {
            s.pos.y = gy;
            this.hooks.crash(s, s.pos.clone());
          }
        }
        return;
      }
      default:
        return;
    }
    // integrate + orient with banking
    s.pos.addScaledVector(s.vel, dt);
    const sp = s.vel.length();
    if (sp > 0.5) {
      _f.copy(s.vel).divideScalar(sp);
      // bank into turns: lateral acceleration from the change of heading
      const yawRate = this.turnRate(s, _f, dt);
      s.roll += (THREE.MathUtils.clamp(-yawRate * 1.2, -1.1, 1.1) - s.roll) * (1 - Math.exp(-dt * 2));
      _up.set(0, 1, 0);
      _r.crossVectors(_f, _up);
      if (_r.lengthSq() < 1e-6) _r.set(1, 0, 0);
      _r.normalize();
      _up.crossVectors(_r, _f);
      // ship forward is -Z
      _basis.makeBasis(_r, _up, _w.copy(_f).negate());
      s.quat.setFromRotationMatrix(_basis);
      s.quat.multiply(_q.setFromAxisAngle(_v.set(0, 0, 1), s.roll));
    }
  }

  private turnRate(s: Ship, f: THREE.Vector3, dt: number): number {
    const h = Math.atan2(f.x, f.z);
    const prev = Number.isNaN(s.heading) ? h : s.heading;
    s.heading = h;
    let d = h - prev;
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return dt > 0 ? d / dt : 0;
  }

  /** Nearest ship whose hit sphere the ray (unit dir) passes through before maxT. */
  raycast(o: THREE.Vector3, d: THREE.Vector3, maxT: number): { ship: Ship; t: number } | null {
    let best: Ship | null = null, bt = maxT;
    for (const s of this.ships) {
      if (s.st === St.Waiting || s.st === St.Gone || s.st === St.Falling) continue;
      const R = CLASSES[s.cls].radius * (s.cls === Cls.Destroyer ? 0.8 : 1);
      const ox = s.pos.x - o.x, oy = s.pos.y - o.y, oz = s.pos.z - o.z;
      const tc = ox * d.x + oy * d.y + oz * d.z;
      if (tc < 0 || tc - R > bt) continue;
      const d2 = ox * ox + oy * oy + oz * oz - tc * tc;
      if (d2 > R * R) continue;
      const th = Math.sqrt(R * R - d2);
      const t0 = tc - th;
      if (t0 < bt) { bt = Math.max(0, t0); best = s; }
    }
    return best ? { ship: best, t: bt } : null;
  }

  /** Ships whose hit spheres intersect a sphere. */
  inSphere(c: THREE.Vector3, r: number, out: Ship[] = []): Ship[] {
    for (const s of this.ships) {
      if (s.st === St.Waiting || s.st === St.Gone || s.st === St.Falling) continue;
      const R = CLASSES[s.cls].radius + r;
      if (s.pos.distanceToSquared(c) < R * R) out.push(s);
    }
    return out;
  }

  dispose() {
    this.group.removeFromParent();
    for (const m of this.meshes) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); }
    this.ring.geometry.dispose();
    (this.ring.material as THREE.Material).dispose();
    this.glows.dispose();
    this.streaks.dispose();
    this.fires.dispose();
    this.smoke.dispose();
  }
}
