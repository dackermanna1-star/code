/**
 * Special (code-defined) crafting recipes: tool repair, tipped arrows, leather armour dyeing,
 * firework rockets/stars, map and book cloning, suspicious stew.
 */
import { ITEM_BY_NAME, type ItemStack } from '../items/registry';
import { registerSpecialRecipe, type CraftingGrid, type CraftingRecipe } from './recipes';
import { itemHasTag } from './ingredients';
import { copyWithCount } from '../containers/stacks';
import { isCurse } from '../enchant/enchantments';

function stacksOf(g: CraftingGrid): { s: ItemStack; i: number }[] {
  const out: { s: ItemStack; i: number }[] = [];
  for (let y = 0; y < g.height; y++) for (let x = 0; x < g.width; x++) {
    const s = g.get(x, y);
    if (s) out.push({ s, i: y * g.width + x });
  }
  return out;
}
const item = (n: string) => ITEM_BY_NAME.get(n);

// --------------------------------------------------------------------------------- repair
const repair: CraftingRecipe = {
  id: 'repair_item',
  size: 2,
  matches(g) {
    const st = stacksOf(g);
    if (st.length !== 2) return false;
    const [a, b] = st.map((e) => e.s);
    return a.item === b.item && a.count === 1 && b.count === 1 && a.item.durability > 0 && a.item.maxStack === 1;
  },
  assemble(g) {
    const [a, b] = stacksOf(g).map((e) => e.s);
    const max = a.item.durability;
    const left = max - a.damage + (max - b.damage) + Math.floor((max * 5) / 100);
    const out: ItemStack = { item: a.item, count: 1, damage: Math.max(0, max - left) };
    // only curses survive (vanilla RepairItemRecipe)
    const ench: Record<string, number> = {};
    for (const s of [a, b]) for (const [k, v] of Object.entries(s.ench ?? {})) if (isCurse(k)) ench[k] = Math.max(ench[k] ?? 0, v);
    if (Object.keys(ench).length) out.ench = ench;
    return out;
  },
};

// --------------------------------------------------------------------------------- tipped arrows
const tippedArrow: CraftingRecipe = {
  id: 'tipped_arrow',
  size: 3,
  matches(g) {
    if (g.width !== 3 || g.height !== 3 || !item('tipped_arrow')) return false;
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) {
      const s = g.get(x, y);
      if (!s) return false;
      if (x === 1 && y === 1) { if (s.item.name !== 'lingering_potion') return false; }
      else if (s.item.name !== 'arrow') return false;
    }
    return true;
  },
  assemble(g) {
    const p = g.get(1, 1)!;
    const out: ItemStack = { item: item('tipped_arrow')!, count: 8, damage: 0, data: {} };
    if (p.data?.potion) out.data!.potion = p.data.potion;
    if (p.data?.effects) out.data!.effects = JSON.parse(JSON.stringify(p.data.effects));
    return out;
  },
};

// --------------------------------------------------------------------------------- leather dye
export const DYE_RGB: Record<string, number> = {
  white: 0xf9fffe, orange: 0xf9801d, magenta: 0xc74ebd, light_blue: 0x3ab3da, yellow: 0xfed83d, lime: 0x80c71f, pink: 0xf38baa, gray: 0x474f52,
  light_gray: 0x9d9d97, cyan: 0x169c9c, purple: 0x8932b8, blue: 0x3c44aa, brown: 0x835432, green: 0x5e7c16, red: 0xb02e26, black: 0x1d1d21,
};
/** Firework colours (DyeColor.fireworkColor). */
export const DYE_FIREWORK: Record<string, number> = {
  white: 0xf0f0f0, orange: 0xeb8844, magenta: 0xc354cd, light_blue: 0x6689d3, yellow: 0xdecf2a, lime: 0x41cd34, pink: 0xd88198, gray: 0x434343,
  light_gray: 0xababab, cyan: 0x287697, purple: 0x7b2fbe, blue: 0x253192, brown: 0x51301a, green: 0x3b511a, red: 0xb3312c, black: 0x1e1b1b,
};
const dyeColorOf = (name: string) => (name.endsWith('_dye') ? name.slice(0, -4) : null);
const isLeatherArmor = (n: string) => n.startsWith('leather_') && ['helmet', 'chestplate', 'leggings', 'boots', 'horse_armor'].some((p) => n.endsWith(p));

/** Vanilla DyeableLeatherItem.dyeArmor colour mixing. */
export function mixLeatherColor(base: number | undefined, dyes: string[]): number {
  let total = 0, n = 0;
  const acc = [0, 0, 0];
  const add = (c: number) => {
    const r = (c >> 16) & 255, gg = (c >> 8) & 255, b = c & 255;
    total += Math.max(r, gg, b);
    acc[0] += r; acc[1] += gg; acc[2] += b;
    n++;
  };
  if (base !== undefined) add(base);
  for (const d of dyes) add(DYE_RGB[d] ?? 0xffffff);
  let r = Math.floor(acc[0] / n), gg = Math.floor(acc[1] / n), b = Math.floor(acc[2] / n);
  const avgMax = total / n;
  const mx = Math.max(r, gg, b) || 1;
  r = Math.floor((r * avgMax) / mx);
  gg = Math.floor((gg * avgMax) / mx);
  b = Math.floor((b * avgMax) / mx);
  return (r << 16) | (gg << 8) | b;
}

const armorDye: CraftingRecipe = {
  id: 'armor_dye',
  matches(g) {
    let armor = 0, dyes = 0;
    for (const { s } of stacksOf(g)) {
      if (isLeatherArmor(s.item.name)) armor++;
      else if (dyeColorOf(s.item.name)) dyes++;
      else return false;
    }
    return armor === 1 && dyes > 0;
  },
  assemble(g) {
    let armor: ItemStack | null = null;
    const dyes: string[] = [];
    for (const { s } of stacksOf(g)) {
      if (isLeatherArmor(s.item.name)) armor = s;
      else dyes.push(dyeColorOf(s.item.name)!);
    }
    const out = copyWithCount(armor!, 1);
    out.data = { ...(out.data ?? {}), color: mixLeatherColor(armor!.data?.color, dyes) };
    return out;
  },
};

// --------------------------------------------------------------------------------- fireworks
const fireworkStar: CraftingRecipe = {
  id: 'firework_star',
  matches(g) {
    if (!item('firework_star')) return false;
    let gun = 0, dye = 0, shape = 0, trail = 0, twinkle = 0;
    for (const { s } of stacksOf(g)) {
      const n = s.item.name;
      if (n === 'gunpowder') gun++;
      else if (dyeColorOf(n)) dye++;
      else if (['fire_charge', 'gold_nugget', 'feather'].includes(n) || n.endsWith('_head') || n.endsWith('_skull')) shape++;
      else if (n === 'diamond') trail++;
      else if (n === 'glowstone_dust') twinkle++;
      else return false;
    }
    return gun === 1 && dye >= 1 && shape <= 1 && trail <= 1 && twinkle <= 1;
  },
  assemble(g) {
    const colors: number[] = [];
    let shape = 'small_ball', trail = false, twinkle = false;
    for (const { s } of stacksOf(g)) {
      const n = s.item.name;
      const d = dyeColorOf(n);
      if (d) colors.push(DYE_FIREWORK[d]);
      else if (n === 'fire_charge') shape = 'large_ball';
      else if (n === 'gold_nugget') shape = 'star';
      else if (n === 'feather') shape = 'burst';
      else if (n.endsWith('_head') || n.endsWith('_skull')) shape = 'creeper';
      else if (n === 'diamond') trail = true;
      else if (n === 'glowstone_dust') twinkle = true;
    }
    return { item: item('firework_star')!, count: 1, damage: 0, data: { explosion: { shape, colors, trail, twinkle } } };
  },
};
const fireworkRocket: CraftingRecipe = {
  id: 'firework_rocket',
  matches(g) {
    if (!item('firework_rocket')) return false;
    let paper = 0, gun = 0;
    for (const { s } of stacksOf(g)) {
      const n = s.item.name;
      if (n === 'paper') paper++;
      else if (n === 'gunpowder') gun++;
      else if (n !== 'firework_star') return false;
    }
    return paper === 1 && gun >= 1 && gun <= 3;
  },
  assemble(g) {
    let flight = 0;
    const explosions: any[] = [];
    for (const { s } of stacksOf(g)) {
      if (s.item.name === 'gunpowder') flight++;
      else if (s.item.name === 'firework_star' && s.data?.explosion) explosions.push(JSON.parse(JSON.stringify(s.data.explosion)));
    }
    const data: any = { flight };
    if (explosions.length) data.explosions = explosions;
    return { item: item('firework_rocket')!, count: 3, damage: 0, data };
  },
};

// --------------------------------------------------------------------------------- cloning
const mapCloning: CraftingRecipe = {
  id: 'map_cloning',
  matches(g) {
    let filled = 0, empty = 0;
    for (const { s } of stacksOf(g)) {
      if (s.item.name === 'filled_map') filled++;
      else if (s.item.name === 'map') empty++;
      else return false;
    }
    return filled === 1 && empty >= 1;
  },
  assemble(g) {
    const st = stacksOf(g).map((e) => e.s);
    const m = st.find((s) => s.item.name === 'filled_map')!;
    return copyWithCount(m, st.length);
  },
  remainders(g) {
    const out: (ItemStack | null)[] = new Array(g.width * g.height).fill(null);
    return out;
  },
};
const bookCloning: CraftingRecipe = {
  id: 'book_cloning',
  matches(g) {
    let written: ItemStack | null = null, blank = 0;
    for (const { s } of stacksOf(g)) {
      if (s.item.name === 'written_book') { if (written) return false; written = s; }
      else if (s.item.name === 'writable_book') blank++;
      else return false;
    }
    return !!written && blank >= 1 && (written.data?.generation ?? 0) < 2;
  },
  assemble(g) {
    const st = stacksOf(g).map((e) => e.s);
    const w = st.find((s) => s.item.name === 'written_book')!;
    const out = copyWithCount(w, st.length - 1);
    out.data = { ...(out.data ?? {}), generation: (w.data?.generation ?? 0) + 1 };
    return out;
  },
  remainders(g) {
    const out: (ItemStack | null)[] = [];
    for (let y = 0; y < g.height; y++) for (let x = 0; x < g.width; x++) {
      const s = g.get(x, y);
      out.push(s && s.item.name === 'written_book' ? copyWithCount(s, 1) : null);
    }
    return out;
  },
};

// --------------------------------------------------------------------------------- suspicious stew
const STEW_EFFECTS: Record<string, [string, number]> = {
  allium: ['fire_resistance', 80], azure_bluet: ['blindness', 160], blue_orchid: ['saturation', 7], dandelion: ['saturation', 7],
  cornflower: ['jump_boost', 120], lily_of_the_valley: ['poison', 240], oxeye_daisy: ['regeneration', 160], poppy: ['night_vision', 100],
  red_tulip: ['weakness', 180], orange_tulip: ['weakness', 180], white_tulip: ['weakness', 180], pink_tulip: ['weakness', 180],
  wither_rose: ['wither', 160], torchflower: ['night_vision', 100],
};
const suspiciousStew: CraftingRecipe = {
  id: 'suspicious_stew',
  matches(g) {
    if (!item('suspicious_stew')) return false;
    let bowl = 0, brown = 0, red = 0, flower = 0;
    for (const { s } of stacksOf(g)) {
      const n = s.item.name;
      if (n === 'bowl') bowl++;
      else if (n === 'brown_mushroom') brown++;
      else if (n === 'red_mushroom') red++;
      else if (itemHasTag(s.item, 'small_flowers')) flower++;
      else return false;
    }
    return bowl === 1 && brown === 1 && red === 1 && flower === 1;
  },
  assemble(g) {
    const f = stacksOf(g).find((e) => itemHasTag(e.s.item, 'small_flowers'))!.s.item.name;
    const [effect, duration] = STEW_EFFECTS[f] ?? ['saturation', 7];
    return { item: item('suspicious_stew')!, count: 1, damage: 0, data: { effects: [{ id: effect, duration, amplifier: 0 }] } };
  },
};

let installed = false;
export function installSpecialRecipes() {
  if (installed) return;
  installed = true;
  for (const r of [repair, tippedArrow, armorDye, fireworkStar, fireworkRocket, mapCloning, bookCloning, suspiciousStew]) registerSpecialRecipe(r);
}
