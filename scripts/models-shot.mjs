// Renders the model preview headless and saves PNGs to screenshots/models/.
// Usage: node scripts/models-shot.mjs [shotName ...]   (default: all shots)
// Expects `npx vite --port 5199` running from the repo root.

import { createRequire } from 'module';
import { mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'screenshots', 'models');
mkdirSync(outDir, { recursive: true });

const BASE = process.env.PREVIEW_URL || 'http://localhost:5199/scripts/models-preview.html';
const W = Number(process.env.SHOT_W || 1280);
const H = Number(process.env.SHOT_H || 720);

const GROUND = ['mbt', 'ifv', 'apc', 'scout', 'spaag', 'spg', 'mlrs'];
const AIR = ['attack_heli', 'transport_heli', 'jet', 'transport_plane', 'fpv_drone', 'recon_uav'];
const AIR_LIFT = { transport_heli: 1.2, jet: 2.5, transport_plane: 3.2, fpv_drone: 0.3, recon_uav: 1.0 };
const POSE = { yaw: Math.PI / 4, elev: (15 * Math.PI) / 180, radar: 0.6, markers: true };

const SHOTS = {
  'ground-lineup': ['ground', { angle: [22, 20], title: 'Ground vehicles: coalition (front) and federation (back)' }],
  'ground-lineup-rear': ['ground', { angle: [-150, 22], title: 'Ground vehicles from the rear' }],
  'ground-coalition': ['groundRow', { faction: 0, angle: [28, 22], zoom: 0.6, title: 'Coalition ground vehicles' }],
  'ground-federation': ['groundRow', { faction: 1, angle: [28, 22], zoom: 0.6, title: 'Federation ground vehicles' }],
  'ground-coalition-rear': ['groundRow', { faction: 0, angle: [-145, 24], zoom: 0.6, title: 'Coalition ground vehicles (rear)' }],
  'ground-federation-rear': ['groundRow', { faction: 1, angle: [-145, 24], zoom: 0.6, title: 'Federation ground vehicles (rear)' }],
  'ground-side-0': ['groundRow', { faction: 0, angle: [90, 4], cols: 7, spacing: 9, zoom: 0.5, title: 'Coalition side profiles' }],
  'ground-side-1': ['groundRow', { faction: 1, angle: [90, 4], cols: 7, spacing: 9, zoom: 0.5, title: 'Federation side profiles' }],
  'ground-pose-0': ['groundRow', { faction: 0, angle: [-35, 25], zoom: 0.6, pose: POSE, title: 'Pivot check: turret 45°, gun +15°, spec markers' }],
  'ground-pose-1': ['groundRow', { faction: 1, angle: [-35, 25], zoom: 0.6, pose: POSE, title: 'Pivot check: turret 45°, gun +15°, spec markers' }],
  'air-helis': ['airRow', { types: ['attack_heli', 'transport_heli'], angle: [30, 24], zoom: 0.62, title: 'Helicopters (rotor parts)' }],
  'air-helis-blur': ['airRow', { types: ['attack_heli', 'transport_heli'], angle: [30, 24], zoom: 0.62, pose: { blur: true }, title: 'Helicopters (rotorBlur / tailRotorBlur discs)' }],
  'air-jets': ['airRow', { types: ['jet'], angle: [28, 22], zoom: 0.62, lift: 2.5, title: 'Strike jets' }],
  'air-transport': ['airRow', { types: ['transport_plane'], angle: [28, 26], zoom: 0.62, lift: 3, pose: { blur: true }, title: 'Transport planes (propBlur discs)' }],
  'air-drones': ['airRow', { types: ['fpv_drone'], angle: [30, 28], zoom: 0.55, lift: 0.2, pad: 0.25, pose: { blur: true }, title: 'FPV drones' }],
  'air-uav': ['airRow', { types: ['recon_uav'], angle: [30, 26], zoom: 0.6, lift: 1, pad: 0.6, pose: { blur: true }, title: 'Recon UAVs' }],
  'air-pose': ['airRow', { types: ['attack_heli', 'transport_heli'], angle: [60, 20], zoom: 0.62, pose: { markers: true, rotor: 0.9, tail: 1.1 }, title: 'Aircraft spec markers' }],
  'props-lineup': ['props', { angle: [20, 20], zoom: 0.52, title: 'Props (variant 0)' }],
  'props-small': ['props', { kinds: ['debris_concrete', 'debris_metal', 'rock', 'bush', 'tank_trap', 'fuel_drums', 'crates', 'sandbags', 'hesco', 'jersey_barrier'], cols: 5, spacing: 4.2, angle: [22, 26], zoom: 0.72, title: 'Props: small items' }],
  'props-mid': ['props', { kinds: ['car', 'car_wreck', 'fuel_tank', 'parachute', 'street_lamp', 'power_pole', 'guard_tower'], cols: 4, spacing: 10, angle: [22, 18], zoom: 0.7, title: 'Props: vehicles and structures' }],
  'props-tall': ['props', { kinds: ['tree_pine', 'tree_broadleaf', 'tree_dead', 'radio_mast'], cols: 4, spacing: 14, angle: [18, 12], zoom: 0.62, title: 'Props: trees and radio mast' }],
  'props-lod1': ['props', { angle: [20, 20], zoom: 0.52, lod: 1, title: 'Props lod1' }],
  'props-trees': ['props', { kinds: ['tree_pine', 'tree_broadleaf', 'tree_dead'], cols: 3, angle: 'fl', spacing: 12, zoom: 0.75, title: 'Trees' }],
};
for (const t of GROUND) {
  for (const f of [0, 1]) {
    SHOTS[`v-${t}-${f}`] = ['vehicle', { type: t, faction: f, angle: [40, 20], zoom: 0.78 }];
    SHOTS[`v-${t}-${f}-rear`] = ['vehicle', { type: t, faction: f, angle: [-140, 22], zoom: 0.78 }];
    SHOTS[`v-${t}-${f}-pose`] = ['vehicle', { type: t, faction: f, angle: [-70, 12], zoom: 0.55, pose: POSE }];
    SHOTS[`v-${t}-${f}-side`] = ['vehicle', { type: t, faction: f, angle: [90, 3], zoom: 0.62, label: false }];
    SHOTS[`v-${t}-${f}-front`] = ['vehicle', { type: t, faction: f, angle: [12, 8], zoom: 0.62, label: false }];
    SHOTS[`v-${t}-${f}-top`] = ['vehicle', { type: t, faction: f, angle: [20, 60], zoom: 0.62, label: false }];
  }
}
for (const t of AIR) {
  for (const f of [0, 1]) {
    const lift = AIR_LIFT[t] ?? 0;
    SHOTS[`a-${t}-${f}`] = ['aircraft', { type: t, faction: f, angle: [35, 16], zoom: 0.48, y: lift }];
    SHOTS[`a-${t}-${f}-rear`] = ['aircraft', { type: t, faction: f, angle: [-140, 18], zoom: 0.5, y: lift }];
    SHOTS[`a-${t}-${f}-top`] = ['aircraft', { type: t, faction: f, angle: [0, 89], zoom: 0.62, y: lift }];
    SHOTS[`a-${t}-${f}-blur`] = ['aircraft', { type: t, faction: f, angle: [30, 25], zoom: 0.62, y: lift, pose: { blur: true } }];
  }
}
const VARIANT_SP = { tree_pine: 8, tree_broadleaf: 11, tree_dead: 9 };
for (const k of ['tree_pine', 'tree_broadleaf', 'tree_dead', 'bush', 'rock', 'car']) {
  SHOTS[`variants-${k}`] = ['variants', { kind: k, count: 6, withLod1: true, angle: 'fl', spacing: VARIANT_SP[k] }];
}
const PROP_SP = { radio_mast: 32, guard_tower: 6, fuel_tank: 10, car: 6, car_wreck: 6, parachute: 9, street_lamp: 4, power_pole: 4, tree_pine: 12, tree_broadleaf: 12, tree_dead: 10 };
for (const k of ['sandbags', 'hesco', 'jersey_barrier', 'tank_trap', 'crates', 'fuel_drums', 'fuel_tank', 'radio_mast', 'guard_tower', 'car', 'car_wreck', 'street_lamp', 'power_pole', 'parachute', 'debris_concrete', 'debris_metal']) {
  SHOTS[`p-${k}`] = ['variants', { kind: k, count: 3, withLod1: true, angle: [30, 24], spacing: PROP_SP[k] ?? 4.5, zoom: 0.75 }];
}

const want = process.argv.slice(2);
const names = want.length ? Object.keys(SHOTS).filter((n) => want.some((w) => n === w || (w.endsWith('*') && n.startsWith(w.slice(0, -1))))) : Object.keys(SHOTS);

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: W, height: H } });
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[page]', m.text()); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`${BASE}?w=${W}&h=${H}&noinit=1`);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
if (want.includes('timing') || !want.length) {
  const t = await page.evaluate(() => [window.buildAllTiming(), window.buildAllTiming()]);
  const fmt = (o) => JSON.stringify(Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Math.round(v)])));
  console.log(`build-all timing ms: first ${fmt(t[0])}, warm ${fmt(t[1])}`);
}
for (const name of names) {
  const [view, opts] = SHOTS[name];
  const info = await page.evaluate(([v, o]) => window.setView(v, o), [view, opts]);
  const file = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: file });
  console.log(`${name}.png  tris=${Math.round(info.tris)}  build=${info.ms.toFixed(0)}ms`);
}
await browser.close();
