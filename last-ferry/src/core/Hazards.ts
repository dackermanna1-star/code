// Fire & gas (DESIGN §5) and explosions (cannon shells, gas, falling crates).
import { HUNTER, TICK } from '../config/world';
import { BARRICADE, BLAST, FEEL, FIRE, GAS } from '../config/rules';
import type { FireZoneView, GasView } from './api';
import type { ExplosionKind } from './events';
import type { Player } from './Player';
import type { World } from './World';
import type { Zombie } from './Zombie';

export class GasCloud implements GasView {
  readonly max: number;
  done = false;
  constructor(
    readonly id: number,
    public x: number,
    public z: number,
    public radius: number,
    public ttl: number,
    readonly owner: Player | null,
  ) {
    this.max = ttl;
  }
}

export class FireZone implements FireZoneView {
  readonly max: number;
  done = false;
  constructor(
    readonly id: number,
    public x: number,
    public z: number,
    public radius: number,
    public ttl: number,
    readonly owner: Player | null,
  ) {
    this.max = ttl;
  }
}

export interface ExplosionOpts {
  /** Inner fraction of the radius that tears bodies apart (default BLAST.gibInner; 1 = everything). */
  gibInner?: number;
  /** Set everything in the radius on fire (gas explosions). */
  ignite?: boolean;
  /** Collect kills here (nice shots for cannon strikes / crane drops). */
  kills?: Zombie[];
}

export class Hazards {
  gas: GasCloud[] = [];
  fires: FireZone[] = [];

  constructor(private world: World) {}

  addGas(x: number, z: number, radius: number, seconds: number, owner: Player | null): GasCloud {
    const g = new GasCloud(this.world.nextId('fx'), x, z, radius, seconds, owner);
    this.gas.push(g);
    this.world.events.emit('gas', { id: g.id, x, z, radius, ttl: seconds });
    return g;
  }

  addFire(x: number, z: number, owner: Player | null, radius = FIRE.deckRadius, seconds = FIRE.deckSeconds): FireZone {
    const f = new FireZone(this.world.nextId('fx'), x, z, radius, seconds, owner);
    this.fires.push(f);
    this.world.events.emit('fireZone', { id: f.id, x, z, radius, ttl: seconds });
    // Whatever is already lying there catches fire straight away.
    this.world.bodies.forEachNear(x, z, radius, (c) => this.world.bodies.ignite(c, owner));
    return f;
  }

  /** Fire touched a gas cloud: it goes up (kills collected into `kills`). */
  ignite(g: GasCloud, by: Player | null, kills?: Zombie[]): void {
    if (g.done) return;
    g.done = true;
    g.ttl = 0;
    explode(this.world, g.x, 0.8, g.z, Math.max(GAS.explosionRadius, g.radius + 1), GAS.explosionDamage, 'gas', by ?? g.owner, {
      ignite: true,
      kills,
    });
  }

  /** Set a cloud off and pay the one who lit it for what the blast takes with it (a nice shot for 3+). */
  igniteAndReward(g: GasCloud, by: Player | null): void {
    const kills: Zombie[] = [];
    this.ignite(g, by, kills);
    const owner = by ?? g.owner;
    if (owner) this.world.combat.reward(owner, kills, 'gas');
  }

  /** First gas cloud containing (x, z) (with a margin), if any. */
  gasAt(x: number, z: number, margin = 0): GasCloud | null {
    for (const g of this.gas) {
      if (!g.done && Math.hypot(x - g.x, z - g.z) < g.radius + margin) return g;
    }
    return null;
  }

  tick(): void {
    const w = this.world;
    // Gas: the hunter chokes; fire inside it sets it off.
    for (const g of this.gas) {
      if (g.done) continue;
      g.ttl -= TICK;
      if (g.ttl <= 0) {
        g.done = true;
        continue;
      }
      for (const p of w.players) {
        if (p.alive && Math.hypot(p.x - g.x, p.z - g.z) < g.radius * 0.92) p.hurtOverTime(GAS.hunterDps * TICK, 'gas');
      }
      let fire: Player | null | undefined;
      for (const zb of w.zombies) {
        if (zb.alive && zb.burning > 0 && Math.hypot(zb.x - g.x, zb.z - g.z) < g.radius) {
          fire = zb.burnBy;
          break;
        }
      }
      if (fire === undefined) {
        for (const f of this.fires) {
          if (!f.done && Math.hypot(f.x - g.x, f.z - g.z) < g.radius + f.radius * 0.5) {
            fire = f.owner;
            break;
          }
        }
      }
      if (fire === undefined) {
        w.bodies.forEachNear(g.x, g.z, g.radius, (c) => {
          if (fire === undefined && c.burning > 0) fire = c.burnBy;
        });
      }
      if (fire !== undefined) this.igniteAndReward(g, fire);
    }
    // Deck fires: ignite whatever walks through or lies in them; scorch the hunter.
    for (const f of this.fires) {
      if (f.done) continue;
      f.ttl -= TICK;
      if (f.ttl <= 0) {
        f.done = true;
        continue;
      }
      for (const zb of w.zombies) {
        if (!zb.alive || zb.burning > 0) continue;
        if (Math.hypot(zb.x - f.x, zb.z - f.z) < f.radius + zb.def.halfDepth * 0.5) zb.ignite(f.owner);
      }
      if (w.tick % 10 === 0) w.bodies.forEachNear(f.x, f.z, f.radius, (c) => w.bodies.ignite(c, f.owner));
      for (const p of w.players) {
        if (p.alive && p.y < 0.3 && Math.hypot(p.x - f.x, p.z - f.z) < f.radius * 0.8) p.hurtOverTime(FIRE.hunterDps * TICK, 'fire');
      }
    }
    // Burning zombies spread fire to their neighbours.
    const p = 1 - Math.pow(1 - FIRE.spreadPerSecond, TICK);
    const zs = w.zombies;
    for (let i = 0; i < zs.length; i++) {
      const a = zs[i];
      if (!a.alive || a.burning <= 0) continue;
      w.forEachZombieNear(a.x, a.z, FIRE.spreadRadius, (b) => {
        if (b === a || !b.alive || b.burning > 0) return;
        if (Math.hypot(b.x - a.x, b.z - a.z) < FIRE.spreadRadius && w.rng.chance(p)) b.ignite(a.burnBy);
      });
      // A burning zombie walking over bodies sets the pile alight.
      if (w.tick % 5 === 0) {
        w.bodies.forEachNear(a.x, a.z, FIRE.corpseRadius * 0.8, (c) => {
          if (w.rng.chance(1 - Math.pow(1 - FIRE.corpsePerSecond, TICK * 5))) w.bodies.ignite(c, a.burnBy);
        });
      }
    }
    this.compact();
  }

  /** Drop spent clouds and fires from the lists. */
  compact(): void {
    if (this.gas.some((g) => g.done)) this.gas = this.gas.filter((g) => !g.done);
    if (this.fires.some((f) => f.done)) this.fires = this.fires.filter((f) => !f.done);
  }

  /** Shake amount for an explosion of `radius` at distance d from the hunter. */
  static shakeFor(radius: number, d: number): number {
    return Math.min(1, (FEEL.blastShakeK * radius) / (1 + d / FEEL.blastShakeFalloff));
  }
}

/**
 * Immediate explosion: damage with linear falloff (100% at the centre, 40% at
 * the edge), gibs near the centre, shoves survivors and bodies, makes downed
 * bodies permanent, blows apart permanent ones near the centre, hurts the hunter.
 */
export function explode(
  world: World,
  x: number,
  y: number,
  z: number,
  radius: number,
  damage: number,
  kind: ExplosionKind,
  owner: Player | null,
  opts: ExplosionOpts = {},
): Zombie[] {
  world.events.emit('explosion', { x, y, z, radius, kind });
  let near = Infinity;
  for (const p of world.players) if (p.alive) near = Math.min(near, Math.hypot(p.x - x, p.z - z));
  world.events.emit('shake', { amount: Hazards.shakeFor(radius, near) });
  const gibInner = opts.gibInner ?? BLAST.gibInner;
  const src = kind === 'gas' ? 'blast' : kind === 'cannon' ? 'cannon' : 'crates';
  const drowned: Zombie[] = [];
  for (const zb of world.zombies) {
    if (!zb.alive) continue;
    const dx = zb.x - x;
    const dz = zb.z - z;
    const d = Math.max(0, Math.hypot(dx, dz) - zb.def.halfLength * 0.5);
    if (d > radius) continue;
    const l = Math.hypot(dx, dz) || 1;
    const k = 1 - d / radius;
    const dmg = damage * (0.4 + 0.6 * k);
    zb.damage({
      damage: dmg,
      part: 'body',
      point: { x: zb.x, y: zb.height * 0.45, z: zb.z },
      dirX: dx / l,
      dirZ: dz / l,
      source: src,
      player: owner,
      weapon: null,
      gib: d < radius * gibInner,
    });
    if (opts.ignite) zb.ignite(owner);
    if (zb.life > 0 && !zb.isBoss) {
      const s = BLAST.zombieShove * k;
      if (zb.shove((dx / l) * s, (dz / l) * s)) drowned.push(zb);
    }
  }
  for (const zb of drowned) {
    zb.lastHit = { damage: zb.life, part: 'body', point: { x: zb.x, y: 0, z: zb.z }, dirX: 0, dirZ: Math.sign(zb.z), source: 'sea', player: owner, weapon: null };
    zb.life = 0;
  }
  // Bodies: permanent ones near the centre are blown apart, the rest are shoved (≤ 2 m).
  const bodies: Array<[import('./Corpses').Corpse, number]> = [];
  world.bodies.forEachNear(x, z, radius, (c, d) => bodies.push([c, d]));
  for (const [c, d] of bodies) {
    world.bodies.makePermanent(c, 'blast');
    if (d < radius * gibInner * 0.6 && kind !== 'gas') {
      world.bodies.remove(c, 'gib');
      continue;
    }
    const l = d || 1;
    const s = BARRICADE.blastShove * (1 - d / radius);
    const ux = d > 0.01 ? (c.x - x) / l : world.rng.range(-1, 1);
    const uz = d > 0.01 ? (c.z - z) / l : world.rng.range(-1, 1);
    world.bodies.shove(c, ux * s, uz * s);
    if (opts.ignite && !c.removed) world.bodies.ignite(c, owner);
  }
  // The hunter.
  for (const p of world.players) {
    if (!p.alive) continue;
    const d = Math.hypot(p.x - x, p.z - z) - HUNTER.halfWidth;
    if (d > radius) continue;
    const dmg = Math.min(BLAST.hunterMax, damage * (0.4 + 0.6 * (1 - Math.max(0, d) / radius)) * BLAST.hunterShare);
    p.hurt(dmg, 'blast', x, z);
  }
  const kills = world.resolveDeaths();
  if (opts.kills) opts.kills.push(...kills);
  // Gas clouds caught in the blast (a bloater it just burst included) go up too.
  if (kind !== 'crates') {
    for (const g of [...world.hazards.gas]) {
      if (!g.done && Math.hypot(g.x - x, g.z - z) < radius + g.radius * 0.5) world.hazards.ignite(g, owner, opts.kills);
    }
  }
  return kills;
}
