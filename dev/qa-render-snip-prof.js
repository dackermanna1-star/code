const T = {}, M = {};
const list = [[g.zombies, 'update', 'zombies'], [g.chunks, 'update', 'chunks'], [g.fx, 'update', 'fx'], [g.sky, 'update', 'sky'], [g.weatherSys, 'update', 'weather'], [g.survival, 'update', 'survival'], [g.player, 'updateMovement', 'move'], [g.combat, 'update', 'combat'], [g.interact, 'update', 'interact'], [g.ui, 'update', 'ui'], [g.viewmodel, 'update', 'vm'], [g.viewmodel, 'render', 'vmRender'], [g.groundItems, 'update', 'ground'], [g.vehicles, 'update', 'veh'], [g.corpses, 'update', 'corpses'], [g.events, 'update', 'events'], [g.audio, 'update', 'audio'], [g, 'updateExploration', 'explore'], [g, 'updateLocation', 'loc'], [g.renderer, 'renderShadows', 'shadow'], [g.renderer, 'render', 'renderAll'], [g, 'update', 'UPDATE'], [g, 'renderWorld', 'RENDERWORLD']];
const saved = [];
for (const [o, n, label] of list) {
  const f = o[n];
  saved.push([o, n, f]);
  o[n] = function (...a) { const t = performance.now(); const r = f.apply(this, a); const dd = performance.now() - t; T[label] = (T[label] || 0) + dd; M[label] = Math.max(M[label] || 0, dd); return r; };
}
const N = 30;
const t0 = performance.now();
await window.__qa.frames(N);
const wall = (performance.now() - t0) / N;
for (const [o, n, f] of saved) o[n] = f;
for (const k in T) T[k] = +(T[k] / N).toFixed(2);
for (const k in M) M[k] = +M[k].toFixed(1); return { M, T, wallMsPerFrame: +wall.toFixed(1), zombies: g.zombies.zombies.length };
