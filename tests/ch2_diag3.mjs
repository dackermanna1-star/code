// Screenshot a list of spots one by one with timing (detect GPU hangs).
export default async ({ page, evalg, wait, shot }) => {
  page.on('crash', () => console.log('PAGE CRASHED'));
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?autostart=1');
  for (let i = 0; i < 90; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  await evalg(() => { const g = window.game; g.director.enabled = false; g.cheats.botsIdle = true; g.cheats.god = true; g.hud.show(false); window.session.menu.clear(); });
  const pts = JSON.parse(process.env.PTS || '[["a",162.2,-6.2,73.2,2.6,-0.3]]');
  for (const [name, x, y, z, yaw, pitch] of pts) {
    await evalg(([x, y, z, yaw, pitch, FL]) => { const g = window.game; g.player.teleport(x, y, z, yaw); g.player.pitch = pitch; g.player.flashlight = FL; g.advance(0.3); }, [x, y, z, yaw, pitch, !process.env.NOFLASH]);
    const t0 = Date.now();
    await shot(name);
    console.log(name, 'ms', Date.now() - t0);
  }
};
