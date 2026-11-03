import * as THREE from 'three';
import { Renderer } from './render/renderer';
import { DIFFICULTY, loadSettings, PRESETS, Settings } from './core/settings';
import { isFighterId, STYLES } from './combat/styles';
import { Input } from './core/input';
import { CameraRig } from './fx/camera';
import { ARCHETYPES } from './ai/archetypes';
import { Arena, HALF_D, HALF_W, isLevelName, isMapName, MAPS, WorldName } from './world/arena';
import './world/level';
import { BloodAtlas, setDrains, SPLAT } from './world/bloodAtlas';
import { MocapDriver } from './anim/mocapLoco';
import { CharacterLibrary } from './character/library';
import { Archetype, registerLabVariants, registerStoryVariants, registerVariants } from './character/variants';
import { registerAllClips } from './anim/lib';
import type { Fighter } from './combat/fighter';
import { Player } from './combat/player';
import { clamp, damp, rand } from './core/math';
import { Physics } from './world/physics';
import { CorpseSystem, CorpseRecord } from './world/corpses';
import { DeathSystem } from './combat/death';
import { FX } from './fx/particles';
import { AudioSys } from './audio/audio';
import { Music } from './audio/music';
import { VoiceSystem } from './audio/voice';
import { Combat } from './combat/combat';
import { Director } from './ai/director';
import { WaveManager } from './ai/waves';
import { BossManager } from './ai/bosses';
import { Enemy } from './ai/enemy';
import { Weapon, WeaponBatch } from './combat/weapons';
import { HUD } from './ui/hud';
import { HitInfo, makeHit } from './combat/types';
import { Props } from './world/props';
import { Projectiles } from './combat/projectiles';
import { ActiveRagdoll, EuphoriaImpact, EuphoriaSim } from './world/euphoria/bridge';
import { Shape, Vec3 } from './world/euphoria/engine.js';
import { Ragdoll } from './world/ragdoll';
import type { RagdollLike } from './world/ragdollTypes';
import { Pose, PoseFK } from './anim/pose';
import { Replay } from './replay/replay';
import type { Story } from './story/runner';
import type { StoryLaunch } from './story/save';
import { CHAPTERS } from './story/chapters';

/** Separation speed (m/s per body) for fighters just released from a paired move. */
const SOFT_SEPARATION = 1.4;

const _edge = new THREE.Vector3();

/** Something to use: within `r` of `at`, E (RB) does `use` (the prompt says `label`). */
export interface Interactable {
  at: THREE.Vector3;
  r: number;
  label: string;
  use: () => void;
  /** Only now and then (a door once it's unlocked). */
  enabled?: () => boolean;
  /** Gone once used. */
  once?: boolean;
}

export class Game {
  settings: Settings;
  renderer: Renderer;
  scene = new THREE.Scene();
  input: Input;
  cam: CameraRig;
  arena: Arena;
  blood: BloodAtlas;
  lib = new CharacterLibrary();
  archetypes!: Record<Archetype, string[]>;
  player!: Player;
  fighters: Fighter[] = [];
  timeScale = 1;
  private slowmo: { scale: number; t: number; dur: number } | null = null;
  hitstop = 0;
  time = 0;
  realTime = 0;
  paused = false;
  frame = 0;
  private last = performance.now();
  params: URLSearchParams;
  testMode = false;
  physics = new Physics();
  /** Active-ragdoll ("euphoria") simulation from the Ragdoll Lab engine. */
  euphoria!: EuphoriaSim;
  corpses!: CorpseSystem;
  death!: DeathSystem;
  fx!: FX;
  audio = new AudioSys();
  /** The cast's spoken lines (recorded, or the browser's voices) and the lips that move with them. */
  voice = new VoiceSystem(this.audio);
  music: Music;
  combat: Combat;
  director: Director;
  waves: WaveManager;
  bosses: BossManager;
  weapons: Weapon[] = [];
  weaponBatch: WeaponBatch;
  hud: HUD | null = null;
  thrown: { e: Enemy; t: number; dir: THREE.Vector3; hitWall?: boolean }[] = [];
  props!: Props;
  /** The last minute of the run, recorded for watching back after the fall. */
  replay!: Replay;
  projectiles!: Projectiles;
  onCorpse: ((r: CorpseRecord) => void) | null = null;
  started = false;
  over = false;
  debug = false;
  preStep: ((dt: number) => void) | null = null;
  godMode = false;
  private enemyCache: Enemy[] = [];
  private enemyCacheFrame = -1;
  /** Things in the world to use with E (RB): a door, a note, a medkit, a switch. */
  interactables: Interactable[] = [];
  /** A guard noticed something (curious), saw her (alert), or let it go (lost): the story's barks. */
  onGuardSense: ((e: Enemy, kind: 'curious' | 'alert' | 'lost') => void) | null = null;
  /** The story mode: the chapter running (null: the endless waves). */
  story: Story | null = null;
  storyLaunch: StoryLaunch | null = null;

  constructor(container: HTMLElement, params: URLSearchParams, launch: StoryLaunch | null = null) {
    this.params = params;
    this.settings = loadSettings();
    // a chapter of the story: its map, and Scarlet (neither saved as the endless mode's choice)
    const chapter = launch ? CHAPTERS[launch.chapter] : null;
    if (launch && chapter) this.storyLaunch = launch;
    const q = params.get('quality');
    if (q === 'low' || q === 'medium' || q === 'high' || q === 'ultra') this.settings.quality = q;
    this.debug = params.get('debug') === '1';
    const rg = params.get('ragdolls');
    if (rg === 'classic' || rg === 'euphoria') this.settings.ragdolls = rg;
    const df = this.params.get('difficulty');
    if (df === 'story' || df === 'fighter' || df === 'brutal') this.settings.difficulty = df;
    this.renderer = new Renderer(container, this.settings);
    const preset = PRESETS[this.settings.quality];
    this.input = new Input(this.renderer.gl.domElement);
    this.blood = new BloodAtlas(preset.bloodAtlas, HALF_W * 2, HALF_D * 2);
    this.blood.renderer = this.renderer.gl;
    const mp = this.params.get('map');
    if (isMapName(mp)) this.settings.map = mp;
    // (the story's chapters, and the levels for testing, aren't saved as the endless mode's map)
    let world: WorldName = this.settings.map;
    if (isLevelName(mp)) world = mp;
    if (this.storyLaunch && chapter) world = chapter.map;
    this.arena = new Arena(this.blood, preset.pointLights, preset.shadowMap, world);
    // (the chapter's set dressing goes in before the physics are built from the room)
    if (this.storyLaunch && chapter) chapter.dress?.(this.arena);
    this.arena.heightsChanged();
    // (a big level: the footprint grid covers all of it; blood runs on whatever floor it's on)
    const bb = this.arena.bounds;
    this.blood.setFloor(bb.minX, bb.maxX, bb.minZ, bb.maxZ);
    if (this.arena.traversal) this.blood.floorAt = (x, z, y) => this.arena.groundAt(x, z, y);
    this.scene.add(this.arena.group);
    setDrains(this.arena.drains);
    if (this.arena.wet) this.lib.surface = { roughness: 0.52, env: 1.25 };
    this.scene.fog = new THREE.FogExp2(this.arena.fog.color, this.arena.fog.density);
    this.scene.background = this.arena.background;
    this.scene.environment = this.arena.environment;
    this.cam = new CameraRig(window.innerWidth / window.innerHeight, this.arena);
    this.arena.view = this.cam.camera;
    // (outdoors the skyline, the moon and the storm are a long way off)
    this.cam.camera.far = this.arena.farPlane;
    this.cam.camera.updateProjectionMatrix();
    this.renderer.onResize = () => {
      this.cam.camera.aspect = window.innerWidth / Math.max(1, window.innerHeight);
      this.cam.camera.updateProjectionMatrix();
    };
    this.renderer.onResize();
    registerAllClips();
    this.archetypes = registerVariants(this.lib);
    // the lab is staffed by its own people
    if (this.arena.roster === 'lab') Object.assign(this.archetypes, registerLabVariants(this.lib));
    // (the story's doorman and the warehouse's captives)
    if (this.storyLaunch) Object.assign(this.archetypes, registerStoryVariants(this.lib));
    this.lib.build();
    this.music = new Music(this.audio);
    this.combat = new Combat(this);
    this.director = new Director(this);
    this.waves = new WaveManager(this);
    this.bosses = new BossManager(this);
    this.weaponBatch = new WeaponBatch(this.scene);
    // context loss: rebuild persistent blood from the splat log
    this.renderer.gl.domElement.addEventListener('webglcontextrestored', () => {
      this.blood.needsRestore = true;
    });
  }

  async init() {
    await this.physics.init(this.arena);
    const preset = PRESETS[this.settings.quality];
    this.euphoria = new EuphoriaSim(this.arena, preset.ragdollSubsteps, preset.maxActiveRagdolls);
    this.euphoria.onImpact = (i) => this.onBodyImpact(i);
    const floorAt = (x: number, z: number, y: number) => this.arena.groundAt(x, z, y);
    this.corpses = new CorpseSystem(this.lib, this.physics, this.blood, this.arena.bounds, floorAt);
    this.scene.add(this.corpses.group);
    this.death = new DeathSystem(this);
    this.fx = new FX(this, PRESETS[this.settings.quality].maxParticles);
    this.props = new Props(this);
    this.projectiles = new Projectiles(this);
    this.arena.onSpark = (p) => {
      this.fx.sparks(p, new THREE.Vector3(0, -1, 0), 16);
      if (this.started) this.audio.crack(p);
    };
    this.arena.onThunder = (delay, vol) => {
      if (this.started) this.audio.thunder(delay, vol);
    };
    this.arena.onAlarmSound = (on) => this.audio.alarm(on);
    this.arena.onTankBurst = (p) => {
      // the containment glass goes: shards, a flood of green, the thing inside roaring
      this.fx.shatter(p, 'glass', [0x9ae8c0, 0xc8f0e0, 0x6ac8a0], 80, 1.3, 2.2);
      for (let i = 0; i < 40; i++) {
        const a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 3;
        this.fx.soft.spawn(p.x, 0.2 + Math.random() * 1.2, p.z, Math.cos(a) * sp, Math.random() * 1.5, Math.sin(a) * sp + 1.5, 0.3 + Math.random() * 0.4, 0.25, 0.9, 0.45, 0.35, 1 + Math.random(), { grow: 1.2, drag: 1.8 });
      }
      this.audio.shatter('glass', p, 1);
      this.audio.play('death', { pos: p, vol: 1, pitch: 0.45 });
      this.audio.thump(1.6, p);
      this.cam.addTrauma(0.8);
      this.renderer.fx.chroma = Math.max(this.renderer.fx.chroma, 1.2);
      this.props.blast(p, 5, 6);
      this.slowMo(0.4, 1.0);
    };
    const fid = this.storyLaunch ? 'scarlet' : this.params.get('fighter');
    if (isFighterId(fid)) this.settings.fighter = fid;
    const style = STYLES[this.settings.fighter] ?? STYLES.jin;
    this.player = new Player(this, this.lib, this.lib.get(style.variant));
    this.player.style = style;
    this.player.speed = style.runSpeed;
    const mc = this.params.get('mocap');
    if (mc === '0' || mc === '1') this.settings.mocap = mc === '1';
    this.applyMocap();
    this.player.spawn(0, 2, Math.PI);
    this.addBodyProxy(this.player);
    this.player.hp = this.player.maxHp = 100;
    this.player.model.uniforms.uRim.value.set(0.35, 0.5, 0.8, 0.22);
    this.fighters.push(this.player);
    this.replay = new Replay(this);
    this.replay.track(this.player);
    // JIT-compile the active-ragdoll solver before the first fight
    {
      const def = this.player.def;
      this.euphoria.prewarm(def, new PoseFK().compute(new Pose().setRest(def), def));
    }
    this.cam.yaw = 0;
    this.applySettings();
    if (!this.params.get('test')) {
      this.hud = new HUD(this);
      this.waves.onWaveStart = (w, def) => {
        const n = def.comp.reduce((a, c) => a + c[1], 0);
        if (def.boss) this.hud?.bannerShow(def.title ?? 'BOSS', `WAVE ${w}`, 3.0, 'BOSS FIGHT', true);
        else this.hud?.bannerShow(`WAVE ${w}`, `${n} ENEMIES`, 2.6, w === 1 ? 'SURVIVE' : 'INCOMING');
        this.music.stinger(def.boss ? 'boss' : 'wave');
        if (def.hint) this.hud?.hint(def.hint, undefined, 9);
        this.audio.play('announcer', { file: def.boss ? 'audio/announcer/announcer_prepare_yourself.wav' : w === 1 ? 'audio/announcer/announcer_fight.wav' : 'audio/announcer/announcer_begin.wav', vol: 0.75 });
      };
      this.waves.onWaveClear = (w) => {
        // let the final blow play out before the banner
        this.later(1.1, () => {
          this.hud?.bannerShow('CLEARED', `${this.corpses.count} BODIES ON THE FLOOR`, 2.2, `WAVE ${w}`);
          this.music.stinger('clear');
        });
      };
      const onFirstGesture = () => {
        this.audio.resume();
      };
      window.addEventListener('pointerdown', onFirstGesture);
      window.addEventListener('keydown', onFirstGesture);
      window.addEventListener('keydown', (e) => {
        if (this.replay?.active) {
          const r = this.replay;
          switch (e.code) {
            case 'Escape':
            case 'Enter':
            case 'Backspace':
              this.closeReplay();
              break;
            case 'Space':
            case 'KeyK':
              r.togglePlay();
              break;
            case 'ArrowLeft':
              r.seek(r.t - 5);
              break;
            case 'ArrowRight':
              r.seek(r.t + 5);
              break;
            case 'Comma':
              r.playing = false;
              r.seek(r.t - 1 / 30);
              break;
            case 'Period':
              r.playing = false;
              r.seek(r.t + 1 / 30);
              break;
            case 'ArrowUp':
            case 'Equal':
              r.setSpeed(1);
              break;
            case 'ArrowDown':
            case 'Minus':
              r.setSpeed(-1);
              break;
            case 'KeyC':
              r.toggleCamera();
              break;
            case 'KeyR':
              r.seek(r.start);
              r.playing = true;
              break;
            default:
              return;
          }
          e.preventDefault();
          return;
        }
        if (this.hud?.handleMenuKey(e)) {
          e.preventDefault();
          return;
        }
        if ((e.code === 'Escape' || e.code === 'KeyP') && this.started && !this.over) this.setPaused(!this.paused);
        // (spectating: Esc, P or Enter brings the results back)
        else if ((e.code === 'Escape' || e.code === 'KeyP' || e.code === 'Enter') && this.spectating) this.stopSpectate();
      });
      this.renderer.gl.domElement.addEventListener('click', () => {
        if ((this.started && !this.paused && !this.over) || this.spectating || this.replay?.active) this.input.requestLock();
      });
      // the browser consumes Esc to release pointer lock: treat that as a pause request
      this.input.onLockLost = () => {
        if (this.started && !this.paused && !this.over && !this.preStep) this.setPaused(true);
      };
      window.addEventListener('blur', () => {
        if (this.started && !this.paused && !this.over && !this.preStep) this.setPaused(true);
      });
      if (this.storyLaunch) {
        const { Story } = await import('./story/runner');
        this.story = new Story(this, CHAPTERS[this.storyLaunch.chapter], this.storyLaunch);
        this.hud.applyStoryMode();
      } else this.hud.show('title');
      let auto = false;
      try {
        auto = sessionStorage.getItem('last-stance-autostart') === '1';
        sessionStorage.removeItem('last-stance-autostart');
      } catch {
        /* ignore */
      }
      if (auto && !this.story) setTimeout(() => this.beginRun(), 50);
    }
    if (!this.params.get('test') || this.params.get('audio') === '1') await this.audio.init();
    await this.voice.init();
    // compile all shaders up front (characters, corpses, particles, blood surfaces)
    try {
      this.renderer.gl.compile(this.scene, this.cam.camera);
    } catch {
      /* compile is an optimization only */
    }
  }

  applySettings() {
    const s = this.settings;
    this.renderer.applySettings(s);
    this.cam.shakeScale = s.cameraShake;
    this.cam.sensitivity = s.mouseSensitivity;
    this.cam.invertY = s.invertY;
    this.audio.volumes = { master: s.masterVolume, sfx: s.sfxVolume, music: s.musicVolume };
    this.audio.applyVolumes();
    this.voice.enabled = s.voices && this.params.get('voices') !== '0';
    this.voice.volume = s.voiceVolume;
    if (this.player) this.applyMocap();
  }

  private pianoT = -9;
  private flashShown = 0;
  private sirenT = 25 + Math.random() * 30;
  /** Lightning lifts the fog, the sky and the wet reflections for a few frames; sirens, far off. */
  private weather(dt: number) {
    const fl = this.arena.flash;
    if (fl !== this.flashShown) {
      this.flashShown = fl;
      (this.scene.fog as THREE.FogExp2).color.setHex(this.arena.fog.color).multiplyScalar(1 + fl * 3);
      this.scene.backgroundIntensity = 1 + fl * 4;
      this.scene.environmentIntensity = 1 + fl * 1.5;
    }
    if ((this.arena.map === 'rooftop' || this.arena.map === 'alley') && this.started) {
      this.sirenT -= dt;
      if (this.sirenT <= 0) {
        this.sirenT = 40 + Math.random() * 60;
        this.audio.siren(0.5 + Math.random() * 0.5);
      }
    }
  }

  /** No fight on: health comes back (between waves; the story says when). */
  get calm() {
    return this.story ? this.story.calm : this.waves.betweenWaves;
  }

  beginRun() {
    this.hud?.show(null);
    this.cam.framingDist = 0;
    this.started = true;
    this.paused = false;
    this.audio.resume();
    this.audio.startAmbience(this.arena.map);
    this.music.start();
    this.input.requestLock();
    this.waves.start(Number(this.params.get('wave') ?? 1));
  }

  private lastPauseToggle = 0;
  setPaused(p: boolean) {
    if (this.over || p === this.paused) return;
    // Esc can arrive both as keydown and as a pointer-lock release; ignore the duplicate
    const now = performance.now();
    if (now - this.lastPauseToggle < 250) return;
    this.lastPauseToggle = now;
    this.paused = p;
    if (p) {
      this.input.exitLock();
      this.hud?.show('pause');
      this.audio.ctx?.suspend();
      this.voice.pause(true);
    } else {
      this.hud?.show(null);
      this.input.requestLock();
      this.audio.resume();
      this.voice.pause(false);
    }
  }

  /** Tests: a man standing about (on watch, on a beat) - as the story's spawn makes them. */
  debugGuard(x: number, z: number, yaw: number, o: { patrol?: [number, number, number][]; watch?: boolean } = {}) {
    const names = this.archetypes.brawler;
    const e = new Enemy(this, this.lib, this.lib.get(names[0]), ARCHETYPES.brawler);
    e.spawn(x, z, yaw);
    this.addFighter(e);
    e.becomeIdle(yaw, null);
    e.watch = o.watch !== false;
    if (o.patrol) e.patrol = o.patrol.map(([px, pz, w]) => ({ x: px, z: pz, wait: w }));
    return e;
  }
  /** The thing she'd use with E right now (the nearest in reach, facing it more or less). */
  interactableNear(): Interactable | null {
    const p = this.player;
    let best: Interactable | null = null;
    let bd = Infinity;
    for (const it of this.interactables) {
      if (it.enabled && !it.enabled()) continue;
      const d = Math.hypot(it.at.x - p.x, it.at.z - p.z);
      if (d > it.r || Math.abs(it.at.y - (p.y + 1)) > 1.8 || d >= bd) continue;
      best = it;
      bd = d;
    }
    return best;
  }
  useInteractable(it: Interactable) {
    if (it.once) this.interactables = this.interactables.filter((x) => x !== it);
    it.use();
  }

  enemies(): Enemy[] {
    if (this.enemyCacheFrame !== this.frame) {
      this.enemyCache = this.fighters.filter((f): f is Enemy => f instanceof Enemy);
      this.enemyCacheFrame = this.frame;
    }
    return this.enemyCache;
  }

  private beatT = 0;
  /** Badly hurt: a heartbeat under the mix, faster and louder the closer to death. */
  private heartbeat(realDt: number) {
    const p = this.player;
    const hpF = p.hp / p.maxHp;
    if (!this.started || !p.alive || this.over || hpF >= 0.32) {
      this.beatT = 0;
      return;
    }
    this.beatT -= realDt;
    if (this.beatT <= 0) {
      const k = clamp((0.32 - hpF) / 0.32, 0, 1);
      this.beatT = 60 / (72 + k * 58);
      this.audio.heartbeat(0.35 + k * 0.45);
    }
  }

  private timers: { t: number; fn: () => void }[] = [];
  /** Run `fn` after `sec` seconds of real (unscaled, unpaused) time. */
  later(sec: number, fn: () => void) {
    this.timers.push({ t: sec, fn });
  }
  private tickTimers(realDt: number) {
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const t = this.timers[i];
      t.t -= realDt;
      if (t.t <= 0) {
        this.timers.splice(i, 1);
        t.fn();
      }
    }
  }

  slowMo(scale: number, dur: number) {
    this.slowmo = { scale, t: 0, dur };
  }
  hitStop(sec: number) {
    this.hitstop = Math.max(this.hitstop, sec);
  }

  start() {
    // (tests: ?turbo=N runs N steps of the world per frame drawn - a slow headless renderer still
    // plays a whole chapter in reasonable time)
    const turbo = Math.max(1, Math.min(8, Number(this.params.get('turbo') ?? 1) | 0));
    const loop = () => {
      const now = performance.now();
      const realDt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      for (let i = 1; i < turbo; i++) this.step(realDt);
      this.step(realDt);
      this.renderFrame();
      this.renderer.trackFrame(realDt * 1000, this.realTime);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  step(realDt: number) {
    this.frame++;
    this.realTime += realDt;
    this.input.update(realDt);
    if (this.replay?.active) {
      this.replayStep(realDt);
      return;
    }
    if (this.paused) return;
    this.voice.update(realDt);
    this.tickTimers(realDt);
    this.heartbeat(realDt);
    this.preStep?.(realDt);
    if (this.godMode) this.player.hp = Math.max(this.player.hp, 40);
    let ts = 1;
    if (this.slowmo) {
      this.slowmo.t += realDt;
      const s = this.slowmo;
      const k = s.t < s.dur * 0.75 ? 1 : 1 - (s.t - s.dur * 0.75) / (s.dur * 0.25);
      ts = 1 + (s.scale - 1) * clamp(k, 0, 1);
      if (s.t >= s.dur) this.slowmo = null;
    }
    this.timeScale = ts;
    let dt = realDt * ts;
    if (this.hitstop > 0) {
      this.hitstop -= realDt;
      dt = 0;
    }
    this.time += dt;
    const playing = this.started || this.testMode;
    if (playing) {
      this.waves.update(dt);
      this.director.update(dt);
      this.bosses.update(dt);
    }
    for (const f of this.fighters) if (f.alive && (playing || f === this.player)) f.think(dt);
    for (const f of this.fighters) if (f.alive) f.move(dt);
    this.separate(dt);
    this.physics.update(dt);
    this.euphoria.update(dt);
    this.death.update(dt);
    this.edgeFalls(dt);
    this.updateThrown(dt);
    this.props.update(dt);
    this.projectiles.update(dt);
    for (const f of this.fighters) f.animate(dt);
    for (const w of this.weapons) w.update(dt);
    this.arena.update(realDt * ts);
    this.weather(realDt);
    this.blood.update(dt);
    this.corpses.updateWounds(this.time, dt);
    this.fx.update(dt);
    this.footsteps();
    this.replay.capture(dt);
    // camera
    const [lx, ly] = this.input.takeLook();
    let near = 0;
    for (const e of this.enemies()) if (e.alive && e.state !== 'idle' && e.distTo(this.player) < 7) near++;
    const focus = new THREE.Vector3(this.player.x, this.player.viewY + 1.0, this.player.z);
    this.arena.focus.set(this.player.x, this.player.viewY, this.player.z);
    if (!this.started && !this.testMode) {
      // title screen: slow, low cinematic orbit around the fighter
      this.cam.yaw += realDt * 0.05;
      this.cam.pitch = damp(this.cam.pitch, 0.12, 1.5, realDt);
      this.cam.framingDist = 1.4;
    }
    if (this.spectating) {
      const inp = this.input;
      const up = (inp.isHeld('grab') ? 1 : 0) - (inp.isHeld('stun') ? 1 : 0) + (inp.isHeld('dodge') ? 1 : 0);
      this.cam.updateFree(realDt, lx, ly, inp.moveX, inp.moveY, up, inp.isHeld('walk'));
    } else this.cam.update(dt, realDt, focus, lx, ly, near, Math.hypot(this.player.vx, this.player.vz) > 0.5);
    this.thinOccluders(realDt);
    // audio listener
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.cam.camera.quaternion);
    this.audio.setListener(this.cam.camera.position, right);
    // music intensity
    const active = this.enemies().filter((e) => e.alive && e.state !== 'enter' && e.state !== 'idle').length;
    this.music.target = clamp((active > 0 ? 0.3 : 0.05) + active * 0.07 + Math.min(0.3, this.player.combo * 0.015) + (this.bosses.active ? 0.3 : 0), 0, 1);
    this.music.update(realDt);
    // post fx decay
    const fx = this.renderer.fx;
    fx.chroma = damp(fx.chroma, 0, 7, realDt);
    fx.flash = damp(fx.flash, 0, 12, realDt);
    const lowHp = 1 - this.player.hp / this.player.maxHp;
    fx.red = damp(fx.red, lowHp > 0.65 ? (lowHp - 0.65) * 0.9 : 0, 3, realDt);
    fx.desat = damp(fx.desat, this.timeScale < 0.6 ? 0.45 : this.over ? 0.8 : 0, 6, realDt);
    this.hud?.update(dt, realDt);
    this.story?.update(realDt);
  }

  private footsteps() {
    // footstep sounds & bloody footprints from planted feet (cheap poll on locomotion plants)
    const wet = this.arena.wet;
    for (const f of this.fighters) {
      if (!f.alive || f.anim.mode !== 'loco') continue;
      const lo = f.anim.loco;
      for (let i = 0; i < 2; i++) {
        const ft = lo.feet[i];
        if (!ft.swing && ft.plantedTime === 0) {
          const sp = Math.hypot(f.vx, f.vz);
          if (sp > 0.6) {
            const vol = clamp(sp / 5, 0.25, 1) * (f === this.player ? 0.8 : 0.5);
            const at = new THREE.Vector3(ft.pos.x, ft.pos.y + f.y, ft.pos.z);
            this.audio.play('footstep', { pos: at, vol });
            if (wet) {
              this.audio.splash(at, vol * 0.7);
              if (sp > 3) this.fx.splash(at, 0.25);
            }
          }
          // bloody footprints: stepping in blood coats the sole for a few steps
          const cov = this.blood.coverageAt(ft.pos.x, ft.pos.z);
          const fs = f as Fighter & { bloodSteps?: number };
          if (cov > 0.5) fs.bloodSteps = 8;
          if ((fs.bloodSteps ?? 0) > 0 && cov < 0.5) {
            const dir = new THREE.Vector3(Math.sin(ft.yaw), 0, Math.cos(ft.yaw));
            this.blood.splat(new THREE.Vector3(ft.pos.x, f.y + 0.01, ft.pos.z), 0.15 * f.scale, SPLAT.print, 0.25 + 0.09 * (fs.bloodSteps ?? 0), new THREE.Vector3(0, 1, 0), dir, 0);
            fs.bloodSteps = (fs.bloodSteps ?? 0) - 1;
          }
          ft.plantedTime = 1e-4;
        }
      }
    }
  }

  /**
   * Physics body for a fighter leaving animation control: an active (euphoria) ragdoll when
   * enabled and within the per-quality budget, otherwise a passive Rapier ragdoll.
   */
  makeRagdoll(f: Fighter, velScale = 0.6, opts: { classic?: boolean; vy?: number } = {}): RagdollLike {
    const init = {
      def: f.def,
      fk: f.anim.fk,
      prevFk: f.anim.prevFk,
      dt: Math.max(1 / 120, f.anim.lastDt),
      rootX: f.x,
      rootZ: f.z,
      rootYaw: f.yaw,
      rootY: f.y,
      vel: new THREE.Vector3(f.vx, opts.vy ?? f.vy, f.vz).multiplyScalar(velScale),
      scale: f.scale,
    };
    const room = this.euphoria.capacity + (f === this.player ? 2 : 0);
    // (the active ragdolls' world has its floor at 0: on a dock or a roof, the plain physics)
    const raised = Math.abs(f.y) > 0.05 || f.airborne;
    if (!opts.classic && !raised && this.settings.ragdolls === 'euphoria' && room > 0) return new ActiveRagdoll(this.euphoria, init);
    return new Ragdoll(this.physics, init);
  }

  /** Sounds / dust / blood when an active ragdoll's body parts hit the world. */
  private onBodyImpact(i: EuphoriaImpact) {
    const sp = i.speed;
    const vol = clamp((sp - 1) / 4.5, 0.12, 1);
    const torso = i.seg === 'pelvis' || i.seg === 'abdomen' || i.seg === 'chest';
    if (torso || i.seg === 'head' || sp > 3.2) this.audio.play('body_fall', { pos: i.point, vol: vol * (torso ? 0.95 : 0.6), pitch: torso ? 1 : 1.15 });
    else if (sp > 1.5) this.audio.play('footstep', { pos: i.point, vol: vol * 0.55 });
    if (this.arena.wet && i.other === 'floor' && sp > 1.5) this.audio.splash(i.point, vol * (torso ? 1 : 0.5));
    if (i.material === 'metal' && sp > 1.8) this.audio.play('metal_hit', { pos: i.point, vol: vol * 0.55 });
    // a body thrown onto the grand piano's keys
    if (i.material === 'piano' && sp > 1.4 && this.time - this.pianoT > 0.6) {
      this.pianoT = this.time;
      this.audio.piano(i.point, vol);
    }
    if (i.other === 'floor' && sp > 2.4 && torso) this.fx.dust(i.point.clone().setY(0.03), clamp(sp / 7, 0.25, 0.9));
    if (i.other === 'prop' && sp > 2.2) this.cam.addTrauma(0.05);
    // a head slamming into the floor or a wall leaves blood on it
    if (i.seg === 'head' && sp > 3.4 && (i.other === 'floor' || i.other === 'static')) {
      this.audio.play('face_crunch', { pos: i.point, vol: vol * 0.7 });
      let n = new THREE.Vector3(0, 1, 0);
      if (i.other === 'static') {
        const surf = this.arena.nearestSurface(i.point.x, i.point.z, 0.6);
        if (surf) n = surf.normal.clone();
      }
      this.blood.splat(i.point.clone().addScaledVector(n, 0.02), 0.12 + sp * 0.025, SPLAT.splash, 0.8, n);
      this.cam.addTrauma(0.12);
    }
  }

  private updateThrown(dt: number) {
    for (let i = this.thrown.length - 1; i >= 0; i--) {
      const t = this.thrown[i];
      t.t += dt;
      const e = t.e;
      const rag = e.downRag ?? e.ragdoll;
      if (!rag || t.t > 1.6) {
        this.thrown.splice(i, 1);
        continue;
      }
      const pelvis = rag.pelvisPos(new THREE.Vector3());
      const v = rag.pelvisVel(new THREE.Vector3());
      const speed = Math.hypot(v.x, v.z);
      this.props.checkBody(pelvis, speed);
      // bowl over other enemies
      for (const o of this.enemies()) {
        if (o === e || !o.alive || o.down || o.paired || o.cfg.boss) continue;
        if (Math.hypot(o.x - pelvis.x, o.z - pelvis.z) < 0.75 && speed > 2) {
          const h = makeHit({ dir: t.dir.clone(), point: new THREE.Vector3(o.x, 1.0, o.z), damage: 12, strength: 1.1, kind: 'slam', knockdown: true, launch: 1.5, bleed: 0.2, attacker: this.player });
          const res = o.takeHit(h);
          this.combat.feedback(this.player, o, h, res);
          this.player.addCombo(1, 'bowl');
        }
      }
      // wall / pillar impact
      if (!t.hitWall) {
        const surf = this.arena.nearestSurface(pelvis.x, pelvis.z, 0.55);
        if (surf && speed > 2.5) {
          t.hitWall = true;
          const p = surf.point.clone().setY(clamp(pelvis.y + 0.3, 0.4, 1.8));
          this.blood.splat(p.clone().addScaledVector(surf.normal, 0.02), 0.32, SPLAT.splash, 1, surf.normal);
          this.blood.splat(p.clone().addScaledVector(surf.normal, 0.02), 0.22, SPLAT.drip, 0.9, surf.normal, null, 2.2);
          this.audio.play('body_fall', { pos: p });
          this.audio.play(surf.obstacle.kind === 'crate' ? 'wood_break' : 'metal_hit', { pos: p, vol: 0.7 });
          if (surf.obstacle.kind === 'crate') this.fx.woodBurst(p, 10);
          this.fx.dust(p, 1.2);
          this.cam.addTrauma(0.35);
          this.arena.shakeLamps(p.x, p.z, 1.5);
          if (e.alive) {
            const h = makeHit({ dir: surf.normal.clone().negate(), point: p, damage: 35, strength: 1.3, kind: 'slam', bleed: 1.0, boneBreak: Math.random() < 0.4, attacker: this.player });
            e.hp -= h.damage;
            this.combat.feedback(this.player, e, h, e.hp <= 0 ? 'killed' : 'hit');
            if (e.hp <= 0) e.die(h);
            this.player.stats.envKills += e.alive ? 0 : 1;
          }
        }
      }
    }
  }

  /**
   * The rooftop's edge assist: a heavy blow that drives a body at a nearby parapet sends it over
   * (returns the launch velocity to give the ragdoll, or null).
   */
  edgeLaunch(x: number, z: number, dir: THREE.Vector3, power: number): THREE.Vector3 | null {
    const l = this.arena.nearestLedge(x, z, 1.9);
    if (!l) return null;
    const along = (dir.x * l.out.x + dir.z * l.out.z) / (Math.hypot(dir.x, dir.z) || 1);
    if (along < 0.5) return null;
    // closer and squarer = cleaner over; the coping takes the legs and the body pitches over it
    const k = clamp(power, 0.8, 1.6) * (0.75 + 0.25 * along);
    return l.out.clone().multiplyScalar((1.7 + l.dist * 0.9) * k).setY(2.7 + l.dist * 0.45);
  }

  private edgeCamT = 0;
  /** Rooftop: anyone the physics carries over the parapet is gone - alive, they die on the way down. */
  private edgeFalls(dt: number) {
    if (!this.arena.groundRect) return;
    this.edgeCamT -= dt;
    for (const e of this.enemies()) {
      if (!e.alive || !e.ragdoll) continue;
      const pv = e.ragdoll.pelvisPos(_edge);
      if (pv.y < -0.9) e.fellOff();
    }
  }

  /** A body just dropped past the roof's edge (alive or not): the scream, and a look down. */
  onOverEdge(f: Fighter, alive: boolean) {
    this.euphoria.count(alive ? 'edgeKill' : 'edgeBody');
    const at = f.ragdoll?.pelvisPos(new THREE.Vector3()) ?? new THREE.Vector3(f.x, -1, f.z);
    if (alive) this.audio.play(f === (this.player as unknown) ? this.player.style.voice.death : 'death', { pos: at, vol: 1, pitch: f === (this.player as unknown) ? 1 : 1.08 });
    // the landing, far below and a long moment later
    this.audio.play('body_fall', { pos: at, vol: 0.12, pitch: 0.6, delay: 2.2 });
    if (this.edgeCamT > 0 || this.cam.inCinematic || f === this.player) return;
    // never take the player's eyes off a blow that's already coming
    if (this.enemies().some((o) => o.alive && o.state === 'attack' && o.distTo(this.player) < 3.5)) return;
    this.edgeCamT = 5;
    this.slowMo(0.45, 1.2);
    const l = this.arena.nearestLedge(at.x, at.z, 8);
    // (l.out points from the body back toward the roof)
    const inward = l ? l.out.clone() : new THREE.Vector3(-at.x, 0, -at.z).normalize();
    // from just inside the parapet, over the coping, down at the falling body
    // (dist is to the parapet's outer face: 0.38 thick, then a step inside it)
    const pos = at.clone().setY(3.0).addScaledVector(inward, (l?.dist ?? 1) + 0.75);
    const focus = at.clone().addScaledVector(inward, -0.3).setY(at.y - 2.2);
    this.cam.playShot({ focus, pos, fov: 52, duration: 1.3, blendIn: 0.2, blendOut: 0.6, orbit: 0.08 });
  }

  onEnemyKilled(e: Enemy, h: HitInfo, how: 'edge' | null = null) {
    const p = this.player;
    const pts = Math.round(e.scoreValue * p.multiplier * (h.finisher ? 1.5 : how === 'edge' ? 2 : 1) * (DIFFICULTY[this.settings.difficulty] ?? DIFFICULTY.fighter).score);
    p.score += pts;
    if (this.story) {
      this.story.onEnemyKilled(e, h);
      if (e.cfg.boss) this.slowMo(0.15, 1.6);
      return;
    }
    if (how === 'edge') this.hud?.feed(e.cfg.boss ? `${e.cfg.label.toUpperCase()} WENT OVER` : 'OVER THE EDGE', `+${pts.toLocaleString()}`);
    else if (!e.cfg.boss) this.hud?.feed(`${e.cfg.label.toUpperCase()} DOWN`, `+${pts.toLocaleString()}`);
    if (e.cfg.boss) {
      this.arena.alarm?.(false);
      this.slowMo(0.15, 1.6);
      this.hud?.bannerShow(`${e.cfg.label}`, 'DEFEATED', 3, 'BOSS DOWN', true);
      this.audio.play('announcer', { file: 'audio/announcer/announcer_winner.wav', vol: 0.8 });
    } else if (this.waves.started && !this.waves.betweenWaves && this.waves.queue.length === 0 && !this.enemies().some((o) => o.alive)) {
      this.finalBlow(e);
    }
  }

  /**
   * The last enemy of a wave goes down: time stretches, the camera swings round the falling body
   * on the impact, and the hit lands with a deep thump (a finisher keeps its own camera).
   */
  finalBlow(e: Enemy) {
    this.slowMo(0.22, 1.25);
    this.hitStop(0.06);
    this.cam.addTrauma(0.35);
    this.renderer.fx.chroma = Math.max(this.renderer.fx.chroma, 0.7);
    const at = new THREE.Vector3();
    e.bodyPoint('chest', at);
    this.audio.thump(1.6, at);
    if (this.cam.inCinematic) return;
    const p = this.player;
    const dx = e.x - p.x, dz = e.z - p.z;
    const d = Math.hypot(dx, dz) || 1;
    // beside the line of the blow, low, looking across both fighters
    const side = Math.random() < 0.5 ? 1 : -1;
    const mid = new THREE.Vector3((p.x + e.x) / 2, 1.0, (p.z + e.z) / 2);
    const pos = mid.clone().add(new THREE.Vector3((-dz / d) * side * 2.5, 0.15, (dx / d) * side * 2.5)).addScaledVector(new THREE.Vector3(dx / d, 0, dz / d), -0.4);
    this.cam.playShot({ focus: mid, pos, fov: 44, duration: 0.9, blendIn: 0.12, blendOut: 0.6, orbit: 0.45 * side });
  }

  onWeaponThrownHit(w: Weapon, target: Fighter) {
    const e = target as Enemy;
    const p = new THREE.Vector3();
    e.bodyPoint('chest', p);
    const h = makeHit({ dir: new THREE.Vector3(e.x - this.player.x, 0, e.z - this.player.z).normalize(), point: p, damage: w.kind === 'knife' ? 45 : 30, strength: 1.0, kind: w.kind === 'club' ? 'blunt' : 'blade', bleed: w.kind === 'club' ? 0.5 : 1.3, stun: 1.8, attacker: this.player });
    const res = e.takeHit(h);
    this.combat.feedback(this.player, e, h, res);
    this.player.addCombo(1, 'throwweapon');
    if (w.body) w.body.setLinvel({ x: rand(-1, 1), y: 1, z: rand(-1, 1) }, true);
  }

  /**
   * After the run: the last minute again, from the replay - the world holds still while it plays,
   * the camera is the game's as it was or a free one.
   */
  openReplay() {
    if (!this.over || this.replay.active) return;
    if (this.spectating) {
      this.spectating = false;
      this.cam.stopFree();
      this.hud?.setSpectate(false);
    }
    if (!this.replay.open()) return;
    this.hud?.show(null);
    this.hud?.setReplay(true);
    this.input.clearHeld();
    this.input.requestLock();
  }
  closeReplay() {
    if (!this.replay.active) return;
    this.replay.close();
    this.input.exitLock();
    this.hud?.setReplay(false);
    this.hud?.show(this.hud.resultsId);
  }
  /** Gamepad buttons held last frame (the replay acts on presses). */
  private padWas: boolean[] = [];
  /** A frame of the replay: its clock, the camera, the listener, the screen settling back. */
  private replayStep(realDt: number) {
    const inp = this.input;
    const [lx, ly] = inp.takeLook();
    // a gamepad: A play / pause, B back, X camera, LB / RB 5 s back / on, d-pad up / down speed,
    // the triggers fly the free camera up / down
    const pad = navigator.getGamepads?.().find((gp) => gp && gp.connected);
    let padUp = 0;
    if (pad) {
      padUp = (pad.buttons[7]?.value ?? 0) - (pad.buttons[6]?.value ?? 0);
      const r = this.replay;
      const pressed = (i: number) => !!pad.buttons[i]?.pressed && !this.padWas[i];
      if (pressed(0)) r.togglePlay();
      if (pressed(2)) r.toggleCamera();
      if (pressed(4)) r.seek(r.t - 5);
      if (pressed(5)) r.seek(r.t + 5);
      if (pressed(12)) r.setSpeed(1);
      if (pressed(13)) r.setSpeed(-1);
      const back = pressed(1) || pressed(9);
      this.padWas = pad.buttons.map((b) => b.pressed);
      if (back) {
        this.closeReplay();
        return;
      }
    }
    this.replay.update(realDt);
    if (this.replay.cam === 'free') {
      const up = pad ? padUp : (inp.isHeld('grab') ? 1 : 0) - (inp.isHeld('stun') ? 1 : 0);
      this.cam.updateFree(realDt, lx, ly, inp.moveX, inp.moveY, up, inp.isHeld('walk'));
    }
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.cam.camera.quaternion);
    this.audio.setListener(this.cam.camera.position, right);
    this.music.update(realDt);
    const fx = this.renderer.fx;
    fx.chroma = damp(fx.chroma, 0, 7, realDt);
    fx.flash = damp(fx.flash, 0, 12, realDt);
    fx.red = damp(fx.red, 0, 3, realDt);
    fx.desat = damp(fx.desat, 0.12, 4, realDt);
    this.hud?.updateReplay(this.replay);
  }

  /** After the run: flying round the room to take in the aftermath (the fight plays on). */
  spectating = false;
  startSpectate() {
    if (!this.over || this.spectating) return;
    this.spectating = true;
    this.hud?.show(null);
    this.hud?.setSpectate(true);
    this.cam.startFree();
    this.input.clearHeld();
    this.input.requestLock();
  }
  stopSpectate() {
    if (!this.spectating) return;
    this.spectating = false;
    this.cam.stopFree();
    this.input.exitLock();
    this.hud?.setSpectate(false);
    this.hud?.show(this.hud.resultsId);
  }

  onPlayerDeath() {
    if (this.over) return;
    this.over = true;
    this.replay.playerDown();
    this.slowMo(0.2, 2.5);
    if (this.story) {
      const st = this.story;
      st.onDeath();
      setTimeout(() => {
        this.input.exitLock();
        this.hud?.storyDeath(st);
      }, 2600);
      return;
    }
    this.audio.play('announcer', { file: 'audio/announcer/announcer_game_over.wav', vol: 0.8 });
    const p = this.player;
    const stats = {
      Difficulty: this.settings.difficulty.toUpperCase(),
      Arena: MAPS.find((m) => m.id === this.arena.map)?.name ?? this.arena.map,
      'Wave reached': this.waves.wave,
      Score: p.score.toLocaleString(),
      Kills: p.stats.kills,
      'Bodies on the floor': this.corpses.count,
      'Best combo': p.bestCombo,
      ...(p.style.special ? { 'Pistol specials': p.stats.specials } : {}),
      Counters: `${p.stats.counters} (${p.stats.perfectCounters} perfect)`,
      Dodges: `${p.stats.dodges} (${p.stats.perfectDodges} perfect)`,
      Finishers: p.stats.finishers,
      Takedowns: p.stats.takedowns,
      'Environment kills': p.stats.envKills,
      'Bones broken': p.stats.boneBreaks,
      Disarms: p.stats.disarms,
    };
    let record = false;
    try {
      const prev = JSON.parse(localStorage.getItem('last-stance-best') ?? 'null');
      if (!prev || p.score > prev.score) {
        record = p.score > 0;
        localStorage.setItem('last-stance-best', JSON.stringify({ wave: this.waves.wave, score: p.score, kills: p.stats.kills }));
      }
    } catch {
      /* ignore */
    }
    // rank: how far you got, how well you flowed, how clean your defence was
    const w = this.waves.wave;
    const pts = w * 6 + Math.min(30, p.bestCombo * 0.6) + Math.min(15, p.stats.perfectCounters * 1.5) + Math.min(10, p.stats.finishers * 0.5);
    const grade = pts >= 110 ? 'S' : pts >= 80 ? 'A' : pts >= 55 ? 'B' : pts >= 32 ? 'C' : 'D';
    setTimeout(() => {
      this.input.exitLock();
      this.hud?.gameOver(stats, { grade, record });
    }, 2600);
  }

  addFighter(f: Fighter) {
    this.fighters.push(f);
    this.addBodyProxy(f);
    this.replay?.track(f);
  }

  /**
   * Standing fighters as kinematic capsules in the active-ragdoll world: falling / flying bodies
   * collide with the people around them instead of passing through, and a body crashing into a
   * standing enemy hands over its momentum (the enemy stumbles physically or goes down).
   */
  private addBodyProxy(f: Fighter) {
    const s = f.scale;
    const shape = Shape.capsule(0.21 * s * Math.sqrt(f.def.spec.bulk), 0.5 * s, { localPos: new Vec3(0, 0.88 * s, 0), friction: 0.5, restitution: 0.05, material: 'flesh' });
    const pose = { p: new THREE.Vector3(), q: new THREE.Quaternion() };
    const bump = new THREE.Vector3();
    let bumpT = -1;
    this.euphoria.addProxy(
      shape,
      75 * s * s,
      () => {
        if (!this.fighters.includes(f)) return null;
        // ragdolled / dead: parked out of the world
        pose.p.set(f.x, f.ragdoll || !f.alive ? -100 : 0, f.z);
        return pose;
      },
      (imp) => {
        if (!f.alive || f.ragdoll) return;
        if (this.time - bumpT > 0.25) bump.set(0, 0, 0);
        bumpT = this.time;
        bump.add(imp);
        const mag = Math.hypot(bump.x, bump.z);
        if (f instanceof Enemy && mag > 26) {
          f.bodyBump(bump.clone());
          bump.set(0, 0, 0);
        } else if (f === this.player && mag > 45) {
          this.cam.addTrauma(0.15);
          bump.set(0, 0, 0);
        }
      },
    );
  }
  removeFighter(f: Fighter) {
    const i = this.fighters.indexOf(f);
    if (i >= 0) this.fighters.splice(i, 1);
  }

  /** Player locomotion source: motion capture (default) or the procedural gait. */
  applyMocap() {
    const loco = this.player.anim.loco;
    if (this.settings.mocap && !loco.mocap) {
      loco.mocap = new MocapDriver();
      const feet: [THREE.Vector3, THREE.Vector3] = [new THREE.Vector3(), new THREE.Vector3()];
      loco.footWorld(0, feet[0]);
      loco.footWorld(1, feet[1]);
      loco.mocap.init(loco, feet, [loco.feet[0].yaw, loco.feet[1].yaw]);
      if (this.player.style.id === 'scarlet') {
        loco.mocap.sway = 1;
        loco.mocap.strideK = 0.9;
      }
    } else if (!this.settings.mocap) loco.mocap = null;
  }

  separate(dt: number) {
    const fs = this.fighters;
    for (const f of fs) if (f.sepSoft > 0) f.sepSoft -= dt;
    for (let i = 0; i < fs.length; i++) {
      const a = fs[i];
      if (!a.solid || !a.alive) continue;
      for (let j = i + 1; j < fs.length; j++) {
        const b = fs[j];
        if (!b.solid || !b.alive) continue;
        if (a.paired === b || b.paired === a) continue;
        const dx = b.x - a.x, dz = b.z - a.z;
        const r = a.radius + b.radius;
        const d2 = dx * dx + dz * dz;
        if (d2 < r * r && d2 > 1e-8) {
          const d = Math.sqrt(d2);
          let push = (r - d) * 0.5;
          // (a pair that just let go of each other - a counter on a big brute leaves them a hand's
          // width inside one another - drifts apart instead of snapping that width in one frame)
          if (a.sepSoft > 0 || b.sepSoft > 0) push = Math.min(push, SOFT_SEPARATION * dt);
          const nx = dx / d, nz = dz / d;
          const wa = a.anim.mode === 'clip' ? 0.3 : 1, wb = b.anim.mode === 'clip' ? 0.3 : 1;
          const tw = wa + wb;
          a.shove(-nx * push * ((2 * wa) / tw), -nz * push * ((2 * wa) / tw));
          b.shove(nx * push * ((2 * wb) / tw), nz * push * ((2 * wb) / tw));
        }
      }
    }
  }

  /**
   * Fighters standing between the camera and the player (a brute stepping in front of the lens,
   * someone circling behind you on the camera side) thin out to a dither so the player always
   * reads. Not the ones fighting at arm's length or locked in a move with the player, and not
   * during a cinematic shot, which frames the action on purpose.
   */
  private thinOccluders(realDt: number) {
    const cam = this.cam.camera.position;
    const p = this.player;
    const k = 1 - Math.exp(-12 * realDt);
    for (const f of this.fighters) {
      if (f === p) continue;
      let want = 0;
      const near = Math.hypot(f.x - p.x, f.z - p.z) < 1.35;
      if (f.alive && !near && !f.paired && p.alive && !this.cam.inCinematic) {
        const r = 0.36 * f.scale, h = 1.9 * f.scale;
        const dx = p.x - cam.x, dz = p.z - cam.z;
        const len2 = Math.max(1e-6, dx * dx + dz * dz);
        const t = ((f.x - cam.x) * dx + (f.z - cam.z) * dz) / len2;
        if (t > 0.02 && t < 0.92) {
          const ox = cam.x + dx * t - f.x, oz = cam.z + dz * t - f.z;
          // the sight lines to the player's hips and chest at that point
          const y1 = cam.y + (0.95 - cam.y) * t, y2 = cam.y + (1.45 - cam.y) * t;
          if (ox * ox + oz * oz < r * r && Math.min(y1, y2) < h && Math.max(y1, y2) > 0.1) want = 0.62;
        }
      }
      const u = f.model.uniforms.uFade;
      u.value += (want - u.value) * k;
      if (want === 0 && u.value < 0.02) u.value = 0;
    }
  }

  renderFrame() {
    this.blood.flush(this.renderer.gl);
    this.renderer.render(this.scene, this.cam.camera, this.realTime);
  }
}

export async function startGame(params: URLSearchParams) {
  const app = document.getElementById('app')!;
  const { takeLaunch } = await import('./story/save');
  const launch = params.get('test') ? null : takeLaunch(params);
  const ch = launch ? CHAPTERS[launch.chapter] : null;
  const loading = document.createElement('div');
  loading.className = 'loading';
  loading.innerHTML = ch
    ? `<div class="lk">SCARLET</div><div class="lg">BEFORE DAWN</div><div class="lb"><i></i></div><div class="lt">${ch.kick} · ${ch.title}</div>`
    : '<div class="lg">LAST<br><span>STANCE</span></div><div class="lb"><i></i></div><div class="lt">PREPARING THE ARENA</div>';
  document.body.appendChild(loading);
  // the arenas paint lettering into their textures (graffiti, signs): have the fonts first
  try {
    await Promise.race([
      Promise.all([document.fonts.load("400 100px 'Anton'"), document.fonts.load("italic 800 60px 'Barlow Condensed'"), document.fonts.load("700 60px 'Barlow Condensed'")]),
      new Promise((r) => setTimeout(r, 3000)),
    ]);
  } catch {
    /* system fonts then */
  }
  const game = new Game(app, params, ch ? launch : null);
  (window as unknown as { game: Game }).game = game;
  await game.init();
  loading.style.opacity = '0';
  setTimeout(() => loading.remove(), 520);
  if (params.get('test')) {
    game.testMode = true;
    const t = await import('./debug/testHarness');
    await t.runTest(game, params);
    return;
  }
  if (params.get('bot') === '1') {
    // attract/demo mode: the scripted bot plays the real game
    const t = await import('./debug/testHarness');
    const bot = new t.Bot(game);
    game.preStep = (dt) => bot.update(dt);
    if (params.get('god') === '1') game.godMode = true;
    if (!game.story) game.beginRun();
  }
  game.start();
  (window as unknown as { __ready: boolean }).__ready = true;
  if (game.story) void game.story.begin();
}
