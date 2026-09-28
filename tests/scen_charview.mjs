// Screenshots from the stand-alone character viewer (fast: no level load).
// VIEWS='view=lineup;view=face&id=bill' TAG=x node tests/play.mjs tests/scen_charview.mjs
export default async ({ page, wait, shot, logs }) => {
  const base = (process.env.TEST_URL || 'http://localhost:5180/') + 'tests/charviewer.html?';
  const views = (process.env.VIEWS || 'view=lineup').split(';');
  const tag = process.env.TAG || 'cv';
  for (const v of views) {
    await page.goto(base + v, { timeout: 180000, waitUntil: 'commit' });
    for (let i = 0; i < 600; i++) { await wait(500); if (await page.evaluate(() => window.__ready).catch(() => false)) break; }
    const st = await page.evaluate(() => window.__stats).catch(() => null);
    const name = tag + '_' + v.replace(/view=/, '').replace(/[&=,]/g, '_').slice(0, 60);
    console.log('VIEW', v, JSON.stringify(st));
    await shot(name);
  }
  console.log('errors', logs.filter((l) => /error|warn/i.test(l)).length);
};
