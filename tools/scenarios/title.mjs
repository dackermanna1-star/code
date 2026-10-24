export default async function ({ page, shot }) {
  await page.waitForTimeout(4000);
  await shot('title');
  // open settings
  await page.click('text=SETTINGS');
  await page.waitForTimeout(400);
  await shot('settings');
  await page.click('.settings-screen >> text=BACK');
  await page.waitForTimeout(300);
  await page.click('text=BRAWL');
  await page.waitForTimeout(2500);
  await shot('hud_start');
  // punch someone to get feedback on screen
  await page.evaluate(() => {
    const g = window.__game;
    const b = g.ai.brains.find((b) => b.arch.id !== 'boss' && b.ch.position.y < 1 && b.ch.position.z > 0 && b.ch.position.z < 10);
    const p = b.ch.position;
    g.player.ctrl.teleport({ x: p.x, y: p.y, z: p.z + 1.1 }, 0);
    g.player.ctrl.pitch = -0.15;
  });
  for (let i = 0; i < 6; i++) {
    await page.evaluate(() => window.__game.input.virtualTap('attack'));
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(600);
  await shot('hud_fight');
  console.log(await page.evaluate(() => JSON.stringify({ state: window.__game.state, fps: window.__game.fps.toFixed(1), rem: window.__game.director.remaining(), hp: window.__game.player.health })));
}
