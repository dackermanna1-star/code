// Dead Air ch1 (The Greenhouse) bot playthrough (adapted from ch1_bots): the human walks the intended route (teleport stepping
// along the survivor A* path at ~4 m/s, shooting at visible infected), bots + director on,
// god mode for the human only. Reports bot lag, incaps/deaths, stuck-teleports, completion.
// env: DIRECTOR=0 to disable the director, NOFIRE=1 human doesn't shoot.
export default async ({ page, evalg, wait, logs }) => {
  page.on('crash', () => console.log('PAGE CRASHED'));
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?campaign=deadair&autostart=0');
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
    ['ghMid', 18, 18, 27, 1], ['ghDoor', 27.5, 18, 27, 1], ['plankA', 31, 18, 37, 2], ['plankB', 40, 18, 37, 3], ['Bsouth', 52, 18, 36, 2], ['Bgate', 59, 18, 31.2, 2],
    ['Bencl', 52, 18, 25, 1], ['bulk', 44.5, 18, 25.35, 2], ['topLand', 42, 18, 25.5, 1], ['F4bottom', 40.3, 14.4, 25.5, 1], ['F4cor', 45, 14.4, 28.2, 1],
    ['5Ddoor', 50.5, 14.4, 29.8, 1], ['holeEdge', 53.5, 14.4, 35.8, 2], ['F3land', 53.8, 10.8, 38.3, 4], ['4Ddoor', 55.5, 10.8, 29.8, 1], ['F3cor', 60, 10.8, 28.2, 2],
    ['F3end', 64.8, 10.8, 28.2, 1], ['fePlat', 66.8, 10.8, 28.2, 1], ['feBottom', 66.8, 7.2, 36, 2], ['Croof', 72, 7.24, 27, 1], ['Ddoor', 79.2, 7.24, 20.5, 1],
    ['Dlobby', 82.5, 7.2, 21.5, 1], ['office', 90, 7.2, 22.5, 1], ['office2', 101, 7.2, 30, 1], ['partition', 102.3, 7.2, 35.2, 1], ['lounge', 92, 7.2, 40, 1],
    ['sill', 84.25, 7.2, 43.2, 2], ['trailer', 84.25, 4.05, 45.3, 3], ['street', 88, 0, 50, 3], ['street2', 100, 0, 55, 1], ['dockStair', 109.2, 0.7, 65.3, 1],
    ['dock', 114, 1.2, 68.5, 1], ['svcDoor', 116.2, 1.2, 70.8, 1], ['svcCor', 116.2, 1.2, 78, 1], ['westLeg', 110, 1.2, 83.2, 1], ['kitchen', 101.5, 1.2, 84, 3],
  ];
  const t0 = Date.now();
  let witchInfo = '';
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
  witchInfo = await evalg(() => { const w = window.game.infected.specials.filter((s) => s.kind === 'witch'); return w.map((s) => `witch dead=${s.dead} enraged=${s.enraged} rage=${s.rage?.toFixed(2)}`).join(' ; '); });
  console.log('WITCH', witchInfo, 'stats', JSON.stringify(await evalg(() => window.game.director.stats)));
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
