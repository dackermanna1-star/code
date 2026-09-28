// Dead Air 5 finale diagnostics (logic-only): skip to the pump, advance, report where the horde is.
export default async ({ evalg, wait, page }) => {
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?campaign=deadair&autostart=4', { timeout: 180000 });
  for (let i = 0; i < 400; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  const r = await evalg((expr) => {
    const g = window.game, L = g.level, S = L.da5, F = L.finale, p = g.player;
    g.noRender = true; g.cheats.god = true; g.cheats.godAll = true; window.session.menu?.clear?.();
    p.teleport(-28, 6.02, -9, 3.1); g.advance(0.3);
    for (let i = 0; i < 40 && F.crash !== 'done'; i++) g.advance(0.5);
    p.teleport(S.radio.pos.x - 1, 0.02, S.radio.pos.z, 0); S.radio.onUse(p);
    for (let i = 0; i < 60 && !S.pump.enabled; i++) g.advance(0.5);
    for (const s of g.survivors) if (s !== p) s.teleport(S.pump.pos.x - 2, 0.02, S.pump.pos.z - 3, 0);
    p.teleport(S.pump.pos.x - 0.6, 0.02, S.pump.pos.z - 1.2, 0); g.advance(0.2);
    S.pump.onUse(p);
    try { return new Function('g', 'L', 'S', 'F', 'p', expr)(g, L, S, F, p); } catch (e) { return 'ERR ' + e.message + e.stack; }
  }, process.env.EXPR || 'return 1');
  console.log(typeof r === 'string' ? r : JSON.stringify(r));
};
