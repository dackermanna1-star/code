import type { DamageType, HitZone } from '../../shared/data/damage';
import { ZONE_MULT } from '../../shared/data/damage';
import { itemDef, tryItemDef, type ExplosiveStats } from '../../shared/data/items';
import { dirFromAngles, mulberry32 } from '../../shared/math';
import type { EntSnap } from '../../shared/net/protocol';
import { countItem, removeItem } from '../../shared/sim/inventory';
import { B, blockDef, SOLID } from '../../shared/world/blocks';
import { raycastVoxels, solidFilter } from '../../shared/world/raycast';
import type { Game } from '../game';
import { log } from '../log';
import { r2, type Player } from '../player';
import type { WorldEntity } from './entities';
import type { Animal } from './wildlife';

interface Projectile {
  /** Player who fired (null for NPC shots). */
  owner: Player | null;
  /** Entity that fired (never hit by its own projectile). */
  shooter: WorldEntity | null;
  source: string;
  weapon: string;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  g: number;
  damage: number;
  structureDamage: number;
  type: DamageType;
  range: number;
  travelled: number;
  age: number;
  /** Seconds to rewind targets by (lag compensation). */
  rewind: number;
  bleedChance: number;
}

export class ThrownExplosive implements WorldEntity {
  kind = 'x' as const;
  ver = 1;
  dynamic = true;
  removed = false;
  stuck = false;
  constructor(
    public id: number, public item: string, public stats: ExplosiveStats, public owner: Player | null,
    public x: number, public y: number, public z: number,
    public vx: number, public vy: number, public vz: number, public fuseAt: number,
  ) {}
  snap(): EntSnap {
    return { id: this.id, k: 'x', x: r2(this.x), y: r2(this.y), z: r2(this.z), n: this.item, f: this.stuck ? 1 : 0 };
  }
}

/** Ray vs axis-aligned box. Returns entry distance or null. */
function rayBox(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number,
  x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, maxT: number): number | null {
  let tmin = 0, tmax = maxT;
  const o = [ox, oy, oz], d = [dx, dy, dz], lo = [x0, y0, z0], hi = [x1, y1, z1];
  for (let a = 0; a < 3; a++) {
    if (Math.abs(d[a]) < 1e-12) {
      if (o[a] < lo[a] || o[a] > hi[a]) return null;
      continue;
    }
    let t1 = (lo[a] - o[a]) / d[a], t2 = (hi[a] - o[a]) / d[a];
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  return tmin;
}

export interface EntityHit {
  e: WorldEntity;
  dist: number;
  zone: HitZone;
}

export class Combat {
  private projectiles: Projectile[] = [];
  readonly explosives = new Set<ThrownExplosive>();
  private rnd = mulberry32(Date.now() ^ 0x5eed);
  /** Accumulated blast damage on terrain blocks. */
  private blastDamage = new Map<string, number>();
  stats = { shots: 0, hits: 0, kills: 0 };

  constructor(private game: Game) {}

  // ---------------------------------------------------------------- hit detection
  /**
   * Nearest entity along a ray. Players and animals are tested at their
   * lag-compensated positions `rewind` seconds in the past (capped).
   */
  rayEntity(self: WorldEntity | null, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, range: number,
    filter: (e: WorldEntity) => boolean = (e) => e.kind === 'p' || e.kind === 'a', rewind = 0): EntityHit | null {
    let best: EntityHit | null = null;
    const t = this.game.now - Math.min(0.35, Math.max(0, rewind));
    for (const e of this.game.entities.near(ox, oz, range + 3)) {
      if (e === self || e.removed || !filter(e)) continue;
      let x = e.x, y = e.y, z = e.z, crouch = false;
      let hw = 0.3, h = 1.8, head = 0.45;
      if (e.kind === 'p') {
        const pl = e as unknown as Player;
        if (!pl.alive) continue;
        const s = pl.positionAt(t);
        x = s.x; y = s.y; z = s.z; crouch = s.c;
        if (crouch) h = 1.5;
      } else if (e.kind === 'a') {
        const a = e as unknown as Animal;
        const s = a.positionAt(t);
        x = s.x; y = s.y; z = s.z;
        hw = a.spec.halfWidth; h = a.spec.height; head = 0;
      } else if (e.kind === 'i') {
        hw = 0.25; h = 0.4; head = 0;
      } else if (e.kind === 'c') {
        hw = 0.5; h = 0.5; head = 0;
      }
      const d = rayBox(ox, oy, oz, dx, dy, dz, x - hw, y, z - hw, x + hw, y + h, z + hw, range);
      if (d === null) continue;
      if (!best || d < best.dist) {
        const hy = oy + dy * d;
        let zone: HitZone = 'body';
        if (head > 0 && hy > y + h - head) zone = 'head';
        else if (e.kind === 'p' && hy < y + h * 0.42) zone = 'legs';
        best = { e, dist: d, zone };
      }
    }
    return best;
  }

  // ---------------------------------------------------------------- damage
  damagePlayer(p: Player, amount: number, type: DamageType, attacker: Player | null, opts: { zone?: HitZone; bleed?: number; source?: string; fromX?: number; fromZ?: number } = {}) {
    if (!p.alive || amount <= 0 || p.god) return;
    const armorType = type === 'animal' ? 'melee' : type;
    const prot = ['melee', 'bullet', 'arrow', 'explosive'].includes(armorType) ? p.armor(armorType) : 0;
    const eff = amount * (1 - prot);
    p.vitals.hp -= eff;
    if (opts.bleed && this.rnd() < 1) p.vitals.bleed = Math.min(100, p.vitals.bleed + opts.bleed);
    p.lastDamagedBy = attacker ? attacker.name : opts.source ?? type;
    p.lastDamageTime = this.game.now;
    if (p.link && (attacker || opts.fromX !== undefined)) {
      const fx = attacker ? attacker.x : opts.fromX!, fz = attacker ? attacker.z : opts.fromZ!;
      p.link.send({ t: 'hurt', from: Math.atan2(-(fx - p.x), -(fz - p.z)), amount: Math.round(eff) });
    } else p.link?.send({ t: 'hurt', amount: Math.round(eff) });
    if (p.vitals.hp <= 0) this.kill(p, attacker, opts.source ?? describe(type));
  }

  kill(p: Player, killer: Player | null, cause: string) {
    if (!p.alive) return;
    p.alive = false;
    p.vitals.hp = 0;
    p.deaths++;
    p.deadAt = this.game.now;
    p.killedBy = killer && killer !== p ? killer.name : cause;
    const overflow = this.game.crafting.cancelAll(p);
    this.game.entities.createPlayerCorpse(p, overflow);
    p.inv.clear();
    p.loot = null;
    p.pendingUse = null;
    p.vitals.bleed = 0;
    this.game.entities.remove(p);
    if (killer && killer !== p) {
      killer.kills++;
      this.stats.kills++;
      killer.link?.send({ t: 'hitmark', kill: true });
      this.game.msg(killer, `You killed ${p.name}`, 'kill');
    }
    log.audit('Player died', { name: p.name, by: p.killedBy, x: Math.round(p.x), y: Math.round(p.y), z: Math.round(p.z) });
    this.game.sendDeath(p);
  }

  /** Damage any entity (player or animal). */
  damageEntity(e: WorldEntity, amount: number, type: DamageType, attacker: Player | null, zone: HitZone = 'body', bleed = 0) {
    if (e.kind === 'p') this.damagePlayer(e as unknown as Player, amount * ZONE_MULT[zone], type, attacker, { zone, bleed });
    else if (e.kind === 'a') this.game.wildlife.damage(e as unknown as Animal, amount * ZONE_MULT[zone], attacker);
  }

  // ---------------------------------------------------------------- firing
  fire(p: Player, yaw: number, pitch: number) {
    const held = p.held();
    if (!held) return;
    const def = itemDef(held.id);
    const w = def.weapon;
    if (!w || (w.kind !== 'gun' && w.kind !== 'bow')) return;
    const now = this.game.now;
    if (now - p.lastFire < w.interval * 0.85) return;
    if (p.reloadUntil > now) return;
    const usesMagazine = (w.magazine ?? 0) > 0 && (w.reload ?? 0) > 0;
    let ammoType = held.ammoType ?? w.ammo?.[0] ?? '';
    if (usesMagazine) {
      if (!held.ammo) {
        this.game.msg(p, 'Out of ammo — press R to reload', 'error');
        this.game.fx('dryfire', p.x, p.y + 1.5, p.z, 10);
        return;
      }
      held.ammo--;
    } else {
      ammoType = (w.ammo ?? []).find((a) => countItem(p.inv.all(), a) > 0) ?? '';
      if (!ammoType || !removeItem(p.inv.all(), ammoType, 1)) {
        this.game.msg(p, 'No arrows', 'error');
        return;
      }
    }
    p.lastFire = now;
    p.yaw = yaw;
    p.pitch = pitch;
    this.wearItem(p, held);
    p.inv.belt.touch();
    const [ex, ey, ez] = p.eye();
    const moving = Math.hypot(p.move.vx, p.move.vz) > 1;
    const spread = ((w.spread ?? 0) + (moving ? w.moveSpread ?? 0 : 0)) * (p.move.crouching ? 0.6 : 1);
    const base = dirFromAngles(yaw, pitch);
    const pellets = w.pellets ?? 1;
    const rewind = Math.min(0.3, p.rtt / 2 + 0.1);
    for (let i = 0; i < pellets; i++) {
      const d = perturb(base, spread, this.rnd);
      const sp = w.projectileSpeed ?? 100;
      this.projectiles.push({
        owner: p, shooter: p, source: p.name, weapon: def.key, x: ex, y: ey, z: ez, vx: d.x * sp, vy: d.y * sp, vz: d.z * sp,
        g: 20 * (w.gravityScale ?? 1), damage: w.damage, structureDamage: w.structureDamage ?? w.damage * 0.2, type: w.damageType,
        range: w.range, travelled: 0, age: 0, rewind, bleedChance: w.bleedChance ?? 0,
      });
    }
    this.stats.shots++;
    this.game.fx('shot', ex, ey, ez, w.loudness, { s: def.key, a: yaw, b: pitch }, p);
    this.game.wildlife.noise(ex, ez, w.loudness * 0.5);
  }

  reload(p: Player) {
    const held = p.held();
    if (!held) return;
    const w = tryItemDef(held.id)?.weapon;
    if (!w || !w.magazine || !w.reload || !w.ammo) return;
    if ((held.ammo ?? 0) >= w.magazine || p.reloadUntil > this.game.now) return;
    const type = w.ammo.find((a) => countItem(p.inv.all(), a) > 0);
    if (!type) return this.game.msg(p, 'No ammo', 'error');
    p.reloadUntil = this.game.now + w.reload;
    p.pendingReload = { slot: p.sel, type };
    this.game.fx('reload', p.x, p.y + 1.4, p.z, 20, { s: held.id });
  }

  private finishReload(p: Player) {
    const pr = p.pendingReload;
    p.pendingReload = null;
    if (!pr || pr.slot !== p.sel) return;
    const held = p.held();
    const w = held && tryItemDef(held.id)?.weapon;
    if (!held || !w?.magazine) return;
    const need = w.magazine - (held.ammo ?? 0);
    const have = countItem(p.inv.all(), pr.type);
    const n = Math.min(need, have);
    if (n > 0 && removeItem(p.inv.all(), pr.type, n)) {
      held.ammo = (held.ammo ?? 0) + n;
      held.ammoType = pr.type;
      p.inv.belt.touch();
    }
  }

  wearItem(p: Player, held: { dur?: number; id: string }, amount = 1) {
    if (held.dur === undefined) return;
    held.dur -= amount;
    if (held.dur <= 0) {
      p.inv.belt.slots[p.sel] = null;
      p.inv.belt.touch();
      this.game.msg(p, `Your ${itemDef(held.id).name} broke`, 'error');
      this.game.fx('toolbreak', p.x, p.y + 1.4, p.z, 15);
    }
  }

  /** An NPC fires at a target point (server-simulated bullet, same rules as players). */
  npcFire(shooter: WorldEntity, ox: number, oy: number, oz: number, tx: number, ty: number, tz: number, damage: number, spread: number, source: string) {
    const len = Math.hypot(tx - ox, ty - oy, tz - oz) || 1;
    const d = perturb({ x: (tx - ox) / len, y: (ty - oy) / len, z: (tz - oz) / len }, spread, this.rnd);
    const sp = 240;
    this.projectiles.push({
      owner: null, shooter, source, weapon: 'pipe_pistol', x: ox, y: oy, z: oz, vx: d.x * sp, vy: d.y * sp, vz: d.z * sp,
      g: 12, damage, structureDamage: 4, type: 'bullet', range: 120, travelled: 0, age: 0, rewind: 0, bleedChance: 0.25,
    });
    this.game.fx('shot', ox, oy, oz, 110, { s: 'pipe_pistol', a: Math.atan2(-d.x, -d.z), b: Math.asin(Math.max(-1, Math.min(1, d.y))) });
  }

  // ---------------------------------------------------------------- melee
  melee(p: Player, hit: EntityHit, damage: number, type: DamageType, bleedChance: number) {
    const bleed = this.rnd() < bleedChance ? 15 : 0;
    this.damageEntity(hit.e, damage, type, p, hit.zone, bleed);
    p.link?.send({ t: 'hitmark', head: hit.zone === 'head' });
    this.game.fx('hitflesh', hit.e.x, hit.e.y + 1, hit.e.z, 30);
  }

  // ---------------------------------------------------------------- explosives
  throwExplosive(p: Player, yaw: number, pitch: number) {
    const held = p.held();
    if (!held) return;
    const def = itemDef(held.id);
    if (!def.explosive) return;
    const now = this.game.now;
    if (now - p.lastFire < 1) return;
    p.lastFire = now;
    held.n -= 1;
    if (held.n <= 0) p.inv.belt.slots[p.sel] = null;
    p.inv.belt.touch();
    const [ex, ey, ez] = p.eye();
    const d = dirFromAngles(yaw, pitch);
    const s = def.explosive.throwSpeed;
    const e = new ThrownExplosive(this.game.allocId(), def.key, def.explosive, p, ex + d.x * 0.5, ey + d.y * 0.5, ez + d.z * 0.5,
      d.x * s + p.move.vx * 0.5, d.y * s + 2, d.z * s + p.move.vz * 0.5, now + def.explosive.fuse);
    this.explosives.add(e);
    this.game.entities.add(e);
    this.game.fx('throw', ex, ey, ez, 20, { s: def.key });
    log.audit('Explosive thrown', { player: p.name, item: def.key, x: Math.round(ex), y: Math.round(ey), z: Math.round(ez) });
  }

  explode(x: number, y: number, z: number, st: ExplosiveStats, owner: Player | null) {
    const w = this.game.world;
    this.game.fx('explode', x, y, z, st.loudness, { a: st.radius });
    this.game.wildlife.noise(x, z, st.loudness);
    const falloff = (d: number) => (d <= 1 ? 1 : Math.max(0, 1 - (d - 1) / (st.radius - 1)));
    // creatures & players (line of sight reduces damage)
    for (const e of [...this.game.entities.near(x, z, st.radius + 1)]) {
      if (e.kind !== 'p' && e.kind !== 'a') continue;
      const cy = e.y + 0.9;
      const d = Math.hypot(e.x - x, cy - y, e.z - z);
      if (d > st.radius) continue;
      const blocked = raycastVoxels(w, x, y, z, e.x - x, cy - y, e.z - z, d - 0.3, solidFilter);
      const dmg = st.damage * falloff(d) * (blocked ? 0.25 : 1);
      if (e.kind === 'p') this.damagePlayer(e as unknown as Player, dmg, 'explosive', owner, { fromX: x, fromZ: z, bleed: 10, source: 'Explosion' });
      else this.game.wildlife.damage(e as unknown as Animal, dmg, owner);
    }
    // building pieces: once per piece, by nearest cell
    let structureHit = false;
    for (const { piece, dist } of this.game.building.piecesInRadius(x, y, z, st.radius)) {
      if (this.game.building.damagePiece(piece, st.structureDamage * falloff(dist), 'explosive', owner) > 0) structureHit = true;
    }
    // deployables
    for (const t of [...this.game.tiles.near(x, z, st.radius + 1)]) {
      const d = Math.hypot(t.x + 0.5 - x, t.y + 0.5 - y, t.z + 0.5 - z);
      if (d <= st.radius) this.game.tiles.damage(t, st.structureDamage * falloff(d), 'explosive', owner);
    }
    // terrain & freeform blocks (cumulative blast damage)
    const R = Math.ceil(st.radius);
    for (let dy = -R; dy <= R; dy++) for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
      const bx = Math.floor(x) + dx, by = Math.floor(y) + dy, bz = Math.floor(z) + dz;
      const d = Math.hypot(bx + 0.5 - x, by + 0.5 - y, bz + 0.5 - z);
      if (d > st.radius) continue;
      const id = w.getBlock(bx, by, bz);
      if (id === B.air) continue;
      const bd = blockDef(id);
      if (!Number.isFinite(bd.blastHp) || bd.structureTier !== undefined || bd.door || bd.deployable || bd.liquid) continue;
      const key = `${bx},${by},${bz}`;
      const acc = (this.blastDamage.get(key) ?? 0) + st.structureDamage * falloff(d);
      if (acc >= bd.blastHp) {
        this.blastDamage.delete(key);
        w.set(bx, by, bz, B.air);
        this.game.tiles.checkSupport(bx, by + 1, bz);
      } else this.blastDamage.set(key, acc);
    }
    if (owner && structureHit) owner.link?.send({ t: 'hitmark', structure: true });
  }

  // ---------------------------------------------------------------- simulation
  tick(dt: number) {
    const now = this.game.now;
    for (const p of this.game.players.values()) {
      if (p.pendingReload && now >= p.reloadUntil) this.finishReload(p);
    }
    this.stepProjectiles(dt);
    this.stepExplosives(dt);
    if (this.game.tickCount % 200 === 0 && this.blastDamage.size > 20000) this.blastDamage.clear();
  }

  private stepProjectiles(dt: number) {
    const w = this.game.world;
    const keep: Projectile[] = [];
    for (const pr of this.projectiles) {
      let alive = true;
      const SUB = 4;
      const sdt = dt / SUB;
      for (let s = 0; s < SUB && alive; s++) {
        const nvx = pr.vx, nvy = pr.vy - pr.g * sdt, nvz = pr.vz;
        const sx = nvx * sdt, sy = nvy * sdt, sz = nvz * sdt;
        const len = Math.hypot(sx, sy, sz);
        if (len <= 0) { alive = false; break; }
        const dx = sx / len, dy = sy / len, dz = sz / len;
        const block = raycastVoxels(w, pr.x, pr.y, pr.z, dx, dy, dz, len, solidFilter);
        const ent = this.rayEntity(pr.shooter, pr.x, pr.y, pr.z, dx, dy, dz, len, undefined, pr.rewind);
        if (ent && (!block || ent.dist <= block.dist)) {
          const falloff = Math.max(0.5, 1 - (pr.travelled / pr.range) * 0.5);
          const bleed = this.rnd() < pr.bleedChance ? 12 : 0;
          if (pr.owner) {
            this.damageEntity(ent.e, pr.damage * falloff, pr.type, pr.owner, ent.zone, bleed);
            pr.owner.link?.send({ t: 'hitmark', head: ent.zone === 'head' });
          } else if (ent.e.kind === 'p') {
            this.damagePlayer(ent.e as unknown as Player, pr.damage * falloff * ZONE_MULT[ent.zone], pr.type, null, { zone: ent.zone, bleed, source: pr.source, fromX: pr.shooter?.x, fromZ: pr.shooter?.z });
          } else this.damageEntity(ent.e, pr.damage * falloff, pr.type, null, ent.zone, bleed);
          this.stats.hits++;
          this.game.fx('hitflesh', pr.x + dx * ent.dist, pr.y + dy * ent.dist, pr.z + dz * ent.dist, 40);
          alive = false;
          break;
        }
        if (block) {
          const hx = pr.x + dx * block.dist, hy = pr.y + dy * block.dist, hz = pr.z + dz * block.dist;
          const piece = this.game.building.pieceAt(block.x, block.y, block.z);
          if (piece) {
            if (this.game.building.damagePiece(piece, pr.structureDamage, pr.type, pr.owner) > 0) pr.owner?.link?.send({ t: 'hitmark', structure: true });
          } else {
            const t = this.game.tiles.at(block.x, block.y, block.z);
            if (t) this.game.tiles.damage(t, pr.structureDamage, pr.type, pr.owner);
          }
          this.game.fx('impact', hx, hy, hz, 40, { s: blockDef(block.id).sound });
          alive = false;
          break;
        }
        pr.x += sx; pr.y += sy; pr.z += sz;
        pr.vy = nvy;
        pr.travelled += len;
        pr.age += sdt;
        if (pr.travelled > pr.range * 1.5 || pr.age > 4 || pr.y < 0) alive = false;
      }
      if (alive) keep.push(pr);
    }
    this.projectiles = keep;
  }

  private stepExplosives(dt: number) {
    const w = this.game.world;
    for (const e of [...this.explosives]) {
      if (!e.stuck) {
        e.vy -= 20 * dt;
        const nx = e.x + e.vx * dt, ny = e.y + e.vy * dt, nz = e.z + e.vz * dt;
        const hit = SOLID[w.getBlock(Math.floor(nx), Math.floor(ny), Math.floor(nz))];
        if (hit) {
          if (e.stats.sticky) {
            e.stuck = true;
            e.vx = e.vy = e.vz = 0;
          } else {
            // bounce with damping on the axis that collided
            if (SOLID[w.getBlock(Math.floor(e.x), Math.floor(ny), Math.floor(e.z))]) e.vy = -e.vy * 0.3;
            if (SOLID[w.getBlock(Math.floor(nx), Math.floor(e.y), Math.floor(e.z))]) e.vx = -e.vx * 0.4;
            if (SOLID[w.getBlock(Math.floor(e.x), Math.floor(e.y), Math.floor(nz))]) e.vz = -e.vz * 0.4;
            e.vx *= 0.7; e.vz *= 0.7;
          }
        } else {
          e.x = nx; e.y = ny; e.z = nz;
        }
        this.game.entities.updateCell(e);
      }
      if (this.game.now >= e.fuseAt) {
        if (e.stats.dudChance && this.rnd() < e.stats.dudChance) {
          e.stats = { ...e.stats, dudChance: 0 };
          e.fuseAt = this.game.now + 4 + this.rnd() * 4; // fizzles, then re-ignites
          this.game.fx('dud', e.x, e.y, e.z, 20);
          continue;
        }
        this.explosives.delete(e);
        this.game.entities.remove(e);
        this.explode(e.x, e.y, e.z, e.stats, e.owner);
      }
    }
  }
}

function perturb(d: { x: number; y: number; z: number }, cone: number, rnd: () => number) {
  if (cone <= 0) return d;
  // random direction within a cone around d
  const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * cone;
  let ux = -d.z, uy = 0, uz = d.x;
  const ul = Math.hypot(ux, uy, uz) || 1;
  ux /= ul; uz /= ul;
  const vx = d.y * uz - d.z * uy, vy = d.z * ux - d.x * uz, vz = d.x * uy - d.y * ux;
  const ca = Math.cos(a) * r, sa = Math.sin(a) * r;
  const x = d.x + ux * ca + vx * sa, y = d.y + uy * ca + vy * sa, z = d.z + uz * ca + vz * sa;
  const l = Math.hypot(x, y, z);
  return { x: x / l, y: y / l, z: z / l };
}

function describe(t: DamageType): string {
  const m: Partial<Record<DamageType, string>> = {
    fall: 'Fall damage', hunger: 'Starvation', thirst: 'Dehydration', cold: 'Hypothermia', heat: 'Heatstroke',
    bleed: 'Bleeding', radiation: 'Radiation poisoning', explosive: 'Explosion', drown: 'Drowning', suicide: 'Suicide', animal: 'Animal attack',
  };
  return m[t] ?? t;
}
