// QA helper: prints every tour viewpoint and named location from a running sandbox (port 5301).
import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 320, height: 180 } });
await page.goto('http://localhost:5301/sandbox/world.html?texres=256', { waitUntil: 'load' });
await page.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 240000, polling: 500 });
const r = await page.evaluate(() => ({ tour: window.__game.screenshotTour(), locs: window.__game.ctx.world.locations, timings: null }));
for (const v of r.tour) console.log(v.name, v.x.toFixed(0), v.y.toFixed(0), v.z.toFixed(0), v.yaw.toFixed(0), v.pitch);
for (const l of r.locs) console.log('LOC', JSON.stringify(l));
await browser.close();
