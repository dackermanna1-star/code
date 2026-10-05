#!/usr/bin/env node
// Regenerates public/images/* from public/dev/imagegen.js.
//
//   npm start            (in another terminal)
//   node tools/build-images.js [http://localhost:8080]
//
// Needs Playwright (npm i -D playwright). The images are committed, so this is
// only needed after changing the generator.
'use strict';
const fs = require('fs');
const path = require('path');

let chromium;
try { ({ chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright')); } catch (e) {
  console.error('Playwright is required: npm i -D playwright (or set PLAYWRIGHT_PATH)');
  process.exit(1);
}

(async () => {
  const base = process.argv[2] || 'http://localhost:8080';
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage();
  page.on('console', (m) => { if (m.type() === 'error') console.error('[page]', m.text()); });
  page.on('pageerror', (e) => console.error('[page]', e.message));
  await page.goto(base + '/dev/imagegen.html');
  await page.waitForFunction(() => window.generateAll && window.imagegenReady, null, { timeout: 30000 });
  const images = await page.evaluate(() => window.generateAll());
  const root = path.join(__dirname, '..', 'public', 'images');
  let n = 0;
  for (const [name, url] of Object.entries(images)) {
    const file = path.resolve(root, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
    n++;
  }
  console.log(`wrote ${n} images`);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
