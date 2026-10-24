export default async function ({ page, shot }) {
  await page.waitForTimeout(1500);
  const dump = (l) => page.evaluate((l) => { const g = window.__game; const c = g.engine.camera; return l + ' ' + JSON.stringify({ st: g.state, rot: [c.rotation.x, c.rotation.y, c.rotation.z].map((v) => v.toFixed(3)), pitch: g.player.ctrl.pitch.toFixed(3), yaw: g.player.ctrl.yaw.toFixed(3), alive: g.player.alive, shake: [g.camFx.trauma, g.camFx.rollKick.value].map((v) => v.toFixed(3)), parent: c.parent?.type, sceneMatch: c.parent === g.engine.scene }); }, l);
  console.log(await dump('r1'));
  await page.evaluate(() => { const g = window.__game; g.player.receiveHit({ attacker: null, damage: 999, type: 'blunt', part: 0, point: g.player.position.clone(), dir: new g.player.position.constructor(0,0,1), force: 100, source: 'melee', unblockable: true }); });
  await page.waitForTimeout(2000);
  console.log(await dump('dead'));
  await page.evaluate(() => window.__game.restart());
  await page.waitForTimeout(2500);
  console.log(await dump('r2'));
  await page.waitForTimeout(1500);
  console.log(await dump('r2b'));
}
