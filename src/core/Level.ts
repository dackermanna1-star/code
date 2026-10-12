// Spawn scheduling and boss flow, ported from the original levels.py.
import type { EnemyType } from '../config/enemies';
import type { LevelDef } from '../config/levels';
import { createEnemy } from './enemies';
import type { Enemy } from './Enemy';
import type { World } from './World';

interface SpawnTrack {
  type: EnemyType;
  togo: number;
  orig: number;
  at: number;
  straight: boolean;
}

export class Level {
  readonly def: LevelDef;
  ticks = 0;
  started = false;
  seenBosses = false;
  finished = false;
  bosses: Enemy[] = [];
  private tracks: SpawnTrack[];
  /** Total enemies scheduled (for the HUD progress, mostly informative). */
  readonly total: number;

  constructor(private world: World, def: LevelDef) {
    this.def = def;
    const extraPlayers = Math.max(0, world.players.length - 1);
    this.tracks = def.enemies.map(([type, n, o]) => {
      const togo = n + Math.floor(0.85 * n * extraPlayers);
      return { type, togo, orig: togo, at: -1, straight: !!o?.straight };
    });
    this.total = this.tracks.reduce((a, t) => a + t.togo, 0);
  }

  start(): void {
    this.started = true;
    for (const t of this.tracks) this.scheduleNext(t);
  }

  /** Fraction of the spawn phase elapsed (top bar). */
  get progress(): number {
    return Math.min(1, this.ticks / this.def.ticks);
  }

  private scheduleNext(t: SpawnTrack): void {
    const rng = this.world.rng;
    if (t.togo > 0) {
      const ttg = Math.max(this.def.ticks - this.ticks, 0);
      const bpt = Math.floor(ttg / t.togo);
      t.at = this.ticks + 1 + rng.int(Math.floor(bpt / 2), bpt);
      t.togo--;
    } else if (this.def.cheapEnemies) {
      // Turtle level: keep generating cheap enemies while the boss lives.
      const bpt = Math.floor(this.def.ticks / Math.max(1, t.orig));
      t.at = this.ticks + 1 + rng.int(bpt, bpt + Math.floor(bpt / 2));
    } else {
      t.at = -1;
    }
  }

  tick(): void {
    if (!this.started || this.finished) return;
    for (const t of this.tracks) {
      if (this.ticks !== t.at) continue;
      const e = createEnemy(this.world, t.type, { straight: t.straight });
      if (this.seenBosses && this.def.cheapEnemies) {
        e.bounty = Math.floor(e.bounty / 10);
        e.headshotBonus = Math.floor(e.headshotBonus / 10);
      }
      this.world.addEnemy(e, true);
      this.scheduleNext(t);
    }
    this.ticks++;

    if (!this.seenBosses) {
      if (this.ticks >= this.def.ticks && (!this.def.bossAlone || this.world.enemies.every((e) => !e.alive))) {
        this.spawnBosses();
      }
    } else if (this.bosses.every((b) => b.dead || b.removed)) {
      this.finished = true;
      this.world.events.emit('levelComplete', { num: this.def.num });
    }
  }

  private spawnBosses(): void {
    this.seenBosses = true;
    for (const b of this.def.bosses) {
      const e = createEnemy(this.world, b.type, { boss: true, z: b.z });
      this.bosses.push(e);
      this.world.addEnemy(e, true);
    }
    this.world.events.emit('bossSpawn', { num: this.def.num });
  }

  /** Remaining boss life fraction (top bar in boss mode). */
  get bossLife(): number {
    let cur = 0;
    let max = 0;
    for (const b of this.bosses) {
      cur += Math.max(0, b.dead ? 0 : b.life);
      max += b.maxLife;
    }
    return max > 0 ? cur / max : 0;
  }
}
