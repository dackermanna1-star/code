/**
 * Anvil logic (port of AnvilMenu.createResult): rename, repair with materials, combine
 * items/books with enchantment merging, prior-work penalty and XP level costs.
 * Prior work is stored in `stack.data.repairCost`, custom names in `stack.data.name`.
 */
import type { ItemDef, ItemStack } from '../items/registry';
import { itemHasTag } from '../crafting/ingredients';
import { copyStack, displayName } from '../containers/stacks';
import { canEnchantItem, compatible, enchantmentDef } from './enchantments';

export interface AnvilResult {
  result: ItemStack | null;
  /** Level cost (shown in the UI). */
  cost: number;
  /** Materials consumed from the right slot when repairing with materials. */
  repairItemCount: number;
  /** Cost >= 40 in survival: "Too Expensive!" */
  tooExpensive: boolean;
}

const RARITY_COST: Record<number, number> = { 10: 1, 5: 2, 2: 4, 1: 8 };

/** Material that repairs an item on the anvil (ItemDef.isValidRepairItem). */
export function isRepairMaterial(tool: ItemDef, mat: ItemDef): boolean {
  const n = tool.name, m = mat.name;
  if (n.startsWith('wooden_') || n === 'shield') return itemHasTag(mat, 'planks');
  if (n.startsWith('stone_')) return itemHasTag(mat, 'stone_tool_materials');
  if (n.startsWith('iron_') || n.startsWith('chainmail_')) return m === 'iron_ingot';
  if (n.startsWith('golden_')) return m === 'gold_ingot';
  if (n.startsWith('diamond_')) return m === 'diamond';
  if (n.startsWith('netherite_')) return m === 'netherite_ingot';
  if (n.startsWith('leather_')) return m === 'leather';
  if (n === 'turtle_helmet') return m === 'turtle_scute' || m === 'scute';
  if (n === 'elytra') return m === 'phantom_membrane';
  return false;
}

export function repairCostOf(s: ItemStack | null | undefined): number {
  return (s?.data?.repairCost as number | undefined) ?? 0;
}

const isDamageable = (s: ItemStack) => s.item.durability > 0;
const isEnchBook = (s: ItemStack | null) => !!s && s.item.name === 'enchanted_book' && !!s.ench && Object.keys(s.ench).length > 0;

/**
 * Compute the anvil output. `name` is the rename text field ('' / undefined = no rename).
 */
export function anvilResult(left: ItemStack | null, right: ItemStack | null, name: string | undefined, creative: boolean): AnvilResult {
  const none: AnvilResult = { result: null, cost: 0, repairItemCount: 0, tooExpensive: false };
  if (!left) return none;
  let out = copyStack(left);
  const ench: Record<string, number> = { ...(left.ench ?? {}) };
  let cost = 0;
  const base = repairCostOf(left) + (right ? repairCostOf(right) : 0);
  let renameCost = 0;
  let repairItemCount = 0;
  if (right) {
    const book = isEnchBook(right);
    if (isDamageable(out) && isRepairMaterial(out.item, right.item)) {
      let d = Math.min(out.damage, Math.floor(out.item.durability / 4));
      if (d <= 0) return none;
      let i = 0;
      for (; d > 0 && i < right.count; i++) {
        out.damage -= d;
        cost++;
        d = Math.min(out.damage, Math.floor(out.item.durability / 4));
      }
      repairItemCount = i;
    } else {
      if (!book && (out.item !== right.item || !isDamageable(out))) return none;
      if (isDamageable(out) && !book) {
        const l = left.item.durability - left.damage;
        const r = right.item.durability - right.damage;
        const sum = l + r + Math.floor((out.item.durability * 12) / 100);
        let newDmg = out.item.durability - sum;
        if (newDmg < 0) newDmg = 0;
        if (newDmg < out.damage) {
          out.damage = newDmg;
          cost += 2;
        }
      }
      let anyOk = false, anyBad = false;
      for (const [id, lvlR] of Object.entries(right.ench ?? {})) {
        const def = enchantmentDef(id);
        if (!def) continue;
        const cur = ench[def.id] ?? 0;
        let lvl = cur === lvlR ? lvlR + 1 : Math.max(lvlR, cur);
        let ok = canEnchantItem(def, left.item);
        if (creative || left.item.name === 'enchanted_book') ok = true;
        for (const other of Object.keys(ench)) {
          if (other !== def.id && !compatible(def.id, other)) {
            ok = false;
            cost++;
          }
        }
        if (!ok) anyBad = true;
        else {
          anyOk = true;
          if (lvl > def.maxLevel) lvl = def.maxLevel;
          ench[def.id] = lvl;
          let k = RARITY_COST[def.weight] ?? 1;
          if (book) k = Math.max(1, Math.floor(k / 2));
          cost += k * lvl;
          if (left.count > 1) cost = 40;
        }
      }
      if (anyBad && !anyOk) return none;
    }
  }
  const currentName = displayName(left);
  const hasCustom = typeof left.data?.name === 'string' && left.data.name.length > 0;
  if (name !== undefined && name.trim().length > 0) {
    if (name !== currentName) {
      renameCost = 1;
      cost += 1;
      out.data = { ...(out.data ?? {}), name };
    }
  } else if (hasCustom && name !== undefined) {
    renameCost = 1;
    cost += 1;
    const d = { ...(out.data ?? {}) };
    delete d.name;
    out.data = Object.keys(d).length ? d : undefined;
  }
  let total = base + cost;
  let result: ItemStack | null = out;
  if (cost <= 0) result = null;
  if (renameCost === cost && renameCost > 0 && total >= 40) total = 39;
  const tooExpensive = total >= 40 && !creative;
  if (tooExpensive) result = null;
  if (result) {
    let rc = repairCostOf(result);
    if (right && rc < repairCostOf(right)) rc = repairCostOf(right);
    if (renameCost !== cost || renameCost === 0) rc = rc * 2 + 1;
    result.data = { ...(result.data ?? {}), repairCost: rc };
    result.ench = Object.keys(ench).length ? ench : undefined;
    if (!result.ench) delete result.ench;
  }
  return { result, cost: result || tooExpensive ? total : 0, repairItemCount, tooExpensive };
}

/** 12% chance per use (survival) to damage the anvil: meta bits 2-3 = 0 anvil, 1 chipped, 2 damaged. */
export function anvilDamageRoll(meta: number, rand = Math.random): { meta: number; destroyed: boolean } | null {
  if (rand() >= 0.12) return null;
  const dmg = (meta >> 2) & 3;
  if (dmg >= 2) return { meta, destroyed: true };
  return { meta: (meta & 3) | ((dmg + 1) << 2), destroyed: false };
}
