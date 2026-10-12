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
}

export class Bot {
  private target: Enemy | null = null;
  private retargetIn = 0;
  private aimNoise = 0;
  private hesitate = 0;
  private readonly skill: number;
  private readonly buyList: WeaponId[];
  private readonly homeX: number;

  constructor(private player: Player, opts: BotOptions = {}) {
    this.skill = opts.skill ?? 0.85;
    this.buyList = opts.buyList ?? ['magnum', 'mp5', 'mac10', 'm4', 'minigun'];
    this.homeX = opts.homeX ?? -1.1;
  }

  /** Seconds until the creature reaches the hunter (smaller = more urgent). */
  private eta(e: Enemy): number {
    const p = this.player;
    if (!e.alive || e.x > p.x + 0.3) return Infinity;
    if (e.canLeave && e.type !== 'walrus') return Infinity; // fleeing activist, let him go
    if (e instanceof Seal && e.crawling) return Infinity; // comes to us and gets kicked
    const v = Math.max(0.4, e.vx);
    let t = (p.x - e.x) / v;
    t += Math.abs(this.aimZ(e) - p.z) / 6;
    if (e.isBoss) t -= 1;
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
    const lane = e.z - (best.cy - (this.player.y + PLAYER.muzzleHeight)) / TAN_PITCH;
    // Lead targets that change lanes (zig-zaggers, gliding penguins).
    return lane + (e.type === 'penguin' ? e.vz * 0.15 : 0);
  }

  think(world: World): void {
    const p = this.player;
    const inp = p.input;
    inp.left = inp.right = inp.up = inp.down = inp.fire = inp.jump = false;
    if (!p.alive || world.gameEnded) return;

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
    if (line && !(line.canLeave && line.type !== 'walrus') && !(line instanceof Seal && line.crawling && line.x > p.x - 3)) {
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
