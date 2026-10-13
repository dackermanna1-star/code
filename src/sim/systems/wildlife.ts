import { CHUNK_SIZE, SEA_LEVEL } from '../../shared/constants';
import { mulberry32 } from '../../shared/math';
import type { EntSnap } from '../../shared/net/protocol';
import { LIQUID, SOLID } from '../../shared/world/blocks';
import { Biome } from '../../shared/world/biomes';
import type { Game } from '../game';
import type { HistSample, Player } from '../player';
import { r2 } from '../player';
import { Corpse, type WorldEntity } from './entities';
import { rollLoot } from '../../shared/data/loot';
import { makeStack, addStack } from '../../shared/sim/inventory';
import { raycastVoxels, solidFilter } from '../../shared/world/raycast';
import { POI_DEFS } from '../../shared/world/poi';

export interface Species {
  key: string;
  name: string;
  hp: number;
  speed: number;
  walk: number;
  halfWidth: number;
  height: number;
  /** 'passive' flees, 'defensive' fights back / when close, 'hunter' seeks players. */
  temper: 'passive' | 'defensive' | 'hunter';
  sight: number;
  damage: number;
  attackInterval: number;
  harvest: Array<[string, number]>;
  biomes: Biome[];
  weight: number;
  /** Humanoid NPC with a firearm (scavengers). */
  ranged?: boolean;
}

export const SPECIES: Record<string, Species> = {
  stag: { key: 'stag', name: 'Stag', hp: 60, speed: 7.5, walk: 2, halfWidth: 0.45, height: 1.5, temper: 'passive', sight: 22, damage: 0, attackInterval: 1,
    harvest: [['raw_meat', 6], ['leather', 10], ['bone', 6], ['animal_fat', 3]], biomes: [Biome.Plains, Biome.Forest, Biome.BirchForest, Biome.Taiga, Biome.Savanna], weight: 5 },
  boar: { key: 'boar', name: 'Boar', hp: 120, speed: 5.5, walk: 1.6, halfWidth: 0.45, height: 0.95, temper: 'defensive', sight: 10, damage: 12, attackInterval: 1.2,
    harvest: [['raw_meat', 8], ['leather', 6], ['bone', 8], ['animal_fat', 6]], biomes: [Biome.Forest, Biome.Plains, Biome.Swamp, Biome.Savanna, Biome.BirchForest], weight: 4 },
  wolf: { key: 'wolf', name: 'Grey Wolf', hp: 100, speed: 7.2, walk: 2.2, halfWidth: 0.4, height: 1.0, temper: 'hunter', sight: 18, damage: 14, attackInterval: 1.0,
    harvest: [['raw_meat', 4], ['leather', 8], ['bone', 6], ['animal_fat', 2]], biomes: [Biome.Taiga, Biome.Snowy, Biome.Forest, Biome.Mountains], weight: 2 },
  scavenger: { key: 'scavenger', name: 'Scavenger', hp: 110, speed: 4.6, walk: 1.6, halfWidth: 0.3, height: 1.8, temper: 'hunter', sight: 32, damage: 11, attackInterval: 1.5,
    harvest: [], biomes: [], weight: 0, ranged: true },
  bear: { key: 'bear', name: 'Bear', hp: 300, speed: 6.6, walk: 1.8, halfWidth: 0.7, height: 1.5, temper: 'defensive', sight: 12, damage: 30, attackInterval: 1.6,
    harvest: [['raw_meat', 20], ['leather', 25], ['bone', 20], ['animal_fat', 15]], biomes: [Biome.Forest, Biome.Taiga, Biome.Snowy], weight: 1 },
};

export class Animal implements WorldEntity {
  kind = 'a' as const;
  ver = 1;
  dynamic = true;
  removed = false;
  vx = 0; vy = 0; vz = 0;
  yaw = 0;
  onGround = false;
  hp: number;
  state: 'idle' | 'wander' | 'flee' | 'chase' = 'idle';
  target: Player | null = null;
  threatX = 0; threatZ = 0;
  nextThink = 0;
  stateUntil = 0;
  lastAttack = 0;
  angry = false;
  goalYaw = 0;
  history: HistSample[] = [];
  /** POI the NPC guards (scavengers). */
  home: { key: string; x: number; z: number } | null = null;
  lastSeen = 0;
  npcYaw = 0;
  npcSpeed = 0;
  strafe = 1;
  constructor(public id: number, public spec: Species, public x: number, public y: number, public z: number) {
    this.hp = spec.hp;
  }
  snap(): EntSnap {
    let f = 0;
    if (Math.hypot(this.vx, this.vz) > 0.3) f |= 2;
    if (this.state === 'chase' || this.state === 'flee') f |= 4;
    return { id: this.id, k: 'a', x: r2(this.x), y: r2(this.y), z: r2(this.z), yaw: r2(this.yaw), n: this.spec.key, f, hp: r2(this.hp / this.spec.hp) };
  }
  positionAt(t: number): HistSample {
    const h = this.history;
    if (!h.length || t >= h[h.length - 1].t) return { t, x: this.x, y: this.y, z: this.z, c: false };
    for (let i = h.length - 1; i > 0; i--) {
      if (t >= h[i - 1].t) {
        const a = h[i - 1], b = h[i];
        const k = (t - a.t) / Math.max(1e-6, b.t - a.t);
        return { t, x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k, c: false };
      }
    }
    return h[0];
  }
}

/**
 * Wildlife: spawns creatures around players by biome, simple perception
 * (sight radius, crouching halves it, gunshots/explosions scare), a small
 * state machine (idle / wander / flee / chase+attack) and cheap voxel
 * locomotion with 1-block step-ups and cliff avoidance.
 */
export class Wildlife {
  readonly animals = new Set<Animal>();
  private rnd = mulberry32(Date.now() ^ 0xa11);
  private spawnTimer = 0;
  /** POI key -> sim time when its garrison may respawn. */
  private poiRespawn = new Map<string, number>();

  constructor(private game: Game) {}

  noise(x: number, z: number, radius: number) {
    for (const a of this.animals) {
      if (Math.hypot(a.x - x, a.z - z) > radius) continue;
      if (a.spec.temper === 'passive' || (a.spec.temper === 'defensive' && !a.angry)) {
        a.state = 'flee';
        a.threatX = x; a.threatZ = z;
        a.stateUntil = this.game.now + 6;
      }
    }
  }

  damage(a: Animal, amount: number, attacker: Player | null) {
    if (a.removed) return;
    a.hp -= amount;
    if (attacker) {
      if (a.spec.temper === 'passive') {
        a.state = 'flee';
        a.threatX = attacker.x; a.threatZ = attacker.z;
        a.stateUntil = this.game.now + 8;
      } else {
        a.angry = true;
        a.state = 'chase';
        a.target = attacker;
        a.stateUntil = this.game.now + 20;
      }
    }
    if (a.hp <= 0) this.kill(a);
  }

  private kill(a: Animal) {
    this.animals.delete(a);
    this.game.entities.remove(a);
    if (a.spec.ranged) {
      const body = new Corpse(this.game.allocId(), a.spec.name, a.x, a.y, a.z, this.game.now + 600);
      for (const [id, n] of rollLoot('crate', this.rnd).slice(0, 3)) addStack(body.container, makeStack(id, n));
      addStack(body.container, makeStack('pistol_ammo', 4 + Math.floor(this.rnd() * 10)));
      if (this.rnd() < 0.25) addStack(body.container, makeStack('pipe_pistol', 1));
      if (this.rnd() < 0.5) addStack(body.container, makeStack('bandage', 1));
      this.game.entities.add(body);
      if (a.home) this.poiRespawn.set(a.home.key, this.game.now + this.game.config.lootRespawnMin * 60);
      return;
    }
    const c = new Corpse(this.game.allocId(), a.spec.name, a.x, a.y, a.z, this.game.now + 300, a.spec.key);
    c.harvest = a.spec.harvest.map(([k, n]) => [k, n]);
    c.harvestHp = 40 + a.spec.hp * 0.4;
    this.game.entities.add(c);
  }

  spawnNpc(x: number, y: number, z: number, home: Animal['home'] = null): Animal {
    const a = this.spawn('scavenger', x, y, z);
    a.home = home ?? { key: `adhoc:${a.id}`, x, z };
    return a;
  }

  spawn(key: string, x: number, y: number, z: number): Animal {
    if (!SPECIES[key]) throw new Error(`Unknown creature ${key}`);
    const a = new Animal(this.game.allocId(), SPECIES[key], x, y, z);
    this.animals.add(a);
    this.game.entities.add(a);
    return a;
  }

  tick(dt: number) {
    const now = this.game.now;
    this.spawnTimer += dt;
    if (this.spawnTimer > 2) {
      this.spawnTimer = 0;
      this.spawnAround();
      this.despawnFar();
    }
    for (const a of [...this.animals]) {
      this.think(a, now);
      this.move(a, dt);
      a.history.push({ t: now, x: a.x, y: a.y, z: a.z, c: false });
      if (a.history.length > 30) a.history.shift();
    }
  }

  private nearestPlayer(a: Animal, r: number): Player | null {
    let best: Player | null = null, bd = r;
    for (const e of this.game.entities.near(a.x, a.z, r)) {
      if (e.kind !== 'p') continue;
      const p = e as unknown as Player;
      if (!p.alive) continue;
      const eff = p.move.crouching ? 0.5 : 1;
      const d = Math.hypot(p.x - a.x, p.z - a.z) / eff;
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  private think(a: Animal, now: number) {
    if (now < a.nextThink) return;
    if (a.spec.ranged) return this.npcThink(a, now);
    a.nextThink = now + 0.25 + this.rnd() * 0.15;
    const spec = a.spec;
    const night = this.game.isNight();
    const sight = spec.sight * (night && spec.temper === 'hunter' ? 1.6 : 1);
    const seen = this.nearestPlayer(a, sight);
    if (a.state === 'chase') {
      if (!a.target || !a.target.alive || now > a.stateUntil || Math.hypot(a.target.x - a.x, a.target.z - a.z) > sight * 2.5) {
        a.state = 'idle';
        a.target = null;
        a.angry = false;
      }
    } else if (a.state === 'flee') {
      if (now > a.stateUntil) a.state = 'idle';
    } else if (seen) {
      const d = Math.hypot(seen.x - a.x, seen.z - a.z);
      if (spec.temper === 'passive') {
        a.state = 'flee'; a.threatX = seen.x; a.threatZ = seen.z; a.stateUntil = now + 6;
      } else if (spec.temper === 'hunter' || (spec.temper === 'defensive' && d < spec.sight * 0.45)) {
        a.state = 'chase'; a.target = seen; a.stateUntil = now + 25;
      }
    } else if (a.state === 'idle' && this.rnd() < 0.3) {
      a.state = 'wander';
      a.goalYaw = this.rnd() * Math.PI * 2;
      a.stateUntil = now + 2 + this.rnd() * 4;
    } else if (a.state === 'wander' && now > a.stateUntil) a.state = 'idle';

    if (a.state === 'chase' && a.target) {
      const t = a.target;
      const d = Math.hypot(t.x - a.x, t.z - a.z);
      if (d < 1.4 + spec.halfWidth && Math.abs(t.y - a.y) < 1.8 && now - a.lastAttack > spec.attackInterval) {
        a.lastAttack = now;
        this.game.combat.damagePlayer(t, spec.damage, 'animal', null, { bleed: 8, source: spec.name, fromX: a.x, fromZ: a.z });
        this.game.fx('bite', a.x, a.y + 0.8, a.z, 25, { s: spec.key });
      }
    }
  }

  private move(a: Animal, dt: number) {
    const w = this.game.world;
    const spec = a.spec;
    let speed = 0, yaw = a.yaw;
    if (spec.ranged) { yaw = a.npcYaw; speed = a.npcSpeed; }
    else if (a.state === 'flee') { yaw = Math.atan2(-(a.x - a.threatX), -(a.z - a.threatZ)) + Math.PI; speed = spec.speed; }
    else if (a.state === 'chase' && a.target) {
      const d = Math.hypot(a.target.x - a.x, a.target.z - a.z);
      yaw = Math.atan2(-(a.target.x - a.x), -(a.target.z - a.z));
      speed = d > 1.2 ? spec.speed : 0;
    } else if (a.state === 'wander') { yaw = a.goalYaw; speed = spec.walk; }
    // turn smoothly
    let dyaw = yaw - a.yaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    a.yaw += Math.max(-6 * dt, Math.min(6 * dt, dyaw));
    const tvx = -Math.sin(a.yaw) * speed, tvz = -Math.cos(a.yaw) * speed;
    a.vx += (tvx - a.vx) * Math.min(1, 8 * dt);
    a.vz += (tvz - a.vz) * Math.min(1, 8 * dt);
    const solidAt = (x: number, y: number, z: number) => SOLID[w.getBlock(Math.floor(x), Math.floor(y), Math.floor(z))] === 1;
    const blockedAt = (x: number, y: number, z: number) => {
      for (let h = 0.1; h < spec.height; h += 0.9) if (solidAt(x, y + h, z)) return true;
      return solidAt(x, y + spec.height - 0.05, z);
    };
    // cliff avoidance: don't walk off drops > 3 blocks unless fleeing
    const lookX = a.x + Math.sign(a.vx) * (spec.halfWidth + 0.4), lookZ = a.z + Math.sign(a.vz) * (spec.halfWidth + 0.4);
    let drop = 0;
    while (drop < 5 && !solidAt(lookX, a.y - 1 - drop, lookZ)) drop++;
    if (drop >= 4 && a.state !== 'flee') { a.vx *= -0.5; a.vz *= -0.5; a.goalYaw += Math.PI; }
    const reach = spec.halfWidth;
    const nx = a.x + a.vx * dt;
    if (!blockedAt(nx + Math.sign(a.vx) * reach, a.y, a.z)) a.x = nx;
    else if (a.onGround && !blockedAt(nx + Math.sign(a.vx) * reach, a.y + 1, a.z)) a.vy = 8.5;
    else a.vx = 0;
    const nz = a.z + a.vz * dt;
    if (!blockedAt(a.x, a.y, nz + Math.sign(a.vz) * reach)) a.z = nz;
    else if (a.onGround && !blockedAt(a.x, a.y + 1, nz + Math.sign(a.vz) * reach)) a.vy = 8.5;
    else a.vz = 0;
    const inWater = LIQUID[w.getBlock(Math.floor(a.x), Math.floor(a.y + 0.4), Math.floor(a.z))] === 1;
    a.vy -= (inWater ? 8 : 28) * dt;
    if (inWater) a.vy = Math.max(a.vy, -2) + 10 * dt;
    const ny = a.y + a.vy * dt;
    if (a.vy <= 0 && solidAt(a.x, ny, a.z)) {
      a.y = Math.floor(ny) + 1;
      a.vy = 0;
      a.onGround = true;
    } else if (a.vy > 0 && solidAt(a.x, ny + spec.height, a.z)) {
      a.vy = 0;
    } else {
      a.y = ny;
      a.onGround = false;
    }
    if (a.y < 0) { this.animals.delete(a); this.game.entities.remove(a); return; }
    this.game.entities.updateCell(a);
  }

  /** Can the NPC see the player (range, crouching, line of sight)? */
  private sees(a: Animal, p: Player): boolean {
    const d = Math.hypot(p.x - a.x, p.y - a.y, p.z - a.z);
    const range = a.spec.sight * (p.move.crouching ? 0.5 : 1) * (this.game.isNight() ? 0.6 : 1);
    if (d > range) return false;
    const ox = a.x, oy = a.y + 1.6, oz = a.z;
    const tx = p.x - ox, ty = p.y + 1.5 - oy, tz = p.z - oz;
    return !raycastVoxels(this.game.world, ox, oy, oz, tx, ty, tz, d, solidFilter);
  }

  /** Scavenger AI: guard home, engage at range with cover-less strafing, retreat when hurt. */
  private npcThink(a: Animal, now: number) {
    a.nextThink = now + 0.2;
    let target: Player | null = null;
    for (const p of this.game.players.values()) if (p.alive && this.sees(a, p)) target = p;
    if (target) {
      if (a.state !== 'chase') a.lastAttack = now + 0.6 + this.rnd() * 0.6 - a.spec.attackInterval; // reaction time
      a.target = target;
      a.lastSeen = now;
      a.state = 'chase';
    } else if (a.state === 'chase' && now - a.lastSeen > 8) {
      a.state = 'wander';
      a.target = null;
    }
    const t = a.target;
    if (a.state === 'chase' && t && t.alive) {
      const d = Math.hypot(t.x - a.x, t.z - a.z);
      const toward = Math.atan2(-(t.x - a.x), -(t.z - a.z));
      a.yaw = toward;
      if (a.hp < a.spec.hp * 0.3) {
        a.npcYaw = toward + Math.PI; a.npcSpeed = a.spec.speed; // retreat
      } else if (d > 16) {
        a.npcYaw = toward; a.npcSpeed = a.spec.speed;
      } else if (d < 7) {
        a.npcYaw = toward + Math.PI; a.npcSpeed = a.spec.walk * 2;
      } else {
        if (this.rnd() < 0.08) a.strafe = -a.strafe;
        a.npcYaw = toward + (Math.PI / 2) * a.strafe; a.npcSpeed = a.spec.walk * 1.5;
      }
      if (target && now - a.lastAttack > a.spec.attackInterval && d < 40) {
        a.lastAttack = now + this.rnd() * 0.4;
        const moving = Math.hypot(t.move.vx, t.move.vz) > 1;
        const spread = 0.04 + d * 0.0015 + (moving ? 0.03 : 0) + (t.move.crouching ? 0.01 : 0);
        this.game.combat.npcFire(a, a.x, a.y + 1.5, a.z, t.x, t.y + 1.1, t.z, a.spec.damage, spread, a.spec.name);
      }
      return;
    }
    // patrol around home
    const h = a.home;
    if (h && Math.hypot(a.x - h.x, a.z - h.z) > 16) {
      a.npcYaw = Math.atan2(-(h.x - a.x), -(h.z - a.z)); a.npcSpeed = a.spec.walk;
    } else if (this.rnd() < 0.05) {
      a.npcYaw = this.rnd() * Math.PI * 2; a.npcSpeed = this.rnd() < 0.5 ? a.spec.walk : 0;
    }
    a.yaw = a.npcYaw;
  }

  /** Keep POI garrisons populated while the player is near (respawn after being cleared). */
  private spawnGarrisons() {
    if (!this.game.config.hostileNpcs) return;
    const want: Record<string, number> = { low: 0, mid: 3, high: 4 };
    for (const p of this.game.players.values()) {
      if (!p.alive) continue;
      for (const poi of this.game.world.gen.pois.poisNear(p.x, p.z, 120)) {
        const dist = Math.hypot(poi.cx - p.x, poi.cz - p.z);
        if (dist > 110) continue;
        const key = `${poi.x0},${poi.z0}`;
        if ((this.poiRespawn.get(key) ?? 0) > this.game.now) continue;
        let have = 0;
        for (const a of this.animals) if (a.home?.key === key) have++;
        if (have >= want[POI_DEFS[poi.def.kind].tier]) continue;
        const x = Math.floor(poi.x0 + 2 + this.rnd() * (poi.def.w - 4)), z = Math.floor(poi.z0 + 2 + this.rnd() * (poi.def.d - 4));
        if (Math.hypot(x - p.x, z - p.z) < 25) continue;
        if (!this.game.world.isLoaded(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE))) continue;
        const top = this.game.world.topSolid(x, z);
        if (top < 0) continue;
        this.spawnNpc(x + 0.5, top + 1, z + 0.5, { key, x: poi.cx, z: poi.cz });
      }
    }
  }

  private spawnAround() {
    this.spawnGarrisons();
    const target = Math.round(5 * this.game.config.animalDensity);
    if (target <= 0) return;
    for (const p of this.game.players.values()) {
      if (!p.link || !p.alive) continue;
      let count = 0;
      for (const e of this.game.entities.near(p.x, p.z, 96)) if (e.kind === 'a' && !(e as Animal).spec.ranged) count++;
      if (count >= target) continue;
      const ang = this.rnd() * Math.PI * 2, dist = 40 + this.rnd() * 50;
      const x = Math.floor(p.x + Math.sin(ang) * dist), z = Math.floor(p.z + Math.cos(ang) * dist);
      if (!this.game.world.isLoaded(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE))) continue;
      const top = this.game.world.topSolid(x, z);
      if (top < SEA_LEVEL || LIQUID[this.game.world.getBlock(x, top + 1, z)]) continue;
      if (this.game.building.zonesAt(x, top + 1, z).length) continue;
      const biome = this.game.world.gen.column(x, z).biome;
      const options = Object.values(SPECIES).filter((s) => s.biomes.includes(biome));
      if (!options.length) continue;
      const total = options.reduce((s, o) => s + o.weight, 0);
      let pick = this.rnd() * total;
      let spec = options[0];
      for (const o of options) { pick -= o.weight; if (pick <= 0) { spec = o; break; } }
      if (spec.temper === 'hunter' && !this.game.isNight() && this.rnd() < 0.85) continue;
      // Grace period: no predators or bears close to a freshly (re)spawned player.
      if (spec.temper !== 'passive' && spec.key !== 'boar' && this.game.now - p.spawnedAt < 120) continue;
      this.spawn(spec.key, x + 0.5, top + 1, z + 0.5);
    }
  }

  private despawnFar() {
    for (const a of [...this.animals]) {
      let near = false;
      for (const p of this.game.players.values()) {
        if (Math.hypot(p.x - a.x, p.z - a.z) < 150) { near = true; break; }
      }
      if (!near) {
        this.animals.delete(a);
        this.game.entities.remove(a);
      }
    }
  }
}
