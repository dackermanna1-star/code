import type { Game } from '../game';
import type { Enemy } from './enemy';
import { chance, clamp, rand } from '../core/math';

export interface Incoming {
  enemy: Enemy;
  start: number;
  hitTime: number;
  counterable: boolean;
  feint: boolean;
  suspended: number;
}

/**
 * Coordinates enemy aggression: limited attack tokens, pincer attacks, timing, and
 * adapts to the player's habits.
 */
export class Director {
  incoming: Incoming[] = [];
  private cooldown = 0;
  maxAttackers = 1;
  aggression = 0.5;
  wave = 1;
  // player style tracking (decaying counts)
  style = { counters: 0, dodges: 0, blocks: 0, hitsTaken: 0, strikes: 0, whiffedCounters: 0 };
  lastPincer = 0;

  constructor(public game: Game) {}

  setWave(w: number) {
    this.wave = w;
    this.maxAttackers = clamp(1 + Math.floor((w - 1) / 3), 1, 4);
    this.aggression = clamp(0.45 + w * 0.035, 0.45, 0.95);
  }

  note(kind: keyof Director['style'], amount = 1) {
    this.style[kind] += amount;
  }

  /** Counter-heavy players see more unblockables and feints; dodge-heavy see delayed attacks. */
  get counterBias() {
    const s = this.style;
    const total = s.counters + s.dodges + s.blocks + 1;
    return s.counters / total;
  }
  get dodgeBias() {
    const s = this.style;
    return s.dodges / (s.counters + s.dodges + s.blocks + 1);
  }

  registerAttack(e: Enemy, hitDelay: number, counterable: boolean, feint: boolean) {
    this.cancel(e);
    const now = this.game.time;
    this.incoming.push({ enemy: e, start: now, hitTime: now + hitDelay, counterable, feint, suspended: 0 });
  }
  cancel(e: Enemy) {
    const i = this.incoming.findIndex((x) => x.enemy === e);
    if (i >= 0) this.incoming.splice(i, 1);
  }
  activeAttackers() {
    return this.game.enemies().filter((e) => e.alive && (e.state === 'attack' || e.state === 'approach')).length;
  }

  update(dt: number) {
    const g = this.game;
    const now = g.time;
    for (const s of Object.keys(this.style) as (keyof Director['style'])[]) this.style[s] *= Math.exp(-dt / 40);
    // drop stale entries
    this.incoming = this.incoming.filter((x) => x.enemy.alive && x.enemy.state === 'attack' && now < x.hitTime + 0.25);
    // suspend attacks while the player is locked in an invulnerable paired move (Arkham-style chaining)
    const p = g.player;
    const locked = p.isLocked();
    for (const inc of this.incoming) {
      const remain = inc.hitTime - now;
      if (locked && remain < 0.32 && inc.suspended < 0.9) {
        inc.enemy.holdAttack(dt);
        inc.hitTime += dt;
        inc.suspended += dt;
      } else inc.enemy.releaseHold();
    }
    if (!p.alive) return;
    this.cooldown -= dt;
    if (this.cooldown > 0) return;
    const enemies = g.enemies().filter((e) => e.alive && e.canTakeToken());
    if (enemies.length === 0) return;
    const active = this.activeAttackers();
    if (active >= this.maxAttackers) return;
    // vulnerability windows increase aggression
    const vulnerable = p.vulnerability();
    const want = this.aggression * (1 + vulnerable * 1.5);
    if (!chance(clamp(want * dt * 3.2, 0, 1))) return;
    // score candidates: closer, behind player's facing, aggression
    const scored = enemies
      .map((e) => {
        const d = e.distTo(p);
        const behind = Math.abs(p.angleTo(e)) > 1.6 ? 1.6 : 1;
        const s = e.cfg.aggression * behind * (1 / (0.5 + d * 0.25)) * rand(0.6, 1.4);
        return { e, s };
      })
      .sort((a, b) => b.s - a.s);
    const first = scored[0].e;
    first.grantToken(0);
    let count = 1;
    // pincer: coordinated second attacker timed to land with the first
    const pincerChance = clamp(0.08 + this.wave * 0.03 + this.counterBias * 0.15, 0, 0.55);
    if (scored.length > 1 && active + 1 < this.maxAttackers && now - this.lastPincer > 4 && chance(pincerChance)) {
      scored[1].e.grantToken(rand(0.05, 0.25));
      this.lastPincer = now;
      count++;
    }
    this.cooldown = rand(0.35, 1.2) / (0.6 + this.aggression) + count * 0.2;
  }

  /** Earliest counterable incoming attack within the window. */
  findCounterable(window = 0.95): Incoming | null {
    const now = this.game.time;
    let best: Incoming | null = null;
    for (const inc of this.incoming) {
      if (!inc.counterable) continue;
      const remain = inc.hitTime - now;
      if (remain < -0.06 || now - inc.start > window + 0.6) continue;
      if (!best || inc.hitTime < best.hitTime) best = inc;
    }
    return best;
  }
  /** Any incoming attack (incl. unblockable) landing soon. */
  imminent(within = 0.3): Incoming | null {
    const now = this.game.time;
    let best: Incoming | null = null;
    for (const inc of this.incoming) {
      const remain = inc.hitTime - now;
      if (remain > -0.05 && remain < within && (!best || inc.hitTime < best.hitTime)) best = inc;
    }
    return best;
  }
}
