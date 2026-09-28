// Chapter 5 finale run: radio calls -> waves -> tanks -> helicopter -> boarding -> victory.
// GOD=1 keeps the human alive; the bots have to fend for themselves.
export default async ({ page, shot, evalg, wait }) => {
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?autostart=4');
  for (let i = 0; i < 90; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  await shot('fin_0_start');
  const state = () => evalg(() => {
    const g = window.game, F = g.level.finale;
    return {
      t: g.time.toFixed(0), stage: F.stage, panic: g.director.panicState?.name + ':' + g.director.panicState?.wave, commons: g.infected.commons.length,
      specials: g.infected.specials.filter((s) => !s.dead).map((s) => s.kind + ':' + Math.round(s.hp)).join(' '),
      hp: g.survivors.map((s) => s.name[0] + Math.round(s.totalHealth) + (s.incapped ? 'I' : '') + (s.dead ? 'D' : '')).join(' '),
      pos: g.survivors.map((s) => s.pos.x.toFixed(0) + ',' + s.pos.y.toFixed(1) + ',' + s.pos.z.toFixed(0)).join(' '),
      spawnNodes: F.spawnNodes.length, bulkNodes: F.bulkNodes.length, sess: window.session.state,
    };
  });
  console.log(JSON.stringify(await state()));
  // walk to the radio room and call twice
  const r = await evalg((godAll) => {
    const g = window.game;
    g.cheats.god = true;
    g.cheats.godAll = godAll;
    g.survivors.forEach((s, i) => s.teleport(17 + i, 0, 4 + (i % 2), 0));
    g.player.giveWeapon('autoShotgun');
    g.advance(1);
    const radio = g.usables.find((u) => /radio/i.test(u.prompt));
    radio.onUse(g.player);
    g.advance(10);
    const p2 = radio.prompt, en = radio.enabled;
    radio.onUse(g.player);
    g.advance(2);
    return { p2, en, stage: g.level.finale.stage };
  }, !!process.env.GODALL);
  console.log('radio', JSON.stringify(r));
  await shot('fin_1_radio');
  // mount the minigun for a while
  const m = await evalg(() => {
    const g = window.game;
    const gun = g.usables.find((u) => /minigun/i.test(u.prompt));
    gun.onUse(g.player);
    g.testCmd = { fire: true };
    g.advance(4);
    const out = { mounted: !!g.player.usingMounted, ammo: g.player.weapon?.type, kills: g.player.stats.kills };
    g.testCmd = null;
    return out;
  });
  console.log('minigun', JSON.stringify(m));
  await shot('fin_2_minigun');
  let lastStage = '';
  for (let k = 0; k < 60; k++) {
    const res = await evalg(() => {
      const g = window.game;
      try {
        g.testCmd = { fire: true };
        g.advance(5);
        g.testCmd = null;
        // help the test along: kill the tank if it has been alive for long
        const F = g.level.finale;
        for (const sp of g.infected.specials) if (sp.kind === 'tank' && !sp.dead) { sp._t0 ??= g.time; if (g.time - sp._t0 > 45) sp.takeHit({ damage: 99999, zone: 'torso', kind: 'bullet', x: sp.pos.x, y: sp.pos.y + 1, z: sp.pos.z, dir: { x: 0, y: 0, z: 1 }, attacker: g.player }); }
        if (F.stage === 'rescue' && F.landed) {
          if (g.player.usingMounted) g.player.usingMounted.dismount();
          g.survivors.forEach((s, i) => { if (!s.dead) { if (s.incapped) s.revive(); s.teleport(-1 + i * 0.7, 2.5, -19 + (i % 2)); } });
        }
      } catch (e) { return { err: e.message + ' ' + e.stack.split('\n').slice(0, 6).join(' | ') }; }
      return null;
    });
    if (res?.err) { console.log('ERR', res.err); break; }
    const st = await state();
    console.log(JSON.stringify(st));
    if (process.env.DBG && k % 6 === 5) console.log(await evalg(() => window.game.infected.commons.map((c) => `${c.pos.x.toFixed(1)},${c.pos.y.toFixed(1)},${c.pos.z.toFixed(1)} s${c.state} n${c.node} off${c.offNav ? 1 : 0} ${c.climb ? 'C' : ''}${c.fall ? 'F' : ''}`).join('\n')));
    if (process.env.MAXK && k >= +process.env.MAXK) break;
    if (st.stage !== lastStage) { lastStage = st.stage; await shot('fin_s_' + st.stage); }
    if (st.stage === 'escape') {
      for (let j = 0; j < 4; j++) { await evalg(() => window.game.advance(2.5)); await shot('fin_esc_' + j); }
      await wait(2500);
      console.log('session', await evalg(() => window.session.state));
      break;
    }
  }
};
