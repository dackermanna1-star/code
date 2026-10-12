// Shooting, projectiles and explosions.
//
// Bullets are hitscan, fired horizontally to the left like the original. The
// hit test is view-consistent: a bullet at height h and depth z0 is tested
// against each creature's side silhouette at the height where the tracer
// visually crosses that creature on screen: h + (z - z0) * tan(pitch).
// See docs/RESEARCH.md section 4.
//
// First-person mode (player.aim set) replaces the lane rule with true 3D rays
// from the eye along the aim, tested against ellipsoids derived from the same
// side-plane shapes (Enemy.hitVolumes); damage, pierce, ricochets and rewards
// are shared with the classic path. Thrown and launched projectiles then travel
// along the aim heading instead of to the left.
import { ENEMIES } from '../config/enemies';
import { FIELD_HALF_W, GAME_GRAVITY, TICK } from '../config/constants';
import { WATER_LEVEL } from '../config/field';
import { FP, aimDir, headingDir, yawOf, type Aim } from '../config/firstPerson';
import { viewHeightAt } from '../config/view';
import { FLUNK_ROUND, GRENADE_THROW, spreadToYaw } from '../config/weapons';
import type { Enemy, HitVolume } from './Enemy';
import type { BulletPath, HitPart, V3 } from './Events';
import type { Player } from './Player';
import type { Weapon } from './Weapon';
import type { World } from './World';
import { Turtle } from './enemies';

/** Hit tolerance added to every silhouette (the original masks had pixel-wide edges). */
const EDGE = 0.02;
/** Depth scale of splash radius (the original's splash was a circle on screen). */
const SPLASH_Z = 1.35;

/**
 * First-person grenade throw: the classic throw (GRENADE_THROW, ~35 degrees up)
 * when looking level; looking up raises the release angle and throws harder,
 * looking down lobs it short. Elevation = base + pitch * pitchGain (clamped),
 * speed = classic speed * (1 + pitch * speedGain) (clamped).
 */
const AIMED_THROW = { pitchGain: 0.6, minElev: -0.35, maxElev: 0.95, speedGain: 0.35, minSpeed: 0.7, maxSpeed: 1.25 };

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
  /**
   * First-person projectiles only: yaw (config/firstPerson.ts convention) of
   * the horizontal travel direction, for orienting the model. Classic
   * projectiles always travel along x and leave it undefined.
   */
  heading?: number;
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

interface Ray3Hit {
  enemy: Enemy;
  t: number;
  part: HitPart;
  volume: HitVolume;
}

/** What is under the first-person reticle (Combat.aimTrace). */
export interface AimTrace {
  /** First creature along the aim ray, or null. */
  enemy: Enemy | null;
  part: HitPart | null;
  /** Eye point the ray starts from. */
  from: V3;
  /** Where the ray stops: the creature's surface, the ice/sea, or the end of the range. */
  point: V3;
  dist: number;
  ground?: 'ice' | 'water';
}

export class Combat {
  projectiles: Projectile[] = [];
  explosions: Explosion[] = [];

  constructor(private world: World) {}

  /** Fire all pellets of a hitscan weapon. */
  fireHitscan(player: Player, weapon: Weapon): void {
    if (player.aim) {
      this.fireAimed(player, weapon, player.aim);
      return;
    }
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
      const yEff = viewHeightAt(yRay, zRay, e.z);
      const sil = e.silhouetteAt(yEff);
      if (!sil) continue;
      const hx = Math.min(sil.right + EDGE, o.x);
      if (hx < e.x - e.def.halfLength - 1) continue;
      hits.push({ enemy: e, x: hx, y: yEff, part: sil.part });
    }
    hits.sort((a, b) => b.x - a.x);

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
      heads += this.strike(player, weapon, e, h.part, point, energy, -Math.cos(yaw), Math.sin(yaw));
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

  /**
   * Shared bullet impact: headshot multiplier and bonus, level damage bonus,
   * statistics and the damage itself. Returns 1 for a headshot.
   */
  private strike(
    player: Player,
    weapon: Weapon,
    e: Enemy,
    part: HitPart,
    point: V3,
    energy: number,
    dirX: number,
    dirZ: number,
  ): number {
    const head = part === 'head';
    let dmg = energy * (head ? ENEMIES[e.type].headshotMultiplier : 1);
    dmg += weapon.def.damageInc * (this.world.levelNum - 1);
    if (head) {
      player.stats.headshots++;
      if (e.headshotBonus) player.earn(e.headshotBonus);
    }
    player.stats.hits++;
    e.takeDamage({ damage: dmg, part, point, dirX, dirZ, bullet: true, player });
    return head ? 1 : 0;
  }

  // ------------------------------------------------------------------ first person

  /**
   * First-person hitscan: every pellet is a 3D ray from the eye along the aim,
   * perturbed inside the weapon's spread cone (a disc flattened vertically by
   * FP.spreadPitch, uniform over its area).
   */
  private fireAimed(player: Player, weapon: Weapon, aim: Aim): void {
    const def = weapon.def;
    const rng = this.world.rng;
    const o = player.eye();
    const maxYaw = spreadToYaw(def.spreadDeg);
    const paths: BulletPath[] = [];
    let headshots = 0;
    player.stats.shots++;
    const a: Aim = { yaw: aim.yaw, pitch: aim.pitch };
    for (let i = 0; i < def.pellets; i++) {
      a.yaw = aim.yaw;
      a.pitch = aim.pitch;
      if (maxYaw > 0) {
        const r = Math.sqrt(rng.next());
        const th = rng.range(0, 2 * Math.PI);
        a.yaw += maxYaw * r * Math.cos(th);
        a.pitch += maxYaw * FP.spreadPitch * r * Math.sin(th);
      }
      headshots += this.traceRay(player, weapon, o, aimDir(a), def.damage, paths, null, 0);
    }
    const kills = this.world.resolveDeaths();
    this.world.events.emit('shot', { playerId: player.id, weapon: weapon.id, muzzle: player.aimMuzzle(), paths });
    this.rewardShot(player, weapon, kills, headshots);
  }

  /**
   * How far the unit ray o + t*d may travel: the hitscan range, cut where it
   * meets the ice (or, past the floe's edge, the sea).
   */
  private rayLimit(o: V3, d: V3): { t: number; ground?: 'ice' | 'water' } {
    if (d.y < -1e-6) {
      const tIce = Math.max(0, -o.y / d.y);
      if (tIce < FP.range) {
        if (this.world.isOnFloe(o.x + d.x * tIce, o.z + d.z * tIce)) return { t: tIce, ground: 'ice' };
        const tSea = (WATER_LEVEL - o.y) / d.y;
        if (tSea < FP.range) return { t: tSea, ground: 'water' };
      }
    }
    return { t: FP.range };
  }

  /** Creatures along a 3D ray, nearest first. */
  private rayHits(o: V3, d: V3, maxT: number, skip: Enemy | null): Ray3Hit[] {
    const hits: Ray3Hit[] = [];
    for (const e of this.world.enemies) {
      if (!e.alive || e === skip) continue;
      const c = e.rayContact(o, d, maxT, EDGE);
      if (c) hits.push({ enemy: e, t: c.t, part: c.part, volume: c.volume });
    }
    hits.sort((a, b) => a.t - b.t);
    return hits;
  }

  /**
   * Trace one first-person bullet (the 3D counterpart of `trace`): pierce,
   * headshots and shell ricochets work as in the classic loop. Returns the
   * number of headshots.
   */
  private traceRay(
    player: Player,
    weapon: Weapon,
    o: V3,
    d: V3,
    energy: number,
    paths: BulletPath[],
    skip: Enemy | null,
    depth: number,
  ): number {
    const rng = this.world.rng;
    const lim = this.rayLimit(o, d);
    const hl = Math.hypot(d.x, d.z) || 1;
    const dirX = d.x / hl;
    const dirZ = d.z / hl;
    let end: V3 | null = null;
    let heads = 0;
    for (const h of this.rayHits(o, d, lim.t, skip)) {
      if (energy < 1) break;
      const e = h.enemy;
      const tp = h.t + rng.range(0, 0.1);
      const point: V3 = { x: o.x + d.x * tp, y: o.y + d.y * tp, z: o.z + d.z * tp };
      const contact = e.bulletContact(h.part, point);
      if (contact === 'deflect') {
        // Turtle shell: the bullet glances off with half its energy.
        this.world.events.emit('ricochet', { point, enemyId: e.id });
        if (e instanceof Turtle) e.shove(energy, dirX, dirZ);
        const surf: V3 = { x: o.x + d.x * h.t, y: o.y + d.y * h.t, z: o.z + d.z * h.t };
        end = surf;
        if (depth < 2) {
          heads += this.traceRay(player, weapon, { ...surf }, this.glance(d, surf, h.volume), 1 + energy / 2, paths, e, depth + 1);
        }
        energy = 0;
        break;
      }
      heads += this.strike(player, weapon, e, h.part, point, energy, dirX, dirZ);
      energy *= weapon.def.pierce;
      if (energy < 1) end = point;
    }
    const path: BulletPath = { from: { ...o }, to: end ?? { x: o.x + d.x * lim.t, y: o.y + d.y * lim.t, z: o.z + d.z * lim.t }, ric: depth > 0 };
    if (!end && lim.ground) path.ground = lim.ground;
    paths.push(path);
    return heads;
  }

  /**
   * Direction of a bullet glancing off a shell: the mirror of `d` about the
   * ellipsoid's surface normal at `p`, scattered sideways and kicked slightly
   * upwards (like the classic ricochet's random yaw and rising slope).
   */
  private glance(d: V3, p: V3, v: HitVolume): V3 {
    const rng = this.world.rng;
    let nx = (p.x - v.x) / (v.rx * v.rx);
    let ny = (p.y - v.y) / (v.ry * v.ry);
    let nz = (p.z - v.z) / (v.rz * v.rz);
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl;
    ny /= nl;
    nz /= nl;
    const k = 2 * (d.x * nx + d.y * ny + d.z * nz);
    const rx = d.x - k * nx;
    const ry = d.y - k * ny;
    const rz = d.z - k * nz;
    const yaw = yawOf(rx, rz) + rng.range(-0.3, 0.3);
    const pitch = Math.max(-0.15, Math.min(0.6, Math.asin(Math.max(-1, Math.min(1, ry))) + rng.range(-0.05, 0.25)));
    return aimDir({ yaw, pitch });
  }

  /**
   * What the first-person reticle is on: the first creature along the exact
   * aim ray (no spread, no side effects), else where the ray meets the ice,
   * sea or the end of the range. Null in classic mode (aim null). For the
   * crosshair, the AWP laser and the bot-free target readout.
   */
  aimTrace(player: Player): AimTrace | null {
    if (!player.aim) return null;
    const o = player.eye();
    const d = aimDir(player.aim);
    const lim = this.rayLimit(o, d);
    const h = this.rayHits(o, d, lim.t, null)[0];
    const t = h ? h.t : lim.t;
    const point = { x: o.x + d.x * t, y: o.y + d.y * t, z: o.z + d.z * t };
    return { enemy: h?.enemy ?? null, part: h?.part ?? null, from: o, point, dist: t, ground: h ? undefined : lim.ground };
  }

  /** First creature the hunter's current gun line would hit (no spread), for the bot. */
  lineTarget(player: Player): Enemy | null {
    const o = player.muzzle();
    let best: Enemy | null = null;
    let bx = -Infinity;
    for (const e of this.world.enemies) {
      if (!e.alive || e.left > o.x) continue;
      const yEff = viewHeightAt(o.y, o.z, e.z);
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
    if (player.aim) {
      this.throwAimed(player, weapon, player.aim);
      return;
    }
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

  /** First-person throw along the aim heading; pitch shapes the arc (AIMED_THROW). */
  private throwAimed(player: Player, weapon: Weapon, aim: Aim): void {
    player.stats.shots++;
    this.world.events.emit('shot', { playerId: player.id, weapon: weapon.id, muzzle: player.aimMuzzle(), paths: [] });
    const T = AIMED_THROW;
    const h = headingDir(aim.yaw);
    const base = Math.atan2(GRENADE_THROW.vy, -GRENADE_THROW.vx);
    const elev = Math.max(T.minElev, Math.min(T.maxElev, base + aim.pitch * T.pitchGain));
    const speed = Math.hypot(GRENADE_THROW.vx, GRENADE_THROW.vy) * Math.max(T.minSpeed, Math.min(T.maxSpeed, 1 + aim.pitch * T.speedGain));
    const hs = speed * Math.cos(elev);
    this.projectiles.push({
      id: PID++,
      kind: 'grenade',
      x: player.x + h.x * FP.throwForward,
      y: player.y + FP.throwHeight,
      z: player.z + h.z * FP.throwForward,
      vx: player.vx + h.x * hs,
      vy: player.vy + speed * Math.sin(elev),
      vz: player.vz + h.z * hs,
      ticks: 0,
      rot: 0,
      done: false,
      weapon,
      player,
      heading: aim.yaw,
    });
  }

  launchRound(player: Player, weapon: Weapon): void {
    if (player.aim) {
      this.launchAimed(player, weapon, player.aim);
      return;
    }
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

  /** First-person launcher round: leaves the muzzle along the aim at the classic speed. */
  private launchAimed(player: Player, weapon: Weapon, aim: Aim): void {
    const m = player.aimMuzzle();
    const d = aimDir(aim);
    const speed = -FLUNK_ROUND.vx;
    player.stats.shots++;
    this.world.events.emit('shot', { playerId: player.id, weapon: weapon.id, muzzle: m, paths: [] });
    this.projectiles.push({
      id: PID++,
      kind: 'round',
      x: m.x,
      y: Math.max(0.3, m.y),
      z: m.z,
      vx: player.vx / 2 + d.x * speed,
      vy: player.vy * 0.5 + d.y * speed,
      vz: player.vz / 2 + d.z * speed,
      ticks: 0,
      rot: 0,
      done: false,
      weapon,
      player,
      heading: aim.yaw,
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

  /**
   * A first-person grenade bouncing off a big creature from any side: the
   * velocity component into the face it entered through (the axis where it is
   * relatively farthest out of the footprint) is reflected, the rest damped,
   * like the classic bounce off the creature's right side.
   */
  private bounceOff(p: Projectile, big: Enemy): void {
    const rx = (p.x - big.x) / big.def.halfLength;
    const rz = (p.z - big.z) / big.def.halfDepth;
    if (Math.abs(rx) >= Math.abs(rz)) {
      if (Math.abs(rx) > 0.5 && rx * p.vx < 0) p.vx = -p.vx * 0.6;
      else p.vx *= 0.6;
    } else {
      if (Math.abs(rz) > 0.5 && rz * p.vz < 0) p.vz = -p.vz * 0.6;
      else p.vz *= 0.6;
    }
    p.vy = Math.abs(p.vy) * 0.6;
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
      if (p.heading === undefined) {
        p.rot += (p.kind === 'grenade' ? -14 : -4) * dt * Math.sign(p.vx || 1) * Math.min(1, Math.abs(p.vx) / 4 + 0.2);
      } else {
        // First person: the model is turned to the heading and tumbles forward.
        const hs = Math.hypot(p.vx, p.vz);
        if (hs > 0.05) p.heading = yawOf(p.vx, p.vz);
        p.rot += (p.kind === 'grenade' ? -14 : -4) * dt * Math.min(1, hs / 4 + 0.2);
      }
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
        if (big && p.heading !== undefined) {
          this.bounceOff(p, big);
        } else if (big) {
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
      if (!p.done && p.heading !== undefined && Math.abs(p.z) > 40) p.done = true;
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
