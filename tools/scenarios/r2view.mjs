export default async function ({ page, shot }) {
  const frames = async (n) => { const f0 = await page.evaluate(() => window.__game.frameCount); await page.waitForFunction((t) => window.__game.frameCount >= t, f0 + n, { timeout: 120000 }); };
  await frames(3);
  await page.evaluate(() => { const g = window.__game; g.player.receiveHit({ attacker: null, damage: 999, type: 'blunt', part: 0, point: g.player.position.clone(), dir: new g.player.position.constructor(0,0,1), force: 100, source: 'melee', unblockable: true }); });
  await frames(12);
  await shot('dead');
  await page.waitForFunction(() => window.__game.state === 'over', null, { timeout: 120000 });
  await frames(2);
  await shot('end');
  await page.click('text=AGAIN');
  await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 120000 });
  await frames(4);
  await shot('r2');
}
