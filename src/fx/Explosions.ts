import { G } from '../core/G';
import { clamp } from '../core/math';

export interface ExplodeOpts {
  source: 'player' | 'zombie' | 'env';
  structures?: boolean;
  player?: boolean;
  gore?: number;
  big?: boolean;
  fire?: boolean;
  weapon?: string;
  /** Scales ragdoll launch force. */
  force?: number;
  /** Self-damage multiplier when the player is the source. */
  selfMul?: number;
}

/** Orchestrates an explosion: visuals, audio, shake, damage and ragdoll blast. */
export class Explosions {
  count = 0;

  explode(x: number, y: number, z: number, radius: number, damage: number, o: ExplodeOpts) {
    this.count++;
    G.fx.explosionVisual(x, y, z, radius, o.big);
    G.audio?.explosion(x, y, z, radius);
    const pl = G.player;
    if (pl) {
      const d = Math.hypot(pl.pos.x - x, pl.pos.y + 1 - y, pl.pos.z - z);
      const shake = clamp(1.25 * (1 - d / (radius * 6)), 0, 0.9);
      pl.addTrauma(shake);
      G.postKick?.(clamp(1 - d / (radius * 5), 0, 1));
      if (o.player !== false && d < radius) {
        const f = 1 - d / radius;
        const mul = o.source === 'player' ? (o.selfMul ?? 0.35) : 1;
        pl.damage(damage * f * mul * 0.9, { x, y, z } as any);
      }
    }
    G.zombies.explode(x, y, z, radius, damage, o.gore ?? 0.6, o.weapon ?? 'explosion');
    G.ragdolls.blast(x, y, z, radius * 1.35, (o.force ?? 1) * (4 + radius * 0.8), o.big ? 22 : 14);
    if (o.structures) G.structures?.explosionDamage(x, z, radius, damage);
    if (o.fire) G.fx.addFirePatch(x, z, radius * 0.45, 6, 10, o.weapon ?? 'fire');
  }
}
