// AO check: same view with AO debug output, AO on, AO off (strength 0).
// CH=0 SPOT='[x,y,z,yaw,pitch]' QUALITY=medium node tests/play.mjs tests/scen_ao.mjs
export default async ({ page, evalg, wait, shot }) => {
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?autostart=' + (process.env.CH || 0), { timeout: 180000 });
  for (let i = 0; i < 150; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  const spot = JSON.parse(process.env.SPOT || '[21, 0.05, 15.5, 2.6, -0.25]');
  await evalg((s) => {
    const g = window.game;
    g.director.enabled = false; g.cheats.god = true; g.cheats.botsIdle = true;
    g.player.teleport(s[0], s[1], s[2], s[3]); g.player.pitch = s[4];
    g.survivors.forEach((q, i) => { if (q !== g.player) q.teleport(s[0] + 30, s[1], s[2] + 30 + i, 0); });
    g.advance(7);
    g.hud?.clearTransient?.(); if (g.hud?.title) { g.hud.title.style.opacity = 0; g.hud.titleT = 0; }
    document.querySelectorAll('.subline').forEach((e) => e.remove());
    const ao = g.renderer.ao;
    if (ao) ao.compMat.uniforms.debug.value = 1;
  }, spot);
  await wait(500);
  await shot('ao_debug');
  await evalg(() => { const ao = window.game.renderer.ao; if (ao) ao.compMat.uniforms.debug.value = 0; });
  await wait(400);
  await shot('ao_on');
  await evalg(() => { const ao = window.game.renderer.ao; if (ao) { ao.saved = ao.compMat.uniforms.strength.value; ao.compMat.uniforms.strength.value = 0; } });
  await wait(400);
  await shot('ao_off');
};
