// Chapter 1 bot playthrough: the human walks the intended route (teleport stepping
// along the survivor A* path at ~4 m/s, shooting at visible infected), bots + director on,
// god mode for the human only. Reports bot lag, incaps/deaths, stuck-teleports, completion.
// env: DIRECTOR=0 to disable the director, NOFIRE=1 human doesn't shoot.
export default async ({ page, evalg, wait, logs }) => {
  page.on('crash', () => console.log('PAGE CRASHED'));
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?autostart=0');
  for (let i = 0; i < 90; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  const dirOn = process.env.DIRECTOR !== '0';
  const fire = process.env.NOFIRE !== '1';
  const init = await evalg(([dirOn]) => {
    const g = window.game, P = g.player;
    g.cheats.god = true; // human only (survivor.js: god && isHuman)
    g.director.enabled = dirOn;
    window.session.menu?.clear?.();
    window.__st = { stuck: [], incaps: {}, deaths: [], minHp: {} };
    for (const s of g.survivors) {
      if (s === P) continue;
      const tp = s.teleport.bind(s);
      s.teleport = (x, y, z, yaw) => { window.__st.stuck.push(`${s.char.id} @${s.pos.x.toFixed(1)},${s.pos.y.toFixed(1)},${s.pos.z.toFixed(1)} t${g.time.toFixed(0)}`); return tp(x, y, z, yaw); };
    }
    return { surv: g.survivors.map((s) => s.char.id + (s === P ? '(human)' : '') + (s.isBot ? ':bot' : '')), god: g.cheats.god };
  }, [dirOn]);
  console.log('init', JSON.stringify(init));
  const route = [
    ['bulkDoor', 7.6, 14.4, 8.5, 1], ['stairTop', 1.6, 14.4, 8.2, 0.5], ['stairBot', 1.6, 10.8, 1.2, 1], ['enclDoor', 5.2, 10.8, 9.9, 1],
    ['corr3', 20, 10.8, 10.4, 1], ['apt3F', 23.3, 10.8, 12.5, 1], ['holeEdge', 26.5, 10.8, 15, 1], ['f2land', 28.3, 7.2, 15.3, 3],
    ['apt2Fdoor', 23.4, 7.2, 12, 1], ['shaftDoor', 25.8, 7.2, 9.0, 1], ['land1', 27, 3.6, 8.6, 1], ['land0', 27, 0, 8.6, 1],
    ['lobby', 20, 0, 15, 2], ['street', 19.5, 0.15, 22, 1], ['road', 40, 0, 28, 1], ['pharmIn', 41, 0.15, 38, 1], ['pharmBack', 45.6, 0.15, 46.5, 2],
    ['alley', 60, 0.15, 51, 1], ['alleyE', 90, 0.15, 51, 1], ['grand', 104, 0, 30, 1], ['stairsTop', 104, 0.15, 13.5, 1], ['tunnel', 104, -6, 0, 1],
    ['concourse', 104, -6, -8, 1], ['gate', 102.8, -6, -14, 1], ['srDoor', 103, -6, -22.5, 2], ['sr', 105, -6, -28, 2],
  ];
  const t0 = Date.now();
  for (const [name, x, y, z, adv] of route) {
    const r = await evalg(([name, x, y, z, adv, fire]) => {
      const g = window.game, L = g.level, nav = L.nav, P = g.player, st = window.__st;
      const aimFire = () => {
        // simple human: shoot the nearest visible hostile within 20 m
        let best = null, bd = 20;
        const ex = P.pos.x, ey = P.pos.y + 1.6, ez = P.pos.z;
        for (const e of g.infected.commons) { if (e.dead || e.state === 0) continue; const d = e.pos.distanceTo(P.pos); if (d < bd && L.col.lineOfSight(ex, ey, ez, e.pos.x, e.pos.y + 1.3, e.pos.z)) { bd = d; best = e; } }
        for (const e of g.infected.specials) { if (e.dead || e.kind === 'witch') continue; const d = e.pos.distanceTo(P.pos); if (d < bd && L.col.lineOfSight(ex, ey, ez, e.pos.x, e.pos.y + 1.2, e.pos.z)) { bd = d; best = e; } }
        if (!best) { g.testCmd = { reload: true }; return; }
        const dx = best.pos.x - ex, dy = best.pos.y + 1.3 - ey, dz = best.pos.z - ez;
        P.yaw = Math.atan2(-dx, -dz); P.pitch = Math.atan2(dy, Math.hypot(dx, dz));
        g.testCmd = { fire: true, firePressed: true, shove: bd < 1.3 };
      };
      const track = () => {
        for (const s of g.survivors) {
          if (s === P) continue;
          if (s.incapped && !st.incaps[s.char.id + g.time.toFixed(0)]) { const k = s.char.id; st.incaps[k] = (st.incaps[k] || 0) + (s._wasInc ? 0 : 1); }
          s._wasInc = s.incapped;
          if (s.dead && !st.deaths.includes(s.char.id)) st.deaths.push(s.char.id + '@' + s.pos.x.toFixed(0) + ',' + s.pos.y.toFixed(0) + ',' + s.pos.z.toFixed(0));
          st.minHp[s.char.id] = Math.min(st.minHp[s.char.id] ?? 999, Math.round(s.totalHealth));
        }
      };
      const tick = (sec) => { const n = Math.round(sec / 0.25); for (let i = 0; i < n; i++) { if (fire) aimFire(); g.advance(0.25); track(); } g.testCmd = null; };
      const path = nav.findPath(P.pos.x, P.pos.y, P.pos.z, x, y, z, 80000);
      let note = '';
      if (!path) note = ' NOPATH';
      else {
        if (path.partial) note = ' PARTIAL';
        let acc = 0, lx = P.pos.x, lz = P.pos.z;
        for (let i = 1; i < path.length; i++) {
          const n = path[i];
          const nx = nav.nodeX(n), ny = nav.nodeY[n], nz = nav.nodeZ(n);
          acc += Math.hypot(nx - lx, nz - lz); lx = nx; lz = nz;
          if (acc >= 1.8 || i === path.length - 1) {
            const yaw = Math.atan2(-(nx - P.pos.x), -(nz - P.pos.z));
            P.teleport(nx, ny + 0.02, nz, yaw);
            tick(acc / 4.0);
            acc = 0;
          }
        }
      }
      tick(adv);
      const prog = (s) => L.progressAt(s.pos.x, s.pos.y, s.pos.z);
      const pp = prog(P);
      const bots = g.survivors.filter((s) => s !== P);
      return name.padEnd(10) + note + ` t${g.time.toFixed(0)} prog ${pp.toFixed(3)} | ` + bots.map((b) => `${b.char.id}:${b.pos.distanceTo(P.pos).toFixed(1)}m dp${(prog(b) - pp).toFixed(3)} dy${(b.pos.y - P.pos.y).toFixed(1)} hp${Math.round(b.totalHealth)}${b.incapped ? ' INC' : ''}${b.dead ? ' DEAD' : ''}${b.pinned ? ' PIN' : ''}`).join('  ') + ` | cm ${g.infected.commons.filter((c) => !c.dead).length} sp ${g.infected.specials.filter((s) => !s.dead).map((s) => s.kind).join(',')} dir ${g.director.state}`;
    }, [name, x, y, z, adv, fire]);
    console.log(r);
  }
  // wait for bots to gather inside the end safe room, then close the door
  const end = await evalg(() => {
    const g = window.game, L = g.level, P = g.player, st = window.__st;
    let waited = 0;
    const inside = () => g.survivors.filter((s) => !s.dead).every((s) => L.inBox(L.endSafe, s.pos, 0.1) && !s.incapped);
    while (waited < 60 && !inside()) { g.advance(0.5); waited += 0.5; }
    const d = L.endDoor;
    const wasOpen = d.open;
    if (d.open) d.use(P);
    g.advance(3);
    return { waited, allInside: inside(), doorWasOpen: wasOpen, doorOpen: d.open, endTriggered: window.session.endTriggered, state: window.session.state,
      pos: g.survivors.map((s) => `${s.char.id}:${s.pos.x.toFixed(1)},${s.pos.y.toFixed(1)},${s.pos.z.toFixed(1)}${s.dead ? ' DEAD' : ''}${L.inBox(L.endSafe, s.pos, 0.1) ? ' IN' : ' OUT'}`),
      stuck: st.stuck, incaps: st.incaps, deaths: st.deaths, minHp: st.minHp, errCount: g.errCount || 0, time: g.time.toFixed(0) };
  });
  console.log('END', JSON.stringify(end, null, 1));
  console.log('wall s', ((Date.now() - t0) / 1000).toFixed(0));
  await wait(1000);
  console.log('ERRORS:', logs.filter((l) => l.startsWith('[error]') || l.startsWith('[pageerror]')).length);
};
