// Dead Air ch4 nav probe: links around suspect spots + A* paths. node tests/play.mjs tests/da4_probe.mjs
export default async ({ page, evalg, wait }) => {
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?campaign=deadair&autostart=3', { timeout: 180000 });
  for (let i = 0; i < 180; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  const r = await evalg(() => {
    const g = window.game, L = g.level, nav = L.nav, out = [];
    const f = nav.fields.toExit;
    const fmtN = (n) => `${nav.nodeX(n).toFixed(2)},${nav.nodeY[n].toFixed(2)},${nav.nodeZ(n).toFixed(2)}`;
    const path = (a, b) => { const p = nav.findPath(...a, ...b); if (!p) return 'NO PATH'; const pts = []; let last = null; for (const n of p) { const y = nav.nodeY[n]; if (last === null || Math.abs(y - last) > 0.5 || pts.length === 0) pts.push(fmtN(n)); last = y; } pts.push(fmtN(p[p.length - 1])); return p.length + ' nodes; y-changes: ' + pts.join(' > '); };
    out.push('path concourse->apron: ' + path([-2.3, 6.4, -41.6], [-6.3, 0, -49.3]));
    out.push('path C3 hold->C3 stairBot: ' + path([6, 6.4, -38], [9.3, 0, -73]));
    // drop / non-walk links anywhere between concourse level and apron within x -14..16, z -46..-40
    const seen = new Set();
    for (let x = -14; x <= 16; x += 0.5) for (let z = -46; z <= -40; z += 0.5) for (const y of [6.4, 0, 6.6]) {
      const n = nav.nodeAt(x, y, z); if (n < 0 || seen.has(n)) continue; seen.add(n);
      for (let d = 0; d < 8; d++) { const v = nav.links[n * 8 + d]; if (v < 0) continue; if (Math.abs(nav.nodeY[v] - nav.nodeY[n]) > 1 || nav.ltype[n * 8 + d] !== 0) out.push(`link ${fmtN(n)} -> ${fmtN(v)} type ${nav.ltype[n * 8 + d]}`); }
    }
    // toExit field along the concourse east of the shutter vs the jet-bridge door
    for (const p of [[-2.3, 6.4, -41.6], [-2.3, 6.4, -30], [6, 6.4, -41], [6, 6.4, -44], [6, 6.4, -58]]) { const n = nav.nearestNode(...p, 1.5); out.push(`field ${p} -> ${n < 0 ? 'none' : f[n].toFixed(1) + ' @' + fmtN(n)}`); }
    return out;
  });
  console.log((r || []).slice(0, 60).join('\n'));
};
