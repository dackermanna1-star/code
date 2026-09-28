// Ch2 regression check 4: full bot playthrough. Director on, bots on and VULNERABLE, god for the
// human only. The human "walks" (teleport-steps along the survivor nav path at WALK m/s), opens doors
// on the way, shoots nearby infected at a human-like rate, starts the generator and waits for the gate,
// then waits in the pawn shop for everyone and closes the door. Logs bot lag / deaths / incaps /
// stuck-rescue teleports.
const TY = -6.2;
const ROUTE = [
  ['safe', -4.5, 0, 5.5], ['concourse', 3, 0, 6.6], ['booth', 15, 0, 11], ['turnstile', 21, 0, 11.2], ['stairsTop', 30.5, 0, 5.5], ['platform', 45, -5, 5],
  ['carDoor', 55.4, -5, 9.6], ['car2', 67.4, -5, 11.1], ['carDoorS', 71.2, -5, 12.4], ['track', 72, TY, 14], ['farTrack', 90, TY, 16], ['tunnel', 110, TY, 13],
  ['wreck', 130, TY, 12.5], ['crossing', 138.5, TY, 14], ['wreck2', 150, TY, 17], ['caveIn', 163, TY, 16], ['corridor', 165.2, TY, 25], ['corridor2', 165.2, TY, 38],
  ['hall', 165.2, TY, 42.5], ['console', 165.4, TY, 50.1, 'generator'], ['hallMid', 176, TY, 55], ['dock', 186, TY, 55], ['office', 203, 0, 55], ['cubicles', 208, 0, 52.4],
  ['cubicles2', 222.5, 0, 52.4], ['aisle', 222.5, 0, 59], ['corrW', 214, 0, 61.5], ['lobby', 228, 0, 64.6], ['alley', 234, 0.15, 64.6], ['alleyEnd', 235, 0.15, 69],
  ['street', 245, 0, 80], ['pawnDoorOut', 253.5, 0.15, 86.6], ['end', 256, 0.15, 93.3, 'end'],
];
export default async ({ page, evalg, wait, logs }) => {
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?autostart=1');
  for (let i = 0; i < 120; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  await evalg((WALK) => {
    const g = window.game, L = g.level, p = g.player;
    g.cheats.god = true; g.cheats.godAll = false; g.director.enabled = true; g.cheats.botsIdle = false;
    g.hud.show(false); window.session.menu.clear();
    p.giveWeapon('smg');
    const W = window.__W = { deaths: [], incaps: [], tps: [], maxLag: {}, maxDist: {}, shots: 0, kills: 0, WALK, ourTp: false };
    for (const s of g.survivors) {
      if (s === p) continue;
      const d0 = s.die.bind(s);
      s.die = (c) => { W.deaths.push([s.char.id, c, +s.pos.x.toFixed(1), +s.pos.y.toFixed(1), +s.pos.z.toFixed(1), +g.time.toFixed(1)]); return d0(c); };
      const i0 = s.incap.bind(s);
      s.incap = (c) => { W.incaps.push([s.char.id, c, +s.pos.x.toFixed(1), +s.pos.z.toFixed(1), +g.time.toFixed(1)]); return i0(c); };
      const t0 = s.teleport.bind(s);
      s.teleport = (x, y, z, yaw) => { if (!W.ourTp) W.tps.push([s.char.id, 'from', +s.pos.x.toFixed(1), +s.pos.y.toFixed(1), +s.pos.z.toFixed(1), 'to', +x.toFixed(1), +z.toFixed(1), +g.time.toFixed(1)]); return t0(x, y, z, yaw); };
    }
    // the human: kills one visible infected (non-idle within 14 m, or pinning specials) every 0.35 s
    let gunT = 0;
    W.gun = (dt) => {
      gunT -= dt;
      if (gunT > 0) return;
      gunT = 0.35;
      let best = null, bd = 1e9;
      const ey = p.pos.y + 1.6;
      const cand = (e) => {
        if (e.dead || e.removed) return;
        if (e.kind === 'witch' && !e.enraged) return;
        const d = e.pos.distanceTo(p.pos);
        if (d > 14) return;
        if (!e.special && e.state === 0 && d > 5) return;
        const sc = d - (e.pinning ? 20 : 0) - (e.special ? 4 : 0);
        if (sc < bd && L.col.lineOfSight(p.pos.x, ey, p.pos.z, e.pos.x, e.pos.y + 1.2, e.pos.z)) { bd = sc; best = e; }
      };
      g.infected.commons.forEach(cand);
      g.infected.specials.forEach(cand);
      if (!best) return;
      const dir = best.pos.clone().sub(p.pos).setY(0).normalize();
      W.shots++;
      best.takeHit({ damage: best.special ? 60 : 200, zone: 'head', part: 2, kind: 'bullet', attacker: p, knockback: 1, dir, x: best.pos.x, y: best.pos.y + 1.5, z: best.pos.z });
      if (best.dead) W.kills++;
    };
    W.track = () => {
      const pp = L.progressAt(p.pos.x, p.pos.y, p.pos.z);
      for (const s of g.survivors) {
        if (s === p || s.dead) continue;
        const bp = L.progressAt(s.pos.x, s.pos.y, s.pos.z);
        if (bp < 0 || pp < 0) { W.offGrid = (W.offGrid || 0) + 1; continue; } // mid-jump / on a prop
        const lag = pp - bp, d = s.pos.distanceTo(p.pos);
        if (lag > (W.maxLag[s.char.id]?.[0] ?? -1)) W.maxLag[s.char.id] = [+lag.toFixed(3), +s.pos.x.toFixed(1), +s.pos.y.toFixed(1), +s.pos.z.toFixed(1), +g.time.toFixed(1)];
        if (d > (W.maxDist[s.char.id]?.[0] ?? -1)) W.maxDist[s.char.id] = [+d.toFixed(1), +s.pos.x.toFixed(1), +s.pos.y.toFixed(1), +s.pos.z.toFixed(1), +g.time.toFixed(1)];
      }
    };
    W.step = (dt) => {
      // open closed doors the human walks into
      for (const d of L.doors) if (!d.open && !d.locked && !d.broken && Math.hypot(d.cx - p.pos.x, d.cz - p.pos.z) < 1.6 && Math.abs(d.cy - p.pos.y) < 2 && d.canUse(p)) d.use(p);
      W.gun(dt);
      g.advance(dt);
      W.track();
    };
    W.summary = () => ({ t: +g.time.toFixed(1), prog: +L.progressAt(p.pos.x, p.pos.y, p.pos.z).toFixed(3),
      bots: g.survivors.filter((s) => s !== p).map((s) => [s.char.id[0], s.dead ? 'DEAD' : s.incapped ? 'INC' : Math.round(s.totalHealth), +s.pos.distanceTo(p.pos).toFixed(1), +L.progressAt(s.pos.x, s.pos.y, s.pos.z).toFixed(3), s.brain?.mode]),
      commons: g.infected.commons.filter((c) => !c.dead).length, specials: g.infected.specials.filter((s) => !s.dead).map((s) => s.kind[0]).join(''), kills: W.kills, dir: g.director.state });
    // gear up in the safe room
    for (let i = 0; i < 30; i++) W.step(0.2);
  }, +(process.env.WALK || 4.5));
  const t0 = Date.now();
  let prev = null;
  for (const [name, x, y, z, act] of ROUTE) {
    const r = await evalg(([name, x, y, z, act]) => {
      const g = window.game, L = g.level, nav = L.nav, p = g.player, W = window.__W;
      const out = { seg: name };
      // walk along the survivor path from the current spot
      const path = nav.findPath(p.pos.x, p.pos.y, p.pos.z, x, y, z, 400000);
      if (!path || path.partial) out.path = path ? 'PARTIAL' : 'NONE';
      const pts = (path || []).map((n) => [nav.nodeX(n), nav.nodeY[n], nav.nodeZ(n)]);
      let i = 0, guard = 0;
      const dt = 0.1, stepLen = W.WALK * dt;
      let cx = p.pos.x, cz = p.pos.z, cy = p.pos.y; // walk cursor (independent of physics pushes)
      while (i < pts.length && guard++ < 3000) {
        let rem = stepLen;
        const ox = cx, oz = cz;
        while (rem > 0 && i < pts.length) {
          const [nx, ny, nz] = pts[i];
          const dd = Math.hypot(nx - cx, nz - cz);
          if (dd <= rem) { cx = nx; cz = nz; cy = ny; rem -= dd; i++; } else { cx += (nx - cx) / dd * rem; cz += (nz - cz) / dd * rem; cy = ny; rem = 0; }
        }
        const yaw = Math.atan2(-(cx - ox), -(cz - oz));
        p.teleport(cx, cy + 0.02, cz, yaw);
        W.step(dt);
      }
      if (act === 'generator') {
        for (let k = 0; k < 10; k++) W.step(0.2);
        L.ch2Generator.usable.onUse(p);
        let t = 0;
        while (!L.ch2Generator.ev.open && t < 110) { W.step(0.2); t += 0.2; }
        out.gen = { waited: +t.toFixed(1), open: L.ch2Generator.ev.open, panic: !!g.director.panicState };
        for (let k = 0; k < 15; k++) W.step(0.2);
      }
      if (act === 'end') {
        const alive = () => g.survivors.filter((s) => !s.dead);
        const inside = () => alive().filter((s) => L.inBox(L.endSafe, s.pos, 0.1)).length;
        let w = 0;
        while (inside() < alive().length && w < 40) { W.step(0.5); w += 0.5; }
        out.inside = inside() + '/' + alive().length; out.waited = w;
        if (L.endDoor.open) L.endDoor.use(p);
        for (let k = 0; k < 20; k++) W.step(0.2);
        out.endTriggered = window.session.endTriggered; out.state = window.session.state;
      }
      Object.assign(out, W.summary());
      return out;
    }, [name, x, y, z, act]);
    console.log(JSON.stringify(r));
    if (!r) break;
  }
  console.log('real seconds', Math.round((Date.now() - t0) / 1000));
  console.log('RESULT', JSON.stringify(await evalg(() => { const W = window.__W; return { deaths: W.deaths, incaps: W.incaps, stuckTeleports: W.tps, maxLag: W.maxLag, maxDist: W.maxDist, offGridSamples: W.offGrid || 0, shots: W.shots, errCount: window.game.errCount || 0 }; })));
  const bad = logs.filter((l) => l.startsWith('[error]') || l.startsWith('[pageerror]'));
  console.log('ERRORS', bad.length);
};
