// Dead Air combat look/perf check: crowd + specials charging the group, shotgun
// fire (gore, dismemberment, ragdoll corpses), then a look at the corpses.
// QUALITY=low|medium CH=0|1 node tests/play.mjs tests/vm_verify.mjs
// env: PROG=0.3 (route progress to stand at), SHOTS=0 to skip screenshots
export default async ({ page, evalg, wait, shot, logs }) => {
  const ch = +(process.env.CH || 0), q = process.env.QUALITY || 'low';
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?campaign=deadair&autostart=' + ch, { timeout: 180000 });
  for (let i = 0; i < 150; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  const setup = await evalg((prog) => {
    const g = window.game, P = g.player, nav = g.level.nav, L = g.level;
    g.director.enabled = false; g.cheats.godAll = true; g.cheats.botsIdle = true;
    for (const c of g.infected.commons) c.hp = 0;
    g.advance(0.3);
    // a nav node at the requested progress with a clear run ~9 m further on
    let best = -1, bd = 1e9;
    const N = nav.nodeY.length;
    for (let k = 0; k < N; k += 3) {
      const p = L.progressAt(nav.nodeX(k), nav.nodeY[k], nav.nodeZ(k));
      if (Math.abs(p - prog) < bd) { bd = Math.abs(p - prog); best = k; }
    }
    const x = nav.nodeX(best), y = nav.nodeY[best], z = nav.nodeZ(best);
    const p0 = L.progressAt(x, y, z);
    let ahead = -1, ad = 1e9;
    for (let k = 0; k < N; k += 2) {
      const dx = nav.nodeX(k) - x, dz = nav.nodeZ(k) - z, d = Math.hypot(dx, dz);
      if (d < 7 || d > 12 || Math.abs(nav.nodeY[k] - y) > 1.2) continue;
      const s = -(L.progressAt(nav.nodeX(k), nav.nodeY[k], nav.nodeZ(k)) - p0) * 100 + Math.abs(d - 9) * 0.1;
      if (s < ad) { ad = s; ahead = k; }
    }
    const ax = nav.nodeX(ahead), az = nav.nodeZ(ahead), ay = nav.nodeY[ahead];
    P.teleport(x, y + 0.02, z, 0);
    const dx = ax - x, dz = az - z, d = Math.hypot(dx, dz);
    P.yaw = Math.atan2(-dx, -dz); P.pitch = -0.08;
    g.survivors.filter((s) => s !== P).forEach((s, i) => {
      const side = (i - 1) * 1.1, a = 1.6 + (i % 2) * 0.6;
      const k = nav.nearestNode(x + dx / d * a - dz / d * side, y, z + dz / d * a + dx / d * side, 2);
      if (k >= 0) s.teleport(nav.nodeX(k), nav.nodeY[k] + 0.02, nav.nodeZ(k), P.yaw);
      s.flashlight = true;
    });
    P.giveWeapon('autoShotgun');
    window.__vv = { x, y, z, ax, ay, az, dx: dx / d, dz: dz / d };
    return { at: [x, y, z].map((v) => +v.toFixed(1)), ahead: [ax, ay, az].map((v) => +v.toFixed(1)), prog: +p0.toFixed(3) };
  }, +(process.env.PROG || 0.3));
  console.log('setup', JSON.stringify(setup));
  // crowd + specials
  const spawned = await evalg(() => {
    const g = window.game, nav = g.level.nav, v = window.__vv, P = g.player;
    let commons = 0; const sp = [];
    for (let i = 0; i < 16; i++) {
      const a = 5 + (i % 4) * 1.4 + Math.random(), side = ((i % 5) - 2) * 1.1;
      const k = nav.nearestNode(v.x + v.dx * a - v.dz * side, v.y, v.z + v.dz * a + v.dx * side, 3);
      if (k >= 0 && Math.abs(nav.nodeY[k] - v.y) < 2) { const c = g.infected.spawnCommon(nav.nodeX(k), nav.nodeY[k], nav.nodeZ(k)); if (c) { c.target = P; c.state = 'chase'; commons++; } }
    }
    for (const [kind, a, side] of [['boomer', 9, -1.5], ['hunter', 10, 1.5], ['smoker', 11, 0], ['tank', 14, 0]]) {
      const k = nav.nearestNode(v.x + v.dx * a - v.dz * side, v.y, v.z + v.dz * a + v.dx * side, 4);
      if (k >= 0) { const s = g.director.spawnSpecial(kind, { node: k }); if (s) sp.push(kind); }
    }
    g.advance(0.4);
    return { commons, specials: sp };
  });
  console.log('spawned', JSON.stringify(spawned));
  const perf = async (label) => {
    const r = await evalg(() => {
      const g = window.game, ri = g.renderer.r.info;
      const t = [];
      let calls = 0, tris = 0;
      for (let i = 0; i < 12; i++) {
        const t0 = performance.now(); g.frame(1 / 60); t.push(performance.now() - t0);
        calls = Math.max(calls, ri.render.calls); tris = Math.max(tris, ri.render.triangles);
      }
      t.sort((a, b) => a - b);
      return { med: +t[6].toFixed(1), max: +t[11].toFixed(1), programs: ri.programs?.length, geoms: ri.memory.geometries, tex: ri.memory.textures, commons: g.infected.commons.length, specials: g.infected.specials.length };
    });
    console.log('perf', label, JSON.stringify(r));
  };
  await perf('crowd');
  if (process.env.SHOTS !== '0') { await wait(400); await shot(`verify_ch${ch}_${q}_crowd`); }
  // fight: fire into the crowd
  await evalg(() => {
    const g = window.game, P = g.player;
    for (let k = 0; k < 16; k++) { g.testCmd = { fire: true, firePressed: true }; P.pitch = -0.05; g.advance(0.25); }
    g.testCmd = null;
  });
  await perf('fight');
  if (process.env.SHOTS !== '0') { await wait(400); await shot(`verify_ch${ch}_${q}_fight`); }
  const res = await evalg(() => {
    const g = window.game, P = g.player;
    for (const s of g.infected.specials) if (s.kind !== 'tank') s.hp = 0;
    for (let k = 0; k < 12; k++) { g.testCmd = { fire: true, firePressed: true }; g.advance(0.25); }
    g.testCmd = null; g.advance(1.5);
    P.pitch = -0.45;
    g.advance(0.1);
    return { commons: g.infected.commons.length, ragdolls: g.infected.commons.filter((c) => c.dead || c.hp <= 0).length, specials: g.infected.specials.map((s) => s.kind + ':' + Math.round(s.hp)).join(' ') };
  });
  console.log('after', JSON.stringify(res));
  if (process.env.SHOTS !== '0') { await wait(400); await shot(`verify_ch${ch}_${q}_corpses`); }
  const errs = logs.filter((l) => /error|Shader|WebGLProgram|NaN/i.test(l) && !/GL_INVALID|Autoplay|favicon/i.test(l));
  console.log('errors:', errs.length);
  for (const e of errs.slice(0, 8)) console.log('  ', e.slice(0, 300));
};
