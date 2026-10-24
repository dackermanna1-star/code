export default async function ({ page, shot }) {
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const g = window.__game;
    const c = g.characters[0];
    g.player.ctrl.teleport({ x: c.position.x, y: 0, z: c.position.z + 1.05 }, 0);
    g.player.ctrl.pitch = 0.05;
  });
  await page.waitForTimeout(400);
  await shot('punch_0');
  for (let i = 0; i < 6; i++) {
    await page.evaluate(() => window.__game.input.virtualTap('attack'));
    await page.waitForTimeout(i === 1 ? 90 : 330);
    if (i === 1) await shot('punch_mid');
  }
  await shot('punch_after6');
  const info = await page.evaluate(() => {
    const c = window.__game.characters[0];
    return { hp: c.health, state: c.state, partDmg: Array.from(c.partDamage).map((v) => Math.round(v)), particles: window.__game.fx.particles.activeCount };
  });
  console.log('after 6 punches', JSON.stringify(info));
  for (let i = 0; i < 6; i++) {
    await page.evaluate(() => window.__game.input.virtualTap('attack'));
    await page.waitForTimeout(330);
  }
  await shot('punch_after12');
  await page.evaluate(() => window.__game.input.virtualTap('kick'));
  await page.waitForTimeout(150);
  await shot('kick_mid');
  await page.waitForTimeout(1200);
  await shot('kick_after');
  const info2 = await page.evaluate(() => {
    const c = window.__game.characters[0];
    return { hp: c.health, state: c.state, alive: c.alive, decals: window.__game.fx.decals.mesh.count, particles: window.__game.fx.particles.activeCount };
  });
  console.log('after kick', JSON.stringify(info2));
  await page.evaluate(() => { const g = window.__game; g.player.ctrl.pitch = -0.5; });
  await page.waitForTimeout(300);
  await shot('floor_view');
}
