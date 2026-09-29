export default async ({ page, evalg, wait }) => {
  page.on('crash', () => { console.log('PAGE CRASH'); process.exit(3); });
  page.on('console', (m) => { if (m.text().startsWith('DBG')) console.log(m.text()); });
  await page.goto('http://localhost:5187/?campaign=deadair&autostart=0' + (process.env.IDLE ? '&idle=1' : ''), { timeout: 180000 });
  for (let i = 0; i < 150; i++) { await wait(1000); const st = await evalg(() => window.session?.state); if (i % 5 === 0) console.log('DBG boot', i, st); if (st === 'playing') break; }
  console.log('DBG booted');
  await evalg(([nr, kind]) => {
    const g = window.game; g.cheats.botsIdle = !!window.__idle || location.search.includes('idle'); window.__noTp = kind.endsWith('!'); kind = kind.replace('!', ''); g.director.enabled = false; g.paused = true; g.noRender = nr;
    const nav = g.level.nav;
    if (!window.__noTp) for (const [i, s] of g.survivors.entries()) { const k = nav.nearestNode(96 - i, 0, 52 + i, 3); s.teleport(nav.nodeX(k), nav.nodeY[k] + 0.02, nav.nodeZ(k), 0); }
    const k = nav.nearestNode(110, 0, 58, 4);
    console.log('DBG teleported', k);
    window.__ch = kind === 'none' ? { state: '-', stateT: 0, pos: g.player.pos, curSpeed: 0 } : g.director.spawnSpecial(kind, { node: k }); window.__ch.chargeCd = 0;
    console.log('DBG spawned', window.__ch.pos.x);
  }, [!!process.env.NR, process.env.KIND || 'charger']);
  for (let c = 0; c < 300; c++) {
    const r = await evalg(() => {
      const g = window.game, ch = window.__ch;
      for (let f = 0; f < 6; f++) { console.log('DBG f', f, ch.state, ch.stateT.toFixed(2), ch.pos.x.toFixed(2), ch.pos.z.toFixed(2), (performance.memory?.usedJSHeapSize / 1e6).toFixed(0)); g.advance(1 / 60); }
      const v = ch.pinning;
      console.log('DBG', g.time.toFixed(1), ch.state, ch.pos.x.toFixed(2), ch.pos.z.toFixed(2), ch.curSpeed.toFixed(1), v ? v.char.id + ':' + v.pos.x.toFixed(1) + ',' + v.pos.y.toFixed(1) + ',' + v.pos.z.toFixed(1) + ' hp' + Math.round(v.health) : '-', ch.dead ? 'DEAD' : '');
      return ch.dead;
    });
    await wait(30);
    if (r) break;
  }
};
