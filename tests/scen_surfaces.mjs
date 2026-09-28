// Surfaces / wall-art visual check (QUALITY=medium for screenshots).
// CH=chapter index, PREFIX=file prefix, SPOTS='[[name,x,y,z,yaw,pitch],...]' overrides the default spots.
// Prints level load time + procedural texture generation stats.
const DEFAULT = {
  0: [['street', 22, 0.15, 23, -2.1, 0.05], ['lobby', 21, 0, 14.5, -0.69, 0.05], ['roadblock', 60, 0, 28.5, -1.57, 0.05], ['f3_corr', 6, 10.8, 10.4, -1.57, -0.05], ['saferoom', 104.5, -6, -20.5, 0, 0.0]],
  1: [['safe', -7.5, 0, 7.8, -2.1, -0.08], ['platform', 42, -5, 4.5, -1.35, -0.05], ['concourse', 2, 0, 5.2, -1.75, -0.02], ['street', 234.8, 0.15, 69.5, -2.3, 0.02]],
  2: [['lot_gas', 50, 0, 54, -2.24, 0.05], ['bb_dining', 49, 0.15, 28.6, 3.14, -0.05], ['street_east', 60, 0, 22, -1.57, 0.02], ['plaza', 152, 0, 174, 3.14, 0.2]],
  3: [['lobby_north', 54, 0, 57, 0, 0.18], ['lobby_wide', 38.5, 0, 57.5, -0.75, 0.12], ['safe', 74.5, 0, 55, -Math.PI / 2, -0.05], ['f2corr', 7.5, 4, 10.6, -Math.PI / 2, -0.03]],
  4: [['saferoom', 18, -4.4, 18.5, 2.4, -0.05], ['roof', 10, 0, 20, 0.6, -0.08], ['roof2', -10, 0, 10, 2.5, -0.1]],
};
export default async ({ page, evalg, wait, shot }) => {
  const ch = +(process.env.CH || 0);
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?autostart=' + ch + (process.env.CAMPAIGN ? '&campaign=' + process.env.CAMPAIGN : ''));
  for (let i = 0; i < 120; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  const info = await evalg(() => {
    const g = window.game;
    g.director.enabled = false; g.cheats.botsIdle = true; g.cheats.god = true;
    for (const s of g.survivors) if (s !== g.player) s.teleport(300, -80, 300, 0);
    g.hud?.show?.(false); if (g.renderer?.vmPass) g.renderer.vmPass.enabled = false;
    return { loadMs: Math.round(g.loadMs), tex: window.__texStats ? { ...window.__texStats } : null, calls: g.renderer?.r?.info?.render?.calls };
  });
  for (let i = 0; i < 60; i++) { const pend = await evalg(() => window.__texStats?.pending ?? 0); if (!pend) break; await wait(500); }
  console.log('LOAD', JSON.stringify(info));
  console.log('TEX', JSON.stringify(await evalg(() => { const t = window.__texStats; return t && { mainMs: Math.round(t.ms), workerMs: Math.round(t.workerMs || 0), count: t.count, pending: t.pending }; })));
  const pre = process.env.PREFIX || 'surf';
  const spots = process.env.SPOTS ? JSON.parse(process.env.SPOTS) : DEFAULT[ch] || [];
  for (const [name, x, y, z, yaw, pitch] of spots) {
    await evalg(([x, y, z, yaw, pitch]) => { const g = window.game; g.player.teleport(x, y + 0.02, z, yaw); g.player.pitch = pitch; g.advance(0.5); g.hud?.clearTransient?.(); }, [x, y, z, yaw, pitch]);
    await wait(900);
    await shot(pre + '_c' + ch + '_' + name);
  }
  const r = await evalg(() => ({ calls: window.game.renderer?.r?.info?.render?.calls, tris: window.game.renderer?.r?.info?.render?.triangles, tex: window.game.renderer?.r?.info?.memory?.textures, errs: window.game.errCount || 0 }));
  console.log('END', JSON.stringify(r));
};
