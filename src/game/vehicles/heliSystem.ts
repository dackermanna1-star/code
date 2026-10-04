/**
 * Helicopter integration: the "Helicopter" item (creative Tools & Utilities via category
 * 'transport'; use it on a block to place one), rotor / turbine sound loops tied to rotor and
 * engine speed, effects for hits, impacts, rotor strikes, splashes and crashes, explosion damage
 * to helicopters, the drop when one is punched apart, and the cockpit HUD + controls hint.
 */
import * as THREE from 'three';
import type { Game } from '../game';
import type { GameSystem } from '../systems';
import type { World } from '../../world/world';
import { registerItem, addItemBehavior, stack as mkStack, type ItemUseContext } from '../items/registry';
import { createEntity } from '../../entity/manager';
import { boxCollides, AABB } from '../../physics/aabb';
import { BLOCKS } from '../../world/blocks/registry';
import { HelicopterEntity } from '../../entity/vehicles/helicopter';
import { HELI, surfaceBelow } from '../../entity/vehicles/heliPhysics';
import { HeliHud } from './heliHud';

registerItem('helicopter', {
  category: 'transport',
  displayName: 'Helicopter',
  maxStack: 1,
  rarity: 'rare',
  visual: { kind: 'sprite', id: 'helicopter', color: 0xa51d18, color2: 0xe9e5dc },
});

interface HeliSounds {
  rotor: any;
  turbine: any;
}

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const rnd = Math.random;

/** Where a helicopter placed from `hit` would stand (null = no room). */
export function helicopterSpawnPoint(world: World, hit: { x: number; y: number; z: number; face: number; px: number; py: number; pz: number }): THREE.Vector3 | null {
  const n = [[0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1], [-1, 0, 0], [1, 0, 0]][hit.face] ?? [0, 1, 0];
  // centre the cabin on the clicked point; side faces push it out of the wall
  const x = hit.px + n[0] * (HELI.boxHalf + 0.05), z = hit.pz + n[2] * (HELI.boxHalf + 0.05);
  const st = world.getBlock(hit.x, hit.y, hit.z);
  const start = hit.face === 1 ? hit.py : BLOCKS[st >>> 4]?.replaceable ? hit.y : hit.py;
  const top = surfaceBelow(world, x, z, start + 0.05, 0.6, 4);
  const box = new AABB();
  for (let dy = 0; dy < 3; dy++) {
    const y = (top > -Infinity ? top : Math.floor(start)) + dy;
    box.set(x - HELI.boxHalf, y + 0.05, z - HELI.boxHalf, x + HELI.boxHalf, y + HELI.boxMaxY, z + HELI.boxHalf);
    if (!boxCollides(world, box)) return new THREE.Vector3(x, y, z);
  }
  return null;
}

export class HeliSystem implements GameSystem {
  readonly name = 'helicopters';
  private game!: Game;
  readonly helis = new Set<HelicopterEntity>();
  private sounds = new Map<HelicopterEntity, HeliSounds>();
  private hud: HeliHud | null = null;

  init(game: Game) {
    this.game = game;
    addItemBehavior('helicopter', { useOnBlock: (ctx) => this.place(ctx) });
    const ev = game.events;
    const safe = (fn: (e: any) => void) => (e: any) => {
      try { fn(e); } catch (err) { console.warn('helicopter event failed', err); }
    };
    ev.on('entityAdded', ({ entity }: any) => { if (entity instanceof HelicopterEntity) this.helis.add(entity); });
    ev.on('entityRemoved', ({ entity }: any) => {
      if (!(entity instanceof HelicopterEntity)) return;
      this.helis.delete(entity);
      this.stopSounds(entity);
    });
    ev.on('dimensionChanged', () => this.reset());
    ev.on('vehicleMount', safe(({ entity }) => {
      game.audio?.play?.('random.door_open', { pos: entity.pos, volume: 0.7, pitch: 1.1 });
      game.audio?.play?.('random.click', { pos: entity.pos, volume: 0.6, pitch: 0.8 });
      this.hud?.showHint(game);
    }));
    ev.on('vehicleDismount', safe(({ entity, eject }) => { if (!eject) game.audio?.play?.('random.door_close', { pos: entity.pos, volume: 0.7, pitch: 1.1 }); }));
    ev.on('helicopterHit', safe(({ entity, source }) => {
      game.audio?.playBlock?.('metal', 'hit', { pos: entity.pos, volume: 0.9 });
      const p = source?.point ?? _v.copy(entity.pos).setY(entity.pos.y + 1.2);
      game.particles?.emit?.('sparks', [p.x, p.y, p.z], { count: 4, speed: 4, spread: 0.1 });
    }));
    ev.on('helicopterBroken', safe(({ pos }) => {
      game.audio?.playBlock?.('metal', 'break', { pos, volume: 1 });
      game.audio?.play?.('random.break', { pos, volume: 0.8, pitch: 0.7 });
      game.particles?.poof?.(pos.x, pos.y, pos.z, 2.2);
      game.dropItem(mkStack('helicopter'), pos.clone().setY(pos.y + 0.2), new THREE.Vector3(0, 3, 0), 10);
    }));
    ev.on('helicopterImpact', safe(({ entity, speed, kind, pos }) => {
      const vol = Math.min(2, speed / 8);
      if (kind === 'skid') game.audio?.playBlock?.('metal', 'land', { pos, volume: Math.min(1, speed / 6) });
      else game.audio?.play?.('random.anvil_land', { pos, volume: vol, pitch: 0.6 + rnd() * 0.2 });
      const st = entity.world.getBlock(Math.floor(pos.x), Math.floor(pos.y - 0.1), Math.floor(pos.z));
      if (st) game.particles?.blockDust?.(st, pos.x, pos.y, pos.z, Math.round(3 + speed), 1 + speed * 0.08, 1 + speed * 0.2);
      if (kind !== 'skid' && speed > 5) game.particles?.emit?.('sparks', [pos.x, pos.y, pos.z], { count: Math.round(speed), speed: speed * 0.8, spread: 0.3 });
    }));
    ev.on('helicopterRotorStrike', safe(({ pos, soft, state }) => {
      if (soft) return; // chopped leaves already crumble via blockBroken
      game.audio?.play?.('random.anvil_land', { pos, volume: 1.4, pitch: 1.3 });
      game.particles?.emit?.('sparks', [pos.x, pos.y, pos.z], { count: 24, speed: 12, spread: 0.2 });
      if (state) game.particles?.spawnBlockHit?.(Math.floor(pos.x), Math.floor(pos.y), Math.floor(pos.z), state, 1);
    }));
    ev.on('helicopterSplash', safe(({ entity, speed }) => {
      game.particles?.waterSplash?.(entity.pos.x, entity.pos.y + 0.6, entity.pos.z, Math.min(2.5, 0.8 + speed * 0.2));
      game.audio?.play?.('liquid.splash', { pos: entity.pos, volume: Math.min(2, 0.6 + speed * 0.12) });
    }));
    ev.on('helicopterDestroyed', safe(({ pos, cause }) => {
      const P = game.particles;
      if (P) {
        for (let i = 0; i < 3; i++) P.emit('large_smoke', [pos.x, pos.y + 1, pos.z], { spread: 1.2, vel: [0, 3, 0], count: 4 });
        P.emit('flame', [pos.x, pos.y + 0.5, pos.z], { spread: 1.0, speed: 3, count: 14 });
        P.emit('sparks', [pos.x, pos.y + 1, pos.z], { speed: 16, spread: 0.5, count: 40 });
      }
      const p = game.player;
      if (p && p.pos.distanceTo(pos) < 12) game.events.emit('title', { title: '', subtitle: cause === 'rollover' ? 'Dynamic rollover!' : 'Crashed!', time: 50 });
    }));
    ev.on('explosion', safe(({ pos, power, source }) => {
      for (const h of this.helis) {
        if (h === source || h.removed || h.destroyed) continue;
        const d = h.body.c.distanceTo(pos);
        const r = (power ?? 4) * 2.2;
        if (d >= r) continue;
        const k = 1 - d / r;
        h.damageHull(k * (power ?? 4) * 6, 'explosion');
        if (!h.removed) {
          _w.subVectors(h.body.c, pos).normalize().multiplyScalar(k * 8);
          h.vel.add(_w);
          h.body.angVel.x += (rnd() - 0.5) * k * 2;
          h.body.angVel.z += (rnd() - 0.5) * k * 2;
        }
      }
    }));
  }

  /** Item use on a block: place a helicopter there (facing side-on, pilot door toward the player). */
  private place(ctx: ItemUseContext): boolean {
    const g = ctx.game as Game;
    const hit = ctx.hit;
    if (!hit || ctx.player.spectator || ctx.player.gameMode === 'adventure') return false;
    const at = helicopterSpawnPoint(g.world, hit as any);
    if (!at) {
      g.message('Not enough room for a helicopter here.', '#f88');
      return true;
    }
    const e = createEntity('helicopter') as HelicopterEntity | null;
    if (!e) return false;
    e.setHeading(ctx.player.yaw - Math.PI / 2);
    g.spawn(e, at.x, at.y, at.z);
    if (!ctx.player.creative) ctx.player.inventory.consumeHeld(1, ctx.hand === 'main' ? ctx.player.inventory.selected : 40);
    g.audio?.playBlock?.('metal', 'place', { pos: at, volume: 1 });
    g.events.emit('helicopterPlaced', { entity: e, player: ctx.player });
    return true;
  }

  onWorldChange(_game: Game, _world: World) {
    this.reset();
  }

  private reset() {
    for (const h of [...this.sounds.keys()]) this.stopSounds(h);
    this.helis.clear();
    const p = this.game?.player as any;
    if (p?.vehicle) p.vehicle = null;
  }

  private stopSounds(h: HelicopterEntity) {
    const s = this.sounds.get(h);
    if (!s) return;
    s.rotor.stop(0.6);
    s.turbine.stop(0.6);
    this.sounds.delete(h);
  }

  update(game: Game, dt: number) {
    const a = game.audio;
    const cam = game.cameraCtl.camera.position;
    if (a?.loop) {
      for (const h of this.helis) {
        const b = h.body;
        const d = h.pos.distanceTo(cam);
        if ((b.rpm < 0.01 && b.n1 < 0.01) || d > 170 || h.removed) { this.stopSounds(h); continue; }
        let s = this.sounds.get(h);
        if (!s) {
          s = { rotor: a.loop('loop.heli.rotor', { pos: h.pos, volume: 0.001, pitch: 0.2 }), turbine: a.loop('loop.heli.turbine', { pos: h.pos, volume: 0.001, pitch: 0.4 }) };
          this.sounds.set(h, s);
        }
        const inside = h.pilot === game.player && game.cameraCtl.perspective === 'first';
        b.toWorld(HELI.hub, _v);
        s.rotor.setPos(_v);
        _w.set(0, 2.3, 1.4);
        b.toWorld(_w, _w);
        s.turbine.setPos(_w);
        const load = Math.min(1.6, b.thrust / (HELI.mass * HELI.gravity));
        const rv = Math.pow(b.rpm, 1.4) * (0.7 + 0.35 * load) * (inside ? 0.6 : 1);
        s.rotor.setVolume(Math.max(0.001, rv * 2.8));
        s.rotor.setPitch(Math.max(0.06, b.rpm * (0.97 + 0.04 * load)));
        const tv = Math.min(1, b.n1 * 3) * (inside ? 0.55 : 1);
        s.turbine.setVolume(Math.max(0.001, tv * 1.6));
        s.turbine.setPitch(0.3 + 0.72 * b.n1);
      }
    }
    // cockpit HUD
    if (!this.hud && game.ui?.hud?.el) this.hud = new HeliHud(game.ui.hud.el);
    this.hud?.update(game, dt);
  }

  dispose() {
    this.reset();
    this.hud?.dispose();
  }
}
