// Crafting exercise with a real PlayerInventory.  node dev/items-craft.mjs
import { PlayerInventory } from '../src/inventory/Inventory.js';
import { createItem, getItemDef, itemWeight } from '../src/items/items.js';
import { RECIPES, getRecipeStatus, getRecipeStatusFor, craft } from '../src/items/crafting.js';

let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.log('FAIL', msg); } else console.log('  ok', msg); };

function freshInv() {
  const inv = new PlayerInventory();
  const jeans = createItem('jeans');
  const bag = createItem('backpack_military');
  inv.setEquipped('legs', jeans);
  inv.setEquipped('back', bag);
  inv.setEquipped('torso', createItem('tshirt'));
  return inv;
}
const add = (inv, id, opts) => { const l = inv.addItem(createItem(id, opts)); if (l) throw new Error('no room for ' + id); };
const ctx = (o = {}) => ({ nearFire: false, nearWorkbench: false, skills: { maintenance: 0, firstAid: 0 }, nowHours: 50, ...o });

// ---- empty inventory
{
  const inv = freshInv();
  const st = getRecipeStatus(inv, ctx());
  ok(st.length === RECIPES.length, `status for all ${RECIPES.length} recipes`);
  const rip = st.find((s) => s.recipe.id === 'rip_rags');
  ok(!rip.canCraft, 'worn t-shirt is NOT offered for ripping');
}

// ---- rip / cut clothing: yields scale with garment weight, blade gets more
{
  const inv = freshInv();
  add(inv, 'hoodie');
  let st = getRecipeStatusFor(inv, 'rip_rags', ctx());
  ok(st.canCraft && st.resultCount === 6, `rip hoodie by hand → ${st.resultCount} rags`);
  let r = craft(inv, 'rip_rags', ctx());
  ok(r.ok && inv.count('rag') === 6 && inv.count('hoodie') === 0, 'hoodie consumed, 6 rags added: ' + r.message);
  add(inv, 'tshirt_red');
  add(inv, 'kitchen_knife');
  st = getRecipeStatusFor(inv, 'cut_rags', ctx());
  ok(st.canCraft && st.resultCount === 3, `cut t-shirt with knife → ${st.resultCount} rags`);
  const knife = inv.find('kitchen_knife')[0].stack;
  const dur0 = knife.dur;
  r = craft(inv, 'cut_rags', ctx());
  ok(r.ok && inv.count('rag') === 9 && knife.dur === dur0 - 1, 'knife worn by 1, 9 rags total');
  ok(inv.getEquipped('torso')?.id === 'tshirt', 'worn shirt untouched');
  // bandana loop does not duplicate rags
  r = craft(inv, 'bandana', ctx());
  ok(r.ok && inv.count('rag') === 7, 'bandana uses 2 rags');
  st = getRecipeStatusFor(inv, 'cut_rags', ctx());
  ok(st.resultCount <= 2, `cutting a bandana gives ≤ 2 rags (${st.resultCount}) — no dupe loop`);
}

// ---- medical
{
  const inv = freshInv();
  add(inv, 'rag', { count: 6 });
  add(inv, 'disinfectant', { uses: 3 });
  ok(craft(inv, 'make_bandage', ctx()).ok && craft(inv, 'make_bandage', ctx()).ok, 'two improvised bandages');
  const r = craft(inv, 'sterilize_bandage', ctx());
  ok(r.ok && inv.count('sterile_bandage') === 2 && inv.find('disinfectant')[0].stack.uses === 2, 'sterilize consumes 1 disinfectant use: ' + r.message);
  add(inv, 'stick', { count: 2 });
  ok(craft(inv, 'splint', ctx()).ok && inv.count('splint') === 1, 'splint');
  const xp = craft(inv, 'make_bandage', ctx()).xp;
  ok(!xp || xp.skill === 'firstAid', 'xp reported');
}

// ---- liquids: molotov from gas can, torch, boil water, tablets
{
  const inv = freshInv();
  add(inv, 'glass_bottle', { count: 2 });
  add(inv, 'rag', { count: 3 });
  add(inv, 'gas_can', { uses: 3 });
  add(inv, 'stick', { count: 1 });
  let r = craft(inv, 'molotov', ctx());
  const can = inv.find('gas_can')[0].stack;
  ok(r.ok && can.uses === 1 && inv.count('molotov') === 1, `molotov uses 2 gasoline units (left ${can.uses})`);
  r = craft(inv, 'molotov', ctx());
  ok(!r.ok && /Gasoline/.test(r.message), 'second molotov blocked: ' + r.message);
  r = craft(inv, 'torch', ctx());
  ok(r.ok && can.uses === 0 && can.data.liquid === null && inv.count('gas_can') === 1, 'torch empties the can but keeps it');
  // water
  add(inv, 'water_bottle', { uses: 4, data: { liquid: 'dirty_water' } });
  add(inv, 'canteen', { uses: 2, data: { liquid: 'dirty_water' } });
  add(inv, 'water_jug', { uses: 16, data: { liquid: 'dirty_water' } });
  let st = getRecipeStatusFor(inv, 'boil_water', ctx({ nearFire: true }));
  ok(!st.canCraft && st.missing.some((m) => m.label === 'Cooking pot'), 'boil needs a pot');
  add(inv, 'pot');
  st = getRecipeStatusFor(inv, 'boil_water', ctx());
  ok(!st.canCraft && st.missing.some((m) => /fire/i.test(m.label)), 'boil needs a fire');
  r = craft(inv, 'boil_water', ctx({ nearFire: true }));
  const bottle = inv.find('water_bottle')[0].stack, canteen = inv.find('canteen')[0].stack, jug = inv.find('water_jug')[0].stack;
  ok(r.ok && bottle.data.liquid === 'water' && canteen.data.liquid === 'water' && jug.data.liquid === 'dirty_water', 'boiled bottle + canteen (6 units), jug too big: ' + r.message);
  st = getRecipeStatusFor(inv, 'purify_tablet', ctx());
  ok(!st.canCraft, 'tablet recipe needs tablets and a ≤4 unit container');
  add(inv, 'bleach', { uses: 2 });
  r = craft(inv, 'purify_bleach', ctx());
  ok(r.ok && jug.data.liquid === 'water' && inv.find('bleach')[0].stack.uses === 1, 'bleach purifies the jug');
}

// ---- the pot can be both the water source and the cooking tool
{
  const inv = freshInv();
  add(inv, 'rag', { count: 2 });
  add(inv, 'pot', { uses: 8, data: { liquid: 'water' } });
  const r = craft(inv, 'boil_bandages', ctx({ nearFire: true, skills: { firstAid: 1 } }));
  ok(r.ok && inv.find('pot')[0].stack.uses === 6, 'boil rags using water from the pot itself');
}

// ---- weapons: nail bat inherits condition, hammer wear, spear needs a knife not also used as tool
{
  const inv = freshInv();
  add(inv, 'baseball_bat', { dur: 0.5 });
  add(inv, 'nails', { count: 12 });
  let st = getRecipeStatusFor(inv, 'nail_bat', ctx());
  ok(!st.canCraft && st.missing.some((m) => m.label === 'Hammer'), 'nail bat needs hammer');
  add(inv, 'hammer');
  let r = craft(inv, 'nail_bat', ctx());
  const nb = inv.find('nail_bat')[0]?.stack;
  ok(r.ok && nb && Math.abs(nb.dur / getItemDef('nail_bat').durability - 0.5) < 0.02 && inv.count('nails') === 4, `nail bat keeps 50% condition (${nb?.dur})`);
  add(inv, 'stick', { count: 2 });
  add(inv, 'duct_tape', { uses: 3 });
  st = getRecipeStatusFor(inv, 'spear', ctx());
  ok(!st.canCraft, 'spear needs a knife');
  add(inv, 'pocket_knife');
  r = craft(inv, 'spear', ctx());
  ok(r.ok && inv.count('spear') === 1 && inv.count('pocket_knife') === 0 && inv.find('duct_tape')[0].stack.uses === 1, 'spear consumes knife + 2 tape uses');
  r = craft(inv, 'spear', ctx());
  ok(!r.ok, 'tape (1 use left) insufficient: ' + r.message);
  // tool & input never the same stack: spear_crude needs blade tool; only blade is... none now
  st = getRecipeStatusFor(inv, 'spear_crude', ctx());
  ok(!st.canCraft, 'no blade → no sharpened stick');
}

// ---- ammo: salvage + reload need workbench & skill
{
  const inv = freshInv();
  add(inv, 'ammo_12g', { count: 8 });
  add(inv, 'screwdriver');
  add(inv, 'hammer');
  add(inv, 'scrap_metal', { count: 2 });
  let st = getRecipeStatusFor(inv, 'salvage_shells', ctx());
  ok(!st.canCraft && st.station && !st.station.ok, 'salvage needs a workbench');
  let r = craft(inv, 'salvage_shells', ctx({ nearWorkbench: true }));
  ok(r.ok && inv.count('gunpowder') === 2 && inv.count('ammo_12g') === 4, 'pulled 4 shells → 2 powder');
  st = getRecipeStatusFor(inv, 'reload_9mm', ctx({ nearWorkbench: true }));
  ok(!st.canCraft && st.missing.some((m) => /Maintenance/.test(m.label)), 'reload needs maintenance skill');
  r = craft(inv, 'reload_9mm', ctx({ nearWorkbench: true, skills: { maintenance: 2 } }));
  ok(r.ok && inv.count('ammo_9mm') === 8, 'reloaded 8 9mm');
}

// ---- repairs
{
  const inv = freshInv();
  add(inv, 'machete', { dur: 0.2 });
  add(inv, 'kitchen_knife', { dur: 0.6 });
  add(inv, 'whetstone', { uses: 2 });
  let r = craft(inv, 'sharpen_blade', ctx({ skills: { maintenance: 0 } }));
  const m = inv.find('machete')[0].stack;
  ok(r.ok && m.dur === Math.round(180 * 0.2) + Math.round(180 * 0.3), 'sharpened most worn blade (machete): ' + r.message);
  const jeans = inv.getEquipped('legs');
  jeans.dur = 30;
  add(inv, 'sewing_kit', { uses: 1 });
  add(inv, 'rag', { count: 1 });
  r = craft(inv, 'patch_clothing', ctx());
  ok(r.ok && jeans.dur === 65 && inv.count('sewing_kit') === 0, 'patched worn jeans, sewing kit used up: ' + r.message);
  add(inv, 'pistol_m9', { dur: 0.3 });
  add(inv, 'gun_cleaning_kit', { uses: 1 });
  r = craft(inv, 'clean_gun', ctx());
  ok(r.ok && inv.find('pistol_m9')[0].stack.dur === 65, 'cleaned pistol 30% → 65%');
}

// ---- inventory full → results flagged dropped
{
  const inv = new PlayerInventory();
  for (let i = 0; i < 9; i++) inv.hotbar[i] = createItem('brick');
  inv.hotbar[0] = createItem('rag', { count: 2 });
  const r = craft(inv, 'make_bandage', ctx());
  ok(r.ok && inv.count('bandage') === 1, 'result placed into slot freed by consumed input');
  inv.hotbar[0] = createItem('log');
  inv.hotbar[1] = createItem('stick', { count: 4 });
  inv.hotbar[2] = createItem('log');
  const r2 = craft(inv, 'campfire_kit', ctx());
  ok(r2.ok, 'campfire kit crafted: ' + r2.message);
  inv.hotbar.fill(createItem('brick'));
  inv.hotbar[0] = createItem('plank');
  inv.hotbar[1] = createItem('kitchen_knife');
  const r3 = craft(inv, 'split_sticks', ctx());
  ok(r3.ok && inv.count('stick') === 3, 'sticks placed in freed slot');
  inv.hotbar.fill(null);
  for (let i = 0; i < 9; i++) inv.hotbar[i] = createItem('brick');
  inv.hotbar[0] = createItem('log', { count: 2 });
  inv.hotbar[1] = createItem('saw');
  const r4 = craft(inv, 'saw_planks', ctx());
  ok(r4.ok && r4.results.some((s) => s.dropped), 'no room → result flagged dropped');
}

// ---- weight sanity: military bag reduces weight
{
  const bag = createItem('backpack_military');
  bag.contents[0] = createItem('log', { count: 4 });
  ok(Math.abs(itemWeight(bag) - (2.2 + 14 * 0.6)) < 1e-6, `bag weight ${itemWeight(bag).toFixed(2)} kg`);
}

// ---- craft every recipe once with a well-stocked inventory (smoke test)
{
  let crafted = 0;
  for (const rec of RECIPES) {
    const inv = freshInv();
    const big = createItem('backpack_military');
    inv.setEquipped('vest', createItem('chest_rig'));
    inv.setEquipped('jacket', createItem('hunting_jacket'));
    inv.equipment[inv.equipment.length - 1] = big;
    const give = (id, n = 10) => {
      const d = getItemDef(id);
      const liq = rec.inputs.find((i) => i.liquid);
      const o = d.liquidContainer ? { uses: d.liquidContainer.capacity, data: { liquid: liq ? [].concat(liq.liquid)[0] : 'water' } } : {};
      let left = n;
      while (left > 0) { const s = createItem(id, { ...o, count: left }); left -= s.count; inv.addItem(s); if (d.stack === 1 && left > 3) left = 3; }
    };
    for (const i of rec.inputs) {
      if (i.liquid) give([].concat(i.liquid)[0] === 'gasoline' ? 'gas_can' : rec.transform ? 'canteen' : 'water_jug', 2);
      else if (i.item) give([].concat(i.item)[0], (i.count || 1) + 1);
      else if (i.tag) {
        const id = { fabric: 'hoodie', can: 'tin_can', electronics_source: 'smartphone', repair_cloth: 'sewing_kit' }[[].concat(i.tag)[0]];
        give(id, (i.count || 1) + 1);
      }
    }
    for (const t of rec.tools || []) give(t.item ? [].concat(t.item)[0] : { blade: 'hunting_knife', chop: 'hatchet', hammer: 'hammer', saw: 'saw', cooking_pot: 'pot', screwdriver: 'screwdriver', repair_cloth: 'sewing_kit' }[[].concat(t.tag)[0]], 1);
    if (rec.repair) give(rec.repair.firearm ? 'pistol_glock' : rec.repair.clothing ? 'jeans' : rec.repair.tags?.includes('wood') ? 'baseball_bat' : 'machete', 1), inv.forEachStack((s) => { if (getItemDef(s.id).durability && s.id !== 'backpack_military') s.dur = 5; });
    const c = { nearFire: true, nearWorkbench: true, skills: { maintenance: 5, firstAid: 5, sneaking: 5 }, nowHours: 10 };
    const r = craft(inv, rec, c);
    if (!r.ok) console.log('   could not craft', rec.id, '-', r.message);
    else crafted++;
  }
  ok(crafted === RECIPES.length, `smoke-crafted ${crafted}/${RECIPES.length} recipes`);
}

console.log(fails ? `\n${fails} FAILURES` : '\nALL CRAFTING TESTS PASSED');
process.exit(fails ? 1 : 0);
