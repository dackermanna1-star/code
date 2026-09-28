import { stubOthers } from './ch3_stub.mjs';
// Bots on the roof must follow the leader down through the broken skylight.
export default async ({ page, evalg, wait }) => {
  await stubOthers(page);
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?autostart=2');
  for (let i = 0; i < 200; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  console.log(JSON.stringify(await evalg(() => {
    const g = window.game, L = g.level, nav = L.nav;
    g.cheats.god = true; g.director.enabled = false; window.session.menu.clear();
    const P = g.player;
    g.survivors.forEach((s, i) => { if (s !== P) s.teleport(62 + i, 9.02, 119, 0); });
    P.teleport(61, 9.02, 117.5, 1.57);
    g.advance(2);
    // links around the hole edge
    const info = [];
    for (const [x, z] of [[56.75, 117.25], [59.75, 117.25], [58.25, 115.75], [58.25, 118.75]]) {
      const n = nav.nodeAt(x, 9, z);
      const links = [];
      if (n >= 0) for (let d = 0; d < 8; d++) { const v = nav.links[n * 8 + d]; if (v >= 0) links.push(`${d}:${nav.ltype[n * 8 + d]}:${nav.nodeY[v].toFixed(1)}`); }
      info.push(`${x},${z} n=${n} y=${n >= 0 ? nav.nodeY[n].toFixed(2) : '-'} ${links.join(' ')}`);
    }
    P.teleport(58.2, 5.22, 115.2, 0);
    const trace = [];
    for (let k = 0; k < 10; k++) {
      g.advance(1);
      trace.push(g.survivors.filter((s) => s !== P).map((s) => `${s.char.id[0]}(${s.pos.x.toFixed(1)},${s.pos.y.toFixed(1)},${s.pos.z.toFixed(1)})${s.brain?.path ? 'p' + s.brain.path.length + (s.brain.path.partial ? 'P' : '') : '-'}`).join(' '));
    }
    const b = g.survivors.find((s) => s !== P);
    const path = nav.findPath(b.pos.x, b.pos.y, b.pos.z, 58.2, 5.2, 115.2);
    return { info, trace, path: path ? path.map((n) => `${nav.nodeX(n)},${nav.nodeY[n].toFixed(1)},${nav.nodeZ(n)}`).slice(0, 30).join(' ') + (path.partial ? ' PARTIAL' : '') : null };
  }), null, 1));
};
