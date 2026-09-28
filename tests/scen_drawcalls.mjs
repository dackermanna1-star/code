// Draw-call breakdown at one spot: main pass vs moon shadow vs flashlight shadow.
// CH=2 P=0.98 QUALITY=high node tests/play.mjs tests/scen_drawcalls.mjs
export default async ({ page, evalg, wait }) => {
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?autostart=' + (process.env.CH || 2), { timeout: 180000 });
  for (let i = 0; i < 120; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  const r = await evalg((want) => {
    const g = window.game, L = g.level, nav = L.nav, f = nav.fields.toExit;
    const total = f[nav.nodeAt(...L.flowStart)] || 1;
    let best = -1, bd = 1e9;
    for (let n = 0; n < nav.N; n += 5) { if (f[n] >= 1e8) continue; const d = Math.abs(1 - f[n] / total - want); if (d < bd) { bd = d; best = n; } }
    g.director.enabled = false;
    g.player.teleport(nav.nodeX(best), nav.nodeY[best], nav.nodeZ(best), 0);
    g.advance(0.3);
    const info = g.renderer.r.info;
    info.autoReset = false;
    const measure = () => { let c = 0; for (let k = 0; k < 4; k++) { g.player.yaw += Math.PI / 2; g.advance(0.05); info.reset(); g.renderer.render(0.016); c = Math.max(c, info.render.calls); } return c; };
    const out = { all: measure() };
    const m = g.moon.castShadow; g.moon.castShadow = false; out.noMoon = measure();
    const fl = g.flashlight.castShadow; g.flashlight.castShadow = false; out.noShadows = measure(); g.moon.castShadow = m; g.flashlight.castShadow = fl;
    // mesh stats
    let casters = 0, meshes = 0, casterTris = 0;
    g.scene.traverse((o) => { if (o.isMesh || o.isInstancedMesh) { meshes++; if (o.castShadow) { casters++; } } });
    out.meshes = meshes; out.casters = casters; out.moonI = g.moon.intensity;
    return out;
  }, +(process.env.P || 0.98));
  console.log('CALLS', JSON.stringify(r));
};
