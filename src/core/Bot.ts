// A simple automatic hunter, used for balance simulations and the title-screen
// attract mode. Like the original's AIPlayer it lines up with the most urgent
// creature and fires, and buys weapons from an auto-buy list.
import { PLAYER, TAN_PITCH, playerXLimit } from '../config/constants';
import { WEAPONS, type WeaponId } from '../config/weapons';
import type { Enemy } from './Enemy';
import type { Player } from './Player';
import type { World } from './World';
import { Activist, Seal } from './enemies';

export interface BotOptions {
  /** 0..1 — lower skill aims sloppier and reacts later. */
  skill?: number;
  buyList?: WeaponId[];
  homeX?: number;
  /** Only engage creatures within this distance (a human doesn't snipe at the far edge). */
  maxRange?: number;
  /**
   * Teammates: the band of lanes (z range) this bot keeps, like the original
   * AIPlayer's "keep" side of the field. Creatures outside it are lower priority.
   */
  zone?: [number, number];
  /** Teammates: what the bot says when the hunt starts (speech balloons). */
  greeting?: string[];
  /** Ticks before the first line. */
  sayDelay?: number;
}

/** The original AIPlayer's auto-buy list. */
export const TEAMMATE_BUY_LIST: WeaponId[] = ['magnum', 'mac10', 'm4', 'minigun'];

export class Bot {
  private target: Enemy | null = null;
  private retargetIn = 0;
  private aimNoise = 0;
  private hesitate = 0;
  private readonly skill: number;
  private readonly buyList: WeaponId[];
  private readonly homeX: number;
  private readonly maxRange: number;
  private readonly zone: [number, number] | null;
  private greeting: string[];
  private sayIn = 0;

  constructor(private player: Player, opts: BotOptions = {}) {
    this.maxRange = opts.maxRange ?? Infinity;
    this.zone = opts.zone ?? null;
    this.greeting = opts.greeting ? [...opts.greeting] : [];
    this.sayIn = opts.sayDelay ?? 0;
    this.skill = opts.skill ?? 0.85;
    this.buyList = opts.buyList ?? ['magnum', 'mp5', 'mac10', 'm4', 'minigun'];
    this.homeX = opts.homeX ?? -1.1;
  }

  /** Seconds until the creature reaches the hunter (smaller = more urgent). */
  private eta(e: Enemy): number {
    const p = this.player;
    if (!e.alive || e.x > p.x + 0.3) return Infinity;
    // Out of engagement range — unless it is about to get past us, or a boss.
    if (!e.isBoss && p.x - e.x > this.maxRange && e.x < p.x - 6) return Infinity;
    if (e.canLeave && e.type !== 'walrus') return Infinity; // fleeing activist, let him go
    if (e instanceof Seal && e.crawling) return Infinity; // comes to us and gets kicked
    const v = Math.max(0.4, e.vx);
    let t = (p.x - e.x) / v;
    t += Math.abs(this.aimZ(e) - p.z) / 6;
    if (e.isBoss) t -= 1;
    if (this.zone) {
      // Someone else keeps the other lanes: only help out when it gets urgent.
      const z = e.z;
      const out = z < this.zone[0] ? this.zone[0] - z : z > this.zone[1] ? z - this.zone[1] : 0;
      t += out * 1.6;
    }
    return t;
  }

  /** Lane where the gun line crosses the chosen part of the creature. */
  private aimZ(e: Enemy): number {
    const shapes = e.shapes();
    let best = shapes[0];
    for (const s of shapes) {
      if (s.part === 'shell' || s.part === 'cub') continue;
      if (s.part === 'head' && e.maxLife < 200) {
        best = s;
        break;
      }
      if (s.a * s.b > best.a * best.b || best.part === 'shell') best = s;
    }
    if (e instanceof Activist && e.hasCub) best = shapes.find((s) => s.part === 'body') ?? best;
    if (e.type === 'turtle') best = shapes.find((s) => s.part === 'head') ?? best;
    if (e.type === 'walrus') {
      // Stand ~2 m off its lane: out of reach of the bite, but the tall body
      // still crosses our gun line (view-consistent hit band).
      const side = e.z > 0 ? -1 : 1;
      return e.z + side * 2.1;
    }
    const lane = e.z - (best.cy - (this.player.y + PLAYER.muzzleHeight)) / TAN_PITCH;
    // Lead targets that change lanes (zig-zaggers, gliding penguins).
    return lane + (e.type === 'penguin' ? e.vz * 0.15 : 0);
  }

  think(world: World): void {
    const p = this.player;
    const inp = p.input;
    inp.left = inp.right = inp.up = inp.down = inp.fire = inp.jump = false;
    if (!p.alive || world.gameEnded) return;

    // Chatter (original: "Hey <names> let's kill them all!", "I'm going to keep ... side").
    if (this.greeting.length && --this.sayIn <= 0) {
      world.events.emit('say', { playerId: p.id, text: this.greeting.shift()! });
      this.sayIn = 150;
    }

    for (const id of this.buyList) {
      if (!p.has(id)) {
        if (p.money >= WEAPONS[id].price) p.buy(id);
        break;
      }
    }

    // Target selection with hysteresis.
    if (--this.retargetIn <= 0 || !this.target?.alive || this.target.canLeave) {
      let best: Enemy | null = null;
      let bt = Infinity;
      for (const e of world.enemies) {
        const t = this.eta(e);
        if (t < bt) {
          bt = t;
          best = e;
        }
      }
      const cur = this.target && this.target.alive ? this.eta(this.target) : Infinity;
      if (!best || cur === Infinity || bt < cur - 1.5) {
        if (best !== this.target) {
          this.hesitate = Math.round((1 - this.skill) * 18);
          this.aimNoise = (world.rng.next() - 0.5) * (1 - this.skill) * 1.2;
        }
        this.target = best;
      }
      this.retargetIn = 10;
    }

    // Walrus: get out of its lane when it charges.
    let dodge = 0;
    for (const e of world.enemies) {
      if (e.type === 'walrus' && e.alive && (e.state === 'charge' || e.state === 'rush')) {
        const dz = p.z - e.z;
        if (Math.abs(dz) < e.def.halfDepth + 1.4) dodge = dz >= 0 ? 1 : -1;
        if (p.z > 12 && dodge > 0) dodge = -1;
        if (p.z < -12 && dodge < 0) dodge = 1;
      }
    }

    // Horizontal position: hold home near the right edge.
    // homeX <= 0 means: this far inside the right frame edge at our depth.
    let wantX = this.homeX > 0 ? this.homeX : playerXLimit(p.z) + this.homeX;
    for (const e of world.enemies) {
      if (!e.alive || !e.def.canPress) continue;
      if (Math.abs(e.z - p.z) < e.def.halfDepth + 0.8 && e.x < p.x && p.x - e.x < e.def.halfLength + 2.5) {
        wantX = Math.min(playerXLimit(p.z), p.x + 3);
      }
    }
    if (p.x < wantX - 0.6) inp.right = true;
    else if (p.x > wantX + 0.6) inp.left = true;

    // Fire whenever the gun line crosses a creature worth shooting.
    const line = world.combat.lineTarget(p);
    if (
      line &&
      (line.isBoss || p.x - line.x <= this.maxRange) &&
      !(line.canLeave && line.type !== 'walrus') &&
      !(line instanceof Seal && line.crawling && line.x > p.x - 3)
    ) {
      inp.fire = true;
    }

    if (dodge !== 0) {
      if (dodge > 0) inp.down = true;
      else inp.up = true;
      return;
    }
    if (this.hesitate > 0) {
      this.hesitate--;
      return;
    }
    const t = this.target;
    if (!t) {
      if (p.weapon.bullets < p.weapon.def.clip) p.reload();
      return;
    }
    const dz = this.aimZ(t) + this.aimNoise - p.z;
    const stop = Math.abs(p.vz) * 0.12; // anticipate sliding
    if (dz > 0.12 + stop) inp.down = true;
    else if (dz < -0.12 - stop) inp.up = true;
  }
}

/**
 * Bots for a world's computer-controlled teammates. Like the original's
 * AIPlayer each keeps one side of the field (the lanes are split between the
 * bots; with a single bot it keeps the bottom side, the original default),
 * buys from the AI auto-buy list and greets the others.
 */
export function createTeammateBots(world: World, skill = 0.85): Bot[] {
  const bots = world.players.filter((p) => p.isBot);
  const n = bots.length;
  if (!n) return [];
  const z0 = world.laneMin;
  const z1 = world.laneMax;
  const sides = n === 1 ? ['bottom'] : n === 2 ? ['top', 'bottom'] : ['top', 'middle', 'bottom'];
  const homes = [12, 9.5, 14];
  return bots.map((p, i) => {
    // Bands with a little overlap; a single bot takes the bottom half.
    const lo = n === 1 ? (z0 + z1) / 2 : z0 + ((z1 - z0) * i) / n;
    const hi = n === 1 ? z1 : z0 + ((z1 - z0) * (i + 1)) / n;
    const others = world.players.filter((q) => q !== p).map((q) => q.name);
    const greeting = [`I'm going to keep the ${sides[i]} of the field`];
    if (i === 0) greeting.unshift(`Hey ${others.join(', ')}, let's kill them all!`);
    return new Bot(p, {
      skill,
      buyList: TEAMMATE_BUY_LIST,
      homeX: homes[i % homes.length],
      maxRange: 26,
      zone: [lo - 0.4, hi + 0.4],
      greeting,
      sayDelay: 20 + i * 160,
    });
  });
}
