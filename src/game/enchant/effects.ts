/**
 * Enchantment effects, implemented through the core hooks:
 *  - melee: Sharpness / Smite / Bane of Arthropods / Impaling (bonus damage by `entity.mobType`),
 *    Knockback, Fire Aspect, Sweeping Edge (ATTACK_HOOKS); Bane also slows arthropods
 *  - armour: Protection family EPF (DAMAGE_MODIFIERS; Feather Falling is applied by Player itself),
 *    Thorns (hurt listener), Curse of Binding (armour slots), Curse of Vanishing (on death)
 *  - Mending: `applyMending(player, xp)` + `xpPickup` events
 *  - helpers for other workstreams: lootingLevel, bow/crossbow/trident/fishing helpers
 *
 * Efficiency, Silk Touch, Fortune, Unbreaking, Respiration, Aqua Affinity and Feather Falling are
 * read directly by core code from `stack.ench` (keys efficiency, silk_touch, fortune, unbreaking,
 * respiration, aqua_affinity, feather_falling).
 */
import * as THREE from 'three';
import { ATTACK_HOOKS } from '../combat';
import { DAMAGE_MODIFIERS, LivingEntity } from '../../entity/living';
import type { DamageSource, Entity } from '../../entity/entity';
import type { Player } from '../../entity/player';
import type { ItemStack } from '../items/registry';
import { enchLevel } from './enchantments';
import { ARMOR, INV_SIZE } from '../inventory';

export type MobType = 'undead' | 'arthropod' | 'illager' | 'water' | 'none';

const UNDEAD = new Set(['zombie', 'husk', 'drowned', 'zombie_villager', 'skeleton', 'stray', 'wither_skeleton', 'zombified_piglin', 'zoglin', 'phantom', 'wither', 'skeleton_horse', 'zombie_horse']);
const ARTHROPOD = new Set(['spider', 'cave_spider', 'silverfish', 'endermite', 'bee']);
const WATER = new Set(['guardian', 'elder_guardian', 'squid', 'glow_squid', 'dolphin', 'cod', 'salmon', 'pufferfish', 'tropical_fish', 'turtle', 'axolotl', 'tadpole']);

/** Mob category (`entity.mobType` set by mob classes; falls back to vanilla type lists). */
export function mobTypeOf(e: Entity | null | undefined): MobType {
  if (!e) return 'none';
  const t = (e as any).mobType as MobType | undefined;
  if (t) return t;
  if (UNDEAD.has(e.type)) return 'undead';
  if (ARTHROPOD.has(e.type)) return 'arthropod';
  if (WATER.has(e.type)) return 'water';
  if (['pillager', 'vindicator', 'evoker', 'illusioner', 'ravager', 'witch'].includes(e.type)) return 'illager';
  return 'none';
}

/** Armour stacks of a living entity: [feet, legs, chest, head]. */
export function armorStacks(e: any): (ItemStack | null)[] {
  if (e?.inventory?.slots && e.inventory.size >= INV_SIZE) return [0, 1, 2, 3].map((i) => e.inventory.get(ARMOR + i));
  const eq = e?.equipment as any[] | undefined;
  return eq ? [eq[2] ?? null, eq[3] ?? null, eq[4] ?? null, eq[5] ?? null] : [null, null, null, null];
}
export function mainHandOf(e: any): ItemStack | null {
  if (e?.inventory?.held !== undefined) return e.inventory.held;
  return e?.equipment?.[0] ?? null;
}

/** Bonus melee damage from the weapon's enchantments against `target`. */
export function damageBonus(weapon: ItemStack | null, target: Entity | null): number {
  if (!weapon?.ench) return 0;
  let b = 0;
  const sharp = enchLevel(weapon, 'sharpness');
  if (sharp > 0) b += 1 + Math.max(0, sharp - 1) * 0.5;
  const mt = mobTypeOf(target);
  const smite = enchLevel(weapon, 'smite');
  if (smite > 0 && mt === 'undead') b += smite * 2.5;
  const bane = enchLevel(weapon, 'bane_of_arthropods');
  if (bane > 0 && mt === 'arthropod') b += bane * 2.5;
  const imp = enchLevel(weapon, 'impaling');
  if (imp > 0 && mt === 'water') b += imp * 2.5;
  return b;
}

/** Looting level of the entity's main hand (mob drops). */
export function lootingLevel(e: Player | Entity | null | undefined): number {
  return enchLevel(mainHandOf(e), 'looting');
}

// ------------------------------------------------------------------------------------ protection
/** Enchantment protection factor of a set of armour for a damage source (capped at 20 by the caller). */
export function protectionEPF(armor: (ItemStack | null)[], src: DamageSource): number {
  if (src.type === 'void' || src.type === 'kill') return 0;
  let epf = 0;
  const fire = src.fire || src.type === 'fire' || src.type === 'lava' || src.type === 'lightning';
  const blast = src.explosion || src.type === 'explosion';
  const proj = src.projectile || src.type === 'arrow' || src.type === 'projectile';
  for (const s of armor) {
    if (!s?.ench) continue;
    epf += enchLevel(s, 'protection');
    if (fire) epf += 2 * enchLevel(s, 'fire_protection');
    if (blast) epf += 2 * enchLevel(s, 'blast_protection');
    if (proj) epf += 2 * enchLevel(s, 'projectile_protection');
  }
  return epf;
}

/** Fire Protection shortens burning; Blast Protection reduces explosion knockback (helpers). */
export function fireDurationAfterProtection(e: any, ticks: number): number {
  let best = 0;
  for (const s of armorStacks(e)) best = Math.max(best, enchLevel(s, 'fire_protection'));
  return best > 0 ? ticks - Math.floor(ticks * best * 0.15) : ticks;
}
export function explosionKnockbackAfterProtection(e: any, k: number): number {
  let best = 0;
  for (const s of armorStacks(e)) best = Math.max(best, enchLevel(s, 'blast_protection'));
  return best > 0 ? k * Math.max(0, 1 - best * 0.15) : k;
}

// ------------------------------------------------------------------------------------ bows etc.
/** Extra arrow base damage from Power (vanilla: +0.5*level + 0.5). */
export function bowPower(bow: ItemStack | null | undefined): number {
  const p = enchLevel(bow, 'power');
  return p > 0 ? p * 0.5 + 0.5 : 0;
}
/** Punch knockback level. */
export function bowPunch(bow: ItemStack | null | undefined): number {
  return enchLevel(bow, 'punch');
}
/** Flame: arrows are on fire (100 ticks). */
export function bowFlame(bow: ItemStack | null | undefined): boolean {
  return enchLevel(bow, 'flame') > 0;
}
/** Infinity: normal arrows are not consumed (pickup becomes creative-only). */
export function bowInfinity(bow: ItemStack | null | undefined): boolean {
  return enchLevel(bow, 'infinity') > 0;
}
export function crossbowMultishot(cb: ItemStack | null | undefined): boolean {
  return enchLevel(cb, 'multishot') > 0;
}
/** Quick Charge: charge time in ticks (25 - 5*level). */
export function crossbowChargeTicks(cb: ItemStack | null | undefined): number {
  const q = enchLevel(cb, 'quick_charge');
  return q === 0 ? 25 : Math.max(0, 25 - 5 * q);
}
export function crossbowPiercing(cb: ItemStack | null | undefined): number {
  return enchLevel(cb, 'piercing');
}
export function tridentLoyalty(t: ItemStack | null | undefined): number {
  return enchLevel(t, 'loyalty');
}
export function tridentRiptide(t: ItemStack | null | undefined): number {
  return enchLevel(t, 'riptide');
}
export function tridentChanneling(t: ItemStack | null | undefined): boolean {
  return enchLevel(t, 'channeling') > 0;
}

/**
 * Apply bow enchantments to a freshly shot ArrowEntity (`damage`, `knockback`, `fireTicks`,
 * `pickup` fields of src/entity/projectile.ts). `consumedArrow` = whether an arrow item was used.
 */
export function applyBowEnchantments(arrow: any, bow: ItemStack | null | undefined, opts: { creative?: boolean; arrowItem?: string } = {}) {
  const pb = bowPower(bow);
  if (pb > 0) arrow.damage = (arrow.damage ?? 2) + pb;
  const punch = bowPunch(bow);
  if (punch > 0) arrow.knockback = punch;
  if (bowFlame(bow)) {
    arrow.fireTicks = 100;
    arrow.fireTicksOnHit = 100;
  }
  if (bowInfinity(bow) && (opts.arrowItem ?? 'arrow') === 'arrow') arrow.pickup = 'creative';
  if (opts.creative) arrow.pickup = 'creative';
}
/** Whether shooting consumes the arrow item. */
export function bowConsumesArrow(bow: ItemStack | null | undefined, arrowItem: string, creative: boolean): boolean {
  if (creative) return false;
  return !(bowInfinity(bow) && arrowItem === 'arrow');
}

/** Lure: bite wait reduced by 5 s (100 ticks) per level. */
export function fishingLure(rod: ItemStack | null | undefined): number {
  return enchLevel(rod, 'lure');
}
export function fishingWaitTicks(rod: ItemStack | null | undefined, rand = Math.random): number {
  return Math.max(0, 100 + Math.floor(rand() * 500) - fishingLure(rod) * 100);
}
/** Luck of the Sea level plus the Luck/Unluck effect levels of the angler. */
export function fishingLuck(rod: ItemStack | null | undefined, angler?: any): number {
  let l = enchLevel(rod, 'luck_of_the_sea');
  if (angler?.effectLevel) l += angler.effectLevel('luck') - angler.effectLevel('unluck');
  return l;
}
/** Vanilla fishing loot category weights (fish 85 / junk 10 / treasure 5, adjusted by luck). */
export function fishingCategory(luck: number, rand = Math.random): 'fish' | 'junk' | 'treasure' {
  const junk = Math.max(0, 10 - 2 * luck), treasure = Math.max(0, 5 + 2 * luck), fish = Math.max(0, 85 - luck);
  const r = rand() * (junk + treasure + fish);
  return r < fish ? 'fish' : r < fish + junk ? 'junk' : 'treasure';
}

/** Depth Strider level of the boots (0..3). */
export function depthStrider(e: any): number {
  return Math.min(3, enchLevel(armorStacks(e)[0], 'depth_strider'));
}
export function frostWalker(e: any): number {
  return enchLevel(armorStacks(e)[0], 'frost_walker');
}
export function soulSpeed(e: any): number {
  return enchLevel(armorStacks(e)[0], 'soul_speed');
}
export function swiftSneak(e: any): number {
  return enchLevel(armorStacks(e)[1], 'swift_sneak');
}

// ------------------------------------------------------------------------------------ mending
/**
 * Mending: spend XP repairing a random damaged Mending item in the hands/armour (2 durability per
 * XP point, vanilla). Returns the XP left for the player.
 */
export function applyMending(p: any, xp: number, rand = Math.random): number {
  if (xp <= 0) return xp;
  const slots: number[] = [];
  const inv = p?.inventory;
  if (!inv) return xp;
  for (const i of [inv.selected, 40, ARMOR, ARMOR + 1, ARMOR + 2, ARMOR + 3]) {
    const s = inv.get(i) as ItemStack | null;
    if (s && s.damage > 0 && enchLevel(s, 'mending') > 0) slots.push(i);
  }
  if (!slots.length) return xp;
  const slot = slots[Math.floor(rand() * slots.length)];
  const s = inv.get(slot) as ItemStack;
  const repair = Math.min(xp * 2, s.damage);
  s.damage -= repair;
  inv.changed();
  const used = Math.ceil(repair / 2);
  const left = xp - used;
  return left > 0 ? applyMending(p, left, rand) : 0;
}

// ------------------------------------------------------------------------------------ install
let installed = false;
/** Install the hooks (idempotent). `game` gives access to events for Mending/Thorns. */
export function installEnchantmentEffects(game?: any) {
  if (installed) return;
  installed = true;
  ATTACK_HOOKS.push({
    bonusDamage: (player, target) => damageBonus(player.mainHand, target),
    knockbackLevel: (player) => enchLevel(player.mainHand, 'knockback'),
    fireAspect: (player) => enchLevel(player.mainHand, 'fire_aspect') * 4,
    sweepRatio: (player) => {
      const l = enchLevel(player.mainHand, 'sweeping_edge');
      return l > 0 ? 1 - 1 / (l + 1) : 0;
    },
    onHit: (player, target) => {
      const bane = enchLevel(player.mainHand, 'bane_of_arthropods');
      if (bane > 0 && mobTypeOf(target) === 'arthropod' && target instanceof LivingEntity) {
        target.addEffect('slowness', 20 + Math.floor(Math.random() * 10 * bane), 3);
      }
    },
  });
  DAMAGE_MODIFIERS.push((target, src, amount) => {
    const epf = Math.min(20, protectionEPF(armorStacks(target), src));
    return epf > 0 ? amount * (1 - epf / 25) : amount;
  });
  LivingEntity.hurtListeners.push((target, src, _amount) => {
    // Thorns: each armour piece with thorns has a 15%*level chance to hurt the attacker
    const attacker = src.attacker as LivingEntity | null | undefined;
    if (!attacker || attacker === target || src.type === 'thorns' || !(attacker instanceof LivingEntity)) return;
    if (src.type !== 'player' && src.type !== 'mob') return;
    const armor = armorStacks(target);
    armor.forEach((s, i) => {
      const lvl = enchLevel(s, 'thorns');
      if (lvl <= 0) return;
      if (Math.random() < 0.15 * lvl) {
        const dmg = lvl > 10 ? lvl - 10 : 1 + Math.floor(Math.random() * 4);
        const dir = new THREE.Vector3().subVectors(attacker.pos, target.pos).setY(0).normalize();
        attacker.hurt({ type: 'thorns', attacker: target, direct: target, dir, impulse: 0.3 }, dmg);
        if ((target as any).damageItem && (target as any).inventory) (target as any).damageItem(ARMOR + i, 2);
        game?.events?.emit('thorns', { entity: target, attacker, damage: dmg });
      }
    });
  });
  LivingEntity.deathListeners.push((e) => {
    // Curse of Vanishing: destroyed on death (before any death-drop system runs)
    const inv = (e as any).inventory;
    if (!inv?.slots) return;
    if ((e as any).game?.gamerules?.keepInventory) return;
    let changed = false;
    for (let i = 0; i < inv.size; i++) {
      const s = inv.get(i) as ItemStack | null;
      if (s && enchLevel(s, 'vanishing_curse') > 0) {
        inv.slots[i] = null;
        changed = true;
      }
    }
    if (changed) inv.changed();
  });
  game?.events?.on?.('xpPickup', (ev: any) => {
    if (!ev || ev.mendingApplied || typeof ev.amount !== 'number' || !ev.player) return;
    ev.mendingApplied = true;
    ev.amount = applyMending(ev.player, ev.amount);
  });
}
