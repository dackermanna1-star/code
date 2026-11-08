// End-to-end check of the real app: keyboard walking + wardrobe interactions.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const out = process.argv[2] || '.';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 860 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page.goto(process.env.APP_URL || 'http://localhost:5173/');
await page.waitForFunction(() => window.__ready || window.__error, null, { timeout: 120000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/ui0.png` });
// walk with keyboard
await page.keyboard.down('KeyW');
await page.waitForTimeout(2500);
await page.keyboard.down('KeyA');
await page.waitForTimeout(1200);
await page.keyboard.up('KeyA');
await page.screenshot({ path: `${out}/ui1.png` });
await page.keyboard.up('KeyW');
await page.waitForTimeout(1500);
// wardrobe: dresses tab -> summer dress, then restyle colour, pattern
await page.click('.tab:has-text("Dresses")');
await page.click('.card:has-text("Summer tea dress")');
await page.waitForTimeout(800);
await page.click('.editor .swatch >> nth=12');
await page.click('.editor .chip:has-text("Gingham")');
await page.waitForTimeout(500);
await page.click('.tab:has-text("Shoes")');
await page.click('.card:has-text("Mid-heel pumps")');
await page.click('.tab:has-text("Hair")');
await page.click('.card:has-text("Ponytail")');
await page.waitForTimeout(800);
await page.click('.swatch[title="Auburn"]');
await page.screenshot({ path: `${out}/ui2.png` });
// outfits
for (const o of ['Office', 'Evening', 'Winter', 'Rock', 'Autumn', 'Casual']) {
  await page.click(`.outfits .chip:has-text("${o}")`);
  await page.waitForTimeout(400);
}
await page.keyboard.down('ShiftLeft'); await page.keyboard.down('KeyW');
await page.waitForTimeout(2000);
await page.keyboard.up('KeyW'); await page.keyboard.up('ShiftLeft');
await page.click('.foot .undress');
await page.waitForTimeout(800);
await page.keyboard.press('Tab');
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/ui3.png` });
const fps = await page.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res(n / 2); }; requestAnimationFrame(f); }));
console.log('fps(swiftshader)', fps);
console.log(errors.slice(0, 30).join('\n') || 'no console errors');
await browser.close();
