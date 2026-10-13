// Map thumbnails for the menus: renders public/maps/<id>.thumb.jpg (320 x 180) from the map's
// MAP.thumbShot, else its first title shot (MAP.titleShots[0]; else the squad start, looking out).
// Needs the dev server running (npx vite --port <port>).
//   node tools/thumb.mjs <id|all> [port=5173] [shot index=0]
import { createRequire } from 'module';
import { writeFileSync } from 'fs';
import { BUILTIN, BUILTIN_MAPS } from '../src/map/maps/index.js';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('/home/user/code/node_modules/playwright'); } catch { playwright = require('/opt/node22/lib/node_modules/playwright'); }

const [which = 'all', port = '5173', shotArg = '0'] = process.argv.slice(2);
const defs = which === 'all' ? BUILTIN_MAPS : [BUILTIN[which]];
if (!defs[0]) throw new Error(`thumb: no built-in map "${which}"`);
const browser = await playwright.chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
for (const def of defs) {
  const page = await browser.newPage({ viewport: { width: 320, height: 180 } });
  page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
  await page.route('**/@vite/client', (route) => route.fulfill({ contentType: 'application/javascript', body: 'export const createHotContext=()=>({accept(){},acceptExports(){},dispose(){},prune(){},invalidate(){},on(){},off(){},send(){},data:{}});export const updateStyle=()=>{};export const removeStyle=()=>{};export const injectQuery=(u)=>u;export class ErrorOverlay{}' }));
  await page.goto(`http://localhost:${port}/?autostart=1&mode=zombies&allies=0&map=${def.id}`, { waitUntil: 'load', timeout: 180000 });
  const deadline = Date.now() + 240000;
  while (Date.now() < deadline && !(await page.evaluate(() => window.__ready === true).catch(() => false))) await page.waitForTimeout(400);
  const ok = await page.evaluate((shotIdx) => {
    const g = window.__game, d = g.W.mapDef;
    const shots = d.thumbShot && !shotIdx ? [d.thumbShot] : d.titleShots || [];
    let eye, look;
    if (shots.length) ({ eye, look } = shots[Math.min(shotIdx, shots.length - 1)]);
    else {
      const s = g.spawns.CT[0];
      eye = [s.origin[0], s.origin[1], s.origin[2] + 40];
      const a = (s.angle || 0) * Math.PI / 180;
      look = [eye[0] + Math.cos(a) * 500, eye[1] + Math.sin(a) * 500, eye[2] - 30];
    }
    const dx = look[0] - eye[0], dy = look[1] - eye[1], dl = Math.hypot(dx, dy) || 1;
    g.frame = () => {}; // freeze the camera where we put it
    g.drawVm = false;
    for (const p of g.players) if (p.model) p.model.object3D.visible = false;
    g.renderer.setView(eye, Math.atan2(eye[2] - look[2], dl) * 180 / Math.PI, Math.atan2(dy, dx) * 180 / Math.PI);
    const keep = new Set();
    for (let e = g.renderer.canvas; e; e = e.parentElement) keep.add(e);
    for (const e of document.body.querySelectorAll('*')) if (!keep.has(e) && !e.contains(g.renderer.canvas)) e.style.visibility = 'hidden';
    return true;
  }, +shotArg);
  if (!ok) throw new Error(`thumb: ${def.id} did not load`);
  await page.waitForTimeout(1500);
  const buf = await page.locator('#game-canvas').screenshot({ type: 'jpeg', quality: 82 });
  writeFileSync(new URL(`../public/maps/${def.id}.thumb.jpg`, import.meta.url), buf);
  console.log(`${def.id}: public/maps/${def.id}.thumb.jpg (${(buf.length / 1024).toFixed(1)} KB)`);
  await page.close();
}
await browser.close();
