// Dead Air 5: finale + escape screenshots. QUALITY=medium node tests/play.mjs tests/da5_cine.mjs
// Shots: da5_fin_waves (pump running, fuel gauge + wave), da5_fin_board (ramp down),
// da5_esc_taxi, da5_esc_takeoff (Evac 41 passing the burning wreck).
export default async ({ page, evalg, wait, shot }) => {
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?campaign=deadair&autostart=4', { timeout: 180000 });
  for (let i = 0; i < 400; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  for (let i = 0; i < 60; i++) { if (await evalg(() => (window.__texStats?.pending ?? 0) === 0)) break; await wait(1000); }
  const step = (fn, arg) => evalg(fn, arg);
  // skip the crash: run it logic-only, then jump to the radio/pump
  console.log(await step(() => {
    const g = window.game, L = g.level, S = L.da5, F = L.finale;
    g.cheats.god = true; g.cheats.godAll = true; window.session.menu?.clear?.();
    g.noRender = true;
    g.player.teleport(-28, 6.02, -9, 3.1); g.advance(0.3);
    for (let i = 0; i < 40 && F.crash !== 'done'; i++) g.advance(0.5);
    g.player.teleport(S.radio.pos.x - 1, 0.02, S.radio.pos.z, 0); S.radio.onUse(g.player);
    for (let i = 0; i < 60 && !S.pump.enabled; i++) g.advance(0.5);
    S.pump.onUse(g.player);
    for (let i = 0; i < 70; i++) { g.advance(0.5); for (const c of g.infected.commons) if (c.pos.distanceTo(g.player.pos) < 6) c.hp = 0; }
    g.noRender = false;
    g.player.teleport(34, 0.02, 60, -2.5); g.player.pitch = 0.02;
    return `crash ${F.crash} stage ${F.stage} fuel ${F.fuel.toFixed(0)} commons ${g.infected.commons.filter((c) => !c.dead).length}`;
  }));
  await wait(2500); await step(() => { window.game.player.pitch = 0.02; });
  await shot('da5_fin_waves');
  console.log(await step(() => {
    const g = window.game, L = g.level, S = L.da5, F = L.finale;
    g.noRender = true;
    F.fuel = 100; F.cap = 100; F.stage = 'final';
    for (let i = 0; i < 16; i++) { g.advance(0.5); for (const c of g.infected.commons) c.hp = 0; }
    g.noRender = false;
    g.player.teleport(S.plane.holdCentre[0] + 3, 0.02, S.plane.holdCentre[2] - 16, 0.15); g.player.pitch = 0.05;
    return `stage ${F.stage} ramp ${S.plane.ramp.toFixed(2)}/${S.plane.rampTarget.toFixed(2)}`;
  }));
  await wait(2500); await step(() => { window.game.player.pitch = 0.05; });
  await shot('da5_fin_board');
  console.log(await step(() => {
    const g = window.game, S = g.level.da5;
    const h = S.plane.holdCentre;
    g.survivors.forEach((s, i) => s.teleport(h[0] + (i % 2) - 0.5, h[1] + 0.05, h[2] + (i > 1 ? 1 : -1), 0));
    g.advance(0.3);
    return 'stage ' + g.level.finale.stage;
  }));
  await wait(4000);
  await shot('da5_esc_taxi');
  await evalg(() => { const g = window.game; g.noRender = true; g.advance(9.5); g.noRender = false; });
  await wait(1500);
  await shot('da5_esc_takeoff');
  await wait(9000);
  console.log('end', await evalg(() => window.session.state));
};
