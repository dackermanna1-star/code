export default async ({ page, shot, evalg, wait, logs }) => {
  await page.goto('' + (process.env.TEST_URL || 'http://localhost:5180/') + '?autostart=0');
  await wait(9000);
  const st = await evalg(() => {
    const g = window.game;
    if (!g || !g.level) return { err: 'no level', state: window.session?.state };
    return { state: window.session.state, nav: g.level.nav.N, navMs: g.level.navBuildMs, boxes: g.level.col.n, meshes: g.level.meshes.length, loadMs: g.loadMs, items: g.items.items.length, surv: g.survivors.map((s) => [s.name, s.pos.x.toFixed(1), s.pos.y.toFixed(1), s.pos.z.toFixed(1)]) };
  });
  console.log(JSON.stringify(st));
  await shot('ch1_start');
  await evalg(() => { window.game.advance(3); });
  await wait(1500);
  await shot('ch1_start2');
};
