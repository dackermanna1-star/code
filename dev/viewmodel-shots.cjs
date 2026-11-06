// Screenshot driver for dev/viewmodel-test.html (run `npx vite --port 5206 --strictPort` first).
//   node dev/viewmodel-shots.cjs <preset|all> [modelFilterRegex]
// Writes dev/out/viewmodel-*.png and prints console errors.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const COLS = +(process.env.VM_COLS || 4);
const URL = process.env.VM_URL || 'http://localhost:5206/dev/viewmodel-test.html?auto=1';
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });

const GUNS = ['pistol', 'pistol_1911', 'revolver', 'shotgun_pump', 'shotgun_double', 'shotgun_sawed', 'rifle_hunting', 'rifle_ar', 'rifle_ak', 'rifle_22', 'smg', 'crossbow', 'bow'];
const MELEE = ['knife', 'knife_hunting', 'bat', 'bat_nail', 'crowbar', 'hammer', 'axe_fire', 'hatchet', 'machete', 'golf_club', 'pan', 'pipe', 'sledgehammer', 'shovel', 'katana', 'spear', 'baton', 'wrench', 'pitchfork', 'club', 'screwdriver'];
const OTHER = ['fists', 'flashlight', 'molotov', 'pipe_bomb', 'grenade', 'flare', 'bottle'];
const GENERIC = ['vmt_icon_tool', 'vmt_icon_can', 'vmt_icon_book', 'vmt_icon_bandage'];
const ALL = [...GUNS, ...MELEE, ...OTHER];
const RELOAD = {
  pistol: ['mag', 2.0], pistol_1911: ['mag', 2.0], revolver: ['shell', 0.45], shotgun_pump: ['shell', 0.4], shotgun_double: ['break', 2.4], shotgun_sawed: ['break', 2.2],
  rifle_hunting: ['single', 0.45], rifle_ar: ['mag', 2.4], rifle_ak: ['mag', 2.6], rifle_22: ['mag', 2.0], smg: ['mag', 2.2], crossbow: ['single', 2.6], bow: ['single', 1.2],
};
const HOLD = { revolver: 1, shotgun_pump: 1, rifle_hunting: 1 };

const m = (model, extra = {}) => ({ model, label: model, ...extra });
const items = (list, extra) => list.map((id) => (GENERIC.includes(id) ? { item: id, label: id.replace('vmt_icon_', 'icon:'), ...extra } : m(id, extra)));

function reloadSeq(model, frac) {
  const [kind, dur] = RELOAD[model];
  if (HOLD[model]) {
    // enter (0.4) -> insert at 0.5 (0.5 s) ; frac picks a moment in the insert
    return { seq: [[0, 'reloadStart', kind, dur], [0.5, 'reloadInsert', 0.5]], t: 0.5 + 0.5 * frac };
  }
  return { seq: [[0, 'reloadStart', kind, dur]], t: dur * frac };
}

const PRESETS = {
  rest: () => [{ name: 'rest', grid: items([...ALL, ...GENERIC]) }],
  aim: () => [{ name: 'aim', grid: items(GUNS, { aim: true }) }],
  sprint: () => [{ name: 'sprint', grid: items([...ALL, ...GENERIC], { sprint: true, moving: true, t: 0.37 }) }],
  fire: () => [
    { name: 'fire-hip', grid: GUNS.map((g) => m(g, { seq: [[0, 'fire', 1]], t: 0.017 })) },
    { name: 'fire-ads', grid: GUNS.map((g) => m(g, { aim: true, seq: [[0, 'fire', 1]], t: 0.017 })) },
  ],
  swing: () => [
    { name: 'swing-wind', grid: [...MELEE, 'fists', 'pistol', 'rifle_ak'].map((g) => m(g, { seq: [[0, 'swing', false]], tFrac: 0.27 })) },
    { name: 'swing-hit', grid: [...MELEE, 'fists', 'pistol', 'rifle_ak'].map((g) => m(g, { seq: [[0, 'swing', false]], tFrac: 'hit' })) },
    { name: 'swing-follow', grid: [...MELEE, 'fists'].map((g) => m(g, { seq: [[0, 'swing', false]], tFrac: 0.52 })) },
    { name: 'swing-heavy', grid: [...MELEE, 'fists'].map((g) => m(g, { seq: [[0, 'swing', true]], tFrac: 'hit' })) },
    { name: 'swing-alt', grid: [...MELEE, 'fists'].map((g) => m(g, { seq: [[0, 'swing', false], [0.9, 'swing', false]], tFrac: 'hit2' })) },
  ],
  reload: () => [0.15, 0.3, 0.5, 0.65, 0.8, 0.95].map((f) => ({ name: 'reload-' + Math.round(f * 100), grid: GUNS.map((g) => m(g, { ammo: 0, ...reloadSeq(g, f) })) })),
  cycle: () => [
    { name: 'cycle', grid: [
      m('shotgun_pump', { seq: [[0, 'pump']], t: 0.22, label: 'pump .4' }), m('shotgun_pump', { seq: [[0, 'pump']], t: 0.3, label: 'pump .55' }),
      m('rifle_hunting', { seq: [[0, 'bolt']], t: 0.15, label: 'bolt lift' }), m('rifle_hunting', { seq: [[0, 'bolt']], t: 0.38, label: 'bolt back' }),
      m('pistol', { ammo: 0, t: 0.2, label: 'pistol empty' }), m('revolver', { seq: [[0, 'reloadStart', 'shell', 0.45]], t: 0.4, label: 'cyl out' }),
      m('shotgun_double', { seq: [[0, 'reloadStart', 'break', 2.4]], t: 0.45, label: 'break open' }), m('crossbow', { ammo: 0, label: 'xbow empty' }),
      m('pistol', { seq: [[0, 'reloadStart', 'mag', 2.0]], t: 2.5, label: 'after reload' }),
      m('shotgun_pump', { seq: [[0, 'reloadStart', 'shell', 0.4], [0.5, 'reloadInsert', 0.5], [1.0, 'reloadEnd']], t: 1.15, label: 'shell exit' }),
      m('rifle_hunting', { seq: [[0, 'reloadStart', 'single', 0.45], [0.5, 'reloadInsert', 0.5], [1.0, 'reloadEnd']], t: 1.2, label: 'bolt exit' }),
      m('bow', { aim: true, label: 'bow drawn' }),
    ] },
  ],
  use: () => ['eat', 'drink', 'bandage', 'pills', 'read', 'inject', 'craft'].map((k) => ({
    name: 'use-' + k,
    grid: [
      { item: 'vmt_icon_can', label: k + ' can', seq: [[0, 'use', k, 2.4]], t: 0.9 },
      { item: 'vmt_icon_bandage', label: k + ' bandage', seq: [[0, 'use', k, 2.4]], t: 1.3 },
      m('bottle', { label: k + ' bottle', seq: [[0, 'use', k, 2.4]], t: 1.0 }),
      m('rifle_ak', { label: k + ' ak(temp)', seq: [[0, 'use', k, 2.4, { id: 'vmt_icon_bandage', count: 1 }]], t: 1.1 }),
    ],
  })),
  throw: () => [0.2, 0.36, 0.46, 0.58, 0.9].map((f) => ({ name: 'throw-' + Math.round(f * 100), grid: ['molotov', 'pipe_bomb', 'grenade', 'flare', 'bottle', 'vmt_icon_can'].map((g) => (g.startsWith('vmt') ? { item: g, label: 'icon can', seq: [[0, 'throwItem']], t: 0.8 * f } : m(g, { seq: [[0, 'throwItem']], t: 0.8 * f }))) })),
  shove: () => [{ name: 'shove', grid: ['pistol', 'rifle_ar', 'shotgun_pump', 'fists', 'knife', 'bat', 'crowbar', 'flashlight'].map((g) => m(g, { seq: [[0, 'shove']], t: 0.2 })) }],
  light: () => [{ name: 'light', grid: [
    m('rifle_ar', { label: 'day' }), m('rifle_ar', { night: true, label: 'night' }), m('rifle_ar', { night: true, flash: true, label: 'night+flashlight' }), m('rifle_ar', { night: true, block: 0.9, label: 'night+torch' }),
    m('flashlight', { night: true, flash: true, label: 'flashlight on' }), m('pistol', { arms: 1, label: 'bare arms' }), m('pistol', { arms: 2, label: 'gloves' }), m('pistol', { arms: 3, label: 'tactical' }),
    m('molotov', { lit: true, label: 'molotov lit' }), m('flare', { lit: true, night: true, label: 'flare lit' }), m('rifle_ak', { lookDX: 2.5, label: 'turning right' }), m('rifle_ak', { lookDY: 2.0, label: 'looking up' }),
    m('rifle_ak', { crouch: true, label: 'crouch' }), m('rifle_ak', { moving: true, t: 0.3, label: 'walk' }), m('rifle_hunting', { aim: true, label: 'scope ADS (faded)' }), m('rifle_hunting', { aim: true, warm: 0.12, label: 'scope ADS mid' }),
  ] }],
  equip: () => [{ name: 'equip', grid: ['pistol', 'rifle_ak', 'bat', 'fists'].flatMap((g) => [0.05, 0.15, 0.25, 0.4].map((t) => m(g, { warm: t, label: g + ' ' + t }))) }],
};

async function main() {
  const which = process.argv[2] || 'rest';
  const filter = which !== 'single' && which !== 'gridfile' && process.argv[3] ? new RegExp(process.argv[3]) : null;
  const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('console', (msg) => { if (msg.type() === 'error' || msg.type() === 'warning') errs.push(msg.type() + ': ' + msg.text()); });
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  await page.goto(URL);
  await page.waitForFunction(() => window.vmTest && window.vmTest.ready, null, { timeout: 60000 });
  if (which === 'gridfile') {
    // node viewmodel-shots.cjs gridfile <file.json> <name> [cols]
    const list = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
    const name = process.argv[4] || 'gridfile';
    const cols = +(process.argv[5] || 2);
    await page.evaluate(([l, c]) => window.vmTest.grid(l, c), [list, cols]);
    const file = path.join(OUT, `viewmodel-${name}.png`);
    await page.screenshot({ path: file });
    console.log('wrote', file);
    if (errs.length) console.log('CONSOLE:\n' + [...new Set(errs)].join('\n'));
    await browser.close();
    return;
  }
  if (which === 'single') {
    // node viewmodel-shots.cjs single '<json array of shot params>' [outName]
    const list = JSON.parse(process.argv[3]);
    const name = process.argv[4] || 'single';
    for (let i = 0; i < list.length; i++) {
      await page.evaluate((p) => window.vmTest.shot(p), list[i]);
      const file = path.join(OUT, `viewmodel-${name}${list.length > 1 ? '-' + i : ''}.png`);
      await page.screenshot({ path: file });
      console.log('wrote', file);
    }
    if (errs.length) console.log('CONSOLE:\n' + [...new Set(errs)].join('\n'));
    await browser.close();
    return;
  }
  const names = which === 'all' ? Object.keys(PRESETS) : which.split(',');
  for (const n of names) {
    const shots = PRESETS[n]();
    for (const s of shots) {
      let grid = s.grid;
      if (filter) grid = grid.filter((p) => filter.test(p.label || ''));
      if (!grid.length) continue;
      // resolve tFrac (fraction of swing duration) inside the page
      const cols = COLS;
      const per = cols * cols;
      for (let i = 0; i < grid.length; i += per) {
        const pageN = grid.slice(i, i + per);
        await page.evaluate(([list, c]) => window.vmTest.grid(list, c), [pageN, cols]);
        const file = path.join(OUT, `viewmodel-${s.name}${grid.length > per ? '-' + (i / per + 1) : ''}.png`);
        await page.screenshot({ path: file });
        console.log('wrote', file);
      }
    }
  }
  if (errs.length) console.log('CONSOLE:\n' + [...new Set(errs)].join('\n'));
  else console.log('no console errors');
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
