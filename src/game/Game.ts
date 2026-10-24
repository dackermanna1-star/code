import * as THREE from 'three';
import { Engine, QUALITY_PRESETS } from '../core/Engine';
import { Input } from '../core/Input';
import { TimeControl } from '../core/Time';
import { Scheduler } from '../core/Scheduler';
import { SettingsStore, Records, type Settings, type QualityName } from '../core/Settings';
import { Physics } from '../physics/Physics';
import { ctx } from './ctx';
import { events } from './events';
import { Player } from '../player/Player';
import { CameraFX } from '../fx/CameraFX';
import { FX } from '../fx/FX';
import type { Character } from '../characters/Character';
import { CombatSystem } from './CombatSystem';
import { PropSystem } from '../world/Props';
import { WeaponSystem } from '../weapons/Weapons';
import { PlayerInteraction } from '../player/Interaction';
import { Gibs } from '../fx/Gibs';
import { buildBarLevel, type LevelInfo } from '../world/BarLevel';
import { LightManager } from '../render/LightManager';
import { NavGrid } from '../ai/NavGrid';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { AIManager } from '../ai/AIManager';
import { Director, type GameMode } from './Director';
import { PostFX } from '../render/PostFX';
import { HUD } from '../ui/HUD';
import { Menus } from '../ui/Menus';
import { AttractCam } from './AttractCam';
import { setupBarInteractions } from '../world/BarInteractions';

export type GameState = 'loading' | 'title' | 'playing' | 'paused' | 'over';

const DIFFICULTY = {
  easy: { ai: 0.75, incoming: 0.5, attackers: 1 },
  normal: { ai: 1, incoming: 0.75, attackers: 2 },
  hard: { ai: 1.3, incoming: 1.1, attackers: 3 },
};

function fmtTime(s: number): string {
  s = Math.max(0, Math.floor(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Free GPU resources of a discarded scene graph (materials are kept so shader programs stay cached). */
function disposeTree(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if ((o as THREE.InstancedMesh).isInstancedMesh || (o as THREE.BatchedMesh).isBatchedMesh) (o as THREE.InstancedMesh).dispose();
    else if (m.geometry) m.geometry.dispose();
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) (o as THREE.SkinnedMesh).skeleton?.dispose();
    const mats = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : [];
    for (const mat of mats) {
      for (const k in mat) {
        const v = (mat as any)[k];
        if (v && v.isTexture) v.dispose();
      }
      const u = (mat as THREE.ShaderMaterial).uniforms;
      if (u) for (const k in u) if (u[k].value?.isTexture) u[k].value.dispose();
    }
    const light = o as THREE.DirectionalLight;
    if (light.isLight && light.shadow?.map) light.shadow.dispose();
  });
}

/** Bootstraps systems, owns the round lifecycle and runs the main loop. */
export class Game {
  // ---- long-lived
  engine!: Engine;
  input!: Input;
  time = new TimeControl();
  readonly settings = new SettingsStore();
  readonly records = new Records();
  post!: PostFX;
  hud!: HUD;
  menus!: Menus;
  /** procedural audio (attached by main once constructed) */
  audio: any = null;
  state: GameState = 'loading';
  mode: GameMode = 'brawl';
  readonly params = new URLSearchParams(location.search);
  private envMap: THREE.Texture | null = null;
  private eventBase!: ReturnType<typeof events.snapshot>;
  private attract = new AttractCam();
  private lockFallback = false;
  private lockErrors = 0;
  private roundFresh = false;
  private compiled = false;

  // ---- per round
  physics!: Physics;
  player!: Player;
  camFx = new CameraFX();
  combat!: CombatSystem;
  fx!: FX;
  props!: PropSystem;
  weapons!: WeaponSystem;
  interaction!: PlayerInteraction;
  gibs!: Gibs;
  level!: LevelInfo;
  lightMgr!: LightManager;
  nav = new NavGrid();
  private navBuilt = false;
  sun!: THREE.DirectionalLight;
  ai!: AIManager;
  director!: Director;
  characters: Character[] = [];
  timers = new Scheduler();
  private bloodyFeet = new WeakMap<object, number>();
  private playerLeftFoot = false;

  // ---- loop
  private last = 0;
  private acc = 0;
  running = false;
  frameMs = 0;
  fps = 0;
  private fpsAcc = 0;
  private fpsFrames = 0;
  baseFov = 82;
  frameCount = 0;
  skipRender = false;

  get paused(): boolean {
    return this.state === 'paused';
  }

  async init(container: HTMLElement): Promise<void> {
    await Physics.create().then((p) => p.free()); // initialise the WASM module
    const qp = this.params.get('quality') as QualityName | null;
    const qName: QualityName = qp && qp in QUALITY_PRESETS ? qp : this.settings.value.quality;
    this.engine = new Engine(container, QUALITY_PRESETS[qName] ?? QUALITY_PRESETS.medium);
    this.input = new Input(this.engine.canvas);
    ctx.engine = this.engine;
    ctx.input = this.input;
    ctx.time = this.time;
    this.post = new PostFX(this.engine);
    const pmrem = new THREE.PMREMGenerator(this.engine.renderer);
    this.envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    const ui = document.getElementById('ui-root')!;
    this.hud = new HUD(this, ui);
    this.menus = new Menus(this, ui);
    this.settings.onChange((_s, key) => this.applySettings(key));
    this.applySettings(null);
    this.input.onLockChange = (locked) => this.onLockChange(locked);
    this.engine.canvas.addEventListener('click', () => {
      if (this.state === 'playing' && !this.input.locked && !this.lockFallback) this.requestLock();
    });
    window.addEventListener('keydown', (e) => this.onKey(e));
    if (this.params.has('nolock')) {
      // automated tests / environments without pointer lock
      this.lockFallback = true;
      this.input.allowUnlocked = true;
    }
    (window as any).__game = this;
    (window as any).__events = events;
  }

  /** Call once long-lived subscribers (HUD, audio) are attached. */
  async firstRound(): Promise<void> {
    this.eventBase = events.snapshot();
    const autoplay = this.params.has('autoplay') || this.params.has('mode');
    const mode: GameMode = this.params.get('mode') === 'survival' ? 'survival' : 'brawl';
    await this.newRound(mode, !autoplay);
  }

  // ------------------------------------------------------------------ settings
  private applySettings(key: keyof Settings | null): void {
    const s = this.settings.value;
    this.input.sensitivity = s.sensitivity;
    this.input.invertY = s.invertY;
    this.baseFov = s.fov;
    this.camFx.intensity = s.shake;
    if (this.fx) this.fx.goreScale = s.gore;
    this.audio?.setVolumes?.(s.master, s.sfx, s.music);
    if (key === 'quality') {
      const q = QUALITY_PRESETS[s.quality];
      this.resScale = 1;
      this.engine.setQuality(q);
      this.post.applyQuality();
      if (this.sun) {
        this.sun.castShadow = q.shadows;
        if (this.sun.shadow.map) this.sun.shadow.dispose();
        this.sun.shadow.mapSize.set(q.shadowMapSize, q.shadowMapSize);
      }
    }
    if (key === 'difficulty' && this.ai) this.applyDifficulty();
  }

  private applyDifficulty(): void {
    const d = DIFFICULTY[this.settings.value.difficulty] ?? DIFFICULTY.normal;
    this.ai.baseDifficulty = d.ai;
    if (this.director.mode === 'brawl' || this.director.wave === 0) this.ai.difficulty = d.ai;
    this.ai.maxPlayerAttackers = d.attackers;
    this.player.incomingMul = d.incoming;
  }

  uiSound(kind: 'click' | 'hover'): void {
    this.audio?.ui?.(kind);
  }

  // ------------------------------------------------------------------ round lifecycle
  private building = false;
  private roundCrowd = 0;

  async newRound(mode: GameMode, attract = false): Promise<void> {
    if (this.building) return;
    this.building = true;
    try {
      await this.buildRound(mode, attract);
    } finally {
      this.building = false;
    }
  }

  private async buildRound(mode: GameMode, attract: boolean): Promise<void> {
    this.state = 'loading';
    this.input.enabled = false;
    this.menus.hide();
    this.menus.showLoading(true);
    this.hud.show(false);
    // let the loading screen paint before the heavy lifting
    await new Promise((r) => setTimeout(r, 30));
    if (this.player) this.disposeRound();
    events.restore(this.eventBase);
    this.mode = mode;
    this.time.reset();
    this.timers = new Scheduler();
    ctx.timers = this.timers;
    this.physics = Physics.createWorld();
    ctx.physics = this.physics;
    ctx.services = this.audio ? { audio: this.audio, music: this.audio.music } : {};
    this.camFx = new CameraFX();
    this.camFx.intensity = this.settings.value.shake;
    this.combat = new CombatSystem();
    ctx.combat = this.combat;
    const scene = this.engine.scene;
    const q = this.engine.quality;
    this.fx = new FX(scene, q.maxParticles, q.maxDecals);
    this.fx.goreScale = this.settings.value.gore;
    ctx.fx = this.fx;
    this.props = new PropSystem(scene);
    ctx.props = this.props;
    this.weapons = new WeaponSystem(this.props);
    this.gibs = new Gibs(scene);
    this.characters = [];
    this.bloodyFeet = new WeakMap();
    this.buildLevel();

    // survival starts inside, facing the front door the waves pour through
    const sp = mode === 'survival' ? { pos: new THREE.Vector3(0, 0.15, 5.5), yaw: Math.PI } : this.level.playerSpawn;
    this.player = new Player(sp.pos.clone(), sp.yaw);
    this.player.camFx = this.camFx;
    this.player.combat = this.combat;
    this.player.attachViewModel(this.engine.camera);
    ctx.player = this.player;
    this.combat.add(this.player);
    this.interaction = new PlayerInteraction(this.player, this.weapons);
    this.ai = new AIManager(this.nav, this.level);
    ctx.services.ai = this.ai;
    this.director = new Director(this.ai, this.weapons, this.level, (c) => this.addCharacter(c), (c) => this.removeCharacter(c));
    ctx.services.director = this.director;
    this.director.hooks = {
      message: (t, s, k) => this.hud.message(t, s, k),
      killFeed: (t, st) => this.hud.killFeed(t, st),
      end: (won) => this.endRound(won),
    };
    setupBarInteractions(this.level, this.interaction.interactables, this.weapons);
    this.wireRoundEvents();
    this.applyDifficulty();
    const crowdParam = parseInt(this.params.get('crowd') ?? '', 10);
    this.director.crowdSize = !isNaN(crowdParam) ? crowdParam : this.settings.value.crowd;
    this.roundCrowd = this.director.crowdSize;
    if (mode === 'survival') this.director.startSurvival();
    else this.director.startBrawl();
    this.audio?.newRound?.(this.level);
    this.hud.reset();
    this.roundFresh = true;
    this.acc = 0;
    if (!this.compiled && !this.skipRender) {
      // warm up shader programs behind the loading screen
      this.compiled = true;
      this.engine.camera.position.copy(sp.pos).setY(1.7);
      await this.post.compile(this.engine.scene, this.engine.camera).catch(() => {});
    }
    this.menus.showLoading(false);
    if (attract) this.enterTitle();
    else this.beginPlay();
  }

  private disposeRound(): void {
    this.director.hooks = null;
    this.timers.clear();
    this.engine.camera.remove(this.player.vm.root);
    disposeTree(this.player.vm.root);
    this.characters = [];
    const old = this.engine.newScene();
    disposeTree(old);
    old.clear();
    this.physics.free();
  }

  private enterTitle(): void {
    this.state = 'title';
    this.ai.peaceful = true;
    this.player.vm.root.visible = false;
    this.input.enabled = false;
    this.attract.reset();
    this.hud.show(false);
    this.menus.showTitle();
    this.input.exitLock();
  }

  private beginPlay(): void {
    this.state = 'playing';
    this.ai.peaceful = false;
    this.player.vm.root.visible = true;
    this.input.flush();
    this.input.enabled = true;
    this.post.state.fade = 0;
    this.menus.hide();
    this.hud.show(true);
    this.engine.camera.fov = this.baseFov;
    this.engine.camera.updateProjectionMatrix();
    this.director.announce();
  }

  /** Title / end screen buttons. */
  startMode(mode: GameMode, forceNew = false): void {
    this.requestLock();
    const crowdChanged = !this.params.has('crowd') && this.roundCrowd !== this.settings.value.crowd;
    if (!forceNew && !crowdChanged && this.state === 'title' && this.roundFresh && mode === this.mode) {
      this.roundFresh = false;
      this.beginPlay();
      return;
    }
    void this.newRound(mode, false);
  }

  restart(): void {
    this.requestLock();
    void this.newRound(this.mode, false);
  }

  quitToTitle(): void {
    void this.newRound('brawl', true);
  }

  pause(): void {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.menus.showPause();
    this.input.enabled = false;
    this.input.exitLock();
    this.audio?.setPaused?.(true);
  }

  resume(): void {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.menus.hide();
    this.input.flush();
    this.input.enabled = true;
    this.requestLock();
    this.audio?.setPaused?.(false);
  }

  private endRound(won: boolean): void {
    if (this.state !== 'playing' && this.state !== 'paused') return;
    this.state = 'over';
    this.audio?.setPaused?.(false);
    this.audio?.music?.stinger?.(won);
    const d = this.director;
    const t = Math.max(0, d.endTime - d.startTime);
    const rec = this.records.get(this.mode);
    rec.plays = (rec.plays ?? 0) + 1;
    let newBest = false;
    let best = '';
    if (this.mode === 'brawl') {
      if (won) {
        rec.wins = (rec.wins ?? 0) + 1;
        if (!rec.bestTime || t < rec.bestTime) {
          rec.bestTime = t;
          newBest = true;
        }
      }
      best = rec.bestTime ? `${fmtTime(rec.bestTime)} clear` : '';
    } else {
      if (d.wave > (rec.bestWave ?? 0)) {
        rec.bestWave = d.wave;
        newBest = true;
      }
      best = rec.bestWave ? `wave ${rec.bestWave}` : '';
    }
    rec.bestKills = Math.max(rec.bestKills ?? 0, this.player.stats.kills);
    this.records.save();
    this.input.enabled = false;
    this.input.exitLock();
    this.hud.show(false);
    this.menus.showEnd({ won, mode: this.mode, time: t, wave: d.wave, stats: { ...this.player.stats }, newBest, best });
  }

  // ------------------------------------------------------------------ pointer lock
  private requestLock(): void {
    if (this.lockFallback) return;
    this.input.requestLock();
  }

  private onLockChange(locked: boolean): void {
    if (locked) {
      this.lockErrors = 0;
      return;
    }
    if (this.state === 'playing' && !this.lockFallback) this.pause();
  }

  /** Browser refused pointer lock (sandboxed frame, or re-lock cooldown after Esc). */
  onPointerLockUnavailable(): void {
    this.lockErrors++;
    if (this.lockErrors >= 2 && !this.lockFallback) {
      this.lockFallback = true;
      this.input.allowUnlocked = true;
      this.engine.canvas.classList.add('free-mouse');
      this.menus.showNotice('This window blocks mouse capture, so the cursor stays free. Keep it inside the window while you play.', 9000);
      if (this.state === 'paused') this.resume();
      return;
    }
    if (this.state === 'playing') {
      this.state = 'paused';
      this.input.enabled = false;
      this.menus.showClickToResume();
    }
  }

  private onKey(e: KeyboardEvent): void {
    if (e.repeat) return;
    if (e.code === 'Escape') {
      if (this.menus.handleEscape()) return;
      if (this.state === 'playing') this.pause();
    } else if (e.code === 'KeyP') {
      if (this.state === 'playing') this.pause();
      else if (this.state === 'paused') this.resume();
    } else if (e.code === 'Backquote' || e.code === 'F3') {
      this.settings.set('showFps', !this.settings.value.showFps);
    }
  }

  // ------------------------------------------------------------------ level
  private buildLevel(): void {
    const scene = this.engine.scene;
    scene.background = new THREE.Color(0x0c0807);
    scene.fog = new THREE.Fog(0x140c09, 22, 75);
    const hemi = new THREE.HemisphereLight(0xffdcb8, 0x3a2418, 0.85);
    scene.add(hemi);
    scene.environment = this.envMap;
    scene.environmentIntensity = 0.22;
    const sun = new THREE.DirectionalLight(0xffe8d0, 0.85);
    sun.position.set(7, 30, 9);
    sun.target.position.set(0, 0, -1);
    sun.castShadow = this.engine.quality.shadows;
    const sz = this.engine.quality.shadowMapSize;
    sun.shadow.mapSize.set(sz, sz);
    const sc = sun.shadow.camera;
    sc.left = -21;
    sc.right = 21;
    sc.top = 19;
    sc.bottom = -19;
    sc.near = 5;
    sc.far = 60;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.03;
    scene.add(sun);
    scene.add(sun.target);
    this.sun = sun;
    this.level = buildBarLevel(scene, this.props);
    this.lightMgr = new LightManager(scene, this.level.lights, this.engine.quality.lightBudget, 4);
    if (!this.navBuilt) {
      const t0 = performance.now();
      this.nav.build(this.level.bounds);
      this.navBuilt = true;
      console.log(`nav grid: ${this.nav.count} nodes in ${(performance.now() - t0).toFixed(0)}ms`);
    }
  }

  private wireRoundEvents(): void {
    const ctrl = this.player.ctrl;
    ctrl.onFootstep = (mat, intensity) => {
      this.playerLeftFoot = !this.playerLeftFoot;
      events.emit('footstep', { pos: this.player.position, material: mat, intensity, isPlayer: true, who: this.player, yaw: ctrl.yaw, left: this.playerLeftFoot });
    };
    ctrl.onLand = (speed, mat) => {
      events.emit('footstep', { pos: this.player.position, material: mat, intensity: Math.min(1.6, 0.7 + speed / 8), isPlayer: true, who: this.player, yaw: ctrl.yaw, left: true });
    };
    events.on('footstep', (e) => {
      if (e.who && e.yaw !== undefined) this.footprint(e.who, e.pos, e.yaw, !!e.left);
    });
  }

  /** Walking through blood leaves a fading trail of bloody footprints. */
  private footprint(who: object, pos: THREE.Vector3, yaw: number, left: boolean): void {
    const fx = this.fx;
    const s = fx.bloodMap.sample(pos);
    let b = this.bloodyFeet.get(who) ?? 0;
    if (s > 0.4) b = Math.min(1, b + s * 0.22);
    if (b > 0.05 && this.fx.goreScale > 0) {
      fx.footprint(pos, yaw, left, b);
      b *= 0.86;
    } else b = 0;
    this.bloodyFeet.set(who, b);
  }

  addCharacter(c: Character): void {
    this.engine.scene.add(c.model.root);
    this.characters.push(c);
    this.combat.add(c);
  }

  removeCharacter(c: Character): void {
    const i = this.characters.indexOf(c);
    if (i >= 0) this.characters.splice(i, 1);
    this.combat.remove(c);
    const b = (c as any).brain;
    if (b) this.ai.remove(b);
    if (c.weapon) c.dropWeapon();
    c.dispose();
  }

  // ------------------------------------------------------------------ loop
  start(): void {
    this.running = true;
    this.last = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      requestAnimationFrame(loop);
      this.frame(now);
    };
    requestAnimationFrame(loop);
  }

  /** Advance the simulation manually (used by headless tests). */
  stepFrames(n: number, dt = 1 / 60): void {
    for (let i = 0; i < n; i++) this.tick(dt);
  }

  /** Run game logic for `seconds` of game time without rendering (headless AI tests). */
  simulate(seconds: number, dt = 1 / 30): void {
    this.skipRender = true;
    const n = Math.ceil(seconds / dt);
    for (let i = 0; i < n; i++) this.tick(dt);
    this.skipRender = false;
  }

  private frame(now: number): void {
    const realDt = Math.min((now - this.last) / 1000, 0.1);
    this.last = now;
    const t0 = performance.now();
    this.tick(realDt);
    this.frameMs = performance.now() - t0;
    this.fpsAcc += realDt;
    this.fpsFrames++;
    if (this.fpsAcc >= 0.5) {
      this.fps = this.fpsFrames / this.fpsAcc;
      this.fpsAcc = 0;
      this.fpsFrames = 0;
      this.adaptResolution();
    }
  }

  private resScale = 1;
  private resTimer = 0;
  /** Dynamic resolution: trade pixels for frame rate on slower GPUs. */
  private adaptResolution(): void {
    if ((navigator as any).webdriver || this.state !== 'playing' || document.visibilityState !== 'visible') return;
    this.resTimer += 0.5;
    if (this.resTimer < 2) return;
    let next = this.resScale;
    if (this.fps < 42) next = Math.max(0.55, this.resScale * 0.88);
    else if (this.fps > 57 && this.resScale < 1) next = Math.min(1, this.resScale * 1.06);
    if (Math.abs(next - this.resScale) > 0.01) {
      this.resScale = next;
      this.resTimer = 0;
      this.engine.renderer.setPixelRatio(this.engine.quality.pixelRatio * next);
      this.engine.resize();
    }
  }

  private tick(realDt: number): void {
    const st = this.state;
    if (st === 'loading' || !this.player) {
      this.input.endFrame();
      return;
    }
    const dt = st === 'paused' ? 0 : this.time.update(realDt);
    const rdt = st === 'paused' ? 0 : realDt;
    this.updateInput();

    const fixed = this.physics.fixedDt;
    this.acc += dt;
    let steps = 0;
    while (this.acc >= fixed && steps < 4) {
      this.fixedUpdate(fixed);
      this.acc -= fixed;
      steps++;
    }
    if (steps >= 4) this.acc = 0;
    const alpha = this.acc / fixed;

    this.timers.update(dt, rdt);
    for (const d of this.level.doors) d.apply(alpha);
    for (const a of this.level.animated) a(this.time.elapsed, dt);
    const dance = (this.level.danceFloor.material as THREE.ShaderMaterial).uniforms;
    dance.uTime.value = this.time.elapsed;
    const music = this.audio?.music;
    if (music) {
      this.lightMgr.beat = music.beat ?? 0;
      this.lightMgr.energy = music.energy ?? 0;
      dance.uBeat.value = music.beat ?? 0;
    }
    this.lightMgr.update(dt, this.engine.camera);
    this.frameCount++;
    this.player.ctrl.updateVisual(dt, alpha);
    this.player.update(dt, realDt);
    this.interaction.update(dt);
    this.ai.update(dt);
    this.director.update(dt);
    this.props.update(alpha);
    this.gibs.update(dt, alpha);
    for (const c of this.characters) c.update(dt, alpha, this.frameCount);
    this.fx.update(dt, this.engine.camera);
    this.updateCamera(dt, realDt);
    if (this.audio) {
      this.audio.music?.setIntensity?.(this.ai.brawlStarted ? Math.max(0.25, this.ai.intensity) : 0);
      this.audio.update?.(rdt, this.engine.camera, this);
    }
    this.hud.update(dt, realDt);
    this.hud.driveScreenFx(realDt);
    this.post.state.fade = st === 'title' ? this.attract.fade : 0;
    if (!this.skipRender && (st !== 'paused' || this.frameCount % 4 === 0)) this.post.render(this.engine.scene, this.engine.camera, this.time.realElapsed, dt);
    this.input.endFrame();
  }

  private updateInput(): void {
    const input = this.input;
    const look = input.consumeLook();
    const p = this.player.ctrl;
    const it = p.intent;
    if (this.state !== 'playing') {
      it.x = it.z = 0;
      it.sprint = it.crouch = false;
      return;
    }
    if (this.player.alive) {
      p.yaw -= look.dx * 0.0022;
      p.pitch -= look.dy * 0.0022;
      p.pitch = Math.max(-1.54, Math.min(1.54, p.pitch));
      this.player.vm.addSway(look.dx, look.dy);
    }
    it.x = (input.isDown('right') ? 1 : 0) - (input.isDown('left') ? 1 : 0);
    it.z = (input.isDown('forward') ? 1 : 0) - (input.isDown('back') ? 1 : 0);
    it.sprint = input.isDown('sprint');
    it.crouch = input.isDown('crouch');
    if (input.wasPressed('jump')) it.jump = true;
    if (input.wasPressed('dodge') || input.wasDoubleTapped('left') || input.wasDoubleTapped('right') || input.wasDoubleTapped('back')) it.dodge = true;
  }

  private fixedUpdate(dt: number): void {
    this.player.fixedUpdate(dt);
    this.player.ctrl.intent.jump = false;
    this.player.ctrl.intent.dodge = false;
    this.ai.fixedUpdate(dt);
    for (const c of this.characters) c.fixedUpdate(dt);
    this.physics.step();
    this.player.ctrl.capture();
    for (const c of this.characters) c.capture();
    this.props.capture();
    this.gibs.capture();
    for (const d of this.level.doors) d.capture();
  }

  private _camPos = new THREE.Vector3();
  private _shakePos = new THREE.Vector3();
  private _shakeRot = new THREE.Euler();
  private _bob = new THREE.Vector3();

  private updateCamera(dt: number, realDt: number): void {
    const cam = this.engine.camera;
    if (this.state === 'title') {
      this.attract.update(realDt, cam);
      return;
    }
    const p = this.player.ctrl;
    p.eyePosition(this._camPos);
    const { roll } = p.bobOffset(this._bob);
    const fovK = this.camFx.update(realDt, this._shakePos, this._shakeRot);
    cam.position.copy(this._camPos);
    let deathRoll = 0;
    if (!this.player.alive) {
      const t = Math.min(1, (this.time.realElapsed - this.player.deathTime) / 1.2);
      cam.position.y -= t * (p.eyeHeight - 0.25);
      deathRoll = t * 1.1;
      if (t > 0.3) this.player.vm.root.visible = false;
    }
    const drunk = this.player.drunk;
    const dw = drunk > 0 ? Math.sin(this.time.realElapsed * 1.3) * 0.06 * drunk : 0;
    cam.rotation.set(p.pitch + this._shakeRot.x + dw * 0.5, p.yaw + this._shakeRot.y, roll + this._shakeRot.z + deathRoll + dw, 'YXZ');
    this._bob.add(this._shakePos);
    this._bob.applyQuaternion(cam.quaternion);
    cam.position.add(this._bob);
    const targetFov = this.baseFov + (p.sprinting ? 5 * Math.min(1, p.horizSpeed / 7) : 0) + (this.player.raging ? 6 : 0) + fovK;
    cam.fov += (targetFov - cam.fov) * Math.min(1, dt * 10 + 0.0001);
    cam.updateProjectionMatrix();
  }
}
