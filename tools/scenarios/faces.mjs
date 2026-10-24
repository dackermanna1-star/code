export default async function ({ page, shot }) {
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    const g = window.__game;
    for (const c of g.characters) { c.yaw = c.desiredYaw = 0; c.teleport(c.position, 0); }
    g.player.teleport({ x: 0, y: 0, z: 6.5 }, 0);
    g.player.pitch = -0.05;
  });
  await page.waitForTimeout(800);
  await shot('front');
  await page.evaluate(() => {
    const g = window.__game;
    g.player.teleport({ x: -2.7, y: 0, z: 3.25 }, 0);
    g.player.pitch = 0.0;
  });
  await page.waitForTimeout(600);
  await shot('faces_left');
  await page.evaluate(() => {
    const g = window.__game;
    g.player.teleport({ x: 2.2, y: 0, z: 3.25 }, 0);
    g.player.pitch = 0.0;
  });
  await page.waitForTimeout(600);
  await shot('faces_right');
}
