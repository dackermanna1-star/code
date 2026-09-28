// Gameplay-style screenshots of Dead Air ch1 (HUD on, survivors + infected in frame).
// QUALITY=medium node tests/play.mjs tests/da1_gameplay.mjs
const V = [
  // name, cam x,y,z, look x,y,z, infected count
  ['saferoom', 8.9, 18, 32.6, 4, 18.9, 26.5, 0],
  ['greenhouse', 10.6, 18, 26.4, 26, 19.4, 28.5, 3],
  ['plank', 29.8, 18, 37.4, 60, 20, 32, 4],
  ['roof', 40.6, 18, 41, 58, 20, 24, 5],
  ['corridor', 42, 14.4, 28.3, 60, 15.6, 28.2, 4],
  ['fireescape', 67.3, 10.8, 29.5, 96, 20, 62, 0],
  ['office', 85.8, 7.2, 21.6, 101, 8, 30, 4],
  ['street', 96, 0, 52, 116, 3, 67, 6],
];
export default async ({ page, evalg, wait, shot, logs }) => {
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?campaign=deadair&autostart=0', { timeout: 180000 });
  for (let i = 0; i < 150; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  await evalg(() => { const g = window.game; g.director.enabled = false; g.cheats.botsIdle = true; g.cheats.godAll = true; for (const c of g.infected.commons) c.hp = 0; g.advance(0.5); });
  for (const [name, x, y, z, lx, ly, lz, n] of V.filter((v) => !process.env.SHOTS || process.env.SHOTS.split(',').includes(v[0]))) {
    const info = await evalg(([x, y, z, lx, ly, lz, n]) => {
      const g = window.game, P = g.player, nav = g.level.nav;
      for (const c of g.infected.commons) c.hp = 0;
      g.advance(0.3);
      P.teleport(x, y + 0.02, z, 0);
      const dx = lx - x, dy = ly - (y + 1.6), dz = lz - z, d = Math.hypot(dx, dz);
      const fx = dx / d, fz = dz / d;
      // bots a few metres ahead, slightly to the sides
      g.survivors.filter((s) => s !== P).forEach((s, i) => {
        const a = 2.2 + i * 0.9, side = (i - 1) * 1.1;
        let px = x + fx * a - fz * side, pz = z + fz * a + fx * side;
        const k = nav.nearestNode(px, y, pz, 2); if (k >= 0) { px = nav.nodeX(k); pz = nav.nodeZ(k); }
        s.teleport(px, (k >= 0 ? nav.nodeY[k] : y) + 0.02, pz, Math.atan2(-dx, -dz));
      });
      // infected further ahead, charging the group
      for (let i = 0; i < n; i++) {
        const a = 7 + i * 1.3, side = ((i % 3) - 1) * 1.6;
        const k = nav.nearestNode(x + fx * a - fz * side, y, z + fz * a + fx * side, 3);
        if (k >= 0 && Math.abs(nav.nodeY[k] - y) < 2) { const c = g.infected.spawnCommon(nav.nodeX(k), nav.nodeY[k], nav.nodeZ(k)); if (c) { c.target = P; c.state = 'chase'; } }
      }
      g.advance(0.6);
      P.teleport(x, y + 0.02, z, 0);
      P.yaw = Math.atan2(-dx, -dz); P.pitch = Math.atan2(dy, d);
      g.advance(0.05);
      return { commons: g.infected.commons.length, prog: g.level.progressAt(x, y, z).toFixed(3) };
    }, [x, y, z, lx, ly, lz, n]);
    await wait(500);
    console.log(name, JSON.stringify(info));
    await shot('da1_play_' + name);
  }
  console.log('errors:', logs.filter((l) => /error/i.test(l) && !/WebGL|GL_INVALID/.test(l)).length);
};
