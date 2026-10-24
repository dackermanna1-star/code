export default async function ({ page, shot }) {
  await page.waitForTimeout(2500);
  await page.evaluate(() => { const g = window.__game; g.player.ctrl.teleport({ x: 0, y: 0.15, z: 8 }, 0); g.player.ctrl.pitch = -0.05; });
  await page.waitForTimeout(800);
  await shot('post_on');
  await page.evaluate(() => { window.__game.post.enabled = false; });
  await page.waitForTimeout(800);
  await shot('post_off');
}
