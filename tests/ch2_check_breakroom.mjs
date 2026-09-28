// Ch2 break-room / witch-loot check (deterministic; director off, bots on, all god).
// A: a bot standing behind the opened break-room door leaf must walk out to the leader
//    (no stuck-rescue teleport).
// B: with the Witch sitting at each witch spot, bots without kits/pills must keep following
//    the leader past loot near her (engine bot rule: items near an idle witch freeze bots).
const TY = -6.2;
export default async ({ page, evalg, wait }) => {
  if (process.env.BEFORE) await page.addInitScript(() => { window.__BEFORE = 1; });
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?autostart=1');
  for (let i = 0; i < 120; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  const a = await evalg((TY) => {
    const g = window.game, L = g.level, p = g.player;
    g.director.enabled = false; g.cheats.godAll = true; g.cheats.botsIdle = false;
    g.hud.show(false); window.session.menu.clear();
    const tps = [];
    for (const s of g.survivors) { if (s === p) continue; const t0 = s.teleport.bind(s); s.teleport = (x, y, z, yaw) => { if (!window.__our) tps.push([s.char.id, +s.pos.x.toFixed(1), +s.pos.z.toFixed(1), +g.time.toFixed(1)]); return t0(x, y, z, yaw); }; }
    window.__tps = tps;
    const tp = (s, x, y, z, yaw = 0) => { window.__our = true; s.teleport(x, y, z, yaw); window.__our = false; };
    window.__tp = tp;
    const out = {};
    // [name, door finder, opener pos, leader pos, bot spots (the old leaf pocket / the far side of the leaf)]
    const CASES = [
      ['breakroom', (d) => Math.abs(d.cx - 167.15) < 0.1 && d.cz > 21.9 && d.cz < 26.5, [165.5, TY, 24], [165.2, TY, 44], [[167.75, TY, 27.2], [167.8, TY, 28.4]]],
      ['copyroom', (d) => Math.abs(d.cx - 203.05) < 0.1 && Math.abs(d.cz - 49) < 0.1, [203, 0, 50.5], [208, 0, 55], [[204.6, 0, 47.9], [204.2, 0, 48.4]]],
    ];
    const bots = g.survivors.filter((s) => s !== p);
    for (const [name, find, opener, lead, spots] of CASES) {
      const door = L.doors.find(find);
      if (!door) { out[name] = 'no door'; continue; }
      if (window.__BEFORE && name === 'copyroom') door.hingeSign = -1; // old hinge (collider only)
      if (!door.open) door.use({ pos: { x: opener[0], y: opener[1], z: opener[2] } });
      g.advance(1.5);
      tp(p, lead[0], lead[1], lead[2], Math.PI);
      tp(bots[0], ...spots[0], Math.PI);
      tp(bots[1], ...spots[1], Math.PI);
      tp(bots[2], lead[0], lead[1], lead[2] - 1, 0);
      const n0 = tps.length;
      const trace = [];
      for (let k = 0; k < 6; k++) { g.advance(2); trace.push(bots.slice(0, 2).map((s) => [+s.pos.x.toFixed(2), +s.pos.z.toFixed(2)])); }
      out[name] = { door: [door.cx, door.cz, door.open, +door.angle.toFixed(2), door.dirSign], trace, rescueTeleports: tps.slice(n0), final: bots.map((s) => +s.pos.distanceTo(p.pos).toFixed(1)) };
    }
    return out;
  }, TY);
  console.log('A', JSON.stringify(a));
  // B: witch at each spot, bots with no kit/pills/throwable near the spot's loot, leader walks away
  const spots = await evalg(() => window.game.level.witchSpots.map((w) => [w.x, w.y, w.z]));
  for (const [wx, wy, wz] of spots || []) {
    const r = await evalg(([wx, wy, wz, TY]) => {
      const g = window.game, L = g.level, p = g.player, nav = L.nav;
      for (const w of g.infected.specials) if (w.kind === 'witch') { w.dead = true; w.remove?.(); }
      g.advance(0.2);
      const w = g.director.spawnWitchAt(wx, wy, wz);
      // worst case: every authored spawn within 6 m of her actually rolled (as a medkit, which bots always want)
      const loot = L.itemSpawns.filter((sp) => Math.hypot(sp.x - wx, sp.z - wz) < 6 && Math.abs(sp.y - wy) < 1.6).map((sp) => [sp.type, sp.x, sp.z, +Math.hypot(sp.x - wx, sp.z - wz).toFixed(1)]);
      for (const [, x, z] of loot) if (!g.items.items.some((it) => !it.taken && Math.hypot(it.pos.x - x, it.pos.z - z) < 0.3)) { const sp = L.itemSpawns.find((q) => q.x === x && q.z === z); g.items.spawn('medkit', sp.x, sp.y, sp.z); }
      const bots = g.survivors.filter((s) => s !== p);
      // stand the team on the main path next to the spot, then the leader walks off 25 m
      const STARTS = [[64, 72, TY, 14], [152, 145, TY, 15], [174.3, 165.2, TY, 30], [230.8, 222.5, 0, 59], [235.4, 234, 0.15, 62]];
      const st = STARTS.find((q) => Math.abs(q[0] - wx) < 0.5);
      const start = st ? nav.nearestNode(st[1], st[2], st[3], 1.5) : -1;
      if (start < 0) return { spot: [wx, wz], err: 'no start' };
      const sx = nav.nodeX(start), sy = nav.nodeY[start], sz = nav.nodeZ(start);
      for (const s of bots) { window.__tp(s, sx + (Math.random() - 0.5), sy, sz + (Math.random() - 0.5), 0); s.inv.medkit = null; s.inv.pills = null; s.inv.throwable = null; if (s.inv.primary) s.inv.primary.reserve = 0; s.brain.itemGoal = null; }
      window.__tp(p, sx, sy, sz, 0);
      g.advance(1);
      // leader heads along the exit field 25 m
      let n = start; for (let k = 0; k < 60; k++) { const m = nav.descend(nav.fields.toExit, n); if (m < 0) break; n = m; }
      window.__tp(p, nav.nodeX(n), nav.nodeY[n], nav.nodeZ(n), 0);
      g.advance(12);
      const res = { spot: [wx, wz], loot, leaderAt: [+p.pos.x.toFixed(1), +p.pos.z.toFixed(1)], bots: bots.map((s) => [s.char.id[0], +s.pos.distanceTo(p.pos).toFixed(1), s.brain.mode, s.brain.itemGoal ? s.brain.itemGoal.type : '-']), witchAngry: !!w.enraged };
      w.dead = true; w.remove?.();
      return res;
    }, [wx, wy, wz, TY]);
    console.log('B', JSON.stringify(r));
  }
};
