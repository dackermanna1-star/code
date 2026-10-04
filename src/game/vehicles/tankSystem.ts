/**
 * M1 Abrams integration: the "M1 Abrams" item (creative Tools & Utilities; use it on the ground
 * to park one facing away from you), 120 mm shells and coax bullets (ballistic tracers, block /
 * entity hits, HEAT-MP explosions), muzzle blast / dust / smoke, crush and wall-hit effects, the
 * brew-up (cook-off fireball, flying turret, burning wreck), turbine + track sound loops tied to
 * engine and track speed, and the gunner HUD (reticle, gun cross, speed, reload, ammo, hull,
 * turret orientation).
 */
import * as THREE from 'three';
import type { Game } from '../game';
import type { GameSystem } from '../systems';
import type { World } from '../../world/world';
import { registerItem, addItemBehavior, stack as mkStack, type ItemUseContext } from '../items/registry';
import { createEntity } from '../../entity/manager';
import { LivingEntity } from '../../entity/living';
import { boxCollides, AABB } from '../../physics/aabb';
import { BLOCKS } from '../../world/blocks/registry';
import { TankEntity } from '../../entity/vehicles/tank';
import { TANK } from '../../entity/vehicles/tankPhysics';
import { surfaceBelow } from '../../entity/vehicles/heliPhysics';
import { raycastBlocks } from '../interaction';
import { TankHud } from './tankHud';

registerItem('tank', {
  category: 'transport',
  displayName: 'M1 Abrams',
  maxStack: 1,
  rarity: 'epic',
  visual: { kind: 'sprite', id: 'tank', color: 0xc4ae84, color2: 0x252422 },
});

interface Shell {
  kind: 'main' | 'coax';
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  owner: TankEntity;
  shooter: any;
  tracer: THREE.Mesh | null;
}

interface TankSounds {
  turbine: any;
  tracks: any;
}

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _d = new THREE.Vector3();
const rnd = Math.random;

/** Where a tank placed from `hit`, heading `yaw`, would stand (null = no room). */
export function tankSpawnPoint(world: World, hit: { x: number; y: number; z: number; face: number; px: number; py: number; pz: number }, yaw: number): THREE.Vector3 | null {
  const n = [[0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1], [-1, 0, 0], [1, 0, 0]][hit.face] ?? [0, 1, 0];
  // the tank's centre goes a hull-length ahead of the clicked point
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  const x = hit.px + n[0] * 0.5 + fx * (TANK.halfLength + 0.6), z = hit.pz + n[2] * 0.5 + fz * (TANK.halfLength + 0.6);
  const top = surfaceBelow(world, x, z, hit.py + 2.5, 0.6, 8);
  if (top === -Infinity) return null;
  const c = Math.abs(Math.cos(yaw)), s = Math.abs(Math.sin(yaw));
  const hx = TANK.halfWidth * c + TANK.halfLength * s, hz = TANK.halfWidth * s + TANK.halfLength * c;
  const box = new AABB();
  for (let dy = 0; dy < 3; dy++) {
    const y = top + dy;
    box.set(x - hx * 0.85, y + 1.0, z - hz * 0.85, x + hx * 0.85, y + TANK.roofY, z + hz * 0.85);
    if (!boxCollides(world, box)) return new THREE.Vector3(x, y, z);
  }
  return null;
}

export class TankSystem implements GameSystem {
  readonly name = 'tanks';
  private game!: Game;
  readonly tanks = new Set<TankEntity>();
  private sounds = new Map<TankEntity, TankSounds>();
  private shells: Shell[] = [];
  private hud: TankHud | null = null;
  private readonly fx = new THREE.Scene();
  private tracerGeo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true).rotateX(Math.PI / 2);
  private tracerMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.55, 0.25).multiplyScalar(9), transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  private coaxMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.3, 0.12).multiplyScalar(7), transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  /** Flying turrets from brew-ups (simple ballistic bodies). */
  private debris: { obj: THREE.Object3D; vel: THREE.Vector3; spin: THREE.Vector3; life: number }[] = [];

  init(game: Game) {
    this.game = game;
    addItemBehavior('tank', { useOnBlock: (ctx) => this.place(ctx) });
    const fwd = (game.renderExtras.forward ??= []);
    fwd.push(this.fx);
    const ev = game.events;
    const safe = (fn: (e: any) => void) => (e: any) => {
      try { fn(e); } catch (err) { console.warn('tank event failed', err); }
    };
    ev.on('entityAdded', ({ entity }: any) => { if (entity instanceof TankEntity) this.tanks.add(entity); });
    ev.on('entityRemoved', ({ entity }: any) => {
      if (!(entity instanceof TankEntity)) return;
      this.tanks.delete(entity);
      this.stopSounds(entity);
    });
    ev.on('dimensionChanged', () => this.reset());
    ev.on('vehicleMount', safe(({ entity }) => {
      if (!(entity instanceof TankEntity)) return;
      game.audio?.play?.('random.door_open', { pos: entity.pos, volume: 0.8, pitch: 0.6 });
      this.hud?.showHint();
    }));
    ev.on('vehicleDismount', safe(({ entity, eject }) => {
      if (entity instanceof TankEntity && !eject) game.audio?.play?.('random.door_close', { pos: entity.pos, volume: 0.8, pitch: 0.6 });
    }));
    ev.on('tankFire', safe((e) => this.onFire(e)));
    ev.on('tankHit', safe(({ entity, source }) => {
      const p = source?.point ?? _v.copy(entity.pos).setY(entity.pos.y + 1.5);
      game.audio?.playBlock?.('metal', 'hit', { pos: p, volume: 1, pitch: 0.7 });
      game.particles?.emit?.('sparks', [p.x, p.y, p.z], { count: 6, speed: 5, spread: 0.1 });
    }));
    ev.on('tankBroken', safe(({ pos }) => {
      game.audio?.playBlock?.('metal', 'break', { pos, volume: 1.2 });
      game.particles?.poof?.(pos.x, pos.y, pos.z, 3);
      game.dropItem(mkStack('tank'), pos.clone(), new THREE.Vector3(0, 3, 0), 10);
    }));
    ev.on('tankCrush', safe(({ x, y, z, state }) => {
      game.particles?.spawnBlockBreak?.(x, y, z, state);
      if (rnd() < 0.5) game.audio?.playBlock?.(BLOCKS[state >>> 4]?.sound ?? 'wood', 'break', { pos: { x: x + 0.5, y: y + 0.5, z: z + 0.5 }, volume: 0.9, pitch: 0.8 });
    }));
    ev.on('tankWallHit', safe(({ speed, pos }) => {
      if (speed < 3) return;
      game.audio?.play?.('random.anvil_land', { pos, volume: Math.min(2, speed / 6), pitch: 0.5 });
      game.particles?.emit?.('sparks', [pos.x, pos.y, pos.z], { count: Math.round(speed * 2), speed: speed, spread: 0.3 });
      const st = game.world.getBlock(Math.floor(pos.x), Math.floor(pos.y), Math.floor(pos.z));
      if (st) game.particles?.blockDust?.(st, pos.x, pos.y, pos.z, 10, 1.4, 1 + speed * 0.2);
    }));
    ev.on('tankDestroyed', safe(({ entity, pos }) => this.onBrewUp(entity, pos)));
    // explosions damage tanks (armour soaks a lot of it)
    ev.on('explosion', safe(({ pos, power, source }) => {
      for (const t of this.tanks) {
        if (t === source || t.removed || t.destroyed) continue;
        const d = t.pos.distanceTo(pos);
        const r = (power ?? 4) * 2.2;
        if (d >= r + 2) continue;
        const k = 1 - Math.max(0, d - 2) / r;
        t.damageHull(k * (power ?? 4) * 4.5, 'explosion');
      }
    }));
  }

  // ------------------------------------------------------------------ placement
  private place(ctx: ItemUseContext): boolean {
    const g = ctx.game as Game;
    const hit = ctx.hit as any;
    if (!hit || ctx.player.spectator || ctx.player.gameMode === 'adventure') return false;
    const yaw = ctx.player.yaw;
    const at = tankSpawnPoint(g.world, hit, yaw);
    if (!at) {
      g.message('Not enough room for a tank here (it needs about 8 × 4 blocks).', '#f88');
      return true;
    }
    const e = createEntity('tank') as TankEntity | null;
    if (!e) return false;
    e.setHeading(yaw);
    g.spawn(e, at.x, at.y + 0.3, at.z);
    if (!ctx.player.creative) ctx.player.inventory.consumeHeld(1, ctx.hand === 'main' ? ctx.player.inventory.selected : 40);
    g.audio?.playBlock?.('metal', 'place', { pos: at, volume: 1.4 });
    g.audio?.play?.('random.anvil_land', { pos: at, volume: 0.8, pitch: 0.5 });
    g.events.emit('tankPlaced', { entity: e, player: ctx.player });
    return true;
  }

  // ------------------------------------------------------------------ firing
  private onFire({ entity, pos, dir, kind, shooter }: any) {
    const g = this.game;
    const P = g.particles;
    if (kind === 'main') {
      // 120 mm: flash, fireball, blast smoke and dust kicked off the ground below the muzzle
      P?.flash?.(pos.x, pos.y, pos.z, 0xffb060, 14, 0.14, 44);
      P?.emit?.('explosion_fire', [pos.x + dir.x * 1.2, pos.y + dir.y * 1.2, pos.z + dir.z * 1.2], { count: 10, speed: 3, vel: [dir.x * 14, dir.y * 14, dir.z * 14], spread: 0.4, size: 1.3 });
      P?.emit?.('flame', [pos.x, pos.y, pos.z], { count: 18, speed: 5, vel: [dir.x * 22, dir.y * 22, dir.z * 22], spread: 0.25 });
      for (let i = 0; i < 4; i++) {
        const k = 1.5 + i * 2.2;
        P?.emit?.('large_smoke', [pos.x + dir.x * k, pos.y + dir.y * k, pos.z + dir.z * k], { count: 6, speed: 1.5 + i, spread: 0.6 + i * 0.4, vel: [dir.x * (6 - i), 0.6, dir.z * (6 - i)], size: 1.4 + i * 0.3 });
      }
      // blast overpressure kicks up the ground in front of the tank
      const gy = surfaceBelow(g.world, pos.x + dir.x * 3, pos.z + dir.z * 3, pos.y + 1, 0, 6);
      if (gy > -Infinity) {
        const st = g.world.getBlock(Math.floor(pos.x + dir.x * 3), Math.floor(gy - 0.5), Math.floor(pos.z + dir.z * 3));
        P?.emit?.('dust_ring', [pos.x + dir.x * 3, gy + 0.1, pos.z + dir.z * 3], { count: 1, size: 2.4 });
        if (st) P?.blockDust?.(st, pos.x + dir.x * 3, gy + 0.2, pos.z + dir.z * 3, 26, 2.2, 5);
      }
      g.audio?.play?.('random.explode', { pos, volume: 4.5, pitch: 0.42 });
      g.audio?.play?.('random.explode', { pos, volume: 2.2, pitch: 1.35 });
      // the shell: HEAT-MP, ballistic
      this.spawnShell('main', pos, dir.clone().multiplyScalar(TANK.shellSpeed).add(entity.vel), entity, shooter);
      // people standing next to it feel it
      const pl = g.player;
      if (pl && pl.vehicle !== entity) {
        const d = pl.pos.distanceTo(pos);
        if (d < 30) pl.cameraShake.set((rnd() - 0.5) * 0.6, (rnd() - 0.5) * 0.3, Math.min(1, 8 / (d + 1)));
      }
    } else {
      P?.flash?.(pos.x, pos.y, pos.z, 0xffc070, 2.2, 0.04, 8);
      P?.emit?.('smoke', [pos.x, pos.y, pos.z], { count: 1, vel: [dir.x * 3, 0.4, dir.z * 3], spread: 0.05 });
      g.audio?.play?.('random.explode', { pos, volume: 0.32, pitch: 2.6 + rnd() * 0.3 });
      this.spawnShell('coax', pos, dir.clone().multiplyScalar(320).add(entity.vel), entity, shooter);
    }
  }

  private spawnShell(kind: 'main' | 'coax', pos: THREE.Vector3, vel: THREE.Vector3, owner: TankEntity, shooter: any) {
    if (this.shells.length > 120) return;
    let tracer: THREE.Mesh | null = null;
    if (kind === 'main' || this.shells.length % 3 === 0) {
      tracer = new THREE.Mesh(this.tracerGeo, kind === 'main' ? this.tracerMat : this.coaxMat);
      tracer.frustumCulled = false;
      this.fx.add(tracer);
    }
    this.shells.push({ kind, pos: pos.clone(), vel, life: kind === 'main' ? 4 : 2, owner, shooter, tracer });
  }

  physics(game: Game, dt: number) {
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i];
      s.life -= dt;
      const from = _v.copy(s.pos);
      s.vel.y -= 9.81 * dt;
      const step = s.vel.length() * dt;
      _d.copy(s.vel).normalize();
      let done = s.life <= 0 || !game.world.isLoaded(Math.floor(from.x), Math.floor(from.z));
      if (!done) {
        // entities first (closest along the segment)
        let best = step, hitEnt: any = null;
        for (const e of game.entities.list) {
          if (e === s.owner || e === s.owner.pilot || e.removed || (e as any).dead) continue;
          if (e.pos.distanceToSquared(from) > (step + 6) * (step + 6)) continue;
          const t = rayBox(from, _d, e.box, best);
          if (t !== null && t < best) { best = t; hitEnt = e; }
        }
        const bh = raycastBlocks(game, from, _d, best);
        if (bh) {
          const p = new THREE.Vector3(bh.px, bh.py, bh.pz);
          this.impact(s, p, null, bh);
          done = true;
        } else if (hitEnt) {
          const p = from.clone().addScaledVector(_d, best);
          this.impact(s, p, hitEnt, null);
          done = true;
        } else s.pos.addScaledVector(_d, step);
      }
      if (done) {
        if (s.tracer) { s.tracer.removeFromParent(); }
        this.shells.splice(i, 1);
      }
    }
    // flying turrets
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.life -= dt;
      d.vel.y -= 9.81 * dt;
      d.obj.position.addScaledVector(d.vel, dt);
      d.obj.rotation.x += d.spin.x * dt;
      d.obj.rotation.y += d.spin.y * dt;
      d.obj.rotation.z += d.spin.z * dt;
      const gy = surfaceBelow(game.world, d.obj.position.x, d.obj.position.z, d.obj.position.y + 0.5, 0, 4);
      if (gy > -Infinity && d.obj.position.y < gy + 0.3 && d.vel.y < 0) {
        d.obj.position.y = gy + 0.3;
        if (d.vel.y < -4) game.audio?.play?.('random.anvil_land', { pos: d.obj.position, volume: 2, pitch: 0.4 });
        d.vel.multiplyScalar(0.3);
        d.vel.y = Math.abs(d.vel.y) * 0.2;
        d.spin.multiplyScalar(0.3);
      }
      if (d.life <= 0) {
        d.obj.removeFromParent();
        this.debris.splice(i, 1);
      }
    }
  }

  private impact(s: Shell, p: THREE.Vector3, ent: any, bh: any) {
    const g = this.game as any;
    if (s.kind === 'main') {
      if (ent && typeof ent.hurt === 'function') ent.hurt({ type: 'projectile', attacker: s.shooter, direct: s.owner, point: p, dir: _d.clone(), impulse: 14, explosion: true } as any, ent instanceof TankEntity ? 120 : 60);
      const ex = g.explosions;
      if (ex?.explode) ex.explode(p, 4.6, { source: s.owner, attacker: s.shooter, breakBlocks: g.gamerules?.mobGriefing !== false });
      else g.events.emit('explosion', { pos: p, power: 4.6, source: s.owner });
      g.particles?.flash?.(p.x, p.y, p.z, 0xffa040, 10, 0.25, 30);
    } else {
      if (ent && typeof ent.hurt === 'function') {
        if (ent instanceof LivingEntity) ent.hurt({ type: 'projectile', attacker: s.shooter, direct: s.owner, point: p, dir: _d.clone(), impulse: 0.6, weapon: 'arrow' } as any, 5);
        else ent.hurt({ type: 'projectile', attacker: s.shooter, direct: s.owner, point: p } as any, 1);
      } else if (bh) {
        const st = g.world.getBlock(bh.x, bh.y, bh.z);
        if (st) {
          g.particles?.spawnBlockHit?.(bh.x, bh.y, bh.z, st, bh.face ?? 1);
          const def = BLOCKS[st >>> 4];
          if (/glass|leaves|pane|flower|tall_grass|fern/.test(def?.name ?? '') && g.gamerules?.mobGriefing !== false) g.breakBlock?.(bh.x, bh.y, bh.z, false);
        }
        g.particles?.emit?.('sparks', [p.x, p.y, p.z], { count: 2, speed: 3, spread: 0.05 });
      }
    }
  }

  // ------------------------------------------------------------------ brew-up
  private onBrewUp(t: TankEntity, pos: THREE.Vector3) {
    const g = this.game as any;
    const P = g.particles;
    P?.flash?.(pos.x, pos.y + 1, pos.z, 0xff9a40, 20, 0.6, 50);
    P?.explosion?.(pos.x, pos.y + 1.5, pos.z, 6);
    P?.emit?.('explosion_fire', [pos.x, pos.y + 2.5, pos.z], { count: 30, speed: 7, vel: [0, 14, 0], spread: 0.8, size: 1.6 });
    g.audio?.play?.('random.explode', { pos, volume: 5, pitch: 0.35 });
    g.audio?.play?.('random.explode', { pos, volume: 3, pitch: 0.7 });
    const ex = g.explosions;
    if (ex?.explode) ex.explode(pos.clone().setY(pos.y + 0.5), 3, { source: t, breakBlocks: false });
    // throw the turret
    const v = t.visual;
    if (v) {
      const turret = v.turret;
      const world = new THREE.Matrix4().copy(turret.matrixWorld);
      turret.removeFromParent();
      world.decompose(turret.position, turret.quaternion, turret.scale);
      g.entities?.scene?.add(turret);
      turret.rotation.setFromQuaternion(turret.quaternion);
      this.debris.push({ obj: turret, vel: new THREE.Vector3((rnd() - 0.5) * 6, 16 + rnd() * 6, (rnd() - 0.5) * 6), spin: new THREE.Vector3((rnd() - 0.5) * 3, (rnd() - 0.5) * 4, (rnd() - 0.5) * 3), life: 85 });
    }
  }

  // ------------------------------------------------------------------ per frame
  update(game: Game, dt: number) {
    // tracers: a streak from the shell back along its path
    for (const s of this.shells) {
      if (!s.tracer) continue;
      const len = Math.min(s.kind === 'main' ? 14 : 6, s.vel.length() * 0.025);
      _d.copy(s.vel).normalize();
      s.tracer.position.copy(s.pos).addScaledVector(_d, -len / 2);
      s.tracer.lookAt(_w.copy(s.pos));
      const r = s.kind === 'main' ? 0.07 : 0.025;
      s.tracer.scale.set(r, r, len);
    }
    // burning wrecks
    if (game.ticks % 3 === 0) {
      for (const t of this.tanks) {
        if (!t.destroyed || t.removed) continue;
        const P = game.particles;
        const c = t.body.toWorld(_v.set((rnd() - 0.5) * 2, 1.9, (rnd() - 0.5) * 3), _v);
        P?.emit?.('flame', [c.x, c.y, c.z], { count: 3, speed: 1, vel: [0, 2.5, 0], spread: 0.6 });
        P?.emit?.('large_smoke', [c.x, c.y + 1, c.z], { count: 2, speed: 0.6, vel: [0, 3.5, 0], spread: 0.8, size: 1.6 });
      }
    }
    // exhaust heat / dust from the tracks
    if (game.ticks % 2 === 0) {
      for (const t of this.tanks) {
        if (t.destroyed || t.removed) continue;
        const b = t.body;
        const P = game.particles;
        if (b.spool > 0.15 && rnd() < b.spool) {
          const e = b.toWorld(_v.set((rnd() - 0.5) * 1.6, 1.0, 4.1), _v);
          P?.emit?.('smoke', [e.x, e.y, e.z], { count: 1, vel: [-Math.sin(b.yaw) * -2, 0.8, -Math.cos(b.yaw) * -2], spread: 0.2, size: 0.8 + b.spool });
        }
        const sp = Math.abs(b.speed);
        if (sp > 2 && b.contacts > 6) {
          for (const side of [-1, 1]) {
            const r = b.toWorld(_v.set(side * TANK.trackX, 0.2, Math.sign(b.speed) * 3.3), _v);
            const st = game.world.getBlock(Math.floor(r.x), Math.floor(r.y - 0.4), Math.floor(r.z));
            if (!st) continue;
            const soft = /sand|dirt|grass_block|gravel|snow|mud|podzol|path|farmland|clay|soul/.test(BLOCKS[st >>> 4]?.name ?? '');
            if (soft) P?.blockDust?.(st, r.x, r.y + 0.2, r.z, Math.round(1 + sp * 0.15), 1 + sp * 0.06, 1 + sp * 0.12);
          }
        }
      }
    }
    // sounds
    const a = game.audio;
    const cam = game.cameraCtl.camera.position;
    if (a?.loop) {
      for (const t of this.tanks) {
        const b = t.body;
        const d = t.pos.distanceTo(cam);
        if ((b.spool < 0.01 && Math.abs(b.speed) < 0.2) || d > 160 || t.removed || t.destroyed) { this.stopSounds(t); continue; }
        let s = this.sounds.get(t);
        if (!s) {
          s = { turbine: a.loop('loop.heli.turbine', { pos: t.pos, volume: 0.001, pitch: 0.3 }), tracks: a.loop('loop.tank.tracks', { pos: t.pos, volume: 0.001, pitch: 0.5 }) };
          this.sounds.set(t, s);
        }
        const inside = t.pilot === game.player && game.cameraCtl.perspective === 'first';
        s.turbine.setPos(b.toWorld(_v.set(0, 1.4, 3.6), _v));
        s.turbine.setVolume(Math.max(0.001, (0.35 + b.spool * 1.1) * (inside ? 0.5 : 1)));
        s.turbine.setPitch(0.38 + 0.42 * b.spool);
        const sp = Math.abs(b.speed) + Math.abs(b.yawRate) * 1.5;
        s.tracks.setPos(t.pos);
        s.tracks.setVolume(Math.max(0.001, Math.min(1.6, sp / 6)) * (inside ? 0.7 : 1));
        s.tracks.setPitch(Math.max(0.25, Math.min(1.5, 0.3 + sp / 12)));
      }
    }
    if (!this.hud && game.ui?.hud?.el) this.hud = new TankHud(game.ui.hud.el);
    this.hud?.update(game, dt);
  }

  onWorldChange(_game: Game, _world: World) {
    this.reset();
  }

  private reset() {
    for (const t of [...this.sounds.keys()]) this.stopSounds(t);
    this.tanks.clear();
    for (const s of this.shells) s.tracer?.removeFromParent();
    this.shells.length = 0;
    for (const d of this.debris) d.obj.removeFromParent();
    this.debris.length = 0;
    const p = this.game?.player as any;
    if (p?.vehicle instanceof TankEntity) p.vehicle = null;
  }

  private stopSounds(t: TankEntity) {
    const s = this.sounds.get(t);
    if (!s) return;
    s.turbine.stop(0.8);
    s.tracks.stop(0.4);
    this.sounds.delete(t);
  }

  dispose() {
    this.reset();
    this.hud?.dispose();
  }
}

/** Ray (origin, unit dir) vs AABB: distance along the ray or null within maxT. */
function rayBox(o: THREE.Vector3, d: THREE.Vector3, b: AABB, maxT: number): number | null {
  let t0 = 0, t1 = maxT;
  const mn = [b.minX, b.minY, b.minZ], mx = [b.maxX, b.maxY, b.maxZ], oo = [o.x, o.y, o.z], dd = [d.x, d.y, d.z];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(dd[i]) < 1e-9) {
      if (oo[i] < mn[i] || oo[i] > mx[i]) return null;
      continue;
    }
    let a = (mn[i] - oo[i]) / dd[i], c = (mx[i] - oo[i]) / dd[i];
    if (a > c) [a, c] = [c, a];
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, c);
    if (t0 > t1) return null;
  }
  return t0;
}
