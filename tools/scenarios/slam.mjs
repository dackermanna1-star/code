export default async function ({ page, shot }) {
  const frames = async (n) => { const f0 = await page.evaluate(() => window.__game.frameCount); await page.waitForFunction((t) => window.__game.frameCount >= t, f0 + n, { timeout: 160000 }); };
  await frames(2);
  const r = await page.evaluate(() => {
    const g = window.__game;
    window.__td = [];
    const T = g.props.props.find((p) => p.def.id.startsWith('table') && p.position(new g.player.position.constructor()).z > 0 && p.position(new g.player.position.constructor()).y < 0.5);
    const tp = T.position(new g.player.position.constructor());
    g.player.ctrl.teleport({ x: tp.x, y: 0.15, z: tp.z + 1.75 }, 0);
    g.player.ctrl.pitch = -0.6;
    const b = g.director.spawn('patron', new g.player.position.constructor(tp.x, 0.1, tp.z + 0.95), Math.PI);
    b.ch.stunTimer = 2;
    return { table: T.def.id, tp: tp.toArray(), npc: b.ch.name };
  });
  console.log(JSON.stringify(r));
  await page.evaluate(() => { const { events } = window.__game; });
  await frames(3);
  const grabbed = await page.evaluate(() => {
    const g = window.__game;
    const b = g.ai.brains[g.ai.brains.length - 1];
    b.ch.stunTimer = 2;
    return g.player.tryGrab(b.ch);
  });
  console.log('grabbed', grabbed);
  await frames(3);
  await page.evaluate(() => window.__game.input.virtualTap('attack'));
  await frames(2);
  await shot('slam_a');
  await frames(8);
  await shot('slam_b');
  console.log(await page.evaluate(() => { const g = window.__game; const b = g.ai.brains[g.ai.brains.length - 1]; return JSON.stringify({ hp: Math.round(b.ch.health), state: b.ch.state, hits: g.player.stats.hits, combo: g.player.combo }); }));
}
