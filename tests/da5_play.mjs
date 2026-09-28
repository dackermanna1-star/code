// Dead Air 5 (Runway Finale) playthrough, logic-only. The human walks the
// survivor route (descending the toExit field, E at doors), sits through the
// crash cinematic, uses the radio, starts the pump, holds the tanker through
// the finale (firing at the nearest infected), boards Evac 41 and watches the
// escape until victory. DIRECTOR=1 director on, BOTS=1 bots follow/fight.
// WALKONLY=1 stops at the ramp (route check with the ramp lowered).
export default async ({ page, evalg, wait }) => {
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?campaign=deadair&autostart=4', { timeout: 180000 });
  for (let i = 0; i < 400; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  const dirOn = process.env.DIRECTOR === '1', bots = process.env.BOTS === '1', walkOnly = process.env.WALKONLY === '1';
  await evalg(([dirOn, bots]) => {
    const g = window.game;
    g.director.enabled = dirOn; g.cheats.god = true; if (!dirOn) g.cheats.godAll = true;
    g.noRender = true;
    window.session.menu?.clear?.();
    if (!bots) for (const s of g.survivors) if (s !== g.player) s.brain = null;
    window.__w = { t: 0, lastProg: -1, stuckT: 0, useT: 0, log: [], done: false, phase: 'walk', maxProg: 0 };
    const W = window.__w;
    for (const s of g.survivors) for (const m of ['incap', 'die']) {
      const o = s[m].bind(s);
      s[m] = (cause) => { const near = g.infected.specials.filter((k) => !k.dead && k.pos.distanceTo(s.pos) < 8).map((k) => k.kind).join('+'); const nc = g.infected.commons.filter((c) => !c.dead && c.pos.distanceTo(s.pos) < 4).length; W.log.push(`t=${W.t.toFixed(0)} ${s.char.id} ${m.toUpperCase()} (${cause}) at ${s.pos.toArray().map((q) => q.toFixed(0)).join(',')} pinned ${s.pinned?.kind || '-'} near ${near || '-'} commons<4m ${nc}`); return o(cause); };
    }
  }, [dirOn, bots]);
  for (let chunk = 0; chunk < 500; chunk++) {
    const r = await evalg((walkOnly) => {
      const g = window.game, L = g.level, nav = L.nav, p = g.player, W = window.__w, S = L.da5, F = L.finale;
      const f = nav.fields.toExit;
      const fmt = (v) => v.toArray().map((q) => q.toFixed(1)).join(',');
      const nearestInf = () => { let best = null, bd = 1e9; for (const c of g.infected.commons) { if (c.dead) continue; const d = c.pos.distanceTo(p.pos); if (d < bd) { bd = d; best = c; } } for (const c of g.infected.specials) { if (c.dead) continue; const d = c.pos.distanceTo(p.pos); if (d < bd) { bd = d; best = c; } } return [best, bd]; };
      const aim = (tgt) => { const dx = tgt.pos.x - p.pos.x, dz = tgt.pos.z - p.pos.z, dy = tgt.pos.y + 1.2 - (p.pos.y + 1.6); p.yaw = Math.atan2(-dx, -dz); p.pitch = Math.atan2(dy, Math.hypot(dx, dz)); };
      const walkStep = () => {
        if (p.pinned && !p.pinned.dead) { if (!W.pinLog || W.t - W.pinLog > 5) { W.pinLog = W.t; W.log.push(`t=${W.t.toFixed(0)} player pinned by ${p.pinned.kind} at ${fmt(p.pos)} (test: teammate shoves it off)`); } const k = p.pinned; k.takeHit({ damage: 99999, zone: 'head', kind: 'bullet', x: k.pos.x, y: k.pos.y + 1, z: k.pos.z, dir: { x: 0, y: 0, z: 1 }, attacker: p }); }
        let cur = nav.nodeAt(p.pos.x, p.pos.y, p.pos.z);
        if (cur < 0 || Math.abs(nav.nodeY[cur] - p.pos.y) > 0.8) cur = nav.nearestNode(p.pos.x, p.pos.y, p.pos.z, 2);
        if (cur < 0) { W.log.push('OFF NAV at ' + fmt(p.pos)); W.done = true; return; }
        let n = cur;
        const desc = (q) => { let best = -1, bd = f[q]; for (let d = 0; d < 8; d++) { const v = nav.links[q * 8 + d]; if (v < 0 || nav.ltype[q * 8 + d] === 1) continue; if (f[v] < bd) { bd = f[v]; best = v; } } return best; }; // survivors never take climb links
        for (let k = 0; k < 5; k++) { const m = desc(n); if (m < 0) break; n = m; if (Math.abs(nav.nodeY[m] - nav.nodeY[cur]) > 1.0) break; }
        let dx = nav.nodeX(n) - p.pos.x, dz = nav.nodeZ(n) - p.pos.z;
        if (Math.hypot(dx, dz) < 0.2) { dx = nav.nodeX(n) - nav.nodeX(cur); dz = nav.nodeZ(n) - nav.nodeZ(cur); }
        p.yaw = Math.atan2(-dx, -dz); p.pitch = 0;
        const door = L.doors.find((d) => !d.open && !d.broken && Math.hypot(d.cx - p.pos.x, d.cz - p.pos.z) < 1.8 && Math.abs(d.cy - p.pos.y) < 2);
        W.useT -= 0.1;
        const use = door && W.useT <= 0;
        if (use) { W.useT = 1; if (door.locked) W.log.push('LOCKED DOOR ' + door.cx + ',' + door.cz); }
        const [inf, idist] = nearestInf();
        g.testCmd = { my: 1, usePressed: use, jump: W.stuckT > 0.8 && W.stuckT < 0.9, fire: !!inf && idist < 9 };
        if (inf && idist < 9) { const yw = p.yaw; aim(inf); g.advance(0.05); p.yaw = yw; p.pitch = 0; g.advance(0.05); } else g.advance(0.1);
        const prog = L.progressAt(p.pos.x, p.pos.y, p.pos.z);
        if (prog < 0 && !W.negLogged) { W.negLogged = true; W.log.push('NEG PROG at ' + fmt(p.pos)); }
        if (prog > W.lastProg + 0.002) { W.lastProg = prog; W.stuckT = 0; } else W.stuckT += 0.1;
        if (prog > W.maxProg) W.maxProg = prog;
        if (W.stuckT > 12) { W.log.push(`STUCK at ${fmt(p.pos)} prog ${prog.toFixed(3)} phase ${W.phase} pinned ${p.pinned?.kind || '-'} incap ${p.incapped} stun ${p.stunT?.toFixed(1)} mounted ${!!p.usingMounted}`); W.done = true; }
        if (Math.floor(W.t * 10) % 300 === 0) W.log.push(`t=${W.t.toFixed(0)} pos ${fmt(p.pos)} prog ${prog.toFixed(3)} phase ${W.phase}`);
      };
      for (let step = 0; step < 150 && !W.done; step++) {
        W.t += 0.1;
        const pn = g.director.panicState?.name || null;
        if (pn !== W.lastPanic) { W.log.push(`t=${W.t.toFixed(0)} panic ${W.lastPanic || '-'} -> ${pn || '-'} fuel ${F.fuel.toFixed(0)} stage ${F.stage} commons ${g.infected.commons.filter((c) => !c.dead).length}`); W.lastPanic = pn; }
        const tk = g.infected.specials.find((s) => s.kind === 'tank' && !s.dead);
        if (tk && !W.tank) { W.tank = tk; W.tankT = W.t; W.log.push(`t=${W.t.toFixed(0)} TANK at ${fmt(tk.pos)}`); }
        if (W.tank && W.tank.dead) { W.log.push(`t=${W.t.toFixed(0)} tank dead after ${(W.t - W.tankT).toFixed(0)} s`); W.tank = null; }
        if (tk && W.t - W.tankT > 60) { tk.takeHit({ damage: 99999, zone: 'torso', kind: 'bullet', x: tk.pos.x, y: tk.pos.y + 1, z: tk.pos.z, dir: { x: 0, y: 0, z: 1 }, attacker: p }); W.log.push(`t=${W.t.toFixed(0)} (test) finished the tank`); }
        if (F.stage !== W.lastStage) { W.log.push(`t=${W.t.toFixed(0)} STAGE ${W.lastStage} -> ${F.stage} fuel ${F.fuel.toFixed(1)} hp ` + g.survivors.map((s) => s.char.id[0] + Math.round(s.totalHealth ?? s.hp) + (s.incapped ? 'I' : '') + (s.dead ? 'D' : '')).join(' ')); W.lastStage = F.stage; }
        if (window.session.state === 'failed' && !W.failLogged) { W.failLogged = true; W.log.push(`t=${W.t.toFixed(0)} SESSION FAILED at ${fmt(p.pos)} stage ${F.stage}`); W.done = true; break; }
        if (window.session.state === 'victory') { W.log.push(`t=${W.t.toFixed(0)} VICTORY`); W.done = true; break; }
        if (W.phase === 'walk' && F.crash === 'running') { W.phase = 'crash'; W.log.push(`t=${W.t.toFixed(0)} crash cinematic at ${fmt(p.pos)}`); }
        if (W.phase === 'crash') { g.testCmd = { my: 0 }; g.advance(0.1); if (F.crash === 'done') { W.phase = 'walk'; W.stuckT = 0; W.log.push(`t=${W.t.toFixed(0)} crash done; panes broken ${S.loungePanes.filter((q) => q.broken).length}/${S.loungePanes.length}`); } continue; }
        if (W.phase === 'walk' && S.radio.enabled && p.pos.distanceTo(S.radio.pos) < 2.0) { W.phase = 'radio'; S.radio.onUse(p); W.radioT = W.t; W.log.push(`t=${W.t.toFixed(0)} RADIO (prog ${L.progressAt(p.pos.x, p.pos.y, p.pos.z).toFixed(3)})`); }
        if (W.phase === 'radio') {
          const [inf, idist] = nearestInf();
          if (inf && idist < 20) aim(inf);
          g.testCmd = { my: 0, fire: !!inf && idist < 20 };
          g.advance(0.1);
          if (S.pump.enabled) {
            if (walkOnly) { W.phase = 'walk2'; F.stage = 'board'; S.plane.lowerRamp(0.5); W.log.push('(walkonly) ramp lowered'); continue; }
            W.phase = 'finale'; if (!g.director.enabled) { g.director.enabled = true; g.director.cfg.wanderers = 0; g.director.blockMobs = true; } p.teleport(S.pump.pos.x - 0.6, 0.02, S.pump.pos.z - 1.2, 0); S.pump.onUse(p); W.log.push(`t=${W.t.toFixed(0)} PUMP started, stage ${F.stage}; spawn sides ` + F.sides.map((l) => l.length).join('/') + ` (hall ${F.hallNodes.length} hangar ${F.hangarNodes.length} strip ${F.stripNodes.length} west ${F.westNodes.length})`);
          }
          continue;
        }
        if (W.phase === 'finale') {
          const [inf, idist] = nearestInf();
          if (inf) aim(inf);
          g.testCmd = { my: 0, fire: !!inf && idist < 40, reload: !inf };
          g.advance(0.1);
          if (Math.floor(W.t * 10) % 200 === 0) W.log.push(`t=${W.t.toFixed(0)} fuel ${F.fuel.toFixed(0)}/${F.cap} stage ${F.stage} commons ${g.infected.commons.filter((c) => !c.dead).length} specials ${g.infected.specials.filter((c) => !c.dead).map((c) => c.kind).join('+')} hp ` + g.survivors.map((s) => s.char.id[0] + Math.round(s.totalHealth ?? s.hp) + (s.incapped ? 'I' : '') + (s.dead ? 'D' : '')).join(' '));
          if (F.stage === 'board' && S.plane.ramp >= S.plane.rampTarget - 0.02) { W.phase = 'walk2'; W.stuckT = 0; W.boardT = W.t; W.log.push(`t=${W.t.toFixed(0)} RAMP DOWN, boarding`); }
          continue;
        }
        if (W.phase === 'walk2') {
          const z = S.plane.boardZone;
          const inZ = (s) => s.pos.x > z[0] && s.pos.x < z[3] && s.pos.z > z[2] && s.pos.z < z[5] && s.pos.y > z[1];
          if (walkOnly && inZ(p) && L.progressAt(p.pos.x, p.pos.y, p.pos.z) < 0.995 && W.t - (W.inHoldT ??= W.t) < 8) { walkStep(); continue; }
          if (inZ(p)) {
            if (p.pinned && !p.pinned.dead) { W.log.push(`t=${W.t.toFixed(0)} player pinned in hold by ${p.pinned.kind} (test: shoved off)`); const k = p.pinned; k.takeHit({ damage: 99999, zone: 'head', kind: 'bullet', x: k.pos.x, y: k.pos.y + 1, z: k.pos.z, dir: { x: 0, y: 0, z: 1 }, attacker: p }); }
            if (window.session.state === 'failed') { W.log.push('SESSION FAILED'); W.done = true; break; }
            if (walkOnly) { W.log.push(`t=${W.t.toFixed(0)} IN HOLD prog ${L.progressAt(p.pos.x, p.pos.y, p.pos.z).toFixed(3)} maxProg ${W.maxProg.toFixed(3)}`); W.done = true; break; }
            const [inf, idist] = nearestInf();
            if (inf) aim(inf);
            g.testCmd = { my: 0, fire: !!inf && idist < 30 };
            g.advance(0.1);
            if (!W.inLogged) { W.inLogged = true; W.inT = W.t; W.log.push(`t=${W.t.toFixed(0)} player in hold; bots: ` + g.survivors.filter((s) => s !== p).map((s) => s.char.id + (s.dead ? ':DEAD' : inZ(s) ? ':in' : '@' + fmt(s.pos))).join(' ')); }
            if (W.t - W.inT > 45 && !W.forced) { W.forced = true; W.log.push('bots late, teleporting: ' + g.survivors.filter((s) => s !== p && !s.dead && !inZ(s)).map((s) => s.char.id + '@' + fmt(s.pos) + (s.incapped ? 'I' : '')).join(' ')); for (const s of g.survivors) if (!s.dead && !inZ(s)) { if (s.incapped) s.revive?.(); s.teleport(S.plane.holdCentre[0], S.plane.holdCentre[1] + 0.05, S.plane.holdCentre[2], 0); } }
            continue;
          }
          walkStep();
          continue;
        }
        if (F.stage === 'escape') { g.testCmd = { my: 0 }; g.advance(0.1); continue; }
        // the objective points at the crewman's radio (flare-lit): detour to it once it is near
        if (W.phase === 'walk' && F.stage === 'pre' && S.radio.enabled && p.pos.distanceTo(S.radio.pos) < 24) { W.rf ??= nav.computeStatic('da5TestRadio', [[S.radio.pos.x - 1, 0, S.radio.pos.z]], { survivor: true }); walkStep(W.rf, false); continue; }
        walkStep();
      }
      g.testCmd = null;
      const out = W.log.splice(0);
      return { out, done: W.done };
    }, walkOnly);
    if (!r) { console.log('eval failed'); break; }
    for (const l of r.out) console.log(l);
    if (r.done) break;
    if (process.env.MAXCHUNK && chunk > +process.env.MAXCHUNK) break;
  }
  console.log('final', JSON.stringify(await evalg(() => ({ state: window.session.state, stage: window.game.level.finale.stage, fuel: window.game.level.finale.fuel }))));
};
