// Validates the item layer.  node dev/items-validate.mjs
// - every required id / canonical loot table from docs/ARCHITECTURE.md exists
// - every referenced item id exists (loot, recipes, blocks.js drops, professions, cookTo/leaves, ammo, fits...)
// - every def has valid fields; createItem / itemWeight / icons work for all; loot & recipes are well formed
import { readFileSync } from 'node:fs';
import * as items from '../src/items/items.js';
import { renderIconPixels } from '../src/items/icons.js';
import { TEMPLATES, DECALS } from '../src/items/iconArt.js';
import { LOOT_TABLES, LOOT_GROUPS, generateLoot, lootItemIds, lootGroupRefs } from '../src/items/loot.js';
import { RECIPES, RECIPE_CATEGORIES, recipeItemIds, recipeTags, getRecipeStatus } from '../src/items/crafting.js';
import { BLOCKS } from '../src/world/blocks.js';
import { PROFESSIONS, SKILL_IDS } from '../src/player/professions.js';
import { EQUIP_SLOTS, PlayerInventory } from '../src/inventory/Inventory.js';
import { makeRng } from '../src/core/rng.js';

const { ITEMS, ITEM_TAGS, ITEM_CATEGORIES, LIQUIDS, createItem, itemWeight, canStack, itemDisplayName, itemFreshness, getItemDef } = items;
const errors = [];
const warns = [];
const err = (m) => errors.push(m);
const warn = (m) => warns.push(m);

// ---------------------------------------------------------------- ARCHITECTURE.md
const arch = readFileSync(new URL('../docs/ARCHITECTURE.md', import.meta.url), 'utf8');
const section = (start, end) => arch.slice(arch.indexOf(start), arch.indexOf(end, arch.indexOf(start) + 1));
const ticks = (s) => [...s.matchAll(/`([^`]+)`/g)].flatMap((m) => m[1].split(/\s+/)).filter((w) => /^[a-z0-9_]+$/.test(w));
const reqIds = ticks(section('### Required item ids', '### Loot tables'));
const canonTables = ticks(section('### Loot tables (canonical', '---'));
const modelIds = new Set(ticks(section('Model ids:', '## UI')));
const sounds = new Set(arch.slice(arch.indexOf('Sound names:')).split('\n')[0].replace('Sound names:', '').replace(/`/g, '').trim().split(/\s+/));
const archTags = ticks(section('Tags the game logic understands', '### Required item ids'));

for (const id of reqIds) if (!ITEMS[id]) err(`required item id missing: ${id}`);
for (const t of canonTables) if (!LOOT_TABLES[t]) err(`canonical loot table missing: ${t}`);
for (const t of archTags) if (!ITEM_TAGS[t]) err(`ITEM_TAGS lacks architecture tag ${t}`);
console.log(`required ids: ${reqIds.length}, canonical tables: ${canonTables.length}, model ids: ${modelIds.size}, sounds: ${sounds.size}`);

// ---------------------------------------------------------------- def schema
const RARITIES = ['common', 'uncommon', 'rare', 'epic'];
const num = (v) => typeof v === 'number' && Number.isFinite(v);
const allTags = new Set(Object.keys(ITEM_TAGS));
for (const [id, d] of Object.entries(ITEMS)) {
  const p = `${id}:`;
  if (d.id !== id) err(`${p} id mismatch`);
  if (!d.name || typeof d.name !== 'string') err(`${p} name`);
  if (!d.desc || d.desc.length < 8) err(`${p} desc missing/short`);
  if (!ITEM_CATEGORIES[d.category]) err(`${p} bad category ${d.category}`);
  if (!num(d.weight) || d.weight < 0 || d.weight > 15) err(`${p} weight ${d.weight}`);
  if (!Number.isInteger(d.stack) || d.stack < 1) err(`${p} stack ${d.stack}`);
  if (!RARITIES.includes(d.rarity)) err(`${p} rarity ${d.rarity}`);
  if (!modelIds.has(d.model)) err(`${p} model ${d.model} not a Viewmodel model id`);
  if (!Array.isArray(d.tags)) err(`${p} tags`);
  for (const t of d.tags) if (!allTags.has(t)) err(`${p} unknown tag ${t}`);
  if (!d.icon || !TEMPLATES[d.icon.shape]) err(`${p} icon template ${d.icon?.shape} missing`);
  for (const dc of [].concat(d.icon?.decal || [])) if (!DECALS[dc]) err(`${p} decal ${dc} missing`);
  if (d.durability != null && (!num(d.durability) || d.durability <= 0)) err(`${p} durability`);
  if (d.uses != null && (!Number.isInteger(d.uses) || d.uses <= 0)) err(`${p} uses`);
  if (d.capacity != null && (!Number.isInteger(d.capacity) || d.capacity < 0)) err(`${p} capacity`);
  if (d.weightReduction != null && !(d.weightReduction > 0 && d.weightReduction < 1)) err(`${p} weightReduction`);
  if (d.weightReduction && d.clothing?.slot !== 'back') warn(`${p} weightReduction on non-bag`);
  if ((d.durability || d.capacity || d.firearm || d.liquidContainer) && d.stack > 1) err(`${p} stackable but has durability/capacity/firearm/liquid`);
  if (d.food) {
    for (const k of ['hunger', 'thirst', 'health', 'sickness', 'panic', 'energy', 'spoils', 'eatTime']) if (!num(d.food[k])) err(`${p} food.${k}`);
    if (d.food.cookTo && !ITEMS[d.food.cookTo]) err(`${p} cookTo ${d.food.cookTo}`);
    if (d.food.leaves && !ITEMS[d.food.leaves]) err(`${p} leaves ${d.food.leaves}`);
    if (d.food.raw && !d.food.cookTo) warn(`${p} raw without cookTo`);
    if (d.food.needsOpener && d.food.leaves !== 'tin_can') warn(`${p} needsOpener but leaves ${d.food.leaves}`);
  }
  if (d.drink) {
    for (const k of ['thirst', 'sickness', 'alcohol', 'energy']) if (!num(d.drink[k])) err(`${p} drink.${k}`);
    if (d.drink.leaves && !ITEMS[d.drink.leaves]) err(`${p} drink.leaves ${d.drink.leaves}`);
    if (d.drink.perUse && !d.uses) err(`${p} drink.perUse without uses`);
  }
  if (d.liquidContainer) {
    if (!Number.isInteger(d.liquidContainer.capacity)) err(`${p} liquidContainer.capacity`);
    if (d.uses !== d.liquidContainer.capacity) err(`${p} uses should equal liquidContainer.capacity`);
    if (d.data?.liquid && !LIQUIDS[d.data.liquid]) err(`${p} liquid ${d.data.liquid}`);
  }
  if (d.medical) for (const k of ['stopBleed', 'heal', 'disinfect', 'antibiotic', 'antiviral', 'painkiller', 'splint', 'suture', 'time']) if (!num(d.medical[k])) err(`${p} medical.${k}`);
  if (d.melee) {
    const m = d.melee;
    for (const k of ['damage', 'speed', 'range', 'knockback', 'stamina', 'noise', 'crit', 'headMult', 'sweep', 'knockdown', 'durabilityLoss']) if (!num(m[k])) err(`${p} melee.${k}`);
    if (!['blunt', 'blade', 'stab', 'heavy'].includes(m.type)) err(`${p} melee.type ${m.type}`);
    if (m.knockback < 0 || m.knockback > 2 || m.knockdown < 0 || m.knockdown > 1) err(`${p} melee knock ranges`);
    if (id !== 'fists' && !d.durability) err(`${p} melee without durability`);
  }
  if (d.firearm) {
    const f = d.firearm;
    for (const k of ['magSize', 'damage', 'fireRate', 'pellets', 'spread', 'adsSpread', 'recoil', 'range', 'reloadTime', 'shellTime', 'noise', 'aimFov', 'durabilityLoss']) if (!num(f[k])) err(`${p} firearm.${k}`);
    if (!f.ammo.length) err(`${p} firearm.ammo empty`);
    for (const a of f.ammo) if (!ITEMS[a] || ITEMS[a].category !== 'ammo') err(`${p} ammo ${a}`);
    for (const m of f.modes) if (!['semi', 'auto', 'pump', 'bolt'].includes(m)) err(`${p} mode ${m}`);
    if (!['mag', 'shell', 'single', 'break'].includes(f.reload)) err(`${p} reload ${f.reload}`);
    if ((f.reload === 'shell' || f.reload === 'single') && !(f.shellTime > 0)) err(`${p} shellTime needed`);
    if (!sounds.has(f.sound)) err(`${p} sound ${f.sound}`);
    if (!d.durability) err(`${p} firearm needs durability`);
  }
  if (d.clothing) {
    const c = d.clothing;
    if (!EQUIP_SLOTS.includes(c.slot)) err(`${p} slot ${c.slot}`);
    for (const k of ['insulation', 'water', 'bite', 'scratch']) if (!num(c[k]) || c[k] < 0 || c[k] > 1) err(`${p} clothing.${k}`);
    if (!num(c.speed) || !num(c.noise)) err(`${p} clothing speed/noise`);
    if (d.stack !== 1) err(`${p} clothing must have stack 1`);
    if (c.slot === 'back' && !d.capacity) err(`${p} bag without capacity`);
  }
  if (d.light) for (const k of ['range', 'cone', 'drain']) if (!num(d.light[k])) err(`${p} light.${k}`);
  if (d.light && d.light.drain > 0 && !d.uses) err(`${p} light with drain but no uses`);
  if (d.throwable) {
    if (!['molotov', 'pipebomb', 'grenade', 'flare', 'noise', 'smoke'].includes(d.throwable.kind)) err(`${p} throwable.kind`);
    for (const k of ['fuse', 'radius', 'damage', 'noise']) if (!num(d.throwable[k])) err(`${p} throwable.${k}`);
  }
  if (d.book) {
    if (d.book.skill && !SKILL_IDS.includes(d.book.skill)) err(`${p} book.skill ${d.book.skill}`);
    if (d.book.skill && !(d.book.mult > 1 && d.book.hours > 0)) err(`${p} skill book mult/hours`);
  }
  if (d.attachment) {
    if (d.attachment.kind !== 'suppressor') err(`${p} attachment.kind`);
    for (const f of d.attachment.fits) if (!ITEMS[f]?.firearm) err(`${p} fits ${f}`);
  }
  if (d.category === 'key' && d.data?.keyId !== id) err(`${p} key data.keyId must equal id`);
  if (d.tags.includes('fuel') && !d.burnTime && !d.liquidContainer) warn(`${p} fuel without burnTime`);
  if (d.place && !Object.values(BLOCKS).some((b) => b.name === d.place)) err(`${p} place block ${d.place} missing`);
}
if (!ITEMS.note.data || !('noteId' in ITEMS.note.data)) err('note: data.noteId');
for (const [id, tag] of [['map_millbrook', 'map'], ['watch', 'watch'], ['compass', 'compass'], ['kitchen_knife', 'can_opener'], ['kitchen_knife', 'blade'], ['fire_axe', 'chop'], ['crowbar', 'pry'], ['hammer', 'hammer'], ['shovel', 'dig'], ['lighter', 'fire_starter'], ['tshirt', 'fabric']]) {
  if (!ITEMS[id].tags.includes(tag)) err(`${id} must have tag ${tag}`);
}
for (const t of ['saw', 'fire_starter', 'lockpick', 'fabric', 'fuel', 'cooking_pot', 'repair_blade', 'repair_gun', 'repair_cloth', 'battery', 'binoculars', 'radio', 'heavy', 'blunt']) {
  if (!Object.values(ITEMS).some((d) => d.tags.includes(t))) err(`no item has tag ${t}`);
}

// ---------------------------------------------------------------- references
const refs = new Map();
const ref = (id, where) => { if (!refs.has(id)) refs.set(id, new Set()); refs.get(id).add(where); };
for (const b of Object.values(BLOCKS)) for (const dr of b.drops || []) ref(dr[0], `block ${b.name} drops`);
for (const pr of PROFESSIONS) for (const [id] of pr.startItems || []) ref(id, `profession ${pr.id}`);
for (const id of lootItemIds()) ref(id, 'loot');
for (const id of recipeItemIds()) ref(id, 'recipe');
for (const [id, list] of refs) if (!ITEMS[id]) err(`referenced id ${id} missing (from ${[...list].join(', ')})`);
for (const g of lootGroupRefs()) if (!LOOT_GROUPS[g]) err(`loot group @${g} missing`);
for (const t of recipeTags()) if (!Object.values(ITEMS).some((d) => d.tags.includes(t))) err(`recipe tag ${t} has no items`);
const blockTables = [...new Set(Object.values(BLOCKS).map((b) => b.container).filter(Boolean))];
for (const t of blockTables) if (!LOOT_TABLES[t]) err(`block container table ${t} missing`);
// items never obtainable (not in loot, not craftable, not start item, not a drop)
const obtain = new Set([...lootItemIds(), ...recipeItemIds(), ...refs.keys(), 'fists', 'note', 'tin_can', 'soda_can', 'glass_bottle', 'plastic_bottle']);
if (lootItemIds().includes('note')) err('note must not be in loot tables (noteId would be null)');
for (const d of Object.values(ITEMS)) { if (d.food?.cookTo) obtain.add(d.food.cookTo); if (d.food?.leaves) obtain.add(d.food.leaves); if (d.drink?.leaves) obtain.add(d.drink.leaves); }
const unobtainable = Object.keys(ITEMS).filter((id) => !obtain.has(id));
if (unobtainable.length) warn(`items not in any loot table / recipe: ${unobtainable.join(' ')}`);

// ---------------------------------------------------------------- createItem / weight / icons
for (const id of Object.keys(ITEMS)) {
  const d = ITEMS[id];
  try {
    const s = createItem(id, { count: 999, dur: 0.5, ammo: 999, uses: 2, age: 10 });
    if (s.count !== d.stack) err(`${id}: createItem count clamp ${s.count}`);
    if (d.durability && !(s.dur > 0 && s.dur <= d.durability)) err(`${id}: dur ${s.dur}`);
    if (d.firearm && s.ammo !== d.firearm.magSize) err(`${id}: ammo clamp`);
    if (d.firearm && !d.firearm.ammo.includes(s.ammoType)) err(`${id}: ammoType`);
    if (d.capacity && s.contents.length !== d.capacity) err(`${id}: contents`);
    const w = itemWeight(s);
    if (!Number.isFinite(w) || w < 0) err(`${id}: itemWeight ${w}`);
    const copy = JSON.parse(JSON.stringify(createItem(id)));
    if (d.stack > 1 && !canStack(createItem(id), copy)) err(`${id}: fresh stacks don't stack`);
    if (typeof itemDisplayName(s, 100) !== 'string') err(`${id}: displayName`);
    const f = itemFreshness(s, 1000);
    if (!(f >= 0 && f <= 1)) err(`${id}: freshness ${f}`);
    const px = renderIconPixels(d);
    let n = 0;
    for (let i = 3; i < px.length; i += 4) if (px[i]) n++;
    if (px.length !== 1024) err(`${id}: icon size`);
    if (n < 25) err(`${id}: icon nearly empty (${n} px)`);
  } catch (e) {
    err(`${id}: threw ${e.message}`);
  }
}
// bag weight reduction
{
  const bag = createItem('backpack_military');
  bag.contents[0] = createItem('log', { count: 4 });
  const expect = ITEMS.backpack_military.weight + 4 * ITEMS.log.weight * (1 - ITEMS.backpack_military.weightReduction);
  if (Math.abs(itemWeight(bag) - expect) > 1e-6) err(`weightReduction not applied (${itemWeight(bag)} vs ${expect})`);
  const wb = createItem('water_bottle');
  if (Math.abs(itemWeight(wb) - (ITEMS.water_bottle.weight + 4 * LIQUIDS.water.unitWeight)) > 1e-6) err('liquid weight');
  if (itemDisplayName(createItem('gas_can', { uses: 0 })) !== 'Gas Can (Empty)') err('empty container name');
  if (getItemDef('nonexistent').id !== 'unknown') err('unknown fallback');
}

// ---------------------------------------------------------------- loot
const rngFor = (s) => makeRng(s);
let totalStacks = 0;
for (const [name, t] of Object.entries(LOOT_TABLES)) {
  if (!(t.empty >= 0 && t.empty <= 1)) err(`loot ${name}: empty`);
  if (!Array.isArray(t.rolls) || t.rolls[0] > t.rolls[1]) err(`loot ${name}: rolls`);
  for (const e of t.entries) if (!(e[1] > 0) || (e[2] ?? 1) > (e[3] ?? e[2] ?? 1)) err(`loot ${name}: entry ${e[0]} weight/count`);
  for (let seed = 1; seed <= 150; seed++) {
    const size = (seed % 6) + 1;
    const out = generateLoot(name, rngFor(seed * 7919 + name.length), { scavenging: seed % 11, day: 1 + (seed % 12), size });
    if (out.length > size) err(`loot ${name}: ${out.length} stacks > size ${size}`);
    for (const s of out) {
      const d = ITEMS[s.id];
      if (!d) { err(`loot ${name}: bad id ${s.id}`); continue; }
      if (s.count < 1 || s.count > d.stack) err(`loot ${name}: ${s.id} count ${s.count}`);
      if (d.durability && !(s.dur >= 1 && s.dur <= d.durability)) err(`loot ${name}: ${s.id} dur ${s.dur}`);
      if (d.firearm && (s.ammo < 0 || s.ammo > d.firearm.magSize)) err(`loot ${name}: ${s.id} ammo`);
      if (d.liquidContainer && (s.uses < 0 || s.uses > d.liquidContainer.capacity)) err(`loot ${name}: ${s.id} liquid`);
      if (JSON.stringify(s) !== JSON.stringify(JSON.parse(JSON.stringify(s)))) err(`loot ${name}: not JSON-safe`);
      totalStacks++;
    }
  }
  // determinism
  const a = JSON.stringify(generateLoot(name, makeRng(42), { day: 3 }));
  const b = JSON.stringify(generateLoot(name, makeRng(42), { day: 3 }));
  if (a !== b) err(`loot ${name}: not deterministic`);
}
if (generateLoot('no_such_table', makeRng(1)).length !== 0) err('unknown table should give []');

// ---------------------------------------------------------------- recipes
const seen = new Set();
for (const r of RECIPES) {
  const p = `recipe ${r.id}:`;
  if (seen.has(r.id)) err(`${p} duplicate`); seen.add(r.id);
  if (!r.name || !r.desc) err(`${p} name/desc`);
  if (!RECIPE_CATEGORIES.includes(r.category)) err(`${p} category ${r.category}`);
  if (!(r.time > 0)) err(`${p} time`);
  if (![null, undefined, 'fire', 'workbench'].includes(r.station)) err(`${p} station`);
  if (r.skill && !SKILL_IDS.includes(r.skill.name)) err(`${p} skill ${r.skill.name}`);
  if (r.xp && !SKILL_IDS.includes(r.xp.skill)) err(`${p} xp skill ${r.xp.skill}`);
  if (!r.result?.id || !ITEMS[r.result.id]) err(`${p} result id`);
  if (!r.inputs.length) err(`${p} no inputs`);
  for (const s of r.inputs) {
    if (!s.item && !s.tag && !s.liquid) err(`${p} input kind`);
    if (s.liquid) for (const l of [].concat(s.liquid)) if (!LIQUIDS[l]) err(`${p} liquid ${l}`);
    if (s.uses != null && s.item) for (const i of [].concat(s.item)) if (!ITEMS[i]?.uses) err(`${p} uses input ${i} has no uses`);
  }
}
const st = getRecipeStatus(new PlayerInventory(), { skills: {} });
if (st.length !== RECIPES.length || st.some((s) => s.canCraft)) err('empty inventory should craft nothing');
for (const s of st) if (!Array.isArray(s.missing) || !Array.isArray(s.inputs) || !Array.isArray(s.tools)) err(`status shape ${s.recipe.id}`);

// ---------------------------------------------------------------- report
const cats = {};
for (const d of Object.values(ITEMS)) cats[d.category] = (cats[d.category] || 0) + 1;
console.log(`items: ${Object.keys(ITEMS).length}`, cats);
console.log(`loot tables: ${Object.keys(LOOT_TABLES).length}, groups: ${Object.keys(LOOT_GROUPS).length}, sampled stacks: ${totalStacks}`);
console.log(`recipes: ${RECIPES.length}`, RECIPE_CATEGORIES.map((c) => `${c} ${RECIPES.filter((r) => r.category === c).length}`).join(', '));
console.log(`icon templates: ${Object.keys(TEMPLATES).length}, decals: ${Object.keys(DECALS).length}`);
for (const w of warns) console.log('WARN', w);
for (const e of errors) console.log('ERROR', e);
console.log(errors.length ? `\n${errors.length} errors` : '\nALL CHECKS PASSED');
process.exit(errors.length ? 1 : 0);
