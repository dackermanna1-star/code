// Chapter 4 perf probe: update cost (no render) and render cost at a few spots.
import { boot } from './ch4_util.mjs';
export default async ({ page, evalg, wait }) => {
  await boot(page, evalg, wait);
  const r = await evalg(() => {
    const g = window.game; g.cheats.godAll = true;
    const out = {};
    const t0 = performance.now(); g.advance(2, 1 / 30); out.update60 = ((performance.now() - t0) / 60).toFixed(2) + 'ms/frame';
    for (const [k, x, y, z, yaw] of [['safe', 75, 0, 55.5, 1.5], ['lobby', 54, 0, 56, 0], ['elev', 54, 12, 34, 0], ['top', 50, 108, 39, Math.PI]]) {
      g.player.teleport(x, y, z, yaw); g.advance(0.2, 1 / 30);
      if (y > 100) g.level.ch4.S.onTop();
      const t1 = performance.now(); g.renderer.render(0.016); g.renderer.r.getContext().finish?.(); const t2 = performance.now();
      g.renderer.render(0.016); const t3 = performance.now();
      out[k] = { first: Math.round(t2 - t1), second: Math.round(t3 - t2), calls: g.renderer.r.info.render.calls, tris: g.renderer.r.info.render.triangles };
    }
    return out;
  });
  console.log(JSON.stringify(r));
};
