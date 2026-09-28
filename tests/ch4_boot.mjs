import { boot, snap } from './ch4_util.mjs';
// Chapter 4 boot check: stats + errors (isolated server, ?autostart=3)
export default async ({ page, evalg, wait }) => {
  await boot(page, evalg, wait);
  const r = await evalg(() => {
    const g = window.game, L = g.level, nav = L.nav;
    const E = L.ch4?.E;
    return { state: window.session.state, nodes: nav.N, boxes: L.col.n, lights: L.lights.length, loadMs: Math.round(g.loadMs), navMs: Math.round(L.navBuildMs), bounds: L.bounds, nx: nav.nx, nz: nav.nz, items: g.items.items.length, doors: L.doors.length, meshes: L.meshes.length,
      startP: L.progressAt(...L.flowStart), endP: L.progressAt(...L.flowEnd), elev: E?.state };
  });
  console.log(JSON.stringify(r, null, 1));
};
