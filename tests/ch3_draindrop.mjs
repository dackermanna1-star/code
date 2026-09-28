import { stubOthers } from './ch3_stub.mjs';
export default async ({ page, evalg, wait }) => {
  await stubOthers(page);
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?autostart=2');
  for (let i = 0; i < 200; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  console.log(JSON.stringify(await evalg(() => {
    const g = window.game, L = g.level, nav = L.nav;
    g.cheats.god = true; g.director.enabled = false; window.session.menu.clear();
    const P = g.player;
    g.survivors.forEach((s, i) => { if (s !== P) s.teleport(97 + i, 1.22, 124.5, 0); });
    P.teleport(99, 1.22, 125, 0);
    g.advance(2);
    P.teleport(100.75, -2.18, 127.75, 0);
    g.advance(0.5);
    P.teleport(96, -3.2, 129.3, 0);
    const trace = [];
    for (let k = 0; k < 12; k++) {
      g.advance(1);
      trace.push(g.survivors.filter((s) => s !== P).map((s) => { const b = s.brain; const n = b?.path && b.path[b.pathI]; return `${s.char.id[0]}(${s.pos.x.toFixed(2)},${s.pos.y.toFixed(1)},${s.pos.z.toFixed(2)})${b?.path ? 'p' + b.path.length + '/' + b.pathI + (n != null ? '@' + nav.nodeX(n) + ',' + nav.nodeY[n].toFixed(1) + ',' + nav.nodeZ(n) : '') : '-'}${b?.mode}`; }).join(' '));
    }
    const b = g.survivors.find((s) => s !== P);
    const path = nav.findPath(b.pos.x, b.pos.y, b.pos.z, 96, -3.2, 129.3);
    return { trace, path: path ? path.map((n) => `${nav.nodeX(n)},${nav.nodeY[n].toFixed(1)},${nav.nodeZ(n)}`).slice(0, 14).join(' ') + (path.partial ? ' PARTIAL' : '') : null };
  }), null, 1));
};
