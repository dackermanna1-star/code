/**
 * Crafting recipes: shaped (with mirroring), shapeless and special (code) recipes.
 *
 * Recipes are declared as data with Minecraft item ids (see vanillaRecipes.ts) and compiled
 * lazily against the item registry. Recipes whose result or ingredients do not exist (yet)
 * are skipped (logged once); compilation is redone when more items get registered, so recipes
 * light up automatically once the item workstream's items exist.
 *
 * Public API: `registerRecipe(def)`, `registerSpecialRecipe(r)`, `findCraftingRecipe(grid)`,
 * `craftingResult(grid)`, `allCraftingRecipes()`.
 */
import { ITEMS, ITEM_BY_NAME, type ItemDef, type ItemStack } from '../items/registry';
import { resolveIngredient, type Ingredient } from './ingredients';
import { warnOnce } from '../containers/stacks';

export interface RecipeResultDef {
  result: string;
  count?: number;
  data?: Record<string, any>;
}
export interface ShapedDef extends RecipeResultDef {
  type: 'shaped';
  pattern: string[];
  key: Record<string, Ingredient>;
  id?: string;
  group?: string;
}
export interface ShapelessDef extends RecipeResultDef {
  type: 'shapeless';
  ingredients: Ingredient[];
  id?: string;
  group?: string;
}
export type RecipeDef = ShapedDef | ShapelessDef;

/** A crafting grid view (2x2 inventory grid or 3x3 table). */
export interface CraftingGrid {
  readonly width: number;
  readonly height: number;
  get(x: number, y: number): ItemStack | null;
}

export interface CraftingRecipe {
  readonly id: string;
  /** For the recipe book / search. */
  readonly resultItem?: ItemDef;
  /** Minimum grid size (2 = fits the inventory grid). */
  readonly size?: number;
  matches(grid: CraftingGrid): boolean;
  assemble(grid: CraftingGrid): ItemStack | null;
  /** Items left in the grid after crafting (buckets, bottles), indexed y*width+x. */
  remainders?(grid: CraftingGrid): (ItemStack | null)[];
}

const DEFS: RecipeDef[] = [];
const SPECIAL: CraftingRecipe[] = [];

export function registerRecipe(def: RecipeDef) {
  DEFS.push(def);
  compiledAt = -1;
}
export function registerRecipes(defs: RecipeDef[]) {
  for (const d of defs) DEFS.push(d);
  compiledAt = -1;
}
export function registerSpecialRecipe(r: CraftingRecipe) {
  SPECIAL.push(r);
}
export function recipeDefs(): readonly RecipeDef[] {
  return DEFS;
}

// ------------------------------------------------------------------------------------ compile
type Cell = Set<ItemDef> | null;

class ShapedRecipe implements CraftingRecipe {
  constructor(readonly id: string, readonly w: number, readonly h: number, readonly cells: Cell[], readonly resultItem: ItemDef, readonly count: number, readonly data?: Record<string, any>) {}
  get size() {
    return Math.max(this.w, this.h);
  }
  matches(grid: CraftingGrid): boolean {
    for (let ox = 0; ox <= grid.width - this.w; ox++)
      for (let oy = 0; oy <= grid.height - this.h; oy++) {
        if (this.matchAt(grid, ox, oy, false) || this.matchAt(grid, ox, oy, true)) return true;
      }
    return false;
  }
  private matchAt(grid: CraftingGrid, ox: number, oy: number, mirror: boolean): boolean {
    for (let y = 0; y < grid.height; y++)
      for (let x = 0; x < grid.width; x++) {
        const rx = x - ox, ry = y - oy;
        let cell: Cell = null;
        if (rx >= 0 && ry >= 0 && rx < this.w && ry < this.h) cell = this.cells[ry * this.w + (mirror ? this.w - 1 - rx : rx)];
        const s = grid.get(x, y);
        if (!cell) {
          if (s) return false;
        } else if (!s || !cell.has(s.item)) return false;
      }
    return true;
  }
  assemble(): ItemStack {
    const s: ItemStack = { item: this.resultItem, count: this.count, damage: 0 };
    if (this.data) s.data = JSON.parse(JSON.stringify(this.data));
    return s;
  }
}

class ShapelessRecipe implements CraftingRecipe {
  constructor(readonly id: string, readonly ings: Set<ItemDef>[], readonly resultItem: ItemDef, readonly count: number, readonly data?: Record<string, any>) {}
  get size() {
    return this.ings.length <= 4 ? 2 : 3;
  }
  matches(grid: CraftingGrid): boolean {
    const items: ItemDef[] = [];
    for (let y = 0; y < grid.height; y++)
      for (let x = 0; x < grid.width; x++) {
        const s = grid.get(x, y);
        if (s) items.push(s.item);
      }
    if (items.length !== this.ings.length) return false;
    // bipartite matching (backtracking, n <= 9)
    const used = new Array(this.ings.length).fill(false);
    const assign = (i: number): boolean => {
      if (i === items.length) return true;
      for (let j = 0; j < this.ings.length; j++) {
        if (used[j] || !this.ings[j].has(items[i])) continue;
        used[j] = true;
        if (assign(i + 1)) return true;
        used[j] = false;
      }
      return false;
    };
    return assign(0);
  }
  assemble(): ItemStack {
    const s: ItemStack = { item: this.resultItem, count: this.count, damage: 0 };
    if (this.data) s.data = JSON.parse(JSON.stringify(this.data));
    return s;
  }
}

let compiled: CraftingRecipe[] = [];
let compiledAt = -1;
let compiledDefs = -1;

function shrinkPattern(p: string[]): string[] {
  let rows = p.map((r) => r);
  const width = Math.max(...rows.map((r) => r.length));
  rows = rows.map((r) => r.padEnd(width, ' '));
  while (rows.length && rows[0].trim() === '') rows.shift();
  while (rows.length && rows[rows.length - 1].trim() === '') rows.pop();
  if (!rows.length) return rows;
  let left = 0, right = width - 1;
  while (left < width && rows.every((r) => r[left] === ' ')) left++;
  while (right > left && rows.every((r) => r[right] === ' ')) right--;
  return rows.map((r) => r.slice(left, right + 1));
}

function compileDef(def: RecipeDef, idx: number): CraftingRecipe | null {
  const id = def.id ?? `${def.result}#${idx}`;
  const res = ITEM_BY_NAME.get(def.result);
  if (!res) {
    warnOnce('res:' + def.result, `[recipes] skipping recipe for missing item '${def.result}'`);
    return null;
  }
  if (def.type === 'shaped') {
    const pat = shrinkPattern(def.pattern);
    const h = pat.length, w = h ? pat[0].length : 0;
    const cells: Cell[] = [];
    for (const row of pat)
      for (const ch of row) {
        if (ch === ' ') cells.push(null);
        else {
          const ing = def.key[ch];
          if (ing === undefined) throw new Error(`recipe ${id}: missing key '${ch}'`);
          const set = resolveIngredient(ing);
          if (!set.size) {
            warnOnce('ing:' + JSON.stringify(ing), `[recipes] skipping recipe '${id}': ingredient ${JSON.stringify(ing)} unresolved`);
            return null;
          }
          cells.push(set);
        }
      }
    return new ShapedRecipe(id, w, h, cells, res, def.count ?? 1, def.data);
  }
  const ings: Set<ItemDef>[] = [];
  for (const ing of def.ingredients) {
    const set = resolveIngredient(ing);
    if (!set.size) {
      warnOnce('ing:' + JSON.stringify(ing), `[recipes] skipping recipe '${id}': ingredient ${JSON.stringify(ing)} unresolved`);
      return null;
    }
    ings.push(set);
  }
  return new ShapelessRecipe(id, ings, res, def.count ?? 1, def.data);
}

/** All compiled recipes (compiled lazily; recompiled when the item registry grows). */
export function allCraftingRecipes(): CraftingRecipe[] {
  if (compiledAt !== ITEMS.length || compiledDefs !== DEFS.length) {
    compiledAt = ITEMS.length;
    compiledDefs = DEFS.length;
    compiled = [];
    DEFS.forEach((d, i) => {
      const r = compileDef(d, i);
      if (r) compiled.push(r);
    });
  }
  return compiled;
}

/** Default remainders: buckets and bottles return their container. */
const REMAINDER: Record<string, string> = {
  milk_bucket: 'bucket', water_bucket: 'bucket', lava_bucket: 'bucket', powder_snow_bucket: 'bucket',
  honey_bottle: 'glass_bottle', dragon_breath: 'glass_bottle',
};
export function craftingRemainder(it: ItemDef): ItemDef | null {
  const r = REMAINDER[it.name];
  return r ? ITEM_BY_NAME.get(r) ?? null : null;
}
export function defaultRemainders(grid: CraftingGrid): (ItemStack | null)[] {
  const out: (ItemStack | null)[] = [];
  for (let y = 0; y < grid.height; y++)
    for (let x = 0; x < grid.width; x++) {
      const s = grid.get(x, y);
      const r = s ? craftingRemainder(s.item) : null;
      out.push(r ? { item: r, count: 1, damage: 0 } : null);
    }
  return out;
}

export interface CraftMatch {
  recipe: CraftingRecipe;
  result: ItemStack;
}

/** Find the recipe matching a grid (special recipes first, like vanilla's dynamic ones). */
export function findCraftingRecipe(grid: CraftingGrid): CraftMatch | null {
  let any = false;
  for (let y = 0; y < grid.height && !any; y++) for (let x = 0; x < grid.width; x++) if (grid.get(x, y)) { any = true; break; }
  if (!any) return null;
  for (const r of allCraftingRecipes()) {
    if (r.matches(grid)) {
      const result = r.assemble(grid);
      if (result && result.count > 0) return { recipe: r, result };
    }
  }
  for (const r of SPECIAL) {
    if (r.matches(grid)) {
      const result = r.assemble(grid);
      if (result && result.count > 0) return { recipe: r, result };
    }
  }
  return null;
}

export function craftingResult(grid: CraftingGrid): ItemStack | null {
  return findCraftingRecipe(grid)?.result ?? null;
}

/** Grid helper over a flat array of stacks (tests, hoppers into crafters ...). */
export function gridOf(stacks: (ItemStack | null)[], width: number, height = width): CraftingGrid {
  return { width, height, get: (x, y) => stacks[y * width + x] ?? null };
}
