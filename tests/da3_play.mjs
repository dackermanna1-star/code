// Dead Air ch3 (The Construction Site) playthrough: the human player is driven
// by the game's bot brain along the route, shoots a barricade canister (the
// crescendo), keeps going through the hordes and closes the safe-room door.
// DIRECTOR=1 -> director on (bots fight), BOTS=1 -> bots follow (else they are parked).
// node tests/play.mjs tests/da3_play.mjs
export default async ({ page, evalg, wait, shot }) => {
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?campaign=deadair&autostart=2', { timeout: 180000 });
  for (let i = 0; i < 150; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  const dirOn = process.env.DIRECTOR === '1', bots = process.env.BOTS === '1';
  if (process.env.CHUNK) await evalg((c) => { window.__chunk = c; }, +process.env.CHUNK);
  await evalg(([dirOn, bots]) => {
    const g = window.game;
    g.director.enabled = dirOn; g.cheats.god = true; if (!dirOn) g.cheats.godAll = true;
    if (!window.__render) g.noRender = true; // logic-only: skip SwiftShader rendering
    window.session.menu?.clear?.();
    window.__BotBrain = g.survivors.find((s) => s.brain)?.brain.constructor;
    if (!bots) for (const s of g.survivors) if (s !== g.player) s.brain = null;
    window.__w = { chunk: +(window.__chunk || 0) || 0, loot: bots, t: 0, lastProg: -1, stuckT: 0, useT: 0, log: [], done: false, phase: 'walk', waitT: 0, maxProg: 0 };
  }, [dirOn, bots]);
  const t0 = Date.now();
  for (let chunk = 0; chunk < 400; chunk++) {
    const r = await evalg(() => {
      const g = window.game, L = g.level, nav = L.nav, p = g.player, W = window.__w, bar = L.da3.bar;
      const f = nav.fields.toExit;
      const fmt = (v) => v.toArray().map((q) => q.toFixed(1)).join(',');
      for (let step = 0; step < (W.chunk || 150) && !W.done; step++) {
        W.t += 0.1;
        if (!g.director.enabled) { for (const c of g.infected.commons) if (!c.dead) c.hp = 0; for (const q of g.infected.specials) if (!q.dead) q.takeHit({ damage: 1e5, part: 0, zone: 'torso', x: q.pos.x, y: q.pos.y + 1, z: q.pos.z, dir: q.pos.clone().set(0, 1, 0), attacker: null, kind: 'bullet' }); }
        const prog = L.progressAt(p.pos.x, p.pos.y, p.pos.z);
        if (prog > W.maxProg) W.maxProg = prog;
        const pn = g.director.panicState?.name || null;
        if (pn !== W.lastPanic) { W.log.push(`t=${W.t.toFixed(0)} panic ${W.lastPanic || '-'} -> ${pn || '-'} (wave ${g.director.panicState?.wave ?? '-'}) commons ${g.infected.commons.filter((c) => !c.dead).length}`); W.lastPanic = pn; }
        const tk = g.infected.specials.find((s) => s.kind === 'tank' && !s.dead);
        if (tk && !W.tankSeen) { W.tankSeen = true; W.log.push(`t=${W.t.toFixed(0)} TANK spawned at ${fmt(tk.pos)} (player prog ${prog.toFixed(3)})`); }
        if (W.tankSeen && !tk && !W.tankDead) { W.tankDead = true; W.log.push(`t=${W.t.toFixed(0)} tank dead`); }
        if (!bar.isBlown() && !W.shot && p.pos.x > 128 && p.pos.y < 1) {
          W.shot = true; W.shotT = W.t; const c = bar.cans[1]; c.hit(c.x, c.y + 0.8, c.z, p.pos.clone().set(1, 0, 0), p); W.log.push(`t=${W.t.toFixed(0)} SHOT CANISTER at prog ${prog.toFixed(3)}`);
        }
        if (W.shot && !W.blownLogged && bar.isBlown()) { W.blownLogged = true; W.log.push(`t=${W.t.toFixed(0)} BARRICADE BLOWN after ${(W.t - W.shotT).toFixed(1)} s`); }
        // end: inside the safe room -> wait for bots, close the door
        if (L.endSafe && L.inBox(L.endSafe, p.pos, 0) && W.phase === 'walk') { W.phase = 'end'; W.endT = W.t; W.log.push(`t=${W.t.toFixed(0)} REACHED END ROOM`); }
        if (W.phase === 'end') {
          g.testCmd = { my: 0 };
          const alive = g.survivors.filter((s) => !s.dead);
          const inside = alive.filter((s) => L.inBox(L.endSafe, s.pos, 0.1)).length;
          if ((inside === alive.length || W.t - W.endT > 60) && L.endDoor.open && !W.closed) { W.closed = true; L.endDoor.use(p); W.log.push(`t=${W.t.toFixed(0)} closing door; inside ${inside}/${alive.length}: ` + alive.map((s) => s.char.id + '@' + fmt(s.pos)).join(' ')); }
          g.advance(0.1);
          if (window.session.endTriggered) { W.log.push(`t=${W.t.toFixed(0)} CHAPTER COMPLETE (endTriggered)`); W.done = true; }
          if (W.closed && W.t - W.endT > 75) { W.log.push('END TIMEOUT door.open=' + L.endDoor.open + ' state=' + window.session.state); W.done = true; }
          continue;
        }
        // drive the player with the game's own bot brain (A*, smoothing, doors, combat)
        if (!W.bb) { const B = g.survivors.find((s) => s.brain)?.brain.constructor || window.__BotBrain; window.__BotBrain = B; W.bb = new B(g, p, 3); }
        const openBefore = L.doors.filter((d) => d.open).length;
        if (!W.loot) W.bb.itemT = 1e9;
        W.bb.update(0.1);
        const c = p.cmd;
        g.testCmd = { mx: c.mx, my: c.my, sprint: c.sprint, jump: c.jump || (W.stuckT > 1.5 && W.stuckT < 1.6), fire: c.fire, firePressed: c.firePressed, shove: c.shove, shoveHeld: c.shoveHeld, reload: c.reload, slot: c.slot, use: c.use, usePressed: c.usePressed, crouch: c.crouch };
        const door = null;
        g.advance(0.1);
        const openAfter = L.doors.filter((d) => d.open).length;
        if (openAfter > openBefore) W.log.push(`t=${W.t.toFixed(0)} opened a door near ${fmt(p.pos)}`);
        const pr = L.progressAt(p.pos.x, p.pos.y, p.pos.z);
        if (pr > W.lastProg + 0.002) { W.lastProg = pr; W.stuckT = 0; } else W.stuckT += 0.1;
        if (W.stuckT > 20) { W.log.push(`STUCK at ${fmt(p.pos)} prog ${pr.toFixed(3)} goal=${W.bb.pathGoal ? fmt(W.bb.pathGoal) : '-'} mode=${W.bb.mode}`); W.done = true; }
        if (p.dead) { W.log.push('PLAYER DIED at ' + fmt(p.pos)); W.done = true; }
        if (Math.floor(W.t * 10) % 300 === 0) {
          const bs = g.survivors.filter((s) => s !== p).map((s) => `${s.char.id}:${s.dead ? 'DEAD' : s.pos.distanceTo(p.pos).toFixed(0) + 'm' + (s.incapped ? '!' : '')}`).join(' ');
          W.log.push(`t=${W.t.toFixed(0)} pos ${fmt(p.pos)} prog ${pr.toFixed(3)} | ${bs} | inf ${g.infected.commons.filter((c) => !c.dead).length} sp ${g.infected.specials.filter((s) => !s.dead).map((s) => s.kind).join(',')} | errs ${g.errCount || 0}`);
        }
      }
      g.testCmd = null;
      const out = W.log.splice(0);
      return { out, done: W.done, t: W.t, maxProg: W.maxProg, pos: fmt(p.pos) + ' inf ' + g.infected.commons.filter((c) => !c.dead).length };
    });
    if (!r) { console.log('eval failed'); break; }
    if (process.env.VERBOSE) console.log(`[v] t=${r.t.toFixed(1)} wall=${((Date.now() - t0) / 1000).toFixed(0)}s ${r.pos || ''}`);
    for (const l of r.out) console.log(l);
    if (r.done) { console.log(`maxProg ${r.maxProg.toFixed(3)} gameTime ${r.t.toFixed(0)}s wall ${((Date.now() - t0) / 1000).toFixed(0)}s`); break; }
  }
  const fin = await evalg(() => ({ end: window.session.endTriggered, state: window.session.state, errs: window.game.errCount || 0, stats: window.game.director.stats }));
  console.log('final', JSON.stringify(fin));
  if (process.env.SHOT) { await evalg(() => { window.game.noRender = false; }); await wait(3000); await shot('da3_play_end'); }
};
