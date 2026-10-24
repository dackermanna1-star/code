export default async function ({ page, shot }) {
  const info = () => page.evaluate(() => {
    const g = window.__game; const m = g.engine.renderer.info.memory;
    return JSON.stringify({ state: g.state, mode: g.mode, geo: m.geometries, tex: m.textures, progs: g.engine.renderer.info.programs?.length, chars: g.characters.length, bodies: g.physics.world.bodies.len(), npcs: g.director.npcs.length });
  });
  await page.waitForTimeout(3000);
  console.log('title', await info());
  await page.click('text=BRAWL');
  await page.waitForTimeout(1500);
  console.log('play', await info());
  // fight a bit
  await page.evaluate(() => { const g = window.__game; g.player.godMode = false; });
  await page.evaluate(() => {
    const g = window.__game;
    const b = g.ai.brains.find((b) => b.arch.id === 'patron' && b.ch.position.y < 1);
    const p = b.ch.position;
    g.player.ctrl.teleport({ x: p.x, y: p.y, z: p.z + 1.0 }, 0);
  });
  for (let i = 0; i < 10; i++) { await page.evaluate(() => window.__game.input.virtualTap('attack')); await page.waitForTimeout(250); }
  await shot('r1_fight');
  console.log('fight', await info());
  // die
  await page.evaluate(() => { const g = window.__game; g.player.receiveHit({ attacker: null, damage: 999, type: 'blunt', part: 0, point: g.player.position.clone(), dir: new g.player.position.constructor(0,0,1), force: 100, source: 'melee', unblockable: true }); });
  await page.waitForTimeout(4500);
  await shot('r1_end');
  console.log('end', await info());
  await page.click('text=AGAIN');
  await page.waitForTimeout(2500);
  console.log('round2', await info());
  await shot('r2_start');
  // round 3 via survival
  await page.evaluate(() => window.__game.startMode('survival', true));
  await page.waitForTimeout(7000);
  console.log('survival', await info());
  await shot('r3_survival');
  await page.evaluate(() => window.__game.quitToTitle());
  await page.waitForTimeout(2500);
  console.log('title2', await info());
}
