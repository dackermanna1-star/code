// Chapter 2 boot check: load, report nav/boxes/lights stats, progress at start/end, errors.
export default async ({ page, evalg, wait, shot }) => {
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?autostart=1');
  let st;
  for (let i = 0; i < 120; i++) { await wait(1000); st = await evalg(() => window.session?.state); if (st === 'playing') break; }
  console.log('state', st);
  const r = await evalg(() => {
    const g = window.game, L = g.level;
    g.director.enabled = false; g.cheats.botsIdle = true; g.cheats.god = true;
    g.advance(1);
    const b = L.bounds;
    return {
      nav: L.nav.N, navMs: Math.round(L.navBuildMs), loadMs: Math.round(g.loadMs), boxes: L.col.n, lights: L.lights.length, meshes: L.meshes.length,
      bounds: [b.minX, b.minY, b.minZ, b.maxX, b.maxY, b.maxZ].map((v) => Math.round(v)),
      progStart: L.progressAt(...L.flowStart), progEnd: L.progressAt(...L.flowEnd),
      player: [g.player.pos.x, g.player.pos.y, g.player.pos.z].map((v) => +v.toFixed(2)),
      items: g.items.items.length, doors: L.doors.length, usables: g.usables.length,
    };
  });
  console.log(JSON.stringify(r));
  if (process.env.SHOT) await shot('ch2_boot');
};
