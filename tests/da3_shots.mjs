// Dead Air ch3 screenshot tour. QUALITY=medium node tests/play.mjs tests/da3_shots.mjs
// VIEWS='name,x,y,z,yaw,pitch;...' overrides the default list. BLAST=1 adds the barricade blast shots.
export default async ({ page, evalg, wait, shot }) => {
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?campaign=deadair&autostart=2', { timeout: 180000 });
  for (let i = 0; i < 150; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  await evalg(() => { const g = window.game; g.director.enabled = false; g.cheats.botsIdle = true; g.cheats.god = true; g.cheats.godAll = true; for (const c of g.infected.commons) c.hp = 0; window.session.menu?.clear?.(); });
  for (let i = 0; i < 60; i++) { await wait(1000); if ((await evalg(() => window.__texStats?.pending ?? 0)) === 0) break; }
  await evalg(() => { window.game.voice.script = () => {}; const st = document.createElement('style'); st.textContent = 'body *:not(canvas){visibility:hidden !important} canvas{visibility:visible !important}'; document.head.appendChild(st); });
  const P = Math.PI;
  let views = [
    ['a_safe', 6.6, 0.3, 6.6, P * 0.75, -0.05],
    ['b_kessler', 57, 0, 2, -P / 2, 0.02],
    ['c_frontyard', 72, 0, -2, -P / 2 - 0.35, 0.05],
    ['d_level2', 112, 4.4, -18, -P / 2 - 0.2, 0.0],
    ['e_barricade', 134, 0, -1, -P / 2, 0.02],
    ['g_alley', 163.5, 0, -3, -P / 2, 0.0],
    ['h_workshop', 201.2, 0.15, 12.2, -P / 2 - 0.2, 0.0],
    ['i_plant', 234, 0, 14, -P / 2 + 0.35, 0.08],
    ['j_garage', 279, 0, 2, -P * 0.75, 0.0],
    ['k_alarm', 307, 3.4, 12, 0.05, 0.0],
    ['l_p2', 283, 6.8, -11, -P / 2 - 0.3, 0.0],
    ['m_skybridge', 312.6, 6.8, -1, -P / 2, 0.0],
    ['n_end', 335.4, 6.8, 2.2, -P * 0.62, -0.05],
  ];
  if (process.env.VIEWS) views = process.env.VIEWS.split(';').map((v) => { const a = v.split(','); return [a[0], ...a.slice(1).map(Number)]; });
  for (const [name, x, y, z, yaw, pitch] of views) {
    await evalg(([x, y, z, yaw, pitch]) => { const g = window.game; g.player.teleport(x, y, z, yaw); g.player.pitch = pitch; g.advance(0.5); }, [x, y, z, yaw, pitch]);
    await wait(1500);
    await shot('da3_' + name);
  }
  if (process.env.BLAST) {
    await evalg(() => { const g = window.game; g.player.teleport(128, 0, 2, -Math.PI / 2 + 0.1); g.player.pitch = 0.08; g.advance(0.3); const b = g.level.da3.bar; const c = b.cans[1]; c.hit(c.x, c.y + 0.8, c.z, g.player.pos.clone().set(1, 0, 0), g.player); g.advance(1.9); });
    await wait(300);
    await shot('da3_f_blast');
    await evalg(() => { const g = window.game; for (let i = 0; i < 40; i++) g.advance(0.1); g.player.teleport(142, 0, 1.5, -Math.PI / 2 + 0.15); g.advance(0.3); });
    await wait(1200);
    await shot('da3_f_after');
  }
  const errs = await evalg(() => window.game.errCount || 0);
  console.log('errs', errs);
};
