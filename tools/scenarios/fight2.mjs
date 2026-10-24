export default async function ({ page, shot }) {
  await page.waitForTimeout(2500);
  await page.evaluate(() => { window.__game.running = false; });
  const step = (s) => page.evaluate((s) => window.__game.simulate(s), s);
  const report = (label) => page.evaluate((label) => {
    const g = window.__game;
    const states = {};
    for (const b of g.ai.brains) states[b.state] = (states[b.state] || 0) + 1;
    return label + ' ' + JSON.stringify({ t: g.time.elapsed.toFixed(1), hp: Math.round(g.player.health), int: g.ai.intensity.toFixed(2), states, alive: g.director.remaining(), props: g.props.props.length, decals: g.fx.decals.mesh.count });
  }, label);
  await step(2);
  console.log(await report('start'));
  await page.evaluate(() => {
    const g = window.__game;
    const b = g.ai.brains.find((b) => b.arch.id === 'biker' && b.ch.position.y < 1 && b.state === 'activity');
    const p = b.ch.position;
    g.player.ctrl.teleport({ x: p.x + 1.0, y: p.y, z: p.z }, Math.PI / 2);
    g.player.ctrl.pitch = -0.25;
    window.__tgt = b;
  });
  await step(0.3);
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => window.__game.input.virtualTap('attack'));
    await step(0.35);
  }
  console.log(await report('after punches'));
  // god mode & let the brawl evolve while the player keeps swinging occasionally
  await page.evaluate(() => { window.__game.player.godMode = true; });
  for (let k = 0; k < 8; k++) {
    for (let j = 0; j < 6; j++) {
      await page.evaluate(() => {
        const g = window.__game;
        // aim at the nearest hostile
        let best = null, bd = 1e9;
        for (const b of g.ai.brains) { if (!b.ch.alive || !b.ch.upright) continue; const d = b.ch.position.distanceTo(g.player.position); if (d < bd) { bd = d; best = b; } }
        if (best && bd < 2.2) {
          const p = best.ch.position, me = g.player.position;
          g.player.ctrl.yaw = Math.atan2(-(p.x - me.x), -(p.z - me.z));
          g.player.ctrl.pitch = 0.0;
          g.input.virtualTap(Math.random() < 0.2 ? 'kick' : 'attack');
        }
      });
      await step(0.5);
    }
    console.log(await report(`t${k}`));
  }
  const s = await page.evaluate(() => {
    const g = window.__game;
    return g.ai.brains.filter((b) => b.ch.alive).slice(0, 14).map((b) => b.debugString() + ' -> ' + (b.target?.name ?? '-'));
  });
  console.log(s.join('\n'));
  await page.evaluate(() => { const g = window.__game; g.player.ctrl.teleport({ x: -12, y: 4.2, z: 3 }, -1.57); g.player.ctrl.pitch = -0.5; g.simulate(0.1); g.skipRender = false; g.stepFrames(1); });
  await shot('brawl_overview');
}
