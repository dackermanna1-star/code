// Dead Air ch3 (The Construction Site): boot + route check + human walk along
// the toExit field (opening doors, shooting the barricade canisters).
// node tests/play.mjs tests/da3_walk.mjs
export default async ({ page, evalg, wait, shot }) => {
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?campaign=deadair&autostart=2', { timeout: 180000 });
  for (let i = 0; i < 150; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  const info = await evalg(() => {
    const g = window.game, L = g.level, nav = L.nav;
    const pts = [[4.4, 0.3, 4.8], [20, 0, 0], [60, 0, 0], [80, 0, -4], [108, 0.2, -11], [118, 4.4, -16], [126, 0, -12], [140, 0, -2], [155, 0, -2], [170, 0, -3], [178, 0, 5], [190, 0, 12], [209, 0.15, 13], [225, 0, 15], [250, 0, 14], [266, 0, 2], [272, 0, 1], [280, 0, 10], [295, 1.9, 16.5], [306, 3.4, 0], [290, 3.4, -11], [278.5, 3.4, -12], [290, 6.8, -10], [306, 6.8, -1], [322, 6.8, -1], [338, 6.8, -1]];
    return {
      nodes: nav.count ?? nav.nodeCount ?? nav.nodeY?.length, lights: L.lights?.length ?? L.vlights?.length, errs: g.errCount || 0,
      prog: pts.map((p) => `${p.join(',')}:${L.progressAt(...p).toFixed(3)}`).join(' | '),
      endSafe: L.endSafe, flowEnd: L.flowEnd,
    };
  });
  console.log(JSON.stringify(info));
  const r = await evalg(() => {
    const g = window.game, L = g.level, nav = L.nav, p = g.player;
    g.director.enabled = false; g.cheats.godAll = true; g.noRender = true;
    for (const c of g.infected.commons) c.hp = 0;
    for (const s of g.survivors) if (s !== p) s.brain = null;
    const log = [];
    let lastProg = -1, stuckT = 0, useT = 0;
    const bar = L.da3.bar;
    for (let t = 0; t < 900; t += 0.1) {
      const f = nav.fields.toExit;
      let cur = nav.nodeAt(p.pos.x, p.pos.y, p.pos.z);
      if (cur < 0 || Math.abs(nav.nodeY[cur] - p.pos.y) > 0.8) cur = nav.nearestNode(p.pos.x, p.pos.y, p.pos.z, 2);
      if (cur < 0) { log.push('OFF NAV at ' + p.pos.toArray().map((v) => v.toFixed(1))); break; }
      let n = cur;
      for (let k = 0, look = stuckT > 1.5 ? 1 : 5; k < look; k++) { const m = nav.descend(f, n); if (m < 0) break; n = m; if (Math.abs(nav.nodeY[m] - nav.nodeY[cur]) > 1.0) break; }
      let dx = nav.nodeX(n) - p.pos.x, dz = nav.nodeZ(n) - p.pos.z;
      if (Math.hypot(dx, dz) < 0.2) { dx = nav.nodeX(n) - nav.nodeX(cur); dz = nav.nodeZ(n) - nav.nodeZ(cur); }
      p.yaw = Math.atan2(-dx, -dz); p.pitch = 0;
      const door = L.doors.find((d) => !d.open && !d.broken && Math.hypot(d.cx - p.pos.x, d.cz - p.pos.z) < 1.8 && Math.abs(d.cy - p.pos.y) < 2 && d !== bar.blocker);
      useT -= 0.1;
      const use = door && useT <= 0;
      if (use) { useT = 1; if (door.locked) log.push('LOCKED DOOR on path at ' + door.cx + ',' + door.cy + ',' + door.cz); }
      if (!bar.isBlown() && p.pos.x > 130 && !bar.shot) { bar.shot = true; const c = bar.cans[0]; c.hit(c.x, c.y + 0.8, c.z, p.pos.clone().set(1, 0, 0), p); log.push(`t=${t.toFixed(0)} shot canister`); }
      g.testCmd = { my: 1, usePressed: use, jump: stuckT > 0.8 && stuckT < 0.9 };
      g.advance(0.1);
      const prog = L.progressAt(p.pos.x, p.pos.y, p.pos.z);
      if (prog > lastProg + 0.002) { lastProg = prog; stuckT = 0; } else stuckT += 0.1;
      if (stuckT > 10) { log.push(`STUCK at ${p.pos.toArray().map((v) => v.toFixed(1))} prog ${prog.toFixed(3)} blown=${bar.isBlown()} door=${door ? door.cx + ',' + door.cz + (door.locked ? ' locked' : '') : '-'}`); break; }
      if (L.endSafe && L.inBox(L.endSafe, p.pos, 0)) { log.push(`REACHED END at t=${t.toFixed(0)}s prog ${prog.toFixed(3)}`); break; }
      if (Math.floor(t * 10) % 200 === 0) log.push(`t=${t.toFixed(0)} pos ${p.pos.toArray().map((v) => v.toFixed(1))} prog ${prog.toFixed(3)} hp ${p.hp | 0}`);
    }
    g.testCmd = null;
    log.push('errs ' + (g.errCount || 0) + ' panic ' + (g.director.panicState?.name || '-'));
    return log;
  });
  console.log((r || []).join('\n'));
};
