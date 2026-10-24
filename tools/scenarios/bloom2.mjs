export default async function ({ page, shot }) {
  const frames = async (n) => { const f0 = await page.evaluate(() => window.__game.frameCount); await page.waitForFunction((t) => window.__game.frameCount >= t, f0 + n, { timeout: 160000 }); };
  await page.evaluate(() => { const g = window.__game; g.hud.show(false); g.player.ctrl.teleport({ x: 1.5, y: 0.15, z: 5.5 }, 0.15); g.player.ctrl.pitch = 0.05; });
  await frames(4);
  await shot('stage_bloom');
  await page.evaluate(() => { window.__game.post.setBloom(false); });
  await frames(3);
  await shot('stage_nobloom');
}
