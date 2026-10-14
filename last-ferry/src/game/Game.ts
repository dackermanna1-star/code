// Application controller: title (live attract game) → playing ⇄ paused →
// game over / victory. Runs the logic at a fixed 50 Hz from an accumulator,
// applies hit-stop and slow motion (TimeControl) to logic and presentation,
// feeds the HUD, the world overlay, callouts, money pop-ups and audio, and
// plays the chapter, game-over and victory sequences.
//
// Frame order (Stage.onUpdate):
//   input → actions → time (hit-stop / slow-mo) → logic ticks
//   (bot or input → view.beforeStep → world.step) → view.update (also drives
//   the environment) → sequences → HUD / overlay / pop-ups → audio.update
import * as THREE from 'three';
import { CHAPTERS } from '../config/chapters';
import { WEAPON_ORDER, type WeaponId, type ZombieKind } from '../config/ids';
import { WEAPONS } from '../config/weapons';
import { TICK, TICK_RATE } from '../config/world';
import { Bot } from '../core/Bot';
import { World, type SpawnOpts, type WorldOptions } from '../core/World';
import type { Zombie } from '../core/Zombie';
import type { GameEvents } from '../core/events';
import type { AudioSystem } from '../audio';
import type { Environment } from '../render/env/Environment';
import { GameView } from '../render/GameView';
import type { PostQuality, Stage } from '../render/Stage';
import { Hud, Screens, WorldOverlay, hudSnapshot, loadRuns, overlayFrame, runStats, type HudSnapshot, type Options, type Quality, type RunStats } from '../ui';
import { Input, type Action, type HeldInput } from './Input';
import { MoneyPops } from './MoneyPops';
import { TimeControl } from './TimeControl';

export type GameMode = 'boot' | 'title' | 'playing' | 'paused' | 'over' | 'victory';

/** Attract mode: a fixed seed per chapter so the title always opens on a good show. */
const ATTRACT_SEED = 1905;
/** Money for a game that starts at a later chapter (debug / ?chapter=N): what a run would have earned. */
export const CHAPTER_START_MONEY = [0, 0, 3000, 12000];
/** Post-processing per quality option. */
const POST: Record<Quality, PostQuality> = { low: 'low', medium: 'medium', high: 'high' };
const PIXEL_RATIO: Record<Quality, number> = { low: 1, medium: 1.5, high: 2 };

/** Victory: horn, then the ferry pulls away (s), the results appear at… */
const VICTORY = { hornAt: 0.2, departAt: 1.4, departSeconds: 12, hudOffAt: 1.0, screenAt: 7.5 };
/** Game over: slow motion, then the results. */
const GAMEOVER = { slowScale: 0.25, slowSeconds: 1.3, screenAt: 2.6 };

const BOSS_LINES: Record<number, string> = {
  1: 'Big Dave belches gas. Stay out of the green.',
  2: 'Forty runners. Hold the line.',
  3: 'Shields up. Harpoons go straight through.',
};

interface Later {
  at: number;
  fn: () => void;
}

export class Game {
  readonly view: GameView;
  readonly hud: Hud;
  readonly overlay: WorldOverlay;
  readonly screens: Screens;
  readonly input: Input;
  readonly time = new TimeControl();
  readonly pops = new MoneyPops();

  world: World | null = null;
  mode: GameMode = 'boot';
  /** Debug / tests: a bot plays the real game. */
  autoplay = false;
  /** Debug / tests: logic and presentation speed multiplier (?speed=N). */
  speed = 1;
  /** ?quality=…: overrides the saved graphics quality for this session. */
  qualityOverride: Quality | null = null;
  private lastQuality: Quality | null = null;
  /** Options for new games (?chapter, ?money, ?god, ?seed). */
  worldOptions: { startChapter?: number; money?: number; god?: boolean; seed?: number } = {};

  private bot: Bot | null = null;
  private acc = 0;
  private offs: Array<() => void> = [];
  private unbindAudio: (() => void) | null = null;
  private snap: HudSnapshot | undefined;
  private attractRuns = 0;
  /** Real seconds since boot (sequences, cooldowns). */
  private clock = 0;
  /** Game seconds since boot (scaled by slow motion, frozen by hit-stop and pause). */
  private gameClock = 0;
  private later: Later[] = [];
  private seqT = 0;
  private seqShown = false;
  private departure = 0;
  private endStats: RunStats | null = null;
  private fpsAcc = 0;
  private fpsFrames = 0;
  private fps = 0;
  private damagePulse = 0;
  private kick = 0;
  private dangerCool = 0;
  private tidy = 0;
  private savedPassengers = 0;
  private chapterMoney = 0;
  private told = new Set<string>();
  private bestAffordable: WeaponId | null = null;
  /** No run recorded yet: a couple of onboarding lines at the start. */
  private firstNight = false;
  private readonly tickIn: HeldInput = { left: false, right: false, up: false, down: false, fire: false, jump: false, horn: false, cannon: false };
  private readonly pv = new THREE.Vector3();
  private readonly pp = { x: 0, y: 0 };
  private readonly project = (x: number, y: number, z: number) => this.stage.project(this.pv.set(x, y, z), this.pp);

  constructor(
    readonly stage: Stage,
    readonly env: Environment,
    readonly audio: AudioSystem,
    screens?: Screens,
  ) {
    this.view = new GameView(stage, env);
    this.overlay = new WorldOverlay(stage.view);
    this.hud = new Hud(stage.view);
    this.screens = screens ?? new Screens(stage.view);
    this.hud.setVisible(false);
    this.hud.onSlotClick = (id) => this.slot(id);
    this.screens.onUiSound = (s) => audio.ui(s);
    this.screens.onOptionsChange = (o) => this.applyOptions(o);
    this.input = new Input(stage.view);
    this.input.menuOpen = () => this.screens.isMenuOpen;
    this.input.onActivity = () => audio.unlock();
    this.input.onFocusLost = () => {
      if (this.mode === 'playing' && !this.autoplay) this.pause();
    };
    this.applyOptions(this.screens.options);
    stage.onUpdate((dt) => this.frame(dt));
  }

  // ------------------------------------------------------------------ options

  applyOptions(o: Options): void {
    // A ?quality override lasts until the player picks a quality in Options.
    if (this.lastQuality !== null && o.quality !== this.lastQuality) this.qualityOverride = null;
    this.lastQuality = o.quality;
    this.audio.setVolumes(o.masterVolume, o.sfxVolume, o.musicVolume);
    this.view.setOptions({ blood: o.blood, shake: o.shake });
    const q = this.qualityOverride ?? o.quality;
    const post = POST[q];
    const pr = PIXEL_RATIO[q];
    if (this.stage.postQualityLevel !== post) this.stage.setPostQuality(post);
    if (this.stage.maxPixelRatio !== pr) {
      this.stage.maxPixelRatio = pr;
      this.stage.resize();
    }
    this.screens.setFps(o.showFps ? this.fps : null);
  }

  // ------------------------------------------------------------------ flow

  /** Title screen over the live attract game. */
  showTitle(): void {
    this.mode = 'title';
    this.time.reset();
    this.audio.setPaused(false);
    this.hud.setVisible(false);
    this.hud.callouts.clear();
    this.overlay.clear();
    this.pops.clear();
    this.input.enabled = false;
    this.startAttract();
    this.audio.setMode('title');
    this.screens.showTitle({ onPlay: () => this.newGame() });
  }

  /** Start a new game (title Play, Retry, ?play). */
  newGame(opts: { startChapter?: number; money?: number } = {}): void {
    this.audio.unlock();
    this.screens.hideAll();
    this.hud.callouts.clear();
    this.overlay.clear();
    this.pops.clear();
    this.time.reset();
    this.audio.setPaused(false);
    this.mode = 'playing';
    const ch = opts.startChapter ?? this.worldOptions.startChapter ?? 1;
    const money = opts.money ?? this.worldOptions.money ?? CHAPTER_START_MONEY[ch] ?? 0;
    const seed = this.worldOptions.seed ?? (Math.random() * 0x7fffffff) >>> 0;
    this.startWorld({ seed, startChapter: ch, money, god: !!this.worldOptions.god }, false);
    this.bot = this.autoplay && this.world ? new Bot(this.world.player, { skill: 0.92 }) : null;
    this.screens.recordRuns = !this.autoplay && !this.worldOptions.god;
    this.firstNight = ch === 1 && loadRuns().length === 0;
    this.hud.setVisible(true);
    this.input.clear();
    this.input.enabled = !this.autoplay;
    this.audio.setMode('game');
  }

  private startAttract(): void {
    const n = this.attractRuns++;
    const ch = (n % CHAPTERS.length) + 1;
    this.startWorld({ seed: ATTRACT_SEED + n, startChapter: ch, money: CHAPTER_START_MONEY[ch] + (ch === 1 ? 700 : 0), god: true, skipSplash: true }, true);
    this.bot = this.world ? new Bot(this.world.player, { skill: 0.88 }) : null;
  }

  private startWorld(o: WorldOptions, attract: boolean): void {
    for (const f of this.offs) f();
    this.offs = [];
    this.unbindAudio?.();
    this.unbindAudio = null;
    this.later = [];
    this.acc = 0;
    this.seqT = 0;
    this.seqShown = false;
    this.endStats = null;
    this.departure = 0;
    this.env.setDeparture(0);
    this.damagePulse = 0;
    this.kick = 0;
    this.tidy = 0;
    this.savedPassengers = 0;
    this.chapterMoney = 0;
    this.told.clear();
    this.bestAffordable = null;
    this.snap = undefined;

    const world = new World(o);
    this.world = world;
    this.view.attach(world);
    this.unbindAudio = this.audio.bind(world.events, { world: () => world });
    const on = <K extends keyof GameEvents>(name: K, fn: (e: GameEvents[K]) => void) => this.offs.push(world.events.on(name, fn));

    // Feel (attract mode too).
    on('hitstop', (e) => {
      if (this.time.hitstop(e.ms) > 0) this.stopTicking = true;
    });
    on('slowmo', (e) => this.time.slowmo(e.scale, e.seconds));
    if (attract) return;

    // Flow.
    on('chapterSplash', (e) => {
      this.screens.showChapterSplash(e.num, e.name, e.clock, 2600);
      this.chapterMoney = world.player.stats.earned;
    });
    on('chapterStart', (e) => {
      if (e.num > 1) this.after(0.4, () => this.hud.callout('The crane is rehung · the horn is ready', 'info'));
      else if (this.firstNight && !this.bot) {
        // First night on the pier: the two things you need before the first one arrives.
        this.after(0.6, () =>
          this.hud.callout(this.input.device === 'pad' ? 'Hold A or RT to fire · left stick to move' : 'Hold Space (or click) to fire · W A S D to move', 'info'),
        );
        this.after(5.5, () => this.hud.callout('If one of them reaches the gangway, nobody sails', 'danger'));
      }
    });
    on('bossSpawn', (e) => {
      this.hud.callout(e.name, 'boss');
      const line = BOSS_LINES[e.num];
      if (line) this.after(2.2, () => this.hud.callout(line, 'info'));
    });
    on('chapterComplete', (e) => {
      this.savedPassengers += world.passengers;
      const earned = world.player.stats.earned - this.chapterMoney;
      this.after(1.4, () => {
        this.hud.callout(e.num >= CHAPTERS.length ? 'THE LAST FERRY IS BOARDED' : 'PIER HELD', 'nice');
        this.hud.callout(`${world.passengers} passengers aboard · $${earned.toLocaleString('en-US')} earned`, 'info');
      });
    });
    on('gameOver', () => this.beginGameOver());
    on('victory', () => this.beginVictory());

    // Callouts.
    on('niceShot', (e) => this.callout(e.n >= 6 ? `MASSACRE ×${e.n}` : `NICE SHOT ×${e.n}`, e.n >= 6 ? 'massacre' : 'nice'));
    on('headshotStreak', (e) => {
      // A long streak would re-pop the callout on every kill: milestones always, the rest at most every 0.45 s.
      if (e.n < 3) return;
      if (e.n === 3 || e.n % 5 === 0 || this.clock - this.lastHeadshotCallout >= 0.45) {
        this.lastHeadshotCallout = this.clock;
        this.callout(`HEADSHOT ×${e.n}`, 'headshot');
      }
    });
    on('money', (e) => {
      if (e.playerId !== 0) return;
      if (e.reason === 'tidy') this.tidy++;
      this.pops.add(e.amount, e.reason, e.x, e.y, e.z);
    });
    on('stomp', (e) => {
      if (e.playerId === 0 && this.tidy > 0) this.callout(this.tidy > 1 ? `TIDY ×${this.tidy}` : 'TIDY', 'tidy');
      this.tidy = 0;
    });
    on('horn', () => this.hud.callout('The ferry sounds its horn', 'info'));
    on('crane', (e) => {
      if (e.state === 'falling') this.hud.callout('Crates away!', 'info');
    });
    on('cannonStrike', () => this.hud.callout('Deck gun: three shells inbound', 'info'));
    on('favour', (e) => {
      if (e.ready && !this.told.has('favour')) {
        this.told.add('favour');
        this.hud.callout("Captain's Favour is full · F calls the deck gun", 'info');
      }
    });
    on('corpseTwitch', () => this.teach('twitch', 'A body is twitching · stomp it (E) before it gets up', 'info'));
    on('corpseRise', () => this.teach('rise', 'They get back up. Not dead till the head’s gone.', 'danger'));
    on('grab', (e) => {
      if (e.playerId === 0) this.teach('grab', 'Grabbed! Stomp (E) to shake them off', 'danger');
    });
    on('playerHurt', (e) => {
      if (e.playerId === 0) this.damagePulse = Math.min(1, this.damagePulse + 0.25 + e.damage / 30);
    });
    on('shot', (e) => {
      if (e.playerId === 0) this.kick = 1;
    });
  }

  /** Set during a logic tick that triggered a hit-stop: no more ticks this frame. */
  private stopTicking = false;

  private teach(key: string, text: string, kind: 'info' | 'danger'): void {
    if (this.told.has(key)) return;
    this.told.add(key);
    this.hud.callout(text, kind);
  }

  private lastHeadshotCallout = -1;
  private bigUntil = 0;
  private bigRank = 0;
  /** Big callouts by priority: a lesser one does not knock out a bigger one that just appeared. */
  private callout(text: string, kind: 'nice' | 'massacre' | 'headshot' | 'tidy'): void {
    const rank = { tidy: 1, headshot: 2, nice: 3, massacre: 4 }[kind];
    if (this.clock < this.bigUntil && rank < this.bigRank) return;
    this.bigRank = rank;
    this.bigUntil = this.clock + (kind === 'tidy' ? 0.5 : 0.7);
    this.hud.callout(text, kind);
  }

  /** Run `fn` after `seconds` of game time (paused time and hit-stops don't count). */
  private after(seconds: number, fn: () => void): void {
    this.later.push({ at: this.gameClock + seconds, fn });
  }

  pause(): void {
    if (this.mode !== 'playing') return;
    this.mode = 'paused';
    this.input.enabled = false;
    this.input.clear();
    this.audio.setPaused(true);
    this.screens.showPause({
      onResume: () => this.resume(),
      onRestart: () => this.newGame(),
      onQuit: () => this.showTitle(),
    });
  }

  resume(): void {
    if (this.mode !== 'paused') return;
    this.screens.close();
    this.mode = 'playing';
    this.input.clear();
    this.input.enabled = !this.autoplay;
    this.audio.setPaused(false);
  }

  private beginGameOver(): void {
    const w = this.world;
    if (!w || this.mode === 'over' || this.mode === 'title') return;
    this.mode = 'over';
    this.input.enabled = false;
    this.seqT = 0;
    this.seqShown = false;
    this.time.slowmo(GAMEOVER.slowScale, GAMEOVER.slowSeconds);
    this.env.flashScreen(0.45, 0xff2a18);
    const info = w.gameOverInfo;
    this.endStats = runStats(w, w.player.stats, w.tick * TICK, { passengersSaved: this.savedPassengers + w.boarded });
    if (info?.reason === 'gangway') this.hud.callout('One of them made it up the gangway!', 'danger');
  }

  private beginVictory(): void {
    const w = this.world;
    if (!w || this.mode === 'title') return;
    this.mode = 'victory';
    // The pier lives on while the ferry pulls away; the Bosun keeps his gun until the results.
    w.aftermath = true;
    this.seqT = 0;
    this.seqShown = false;
    this.departure = 0;
    this.endStats = runStats(w, w.player.stats, w.tick * TICK, { passengersSaved: this.savedPassengers });
  }

  private sequences(dt: number): void {
    if (this.mode === 'over') {
      this.seqT += dt;
      if (!this.seqShown && this.seqT >= GAMEOVER.screenAt) {
        this.seqShown = true;
        const w = this.world!;
        const info = w.gameOverInfo;
        this.hud.setVisible(false);
        this.screens.showGameOver(info?.reason ?? 'gangway', this.endStats ?? runStats(w, w.player.stats, w.tick * TICK), {
          onRetry: () => this.newGame(),
          onTitle: () => this.showTitle(),
        }, w.describeGameOver() || undefined);
      }
    } else if (this.mode === 'victory') {
      const t0 = this.seqT;
      this.seqT += dt;
      const t = this.seqT;
      if (t0 < VICTORY.hornAt && t >= VICTORY.hornAt) this.env.ferryHorn();
      if (t0 < VICTORY.hudOffAt && t >= VICTORY.hudOffAt) this.hud.setVisible(false);
      const k = Math.min(1, Math.max(0, (t - VICTORY.departAt) / VICTORY.departSeconds));
      const d = k * k * (3 - 2 * k);
      if (d !== this.departure) {
        this.departure = d;
        this.env.setDeparture(d);
      }
      if (!this.seqShown && t >= VICTORY.screenAt) {
        this.seqShown = true;
        const w = this.world!;
        this.screens.showVictory(this.endStats ?? runStats(w, w.player.stats, w.tick * TICK), {
          onRetry: () => this.newGame(),
          onTitle: () => this.showTitle(),
        });
      }
    }
  }

  // ------------------------------------------------------------------ input

  private slot(id: WeaponId): void {
    const w = this.world;
    if (!this.controlling || !w || this.bot) return;
    const p = w.player;
    if (!p.has(id) && p.money < WEAPONS[id].price) {
      this.hud.denySlot(id);
      this.audio.ui('deny');
      return;
    }
    p.selectOrBuy(id);
  }

  private action(a: Action): void {
    if (a.kind === 'pause') {
      if (this.mode === 'playing' && !this.screens.isMenuOpen) this.pause();
      return;
    }
    const w = this.world;
    if (!this.controlling || !w || this.bot) return;
    const p = w.player;
    switch (a.kind) {
      case 'reload':
        p.reload();
        break;
      case 'buyBest':
        if (!p.buyBest()) this.audio.ui('deny');
        break;
      case 'cycle':
        p.cycle(a.dir);
        break;
      case 'slot':
        this.slot(a.id);
        break;
      case 'press':
        // The press reaches the logic on the next tick; here only feedback when it can't do anything.
        if (a.verb === 'horn' && !w.hornReady) {
          this.audio.ui('deny');
          this.hud.callout('The horn sounds once per chapter', 'info');
        } else if (a.verb === 'cannon') {
          if (!w.favourReady) {
            this.audio.ui('deny');
            this.hud.callout(`Captain's Favour ${Math.floor(w.favour)}% · the deck gun needs 100%`, 'info');
          } else if (!w.pier.pickTargets(p).length) {
            this.audio.ui('deny');
            this.hud.callout('Nothing for the deck gun to shoot at', 'info');
          }
        }
        break;
    }
  }

  // ------------------------------------------------------------------ frame

  private frame(dt: number): void {
    this.clock += dt;
    this.fpsAcc += dt;
    this.fpsFrames++;
    if (this.fpsAcc >= 0.5) {
      this.fps = this.fpsFrames / this.fpsAcc;
      this.fpsAcc = 0;
      this.fpsFrames = 0;
      if (this.screens.options.showFps) this.screens.setFps(this.fps);
    }
    this.input.enabled = this.controlling && !this.autoplay && !this.screens.isMenuOpen;
    this.input.poll();
    for (const a of this.input.takeActions()) this.action(a);

    // Title: keep warming rigs / shaders in the background.
    if (this.mode === 'title') this.view.prewarm(3);

    const w = this.world;
    const paused = this.mode === 'paused' || this.mode === 'boot';
    const gdt = paused ? 0 : this.time.advance(dt * this.speed);
    this.gameClock += gdt;
    for (const l of this.later.length ? [...this.later] : []) {
      if (this.gameClock >= l.at) {
        this.later.splice(this.later.indexOf(l), 1);
        l.fn();
      }
    }
    if (w && !paused) {
      this.acc += gdt;
      const maxSteps = Math.ceil(6 * Math.max(1, this.speed));
      let steps = 0;
      this.stopTicking = false;
      while (this.acc >= TICK && steps < maxSteps) {
        this.acc -= TICK;
        steps++;
        if (this.bot) this.bot.think(w);
        else if (this.controlling) Object.assign(w.player.input, this.input.tickInput(this.tickIn));
        else Object.assign(w.player.input, IDLE);
        this.view.beforeStep();
        w.step();
        if (this.mode === 'title' && w.gameEnded) break;
        if (this.stopTicking) {
          this.acc = Math.min(this.acc, TICK * 0.5);
          break;
        }
      }
      if (steps >= maxSteps) this.acc = Math.min(this.acc, TICK);
      if (this.mode === 'title' && w.gameEnded) this.restartAttractSoon(dt);
      if (this.mode === 'playing' && !w.gameEnded) this.watchPlay(w, dt);
    }
    const alpha = Math.max(0, Math.min(1, this.acc / TICK));
    this.view.update(gdt, alpha);
    this.sequences(dt);

    // HUD, overlay, pop-ups.
    if (w && this.mode !== 'title' && this.mode !== 'boot') {
      this.snap = hudSnapshot(w, { out: this.snap });
      this.hud.update(this.snap);
      this.damagePulse = Math.max(0, this.damagePulse - dt * 1.6);
      this.kick = Math.max(0, this.kick - gdt / 0.12);
      const f = overlayFrame(w, this.project, {
        recentDamage: this.damagePulse,
        kick: this.kick,
        showCrosshair: this.mode === 'playing' || this.mode === 'paused' || (this.controlling && !this.autoplay),
      });
      if (this.mode === 'over') {
        const reason = w.gameOverInfo?.reason;
        if (reason === 'gangway') f.danger = 1;
        else f.damage = Math.max(f.damage ?? 0, 0.9);
      } else if (this.mode === 'victory') {
        f.danger = 0;
        f.damage = 0;
        f.twitches = [];
      }
      this.overlay.render(f, this.mode === 'paused' ? 0 : dt);
      if (this.mode === 'victory') this.pops.clear();
      else this.pops.flush(this.clock, (p) => this.overlay.popMoneyAt(p.x, p.y, p.z, p.amount, p.reason));
    } else {
      this.overlay.render(EMPTY_FRAME, dt);
    }
    this.audio.update(dt);
  }

  /** The human drives the Bosun: playing, or the departure before the results appear. */
  private get controlling(): boolean {
    return this.mode === 'playing' || (this.mode === 'victory' && !this.seqShown);
  }

  private attractEndT = 0;
  private restartAttractSoon(dt: number): void {
    this.attractEndT += dt;
    if (this.attractEndT > 3) {
      this.attractEndT = 0;
      this.startAttract();
    }
  }

  /** Danger line near the gangway, weapon-for-sale hints. */
  private watchPlay(w: World, dt: number): void {
    this.dangerCool -= dt;
    const d = this.snap?.danger ?? 0;
    if (d > 0.72 && this.dangerCool <= 0) {
      this.dangerCool = 6;
      this.hud.callout('One of them is at the gangway!', 'danger');
    }
    if (this.bot) return;
    const p = w.player;
    let best: WeaponId | null = null;
    for (const id of WEAPON_ORDER) if (!p.has(id) && p.money >= WEAPONS[id].price) best = id;
    if (best && best !== this.bestAffordable && !this.told.has(`buy-${best}`) && WEAPON_ORDER.indexOf(best) > WEAPON_ORDER.indexOf(this.bestAffordable ?? 'revolver')) {
      this.told.add(`buy-${best}`);
      this.hud.callout(`${WEAPONS[best].name} for $${WEAPONS[best].price.toLocaleString('en-US')} · press B`, 'info');
    }
    this.bestAffordable = best ?? this.bestAffordable;
  }

  // ------------------------------------------------------------------ debug

  /** Debug / tests: hand the running game to the bot (or take it back). */
  setAutoplay(on: boolean): void {
    this.autoplay = on;
    const w = this.world;
    if (!w || this.mode === 'title') return;
    this.bot = on ? new Bot(w.player, { skill: 0.92 }) : null;
    this.input.clear();
    if (on) this.screens.recordRuns = false;
  }

  /** Debug: add a zombie to the running world. */
  spawn(kind: ZombieKind, x?: number, z?: number, opts: SpawnOpts = {}): Zombie | null {
    return this.world ? this.world.spawn(kind, x, z, opts) : null;
  }

  get stats(): Record<string, unknown> {
    const w = this.world;
    return {
      mode: this.mode,
      chapter: w?.chapter,
      phase: w?.phase,
      t: w ? Math.round((w.tick / TICK_RATE) * 10) / 10 : 0,
      boarded: w?.boarded,
      bossLife: w?.bossLife,
      kills: w?.player.stats.kills,
      money: w?.player.money,
      weapon: w?.player.weapon.id,
      life: w ? Math.round(w.player.life) : 0,
      zombies: w?.zombies.length,
      corpses: w?.corpses.length,
      view: this.view.stats,
      pops: this.pops.stats,
      slow: this.time.slow,
      departure: this.departure,
      screen: this.screens.current,
    };
  }
}

const IDLE: HeldInput = { left: false, right: false, up: false, down: false, fire: false, jump: false, horn: false, cannon: false };
const EMPTY_FRAME = {};
