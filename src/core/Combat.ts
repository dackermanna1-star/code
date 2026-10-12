// Shooting, projectiles and explosions.
//
// Bullets are hitscan, fired horizontally to the left like the original. The
// hit test is view-consistent: a bullet at height h and depth z0 is tested
// against each creature's side silhouette at the height where the tracer
// visually crosses that creature on screen: h + (z - z0) * tan(pitch).
// See docs/RESEARCH.md section 4.
import { ENEMIES } from '../config/enemies';
import { FIELD_HALF_W, GAME_GRAVITY, TAN_PITCH, TICK } from '../config/constants';
import { FLUNK_ROUND, GRENADE_THROW, spreadToYaw } from '../config/weapons';
import type { Enemy } from './Enemy';
import type { BulletPath, HitPart, V3 } from './Events';
import type { Player } from './Player';
import type { Weapon } from './Weapon';
import type { World } from './World';
import { Turtle } from './enemies';

/** Hit tolerance added to every silhouette (the original masks had pixel-wide edges). */
const EDGE = 0.02;
/** Depth scale of splash radius (the original's splash was a circle on screen). */
const SPLASH_Z = 1.35;

export interface Projectile {
  readonly id: number;
  kind: 'grenade' | 'round';
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  ticks: number;
  /** Spin for rendering. */
  rot: number;
  done: boolean;
  weapon: Weapon;
  player: Player;
}

let PID = 1;

export class Explosion {
  ticks = 0;
  private hit = new Set<Enemy>();
  private hitPlayers = new Set<Player>();
  private kills: Enemy[] = [];
  done = false;
  constructor(
    private world: World,
    readonly x: number,
    readonly y: number,
    readonly z: number,
    readonly radius: number,
    readonly energy: number,
    readonly weapon: Weapon,
    readonly player: Player,
  ) {}

  private dist(ex: number, ez: number): number {
    return Math.hypot(ex - this.x, (ez - this.z) / SPLASH_Z);
  }

  /** Expanding blast: radius grows over 8 ticks; each creature is hit once. */
  tick(): void {
    this.ticks++;
    if (this.ticks <= 8) {
      const r = (this.radius * this.ticks) / 8;
      for (const e of this.world.enemies) {
        if (!e.alive || this.hit.has(e)) continue;
        const d = Math.max(0, this.dist(e.x, e.z) - e.def.halfLength * 0.5);
        if (d > r) continue;
        this.hit.add(e);
        const dmg = Math.floor((this.energy * Math.max(0, this.radius - d)) / this.radius);
        if (dmg <= 0) continue;
        const dx = e.x - this.x;
        const dz = e.z - this.z;
        const l = Math.hypot(dx, dz) || 1;
        e.takeDamage({
          damage: dmg + this.weapon.def.damageInc * (this.world.levelNum - 1),
          part: 'body',
          point: { x: e.x, y: e.def.height * 0.4, z: e.z },
          dirX: dx / l,
          dirZ: dz / l,
          bullet: false,
          player: this.player,
          explosion: { x: this.x, y: this.y, z: this.z },
        });
        this.player.stats.hits++;
      }
      for (const p of this.world.players) {
        if (!p.alive || this.hitPlayers.has(p)) continue;
        const d = this.dist(p.x, p.z);
        if (d > r) continue;
        this.hitPlayers.add(p);
        const dmg = Math.floor((this.energy * Math.max(0, this.radius - d)) / this.radius);
        p.hurt(dmg, this.x, this.z);
      }
      this.kills.push(...this.world.resolveDeaths());
    } else {
      this.done = true;
      this.world.combat.rewardShot(this.player, this.weapon, this.kills, 0);
    }
  }
}

interface RayHit {
  enemy: Enemy;
  x: number;
  y: number;
  part: HitPart;
}

export class Combat {
  projectiles: Projectile[] = [];
  explosions: Explosion[] = [];

  constructor(private world: World) {}

  /** Fire all pellets of a hitscan weapon. */
  fireHitscan(player: Player, weapon: Weapon): void {
    const def = weapon.def;
    const m = player.muzzle();
    const maxYaw = spreadToYaw(def.spreadDeg);
    const paths: BulletPath[] = [];
    let headshots = 0;
    player.stats.shots++;
    for (let i = 0; i < def.pellets; i++) {
      const yaw = maxYaw > 0 ? this.world.rng.range(-maxYaw, maxYaw) : 0;
      headshots += this.trace(player, weapon, m, yaw, 0, def.damage, paths, null, 0);
    }
    const kills = this.world.resolveDeaths();
    this.world.events.emit('shot', { playerId: player.id, weapon: weapon.id, muzzle: m, paths });
    this.rewardShot(player, weapon, kills, headshots);
  }

  /**
   * Trace one bullet. `slope` is dy/dx along the travel direction (ricochets).
   * Returns number of headshots.
   */
  private trace(
    player: Player,
    weapon: Weapon,
    o: V3,
    yaw: number,
    slope: number,
    energy: number,
    paths: BulletPath[],
    skip: Enemy | null,
    depth: number,
  ): number {
    const tz = Math.tan(yaw);
    const hits: RayHit[] = [];
    for (const e of this.world.enemies) {
      if (!e.alive || e === skip || e.left > o.x) continue;
      const run = Math.max(0, o.x - e.x);
      const zRay = o.z + run * tz;
      const yRay = o.y + run * slope;
      const yEff = yRay + (e.z - zRay) * TAN_PITCH;
      const sil = e.silhouetteAt(yEff);
      if (!sil) continue;
      const hx = Math.min(sil.right + EDGE, o.x);
      if (hx < e.x - e.def.halfLength - 1) continue;
      hits.push({ enemy: e, x: hx, y: yEff, part: sil.part });
    }
    hits.sort((a, b) => b.x - a.x);

    const lvl = this.world.levelNum;
    let end: V3 | null = null;
    let heads = 0;
    for (const h of hits) {
      if (energy < 1) break;
      const e = h.enemy;
      const run = o.x - h.x;
      const point: V3 = { x: h.x - this.world.rng.range(0, 0.1), y: h.y, z: e.z };
      const contact = e.bulletContact(h.part, point);
      if (contact === 'deflect') {
        // Turtle shell: the bullet glances off with half its energy.
        this.world.events.emit('ricochet', { point, enemyId: e.id });
        if (e instanceof Turtle) e.shove(energy);
        end = { x: point.x, y: o.y + run * slope, z: o.z + run * tz };
        if (depth < 2) {
          const sign = this.world.rng.chance(0.5) ? 1 : -1;
          const nyaw = yaw + sign * this.world.rng.range(0.15, 0.45);
          const nslope = this.world.rng.range(-0.05, 0.35);
          heads += this.trace(player, weapon, { ...end }, nyaw, nslope, 1 + energy / 2, paths, e, depth + 1);
        }
        energy = 0;
        break;
      }
      const head = h.part === 'head';
      let dmg = energy * (head ? ENEMIES[e.type].headshotMultiplier : 1);
      dmg += weapon.def.damageInc * (lvl - 1);
      if (head) {
        heads++;
        player.stats.headshots++;
        if (e.headshotBonus) player.earn(e.headshotBonus);
      }
      player.stats.hits++;
      e.takeDamage({
        damage: dmg,
        part: h.part,
        point,
        dirX: -Math.cos(yaw),
        dirZ: Math.sin(yaw),
        bullet: true,
        player,
      });
      energy *= weapon.def.pierce;
      if (energy < 1) end = { x: point.x, y: o.y + run * slope, z: o.z + run * tz };
    }
    if (!end) {
      const run = o.x - (-FIELD_HALF_W - 6);
      end = { x: o.x - run, y: o.y + run * slope, z: o.z + run * tz };
    }
    paths.push({ from: { ...o }, to: end, ric: depth > 0 });
    return heads;
  }

  /** First creature the hunter's current gun line would hit (no spread), for the bot. */
  lineTarget(player: Player): Enemy | null {
    const o = player.muzzle();
    let best: Enemy | null = null;
    let bx = -Infinity;
    for (const e of this.world.enemies) {
      if (!e.alive || e.left > o.x) continue;
      const yEff = o.y + (e.z - o.z) * TAN_PITCH;
      const sil = e.silhouetteAt(yEff);
      if (sil && sil.right > bx) {
        bx = sil.right;
        best = e;
      }
    }
    return best;
  }

  /** Bounties, nice shots (3+ kills from one shot), AWP multi-headshots. */
  rewardShot(player: Player, weapon: Weapon, kills: Enemy[], headshots: number): void {
    let n = 0;
    if (kills.length > 2) n += kills.length - 1;
    if (weapon.id === 'awp' && headshots > 2) n += headshots;
    if (n > 0) {
      player.stats.niceShots++;
      player.stats.bestNiceShot = Math.max(player.stats.bestNiceShot, kills.length);
      player.earn(10 * n * this.world.levelNum);
      this.world.events.emit('niceShot', { playerId: player.id, n });
      this.world.startleCub();
    }
  }

  throwGrenade(player: Player, weapon: Weapon): void {
    player.stats.shots++;
    this.world.events.emit('shot', { playerId: player.id, weapon: weapon.id, muzzle: player.muzzle(), paths: [] });
    this.projectiles.push({
      id: PID++,
      kind: 'grenade',
      x: player.x - 0.3,
      y: player.y + 1.25,
      z: player.z,
      vx: player.vx + GRENADE_THROW.vx,
      vy: player.vy + GRENADE_THROW.vy,
      vz: player.vz * 0.6,
      ticks: 0,
      rot: 0,
      done: false,
      weapon,
      player,
    });
  }

  launchRound(player: Player, weapon: Weapon): void {
    const m = player.muzzle();
    player.stats.shots++;
    this.world.events.emit('shot', { playerId: player.id, weapon: weapon.id, muzzle: m, paths: [] });
    this.projectiles.push({
      id: PID++,
      kind: 'round',
      x: m.x,
      y: Math.max(0.3, player.y + FLUNK_ROUND.height),
      z: player.z,
      vx: player.vx / 2 + FLUNK_ROUND.vx,
      vy: player.vy * 0.5,
      vz: player.vz * 0.5,
      ticks: 0,
      rot: 0,
      done: false,
      weapon,
      player,
    });
  }

  private explode(p: Projectile): void {
    p.done = true;
    const def = p.weapon.def;
    const ex = new Explosion(this.world, p.x, Math.max(0, p.y), p.z, def.splash, def.damage, p.weapon, p.player);
    this.explosions.push(ex);
    this.world.events.emit('explosion', { pos: { x: p.x, y: Math.max(0, p.y), z: p.z }, radius: def.splash, weapon: p.weapon.id });
  }

  private hugeAt(p: Projectile): Enemy | null {
    for (const e of this.world.enemies) {
      if (!e.alive) continue;
      if (e.type !== 'fatseal' && e.type !== 'bear' && e.type !== 'turtle' && e.type !== 'walrus') continue;
      if (Math.abs(p.x - e.x) < e.def.halfLength && Math.abs(p.z - e.z) < e.def.halfDepth && p.y < e.def.height * 0.85) return e;
    }
    return null;
  }

  private touchingAny(p: Projectile): boolean {
    for (const e of this.world.enemies) {
      if (!e.alive) continue;
      if (Math.abs(p.x - e.x) < e.def.halfLength + 0.15 && Math.abs(p.z - e.z) < e.def.halfDepth + 0.25 && p.y < e.def.height) {
        return true;
      }
    }
    return false;
  }

  tick(): void {
    const dt = TICK;
    for (const p of this.projectiles) {
      if (p.done) continue;
      p.ticks++;
      p.vy -= GAME_GRAVITY * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.rot += (p.kind === 'grenade' ? -14 : -4) * dt * Math.sign(p.vx || 1) * Math.min(1, Math.abs(p.vx) / 4 + 0.2);
      const r = p.kind === 'grenade' ? 0.07 : 0.05;
      const onFloe = this.world.isOnFloe(p.x, p.z);
      if (p.y <= r && onFloe) {
        p.y = r;
        if (p.vy < -2.2) {
          this.world.events.emit('grenadeBounce', { pos: { x: p.x, y: 0, z: p.z }, strength: Math.min(1, -p.vy / 8) });
          p.vy = -p.vy * (p.kind === 'grenade' ? 0.42 : 0.38);
          p.vx *= 0.72;
          p.vz *= 0.72;
        } else {
          p.vy = 0;
          // Ground friction (original x_fric 20 for grenades, 12 for launcher rounds).
          const k = p.kind === 'grenade' ? 18 : 22;
          p.vx = approach(p.vx, k * dt);
          p.vz = approach(p.vz, k * dt);
        }
      }
      if (p.kind === 'grenade') {
        const big = this.hugeAt(p);
        if (big) {
          if (p.x > big.x + big.def.halfLength * 0.5 && p.vx < 0) p.vx = -p.vx * 0.6;
          else p.vx *= 0.6;
          p.vy = Math.abs(p.vy) * 0.6;
        }
        const still = Math.abs(p.vx) + Math.abs(p.vz) < 0.05 && p.y <= r + 1e-3;
        if (p.ticks >= GRENADE_THROW.fuseTicks || still) this.explode(p);
      } else {
        const still = Math.abs(p.vx) + Math.abs(p.vz) < 0.3 && p.y <= r + 1e-3;
        if (this.touchingAny(p) || still) this.explode(p);
      }
      if (!p.done && (p.y < -4 || p.x < -FIELD_HALF_W - 8 || p.x > FIELD_HALF_W + 8)) p.done = true;
    }
    this.projectiles = this.projectiles.filter((p) => !p.done);

    for (const ex of this.explosions) ex.tick();
    this.explosions = this.explosions.filter((e) => !e.done);
  }
}

function approach(v: number, step: number): number {
  if (v > 0) return Math.max(0, v - step);
  if (v < 0) return Math.min(0, v + step);
  return 0;
}
