// Screenshot the stage test page in many states and measure draw cost.
// usage: node tools/stage-shots.js [outDir] [only-substring]
const path = require('path');
const fs = require('fs');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const OUT = process.argv[2] || '/tmp/claude-0/-home-user-code/abffe7cb-167e-54ba-84b2-aacd85510bc1/scratchpad/stage/';
const ONLY = process.argv[3] || '';

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ args: process.env.SOFTWARE ? ['--disable-gpu', '--disable-gpu-compositing', '--disable-accelerated-2d-canvas'] : ['--enable-gpu-rasterization', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  const url = 'file://' + path.resolve(__dirname, 'stage-test.html') + '?auto=1';
  const fresh = async () => {
    await page.goto(url);
    await page.waitForFunction(() => window.T && window.T.ready);
  };
  const shot = async (name) => {
    if (ONLY && !name.includes(ONLY)) return;
    await page.locator('#c').screenshot({ path: path.join(OUT, name + '.png') });
    console.log('shot', name);
  };
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const states = [
    ['01-normal', async () => { await ev(() => { T.set({ x: 0, y: 142, zoom: 1 }); T.step(30); }); }],
    ['02-left', async () => { await ev(() => { T.set({ x: -280, y: 142, zoom: 1 }); T.step(4); }); }],
    ['03-right', async () => { await ev(() => { T.set({ x: 280, y: 142, zoom: 1 }); T.step(4); }); }],
    ['04-zoom2', async () => { await ev(() => { T.set({ x: 60, y: 110, zoom: 2 }); T.step(2); }); }],
    ['05-zoom07', async () => { await ev(() => { T.set({ x: 0, y: 142, zoom: 0.7 }); T.step(2); }); }],
    ['06-blast', async () => { await ev(() => { T.set({ x: 0, y: 142, zoom: 1 }); T.act('2'); T.step(8); }); }],
    ['07-blast-settled', async () => { await ev(() => { T.step(120); }); }],
    ['08-erase', async () => { await ev(() => { T.act('r'); T.set({ x: 0, y: 142, zoom: 1 }); T.step(10); for (let x = -420; x <= 420; x += 20) { T.stage.erase(x - 10, x + 10, 70, 30); T.step(1); } T.step(4); }); }],
    ['09-erase-cooled', async () => { await ev(() => { T.step(200); T.set({ x: 120 }); T.step(2); }); }],
    ['10-worldcut', async () => { await ev(() => { T.act('r'); T.set({ x: 0, y: 142, zoom: 1 }); T.step(10); T.act('5'); T.step(4); }); }],
    ['11-worldcut-cooled', async () => { await ev(() => { T.step(200); T.set({ x: -60 }); T.step(2); }); }],
    ['11b-worldcut-flat', async () => { await ev(() => { T.act('r'); T.set({ x: 0, y: 142, zoom: 1 }); T.step(10); T.stage.worldCut(-1269.7, 96.3, 1500.2, 96.3); T.step(150); }); }],
    ['12-burn', async () => { await ev(() => { T.act('r'); T.set({ x: 0, y: 142, zoom: 1 }); T.act('7'); T.step(40); }); }],
    ['13-pull', async () => { await ev(() => { T.act('2'); T.step(60); T.act('3'); T.step(30); }); }],
    ['14-void-expand', async () => { await ev(() => { T.act('r'); T.set({ x: 0, y: 142, zoom: 1 }); T.step(5); T.act('v'); T.step(16); }); }],
    ['15-void', async () => { await ev(() => { T.step(60); }); }],
    ['16-void-shatter', async () => { await ev(() => { T.act('n'); T.step(12); }); }],
    ['17-shrine', async () => { await ev(() => { T.step(40); T.act('s'); T.step(80); }); }],
    ['18-clash', async () => { await ev(() => { T.act('c'); T.step(80); }); }],
    ['19-normal-after', async () => { await ev(() => { T.act('n'); T.step(60); }); }],
    ['20-darken', async () => { await ev(() => { T.darken(0.6); T.step(2); T.darken(0); }); }],
    ['21-zoom35', async () => { await ev(() => { T.act('r'); T.set({ x: -100, y: 120, zoom: 3.5 }); T.step(3); }); }],
    ['22-zoom06-edge', async () => { await ev(() => { T.set({ x: 280, y: 142, zoom: 0.6 }); T.step(3); }); }],
    ['23-far-x', async () => { await ev(() => { T.set({ x: 1500, y: 142, zoom: 1 }); T.step(3); }); }],
    ['24-high-y', async () => { await ev(() => { T.set({ x: 0, y: 420, zoom: 1 }); T.step(3); }); }],
    ['25-low-y', async () => { await ev(() => { T.set({ x: 0, y: 10, zoom: 1.2 }); T.step(3); }); }],
    ['26-void-zoom', async () => { await ev(() => { T.set({ x: 100, y: 100, zoom: 2.2 }); T.act('v'); T.step(60); }); }],
    ['27-shrine-zoomout', async () => { await ev(() => { T.set({ x: -200, y: 160, zoom: 0.6 }); T.act('s'); T.step(60); }); }],
    ['28-expand-shrine', async () => { await ev(() => { T.act('n'); T.step(40); T.set({ x: 0, y: 142, zoom: 1 }); T.act('s'); T.step(14); }); }],
    ['29-shatter-shrine', async () => { await ev(() => { T.step(40); T.act('n'); T.step(14); }); }],
  ];
  await fresh();
  console.log('build ms', await ev(() => T.buildMs));
  for (const [name, fn] of states) {
    if (ONLY && !name.includes(ONLY)) continue;
    await fn();
    await shot(name);
  }
  if (!ONLY || ONLY === 'perf') {
    await fresh();
    const res = {};
    res.normal = await ev(() => { T.set({ x: 0, y: 142, zoom: 1 }); T.perf(60); return T.perf(300); });
    res.normalFx = await ev(() => { T.act('2'); T.act('7'); T.act('3'); return T.perf(300); });
    res.void = await ev(() => { T.act('v'); T.perf(60); return T.perf(300); });
    res.shrine = await ev(() => { T.act('s'); T.perf(60); return T.perf(300); });
    res.clash = await ev(() => { T.act('c'); T.perf(60); return T.perf(300); });
    res.zoomOut = await ev(() => { T.act('n'); T.perf(40); T.set({ zoom: 0.6 }); return T.perf(300); });
    await fresh();
    res.jsOnly = await ev(() => {
      const o = {};
      T.set({ x: 0, y: 142, zoom: 1 }); T.step(30); o.normal = T.jsCost(300);
      T.act('2'); T.act('7'); T.act('3'); o.normalFx = T.jsCost(300);
      T.act('v'); T.step(60); o.void = T.jsCost(300);
      T.act('s'); T.step(60); o.shrine = T.jsCost(300);
      T.act('c'); T.step(60); o.clash = T.jsCost(300);
      return o;
    });
    for (const k in res) console.log('perf', k, JSON.stringify(res[k], (key, v) => (typeof v === 'number' ? +v.toFixed(3) : v)));
  }
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console errors');
  await browser.close();
})();
