// Wiring of the game view: subsystems, event routing, the frame update.
import * as THREE from 'three';
import { CAMERA_FOV, CAMERA_POS } from '../../config/view';
import type { GameEvents } from '../../core/events';
import type { World } from '../../core/World';
import type { BloodSystem } from '../BloodSystem';
import { Corpses } from '../Corpses';
import { Debris } from '../Debris';
import { Effects } from '../Effects';
import type { Environment } from '../env/Environment';
import { Physics } from '../Physics';
import type { Stage } from '../Stage';
import { Bodies } from './Bodies';
import { BLOOD_K, type Ctx, type ViewOptions } from './ctx';
import { Gore } from './Gore';
import { Halos } from './Halos';
import { HazardFx } from './HazardFx';
import { Horde } from './Horde';
import { Hunters } from './Hunters';
import { LightPool } from './LightPool';
import { Shake } from './Shake';
import { F, metalHit, splinters } from './fx';
import { createZombieRig, setHivisLevel } from '../models/index';
import { skinify } from './skin';

export type { ViewOptions };

const _m = new THREE.Vector3();
/** Where the shader warm-up set is put: behind the gameplay camera, out of every view. */
const WARM_AT = new THREE.Vector3(CAMERA_POS.x, CAMERA_POS.y + 12, CAMERA_POS.z + 16);
const LIGHT_TINT = new THREE.Color();

export class ViewCore {
  readonly ctx: Ctx;
  readonly horde: Horde;
  readonly bodies: Bodies;
  readonly hunters: Hunters;
  readonly hazards: HazardFx;
  private unsub: Array<() => void> = [];
  private opts: ViewOptions = { blood: 'normal', shake: 1 };
  private warmStep = 0;
  /** Draw calls of the last rendered frame (all passes). */
  private lastCalls = 0;

  constructor(stage: Stage, env: Environment, blood: BloodSystem, effects: Effects) {
    const scene = stage.scene;
    const root = new THREE.Group();
    root.name = 'GameView';
    scene.add(root);
    const lights = new LightPool(scene, env.quality === 'high' ? 8 : env.quality === 'medium' ? 6 : 4);
    effects.flashSink = (x, y, z, color, intensity, life, distance) => lights.flash(x, y, z, color, intensity, life, distance);
    effects.density = env.quality === 'low' ? 0.6 : 1;
    const debris = new Debris(scene);
    debris.isOnFloe = (x, z) => env.isOnDeck(x, z);
    const corpses = new Corpses(scene);
    blood.onLand = (x, z, size) => corpses.soak(x, z, size * 0.15);
    const gore = new Gore(scene, blood);
    gore.isOnDeck = (x, z) => env.isOnDeck(x, z);
    this.ctx = {
      stage,
      env,
      scene,
      root,
      physics: new Physics(),
      blood,
      effects,
      debris,
      corpses,
      gore,
      lights,
      halos: new Halos(scene, 320, CAMERA_POS),
      shake: new Shake(stage.shakeOffset),
      world: null,
      time: 0,
      alpha: 1,
      dt: 0,
      bloodK: 1,
      darkness: 0,
    };
    // Count draw calls over whole frames (shadow, reflection, backdrop, scene, post).
    const info = stage.renderer.info;
    info.autoReset = false;
    stage.onUpdate(() => info.reset());
    stage.onPostRender(() => {
      this.lastCalls = info.render.calls;
    });
    stage.onResize(() => {
      const size = stage.renderer.getDrawingBufferSize(new THREE.Vector2());
      this.ctx.halos.setViewport(size.y, CAMERA_FOV);
    });
    this.horde = new Horde(this.ctx);
    this.bodies = new Bodies(this.ctx, this.horde);
    this.hunters = new Hunters(this.ctx);
    this.hazards = new HazardFx(this.ctx);
  }

  get options(): ViewOptions {
    return this.opts;
  }

  setOptions(o: ViewOptions): void {
    this.opts = { ...o };
    const k = BLOOD_K[o.blood] ?? 1;
    this.ctx.bloodK = k;
    this.ctx.blood.amount = k;
    this.ctx.gore.amount = k;
    this.ctx.shake.scale = Math.max(0, Math.min(1, o.shake));
  }

  // ------------------------------------------------------------------ lifecycle

  attach(world: World): void {
    // A warm-up interrupted by a new world (Play pressed early) never stays in the scene.
    this.endPrewarm();
    this.detach();
    const ctx = this.ctx;
    ctx.world = world;
    ctx.env.setTimeOfDay(world.timeOfDay, true);
    ctx.env.setCrane(world.crane.state, world.crane.stateTime);
    ctx.env.setBoarding(world.boarded, world.passengers);
    const on = <K extends keyof GameEvents>(k: K, f: (e: GameEvents[K]) => void) => this.unsub.push(world.events.on(k, f));

    // Zombies.
    on('spawn', (e) => {
      const z = world.zombieById(e.zombieId);
      if (z) this.horde.spawn(z);
    });
    on('hit', (e) => this.onHit(e));
    on('plateOff', (e) => {
      this.horde.onPlateOff(e);
      metalHit(ctx.effects, e.point, e.dirX, 18);
      ctx.lights.flash(e.point.x, e.point.y, e.point.z + 0.3, 0xfff0c0, 6, 0.08, 5);
    });
    on('ricochet', (e) => metalHit(ctx.effects, e.point, 1, 12));
    on('zombieDeath', (e) => this.bodies.onDeath(e));
    on('stretcherDrop', (e) => this.horde.onStretcherDrop(e));
    on('trip', (e) => {
      const r = this.horde.get(e.zombieId);
      if (r) ctx.effects.snowPuff({ x: r.z.x + 0.6, y: 0, z: r.z.z }, 3, 0.25, 0.8);
    });
    on('belch', (e) => {
      const r = this.horde.get(e.zombieId);
      const head = r?.rig.bones.get('head');
      const hp = head ? head.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(e.x - 3, 2.6, e.z);
      for (let i = 0; i < 16; i++) ctx.effects.emit(false, hp.x + 0.3, hp.y, hp.z, { vel: [Math.random() * 5 + 1.5, -0.6 - Math.random(), (Math.random() - 0.5) * 1.6], drag: 1.8, size: [0.2, 1.2], life: 1 + Math.random() * 0.6, color: 0xa8c848, color1: 0x5e7a24, alpha: [0.5, 0], frame: F.Smoke, vr: Math.random() - 0.5 });
      ctx.blood.spray({ x: hp.x + 0.3, y: hp.y - 0.2, z: hp.z }, 10, { dirX: 1, speed: [1, 3], up: [0, 1], spread: 0.6 });
    });
    on('enrage', () => ctx.shake.add(0.15));
    on('groan', (e) => this.horde.onGroan(e.zombieId));

    // Bodies.
    on('corpseTwitch', (e) => this.bodies.onTwitch(e.corpseId));
    on('corpseRise', (e) => this.bodies.onRise(e.corpseId, e.zombieId));
    on('corpsePermanent', (e) => this.bodies.onPermanent(e.corpseId, e.reason));
    on('corpseShoved', (e) => this.bodies.onShoved(e.corpseId, e.x, e.z));
    on('corpseGone', (e) => this.bodies.onGone(e.corpseId, e.reason));
    on('nail', (e) => {
      if (e.zombieId !== null) this.horde.onNail(e.zombieId, e.point);
      else if (e.corpseId !== null) this.bodies.onNail(e.corpseId, e.point);
    });
    on('ignite', (e) => {
      if (e.corpseId !== null) this.bodies.onIgnite(e.corpseId);
      ctx.lights.flash(e.x, 0.9, e.z + 0.3, 0xff8030, 14, 0.3, 6);
      for (let i = 0; i < 6; i++) ctx.effects.emit(true, e.x + (Math.random() - 0.5) * 0.4, 0.5 + Math.random(), e.z, { vel: [0, 2 + Math.random() * 2, 0], drag: 1, size: [0.4, 0.1], life: 0.4, color: 0xfff0b0, color1: 0xd03008, alpha: [1, 0], frame: F.Fire });
    });
    on('extinguish', (e) => {
      if (e.corpseId !== null) this.bodies.onExtinguish(e.corpseId);
    });

    // Fire, gas, explosions, projectiles.
    on('fireZone', (e) => this.hazards.onFireZone(e));
    on('gas', (e) => this.hazards.onGas(e));
    on('explosion', (e) => {
      this.bodies.lastExplosion = { x: e.x, y: e.y, z: e.z, kind: e.kind, tick: world.tick };
      this.hazards.onExplosion(e);
    });
    on('projectile', (e) => this.hazards.onProjectile(e));
    on('projectileEnd', (e) => this.hazards.onProjectileEnd(e));
    on('cannonStrike', (e) => this.hazards.onCannonStrike(e));

    // The hunter.
    on('shot', (e) => this.hunters.onShot(e));
    on('harpoon', (e) => this.bodies.onHarpoon(e, this.hunters.muzzle(e.playerId, new THREE.Vector3())));
    on('reloadStart', (e) => this.hunters.onReloadStart(e));
    on('playerHurt', (e) => this.hunters.onHurt(e));
    on('playerDeath', (e) => this.hunters.onDeath(e));
    on('stomp', (e) => this.hunters.onStomp(e));
    on('kick', (e) => this.hunters.onKick(e));
    on('jump', (e) => this.hunters.onJump(e));

    // The pier.
    on('horn', () => this.hazards.onHorn());
    on('crane', (e) => this.hazards.onCrane(e));

    // Feel.
    on('shake', (e) => ctx.shake.add(e.amount));

    for (const p of world.players) this.hunters.add(p);
    for (const z of world.zombies) if (!z.removed) this.horde.spawn(z);
  }

  detach(): void {
    for (const u of this.unsub) u();
    this.unsub.length = 0;
    const ctx = this.ctx;
    this.horde.clear();
    this.bodies.clear();
    this.hunters.clear();
    this.hazards.clear();
    ctx.physics.reset();
    for (const o of [...ctx.root.children]) ctx.root.remove(o);
    ctx.corpses.clear();
    ctx.debris.clear();
    ctx.effects.clear();
    ctx.blood.clear();
    ctx.gore.clear();
    ctx.lights.clear();
    ctx.halos.clear();
    ctx.shake.reset();
    ctx.world = null;
  }

  beforeStep(): void {
    const w = this.ctx.world;
    if (!w) return;
    this.horde.beforeStep();
    this.hunters.beforeStep();
    this.hazards.beforeStep(w);
  }

  // ------------------------------------------------------------------ events

  private onHit(e: GameEvents['hit']): void {
    const ctx = this.ctx;
    if (e.weapon === 'harpoon') this.bodies.onHarpoonHit(e.zombieId);
    this.horde.onHit(e);
    const p = e.point;
    if (e.part === 'plate') {
      metalHit(ctx.effects, p, -e.dirX < 0 ? -1 : 1, 7);
      ctx.lights.flash(p.x, p.y, p.z + 0.3, 0xfff0c0, 3, 0.05, 4);
      return;
    }
    if (e.part === 'stretcher') {
      splinters(ctx.effects, p, 5, 3, 0x9a7a50);
      return;
    }
    if (e.damage <= 0) return;
    const strength = Math.min(1.6, e.damage / 50);
    if (e.bullet) {
      const head = e.part === 'head';
      const n = Math.min(90, 26 + e.damage * 1.1) * (head ? 1.5 : 1);
      ctx.blood.spray(p, n, { dirX: e.dirX, dirZ: e.dirZ, speed: [2, 12], up: [-1.5, 3], spread: 0.45, size: [0.015, 0.065], jitter: 1.6 });
      ctx.effects.bloodPuff(p, e.dirX, strength * (head ? 1.6 : 1));
      // Exit spray out of the back, a little blood the other way too.
      if (head || e.damage > 30) ctx.blood.spray(p, n * 0.25, { dirX: -e.dirX, speed: [0.5, 3], up: [0, 2], spread: 1.2 });
    } else if (e.weapon === 'flare') {
      ctx.blood.spray(p, 18, { dirX: e.dirX, speed: [1, 5], up: [0.5, 2.5], spread: 1 });
    } else {
      ctx.blood.spray(p, 10 + e.damage / 12, { dirX: e.dirX, dirZ: e.dirZ, speed: [1, 6], up: [0.5, 4], spread: 1.5 });
    }
  }

  // ------------------------------------------------------------------ frame

  update(dt: number, alpha: number): void {
    const ctx = this.ctx;
    ctx.time += dt;
    ctx.dt = dt;
    ctx.alpha = alpha;
    const env = ctx.env;
    ctx.darkness = env.lightRig.darkness;
    ctx.lights.boost = 1 + 0.6 * ctx.darkness;
    // Unlit smoke, gas, dust and droplets follow the light level.
    const dk = ctx.darkness;
    LIGHT_TINT.setRGB(1 - 0.66 * dk, 0.97 - 0.62 * dk, 0.94 - 0.5 * dk);
    Effects.lightTint.copy(LIGHT_TINT);
    // Reflective tape (riot gear) shines more as the light goes.
    setHivisLevel(0.1 + 0.5 * dk);
    ctx.blood.lightTint.setRGB(1 - 0.45 * dk, 1 - 0.45 * dk, 1 - 0.4 * dk);
    const w = ctx.world;
    ctx.halos.begin();
    if (w) {
      env.setTimeOfDay(w.timeOfDay);
      env.setCrane(w.crane.state, w.crane.stateTime);
      env.setBoarding(w.boarded, w.passengers);
      this.bodies.syncCorpses(w.corpses);
      this.hunters.update(dt);
      this.horde.update(dt);
      this.hazards.update(dt, w);
    }
    ctx.physics.update(dt);
    this.bodies.update(dt, (id) => this.hunters.muzzle(id, _m));
    ctx.blood.update(dt);
    ctx.corpses.flushTints();
    ctx.gore.update(dt);
    ctx.effects.update(dt);
    ctx.debris.update(dt);
    ctx.lights.commit(dt);
    ctx.halos.end();
    ctx.shake.update(dt);
    env.update(dt, ctx.time);
  }

  /**
   * Shader / pipeline warm-up: put one of everything the view can draw in the
   * scene (a charred rig, a baked body, every particle layer, beams, rings,
   * gore, casings), compile, let the app render a frame or two with them, then
   * take them away. Returns true when done.
   *
   * The warm-up set sits behind the camera (frustum culling off, so it is
   * still drawn and every pass compiles) and is never seen; attach() ends a
   * warm-up that was interrupted, so it can never leak into a game.
   */
  prewarm(budgetMs: number): boolean {
    void budgetMs;
    const ctx = this.ctx;
    if (this.warmStep === 0) {
      const g = new THREE.Group();
      g.name = 'Prewarm';
      g.position.copy(WARM_AT);
      const a = createZombieRig('shambler', 7);
      a.root.position.set(4, 0, 2);
      a.setCharred(0.5);
      g.add(a.root);
      const b = createZombieRig('bloater', 11);
      b.root.position.set(6, 0, 2);
      g.add(b.root);
      // Live zombies are drawn skinned (plain and charred variants).
      const d = createZombieRig('shambler', 9);
      d.root.position.set(2, 0, 2);
      g.add(d.root);
      skinify(d);
      const e = createZombieRig('jogger', 5);
      e.root.position.set(0, 0, 2);
      g.add(e.root);
      skinify(e);
      e.setCharred(0.6);
      for (const o of this.hazards.prewarmObjects()) g.add(o);
      const c = createZombieRig('riot', 3);
      c.root.position.copy(WARM_AT).add(_m.set(8, 0, 2));
      ctx.scene.add(g);
      ctx.scene.add(c.root);
      g.traverse((o) => (o.frustumCulled = false));
      c.root.updateMatrixWorld(true);
      this.warm = { group: g, bake: ctx.corpses.bake(c.root) };
      const fx = ctx.effects;
      const W = WARM_AT;
      fx.emit(true, W.x + 4, W.y + 1, W.z + 2, { life: 0.3, frame: 2 });
      fx.emit(false, W.x + 4, W.y + 1, W.z + 2, { life: 0.3, frame: 1 });
      const b0 = new THREE.Vector3(W.x + 3, W.y + 1, W.z + 2);
      const b1 = new THREE.Vector3(W.x + 5, W.y + 1, W.z + 2);
      fx.beam(b0, b1, 0.05, 0xffffff, 0.5, 0.2);
      fx.beamFrame(b0, b1, 0.05, 0xffffff, 0.5, true);
      fx.ring(W.x + 4, W.y + 0.05, W.z + 2, 0.2, 1, 0.3, 0xffffff, 0.2);
      ctx.gore.burst({ x: W.x + 4, y: W.y + 0.5, z: W.z + 2 }, 2, { speed: 0.5 });
      ctx.debris.shell('shotgun', _m.set(W.x + 4, W.y + 1, W.z + 2), new THREE.Vector3(), 0.2);
      ctx.debris.shell('minigun', _m.set(W.x + 4, W.y + 1, W.z + 2), new THREE.Vector3(), 0.2);
      try {
        ctx.stage.renderer.compile(ctx.scene, ctx.stage.camera);
      } catch {
        /* compile is an optimisation only */
      }
      this.warmStep = 1;
      return false;
    }
    if (this.warmStep === 1) {
      // Render one frame with everything in the scene (shadow and reflection passes compile too).
      this.warmStep = 2;
      try {
        ctx.stage.frame(0, true);
      } catch {
        /* optimisation only */
      }
      return false;
    }
    this.endPrewarm();
    return true;
  }

  /** Take the warm-up set out of the scene (an unfinished warm-up starts over next time). */
  endPrewarm(): void {
    const ctx = this.ctx;
    if (!this.warm) return;
    this.hazards.endPrewarm();
    this.warm.group.removeFromParent();
    ctx.corpses.unbake(this.warm.bake);
    this.warm = null;
    ctx.effects.clear();
    ctx.gore.clear();
    ctx.debris.clear();
    if (this.warmStep < 2) this.warmStep = 0;
  }
  private warm: { group: THREE.Group; bake: import('../Corpses').BakeHandle } | null = null;

  stats(): { zombies: number; corpses: number; ragdolls: number; drops: number; drawCalls: number } {
    const ctx = this.ctx;
    return {
      zombies: this.horde.count,
      corpses: ctx.corpses.count + this.bodies.liveCount,
      ragdolls: this.bodies.ragdolls,
      drops: ctx.blood.activeDrops,
      drawCalls: this.lastCalls,
    };
  }
}
