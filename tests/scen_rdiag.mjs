// Render-cost diagnostic for character meshes (no screenshots unless SHOT=1):
// frame render ms with/without crowd, survivors and specials visible.
// URLQ='?campaign=deadair&autostart=0' N=20 node tests/play.mjs tests/scen_rdiag.mjs
export default async ({ page, evalg, wait, shot, logs }) => {
  const q = process.env.URLQ || '?campaign=deadair&autostart=0';
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + q, { timeout: 180000, waitUntil: 'commit' });
  for (let i = 0; i < 300; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  const r = await evalg((N) => {
    const g = window.game;
    g.cheats.godAll = true; g.cheats.botsIdle = true; g.director.enabled = false;
    for (const c of [...g.infected.commons]) c.hp = 0;
    g.advance(0.3);
    const time = (label) => { const info = g.renderer.r.info; info.autoReset = false; info.reset(); const t0 = performance.now(); g.renderer.render(0.016); const ms = performance.now() - t0; return { label, ms: Math.round(ms), calls: info.render.calls, ktris: Math.round(info.render.triangles / 1000) }; };
    const out = [];
    out.push(time('warm'));
    out.push(time('base'));
    const p = g.player.pos, yaw = g.player.yaw;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const nav = g.level.nav; let n = 0;
    for (let i = 0; i < N * 4 && n < N; i++) {
      const d = 4 + (i % 5) * 1.2, s = ((i * 7) % 9 - 4) * 0.7;
      const node = nav.nearestNode(p.x + fx * d + rx * s, p.y, p.z + fz * d + rz * s, 2);
      if (node < 0) continue;
      if (g.infected.spawnCommon(nav.nodeX(node), nav.nodeY[node], nav.nodeZ(node), { idle: 'stand', outfit: ['airport', 'office', 'civilian', 'worker'][i % 4] })) n++;
    }
    g.advance(0.3);
    out.push(time('crowd-compile'));
    out.push(time('crowd'));
    out.push(time('crowd2'));
    g.infected.crowd.mesh.visible = false;
    out.push(time('crowd-hidden'));
    g.infected.crowd.mesh.visible = true;
    for (const s of g.survivors) s.model?.rig && (s.model.rig.root.visible = false);
    out.push(time('survivors-hidden'));
    for (const s of g.survivors) if (s !== g.player) s.model.rig.root.visible = true;
    // inf update cost
    const inf = g.infected; const orig = inf.update.bind(inf); let acc = 0, fr = 0;
    for (const c of inf.commons) c.alert?.(0, g.player);
    inf.update = (dt) => { const t0 = performance.now(); orig(dt); acc += performance.now() - t0; fr++; };
    g.advance(2); inf.update = orig;
    return { spawned: n, frames: out, infMs: +(acc / fr).toFixed(3), commons: inf.commons.length, errs: g.errCount || 0 };
  }, +(process.env.N || 20));
  console.log('RDIAG', JSON.stringify(r));
  if (process.env.SHOT) { await evalg(() => { window.game.hud.root.style.display = 'none'; }); await shot(process.env.SHOT); }
  console.log('errors', logs.filter((l) => /error/i.test(l)).length, logs.filter((l) => /error/i.test(l)).slice(0, 5).join('\n'));
};
