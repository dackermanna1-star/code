// HUD moodle check: set several needs low, sample moodle rows' opacity over time, screenshot.
const { boot, dumpErrors } = require('./qa-survival-lib.cjs');
(async () => {
  const { b, p, ev, shot, errors } = await boot(process.argv[2] || 5303);
  await p.waitForTimeout(1000);
  await ev(() => { const P = H.g.player; P.hunger = 30; P.thirst = 20; P.energy = 25; P.bodyTemp = 35.6; P.wetness = 60; H.g.survival.addWound('laceration', 'armL'); });
  for (const t of [300, 1500, 4000]) {
    await p.waitForTimeout(t);
    console.log(t, await ev(() => [...document.querySelectorAll('.moodle')].map((r) => r.querySelector('span').textContent + ':' + (+getComputedStyle(r).opacity).toFixed(2) + ':' + r.className).join(' | ')));
  }
  await shot('moodles');
  dumpErrors(errors);
  await b.close();
})();
