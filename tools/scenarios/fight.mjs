export default async function ({ page, shot }) {
  await page.waitForTimeout(3000);
  // find a seated hall patron and punch them
  const tgt = await page.evaluate(() => {
    const g = window.__game;
    const b = g.ai.brains.find((b) => b.arch.id === 'biker' && b.ch.position.y < 1 && b.state === 'activity');
    if (!b) return null;
    const p = b.ch.position;
    const yaw = b.ch.yaw;
    g.player.ctrl.teleport({ x: p.x + Math.sin(yaw) * 1.0, y: p.y, z: p.z + Math.cos(yaw) * 1.0 }, Math.atan2(-(p.x - (p.x + Math.sin(yaw))), -(p.z - (p.z + Math.cos(yaw)))));
    g.player.ctrl.pitch = -0.2;
    window.__tgt = b;
    return b.debugString();
  });
  console.log('target', tgt);
  await page.waitForTimeout(500);
  for (let i = 0; i < 4; i++) {
    await page.evaluate(() => window.__game.input.virtualTap('attack'));
    await page.waitForTimeout(300);
  }
  for (let k = 0; k < 6; k++) {
    await page.waitForTimeout(1500);
    const s = await page.evaluate(() => {
      const g = window.__game;
      const states = {};
      for (const b of g.ai.brains) states[b.state] = (states[b.state] || 0) + 1;
      return { hp: Math.round(g.player.health), intensity: g.ai.intensity.toFixed(2), brawl: g.ai.brawlStarted, states, tgt: window.__tgt.debugString(), alive: g.director.remaining() };
    });
    console.log(`t+${(k + 1) * 1.5}s`, JSON.stringify(s));
    // keep swinging at whatever is in front
    await page.evaluate(() => window.__game.input.virtualTap('attack'));
  }
  await shot('fight_view');
  await page.evaluate(() => { const g = window.__game; g.player.godMode = true; g.player.ctrl.teleport({ x: -12, y: 4.2, z: 3 }, -1.57); g.player.ctrl.pitch = -0.45; });
  await page.waitForTimeout(4000);
  await shot('fight_overview');
  const s = await page.evaluate(() => {
    const g = window.__game;
    const states = {};
    for (const b of g.ai.brains) states[b.state] = (states[b.state] || 0) + 1;
    return { states, alive: g.director.remaining(), sample: g.ai.brains.filter((b) => b.state === 'combat').slice(0, 6).map((b) => b.debugString() + ' -> ' + (b.target?.name ?? '-')) };
  });
  console.log('end', JSON.stringify(s, null, 1));
}
