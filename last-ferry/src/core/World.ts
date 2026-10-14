// The game world: chapters, the hunter, the horde, bodies on the deck, fire
// and gas, the pier's tricks and the game flow. Pure logic: advanced by
// step() at a fixed 50 ticks per second, deterministic for a given seed.
import type { DeathKind, ZombieKind } from '../config/ids';
import { BETWEEN_SECONDS, CHAPTERS, SPLASH_SECONDS, type SpawnKind } from '../config/chapters';
import { TICK_RATE, spawnX } from '../config/world';
import { STRETCHER, ZOMBIES } from '../config/zombies';
import { BARRICADE, FAVOUR, FEEL, FIRE, MONEY } from '../config/rules';
import { chapterDamage } from '../config/weapons';
import type { WorldPhase, WorldView } from './api';
import { Chapter } from './Chapter';
import { Combat, type Projectile } from './Combat';
import { Corpse, CorpseField } from './Corpses';
import { EventBus } from './events';
import { Hazards, explode, type ExplosionOpts, type FireZone, type GasCloud } from './Hazards';
import { Pier } from './Pier';
import { Player } from './Player';
import { Rng } from './Rng';
import { Crawler, Medic, Patient, Stretcher, createZombie } from './zombies';
import type { Zombie, ZombieOpts } from './Zombie';
import type { ExplosionKind } from './events';

export interface WorldOptions {
  /** RNG seed (default 1). The app passes a fresh one per game. */
  seed?: number;
  /** Chapter to start at (1..3). */
  startChapter?: number;
  /** Starting money (debug / later-chapter starts). */
  money?: number;
  /** Testing aid: the hunter can't die and escapes don't end the game. */
  god?: boolean;
  /** No scheduled spawns and no boss (tests, previews): the field is yours to fill with spawn(). */
  quiet?: boolean;
  /** Start straight in the 'playing' phase (no first chapter splash). */
  skipSplash?: boolean;
  /** Hunter start position. */
  start?: { x: number; z: number };
}

export interface SpawnOpts extends Omit<ZombieOpts, 'x' | 'z'> {
  /** Start burning. */
  burning?: boolean;
}

export interface GameOverInfo {
  reason: 'gangway' | 'dead';
  zombieId?: number;
  kind?: ZombieKind;
  risen?: boolean;
  boss?: boolean;
}

export const SPLASH_TICKS = Math.round(SPLASH_SECONDS * TICK_RATE);
export const BETWEEN_TICKS = Math.round(BETWEEN_SECONDS * TICK_RATE);

/** Hunter start: right half of the pier, centre lane. */
export const HUNTER_START = { x: 13, z: 0.5 };

export class World implements WorldView {
  readonly events = new EventBus();
  readonly rng: Rng;
  readonly combat: Combat;
  readonly bodies: CorpseField;
  readonly hazards: Hazards;
  readonly pier: Pier;
  tick = 0;
  phase: WorldPhase = 'splash';
  phaseTicks = 0;
  chapter = 1;
  level!: Chapter;
  players: Player[] = [];
  zombies: Zombie[] = [];
  teams: Stretcher[] = [];
  god: boolean;
  readonly quiet: boolean;
  gameOverInfo: GameOverInfo | null = null;
  readonly favourRules = FAVOUR;
  private ids = { zombie: 0, corpse: 0, fx: 0, stretcher: 0 };
  /** 1 m buckets of live zombies, rebuilt each tick after they move (neighbour queries). */
  private zcells: Zombie[][] = Array.from({ length: ZG.cols * ZG.rows }, () => []);
  private zdirty: number[] = [];
  private pendingSplash = true;
  private nextGroanTick = 0;
  /** Last timeOfDay (held through game over). */
  private tod = 0;

  constructor(opts: WorldOptions = {}) {
    this.rng = new Rng(opts.seed ?? 1);
    this.god = !!opts.god;
    this.quiet = !!opts.quiet;
    this.bodies = new CorpseField(this);
    this.hazards = new Hazards(this);
    this.pier = new Pier(this);
    this.combat = new Combat(this);
    const s = opts.start ?? HUNTER_START;
    const p = new Player(this, 0, s.x, s.z);
    if (opts.money) p.money = opts.money;
    this.players.push(p);
    this.loadChapter(Math.max(1, Math.min(CHAPTERS.length, opts.startChapter ?? 1)));
    if (opts.skipSplash) {
      this.pendingSplash = false;
      this.beginPlay();
    }
  }

  // ------------------------------------------------------------------ WorldView

  get chapterName(): string {
    return this.level.def.name;
  }
  get corpses(): readonly Corpse[] {
    return this.bodies.list;
  }
  get projectiles(): readonly Projectile[] {
    return this.combat.projectiles;
  }
  get gas(): readonly GasCloud[] {
    return this.hazards.gas;
  }
  get fires(): readonly FireZone[] {
    return this.hazards.fires;
  }
  get crane() {
    return this.pier.crane;
  }
  get hornReady(): boolean {
    return this.pier.hornReady;
  }
  get favour(): number {
    return this.pier.favour;
  }
  get favourReady(): boolean {
    return this.pier.favourReady;
  }
  get craneReady(): boolean {
    return this.pier.craneReady;
  }
  get boarded(): number {
    return this.level.boarded;
  }
  get passengers(): number {
    return this.level.def.passengers;
  }
  get bossLife(): number | null {
    return this.phase === 'boss' ? this.level.bossLife : null;
  }
  get bossName(): string {
    return this.level.def.bossName;
  }
  get timeOfDay(): number {
    return this.tod;
  }

  // ------------------------------------------------------------------ helpers

  get player(): Player {
    return this.players[0];
  }
  get gameEnded(): boolean {
    return this.phase === 'gameover' || this.phase === 'victory';
  }
  /** Weapon damage multiplier this chapter. */
  get damageScale(): number {
    return chapterDamage(this.chapter);
  }
  niceShotBonus(n: number): number {
    return MONEY.niceBase * Math.max(1, n - 2) * this.chapter;
  }
  nextId(kind: 'zombie' | 'corpse' | 'fx' | 'stretcher'): number {
    return ++this.ids[kind];
  }
  spawnXFor(z: number, halfLength: number): number {
    return spawnX(z, halfLength);
  }
  zombieById(id: number): Zombie | undefined {
    return this.zombies.find((z) => z.id === id);
  }
  corpseById(id: number): Corpse | undefined {
    return this.bodies.list.find((c) => c.id === id);
  }

  /** Bodies (and the crate barricade, worth 4) just ahead of a zombie in its lane. */
  obstaclesAhead(zb: Zombie): number {
    let n = this.bodies.countAhead(zb.x + zb.def.halfLength * 0.3, zb.z);
    if (this.pier.inBarricade(zb.x, zb.z)) n += 4;
    return n;
  }

  // ------------------------------------------------------------------ flow

  private loadChapter(num: number): void {
    this.chapter = num;
    this.level = new Chapter(this, CHAPTERS[num - 1]);
    this.level.quiet = this.quiet;
    this.phase = 'splash';
    this.phaseTicks = 0;
    this.pendingSplash = true;
    this.pier.rehang();
    this.tod = this.level.def.timeOfDay[0];
  }

  private beginPlay(): void {
    this.phase = 'playing';
    this.phaseTicks = 0;
    this.level.start();
    this.events.emit('chapterStart', { num: this.chapter });
    this.events.emit('boarding', { boarded: 0, total: this.level.def.passengers });
  }

  onBossSpawn(level: Chapter): void {
    this.phase = 'boss';
    this.phaseTicks = 0;
    this.events.emit('bossSpawn', { num: level.def.num, name: level.def.bossName });
  }

  /** Advance one logic tick (1/50 s). */
  step(): void {
    if (this.gameEnded) return;
    if (this.pendingSplash) {
      this.pendingSplash = false;
      const d = this.level.def;
      this.events.emit('chapterSplash', { num: d.num, name: d.name, clock: d.clock });
    }
    this.tick++;
    this.phaseTicks++;

    if (this.phase === 'splash' && this.phaseTicks >= SPLASH_TICKS) this.beginPlay();
    else if (this.phase === 'between' && this.phaseTicks >= BETWEEN_TICKS) {
      if (this.chapter >= CHAPTERS.length) {
        this.phase = 'victory';
        this.tod = 1;
        this.events.emit('victory', {});
        return;
      }
      this.loadChapter(this.chapter + 1);
    }
    if (this.phase === 'playing' || this.phase === 'boss') this.level.tick();

    for (const p of this.players) p.tick();
    for (const t of this.teams) t.tick();
    const n = this.zombies.length;
    for (let i = 0; i < n; i++) {
      this.zombies[i].tick();
      if (this.gameEnded) return;
    }
    this.rebuildZombieGrid();
    this.combat.tick();
    this.hazards.tick();
    this.bodies.tick();
    this.pier.tick();
    this.resolveDeaths();
    if (this.gameEnded) return;

    this.zombies = this.zombies.filter((z) => !z.removed);
    this.bodies.compact();
    this.hazards.compact();
    if (this.teams.length) this.teams = this.teams.filter((t) => !t.dropped && t.members.length > 0);

    if (this.phase === 'boss' && this.level.finished) {
      this.phase = 'between';
      this.phaseTicks = 0;
      this.events.emit('chapterComplete', { num: this.chapter });
    }
    this.updateTimeOfDay();
  }

  private updateTimeOfDay(): void {
    const [a, b] = this.level.def.timeOfDay;
    switch (this.phase) {
      case 'splash':
        this.tod = a;
        break;
      case 'playing':
        this.tod = a + (b - a) * this.level.progress;
        break;
      case 'boss':
        this.tod = b;
        break;
      case 'between': {
        const next = CHAPTERS[this.chapter]?.timeOfDay[0] ?? b;
        this.tod = b + (next - b) * Math.min(1, this.phaseTicks / BETWEEN_TICKS);
        break;
      }
      default:
        break;
    }
  }

  private rebuildZombieGrid(): void {
    for (const i of this.zdirty) this.zcells[i].length = 0;
    this.zdirty.length = 0;
    for (const z of this.zombies) {
      if (z.dead || z.removed) continue;
      const i = zcell(z.x, z.z);
      if (!this.zcells[i].length) this.zdirty.push(i);
      this.zcells[i].push(z);
    }
  }

  /**
   * Live zombies whose position is within the square |dx|, |dz| <= r of (x, z)
   * (from this tick's bucket grid; positions may have moved slightly since).
   */
  forEachZombieNear(x: number, z: number, r: number, fn: (zb: Zombie) => void): void {
    const c0 = zcol(x - r);
    const c1 = zcol(x + r);
    const r0 = zrow(z - r);
    const r1 = zrow(z + r);
    for (let rr = r0; rr <= r1; rr++) {
      for (let cc = c0; cc <= c1; cc++) {
        const cell = this.zcells[rr * ZG.cols + cc];
        for (let k = 0; k < cell.length; k++) {
          const zb = cell[k];
          if (!zb.dead && Math.abs(zb.x - x) <= r && Math.abs(zb.z - z) <= r) fn(zb);
        }
      }
    }
  }

  /** Kill whatever lost all its life. Returns the newly dead. */
  resolveDeaths(): Zombie[] {
    const out: Zombie[] = [];
    for (let i = 0; i < this.zombies.length; i++) {
      const z = this.zombies[i];
      if (!z.dead && !z.removed && z.life <= 0) {
        z.die();
        out.push(z);
      }
    }
    return out;
  }

  // ------------------------------------------------------------------ zombies

  /** Add a zombie of `kind` (debug / tests / chapter spawns). x defaults to just off the left edge. */
  spawn(kind: ZombieKind, x?: number, z?: number, opts: SpawnOpts = {}): Zombie {
    const zb = createZombie(this, kind, { ...opts, x, z });
    this.addZombie(zb);
    if (opts.burning) zb.ignite(null);
    return zb;
  }

  private addZombie(zb: Zombie): void {
    this.zombies.push(zb);
    this.events.emit('spawn', { zombieId: zb.id, kind: zb.kind, boss: zb.isBoss, risen: zb.risen });
  }

  /** A paramedic team: two medics carrying a patient on a stretcher. */
  spawnTeam(x?: number, z?: number): Stretcher {
    const zz = z ?? this.rng.range(-4.2, 4.2);
    const cx = x ?? spawnX(zz, 0) - STRETCHER.medicOffset - 0.5;
    const off = STRETCHER.medicOffset;
    const front = new Medic(this, { x: cx + off, z: zz });
    const back = new Medic(this, { x: cx - off, z: zz });
    const patient = new Patient(this, { x: cx, z: zz });
    const team = new Stretcher(this, cx, zz, front, back, patient);
    front.join(team, 'front');
    back.join(team, 'back');
    patient.join(team);
    this.teams.push(team);
    this.addZombie(front);
    this.addZombie(back);
    this.addZombie(patient);
    return team;
  }

  /** One spawn from a chapter's schedule. */
  spawnKind(kind: SpawnKind): void {
    if (kind === 'medics') this.spawnTeam();
    else this.spawn(kind);
  }

  /** A crawler (risen) spilling out of a bloater / Big Dave. */
  spawnCrawler(kind: ZombieKind, x: number, z: number, look: number): Zombie {
    const zb = new Crawler(this, kind, { x, z, look });
    this.addZombie(zb);
    return zb;
  }

  zombieEscaped(zb: Zombie): void {
    if (this.god) {
      zb.removed = true;
      if (zb.grabbing) zb.releaseGrab();
      return;
    }
    this.gameOver('gangway', zb);
  }

  groan(zb: Zombie): void {
    if (this.tick < this.nextGroanTick) return;
    this.nextGroanTick = this.tick + 12;
    this.events.emit('groan', { zombieId: zb.id, x: zb.x, z: zb.z, kind: zb.kind });
  }

  // ------------------------------------------------------------------ deaths & bodies

  /** The body a dying zombie leaves (null for gibs, pops and drownings). */
  corpseFor(zb: Zombie, kind: DeathKind): Corpse | null {
    if (kind === 'gib' || kind === 'pop' || kind === 'drown') return null;
    const h = zb.lastHit;
    let px = 0;
    let pz = 0;
    if (h?.push) {
      px = h.push.x;
      pz = h.push.z;
    } else if (h) {
      const force = h.damage + Math.max(0, -zb.life);
      const k = Math.min(BARRICADE.pushMax, 0.15 + force / 250);
      px = h.dirX * k;
      pz = h.dirZ * k * 0.5;
    }
    // Runners keep going for a step.
    if (zb.state === 'run' || zb.state === 'burn') px += 0.5;
    const len = Math.hypot(px, pz);
    const maxPush = h?.source === 'harpoon' ? 2.5 : BARRICADE.pushMax;
    if (len > maxPush) {
      px *= maxPush / len;
      pz *= maxPush / len;
    }
    const c = new Corpse(this.nextId('corpse'), zb, kind, zb.x, zb.z);
    c.nails = zb.nails;
    if (kind === 'down' && zb.def.rises && !zb.risen) {
      const [a, b] = this.level.def.riseDelay;
      c.risesAt = this.tick + Math.round(this.rng.range(a, b) * TICK_RATE);
    }
    if (kind === 'burn') {
      c.burning = FIRE.corpseAshSeconds;
      c.burnBy = zb.burnBy;
    }
    this.bodies.add(c, zb.x + px, zb.z + pz);
    return c;
  }

  /** Bounty, statistics, Favour, streaks, feel (called from Zombie.die after the death event). */
  onZombieKilled(zb: Zombie, kind: DeathKind, killer: Player | null): void {
    const c = zb.corpseId !== null ? this.corpseById(zb.corpseId) : undefined;
    if (c && c.burning > 0) this.events.emit('ignite', { zombieId: null, corpseId: c.id, x: c.x, z: c.z });
    if (zb.isBoss && (zb.kind === 'bigdave' || zb.medal || zb.kind === 'riot')) {
      this.events.emit('slowmo', { scale: FEEL.bossSlowmo.scale, seconds: FEEL.bossSlowmo.seconds });
    }
    const p = killer ?? this.players[0] ?? null;
    if (!p) return;
    p.kills++;
    p.stats.kills++;
    p.stats.killsByKind[zb.kind] = (p.stats.killsByKind[zb.kind] ?? 0) + 1;
    const wid = zb.lastHit?.weapon ?? 'other';
    p.stats.killsByWeapon[wid] = (p.stats.killsByWeapon[wid] ?? 0) + 1;
    const top = zb.height + 0.35;
    p.earn(zb.bounty, 'bounty', zb.x, top, zb.z);
    let fav = FAVOUR.kill;
    if (kind === 'headshot' || kind === 'headoff') {
      p.earn(MONEY.headshotBonus, 'headshot', zb.x, top + 0.4, zb.z);
      fav += FAVOUR.headshot;
      p.headStreak++;
      if (p.headStreak >= 3) this.events.emit('headshotStreak', { playerId: p.id, n: p.headStreak });
      this.events.emit('hitstop', { ms: FEEL.hitstopHeadshot });
    } else {
      p.headStreak = 0;
    }
    this.pier.addFavour(fav);
  }

  /** A downed body gets up as a crawler. */
  riseCorpse(c: Corpse): Zombie {
    this.bodies.remove(c, null);
    const zb = new Crawler(this, c.kind, { x: c.x, z: c.z, look: c.look });
    zb.nails = c.nails;
    this.zombies.push(zb);
    this.events.emit('corpseRise', { corpseId: c.id, zombieId: zb.id });
    this.events.emit('spawn', { zombieId: zb.id, kind: zb.kind, boss: false, risen: true });
    return zb;
  }

  /** Immediate explosion (see Hazards.explode). */
  explode(x: number, y: number, z: number, radius: number, damage: number, kind: ExplosionKind, owner: Player | null, opts: ExplosionOpts = {}): Zombie[] {
    return explode(this, x, y, z, radius, damage, kind, owner, opts);
  }

  // ------------------------------------------------------------------ the end

  onPlayerDeath(_p: Player): void {
    if (this.players.every((p) => !p.alive)) this.gameOver('dead');
  }

  gameOver(reason: 'gangway' | 'dead', zb?: Zombie): void {
    if (this.gameEnded || this.god) return;
    this.phase = 'gameover';
    this.gameOverInfo = { reason, zombieId: zb?.id, kind: zb?.kind, risen: zb?.risen, boss: zb?.isBoss };
    this.events.emit('gameOver', { reason, zombieId: zb?.id });
  }

  /** One line for the game-over screen. */
  describeGameOver(): string {
    const g = this.gameOverInfo;
    if (!g) return '';
    if (g.reason === 'dead') return 'The Bosun went down. No one boards dead.';
    if (g.risen) return 'A body you left lying crawled up the gangway. Not dead till the head’s gone.';
    switch (g.kind) {
      case 'jogger':
        return g.boss ? 'A marathon runner crossed the finish line: the gangway.' : 'A jogger in a race bib sprinted up the gangway.';
      case 'bloater':
        return 'A bloater squeezed onto the gangway. Nobody is boarding now.';
      case 'medic':
      case 'patient':
        return 'The paramedics wheeled their patient aboard.';
      case 'riot':
        return 'A riot brute shoved his way past the queue.';
      case 'bigdave':
        return 'Big Dave reached the gangway. The ferry is listing.';
      default:
        return 'A shambler in a Hawaiian shirt made it up the gangway.';
    }
  }

  // ------------------------------------------------------------------ debug / testing

  /** Debug: end the spawn phase now and bring the chapter's boss on next tick. */
  skipToBoss(): void {
    if (this.gameEnded) return;
    if (this.phase === 'splash') {
      this.pendingSplash = false;
      this.beginPlay();
    }
    if (this.phase !== 'playing') return;
    this.level.skipSpawns();
    this.level.forceBoss = true;
  }

  /** Debug: remove every zombie silently (presentation drops removed ones). */
  clearZombies(): void {
    for (const z of this.zombies) {
      if (z.grabbing) z.releaseGrab();
      z.removed = true;
    }
    this.zombies = [];
    this.teams = [];
  }

  /** Debug / tests: lay a body on the deck. `risesIn` seconds (null = permanent). */
  addCorpse(kind: ZombieKind, x: number, z: number, opts: { risesIn?: number | null; deathKind?: DeathKind; look?: number } = {}): Corpse {
    const src = { id: 0, kind, look: opts.look ?? this.rng.int(0, 0x7fffffff), facing: 1, risen: false, isBoss: false };
    const c = new Corpse(this.nextId('corpse'), src, opts.deathKind ?? 'down', x, z);
    const r = opts.risesIn === undefined ? 10 : opts.risesIn;
    if (r !== null) c.risesAt = this.tick + Math.round(r * TICK_RATE);
    this.bodies.add(c, x, z);
    return c;
  }

  /** Debug: set the Captain's Favour. */
  setFavour(v: number): void {
    this.pier.favour = 0;
    this.pier.addFavour(v);
  }

  /** Life of a kind in the current chapter (UI, tests). */
  lifeOf(kind: ZombieKind): number {
    const d = ZOMBIES[kind];
    return d.life + d.lifeInc * (this.chapter - 1);
  }
}

/** Zombie bucket grid (1 m cells; x and z clamped into range). */
const ZG = { minX: -40, minZ: -9, cell: 1, cols: 72, rows: 18 };
const zcol = (x: number) => Math.max(0, Math.min(ZG.cols - 1, Math.floor((x - ZG.minX) / ZG.cell)));
const zrow = (z: number) => Math.max(0, Math.min(ZG.rows - 1, Math.floor((z - ZG.minZ) / ZG.cell)));
const zcell = (x: number, z: number) => zrow(z) * ZG.cols + zcol(x);
