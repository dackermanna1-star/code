// Renders whole-level overview images (terrain + objects) for layout review.
//   node tests/overview.cjs [levelNumber ...]
const { chromium } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');

(async () => {
  const which = process.argv.slice(2).map(Number);
  const port = 8100 + Math.floor(Math.random() * 800);
  const server = spawn(process.execPath, [path.join(__dirname, '..', 'tools', 'serve.mjs'), String(port)], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 600));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`http://localhost:${port}/index.html`);
  await page.waitForTimeout(600);
  const n = await page.evaluate(() => window.__levels.length);
  const list = which.length ? which : Array.from({ length: n }, (_, i) => i + 1);
  const outDir = path.join(__dirname, '..', 'test-output');
  fs.mkdirSync(outDir, { recursive: true });
  for (const li of list) {
    const res = await page.evaluate((li) => {
      const g = window.__game;
      window.__ui.stopAttract();
      const lv = window.__levels[li - 1];
      g.start(lv, window.__chars[0]);
      g.state = 'paused';
      const L = g.level;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const p of L.data.paths) for (const [, y] of p) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
      for (const o of L.data.objects) if (o.y !== undefined) maxY = Math.max(maxY, o.y + 2);
      const ppm = 14;
      const seg = 130;
      const x0 = L.minX - 2;
      const x1 = L.maxX + 2;
      const rows = Math.ceil((x1 - x0) / seg);
      const rowH = Math.ceil((maxY - minY + 16) * ppm);
      const W = Math.ceil(seg * ppm);
      const c = document.createElement('canvas');
      c.width = W;
      c.height = rowH * rows;
      const ctx = c.getContext('2d');
      for (let r = 0; r < rows; r++) {
        const sx = x0 + r * seg;
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, r * rowH, W, rowH);
        ctx.clip();
        const th = L.theme;
        const grd = ctx.createLinearGradient(0, r * rowH, 0, (r + 1) * rowH);
        grd.addColorStop(0, th.sky[0]);
        grd.addColorStop(1, th.sky[2]);
        ctx.fillStyle = grd;
        ctx.fillRect(0, r * rowH, W, rowH);
        ctx.setTransform(ppm, 0, 0, -ppm, -sx * ppm, r * rowH + (maxY + 10) * ppm);
        const view = { x0: sx - 5, x1: sx + seg + 5, y0: minY - 50, y1: maxY + 50 };
        L.drawDecor(ctx, view, 0);
        for (const e of g.entities) if (e.layer === 'back') e.draw(ctx, view);
        L.drawTerrain(ctx, view);
        for (const e of g.entities) if (e.layer !== 'back') e.draw(ctx, view);
        g.player && g.player.draw(ctx);
        // ruler
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = '#000';
        ctx.font = 'bold 14px sans-serif';
        for (let x = Math.ceil(sx / 10) * 10; x < sx + seg; x += 10) {
          const px = (x - sx) * ppm;
          ctx.fillRect(px, r * rowH, 1, 10);
          ctx.fillText(String(x), px + 2, r * rowH + 22);
        }
        ctx.restore();
      }
      return { url: c.toDataURL('image/png'), rows, objects: L.data.objects.length, len: Math.round(x1 - x0) };
    }, li);
    const file = path.join(outDir, `overview-L${li}.png`);
    fs.writeFileSync(file, Buffer.from(res.url.split(',')[1], 'base64'));
    console.log(`L${li}: ${res.len} m, ${res.objects} objects, ${res.rows} rows -> ${path.relative(process.cwd(), file)}`);
  }
  if (errors.length) console.log('ERRORS:\n' + [...new Set(errors)].join('\n'));
  await browser.close();
  server.kill();
})();
