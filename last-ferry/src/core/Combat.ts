// Shooting. Bullets are hitscan along the hunter's lane, fired to the left.
// The hit test is Seal Hunter's view-consistent rule: a bullet at height y in
// lane z0 is tested against each zombie's side silhouette at the height where
// the tracer visually crosses that zombie on screen (viewHeightAt), so what
// looks like a hit is a hit — heads, bodies, legs, riot plates, the stretcher,
// low crawlers, downed bodies (nails) and the crane's hook block alike.
import type { WeaponId } from '../config/ids';
import { CRANE, GRAVITY, TICK, leftEdgeX } from '../config/world';
import { FLARE, HARPOON, OUTBOARD, WEAPONS, chapterDamage, spreadToYaw, type WeaponDef } from '../config/weapons';
import { CAMERA_POS, viewHeightAt } from '../config/view';
import { CANNON, FEEL, KNOCKBACK_STAGGER, REANIMATION } from '../config/rules';
import type { ProjectileView } from './api';
import type { BulletPath, NiceSource, ProjectileEndReason, V3 } from './events';
import type { Corpse } from './Corpses';
import { explode } from './Hazards';
import type { Player } from './Player';
import type { Weapon } from './Weapon';
import type { World } from './World';
import type { HitShape, Zombie } from './Zombie';

/** Hit tolerance added to every silhouette. */
const EDGE = 0.02;
/** Lying bodies: half length along x and height (nails, harpoon). */
const BODY_HALF = 0.8;
const BODY_TOP = 0.3;

/**
 * Something on a gun line. `x` is where it is hit (on its own depth plane);
 * `lx` is the point on the gun line that appears at the same pixel (the
 * tracer ends there, and the line meets things in order of `lx`).
 */
type Target =
  | { t: 'zombie'; x: number; lx: number; y: number; zb: Zombie; shape: HitShape }
  | { t: 'corpse'; x: number; lx: number; y: number; c: Corpse }
  | { t: 'hook'; x: number; lx: number; y: number };

/** x on the gun line (lane zRay) that projects onto the same pixel as x on the plane at depth zc. */
function lineX(x: number, zRay: number, zc: number): number {
  return CAMERA_POS.x + ((x - CAMERA_POS.x) * (zRay - CAMERA_POS.z)) / (zc - CAMERA_POS.z);
}

export class Projectile implements ProjectileView {
  done = false;
  /** Seconds in flight. */
  age = 0;
  /** Flare fired while lined up with the crane's hook: it flies over the crowd in the drop square to the hook. */
  hookShot = false;
  constructor(
    readonly id: number,
    readonly kind: 'flare' | 'shell',
    public x: number,
    public y: number,
    public z: number,
    public vx: number,
    public vy: number,
    public vz: number,
    readonly owner: Player | null,
    readonly weapon: WeaponId | null,
    /** Shell: where it lands, and its kill list (nice shot for the whole strike). */
    readonly target?: V3,
    readonly flight = 0,
    readonly kills?: Zombie[],
  ) {}
}

export class Combat {
  projectiles: Projectile[] = [];

  constructor(private world: World) {}

  /** A weapon discharged: resolve the shot by its mode. */
  fire(player: Player, weapon: Weapon): void {
    const def = weapon.def;
    player.stats.shots += def.pellets;
    if (def.recoil) player.vx += def.recoil;
    if (def.shake) this.world.events.emit('shake', { amount: def.shake });
    if (def.mode === 'hitscan') this.fireHitscan(player, weapon);
    else if (def.mode === 'harpoon') this.fireHarpoon(player, weapon);
    else this.fireFlare(player, weapon);
  }

  private damageOf(def: WeaponDef): number {
    return def.damage * chapterDamage(this.world.chapter);
  }

  // ------------------------------------------------------------------ hitscan

  private fireHitscan(player: Player, weapon: Weapon): void {
    const w = this.world;
    const def = weapon.def;
    const o = player.muzzle();
    let spread = def.spreadDeg;
    if (weapon.id === 'outboard') spread += OUTBOARD.hotSpread * weapon.heat;
    const maxYaw = spreadToYaw(spread);
    const paths: BulletPath[] = [];
    const struck = new Set<Zombie>();
    const kind: BulletPath['kind'] = weapon.id === 'nailgun' ? 'nail' : def.pellets > 1 ? 'pellet' : 'bullet';
    for (let i = 0; i < def.pellets; i++) {
      const yaw = maxYaw > 0 ? w.rng.range(-maxYaw, maxYaw) : 0;
      this.trace(player, weapon, o, yaw, this.damageOf(def), kind, paths, struck);
    }
    // Shotgun: everything still standing is shoved back and staggered.
    if (def.knockback > 0) {
      for (const zb of struck) {
        if (zb.alive && !zb.isBoss && zb.kind !== 'riot') zb.stagger(KNOCKBACK_STAGGER, def.knockback);
      }
    }
    const kills = w.resolveDeaths();
    w.events.emit('shot', { playerId: player.id, weapon: weapon.id, muzzle: o, paths });
    this.reward(player, kills);
  }

  /**
   * Nearest thing the line meets (zombie, nail-able body, hook), or null.
   * The hook block only counts when the shooter is lined up with it (a
   * deliberate shot: Pier.hookLined); such a shot goes over the crowd standing
   * in the drop square, so a pile-up under the pallet can't shield the hook.
   */
  private nearest(o: V3, yaw: number, opts: { corpses: boolean; hook: boolean; skip?: Set<Zombie> }): Target | null {
    const w = this.world;
    const tz = Math.tan(yaw);
    const hook = opts.hook && w.pier.hookLined(o);
    let best: Target | null = null;
    for (const zb of w.zombies) {
      if (!zb.alive || zb.left > o.x || opts.skip?.has(zb)) continue;
      if (hook && w.pier.inDropZone(zb.x, zb.z)) continue;
      const run = Math.max(0, o.x - zb.x);
      const zRay = o.z + run * tz;
      if (Math.abs(zb.z - zRay) > 3.4) continue;
      const yEff = viewHeightAt(o.y, zRay, zb.z);
      const sil = zb.silhouetteAt(yEff);
      if (!sil || sil.left > o.x + 0.3) continue;
      const hx = Math.min(sil.right + EDGE, o.x);
      const lx = Math.min(lineX(hx, zRay, zb.z), o.x);
      if (!best || lx > best.lx) best = { t: 'zombie', x: hx, lx, y: yEff, zb, shape: sil.shape };
    }
    if (opts.corpses) {
      for (const c of w.bodies.list) {
        if (!c.solid || c.x - BODY_HALF > o.x) continue;
        if (hook && w.pier.inDropZone(c.x, c.z)) continue;
        const run = Math.max(0, o.x - c.x);
        const zRay = o.z + run * tz;
        const dz = c.z - zRay;
        if (dz > 0 || dz < -2.2) continue;
        const yEff = viewHeightAt(o.y, zRay, c.z);
        if (yEff < -0.02 || yEff > BODY_TOP) continue;
        const hx = Math.min(c.x + BODY_HALF, o.x);
        const lx = Math.min(lineX(hx, zRay, c.z), o.x);
        if (!best || lx > best.lx) best = { t: 'corpse', x: hx, lx, y: Math.max(0.05, yEff), c };
      }
    }
    if (hook) {
      const zRay = o.z + Math.max(0, o.x - CRANE.hookX) * tz;
      const hx = Math.min(CRANE.hookX + CRANE.hookHalfX, o.x);
      const lx = Math.min(lineX(hx, zRay, CRANE.hookZ), o.x);
      if (!best || lx > best.lx) best = { t: 'hook', x: hx, lx, y: CRANE.hookCY };
    }
    return best;
  }

  /** Point on the bullet's own path at x (where the tracer appears to stop on screen). */
  private rayPoint(o: V3, yaw: number, x: number): V3 {
    const run = Math.max(0, o.x - x);
    return { x, y: o.y, z: o.z + run * Math.tan(yaw) };
  }

  private farEnd(o: V3, yaw: number): V3 {
    const zFar = o.z + (o.x + 30) * Math.tan(yaw);
    return this.rayPoint(o, yaw, leftEdgeX(Math.max(-8, Math.min(8, zFar))) - 3);
  }

  private trace(player: Player, weapon: Weapon, o: V3, yaw: number, dmg: number, kind: BulletPath['kind'], paths: BulletPath[], struck: Set<Zombie>): void {
    const w = this.world;
    const dirX = -Math.cos(yaw);
    const dirZ = Math.sin(yaw);
    const hit = this.nearest(o, yaw, { corpses: kind === 'nail', hook: true });
    if (!hit) {
      paths.push({ from: { ...o }, to: this.farEnd(o, yaw), kind });
      return;
    }
    const end = this.rayPoint(o, yaw, hit.lx);
    const path: BulletPath = { from: { ...o }, to: end, kind };
    paths.push(path);
    if (hit.t === 'hook') {
      w.pier.cutRope(player);
      return;
    }
    if (hit.t === 'corpse') {
      const c = hit.c;
      const point = { x: hit.x - w.rng.range(0, 0.25), y: hit.y, z: c.z };
      c.nails++;
      w.events.emit('nail', { zombieId: null, corpseId: c.id, point });
      if (c.downed && ++c.pinNails >= REANIMATION.nailsToPin) {
        w.bodies.makePermanent(c, 'nailed');
        player.stats.nailed++;
      }
      return;
    }
    const zb = hit.zb;
    const part = hit.shape.part;
    const point: V3 = { x: hit.x - w.rng.range(0, 0.08), y: hit.y, z: zb.z };
    player.stats.hits++;
    if (part === 'stretcher') {
      // Solid boards: the round stops, nobody cares.
      w.events.emit('hit', { zombieId: zb.id, kind: zb.kind, part, point, dirX, dirZ, damage: 0, bullet: true, playerId: player.id, weapon: weapon.id });
      return;
    }
    const head = part === 'head';
    if (head) player.stats.headshots++;
    zb.damage({
      damage: dmg * (head ? zb.def.headMult : 1),
      part,
      shape: hit.shape,
      point,
      dirX,
      dirZ,
      source: kind === 'nail' ? 'nail' : kind === 'pellet' ? 'pellet' : 'bullet',
      player,
      weapon: weapon.id,
      range: o.x - hit.x,
    });
    struck.add(zb);
    if (part === 'plate' && kind !== 'pellet' && w.rng.chance(0.35)) {
      // Glancing off the armour: a short ricochet tracer up and away.
      w.events.emit('ricochet', { zombieId: zb.id, point });
      paths.push({
        from: { ...end },
        to: { x: end.x + w.rng.range(-4, -1.5), y: end.y + w.rng.range(0.8, 2.5), z: end.z + w.rng.range(-1.5, 1.5) },
        ric: true,
        kind,
      });
    }
    if (kind === 'nail') {
      zb.nails++;
      w.events.emit('nail', { zombieId: zb.id, corpseId: null, point });
    }
  }

  // ------------------------------------------------------------------ harpoon

  private fireHarpoon(player: Player, weapon: Weapon): void {
    const w = this.world;
    const def = weapon.def;
    const o = player.muzzle();
    const dmg = this.damageOf(def);
    const skewered: number[] = [];
    const skip = new Set<Zombie>();
    let to: V3 | null = null;
    let stopX = -Infinity;
    for (let n = 0; n < HARPOON.maxSkewer + 1; n++) {
      const hit = this.nearest(o, 0, { corpses: false, hook: true, skip });
      if (!hit) break;
      if (hit.t === 'hook') {
        w.pier.cutRope(player);
        to = this.rayPoint(o, 0, hit.lx);
        stopX = hit.x;
        break;
      }
      if (hit.t !== 'zombie') break;
      const zb = hit.zb;
      skip.add(zb);
      player.stats.hits++;
      const reel = Math.max(0, Math.min(HARPOON.reel, o.x - 0.6 - zb.x));
      zb.damage({
        damage: dmg,
        part: hit.shape.part === 'stretcher' || hit.shape.part === 'plate' ? 'body' : hit.shape.part,
        point: { x: hit.x - 0.1, y: hit.y, z: zb.z },
        dirX: 1,
        dirZ: 0,
        source: 'harpoon',
        player,
        weapon: weapon.id,
        range: o.x - hit.x,
        push: { x: reel, z: 0 },
      });
      if (zb.life > 0) {
        // Too tough: the bolt sticks in it.
        to = this.rayPoint(o, 0, hit.lx - 0.15);
        stopX = hit.x;
        break;
      }
      skewered.push(zb.id);
      if (skewered.length >= HARPOON.maxSkewer) {
        to = this.rayPoint(o, 0, zb.x - zb.def.halfLength);
        stopX = zb.x - zb.def.halfLength;
        break;
      }
    }
    if (!to) {
      to = this.farEnd(o, 0);
      stopX = to.x;
    }
    // Downed bodies the cable passes over are pinned to the planks for good.
    for (const c of w.bodies.list) {
      if (!c.downed || c.x + BODY_HALF < stopX || c.x - BODY_HALF > o.x) continue;
      const yEff = viewHeightAt(o.y, o.z, c.z);
      if (c.z <= o.z && yEff >= -0.02 && yEff <= BODY_TOP) w.bodies.makePermanent(c, 'harpoon');
    }
    const kills = w.resolveDeaths();
    w.events.emit('shot', { playerId: player.id, weapon: weapon.id, muzzle: o, paths: [{ from: { ...o }, to, kind: 'harpoon' }] });
    w.events.emit('harpoon', { playerId: player.id, from: o, to, skewered, reel: HARPOON.reel });
    if (skewered.length >= 3) w.events.emit('hitstop', { ms: FEEL.hitstopKebab });
    this.reward(player, kills);
  }

  // ------------------------------------------------------------------ flare & shells

  private fireFlare(player: Player, weapon: Weapon): void {
    const w = this.world;
    const o = player.muzzle();
    const p = new Projectile(w.nextId('fx'), 'flare', o.x, o.y, o.z, -FLARE.speed + player.vx * 0.3, FLARE.vy, player.vz * 0.2, player, weapon.id);
    p.hookShot = w.pier.hookLined(o);
    this.projectiles.push(p);
    w.events.emit('shot', { playerId: player.id, weapon: weapon.id, muzzle: o, paths: [] });
    w.events.emit('projectile', { id: p.id, kind: 'flare', x: p.x, y: p.y, z: p.z, vx: p.vx, vy: p.vy, vz: p.vz });
  }

  /** The ferry's deck gun lobs a shell at `target`, landing after CANNON.flight s. */
  launchShell(owner: Player | null, target: V3, kills: Zombie[]): void {
    const w = this.world;
    const g = CANNON.gun;
    const T = CANNON.flight;
    const vx = (target.x - g.x) / T;
    const vz = (target.z - g.z) / T;
    const vy = (target.y - g.y + 0.5 * GRAVITY * T * T) / T;
    const p = new Projectile(w.nextId('fx'), 'shell', g.x, g.y, g.z, vx, vy, vz, owner, null, target, T, kills);
    this.projectiles.push(p);
    w.events.emit('projectile', { id: p.id, kind: 'shell', x: p.x, y: p.y, z: p.z, vx, vy, vz });
  }

  tick(): void {
    const w = this.world;
    for (const p of this.projectiles) {
      if (p.done) continue;
      p.age += TICK;
      if (p.kind === 'shell') {
        p.vy -= GRAVITY * TICK;
        p.x += p.vx * TICK;
        p.y += p.vy * TICK;
        p.z += p.vz * TICK;
        if (p.age >= p.flight - 1e-6) {
          const t = p.target!;
          p.x = t.x;
          p.y = 0;
          p.z = t.z;
          this.end(p, 'deck');
          explode(w, t.x, 0.3, t.z, CANNON.radius, CANNON.damage, 'cannon', p.owner, { kills: p.kills });
        }
        continue;
      }
      this.flareTick(p);
    }
    this.projectiles = this.projectiles.filter((p) => !p.done);
  }

  private end(p: Projectile, reason: ProjectileEndReason): void {
    p.done = true;
    this.world.events.emit('projectileEnd', { id: p.id, x: p.x, y: p.y, z: p.z, kind: p.kind, reason });
  }

  private flareTick(p: Projectile): void {
    const w = this.world;
    const x0 = p.x;
    p.vy -= FLARE.gravity * TICK;
    p.x += p.vx * TICK;
    p.y += p.vy * TICK;
    p.z += p.vz * TICK;
    // Zombies (view-consistent, swept along x this tick).
    let hitZb: Zombie | null = null;
    let hitShape: HitShape | null = null;
    let hx = -Infinity;
    const hookShot = p.hookShot && w.pier.crane.state === 'hanging';
    for (const zb of w.zombies) {
      if (!zb.alive || zb.left > x0 || zb.right < p.x) continue;
      if (Math.abs(zb.z - p.z) > 3.4) continue;
      if (hookShot && w.pier.inDropZone(zb.x, zb.z)) continue;
      const yEff = viewHeightAt(Math.max(0, p.y), p.z, zb.z);
      const sil = zb.silhouetteAt(yEff);
      if (!sil || sil.right + FLARE.radius < p.x || sil.left - FLARE.radius > x0) continue;
      const x = Math.min(sil.right, x0);
      if (x > hx) {
        hx = x;
        hitZb = zb;
        hitShape = sil.shape;
      }
    }
    // The crane's hook block (only a flare fired lined up with it).
    if (hookShot && x0 >= CRANE.hookX - CRANE.hookHalfX && p.x <= CRANE.hookX + CRANE.hookHalfX && CRANE.hookX + CRANE.hookHalfX > hx) {
      p.x = CRANE.hookX + CRANE.hookHalfX;
      this.end(p, 'hook');
      w.pier.cutRope(p.owner);
      return;
    }
    if (hitZb && hitShape) {
      p.x = hx;
      const owner = p.owner;
      if (owner) owner.stats.hits++;
      hitZb.damage({
        damage: this.damageOf(WEAPONS.flare),
        part: hitShape.part === 'stretcher' ? 'body' : hitShape.part,
        shape: hitShape,
        point: { x: hx, y: Math.max(0.2, viewHeightAt(Math.max(0, p.y), p.z, hitZb.z)), z: hitZb.z },
        dirX: -1,
        dirZ: 0,
        source: 'flare',
        player: owner,
        weapon: 'flare',
      });
      hitZb.ignite(owner);
      // Burning phosphorus sprays the ones around it.
      const zx = hitZb.x;
      const zz = hitZb.z;
      w.forEachZombieNear(zx, zz, FLARE.splash, (o) => {
        if (o !== hitZb && Math.hypot(o.x - zx, o.z - zz) <= FLARE.splash) o.ignite(owner);
      });
      w.bodies.forEachNear(zx, zz, FLARE.splash, (c) => w.bodies.ignite(c, owner));
      this.end(p, 'target');
      const kills = w.resolveDeaths();
      if (owner) this.reward(owner, kills);
      return;
    }
    // Through a gas cloud: boom.
    if (p.y < 2.5) {
      const g = w.hazards.gasAt(p.x, p.z, 0);
      if (g) {
        this.end(p, 'gas');
        w.hazards.igniteAndReward(g, p.owner);
        return;
      }
    }
    // The deck: a burning patch.
    if (p.y <= 0.02) {
      p.y = 0;
      this.end(p, 'deck');
      w.hazards.addFire(p.x, p.z, p.owner);
      return;
    }
    if (p.x < leftEdgeX(p.z) - 3) this.end(p, 'gone');
  }

  // ------------------------------------------------------------------ queries (bot, laser, HUD)

  /** First zombie the hunter's gun line would hit now (no spread), or null. */
  lineTarget(player: Player): Zombie | null {
    const t = this.nearest(player.muzzle(), 0, { corpses: false, hook: false });
    return t?.t === 'zombie' ? t.zb : null;
  }

  /** Where the centre line stops: zombie / body / hook / far edge, and what part (presentation laser or debug). */
  lineTrace(player: Player): { kind: 'zombie' | 'corpse' | 'hook' | 'none'; id: number | null; part: string | null; from: V3; to: V3 } {
    const o = player.muzzle();
    const t = this.nearest(o, 0, { corpses: player.weapon.id === 'nailgun', hook: true });
    if (!t) return { kind: 'none', id: null, part: null, from: o, to: this.farEnd(o, 0) };
    return {
      kind: t.t,
      id: t.t === 'zombie' ? t.zb.id : t.t === 'corpse' ? t.c.id : null,
      part: t.t === 'zombie' ? t.shape.part : null,
      from: o,
      to: this.rayPoint(o, 0, t.lx),
    };
  }

  // ------------------------------------------------------------------ rewards

  /**
   * Nice shot: 3+ kills by one trigger pull (or one crane drop, cannon strike
   * or gas explosion). Pays and fills the Favour (not for the deck gun's own
   * kills). Slow motion only for the big ones: a MASSACRE (6+) or a set piece.
   */
  reward(player: Player, kills: Zombie[], source: NiceSource = 'shot'): void {
    const n = kills.length;
    if (n < 3) return;
    const w = this.world;
    player.stats.niceShots++;
    player.stats.bestNiceShot = Math.max(player.stats.bestNiceShot, n);
    let sx = 0;
    let sz = 0;
    for (const k of kills) {
      sx += k.x;
      sz += k.z;
    }
    player.earn(w.niceShotBonus(n), 'nice', sx / n, 2.2, sz / n);
    w.events.emit('niceShot', { playerId: player.id, n, source });
    if (source !== 'cannon') w.pier.addFavour(w.favourRules.nice);
    if (n >= FEEL.massacre || source !== 'shot') w.slowmo(FEEL.niceSlowmo.scale, FEEL.niceSlowmo.seconds);
  }
}

