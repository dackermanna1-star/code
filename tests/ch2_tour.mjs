// Visual tour of chapter 2. SPOTS='name1,name2' limits the tour; POWER=1 starts the generator first.
const ALL = [
  ['c2_safe', -7.5, 0, 7.8, -2.1, -0.08],
  ['c2_saferoom_door', -6, 0, 3, -2.3, -0.05],
  ['c2_concourse', 2, 0, 5.2, -1.75, -0.02],
  ['c2_concourse2', 27, 0, 18.5, 0.9, -0.02],
  ['c2_turnstiles', 12, 0, 12, -1.6, -0.02],
  ['c2_stairs', 29.5, 0, 5.5, -1.57, -0.25],
  ['c2_platform', 42, -5, 4.5, -1.35, -0.05],
  ['c2_platform2', 90, -5, 3.5, 1.3, -0.04],
  ['c2_car', 45.5, -5, 11.1, -1.57, -0.05],
  ['c2_fartrack', 45, -6.2, 17.5, -1.57, 0.02],
  ['c2_tunnel', 108, -6.2, 13, -1.57, -0.02],
  ['c2_wreck', 121, -6.2, 12.6, -1.5, -0.02],
  ['c2_wreck2', 136.5, -6.2, 13.5, -1.2, -0.02],
  ['c2_tunnelend', 152, -6.2, 16, -1.7, -0.02],
  ['c2_corridor', 165.2, -6.2, 22, 3.14, -0.05],
  ['c2_elec', 162, -6.2, 28.3, 1.57, -0.05],
  ['c2_hall', 165.2, -6.2, 41, 3.0, 0.05],
  ['c2_hall2', 178, -1.6, 43.3, 2.2, -0.25],
  ['c2_gate', 170, -6.2, 55, -1.57, 0.05],
  ['c2_locker', 162.2, -6.2, 73.2, 2.6, -0.3],
  ['c2_dock', 184, -6.2, 55, -1.57, 0.15],
  ['c2_office', 207, 0, 55, -1.4, -0.05],
  ['c2_cubicles', 222.5, 0, 45.5, 2.8, -0.05],
  ['c2_lobby', 214, 0, 61.5, -1.57, -0.05],
  ['c2_alley', 234.6, 0.15, 64.5, 3.14, 0.02],
  ['c2_street', 234.8, 0.15, 69.5, -2.3, 0.02],
  ['c2_street2', 262, 0, 77, 1.7, 0.03],
  ['c2_pawn_out', 250, 0, 80, -2.8, 0.05],
  ['c2_pawn_in', 252, 0.15, 89.2, -2.3, -0.05],
  ['c2_walkway', 103, -6.2, 17.5, -1.75, 0.02],
  ['c2_wreck3', 117.5, -6.2, 15.5, -1.45, 0.0],
  ['c2_hall3', 150, -1.6, 60, -2.2, -0.2],
];
export default async ({ page, evalg, wait }) => {
  const shot = async (name) => { const t0 = Date.now(); try { await page.screenshot({ path: `tests/out/${name}.png`, timeout: 300000 }); console.log('shot', name, Date.now() - t0, 'ms'); } catch (e) { console.log('shot failed', name, e.message.split('\n')[0]); } };
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?autostart=1');
  for (let i = 0; i < 90; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  await evalg((HUDFLAG) => { const g = window.game; g.director.enabled = false; g.cheats.botsIdle = true; g.cheats.god = true; for (const s of g.survivors) if (s !== g.player) s.teleport(-6, 0, 3, 0); if (!HUDFLAG) { g.hud.show(false); window.session.menu.clear(); } }, !!process.env.HUD);
  if (process.env.POWER) await evalg(() => { const g = window.game; g.level.ch2Generator.ev.start(g.player); g.advance(6); });
  const only = process.env.SPOTS ? process.env.SPOTS.split(',') : null;
  for (const [name, x, y, z, yaw, pitch] of ALL) {
    if (only && !only.includes(name)) continue;
    await evalg(([x, y, z, yaw, pitch, FL]) => { const g = window.game; g.player.teleport(x, y, z, yaw); g.player.pitch = pitch; g.player.flashlight = FL; g.advance(0.4); }, [x, y, z, yaw, pitch, !!process.env.FLASH]);
    await wait(500);
    await shot(name + (process.env.POWER ? '_pw' : '') + (process.env.FLASH ? '_fl' : ''));
  }
  console.log(JSON.stringify(await evalg(() => ({ fps: window.game.fps, calls: window.game.renderer.r.info.render.calls, tris: window.game.renderer.r.info.render.triangles }))));
};
