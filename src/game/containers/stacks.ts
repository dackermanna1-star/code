/**
 * ItemStack helpers shared by container menus, recipes, brewing and enchanting.
 * Stacks are mutable (like Minecraft's): menus grow/shrink them in place and then
 * notify the owning storage with `changed()`.
 */
import { cloneStack, tryItem, type ItemDef, type ItemStack } from '../items/registry';

export type Stack = ItemStack | null;

export function isEmpty(s: ItemStack | null | undefined): s is null | undefined {
  return !s || s.count <= 0;
}

export function copyStack(s: ItemStack): ItemStack {
  return cloneStack(s)!;
}

export function copyWithCount(s: ItemStack, count: number): ItemStack {
  const c = cloneStack(s)!;
  c.count = count;
  return c;
}

/** Removes up to `n` items from `s` (in place) and returns them as a new stack. */
export function splitStack(s: ItemStack, n: number): ItemStack {
  const k = Math.min(n, s.count);
  const out = copyWithCount(s, k);
  s.count -= k;
  return out;
}

function isEmptyObj(o: any) {
  if (o === undefined || o === null) return true;
  if (typeof o !== 'object') return false;
  for (const k in o) if (o[k] !== undefined) return false;
  return true;
}

/** Structural equality for plain JSON-like data; `undefined`, `null` and `{}` are equivalent. */
export function deepEqual(a: any, b: any): boolean {
  if (a === b) return true;
  const ea = isEmptyObj(a), eb = isEmptyObj(b);
  if (ea || eb) return ea && eb;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
    return true;
  }
  const ka = Object.keys(a).filter((k) => a[k] !== undefined);
  const kb = Object.keys(b).filter((k) => b[k] !== undefined);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (!deepEqual(a[k], b[k])) return false;
  return true;
}

/** Same item type (ignores count, damage and NBT-like data). */
export function sameItem(a: ItemStack | null | undefined, b: ItemStack | null | undefined): boolean {
  return !!a && !!b && a.item === b.item;
}

/** Minecraft's `isSameItemSameTags`: same item, damage, enchantments and data. */
export function sameItemSameTags(a: ItemStack | null | undefined, b: ItemStack | null | undefined): boolean {
  if (!a || !b) return !a && !b;
  return a.item === b.item && (a.damage ?? 0) === (b.damage ?? 0) && deepEqual(a.ench, b.ench) && deepEqual(a.data, b.data);
}

/** Stable key describing a stack's look (for cheap UI dirty checks). */
export function stackKey(s: ItemStack | null | undefined): string {
  if (!s || s.count <= 0) return '';
  let k = `${s.item.id}:${s.count}:${s.damage | 0}`;
  if (s.ench && !isEmptyObj(s.ench)) k += ':' + JSON.stringify(s.ench);
  if (s.data && !isEmptyObj(s.data)) k += ':' + JSON.stringify(s.data);
  return k;
}

/** Create a stack by item id if the item exists (lazy item resolution). */
export function makeStack(name: string, count = 1, extra?: { ench?: Record<string, number>; data?: Record<string, any>; damage?: number }): ItemStack | null {
  const it = tryItem(name);
  if (!it) return null;
  const s: ItemStack = { item: it, count, damage: extra?.damage ?? 0 };
  if (extra?.ench) s.ench = { ...extra.ench };
  if (extra?.data) s.data = JSON.parse(JSON.stringify(extra.data));
  return s;
}

export function isEnchanted(s: ItemStack | null | undefined): boolean {
  return !!s && !!s.ench && Object.keys(s.ench).some((k) => (s.ench as any)[k] > 0) && s.item.name !== 'enchanted_book';
}

/** Display name (custom name wins). */
export function displayName(s: ItemStack): string {
  const n = s.data?.name;
  return typeof n === 'string' && n.length ? n : s.item.displayName;
}

export function itemNamed(def: ItemDef | undefined, ...names: string[]): boolean {
  return !!def && names.includes(def.name);
}

const warned = new Set<string>();
/** Log a message once (missing items while resolving recipes etc.). */
export function warnOnce(key: string, msg: string) {
  if (warned.has(key)) return;
  warned.add(key);
  // eslint-disable-next-line no-console
  if (typeof console !== 'undefined') console.debug(msg);
}
