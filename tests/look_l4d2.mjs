// L4D2 look lane check: boot Dead Air chapters, report errors, draw calls,
// frame cost, outline/usable glow state; screenshots of teammate outlines
// (normal / incapped / pinned), lens blood and newspapers/pallet props.
// QUALITY=medium CHS=0,1,2 SHOTS=1 node tests/play.mjs tests/look_l4d2.mjs
export default async ({ page, evalg, wait, shot, logs }) => {
  for (const ch of (process.env.CHS || '0,1,2').split(',').map(Number)) {
    const n0 = logs.length;
    await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?campaign=deadair&autostart=' + ch, { timeout: 180000 });
    let st;
    for (let i = 0; i < 180; i++) { await wait(1000); st = await evalg(() => window.session?.state); if (st === 'playing') break; }
    await wait(3000);
    const info = await evalg(() => {
      const g = window.game, R = g.renderer, r = R.r;
      g.director.enabled = false;
      g.advance(0.5);
      r.info.autoReset = false; r.info.reset(); R.render(0.016, g);
      const o = { calls: r.info.render.calls, tris: r.info.render.triangles, progs: r.info.programs?.length, glowList: R.glow.list.length, maskOn: R.glow.maskPass.enabled };
      r.info.autoReset = true;
      const gl = r.getContext();
      const t0 = performance.now();
      for (let i = 0; i < 20; i++) R.render(0.016, g);
      gl.finish();
      o.msPerFrame = +((performance.now() - t0) / 20).toFixed(2);
      // glow-off cost for comparison
      g.settings = g.settings || {}; const prev = g.settings.outlines; g.settings.outlines = false;
      R.render(0.016, g); const t1 = performance.now();
      for (let i = 0; i < 20; i++) R.render(0.016, g);
      gl.finish();
      o.msNoGlow = +((performance.now() - t1) / 20).toFixed(2);
      g.settings.outlines = prev;
      const us = g.usables.filter((u) => !u.door);
      o.usables = us.length; o.usableGlow = us.filter((u) => R.glow.usableProxy(g.level, u)).length;
      o.parts = g.level._partG?.length || 0;
      o.news = (g.level.meshes || []).filter((m) => m.material?.name === 'newsprint').length;
      o.cardboard = (g.level.meshes || []).filter((m) => m.material?.name === 'cardboard').length;
      return o;
    });
    const errs = logs.slice(n0).filter((l) => /error|Unknown material|undefined|NaN/i.test(l));
    console.log('CH', ch, 'state', st, JSON.stringify(info), 'errors:', errs.length, errs.slice(0, 4).join(' | '));
    if (!process.env.SHOTS || ch !== Number(process.env.SHOTCH || 0)) continue;
    // teammates: one normal, one incapped, one pinned; player looks at them from 5 m
    await evalg(() => {
      const g = window.game, me = g.player;
      const bots = g.survivors.filter((s) => s !== me && !s.dead);
      const c = bots[0].pos;
      me.pos.set(c.x + 5, c.y, c.z);
      me.yaw = Math.atan2(5, 0) ; me.pitch = -0.1;
      bots.forEach((b, i) => { b.pos.set(c.x + (i - 1) * 1.2, c.y, c.z + (i - 1) * 0.3); });
      if (bots[1]) bots[1].incapped = true;
      if (bots[2]) bots[2].pinned = { fake: true };
      g.advance(0.05);
      g.renderer.bloodSplat(1, 0.3, 0.6);
    });
    await wait(500);
    await shot('look_team_ch' + ch);
    await evalg(() => { const g = window.game; for (const s of g.survivors) { if (s.pinned?.fake) s.pinned = null; s.incapped = false; } });
    // newspapers close-up
    const np = await evalg(() => {
      const g = window.game, m = (g.level.meshes || []).find((k) => k.material?.name === 'newsprint');
      if (!m) return null;
      const P = m.geometry.attributes.position; const i = Math.floor(P.count / 2);
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
      const me = g.player; me.pos.set(x + 1.2, y, z); me.yaw = Math.PI / 2; me.pitch = -0.75;
      g.advance(0.05);
      return [x, y, z];
    });
    console.log('newsprint at', JSON.stringify(np));
    if (np) { await wait(400); await shot('look_news_ch' + ch); }
  }
};
