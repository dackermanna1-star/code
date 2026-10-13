// Monument screenshots: finds the nearest example of every POI kind for a
// seed (the world generator is bundled on the fly with esbuild), creates a
// cheats-enabled world in headless Chromium, teleports next to each monument,
// sets daytime and captures several camera angles.
//   node scripts/poi-shots.mjs [outDir] [--seed 424242] [--kinds globe_tank,bunker] [--views 4]
// Run `npm run build` first. Software rendering is slow: expect ~1 min per monument.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const out = args[0] && !args[0].startsWith('--') ? args[0] : 'test-results/poi-shots';
const seedStr = opt('seed', '424242');
const kindsFilter = opt('kinds', '')?.split(',').filter(Boolean) ?? [];
mkdirSync(out, { recursive: true });

// --- locate monuments in Node -------------------------------------------------
const genFile = resolve('test-results/poi-gen.mjs');
await build({
  stdin: {
    contents: "export { WorldGenerator } from './src/shared/world/worldgen'; export { POI_DEFS } from './src/shared/world/poi'; export { seedFromString } from './src/shared/math';",
    resolveDir: process.cwd(),
    loader: 'ts',
  },
  bundle: true, platform: 'node', format: 'esm', outfile: genFile, logLevel: 'warning',
});
const { WorldGenerator, POI_DEFS, seedFromString } = await import(pathToFileURL(genFile).href + `?t=${Date.now()}`);
const seed = /^-?\d+$/.test(seedStr) ? Number(seedStr) >>> 0 : seedFromString(seedStr);
const gen = new WorldGenerator(seed);
const best = new Map();
const R = 14;
for (let rz = -R; rz <= R; rz++) for (let rx = -R; rx <= R; rx++) {
  const p = gen.pois.regionPoi(rx, rz);
  if (!p) continue;
  const d = Math.hypot(p.cx, p.cz);
  const cur = best.get(p.def.kind);
  if (!cur || d < cur.d) best.set(p.def.kind, { p, d });
}
const targets = Object.keys(POI_DEFS)
  .filter((k) => !kindsFilter.length || kindsFilter.includes(k))
  .map((k) => best.get(k)?.p)
  .filter(Boolean);
for (const k of Object.keys(POI_DEFS)) if (!best.has(k)) console.log(`no ${k} within ${R} regions`);
for (const p of targets) console.log(`${p.def.kind}: x0=${p.x0} z0=${p.z0} y=${p.y} (${p.def.w}x${p.def.d})`);

// --- browser ---------------------------------------------------------------
const port = 8000 + Math.floor(Math.random() * 1000);
const server = spawn(process.execPath, ['scripts/serve.mjs', String(port)], { stdio: 'pipe' });
await new Promise((r) => server.stdout.once('data', r));
const exe = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

const chat = (text) => page.evaluate((t) => window.__corrode.sim.send({ t: 'chat', text: t }), text);

async function waitChunks(p) {
  const t0 = Date.now();
  let stable = 0;
  while (Date.now() - t0 < 150000) {
    const ok = await page.evaluate(({ x0, z0, w, d }) => {
      const g = window.__corrode;
      const t = document.getElementById('fps')?.textContent ?? '';
      const m = /pending (\d+)/.exec(t);
      if (!m || Number(m[1]) > 2) return false;
      for (let cz = Math.floor((z0 - 16) / 16); cz <= Math.floor((z0 + d + 16) / 16); cz++) {
        for (let cx = Math.floor((x0 - 16) / 16); cx <= Math.floor((x0 + w + 16) / 16); cx++) {
          if (!g.world.chunks.has((cx + 32768) * 65536 + (cz + 32768))) return false;
        }
      }
      return true;
    }, { x0: p.x0, z0: p.z0, w: p.def.w, d: p.def.d });
    stable = ok ? stable + 1 : 0;
    if (stable >= 3) return true;
    await page.waitForTimeout(700);
  }
  console.log('warning: chunks did not settle');
  return false;
}

/** Interior views per kind, in POI-local block coordinates (x, y above floor, z): eye -> look-at. */
const INTERIOR = {
  globe_tank: [{ name: 'inside', at: [20.5, 19.6, 21.5], to: [12, 18.5, 14] }, { name: 'walkway', at: [6.5, 19.6, 10], to: [17, 18, 2] }],
  bunker: [{ name: 'hall', at: [17.5, -6.4, 15], to: [9, -7.5, 22] }, { name: 'stairs', at: [13.5, 2.6, 2.5], to: [13.5, -6, 12] }],
  power_station: [{ name: 'hall', at: [5.5, 4.6, 33.5], to: [27, 5, 23] }],
  container_yard: [{ name: 'quay', at: [4.5, 5, 9.5], to: [30, 4, 4] }],
  quarry: [{ name: 'pit', at: [8.5, 1.6, 8.5], to: [24, -7, 24] }],
  gas_station: [{ name: 'shop', at: [24.5, 2.6, 12.5], to: [31, 1.5, 22] }],
};

/** Camera views around a POI: [eye offset from centre (dx, dy, dz), look-at height above floor]. */
function views(p) {
  const w = p.def.w, d = p.def.d, r = Math.max(w, d);
  return [
    { name: 'aerial-sw', eye: [-0.85 * r, 0.75 * r, 0.85 * r], look: 6 },
    { name: 'aerial-ne', eye: [0.85 * r, 0.6 * r, -0.85 * r], look: 6 },
    { name: 'ground-s', eye: [0.15 * w, 2.2, d / 2 + 10], look: 8 },
    { name: 'ground-w', eye: [-(w / 2 + 9), 2.2, -0.1 * d], look: 8 },
    { name: 'top', eye: [0.01, 0.8 * r + 14, 0.3 * r], look: 0 },
  ];
}

let ok = false;
try {
  await page.goto(`http://localhost:${port}/`);
  await page.fill('#m-name', 'Surveyor');
  await page.evaluate(() => { document.getElementById('m-new').open = true; });
  await page.fill('#nw-name', 'POI Survey');
  await page.fill('#nw-seed', seedStr);
  await page.check('#nw-cheats');
  await page.click('#nw-create');
  await page.waitForSelector('#loading.hidden', { state: 'attached', timeout: 90000 });
  await page.addStyleTag({ content: '#hud, #hint, #chat, #crosshair { display: none !important; }' });
  const nViews = Number(opt('views', '5'));
  for (const p of targets) {
    const kind = p.def.kind;
    const cx = p.x0 + p.def.w / 2, cz = p.z0 + p.def.d / 2;
    const t0 = Date.now();
    // Stand on the skirt just outside the footprint.
    await chat(`/tp ${cx.toFixed(1)} ${p.y + 3} ${(p.z0 + p.def.d + 5).toFixed(1)}`);
    await chat('/time 0.42');
    await chat('/heal');
    await page.waitForTimeout(1500);
    await waitChunks(p);
    console.log(`${kind}: chunks ready after ${Date.now() - t0} ms`);
    const cams = views(p).slice(0, nViews).map((v) => ({ name: v.name, eye: [cx + v.eye[0], p.y + 1 + v.eye[1], cz + v.eye[2]], look: [cx, p.y + v.look, cz] }));
    for (const v of INTERIOR[kind] ?? []) cams.push({ name: v.name, eye: [p.x0 + v.at[0], p.y + v.at[1], p.z0 + v.at[2]], look: [p.x0 + v.to[0], p.y + v.to[1], p.z0 + v.to[2]] });
    for (const v of cams) {
      await chat('/heal');
      await page.evaluate(({ eye, look }) => {
        const g = window.__corrode;
        g.local.eye = () => eye;
        const dx = look[0] - eye[0], dy = look[1] - eye[1], dz = look[2] - eye[2];
        g.local.yaw = Math.atan2(-dx, -dz);
        g.local.pitch = Math.atan2(dy, Math.hypot(dx, dz));
      }, { eye: v.eye, look: v.look });
      await page.waitForTimeout(1600);
      await page.screenshot({ path: `${out}/${kind}-${v.name}.png` });
    }
    await page.evaluate(() => { const g = window.__corrode; delete g.local.eye; });
  }
  ok = errors.length === 0;
} catch (e) {
  console.error('poi-shots failure:', e);
  await page.screenshot({ path: `${out}/error.png` }).catch(() => undefined);
}
if (errors.length) console.error('Page errors:\n' + errors.slice(0, 20).join('\n'));
await browser.close();
server.kill();
console.log(ok ? `POI SHOTS OK -> ${out}` : 'POI SHOTS FAILED');
process.exit(ok ? 0 : 1);
