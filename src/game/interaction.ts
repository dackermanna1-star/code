/**
 * Player ↔ world interaction: targeting (block + entity raycast), mining with Minecraft
 * break-speed rules, block placement, block/item use, attacking, pick block, drop.
 */
import * as THREE from 'three';
import type { Game } from './game';
import { BLOCKS, T_AIR, T_LIQUID, type BlockDef } from '../world/blocks/registry';
import { behaviorOf, type HitInfo, type PlacementContext } from '../world/blocks/behaviors';
import { getOutlineBoxes } from '../world/blocks/models';
import { itemBehavior, blockOfItem, stack as mkStack, tryItem, type ItemStack, type ItemUseContext } from './items/registry';
import { tryPlace, secondaryPlacement } from './placement';
import { hfacingFromYaw } from '../core/dirs';
import { AABB } from '../physics/aabb';
import { playerAttack } from './combat';
import { LivingEntity } from '../entity/living';
import type { Entity } from '../entity/entity';
import { SetFlags } from '../world/world';

export interface BlockTarget extends HitInfo {
  state: number;
  dist: number;
  /** outline boxes (world coords) */
  boxes: number[];
}

const tmpBoxes: number[] = [];

/** Voxel raycast (Amanatides & Woo) using outline boxes. */
export function raycastBlocks(game: Game, origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number, includeFluids = false): BlockTarget | null {
  const w = game.world;
  let x = Math.floor(origin.x), y = Math.floor(origin.y), z = Math.floor(origin.z);
  const sx = Math.sign(dir.x), sy = Math.sign(dir.y), sz = Math.sign(dir.z);
  const tdx = sx !== 0 ? Math.abs(1 / dir.x) : Infinity, tdy = sy !== 0 ? Math.abs(1 / dir.y) : Infinity, tdz = sz !== 0 ? Math.abs(1 / dir.z) : Infinity;
  let tmx = sx > 0 ? (x + 1 - origin.x) * tdx : sx < 0 ? (origin.x - x) * tdx : Infinity;
  let tmy = sy > 0 ? (y + 1 - origin.y) * tdy : sy < 0 ? (origin.y - y) * tdy : Infinity;
  let tmz = sz > 0 ? (z + 1 - origin.z) * tdz : sz < 0 ? (origin.z - z) * tdz : Infinity;
  const box = new AABB();
  const out = { face: 0 };
  for (let i = 0; i < 256; i++) {
    const st = w.getBlock(x, y, z);
    if (st !== 0 && !T_AIR[st >>> 4]) {
      const def = BLOCKS[st >>> 4];
      const liquid = T_LIQUID[st >>> 4] > 0;
      if (def.targetable || (includeFluids && liquid && (st & 7) === 0)) {
        tmpBoxes.length = 0;
        if (liquid) tmpBoxes.push(0, 0, 0, 1, 0.875, 1);
        else getOutlineBoxes(st, (dx, dy, dz) => w.getBlock(x + dx, y + dy, z + dz), tmpBoxes);
        let best = Infinity, bestFace = 0;
        for (let k = 0; k < tmpBoxes.length; k += 6) {
          box.set(x + tmpBoxes[k], y + tmpBoxes[k + 1], z + tmpBoxes[k + 2], x + tmpBoxes[k + 3], y + tmpBoxes[k + 4], z + tmpBoxes[k + 5]);
          const t = box.rayIntersect(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, maxDist, out);
          if (t >= 0 && t < best) { best = t; bestFace = out.face; }
        }
        if (best <= maxDist) {
          const boxes: number[] = [];
          for (let k = 0; k < tmpBoxes.length; k += 6) boxes.push(x + tmpBoxes[k], y + tmpBoxes[k + 1], z + tmpBoxes[k + 2], x + tmpBoxes[k + 3], y + tmpBoxes[k + 4], z + tmpBoxes[k + 5]);
          // face from ray entry: rayIntersect returns the face index of the entering side (negative axis = min side)
          return { x, y, z, face: bestFace, px: origin.x + dir.x * best, py: origin.y + dir.y * best, pz: origin.z + dir.z * best, state: st, dist: best, boxes };
        }
      }
    }
    if (tmx < tmy && tmx < tmz) {
      if (tmx > maxDist) break;
      x += sx; tmx += tdx;
    } else if (tmy < tmz) {
      if (tmy > maxDist) break;
      y += sy; tmy += tdy;
    } else {
      if (tmz > maxDist) break;
      z += sz; tmz += tdz;
    }
  }
  return null;
}

export interface MiningState {
  x: number; y: number; z: number;
  state: number;
  progress: number;
  /** ticks since start */
  ticks: number;
}

export class Interaction {
  target: BlockTarget | null = null;
  targetEntity: Entity | null = null;
  mining: MiningState | null = null;
  /** cooldown (ticks) between block placements while holding right click */
  private useCooldown = 0;
  /** Veto a block target (e.g. the wall behind a portal you are looking through). */
  targetFilter: ((eye: THREE.Vector3, dir: THREE.Vector3, hit: BlockTarget) => boolean) | null = null;
  private breakCooldown = 0;
  private useHeldTicks = 0;
  private usingStarted = false;

  constructor(private game: Game) {}

  get reach(): number {
    return this.game.player.creative ? 5 : 4.5;
  }

  /** Per-frame targeting update. */
  updateTarget() {
    const g = this.game;
    const p = g.player;
    if (p.dead || p.sleeping || p.vehicle) { this.target = null; this.targetEntity = null; return; }
    const eye = g.cameraCtl.eyeWorld;
    const dir = p.lookDir();
    let block = raycastBlocks(g, eye, dir, this.reach);
    if (block && this.targetFilter && !this.targetFilter(eye, dir, block)) block = null;
    // entities
    let ent: Entity | null = null;
    let entDist = block ? block.dist : this.reach;
    const box = new AABB();
    for (const e of g.entities.list) {
      const vehicle = (e as any).targetable === true;
      if (e === p || e.removed || (!vehicle && (!(e instanceof LivingEntity) || (e as LivingEntity).dead))) continue;
      if (e.pos.distanceToSquared(eye) > (vehicle ? 196 : 64)) continue;
      box.copy(e.box);
      const t = box.grow(0.1).rayIntersect(eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, entDist);
      if (t >= 0 && t < entDist) { entDist = t; ent = e; }
    }
    this.targetEntity = ent;
    this.target = ent ? null : block;
  }

  /** Break speed per tick (fraction of the block) for the player. */
  breakSpeed(def: BlockDef, held: ItemStack | null): number {
    const p = this.game.player;
    if (def.hardness < 0) return 0;
    if (def.hardness === 0) return 1;
    const tool = held?.item.tool;
    let speed = 1;
    const correct = tool && (tool.type === def.tool || (tool.type === 'sword' && def.name === 'cobweb') || (tool.type === 'shears' && (def.tags.includes('leaves') || def.tags.includes('wool') || def.name === 'cobweb' || def.name === 'vine')));
    if (correct && tool) {
      speed = tool.speed;
      if (tool.type === 'shears') speed = def.name === 'cobweb' || def.tags.includes('leaves') ? 15 : def.tags.includes('wool') ? 5 : 1.5;
      if (tool.type === 'sword') speed = 15;
      const eff = held?.ench?.efficiency ?? 0;
      if (eff > 0) speed += eff * eff + 1;
    } else if (tool?.type === 'sword') speed = 1.5;
    const haste = p.effectLevel('haste') + p.effectLevel('conduit_power');
    if (haste) speed *= 1 + 0.2 * haste;
    const fatigue = p.effectLevel('mining_fatigue');
    if (fatigue) speed *= [0.3, 0.09, 0.0027, 0.00081][Math.min(4, fatigue) - 1];
    if (p.eyesInWater && !(p.armorPiece('head')?.ench?.aqua_affinity)) speed /= 5;
    if (!p.onGround && !p.flying) speed /= 5;
    const canHarvest = !def.requiresTool || (!!tool && tool.type === def.tool && tool.tier >= def.harvestTier) || (def.name === 'cobweb' && (tool?.type === 'sword' || tool?.type === 'shears'));
    return speed / def.hardness / (canHarvest ? 30 : 100);
  }

  canHarvest(def: BlockDef, held: ItemStack | null): boolean {
    if (!def.requiresTool) return true;
    const t = held?.item.tool;
    if (!t) return false;
    if (def.name === 'cobweb') return t.type === 'sword' || t.type === 'shears';
    return t.type === def.tool && t.tier >= def.harvestTier;
  }

  /** 20 TPS: mining progress, continuous use. */
  tick() {
    const g = this.game;
    const p = g.player;
    const inp = g.input;
    if (this.useCooldown > 0) this.useCooldown--;
    if (this.breakCooldown > 0) this.breakCooldown--;
    if (p.dead || p.sleeping || !inp.enabled || p.vehicle) {
      this.mining = null;
      this.stopUsing();
      return;
    }
    // items that use the mouse themselves (portal gun)
    const heldMain = p.mainHand;
    if (heldMain && itemBehavior(heldMain.item)?.ownsMouse) {
      this.mining = null;
      if (p.usingItem) this.releaseUse();
      if (inp.wasPressedTick('pickBlock') && this.target) this.pickBlock();
      return;
    }
    // ----- attacking / mining
    const attackDown = inp.isDown('attack');
    if (attackDown && !p.usingItem) {
      if (this.targetEntity && inp.wasPressedTick('attack')) {
        playerAttack(p, this.targetEntity, g);
        p.swing();
      } else if (this.target && !this.targetEntity) {
        const t = this.target;
        if (!this.mining || this.mining.x !== t.x || this.mining.y !== t.y || this.mining.z !== t.z || this.mining.state !== t.state) {
          if (this.breakCooldown === 0 || inp.wasPressedTick('attack')) {
            this.mining = { x: t.x, y: t.y, z: t.z, state: t.state, progress: 0, ticks: 0 };
            behaviorOf(t.state >>> 4)?.onAttack?.(g.world, t.x, t.y, t.z, t.state, p);
            g.events.emit('blockStartBreak', { x: t.x, y: t.y, z: t.z, state: t.state, player: p });
          }
        }
        if (this.mining) {
          const def = BLOCKS[this.mining.state >>> 4];
          if (p.creative) {
            const held = p.mainHand;
            if (!(held?.item.tags.includes('swords')) && this.breakCooldown === 0) {
              this.breakBlock(this.mining.x, this.mining.y, this.mining.z, false);
              this.breakCooldown = 5;
            }
            this.mining = null;
          } else {
            const sp = this.breakSpeed(def, p.mainHand);
            this.mining.progress += sp;
            this.mining.ticks++;
            if (this.mining.ticks % 4 === 0) g.events.emit('blockHitting', { x: this.mining.x, y: this.mining.y, z: this.mining.z, state: this.mining.state, player: p, progress: this.mining.progress });
            if (this.mining.progress >= 1) {
              this.breakBlock(this.mining.x, this.mining.y, this.mining.z, true);
              this.mining = null;
              this.breakCooldown = 5;
            }
          }
          p.swing();
        }
      } else {
        this.mining = null;
        if (inp.wasPressedTick('attack')) { p.swing(); p.resetAttack(); g.events.emit('swingAir', { player: p }); }
      }
    } else {
      this.mining = null;
    }
    // ----- use
    const useDown = inp.isDown('use');
    if (useDown) {
      if (p.usingItem) {
        this.continueUsing();
      } else if (this.useCooldown === 0) {
        this.use();
      }
    } else if (p.usingItem) {
      this.releaseUse();
    }
    // pick block
    if (inp.wasPressedTick('pickBlock') && this.target) this.pickBlock();
  }

  private ctx(stack: ItemStack, hand: 'main' | 'off'): ItemUseContext {
    return { game: this.game, player: this.game.player, stack, hand, hit: this.target, entity: this.targetEntity };
  }

  private use() {
    const g = this.game;
    const p = g.player;
    this.useCooldown = 4;
    for (const hand of ['main', 'off'] as const) {
      const st = hand === 'main' ? p.mainHand : p.offHand;
      // entity interaction
      if (this.targetEntity) {
        const e: any = this.targetEntity;
        if (e.interact && e.interact(p, st, hand)) { p.swing(); return; }
        if (st) {
          const b = itemBehavior(st.item);
          if (b?.useOnEntity?.(this.ctx(st, hand))) { p.swing(); return; }
        }
      }
      // block interaction
      if (this.target) {
        const t = this.target;
        const beh = behaviorOf(t.state >>> 4);
        if (!p.sneaking || !st) {
          if (hand === 'main' && beh?.onUse?.(g.world, t.x, t.y, t.z, t.state, p, t)) { p.swing(); return; }
        }
        if (st) {
          const ib = itemBehavior(st.item);
          if (ib?.useOnBlock?.(this.ctx(st, hand))) { p.swing(); return; }
          if (st.item.block && this.placeBlock(st, hand)) { p.swing(); return; }
        }
      }
      if (st) {
        const ib = itemBehavior(st.item);
        if (ib?.use?.(this.ctx(st, hand))) {
          const hold = typeof ib.holdUse === 'function' ? ib.holdUse(this.ctx(st, hand)) : ib.holdUse;
          if (hold) {
            p.usingItem = { stack: st, hand, ticks: 0 };
            this.useHeldTicks = 0;
            this.usingStarted = true;
          }
          return;
        }
      }
    }
  }

  private continueUsing() {
    const p = this.game.player;
    const u = p.usingItem!;
    u.ticks++;
    const ib = itemBehavior(u.stack.item);
    ib?.useTick?.(this.ctx(u.stack, u.hand), u.ticks);
    // stack swapped out from under us
    const cur = u.hand === 'main' ? p.mainHand : p.offHand;
    if (cur !== u.stack) this.stopUsing();
  }

  private releaseUse() {
    const p = this.game.player;
    const u = p.usingItem!;
    itemBehavior(u.stack.item)?.release?.(this.ctx(u.stack, u.hand), u.ticks);
    p.usingItem = null;
  }

  stopUsing() {
    this.game.player.usingItem = null;
  }

  /** Place the held block item at the targeted position. */
  placeBlock(st: ItemStack, hand: 'main' | 'off'): boolean {
    const g = this.game;
    const p = g.player;
    const t = this.target;
    if (!t || p.gameMode === 'adventure' || p.spectator) return false;
    const bid = blockOfItem(st.item);
    if (bid === null) return false;
    const def = BLOCKS[bid];
    const hitDef = BLOCKS[t.state >>> 4];
    // place into the targeted block if replaceable (tall grass, snow layer) or slab merge
    let x = t.x, y = t.y, z = t.z;
    const mergeSlab = def.shape === 'slab' && t.state >>> 4 === bid && (t.state & 15) !== 2 && ((t.face === 1 && (t.state & 15) === 0) || (t.face === 0 && (t.state & 15) === 1));
    const stackSnow = def.shape === 'snow_layer' && t.state >>> 4 === bid && t.face === 1;
    if (!(hitDef.replaceable && t.state >>> 4 !== bid) && !mergeSlab && !stackSnow) {
      const n = [[0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1], [-1, 0, 0], [1, 0, 0]][t.face];
      x += n[0]; y += n[1]; z += n[2];
    }
    if (y < 0 || y >= 256) return false;
    const ctx: PlacementContext = {
      world: g.world, x, y, z, face: t.face,
      hitX: t.px - Math.floor(t.px), hitY: t.py - t.y, hitZ: t.pz - Math.floor(t.pz),
      yaw: p.yaw, pitch: p.pitch, playerFacing: hfacingFromYaw(p.yaw), placer: p, sneaking: p.sneaking,
    };
    const blocked = (bx: number, by: number, bz: number) => {
      const bb = new AABB(bx, by, bz, bx + 1, by + 1, bz + 1);
      return g.entities.list.some((e) => !e.removed && e.type !== 'item' && !(e as any).dead && e.box.intersects(bb) && !(e as any).spectator);
    };
    const state = tryPlace(g.world, def, ctx, blocked);
    if (state === null) return false;
    const extra = secondaryPlacement(def, state, x, y, z);
    for (const [ex, ey, ez] of extra) {
      const s = g.world.getBlock(ex, ey, ez);
      if (s && !BLOCKS[s >>> 4].replaceable) return false;
    }
    const old = g.world.getBlock(x, y, z);
    g.world.setBlock(x, y, z, state, SetFlags.ALL);
    for (const [ex, ey, ez, es] of extra) g.world.setBlock(ex, ey, ez, es, SetFlags.ALL);
    g.chunks.markUrgent(x, y, z);
    if (!p.creative) p.inventory.consumeHeld(1, hand === 'main' ? p.inventory.selected : 40);
    g.events.emit('blockPlaced', { x, y, z, state, oldState: old, player: p });
    p.stats.blocksPlaced = (p.stats.blocksPlaced ?? 0) + 1;
    return true;
  }

  /** Break a block (with drops if `drops`). */
  breakBlock(x: number, y: number, z: number, drops: boolean) {
    const g = this.game;
    const p = g.player;
    const st = g.world.getBlock(x, y, z);
    if (!st) return;
    const def = BLOCKS[st >>> 4];
    if (def.hardness < 0 && !p.creative) return;
    if (p.gameMode === 'adventure' || p.spectator) return;
    const held = p.mainHand;
    g.breakBlock(x, y, z, drops && !p.creative && this.canHarvest(def, held), p, held);
    // multi-block structures
    if (def.shape === 'door' || def.shape === 'double_plant') {
      const upper = (st & 8) !== 0;
      const oy = upper ? y - 1 : y + 1;
      if (g.world.getBlock(x, oy, z) >>> 4 === def.id) g.world.setBlock(x, oy, z, 0, SetFlags.ALL);
    }
    if (def.shape === 'bed') {
      const head = (st & 8) !== 0;
      const dirs = [[0, 1], [-1, 0], [0, -1], [1, 0]];
      const [dx, dz] = dirs[st & 3];
      const ox = head ? x - dx : x + dx, oz = head ? z - dz : z + dz;
      if (g.world.getBlock(ox, y, oz) >>> 4 === def.id) g.world.setBlock(ox, y, oz, 0, SetFlags.ALL);
    }
    if (!p.creative && held && held.item.durability && def.hardness > 0) p.damageItem(p.inventory.selected, held.item.tool?.type === 'sword' ? 2 : 1);
    p.addExhaustion(0.005);
    p.stats.blocksMined = (p.stats.blocksMined ?? 0) + 1;
    g.chunks.markUrgent(x, y, z);
  }

  private pickBlock() {
    const g = this.game;
    const p = g.player;
    const t = this.target!;
    const def = BLOCKS[t.state >>> 4];
    const itemName = def.item ?? def.name;
    const it = tryItem(itemName);
    if (!it) return;
    const inv = p.inventory;
    for (let i = 0; i < 9; i++) if (inv.get(i)?.item === it) { inv.selected = i; inv.changed(); return; }
    if (p.creative) {
      let slot = inv.selected;
      for (let i = 0; i < 9; i++) if (!inv.get(i)) { slot = i; break; }
      inv.set(slot, mkStack(it, 1));
      inv.selected = slot;
    } else {
      const idx = inv.find((s) => s.item === it);
      if (idx >= 9 && idx < 36) {
        const tmp = inv.get(inv.selected);
        inv.set(inv.selected, inv.get(idx));
        inv.set(idx, tmp);
      }
    }
  }
}
