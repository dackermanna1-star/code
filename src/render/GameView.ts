// Presentation of a World: creature rigs, the hunter, projectiles, corpses,
// blood and effects. Listens to logic events; reads entity state each frame.
//
// First person (stage.viewMode 'first'): the camera rides at the hunter's eyes
// along Player.aim, the hunter's body is hidden from the main pass (it still
// casts its shadow and shows in the ice mirror), and a viewmodel (arms + the
// current gun) is drawn over the world; flashes, tracers, casings and the
// laser start at the viewmodel's gun.
import * as THREE from 'three';
import { TICK, TICK_RATE, PLAYER } from '../config/constants';
import { FP, aimDir, type Aim, type ViewMode } from '../config/firstPerson';
import { WEAPONS, WEAPON_ORDER, type ShellKind, type WeaponId } from '../config/weapons';
import type { EnemyType } from '../config/enemies';
import type { World } from '../core/World';
import type { Enemy } from '../core/Enemy';
import type { Player } from '../core/Player';
import type { GameEvents } from '../core/Events';
import type { Projectile } from '../core/Combat';
import { Activist, Bear, Penguin, Seal, Turtle } from '../core/enemies';
import { BloodSystem } from './BloodSystem';
import { Corpses } from './Corpses';
import { Debris } from './Debris';
import { Effects } from './Effects';
import { Physics } from './Physics';
import { Ragdoll, type RagdollOptions } from './Ragdoll';
import type { ProjectedPoint, Stage } from './Stage';
import type { CreatureRig, AnimInput } from './models/types';
import { createCreatureRig } from './models/creatures';
import { createHunterRig, type HunterRig } from './models/hunter';
import { teamColor } from '../config/team';
import {
  createClipModel,
  createShellModel,
  createGrenadeModel,
  createLauncherRoundModel,
  createWeaponModel,
  type WeaponModel,
} from './models/weapons';
import { Viewmodel } from './models/viewmodel';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _dir = { x: 0, y: 0, z: 0 };
/** Seconds a teammate's speech balloon stays up. */
const SPEECH_TIME = 3.2;
const _laserA = new THREE.Vector3();
const _laserB = new THREE.Vector3();
const _proj: ProjectedPoint = { x: 0, y: 0 };
/** Invisible stand-in for the hunter's materials in the first-person main pass (depth/shadow still drawn). */
const HIDDEN = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
/** Aim used by the camera when the player has none (autoplay bot in first person): left, slightly down. */
const DEFAULT_AIM: Aim = { yaw: 0, pitch: -0.1 };
/** Creature pop-in when it appears in view (first person), s. */
const POP_TIME = 0.32;
/** Presentation-only view kick per shot (rad of pitch), first person. */
const VIEW_KICK: Record<WeaponId, number> = {
  pistol: 0.012,
  magnum: 0.04,
  mp5: 0.006,
  grenades: 0,
  shotgun: 0.05,
  mac10: 0.006,
  flunk: 0.035,
  m4: 0.007,
  awp: 0.07,
  vintage: 0.1,
  minigun: 0.004,
};

interface CreatureView {
  enemy: Enemy;
  rig: CreatureRig;
  px: number;
  py: number;
  pz: number;
  yaw: number;
  stateKey: string;
  stateStart: number;
  bleedT: number;
  cubHidden: boolean;
  /** 0..1 first-person pop-in progress (1 = done). */
  pop: number;
}

interface HunterView {
  player: Player;
  rig: HunterRig;
  models: Map<WeaponId, WeaponModel>;
  current: WeaponId | null;
  px: number;
  py: number;
  pz: number;
  stateKey: string;
  stateStart: number;
  dead: boolean;
}

interface LooseBody {
  rag: Ragdoll | null;
  obj: THREE.Object3D;
}

/** Overlay data handed to the 2D overlay each frame (CSS px in the view). */
export interface OverlayState {
  crosshairs: Array<{
    x: number;
    y: number;
    text: string;
    textColor: string;
    /** 'center': first-person reticle at the screen centre. */
    kind?: 'world' | 'center';
    /** First person: 0..1 reload progress, null when not reloading. */
    reload?: number | null;
    /** First person: weapon spread, degrees. */
    spreadDeg?: number;
    /** Crosshair colour (teammates); default is player 1's blue. */
    color?: string;
  }>;
  texts: Array<{
    x: number;
    y: number;
    text: string;
    color: string;
    alpha: number;
    size?: number;
    bold?: boolean;
    /** What the text is (the modern overlay styles each differently). */
    role?: 'money' | 'popup' | 'label' | 'name' | 'speech';
  }>;
  vignette: number;
  /** First person: 0..1 hit-marker intensity and whether that hit killed. */
  hitMarker?: number;
  hitMarkerKill?: boolean;
}

interface Popup {
  pos: THREE.Vector3;
  text: string;
  age: number;
  /** World tick it was created (first person anchors bounties to the kill). */
  tick: number;
  /** First person: anchored to the creature that paid it. */
  anchored: boolean;
}

const DEATH_MASS: Record<EnemyType, number> = {
  seal: 80,
  fatseal: 400,
  cub: 15,
  activist: 75,
  penguin: 30,
  bear: 450,
  turtle: 300,
  walrus: 1000,
};

export class GameView {
  readonly physics = new Physics();
  readonly blood: BloodSystem;
  readonly effects: Effects;
  readonly debris: Debris;
  readonly corpses: Corpses;
  readonly root = new THREE.Group();
  private world: World | null = null;
  private unsub: Array<() => void> = [];
  private creatures = new Map<number, CreatureView>();
  private hunters = new Map<number, HunterView>();
  private ragdolls: Ragdoll[] = [];
  private loose: LooseBody[] = [];
  private projectiles = new Map<number, THREE.Object3D>();
  private fountains: Array<{ bone: THREE.Object3D; t: number }> = [];
  private popups: Popup[] = [];
  /** Bot teammates' speech balloons (original speech-balloon), age in seconds. */
  private speech: Array<{ playerId: number; text: string; age: number }> = [];
  /** Classic-view laser sight for the human's gun line (Options → Laser sight). */
  laserSight = true;
  private time = 0;
  private alpha = 0;
  /** Camera mode (mirrors stage.viewMode). */
  private fp = false;
  readonly viewmodel = new Viewmodel();
  private lights: { sun: THREE.DirectionalLight | null; hemi: THREE.HemisphereLight | null } | null = null;
  private hidden: THREE.Mesh[] = [];
  private hiddenMats: Array<THREE.Material | THREE.Material[]> = [];
  // first-person camera state
  private kick = 0;
  private kickVel = 0;
  private kickYaw = 0;
  private shake = 0;
  private eyeDrop = 0;
  private camRoll = 0;
  private lastYaw = 0;
  private lastPitch = 0;
  private deathT = -1;
  private deathYaw = 0;
  private deathPitch = 0;
  private hitMarker = 0;
  private hitKill = false;
  private hitTick = -1;
  /** Camera aim used last frame (yaw, pitch incl. kick) — for audio panning and tests. */
  readonly camAim: Aim = { yaw: 0, pitch: 0 };
  /** Called for sound effects that come from presentation (shell bounces, splashes). */
  sound: ((name: string, x: number, volume?: number) => void) | null = null;
  soundRandom: ((prefix: string, x: number, volume?: number) => void) | null = null;
  isOnFloe: (x: number, z: number) => boolean = () => true;

  constructor(private stage: Stage, opts: { decalResolution?: number } = {}) {
    const scene = stage.scene;
    this.root.name = 'GameView';
    scene.add(this.root);
    this.blood = new BloodSystem(stage.renderer, scene, opts.decalResolution ?? 2048);
    this.effects = new Effects(scene);
    this.debris = new Debris(scene, (k) => createShellModel(k));
    this.debris.clipFactory = (k) => createClipModel(k);
    this.debris.onShellBounce = (kind, x, s) => {
      const prefix = kind === 'shotgun' ? 'weapons/shshell' : kind === 'small' ? 'weapons/sshell' : 'weapons/shell';
      this.soundRandom?.(prefix, x, 0.35 + s * 0.4);
    };
    this.corpses = new Corpses(scene);
    this.blood.onLand = (x, z, size) => this.corpses.soak(x, z, size * 0.15);
    stage.onPreRender(() => this.blood.flush());
    // First person: the hunter is hidden from the main pass only (the ice
    // mirror and shadow map still see him), then the viewmodel draws on top.
    stage.onBeforeMainRender(() => this.hideHunters());
    stage.onAfterMainRender(() => {
      this.restoreHunters();
      if (this.fp) this.viewmodel.render(stage.renderer);
    });
    stage.onViewMode((m) => this.setViewMode(m));
    this.setViewMode(stage.viewMode);
  }

  /** First person on/off (driven by stage.onViewMode). */
  private setViewMode(mode: ViewMode): void {
    const fp = mode === 'first';
    if (fp === this.fp) return;
    this.fp = fp;
    this.viewmodel.reset();
    this.kick = this.kickVel = this.kickYaw = this.shake = 0;
    this.camRoll = 0;
    for (const h of this.hunters.values()) {
      if (!fp) h.rig.root.rotation.y = 0;
    }
    if (!fp) {
      for (const v of this.creatures.values()) {
        v.pop = 1;
        v.rig.root.scale.setScalar(1);
      }
    }
  }

  get firstPerson(): boolean {
    return this.fp;
  }

  private collectHidden = (o: THREE.Object3D): void => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    this.hidden.push(m);
    this.hiddenMats.push(m.material);
    m.material = HIDDEN;
  };

  private hideHunters(): void {
    if (!this.fp) return;
    for (const h of this.hunters.values()) {
      if (h.player.id !== 0 || !h.rig.root.parent) continue;
      h.rig.root.traverse(this.collectHidden);
    }
  }

  private restoreHunters(): void {
    for (let i = 0; i < this.hidden.length; i++) this.hidden[i].material = this.hiddenMats[i];
    this.hidden.length = 0;
    this.hiddenMats.length = 0;
  }

  setFloeTest(f: (x: number, z: number) => boolean): void {
    this.isOnFloe = f;
    this.blood.isOnFloe = f;
    this.debris.isOnFloe = f;
  }

  // ------------------------------------------------------------------ lifecycle
  attach(world: World): void {
    this.detach();
    this.world = world;
    this.blood.clear();
    world.isOnFloe = this.isOnFloe;
    const on = <K extends keyof GameEvents>(k: K, f: (e: GameEvents[K]) => void) => this.unsub.push(world.events.on(k, f));
    on('enemySpawn', (e) => this.onSpawn(e.enemyId));
    on('enemyDeath', (e) => this.onDeath(e));
    on('hit', (e) => {
      this.onHit(e);
      if (e.part !== 'shell') {
        this.hitMarker = Math.max(this.hitMarker, e.bullet ? 1 : 0.75);
        if (this.hitTick !== world.tick) this.hitKill = false;
        this.hitTick = world.tick;
      }
    });
    on('ricochet', (e) => {
      this.effects.sparks(e.point, 8, 1, 6);
    });
    on('shot', (e) => this.onShot(e));
    on('say', (e) => {
      this.speech = this.speech.filter((s) => s.playerId !== e.playerId);
      this.speech.push({ playerId: e.playerId, text: e.text, age: 0 });
    });
    on('shellEject', (e) => this.onShell(e));
    on('clipDrop', (e) => this.onClip(e));
    on('explosion', (e) => this.onExplosion(e));
    on('grenadeBounce', (e) => this.effects.snowPuff(e.pos, 2, 0.12, 0.4));
    on('cubShotOut', (e) => this.onCubShotOut(e.enemyId, e.point));
    on('cubDropped', (e) => {
      const v = this.creatures.get(e.activistId);
      if (v?.rig.cub) {
        v.rig.cub.visible = false;
        v.cubHidden = true;
      }
    });
    on('money', (e) => {
      if (e.amount > 0) {
        this.popups.push({ pos: new THREE.Vector3(e.pos.x, e.pos.y + 0.3, e.pos.z), text: `${e.amount}$`, age: 0, tick: world.tick, anchored: false });
      }
    });
    on('playerHurt', (e) => {
      if (e.playerId === 0) this.shake = Math.min(1, this.shake + 0.25 + e.damage / 400);
    });
    on('playerKnocked', (e) => {
      if (e.playerId === 0) this.shake = Math.min(1, this.shake + 0.45);
    });
    on('playerLaunched', (e) => {
      if (e.playerId === 0) this.shake = Math.min(1, this.shake + 0.6);
    });
    on('playerLand', (e) => {
      const p = world.players[e.playerId];
      if (p) this.effects.snowPuff({ x: p.x, y: 0, z: p.z }, 4, 0.2);
    });
    on('playerKick', (e) => {
      const p = world.players[e.playerId];
      if (p) this.effects.snowPuff({ x: p.x - 0.5, y: 0, z: p.z }, 3, 0.15);
    });
    on('playerDeath', (e) => this.onPlayerDeath(e.playerId, e.by));
    on('walrusDevour', () => {
      this.shake = 1;
    });
    on('weaponSwitch', (e) => this.mountWeapon(e.playerId, e.weapon));
    on('buy', (e) => this.mountWeapon(e.playerId, e.weapon));
    on('walrusDevour', (e) => {
      const p = world.players[e.playerId];
      if (p) this.blood.spray({ x: p.x, y: 1, z: p.z }, 80, { dirX: 1, speed: [1, 6], up: [1, 5], spread: 3 });
    });
    for (const p of world.players) this.addHunter(p);
    for (const e of world.enemies) this.onSpawn(e.id);
  }

  detach(): void {
    for (const u of this.unsub) u();
    this.unsub.length = 0;
    for (const v of this.creatures.values()) v.rig.root.removeFromParent();
    this.creatures.clear();
    for (const h of this.hunters.values()) h.rig.root.removeFromParent();
    this.hunters.clear();
    for (const r of this.ragdolls) {
      r.freeze();
      r.rig.root.removeFromParent();
    }
    this.ragdolls.length = 0;
    for (const l of this.loose) {
      l.rag?.freeze();
      l.obj.removeFromParent();
    }
    this.loose.length = 0;
    for (const o of this.projectiles.values()) o.removeFromParent();
    this.projectiles.clear();
    this.fountains.length = 0;
    this.popups.length = 0;
    this.hitMarker = 0;
    this.deathT = -1;
    this.viewmodel.reset();
    this.corpses.clear();
    this.debris.clear();
    this.effects.clear();
    this.blood.clear();
    this.world = null;
  }

  /** Record positions before a logic step (for interpolation). */
  beforeStep(): void {
    for (const v of this.creatures.values()) {
      v.px = v.enemy.x;
      v.py = v.enemy.y;
      v.pz = v.enemy.z;
    }
    for (const h of this.hunters.values()) {
      h.px = h.player.x;
      h.py = h.player.y;
      h.pz = h.player.z;
    }
  }

  // ------------------------------------------------------------------ creatures
  private onSpawn(id: number): void {
    const w = this.world;
    if (!w || this.creatures.has(id)) return;
    const e = w.enemyById(id);
    if (!e) return;
    const rig = createCreatureRig(e.type);
    rig.root.position.set(e.x, e.y, e.z);
    this.root.add(rig.root);
    this.creatures.set(id, {
      enemy: e,
      rig,
      px: e.x,
      py: e.y,
      pz: e.z,
      yaw: e.facing < 0 ? Math.PI : 0,
      stateKey: '',
      stateStart: this.time,
      bleedT: 0,
      cubHidden: false,
      pop: this.fp && this.inView(e.x, e.y + 0.5, e.z) ? 0 : 1,
    });
    if (this.fp && this.creatures.get(id)!.pop < 1) rig.root.scale.setScalar(0.01);
  }

  /** Is the world point on screen (first person)? */
  private inView(x: number, y: number, z: number): boolean {
    const s = this.stage.project(_v3.set(x, y, z), _proj);
    return !s.behind && s.x > -40 && s.x < this.stage.viewW + 40 && s.y > -40 && s.y < this.stage.viewH + 40;
  }

  private animState(e: Enemy): string {
    if (e instanceof Turtle && e.state === 'hidden') return e.stateTicks < 10 ? 'hide' : 'hidden';
    return e.state;
  }

  private updateCreature(v: CreatureView, dt: number): void {
    const e = v.enemy;
    const a = this.alpha;
    const x = v.px + (e.x - v.px) * a;
    const y = v.py + (e.y - v.py) * a;
    const z = v.pz + (e.z - v.pz) * a;
    v.rig.root.position.set(x, y, z);
    if (v.pop < 1) {
      // First person: creatures that spawn in view grow and rise out of the haze.
      v.pop = Math.min(1, v.pop + dt / POP_TIME);
      const t = v.pop;
      const back = 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2; // ease-out-back
      v.rig.root.scale.setScalar(Math.max(0.01, 0.3 + 0.7 * back));
      v.rig.root.position.y = y - 0.35 * (1 - t) * (1 - t);
    }
    const speed = Math.hypot(e.vx, e.vz);
    // Face the direction of travel (they mostly walk right; small yaw only).
    let target = e.facing < 0 ? Math.PI : 0;
    if (speed > 0.2) {
      const yaw = Math.atan2(-e.vz, Math.abs(e.vx) + 0.001);
      target += Math.max(-0.6, Math.min(0.6, yaw)) * (e.facing < 0 ? -1 : 1);
    }
    let d = target - v.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    v.yaw += d * Math.min(1, dt * (e.type === 'walrus' ? 3 : 8));
    v.rig.root.rotation.y = v.yaw;

    const st = this.animState(e);
    if (st !== v.stateKey) {
      v.stateKey = st;
      v.stateStart = this.time - (e.stateTicks * TICK);
    }
    const params: AnimInput['params'] = { facing: e.facing };
    if (e instanceof Activist) params.hasCub = e.hasCub && !v.cubHidden;
    if (e instanceof Bear) params.rage = e.rage;
    if (e.isBoss) params.boss = true;
    v.rig.animate({
      state: st,
      stateTime: this.time - v.stateStart,
      time: this.time,
      distance: e.distance,
      speed,
      dt,
      params,
    });

    // Blood trails: crawling seals, activists who lost their cub.
    v.bleedT -= dt;
    if (v.bleedT <= 0) {
      if (e instanceof Seal && e.crawling) {
        // Original: a 1-2 px blood speck every 1-20 ticks — a sparse dotted trail.
        v.bleedT = 0.04 + Math.random() * 0.35;
        const r = 0.025 + Math.random() * 0.035;
        this.blood.splat('drop', x - 0.3 - Math.random() * 0.2, z + (Math.random() - 0.5) * 0.25, r, { angle: 0, stretch: 1 + Math.random() });
      } else if (e instanceof Activist && (e.state === 'panic' || e.state === 'flee')) {
        // Original: bleeds every tick for half a second, then on 1 tick in 10.
        const early = e.state === 'panic' && e.stateTicks < 25;
        v.bleedT = early ? 0.04 : 0.2 + Math.random() * 0.25;
        const chest = { x: x + 0.25, y: 1.15, z };
        this.blood.spray(chest, early ? 4 : 1, { dirX: 0.4, speed: [0.5, 2.5], up: [0, 2], spread: 1.2 });
      }
    }
    // Walrus scraping its tusks before the rush.
    if (e.type === 'walrus' && e.state === 'charge') {
      // Tusk tips scrape the ice before the rush: sparks and ice dust.
      for (const name of ['tuskTipL', 'tuskTipR']) {
        const tip = v.rig.bones.get(name) ?? v.rig.bones.get('tusks');
        const p = tip ? tip.getWorldPosition(_v) : _v.set(x + 1.6 * e.facing, 0.1, z);
        if (Math.random() < 0.6) this.effects.sparks({ x: p.x, y: Math.max(0.04, p.y), z: p.z }, 2, -e.facing, 5);
        if (Math.random() < 0.15) this.effects.snowPuff({ x: p.x, y: 0, z: p.z }, 1, 0.2);
      }
    }
    if (e.type === 'walrus' && e.state === 'rush' && Math.random() < 0.5) {
      this.effects.snowPuff({ x: x - e.facing * 1.4, y: 0, z: z + (Math.random() - 0.5) * 1.5 }, 1, 0.35, 1.5);
    }
    if (e instanceof Penguin && e.gliding && Math.random() < 0.25) {
      this.effects.snowPuff({ x: x - 0.4, y: 0, z }, 1, 0.1, 0.3);
    }
  }

  // ------------------------------------------------------------------ deaths
  private onDeath(ev: GameEvents['enemyDeath']): void {
    const w = this.world;
    if (w && this.hitTick === w.tick) this.hitKill = true;
    const v = this.creatures.get(ev.enemyId);
    if (w && v) {
      // Bounties are paid just before the death event: first person shows them over the body.
      for (const pp of this.popups) {
        if (pp.tick === w.tick && !pp.anchored) {
          pp.anchored = true;
          pp.pos.set(v.enemy.x, v.enemy.y + 0.6 + v.enemy.def.halfLength * 0.6, v.enemy.z);
        }
      }
    }
    if (!v) return;
    if (v.pop < 1) {
      v.pop = 1;
      v.rig.root.scale.setScalar(1);
    }
    this.creatures.delete(ev.enemyId);
    const e = v.enemy;
    const rig = v.rig;
    const mass = DEATH_MASS[e.type];
    const pt = new THREE.Vector3(ev.point.x, ev.point.y, ev.point.z);
    const dir = new THREE.Vector3(ev.dirX, 0.18, ev.dirZ).normalize();
    // Final pose at the moment of death.
    rig.root.position.set(e.x, e.y, e.z);
    rig.root.updateMatrixWorld(true);

    const opts: RagdollOptions = {};
    const vel = new THREE.Vector3(e.vx, 0, e.vz);
    if (e instanceof Bear) vel.x = e.deathSlide;
    if (e instanceof Penguin && ev.kind === 'glide') vel.multiplyScalar(1.1);
    opts.velocity = vel;
    // Bullet momentum, scaled like the original's death animations.
    const dv = Math.min(5, 0.6 + ev.force / (mass * 0.6));
    opts.impulse = { point: pt, dir, speed: dv };

    const gibBones = new Set(Object.entries(rig.spec).filter(([, s]) => s.gib).map(([k]) => k));
    switch (ev.kind) {
      case 'gib':
        opts.detach = gibBones;
        opts.detachSpeed = 6 + Math.min(6, ev.force / 100);
        this.gore(pt, e, 1);
        break;
      case 'headoff':
        opts.detach = new Set([rig.head]);
        opts.detachSpeed = 3.5;
        opts.impulse = { point: pt, dir: new THREE.Vector3(ev.dirX, 0.8, ev.dirZ).normalize(), speed: 3.5, bone: rig.head };
        break;
      case 'headshot':
        opts.impulse = { point: pt, dir: new THREE.Vector3(ev.dirX, 0.35, ev.dirZ).normalize(), speed: dv * 1.2, bone: rig.head };
        break;
      case 'kick':
        opts.impulse = { point: pt, dir: new THREE.Vector3(-1, 0.9, 0).normalize(), speed: 5, bone: rig.head };
        break;
      case 'stomp':
        opts.impulse = { point: pt, dir: new THREE.Vector3(0, -1, 0), speed: 3, bone: rig.head };
        this.blood.pool(e.x + 0.4, e.z, 0.5);
        this.blood.spray({ x: e.x + 0.4, y: 0.15, z: e.z }, 30, { dirX: 1, speed: [1, 4], up: [0.5, 3], spread: 3 });
        break;
      case 'blast': {
        const ex = ev.explosion ?? ev.point;
        opts.blast = { point: new THREE.Vector3(ex.x, ex.y, ex.z), speed: Math.min(7, 2 + ev.force / 150) };
        if (ev.force > 350) {
          opts.detach = gibBones;
          opts.detachSpeed = 7;
          this.gore(pt, e, 0.7);
        }
        break;
      }
      case 'violent':
        opts.impulse.speed = Math.min(9, dv * 1.8);
        break;
    }
    // Activist's held cub dies too if not dropped alive.
    if (e instanceof Activist && rig.cub && rig.cub.visible && !v.cubHidden) {
      this.detachCub(rig, pt, dir, ev.kind === 'blast');
    }

    const rag = new Ragdoll(this.physics, rig, opts);
    rag.onSink = (part) => {
      const p = part.body.position;
      this.effects.splash({ x: p.x, y: -2.4, z: p.z }, Math.min(1.5, part.spec.mass / 60));
      this.soundRandom?.('weapons/3/bounce', p.x, 0.4);
    };
    rag.onFrozen = (r) => this.onFrozen(r, e.type);
    this.ragdolls.push(rag);
    if (ev.kind === 'headoff') {
      const neck = rig.bones.get(rig.head)?.parent;
      if (neck) this.fountains.push({ bone: neck, t: 1.4 });
    }

    // Blood from the killing blow.
    const n = ev.kind === 'gib' ? 0 : Math.min(150, 45 + ev.force / 5);
    if (n > 0) {
      this.blood.spray(pt, n, { dirX: ev.dirX, dirZ: ev.dirZ, speed: [1.5, 11], up: [-0.5, 4], spread: 0.8, jitter: 2, size: [0.025, 0.09] });
      this.effects.bloodPuff(pt, ev.dirX, 1);
    }
  }

  /** Big bloody burst for gibs. */
  private gore(pt: THREE.Vector3, e: Enemy, k: number): void {
    const size = e.def.halfLength;
    this.blood.spray(pt, 160 * k * (0.6 + size), { dirX: -1, speed: [1, 12], up: [0.5, 6], spread: Math.PI, size: [0.025, 0.09], jitter: 3 });
    this.blood.pool(e.x, e.z, 0.4 + size * 0.6);
    for (let i = 0; i < 4; i++) this.effects.bloodPuff({ x: pt.x, y: pt.y + Math.random() * 0.4, z: pt.z }, -1, 2.5);
  }

  private detachCub(rig: CreatureRig, pt: THREE.Vector3, dir: THREE.Vector3, blast: boolean): void {
    const cub = rig.cub;
    if (!cub) return;
    cub.updateMatrixWorld(true);
    const wp = cub.getWorldPosition(new THREE.Vector3());
    const wq = cub.getWorldQuaternion(new THREE.Quaternion());
    const holder = new THREE.Group();
    holder.position.copy(wp);
    holder.quaternion.copy(wq);
    this.root.add(holder);
    cub.removeFromParent();
    cub.position.set(0, 0, 0);
    cub.quaternion.identity();
    holder.add(cub);
    // A single-body ragdoll for the little seal.
    const fake: CreatureRig = {
      root: new THREE.Group(),
      bones: new Map([['cub', holder]]),
      spec: { cub: { shape: 'box', size: [0.35, 0.14, 0.18], offset: [0, 0.05, 0], mass: 12 } },
      head: 'cub',
      animate: () => {},
    };
    const rag = new Ragdoll(this.physics, fake, {
      velocity: new THREE.Vector3(dir.x * (blast ? 4 : 2.5), blast ? 3.5 : 1.2, dir.z * 2),
      groundOnly: true,
    });
    rag.parts[0].body.angularVelocity.set((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 10);
    rag.onFrozen = () => {
      this.blood.pool(holder.position.x, holder.position.z, 0.3);
      this.corpses.bake(holder);
    };
    this.loose.push({ rag, obj: holder });
    this.blood.spray(pt, 25, { dirX: dir.x, dirZ: dir.z, speed: [2, 7], up: [0, 3], spread: 0.8 });
  }

  private onCubShotOut(enemyId: number, point: { x: number; y: number; z: number }): void {
    const v = this.creatures.get(enemyId);
    if (!v || !v.rig.cub || v.cubHidden) return;
    v.cubHidden = true;
    this.detachCub(v.rig, new THREE.Vector3(point.x, point.y, point.z), new THREE.Vector3(-1, 0, 0), false);
  }

  private onFrozen(r: Ragdoll, type: EnemyType): void {
    const c = r.centre(_v2);
    if (c.y > -1) {
      const r = Math.min(1.8, 0.35 + DEATH_MASS[type] / 400);
      this.blood.pool(c.x, c.z, r);
      // Spatter around the body.
      for (let i = 0; i < 16; i++) {
        const a = Math.random() * Math.PI * 2;
        const d = r * (0.6 + Math.random() * 1.1);
        this.blood.splat('drop', c.x + Math.cos(a) * d, c.z + Math.sin(a) * d * 0.8, 0.03 + Math.random() * 0.05);
      }
    }
    this.corpses.bake(r.rig.root);
  }

  // ------------------------------------------------------------------ hits
  private onHit(e: GameEvents['hit']): void {
    if (e.type === 'turtle' && e.part === 'shell') return;
    const strength = Math.min(1.5, e.damage / 60);
    if (e.bullet) {
      // Original: 15 blobs per bullet hit, thrown 3-6 px/tick away from the gun.
      // The original floods the ice: by the end of level 2 the lanes are
      // wide, dense red bands (reference frame 2).
      const n = Math.min(110, 46 + e.damage / 3) * (e.part === 'head' ? 1.4 : 1);
      this.blood.spray(e.point, n, {
        dirX: e.dirX,
        dirZ: e.dirZ,
        speed: [2, 15],
        up: [-2, 3],
        spread: 0.45,
        size: [0.015, 0.07],
        jitter: 1.8,
      });
      this.effects.bloodPuff(e.point, e.dirX, strength);
    } else {
      this.blood.spray(e.point, 12 + e.damage / 15, { dirX: e.dirX, dirZ: e.dirZ, speed: [1, 6], up: [0.5, 4], spread: 1.5 });
    }
  }

  // ------------------------------------------------------------------ hunter
  private addHunter(p: Player): void {
    const tc = teamColor(p.id);
    const rig = createHunterRig({ parka: tc.parka, parkaDeep: tc.parkaDeep });
    rig.root.position.set(p.x, p.y, p.z);
    this.root.add(rig.root);
    const h: HunterView = {
      player: p,
      rig,
      models: new Map(),
      current: null,
      px: p.x,
      py: p.y,
      pz: p.z,
      stateKey: '',
      stateStart: 0,
      dead: false,
    };
    this.hunters.set(p.id, h);
    this.mountWeapon(p.id, p.weapon.id);
  }

  private mountWeapon(playerId: number, id: WeaponId): void {
    const h = this.hunters.get(playerId);
    if (!h || h.current === id) return;
    let m = h.models.get(id);
    if (!m) {
      m = createWeaponModel(id);
      h.models.set(id, m);
    }
    h.rig.setWeapon(m);
    h.current = id;
  }

  private weaponModel(playerId: number): WeaponModel | undefined {
    const h = this.hunters.get(playerId);
    return h && h.current ? h.models.get(h.current) : undefined;
  }

  /** First person: is this player's gun the viewmodel? */
  private fpGun(playerId: number): boolean {
    return this.fp && playerId === 0 && this.viewmodel.visible && this.viewmodel.current?.id === this.world?.players[0]?.weapon.id;
  }

  private onShot(e: GameEvents['shot']): void {
    if (this.fpGun(e.playerId)) {
      this.onShotFP(e);
      return;
    }
    const h = this.hunters.get(e.playerId);
    const m = this.weaponModel(e.playerId);
    const def = WEAPONS[e.weapon];
    const muzzles: THREE.Vector3[] = [];
    if (h && m) {
      h.rig.root.updateMatrixWorld(true);
      for (const mz of m.muzzles) muzzles.push(mz.getWorldPosition(new THREE.Vector3()));
    }
    if (!muzzles.length) muzzles.push(new THREE.Vector3(e.muzzle.x, e.muzzle.y, e.muzzle.z));
    if (def.muzzle !== 'none') for (const mp of muzzles) this.effects.muzzle(mp, def.muzzle as 'small' | 'big' | 'shotgun');
    // Tracers: faint full line plus a bright moving segment, like the original's
    // momentary yellow bullet trays.
    e.paths.forEach((path, i) => {
      const from = path.ric ? new THREE.Vector3(path.from.x, path.from.y, path.from.z) : muzzles[i % muzzles.length];
      const to = _v.set(path.to.x, path.to.y, path.to.z);
      const len = from.distanceTo(to);
      this.effects.beam(from, to, 0.012, path.ric ? 0xffe0a0 : 0xffee66, 0.22, 0.05);
      const t0 = Math.random() * 0.6;
      const t1 = Math.min(1, t0 + Math.min(0.5, 3 / Math.max(1, len)));
      const a = from.clone().lerp(to, t0);
      const b = from.clone().lerp(to, t1);
      this.effects.beam(a, b, 0.03, 0xfff3a0, 0.85, 0.035);
    });
  }

  /** First-person shot: flash on the viewmodel, tracers from its muzzle(s), smoke and impacts in the world. */
  private onShotFP(e: GameEvents['shot']): void {
    const vm = this.viewmodel;
    const def = WEAPONS[e.weapon];
    const n = Math.max(1, vm.muzzleCount);
    const muzzles: THREE.Vector3[] = [];
    for (let i = 0; i < n; i++) {
      const p = vm.muzzleWorld(i, new THREE.Vector3());
      if (p) muzzles.push(p);
    }
    if (!muzzles.length) muzzles.push(new THREE.Vector3(e.muzzle.x, e.muzzle.y, e.muzzle.z));
    vm.basis(_right, _up, _fwd);
    if (def.muzzle !== 'none') {
      vm.fire(def.muzzle as 'small' | 'big' | 'shotgun');
      const big = def.muzzle !== 'small';
      for (const mp of muzzles) {
        this.effects.flash(mp.x + _fwd.x * 0.4, mp.y + 0.15, mp.z + _fwd.z * 0.4, 0xffc070, big ? 9 : 5, 0.06, 7);
        // smoke drifting off the muzzle
        this.effects.emit(false, mp.x + _fwd.x * 0.12, mp.y + 0.01, mp.z + _fwd.z * 0.12, {
          vel: [_fwd.x * 0.6 + (Math.random() - 0.5) * 0.2, 0.25 + Math.random() * 0.2, _fwd.z * 0.6 + (Math.random() - 0.5) * 0.2],
          drag: 2.5,
          size: [0.04, big ? 0.32 : 0.2],
          life: 0.5 + Math.random() * 0.3,
          color: 0xd8d8d8,
          alpha: [0.18, 0],
          frame: 1,
          vr: (Math.random() - 0.5) * 2,
        });
      }
    }
    const kickK = VIEW_KICK[e.weapon] ?? 0;
    this.kickVel += kickK * 28;
    this.kickYaw += (Math.random() - 0.5) * kickK * 0.6;
    e.paths.forEach((path, i) => {
      const from = path.ric ? _v2.set(path.from.x, path.from.y, path.from.z) : muzzles[i % muzzles.length];
      const to = _v.set(path.to.x, path.to.y, path.to.z);
      const len = from.distanceTo(to);
      this.effects.beam(from, to, path.ric ? 0.008 : 0.005, path.ric ? 0xffe0a0 : 0xffee66, 0.16, 0.05);
      // bright segment, kept a little away from the eye so it reads as a streak, not a bar
      const skip = Math.min(0.5, 1.2 / Math.max(1, len));
      const t0 = skip + Math.random() * Math.max(0, 0.7 - skip);
      const t1 = Math.min(1, t0 + Math.min(0.45, 4 / Math.max(1, len)));
      this.effects.beam(_v3.copy(from).lerp(to, t0), from.clone().lerp(to, t1), 0.016, 0xfff3a0, 0.8, 0.035);
      if (path.ground === 'ice' && !path.ric) {
        this.effects.snowPuff({ x: to.x, y: 0, z: to.z }, 1, 0.14, 0.4);
        this.effects.sparks({ x: to.x, y: 0.02, z: to.z }, 2, Math.sign(to.x - from.x) || 1, 3);
      } else if (path.ground === 'water' && !path.ric) {
        this.effects.splash({ x: to.x, y: Math.min(to.y, -2.4), z: to.z }, 0.25);
      }
    });
  }

  private onShell(e: GameEvents['shellEject']): void {
    const h = this.hunters.get(e.playerId);
    const m = this.weaponModel(e.playerId);
    if (!h) return;
    const kind: ShellKind = e.weapon === 'magnum' ? 'small' : WEAPONS[e.weapon].shell === 'none' ? 'small' : WEAPONS[e.weapon].shell;
    if (this.fpGun(e.playerId)) {
      const pos = this.viewmodel.ejectorWorld(new THREE.Vector3());
      if (pos) {
        // Out to the right of the view, a little back and up; the hunter's own drift carries them.
        this.viewmodel.basis(_right, _up, _fwd);
        const dir = new THREE.Vector3().copy(_right).addScaledVector(_fwd, -0.25);
        dir.y = 0;
        dir.normalize();
        const carrier = new THREE.Vector3(h.player.vx, 0, h.player.vz);
        const power = e.weapon === 'magnum' ? 0.25 : kind === 'minigun' || kind === 'awp' ? 1.3 : 1;
        // Start just right of the gun (the port itself is under the viewmodel), at true size.
        pos.addScaledVector(_right, 0.16);
        for (let i = 0; i < e.count; i++) this.debris.shell(kind, pos, carrier, power * 0.8, dir, 0.45);
        return;
      }
    }
    h.rig.root.updateMatrixWorld(true);
    const pos = m ? m.ejector.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(h.player.x, PLAYER.muzzleHeight, h.player.z);
    const carrier = new THREE.Vector3(h.player.vx, 0, h.player.vz);
    const power = e.weapon === 'magnum' ? 0.25 : kind === 'minigun' || kind === 'awp' ? 1.3 : 1;
    for (let i = 0; i < e.count; i++) this.debris.shell(kind, pos, carrier, power);
  }

  private onClip(e: GameEvents['clipDrop']): void {
    const h = this.hunters.get(e.playerId);
    const m = this.weaponModel(e.playerId);
    if (!h) return;
    const kind = WEAPONS[e.weapon].clipKind;
    h.rig.root.updateMatrixWorld(true);
    let pos = m?.magazine ? m.magazine.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(h.player.x - 0.3, 0.6, h.player.z);
    if (this.fpGun(e.playerId)) pos = this.viewmodel.magazineWorld(new THREE.Vector3()) ?? pos;
    const n = e.weapon === 'mac10' ? 2 : 1;
    for (let i = 0; i < n; i++) this.debris.clip(kind, pos.clone().add(new THREE.Vector3(0, 0, i * 0.2 - 0.1)), new THREE.Vector3(h.player.vx, 0, h.player.vz));
  }

  private onExplosion(e: GameEvents['explosion']): void {
    const onIce = this.isOnFloe(e.pos.x, e.pos.z);
    if (onIce) {
      this.effects.explosion(e.pos, e.radius);
      this.blood.splat('soot', e.pos.x, e.pos.z, e.radius * 0.75);
      this.blood.splat('scorch', e.pos.x, e.pos.z, e.radius * 0.38);
    } else {
      this.effects.splash({ x: e.pos.x, y: -2.4, z: e.pos.z }, 2);
      this.effects.explosion({ x: e.pos.x, y: -2.2, z: e.pos.z }, e.radius * 0.6);
    }
    this.physics.blast(e.pos.x, e.pos.y, e.pos.z, e.radius * 1.4, 22);
  }

  private onPlayerDeath(id: number, by: 'walrus' | 'explosion'): void {
    const h = this.hunters.get(id);
    if (!h) return;
    h.dead = true;
    const p = h.player;
    if (id === 0) {
      this.deathT = 0;
      this.deathYaw = this.camAim.yaw;
      this.deathPitch = this.camAim.pitch;
    }
    if (by === 'walrus') {
      h.rig.root.visible = false;
      return;
    }
    h.rig.setWeapon(null);
    const rag = new Ragdoll(this.physics, h.rig, {
      velocity: new THREE.Vector3(p.vx, 2, p.vz),
      impulse: { point: new THREE.Vector3(p.x, 1, p.z), dir: new THREE.Vector3(1, 0.6, 0).normalize(), speed: 5 },
    });
    rag.onFrozen = (r) => this.blood.pool(r.centre(_v2).x, r.centre(_v2).z, 0.6);
    this.ragdolls.push(rag);
  }

  private updateHunter(h: HunterView, dt: number): void {
    const p = h.player;
    if (h.dead) return;
    const a = this.alpha;
    h.rig.root.position.set(h.px + (p.x - h.px) * a, h.py + (p.y - h.py) * a, h.pz + (p.z - h.pz) * a);
    // First person: the (hidden) body turns with the view so its shadow and mirror image match.
    if (this.fp && p.aim) h.rig.root.rotation.y = p.aim.yaw;
    else if (!this.fp) h.rig.root.rotation.y = 0;
    if (p.state !== h.stateKey) {
      h.stateKey = p.state;
      h.stateStart = this.time - p.stateTicks * TICK;
    }
    const w = p.weapon;
    const wt = this.world!.tick;
    const fireT = (wt - w.lastShotTick + a) / TICK_RATE;
    let cock = -1;
    if (w.id === 'shotgun' && w.state === 'fire') cock = Math.min(1, w.ticks / w.def.fireTicks);
    if (w.id === 'vintage' && w.state === 'fire') cock = Math.min(1, w.ticks / 35);
    const throwT = w.id === 'grenades' && w.state === 'fire' ? Math.min(1, (w.ticks + a) / w.fireTicks) : -1;
    h.rig.animate({
      state: p.state,
      stateTime: this.time - h.stateStart,
      time: this.time,
      distance: p.distance,
      speed: Math.hypot(p.vx, p.vz),
      dt,
      params: {
        weapon: WEAPON_ORDER.indexOf(w.id),
        fireT,
        reloadT: w.reloadProgress,
        heat: w.heat / 20,
        cock,
        throwT,
      },
    });
    const m = h.current ? h.models.get(h.current) : undefined;
    if (m) {
      if (m.magazine) m.magazine.visible = !(w.state === 'reload' && w.reloadProgress < 0.55);
      // AWP laser sight (hidden while firing/reloading, like the original).
      if (m.laser && w.state === 'idle' && p.canAct && this.fpGun(p.id)) {
        this.fpLaser(p);
      } else if (this.laserSight && !this.fp && p.id === 0 && !p.isBot && p.canAct && w.def.kind === 'hitscan' && w.state !== 'reload') {
        this.classicLaser(h, m);
      } else if (m.laser && w.state === 'idle' && p.canAct) {
        h.rig.root.updateMatrixWorld(true);
        const s = m.laser.getWorldPosition(new THREE.Vector3());
        const end = new THREE.Vector3(-30, s.y, s.z);
        this.effects.beamFrame(s, end, 0.02, 0xd81010, 0.75, true);
        this.effects.beamFrame(s.clone().add(new THREE.Vector3(0, -0.02, 0)), end.clone().add(new THREE.Vector3(0, -0.02, 0)), 0.03, 0xff6400, 0.3);
      }
    }
  }

  /**
   * Classic-view laser sight (option): from the gun along the gun line to where
   * the centre bullet would stop — the first creature in the lane (with a red
   * dot on it) or the far edge. Shown while idle and firing, off while reloading.
   */
  private classicLaser(h: HunterView, m: WeaponModel): void {
    const w = this.world;
    if (!w) return;
    h.rig.root.updateMatrixWorld(true);
    const s = (m.laser ?? m.muzzles[0]).getWorldPosition(_laserA);
    const tr = w.combat.lineTrace(h.player);
    // The rendered gun leads the logic muzzle slightly; never draw backwards.
    const endX = Math.min(tr.x, s.x - 0.05);
    const end = _laserB.set(endX, s.y, s.z);
    // A solid red core (reads on the white ice) inside a faint additive glow.
    this.effects.beamFrame(s, end, 0.032, 0x9a0000, 1, true);
    this.effects.beamFrame(s, end, 0.075, 0xff2010, 0.25);
    if (tr.enemy) {
      this.effects.emit(false, endX + 0.02, s.y, s.z + 0.05, { size: [0.16, 0.12], life: 0.03, color: 0xe01010, alpha: [0.9, 0.6], frame: 0 });
      this.effects.emit(true, endX + 0.02, s.y, s.z + 0.05, { size: [0.3, 0.24], life: 0.03, color: 0xff3020, alpha: [0.6, 0.3], frame: 0 });
    }
  }

  /** First-person AWP laser: from the viewmodel's emitter to where the aim meets the ice / range. */
  private fpLaser(p: Player): void {
    const vm = this.viewmodel;
    const lz = vm.current?.laser;
    if (!lz) return;
    const s = vm.toWorld(lz.getWorldPosition(_v2), _laserA);
    // Converge on what is under the reticle: a creature, the ice, or far ahead.
    const tr = this.world?.combat.aimTrace(p);
    const end = _laserB;
    let dot = false;
    if (tr) {
      end.set(tr.point.x, tr.point.y, tr.point.z);
      dot = !!tr.enemy || tr.ground === 'ice';
    } else {
      aimDir(this.camAim, _dir);
      const eye = this.stage.camera.position;
      end.set(eye.x + _dir.x * 45, eye.y + _dir.y * 45, eye.z + _dir.z * 45);
    }
    // Widths are in metres: thin near the gun, still a visible thread at range.
    this.effects.beamFrame(s, end, 0.006, 0xd81010, 0.75, true);
    this.effects.beamFrame(s, end, 0.012, 0xff2010, 0.45);
    if (dot) this.effects.emit(true, end.x, end.y + 0.01, end.z, { size: [0.07, 0.06], life: 0.03, color: 0xff3020, alpha: [0.9, 0.5], frame: 0 });
  }

  // ------------------------------------------------------------------ first-person camera
  /**
   * Pose the first-person camera at the hunter's eyes and animate the
   * viewmodel. Presentation only: view kick, shake, knock-down dips and the
   * death fall never feed back into the logic aim.
   */
  private updateFirstPerson(dt: number): void {
    const w = this.world;
    const h = this.hunters.get(0);
    const vm = this.viewmodel;
    if (!w || !h) {
      vm.visible = false;
      return;
    }
    const p = h.player;
    const a = this.alpha;
    const ix = h.px + (p.x - h.px) * a;
    const iy = h.py + (p.y - h.py) * a;
    const iz = h.pz + (p.z - h.pz) * a;
    const aim = p.aim ?? DEFAULT_AIM;

    // View kick: a damped spring that snaps up and settles back.
    this.kickVel += (-this.kick * 260 - this.kickVel * 24) * dt;
    this.kick = Math.max(-0.05, this.kick + this.kickVel * dt);
    this.kickYaw *= Math.exp(-dt * 10);
    this.shake = Math.max(0, this.shake - dt * 1.6);

    // Body state: sitting after a knock-down / landing, getting up, tumbling.
    const st = p.state;
    const stT = this.time - h.stateStart;
    let drop = 0;
    let tilt = 0;
    let rollT = 0;
    if (st === 'sit') {
      drop = -0.62;
      tilt = 0.12;
    } else if (st === 'getup') {
      const u = Math.min(1, stT / 0.5);
      drop = -0.62 * (1 - u * u * (3 - 2 * u));
      tilt = 0.12 * (1 - u);
    } else if (st === 'kick') {
      drop = -0.05 * Math.sin(Math.min(1, stT / 0.3) * Math.PI);
      tilt = -0.15 * Math.sin(Math.min(1, stT / 0.3) * Math.PI);
    } else if (st === 'air') {
      rollT = 0.35 * Math.sin(stT * 7);
      tilt = 0.15 * Math.sin(stT * 5);
    }
    this.eyeDrop += (drop - this.eyeDrop) * (1 - Math.exp(-dt * (drop < this.eyeDrop ? 16 : 9)));

    // Walk bob (gentle) and a hint of roll when strafing.
    const speed = Math.hypot(p.vx, p.vz);
    const onIce = p.y <= 0.001;
    const bobW = onIce && st === 'walk' ? Math.min(1, speed / 3.2) : 0;
    const ph = (p.distance / 1.05) * Math.PI * 2;
    const bob = (Math.abs(Math.cos(ph)) - 0.6) * 0.022 * bobW;
    const rx = -Math.sin(aim.yaw);
    const rz = -Math.cos(aim.yaw);
    const strafe = (p.vx * rx + p.vz * rz) / 4;
    const rollGoal = -Math.max(-1, Math.min(1, strafe)) * 0.02 + rollT;
    this.camRoll += (rollGoal - this.camRoll) * (1 - Math.exp(-dt * 6));

    let yaw = aim.yaw + this.kickYaw;
    let pitch = aim.pitch + this.kick + tilt;
    let roll = this.camRoll;
    let ex = ix;
    let ey = iy + FP.eyeHeight + this.eyeDrop + bob;
    let ez = iz;
    if (this.shake > 0) {
      const s = this.shake * this.shake;
      const t = this.time;
      yaw += s * 0.03 * Math.sin(t * 37.1);
      pitch += s * 0.03 * Math.sin(t * 41.7 + 1);
      roll += s * 0.04 * Math.sin(t * 29.3 + 2);
    }
    if (!p.alive) {
      // Death: the view slumps to the ice and rolls over.
      if (this.deathT < 0) {
        this.deathT = 0;
        this.deathYaw = this.camAim.yaw;
        this.deathPitch = this.camAim.pitch;
      }
      this.deathT += dt;
      const u = Math.min(1, this.deathT / 0.9);
      const e = 1 - (1 - u) * (1 - u);
      const head = h.rig.bones.get('head');
      if (head && h.rig.root.parent && h.rig.root.visible) {
        head.getWorldPosition(_v2);
        ex = _v2.x;
        ez = _v2.z;
        ey = Math.max(0.18, _v2.y + 0.1);
      } else {
        ey = lerp(iy + FP.eyeHeight, 0.25, e);
      }
      yaw = this.deathYaw + 0.4 * e;
      pitch = lerp(this.deathPitch, -0.35, e);
      roll = 1.2 * e;
    }
    this.stage.poseFirstPerson(ex, ey, ez, yaw, pitch, roll);

    // Viewmodel
    vm.visible = p.alive;
    const dyaw = yaw - this.lastYaw;
    const dpitch = pitch - this.lastPitch;
    this.lastYaw = yaw;
    this.lastPitch = pitch;
    this.camAim.yaw = yaw;
    this.camAim.pitch = pitch;
    if (!vm.visible) return;
    if (!this.lights) this.lights = findLights(this.stage.scene);
    vm.syncCamera(this.stage.camera);
    vm.syncLights(this.stage.scene, this.lights.sun, this.lights.hemi);
    const wp = p.weapon;
    const fireT = (w.tick - wp.lastShotTick + a) / TICK_RATE;
    let cock = -1;
    if (wp.id === 'shotgun' && wp.state === 'fire') cock = Math.min(1, wp.ticks / wp.def.fireTicks);
    if (wp.id === 'vintage' && wp.state === 'fire') cock = Math.min(1, wp.ticks / 35);
    vm.update({
      weapon: wp.id,
      fireT,
      reloadT: wp.reloadProgress,
      heat: wp.heat / 20,
      cock,
      throwT: wp.id === 'grenades' && wp.state === 'fire' ? Math.min(1, (wp.ticks + a) / wp.fireTicks) : -1,
      ready: p.canAct,
      speed: onIce && st === 'walk' ? speed : 0,
      distance: p.distance,
      height: iy,
      vy: p.vy,
      lookYaw: Math.abs(dyaw) > 1 ? 0 : dyaw,
      lookPitch: Math.abs(dpitch) > 1 ? 0 : dpitch,
      dt,
      time: this.time,
    });
  }

  // ------------------------------------------------------------------ projectiles
  private updateProjectiles(dt: number): void {
    const w = this.world!;
    const seen = new Set<number>();
    for (const p of w.combat.projectiles as Projectile[]) {
      seen.add(p.id);
      let o = this.projectiles.get(p.id);
      if (!o) {
        o = p.kind === 'grenade' ? createGrenadeModel() : createLauncherRoundModel();
        o.scale.multiplyScalar(1.5);
        this.root.add(o);
        this.projectiles.set(p.id, o);
      }
      o.position.set(p.x, p.y, p.z);
      // First-person throws/launches carry a heading: turn the model to it, tumble about its own axis.
      if (p.heading !== undefined) o.rotation.set(0, p.heading, p.rot, 'YXZ');
      else o.rotation.z = p.rot;
      if (p.kind === 'round' && Math.random() < 0.7) {
        // smoke trails behind the round (classic: it always flies left)
        const sp = Math.hypot(p.vx, p.vz);
        const tx = p.heading !== undefined && sp > 0.1 ? -p.vx / sp : 1;
        const tz = p.heading !== undefined && sp > 0.1 ? -p.vz / sp : 0;
        this.effects.emit(false, p.x + 0.15 * tx, p.y, p.z + 0.15 * tz, {
          vel: [0.5 * tx, 0.4, 0.5 * tz],
          drag: 2,
          size: [0.08, 0.35],
          life: 0.5,
          color: 0xcfcfcf,
          alpha: [0.35, 0],
          frame: 1,
        });
      }
    }
    for (const [id, o] of this.projectiles) {
      if (!seen.has(id)) {
        o.removeFromParent();
        this.projectiles.delete(id);
      }
    }
    void dt;
  }

  // ------------------------------------------------------------------ frame
  update(dt: number, alpha: number): void {
    this.time += dt;
    this.alpha = alpha;
    const w = this.world;
    if (w) {
      for (const v of this.creatures.values()) {
        if (v.enemy.removed && !v.enemy.dead) {
          // escaped
          v.rig.root.removeFromParent();
          this.creatures.delete(v.enemy.id);
          continue;
        }
        this.updateCreature(v, dt);
      }
      for (const h of this.hunters.values()) this.updateHunter(h, dt);
      this.updateProjectiles(dt);
      if (this.fp) this.updateFirstPerson(dt);
    } else {
      this.viewmodel.visible = false;
    }
    this.hitMarker = Math.max(0, this.hitMarker - dt / 0.25);
    this.physics.update(dt);
    let wr = 0;
    for (const r of this.ragdolls) {
      r.sync(dt);
      // Sliding corpses smear blood (bear death slide).
      if (!r.frozen && r.speed > 1.2 && Math.random() < 0.5) {
        const c = r.centre(_v2);
        if (c.y < 1.2 && c.y > -0.5) this.blood.splat('smear', c.x - 0.2, c.z, 0.16, { angle: 0, stretch: 2 });
      }
      if (!r.frozen) this.ragdolls[wr++] = r;
    }
    this.ragdolls.length = wr;
    let wl = 0;
    for (const l of this.loose) {
      l.rag?.sync(dt);
      if (l.rag && !l.rag.frozen) this.loose[wl++] = l;
    }
    this.loose.length = wl;
    let wf = 0;
    for (const f of this.fountains) {
      f.t -= dt;
      if (f.t <= 0) continue;
      const p = f.bone.getWorldPosition(_v);
      this.blood.spray({ x: p.x, y: p.y + 0.1, z: p.z }, 2 * f.t, { dirX: 0.2, speed: [0.3, 1.5], up: [2, 4.5], spread: Math.PI });
      this.fountains[wf++] = f;
    }
    this.fountains.length = wf;
    for (const pp of this.popups) {
      pp.age += dt;
      pp.pos.y += dt * (this.fp ? 0.7 : 1.2);
    }
    this.popups = this.popups.filter((pp) => pp.age < 1);
    for (const s of this.speech) s.age += dt;
    this.speech = this.speech.filter((s) => s.age < SPEECH_TIME);
    this.blood.update(dt);
    this.corpses.flushTints();
    this.effects.update(dt);
    this.debris.update(dt);
  }

  /** World-anchored UI for the overlay. */
  overlay(): OverlayState {
    const out: OverlayState = { crosshairs: [], texts: [], vignette: 0 };
    const w = this.world;
    if (!w) return out;
    if (this.fp) return this.overlayFP(w, out);
    for (const h of this.hunters.values()) {
      const p = h.player;
      if (!p.alive) continue;
      const a = this.alpha;
      const ix = h.px + (p.x - h.px) * a;
      const iz = h.pz + (p.z - h.pz) * a;
      const iy = h.py + (p.y - h.py) * a;
      const c = p.crosshair();
      const sc = this.stage.project(_v.set(c.x + (ix - p.x), c.y + (iy - p.y), iz));
      const wpn = p.weapon;
      let text: string;
      let color: string;
      if (wpn.state === 'reload') {
        const pr = Math.floor(wpn.reloadProgress * 10) * 10;
        text = `${pr}%`;
        color = `rgba(235, 70, 70, ${0.95 - pr / 250})`;
      } else {
        text = `${wpn.bullets}`;
        color = 'rgba(40, 40, 48, 0.85)';
      }
      const tc = p.isBot ? teamColor(p.id).ui : undefined;
      if (p.canAct) out.crosshairs.push({ x: sc.x, y: sc.y, text, textColor: color, color: tc });
      const ms = this.stage.project(_v.set(ix + 0.05, iy + PLAYER.height + 0.42, iz));
      // Original: every hunter's money above his head in his colour (bots too).
      out.texts.push({ x: ms.x, y: ms.y, text: `$${p.money}`, color: tc ?? 'rgba(40, 40, 48, 0.8)', alpha: 1, size: 9, role: 'money' });
      if (p.isBot) out.texts.push({ x: ms.x, y: ms.y, text: p.name, color: tc!, alpha: 0.95, size: 8, role: 'name' });
      out.vignette = Math.max(out.vignette, Math.min(1, (PLAYER.life - p.life) / PLAYER.life) * 0.8);
    }
    for (const pp of this.popups) {
      const s = this.stage.project(pp.pos);
      out.texts.push({ x: s.x, y: s.y, text: pp.text, color: 'rgb(200, 20, 20)', alpha: 0.5 * (1 - pp.age), size: 10, role: 'popup' });
    }
    this.speechOverlay(out);
    return out;
  }

  /** Speech balloons above the bot teammates (both views; culled behind the camera). */
  private speechOverlay(out: OverlayState): void {
    const w = this.world;
    if (!w) return;
    for (const s of this.speech) {
      const h = this.hunters.get(s.playerId);
      if (!h || !h.player.alive) continue;
      const p = h.player;
      const pr = this.stage.project(_v.set(p.x, p.y + PLAYER.height + (this.fp ? 0.55 : 0.85), p.z), _proj);
      if (pr.behind) continue;
      const fade = Math.min(1, s.age * 6) * Math.min(1, (SPEECH_TIME - s.age) * 2);
      out.texts.push({ x: pr.x, y: pr.y, text: `${p.name}: ${s.text}`, color: teamColor(p.id).ui, alpha: fade, size: 9, bold: true, role: 'speech' });
    }
  }

  /** First person: centre reticle, hit marker, money over the bodies, damage vignette. */
  private overlayFP(w: World, out: OverlayState): OverlayState {
    const p = w.player;
    const vw = this.stage.viewW;
    const vh = this.stage.viewH;
    const k = this.stage.scale;
    if (p.alive) {
      const wpn = p.weapon;
      const reloading = wpn.state === 'reload';
      const text = reloading ? `${Math.floor(wpn.reloadProgress * 10) * 10}%` : `${wpn.bullets}`;
      out.crosshairs.push({
        x: vw / 2,
        y: vh / 2,
        text,
        textColor: reloading ? 'rgba(235, 70, 70, 0.9)' : 'rgba(255, 255, 255, 0.9)',
        kind: 'center',
        reload: reloading ? wpn.reloadProgress : null,
        spreadDeg: wpn.def.spreadDeg,
      });
    }
    out.vignette = Math.min(1, (PLAYER.life - p.life) / PLAYER.life) * 0.8;
    if (!p.alive) out.vignette = 0.85;
    out.hitMarker = this.hitMarker;
    out.hitMarkerKill = this.hitKill;
    // Teammates: a name tag over each bot in view.
    for (const q of w.players) {
      if (!q.isBot || !q.alive) continue;
      const tp = this.stage.project(_v.set(q.x, q.y + PLAYER.height + 0.3, q.z), _proj);
      if (tp.behind || tp.x < -40 || tp.x > vw + 40) continue;
      out.texts.push({ x: tp.x, y: tp.y, text: q.name, color: teamColor(q.id).ui, alpha: 0.9, size: 9, role: 'name' });
    }
    this.speechOverlay(out);
    for (const pp of this.popups) {
      let x: number;
      let y: number;
      let size = 11;
      if (pp.anchored) {
        const s = this.stage.project(pp.pos, _proj);
        if (s.behind || s.x < -50 || s.x > vw + 50 || s.y < -50 || s.y > vh + 50) continue;
        x = s.x;
        y = s.y;
        // Text shrinks with distance but stays legible.
        size = Math.max(8, Math.min(16, 11 * (9 / Math.max(1, s.depth ?? 9))));
      } else {
        // Not tied to a body (nice-shot bonus, headshot bonus on a survivor): rises under the reticle.
        x = vw / 2 + 34 * k;
        y = vh / 2 + (14 - pp.age * 22) * k;
      }
      out.texts.push({ x, y, text: `+${pp.text}`, color: 'rgb(220, 30, 25)', alpha: 0.85 * (1 - pp.age * pp.age), size, bold: true, role: 'popup' });
    }
    return out;
  }

  get stats(): { ragdolls: number; corpses: number; drops: number; creatures: number } {
    return { ragdolls: this.ragdolls.length, corpses: this.corpses.count, drops: this.blood.activeDrops, creatures: this.creatures.size };
  }
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** The scene's key light and sky light (the viewmodel copies them). */
function findLights(scene: THREE.Scene): { sun: THREE.DirectionalLight | null; hemi: THREE.HemisphereLight | null } {
  let sun: THREE.DirectionalLight | null = null;
  let hemi: THREE.HemisphereLight | null = null;
  scene.traverse((o) => {
    const d = o as THREE.DirectionalLight;
    if (d.isDirectionalLight && (!sun || (d.castShadow && !sun.castShadow))) sun = d;
    const hl = o as THREE.HemisphereLight;
    if (hl.isHemisphereLight && !hemi) hemi = hl;
  });
  return { sun, hemi };
}
