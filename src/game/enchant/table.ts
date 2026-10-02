/**
 * Enchanting table: bookshelf power (5x5 ring at y and y+1 with an air gap), the three
 * offers (level requirements 1/2/3 lapis), clue preview and performing an enchantment.
 * Seeded per player (`player.xpSeed`), reseeded after each enchant like vanilla.
 */
import type { ItemDef, ItemStack } from '../items/registry';
import { ITEM_BY_NAME } from '../items/registry';
import { BLOCKS } from '../../world/blocks/registry';
import { JavaRandom, enchantmentCost, selectEnchantments, isBook, type EnchInstance } from './enchantments';

export interface BlockReader {
  getBlock(x: number, y: number, z: number): number;
}

/** BOOKSHELF_OFFSETS: x,z in -2..2 on the ring (|x|==2 or |z|==2), y 0..1. */
export const BOOKSHELF_OFFSETS: [number, number, number][] = [];
for (let y = 0; y <= 1; y++)
  for (let x = -2; x <= 2; x++)
    for (let z = -2; z <= 2; z++) if (Math.abs(x) === 2 || Math.abs(z) === 2) BOOKSHELF_OFFSETS.push([x, y, z]);

function isPowerProvider(state: number) {
  const n = BLOCKS[state >>> 4]?.name;
  return n === 'bookshelf';
}
function isTransmitter(state: number) {
  if (!state) return true;
  const d = BLOCKS[state >>> 4];
  return !!d && (d.isAir || d.replaceable);
}

/** Number of valid bookshelves around an enchanting table (vanilla, uncapped; cost formula caps at 15). */
export function countBookshelves(w: BlockReader, x: number, y: number, z: number): number {
  let n = 0;
  for (const [dx, dy, dz] of BOOKSHELF_OFFSETS) {
    if (!isPowerProvider(w.getBlock(x + dx, y + dy, z + dz))) continue;
    if (!isTransmitter(w.getBlock(x + Math.trunc(dx / 2), y + dy, z + Math.trunc(dz / 2)))) continue;
    n++;
  }
  return n;
}

export interface EnchantOffers {
  costs: [number, number, number];
  clues: [EnchInstance | null, EnchInstance | null, EnchInstance | null];
}

/** EnchantmentMenu.slotsChanged */
export function computeOffers(item: ItemDef, bookshelves: number, seed: number): EnchantOffers {
  const rand = new JavaRandom(seed);
  const costs: [number, number, number] = [0, 0, 0];
  const clues: EnchantOffers['clues'] = [null, null, null];
  for (let k = 0; k < 3; k++) {
    costs[k] = enchantmentCost(rand, k, bookshelves, item);
    if (costs[k] < k + 1) costs[k] = 0;
  }
  for (let l = 0; l < 3; l++) {
    if (costs[l] > 0) {
      // vanilla reseeds the same Random inside getEnchantmentList and keeps using it for the clue
      const list = enchantmentList(item, l, costs[l], seed, rand);
      if (list.length) clues[l] = list[rand.nextInt(list.length)];
    }
  }
  return { costs, clues };
}

/** EnchantmentMenu.getEnchantmentList */
export function enchantmentList(item: ItemDef, slot: number, cost: number, seed: number, r = new JavaRandom(0)): EnchInstance[] {
  r.setSeed(seed + slot);
  const list = selectEnchantments(r, item, cost, false);
  if (isBook(item) && list.length > 1) list.splice(r.nextInt(list.length), 1);
  return list;
}

/** Apply the enchantments of offer `slot`; books become enchanted books. Returns the new stack or null. */
export function performEnchant(stack: ItemStack, slot: number, cost: number, seed: number): ItemStack | null {
  const list = enchantmentList(stack.item, slot, cost, seed);
  if (!list.length) return null;
  let out: ItemStack = { item: stack.item, count: stack.count, damage: stack.damage, ench: { ...(stack.ench ?? {}) }, data: stack.data ? JSON.parse(JSON.stringify(stack.data)) : undefined };
  if (isBook(stack.item)) {
    const eb = ITEM_BY_NAME.get('enchanted_book');
    if (!eb) return null;
    out = { item: eb, count: 1, damage: 0, ench: {}, data: out.data };
  }
  for (const e of list) out.ench![e.id] = e.level;
  if (!out.data) delete out.data;
  return out;
}

const WORDS = 'the elder scrolls klaatu berata niktu xyzzy bless curse light darkness fire air earth water hot dry cold wet ignite snuff embiggen twist shorten stretch fiddle destroy imbue galvanize enchant free limited range of towards inside sphere cube self other ball mental physical grow shrink demon elemental spirit animal creature beast humanoid undead fresh stale phnglui mglwnafh cthulhu rlyeh wgahnagl fhtagnbaguette'.split(' ');
/** Standard Galactic Alphabet glyphs used for the decorative spell text. */
const SGA: Record<string, string> = {
  a: 'ᔑ', b: 'ʖ', c: 'ᓵ', d: '↸', e: 'ᒷ', f: '⎓', g: '⊣', h: '⍑', i: '╎', j: '⋮', k: 'ꖌ', l: 'ꖎ', m: 'ᒲ', n: 'リ', o: '𝙹', p: '!¡', q: 'ᑑ', r: '∷', s: 'ᓭ', t: 'ℸ', u: '⚍', v: '⍊', w: '∴', x: '/', y: '||', z: '⨅',
};
/** Random enchanting-table words (EnchantmentNames.getRandomName) rendered in SGA glyphs. */
export function randomSpell(rand: () => number = Math.random): { latin: string; glyphs: string } {
  const n = rand() * 2 + 3;
  const words: string[] = [];
  for (let i = 0; i < n; i++) words.push(WORDS[Math.floor(rand() * WORDS.length)]);
  const latin = words.join(' ');
  return { latin, glyphs: latin.split('').map((c) => SGA[c] ?? c).join('') };
}
