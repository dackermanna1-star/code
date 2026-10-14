// Wiring of the game view: subsystems, event routing, the frame update.
import * as THREE from 'three';
import type { GameEvents } from '../../core/events';
import type { World } from '../../core/World';
import type { BloodSystem } from '../BloodSystem';
import { Corpses } from '../Corpses';
import { Debris } from '../Debris';
import type { Effects } from '../Effects';
import type { Environment } from '../env/Environment';
import { Physics } from '../Physics';
import type { Stage } from '../Stage';
import { Bodies } from './Bodies';
import { BLOOD_K, type Ctx, type ViewOptions } from './ctx';
import { Gore } from './Gore';
import { HazardFx } from './HazardFx';
import { Horde } from './Horde';
import { Hunters } from './Hunters';
import { LightPool } from './LightPool';
import { Shake } from './Shake';
import { F, metalHit, splinters } from './fx';

export type { ViewOptions };

const _m = new THREE.Vector3();

export class ViewCore {
  readonly ctx: Ctx;
  readonly horde: Horde;
  readonly bodies: Bodies;
  readonly hunters: Hunters;
  readonly hazards: HazardFx;
  private unsub: Array<() => void> = [];
  private opts: ViewOptions = { blood: 'normal', shake: 1 };
  private warmStep = 0;

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
      shake: new Shake(stage.shakeOffset),
      world: null,
      time: 0,
      alpha: 1,
      dt: 0,
      bloodK: 1,
      darkness: 0,
    };
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
    const w = ctx.world;
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
    ctx.shake.update(dt);
    env.update(dt, ctx.time);
  }

  /** Shader / pipeline warm-up: one representative of each effect, a step at a time. */
  prewarm(budgetMs: number): boolean {
    void budgetMs;
    this.warmStep++;
    return this.warmStep > 2;
  }

  stats(): { zombies: number; corpses: number; ragdolls: number; drops: number; drawCalls: number } {
    const ctx = this.ctx;
    return {
      zombies: this.horde.count,
      corpses: ctx.corpses.count + this.bodies.liveCount,
      ragdolls: this.bodies.ragdolls,
      drops: ctx.blood.activeDrops,
      drawCalls: ctx.stage.renderer.info.render.calls,
    };
  }
}
