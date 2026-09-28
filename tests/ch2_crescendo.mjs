// Chapter 2 generator crescendo end-to-end: survivors in the hall, start the generator via
// the usable's onUse, advance time, track gate / panic waves / spawn origins; then check bots
// follow the player through the opened gate. Prints any page errors (see play.mjs logs).
export default async ({ page, evalg, wait, shot }) => {
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?autostart=1');
  for (let i = 0; i < 120; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  const TY = -6.2;
  console.log(JSON.stringify(await evalg((TY) => {
    const g = window.game;
    g.cheats.godAll = true; g.director.enabled = true; g.cheats.botsIdle = false;
    g.hud.show(false); window.session.menu.clear();
    g.survivors.forEach((s, i) => s.teleport(164 + i * 0.8, TY, 46.5, Math.PI));
    g.advance(3);
    const u = g.level.ch2Generator;
    // record where commons appear
    window.__spawns = [];
    const orig = g.infected.spawnCommon.bind(g.infected);
    g.infected.spawnCommon = (x, y, z, o) => { window.__spawns.push([x, y, z, g.director.panicState?.wave ?? -1]); return orig(x, y, z, o); };
    return { objective: g.hud.objective.textContent, usableEnabled: u.usable.enabled, blocks: u.blocker.blocksInfected(), commons: g.infected.commons.length };
  }, TY)));
  await evalg(() => { const g = window.game; g.level.ch2Generator.usable.onUse(g.player); });
  const t0 = Date.now();
  for (let k = 0; k < 22; k++) {
    const r = await evalg(() => {
      const g = window.game, L = g.level, u = L.ch2Generator, d = g.director;
      g.advance(5);
      const hordes = g.infected.commons.filter((c) => c.horde);
      const beyond = g.infected.commons.filter((c) => c.pos.x > 182.4).length;
      return {
        t: Math.round(u.ev.t), gate: +u.gate.offset.y.toFixed(2), open: u.ev.open, blocks: u.blocker.blocksInfected(),
        panic: d.panicState ? d.panicState.name + ':' + d.panicState.wave : null, commons: g.infected.commons.length, hordes: hordes.length, beyond,
        specials: g.infected.specials.filter((s) => !s.dead).map((s) => s.kind).join(','), kills: g.infected.killCount,
        alive: g.survivors.filter((s) => !s.dead).length, obj: g.hud.objective.textContent, state: window.session.state,
      };
    });
    console.log(JSON.stringify(r));
    if (r && r.open && !r.panic && k > 16) break;
  }
  console.log('real seconds', Math.round((Date.now() - t0) / 1000));
  // spawn origin summary
  console.log(JSON.stringify(await evalg(() => {
    const sp = window.__spawns;
    const cls = (x, y, z) => (y < -8 ? 'hole' : y > -3 ? 'upper' : (z < 40 ? 'door' : 'other'));
    const out = {};
    for (const [x, y, z, w] of sp) { const k = 'w' + w + ':' + cls(x, y, z); out[k] = (out[k] || 0) + 1; }
    return out;
  })));
  if (process.env.SHOT) await shot('c2_crescendo');
  // bots follow through the gate & up to the office
  for (const [x, y, z] of [[186, TY, 55], [194, -3.5, 55], [203, 0, 55], [214, 0, 52.4]]) {
    const r = await evalg(([x, y, z]) => {
      const g = window.game;
      g.player.teleport(x, y, z, -Math.PI / 2);
      g.advance(12);
      return { at: [x, z], bots: g.survivors.filter((s) => s !== g.player).map((s) => [+s.pos.x.toFixed(1), +s.pos.y.toFixed(1), +s.pos.z.toFixed(1), +s.pos.distanceTo(g.player.pos).toFixed(1)]) };
    }, [x, y, z]);
    console.log(JSON.stringify(r));
  }
};
