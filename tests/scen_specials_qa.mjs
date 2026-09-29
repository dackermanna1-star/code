// QA: spawn each L4D2 special near the team (logic only) and watch for errors /
// pins. QUALITY=low node tests/play.mjs tests/scen_specials_qa.mjs
export default async ({ page, evalg, wait, logs }) => {
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?campaign=deadair&autostart=' + (process.env.CH || 2), { timeout: 180000 });
  for (let i = 0; i < 180; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  for (const kind of (process.env.KINDS || 'charger,jockey,spitter,hunter,smoker,boomer').split(',')) {
    const before = logs.length;
    const r = await evalg((kind) => {
      const g = window.game; g.noRender = true; g.cheats.godAll = true;
      g.director.enabled = false;
      for (const c of g.infected.commons) c.hp = 0;
      let sp = null; for (let k = 0; k < 8 && !sp; k++) sp = g.director.spawnSpecial(kind, { where: k < 4 ? 'any' : 'ahead' });
      if (!sp) { const p = g.player.pos, nav = g.level.nav; const n = nav.nearestNode(p.x + 12, p.y, p.z, 10); if (n >= 0) sp = g.director.spawnSpecial(kind, { node: n }); }
      let pinned = 0, alive = !!sp, t = 0, dmg = 0;
      const hp0 = g.survivors.reduce((a, s) => a + s.hp, 0);
      for (; t < 40; t += 0.1) {
        g.advance(0.1);
        if (g.survivors.some((s) => s.pinnedBy || s.pinned || s.grabbedBy || s.jockeyedBy || s.chargedBy)) pinned++;
        if (sp && (sp.dead || sp.hp <= 0)) { alive = false; break; }
      }
      dmg = hp0 - g.survivors.reduce((a, s) => a + s.hp, 0);
      const specials = g.infected.specials?.length ?? '?';
      if (sp && !sp.dead) sp.hp = 0;
      g.advance(1);
      return { spawned: !!sp, kind: sp?.kind, t: +t.toFixed(1), killedByBots: !alive, pinnedFrames: pinned, dmg: Math.round(dmg), specials, errs: g.errCount || 0 };
    }, kind);
    const errs = logs.slice(before).filter((l) => /pageerror|\[error\]|\[frame\]/i.test(l) && !/WebGL|GL_INVALID/.test(l));
    console.log('SPECIAL', kind, JSON.stringify(r), 'consoleErrors', errs.length, errs.slice(0, 2).join(' || ').slice(0, 300));
  }
};
