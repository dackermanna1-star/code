// Application controller: title (attract mode), playing, paused, game over,
// victory. Runs the logic at a fixed 50 Hz and renders every frame.
import { TICK, TICK_RATE } from '../config/constants';
import { HUD_WEAPONS, WEAPONS, type WeaponId } from '../config/weapons';
import { World } from '../core/World';
import { Bot } from '../core/Bot';
import type { Stage } from '../render/Stage';
import type { Environment } from '../render/env/Environment';
import { GameView } from '../render/GameView';
import { DECAL_RECT } from '../render/BloodSystem';
import { Hud, type HudSnapshot } from '../ui/Hud';
import { WorldOverlay } from '../ui/WorldOverlay';
import { Screens, type GameStats, type Options } from '../ui/Screens';
import type { AudioSystem } from '../audio/AudioSystem';
import { Input } from './Input';

type Mode = 'title' | 'playing' | 'paused' | 'ended';

const BLOOD_AMOUNT = { low: 0.4, normal: 1, max: 1.8 } as const;

export class Game {
  readonly view: GameView;
  readonly hud: Hud;
  readonly overlay: WorldOverlay;
  readonly screens: Screens;
  readonly input: Input;
  world: World | null = null;
  private bot: Bot | null = null;
  private mode: Mode = 'title';
  private acc = 0;
  private endTimer = -1;
  private fpsAcc = 0;
  private fpsFrames = 0;
  private unbindAudio: (() => void) | null = null;
  /** Debug/testing: time scale and auto-play. */
  timeScale = 1;
  autoplay = false;
  /** Testing: options for new worlds (god mode, start level, money). */
  worldOptions: { god?: boolean; startLevel?: number; money?: number } = {};

  constructor(
    private stage: Stage,
    private env: Environment,
    private audio: AudioSystem,
    icons: Partial<Record<WeaponId, string>>,
  ) {
    this.view = new GameView(stage);
    this.view.setFloeTest((x, z) => env.isOnFloe(x, z));
    env.setDecalMap(this.view.blood.texture, DECAL_RECT);
    this.view.sound = (name, x, volume) => audio.play(name, { x, volume });
    this.view.soundRandom = (prefix, x, volume) => audio.playRandom(prefix, { x, volume });

    this.hud = new Hud(stage.view, icons);
    this.hud.onSlotClick = (id) => this.slot(id);
    this.hud.levelBarTint = false; // ref2 shows a pure white bar near the end
    this.overlay = new WorldOverlay(stage.view);
    this.screens = new Screens(stage.view);
    this.screens.onOptionsChange = (o) => this.applyOptions(o);
    this.input = new Input(stage.view);
    this.input.onActivity = () => audio.unlock();
    this.applyOptions(this.screens.options);

    stage.onUpdate((dt) => this.frame(dt));
  }

  // ------------------------------------------------------------------ options
  private applyOptions(o: Options): void {
    this.audio.setVolumes(o.masterVolume, o.sfxVolume, o.ambience);
    this.view.blood.amount = BLOOD_AMOUNT[o.blood];
    const q = o.quality;
    this.stage.maxPixelRatio = q === 'low' ? 1 : q === 'medium' ? 1.5 : 2;
    this.stage.renderer.shadowMap.enabled = q !== 'low';
    this.view.effects.density = q === 'low' ? 0.5 : 1;
    this.stage.resize();
    this.screens.setFps(o.showFps ? 0 : null);
  }

  // ------------------------------------------------------------------ flow
  showTitle(): void {
    this.mode = 'title';
    this.startWorld(true);
    this.hud.setVisible(false);
    this.input.enabled = false;
    this.screens.showTitle({ onStart: () => this.newGame() });
  }

  newGame(): void {
    this.audio.unlock();
    this.screens.hideAll();
    this.startWorld(false);
    this.mode = 'playing';
    this.hud.setVisible(true);
    this.input.enabled = true;
    this.input.clear();
    this.audio.startAmbience();
  }

  private startWorld(attract: boolean): void {
    this.unbindAudio?.();
    this.unbindAudio = null;
    const world = new World({ seed: (Math.random() * 1e9) >>> 0, ...(attract ? {} : this.worldOptions) });
    this.world = world;
    this.bot = attract || this.autoplay ? new Bot(world.player, { skill: attract ? 0.8 : 0.95 }) : null;
    this.view.attach(world);
    this.acc = 0;
    this.endTimer = -1;
    if (!attract) {
      this.unbindAudio = this.audio.bindGameEvents(
        world.events,
        (id) => world.enemyById(id)?.x,
        (pid) => world.players[pid]?.x ?? 0,
      );
      world.events.on('levelSplash', (e) => this.screens.showSplash(e.num === 6 ? e.name : e.name, 2080));
      world.events.on('niceShot', (e) => {
        if (e.n >= 3) this.screens.message(e.n >= 6 ? 'Massacre!' : 'Nice shot!');
      });
    }
  }

  private togglePause(): void {
    if (this.mode === 'playing') {
      this.mode = 'paused';
      this.input.enabled = false;
      this.audio.suspend();
      this.screens.showPause({
        onResume: () => this.resume(),
        onRestart: () => {
          this.audio.resume();
          this.newGame();
        },
        onQuit: () => {
          this.audio.resume();
          this.audio.stopAmbience();
          this.showTitle();
        },
      });
    } else if (this.mode === 'paused') {
      this.resume();
    }
  }

  private resume(): void {
    this.screens.hideAll();
    this.mode = 'playing';
    this.input.enabled = true;
    this.input.clear();
    this.audio.resume();
  }

  private slot(id: WeaponId): void {
    if (this.mode !== 'playing' || !this.world) return;
    this.world.player.selectOrBuy(id);
  }

  // ------------------------------------------------------------------ frame
  private frame(dt: number): void {
    this.fpsAcc += dt;
    this.fpsFrames++;
    if (this.fpsAcc >= 0.5) {
      if (this.screens.options.showFps) this.screens.setFps(Math.round(this.fpsFrames / this.fpsAcc));
      this.fpsAcc = 0;
      this.fpsFrames = 0;
    }

    this.input.poll();
    for (const a of this.input.takeActions()) {
      if (a.kind === 'pause') {
        if (this.mode === 'playing' || this.mode === 'paused') this.togglePause();
        continue;
      }
      if (this.mode !== 'playing' || !this.world) continue;
      const p = this.world.player;
      if (a.kind === 'reload') p.reload();
      else if (a.kind === 'buyBest') p.buyBest();
      else if (a.kind === 'cycle') p.cycle(a.dir);
      else if (a.kind === 'slot') p.selectOrBuy(a.id);
    }

    const w = this.world;
    const running = w && (this.mode === 'playing' || this.mode === 'title' || this.mode === 'ended');
    if (w && running) {
      this.acc += dt * this.timeScale;
      let steps = 0;
      while (this.acc >= TICK && steps < 8) {
        this.acc -= TICK;
        steps++;
        if (this.bot) this.bot.think(w);
        else Object.assign(w.player.input, this.input.held);
        this.view.beforeStep();
        w.step();
        if (this.mode === 'playing') {
          const wp = w.player.weapon;
          this.audio.weaponTick({
            playerId: 0,
            id: wp.id,
            state: wp.state,
            ticks: wp.ticks,
            fireTicks: wp.fireTicks,
            reloadTicks: wp.def.reloadTicks,
            firingHeld: w.player.input.fire,
            x: w.player.x,
          });
        }
      }
      if (steps === 8) this.acc = 0;
      if (w.gameEnded) this.onEnded(w, dt);
    }

    const alpha = this.mode === 'paused' ? 1 : Math.min(1, this.acc / TICK);
    this.view.update(this.mode === 'paused' ? 0 : dt, alpha);
    this.env.update(dt, performance.now() / 1000);

    if (w && (this.mode === 'playing' || this.mode === 'paused' || this.mode === 'ended')) {
      this.hud.update(this.snapshot(w));
      const ov = this.view.overlay();
      this.overlay.render({ crosshairs: ov.crosshairs, texts: ov.texts, vignette: ov.vignette });
    } else {
      this.overlay.render({ crosshairs: [], texts: [] });
    }
  }

  private onEnded(w: World, dt: number): void {
    if (this.mode === 'title') {
      // Attract mode: restart quietly.
      if (this.endTimer < 0) this.endTimer = 3;
      this.endTimer -= dt;
      if (this.endTimer <= 0) this.startWorld(true);
      return;
    }
    if (this.mode !== 'ended') {
      this.mode = 'ended';
      this.input.enabled = false;
      this.endTimer = w.phase === 'victory' ? 2.5 : 1.6;
    }
    if (this.endTimer > 0) {
      this.endTimer -= dt;
      if (this.endTimer <= 0) {
        const stats = this.stats(w);
        const h = {
          onRetry: () => this.newGame(),
          onTitle: () => {
            this.audio.stopAmbience();
            this.showTitle();
          },
        };
        if (w.phase === 'victory') this.screens.showVictory(stats, h);
        else this.screens.showGameOver(w.describeGameOver(), stats, h);
      }
    }
  }

  snapshot(w: World): HudSnapshot {
    const p = w.player;
    const boss = w.level.seenBosses;
    return {
      mode: boss ? 'boss' : 'level',
      label: boss ? 'Boss:' : `Level ${w.levelNum}:`,
      progress: boss ? w.level.bossLife : w.level.progress,
      money: p.money,
      kills: p.stats.kills,
      slots: HUD_WEAPONS.map((id) => {
        const owned = p.weapons.get(id);
        return {
          id,
          price: WEAPONS[id].price,
          owned: !!owned,
          selected: p.weapon.id === id,
          affordable: p.money >= WEAPONS[id].price,
          caption: owned ? `x${owned.bullets}` : `$${WEAPONS[id].price}`,
        };
      }),
    };
  }

  stats(w: World): GameStats {
    const s = w.player.stats;
    let fav: WeaponId | null = null;
    let best = 0;
    for (const [id, n] of Object.entries(s.killsByWeapon) as Array<[WeaponId, number]>) {
      if (n > best) {
        best = n;
        fav = id;
      }
    }
    return {
      timeSec: w.tick / TICK_RATE,
      level: w.levelNum,
      levelName: w.level.def.name,
      kills: s.kills,
      killsByType: { ...s.killsByType },
      moneyEarned: s.moneyEarned,
      moneyLeft: w.player.money,
      shots: s.shots,
      hits: s.hits,
      headshots: s.headshots,
      niceShots: s.niceShots,
      bestNiceShot: s.bestNiceShot,
      weaponsBought: [...s.weaponsBought],
      favoriteWeapon: fav,
    };
  }
}
