// Prop library check: every prop callable, triangle / collision budgets, obstacle
// expectations, escalator walkability, stock car anchors, and per-category screenshots.
// Usage: node tests/props-check.mjs   (env PROPS_BASE overrides http://localhost:5173)
import { launch, shot } from './harness.mjs';

// By default a private Vite server (HMR disabled) is started so edits elsewhere in the
// repo cannot hot-reload the pages mid-capture; set PROPS_BASE to use a running server.
let server = null;
let BASE = process.env.PROPS_BASE;
if (!BASE) {
  try {
    const { createServer } = await import('vite');
    server = await createServer({ configFile: 'vite.config.js', server: { port: 5176, strictPort: false, hmr: false }, logLevel: 'error' });
    await server.listen();
    BASE = server.resolvedUrls.local[0].replace(/\/$/, '');
  } catch (e) {
    console.log('could not start private vite server, falling back to :5173 -', e.message);
    BASE = 'http://localhost:5173';
  }
}
console.log('using', BASE);
const PAGE = BASE + '/tests/pages/props.html';
const failures = [];
const fail = (m) => { failures.push(m); console.log('FAIL', m); };

const REQUIRED = `car hatchback police_car taxi pickup_truck van box_truck bus tanker_truck ambulance ceda_trailer helicopter stock_car
streetlight traffic_light stop_sign fire_hydrant mailbox newspaper_box trash_can dumpster bench bus_stop porta_potty phone_booth
jersey_barrier police_barrier sandbags chain_link_fence hedge bush tree palm_tree planter billboard awning utility_pole generator
scaffolding pallet crate barrel cardboard_boxes tire_stack shopping_cart ac_unit roof_vent water_tower satellite_dish ladder
solar_message_sign tent cot iv_stand body body_bag blood_pool debris_pile burning_wreckage
bed nightstand dresser wardrobe desk office_chair chair armchair sofa coffee_table table_round table_long lamp_floor lamp_table tv
luggage_cart room_service_cart ice_machine vending_machine fire_extinguisher fire_alarm_strobe wall_sconce ceiling_light chandelier
reception_desk elevator_doors stairwell_railing kitchen_oven prep_table kitchen_shelf fridge_walkin_door buffet_table
restaurant_table_set potted_plant painting mirror toilet_stall sink urinal laundry_cart washing_machine ironing_board sleeping_bag
barricade_furniture plywood_board cardboard_sign
mall_kiosk clothing_rack mannequin display_case checkout_counter store_shelf toy_shelf mall_bench mall_planter food_court_counter
food_court_table escalator security_gate atm mall_directory store_front scissor_lift construction_barrier plastic_sheeting
cement_bags toolbox vending_row
exit_sign safe_room_sign hotel_sign wet_floor_sign`.split(/\s+/).filter(Boolean);

// Props that must block navigation (have collision) / must not.
const SOLID = ['car', 'hatchback', 'police_car', 'taxi', 'pickup_truck', 'van', 'box_truck', 'bus', 'tanker_truck', 'ambulance', 'ceda_trailer', 'stock_car',
  'dumpster', 'jersey_barrier', 'bus_stop', 'porta_potty', 'generator', 'tree', 'crate', 'barrel', 'bed', 'sofa', 'reception_desk', 'vending_machine',
  'mall_kiosk', 'store_shelf', 'escalator', 'checkout_counter', 'scissor_lift', 'water_tower', 'barricade_furniture', 'tent'];
const DECOR = ['helicopter', 'blood_pool', 'newspapers', 'body', 'body_bag', 'painting', 'mirror', 'ceiling_light', 'chandelier', 'wall_sconce',
  'exit_sign', 'safe_room_sign', 'plastic_sheeting', 'cardboard_sign', 'sleeping_bag', 'iv_stand', 'ladder', 'awning'];
const LARGE = new Set(['tree', 'utility_pole', 'water_tower', 'scaffolding', 'escalator', 'barricade_furniture', 'restaurant_table_set', 'scissor_lift',
  'traffic_light', 'chandelier', 'store_front', 'food_court_counter', 'burning_wreckage', 'mall_planter', 'dumpster', 'sandbags', 'cement_bags', 'billboard']);

async function open(query, w = 960, h = 540) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const s = await launch({ url: PAGE + '?' + query, width: w, height: h });
    try {
      await s.page.waitForFunction(() => window.__ready, null, { timeout: 180000 });
      await s.page.waitForTimeout(250);
      return s;
    } catch (e) {
      await s.browser.close();
      if (attempt) throw e;
    }
  }
}

const consoleErrors = [];
// ---------------------------------------------------------------- 1. callable + stats
{
  const { browser, page, errors } = await open('mode=check');
  const st = await page.evaluate(() => window.__stats);
  consoleErrors.push(...errors.map((e) => 'check: ' + e));
  const byName = Object.fromEntries(st.props.map((p) => [p.name, p]));
  for (const n of REQUIRED) if (!byName[n]) fail(`required prop missing: ${n}`);
  const cats = st.categories;
  const catOf = {}; for (const [c, ns] of Object.entries(cats)) for (const n of ns) catOf[n] = c;
  console.log(`\n${'prop'.padEnd(24)}${'cat'.padEnd(10)}${'tris'.padStart(6)}${'col'.padStart(6)}${'mats'.padStart(6)}  size (m)`);
  let total = 0;
  for (const p of st.props) {
    total += p.tris;
    const c = catOf[p.name] || '?';
    const budget = p.name === 'stock_car' ? 800 : c === 'vehicles' ? 400 : LARGE.has(p.name) ? 420 : 300;
    const warn = p.tris > budget ? '  <-- over budget ' + budget : '';
    console.log(`${p.name.padEnd(24)}${c.padEnd(10)}${String(p.tris).padStart(6)}${String(p.colTris).padStart(6)}${String(p.mats).padStart(6)}  ${p.size.join(' x ')}${warn}`);
    if (p.error) fail(`${p.name} threw: ${p.error.split('\n')[0]}`);
    if (!p.error && p.tris === 0) fail(`${p.name} emitted no geometry`);
    if (p.nan) fail(`${p.name} produced ${p.nan} non-finite vertex values`);
    if (p.tris > budget) fail(`${p.name} over triangle budget (${p.tris} > ${budget})`);
  }
  console.log(`total ${st.props.length} props, ${total} triangles`);
  for (const v of st.variants) { console.log(`variant ${v.name.padEnd(24)} ${String(v.tris).padStart(5)} tris ${String(v.colTris).padStart(4)} col`); if (v.error) fail(`variant ${v.name} threw: ${v.error.split('\n')[0]}`); if (v.nan) fail(`variant ${v.name} produced non-finite values`); }
  for (const n of SOLID) if (byName[n] && byName[n].colTris === 0) fail(`${n} should be a navigation obstacle (has no collision)`);
  for (const n of DECOR) if (byName[n] && byName[n].colTris > 0) fail(`${n} should not collide (${byName[n].colTris} collision tris)`);
  for (const p of st.props) if (p.colTris > 160) fail(`${p.name} collision too complex (${p.colTris} tris)`);
  // escalator
  console.log('escalator', JSON.stringify(st.escalator));
  if (!st.escalator.ok) fail('escalator ramp not walkable: ' + JSON.stringify(st.escalator));
  // stock car anchors
  console.log('stock_car anchors', JSON.stringify(st.stockCar));
  const fc = st.stockCar && st.stockCar.fuelCap;
  if (!Array.isArray(fc) || fc.length !== 3 || !fc.every(Number.isFinite)) fail('stock_car fuelCap anchor missing');
  await browser.close();
}

// ---------------------------------------------------------------- 2. screenshots per category
const shots = [];
for (const cat of ['vehicles', 'street', 'hotel', 'mall', 'signs']) {
  const first = await open(`filter=${cat}&cam=0`);
  const n = await first.page.evaluate(() => window.__camCount);
  const info = await first.page.evaluate(() => window.__info);
  for (const e of info.entries) if (e.error) fail(`${cat}/${e.name}: ${e.error.split('\n')[0]}`);
  shots.push(await shot(first.page, `props-${cat}-0`));
  consoleErrors.push(...first.errors.map((e) => `${cat}/0: ${e}`));
  await first.browser.close();
  for (let c = 1; c < n; c++) {
    const s = await open(`filter=${cat}&cam=${c}`);
    shots.push(await shot(s.page, `props-${cat}-${c}`));
    consoleErrors.push(...s.errors.map((e) => `${cat}/${c}: ${e}`));
    await s.browser.close();
  }
}
for (const [name, q] of [['stock_car-0', 'prop=stock_car&cam=0&floor=tileMall'], ['stock_car-1', 'prop=stock_car&cam=1&floor=tileMall'], ['stock_car-2', 'prop=stock_car&cam=2&floor=tileMall'], ['stock_car-3', 'prop=stock_car&cam=3&floor=tileMall'],
  ['car-wrecked', 'prop=car&opts={"wrecked":true,"seed":3}&floor=asphalt'], ['car-burned', 'prop=car&opts={"burned":true,"seed":5}&floor=asphalt'], ['escalator', 'prop=escalator&cam=1&floor=tileMall']]) {
  const s = await open(q);
  shots.push(await shot(s.page, `props-closeup-${name}`));
  consoleErrors.push(...s.errors.map((e) => `${name}: ${e}`));
  await s.browser.close();
}
console.log(`\n${shots.length} screenshots in tests/output (props-*.png)`);

for (const e of consoleErrors) fail('console error: ' + e.split('\n')[0]);
console.log(failures.length ? `\n${failures.length} FAILURE(S)` : '\nALL PROP CHECKS PASSED');
if (server) await server.close();
process.exit(failures.length ? 1 : 0);
