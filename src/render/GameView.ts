// Presentation of a World: creature rigs, the hunter, projectiles, corpses,
// blood and effects. Listens to logic events; reads entity state each frame.
import * as THREE from 'three';
import { TICK, TICK_RATE, PLAYER } from '../config/constants';
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
import type { Stage } from './Stage';
import type { CreatureRig, AnimInput } from './models/types';
import { createCreatureRig } from './models/creatures';
import { createHunterRig, type HunterRig } from './models/hunter';
import {
  createClipModel,
  createShellModel,
  createGrenadeModel,
  createLauncherRoundModel,
  createWeaponModel,
  type WeaponModel,
} from './models/weapons';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

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
  crosshairs: Array<{ x: number; y: number; text: string; textColor: string }>;
  texts: Array<{ x: number; y: number; text: string; color: string; alpha: number; size?: number; bold?: boolean }>;
  vignette: number;
}

interface Popup {
  pos: THREE.Vector3;
  text: string;
  age: number;
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
  private time = 0;
  private alpha = 0;
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
    stage.onPreRender(() => this.blood.flush());
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
    on('hit', (e) => this.onHit(e));
    on('ricochet', (e) => {
      this.effects.sparks(e.point, 8, 1, 6);
    });
    on('shot', (e) => this.onShot(e));
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
      if (e.amount > 0) this.popups.push({ pos: new THREE.Vector3(e.pos.x, e.pos.y + 0.3, e.pos.z), text: `${e.amount}$`, age: 0 });
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
    });
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
        v.bleedT = 0.06 + Math.random() * 0.1;
        this.blood.splat('smear', x - 0.35, z + (Math.random() - 0.5) * 0.15, 0.09 + Math.random() * 0.05, { angle: 0, stretch: 2.5 });
        if (Math.random() < 0.3) this.blood.splat('drop', x - 0.2, z + (Math.random() - 0.5) * 0.3, 0.03);
      } else if (e instanceof Activist && (e.state === 'panic' || e.state === 'flee')) {
        v.bleedT = 0.05;
        const chest = { x: x + 0.25, y: 1.15, z };
        this.blood.spray(chest, e.stateTicks < 25 ? 3 : 1, { dirX: 0.4, speed: [0.5, 2.5], up: [0, 2], spread: 1.2 });
      }
    }
    // Walrus scraping its tusks before the rush.
    if (e.type === 'walrus' && e.state === 'charge') {
      const tusk = v.rig.bones.get('tusks');
      const p = tusk ? tusk.getWorldPosition(_v) : _v.set(x + 1.6 * e.facing, 0.1, z);
      if (Math.random() < 0.8) this.effects.sparks({ x: p.x, y: Math.max(0.05, p.y), z: p.z }, 3, -e.facing, 5);
      if (Math.random() < 0.3) this.effects.snowPuff({ x: p.x, y: 0, z: p.z }, 1, 0.2);
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
    const v = this.creatures.get(ev.enemyId);
    if (!v) return;
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
    const dv = Math.min(9, 0.8 + ev.force / (mass * 0.35));
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
        opts.impulse = { point: pt, dir: new THREE.Vector3(ev.dirX, 0.8, ev.dirZ).normalize(), speed: 4, bone: rig.head };
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
        opts.blast = { point: new THREE.Vector3(ex.x, ex.y, ex.z), speed: Math.min(10, 2.5 + ev.force / 80) };
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
    const n = ev.kind === 'gib' ? 0 : Math.min(45, 10 + ev.force / 12);
    if (n > 0) {
      this.blood.spray(pt, n, { dirX: ev.dirX, dirZ: ev.dirZ, speed: [2, 9], up: [-0.5, 3.5], spread: 0.6 });
      this.effects.bloodPuff(pt, ev.dirX, 1);
    }
  }

  /** Big bloody burst for gibs. */
  private gore(pt: THREE.Vector3, e: Enemy, k: number): void {
    const size = e.def.halfLength;
    this.blood.spray(pt, 70 * k * (0.6 + size), { dirX: -1, speed: [1, 11], up: [0.5, 6], spread: Math.PI, size: [0.02, 0.07] });
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
      velocity: new THREE.Vector3(dir.x * (blast ? 5 : 3), blast ? 5 : 1.5, dir.z * 2),
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
    if (c.y > -1) this.blood.pool(c.x, c.z, Math.min(1.4, 0.25 + DEATH_MASS[type] / 500));
    this.corpses.bake(r.rig.root, new THREE.Color(1, 0.92, 0.92));
  }

  // ------------------------------------------------------------------ hits
  private onHit(e: GameEvents['hit']): void {
    if (e.type === 'turtle' && e.part === 'shell') return;
    const strength = Math.min(1.5, e.damage / 60);
    if (e.bullet) {
      // Original: 15 blobs per bullet hit, thrown 3-6 px/tick away from the gun.
      const n = Math.min(48, 16 + e.damage / 8) * (e.part === 'head' ? 1.4 : 1);
      this.blood.spray(e.point, n, { dirX: e.dirX, dirZ: e.dirZ, speed: [4, 15], up: [-2, 2.5], spread: 0.22, size: [0.018, 0.07] });
      this.effects.bloodPuff(e.point, e.dirX, strength);
    } else {
      this.blood.spray(e.point, 12 + e.damage / 15, { dirX: e.dirX, dirZ: e.dirZ, speed: [1, 6], up: [0.5, 4], spread: 1.5 });
    }
  }

  // ------------------------------------------------------------------ hunter
  private addHunter(p: Player): void {
    const rig = createHunterRig();
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

  private onShot(e: GameEvents['shot']): void {
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

  private onShell(e: GameEvents['shellEject']): void {
    const h = this.hunters.get(e.playerId);
    const m = this.weaponModel(e.playerId);
    if (!h) return;
    const kind: ShellKind = e.weapon === 'magnum' ? 'small' : WEAPONS[e.weapon].shell === 'none' ? 'small' : WEAPONS[e.weapon].shell;
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
    const pos = m?.magazine ? m.magazine.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(h.player.x - 0.3, 0.6, h.player.z);
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
      if (m.laser && w.state === 'idle' && p.canAct) {
        h.rig.root.updateMatrixWorld(true);
        const s = m.laser.getWorldPosition(new THREE.Vector3());
        const end = new THREE.Vector3(-30, s.y, s.z);
        this.effects.beam(s, end, 0.014, 0xff2010, 0.55, 0.0001);
        this.effects.beam(s.clone().add(new THREE.Vector3(0, -0.02, 0)), end.clone().add(new THREE.Vector3(0, -0.02, 0)), 0.012, 0xff6400, 0.4, 0.0001);
      }
    }
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
      o.rotation.z = p.rot;
      if (p.kind === 'round' && Math.random() < 0.7) {
        this.effects.emit(false, p.x + 0.15, p.y, p.z, {
          vel: [0.5, 0.4, 0],
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
    }
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
      pp.pos.y += dt * 1.2;
    }
    this.popups = this.popups.filter((pp) => pp.age < 1);
    this.blood.update(dt);
    this.effects.update(dt);
    this.debris.update(dt);
  }

  /** World-anchored UI for the overlay. */
  overlay(): OverlayState {
    const out: OverlayState = { crosshairs: [], texts: [], vignette: 0 };
    const w = this.world;
    if (!w) return out;
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
      if (p.canAct) out.crosshairs.push({ x: sc.x, y: sc.y, text, textColor: color });
      const ms = this.stage.project(_v.set(ix + 0.05, iy + PLAYER.height + 0.42, iz));
      out.texts.push({ x: ms.x, y: ms.y, text: `$${p.money}`, color: 'rgba(40, 40, 48, 0.8)', alpha: 1, size: 9 });
      out.vignette = Math.max(out.vignette, Math.min(1, (PLAYER.life - p.life) / PLAYER.life) * 0.8);
    }
    for (const pp of this.popups) {
      const s = this.stage.project(pp.pos);
      out.texts.push({ x: s.x, y: s.y, text: pp.text, color: 'rgb(200, 20, 20)', alpha: 0.5 * (1 - pp.age), size: 10 });
    }
    return out;
  }

  get stats(): { ragdolls: number; corpses: number; drops: number; creatures: number } {
    return { ragdolls: this.ragdolls.length, corpses: this.corpses.count, drops: this.blood.activeDrops, creatures: this.creatures.size };
  }
}
