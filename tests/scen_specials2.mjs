// Scripted tests for the L4D2 specials (Charger, Jockey, Spitter): spawn each
// near the team on an open stretch of Dead Air, simulate (logic only), verify
// the ability, the rescue and the bot behaviour; then director weights.
//   QUALITY=low node tests/play.mjs tests/scen_specials2.mjs
//   SHOTS=1 QUALITY=medium node tests/play.mjs tests/scen_specials2.mjs   (adds screenshots)
export default async ({ page, evalg, wait, shot, logs }) => {
  const CH = process.env.CH || 0;
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?campaign=deadair&autostart=' + CH, { timeout: 180000 });
  for (let i = 0; i < 150; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  const setup = await evalg(([sx, sy, sz]) => {
    const g = window.game;
    g.director.enabled = false; g.paused = true;
    const nav = g.level.nav;
    // find an open lane: spot with the longest walkable straight run
    let best = null;
    const tryAt = (x, y, z) => {
      const n = nav.nearestNode(x, y, z, 4); if (n < 0) return;
      const px = nav.nodeX(n), py = nav.nodeY[n], pz = nav.nodeZ(n);
      for (let k = 0; k < 16; k++) {
        const a = k / 16 * Math.PI * 2, dx = Math.cos(a), dz = Math.sin(a);
        let L = 0;
        for (let d = 4; d <= 22; d += 2) { if (nav.walkable(px, py, pz, px + dx * d, py, pz + dz * d) && Math.abs(nav.nodeY[Math.max(0, nav.nearestNode(px + dx * d, py, pz + dz * d, 1))] - py) < 0.6) L = d; else break; }
        // room to the sides for the team
        let side = 0;
        for (const s of [-3, 3]) if (nav.walkable(px, py, pz, px - dz * s, py, pz + dx * s)) side++;
        const sc = L + side * 3;
        if (!best || sc > best.sc) best = { sc, x: px, y: py, z: pz, dx, dz, L };
      }
    };
    tryAt(sx, sy, sz);
    const P = g.player;
    if (!best || best.L < 16) tryAt(P.pos.x, P.pos.y, P.pos.z);
    window.__site = best;
    return best;
  }, [+(process.env.SX || 96), +(process.env.SY || 0), +(process.env.SZ || 52)]);
  console.log('site', JSON.stringify(setup));

  // shared helpers installed in the page
  await evalg(() => {
    const g = window.game;
    window.__reset = (spread = 1) => {
      const S = window.__site, nav = g.level.nav;
      for (const c of g.infected.commons) c.hp = 0;
      for (const sp of g.infected.specials) sp.remove();
      g.infected.specials.length = 0;
      g.acid?.clear();
      g.advance(0.2);
      for (const c of g.infected.commons) c.dispose?.();
      g.survivors.forEach((s, i) => {
        s.dead = false; s.incapped = false; s.pinned = null; s.pinType = null; s.pinnedMove = null; s.health = 100; s.temp = 0; s.incapCount = 0; s.stunT = 0; s.knock = null; s.action = null;
        const side = (i - 1.5) * 1.4 * spread, back = i === 0 ? 0 : 1.2;
        let px = S.x - S.dz * side - S.dx * back, pz = S.z + S.dx * side - S.dz * back;
        const k = nav.nearestNode(px, S.y, pz, 2); if (k >= 0) { px = nav.nodeX(k); pz = nav.nodeZ(k); }
        s.teleport(px, (k >= 0 ? nav.nodeY[k] : S.y) + 0.02, pz, Math.atan2(-S.dx, -S.dz));
        s.pitch = 0;
      });
    };
    window.__spawn = (kind, dist, side = 0) => {
      const S = window.__site, nav = g.level.nav;
      const k = nav.nearestNode(S.x + S.dx * dist - S.dz * side, S.y, S.z + S.dz * dist + S.dx * side, 3);
      const sp = g.director.spawnSpecial(kind, { node: k });
      sp.yaw = Math.atan2(S.dx, S.dz);
      return sp;
    };
    window.__hp = () => g.survivors.map((s) => Math.round(s.health + s.temp));
  });

  const results = {};
  // ------------------------------------------------------------ CHARGER --
  results.charger = await evalg(() => {
    const g = window.game; window.__reset();
    const ch = window.__spawn('charger', 15);
    ch.chargeCd = 0;
    const R = { states: [], grabbed: null, grabT: -1, pummelT: -1, slams: 0, bowled: 0, killedT: -1, freed: false, victimHp: [], dodges: 0 };
    let last = '', hp0 = null;
    for (let t = 0; t < 30; t += 0.1) {
      g.advance(0.1);
      if (ch.state !== last) { R.states.push(ch.state + '@' + t.toFixed(1)); last = ch.state; }
      if (!R.grabbed && ch.pinning) { R.grabbed = ch.pinning.char.id; R.grabT = +t.toFixed(1); hp0 = ch.pinning.health + ch.pinning.temp; R.human = ch.pinning.isHuman; }
      if (R.pummelT < 0 && ch.state === 'pummel') R.pummelT = +t.toFixed(1);
      R.bowled = Math.max(R.bowled, ch.bowled.length);
      for (const s of g.survivors) if (s.brain && s.brain.mode === 'dodge') R.dodges++;
      if (ch.dead && R.killedT < 0) { R.killedT = +t.toFixed(1); R.freed = !g.survivors.some((s) => s.pinned === ch); break; }
    }
    const v = g.survivors.find((s) => s.char.id === R.grabbed);
    if (v) R.victimDmg = Math.round(hp0 - (v.health + v.temp)) + (v.incapped ? '+incap' : '');
    R.hp = window.__hp();
    R.killer = ch.lastAttacker?.char?.id;
    return R;
  });
  console.log('CHARGER', JSON.stringify(results.charger));

  // ------------------------------------------------------------- JOCKEY --
  const jockeyRun = (humanTarget) => evalg((humanTarget) => {
    const g = window.game; window.__reset();
    const j = window.__spawn('jockey', 9, humanTarget ? 0 : 3);
    j.leapCd = 0;
    if (humanTarget) { j.pickTarget = () => g.player; j.target = g.player; }
    const R = { states: [], rideT: -1, victim: null, moved: 0, released: -1, how: null, rideDur: 0, shoves: 0 };
    let last = '', p0 = null, v = null;
    for (let t = 0; t < 25; t += 0.05) {
      g.advance(0.05);
      if (j.state !== last) { R.states.push(j.state + '@' + t.toFixed(1)); last = j.state; }
      if (j.state === 'ride' && !v) { v = j.pinning; R.victim = v.char.id; R.rideT = +t.toFixed(1); p0 = v.pos.clone(); }
      if (v && j.state === 'ride') { R.moved = Math.max(R.moved, +p0.distanceTo(v.pos).toFixed(2)); R.rideDur = +(t - R.rideT).toFixed(1); }
      if (v && j.state !== 'ride' && R.released < 0) { R.released = +t.toFixed(1); R.how = j.dead ? 'killed' : 'shoved'; R.victimFree = !v.pinned; break; }
    }
    R.hp = window.__hp();
    return R;
  }, humanTarget);
  results.jockey = await jockeyRun(false);
  console.log('JOCKEY(bot victim)', JSON.stringify(results.jockey));
  results.jockeyHuman = await jockeyRun(true);
  console.log('JOCKEY(human victim)', JSON.stringify(results.jockeyHuman));

  // ------------------------------------------------------------ SPITTER --
  results.spitter = await evalg(() => {
    const g = window.game; window.__reset(1.2);
    const sp = window.__spawn('spitter', 16);
    sp.spitCd = 0;
    const bot = g.survivors[2];
    sp.pickTarget = () => bot; sp.target = bot;
    g.cheats.botsIdle = true; // first see the acid land on an idle bot
    const R = { spitT: -1, poolT: -1, maxR: 0, dmg: {}, botInside: 0, escapeT: -1, deathPuddle: false };
    const hp0 = window.__hp();
    let t = 0;
    for (; t < 12; t += 0.05) {
      g.advance(0.05);
      if (R.spitT < 0 && g.acid?.globs.length) R.spitT = +t.toFixed(2);
      if (R.poolT < 0 && g.acid?.pools.length) { R.poolT = +t.toFixed(2); break; }
    }
    // force a pool right under the bot so we can see damage & escape
    const pool = g.acid.pools[0];
    if (pool) { bot.teleport(pool.x, pool.y + 0.02, pool.z, bot.yaw); }
    g.advance(1.2);
    const hpIdle = bot.health + bot.temp;
    R.idleDmg1_2s = Math.round(hp0[2] - hpIdle);
    g.cheats.botsIdle = false;
    let insideT = 0;
    for (let k = 0; k < 80; k++) {
      g.advance(0.05);
      if (g.acid.at(bot.pos.x, bot.pos.y, bot.pos.z)) insideT += 0.05; else if (R.escapeT < 0) R.escapeT = +(k * 0.05).toFixed(2);
      for (const p of g.acid.pools) R.maxR = Math.max(R.maxR, +p.r.toFixed(2));
    }
    R.botInside = +insideT.toFixed(2);
    R.pools = g.acid.pools.length;
    // now the team kills her; death leaves a puddle
    for (let k = 0; k < 400 && !sp.dead; k++) g.advance(0.05);
    R.killed = sp.dead;
    R.deathPuddle = g.acid.pools.some((p) => p.small);
    g.advance(8);
    R.poolsAfter = g.acid.pools.length;
    R.hp = window.__hp();
    return R;
  });
  console.log('SPITTER', JSON.stringify(results.spitter));

  // ----------------------------------------------------------- DIRECTOR --
  results.director = await evalg(() => {
    const g = window.game, d = g.director;
    const out = { specials: d.cfg.specials.join(',') };
    const kinds = ['hunter', 'smoker', 'boomer', 'charger', 'jockey', 'spitter'];
    const saved = g.difficulty;
    for (const key of ['easy', 'normal', 'advanced', 'expert']) {
      g.difficulty = Object.assign({}, saved, { name: key[0].toUpperCase() + key.slice(1) });
      const cnt = {};
      for (let i = 0; i < 6000; i++) { const k = d.pickSpecial(kinds); cnt[k] = (cnt[k] || 0) + 1; }
      out[key] = kinds.map((k) => k[0] + k[1] + ':' + (cnt[k] / 60).toFixed(0) + '%').join(' ');
    }
    g.difficulty = saved;
    window.__reset();
    const sp = {};
    for (const k of ['charger', 'jockey', 'spitter']) { const s = d.spawnSpecial(k, { where: 'any' }); sp[k] = s ? s.pos.distanceTo(g.player.pos).toFixed(0) + 'm' : 'none'; }
    out.autoSpawn = sp;
    // live director with specials enabled for 60 s
    for (const s of g.infected.specials) s.remove();
    g.infected.specials.length = 0;
    d.enabled = true; d.state = 'build'; d.specialT = 0; d.stats.specials = 0;
    const seen = new Set();
    for (let t = 0; t < 60; t += 0.5) { g.advance(0.5); for (const s of g.infected.specials) seen.add(s.kind); if (d.state !== 'build' && d.state !== 'sustain') { d.state = 'build'; } d.specialT = Math.min(d.specialT, 3); }
    d.enabled = false;
    out.liveKinds = [...seen].join(',');
    out.liveSpecials = d.stats.specials;
    return out;
  });
  console.log('DIRECTOR', JSON.stringify(results.director));

  // -------------------------------------------------------- screenshots --
  if (process.env.SHOTS) {
    const frame = async (name, fn, settle = 0) => {
      const info = await evalg(fn);
      console.log(name, JSON.stringify(info));
      if (settle) await wait(settle);
      await shot(name);
    };
    const look = `(tgt, off = 5, h = 1.6) => { const g = window.game, P = g.player; const dx = P.pos.x - tgt.x, dz = P.pos.z - tgt.z, d = Math.hypot(dx, dz) || 1; P.yaw = Math.atan2(tgt.x - P.pos.x, tgt.z - P.pos.z) + Math.PI; P.pitch = Math.atan2(tgt.y - (P.pos.y + h), d); }`;
    await frame('sp2_charger_pummel', new Function(`const g = window.game; g.cheats.godAll = true; window.__reset(); const ch = window.__spawn('charger', 12, 0); ch.chargeCd = 0; const v = g.survivors[1]; ch.pickTarget = () => v; ch.target = v; g.cheats.botsIdle = true;
      for (let t = 0; t < 8 && ch.state !== 'pummel'; t += 0.05) g.advance(0.05); g.advance(0.9);
      const P = g.player; const L = ${look}; L({ x: ch.pos.x, y: ch.pos.y + 0.8, z: ch.pos.z }); g.paused = true; return { st: ch.state, v: ch.pinning?.char.id, d: ch.pos.distanceTo(P.pos).toFixed(1) };`), 900);
    await frame('sp2_jockey_ride', new Function(`const g = window.game; window.__reset(); const j = window.__spawn('jockey', 7, 2); j.leapCd = 0; const v = g.survivors[2]; j.pickTarget = () => v; j.target = v; g.cheats.botsIdle = true;
      for (let t = 0; t < 8 && j.state !== 'ride'; t += 0.05) g.advance(0.05); g.advance(0.8);
      const P = g.player; const L = ${look}; L({ x: j.pos.x, y: j.pos.y + 0.3, z: j.pos.z }); g.paused = true; return { st: j.state, v: j.pinning?.char.id, d: j.pos.distanceTo(P.pos).toFixed(1) };`), 900);
    await frame('sp2_spitter_pool', new Function(`const g = window.game; window.__reset(1.3); const sp = window.__spawn('spitter', 14, 0); sp.spitCd = 0; const v = g.survivors[3]; sp.pickTarget = () => v; sp.target = v; g.cheats.botsIdle = true;
      for (let t = 0; t < 8 && !(g.acid && g.acid.pools.length); t += 0.05) g.advance(0.05); g.advance(1.0);
      const p = g.acid.pools[0]; const P = g.player; const L = ${look}; L({ x: (p.x + sp.pos.x) / 2, y: p.y, z: (p.z + sp.pos.z) / 2 }); g.paused = false; return { pools: g.acid.pools.length, r: p.r.toFixed(2) };`), 1200);
    await evalg(() => { window.game.paused = true; });
    await frame('sp2_charger_look', new Function(`const g = window.game; window.__reset(); const ch = window.__spawn('charger', 5, 0); ch.chargeCd = 99; ch.punchCd = 99; g.cheats.botsIdle = true; g.advance(0.4);
      const P = g.player; const L = ${look}; L({ x: ch.pos.x, y: ch.pos.y + 1.1, z: ch.pos.z }); g.paused = true; return { st: ch.state };`), 900);
  }
  const errs = logs.filter((l) => /error/i.test(l) && !/WebGL|GL_INVALID|favicon/.test(l));
  console.log('errors:', errs.length);
  for (const e of errs.slice(0, 8)) console.log(e);
};
