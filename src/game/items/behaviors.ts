/**
 * Generic item behaviours (Minecraft rules): eating & drinking, buckets, glass bottles,
 * flint and steel / fire charge, bow, crossbow, throwables (snowball, egg, ender pearl,
 * bottle o' enchanting, eye of ender), trident, shield blocking, armor equipping, totem of
 * undying, spawn eggs, chorus fruit teleport, turtle helmet.
 *
 * Events emitted on `game.events` (for audio / particles / other systems):
 *   itemUse {player, stack, hand}               any successful right-click use handled here
 *   eating {player, stack} / drinking {...}     every 4 ticks while consuming (chew/gulp sound, crumbs)
 *   eat {player, stack} / drink {player, stack} consumption finished (burp)
 *   bucketFill {player, fluid, x, y, z}         fluid picked up ('water' | 'lava' | 'powder_snow')
 *   bucketEmpty {player, fluid, x, y, z, evaporated}
 *   bottleFill {player, x, y, z}
 *   fireIgnite {player, x, y, z, item}          fire placed / campfire relit (item 'flint_and_steel' | 'fire_charge')
 *   portalIgnite {player, x, y, z}              fire placed next to obsidian (nether portal workstream validates the frame)
 *   tntIgnite {player, x, y, z, handle()}       flint and steel used on TNT; call handle() if primed
 *   bowShoot {player, power, arrow}  crossbowLoad {player, stack}  crossbowShoot {player, stack, arrows}
 *   itemThrow {player, item, entity}            snowball / egg / ender pearl / xp bottle / eye of ender
 *   tridentThrow {player, entity}  tridentHit  tridentStuck  tridentReturn
 *   projectileImpact {entity, item, pos, target, block}   enderPearlTeleport {player, from, to}
 *   chorusTeleport {player, from, to}  bottleBreak {pos, color, item}  eyeOfEnderShatter {pos}
 *   shieldRaise {player} shieldLower {player} shieldBlock {player, source, amount} shieldDisable {player}
 *   armorEquip {player, stack, slot, material}  totemUse {entity}  spawnEggUse {player, entity, type}
 *   milkDrink {player}  eyeInserted {player, x, y, z}
 */
import * as THREE from 'three';
import { addItemBehavior, itemByName, tryItem, stack as mkStack, cloneStack, ITEMS, type ItemStack, type ItemUseContext, type ItemDef } from './registry';
import { SPAWN_EGGS, MOB_BUCKETS } from './items';
import { BLOCKS, BLOCK_BY_NAME, S, T_SOLID, T_LIQUID, stateOf } from '../../world/blocks/registry';
import { SetFlags } from '../../world/world';
import { raycastBlocks } from '../interaction';
import { ArrowEntity } from '../../entity/projectile';
import { createEntity } from '../../entity/manager';
import { LivingEntity, DAMAGE_MODIFIERS, type DamageModifier } from '../../entity/living';
import type { Entity } from '../../entity/entity';
import { SnowballEntity, EggEntity, EnderPearlEntity, ExperienceBottleEntity, TridentEntity, EyeOfEnderEntity, TypedArrowEntity } from '../../entity/thrown';
import { ARMOR, OFFHAND } from '../inventory';

/** Hooks other workstreams can fill (brewing: potion effects for tipped arrows). */
export const ITEM_HOOKS: {
  /** Effects of a potion id (e.g. 'strong_poison'), used for tipped arrows. */
  potionEffects?: (potion: string) => { id: string; duration: number; amplifier: number }[];
} = {};

const FACE_OFF: [number, number, number][] = [[0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1], [-1, 0, 0], [1, 0, 0]];

// ------------------------------------------------------------------------------- helpers
function handSlot(ctx: ItemUseContext): number {
  return ctx.hand === 'main' ? ctx.player.inventory.selected : OFFHAND;
}
/** Use up `n` of the stack in hand (not in creative). */
function consume(ctx: ItemUseContext, n = 1) {
  if (ctx.player.creative) return;
  ctx.player.inventory.consumeHeld(n, handSlot(ctx));
}
/** Replace one item in hand by `result` (bucket filling, bowl after stew ...). */
function exchange(ctx: ItemUseContext, result: ItemStack, keepInCreative = true) {
  const p = ctx.player;
  const inv = p.inventory;
  const slot = handSlot(ctx);
  if (p.creative && keepInCreative) {
    if (inv.count(result.item) === 0) giveOrDrop(ctx.game, p, result);
    return;
  }
  const cur = inv.get(slot);
  if (cur && cur.count <= 1) inv.set(slot, result);
  else {
    inv.consumeHeld(1, slot);
    giveOrDrop(ctx.game, p, result);
  }
}
function giveOrDrop(game: any, p: any, s: ItemStack) {
  const left = p.inventory.add(s);
  if (left > 0) game.dropItem?.({ ...s, count: left }, p.eyePos.add(new THREE.Vector3(0, -0.3, 0)), p.lookDir().multiplyScalar(3), 20);
}
function damageHeld(ctx: ItemUseContext, n = 1) {
  ctx.player.damageItem(handSlot(ctx), n);
}
export function onCooldown(p: any, item: string): boolean {
  const cd = p.data?.itemCooldowns as Record<string, number> | undefined;
  return !!cd && (cd[item] ?? 0) > (p.game?.ticks ?? 0);
}
export function setCooldown(p: any, item: string, ticks: number) {
  const cd = (p.data.itemCooldowns ??= {}) as Record<string, number>;
  cd[item] = (p.game?.ticks ?? 0) + ticks;
}
/** Fraction (0..1) of the remaining cooldown, for HUD overlays. */
export function cooldownFraction(p: any, item: string, total: number): number {
  const cd = p.data?.itemCooldowns as Record<string, number> | undefined;
  if (!cd || cd[item] === undefined) return 0;
  return Math.max(0, Math.min(1, (cd[item] - (p.game?.ticks ?? 0)) / total));
}
const emit = (ctx: ItemUseContext, name: string, payload: any) => ctx.game.events.emit(name, payload);

// =====================================================================================
// Eating & drinking
// =====================================================================================
const DRINKS = new Set(['milk_bucket', 'honey_bottle']);
export function useDuration(it: ItemDef): number {
  if (it.food) return it.food.eatTicks ?? 32;
  if (it.name === 'milk_bucket') return 32;
  return 32;
}

function chorusTeleport(game: any, p: any) {
  const from = p.pos.clone();
  for (let i = 0; i < 16; i++) {
    const x = Math.floor(from.x + (Math.random() - 0.5) * 16);
    let y = THREE.MathUtils.clamp(Math.floor(from.y + Math.floor(Math.random() * 16) - 8), 1, 254);
    const z = Math.floor(from.z + (Math.random() - 0.5) * 16);
    const w = game.world;
    // fall to the ground
    while (y > 1 && !T_SOLID[w.getBlock(x, y - 1, z) >>> 4]) y--;
    if (!T_SOLID[w.getBlock(x, y - 1, z) >>> 4]) continue;
    const a = w.getBlock(x, y, z), b = w.getBlock(x, y + 1, z);
    if (T_SOLID[a >>> 4] || T_SOLID[b >>> 4] || T_LIQUID[a >>> 4]) continue;
    p.setPos(x + 0.5, y, z + 0.5);
    p.vel.set(0, 0, 0);
    p.fallDistance = 0;
    game.events.emit('chorusTeleport', { player: p, from, to: p.pos.clone() });
    return true;
  }
  return false;
}

function finishConsuming(ctx: ItemUseContext) {
  const p = ctx.player;
  const s = ctx.stack;
  const it = s.item;
  const drink = DRINKS.has(it.name);
  if (it.food) {
    p.eat(it.food.hunger, it.food.saturation);
    for (const e of it.food.effects ?? []) if (Math.random() < e.chance) p.addEffect(e.effect, e.duration, e.amplifier);
  }
  switch (it.name) {
    case 'milk_bucket':
      for (const id of [...p.effects.keys()]) p.removeEffect(id);
      emit(ctx, 'milkDrink', { player: p });
      break;
    case 'honey_bottle':
      p.removeEffect('poison');
      break;
    case 'chorus_fruit':
      if (chorusTeleport(ctx.game, p)) setCooldown(p, 'chorus_fruit', 20);
      break;
    case 'suspicious_stew': {
      const e = s.data?.effect as { id: string; duration?: number; amplifier?: number } | undefined;
      if (e?.id) p.addEffect(e.id, e.duration ?? 160, e.amplifier ?? 0);
      break;
    }
  }
  p.stats.itemsConsumed = (p.stats.itemsConsumed ?? 0) + 1;
  emit(ctx, drink ? 'drink' : 'eat', { player: p, stack: s });
  // creative players keep the item (Minecraft: no shrink with instabuild)
  const remainder = it.food?.remainder ?? (it.name === 'milk_bucket' ? 'bucket' : undefined);
  if (!p.creative) {
    if (remainder) exchange(ctx, mkStack(remainder), false);
    else consume(ctx);
  }
  p.usingItem = null;
}

function installConsumables() {
  const edible = (d: ItemDef) => !!d.food || d.name === 'milk_bucket';
  addItemBehavior(edible, {
    use(ctx) {
      const p = ctx.player;
      const f = ctx.stack.item.food;
      if (onCooldown(p, ctx.stack.item.name)) return false;
      if (f && !(p.creative || f.alwaysEdible || p.food < 20)) return false;
      emit(ctx, 'itemUse', { player: p, stack: ctx.stack, hand: ctx.hand });
      return true;
    },
    holdUse: true,
    useTick(ctx, ticks) {
      const dur = useDuration(ctx.stack.item);
      const drink = DRINKS.has(ctx.stack.item.name);
      if (ticks > 7 && ticks % 4 === 0 && ticks < dur) emit(ctx, drink ? 'drinking' : 'eating', { player: ctx.player, stack: ctx.stack });
      if (ticks >= dur) finishConsuming(ctx);
    },
  });
  for (const d of ITEMS) {
    if (!edible(d)) continue;
    addItemBehavior(d.name, { usePose: DRINKS.has(d.name) ? 'drink' : 'eat' });
  }
}

// =====================================================================================
// Buckets & bottles
// =====================================================================================
function fluidRay(ctx: ItemUseContext) {
  const p = ctx.player;
  const eye = ctx.game.cameraCtl?.eyeWorld ?? p.eyePos;
  return raycastBlocks(ctx.game, eye, p.lookDir(), p.creative ? 5 : 4.5, true);
}

/** Target cell for emptying a bucket (Minecraft BucketItem.emptyContents). */
function emptyTarget(ctx: ItemUseContext): [number, number, number] | null {
  const hit = ctx.hit;
  if (!hit) return null;
  const w = ctx.game.world;
  const st = w.getBlock(hit.x, hit.y, hit.z);
  const def = BLOCKS[st >>> 4];
  if (def.replaceable && !def.liquid) return [hit.x, hit.y, hit.z];
  const o = FACE_OFF[hit.face];
  return [hit.x + o[0], hit.y + o[1], hit.z + o[2]];
}

function placeFluid(ctx: ItemUseContext, fluid: 'water' | 'lava'): [number, number, number] | null | 'evaporated' {
  const t = emptyTarget(ctx);
  if (!t) return null;
  const [x, y, z] = t;
  if (y < 0 || y >= 256) return null;
  const w = ctx.game.world;
  const cur = w.getBlock(x, y, z);
  const cd = BLOCKS[cur >>> 4];
  if (cur !== 0 && !cd.replaceable && !cd.isAir) return null;
  if (cd.liquid && (cur & 15) === 0 && cd.name === fluid) return null; // already a source
  if (fluid === 'water' && ctx.game.dimension === 'nether') return 'evaporated';
  if (cur && !cd.liquid && !cd.isAir) ctx.game.breakBlock(x, y, z, true);
  w.setBlock(x, y, z, S(fluid, 0), SetFlags.ALL);
  ctx.game.chunks?.markUrgent?.(x, y, z);
  return [x, y, z];
}

function installBuckets() {
  addItemBehavior('bucket', {
    use(ctx) {
      const hit = fluidRay(ctx);
      if (!hit) return false;
      const w = ctx.game.world;
      const st = w.getBlock(hit.x, hit.y, hit.z);
      const def = BLOCKS[st >>> 4];
      if (!def.liquid || (st & 15) !== 0) return false;
      const fluid = def.liquid === 1 ? 'water' : 'lava';
      w.setBlock(hit.x, hit.y, hit.z, 0, SetFlags.ALL);
      ctx.game.chunks?.markUrgent?.(hit.x, hit.y, hit.z);
      exchange(ctx, mkStack(`${fluid}_bucket`));
      emit(ctx, 'bucketFill', { player: ctx.player, fluid, x: hit.x, y: hit.y, z: hit.z });
      ctx.player.swing();
      return true;
    },
  });
  for (const fluid of ['water', 'lava'] as const) {
    addItemBehavior(`${fluid}_bucket`, {
      use(ctx) {
        const r = placeFluid(ctx, fluid);
        if (!r) return false;
        const t = r === 'evaporated' ? emptyTarget(ctx)! : r;
        if (!ctx.player.creative) exchange(ctx, mkStack('bucket'), false);
        emit(ctx, 'bucketEmpty', { player: ctx.player, fluid, x: t[0], y: t[1], z: t[2], evaporated: r === 'evaporated' });
        ctx.player.swing();
        return true;
      },
    });
  }
  for (const [name, type] of Object.entries(MOB_BUCKETS)) {
    addItemBehavior(name, {
      use(ctx) {
        const r = placeFluid(ctx, 'water');
        if (!r || r === 'evaporated') return false;
        const e = createEntity(type);
        if (e) ctx.game.spawn(e, r[0] + 0.5, r[1] + 0.1, r[2] + 0.5);
        if (!ctx.player.creative) exchange(ctx, mkStack('bucket'), false);
        emit(ctx, 'bucketEmpty', { player: ctx.player, fluid: 'water', x: r[0], y: r[1], z: r[2], evaporated: false, entity: e });
        ctx.player.swing();
        return true;
      },
    });
  }
  addItemBehavior('glass_bottle', {
    use(ctx) {
      const hit = fluidRay(ctx);
      if (!hit) return false;
      const st = ctx.game.world.getBlock(hit.x, hit.y, hit.z);
      if (BLOCKS[st >>> 4].liquid !== 1) return false;
      exchange(ctx, { ...mkStack('potion'), data: { potion: 'water' } }, false);
      emit(ctx, 'bottleFill', { player: ctx.player, x: hit.x, y: hit.y, z: hit.z });
      ctx.player.swing();
      return true;
    },
  });
}

// =====================================================================================
// Fire: flint and steel, fire charge
// =====================================================================================
function igniteAt(ctx: ItemUseContext, item: 'flint_and_steel' | 'fire_charge'): boolean {
  const hit = ctx.hit;
  if (!hit) return false;
  const g = ctx.game;
  const w = g.world;
  const p = ctx.player;
  const st = w.getBlock(hit.x, hit.y, hit.z);
  const def = BLOCKS[st >>> 4];
  // TNT: let the explosives workstream prime it
  if (def.name === 'tnt') {
    let handled = false;
    g.events.emit('tntIgnite', { player: p, x: hit.x, y: hit.y, z: hit.z, handle: () => { handled = true; } });
    if (handled) {
      if (item === 'flint_and_steel') damageHeld(ctx); else consume(ctx);
      return true;
    }
  }
  // relight campfires (bit2 = extinguished)
  if (def.shape === 'campfire' && (st & 4)) {
    w.setBlock(hit.x, hit.y, hit.z, st & ~4, SetFlags.ALL);
    g.events.emit('fireIgnite', { player: p, x: hit.x, y: hit.y, z: hit.z, item });
    if (item === 'flint_and_steel') damageHeld(ctx); else consume(ctx);
    return true;
  }
  const o = FACE_OFF[hit.face];
  const x = hit.x + o[0], y = hit.y + o[1], z = hit.z + o[2];
  if (y < 0 || y >= 256) return false;
  const cur = w.getBlock(x, y, z);
  if (cur !== 0 && !BLOCKS[cur >>> 4].isAir) return false;
  // BaseFireBlock.canBePlacedAt: sturdy floor, or a flammable neighbour, or obsidian (portal frame)
  const below = w.getBlock(x, y - 1, z);
  let ok = T_SOLID[below >>> 4] === 1;
  let obsidian = false;
  for (const [dx, dy, dz] of FACE_OFF) {
    const n = w.getBlock(x + dx, y + dy, z + dz);
    if (!n) continue;
    const nd = BLOCKS[n >>> 4];
    if (nd.flammability > 0 || nd.fireEncouragement > 0) ok = true;
    if (nd.name === 'obsidian') obsidian = true;
  }
  if (!ok && !obsidian) return false;
  const bn = BLOCKS[below >>> 4]?.name;
  const soul = bn === 'soul_sand' || bn === 'soul_soil';
  w.setBlock(x, y, z, S(soul ? 'soul_fire' : 'fire'), SetFlags.ALL);
  g.chunks?.markUrgent?.(x, y, z);
  g.events.emit('fireIgnite', { player: p, x, y, z, item });
  if (obsidian) g.events.emit('portalIgnite', { player: p, x, y, z });
  if (item === 'flint_and_steel') damageHeld(ctx); else consume(ctx);
  return true;
}

function installFire() {
  addItemBehavior('flint_and_steel', { useOnBlock: (ctx) => igniteAt(ctx, 'flint_and_steel') });
  addItemBehavior('fire_charge', { useOnBlock: (ctx) => igniteAt(ctx, 'fire_charge') });
}

// =====================================================================================
// Bow & crossbow
// =====================================================================================
const AMMO = new Set(['arrow', 'spectral_arrow', 'tipped_arrow']);
/** Minecraft ProjectileWeaponItem.getProjectile order: offhand, mainhand, then inventory. */
export function findAmmo(p: any, includeFireworks = false): number {
  const inv = p.inventory;
  const ok = (s: ItemStack | null) => !!s && (AMMO.has(s.item.name) || (includeFireworks && s.item.name === 'firework_rocket'));
  if (ok(inv.get(OFFHAND))) return OFFHAND;
  if (ok(inv.get(inv.selected))) return inv.selected;
  for (let i = 0; i < 36; i++) if (ok(inv.get(i))) return i;
  return -1;
}
/** BowItem.getPowerForTime */
export function bowPower(ticks: number): number {
  let f = ticks / 20;
  f = (f * f + f * 2) / 3;
  return Math.min(1, f);
}

function makeArrow(game: any, p: any, ammo: ItemStack, speed: number, dir: THREE.Vector3, inaccuracy: number, creativeOnly: boolean): ArrowEntity {
  const name = ammo.item.name;
  const a: ArrowEntity = name === 'arrow' ? new ArrowEntity() : new TypedArrowEntity({ ...cloneStack(ammo)!, count: 1 }, name);
  a.owner = p;
  const eye = game.cameraCtl?.eyeWorld ?? p.eyePos;
  a.setPos(eye.x, eye.y - 0.1 - a.height / 2, eye.z);
  a.shoot(dir, speed, inaccuracy);
  a.vel.x += p.vel.x;
  a.vel.z += p.vel.z;
  if (!p.onGround) a.vel.y += p.vel.y;
  a.pickup = creativeOnly ? 'creative' : 'allowed';
  if (name === 'spectral_arrow') a.effect = { id: 'glowing', duration: 200, amplifier: 0 };
  if (name === 'tipped_arrow') {
    const effs = (ammo.data?.effects as any[]) ?? (ammo.data?.potion ? ITEM_HOOKS.potionEffects?.(ammo.data.potion) : undefined);
    const e = effs?.[0];
    if (e) a.effect = { id: e.id, duration: Math.max(1, Math.floor(e.duration / 8)), amplifier: e.amplifier ?? 0 };
  }
  return a;
}

function installBows() {
  addItemBehavior('bow', {
    use(ctx) {
      const p = ctx.player;
      // Minecraft: Infinity still needs one arrow in the inventory
      if (!p.creative && findAmmo(p) < 0) return false;
      emit(ctx, 'itemUse', { player: p, stack: ctx.stack, hand: ctx.hand });
      return true;
    },
    holdUse: true,
    usePose: 'bow',
    release(ctx, ticks) {
      const g = ctx.game;
      const p = ctx.player;
      const power = bowPower(ticks);
      if (power < 0.1) return;
      const slot = findAmmo(p);
      const ammo = slot >= 0 ? p.inventory.get(slot)! : mkStack('arrow');
      const infinity = !!ctx.stack.ench?.infinity && ammo.item.name === 'arrow';
      const free = p.creative || infinity;
      const a = makeArrow(g, p, ammo, power * 3 * 20, p.lookDir(), 1, free);
      a.crit = power >= 1;
      const pw = ctx.stack.ench?.power ?? 0;
      if (pw > 0) a.damage += pw * 0.5 + 0.5;
      a.knockback = ctx.stack.ench?.punch ?? 0;
      if (ctx.stack.ench?.flame) a.fireTicks = 100;
      g.entities.add(a);
      if (!free && slot >= 0) p.inventory.consumeHeld(1, slot);
      damageHeld(ctx);
      p.stats.arrowsShot = (p.stats.arrowsShot ?? 0) + 1;
      g.events.emit('bowShoot', { player: p, power, arrow: a, stack: ctx.stack });
    },
  });

  const justShot = new WeakSet<ItemStack>();
  const chargeTicks = (s: ItemStack) => Math.max(0, 25 - 5 * (s.ench?.quick_charge ?? 0));
  addItemBehavior('crossbow', {
    use(ctx) {
      const p = ctx.player;
      const s = ctx.stack;
      const charged = s.data?.charged as string | undefined;
      if (charged) {
        const g = ctx.game;
        const ammo = { ...mkStack(tryItem(charged) ? charged : 'arrow'), data: s.data?.chargedData };
        const multishot = !!s.ench?.multishot;
        const arrows: Entity[] = [];
        const base = p.lookDir();
        for (const ang of multishot ? [0, -10, 10] : [0]) {
          const dir = base.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(ang));
          const a = makeArrow(g, p, ammo, 3.15 * 20, dir, 1, p.creative || ang !== 0);
          a.crit = true;
          a.damage = 2;
          g.entities.add(a);
          arrows.push(a);
        }
        const data = { ...(s.data ?? {}) };
        delete data.charged;
        delete data.chargedData;
        s.data = Object.keys(data).length ? data : undefined;
        damageHeld(ctx, multishot ? 3 : 1);
        justShot.add(s);
        p.inventory.changed();
        g.events.emit('crossbowShoot', { player: p, stack: s, arrows });
        return true;
      }
      if (!p.creative && findAmmo(p, true) < 0) return false;
      emit(ctx, 'itemUse', { player: p, stack: s, hand: ctx.hand });
      return true;
    },
    holdUse(ctx) {
      if (justShot.has(ctx.stack)) {
        justShot.delete(ctx.stack);
        return false;
      }
      return !ctx.stack.data?.charged;
    },
    usePose: 'crossbow',
    useTick(ctx, ticks) {
      if (ticks === 5) emit(ctx, 'crossbowLoading', { player: ctx.player, stack: ctx.stack });
      if (ticks === chargeTicks(ctx.stack)) emit(ctx, 'crossbowCharged', { player: ctx.player, stack: ctx.stack });
    },
    release(ctx, ticks) {
      if (ticks < chargeTicks(ctx.stack) || ctx.stack.data?.charged) return;
      const p = ctx.player;
      const slot = findAmmo(p, true);
      const ammo = slot >= 0 ? p.inventory.get(slot)! : mkStack('arrow');
      ctx.stack.data = { ...(ctx.stack.data ?? {}), charged: ammo.item.name, chargedData: ammo.data };
      if (!p.creative && slot >= 0) p.inventory.consumeHeld(1, slot);
      p.inventory.changed();
      ctx.game.events.emit('crossbowLoad', { player: p, stack: ctx.stack });
    },
  });
}

// =====================================================================================
// Throwables
// =====================================================================================
function throwEntity(ctx: ItemUseContext, e: any, speed: number, pitchOffsetDeg = 0, inaccuracy = 1) {
  const p = ctx.player;
  const g = ctx.game;
  e.owner = p;
  const eye = g.cameraCtl?.eyeWorld ?? p.eyePos;
  e.setPos(eye.x, eye.y - 0.1 - e.height / 2, eye.z);
  const pitch = p.pitch + THREE.MathUtils.degToRad(pitchOffsetDeg);
  const cp = Math.cos(pitch);
  const dir = new THREE.Vector3(-Math.sin(p.yaw) * cp, Math.sin(pitch), -Math.cos(p.yaw) * cp);
  e.shoot(dir, speed * 20, inaccuracy);
  e.vel.x += p.vel.x;
  e.vel.z += p.vel.z;
  if (!p.onGround) e.vel.y += p.vel.y;
  g.entities.add(e);
  consume(ctx);
  p.swing();
  g.events.emit('itemThrow', { player: p, item: ctx.stack.item.name, entity: e });
  emit(ctx, 'itemUse', { player: p, stack: ctx.stack, hand: ctx.hand });
}

function installThrowables() {
  const one = (ctx: ItemUseContext) => ({ ...cloneStack(ctx.stack)!, count: 1 });
  addItemBehavior('snowball', { use: (ctx) => (throwEntity(ctx, new SnowballEntity(one(ctx)), 1.5), true) });
  addItemBehavior('egg', { use: (ctx) => (throwEntity(ctx, new EggEntity(one(ctx)), 1.5), true) });
  addItemBehavior('ender_pearl', {
    use(ctx) {
      if (onCooldown(ctx.player, 'ender_pearl')) return false;
      throwEntity(ctx, new EnderPearlEntity(one(ctx)), 1.5);
      setCooldown(ctx.player, 'ender_pearl', 20);
      return true;
    },
  });
  addItemBehavior('experience_bottle', { use: (ctx) => (throwEntity(ctx, new ExperienceBottleEntity(one(ctx)), 0.7, 20), true) });
  addItemBehavior('ender_eye', {
    useOnBlock(ctx) {
      const hit = ctx.hit!;
      const w = ctx.game.world;
      const st = w.getBlock(hit.x, hit.y, hit.z);
      if (BLOCKS[st >>> 4].name !== 'end_portal_frame' || (st & 4)) return false;
      w.setBlock(hit.x, hit.y, hit.z, st | 4, SetFlags.ALL);
      consume(ctx);
      emit(ctx, 'eyeInserted', { player: ctx.player, x: hit.x, y: hit.y, z: hit.z });
      return true;
    },
    use(ctx) {
      const g = ctx.game;
      const p = ctx.player;
      if (g.dimension !== 'overworld' || !g.chunks?.locate) return false;
      const stackRef = ctx.stack;
      const hand = ctx.hand;
      p.swing();
      g.chunks.locate('stronghold', Math.floor(p.pos.x), Math.floor(p.pos.z)).then((pos: { x: number; y: number; z: number } | null) => {
        if (!pos) return;
        const cur = hand === 'main' ? p.mainHand : p.offHand;
        if (cur !== stackRef) return;
        const e = new EyeOfEnderEntity();
        const eye = p.eyePos;
        e.setPos(eye.x, p.pos.y + p.height * 0.5, eye.z);
        g.entities.add(e);
        e.signalTo(pos.x, pos.y, pos.z);
        if (!p.creative) p.inventory.consumeHeld(1, hand === 'main' ? p.inventory.selected : OFFHAND);
        g.events.emit('itemThrow', { player: p, item: 'ender_eye', entity: e });
      }).catch(() => {});
      return true;
    },
  });
}

// =====================================================================================
// Trident
// =====================================================================================
function installTrident() {
  addItemBehavior('trident', {
    use(ctx) {
      if (ctx.stack.damage >= ctx.stack.item.durability - 1) return false;
      emit(ctx, 'itemUse', { player: ctx.player, stack: ctx.stack, hand: ctx.hand });
      return true;
    },
    holdUse: true,
    usePose: 'spear',
    release(ctx, ticks) {
      if (ticks < 10) return;
      const g = ctx.game;
      const p = ctx.player;
      const riptide = ctx.stack.ench?.riptide ?? 0;
      if (riptide > 0) {
        if (!(p.inWater || g.weather?.raining)) return;
        // TridentItem riptide launch
        const f = 3 * ((1 + riptide) / 4) * 20;
        p.vel.addScaledVector(p.lookDir(), f);
        if (p.onGround) p.vel.y += 1.1999999 * 20;
        damageHeld(ctx);
        g.events.emit('tridentRiptide', { player: p, level: riptide });
        return;
      }
      damageHeld(ctx);
      const cur = ctx.hand === 'main' ? p.mainHand : p.offHand;
      if (!cur) return; // broke
      const e = new TridentEntity({ ...cloneStack(cur)!, count: 1 });
      e.pickup = p.creative ? 'creative' : 'allowed';
      throwEntity({ ...ctx, stack: cur }, e, 2.5, 0, 1);
      if (p.creative) {
        // creative keeps the trident (Minecraft: pickup creative-only)
      }
      g.events.emit('tridentThrow', { player: p, entity: e });
    },
  });
}

// =====================================================================================
// Shield
// =====================================================================================
const SHIELD_DELAY = 5; // ticks before a raised shield blocks (Minecraft 1.9+)
function isBlocking(e: any): boolean {
  const u = e?.usingItem;
  return !!u && u.stack.item.name === 'shield' && u.ticks >= SHIELD_DELAY;
}
const UNBLOCKABLE = new Set(['fall', 'drown', 'starve', 'void', 'magic', 'wither', 'poison', 'suffocate', 'kill', 'freeze', 'fire', 'lava', 'cactus', 'sweet_berry', 'lightning']);
const shieldModifier: DamageModifier = (target, src, amount) => {
  if (amount <= 0 || !isBlocking(target) || UNBLOCKABLE.has(src.type) || src.bypassArmor) return amount;
  const p: any = target;
  const from = (src.direct ?? src.attacker)?.pos ?? src.point;
  if (!from) return amount;
  const toTarget = new THREE.Vector3().subVectors(p.pos, from).setY(0);
  if (toTarget.lengthSq() < 1e-6) return amount;
  toTarget.normalize();
  const look = p.lookDir().setY(0).normalize();
  if (toTarget.dot(look) >= 0) return amount; // hit from behind
  const g = p.game;
  // durability: 1 + floor(amount) when amount >= 3
  if (amount >= 3) {
    const slot = p.usingItem.hand === 'main' ? p.inventory.selected : OFFHAND;
    p.damageItem(slot, 1 + Math.floor(amount));
  }
  const attacker = src.direct && !src.projectile ? src.direct : null;
  if (attacker instanceof LivingEntity && !src.projectile) {
    const d = new THREE.Vector3().subVectors(attacker.pos, p.pos).setY(0).normalize();
    attacker.knockback(0.5, d.x, d.z);
    const weapon: ItemStack | null = (attacker as any).mainHand ?? attacker.equipment?.[0] ?? null;
    if (weapon?.item?.tags?.includes('axes') || (weapon?.item?.name ?? '').endsWith('_axe')) {
      setCooldown(p, 'shield', 100);
      p.usingItem = null;
      g?.events.emit('shieldDisable', { player: p });
    }
  }
  // undo the hurt flash / i-frames started by LivingEntity.hurt
  p.hurtTime = 0;
  p.invulnerableTime = 0;
  g?.events.emit('shieldBlock', { player: p, source: src, amount });
  return 0;
};

function installShield() {
  addItemBehavior('shield', {
    use(ctx) {
      if (onCooldown(ctx.player, 'shield')) return false;
      emit(ctx, 'shieldRaise', { player: ctx.player });
      return true;
    },
    holdUse: true,
    usePose: 'block',
    release(ctx) {
      emit(ctx, 'shieldLower', { player: ctx.player });
    },
  });
  if (!DAMAGE_MODIFIERS.includes(shieldModifier)) DAMAGE_MODIFIERS.unshift(shieldModifier);
}

// =====================================================================================
// Totem of undying
// =====================================================================================
export const totemModifier: DamageModifier = (target, src, amount) => {
  if (amount <= 0 || src.type === 'void' || src.type === 'kill') return amount;
  if (amount < target.health + target.absorption) return amount;
  const e: any = target;
  let found = false;
  if (e.inventory) {
    const inv = e.inventory;
    for (const slot of [inv.selected, OFFHAND]) {
      const s = inv.get(slot);
      if (s?.item.name === 'totem_of_undying') {
        inv.consumeHeld(1, slot);
        found = true;
        break;
      }
    }
  } else if (Array.isArray(e.equipment)) {
    for (let i = 0; i < 2; i++) {
      if (e.equipment[i]?.item?.name === 'totem_of_undying') {
        e.equipment[i] = null;
        found = true;
        break;
      }
    }
  }
  if (!found) return amount;
  target.health = 1;
  for (const id of [...target.effects.keys()]) target.removeEffect(id);
  target.addEffect('regeneration', 900, 1);
  target.addEffect('absorption', 100, 1);
  target.addEffect('fire_resistance', 800, 0);
  target.fireTicks = 0;
  e.game?.events.emit('totemUse', { entity: target });
  return 0;
};
/** Keep the totem check the last damage modifier (after protection/armor style hooks). */
export function ensureTotemLast() {
  const i = DAMAGE_MODIFIERS.indexOf(totemModifier);
  if (i === DAMAGE_MODIFIERS.length - 1) return;
  if (i >= 0) DAMAGE_MODIFIERS.splice(i, 1);
  DAMAGE_MODIFIERS.push(totemModifier);
}

// =====================================================================================
// Armor equipping
// =====================================================================================
const SLOT_OFF: Record<string, number> = { feet: 0, legs: 1, chest: 2, head: 3 };
export function equipSlotOf(it: ItemDef): number | null {
  if (it.armor) return ARMOR + SLOT_OFF[it.armor.slot];
  if (it.name === 'carved_pumpkin' || it.name.endsWith('_head') || it.name.endsWith('_skull')) return ARMOR + 3;
  return null;
}
function installArmor() {
  addItemBehavior((d) => equipSlotOf(d) !== null, {
    use(ctx) {
      const p = ctx.player;
      const slot = equipSlotOf(ctx.stack.item)!;
      const inv = p.inventory;
      const cur = inv.get(slot);
      if (cur?.ench?.binding_curse && !p.creative) return false;
      if (cur && cur.item === ctx.stack.item && JSON.stringify(cur.data ?? null) === JSON.stringify(ctx.stack.data ?? null) && cur.damage === ctx.stack.damage) return false;
      const hs = handSlot(ctx);
      const one = { ...cloneStack(ctx.stack)!, count: 1 };
      if (ctx.stack.count > 1) {
        inv.consumeHeld(1, hs);
        inv.set(slot, one);
        if (cur) giveOrDrop(ctx.game, p, cur);
      } else {
        inv.set(slot, one);
        inv.set(hs, cur);
      }
      p.swing();
      emit(ctx, 'armorEquip', { player: p, stack: one, slot: Object.keys(SLOT_OFF)[slot - ARMOR], material: one.item.armor?.material ?? one.item.name });
      return true;
    },
  });
}

// =====================================================================================
// Spawn eggs
// =====================================================================================
function installSpawnEggs() {
  addItemBehavior(Object.keys(SPAWN_EGGS), {
    useOnBlock(ctx) {
      const type = SPAWN_EGGS[ctx.stack.item.name];
      const hit = ctx.hit!;
      const g = ctx.game;
      const w = g.world;
      const st = w.getBlock(hit.x, hit.y, hit.z);
      if (BLOCKS[st >>> 4].name === 'spawner') {
        w.setBlockEntity(hit.x, hit.y, hit.z, { ...(w.getBlockEntity(hit.x, hit.y, hit.z) ?? {}), entity: type, delay: 20 });
        consume(ctx);
        emit(ctx, 'spawnEggUse', { player: ctx.player, entity: null, type, spawner: true });
        return true;
      }
      const def = BLOCKS[st >>> 4];
      const o = def.replaceable ? [0, 0, 0] : FACE_OFF[hit.face];
      const x = hit.x + o[0], y = hit.y + o[1], z = hit.z + o[2];
      const e: any = createEntity(type);
      if (!e) {
        g.message?.(`Cannot spawn ${type}: entity not available`, '#f88');
        return false;
      }
      e.yaw = ctx.player.yaw + Math.PI;
      if (e.bodyYaw !== undefined) e.bodyYaw = e.yaw;
      if (ctx.stack.data?.name) e.data.customName = ctx.stack.data.name;
      g.spawn(e, x + 0.5, y + (hit.face === 0 ? -((e.height ?? 1) - 1) : 0), z + 0.5);
      consume(ctx);
      emit(ctx, 'spawnEggUse', { player: ctx.player, entity: e, type });
      return true;
    },
  });
}

// =====================================================================================
let installed = false;
/** Install all generic item behaviours (idempotent). */
export function installItemBehaviors() {
  if (installed) return;
  installed = true;
  installConsumables();
  installBuckets();
  installFire();
  installBows();
  installThrowables();
  installTrident();
  installShield();
  installArmor();
  installSpawnEggs();
  ensureTotemLast();
  addItemBehavior('spyglass', { use: () => true, holdUse: true, usePose: 'spyglass' });
  addItemBehavior('goat_horn', {
    use(ctx) {
      if (onCooldown(ctx.player, 'goat_horn')) return false;
      setCooldown(ctx.player, 'goat_horn', 140);
      emit(ctx, 'goatHorn', { player: ctx.player, stack: ctx.stack });
      return true;
    },
    holdUse: true,
    usePose: 'horn',
  });
  void itemByName;
  void stateOf;
  void BLOCK_BY_NAME;
}

/** Usage pose of a stack in hand (from the behaviour) — for hand / third-person animation. */
export { itemBehavior } from './registry';
