/**
 * FX glue: owns the particle system (`game.particles`), renders it through
 * `game.renderExtras` (forward + G-buffer scenes) and turns game events into effects:
 *
 *   blockBroken     -> block crumbs (+ dust)          blockHitting -> crumbs chipped off the face
 *   blockPlaced     -> small dust puff                footstep (sprinting) -> dust + crumbs
 *   entityFallDamage / blockLanded -> landing dust    explosion {pos, power} -> explosion
 *   playerAttack (crit) -> crit / magic crit stars    sweepAttack -> sweep crescent
 *   entityHurt      -> blood (game.settings.blood; skeleton bone dust, slime green, enderman purple)
 *   entityRemoved (dead mob) -> death poof            entity enters water -> splash
 *
 * Ambient emitters near the camera: torches (flame + smoke), fire, campfires (smoke columns),
 * lava surface pops. Emits `bloodSplat {x,y,z,color}` when a blood droplet lands.
 */
import * as THREE from 'three';
import type { Game } from './game';
import type { GameSystem } from './systems';
import type { World } from '../world/world';
import { ParticleSystem } from '../render/particles/system';
import { ParticleAPI, EFFECT_COLORS, blockStateByName } from '../render/particles/effects';
import { PT } from '../render/particles/defs';
import { EmitterScanner, EmitterKind, torchFlamePos } from '../render/particles/emitters';
import { BLOCKS } from '../world/blocks/registry';
import { LivingEntity } from '../entity/living';
import type { Entity } from '../entity/entity';

const rnd = Math.random;
const fp = [0, 0, 0];

/** Blood colour by entity type (null = no blood: bone dust etc.). */
function bloodFor(e: Entity): { color: [number, number, number] | null; dust?: string } {
  const t = e.type;
  if (t === 'skeleton' || t === 'wither_skeleton' || t === 'stray') return { color: null, dust: 'bone_block' };
  if (t === 'slime' || t === 'magma_cube') return { color: t === 'slime' ? [0.12, 0.55, 0.08] : [0.6, 0.15, 0.02], dust: t === 'slime' ? 'slime_block' : undefined };
  if (t === 'creeper') return { color: [0.1, 0.35, 0.06] };
  if (t === 'enderman' || t === 'endermite' || t === 'shulker') return { color: [0.35, 0.05, 0.5] };
  if (t === 'iron_golem' || t === 'snow_golem' || t === 'blaze' || t === 'item' || t === 'armor_stand') return { color: null };
  return { color: [0.22, 0.004, 0.004] };
}

export class FxSystem implements GameSystem {
  readonly name = 'fx';
  sys!: ParticleSystem;
  api!: ParticleAPI;
  private game!: Game;
  private scanner = new EmitterScanner();
  private unsubWorld: (() => void) | null = null;
  private wasInWater = new WeakMap<Entity, boolean>();
  private lastVy = new WeakMap<Entity, number>();
  private moteT = 0;

  init(game: Game) {
    this.game = game;
    const q = (game.settings.quality ?? 'high') as 'low' | 'medium' | 'high' | 'ultra';
    this.sys = new ParticleSystem(q);
    try {
      this.sys.attach(game.renderer as any);
    } catch (e) {
      console.warn('particles: GPU init failed', e);
    }
    this.api = new ParticleAPI(this.sys);
    game.particles = this.api;
    const ex = game.renderExtras as any;
    (ex.forward ??= []).push(this.sys.forwardScene);
    (ex.gbuffer ??= []).push(this.sys.gbufferScene);
    this.sys.onBloodLand = (x, y, z, r, g, b) => game.events.emit('bloodSplat', { x, y, z, color: [r, g, b] });
    this.wire(game);
  }

  onWorldChange(game: Game, world: World) {
    this.sys.clear();
    this.sys.world = world;
    this.scanner.clear();
    this.unsubWorld?.();
    this.unsubWorld = world.events.on('blockChanged', ({ x, y, z }) => this.scanner.invalidate(x, y, z));
    void game;
  }

  private wire(game: Game) {
    const ev = game.events;
    const P = this.api;
    const safe = (fn: (e: any) => void) => (e: any) => {
      try {
        fn(e);
      } catch (err) {
        console.warn('fx event failed', err);
      }
    };
    ev.on('blockBroken', safe(({ x, y, z, state }) => P.spawnBlockBreak(x, y, z, state)));
    ev.on('blockHitting', safe(({ x, y, z, state }) => {
      const t = game.interaction?.target;
      let face = t && t.x === x && t.y === y && t.z === z ? t.face : -1;
      if (face < 0) {
        const e = game.cameraCtl.eyeWorld;
        const dx = e.x - (x + 0.5), dy = e.y - (y + 0.5), dz = e.z - (z + 0.5);
        const ax = Math.abs(dx), ay = Math.abs(dy), az = Math.abs(dz);
        face = ay >= ax && ay >= az ? (dy < 0 ? 0 : 1) : ax >= az ? (dx < 0 ? 4 : 5) : dz < 0 ? 2 : 3;
      }
      P.spawnBlockHit(x, y, z, state, face);
    }));
    ev.on('blockPlaced', safe(({ x, y, z, state }) => {
      const def = BLOCKS[state >>> 4];
      if (def && def.layer !== 'cutout') P.blockDust(state, x + 0.5, y + 0.02, z + 0.5, 3, 0.7, 0.8);
    }));
    ev.on('footstep', safe(({ entity, block }) => {
      if (!block || entity.inWater) return;
      const sprint = entity.sprinting || (entity.intent?.sprint ?? false);
      if (!sprint && rnd() > 0.15) return;
      P.blockDust(block, entity.pos.x, entity.pos.y, entity.pos.z, sprint ? 2 : 1, 0.6, 0.6);
      if (sprint) for (let k = 0; k < 3; k++) P.crumb(block, entity.pos.x + (rnd() - 0.5) * 0.4, entity.pos.y + 0.1, entity.pos.z + (rnd() - 0.5) * 0.4, -entity.vel.x * 0.25 + (rnd() - 0.5), 1.5 + rnd() * 1.5, -entity.vel.z * 0.25 + (rnd() - 0.5), 0.7);
    }));
    ev.on('entityFallDamage', safe(({ entity, distance }) => this.landing(entity, distance)));
    ev.on('blockLanded', safe(({ x, y, z, state }) => P.blockDust(state, x + 0.5, y + 0.05, z + 0.5, 6, 1.2, 2)));
    ev.on('explosion', safe(({ pos, power }) => {
      P.explosion(pos.x, pos.y, pos.z, power ?? 4);
      const p = game.player;
      if (p) {
        const d = p.pos.distanceTo(pos);
        const k = Math.max(0, 1 - d / (12 + (power ?? 4) * 4));
        if (k > 0) p.cameraShake.set((rnd() - 0.5) * 2 * k, (rnd() - 0.5) * k, k);
      }
    }));
    ev.on('playerAttack', safe(({ player, target, crit, weapon, point, damage }) => {
      const pt = point ?? target.pos.clone().setY(target.pos.y + (target.height ?? 1) * 0.6);
      const ench = player?.mainHand?.ench;
      const magic = !!(ench && (ench.sharpness || ench.smite || ench.bane_of_arthropods));
      if (crit) P.critHit(pt.x, pt.y, pt.z, false);
      if (magic) P.critHit(pt.x, pt.y, pt.z, true, 0.7);
      if (damage >= 2 && target instanceof LivingEntity) {
        P.emit('damage_indicator', [target.pos.x, target.pos.y + target.height * 0.8, target.pos.z], { count: Math.min(6, Math.floor(damage * 0.5)), spread: [0.3, 0.2, 0.3], vel: [0, 1.5, 0], speed: 1.5, exact: true });
      }
      void weapon;
    }));
    ev.on('sweepAttack', safe(({ player }) => {
      const dir = player.lookDir();
      P.sweep(player.pos.x + dir.x * 1.1, player.pos.y + player.eyeHeight * 0.75, player.pos.z + dir.z * 1.1, player.yaw);
    }));
    ev.on('entityHurt', safe(({ entity, source, amount }) => this.hurt(entity, source, amount)));
    ev.on('entityRemoved', safe(({ entity }) => {
      if (entity instanceof LivingEntity && entity.dead && entity !== game.player) P.poof(entity.pos.x, entity.pos.y + entity.height * 0.4, entity.pos.z, Math.max(0.6, Math.min(2, entity.height * 0.6)));
    }));
  }

  private landing(e: Entity, distance: number) {
    const st = e.blockBelow();
    if (!st) return;
    const k = Math.min(2.5, 0.2 + distance / 15);
    this.api.blockDust(st, e.pos.x, e.pos.y, e.pos.z, Math.round(4 + 8 * k), 0.8 + k * 0.4, 1.5 + k);
    for (let i = 0; i < Math.round(6 + 10 * k); i++) {
      const a = rnd() * Math.PI * 2, s = 1 + rnd() * 2.5 * k;
      this.api.crumb(st, e.pos.x + Math.cos(a) * 0.3, e.pos.y + 0.05, e.pos.z + Math.sin(a) * 0.3, Math.cos(a) * s, 1.5 + rnd() * 2, Math.sin(a) * s, 0.8);
    }
  }

  private hurt(e: Entity, source: any, amount: number) {
    if (!source || source.type === 'drown' || source.type === 'starve' || source.type === 'poison' || source.type === 'wither' || source.type === 'magic') return;
    const P = this.api;
    const pt: THREE.Vector3 = source.point ?? new THREE.Vector3(e.pos.x, e.pos.y + e.height * 0.6, e.pos.z);
    const b = bloodFor(e);
    const dir = source.dir ?? null;
    const n = Math.min(30, 4 + amount * 3);
    if (b.dust) {
      const st = blockStateByName(b.dust);
      if (st) for (let i = 0; i < Math.min(12, 3 + amount * 2); i++) P.crumb(st, pt.x, pt.y, pt.z, (rnd() - 0.5) * 3 + (dir?.x ?? 0) * 2, 1 + rnd() * 2, (rnd() - 0.5) * 3 + (dir?.z ?? 0) * 2, 0.6);
    }
    if (b.color && this.game.settings.blood !== false && source.type !== 'fall' && source.type !== 'fire' && source.type !== 'lava') {
      P.bloodSpray(pt.x, pt.y, pt.z, { count: n, color: b.color, dir: dir ? [dir.x, dir.y, dir.z] : undefined });
    }
    if (source.type === 'fire' || source.type === 'lava') P.emit('smoke', [e.pos.x, e.pos.y + e.height * 0.5, e.pos.z], { count: 2, spread: [0.3, 0.5, 0.3] });
  }

  private tickEmitters() {
    const g = this.game;
    const cam = g.cameraCtl.camera.position;
    const sys = this.sys;
    const d = sys.density;
    this.scanner.forEach((x, y, z, kind, meta) => {
      const dx = x - cam.x, dy = y - cam.y, dz = z - cam.z;
      if (dx * dx + dy * dy + dz * dz > 32 * 32) return;
      switch (kind) {
        case EmitterKind.Torch:
        case EmitterKind.SoulTorch:
        case EmitterKind.RedstoneTorch: {
          torchFlamePos(x, y, z, meta, fp);
          if (kind === EmitterKind.RedstoneTorch) {
            if (rnd() < 0.06 * d) sys.spawn(PT.redstone, fp[0] + (rnd() - 0.5) * 0.1, fp[1] - 0.05, fp[2] + (rnd() - 0.5) * 0.1, 0, 0.2, 0);
            break;
          }
          if (rnd() < 0.3 * d) sys.spawn(kind === EmitterKind.Torch ? PT.flame : PT.soul_flame, fp[0] + (rnd() - 0.5) * 0.03, fp[1] - 0.02, fp[2] + (rnd() - 0.5) * 0.03, 0, 0.05, 0);
          if (rnd() < 0.07 * d) {
            const i = sys.spawn(PT.smoke, fp[0], fp[1] + 0.12, fp[2], 0, 0.4, 0);
            if (i >= 0) sys.lp.size[i] *= 0.45;
          }
          break;
        }
        case EmitterKind.Fire:
        case EmitterKind.SoulFire: {
          if (rnd() < 0.35 * d) sys.spawn(kind === EmitterKind.Fire ? PT.flame : PT.soul_flame, x + 0.2 + rnd() * 0.6, y + 0.1 + rnd() * 0.5, z + 0.2 + rnd() * 0.6, 0, 0.6, 0);
          if (rnd() < 0.08 * d) sys.spawn(PT.large_smoke, x + rnd(), y + 0.6 + rnd() * 0.4, z + rnd(), 0, 0.8, 0);
          if (rnd() < 0.03 * d && kind === EmitterKind.Fire) sys.spawn(PT.ember, x + 0.5, y + 0.5, z + 0.5, (rnd() - 0.5), 1.5, (rnd() - 0.5));
          break;
        }
        case EmitterKind.Campfire: {
          if (rnd() < 0.11 * d) for (let k = 0; k < 2; k++) sys.spawn(PT.campfire_smoke, x + 0.5 + (rnd() - 0.5) * 0.4, y + 0.6 + rnd() * 0.3, z + 0.5 + (rnd() - 0.5) * 0.4, 0, 1.0 + rnd() * 0.3, 0);
          if (rnd() < 0.25 * d) sys.spawn(PT.flame, x + 0.3 + rnd() * 0.4, y + 0.25, z + 0.3 + rnd() * 0.4, 0, 0.5, 0);
          if (rnd() < 0.01 * d) sys.spawn(PT.lava_pop, x + 0.5, y + 0.4, z + 0.5, (rnd() - 0.5) * 2, 3 + rnd() * 2, (rnd() - 0.5) * 2);
          break;
        }
        case EmitterKind.Lava: {
          if (rnd() < 0.004 * d) {
            sys.spawn(PT.lava_pop, x + rnd(), y + 1, z + rnd(), (rnd() - 0.5) * 1.5, 3 + rnd() * 3, (rnd() - 0.5) * 1.5);
            if (rnd() < 0.5) sys.spawn(PT.smoke, x + rnd(), y + 1.1, z + rnd(), 0, 0.5, 0);
          }
          break;
        }
      }
    });
  }

  /** Entity splashes (water entry), potion swirls, burning entities. */
  private tickEntities() {
    const g = this.game;
    const cam = g.cameraCtl.camera.position;
    for (const e of g.entities?.list ?? []) {
      if (e.removed) continue;
      const dx = e.pos.x - cam.x, dz = e.pos.z - cam.z;
      if (dx * dx + dz * dz > 48 * 48) continue;
      const was = this.wasInWater.get(e) ?? e.inWater;
      if (e.inWater && !was) {
        const vy = this.lastVy.get(e) ?? e.vel.y;
        const strength = Math.min(2.5, Math.max(0.2, -vy / 8)) * Math.max(0.5, e.width * 1.4);
        if (strength > 0.25 && e.type !== 'item') this.api.waterSplash(e.pos.x, Math.floor(e.pos.y) + 0.9, e.pos.z, strength);
      }
      this.wasInWater.set(e, e.inWater);
      this.lastVy.set(e, e.vel.y);
      if (e instanceof LivingEntity && !e.dead) {
        if (e.effects.size && rnd() < 0.25) {
          for (const fx of e.effects.values()) {
            if (fx.showParticles === false && !fx.ambient) continue;
            const c = EFFECT_COLORS[fx.id];
            if (c !== undefined && (e !== g.player || g.cameraCtl.perspective !== 'first')) this.api.effectSwirl(e.pos.x + (rnd() - 0.5) * e.width, e.pos.y + rnd() * e.height, e.pos.z + (rnd() - 0.5) * e.width, c, fx.ambient);
            break;
          }
        }
        if (e.fireTicks > 0 && !e.inWater && rnd() < 0.5 && (e !== g.player || g.cameraCtl.perspective !== 'first')) {
          this.sys.spawn(PT.flame, e.pos.x + (rnd() - 0.5) * e.width, e.pos.y + rnd() * e.height, e.pos.z + (rnd() - 0.5) * e.width, 0, 0.8, 0);
          if (rnd() < 0.2) this.sys.spawn(PT.smoke, e.pos.x, e.pos.y + e.height, e.pos.z, 0, 0.6, 0);
        }
      }
    }
  }

  tick(game: Game) {
    if (!this.sys.world) return;
    try {
      this.tickEmitters();
      this.tickEntities();
    } catch (e) {
      console.warn('fx tick failed', e);
    }
    void game;
  }

  update(game: Game, dt: number) {
    const sys = this.sys;
    if (!sys.world) sys.world = game.world;
    const cam = game.cameraCtl.camera;
    this.scanner.update(game.world, cam.position.x, cam.position.y, cam.position.z, 6);
    // subtle sun-lit dust motes near the camera (daytime, outdoors)
    this.moteT += dt;
    if (this.moteT > 0.25 && game.dimension === 'overworld') {
      this.moteT = 0;
      const sky = game.world.getSkyLight(Math.floor(cam.position.x), Math.floor(cam.position.y), Math.floor(cam.position.z));
      if (sky > 8 && game.isDay && game.weather.rain < 0.2) this.api.primitive(PT.dust_mote, cam.position.x, cam.position.y, cam.position.z, { count: 2, spread: 5, speed: 0.1 });
    }
    sys.update(game.paused ? 0 : dt, cam);
  }

  dispose() {
    this.unsubWorld?.();
    this.sys.dispose();
  }
}
