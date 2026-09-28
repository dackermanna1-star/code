// Chapter 2 gameplay run: director + bots active (all survivors invulnerable), the player is
// moved along the critical path, the generator crescendo is triggered, and the chapter is
// finished by closing the pawn-shop safe door. Page errors show up in the play.mjs log dump.
const TY = -6.2;
const ROUTE = [
  [-2, 0, 6.6, 3], [3, 0, 6.6, 4], [15, 0, 11, 6], [25, 0, 6, 6], [36, -2.6, 5.5, 5], [50, -5, 5, 8], [67.4, -5, 11.1, 6],
  [72, TY, 13.5, 6], [90, TY, 16, 6], [110, TY, 13, 8], [130, TY, 12.5, 8], [138.5, TY, 14, 6], [150, TY, 17, 8], [163, TY, 16, 6],
  [165.2, TY, 25, 6], [165.2, TY, 38, 6], [165.5, TY, 49.5, 5, 'generator'], [176, TY, 55, 5], [186, TY, 55, 8], [195, -2.8, 55, 6],
  [203, 0, 55, 6], [208, 0, 52.4, 6], [222.5, 0, 52.4, 6], [222.5, 0, 59, 5], [214, 0, 61.5, 6], [228, 0, 64.6, 6], [234, 0.15, 64.6, 6],
  [235, 0.15, 69, 6], [245, 0, 82, 6], [253.5, 0.15, 86.8, 5], [256, 0.15, 92.5, 12, 'end'],
];
export default async ({ page, evalg, wait }) => {
  if (process.env.TANK) await page.addInitScript(() => { window.__TANK = 1; });
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?autostart=1');
  for (let i = 0; i < 120; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  await evalg(() => { const g = window.game; window.__deaths = []; for (const s of g.survivors) { const d0 = s.die.bind(s); s.die = (c) => { window.__deaths.push([s.char.id, c, +s.pos.x.toFixed(1), +s.pos.y.toFixed(1), +s.pos.z.toFixed(1), +g.time.toFixed(1)]); return d0(c); }; } g.cheats.godAll = true; g.director.enabled = true; if (window.__TANK) { g.director.tankProgress = 0.62; g.director.tankSpawned = false; } g.cheats.botsIdle = false; g.hud.show(false); window.session.menu.clear(); });
  const t0 = Date.now();
  for (const [x, y, z, adv, act] of ROUTE) {
    const r = await evalg(([x, y, z, adv, act]) => {
      const g = window.game, L = g.level;
      const p = g.player;
      const yaw = Math.atan2(-(x - p.pos.x), -(z - p.pos.z));
      { const nn = L.nav.nearestNode(x, y, z, 2); if (nn >= 0) y = L.nav.nodeY[nn]; }
      p.teleport(x, y, z, yaw);
      const out = { at: [x, z] };
      if (act === 'generator') {
        g.advance(2);
        L.ch2Generator.usable.onUse(p);
        let t = 0;
        while (!L.ch2Generator.ev.open && t < 100) { g.advance(5); t += 5; p.teleport(x, y, z, p.yaw); }
        out.botsAt = g.survivors.filter((s) => s !== p).map((s) => [s.char.id, +s.pos.x.toFixed(1), +s.pos.y.toFixed(1), +s.pos.z.toFixed(1), s.pinned ? 'P' : '', s.incapped ? 'I' : '']);
        out.gen = { t, open: L.ch2Generator.ev.open, panic: !!g.director.panicState, commons: g.infected.commons.length, kills: g.infected.killCount };
      }
      g.advance(adv);
      if (act === 'end') {
        const inside = () => g.survivors.filter((s) => !s.dead && L.inBox(L.endSafe, s.pos, 0.1)).length;
        let w = 0;
        while (inside() < g.survivors.filter((s) => !s.dead).length && w < 30) { g.advance(1); w++; }
        out.inside = inside(); out.waited = w;
        if (L.endDoor.open) L.endDoor.use(p);
        g.advance(3);
        out.endTriggered = window.session.endTriggered; out.playerDead = p.dead;
      }
      out.prog = +L.progressAt(p.pos.x, p.pos.y, p.pos.z).toFixed(3);
      out.bots = g.survivors.filter((s) => s !== p).map((s) => +s.pos.distanceTo(p.pos).toFixed(1));
      out.commons = g.infected.commons.length;
      out.specials = g.infected.specials.filter((s) => !s.dead).map((s) => s.kind[0]).join('');
      out.kills = g.infected.killCount;
      out.dir = g.director.state;
      out.state = window.session.state; out.dead = g.survivors.filter((s) => s.dead).length;
      return out;
    }, [x, y, z, adv, act]);
    console.log(JSON.stringify(r));
    if (!r) break;
  }
  console.log('real seconds', Math.round((Date.now() - t0) / 1000));
  console.log('deaths', JSON.stringify(await evalg(() => window.__deaths)));
};
