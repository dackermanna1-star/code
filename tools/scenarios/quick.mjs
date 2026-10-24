export default async function ({ page, shot }) {
  const frames = async (n) => { const f0 = await page.evaluate(() => window.__game.frameCount); await page.waitForFunction((t) => window.__game.frameCount >= t, f0 + n, { timeout: 200000 }); };
  await page.evaluate(() => { const g = window.__game; g.player.ctrl.teleport({ x: -8, y: 0.15, z: 5 }, 0.9); });
  await frames(3);
  await shot('quick');
  console.log(await page.evaluate(() => { const g = window.__game; const gl = g.engine.renderer.getContext(); return JSON.stringify({ err: gl.getError(), q: g.engine.quality.name, samples: g.post.sceneRT?.samples }); }));
}
