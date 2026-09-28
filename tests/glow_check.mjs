// Teammate outline check (Dead Air ch1, medium): two teammates behind a wall
// (one incapacitated), one in plain view facing the camera with its flashlight.
// Logs frame cost with/without the outline passes.
export default async ({ page, evalg, wait, shot, logs }) => {
  const ch = +(process.env.CH || 0);
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?campaign=deadair&autostart=' + ch, { timeout: 180000 });
  for (let i = 0; i < 200; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  const setup = await evalg(() => {
    const g = window.game, P = g.player, col = g.level.col;
    g.director.enabled = false; g.cheats.botsIdle = true; g.cheats.godAll = true; window.session.menu?.clear?.();
    const ex = P.pos.x, ey = P.pos.y + 1.2, ez = P.pos.z;
    let best = null;
    for (let i = 0; i < 32; i++) {
      const a = i / 32 * Math.PI * 2, dx = Math.sin(a), dz = Math.cos(a);
      const h = col.raycast(ex, ey, ez, dx, 0, dz, 9);
      if (!h) continue;
      const t = h.t ?? h.dist ?? h.distance;
      if (!(t > 2.5 && t < 7)) continue;
      // the far side of the wall must be open for ~2 m
      const t2 = col.raycast(ex + dx * (t + 0.6), ey, ez + dz * (t + 0.6), dx, 0, dz, 3);
      if (t2) continue;
      best = { a, t, dx, dz }; break;
    }
    if (!best) return 'no wall';
    const { t, dx, dz } = best, px = -dz, pz = dx;
    const bots = g.survivors.filter((s) => s !== P);
    const fx = ex + dx * (t + 1.3), fz = ez + dz * (t + 1.3);
    bots[0].teleport(fx - px * 0.7, P.pos.y + 0.02, fz - pz * 0.7, 0);
    bots[1].teleport(fx + px * 0.9, P.pos.y + 0.02, fz + pz * 0.9, 0);
    bots[1].incap?.('test');
    // third teammate in plain view, 3 m out, facing the camera
    bots[2].teleport(ex + dx * Math.min(2.2, t - 0.6) + px * 0.9, P.pos.y + 0.02, ez + dz * Math.min(2.2, t - 0.6) + pz * 0.9, Math.atan2(dx, dz));
    bots[2].flashlight = true;
    P.yaw = Math.atan2(-dx, -dz); P.pitch = -0.05;
    g.advance(0.5);
    return { t: +t.toFixed(2), names: bots.map((b) => b.name + (b.incapped ? '(incap)' : '')) };
  });
  console.log('setup', JSON.stringify(setup));
  await wait(2500);
  const cost = await evalg(() => {
    const g = window.game, R = g.renderer, r = R.r;
    const one = () => { r.info.autoReset = false; r.info.reset(); const t0 = performance.now(); R.render(0.016, g); const o = { calls: r.info.render.calls, ms: Math.round(performance.now() - t0) }; r.info.autoReset = true; return o; };
    one();
    const on = one();
    const n = R.glow.list.length;
    const s = g.settings; const prev = s.outlines; s.outlines = false; one(); const off = one(); s.outlines = prev;
    return { on, off, proxies: n, q: g.quality.name };
  });
  console.log('cost', JSON.stringify(cost));
  await wait(800);
  await shot(process.env.NAME || 'glow_check');
  console.log('errors', logs.filter((l) => /error/i.test(l)).slice(0, 5));
};
