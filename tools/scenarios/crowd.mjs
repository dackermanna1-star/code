export default async function ({ page, shot, logs }) {
  await page.waitForTimeout(4000);
  const info = await page.evaluate(() => {
    const g = window.__game;
    const states = {};
    for (const b of g.ai.brains) states[b.state] = (states[b.state] || 0) + 1;
    return { npcs: g.characters.length, states, frameMs: g.frameMs.toFixed(1) };
  });
  console.log('t=4s', JSON.stringify(info));
  await page.evaluate(() => { const g = window.__game; g.player.ctrl.teleport({ x: 0, y: 0, z: 10.6 }, 0); g.player.ctrl.pitch = 0.0; });
  await page.waitForTimeout(6000);
  const info2 = await page.evaluate(() => {
    const g = window.__game;
    const states = {};
    for (const b of g.ai.brains) states[b.state] = (states[b.state] || 0) + 1;
    return { states, sample: g.ai.brains.slice(0, 8).map((b) => b.debugString()) };
  });
  console.log('t=10s', JSON.stringify(info2, null, 1));
  await shot('crowd_hall');
  await page.evaluate(() => { const g = window.__game; g.player.ctrl.teleport({ x: -10.5, y: 0, z: 6 }, 0.9); g.player.ctrl.pitch = -0.05; });
  await page.waitForTimeout(1500);
  await shot('crowd_bar');
  await page.evaluate(() => { const g = window.__game; g.player.ctrl.teleport({ x: -12, y: 4.2, z: 9.5 }, -2.4); g.player.ctrl.pitch = -0.35; });
  await page.waitForTimeout(1500);
  await shot('crowd_from_balcony');
}
