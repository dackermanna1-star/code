// node tools/filmstrip.cjs out.png "<setup js>" frameStep count camX camY camZ tgtX tgtY tgtZ
const { chromium } = require('playwright');
(async () => {
  const [out, setup, stepS, countS, ...cam] = process.argv.slice(2);
  const step = +(stepS || 6), count = +(countS || 8);
  const [cx, cy, cz, tx, ty, tz] = cam.length ? cam.map(Number) : [3.5, 1.2, 0.5, 0, 0.8, 0.5];
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 420, height: 420 } });
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__sim);
  await page.evaluate(`window.__sim.pause(); ${setup || ''}`);
  const shots = [];
  for (let i = 0; i < count; i++) {
    await page.evaluate(`window.__sim.stepFrames(${i === 0 ? 0 : step}); window.__sim.camera.position.set(${cx},${cy},${cz}); window.__sim.controls.target.set(${tx},${ty},${tz}); window.__sim.render();`);
    shots.push(await page.screenshot());
  }
  await browser.close();
  const fs = require('fs');
  const dir = require('path').dirname(out);
  shots.forEach((b, i) => fs.writeFileSync(`${dir}/_f${i}.png`, b));
  require('child_process').execSync(`python3 -c "
from PIL import Image
ims=[Image.open('${dir}/_f%d.png'%i) for i in range(${count})]
cols=min(${count},6); rows=(${count}+cols-1)//cols
W,H=ims[0].size
o=Image.new('RGB',(W*cols,H*rows))
for i,im in enumerate(ims): o.paste(im,((i%cols)*W,(i//cols)*H))
o.save('${out}')
"`);
})().catch((e) => { console.error(e); process.exit(1); });
