export default async function ({ page, shot }) {
  const frames = async (n) => { const f0 = await page.evaluate(() => window.__game.frameCount); await page.waitForFunction((t) => window.__game.frameCount >= t, f0 + n, { timeout: 120000 }); };
  const dump = (l) => page.evaluate((l) => { const g = window.__game; const c = g.engine.camera; c.updateMatrixWorld(); const e = c.matrixWorld.elements.map((v) => +v.toFixed(2)); return l + ' ' + JSON.stringify({ pos: c.position.toArray().map((v) => +v.toFixed(2)), rot: [c.rotation.x, c.rotation.y, c.rotation.z].map((v) => +v.toFixed(3)), order: c.rotation.order, mw: e, pp: g.player.position.toArray().map((v) => +v.toFixed(2)), alive: g.player.alive, scenePos: g.engine.scene.position.toArray(), sceneRot: g.engine.scene.rotation.toArray().slice(0,3), parentIsScene: c.parent === g.engine.scene, children: c.children.length }); }, l);
  await frames(3);
  console.log(await dump('r1'));
  await page.evaluate(() => { const g = window.__game; g.player.receiveHit({ attacker: null, damage: 999, type: 'blunt', part: 0, point: g.player.position.clone(), dir: new g.player.position.constructor(0,0,1), force: 100, source: 'melee', unblockable: true }); });
  await frames(12);
  console.log(await dump('dead'));
  await page.evaluate(() => window.__game.restart());
  await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 120000 });
  await frames(4);
  console.log(await dump('r2'));
  await shot('r2');
}
