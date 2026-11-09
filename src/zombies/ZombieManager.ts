/**
 * Spawns, animates and drives zombies; detects car hits; turns victims into
 * ragdolls (with limb severing); handles climbers, bloaters and explosions.
 */
import { Matrix, Vector3 } from "@babylonjs/core";
import { Debug } from "../core/Debug";
import { Time } from "../core/Time";
import { ZOMBIES, type ZombieType } from "../data/zombies";
import type { GameContext, ILevel, ITarget, IVehicle, IZombies } from "../core/types";
import { Ragdoll, SEVERABLE } from "./Ragdoll";
import { PART_INDEX, ZombieFactory, type ZombieBody } from "./ZombieModel";

type State = "idle" | "eat" | "chase" | "leap" | "cling" | "burning";

class Zombie implements ITarget {
  readonly position = new Vector3(); // feet
  readonly center = new Vector3();
  vel = new Vector3();
  yaw = Math.PI;
  phase = Math.random() * 10;
  alive = true;
  state: State = "idle";
  stateTime = 0;
  burn = 0;
  shove = 0;
  hp: number;
  clingLocal = new Vector3();
  shakeOff = 0;
  constructor(
    readonly mgr: ZombieManager,
    readonly type: ZombieType,
    readonly body: ZombieBody,
  ) {
    this.hp = ZOMBIES[type].health;
  }
  get def() {
    return this.body.def;
  }
  hit(force: number, direction: Vector3, kind: "bullet" | "fire" | "explosion"): void {
    if (!this.alive) return;
    if (kind === "fire") {
      if (this.state !== "burning") this.mgr.ignite(this);
      return;
    }
    this.hp -= force;
    if (this.hp <= 0) this.mgr.kill(this, direction.scale(force * (kind === "explosion" ? 1.5 : 0.8)), force, kind === "explosion");
    else this.shove = 0.4;
  }
}

const QUALITY_CAPS = { low: { live: 60, ragdolls: 12 }, medium: { live: 110, ragdolls: 22 }, high: { live: 160, ragdolls: 32 } };

export class ZombieManager implements IZombies {
  private factory: ZombieFactory;
  private zombies: Zombie[] = [];
  private ragdolls: Ragdoll[] = [];
  private spawnedTo = 35;
  private rng: () => number;
  private unsubs: (() => void)[] = [];
  private recentKills: number[] = [];
  private pendingExplosions: { pos: Vector3; radius: number; power: number }[] = [];
  private caps: { live: number; ragdolls: number };
  private prevForward = new Vector3(0, 0, 1);
  // scratch
  private tmp = new Vector3();
  private tmp2 = new Vector3();
  private inv = new Matrix();
  private right = new Vector3();

  constructor(
    private ctx: GameContext,
    private level: ILevel,
    private vehicle: IVehicle,
  ) {
    this.factory = new ZombieFactory(ctx.scene);
    this.caps = QUALITY_CAPS[ctx.save.data.settings.quality];
    let seed = (level.def.id + 1) * 7919 + ((ctx.save.data.runs * 104729) % 9973);
    this.rng = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    this.unsubs.push(
      ctx.events.on("carImpact", (e) => {
        if (e.force > 9) for (const z of this.zombies) if (z.state === "cling") z.shakeOff += 1;
      }),
    );
    Debug.tune("zombie density x", this.tuning, "density", 0, 4, 0.1);
  }

  private tuning = { density: 1 };

  get aliveCount(): number {
    return this.zombies.length;
  }

  // ───────────────────────────── spawning ─────────────────────────────

  private pickType(): ZombieType {
    const w = this.level.def.zombieTypes;
    let total = 0;
    for (const k in w) total += w[k];
    let r = this.rng() * total;
    for (const k in w) {
      r -= w[k];
      if (r <= 0) return k as ZombieType;
    }
    return "shambler";
  }

  private spawn(type: ZombieType, x: number, z: number): void {
    if (this.zombies.length >= this.caps.live) return;
    const body = this.factory.create(type);
    const zb = new Zombie(this, type, body);
    zb.position.set(x, this.level.heightAt(x, z), z);
    zb.yaw = Math.PI + (this.rng() - 0.5) * 2;
    zb.state = this.rng() < 0.3 ? "eat" : "idle";
    body.root.position.copyFrom(zb.position);
    this.zombies.push(zb);
  }

  private spawnAhead(carZ: number): void {
    const def = this.level.def;
    const ahead = carZ + 240;
    while (this.spawnedTo < ahead && this.spawnedTo < def.length + 40) {
      const z0 = this.spawnedTo;
      this.spawnedTo += 10;
      const t = Math.min(1, z0 / def.length);
      const perTen = ((def.zombieDensity + (def.zombieDensityEnd - def.zombieDensity) * t) / 10) * this.tuning.density;
      if (perTen <= 0) continue;
      let n = Math.floor(perTen) + (this.rng() < perTen % 1 ? 1 : 0);
      const half = this.level.roadHalfWidth(z0);
      if (this.rng() < 0.12 + t * 0.15) {
        // horde cluster
        const cx = this.level.roadCenterX(z0) + (this.rng() - 0.5) * half * 1.4;
        const count = 4 + Math.floor(this.rng() * (5 + t * 6));
        for (let i = 0; i < count; i++) {
          const zz = z0 + this.rng() * 8;
          this.spawn(this.pickType(), cx + (this.rng() - 0.5) * 6, zz);
        }
        n = Math.max(0, n - 2);
      }
      for (let i = 0; i < n; i++) {
        const zz = z0 + this.rng() * 10;
        const off = (this.rng() * 2 - 1) * (half + 3);
        this.spawn(this.pickType(), this.level.roadCenterX(zz) + off, zz);
      }
    }
  }

  // ───────────────────────────── per frame ─────────────────────────────

  update(dt: number): void {
    const v = this.vehicle;
    const carPos = v.position;
    this.spawnAhead(carPos.z);

    // Car orientation helpers for the hit test.
    v.chassis.computeWorldMatrix();
    v.chassis.getWorldMatrix().invertToRef(this.inv);
    Vector3.CrossToRef(v.up, v.forward, this.right);
    const yawRate = dt > 0 ? Math.acos(Math.min(1, Vector3.Dot(this.prevForward, v.forward))) / dt : 0;
    this.prevForward.copyFrom(v.forward);

    const speed = v.velocity.length();
    const sz = v.def.size;
    const halfW = sz.width / 2 + 0.25;
    const halfL = sz.length / 2 + 0.3;

    for (let i = this.zombies.length - 1; i >= 0; i--) {
      const z = this.zombies[i];
      if (!z.alive) continue;
      z.stateTime += dt;
      const dz = z.position.z - carPos.z;
      if (dz < -45 && z.state !== "cling") {
        this.remove(i);
        continue;
      }

      if (z.state === "cling") {
        this.updateCling(z, dt, yawRate, speed);
        continue;
      }
      this.think(z, dt);
      this.animate(z, dt);

      // Hit test against the car's oriented box (in car-local space).
      if (Math.abs(dz) < 12) {
        const lp = Vector3.TransformCoordinatesToRef(z.position, this.inv, this.tmp);
        const top = sz.height / 2 + 0.6;
        const bottom = -sz.height / 2 - v.def.rideHeight - z.def.height;
        const r = 0.3 * z.def.girth;
        if (Math.abs(lp.x) < halfW + r && Math.abs(lp.z) < halfL + r && lp.y < top && lp.y > bottom) {
          this.onCarContact(z, speed);
        }
      }
    }

    // Explosions queued by bloaters (processed outside the loop to allow chains).
    if (this.pendingExplosions.length) {
      const list = this.pendingExplosions.splice(0);
      for (const e of list) this.ctx.events.emit("explosion", { position: e.pos, radius: e.radius, power: e.power });
    }

    this.updateRagdolls(dt);
    Debug.watch("zombies", this.zombies.length);
    Debug.watch("ragdolls", this.ragdolls.length);
  }

  private think(z: Zombie, dt: number): void {
    const v = this.vehicle;
    const def = z.def;
    const toCar = this.tmp2.copyFrom(v.position).subtractInPlace(z.position);
    toCar.y = 0;
    const dist = toCar.length();

    if (z.state === "burning") {
      z.burn += dt;
      z.yaw += dt * 6;
      if (z.burn > 1.6) this.kill(z, new Vector3(0, 1, 0), 3, false);
      return;
    }
    if (z.state === "leap") {
      // Ballistic hop onto the car.
      const t = Math.min(1, z.stateTime / 0.45);
      Vector3.LerpToRef(z.position, v.position, t * 0.35, z.position);
      z.position.y += Math.sin(t * Math.PI) * 0.25;
      if (t >= 1) this.startCling(z);
      return;
    }
    if ((z.state === "idle" || z.state === "eat") && dist < def.aggroRange) {
      z.state = "chase";
      z.stateTime = 0;
    }
    let move = 0;
    if (z.state === "chase") {
      // Intercept: aim where the car will be, mostly lateral for slow walkers.
      const lead = Math.min(2.5, dist / Math.max(4, v.velocity.length()));
      const tx = v.position.x + v.velocity.x * lead;
      const tz = v.position.z + v.velocity.z * lead * (def.speed > 3 ? 1 : 0.2);
      const want = Math.atan2(tx - z.position.x, tz - z.position.z);
      let d = want - z.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      z.yaw += d * Math.min(1, dt * (def.speed > 3 ? 6 : 2.5));
      move = def.speed;
      if (def.climbs && dist < 6 && dist > 1.5 && v.velocity.length() < 30 && z.stateTime > 0.5) {
        z.state = "leap";
        z.stateTime = 0;
        return;
      }
    } else if (z.state === "idle") {
      move = def.speed * 0.25 * (Math.sin(z.phase * 0.3) > 0.6 ? 1 : 0);
      z.yaw += Math.sin(z.phase * 0.2) * dt * 0.3;
    }
    if (z.shove > 0) {
      z.shove -= dt;
      move *= 0.2;
    }
    z.position.x += Math.sin(z.yaw) * move * dt;
    z.position.z += Math.cos(z.yaw) * move * dt;
    // keep out of the side walls
    const cx = this.level.roadCenterX(z.position.z);
    const lim = this.level.roadHalfWidth(z.position.z) + 7;
    z.position.x = Math.max(cx - lim, Math.min(cx + lim, z.position.x));
    z.position.y = this.level.heightAt(z.position.x, z.position.z);
    z.phase += dt * (0.6 + move * 1.1);
  }

  /** Procedural animation: sets joint rotations from type + state + phase. */
  private animate(z: Zombie, _dt: number): void {
    const b = z.body;
    const j = b.joints;
    const p = z.phase;
    b.root.position.copyFrom(z.position);
    b.root.rotation.y = z.yaw;
    const s = Math.sin(p * 2.2);
    const c = Math.cos(p * 2.2);
    const pelvis = j[PART_INDEX.pelvis];
    const chest = j[PART_INDEX.chest];
    const head = j[PART_INDEX.head];
    const uaL = j[PART_INDEX.upperArmL], uaR = j[PART_INDEX.upperArmR];
    const faL = j[PART_INDEX.foreArmL], faR = j[PART_INDEX.foreArmR];
    const thL = j[PART_INDEX.thighL], thR = j[PART_INDEX.thighR];
    const shL = j[PART_INDEX.shinL], shR = j[PART_INDEX.shinR];
    const baseY = 0.5 * b.scale * (z.type === "climber" ? 0.88 : 1);

    if (z.state === "eat") {
      // crouched, gnawing
      pelvis.position.y = baseY * 0.55;
      pelvis.rotation.set(0.3, 0, 0);
      chest.rotation.set(0.9 + Math.sin(p * 9) * 0.08, 0, 0);
      head.rotation.set(0.4 + Math.sin(p * 11) * 0.15, 0, 0);
      thL.rotation.set(-1.6, 0, -0.2);
      thR.rotation.set(-1.4, 0, 0.2);
      shL.rotation.set(2.2, 0, 0);
      shR.rotation.set(2.0, 0, 0);
      uaL.rotation.set(-1.2 + Math.sin(p * 9) * 0.2, 0, 0.2);
      uaR.rotation.set(-1.0 - Math.sin(p * 9) * 0.2, 0, -0.2);
      faL.rotation.set(-0.9, 0, 0);
      faR.rotation.set(-1.1, 0, 0);
      z.phase += 0.016;
      return;
    }
    if (z.state === "burning") {
      pelvis.position.y = baseY;
      chest.rotation.set(Math.sin(p * 13) * 0.3, Math.sin(p * 7) * 0.4, 0);
      uaL.rotation.set(-2.6 + Math.sin(p * 17) * 0.6, 0, 0.4);
      uaR.rotation.set(-2.6 + Math.cos(p * 15) * 0.6, 0, -0.4);
      faL.rotation.x = faR.rotation.x = -0.6;
      thL.rotation.x = Math.sin(p * 12) * 0.8;
      thR.rotation.x = -Math.sin(p * 12) * 0.8;
      shL.rotation.x = shR.rotation.x = 0.4;
      z.phase += 0.05;
      return;
    }

    const running = z.state === "chase" && z.def.speed > 3;
    const walking = z.state === "chase" || Math.sin(z.phase * 0.3) > 0.6;
    if (running) {
      const lean = z.type === "climber" ? 0.75 : 0.45;
      pelvis.position.y = baseY * (z.type === "climber" ? 0.82 : 0.96) + Math.abs(c) * 0.05 * b.scale;
      pelvis.rotation.set(lean * 0.4, s * 0.15, 0);
      chest.rotation.set(lean, -s * 0.25, 0);
      head.rotation.set(-lean * 0.8, 0, 0);
      thL.rotation.set(-s * 1.1 - 0.2, 0, 0);
      thR.rotation.set(s * 1.1 - 0.2, 0, 0);
      shL.rotation.set(0.3 + Math.max(0, c) * 1.6, 0, 0);
      shR.rotation.set(0.3 + Math.max(0, -c) * 1.6, 0, 0);
      // arms reaching forward, flailing
      uaL.rotation.set(-1.5 + s * 0.5, 0, 0.15);
      uaR.rotation.set(-1.5 - s * 0.5, 0, -0.15);
      faL.rotation.set(-0.3, 0, 0);
      faR.rotation.set(-0.3, 0, 0);
    } else {
      // shamble: dragging right leg, sway, arms out
      const amp = walking ? 1 : 0.15;
      const heavy = z.type === "brute" || z.type === "bloater";
      pelvis.position.y = baseY - Math.abs(s) * 0.03 * b.scale * amp;
      pelvis.rotation.set(0.1, 0, s * 0.12 * amp + 0.06);
      chest.rotation.set(0.35 + (heavy ? 0.1 : 0), s * 0.2 * amp, -s * 0.1 * amp);
      head.rotation.set(-0.2 + Math.sin(p * 0.9) * 0.15, Math.sin(p * 0.7) * 0.4, 0.35 + Math.sin(p * 1.3) * 0.1);
      thL.rotation.set(-s * 0.55 * amp, 0, heavy ? -0.12 : 0);
      thR.rotation.set(s * 0.3 * amp + 0.1, 0, heavy ? 0.12 : 0.05);
      shL.rotation.set(0.15 + Math.max(0, -c) * 0.7 * amp, 0, 0);
      shR.rotation.set(0.1, 0, 0);
      uaL.rotation.set(-1.25 + s * 0.15 * amp, 0, 0.1 + (heavy ? 0.3 : 0));
      uaR.rotation.set(-1.05 - s * 0.15 * amp, 0, -0.1 - (heavy ? 0.3 : 0));
      faL.rotation.set(-0.35 + Math.sin(p * 1.7) * 0.15, 0, 0);
      faR.rotation.set(-0.2, 0, 0);
    }
  }

  // ───────────────────────────── hits & kills ─────────────────────────────

  private onCarContact(z: Zombie, speed: number): void {
    const v = this.vehicle;
    const def = z.def;
    if (speed >= def.health || z.state === "burning") {
      // Push the car back proportional to mass ratio.
      const ratio = def.mass / (def.mass + v.def.mass);
      v.applyDrag(Math.min(0.5, ratio * (1 - v.stats.zombieResistance) * 2.2));
      v.damage((def.mass / 70) * 0.6 * (1 - v.stats.zombieResistance * 0.5));
      const dir = v.velocity.clone();
      this.kill(z, dir.scale(1.15), speed, false);
    } else {
      // Too slow to kill: shove the zombie aside.
      const away = z.position.subtract(v.position);
      away.y = 0;
      away.normalize().scaleInPlace(0.6);
      z.position.addInPlace(away);
      z.shove = 0.6;
      if (def.mass > v.def.mass * 0.15) v.applyDrag(0.08);
    }
  }

  /** Turn a live zombie into a flying ragdoll. */
  kill(z: Zombie, velocity: Vector3, force: number, explosive: boolean): void {
    if (!z.alive) return;
    z.alive = false;
    const i = this.zombies.indexOf(z);
    if (i >= 0) this.zombies.splice(i, 1);
    if (z.state === "cling") z.body.root.setParent(null);
    z.body.root.position.copyFrom(z.position);
    z.body.root.computeWorldMatrix(true);

    const def = z.def;
    const v = this.vehicle;
    // Launch: car velocity + upward pop + sideways scatter; heavier = less.
    const massK = Math.min(1.2, 120 / def.mass + 0.3);
    const base = velocity.clone();
    base.y = Math.max(base.y, 0) + (2 + force * 0.24) * massK;
    const side = (Math.random() - 0.5) * force * 0.35 * massK;
    base.x += side;
    const spin = new Vector3((Math.random() * 0.5 + 0.6) * force * 0.45, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * force * 0.5);
    const rd = new Ragdoll(this.ctx.scene, z.body, def.mass, base, spin);
    this.ragdolls.push(rd);

    z.body.meshes[PART_INDEX.chest].computeWorldMatrix(true);
    const pos = z.body.meshes[PART_INDEX.chest].getAbsolutePosition().clone();
    this.ctx.events.emit("zombieHit", { position: pos, force, killed: true, type: z.type });

    // Severing: brutal hits tear limbs off.
    if (force > def.health * 2.2 + 6 || explosive) {
      const count = explosive ? 2 + Math.floor(Math.random() * 2) : Math.random() < 0.6 ? 1 : 2;
      for (let k = 0; k < count; k++) {
        const id = SEVERABLE[Math.floor(Math.random() * SEVERABLE.length)];
        const at = rd.sever(id);
        if (at) {
          const dir = rd.bodies[PART_INDEX[id]]?.getLinearVelocity().normalize() ?? Vector3.Up();
          this.ctx.events.emit("limbSevered", { position: at, direction: dir });
        }
      }
    }

    if (def.explodes) {
      this.pendingExplosions.push({ pos: pos.clone(), radius: 6.5, power: 1 });
      this.ctx.events.emit("slowmo", { scale: 0.3, duration: 0.45 });
    }

    // Juice for big moments.
    const now = Time.realNow;
    this.recentKills.push(now);
    while (this.recentKills.length && now - this.recentKills[0] > 0.45) this.recentKills.shift();
    if (z.type === "brute" && force > 18) {
      this.ctx.events.emit("shake", { intensity: 0.5 });
      this.ctx.events.emit("slowmo", { scale: 0.35, duration: 0.4 });
    } else if (this.recentKills.length === 4) {
      this.ctx.events.emit("slowmo", { scale: 0.45, duration: 0.3 });
      this.ctx.events.emit("shake", { intensity: 0.3 });
    } else {
      this.ctx.events.emit("shake", { intensity: Math.min(0.25, force * 0.008 * (def.mass / 70)) });
    }
    void v;
    this.enforceRagdollCap();
  }

  ignite(z: Zombie): void {
    z.state = "burning";
    z.stateTime = 0;
    z.burn = 0;
  }

  // ───────────────────────────── climbers ─────────────────────────────

  private startCling(z: Zombie): void {
    const v = this.vehicle;
    z.state = "cling";
    z.stateTime = 0;
    z.shakeOff = 0;
    const sz = v.def.size;
    z.clingLocal.set((Math.random() - 0.5) * sz.width * 0.5, sz.height / 2 - 0.05, sz.length * (0.15 + Math.random() * 0.2));
    z.body.root.parent = null;
    v.attach(z.body.root);
    z.body.root.rotationQuaternion = null;
    z.body.root.position.copyFrom(z.clingLocal);
    z.body.root.rotation.set(0, Math.PI, 0);
    z.body.root.scaling.setAll(1);
  }

  private updateCling(z: Zombie, dt: number, yawRate: number, speed: number): void {
    const v = this.vehicle;
    const b = z.body;
    const j = b.joints;
    // Lying on the hood, clawing at the windshield.
    const t = z.phase += dt * 8;
    j[PART_INDEX.pelvis].position.y = 0.12 * b.scale;
    j[PART_INDEX.pelvis].rotation.set(-1.2, 0, 0);
    j[PART_INDEX.chest].rotation.set(-0.1, Math.sin(t) * 0.2, 0);
    j[PART_INDEX.head].rotation.set(-0.6, Math.sin(t * 1.3) * 0.3, 0);
    j[PART_INDEX.upperArmL].rotation.set(-2.6 + Math.sin(t) * 0.4, 0, 0.3);
    j[PART_INDEX.upperArmR].rotation.set(-2.6 - Math.sin(t) * 0.4, 0, -0.3);
    j[PART_INDEX.thighL].rotation.set(0.2 + Math.sin(t * 0.7) * 0.4, 0, 0);
    j[PART_INDEX.thighR].rotation.set(0.2 - Math.sin(t * 0.7) * 0.4, 0, 0);
    // Damage over time.
    v.damage(2.5 * dt);
    // Shake-off: hard steering, flips, airborne bumps, boosting at speed.
    if (yawRate > 0.9) z.shakeOff += (yawRate - 0.9) * dt * 1.6;
    if (v.up.y < 0.5) z.shakeOff += dt * 3;
    if (v.boosting && speed > 20) z.shakeOff += dt * 0.5;
    if (v.airborne) z.shakeOff += dt * 0.4;
    b.root.getAbsolutePosition();
    z.position.copyFrom(b.root.getAbsolutePosition());
    if (z.shakeOff > 1 || z.stateTime > 14) {
      const fling = v.velocity.clone();
      fling.addInPlace(this.right.scale((Math.random() < 0.5 ? -1 : 1) * 6));
      fling.y += 3;
      this.kill(z, fling, Math.max(8, speed * 0.6), false);
    }
  }

  // ───────────────────────────── explosions ─────────────────────────────

  explode(center: Vector3, radius: number, power: number): void {
    // Live zombies in range die.
    for (const z of [...this.zombies]) {
      const d = Vector3.Distance(z.position, center);
      if (d > radius) continue;
      const dir = z.position.subtract(center);
      dir.y = 0;
      dir.normalize();
      const k = (1 - d / radius) * power;
      dir.scaleInPlace(8 + 14 * k);
      dir.y = 6 + 10 * k;
      this.kill(z, dir, 10 + 20 * k, k > 0.3);
    }
    // Existing ragdolls get blasted.
    for (const rd of this.ragdolls) {
      if (rd.frozen) continue;
      const d = Vector3.Distance(rd.pelvis, center);
      if (d > radius * 1.4) continue;
      const k = (1 - d / (radius * 1.4)) * power;
      const dir = rd.pelvis.subtract(center).normalize();
      dir.y += 0.8;
      rd.push(dir.scale(900 * k), rd.pelvis);
    }
    // The car gets kicked too.
    const v = this.vehicle;
    const d = Vector3.Distance(v.position, center);
    if (d < radius) {
      const k = (1 - d / radius) * power;
      const dir = v.position.subtract(center).normalize();
      dir.y = Math.max(dir.y, 0.4) + 0.5;
      v.applyImpulse(dir.scale(v.def.mass * 7 * k), center.add(v.position).scale(0.5));
      v.damage(22 * k);
    }
    this.ctx.events.emit("shake", { intensity: Math.min(0.9, 0.9 * power * Math.max(0.2, 1 - d / (radius * 4))) });
  }

  // ───────────────────────────── ragdoll lifecycle ─────────────────────────────

  private enforceRagdollCap(): void {
    let active = 0;
    for (let i = this.ragdolls.length - 1; i >= 0; i--) {
      const r = this.ragdolls[i];
      if (r.frozen) continue;
      active++;
      if (active > this.caps.ragdolls) r.freeze();
    }
  }

  private updateRagdolls(dt: number): void {
    const carZ = this.vehicle.position.z;
    for (let i = this.ragdolls.length - 1; i >= 0; i--) {
      const r = this.ragdolls[i];
      r.age += dt;
      if (!r.frozen && r.age > 9) r.freeze();
      if (r.frozen) {
        r.sinking += dt;
        if (r.sinking > 2) for (const n of r.nodes) n.position.y -= dt * 0.35;
      }
      if (r.sinking > 6 || r.pelvis.z < carZ - 70 || r.pelvis.y < -40) {
        r.dispose();
        this.ragdolls.splice(i, 1);
      }
    }
  }

  private remove(i: number): void {
    const z = this.zombies[i];
    z.alive = false;
    for (const m of z.body.meshes) m.dispose();
    z.body.root.dispose();
    this.zombies.splice(i, 1);
  }

  // ───────────────────────────── IZombies ─────────────────────────────

  targetsNear(from: Vector3, range: number): ITarget[] {
    const out: { z: Zombie; d: number }[] = [];
    const r2 = range * range;
    for (const z of this.zombies) {
      if (!z.alive || z.state === "cling") continue;
      z.center.copyFrom(z.position);
      z.center.y += z.def.height * 0.6;
      const d = Vector3.DistanceSquared(z.center, from);
      if (d < r2) out.push({ z, d });
    }
    out.sort((a, b) => a.d - b.d);
    return out.map((o) => o.z);
  }

  dispose(): void {
    for (const u of this.unsubs) u();
    for (const r of this.ragdolls) r.dispose();
    for (let i = this.zombies.length - 1; i >= 0; i--) this.remove(i);
    this.ragdolls = [];
    this.factory.dispose();
  }
}

