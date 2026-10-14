// One chapter: the spawn schedule (a crescendo: built when the chapter starts
// from a rising intensity curve, surges later on), the boarding queue, the
// boss (Big Dave, The Marathon, The Riot Squad) and the mop-up after it.
import { BOSS_ALONE_TIMEOUT, KIND_FROM, PACKS, RAMP, RIOT_SQUAD_Z, type ChapterDef, type SpawnKind } from '../config/chapters';
import { LANE_MAX_Z, LANE_MIN_Z, TICK_RATE } from '../config/world';
import { BOSS_BOUNTY, MARATHON, ZOMBIES } from '../config/zombies';
import type { World } from './World';
import type { Zombie } from './Zombie';

/** One scheduled spawn (tick of the spawn phase). */
export interface ScheduledSpawn {
  kind: SpawnKind;
  at: number;
}

/** Inverse CDF of the ramp density ∝ a + b·u on [0, 1]. */
export function rampInverse(q: number, a = RAMP.base, b = RAMP.slope): number {
  if (b <= 1e-9) return q;
  const c = q * (a + b / 2);
  return (-a + Math.sqrt(a * a + 2 * b * c)) / b;
}

export class Chapter {
  readonly def: ChapterDef;
  /** Ticks since the spawn phase started. */
  ticks = 0;
  readonly spawnTicks: number;
  started = false;
  bossesSpawned = false;
  /** The pier is clear: the chapter is won (set by the world). */
  finished = false;
  /** Bosses beaten; the stragglers still on the deck are being mopped up. */
  mopUp = false;
  /** Zombies alive when the mop-up began (the HUD's bar). */
  mopUpMax = 0;
  bosses: Zombie[] = [];
  /** Survivors aboard. */
  boarded = 0;
  /** Debug: bring the boss on now, ignoring "boss alone". */
  forceBoss = false;
  /** Tests / previews: no spawns and no boss. */
  quiet = false;
  /** The spawn phase's schedule (sorted by tick), built at start(). */
  queue: ScheduledSpawn[] = [];
  private next = 0;
  private escort: Array<{ kind: SpawnKind; gap: number; at: number }> = [];
  private marathon = { spawned: 0, nextAt: 0, side: 1 };

  constructor(private world: World, def: ChapterDef) {
    this.def = def;
    this.spawnTicks = Math.round(def.spawnSeconds * TICK_RATE);
  }

  /** Debug: end the spawn phase now (pending spawns are dropped). */
  skipSpawns(): void {
    this.ticks = Math.max(this.ticks, this.spawnTicks);
    this.next = this.queue.length;
  }

  /** Number of zombies scheduled (informative). */
  get scheduled(): number {
    return this.def.spawns.reduce((a, [, n]) => a + n, 0);
  }

  start(): void {
    this.started = true;
    this.queue = this.quiet ? [] : this.buildSchedule();
    this.next = 0;
  }

  /** Fraction of the spawn phase elapsed. */
  get progress(): number {
    return Math.min(1, this.ticks / this.spawnTicks);
  }

  /**
   * Every spawn of the phase: each kind's n spawns sit at the ramp's
   * quantiles (jittered within their slot), later kinds only from their
   * KIND_FROM fraction; from PACKS.from on, runs of a kind bunch into packs
   * (centred on their mean time) more and more often.
   */
  private buildSchedule(): ScheduledSpawn[] {
    const rng = this.world.rng;
    const T = this.spawnTicks;
    const out: ScheduledSpawn[] = [];
    for (const [kind, n] of this.def.spawns) {
      if (n <= 0) continue;
      const u0 = this.def.from?.[kind] ?? KIND_FROM[kind] ?? 0;
      const us: number[] = [];
      for (let i = 0; i < n; i++) {
        const q = Math.max(0, Math.min(1, (i + 0.5 + rng.range(-RAMP.jitter, RAMP.jitter)) / n));
        us.push(u0 + (1 - u0) * rampInverse(q));
      }
      us.sort((a, b) => a - b);
      const pack = PACKS[kind];
      for (let i = 0; i < us.length; ) {
        const u = us[i];
        if (pack && u >= pack.from && i + 1 < us.length) {
          const f = (u - pack.from) / Math.max(1e-6, 1 - pack.from);
          if (rng.chance(pack.chance[0] + (pack.chance[1] - pack.chance[0]) * f)) {
            const size = Math.min(us.length - i, rng.int(pack.size[0], pack.size[1]));
            let mean = 0;
            for (let k = 0; k < size; k++) mean += us[i + k];
            mean /= size;
            let at = Math.round(mean * T);
            for (let k = 0; k < size; k++) {
              out.push({ kind, at: Math.min(T, at) });
              at += Math.max(1, Math.round(rng.range(pack.gap[0], pack.gap[1]) * TICK_RATE));
            }
            i += size;
            continue;
          }
        }
        out.push({ kind, at: Math.min(T, Math.round(u * T)) });
        i++;
      }
    }
    // Stable: equal ticks keep the kinds' order.
    return out.map((e, i) => ({ e, i })).sort((a, b) => a.e.at - b.e.at || a.i - b.i).map((x) => x.e);
  }

  tick(): void {
    if (!this.started || this.finished || this.quiet) return;
    const w = this.world;
    while (this.next < this.queue.length && this.queue[this.next].at <= this.ticks) {
      w.spawnKind(this.queue[this.next].kind);
      this.next++;
    }
    this.ticks++;

    // Boarding queue: survivors walk up the gangway as the spawn phase runs.
    const b = Math.min(this.def.passengers, Math.floor(this.def.passengers * this.progress));
    while (this.boarded < b) {
      this.boarded++;
      w.events.emit('boarding', { boarded: this.boarded, total: this.def.passengers });
    }

    if (!this.bossesSpawned) {
      if (this.ticks >= this.spawnTicks && this.next >= this.queue.length) {
        const clear = w.zombies.every((z) => !z.alive);
        const waited = this.ticks - this.spawnTicks >= BOSS_ALONE_TIMEOUT * TICK_RATE;
        if (this.forceBoss || !this.def.bossAlone || clear || waited) this.spawnBosses();
      }
      return;
    }
    if (this.mopUp) return;

    if (this.def.boss === 'marathon') this.marathonTick();
    for (const e of this.escort) {
      if (this.ticks >= e.at) {
        w.spawnKind(e.kind);
        e.at = this.ticks + Math.round(w.rng.range(0.6, 1.4) * e.gap * TICK_RATE);
      }
    }
  }

  /** Every boss is down (marathon: all 40 out and down). */
  get bossesBeaten(): boolean {
    if (!this.bossesSpawned) return false;
    const allOut = this.def.boss !== 'marathon' || this.marathon.spawned >= MARATHON.total;
    return allOut && this.bosses.every((z) => z.dead || z.removed);
  }

  /** Bosses beaten with zombies still alive: no more escorts, mop them up. */
  startMopUp(left: number): void {
    this.mopUp = true;
    this.mopUpMax = left;
    this.escort = [];
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
        this.marathon = { spawned: 0, nextAt: this.ticks, side: w.rng.chance(0.5) ? 1 : -1 };
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

  /**
   * The Marathon comes in pace groups: 4–6 runners bunched in one or two
   * neighbouring lanes, alternating between the near and the far half of the
   * deck, a group every MARATHON.groupEvery s. The 40th wears the gold medal.
   */
  private marathonTick(): void {
    const w = this.world;
    const m = this.marathon;
    if (m.spawned >= MARATHON.total || this.ticks < m.nextAt) return;
    let n = Math.min(w.rng.int(MARATHON.group[0], MARATHON.group[1]), MARATHON.total - m.spawned);
    // Don't leave a straggler group of one or two.
    if (MARATHON.total - m.spawned - n < MARATHON.group[0] - 1) n = MARATHON.total - m.spawned;
    m.side = -m.side;
    const s = MARATHON.laneSpread;
    const centre = m.side > 0 ? w.rng.range(s, LANE_MAX_Z - s) : w.rng.range(LANE_MIN_Z + s, -s);
    for (let i = 0; i < n; i++) {
      const z = Math.max(LANE_MIN_Z, Math.min(LANE_MAX_Z, centre + w.rng.range(-s, s)));
      m.spawned++;
      const medal = m.spawned === MARATHON.total;
      const x = w.spawnXFor(z, ZOMBIES.jogger.halfLength) - i * w.rng.range(0.5, 0.9);
      const zb = w.spawn('jogger', x, z, { boss: true, medal });
      zb.speed = w.rng.range(MARATHON.pace[0], MARATHON.pace[1]);
      zb.bounty = medal ? BOSS_BOUNTY.marathonMedal : MARATHON.bounty;
      this.bosses.push(zb);
    }
    m.nextAt = this.ticks + Math.round(MARATHON.groupEvery * TICK_RATE);
  }
}
