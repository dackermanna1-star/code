/**
 * Runs natural disasters. Placing one of the spawner blocks (tornado, volcano, tsunami,
 * earthquake, asteroid) removes the block and starts that disaster there; see kit.ts for the
 * Disaster interface and shared helpers. Disasters are transient (not saved).
 */
import type { Game } from '../game';
import type { GameSystem } from '../systems';
import type { World } from '../../world/world';
import { addBehavior } from '../../world/blocks/behaviors';
import { ITEM_BY_NAME } from '../items/registry';
import { DISASTERS, DisasterFx, relightStep, clearRelight, type Disaster } from './kit';
import { SetFlags } from '../../world/world';
import './tornado';
import './earthquake';
import './volcano';
import './tsunami';
import './asteroid';

export const DISASTER_BLOCKS = ['tornado', 'earthquake', 'volcano', 'tsunami', 'asteroid'] as const;
const MAX_ACTIVE = 4;

export class DisasterSystem implements GameSystem {
  readonly name = 'disasters';
  readonly active: Disaster[] = [];
  readonly effects = new DisasterFx();
  private game!: Game;

  init(game: Game) {
    this.game = game;
    (game as any).disasters = this;
    for (const name of DISASTER_BLOCKS) {
      const it = ITEM_BY_NAME.get(name);
      if (it) it.category = 'disasters' as any;
      addBehavior(name, {
        onPlace: (world: World, x: number, y: number, z: number) => {
          if (world !== this.game.world) return;
          // start on the next tick (not inside the placement call)
          queueMicrotask(() => this.start(name, x, y, z));
        },
      });
    }
  }

  start(name: string, x: number, y: number, z: number): Disaster | null {
    const g = this.game;
    const factory = DISASTERS.get(name);
    g.world.setBlock(x, y, z, 0, SetFlags.MODIFY);
    if (!factory) {
      g.message?.(`${name}: not available yet`, '#ff8080');
      return null;
    }
    if (this.active.length >= MAX_ACTIVE) {
      g.message?.('Too many disasters at once. Let one finish first.', '#ff8080');
      return null;
    }
    const yaw = g.player?.yaw ?? 0;
    const lx = -Math.sin(yaw), lz = -Math.cos(yaw);
    const l = Math.hypot(lx, lz) || 1;
    const d = factory({ game: g, x, y, z, fx: lx / l, fz: lz / l, effects: this.effects });
    this.active.push(d);
    g.events.emit('disasterStart', { name, x, y, z });
    return d;
  }

  tick(game: Game) {
    relightStep(game, 1);
    for (let i = this.active.length - 1; i >= 0; i--) {
      const d = this.active[i];
      let alive = false;
      try {
        alive = d.tick(game);
      } catch (e) {
        console.error(`disaster ${d.name} failed`, e);
      }
      if (!alive) {
        try {
          d.dispose?.(game);
        } catch (e) {
          console.error(e);
        }
        this.active.splice(i, 1);
        game.events.emit('disasterEnd', { name: d.name });
      }
    }
  }

  update(game: Game, dt: number) {
    for (const d of this.active) {
      try {
        d.update?.(game, dt);
      } catch (e) {
        console.error(`disaster ${d.name} update failed`, e);
      }
    }
    this.effects.apply(game, dt);
  }

  onWorldChange(game: Game) {
    for (const d of this.active) d.dispose?.(game);
    this.active.length = 0;
    clearRelight();
  }
}
