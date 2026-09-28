// Performance survey per chapter: draw calls / triangles at the start, middle
// and end of the route (high quality), and JS update cost with a horde.
// CHS=0,1,2,3,4 QUALITY=high node tests/play.mjs tests/scen_perf.mjs
export default async ({ page, evalg, wait }) => {
  const chs = (process.env.CHS || '0,1,2,3,4').split(',').map(Number);
  for (const ch of chs) {
    await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?autostart=' + ch, { timeout: 180000 });
    for (let i = 0; i < 120; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
    const r = await evalg(() => {
      const g = window.game, L = g.level, nav = L.nav, f = nav.fields.toExit;
      const total = f[nav.nodeAt(...L.flowStart)] || 1;
      // pick nodes along the route at progress 0, .25, .5, .75, 1
      const want = [0.02, 0.25, 0.5, 0.75, 0.98];
      const pts = want.map((w) => { let best = -1, bd = 1e9; for (let n = 0; n < nav.N; n += 7) { if (f[n] >= 1e8) continue; const p = 1 - f[n] / total; const d = Math.abs(p - w); if (d < bd) { bd = d; best = n; } } return best; });
      const out = { ch: window.session.chapterIdx, nodes: nav.N, lights: L.lights.length, meshes: 0, samples: [] };
      L.root.traverse((o) => { if (o.isMesh) out.meshes++; });
      g.director.enabled = false;
      const info = g.renderer.r.info;
      info.autoReset = false; // the post chain renders several passes per frame
      for (const n of pts) {
        g.player.teleport(nav.nodeX(n), nav.nodeY[n], nav.nodeZ(n), g.player.yaw);
        g.advance(0.2);
        let calls = 0, tris = 0;
        for (let k = 0; k < 4; k++) {
          g.player.yaw += Math.PI / 2;
          g.advance(0.05);
          info.reset();
          g.renderer.render(0.016);
          calls = Math.max(calls, info.render.calls);
          tris = Math.max(tris, info.render.triangles);
        }
        out.samples.push({ p: +(1 - f[n] / total).toFixed(2), calls, ktris: Math.round(tris / 1000) });
      }
      // horde update cost
      const n = pts[2];
      g.player.teleport(nav.nodeX(n), nav.nodeY[n], nav.nodeZ(n), 0);
      g.cheats.godAll = true;
      g.director.enabled = true;
      g.director.spawnMob(40, { where: 'any', minD: 10, maxD: 30 });
      g.advance(3);
      const t0 = performance.now();
      g.advance(2);
      out.updMs = +((performance.now() - t0) / 120).toFixed(2);
      out.commons = g.infected.commons.length;
      return out;
    });
    console.log('PERF', JSON.stringify(r));
  }
};
