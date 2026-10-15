// usage: node fbx_ascii2glb.mjs outDir file1.fbx ... (static_server.mjs must serve --scratch at port 5231; files must be under scratch)
import { chromium } from 'playwright';
import fs from 'fs'; import path from 'path';
const [outDir, ...files] = process.argv.slice(2);
const scratch = process.env.SCRATCH;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto('http://127.0.0.1:5231/repo/tools/assets/characters/fbx_ascii2glb.html');
await page.waitForFunction(() => window.ready === true);
fs.mkdirSync(outDir, { recursive: true });
for (const f of files) {
  const url = '/scratch/' + path.relative(scratch, f);
  const r = await page.evaluate((u) => window.convert(u), url);
  const out = path.join(outDir, path.basename(f).replace(/\.fbx$/i, '.glb'));
  fs.writeFileSync(out, Buffer.from(r.b64, 'base64'));
  console.log('OK', out, r.names.join(','));
}
await browser.close();
