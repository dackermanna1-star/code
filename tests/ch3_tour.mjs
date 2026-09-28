import { stubOthers } from './ch3_stub.mjs';
// Visual tour of chapter 3. SPOTS='[["name",x,y,z,yaw,pitch],...]' overrides the default list.
export default async ({ page, shot, evalg, wait }) => {
  await stubOthers(page);
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?autostart=2');
  for (let i = 0; i < 90; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  await evalg(() => { const g = window.game; g.director.enabled = false; g.cheats.botsIdle = true; g.cheats.god = true; g.hud.show(false); window.session.menu.clear(); if (g.viewmodel) g.viewmodel.visible = false; for (const s of g.survivors) if (s !== g.player) { s.teleport(2, 0.15, 1.5 + g.survivors.indexOf(s) * 0.6, 0); s.model?.setHidden(true); } });
  const spots = JSON.parse(process.env.SPOTS || '[]');
  for (const [name, x, y, z, yaw, pitch, adv] of spots) {
    await evalg(([x, y, z, yaw, pitch, adv]) => { const g = window.game; g.player.teleport(x, y, z, yaw); g.player.pitch = pitch; g.advance(adv ?? 0.6); if (g.player.flashlight !== undefined && y < -1) g.player.flashlight = true; }, [x, y, z, yaw, pitch, adv]);
    await wait(900);
    await shot('ch3_' + name);
  }
  console.log(JSON.stringify(await evalg(() => ({ fps: window.game.fps, calls: window.game.renderer.r.info.render.calls, tris: window.game.renderer.r.info.render.triangles }))));
};
