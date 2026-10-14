// Audio preview + verification harness.
//
// Interactive: every sound as a button, music/engine/fire/gas controls and
// scripted event sequences pushed through a real EventBus into
// AudioSystem.bind() with a fake, moving world.
//
// Offline: window.__audio.offline(name) renders a scenario through the real
// AudioSystem inside an OfflineAudioContext (driving update() by suspending
// the render every 50 ms) and returns levels (peak, RMS per second, NaNs,
// clipped samples) plus a waveform + spectrogram PNG (data URL).
import { WEAPON_ORDER, type DeathKind, type WeaponId, type ZombieKind } from '../src/config/ids';
import { AudioSystem, SOUNDS, SOUND_NAMES } from '../src/audio';
import type { CorpseView, FireZoneView, GasView, PlayerView, WeaponView, WorldPhase, WorldView, ZombieView } from '../src/core/api';
import { EventBus, type V3 } from '../src/core/events';
import { World } from '../src/core/World';
import { Bot } from '../src/core/Bot';

// ------------------------------------------------------------ fake world

interface FakeWorld extends WorldView {
  phase: WorldPhase;
  chapter: number;
  boarded: number;
  passengers: number;
  timeOfDay: number;
  zombies: ZombieView[];
  corpses: CorpseView[];
  gas: GasView[];
  fires: FireZoneView[];
  players: PlayerView[];
}

const v3 = (x: number, y = 1, z = 0): V3 => ({ x, y, z });

class Sim {
  readonly bus = new EventBus();
  readonly world: FakeWorld;
  private id = 1;
  readonly weapon: WeaponView;
  readonly player: PlayerView;
  private spinTarget = 0;
  firing = false;

  constructor() {
    this.weapon = { id: 'revolver', state: 'idle', ticks: 0, bullets: 6, reloadProgress: 0, spin: 0, heat: 0 };
    this.player = {
      id: 0,
      x: 10,
      y: 0,
      z: 0,
      vx: 0,
      vz: 0,
      life: 100,
      state: 'stand',
      stateTicks: 0,
      distance: 0,
      money: 0,
      weapon: this.weapon,
      owned: new Map(),
      kills: 0,
    };
    this.world = {
      events: this.bus,
      tick: 0,
      chapter: 1,
      chapterName: 'Last Light',
      phase: 'playing',
      players: [this.player],
      zombies: [],
      corpses: [],
      projectiles: [],
      gas: [],
      fires: [],
      crane: { state: 'hanging', stateTime: 0, barricade: 0 },
      hornReady: true,
      favour: 0,
      boarded: 0,
      passengers: 48,
      bossLife: null,
      timeOfDay: 0.1,
    };
  }

  zombie(kind: ZombieKind, x = -24, z = (Math.random() - 0.5) * 8, extra: Partial<ZombieView> = {}): number {
    const id = this.id++;
    const zv: ZombieView = {
      id,
      kind,
      look: Math.floor(Math.random() * 1e6),
      x,
      y: 0,
      z,
      vx: kind === 'jogger' ? 5 : 1,
      vz: 0,
      facing: 1,
      state: 'walk',
      stateTicks: 0,
      distance: 0,
      life: 70,
      maxLife: 70,
      isBoss: kind === 'bigdave',
      risen: false,
      burning: 0,
      plates: 0,
      nails: 0,
      dead: false,
      removed: false,
      ...extra,
    };
    this.world.zombies.push(zv);
    this.bus.emit('spawn', { zombieId: id, kind, boss: zv.isBoss, risen: zv.risen });
    return id;
  }

  z(id: number): ZombieView | undefined {
    return this.world.zombies.find((q) => q.id === id);
  }

  /** The nearest live zombie (or a fresh one). */
  target(): ZombieView {
    const live = this.world.zombies.filter((q) => !q.dead && !q.removed);
    if (live.length) return live.reduce((a, b) => (b.x > a.x ? b : a));
    return this.z(this.zombie('shambler', -10))!;
  }

  shoot(weapon: WeaponId, hits: number[] = [], kill: 'down' | 'headshot' | 'gib' | 'headoff' | null = null): void {
    this.weapon.bullets = Math.max(0, this.weapon.bullets - 1);
    this.bus.emit('shot', { playerId: 0, weapon, muzzle: v3(this.player.x - 0.6), paths: [] });
    for (const id of hits) {
      const zv = this.z(id);
      if (!zv) continue;
      const part = kill === 'headshot' || kill === 'headoff' ? 'head' : 'body';
      this.bus.emit('hit', { zombieId: id, kind: zv.kind, part, point: v3(zv.x, 1.2, zv.z), dirX: -1, dirZ: 0, damage: 40, bullet: true, playerId: 0, weapon });
      if (kill) this.kill(id, kill, weapon);
    }
  }

  kill(id: number, deathKind: DeathKind, weapon: WeaponId | null = null): void {
    const zv = this.z(id);
    if (!zv || zv.dead) return;
    zv.dead = true;
    zv.removed = true;
    const corpseId = deathKind === 'gib' || deathKind === 'pop' ? null : this.id++;
    if (corpseId !== null) {
      this.world.corpses.push({
        id: corpseId,
        zombieId: id,
        kind: zv.kind,
        look: zv.look,
        x: zv.x,
        z: zv.z,
        facing: 1,
        deathKind,
        risesAt: deathKind === 'down' ? 1 : null,
        twitching: false,
        burning: 0,
        ash: false,
        nails: 0,
        removed: false,
      });
    }
    this.bus.emit('zombieDeath', { zombieId: id, kind: zv.kind, deathKind, boss: zv.isBoss, risen: zv.risen, point: v3(zv.x, 1, zv.z), dirX: -1, dirZ: 0, force: 60, corpseId, playerId: 0, weapon });
    this.bus.emit('money', { playerId: 0, amount: 40, reason: 'bounty', x: zv.x, y: 1.8, z: zv.z });
    if (deathKind === 'headshot') this.bus.emit('money', { playerId: 0, amount: 15, reason: 'headshot', x: zv.x, y: 1.8, z: zv.z });
    this.player.kills++;
  }

  switchTo(w: WeaponId, buy = false): void {
    (this.weapon as { id: WeaponId }).id = w;
    this.weapon.bullets = { revolver: 6, nailgun: 40, shotgun: 6, flare: 1, harpoon: 1, outboard: 300 }[w];
    if (buy) this.bus.emit('buy', { playerId: 0, weapon: w });
    this.bus.emit('weaponSwitch', { playerId: 0, weapon: w });
  }

  spin(target: number): void {
    this.spinTarget = target;
  }

  step(dt: number): void {
    const w = this.world;
    for (const zv of w.zombies) {
      if (zv.dead) continue;
      zv.x += zv.vx * dt * (zv.burning > 0 ? 1.4 : 1);
      zv.burning = Math.max(0, zv.burning - dt);
      if (Math.random() < dt * 0.35) this.bus.emit('groan', { zombieId: zv.id, x: zv.x, z: zv.z, kind: zv.kind });
      if (zv.x > 18) zv.x = -24;
    }
    for (const c of w.corpses) c.burning = Math.max(0, c.burning - dt);
    w.gas = w.gas.filter((g) => (g.ttl -= dt) > 0);
    w.fires = w.fires.filter((f) => (f.ttl -= dt) > 0);
    const wp = this.weapon;
    wp.spin += (this.spinTarget - wp.spin) * Math.min(1, dt * 3);
    if (this.firing && wp.id === 'outboard') wp.heat = Math.min(1, wp.heat + dt * 0.3);
    else wp.heat = Math.max(0, wp.heat - dt * 0.2);
  }
}

// ---------------------------------------------------------------- scripts

type Script = Array<[number, (s: Sim, a: AudioSystem) => void]>;

function repeat(t0: number, t1: number, every: number, fn: (s: Sim, a: AudioSystem, i: number) => void): Script {
  const out: Script = [];
  let i = 0;
  for (let t = t0; t < t1; t += every) {
    const k = i++;
    out.push([t, (s, a) => fn(s, a, k)]);
  }
  return out;
}

const BATTLE: Script = [
  [0, (s, a) => {
    a.startAmbience();
    a.startMusic();
    s.bus.emit('chapterSplash', { num: 1, name: 'Last Light', clock: '18:40' });
  }],
  ...repeat(0.4, 6, 0.9, (s) => void s.zombie('shambler', -24 + Math.random() * 6)),
  [3, (s) => void s.zombie('jogger')],
  [5.5, (s) => void s.zombie('bloater', -22, 1)],
  ...repeat(2, 5, 0.5, (s, _a, i) => s.shoot('revolver', [s.target().id], i % 3 === 2 ? 'headshot' : 'down')),
  [5.2, (s) => s.bus.emit('reloadStart', { playerId: 0, weapon: 'revolver' })],
  [6.8, (s) => s.bus.emit('reloadEnd', { playerId: 0, weapon: 'revolver' })],
  [7.2, (s) => s.bus.emit('emptyClick', { playerId: 0, weapon: 'revolver' })],
  [8, (s) => s.switchTo('nailgun', true)],
  ...repeat(8.6, 10.4, 0.075, (s, _a, i) => s.shoot('nailgun', i % 4 === 0 ? [s.target().id] : [], i % 9 === 8 ? 'down' : null)),
  [10.5, (s) => s.bus.emit('nail', { zombieId: null, corpseId: s.world.corpses[0]?.id ?? 1, point: v3(-4, 0.2, 0) })],
  [10.7, (s) => s.bus.emit('corpsePermanent', { corpseId: s.world.corpses[0]?.id ?? 1, reason: 'nailed' })],
  [11, (s) => s.switchTo('shotgun', true)],
  [11.5, (s) => {
    const ids = [s.zombie('shambler', -3, 0), s.zombie('shambler', -2.5, 0.5), s.zombie('shambler', -3.2, -0.4)];
    s.shoot('shotgun', ids, 'gib');
    s.bus.emit('niceShot', { playerId: 0, n: 3 });
    s.bus.emit('money', { playerId: 0, amount: 25, reason: 'nice', x: -3, y: 1.8, z: 0 });
    s.bus.emit('slowmo', { scale: 0.35, seconds: 0.6 });
  }],
  [12.5, (s) => s.shoot('shotgun', [s.target().id], 'headoff')],
  [13.3, (s) => s.bus.emit('reloadStart', { playerId: 0, weapon: 'shotgun' })],
  ...repeat(13.75, 14.8, 0.45, (s) => {
    s.weapon.state = 'reload';
    s.weapon.bullets++;
  }),
  [14.9, (s) => {
    s.weapon.state = 'idle';
    s.bus.emit('reloadEnd', { playerId: 0, weapon: 'shotgun' });
  }],
  [15, (s) => s.bus.emit('corpseTwitch', { corpseId: s.world.corpses[1]?.id ?? 2 })],
  [16.6, (s) => s.bus.emit('corpseRise', { corpseId: s.world.corpses[1]?.id ?? 2, zombieId: s.zombie('shambler', -5, 0, { risen: true, state: 'crawl', vx: 0.6 }) })],
  [17.5, (s) => s.bus.emit('jump', { playerId: 0 })],
  [17.9, (s) => {
    s.bus.emit('stomp', { playerId: 0, x: -4, z: 0, killed: true });
    const t = s.target();
    s.kill(t.id, 'stomp');
    s.bus.emit('money', { playerId: 0, amount: 5, reason: 'tidy', x: -4, y: 0.5, z: 0 });
  }],
  [18.5, (s) => s.switchTo('flare', true)],
  [19, (s) => {
    s.shoot('flare');
    s.bus.emit('projectile', { id: 900, kind: 'flare', x: 9, y: 1, z: 0, vx: -28, vy: 2, vz: 0 });
  }],
  [19.6, (s) => {
    s.bus.emit('projectileEnd', { id: 900, x: -6, y: 0, z: 0 });
    s.world.fires.push({ id: 1, x: -6, z: 0, radius: 1.2, ttl: 8, max: 8 });
    s.bus.emit('fireZone', { id: 1, x: -6, z: 0, radius: 1.2, ttl: 8 });
    for (const zv of s.world.zombies.filter((q) => !q.dead).slice(0, 3)) {
      zv.burning = 4;
      s.bus.emit('ignite', { zombieId: zv.id, corpseId: null, x: zv.x, z: zv.z });
    }
    for (const c of s.world.corpses.slice(0, 3)) {
      c.burning = 6;
      s.bus.emit('ignite', { zombieId: null, corpseId: c.id, x: c.x, z: c.z });
    }
  }],
  [22, (s) => {
    const b = s.world.zombies.find((q) => q.kind === 'bloater' && !q.dead) ?? s.z(s.zombie('bloater', 2, 0))!;
    b.x = 6;
    s.kill(b.id, 'pop', 'revolver');
    s.world.gas.push({ id: 1, x: 6, z: 0, radius: 2.5, ttl: 4, max: 4 });
    s.bus.emit('gas', { id: 1, x: 6, z: 0, radius: 2.5, ttl: 4 });
  }],
  ...repeat(22.3, 24, 0.2, (s) => s.bus.emit('playerHurt', { playerId: 0, damage: 3, source: 'gas' })),
  [24.2, (s) => s.bus.emit('explosion', { x: 6, y: 0.5, z: 0, radius: 3.5, kind: 'gas' })],
  [25, (s) => s.switchTo('harpoon', true)],
  [25.6, (s) => {
    const ids = [0, 1, 2, 3].map((i) => s.zombie('shambler', -6 - i * 0.8, 0));
    s.shoot('harpoon');
    s.bus.emit('harpoon', { playerId: 0, from: v3(9), to: v3(-10), skewered: ids, reel: 2 });
    ids.forEach((id) => s.kill(id, 'harpoon', 'harpoon'));
  }],
  [27, (s) => s.switchTo('outboard', true)],
  [27.4, (s) => s.bus.emit('engine', { playerId: 0, state: 'pull' })],
  [28.6, (s) => s.bus.emit('engine', { playerId: 0, state: 'idle' })],
  [29.4, (s) => {
    s.bus.emit('engine', { playerId: 0, state: 'run' });
    s.spin(1);
  }],
  [30, (s) => (s.firing = true)],
  ...repeat(30, 33, 0.045, (s, _a, i) => s.shoot('outboard', i % 6 === 0 ? [s.target().id] : [], i % 18 === 17 ? 'down' : null)),
  [33, (s) => {
    s.firing = false;
    s.spin(0);
    s.bus.emit('engine', { playerId: 0, state: 'idle' });
  }],
  [34.5, (s) => s.bus.emit('engine', { playerId: 0, state: 'stop' })],
  [35, (s) => s.bus.emit('horn', {})],
  [38, (s) => s.bus.emit('crane', { state: 'falling', x: -6, z: -1.5 })],
  [38.6, (s) => {
    s.bus.emit('crane', { state: 'down', x: -6, z: -1.5 });
    s.bus.emit('explosion', { x: -6, y: 0, z: -1.5, radius: 2.5, kind: 'crates' });
  }],
  [40, (s) => s.bus.emit('favour', { value: 100, ready: true })],
  [41, (s) => {
    s.bus.emit('cannonStrike', { targets: [v3(-8), v3(-10), v3(-12)] });
    s.bus.emit('favour', { value: 0, ready: false });
  }],
  [41.9, (s) => s.bus.emit('explosion', { x: -8, y: 0, z: 0, radius: 3, kind: 'cannon' })],
  [42.25, (s) => s.bus.emit('explosion', { x: -10, y: 0, z: 1, radius: 3, kind: 'cannon' })],
  [42.6, (s) => s.bus.emit('explosion', { x: -12, y: 0, z: -1, radius: 3, kind: 'cannon' })],
  [44, (s) => {
    s.world.phase = 'boss';
    const id = s.zombie('bigdave', -22, 0, { vx: 0.45 });
    s.bus.emit('bossSpawn', { num: 1, name: 'Big Dave' });
    s.bus.emit('groan', { zombieId: id, x: -22, z: 0, kind: 'bigdave' });
  }],
  [47, (s) => s.bus.emit('belch', { zombieId: 1, x: -18, z: 0 })],
  [49, (s) => s.bus.emit('enrage', { zombieId: 1 })],
  [52, (s) => {
    const d = s.world.zombies.find((q) => q.kind === 'bigdave');
    if (d) s.kill(d.id, 'pop', 'shotgun');
    s.bus.emit('slowmo', { scale: 0.25, seconds: 1.2 });
  }],
  [55, (s) => {
    s.world.phase = 'between';
    s.bus.emit('chapterComplete', { num: 1 });
  }],
];

const SCENARIOS: Record<string, { seconds: number; script: Script; amb?: boolean }> = {
  battle: { seconds: 58, script: BATTLE },
  music: {
    seconds: 64,
    script: [
      [0, (s, a) => {
        a.autoMusic = false;
        a.startMusic();
        a.setMusicState({ intensity: 0, boss: false, chapter: 1 });
      }],
      ...repeat(0, 40, 0.5, (_s, a, i) => a.setMusicState({ intensity: Math.min(1, i / 70) })),
      [40, (_s, a) => {
        a.setMusicState({ boss: true });
        a.musicCue('boss');
      }],
      ...repeat(40, 52, 0.5, (_s, a) => a.setMusicState({ intensity: 1 })),
      [52, (_s, a) => a.musicCue('gameover')],
    ],
  },
  engine: {
    seconds: 14,
    script: [
      [0, (s) => s.switchTo('outboard', true)],
      [0.5, (s) => s.bus.emit('engine', { playerId: 0, state: 'pull' })],
      [1.7, (s) => s.bus.emit('engine', { playerId: 0, state: 'idle' })],
      [4, (s) => {
        s.bus.emit('engine', { playerId: 0, state: 'run' });
        s.spin(1);
      }],
      [5, (s) => (s.firing = true)],
      ...repeat(5, 9, 0.045, (s) => s.shoot('outboard')),
      [9, (s) => {
        s.firing = false;
        s.spin(0);
        s.bus.emit('engine', { playerId: 0, state: 'idle' });
      }],
      [11, (s) => s.bus.emit('engine', { playerId: 0, state: 'stop' })],
    ],
  },
  ambience: {
    seconds: 45,
    script: [
      [0, (s, a) => {
        a.startAmbience();
        s.world.timeOfDay = 0;
      }],
      ...repeat(1, 45, 1, (s) => (s.world.timeOfDay = Math.min(1, s.world.timeOfDay + 0.025))),
    ],
  },
  victory: {
    seconds: 14,
    script: [
      [0, (s, a) => {
        a.startMusic();
        a.startAmbience();
        s.world.phase = 'victory';
      }],
      [1, (s) => s.bus.emit('victory', {})],
    ],
  },
  gameover: {
    seconds: 12,
    script: [
      [0, (s, a) => {
        a.startMusic();
        a.startAmbience();
        a.setMusicState({ intensity: 0.7 });
      }],
      [2, (s) => {
        s.world.phase = 'gameover';
        s.bus.emit('gameOver', { reason: 'gangway', zombieId: 1 });
      }],
    ],
  },
};

/** Every sound (variant 0) back to back. */
function allSoundsScenario(filter?: (n: string) => boolean): { seconds: number; script: Script; marks: Array<[number, string]> } {
  const marks: Array<[number, string]> = [];
  const script: Script = [];
  let t = 0.2;
  const probe = new AudioSystem({ context: new OfflineAudioContext(1, 1, 48000) });
  for (const name of SOUND_NAMES) {
    if (filter && !filter(name)) continue;
    const d = probe.buffer(name, 0)?.duration ?? 1;
    marks.push([t, name]);
    script.push([t, (_s, a) => void a.play(name, { variant: 0, volume: 1, pitch: 1 })]);
    t += d + 0.25;
  }
  return { seconds: t + 1, script, marks };
}

// ---------------------------------------------------------------- offline

interface OfflineReport {
  name: string;
  seconds: number;
  peak: number;
  clipped: number;
  nan: number;
  rmsDb: number;
  perSecond: Array<{ t: number; rmsDb: number; peak: number }>;
  played: number;
  stolen: number;
  dropped: number;
  peakVoices: number;
  renderMs: number;
  png: string;
  marks?: Array<[number, string]>;
  perSound?: Array<{ name: string; peak: number; rmsDb: number }>;
}

/**
 * The real game: core/World played by core/Bot, every event bound to the
 * AudioSystem exactly as the app will (world getter for continuous sounds).
 */
async function offlineSim(seconds: number, startChapter: number, money: number, seed: number): Promise<OfflineReport> {
  const sr = 48000;
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * sr), sr);
  const audio = new AudioSystem({ context: ctx });
  const w = new World({ seed, startChapter, money });
  const bot = new Bot(w.player, { skill: 0.85, buyList: ['nailgun', 'shotgun', 'flare', 'harpoon', 'outboard'] });
  audio.bind(w.events, { world: () => w });
  audio.setVolumes(1, 1, 1);
  audio.startAmbience();
  audio.startMusic();
  for (const n of SOUND_NAMES) audio.buffer(n, 0);
  const events: Record<string, number> = {};
  const count = (n: string) => w.events.on(n as never, () => (events[n] = (events[n] ?? 0) + 1));
  for (const n of ['shot', 'zombieDeath', 'groan', 'hit', 'money', 'corpseRise', 'explosion', 'horn', 'cannonStrike', 'engine', 'bossSpawn', 'chapterComplete', 'gameOver']) count(n);
  const step = 1 / 50;
  const tick = () => {
    if (!w.gameEnded) {
      bot.think(w);
      w.step();
    }
    audio.update(step);
  };
  tick();
  for (let i = 1; i < Math.floor(seconds / step) - 1; i++) {
    const tt = i * step;
    ctx.suspend(tt).then(() => {
      tick();
      ctx.resume();
    });
  }
  const t0 = performance.now();
  const buf = await ctx.startRendering();
  const r = analyse(buf, `sim-ch${startChapter}`, seconds, audio, performance.now() - t0);
  (r as OfflineReport & { events?: Record<string, number> }).events = events;
  return r;
}

function analyse(buf: AudioBuffer, name: string, seconds: number, audio: AudioSystem, renderMs: number, marks?: Array<[number, string]>): OfflineReport {
  const sr = buf.sampleRate;
  const L = buf.getChannelData(0);
  const R = buf.getChannelData(1);
  let peak = 0;
  let clipped = 0;
  let nan = 0;
  let sum = 0;
  for (const ch of [L, R]) {
    for (let i = 0; i < ch.length; i++) {
      const v = ch[i];
      if (!Number.isFinite(v)) {
        nan++;
        continue;
      }
      const a = Math.abs(v);
      if (a > peak) peak = a;
      if (a >= 0.999) clipped++;
      sum += v * v;
    }
  }
  const db = (x: number) => (x > 1e-9 ? 20 * Math.log10(x) : -180);
  const perSecond: OfflineReport['perSecond'] = [];
  for (let s = 0; s < Math.floor(seconds); s++) {
    let ss = 0;
    let pk = 0;
    for (let i = s * sr; i < Math.min(L.length, (s + 1) * sr); i++) {
      const m = (L[i] + R[i]) / 2;
      ss += m * m;
      pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i]));
    }
    perSecond.push({ t: s, rmsDb: Math.round(db(Math.sqrt(ss / sr)) * 10) / 10, peak: Math.round(pk * 1000) / 1000 });
  }
  return {
    name,
    seconds,
    peak,
    clipped,
    nan,
    rmsDb: Math.round(db(Math.sqrt(sum / (2 * L.length))) * 10) / 10,
    perSecond,
    played: audio.stats.played,
    stolen: audio.stats.stolen,
    dropped: audio.stats.dropped,
    peakVoices: audio.stats.peakVoices,
    renderMs: Math.round(renderMs),
    png: drawPng(L, R, sr, marks),
    marks,
  };
}

async function offline(name: string, opts: { png?: boolean; filter?: string } = {}): Promise<OfflineReport> {
  const sim3 = /^sim(\d)?$/.exec(name);
  if (sim3) {
    const ch = Number(sim3[1] ?? 1);
    return offlineSim(60, ch, [0, 0, 3000, 12000][ch] ?? 0, 4242 + ch);
  }
  const sr = 48000;
  let sc: { seconds: number; script: Script; marks?: Array<[number, string]> };
  if (name === 'all') sc = allSoundsScenario(opts.filter ? (n) => n.startsWith(opts.filter!) : undefined);
  else sc = SCENARIOS[name];
  if (!sc) throw new Error(`unknown scenario ${name}`);
  const ctx = new OfflineAudioContext(2, Math.ceil(sc.seconds * sr), sr);
  const audio = new AudioSystem({ context: ctx });
  const sim = new Sim();
  audio.bind(sim.bus, { world: () => sim.world });
  audio.setVolumes(1, 1, 1);
  const script = sc.script.slice().sort((a, b) => a[0] - b[0]);
  const step = 0.05;
  let si = 0;
  const run = (t: number) => {
    while (si < script.length && script[si][0] <= t + 1e-6) script[si++][1](sim, audio);
    sim.step(step);
    audio.update(step);
  };
  // Pre-bake so render timing is not skewed and every voice is ready.
  for (const n of SOUND_NAMES) audio.buffer(n, 0);
  run(0);
  for (let t = step; t < sc.seconds - step; t += step) {
    const tt = Math.round(t / step) * step;
    ctx.suspend(tt).then(() => {
      run(tt);
      ctx.resume();
    });
  }
  const t0 = performance.now();
  const buf = await ctx.startRendering();
  const renderMs = performance.now() - t0;
  const L = buf.getChannelData(0);
  const R = buf.getChannelData(1);
  let peak = 0;
  let clipped = 0;
  let nan = 0;
  let sum = 0;
  for (const ch of [L, R]) {
    for (let i = 0; i < ch.length; i++) {
      const v = ch[i];
      if (!Number.isFinite(v)) {
        nan++;
        continue;
      }
      const a = Math.abs(v);
      if (a > peak) peak = a;
      if (a >= 0.999) clipped++;
      sum += v * v;
    }
  }
  const db = (x: number) => (x > 1e-9 ? 20 * Math.log10(x) : -180);
  const perSecond: OfflineReport['perSecond'] = [];
  for (let s = 0; s < Math.floor(sc.seconds); s++) {
    let ss = 0;
    let pk = 0;
    for (let i = s * sr; i < Math.min(L.length, (s + 1) * sr); i++) {
      const m = (L[i] + R[i]) / 2;
      ss += m * m;
      pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i]));
    }
    perSecond.push({ t: s, rmsDb: Math.round(db(Math.sqrt(ss / sr)) * 10) / 10, peak: Math.round(pk * 1000) / 1000 });
  }
  let perSound: OfflineReport['perSound'];
  if (sc.marks) {
    perSound = sc.marks.map(([t, n], i) => {
      const end = sc.marks![i + 1]?.[0] ?? sc.seconds;
      let pk = 0;
      let ss = 0;
      let c = 0;
      for (let k = Math.floor(t * sr); k < Math.min(L.length, Math.floor(end * sr)); k++) {
        pk = Math.max(pk, Math.abs(L[k]), Math.abs(R[k]));
        ss += L[k] * L[k];
        c++;
      }
      return { name: n, peak: Math.round(pk * 1000) / 1000, rmsDb: Math.round(db(Math.sqrt(ss / Math.max(1, c))) * 10) / 10 };
    });
  }
  return {
    name,
    seconds: sc.seconds,
    peak,
    clipped,
    nan,
    rmsDb: Math.round(db(Math.sqrt(sum / (2 * L.length))) * 10) / 10,
    perSecond,
    played: audio.stats.played,
    stolen: audio.stats.stolen,
    dropped: audio.stats.dropped,
    peakVoices: audio.stats.peakVoices,
    renderMs: Math.round(renderMs),
    png: opts.png === false ? '' : drawPng(L, R, sr, sc.marks),
    marks: sc.marks,
    perSound,
  };
}

// --------------------------------------------------------- spectrogram png

function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = (-2 * Math.PI) / len;
    const wr = Math.cos(a);
    const wi = Math.sin(a);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const h = len / 2;
        const vr = re[i + k + h] * cr - im[i + k + h] * ci;
        const vi = re[i + k + h] * ci + im[i + k + h] * cr;
        re[i + k + h] = re[i + k] - vr;
        im[i + k + h] = im[i + k] - vi;
        re[i + k] += vr;
        im[i + k] += vi;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
}

function heat(v: number): [number, number, number] {
  v = Math.max(0, Math.min(1, v));
  const s: Array<[number, number, number, number]> = [[0, 6, 6, 16], [0.3, 70, 12, 92], [0.55, 200, 40, 60], [0.8, 250, 170, 40], [1, 255, 255, 220]];
  for (let i = 1; i < s.length; i++) {
    if (v <= s[i][0]) {
      const f = (v - s[i - 1][0]) / (s[i][0] - s[i - 1][0]);
      return [s[i - 1][1] + (s[i][1] - s[i - 1][1]) * f, s[i - 1][2] + (s[i][2] - s[i - 1][2]) * f, s[i - 1][3] + (s[i][3] - s[i - 1][3]) * f];
    }
  }
  return [255, 255, 220];
}

function drawPng(L: Float32Array, R: Float32Array, sr: number, marks?: Array<[number, string]>): string {
  const W = 1800;
  const WH = 120;
  const SH = 220;
  const LH = marks ? 70 : 18;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = WH + SH + LH;
  const g = c.getContext('2d')!;
  g.fillStyle = '#0b0e13';
  g.fillRect(0, 0, W, c.height);
  const per = L.length / W;
  // Waveform: L up, R down mirrored around the centre; red where |x| > 0.99.
  for (let x = 0; x < W; x++) {
    let mn = 0;
    let mx = 0;
    let clip = false;
    for (let i = Math.floor(x * per); i < Math.floor((x + 1) * per); i++) {
      const v = (L[i] + R[i]) / 2;
      if (v < mn) mn = v;
      if (v > mx) mx = v;
      if (Math.abs(L[i]) > 0.99 || Math.abs(R[i]) > 0.99) clip = true;
    }
    g.fillStyle = clip ? '#ff4b3e' : '#7fc4ff';
    g.fillRect(x, WH / 2 - mx * (WH / 2 - 2), 1, Math.max(1, (mx - mn) * (WH / 2 - 2)));
  }
  g.fillStyle = '#ffffff22';
  for (const y of [WH / 2 - 0.5 * (WH / 2 - 2), WH / 2 + 0.5 * (WH / 2 - 2)]) g.fillRect(0, y, W, 1);
  // Spectrogram (log frequency 30 Hz … 20 kHz).
  const N = 2048;
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  const img = g.createImageData(W, SH);
  for (let x = 0; x < W; x++) {
    const ctr = Math.floor((x + 0.5) * per);
    for (let i = 0; i < N; i++) {
      const j = ctr - N / 2 + i;
      const win = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
      re[i] = ((L[j] ?? 0) + (R[j] ?? 0)) * 0.5 * win;
      im[i] = 0;
    }
    fft(re, im);
    for (let y = 0; y < SH; y++) {
      const f = 30 * Math.pow(20000 / 30, 1 - y / (SH - 1));
      const bin = Math.min(N / 2 - 1, Math.max(1, Math.round((f / sr) * N)));
      const m = Math.hypot(re[bin], im[bin]) / (N / 4);
      const [r, gg, b] = heat((20 * Math.log10(m + 1e-9) + 96) / 96);
      const o = (y * W + x) * 4;
      img.data[o] = r;
      img.data[o + 1] = gg;
      img.data[o + 2] = b;
      img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, WH);
  // Time grid and labels.
  const secs = L.length / sr;
  g.font = '10px monospace';
  for (let s = 0; s < secs; s++) {
    const x = (s / secs) * W;
    g.fillStyle = s % 5 === 0 ? '#ffffff55' : '#ffffff1c';
    g.fillRect(x, 0, 1, WH + SH);
    if (s % 5 === 0) {
      g.fillStyle = '#aaa';
      g.fillText(`${s}s`, x + 2, WH + SH + 12);
    }
  }
  if (marks) {
    g.save();
    g.fillStyle = '#e9ac4e';
    marks.forEach(([t, n], i) => {
      const x = (t / secs) * W;
      g.save();
      g.translate(x + 2, WH + SH + 16 + (i % 2) * 2);
      g.rotate(Math.PI / 2.4);
      g.fillText(n, 0, 0);
      g.restore();
    });
    g.restore();
  }
  return c.toDataURL('image/png');
}

// ------------------------------------------------------------ interactive

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const live = new AudioSystem();
const sim = new Sim();
live.bind(sim.bus, { world: () => sim.world });
const logEl = $('log');
const log = (m: string) => {
  const d = document.createElement('div');
  d.textContent = m;
  logEl.prepend(d);
};
const panX = () => Number(($('panx') as HTMLInputElement).value);
const vols = () => live.setVolumes(Number($<HTMLInputElement>('master').value), Number($<HTMLInputElement>('sfx').value), Number($<HTMLInputElement>('music').value));
for (const id of ['master', 'sfx', 'music']) $(id).addEventListener('input', vols);
vols();
$('unlock').addEventListener('click', () => {
  live.unlock();
  $('status').textContent = 'Unlocked. Baking sounds…';
  void live.prewarm((d, t) => ($('status').textContent = `Baking ${d}/${t}…`)).then(() => ($('status').textContent = `Ready · ${live.stats.baked} buffers baked in ${Math.round(live.stats.bakeMs)} ms`));
});
$('amb').addEventListener('change', (e) => ((e.target as HTMLInputElement).checked ? live.startAmbience() : live.stopAmbience()));
$('pause').addEventListener('change', (e) => live.setPaused((e.target as HTMLInputElement).checked));
$('music-start').addEventListener('click', () => {
  live.autoMusic = false;
  live.startMusic();
});
$('music-stop').addEventListener('click', () => live.stopMusic());
const musicState = () =>
  live.setMusicState({ intensity: Number($<HTMLInputElement>('intensity').value), boss: $<HTMLInputElement>('boss').checked, chapter: Number($<HTMLSelectElement>('chapter').value) });
for (const id of ['intensity', 'boss', 'chapter']) $(id).addEventListener('input', musicState);
document.querySelectorAll<HTMLButtonElement>('[data-cue]').forEach((b) => b.addEventListener('click', () => live.musicCue(b.dataset.cue as never)));
document.querySelectorAll<HTMLButtonElement>('[data-engine]').forEach((b) =>
  b.addEventListener('click', () => {
    if (sim.weapon.id !== 'outboard') sim.switchTo('outboard');
    const st = b.dataset.engine as 'pull' | 'idle' | 'run' | 'stop';
    sim.bus.emit('engine', { playerId: 0, state: st });
  }),
);
$('spin').addEventListener('input', (e) => sim.spin(Number((e.target as HTMLInputElement).value)));
$('firing').addEventListener('change', (e) => (sim.firing = (e.target as HTMLInputElement).checked));
$('burning').addEventListener('input', (e) => {
  const n = Number((e.target as HTMLInputElement).value);
  sim.world.fires = Array.from({ length: n }, (_, i) => ({ id: i, x: -10 + i, z: 0, radius: 1, ttl: 1e9, max: 1e9 }));
});
$('gascount').addEventListener('input', (e) => {
  const n = Number((e.target as HTMLInputElement).value);
  sim.world.gas = Array.from({ length: n }, (_, i) => ({ id: i, x: -4 + i * 2, z: 0, radius: 2.5, ttl: 1e9, max: 1e9 }));
});

// Sound buttons.
const sounds = $('sounds');
for (const name of SOUND_NAMES) {
  const b = document.createElement('button');
  b.textContent = name;
  b.className = SOUNDS[name].bus ?? 'sfx';
  b.title = `${SOUNDS[name].variants ?? 1} variant(s)`;
  b.addEventListener('click', () => {
    live.unlock();
    live.play(name, { x: panX() });
  });
  sounds.appendChild(b);
}

// Live sequences.
function runLive(script: Script): void {
  live.unlock();
  const start = performance.now();
  const sorted = script.slice().sort((a, b) => a[0] - b[0]);
  let i = 0;
  const tick = () => {
    const t = (performance.now() - start) / 1000;
    while (i < sorted.length && sorted[i][0] <= t) sorted[i++][1](sim, live);
    if (i < sorted.length) requestAnimationFrame(tick);
  };
  tick();
}
const seqs = $('seqs');
for (const [name, sc] of Object.entries(SCENARIOS)) {
  const b = document.createElement('button');
  b.textContent = name;
  b.addEventListener('click', () => {
    log(`sequence: ${name}`);
    runLive(sc.script);
  });
  seqs.appendChild(b);
}
for (const w of WEAPON_ORDER) {
  const b = document.createElement('button');
  b.textContent = `fire ${w}`;
  b.addEventListener('click', () => {
    live.unlock();
    live.fireShot(w, 10);
  });
  seqs.appendChild(b);
}

// Offline buttons.
const off = $('offline');
for (const name of ['all', ...Object.keys(SCENARIOS)]) {
  const b = document.createElement('button');
  b.textContent = `render ${name}`;
  b.addEventListener('click', async () => {
    b.disabled = true;
    const r = await offline(name);
    b.disabled = false;
    const box = document.createElement('div');
    const pre = document.createElement('pre');
    pre.textContent = `${r.name}: ${r.seconds.toFixed(1)} s, peak ${r.peak.toFixed(3)}, clipped ${r.clipped}, NaN ${r.nan}, RMS ${r.rmsDb} dBFS, voices played ${r.played} (peak ${r.peakVoices}, stolen ${r.stolen}, dropped ${r.dropped}), render ${r.renderMs} ms`;
    const img = document.createElement('img');
    img.src = r.png;
    box.append(pre, img);
    $('report').prepend(box);
  });
  off.appendChild(b);
}

// Live loop: fake world + audio update.
let last = performance.now();
const frame = () => {
  const now = performance.now();
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  sim.step(dt);
  if (sim.firing && sim.weapon.id === 'outboard' && sim.weapon.spin > 0.95 && Math.random() < dt / 0.045) sim.shoot('outboard');
  live.update(dt);
  $('voices').textContent = `voices ${live.activeVoices} · played ${live.stats.played} · stolen ${live.stats.stolen} · dropped ${live.stats.dropped}`;
  requestAnimationFrame(frame);
};
requestAnimationFrame(frame);

declare global {
  interface Window {
    __audio: unknown;
  }
}
window.__audio = { offline, live, sim, scenarios: Object.keys(SCENARIOS) };
