import { launch, shot } from './harness.mjs';
const combos = process.argv.slice(2).length ? process.argv.slice(2) : ['survivors:idle', 'specials:idle', 'commons:zrun'];
for (const c of combos) {
  const [set, pose, extra] = c.split(':');
  const { browser, page, errors } = await launch({ url: `http://localhost:5173/tests/pages/rigs.html?set=${set}&pose=${pose}${extra ? '&' + extra : ''}` });
  await page.waitForFunction(() => window.__ready, null, { timeout: 60000 });
  await page.waitForTimeout(300);
  await shot(page, `rig_${set}_${pose}`);
  if (errors.length) console.log(c, errors.join('\n'));
  await browser.close();
}
console.log('done');
