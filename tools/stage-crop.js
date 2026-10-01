// Zoomed crops of the stage test page for pixel-level inspection.
// usage: node tools/stage-crop.js outDir "name|setupJS|x,y,w,h|scale" ...
const path = require('path');
const fs = require('fs');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const out = process.argv[2];
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 640 * 4 + 40, height: 360 * 4 + 120 } });
  await p.goto('file://' + path.resolve(__dirname, 'stage-test.html') + '?auto=1');
  await p.waitForFunction(() => window.T && window.T.ready);
  for (const spec of process.argv.slice(3)) {
    const [name, setup, rect, sc] = spec.split('|');
    const [x, y, w, h] = rect.split(',').map(Number), k = +sc || 4;
    await p.evaluate(setup);
    await p.evaluate((k) => { const c = document.getElementById('c'); c.style.width = 640 * k + 'px'; c.style.height = 360 * k + 'px'; }, k);
    const buf = await p.screenshot({ clip: { x: x * k, y: y * k, width: w * k, height: h * k } });
    fs.writeFileSync(path.join(out, name + '.png'), buf);
    console.log('crop', name);
  }
  await b.close();
})();
