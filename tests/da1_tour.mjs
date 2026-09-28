// Dead Air ch1 visual tour: QUALITY=medium node tests/play.mjs tests/da1_tour.mjs
// SHOTS=name1,name2 to limit.
const V = [
  // name, x, y, z, lookX, lookY, lookZ, [setup]
  ['01_saferoom', 8.9, 18, 32.6, 4, 18.9, 26.5],
  ['02_greenhouse', 10.6, 18, 26.4, 26, 19.4, 28.5],
  ['03_greenhouse_out', 30.8, 18, 41.5, 15, 20.5, 27],
  ['04_plane', 25, 18, 35, 4, 45, 27, 'plane'],
  ['05_plank', 29.8, 18, 37.4, 60, 20, 32],
  ['06_broof', 40.6, 18, 41, 58, 20, 24],
  ['07_witch', 47.2, 14.4, 27.6, 48.5, 15.1, 17.6, 'witch'],
  ['08_corridor', 42, 14.4, 28.3, 60, 15.6, 28.2],
  ['09_hole', 50.6, 14.4, 30.4, 53.8, 13.2, 38.3],
  ['10_fireescape', 67.3, 10.8, 29.5, 96, 20, 62],
  ['11_chopper', 68.4, 7.24, 25.5, 75, 8.2, 39],
  ['12_office', 85.8, 7.2, 21.6, 101, 8, 30],
  ['13_lounge', 101.8, 7.2, 36.2, 84, 8, 43.5],
  ['14_trailer', 86.5, 4.05, 45.6, 114, 6, 66],
  ['15_street', 96, 0, 52, 116, 3, 67],
  ['16_kitchen', 105, 1.2, 80.2, 97, 2, 88],
  ['17_skyline', 20, 18, 42.5, 200, 30, -60],
];
export default async ({ page, evalg, wait, shot, logs }) => {
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?campaign=deadair&autostart=0', { timeout: 180000 });
  for (let i = 0; i < 150; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  await evalg(() => { const g = window.game; g.director.enabled = false; g.cheats.botsIdle = true; g.cheats.god = true; g.cheats.godAll = true; window.session.menu?.clear?.(); for (const c of g.infected.commons) c.hp = 0; g.hud?.show?.(false); });
  const only = process.env.SHOTS ? process.env.SHOTS.split(',') : null;
  for (const [name, x, y, z, lx, ly, lz, setup] of V) {
    if (only && !only.some((o) => name.includes(o))) continue;
    const info = await evalg(([x, y, z, lx, ly, lz, setup]) => {
      const g = window.game, P = g.player, S = g.level.da1;
      if (setup === 'witch' && !S.state.witch) { S.state.witch = g.director.spawnWitchAt(...S.witchSpot); S.state.witch.yaw = 0; }
      P.teleport(x, y + 0.02, z, 0);
      const dx = lx - x, dy = ly - (y + 1.6), dz = lz - z;
      P.yaw = Math.atan2(-dx, -dz); P.pitch = Math.atan2(dy, Math.hypot(dx, dz));
      // park the bots out of frame behind the camera
      g.survivors.forEach((s, i) => { if (s !== P) s.teleport(x - Math.sin(P.yaw) * -2 + i * 0.3, y + 0.02, z - Math.cos(P.yaw) * -2, P.yaw); });
      if (setup === 'plane') { S.lowPass(() => {}); g.advance(4.2); } else g.advance(1.5);
      P.yaw = Math.atan2(-dx, -dz); P.pitch = Math.atan2(dy, Math.hypot(dx, dz));
      for (const c of g.infected.commons) c.hp = 0;
      g.advance(0.2);
      return { calls: g.renderer.r.info.render.calls, tris: g.renderer.r.info.render.triangles, prog: g.level.progressAt(P.pos.x, P.pos.y, P.pos.z).toFixed(3) };
    }, [x, y, z, lx, ly, lz, setup]);
    await wait(+(process.env.WAIT || 600));
    const calls = await evalg(() => { const g = window.game, r = g.renderer.r; r.info.autoReset = false; r.info.reset(); g.renderer.render(0.016); const o = { calls: r.info.render.calls, tris: r.info.render.triangles }; r.info.autoReset = true; return o; });
    console.log(name, JSON.stringify(info), JSON.stringify(calls));
    await shot('da1_' + name);
  }
  console.log('errors:', logs.filter((l) => /error|Unknown material/i.test(l)).length);
};
