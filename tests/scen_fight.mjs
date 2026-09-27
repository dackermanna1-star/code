// Gameplay smoke: horde vs survivors + every special infected.
export default async ({ page, shot, evalg, wait }) => {
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?autostart=0');
  for (let i = 0; i < 40; i++) { await wait(1000); const st = await evalg(() => window.session?.state); if (st === 'playing') break; }
  const r1 = await evalg(() => {
    const g = window.game;
    g.cheats.god = true;
    // move the team to the street
    g.survivors.forEach((s, i) => s.teleport(20 + i, 0.15, 23 + (i % 2), -1.57));
    g.player.giveWeapon('rifle');
    g.advance(1);
    const n = g.director.spawnMob(20, { where: 'any', minD: 12, maxD: 40 });
    return { mob: n, commons: g.infected.commons.length };
  });
  console.log('mob', JSON.stringify(r1));
  const errs = [];
  for (let k = 0; k < 6; k++) {
    const r = await evalg(() => {
      const g = window.game;
      try { g.testCmd = { fire: true, firePressed: true }; g.advance(2); g.testCmd = null; } catch (e) { return { err: e.message + ' ' + e.stack.split('\n').slice(0, 5).join(' | ') }; }
      return { t: g.time.toFixed(1), commons: g.infected.commons.length, corpses: g.infected.corpses.length, kills: g.survivors.map((s) => s.stats.kills), hp: g.survivors.map((s) => Math.round(s.totalHealth)), state: g.director.state, int: Math.round(g.director.intensity), pos: g.survivors.map((s) => s.pos.x.toFixed(1) + ',' + s.pos.z.toFixed(1)) };
    });
    console.log(JSON.stringify(r));
  }
  await wait(500);
  await shot('f1_horde');
  // specials
  for (const kind of ['hunter', 'smoker', 'boomer', 'witch', 'tank']) {
    const r = await evalg((kind) => {
      const g = window.game;
      try {
        const p = g.player.pos;
        const nav = g.level.nav;
        let n = nav.nearestNode(p.x + 12, p.y, p.z + 3, 6);
        if (n < 0) n = nav.nearestNode(p.x - 12, p.y, p.z, 6);
        const sp = g.director.spawnSpecial(kind, { node: n });
        g.advance(4);
        return { kind, alive: sp ? !sp.dead : null, state: sp?.state, pinned: g.survivors.filter((s) => s.pinned).map((s) => s.name), hp: g.survivors.map((s) => Math.round(s.totalHealth)), specials: g.infected.specials.length };
      } catch (e) { return { err: e.message + ' ' + e.stack.split('\n').slice(0, 6).join(' | ') }; }
    }, kind);
    console.log(JSON.stringify(r));
    await wait(300);
    await shot('f_' + kind);
  }
  const r3 = await evalg(() => { const g = window.game; g.advance(8); return { specials: g.infected.specials.map((s) => s.kind + ':' + (s.dead ? 'dead' : s.state + ':' + Math.round(s.hp))), hp: g.survivors.map((s) => Math.round(s.totalHealth) + (s.incapped ? 'I' : '')), stats: g.survivors.map((s) => s.stats.kills + '/' + s.stats.specials) }; });
  console.log(JSON.stringify(r3));
  await shot('f_end');
};
