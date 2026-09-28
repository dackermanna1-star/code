export default async ({ page, evalg, wait }) => {
  page.on('crash', () => { console.log('PAGE CRASH'); process.exit(3); });
  page.on('console', (m) => { if (m.text().startsWith('DBG')) console.log(m.text()); });
  await page.goto('http://localhost:5187/?campaign=deadair&autostart=0', { timeout: 180000 });
  for (let i = 0; i < 150; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  await evalg((nr) => {
    const g = window.game; g.director.enabled = false; g.paused = true; g.noRender = nr;
    const nav = g.level.nav;
    for (const [i, s] of g.survivors.entries()) { const k = nav.nearestNode(96 - i, 0, 52 + i, 3); s.teleport(nav.nodeX(k), nav.nodeY[k] + 0.02, nav.nodeZ(k), 0); }
    const k = nav.nearestNode(110, 0, 58, 4);
    window.__ch = g.director.spawnSpecial('charger', { node: k }); window.__ch.chargeCd = 0;
  }, !!process.env.NR);
  for (let c = 0; c < 300; c++) {
    const r = await evalg(() => {
      const g = window.game, ch = window.__ch;
      g.advance(0.1);
      const v = ch.pinning;
      console.log('DBG', g.time.toFixed(1), ch.state, ch.pos.x.toFixed(2), ch.pos.z.toFixed(2), ch.curSpeed.toFixed(1), v ? v.char.id + ':' + v.pos.x.toFixed(1) + ',' + v.pos.y.toFixed(1) + ',' + v.pos.z.toFixed(1) + ' hp' + Math.round(v.health) : '-', ch.dead ? 'DEAD' : '');
      return ch.dead;
    });
    await wait(30);
    if (r) break;
  }
};
