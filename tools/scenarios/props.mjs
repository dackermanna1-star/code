export default async function ({ page, shot }) {
  await page.waitForTimeout(2000);
  await page.evaluate(() => {
    const g = window.__game;
    g.player.ctrl.teleport({ x: 2, y: 0, z: 9.5 }, 0.35);
    g.player.ctrl.pitch = -0.25;
  });
  await page.waitForTimeout(600);
  await shot('props_overview');
  // pick up the bat
  await page.evaluate(() => {
    const g = window.__game;
    g.player.ctrl.teleport({ x: -4, y: 0, z: 7.3 }, 0);
    g.player.ctrl.pitch = -0.75;
  });
  await page.waitForTimeout(400);
  const focus = await page.evaluate(() => window.__game.interaction.focus?.label ?? 'none');
  console.log('focus:', focus);
  await page.evaluate(() => window.__game.input.virtualTap('interact'));
  await page.waitForTimeout(500);
  const held = await page.evaluate(() => window.__game.player.weapon?.name ?? 'none');
  console.log('holding:', held);
  await page.evaluate(() => { const g = window.__game; g.player.ctrl.pitch = 0; });
  await page.waitForTimeout(300);
  await shot('holding_weapon');
  // swing at the bouncer
  await page.evaluate(() => {
    const g = window.__game;
    const c = g.characters[1];
    g.player.ctrl.teleport({ x: c.position.x, y: 0, z: c.position.z + 1.4 }, 0);
    g.player.ctrl.pitch = 0.05;
  });
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.__game.input.virtualTap('attack'));
    await page.waitForTimeout(i === 0 ? 140 : 600);
    if (i === 0) await shot('bat_swing');
  }
  await page.waitForTimeout(400);
  await shot('bat_after');
  const st = await page.evaluate(() => { const c = window.__game.characters[1]; return { hp: Math.round(c.health), state: c.state }; });
  console.log('bouncer', JSON.stringify(st));
  // throw the bat at the waitress
  await page.evaluate(() => {
    const g = window.__game;
    const c = g.characters[4];
    g.player.ctrl.teleport({ x: c.position.x, y: 0, z: c.position.z + 4 }, 0);
    g.player.ctrl.pitch = 0.0;
    g.input.virtualTap('throw');
  });
  await page.waitForTimeout(150);
  await shot('throw_mid');
  await page.waitForTimeout(700);
  await shot('throw_after');
  const st2 = await page.evaluate(() => { const c = window.__game.characters[4]; return { hp: Math.round(c.health), state: c.state, props: window.__game.props.props.length }; });
  console.log('waitress', JSON.stringify(st2));
}
