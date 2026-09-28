import { stubOthers } from './ch3_stub.mjs';
// Profile per-subsystem update cost during the chapter 3 lift crescendo.
export default async ({ page, evalg, wait }) => {
  await stubOthers(page);
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?autostart=2');
  for (let i = 0; i < 200; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  const r = await evalg(() => {
    const g = window.game, L = g.level;
    g.cheats.god = true;
    window.session.menu.clear();
    const T = {};
    const wrap = (obj, name, key) => { const f = obj[name].bind(obj); obj[name] = (...a) => { const t0 = performance.now(); const r = f(...a); T[key] = (T[key] || 0) + performance.now() - t0; return r; }; };
    wrap(g.infected, 'update', 'infected');
    wrap(g.director, 'update', 'director');
    wrap(L, 'update', 'level');
    wrap(g.props, 'update', 'props');
    wrap(g.combat, 'update', 'combat');
    for (const s of g.survivors) wrap(s, 'update', 'surv_' + s.char.id);
    const nav = L.nav;
    wrap(nav, 'findPath', 'findPath');
    wrap(nav, 'nearestNode', 'nearestNode');
    wrap(L.col, 'moveBody', 'moveBody');
    wrap(L.col, 'lineOfSight', 'los');
    wrap(L.col, 'raycast', 'raycast');
    const out = [];
    const step = (label, sec) => { for (const k in T) delete T[k]; const t0 = performance.now(); g.advance(sec); const tot = performance.now() - t0; out.push(label + ' total ' + tot.toFixed(0) + 'ms/' + sec + 's ' + Object.entries(T).map(([k, v]) => k + '=' + v.toFixed(0)).join(' ')); };
    step('idle-start', 2);
    g.player.teleport(109.0, 0.45, 93.0, 0.3);
    g.survivors.forEach((s, i) => { if (s !== g.player) s.teleport(104.5 + i * 0.5, 0, 89.5, Math.PI); });
    step('at-lift', 2);
    L.lift.ctrl.onUse(g.player);
    for (let i = 0; i < 6; i++) step('lift' + i, 2);
    out.push('commons ' + g.infected.commons.length + ' dy ' + L.lift.plat.offset.y.toFixed(2));
    return out;
  });
  console.log((r || []).join('\n'));
};
