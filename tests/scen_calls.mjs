// Draw calls / triangles at 5 route points (max over 4 view directions), like
// scen_perf without the horde. CHS=0 QUALITY=medium node tests/play.mjs tests/scen_calls.mjs
export default async ({ page, evalg, wait }) => {
  const chs = (process.env.CHS || '0').split(',').map(Number);
  for (const ch of chs) {
    await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?autostart=' + ch, { timeout: 180000 });
    for (let i = 0; i < 150; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
    const r = await evalg(() => {
      const g = window.game, L = g.level, nav = L.nav, f = nav.fields.toExit;
      const total = f[nav.nodeAt(...L.flowStart)] || 1;
      const want = [0.02, 0.25, 0.5, 0.75, 0.98];
      const pts = want.map((w) => { let best = -1, bd = 1e9; for (let n = 0; n < nav.N; n += 7) { if (f[n] >= 1e8) continue; const p = 1 - f[n] / total; const d = Math.abs(p - w); if (d < bd) { bd = d; best = n; } } return best; });
      const out = { ch: window.session.chapterIdx, meshes: 0, loadMs: Math.round(g.loadMs), samples: [] };
      L.root.traverse((o) => { if (o.isMesh) out.meshes++; });
      g.director.enabled = false;
      const info = g.renderer.r.info;
      info.autoReset = false;
      let sum = 0;
      for (const n of pts) {
        g.player.teleport(nav.nodeX(n), nav.nodeY[n], nav.nodeZ(n), g.player.yaw);
        g.advance(0.2);
        let calls = 0, tris = 0;
        for (let k = 0; k < 4; k++) { g.player.yaw += Math.PI / 2; g.advance(0.05); info.reset(); g.renderer.render(0.016); calls = Math.max(calls, info.render.calls); tris = Math.max(tris, info.render.triangles); }
        sum += calls;
        out.samples.push({ p: +(1 - f[n] / total).toFixed(2), calls, ktris: Math.round(tris / 1000) });
      }
      out.avgCalls = Math.round(sum / pts.length);
      const t0 = performance.now(); g.advance(1); out.updMs = +((performance.now() - t0) / 60).toFixed(2);
      return out;
    });
    console.log('CALLS', JSON.stringify(r));
  }
};
