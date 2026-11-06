// CPU profile of the zombie simulation (80 zombies downtown at night). Usage: node dev/qa-zombies-prof.cjs [port]
const fs = require('fs');
const { boot } = require('./qa-zombies-lib.cjs');
(async () => {
  const { browser, page, ev, report } = await boot({ port: process.argv[2] || 5302 });
  const src = fs.readFileSync(__dirname + '/qa-zombies-perf.js', 'utf8').split(/^\/\/ ---- ?(.*)$/m);
  const setup = src[2];
  console.log(await ev(new Function('return (async () => {' + setup + '})()')));
  await ev(() => { window.qa.sim(3, 1 / 30); });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
  await cdp.send('Profiler.start');
  const r = await ev(() => {
    const g = window.game;
    window.qa.zt = { sum: 0, n: 0, max: 0 };
    const hits = { n: 0, t: 0 };
    const zh = g.zombieHitsPlayer.bind(g);
    g.zombieHitsPlayer = (z) => { const t = performance.now(); zh(z); hits.t += performance.now() - t; hits.n++; };
    const t0 = performance.now();
    window.qa.sim(10, 1 / 30);
    g.zombieHitsPlayer = zh;
    return { wall: performance.now() - t0, zt: window.qa.zt.sum / window.qa.zt.n, ztMax: window.qa.zt.max, hits };
  });
  const { profile } = await cdp.send('Profiler.stop');
  console.log(JSON.stringify(r));
  const self = new Map();
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const dt = (profile.endTime - profile.startTime) / profile.samples.length / 1000;
  for (const id of profile.samples) {
    const n = byId.get(id);
    const k = n.callFrame.functionName + ' ' + n.callFrame.url.split('/').slice(-2).join('/') + ':' + n.callFrame.lineNumber;
    self.set(k, (self.get(k) || 0) + dt);
  }
  const top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30);
  for (const [k, v] of top) console.log(v.toFixed(1).padStart(8) + ' ms  ' + k);
  report();
  await browser.close();
})();
