// Application controller: title (attract mode), playing, paused, game over,
// victory. Runs the logic at a fixed 50 Hz and renders every frame.
//
// View modes: the classic fixed camera, or first person (Options.view, V to
// toggle). First person integrates mouse / right-stick look into Player.aim
// every frame and maps WASD / the left stick relative to the view heading into
// PlayerInput.move. The title's attract mode always runs in the classic view.
import { FIELD_HALF_W, PLAYER, PLAYER_Z_MAX, PLAYER_Z_MIN, TICK, TICK_RATE, escapeX } from '../config/constants';
import { FP, headingDir, rightDir, wrapAngle, type Aim, type ViewMode } from '../config/firstPerson';
import { HUD_WEAPONS, WEAPONS, type WeaponId } from '../config/weapons';
import { World } from '../core/World';
import { Bot, createTeammateBots } from '../core/Bot';
import { teamColor } from '../config/team';
import type { HudTeammate } from '../ui/hudTypes';
import type { Stage } from '../render/Stage';
import type { Environment } from '../render/env/Environment';
import { GameView } from '../render/GameView';
import { DECAL_RECT } from '../render/BloodSystem';
import { Hud, type HudRadar, type HudSnapshot } from '../ui/Hud';
import { WorldOverlay } from '../ui/WorldOverlay';
import { Screens, type GameStats, type Options } from '../ui/Screens';
import type { AudioSystem } from '../audio/AudioSystem';
import { Input } from './Input';

type Mode = 'title' | 'playing' | 'paused' | 'ended';

const BLOOD_AMOUNT = { low: 0.5, normal: 1.35, max: 2.2 } as const;

export class Game {
  readonly view: GameView;
  readonly hud: Hud;
  readonly overlay: WorldOverlay;
  readonly screens: Screens;
  readonly input: Input;
  world: World | null = null;
  private bot: Bot | null = null;
  /** Bot teammates of the running game. */
  private teamBots: Bot[] = [];
  private readonly team: HudTeammate[] = [];
  private spectateNoted = false;
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
  /** Testing (URL ?team=N): teammates regardless of the options. */
  teammatesOverride: number | null = null;
  /** Show the "click to aim" hint when the mouse is not captured in first person (tests turn it off). */
  lockHint = true;
  private readonly look = { x: 0, y: 0 };
  private savedAim: Aim | null = null;
  private savedAimWorld: World | null = null;
  private readonly move = { x: 0, z: 0 };
  private readonly heading = { x: 0, z: 0 };
  private readonly right = { x: 0, z: 0 };
  private readonly listener = { x: 0, z: 0, yaw: 0 };
  private readonly radar: HudRadar = { minX: 0, maxX: 0, minZ: 0, maxZ: 0, escapeX: 0, player: { x: 0, z: 0, yaw: 0 }, enemies: [] };

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
    this.input.onLockLost = () => {
      // Esc (or focus loss) released the mouse while playing in first person: pause.
      if (this.mode === 'playing' && this.fp) this.togglePause();
    };
    this.applyOptions(this.screens.options);

    stage.onUpdate((dt) => this.frame(dt));
  }

  // ------------------------------------------------------------------ options
  private applyOptions(o: Options): void {
    this.audio.setVolumes(o.masterVolume, o.sfxVolume, o.ambience);
    this.view.blood.amount = BLOOD_AMOUNT[o.blood];
    this.view.laserSight = o.laserSight && this.mode !== 'title';
    const q = o.quality;
    this.stage.maxPixelRatio = q === 'low' ? 1 : q === 'medium' ? 1.5 : 2;
    this.stage.renderer.shadowMap.enabled = q !== 'low';
    this.view.effects.density = q === 'low' ? 0.5 : 1;
    this.stage.resize();
    this.screens.setFps(o.showFps ? 0 : null);
    this.hud.setStyle(o.hudStyle);
    this.overlay.setStyle(o.hudStyle);
    // The attract mode stays classic; the chosen view applies to games.
    if (this.mode !== 'title') this.applyView(o.view);
  }

  /** The human is down but bot teammates are still hunting. */
  private get spectating(): boolean {
    const w = this.world;
    return !!w && this.mode !== 'title' && !w.player.alive && !w.gameEnded && w.players.some((p) => p.alive);
  }

  /** Current view of the running game. */
  private get fp(): boolean {
    return this.stage.viewMode === 'first';
  }

  /** Switch the running game between the classic view and first person. */
  private applyView(view: ViewMode): void {
    // Down while the team fights on: watch them from the classic camera.
    if (this.spectating) view = 'third';
    this.stage.setViewMode(view);
    const fp = view === 'first';
    this.input.pointerLookMode = fp && !this.autoplay;
    const w = this.world;
    if (w && this.mode !== 'title') {
      const p = w.player;
      if (fp && !this.bot) {
        // Toggling back and forth keeps the heading of this game; a new game starts facing left.
        if (!p.aim) p.aim = this.savedAim && this.savedAimWorld === w ? { ...this.savedAim } : { yaw: 0, pitch: -0.08 };
      } else {
        if (p.aim) {
          this.savedAim = { ...p.aim };
          this.savedAimWorld = w;
        }
        p.aim = null;
        p.input.move = undefined;
      }
    }
    if (!fp) {
      this.input.releaseLock();
      this.audio.setListener(null);
    } else if (this.mode === 'playing' && !this.autoplay) {
      this.input.requestLock();
    }
  }

  // ------------------------------------------------------------------ flow
  showTitle(): void {
    this.mode = 'title';
    this.view.laserSight = false;
    // Attract mode always runs in the classic view.
    this.stage.setViewMode('third');
    this.input.pointerLookMode = false;
    this.input.releaseLock();
    this.audio.setListener(null);
    this.startWorld(true);
    this.hud.setVisible(false);
    this.input.enabled = false;
    this.screens.showTitle({
      onStart: (view?: ViewMode) => {
        if (view) this.screens.setOption('view', view);
        this.newGame();
      },
    });
  }

  newGame(): void {
    this.audio.unlock();
    this.screens.hideAll();
    this.mode = 'playing';
    this.view.laserSight = this.screens.options.laserSight;
    this.startWorld(false);
    this.hud.setVisible(true);
    this.input.enabled = true;
    this.input.clear();
    this.applyView(this.screens.options.view);
    this.audio.startAmbience();
  }

  private startWorld(attract: boolean): void {
    this.unbindAudio?.();
    this.unbindAudio = null;
    const teammates = attract ? 0 : (this.teammatesOverride ?? this.screens.options.teammates);
    const world = new World({ seed: (Math.random() * 1e9) >>> 0, teammates, ...(attract ? {} : this.worldOptions) });
    this.world = world;
    // The demo hunter stands mid-right like the player in the reference frames.
    this.bot = attract || this.autoplay ? new Bot(world.player, { skill: attract ? 0.8 : 0.95, homeX: 10, maxRange: 22 }) : null;
    this.teamBots = createTeammateBots(world);
    this.team.length = 0;
    this.spectateNoted = false;
    this.view.attach(world);
    this.acc = 0;
    this.endTimer = -1;
    if (!attract) {
      this.unbindAudio = this.audio.bindGameEvents(
        world.events,
        (id) => world.enemyById(id)?.x,
        (pid) => world.players[pid]?.x ?? 0,
        { getZ: (id) => world.enemyById(id)?.z },
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
      this.input.releaseLock();
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
    // Called from the Resume click / key: still inside the user gesture, so the lock is granted.
    if (this.fp && !this.autoplay) this.input.requestLock();
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
      if (a.kind === 'toggleView') {
        this.screens.setOption('view', this.fp ? 'third' : 'first');
        continue;
      }
      if (a.kind === 'reload') p.reload();
      else if (a.kind === 'buyBest') p.buyBest();
      else if (a.kind === 'cycle') p.cycle(a.dir);
      else if (a.kind === 'slot') p.selectOrBuy(a.id);
    }

    const w = this.world;
    this.updateLook(dt);
    const running = w && (this.mode === 'playing' || this.mode === 'title' || this.mode === 'ended');
    if (w && running) {
      this.acc += dt * this.timeScale;
      let steps = 0;
      while (this.acc >= TICK && steps < 8) {
        this.acc -= TICK;
        steps++;
        for (const b of this.teamBots) b.think(w);
        if (this.bot) this.bot.think(w);
        else {
          Object.assign(w.player.input, this.input.held);
          w.player.input.move = w.player.aim ? this.moveInput(w.player.aim.yaw) : undefined;
        }
        this.view.beforeStep();
        w.step();
        if (this.mode === 'playing') {
          for (const pl of w.players) {
            const wp = pl.weapon;
            this.audio.weaponTick({
              playerId: pl.id,
              id: wp.id,
              state: wp.state,
              ticks: wp.ticks,
              fireTicks: wp.fireTicks,
              reloadTicks: wp.def.reloadTicks,
              firingHeld: pl.input.fire && pl.alive,
              x: pl.x,
            });
          }
        }
      }
      if (steps === 8) this.acc = 0;
      if (w.gameEnded) this.onEnded(w, dt);
      else if (this.mode === 'playing' && this.spectating && !this.spectateNoted) {
        this.spectateNoted = true;
        this.screens.message("You're down - your team fights on");
        if (this.fp) this.applyView('third');
      }
    }

    const alpha = this.mode === 'paused' ? 1 : Math.min(1, this.acc / TICK);
    this.view.update(this.mode === 'paused' ? 0 : dt, alpha);
    this.env.update(dt, performance.now() / 1000);

    if (w && (this.mode === 'playing' || this.mode === 'paused' || this.mode === 'ended')) {
      this.hud.update(this.snapshot(w));
      const ov = this.view.overlay();
      if (this.fp && this.mode === 'playing' && this.lockHint && this.input.pointerLookMode && !this.input.locked) {
        ov.texts.push({ x: this.stage.viewW / 2, y: this.stage.viewH / 2 + 46 * this.stage.scale, text: 'Click to aim', color: 'rgba(255,255,255,0.9)', alpha: 0.75 + 0.25 * Math.sin(performance.now() / 300), size: 11, bold: true, role: 'label' });
      }
      this.overlay.render({
        crosshairs: ov.crosshairs,
        texts: ov.texts,
        vignette: ov.vignette,
        hitMarker: ov.hitMarker,
        hitMarkerKill: ov.hitMarkerKill,
      });
    } else {
      this.overlay.render({ crosshairs: [], texts: [] });
    }
  }

  /** First person: integrate mouse / right-stick look into the player's aim (every frame). */
  private updateLook(dt: number): void {
    const look = this.input.takeLook(this.look);
    const w = this.world;
    if (!w || !this.fp || this.mode !== 'playing') {
      this.audio.setListener(null);
      return;
    }
    const p = w.player;
    if (p.aim && p.alive) {
      const o = this.screens.options;
      const sens = o.mouseSensitivity > 0 ? o.mouseSensitivity : 1;
      const inv = o.invertY ? -1 : 1;
      const pad = this.input.padLook;
      // Mouse right / stick right turn right (yaw decreases); mouse up / stick up look up.
      let yaw = p.aim.yaw - look.x * FP.mouseRadPerPx * sens - pad.x * FP.stickRadPerSec * sens * dt;
      let pitch = p.aim.pitch - inv * look.y * FP.mouseRadPerPx * sens + inv * pad.y * FP.stickRadPerSec * 0.75 * sens * dt;
      yaw = wrapAngle(yaw);
      pitch = Math.max(FP.pitchMin, Math.min(FP.pitchMax, pitch));
      p.aim.yaw = yaw;
      p.aim.pitch = pitch;
    }
    const l = this.listener;
    l.x = p.x;
    l.z = p.z;
    l.yaw = this.view.camAim.yaw;
    this.audio.setListener(l);
  }

  /** First person: WASD / arrows / left stick relative to the view heading, as a world-space direction. */
  private moveInput(yaw: number): { x: number; z: number } {
    const h = this.input.held;
    const st = this.input.stick;
    let f = (h.up ? 1 : 0) - (h.down ? 1 : 0);
    let s = (h.right ? 1 : 0) - (h.left ? 1 : 0);
    // An analog stick replaces the digital directions it also set.
    if (st.x !== 0 || st.y !== 0) {
      f = st.y;
      s = st.x;
    }
    const l = Math.hypot(f, s);
    if (l > 1) {
      f /= l;
      s /= l;
    }
    headingDir(yaw, this.heading);
    rightDir(yaw, this.right);
    this.move.x = this.heading.x * f + this.right.x * s;
    this.move.z = this.heading.z * f + this.right.z * s;
    return this.move;
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
      this.input.releaseLock();
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
    const wp = p.weapon;
    return {
      view: this.stage.viewMode,
      health: Math.max(0, Math.min(1, p.life / PLAYER.life)),
      weapon: { id: wp.id, name: wp.def.name, bullets: wp.bullets, clip: wp.def.clip, reload: wp.state === 'reload' ? wp.reloadProgress : null },
      radar: this.radarSnapshot(w),
      team: this.teamSnapshot(w),
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

  /** Bot teammates for the HUD team list (the array and its entries are reused). */
  private teamSnapshot(w: World): HudTeammate[] {
    const t = this.team;
    let n = 0;
    for (const p of w.players) {
      if (!p.isBot) continue;
      const s = t[n] ?? (t[n] = { name: '', color: '', kills: 0, money: 0, weapon: '', alive: true });
      s.name = p.name;
      s.color = teamColor(p.id).ui;
      s.kills = p.stats.kills;
      s.money = p.money;
      s.weapon = p.weapon.def.name;
      s.alive = p.alive;
      n++;
    }
    t.length = n;
    return t;
  }

  /** Top-down field for the HUD radar (cheap; the arrays are reused). */
  private radarSnapshot(w: World): HudRadar {
    const r = this.radar;
    const p = w.player;
    r.minX = -FIELD_HALF_W - 2;
    r.minZ = Math.min(w.laneMin, PLAYER_Z_MIN) - 0.5;
    r.maxZ = Math.max(w.laneMax, PLAYER_Z_MAX) + 0.5;
    r.escapeX = escapeX((w.laneMin + w.laneMax) / 2, 0);
    r.maxX = r.escapeX + 1;
    r.player.x = p.x;
    r.player.z = p.z;
    r.player.yaw = p.aim ? this.view.camAim.yaw : 0;
    let n = 0;
    for (const e of w.enemies) {
      if (!e.alive || e.removed) continue;
      const slot = r.enemies[n] ?? (r.enemies[n] = { x: 0, z: 0, type: e.type, boss: false });
      slot.x = e.x;
      slot.z = e.z;
      slot.type = e.type;
      slot.boss = e.isBoss;
      n++;
    }
    r.enemies.length = n;
    const mates = r.teammates ?? (r.teammates = []);
    let m = 0;
    for (const q of w.players) {
      if (!q.isBot || !q.alive) continue;
      const slot = mates[m] ?? (mates[m] = { x: 0, z: 0, color: '' });
      slot.x = q.x;
      slot.z = q.z;
      slot.color = teamColor(q.id).ui;
      m++;
    }
    mates.length = m;
    return r;
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
