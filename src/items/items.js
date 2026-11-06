// ITEM DATABASE  (STUB — to be replaced by the full database; keep the exported API stable)
//
// Item stack (instance) shape — a plain JSON-serialisable object:
//   { id, count, dur?, ammo?, ammoType?, uses?, age?, contents?, data?, mode? }
//   dur      current durability (weapons/tools/clothing), max = def.durability
//   ammo     rounds currently loaded (firearms)
//   ammoType ammo item id currently loaded (e.g. 'ammo_12g_slug')
//   uses     remaining uses/portions (water bottle sips, pills, battery charge 0..100, lighter fuel)
//   age      game-hour timestamp when created (spoilage). freshness via itemFreshness()
//   contents Array<stack|null> for items with def.capacity (clothing pockets, backpacks)
//   data     misc: {noteId, liquid:'water'|'dirty_water'|'gasoline'|null, ...}
//   mode     firearm fire mode ('semi'|'auto')

export const ITEMS = {
  fists: { id: 'fists', name: 'Fists', category: 'weapon', weight: 0, stack: 1, icon: { shape: 'fist' }, melee: { damage: 8, speed: 2.2, range: 2.2, knockback: 0.6, stamina: 4, type: 'blunt', noise: 3 } },
  plank: { id: 'plank', name: 'Wooden Plank', category: 'material', weight: 1.0, stack: 10, icon: { shape: 'plank' } },
  canned_beans: { id: 'canned_beans', name: 'Canned Beans', category: 'food', weight: 0.45, stack: 4, icon: { shape: 'can', color: '#b5562a' }, food: { hunger: 30, thirst: -4, needsOpener: true } },
  water_bottle: { id: 'water_bottle', name: 'Water Bottle', category: 'drink', weight: 0.6, stack: 1, uses: 4, icon: { shape: 'bottle', color: '#7fb8e6' }, drink: { thirst: 12 } },
  jeans: { id: 'jeans', name: 'Jeans', category: 'clothing', weight: 0.8, stack: 1, durability: 100, capacity: 4, icon: { shape: 'pants', color: '#3b5a8a' }, clothing: { slot: 'legs', insulation: 0.15, water: 0.1, bite: 0.1, scratch: 0.3 } },
  backpack_school: { id: 'backpack_school', name: 'School Backpack', category: 'backpack', weight: 0.6, stack: 1, durability: 100, capacity: 12, icon: { shape: 'backpack', color: '#a33' }, clothing: { slot: 'back', insulation: 0.05, water: 0.2 } },
};

const UNKNOWN = { id: 'unknown', name: 'Unknown Item', category: 'misc', weight: 0.1, stack: 1, icon: { shape: 'box', color: '#f0f' } };

export function getItemDef(id) {
  return ITEMS[id] || UNKNOWN;
}

/** Create a new stack. opts: {count, dur (0..1 condition fraction), ammo, uses, age, data} */
export function createItem(id, opts = {}) {
  const def = getItemDef(id);
  const s = { id, count: Math.min(opts.count ?? 1, def.stack || 1) };
  if (def.durability) s.dur = Math.max(1, Math.round(def.durability * (opts.dur ?? 1)));
  if (def.firearm) { s.ammo = opts.ammo ?? 0; s.mode = def.firearm.modes ? def.firearm.modes[0] : 'semi'; }
  if (def.uses) s.uses = opts.uses ?? def.uses;
  if (def.food?.spoils) s.age = opts.age ?? 0;
  if (def.capacity) s.contents = new Array(def.capacity).fill(null);
  if (opts.data || def.data) s.data = { ...(def.data || {}), ...(opts.data || {}) };
  return s;
}

/** Total weight of a stack including container contents (kg). */
export function itemWeight(stack) {
  if (!stack) return 0;
  const def = getItemDef(stack.id);
  let w = (def.weight || 0) * (stack.count || 1);
  if (stack.contents) for (const c of stack.contents) w += itemWeight(c);
  return w;
}

export function canStack(a, b) {
  if (!a || !b || a.id !== b.id) return false;
  const def = getItemDef(a.id);
  if ((def.stack || 1) <= 1) return false;
  if (a.contents || b.contents) return false;
  if ((a.uses ?? null) !== (b.uses ?? null)) return false;
  if (a.data || b.data) return JSON.stringify(a.data) === JSON.stringify(b.data);
  return true;
}

export function itemDisplayName(stack) {
  return getItemDef(stack.id).name;
}

/** 0..1 freshness (1 fresh, 0 rotten) given current game hour. Non-perishables return 1. */
export function itemFreshness(stack, nowHours) {
  const def = getItemDef(stack.id);
  if (!def.food?.spoils) return 1;
  return Math.max(0, 1 - (nowHours - (stack.age || 0)) / def.food.spoils);
}
