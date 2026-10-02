/**
 * Falling block entity (sand, gravel, concrete powder, anvils, dragon egg) + gravity behaviour.
 */
import * as THREE from 'three';
import { Entity } from './entity';
import { registerEntity } from './manager';
import { BLOCKS, T_REPLACEABLE, T_LIQUID } from '../world/blocks/registry';
import { addBehavior } from '../world/blocks/behaviors';
import { SetFlags, type World } from '../world/world';
import { createBlockMesh } from '../render/blockMesh';
import { stack as mkStack, tryItem } from '../game/items/registry';

export class FallingBlockEntity extends Entity {
  readonly type = 'falling_block';
  state = 0;
  fallTicks = 0;

  constructor(state = 0) {
    super();
    this.state = state;
    this.width = 0.98;
    this.height = 0.98;
    this.mass = 1500;
  }

  override init(game: any, world: World) {
    super.init(game, world);
    const r = game.renderer;
    if (r) {
      const light = world.getLight(Math.floor(this.pos.x), Math.floor(this.pos.y), Math.floor(this.pos.z));
      this.model = createBlockMesh(r, this.state, { light });
    }
  }

  override tick() {
    super.tick();
    this.fallTicks++;
    if (this.fallTicks > 600 || this.pos.y < -64) this.remove();
  }

  override physicsStep(dt: number) {
    this.prevPos.copy(this.pos);
    this.vel.y -= 32 * dt * 0.98;
    this.vel.y *= Math.exp(-0.4 * dt);
    this.vel.x *= Math.exp(-2 * dt);
    this.vel.z *= Math.exp(-2 * dt);
    this.move(this.vel.x * dt, this.vel.y * dt, this.vel.z * dt);
    if (this.onGround && !this.removed) this.land();
  }

  private land() {
    const w = this.world;
    const x = Math.floor(this.pos.x), y = Math.floor(this.pos.y + 0.5), z = Math.floor(this.pos.z);
    const here = w.getBlock(x, y, z);
    const def = BLOCKS[this.state >>> 4];
    this.remove();
    if (here === 0 || T_REPLACEABLE[here >>> 4]) {
      // concrete powder hardens in water
      let st = this.state;
      if (def.name.endsWith('_concrete_powder') && (T_LIQUID[here >>> 4] === 1 || hasWaterNeighbor(w, x, y, z))) {
        const c = BLOCKS.find((b) => b.name === def.name.replace('_powder', ''));
        if (c) st = c.id << 4;
      }
      w.setBlock(x, y, z, st, SetFlags.ALL);
      (this.game as any).events.emit('blockLanded', { x, y, z, state: st, entity: this, speed: -this.vel.y });
      if (def.name === 'anvil') (this.game as any).events.emit('anvilLand', { x, y, z });
    } else {
      const it = tryItem(def.item ?? def.name);
      if (it) (this.game as any).dropItem?.(mkStack(it, 1), new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5));
    }
  }

  override updateVisual(alpha: number) {
    if (!this.model) return;
    const p = this.renderPos(alpha);
    this.model.position.set(p.x, p.y + 0.49, p.z);
  }

  override serialize() {
    return { ...super.serialize(), st: this.state, ft: this.fallTicks };
  }
  override deserialize(o: any) {
    super.deserialize(o);
    this.state = o.st ?? 0;
    this.fallTicks = o.ft ?? 0;
  }
}

function hasWaterNeighbor(w: World, x: number, y: number, z: number) {
  for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]]) if (T_LIQUID[w.getBlock(x + dx, y + dy, z + dz) >>> 4] === 1) return true;
  return false;
}

registerEntity('falling_block', FallingBlockEntity, 'misc');

/** Called by the gravity behaviour; set by the game (entity spawning needs the entity manager). */
export const gravityHooks: { spawn: ((w: World, x: number, y: number, z: number, state: number) => void) | null } = { spawn: null };

let installed = false;
export function installGravityBlocks() {
  if (installed) return;
  installed = true;
  const check = (world: World, x: number, y: number, z: number) => {
    world.scheduleTick(x, y, z, 2);
  };
  addBehavior((n) => !!BLOCKS.find((b) => b.name === n)?.gravity, {
    onPlace: (w, x, y, z) => check(w, x, y, z),
    onNeighborChange: (w, x, y, z) => check(w, x, y, z),
    onScheduledTick(world, x, y, z, st) {
      if (y <= 0) return;
      const below = world.getBlock(x, y - 1, z);
      if (below === 0 || T_REPLACEABLE[below >>> 4] || T_LIQUID[below >>> 4]) {
        if (!gravityHooks.spawn) return;
        world.setBlock(x, y, z, 0, SetFlags.ALL);
        gravityHooks.spawn(world, x, y, z, st);
      }
    },
  });
}
