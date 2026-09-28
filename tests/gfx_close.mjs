// Graphics close-up checks (fences, props, surfaces, post).
// QUALITY=medium node tests/play.mjs tests/gfx_close.mjs   (CH=0|1, SHOTS=a,b)
const CH = +(process.env.CH || 0);
const V = CH === 0 ? [
  // name, x, y, z, lookX, lookY, lookZ
  ['fence', 47, 18, 34, 49, 18.6, 31.2],
  ['fence_far', 45, 18, 40, 52, 18.8, 31.2],
  ['ac', 14.2, 18, 21.6, 14.2, 18.4, 18.3],
  ['crates', 8.9, 18, 28.6, 8.9, 18.5, 25.2],
  ['gravel', 20, 18, 30, 21, 17.9, 27],
  ['bench', 74, 0.15, 65.6, 74, 0.6, 62.8],
  ['pallets', 114.5, 0.15, 64.2, 117, 1.0, 68.4],
  ['office', 85.8, 7.2, 21.6, 101, 8, 30],
  ['broof', 40.6, 18, 41, 58, 20, 24],
  ['hangout', 24, 18, 35.4, 21, 18.3, 38.3],
  ['sawhorse', 27.5, 18, 36.6, 29.5, 18.3, 39],
  ['trashcan', 44.6, 14.4, 29.6, 42.5, 14.7, 28.6],
  ['gate', 59, 18, 35.5, 58, 19, 31.5],
  ['alley', 38.5, 0, 34, 34, 1, 27],
] : [
  ['street_fence', 66, 0.15, 108, 60, 1.2, 112.3],
  ['street_fence2', 80, 0.15, 104, 90, 1.5, 112.3],
];
export default async ({ page, evalg, wait, shot, logs }) => {
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?campaign=deadair&autostart=' + CH, { timeout: 180000 });
  for (let i = 0; i < 150; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  await evalg(() => { const g = window.game; g.director.enabled = false; g.cheats.botsIdle = true; g.cheats.god = true; g.cheats.godAll = true; window.session.menu?.clear?.(); for (const c of g.infected.commons) c.hp = 0; g.hud?.show?.(false); });
  const only = process.env.SHOTS ? process.env.SHOTS.split(',') : null;
  const list = only ? only.map((n) => V.find((v) => v[0] === n)).filter(Boolean) : V;
  for (const [name, x, y, z, lx, ly, lz] of list) {
    await evalg(([x, y, z, lx, ly, lz]) => {
      const g = window.game, P = g.player;
      P.teleport(x, y + 0.02, z, 0);
      const dx = lx - x, dy = ly - (y + 1.6), dz = lz - z;
      g.survivors.forEach((s, i) => { if (s !== P) s.teleport(x + Math.sin(Math.atan2(-dx, -dz)) * 2 + i * 0.3, y + 0.02, z + Math.cos(Math.atan2(-dx, -dz)) * 2, 0); });
      g.advance(1.2);
      P.yaw = Math.atan2(-dx, -dz); P.pitch = Math.atan2(dy, Math.hypot(dx, dz));
      for (const c of g.infected.commons) c.hp = 0;
      g.advance(0.2);
    }, [x, y, z, lx, ly, lz]);
    await wait(+(process.env.WAIT || 500));
    const calls = await evalg(() => { const g = window.game, r = g.renderer.r; r.info.autoReset = false; r.info.reset(); g.renderer.render(0.016); const o = { calls: r.info.render.calls, tris: r.info.render.triangles }; r.info.autoReset = true; return o; });
    console.log(name, JSON.stringify(calls));
    await shot('gfx' + CH + '_' + name);
  }
  const errs = logs.filter((l) => /error|Unknown material/i.test(l));
  console.log('errors:', errs.length, errs.slice(0, 5).join(' | '));
};
