// Flow-field debugging: SURV='x,y,z' SPAWN='[[x,y,z],...]' CH=n
export default async ({ page, evalg, wait, shot }) => {
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?autostart=' + (process.env.CH || 0));
  for (let i = 0; i < 90; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  const r = await evalg(([surv, spawn]) => {
    const g = window.game, nav = g.level.nav;
    g.cheats.godAll = true;
    g.director.enabled = false;
    g.survivors.forEach((s, i) => { s.teleport(surv[0] + (i % 2) * 0.8, surv[1], surv[2] + Math.floor(i / 2) * 0.8, 0); s.brain = null; });
    const out = [];
    for (const [x, y, z] of spawn) {
      const n = nav.nearestNode(x, y, z, 2);
      out.push('spawn node ' + n + (n >= 0 ? ' y ' + nav.nodeY[n].toFixed(2) : ''));
      if (n >= 0) for (let i = 0; i < 4; i++) g.infected.spawnCommon(nav.nodeX(n) + i * 0.3, nav.nodeY[n], nav.nodeZ(n), { chase: true });
    }
    g.advance(15);
    const f = nav.flow.cur;
    for (const c of g.infected.commons) {
      const ft = c.flowTarget(f, 3);
      out.push(`${c.pos.x.toFixed(1)},${c.pos.y.toFixed(1)},${c.pos.z.toFixed(1)} s${c.state} node${c.node} f=${c.node >= 0 ? f[c.node].toFixed(1) : '-'} ft=${ft ? ft.x.toFixed(1) + ',' + ft.z.toFixed(1) + ' L' + ft.link : 'null'} tgt=${c.target?.name} stuck=${(c.stuckT || 0).toFixed(1)}`);
    }
    out.push('surv ' + g.survivors.map((s) => s.pos.x.toFixed(1) + ',' + s.pos.y.toFixed(1) + ',' + s.pos.z.toFixed(1) + ' n' + nav.nodeAt(s.pos.x, s.pos.y, s.pos.z)).join(' '));
    return out.join('\n');
  }, [JSON.parse('[' + (process.env.SURV || '0,0,0') + ']'), JSON.parse(process.env.SPAWN || '[]')]);
  console.log(r);
  if (process.env.SHOT) await shot('flowdbg');
};
