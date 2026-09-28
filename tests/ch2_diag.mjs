// Diagnose render crash spots: teleport + time a render at each position.
export default async ({ page, evalg, wait, shot }) => {
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?autostart=1');
  for (let i = 0; i < 90; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  await evalg(() => { const g = window.game; g.director.enabled = false; g.cheats.botsIdle = true; g.cheats.god = true; g.hud.show(false); window.session.menu.clear(); });
  const pts = JSON.parse(process.env.PTS || '[[162.2,-6.2,73.2,2.6,-0.3]]');
  for (const p of pts) {
    const r = await evalg(([x, y, z, yaw, pitch]) => {
      const g = window.game; g.player.teleport(x, y, z, yaw); g.player.pitch = pitch; g.advance(0.3);
      const t0 = performance.now(); g.renderer.render(0.016); const t1 = performance.now();
      const info = g.renderer.r.info;
      return { ms: Math.round(t1 - t0), calls: info.render.calls, tris: info.render.triangles, progs: info.programs?.length, geos: info.memory.geometries, tex: info.memory.textures };
    }, p);
    console.log(JSON.stringify(p), JSON.stringify(r));
  }
  if (process.env.SHOT) await shot('diag');
};
