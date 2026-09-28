// Walk the human player along the survivor route (start -> end safe room) with
// normal movement + E on doors, director off. Reports where it gets stuck.
// CH=0 node tests/play.mjs tests/scen_walk.mjs
export default async ({ page, evalg, wait, shot }) => {
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?autostart=' + (process.env.CH || 0));
  for (let i = 0; i < 90; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  const r = await evalg(() => {
    const g = window.game, L = g.level, nav = L.nav, p = g.player;
    g.director.enabled = false; g.cheats.godAll = true;
    for (const c of g.infected.commons) c.hp = 0;
    for (const s of g.survivors) if (s !== p) s.brain = null;
    const log = [];
    let lastProg = -1, stuckT = 0, path = null, pi = 0, useT = 0;
    const end = L.flowEnd;
    for (let t = 0; t < 600; t += 0.1) {
      // follow the survivor route: descend the toExit field a few steps ahead
      const f = nav.fields.toExit;
      let cur = nav.nodeAt(p.pos.x, p.pos.y, p.pos.z);
      if (cur < 0 || Math.abs(nav.nodeY[cur] - p.pos.y) > 0.8) cur = nav.nearestNode(p.pos.x, p.pos.y, p.pos.z, 2);
      if (cur < 0) { log.push('OFF NAV at ' + p.pos.toArray().map((v) => v.toFixed(1))); break; }
      let n = cur;
      for (let k = 0; k < 5; k++) { const m = nav.descend(f, n); if (m < 0) break; n = m; if (Math.abs(nav.nodeY[m] - nav.nodeY[cur]) > 1.0) break; }
      let dx = nav.nodeX(n) - p.pos.x, dz = nav.nodeZ(n) - p.pos.z;
      if (Math.hypot(dx, dz) < 0.2) { dx = nav.nodeX(n) - nav.nodeX(cur); dz = nav.nodeZ(n) - nav.nodeZ(cur); }
      p.yaw = Math.atan2(-dx, -dz); p.pitch = 0;
      // near a closed door? press E
      const door = L.doors.find((d) => !d.open && !d.broken && Math.hypot(d.cx - p.pos.x, d.cz - p.pos.z) < 1.8 && Math.abs(d.cy - p.pos.y) < 2);
      useT -= 0.1;
      const use = door && useT <= 0;
      if (use) { useT = 1; if (door.locked) log.push('LOCKED DOOR on path at ' + door.cx + ',' + door.cy + ',' + door.cz); }
      g.testCmd = { my: 1, usePressed: use, jump: stuckT > 0.8 && stuckT < 0.9 };
      g.advance(0.1);
      const prog = L.progressAt(p.pos.x, p.pos.y, p.pos.z);
      if (prog > lastProg + 0.002) { lastProg = prog; stuckT = 0; } else stuckT += 0.1;
      if (stuckT > 8) { log.push(`STUCK at ${p.pos.toArray().map((v) => v.toFixed(1))} prog ${prog.toFixed(3)} door=${door ? door.cx + ',' + door.cz + (door.locked ? ' locked' : '') : '-'}`); break; }
      if (L.endSafe && L.inBox(L.endSafe, p.pos, 0)) { log.push(`REACHED END at t=${t.toFixed(0)}s`); break; }
      if (Math.floor(t * 10) % 300 === 0) log.push(`t=${t.toFixed(0)} pos ${p.pos.toArray().map((v) => v.toFixed(1))} prog ${prog.toFixed(3)}`);
    }
    g.testCmd = null;
    return log;
  });
  console.log((r || []).join('\n'));
  await shot('walk_end');
};
