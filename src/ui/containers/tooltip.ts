/**
 * Item tooltips (vanilla order): name (rarity colour, italic when renamed), potion effects,
 * enchantments (grey, curses red, roman numerals), dyed colour, lore, attribute modifiers,
 * durability.
 */
import type { ItemStack } from '../../game/items/registry';
import { enchantmentLabel, isCurse, enchantmentDef } from '../../game/enchant/enchantments';
import { effectTooltipLines, potionDisplayName, potionType } from '../../game/brewing/potions';
import { armorSlotOf } from '../../game/enchant/enchantments';

export interface TooltipLine {
  text: string;
  color: string;
  italic?: boolean;
  /** Extra vertical gap above the line. */
  gap?: boolean;
}

const RARITY_COLOR: Record<string, string> = { common: '#ffffff', uncommon: '#ffff55', rare: '#55ffff', epic: '#ff55ff' };
const POTION_ITEMS = new Set(['potion', 'splash_potion', 'lingering_potion', 'tipped_arrow']);

/** Display name of a stack including potion naming. */
export function stackName(s: ItemStack): string {
  const custom = s.data?.name;
  if (typeof custom === 'string' && custom) return custom;
  if (POTION_ITEMS.has(s.item.name)) return potionDisplayName(s.item.name, s.data?.potion);
  return s.item.displayName;
}

export function stackRarity(s: ItemStack): string {
  let r = s.item.rarity ?? 'common';
  const enchanted = !!s.ench && Object.keys(s.ench).length > 0;
  if (enchanted) r = r === 'common' || r === 'uncommon' ? 'rare' : r === 'rare' ? 'epic' : r;
  return r;
}

function fmt(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, '');
}

export function tooltipLines(s: ItemStack, opts: { advanced?: boolean } = {}): TooltipLine[] {
  const lines: TooltipLine[] = [];
  const renamed = typeof s.data?.name === 'string' && s.data.name.length > 0;
  lines.push({ text: stackName(s), color: RARITY_COLOR[stackRarity(s)] ?? '#fff', italic: renamed });
  if (POTION_ITEMS.has(s.item.name)) {
    for (const [t, c] of effectTooltipLines(s)) lines.push({ text: t, color: c });
    const pt = potionType(s.data?.potion);
    if (pt?.effects.some((e) => e.id === 'strength' || e.id === 'weakness')) {
      lines.push({ text: 'When Applied:', color: '#aa00aa', gap: true });
      for (const e of pt.effects) {
        if (e.id === 'strength') lines.push({ text: `+${3 * (e.amplifier + 1)} Attack Damage`, color: '#5555ff' });
        if (e.id === 'weakness') lines.push({ text: `-${4 * (e.amplifier + 1)} Attack Damage`, color: '#ff5555' });
      }
    }
  } else if (s.data?.effects && s.item.name === 'suspicious_stew') {
    /* hidden in vanilla */
  }
  if (s.ench) {
    const ids = Object.keys(s.ench).filter((k) => s.ench![k] > 0);
    ids.sort((a, b) => (enchantmentDef(a) ? 0 : 1) - (enchantmentDef(b) ? 0 : 1));
    for (const id of ids) lines.push({ text: enchantmentLabel(id, s.ench[id]), color: isCurse(id) ? '#ff5555' : '#aaaaaa' });
  }
  if (typeof s.data?.color === 'number' && !POTION_ITEMS.has(s.item.name)) lines.push({ text: 'Dyed', color: '#aaaaaa', italic: true });
  if (s.data?.explosion) {
    const ex = s.data.explosion;
    lines.push({ text: ({ small_ball: 'Small Ball', large_ball: 'Large Ball', star: 'Star-shaped', creeper: 'Creeper-shaped', burst: 'Burst' } as any)[ex.shape] ?? 'Unknown Shape', color: '#aaaaaa' });
    if (ex.trail) lines.push({ text: 'Trail', color: '#aaaaaa' });
    if (ex.twinkle) lines.push({ text: 'Twinkle', color: '#aaaaaa' });
  }
  if (typeof s.data?.flight === 'number') lines.push({ text: `Flight Duration: ${s.data.flight}`, color: '#aaaaaa' });
  const lore = s.data?.lore;
  if (Array.isArray(lore)) for (const l of lore) lines.push({ text: String(l), color: '#aa00aa', italic: true });
  else if (typeof lore === 'string') lines.push({ text: lore, color: '#aa00aa', italic: true });
  // attribute modifiers
  const it = s.item;
  if (it.tool || it.attackDamage > 0) {
    lines.push({ text: 'When in Main Hand:', color: '#aaaaaa', gap: true });
    lines.push({ text: ` ${fmt(1 + it.attackDamage)} Attack Damage`, color: '#00aa00' });
    lines.push({ text: ` ${fmt(it.attackSpeed)} Attack Speed`, color: '#00aa00' });
  } else if (it.armor) {
    const slot = armorSlotOf(it) ?? it.armor.slot;
    lines.push({ text: `When on ${{ head: 'Head', chest: 'Body', legs: 'Legs', feet: 'Feet' }[slot]}:`, color: '#aaaaaa', gap: true });
    lines.push({ text: `+${it.armor.defense} Armor`, color: '#5555ff' });
    if (it.armor.toughness) lines.push({ text: `+${it.armor.toughness} Armor Toughness`, color: '#5555ff' });
    if (it.armor.knockbackResistance) lines.push({ text: `+${Math.round(it.armor.knockbackResistance * 10)} Knockback Resistance`, color: '#5555ff' });
  }
  if (it.durability > 0 && (s.damage > 0 || opts.advanced)) lines.push({ text: `Durability: ${it.durability - s.damage} / ${it.durability}`, color: '#ffffff', gap: !opts.advanced });
  if (opts.advanced) lines.push({ text: `minecraft:${it.name}`, color: '#555555' });
  return lines;
}
