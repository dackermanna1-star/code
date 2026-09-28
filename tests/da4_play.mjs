// Dead Air ch4 (The Terminal) playthrough.
//   MODE=walk (default): director off, the human player walks the toExit field
//     opening doors, hotwires the shuttle van when next to it, waits for the
//     barricade to fall, goes on to the end safe room and closes the door.
//   MODE=bots: director on, the player is driven by the game's bot brain
//     (A*, combat, doors), the three bots follow; hotwires the van, fights the
//     crescendo, reaches the safe room and closes the door (session.endTriggered).
//   DET=walk|shoot|office (bots mode): how the checkpoint is handled (default: whatever the route does).
// node tests/play.mjs tests/da4_play.mjs
export default async ({ page, evalg, wait, shot }) => {
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?campaign=deadair&autostart=3', { timeout: 180000 });
  for (let i = 0; i < 180; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  const mode = process.env.MODE || 'walk';
  await evalg(([mode, det, skip]) => {
    const g = window.game;
    const dirOn = mode === 'bots';
    g.director.enabled = dirOn; g.cheats.god = true; if (!dirOn) g.cheats.godAll = true;
    if (!window.__render) g.noRender = true;
    window.session.menu?.clear?.();
    window.__BotBrain = g.survivors.find((s) => s.brain)?.brain.constructor;
    if (!dirOn) for (const s of g.survivors) if (s !== g.player) s.brain = null;
    window.__w = { skip: skip !== '0', mode, det, t: 0, lastProg: -1, stuckT: 0, useT: 0, log: [], done: false, phase: 'walk', maxProg: 0 };
  }, [mode, process.env.DET || '', process.env.SKIP || '1']);
  const t0 = Date.now();
  for (let chunk = 0; chunk < 500; chunk++) {
    const r = await evalg(() => {
      const g = window.game, L = g.level, nav = L.nav, p = g.player, W = window.__w, van = L.da4.van, det = L.da4.S.det;
      const f = nav.fields.toExit;
      const fmt = (v) => v.toArray().map((q) => q.toFixed(1)).join(',');
      for (let step = 0; step < 150 && !W.done; step++) {
        W.t += 0.1;
        if (!g.director.enabled) { for (const c of g.infected.commons) if (!c.dead) c.hp = 0; }
        const prog = L.progressAt(p.pos.x, p.pos.y, p.pos.z);
        if (prog > W.maxProg) W.maxProg = prog;
        const pn = g.director.panicState?.name || null;
        if (pn !== W.lastPanic) { W.log.push(`t=${W.t.toFixed(0)} panic ${W.lastPanic || '-'} -> ${pn || '-'} (wave ${g.director.panicState?.wave ?? '-'}) commons ${g.infected.commons.filter((c) => !c.dead).length}`); W.lastPanic = pn; }
        if (van.phase !== W.vanPhase) { W.log.push(`t=${W.t.toFixed(0)} van ${W.vanPhase || '-'} -> ${van.phase} broken=${van.broken}`); W.vanPhase = van.phase; }
        if (det.state !== W.detState) { W.log.push(`t=${W.t.toFixed(0)} detector ${W.detState || '-'} -> ${det.state} at ${fmt(p.pos)}`); W.detState = det.state; }
        const tk = g.infected.specials.find((s) => s.kind === 'tank' && !s.dead);
        if (tk && !W.tankSeen) { W.tankSeen = true; W.log.push(`t=${W.t.toFixed(0)} TANK at ${fmt(tk.pos)} prog ${prog.toFixed(3)}`); }
        // the van: hotwire it as soon as the player stands next to it (walk mode: side trip from the check-in hall)
        if (van.phase === 'idle' && p.pos.x > 70 && p.pos.x < 99 && p.pos.z > 4 && p.pos.y < 1) { W.back = p.pos.clone(); p.teleport(74.6, 0.05, 36.2, 0); W.log.push(`t=${W.t.toFixed(0)} side trip to the van`); }
        if (van.phase === 'idle' && Math.hypot(p.pos.x - 76, p.pos.z - 37) < 6 && p.pos.y < 1) { van.start(p); W.log.push(`t=${W.t.toFixed(0)} HOTWIRED VAN prog ${prog.toFixed(3)}`); W.vanT = W.t; if (W.back) { p.teleport(W.back.x, W.back.y + 0.05, W.back.z, p.yaw); W.back = null; } }
        if (W.vanT && !van.broken && W.t - W.vanT > 60) { W.log.push('VAN NEVER BROKE THE BARRICADE phase=' + van.phase); W.done = true; break; }
        if (W.t > 2400) { W.log.push('TIME LIMIT'); W.done = true; break; }
        if (W.det === 'shoot' && !det.broken && Math.hypot(p.pos.x - 86, p.pos.z + 19) < 6) { det.break(p); W.log.push(`t=${W.t.toFixed(0)} SHOT DETECTOR`); }
        if (L.endSafe && L.inBox(L.endSafe, p.pos, 0) && W.phase === 'walk') { W.phase = 'end'; W.endT = W.t; W.log.push(`t=${W.t.toFixed(0)} REACHED END ROOM prog ${prog.toFixed(3)}`); }
        if (W.phase === 'end') {
          g.testCmd = { my: 0 };
          const alive = g.survivors.filter((s) => !s.dead);
          const inside = alive.filter((s) => L.inBox(L.endSafe, s.pos, 0.1)).length;
          if ((inside === alive.length || W.t - W.endT > 60 || W.mode === 'walk') && L.endDoor.open && !W.closed) { W.closed = true; L.endDoor.use(p); W.log.push(`t=${W.t.toFixed(0)} closing door; inside ${inside}/${alive.length}`); }
          g.advance(0.1);
          if (window.session.endTriggered) { W.log.push(`t=${W.t.toFixed(0)} CHAPTER COMPLETE (endTriggered)`); W.done = true; }
          if (W.closed && W.t - W.endT > 80) { W.log.push('END TIMEOUT door.open=' + L.endDoor.open + ' state=' + window.session.state); W.done = true; }
          continue;
        }
        const openBefore = L.doors.filter((d) => d.open).length;
        if (W.mode === 'walk') {
          let cur = nav.nodeAt(p.pos.x, p.pos.y, p.pos.z);
          if (cur < 0 || Math.abs(nav.nodeY[cur] - p.pos.y) > 0.8) cur = nav.nearestNode(p.pos.x, p.pos.y, p.pos.z, 2);
          if (cur < 0) { W.log.push('OFF NAV at ' + fmt(p.pos)); W.done = true; break; }
          // aim at the furthest of the next 6 field nodes that is in straight walkable reach
          let n = cur, best = -1;
          for (let k = 0; k < 6; k++) { const m = nav.descend(f, n); if (m < 0) break; n = m; if (Math.abs(nav.nodeY[m] - nav.nodeY[cur]) > 1.0) { if (best < 0) best = m; break; } if (best < 0 || nav.walkable(p.pos.x, nav.nodeY[cur], p.pos.z, nav.nodeX(m), nav.nodeY[m], nav.nodeZ(m))) best = m; }
          if (best >= 0) n = best;
          let dx = nav.nodeX(n) - p.pos.x, dz = nav.nodeZ(n) - p.pos.z;
          if (Math.hypot(dx, dz) < 0.2) { dx = nav.nodeX(n) - nav.nodeX(cur); dz = nav.nodeZ(n) - nav.nodeZ(cur); }
          p.yaw = Math.atan2(-dx, -dz); p.pitch = 0;
          const door = L.doors.find((d) => !d.open && !d.broken && d !== van.blocker && Math.hypot(d.cx - p.pos.x, d.cz - p.pos.z) < 1.8 && Math.abs(d.cy - p.pos.y) < 2);
          W.useT -= 0.1;
          const use = door && W.useT <= 0;
          if (use) { W.useT = 1; if (door.locked) W.log.push('LOCKED DOOR on path at ' + door.cx + ',' + door.cy + ',' + door.cz); }
          // waiting at the barricade for the van: stand still
          const waitVan = !van.broken && p.pos.x > 90 && p.pos.x < 100.5 && p.pos.z > 8 && p.pos.z < 28 && p.pos.y < 1;
          g.testCmd = waitVan ? { my: 0 } : { my: 1, usePressed: use, jump: W.stuckT > 0.8 && W.stuckT < 0.9 };
          if (waitVan) W.stuckT = 0;
        } else {
          if (!W.bb) { W.bb = new window.__BotBrain(g, p, 3); }
          W.bb.itemT = 1e9;
          W.bb.update(0.1);
          const c = p.cmd;
          g.testCmd = { mx: c.mx, my: c.my, sprint: c.sprint, jump: c.jump || (W.stuckT > 1.5 && W.stuckT < 1.6), fire: c.fire, firePressed: c.firePressed, shove: c.shove, shoveHeld: c.shoveHeld, reload: c.reload, slot: c.slot, use: c.use, usePressed: c.usePressed, crouch: c.crouch };
        }
        g.advance(0.1);
        const openAfter = L.doors.filter((d) => d.open).length;
        if (openAfter > openBefore) W.log.push(`t=${W.t.toFixed(0)} opened a door near ${fmt(p.pos)}`);
        const pr = L.progressAt(p.pos.x, p.pos.y, p.pos.z);
        if (pr > W.lastProg + 0.002) { W.lastProg = pr; W.stuckT = 0; } else W.stuckT += 0.1;
        const vanBusy = !van.broken || (van.phase !== 'done' && van.phase !== 'idle' && W.mode === 'walk');
        if (W.stuckT > (vanBusy ? 60 : 25)) {
          W.log.push(`STUCK at ${fmt(p.pos)} prog ${pr.toFixed(3)} van=${van.phase}${W.bb ? ' goal=' + (W.bb.pathGoal ? fmt(W.bb.pathGoal) : '-') + ' mode=' + W.bb.mode : ''}`);
          W.stucks = (W.stucks || 0) + 1;
          // SKIP=1: log it, hop 12 nodes down the field and carry on (finds every problem spot in one run)
          let n = nav.nearestNode(p.pos.x, p.pos.y, p.pos.z, 3);
          if (W.skip && n >= 0 && W.stucks < 8) { for (let k = 0; k < 12; k++) { const m = nav.descend(f, n); if (m < 0) break; n = m; } p.teleport(nav.nodeX(n), nav.nodeY[n] + 0.05, nav.nodeZ(n), p.yaw); W.stuckT = 0; W.bb = null; }
          else W.done = true;
        }
        if (p.dead) { W.log.push('PLAYER DIED at ' + fmt(p.pos)); W.done = true; }
        if (Math.floor(W.t * 10) % 300 === 0 && (!W.lastPos || W.lastPos.distanceTo(p.pos) > 1 || W.mode === 'bots')) { W.lastPos = p.pos.clone();
          const bs = g.survivors.filter((s) => s !== p).map((s) => `${s.char.id}:${s.dead ? 'DEAD' : s.pos.distanceTo(p.pos).toFixed(0) + 'm' + (s.incapped ? '!' : '')}`).join(' ');
          W.log.push(`t=${W.t.toFixed(0)} pos ${fmt(p.pos)} prog ${pr.toFixed(3)} | ${bs} | inf ${g.infected.commons.filter((c) => !c.dead).length} sp ${g.infected.specials.filter((s) => !s.dead).map((s) => s.kind).join(',')} | errs ${g.errCount || 0}`);
        }
      }
      g.testCmd = null;
      return { out: W.log.splice(0), done: W.done, t: W.t, maxProg: W.maxProg, stucks: W.stucks || 0 };
    });
    if (!r) { console.log('eval failed'); break; }
    for (const l of r.out) console.log(l);
    if (r.done) { console.log(`stucks ${r.stucks} maxProg ${r.maxProg.toFixed(3)} gameTime ${r.t.toFixed(0)}s wall ${((Date.now() - t0) / 1000).toFixed(0)}s`); break; }
  }
  const fin = await evalg(() => ({ end: window.session.endTriggered, state: window.session.state, errs: window.game.errCount || 0, stats: window.game.director.stats }));
  console.log('final', JSON.stringify(fin));
};
