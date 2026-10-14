// One chapter: spawn scheduling (Seal Hunter's: each kind's count spread over
// the spawn phase with random gaps between ½ and 1× the average gap), the
// boarding queue, and the boss (Big Dave, The Marathon, The Riot Squad).
import { BOSS_ALONE_TIMEOUT, PACKS, RIOT_SQUAD_Z, type ChapterDef, type SpawnKind } from '../config/chapters';
import { LANE_MAX_Z, LANE_MIN_Z, TICK_RATE } from '../config/world';
import { BOSS_BOUNTY, MARATHON, ZOMBIES } from '../config/zombies';
import type { World } from './World';
import type { Zombie } from './Zombie';

interface SpawnTrack {
  kind: SpawnKind;
  togo: number;
  at: number;
}

export class Chapter {
  readonly def: ChapterDef;
  /** Ticks since the spawn phase started. */
  ticks = 0;
  readonly spawnTicks: number;
  started = false;
  bossesSpawned = false;
  /** Bosses dead: the chapter is won. */
  finished = false;
  bosses: Zombie[] = [];
  /** Survivors aboard. */
  boarded = 0;
  /** Debug: bring the boss on now, ignoring "boss alone". */
  forceBoss = false;
  /** Tests / previews: no spawns and no boss. */
  quiet = false;
  private tracks: SpawnTrack[];
  private escort: Array<{ kind: SpawnKind; gap: number; at: number }> = [];
  private marathon = { spawned: 0, nextAt: 0 };
  /** Pack members still to arrive. */
  private pending: Array<{ kind: SpawnKind; at: number }> = [];

  constructor(private world: World, def: ChapterDef) {
    this.def = def;
    this.spawnTicks = Math.round(def.spawnSeconds * TICK_RATE);
    this.tracks = def.spawns.map(([kind, n]) => ({ kind, togo: n, at: -1 }));
  }

  /** Debug: end the spawn phase now (pending spawns are dropped). */
  skipSpawns(): void {
    this.ticks = Math.max(this.ticks, this.spawnTicks);
    for (const t of this.tracks) {
      t.togo = 0;
      t.at = -1;
    }
    this.pending = [];
  }

  /** Number of zombies scheduled (informative). */
  get scheduled(): number {
    return this.def.spawns.reduce((a, [, n]) => a + n, 0);
  }

  start(): void {
    this.started = true;
    for (const t of this.tracks) this.schedule(t);
  }

  /** Fraction of the spawn phase elapsed. */
  get progress(): number {
    return Math.min(1, this.ticks / this.spawnTicks);
  }

  private schedule(t: SpawnTrack): void {
    if (t.togo <= 0) {
      t.at = -1;
      return;
    }
    const rng = this.world.rng;
    const left = Math.max(this.spawnTicks - this.ticks, 0);
    const gap = Math.floor(left / t.togo);
    t.at = this.ticks + 1 + rng.int(Math.floor(gap / 2), gap);
    t.togo--;
  }

  tick(): void {
    if (!this.started || this.finished || this.quiet) return;
    const w = this.world;
    for (const t of this.tracks) {
      if (this.ticks !== t.at) continue;
      w.spawnKind(t.kind);
      const pack = PACKS[t.kind];
      if (pack && t.togo > 0 && w.rng.chance(pack.chance)) {
        const extra = Math.min(t.togo, w.rng.int(pack.size[0], pack.size[1]) - 1);
        let at = this.ticks;
        for (let k = 0; k < extra; k++) {
          at += Math.max(1, Math.round(w.rng.range(pack.gap[0], pack.gap[1]) * TICK_RATE));
          this.pending.push({ kind: t.kind, at });
        }
        t.togo -= extra;
      }
      this.schedule(t);
    }
    if (this.pending.length) {
      for (const p of this.pending) if (p.at <= this.ticks) w.spawnKind(p.kind);
      this.pending = this.pending.filter((p) => p.at > this.ticks);
    }
    this.ticks++;

    // Boarding queue: survivors walk up the gangway as the spawn phase runs.
    const b = Math.min(this.def.passengers, Math.floor(this.def.passengers * this.progress));
    while (this.boarded < b) {
      this.boarded++;
      w.events.emit('boarding', { boarded: this.boarded, total: this.def.passengers });
    }

    if (!this.bossesSpawned) {
      if (this.ticks >= this.spawnTicks && this.tracks.every((t) => t.at < 0) && !this.pending.length) {
        const clear = w.zombies.every((z) => !z.alive);
        const waited = this.ticks - this.spawnTicks >= BOSS_ALONE_TIMEOUT * TICK_RATE;
        if (this.forceBoss || !this.def.bossAlone || clear || waited) this.spawnBosses();
      }
      return;
    }

    if (this.def.boss === 'marathon') this.marathonTick();
    for (const e of this.escort) {
      if (this.ticks >= e.at) {
        w.spawnKind(e.kind);
        e.at = this.ticks + Math.round(w.rng.range(0.6, 1.4) * e.gap * TICK_RATE);
      }
    }
    const allOut = this.def.boss !== 'marathon' || this.marathon.spawned >= MARATHON.total;
    if (allOut && this.bosses.every((z) => z.dead || z.removed)) {
      this.finished = true;
    }
  }

  /** Remaining boss life 0..1 (unspawned marathon runners count as full). */
  get bossLife(): number {
    let cur = 0;
    let max = 0;
    for (const z of this.bosses) {
      cur += z.dead ? 0 : Math.max(0, z.life);
      max += z.maxLife;
    }
    if (this.def.boss === 'marathon') {
      const left = MARATHON.total - this.marathon.spawned;
      const life = ZOMBIES.jogger.life + ZOMBIES.jogger.lifeInc * (this.def.num - 1);
      cur += left * life;
      max += left * life;
    }
    return max > 0 ? cur / max : 0;
  }

  /** Bosses still to beat (marathon: runners left). */
  get bossesLeft(): number {
    const alive = this.bosses.filter((z) => !z.dead && !z.removed).length;
    return this.def.boss === 'marathon' ? alive + MARATHON.total - this.marathon.spawned : alive;
  }

  private spawnBosses(): void {
    const w = this.world;
    this.bossesSpawned = true;
    // Boarding is complete when the boss arrives.
    while (this.boarded < this.def.passengers) {
      this.boarded++;
      w.events.emit('boarding', { boarded: this.boarded, total: this.def.passengers });
    }
    switch (this.def.boss) {
      case 'bigdave': {
        const z = w.rng.range(-2.5, 2.5);
        this.bosses.push(w.spawn('bigdave', undefined, z, { boss: true }));
        break;
      }
      case 'marathon':
        this.marathon = { spawned: 0, nextAt: this.ticks };
        break;
      case 'riotsquad':
        for (const z of RIOT_SQUAD_Z) {
          this.bosses.push(w.spawn('riot', w.spawnXFor(z, ZOMBIES.riot.halfLength) - w.rng.range(0, 0.6), z, { boss: true }));
        }
        break;
    }
    for (const [kind, gap] of this.def.bossEscort) {
      this.escort.push({ kind, gap, at: this.ticks + Math.round(gap * TICK_RATE) });
    }
    w.onBossSpawn(this);
  }

  private marathonTick(): void {
    const w = this.world;
    const m = this.marathon;
    if (m.spawned >= MARATHON.total || this.ticks < m.nextAt) return;
    const n = Math.min(MARATHON.perWave, MARATHON.total - m.spawned);
    const band = (LANE_MAX_Z - LANE_MIN_Z) / n;
    // Shuffle lane slots so each wave arrives ragged.
    const slots = Array.from({ length: n }, (_, i) => i);
    for (let i = slots.length - 1; i > 0; i--) {
      const j = w.rng.int(0, i);
      [slots[i], slots[j]] = [slots[j], slots[i]];
    }
    for (let i = 0; i < n; i++) {
      const z = LANE_MIN_Z + (slots[i] + 0.5) * band + w.rng.range(-0.25, 0.25);
      m.spawned++;
      const medal = m.spawned === MARATHON.total;
      const x = w.spawnXFor(z, ZOMBIES.jogger.halfLength) - i * 0.45 - w.rng.range(0, 1.2);
      const zb = w.spawn('jogger', x, z, { boss: true, medal });
      zb.speed = w.rng.range(MARATHON.pace[0], MARATHON.pace[1]);
      zb.bounty = medal ? BOSS_BOUNTY.marathonMedal : MARATHON.bounty;
      this.bosses.push(zb);
    }
    m.nextAt = this.ticks + Math.round(MARATHON.waveEvery * TICK_RATE);
  }
}
