// Crowd cost: InfectedManager update ms with N chasing commons, plus draw
// calls / triangles for one rendered frame. N=60 node tests/play.mjs tests/scen_crowdperf.mjs [url]
export default async ({ page, evalg, wait }) => {
  const base = process.argv[3] || process.env.TEST_URL || 'http://localhost:5180/';
  await page.goto(base + '?autostart=0', { timeout: 180000 });
  for (let i = 0; i < 180; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  const r = await evalg((N) => {
    const g = window.game;
    g.cheats.godAll = true; g.cheats.botsIdle = true; g.director.enabled = false;
    for (const c of [...g.infected.commons]) c.hp = 0;
    g.advance(0.5);
    const P = [40, 0.15, 30];
    g.player.teleport(P[0], P[1], P[2], 0);
    const nav = g.level.nav;
    let n = 0;
    for (let i = 0; i < N * 3 && n < N; i++) {
      const a = i * 2.4, d = 6 + (i % 7) * 2;
      const node = nav.nearestNode(P[0] + Math.cos(a) * d, P[1], P[2] + Math.sin(a) * d, 3);
      if (node < 0) continue;
      if (g.infected.spawnCommon(nav.nodeX(node), nav.nodeY[node], nav.nodeZ(node), { chase: true })) n++;
    }
    g.advance(1.0);
    const inf = g.infected;
    const orig = inf.update.bind(inf);
    let acc = 0, frames = 0;
    inf.update = (dt) => { const t0 = performance.now(); orig(dt); acc += performance.now() - t0; frames++; };
    const t0 = performance.now();
    g.advance(3);
    const total = performance.now() - t0;
    inf.update = orig;
    const info = g.renderer.r.info;
    info.autoReset = false; info.reset();
    const tr = performance.now();
    g.renderer.render(0.016);
    const rms = performance.now() - tr;
    return { commons: inf.commons.length, spawned: n, infMs: +(acc / frames).toFixed(3), frameMs: +(total / frames).toFixed(3), calls: info.render.calls, ktris: Math.round(info.render.triangles / 1000), renderMs: Math.round(rms) };
  }, +(process.env.N || 60));
  console.log('CROWDPERF', JSON.stringify(r));
};
