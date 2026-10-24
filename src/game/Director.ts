import * as THREE from 'three';
import { ctx } from './ctx';
import { events } from './events';
import { Character } from '../characters/Character';
import { makeAppearance } from '../characters/Appearance';
import { Brain } from '../ai/Brain';
import { ARCHETYPES, CROWD_MIX, type ArchetypeId } from '../ai/Archetypes';
import type { AIManager } from '../ai/AIManager';
import type { WeaponSystem } from '../weapons/Weapons';
import type { LevelInfo } from '../world/BarLevel';
import { weightedPick, rand, pick, chance } from '../core/math';
import { P } from '../characters/Rig';
import { PROPS } from '../world/PropDefs';

export type GameMode = 'brawl' | 'survival';

export interface DirectorHooks {
  message(title: string, sub?: string, kind?: 'info' | 'warn' | 'kill' | 'big'): void;
  killFeed(text: string, style?: string): void;
  end(won: boolean): void;
}

let seedCounter = 1;

/** Spawns NPCs, tracks objectives, runs waves and win/lose. */
export class Director {
  mode: GameMode = 'brawl';
  state: 'playing' | 'won' | 'lost' = 'playing';
  readonly npcs: Character[] = [];
  initialCount = 0;
  kills = 0;
  wave = 0;
  private waveTimer = 0;
  private waveActive = false;
  private reinforcements = 0;
  private bossWoken = false;
  startTime = 0;
  endTime = 0;
  crowdSize = 32;
  hooks: DirectorHooks | null = null;
  private lastKillTime = -10;
  multiKill = 0;
  private drinkTimer = 0;

  get levelZones() {
    return this.level.zones;
  }

  constructor(
    private ai: AIManager,
    private weapons: WeaponSystem,
    private level: LevelInfo,
    private addCharacter: (c: Character) => void,
    private removeCharacter: (c: Character) => void,
  ) {
    events.on('death', ({ victim, cause }) => this.onDeath(victim as Character, cause));
  }

  // ------------------------------------------------------------------ spawning
  spawn(arch: ArchetypeId, pos: THREE.Vector3, yaw: number, opts: { group?: number; work?: string; weapon?: string } = {}): Brain {
    const a = ARCHETYPES[arch];
    const app = makeAppearance(a.style, (Date.now() % 100000) + seedCounter++ * 7919);
    const stats = { ...a.stats };
    const ch = new Character(app, pos, yaw, stats);
    if (a.boss) {
      ch.isBoss = true;
      ch.name = a.label;
    }
    this.addCharacter(ch);
    const brain = new Brain(ch, a, this.ai, this.weapons);
    brain.group = opts.group ?? 0;
    if (opts.work) brain.workKind = opts.work as any;
    this.ai.add(brain);
    this.npcs.push(ch);
    // starting weapon
    let wid = opts.weapon;
    if (!wid && a.startWeapon) for (const sw of a.startWeapon) if (chance(sw.chance)) wid = sw.id;
    if (wid) this.giveWeapon(ch, wid);
    return brain;
  }

  giveWeapon(ch: Character, weaponId: string): void {
    const def = Object.values(PROPS).find((p) => p.weapon === weaponId);
    if (!def) return;
    const prop = ctx.props.spawn(def.id, ch.position.clone().add(new THREE.Vector3(0, 1, 0)), 0);
    this.weapons.characterPickUp(ch, prop);
  }

  clearAll(): void {
    for (const c of this.npcs.slice()) this.removeCharacter(c);
    this.npcs.length = 0;
  }

  // ------------------------------------------------------------------ modes
  startBrawl(crowd = this.crowdSize): void {
    this.mode = 'brawl';
    this.state = 'playing';
    this.kills = 0;
    this.wave = 0;
    this.reinforcements = 0;
    this.bossWoken = false;
    this.startTime = ctx.time.elapsed;
    const L = this.level;
    let group = 1;
    // staff
    for (const w of L.work) {
      let arch: ArchetypeId;
      switch (w.kind) {
        case 'bartender':
        case 'bartender2':
          arch = 'bartender';
          break;
        case 'cook':
          arch = 'cook';
          break;
        case 'bouncer':
          arch = 'bouncer';
          break;
        case 'waitress':
          arch = 'waitress';
          break;
        case 'boss':
          arch = 'boss';
          break;
        default:
          arch = 'musician';
      }
      const b = this.spawn(arch, w.pos.clone(), w.yaw, { group: w.kind === 'bouncer' ? 900 : w.kind === 'boss' ? 999 : 800, work: w.kind });
      if (arch === 'boss') {
        b.awakeBoss = false;
        // bodyguards
        for (let i = 0; i < 2; i++) this.spawn('biker', w.pos.clone().add(new THREE.Vector3(-1.2 - i * 0.9, 0, 0.9)), 0, { group: 999, weapon: pick(['tire_iron', 'chain', 'knife']) });
      }
      if (w.kind === 'guitarist') this.giveWeapon(b.ch, 'guitar');
      if (w.kind === 'waitress') this.giveWeapon(b.ch, 'tray');
    }
    // crowd: fill tables in groups
    const seatsByTable: Map<string, typeof L.seats> = new Map();
    for (const s of L.seats) {
      if (s.zone === 'vip') continue;
      const key = `${Math.round(s.pos.x / 2.5)},${Math.round(s.pos.y)},${Math.round(s.pos.z / 2.5)}`;
      if (!seatsByTable.has(key)) seatsByTable.set(key, []);
      seatsByTable.get(key)!.push(s);
    }
    const tables = [...seatsByTable.values()].sort(() => Math.random() - 0.5);
    let spawned = 0;
    for (const t of tables) {
      if (spawned >= crowd * 0.55) break;
      const n = Math.min(t.length, 1 + Math.floor(Math.random() * t.length));
      const g = group++;
      const gangArch = chance(0.3) ? 'biker' : null;
      for (let i = 0; i < n && spawned < crowd; i++) {
        const seat = t[i];
        if (seat.taken) continue;
        const arch = (gangArch && chance(0.7) ? gangArch : weightedPick(CROWD_MIX.map((m) => m[0]), CROWD_MIX.map((m) => m[1]))) as ArchetypeId;
        const b = this.spawn(arch, seat.pos.clone(), seat.yaw, { group: g });
        this.placeAtSeat(b, seat);
        spawned++;
      }
    }
    // the rest at standing spots / dancing / playing
    const spots = L.spots.filter((s) => s.kind !== 'piss' && s.kind !== 'jukebox').sort(() => Math.random() - 0.5);
    for (const sp of spots) {
      if (spawned >= crowd) break;
      if (sp.taken) continue;
      const arch = weightedPick(CROWD_MIX.map((m) => m[0]), CROWD_MIX.map((m) => m[1])) as ArchetypeId;
      const b = this.spawn(arch, sp.pos.clone(), sp.yaw, { group: sp.kind === 'pool' || sp.kind === 'darts' ? 500 + Math.floor(sp.pos.z) : group++ });
      sp.taken = b;
      (b as any).act = {
        kind: 'spot',
        spot: sp,
        pos: sp.pos.clone(),
        yaw: sp.yaw,
        until: ctx.time.elapsed + rand(15, 60),
        started: false,
        t: 0,
        patrolI: 0,
        nextGesture: ctx.time.elapsed + rand(1, 6),
      };
      b.state = 'goto';
      spawned++;
    }
    this.initialCount = this.npcs.length;
  }

  /** Show the round's opening title (called when the player takes control). */
  announce(): void {
    this.startTime = ctx.time.elapsed;
    if (this.mode === 'brawl') this.hooks?.message('THE IRON HORSE', 'Last call. Be the last one standing.', 'big');
    else this.hooks?.message('SURVIVAL', 'They keep coming. How long can you last?', 'big');
  }

  private placeAtSeat(b: Brain, seat: (typeof this.level.seats)[number]): void {
    seat.taken = b;
    b.act = {
      kind: 'sit',
      seat,
      pos: seat.pos.clone(),
      yaw: seat.yaw,
      until: ctx.time.elapsed + rand(30, 90),
      started: false,
      t: 0,
      patrolI: 0,
      nextGesture: ctx.time.elapsed + rand(1, 6),
    };
    b.state = 'goto';
  }

  startSurvival(): void {
    this.mode = 'survival';
    this.state = 'playing';
    this.kills = 0;
    this.wave = 0;
    this.startTime = ctx.time.elapsed;
    this.waveTimer = 4;
    this.waveActive = false;
    this.ai.startBrawl();
    // a few terrified regulars to start
    for (let i = 0; i < 4; i++) {
      const sp = pick(this.level.seats.filter((s) => s.zone === 'hall' && !s.taken));
      if (!sp) continue;
      const b = this.spawn(pick(['nerd', 'patron', 'drunk'] as ArchetypeId[]), sp.pos.clone(), sp.yaw, { group: 1 });
      this.placeAtSeat(b, sp);
    }
    this.initialCount = 0;
  }

  private spawnWave(): void {
    this.wave++;
    const n = Math.min(4 + this.wave * 2, 22);
    const pool: [ArchetypeId, number][] =
      this.wave < 3
        ? [
            ['patron', 4],
            ['biker', 2],
            ['punk', 2],
            ['drunk', 1],
          ]
        : this.wave < 6
          ? [
              ['biker', 4],
              ['punk', 2],
              ['brawler', 2],
              ['cowboy', 1],
              ['bouncer', 0.6],
            ]
          : [
              ['biker', 4],
              ['brawler', 3],
              ['bouncer', 1.5],
              ['punk', 1],
            ];
    const g = 2000 + this.wave;
    for (let i = 0; i < n; i++) {
      const e = this.level.entrances[i % this.level.entrances.length].clone();
      e.x += rand(-1.2, 1.2);
      e.z += rand(-0.6, 0.6);
      const arch = weightedPick(pool.map((p) => p[0]), pool.map((p) => p[1]));
      const b = this.spawn(arch, e, Math.PI, { group: g, weapon: chance(0.15 + this.wave * 0.04) ? pick(['bat', 'knife', 'chain', 'tire_iron', 'wrench', 'bottle']) : undefined });
      b.addAnger(ctx.player, 2 + Math.random());
      b.enterCombat(ctx.player);
    }
    if (this.wave % 5 === 0) {
      const b = this.spawn('boss', this.level.entrances[0].clone(), Math.PI, { group: g, weapon: 'sledgehammer' });
      b.addAnger(ctx.player, 5);
      b.enterCombat(ctx.player);
      this.hooks?.message('BIG EARL', 'The boss wants a word.', 'warn');
    }
    this.hooks?.message(`WAVE ${this.wave}`, `${n} incoming`, 'warn');
    this.ai.difficulty = this.ai.baseDifficulty * Math.min(1.6, 1 + this.wave * 0.05);
  }

  private spawnReinforcements(): void {
    this.reinforcements++;
    const n = 4 + Math.floor(Math.random() * 3);
    const g = 3000 + this.reinforcements;
    for (let i = 0; i < n; i++) {
      const e = this.level.entrances[i % 2].clone();
      e.x += rand(-1.5, 1.5);
      const b = this.spawn(chance(0.75) ? 'biker' : 'brawler', e, Math.PI, { group: g, weapon: chance(0.4) ? pick(['bat', 'chain', 'tire_iron', 'knife']) : undefined });
      b.addAnger(ctx.player, 1.5);
      b.enterCombat(ctx.player);
    }
    this.hooks?.message('BIKERS INCOMING', 'Somebody called their friends...', 'warn');
    events.emit('noise', { pos: this.level.entrances[0].clone(), radius: 40, kind: 'shout', source: null });
  }

  wakeBoss(): void {
    if (this.bossWoken) return;
    this.bossWoken = true;
    const boss = this.npcs.find((c) => c.isBoss && c.alive);
    if (!boss) return;
    const b = (boss as any).brain as Brain;
    b.awakeBoss = true;
    b.addAnger(ctx.player, 5);
    b.enterCombat(ctx.player);
    if (!boss.weapon) this.giveWeapon(boss, 'sledgehammer');
    this.hooks?.message('BIG EARL IS AWAKE', 'You broke his bar. Now he breaks you.', 'warn');
  }

  // ------------------------------------------------------------------ bookkeeping
  remaining(): number {
    let n = 0;
    for (const c of this.npcs) if (c.alive) n++;
    return n;
  }

  remainingList(): Character[] {
    return this.npcs.filter((c) => c.alive);
  }

  /** Survival: hostiles of the current wave still standing. */
  waveRemainingList(): Character[] {
    return this.npcs.filter((c) => c.alive && (((c as any).brain as Brain | undefined)?.group ?? 0) >= 2000);
  }

  waveRemaining(): number {
    return this.waveRemainingList().length;
  }

  get waveInProgress(): boolean {
    return this.waveActive;
  }

  get nextWaveIn(): number {
    return Math.max(0, this.waveTimer);
  }

  private onDeath(victim: Character, cause: string): void {
    if (victim.isPlayer as unknown as boolean) {
      if (this.state === 'playing') {
        this.state = 'lost';
        this.endTime = ctx.time.elapsed;
        ctx.timers.after(2.6, () => this.hooks?.end(false), true);
      }
      return;
    }
    if (!this.npcs.includes(victim)) return;
    const byPlayer = victim.killedBy?.isPlayer;
    if (byPlayer) {
      this.kills++;
      ctx.player.kills++;
      ctx.player.stats.kills++;
      if (ctx.player.alive) {
        ctx.player.addAdrenaline(12);
        ctx.player.heal(6);
      }
      const now = ctx.time.elapsed;
      this.multiKill = now - this.lastKillTime < 3 ? this.multiKill + 1 : 1;
      this.lastKillTime = now;
      const style = killStyle(victim, cause);
      if (style === 'HEAD POP!') ctx.player.stats.headExplosions++;
      if (style === 'DECAPITATED!') ctx.player.stats.decapitations++;
      this.hooks?.killFeed(style, cause);
      if (this.multiKill >= 2) this.hooks?.message(['', '', 'DOUBLE KO', 'TRIPLE KO', 'QUAD KO', 'RAMPAGE'][Math.min(5, this.multiKill)] || 'RAMPAGE', undefined, 'kill');
    } else {
      this.hooks?.killFeed(`${victim.name} got wrecked`, 'npc');
    }
  }

  update(dt: number): void {
    if (this.state !== 'playing') return;
    if (this.mode === 'brawl') {
      const rem = this.remaining();
      if (this.ai.brawlStarted && this.initialCount > 0) {
        const frac = 1 - rem / this.initialCount;
        if (this.reinforcements === 0 && frac > 0.3) this.spawnReinforcements();
        else if (this.reinforcements === 1 && frac > 0.6) this.spawnReinforcements();
        if (!this.bossWoken && (frac > 0.7 || ctx.player.position.y > 3.5 && ctx.player.position.z < -6)) this.wakeBoss();
      }
      if (rem === 0 && this.npcs.length > 0) {
        this.state = 'won';
        this.endTime = ctx.time.elapsed;
        ctx.time.slowMo(2.0, 0.25);
        this.hooks?.message('LAST ONE STANDING', 'The Iron Horse is closed for repairs.', 'big');
        ctx.timers.after(3.8, () => this.hooks?.end(true), true);
      }
    } else {
      // survival
      const rem = this.waveRemaining();
      if (this.waveActive && rem === 0) {
        this.waveActive = false;
        this.waveTimer = 9;
        this.hooks?.message(`WAVE ${this.wave} CLEARED`, 'Grab a drink. More are coming.', 'info');
        ctx.player.heal(25);
        this.spawnDrinks();
      }
      if (!this.waveActive) {
        this.waveTimer -= dt;
        if (this.waveTimer <= 0) {
          this.spawnWave();
          this.waveActive = true;
        }
      }
    }
    // keep the corpse/ragdoll count manageable: freeze old corpses
    this.drinkTimer -= dt;
    if (this.drinkTimer <= 0) {
      this.drinkTimer = 2;
      const dead = this.npcs.filter((c) => !c.alive && c.ragdoll && !c.ragdoll.frozen);
      if (dead.length > 28) {
        dead.sort((a, b) => a.deathTime - b.deathTime);
        for (let i = 0; i < dead.length - 28; i++) if (dead[i].ragdoll!.restTime > 2) dead[i].ragdoll!.freeze();
      }
    }
  }

  private spawnDrinks(): void {
    for (const t of this.level.taps) {
      for (let i = 0; i < 2; i++) ctx.props.spawn(pick(['mug', 'pint', 'bottle']), t.clone().add(new THREE.Vector3(0.05, 0.01, -0.3 + i * 0.6)), 0);
    }
  }
}

function killStyle(v: Character, cause: string): string {
  switch (cause) {
    case 'headExplode':
      return 'HEAD POP!';
    case 'decapitated':
      return 'DECAPITATED!';
    case 'bleed':
      return 'BLED OUT';
    case 'impact':
      return v.position.y < 1 && v.ragdoll ? 'SPLAT!' : 'WALL SLAM!';
    case 'fall':
      return 'SKYDIVER!';
    default:
      break;
  }
  const lh = v.lastAttacker;
  if (lh && (lh as any).weapon?.name) return `${String((lh as any).weapon.name).toUpperCase()} KO`;
  if (v.model.severed.some((s) => s)) return 'DISMEMBERED!';
  void P;
  return pick(['KNOCKOUT!', 'FLATTENED!', 'K.O.!', 'LIGHTS OUT!']);
}
