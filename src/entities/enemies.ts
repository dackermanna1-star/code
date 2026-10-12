// EnemySystem + EnemyAI. Enemies share physics, damage, statuses and the projectile runtime with the player.
import * as THREE from 'three';
import { GRAVITY } from '../config';
import { Rng } from '../core/rng';
import { Creature, DamageType } from './creature';
import { moveBody, depenetrate } from './physics';
import { ENEMIES, ENEMY_PROJECTILES, EnemyDef } from './enemyDefs';
import { registerProjectiles } from './projectiles';
import { buildEnemyModel, EnemyModel, disposeEnemyModel } from '../render/enemyModels';
import { defaultShotState } from '../magic/shotState';
import type { Shot } from '../magic/types';
import { matId, AIR, FIRE, KIND, Kind, FLAMMABILITY } from '../world/materials';
import { RAY_SOLID } from '../world/world';
import type { Run } from '../game/run';
import type { DamageEvent } from './damage';
import type { SoundName } from '../audio/audio';

registerProjectiles(ENEMY_PROJECTILES);

type AIState = 'idle' | 'wander' | 'alert' | 'chase' | 'windup' | 'attack' | 'flee' | 'dead';

export class Enemy extends Creature {
  readonly isPlayer = false;
  def: EnemyDef;
  model: EnemyModel;
  state: AIState = 'idle';
  stateT = 0;
  target: Creature | null = null;
  lastSeen = new THREE.Vector3();
  seeT = 0; // time with target in sight
  lostT = 0;
  attackCd = 0;
  burstLeft = 0;
  burstT = 0;
  wanderTarget = new THREE.Vector3();
  walkPhase = 0;
  sideStep = 0;
  sideStepT = 0;
  losT = 0;
  hasLos = false;
  active = true;
  aggroUntil = 0;
  rng: Rng;
  hoverOffset: number;
  sleeping = false;
  laser: THREE.Line | null = null;
  trick = false;
  /** progress tracking for getting unstuck while chasing */
  progT = 0;
  progX = 0;
  progZ = 0;
  detour = new THREE.Vector3();
  detourT = 0;
  /** When polymorphed into a sheep: what to turn back into, and when. */
  morphFrom: { type: string; hpFrac: number; until: number } | null = null;

  constructor(def: EnemyDef, x: number, y: number, z: number, hpMult: number, rng: Rng) {
    super(x, y, z, def.hw, def.h, def.hp * hpMult, def.faction, def.stepUp ?? 0);
    this.def = def;
    this.rng = rng;
    this.mult = { ...(def.mult ?? {}) };
    this.bloodMat = def.blood;
    this.model = buildEnemyModel(def.model, def.tint);
    this.yaw = rng.range(0, Math.PI * 2);
    this.hoverOffset = rng.range(4, 9);
    this.attackCd = rng.range(0.5, 2);
  }
}

export class EnemySystem {
  readonly list: Enemy[] = [];
  readonly group = new THREE.Group();
  private tickN = 0;
  private laserMat = new THREE.LineBasicMaterial({ color: 0xff3030, transparent: true, opacity: 0.7 });

  constructor(private run: Run) {}

  spawn(type: string, x: number, y: number, z: number, depth: number, rng: Rng): Enemy | null {
    const def = ENEMIES[type];
    if (!def) return null;
    // deeper = tougher (Noita doubles most HP in the Jungle and the Vault)
    const hpMult = depth >= 4 ? 2 : depth >= 2 ? 1.4 : 1;
    const e = new Enemy(def, x, y, z, def.behaviour === 'prop' ? 1 : hpMult, rng);
    this.list.push(e);
    this.group.add(e.model.root);
    this.run.damage.creatures.push(e);
    depenetrate(this.run.game.world, e.body);
    return e;
  }

  /** Replace a creature with another type in place (polymorph). */
  private morph(e: Enemy, type: string, from: Enemy['morphFrom'], hpFrac = 1): void {
    const g = this.run.game;
    for (let i = 0; i < 24; i++) g.particles.spawn(e.cx, e.cy, e.cz, (Math.random() - 0.5) * 10, Math.random() * 8, (Math.random() - 0.5) * 10, [0.85, 0.5, 1], 0.6, 0.45, 0.2, true, 2);
    e.alive = false;
    this.group.remove(e.model.root);
    disposeEnemyModel(e.model);
    const n = this.spawn(type, e.body.x, e.body.y, e.body.z, 0, e.rng);
    if (!n) return;
    n.morphFrom = from;
    n.hp = Math.max(1, n.maxHp * hpFrac);
    n.yaw = e.yaw;
    this.sound('teleport', n, 0.5);
  }

  private sound(name: string, e: Creature, v = 0.7): void {
    this.run.sound(name as SoundName, e, v);
  }

  /** Fixed-step AI + physics. */
  tick(dt: number): void {
    const run = this.run;
    const g = run.game;
    const player = g.player;
    this.tickN++;
    for (const e of this.list) {
      if (!e.alive) continue;
      const b = e.body;
      // freeze enemies in unloaded / far regions
      const dP = Math.hypot(b.x - player.body.x, b.y - player.body.y, b.z - player.body.z);
      const loaded = g.world.chunkAt(Math.floor(b.x), Math.floor(b.y), Math.floor(b.z)) !== null && g.world.chunkAt(Math.floor(b.x), Math.floor(b.y - 2), Math.floor(b.z)) !== null;
      e.sleeping = !loaded || dP > 150;
      if (e.sleeping) continue;
      run.damage.updateCreature(e, dt);
      if (!e.alive) continue;
      // polymorphine: creatures become sheep for a while (Noita's Polymorph)
      if (e.status.polymorph > 0 && !e.morphFrom && e.def.behaviour !== 'prop' && e.def.id !== 'stevari') {
        this.morph(e, 'sheep', { type: e.def.id, hpFrac: e.hp / e.maxHp, until: g.time + 15 });
        continue;
      }
      if (e.morphFrom && g.time > e.morphFrom.until) {
        const f = e.morphFrom;
        this.morph(e, f.type, null, f.hpFrac);
        continue;
      }
      this.think(e, dt, dP);
      // physics
      const def = e.def;
      if (def.behaviour === 'turret') {
        b.vx = b.vz = 0;
      }
      const stuck = e.status.frozen > 0 || e.status.stunned > 0;
      if (stuck) {
        b.vx *= 0.8;
        b.vz *= 0.8;
      }
      if (!def.flying || stuck) {
        b.vy -= GRAVITY * dt;
        if (b.liquid > 0.4) {
          b.vy += GRAVITY * 0.7 * dt;
          b.vy *= Math.exp(-2 * dt);
        }
      } else {
        b.vy *= Math.exp(-3 * dt);
      }
      if (b.vy < -75) b.vy = -75;
      moveBody(g.world, b, dt);
      if (b.onGround && def.behaviour !== 'prop') {
        b.vx *= Math.exp(-6 * dt);
        b.vz *= Math.exp(-6 * dt);
      } else if (def.behaviour === 'prop' && b.onGround) {
        b.vx *= Math.exp(-4 * dt);
        b.vz *= Math.exp(-4 * dt);
      }
      // auras: fire mages ignite surroundings, ice spirits chill, slimes leave trails
      if (def.aura === 'fire' && e.rng.chance(dt * 3)) {
        const fx = Math.floor(b.x + e.rng.range(-2, 2)), fy = Math.floor(b.y + e.rng.range(0, b.h)), fz = Math.floor(b.z + e.rng.range(-2, 2));
        const m = g.world.get(fx, fy, fz);
        if (FLAMMABILITY[m] > 0) g.sim.ignite(fx, fy, fz);
      }
      if (def.aura === 'cold' && e.rng.chance(dt * 6)) {
        const fx = Math.floor(b.x + e.rng.range(-3, 3)), fy = Math.floor(b.y + e.rng.range(-2, b.h)), fz = Math.floor(b.z + e.rng.range(-3, 3));
        if (KIND[g.world.get(fx, fy, fz)] === Kind.LIQUID) g.sim.heat(fx, fy, fz, -200);
      }
      if (def.trail && e.rng.chance(dt * 2)) {
        const tx = Math.floor(b.x), ty = Math.floor(b.y - 0.5), tz = Math.floor(b.z);
        if (g.world.get(tx, ty, tz) === AIR) g.world.set(tx, ty, tz, matId(def.trail));
      }
      if (e.def.id === 'liekkio' && e.hurtFlash > 0.9 && e.rng.chance(0.5)) {
        // Liekkiö scatters gunpowder when hurt (it then ignites into many small blasts)
        for (let i = 0; i < 6; i++) g.particles.launch(matId('gunpowder'), 0, e.cx, e.cy, e.cz, e.rng.range(-10, 10), e.rng.range(2, 10), e.rng.range(-10, 10));
      }
    }
    // cleanup dead
    let w = 0;
    for (const e of this.list) if (e.alive) this.list[w++] = e;
    this.list.length = w;
    const cr = run.damage.creatures;
    let k = 0;
    for (const c of cr) if (c.alive) cr[k++] = c;
    cr.length = k;
  }

  private canSee(e: Enemy, t: Creature): boolean {
    const g = this.run.game;
    return g.world.lineOfSight(e.cx, e.headY(), e.cz, t.cx, t.headY(), t.cz) || g.world.lineOfSight(e.cx, e.headY(), e.cz, t.cx, t.cy, t.cz);
  }

  private think(e: Enemy, dt: number, distPlayer: number): void {
    const run = this.run;
    const g = run.game;
    const def = e.def;
    const b = e.body;
    e.stateT += dt;
    e.attackCd -= dt;
    if (def.behaviour === 'prop') return;
    if (e.status.frozen > 0 || e.status.stunned > 0) return;
    const player = g.player;
    // ---- acquire target
    if (!e.target || !e.target.alive) e.target = player.alive ? player : null;
    if (e.lastHitBy && e.lastHitBy.alive && e.lastHitBy !== e && e.aggroUntil < g.time) {
      e.target = e.lastHitBy;
      e.aggroUntil = g.time + 8;
      e.lastHitBy = null;
      if (e.state === 'idle' || e.state === 'wander') e.state = 'alert';
    }
    const t = e.target;
    if (def.behaviour === 'passive' || !t) {
      this.wander(e, dt);
      return;
    }
    // line of sight checks are staggered
    e.losT -= dt;
    const dist = Math.hypot(t.cx - e.cx, t.cy - e.cy, t.cz - e.cz);
    if (e.losT <= 0) {
      e.losT = 0.18 + e.rng.next() * 0.1;
      e.hasLos = dist < def.sight && this.canSee(e, t);
    }
    if (e.hasLos) {
      e.lastSeen.set(t.cx, t.cy, t.cz);
      e.seeT += dt;
      e.lostT = 0;
    } else {
      e.seeT = Math.max(0, e.seeT - dt);
      e.lostT += dt;
    }
    // burning creatures panic and do not attack (Noita), unless immune to fire
    if (e.status.onFire > 0 && (e.mult.fire ?? 1) > 0) {
      this.panic(e, dt);
      return;
    }
    switch (e.state) {
      case 'idle':
      case 'wander':
        this.wander(e, dt);
        if (e.hasLos && e.seeT > (def.reaction ?? 0.5)) {
          e.state = 'alert';
          e.stateT = 0;
          this.sound('enemy_alert', e, 0.5);
        }
        break;
      case 'alert':
        this.face(e, t.cx, t.cz, dt * 8);
        if (e.stateT > 0.25) {
          e.state = 'chase';
          e.stateT = 0;
        }
        break;
      case 'chase': {
        if (e.lostT > 6) {
          e.state = 'wander';
          e.target = null;
          break;
        }
        const goal = e.hasLos ? new THREE.Vector3(t.cx, t.cy, t.cz) : e.lastSeen;
        const melee = def.melee;
        const ranged = def.ranged;
        if (ranged && e.hasLos && dist < ranged.range && e.attackCd <= 0 && (!melee || dist > melee.range + 1)) {
          if (!ranged.horizontalOnly || Math.abs(t.cy - e.cy) < 6) {
            e.state = 'windup';
            e.stateT = 0;
            this.sound(def.id === 'ukko' ? 'cast_electric' : 'enemy_alert', e, 0.35);
            break;
          }
        }
        if (melee && dist < melee.range + (melee.lunge ? 6 : 0) && e.attackCd <= 0 && e.hasLos) {
          e.state = 'windup';
          e.stateT = 0;
          break;
        }
        // movement
        let want = 0; // +1 approach, -1 retreat, 0 hold
        const pref = def.preferredRange ?? 0;
        if (melee && !ranged) want = 1;
        else if (pref) want = dist > pref + 6 ? 1 : dist < pref - 8 ? -1 : 0;
        if (!e.hasLos) want = 1;
        // stuck detection: no progress for a while -> take a detour around the obstacle
        e.progT += dt;
        if (e.progT > 2.5) {
          const moved = Math.hypot(b.x - e.progX, b.z - e.progZ);
          if (moved < 2 && want !== 0 && !def.flying) {
            const a = e.rng.range(0, Math.PI * 2);
            e.detour.set(b.x + Math.cos(a) * 14, b.y, b.z + Math.sin(a) * 14);
            e.detourT = 2;
          }
          e.progT = 0;
          e.progX = b.x;
          e.progZ = b.z;
        }
        if (e.detourT > 0) {
          e.detourT -= dt;
          this.moveToward(e, e.detour, 1, dt);
        } else this.moveToward(e, goal, want, dt);
        break;
      }
      case 'windup': {
        this.face(e, t.cx, t.cz, dt * 10);
        b.vx *= 0.85;
        b.vz *= 0.85;
        const ranged = def.ranged;
        const melee = def.melee;
        const isRanged = ranged && (!melee || dist > melee.range + 1);
        const wind = isRanged ? ranged!.windup : 0.3;
        // telegraph: sniper laser sight, glowing staff
        if (isRanged && def.id === 'sniper') this.showLaser(e, t);
        if (e.stateT >= wind) {
          this.hideLaser(e);
          if (isRanged) {
            e.burstLeft = ranged!.burst ?? 1;
            e.burstT = 0;
            e.state = 'attack';
          } else if (melee) {
            this.meleeAttack(e, t);
            e.attackCd = melee.cooldown;
            e.state = 'chase';
          }
          e.stateT = 0;
        }
        break;
      }
      case 'attack': {
        const ranged = def.ranged!;
        this.face(e, t.cx, t.cz, dt * 10);
        e.burstT -= dt;
        if (e.burstLeft > 0 && e.burstT <= 0) {
          this.fire(e, t);
          e.burstLeft--;
          e.burstT = ranged.burstGap ?? 0;
        }
        if (e.burstLeft <= 0) {
          e.attackCd = ranged.cooldown * (0.8 + e.rng.next() * 0.4);
          e.state = 'chase';
          e.stateT = 0;
        }
        break;
      }
      default:
        e.state = 'wander';
    }
    void distPlayer;
  }

  private panic(e: Enemy, dt: number): void {
    if (e.stateT > 0.6 || e.wanderTarget.lengthSq() === 0) {
      e.stateT = 0;
      e.wanderTarget.set(e.body.x + e.rng.range(-20, 20), e.body.y, e.body.z + e.rng.range(-20, 20));
    }
    this.moveToward(e, e.wanderTarget, 1, dt, 1.3);
  }

  private wander(e: Enemy, dt: number): void {
    if (e.def.behaviour === 'turret') return;
    if (e.stateT > 3 + e.rng.next() * 3 || e.wanderTarget.lengthSq() === 0) {
      e.stateT = 0;
      e.state = 'wander';
      if (e.rng.chance(0.4)) e.wanderTarget.set(e.body.x, e.body.y, e.body.z);
      else e.wanderTarget.set(e.body.x + e.rng.range(-16, 16), e.body.y + (e.def.flying ? e.rng.range(-4, 6) : 0), e.body.z + e.rng.range(-16, 16));
    }
    this.moveToward(e, e.wanderTarget, 1, dt, 0.45);
  }

  private face(e: Enemy, x: number, z: number, rate: number): void {
    const want = Math.atan2(-(x - e.body.x), -(z - e.body.z));
    let d = want - e.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    e.yaw += d * Math.min(1, rate);
  }

  private moveToward(e: Enemy, goal: THREE.Vector3, want: number, dt: number, speedMul = 1): void {
    const def = e.def;
    const b = e.body;
    if (def.speed <= 0) return;
    let dx = goal.x - b.x, dz = goal.z - b.z;
    let dy = 0;
    if (def.flying) dy = goal.y + (want >= 0 ? e.hoverOffset * 0.5 : e.hoverOffset) - (b.y + b.h * 0.5);
    const hd = Math.hypot(dx, dz);
    if (hd < 1.5 && Math.abs(dy) < 2 && want >= 0) return;
    dx /= hd || 1;
    dz /= hd || 1;
    if (want < 0) {
      dx = -dx;
      dz = -dz;
    } else if (want === 0) {
      // strafe while holding range
      const s = Math.sin(e.stateT * 0.9 + e.id) > 0 ? 1 : -1;
      const tx = -dz * s, tz = dx * s;
      dx = tx * 0.6;
      dz = tz * 0.6;
    }
    // side-step around obstacles
    if (e.sideStepT > 0) {
      e.sideStepT -= dt;
      const c = Math.cos(e.sideStep), s = Math.sin(e.sideStep);
      const rx = dx * c - dz * s, rz = dx * s + dz * c;
      dx = rx;
      dz = rz;
    }
    const sp = def.speed * speedMul * (e.status.onFire > 0 ? 1.15 : 1) * (1 - Math.min(0.4, e.status.slimy * 0.4));
    const accel = def.flying ? 30 : b.onGround ? 60 : 18;
    b.vx += (dx * sp - b.vx) * Math.min(1, accel * dt / sp);
    b.vz += (dz * sp - b.vz) * Math.min(1, accel * dt / sp);
    if (def.flying) {
      const vy = Math.max(-sp, Math.min(sp, dy * 2));
      b.vy += (vy - b.vy) * Math.min(1, 4 * dt);
      if (b.hitWallX || b.hitWallZ) b.vy += 20 * dt * 10;
    } else if ((b.hitWallX || b.hitWallZ) && b.onGround) {
      if (def.jump > 0 && e.rng.chance(0.7)) b.vy = def.jump;
      else {
        e.sideStep = e.rng.chance(0.5) ? 1.2 : -1.2;
        e.sideStepT = 0.8;
      }
    }
    if (hd > 0.5) this.face(e, b.x + dx, b.z + dz, dt * 6);
    e.walkPhase += Math.hypot(b.vx, b.vz) * dt * 0.6;
  }

  private meleeAttack(e: Enemy, t: Creature): void {
    const m = e.def.melee!;
    const b = e.body;
    const dx = t.cx - e.cx, dy = t.cy - e.cy, dz = t.cz - e.cz;
    const d = Math.hypot(dx, dy, dz) || 1;
    if (m.lunge) {
      b.vx = (dx / d) * m.lunge;
      b.vz = (dz / d) * m.lunge;
      b.vy = e.def.flying ? (dy / d) * m.lunge : 12;
      // damage on contact during the lunge is resolved in frame() via proximity
      (e as Enemy & { lungeT?: number }).lungeT = 0.45;
    } else if (d < m.range + t.body.hw + e.body.hw) {
      this.hit(e, t);
    }
    this.sound('enemy_melee', e, 0.6);
  }

  private hit(e: Enemy, t: Creature): void {
    const m = e.def.melee!;
    const dmg = m.damage[0] + (m.damage[1] - m.damage[0]) * e.rng.next();
    const dx = t.cx - e.cx, dz = t.cz - e.cz;
    const d = Math.hypot(dx, dz) || 1;
    this.run.damage.apply({ target: t, amount: dmg, type: 'melee', source: e, x: t.cx, y: t.cy, z: t.cz, kx: (dx / d) * 14, ky: 8, kz: (dz / d) * 14 });
  }

  private fire(e: Enemy, t: Creature): void {
    const r = e.def.ranged!;
    const g = this.run.game;
    const ox = e.cx, oy = e.body.y + e.body.h * 0.7, oz = e.cz;
    let tx = t.cx, ty = t.cy, tz = t.cz;
    if (r.horizontalOnly) ty = oy;
    const dir = new THREE.Vector3(tx - ox, ty - oy, tz - oz);
    const dist = dir.length();
    if (r.lob) dir.y += dist * 0.35;
    // aim error
    dir.normalize();
    dir.x += (e.rng.next() - 0.5) * 0.06;
    dir.y += (e.rng.next() - 0.5) * 0.06;
    dir.z += (e.rng.next() - 0.5) * 0.06;
    dir.normalize();
    const shot: Shot = { state: defaultShotState(), projectiles: [] };
    for (let i = 0; i < r.count; i++) shot.projectiles.push({ projectile: r.projectile });
    const sx = ox + dir.x * (e.body.hw + 1), sy = oy + dir.y * (e.body.hw + 1), sz = oz + dir.z * (e.body.hw + 1);
    this.run.projectiles.fireShot(shot, sx, sy, sz, dir, e, r.spread, 1, (c) => c !== e);
    this.sound(r.sound, e, 0.55);
    this.run.addTimedLight(sx, sy, sz, [1, 0.8, 0.5], 10, 0.6, 0.08);
    if (r.projectile === 'enemy_rifle' && t === g.player) g.player.status.levitationDisabled = Math.max(g.player.status.levitationDisabled, 0.3);
  }

  private showLaser(e: Enemy, t: Creature): void {
    const pts = [new THREE.Vector3(e.cx, e.body.y + e.body.h * 0.7, e.cz), new THREE.Vector3(t.cx, t.cy, t.cz)];
    if (!e.laser) {
      e.laser = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), this.laserMat);
      this.group.add(e.laser);
    } else e.laser.geometry.setFromPoints(pts);
  }

  private hideLaser(e: Enemy): void {
    if (e.laser) {
      this.group.remove(e.laser);
      e.laser.geometry.dispose();
      e.laser = null;
    }
  }

  /** Death: gold (double for trick kills), corpse materials, death explosions. */
  onDeath(c: Creature, ev: DamageEvent): void {
    const e = c as Enemy;
    const run = this.run;
    const g = run.game;
    this.hideLaser(e);
    this.group.remove(e.model.root);
    disposeEnemyModel(e.model);
    const def = e.def;
    if (def.explodeOnDeath) {
      const x = def.explodeOnDeath;
      if (x.spill) for (let i = 0; i < x.spill.amount; i++) g.particles.launch(matId(x.spill.mat), 0, e.cx, e.cy, e.cz, e.rng.range(-14, 14), e.rng.range(2, 16), e.rng.range(-14, 14));
      g.destruction.explode(e.cx, e.cy, e.cz, { radius: x.radius, durability: 10, rayEnergy: x.radius * 160, fire: x.fire });
      run.damage.explosion(e.cx, e.cy, e.cz, x.radius, x.damage, e, { fire: x.fire, trick: true });
      run.explosionFx(e.cx, e.cy, e.cz, x.radius, !!x.fire);
      this.sound(x.radius > 9 ? 'explosion_big' : 'explosion_small', e, 1);
    }
    if (def.behaviour === 'prop') return;
    if (run.progression.hasPerk('EXPLODING_CORPSES')) {
      g.destruction.explode(e.cx, e.cy, e.cz, { radius: 6, durability: 10, rayEnergy: 900, fire: true });
      run.damage.explosion(e.cx, e.cy, e.cz, 6, 35, g.player, { fire: true });
      run.explosionFx(e.cx, e.cy, e.cz, 6, true);
    }
    run.kills++;
    const layer = Math.floor((1920 - e.body.y) / 320);
    run.progression.killsInLayer.set(layer, (run.progression.killsInLayer.get(layer) ?? 0) + 1);
    this.sound('enemy_death', e, 0.7);
    // corpse: a little pile of the creature's material
    if (def.blood === 'blood') {
      for (let i = 0; i < 6; i++) g.particles.launch(matId('meat'), 0, e.cx, e.cy, e.cz, e.rng.range(-5, 5), e.rng.range(2, 8), e.rng.range(-5, 5));
    }
    for (let i = 0; i < 18; i++) g.particles.launch(matId(def.blood), 0, e.cx, e.cy, e.cz, e.rng.range(-9, 9), e.rng.range(2, 12), e.rng.range(-9, 9));
    // gold: max HP / 2.5, doubled for trick kills (not killed directly by the player)
    const trick = ev.source !== g.player || ev.trick;
    let gold = Math.max(10, Math.round(e.maxHp / 2.5 / 10) * 10);
    if (trick) gold *= 2;
    if (def.goldOverride !== undefined) gold = def.goldOverride;
    let n = 0;
    while (gold > 0 && n < 12) {
      const v = gold >= 100 && n >= 5 ? 50 : 10;
      run.pickups.add('gold', e.cx + e.rng.range(-1, 1), e.cy, e.cz + e.rng.range(-1, 1), { gold: v });
      const pk = run.pickups.list[run.pickups.list.length - 1];
      pk.body.vx = e.rng.range(-8, 8);
      pk.body.vy = e.rng.range(6, 14);
      pk.body.vz = e.rng.range(-8, 8);
      gold -= v;
      n++;
    }
    if (trick) run.hud.floatText(e.cx, e.headY() + 1.5, e.cz, 'Trick kill! x2 gold', '#e8c050');
  }

  /** Per-frame: sync models and animate. */
  frame(dt: number): void {
    const run = this.run;
    const t = run.game.time;
    for (const e of this.list) {
      const m = e.model;
      m.root.visible = !e.sleeping || e.def.behaviour === 'prop';
      if (!e.alive) continue;
      const b = e.body;
      m.root.position.set(b.x, b.y, b.z);
      m.root.rotation.y = e.yaw;
      // lunge contact damage
      const le = e as Enemy & { lungeT?: number };
      if (le.lungeT && le.lungeT > 0) {
        le.lungeT -= dt;
        const tg = e.target;
        if (tg && tg.alive && Math.hypot(tg.cx - e.cx, tg.cy - e.cy, tg.cz - e.cz) < e.def.melee!.range + tg.body.hw) {
          this.hit(e, tg);
          le.lungeT = 0;
        }
      }
      const P = m.parts;
      const sw = Math.sin(e.walkPhase * 3) * 0.6;
      if (P.legL) P.legL.rotation.x = sw;
      if (P.legR) P.legR.rotation.x = -sw;
      if (P.legL2) P.legL2.rotation.x = -sw;
      if (P.legR2) P.legR2.rotation.x = sw;
      for (let i = 0; i < 6; i++) if (P[`leg${i}`]) P[`leg${i}`].rotation.x = Math.sin(e.walkPhase * 4 + i * 1.7) * 0.5;
      const aiming = e.state === 'windup' || e.state === 'attack';
      if (P.armR) P.armR.rotation.x = aiming ? -1.4 : -sw * 0.6;
      if (P.armL) P.armL.rotation.x = aiming && e.def.model === 'mage' ? -1.2 : sw * 0.6;
      if (P.wingL) P.wingL.rotation.z = Math.sin(t * 22 + e.id) * 0.8;
      if (P.wingR) P.wingR.rotation.z = -Math.sin(t * 22 + e.id) * 0.8;
      if (e.def.model === 'slime' || e.def.model === 'skull') P.body.position.y = Math.sin(t * 3 + e.id) * 0.3;
      if (P.flameL) P.flameL.visible = P.flameR.visible = Math.sin(t * 40 + e.id) > -0.5;
      // hurt flash / windup glow / frozen tint
      const em = m.material.emissive;
      if (e.hurtFlash > 0) em.setRGB(e.hurtFlash * 0.9, e.hurtFlash * 0.9, e.hurtFlash * 0.9);
      else if (e.status.frozen > 0) em.setRGB(0.2, 0.35, 0.5);
      else if (e.state === 'windup') em.setRGB(0.08 + 0.06 * Math.sin(t * 30), 0.04, 0.01);
      else if (e.status.onFire > 0) em.setRGB(0.4, 0.15, 0.0);
      else em.setRGB(0, 0, 0);
      // lights for glowing creatures
      if (e.def.aura === 'fire') run.game.lights.add(e.cx, e.cy, e.cz, [1, 0.55, 0.2], 18, 0.8);
      else if (e.def.aura === 'cold') run.game.lights.add(e.cx, e.cy, e.cz, [0.5, 0.75, 1], 14, 0.5);
      else if (e.def.aura === 'spark') run.game.lights.add(e.cx, e.cy, e.cz, [0.6, 0.65, 1], 14, 0.5 + (e.state === 'windup' ? 0.8 : 0));
      if (e.status.onFire > 0 && Math.random() < 0.5) run.game.particles.spawn(e.cx + (Math.random() - 0.5) * 2, e.body.y + Math.random() * e.body.h, e.cz + (Math.random() - 0.5) * 2, 0, 6, 0, [1, 0.6, 0.2], 0.35, 0.5, -0.2, true, 1);
    }
  }

  clear(): void {
    for (const e of this.list) {
      this.group.remove(e.model.root);
      disposeEnemyModel(e.model);
      this.hideLaser(e);
    }
    this.list.length = 0;
  }
}

export type { DamageType };
void FIRE;
void RAY_SOLID;
