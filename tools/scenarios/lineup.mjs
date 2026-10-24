export default async function ({ page, shot }) {
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const g = window.__game;
    g.player.teleport({ x: 0, y: 0, z: 6.5 }, 0);
    g.player.pitch = -0.05;
  });
  await page.waitForTimeout(800);
  await shot('lineup');
  await page.evaluate(() => {
    const g = window.__game;
    g.player.teleport({ x: -3, y: 0, z: 3.6 }, 0);
    g.player.pitch = -0.1;
  });
  await page.waitForTimeout(600);
  await shot('lineup_close');
}
