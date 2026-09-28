// Glow outlines / grade / lens blood check: CH=n (Dead Air), QUALITY=medium.
// Puts a bot behind the nearest wall, drops a medkit at the player's feet,
// pauses the sim and screenshots; then a lens-blood shot; prints perf numbers.
export default async ({ page, evalg, wait, shot }) => {
  const ch = process.env.CH || 0;
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?campaign=deadair&autostart=' + ch, { timeout: 180000 });
  for (let i = 0; i < 150; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  const r = await evalg(() => {
    const g = window.game; g.director.enabled = false; g.advance(1);
    const p = g.player; const e = { x: p.pos.x, y: p.pos.y + 1.5, z: p.pos.z };
    let best = null;
    for (let i = 0; i < 48; i++) {
      const a = i / 48 * 6.283, dx = -Math.sin(a), dz = -Math.cos(a);
      const h = g.level.col.raycast(e.x, e.y, e.z, dx, 0, dz, 9);
      if (!h || h.t < 2.5 || h.t > 7) continue;
      const beyond = g.level.col.raycast(h.x + dx * 0.05, e.y, h.z + dz * 0.05, dx, 0, dz, 6);
      const room = beyond ? beyond.t : 6;
      if (room > 1.6 && (!best || Math.abs(h.t - 4) < Math.abs(best.t - 4))) best = { a, dx, dz, t: h.t, room };
    }
    const bots = g.survivors.filter((s) => s !== p);
    let placed = null;
    if (best) {
      const d = best.t + Math.min(1.4, best.room - 0.5);
      bots[0].teleport(e.x + best.dx * d, p.pos.y, e.z + best.dz * d, 0);
      p.yaw = best.a; p.pitch = -0.12;
      placed = best;
    }
    // medkit + pistol near the feet, slightly ahead
    const fx = p.pos.x - Math.sin(p.yaw) * 1.3, fz = p.pos.z - Math.cos(p.yaw) * 1.3;
    g.items.spawn('medkit', fx + 0.3, p.pos.y, fz);
    g.items.spawn('pills', fx - 0.4, p.pos.y, fz - 0.2);
    g.advance(0.05);
    g.paused = true;
    return { placed, bots: bots.map((s) => [s.pos.x.toFixed(1), s.pos.z.toFixed(1)]), errs: g.errCount || 0 };
  });
  console.log('setup', JSON.stringify(r));
  await wait(2500);
  const perf = await evalg(() => { const g = window.game; const R = g.renderer; return { glowN: R.glow.list.length, calls: R.r.info.render.calls, tris: R.r.info.render.triangles, ren: g.perf?.ren?.toFixed(1), upd: g.perf?.upd?.toFixed(1), fps: g.fps?.toFixed(1), motes: R.motes.points.visible, cones: R.motes.u.nC.value, grade: R.fx.splitAmount.value }; });
  console.log('perf', JSON.stringify(perf));
  await shot('glow_ch' + ch);
  await evalg(() => { const R = window.game.renderer; R.bloodSplat(1, 0.4, 0.55); R.bloodCool = 0; R.bloodSplat(0.6, 0.7, 0.4); });
  await wait(700);
  await shot('glow_blood_ch' + ch);
  console.log('errs', await evalg(() => window.game.errCount || 0));
};
