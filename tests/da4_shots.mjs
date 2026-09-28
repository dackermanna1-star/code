// Dead Air ch4 screenshot tour. QUALITY=medium node tests/play.mjs tests/da4_shots.mjs
// VIEWS='name,x,y,z,yaw,pitch;...' overrides the default list.
export default async ({ page, evalg, wait, shot }) => {
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?campaign=deadair&autostart=3', { timeout: 180000 });
  for (let i = 0; i < 180; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  await evalg(() => { const g = window.game; g.director.enabled = false; g.cheats.botsIdle = true; g.cheats.god = true; g.cheats.godAll = true; for (const c of g.infected.commons) c.hp = 0; window.session.menu?.clear?.(); });
  for (let i = 0; i < 90; i++) { await wait(1000); if ((await evalg(() => window.__texStats?.pending ?? 0)) === 0) break; }
  await evalg(() => { window.game.voice.script = () => {}; const st = document.createElement('style'); st.textContent = 'body *:not(canvas){visibility:hidden !important} canvas{visibility:visible !important}'; document.head.appendChild(st); });
  const P = Math.PI, YD = 6.4;
  let views = [
    ['a_lanes', 97, 0, -11, P / 2 - 0.25, 0.04],
    ['b_atrium', 79, 0, -21, P / 2 - 0.2, 0.14],
    ['c_concourse', 49, YD, -25, P / 2 + 0.15, 0.02],
    ['d_gates', 24, YD, -27, 0.55, 0.03],
    ['e_bridge', 6, YD, -56, P, 0.0],
    ['f_apron', 10.5, 0, -80, P / 2 + 0.35, 0.1],
    ['g_club', -24, YD, -24, P * 0.85, 0.0],
    ['h_safe', -41, YD, -36.4, P / 2 + 0.2, -0.05],
    ['i_window', -45, YD, -34.2, 0.15, 0.0],
  ];
  if (process.env.VIEWS) views = process.env.VIEWS.split(';').map((v) => { const a = v.split(','); return [a[0], ...a.slice(1).map(Number)]; });
  for (const [name, x, y, z, yaw, pitch] of views) {
    await evalg(([x, y, z, yaw, pitch]) => { const g = window.game; g.player.teleport(x, y, z, yaw); g.player.pitch = pitch; g.advance(0.5); }, [x, y, z, yaw, pitch]);
    await wait(1500);
    await shot('da4_' + name);
  }
  const errs = await evalg(() => window.game.errCount || 0);
  console.log('errs', errs);
};
