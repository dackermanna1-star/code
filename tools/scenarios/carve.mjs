export default async function ({ page, shot }) {
  await page.waitForTimeout(1500);
  // make target tanky so we can see progressive carving while standing
  await page.evaluate(() => {
    const g = window.__game;
    const c = g.characters[3];
    c.stats.maxHealth = c.health = 1000;
    c.stats.poise = 100000;
    g.player.ctrl.teleport({ x: c.position.x, y: 0, z: c.position.z + 1.0 }, 0);
    g.player.ctrl.pitch = 0.1;
  });
  for (let i = 0; i < 16; i++) {
    await page.evaluate(() => window.__game.input.virtualTap('attack'));
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(500);
  await page.evaluate(() => { const g = window.__game; const c = g.characters[3]; g.player.ctrl.teleport({ x: c.position.x + 0.15, y: 0, z: c.position.z + 0.95 }, 0.1); g.player.ctrl.pitch = 0.12; g.player.vm.root.visible = false; });
  await page.waitForTimeout(300);
  await shot('carved_face');
  const info = await page.evaluate(() => {
    const c = window.__game.characters[3];
    const v = c.model.voxels[2];
    return { hp: Math.round(c.health), integrity: v ? v.integrity.toFixed(2) : 'none', headDmg: Math.round(c.partDamage[2]) };
  });
  console.log(JSON.stringify(info));
  await page.evaluate(() => { const g = window.__game; const c = g.characters[3]; g.player.ctrl.teleport({ x: c.position.x + 0.9, y: 0, z: c.position.z + 0.6 }, 0.9); });
  await page.waitForTimeout(300);
  await shot('carved_side');
  await page.evaluate(() => { const g = window.__game; g.player.vm.root.visible = true; const c = g.characters[6]; g.player.ctrl.teleport({ x: c.position.x, y: 0, z: c.position.z + 1.0 }, 0); g.player.ctrl.pitch = 0.0;});
  await page.waitForTimeout(300);
  await shot('guard_view');
}
