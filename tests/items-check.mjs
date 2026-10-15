// Weapon / item model library check: renders the gallery pages, saves screenshots,
// asserts zero console errors and validates every model's userData contract and budgets.
//   node tests/items-check.mjs                 full run
//   node tests/items-check.mjs --shots-only    skip contract checks
//   node tests/items-check.mjs --only=name1,name2   only these screenshots
//   node tests/items-check.mjs --extra=name:query    additional screenshot (query string)
import { launch, shot } from './harness.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const PAGE = BASE + '/tests/pages/items.html';
const args = process.argv.slice(2);
const only = (args.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const extras = args.filter((a) => a.startsWith('--extra=')).map((a) => { const s = a.slice(8); const i = s.indexOf(':'); return [s.slice(0, i), s.slice(i + 1), 960, 720]; });
const shotsOnly = args.includes('--shots-only');

const SHOTS = [
  ['items_weapons', '?set=weapons', 1280, 960],
  ['items_weapons_vm', '?set=weapons&vm=1', 1280, 960],
  ['items_melee', '?set=melee', 1280, 720],
  ['items_items', '?set=items', 1280, 960],
  ['items_real_scale', '?set=weapons&real=1', 1280, 960],
  ['items_close_m16', '?id=m16&vm=1', 960, 720],
  ['items_close_spas', '?id=spas&vm=1&rot=-20', 960, 720],
  ['items_close_medkit', '?id=medkit&vm=1&rot=10', 960, 720],
  ['items_fp_pistol', '?id=pistol&vm=1&view=fp', 640, 480],
  ['items_fp_pump', '?id=pump_shotgun&vm=1&view=fp', 640, 480],
  ['items_fp_ak47', '?id=ak47&vm=1&view=fp', 640, 480],
  ['items_fp_chainsaw', '?id=chainsaw&vm=1&view=fp', 640, 480],
  ['items_fp_katana', '?id=katana&vm=1&view=fp', 640, 480],
];

const LEN = {
  pistol: [0.15, 0.25], magnum: [0.22, 0.32], smg: [0.3, 0.5], smg_silenced: [0.45, 0.65],
  pump_shotgun: [0.9, 1.1], chrome_shotgun: [0.85, 1.05], auto_shotgun: [0.9, 1.15], spas: [0.85, 1.05],
  m16: [0.9, 1.1], ak47: [0.82, 1.0], scar: [0.85, 1.0], hunting_rifle: [0.95, 1.15], sniper_military: [1.1, 1.35],
  grenade_launcher: [0.65, 0.82], m60: [1.05, 1.3], chainsaw: [0.8, 1.0],
  fireaxe: [0.8, 1.0], crowbar: [0.5, 0.8], cricket_bat: [0.8, 1.0], baseball_bat: [0.75, 0.95], katana: [0.9, 1.1],
  knife: [0.2, 0.4], golf_club: [0.95, 1.15], frying_pan: [0.4, 0.6], machete: [0.55, 0.75], guitar: [0.95, 1.2],
  medkit: [0.25, 0.35], defib: [0.25, 0.4], pills: [0.06, 0.12], adrenaline: [0.1, 0.2], pipebomb: [0.18, 0.3],
  molotov: [0.22, 0.32], bilejar: [0.1, 0.18], upgrade_incendiary: [0.25, 0.4], upgrade_explosive: [0.25, 0.4],
  laser_sight: [0.12, 0.25], gascan: [0.3, 0.42], propane: [0.4, 0.5], oxygen: [0.6, 0.8], fireworks: [0.3, 0.5],
  cola: [0.18, 0.3], ammo_pile: [0.4, 0.8],
};
const BUDGET = { weapon: [40, 250], weaponVM: [40, 400], item: [20, 300], itemVM: [20, 400] };

const failures = [];
const fail = (m) => failures.push(m);
const allErrors = [];

async function capture(name, query, w, h) {
  const { browser, page, errors } = await launch({ url: PAGE + query, width: w, height: h });
  try {
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
    await page.waitForTimeout(150);
    const p = await shot(page, name);
    console.log('shot', p);
  } catch (e) { fail(`${name}: ${e.message}`); }
  for (const e of errors) allErrors.push(`${name}: ${e}`);
  await browser.close();
}

for (const s of [...SHOTS.filter((x) => (extras.length ? only.includes(x[0]) : !only.length || only.includes(x[0]))), ...extras]) await capture(...s);

if (!shotsOnly) {
  const { browser, page, errors } = await launch({ url: PAGE + '?set=weapons', width: 640, height: 480 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
  const { rows, sharedParts } = await page.evaluate(() => { const r = window.__summary(); return { rows: [...r], sharedParts: r.sharedParts }; });
  if (sharedParts) fail('instances share movable part objects (mag/pump) - clones are not independent');
  for (const e of errors) allErrors.push(`summary: ${e}`);
  await browser.close();

  const byId = new Map();
  for (const r of rows) {
    const tag = `${r.id}${r.vm ? '[vm]' : ''}`;
    if (!byId.has(r.id)) byId.set(r.id, {});
    byId.get(r.id)[r.vm ? 'vm' : 'tp'] = r;
    const [lo, hi] = r.item ? (r.vm ? BUDGET.itemVM : BUDGET.item) : (r.vm ? BUDGET.weaponVM : BUDGET.weapon);
    if (r.tris < lo || r.tris > hi) fail(`${tag}: ${r.tris} triangles outside budget ${lo}-${hi}`);
    if (r.materials !== 1 || r.badMat) fail(`${tag}: must use exactly the shared item material (found ${r.materials}, foreign ${r.badMat})`);
    if (r.noColor) fail(`${tag}: ${r.noColor} meshes without a color attribute`);
    const L = LEN[r.id];
    if (!L) fail(`${tag}: no length range`); else if (r.length < L[0] || r.length > L[1]) fail(`${tag}: length ${r.length} outside ${L[0]}-${L[1]}`);
    if (r.item) {
      if (r.kind !== 'item') fail(`${tag}: kind should be 'item'`);
      if (Math.abs(r.min[1]) > 1e-3) fail(`${tag}: not resting on y=0 (min.y=${r.min[1]})`);
      if (Math.abs(r.min[0] + r.max[0]) > 2e-3 || Math.abs(r.min[2] + r.max[2]) > 2e-3) fail(`${tag}: not centred in x/z`);
      if (r.id === 'pipebomb' && !r.light) fail(`${tag}: missing userData.light`);
      if (r.id === 'molotov' && !r.wick) fail(`${tag}: missing userData.wick`);
    } else {
      for (let a = 0; a < 3; a++) if (r.min[a] > 0.001 || r.max[a] < -0.001) fail(`${tag}: origin (grip) lies outside the model bounds`);
      if (!r.leftHand) fail(`${tag}: missing leftHand`);
      if (!r.tip) fail(`${tag}: missing tip`);
      if (r.kind === 'melee') {
        if (r.muzzle) fail(`${tag}: melee should have muzzle=null`);
        if (r.tip[2] > -0.1) fail(`${tag}: melee tip should be toward -Z`);
      } else {
        if (!r.muzzle) fail(`${tag}: missing muzzle`);
        else {
          if (r.muzzle[2] > -0.1) fail(`${tag}: muzzle should be toward -Z`);
          if (Math.abs(r.muzzle[2] - r.min[2]) > 0.03) fail(`${tag}: muzzle z ${r.muzzle[2]} not at the front of the model (min.z ${r.min[2]})`);
        }
        if (r.kind !== 'chainsaw' && (!r.mag || !r.mag.isChild)) fail(`${tag}: missing mag child`);
        if (r.leftHand && r.leftHand[2] > 0.05) fail(`${tag}: leftHand should not be behind the grip`);
      }
      if (['pump_shotgun', 'chrome_shotgun'].includes(r.id) && (!r.pump || !r.pump.meshes)) fail(`${tag}: missing pump mesh`);
      if (['pistol', 'magnum'].includes(r.id) && (!r.slide || !r.slide.meshes)) fail(`${tag}: missing slide mesh`);
      if (r.id === 'grenade_launcher' && !r.barrel) fail(`${tag}: missing barrel`);
      const valid = ['pistol', 'smg', 'shotgun', 'rifle', 'sniper', 'launcher', 'mg', 'chainsaw', 'melee'];
      if (!valid.includes(r.kind)) fail(`${tag}: invalid kind ${r.kind}`);
    }
  }
  for (const [idv, { tp, vm }] of byId) {
    if (tp && vm && vm.tris < tp.tris) fail(`${idv}: viewmodel has fewer triangles than third-person`);
    if (tp && vm && Math.abs(tp.length - vm.length) > 0.03) fail(`${idv}: viewmodel length differs from third-person (${tp.length} vs ${vm.length})`);
  }
  const pad = (s, n) => String(s).padEnd(n);
  console.log('\n' + pad('id', 20) + pad('kind', 10) + pad('tris', 6) + pad('vm', 6) + pad('length', 8) + 'size (x,y,z)');
  for (const [idv, { tp, vm }] of byId) console.log(pad(idv, 20) + pad(tp.kind === 'item' ? tp.category : tp.kind, 10) + pad(tp.tris, 6) + pad(vm.tris, 6) + pad(tp.length.toFixed(2), 8) + tp.size.map((x) => x.toFixed(2)).join(' x '));
  const tps = rows.filter((r) => !r.vm);
  console.log(`\n${tps.length} models; third-person tris total ${tps.reduce((a, r) => a + r.tris, 0)}, max ${Math.max(...tps.map((r) => r.tris))}; viewmodel max ${Math.max(...rows.filter((r) => r.vm).map((r) => r.tris))}`);
}

if (allErrors.length) { console.log('\nConsole errors:\n' + allErrors.join('\n')); fail(`${allErrors.length} console errors`); }
if (failures.length) { console.log('\nFAILURES:\n- ' + failures.join('\n- ')); process.exit(1); }
console.log('\nALL CHECKS PASSED');
